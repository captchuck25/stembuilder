"""Generate a STEM Sketch Recreate worksheet PDF in Charlie's drafting layout.

    python scripts/stem-sketch-worksheet-pdf.py <block.stl> <out.pdf>

Layout is a replica of the hand-made "Recreate #1.pdf" sheet (landscape
letter): 0.7pt border + 3-cell title block, three quarter-inch dot fields,
STEMBUILDER.IO in the left title cell, and a hidden-line-removed ISOMETRIC
DRAWING of the block top-right at true 1:1 scale (edges at 30°, no
foreshortening — drafting-class isometric, not a true projection).

The isometric comes straight from the STL: feature edges (where adjacent
faces are not coplanar) are projected, then each edge is sampled and tested
for occlusion against every triangle so hidden lines drop out.
"""
import re
import sys
import math
import numpy as np
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import landscape, letter

PAGE_W, PAGE_H = landscape(letter)  # 792 x 612
IN = 72.0

# ── Sheet geometry (measured from Recreate #1.pdf, pdfplumber top-left coords) ──
BORDER = (18, 18, 774, 594)            # x0, top, x1, bottom
TITLE_TOP = 576                        # title block strip: 576..594
TITLE_DIVIDERS = (249.5, 541.0)
LINE_W = 0.7
DOT_PITCH = 18.0                       # 1/4"
DOT_R = 0.72
# Dot fields as (x_first, x_last, y_first, y_last) dot CENTERS, top-left coords.
FIELDS = [
    (36, 378, 36, 322),                # top-left (front/top view space)
    (36, 378, 340, 556),               # bottom-left
    (414, 756, 340, 556),              # bottom-right
]
# Isometric: bottom-front-right vertex of the 2" cube envelope sits here.
ISO_ORIGIN = (594.4, 325.0)            # top-left coords
ISO_SCALE = 71.5                       # pt per inch (measured 142.7–143.3 for 2")
ISO_LINE_W = 1.0


def tl(x, y):
    """top-left → reportlab bottom-left coords"""
    return x, PAGE_H - y


# ── STL ────────────────────────────────────────────────────────────────────
def read_stl(path):
    b = open(path, 'rb').read()
    if b[:5] == b'solid' and b'facet' in b[:400]:
        v = re.findall(rb'vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)', b)
        pts = np.array([[float(a) for a in x] for x in v])
        return pts.reshape(-1, 3, 3) / 25.4
    import struct
    n = struct.unpack_from('<I', b, 80)[0]
    tris = np.array([struct.unpack_from('<3f', b, 84 + 50 * i + 12 + 12 * k) for i in range(n) for k in range(3)])
    return tris.reshape(-1, 3, 3) / 25.4


# ── Isometric projection ───────────────────────────────────────────────────
# World (x right, y up, z toward viewer) → screen (top-left coords, inches).
# +x goes down-right at 30°, +z goes down-left at 30°, +y goes straight up.
C30, S30 = math.cos(math.radians(30)), math.sin(math.radians(30))
VIEW = np.array([1.0, 1.0, 1.0]) / math.sqrt(3)   # toward the viewer


def project(p, bbox):
    """p: (...,3) world inches → (...,2) screen pts, anchored so the envelope's
    bottom-front-right corner (xmax, ymin, zmax) lands on ISO_ORIGIN."""
    x = p[..., 0] - bbox[1][0]
    y = p[..., 1] - bbox[0][1]
    z = p[..., 2] - bbox[1][2]
    sx = ISO_ORIGIN[0] + ISO_SCALE * (x * C30 - z * C30)
    sy = ISO_ORIGIN[1] + ISO_SCALE * (x * S30 + z * S30 - y)
    return np.stack([sx, sy], axis=-1)


def feature_edges(tris, angle_deg=8.0):
    """Edges of the mesh where the faces on either side aren't coplanar.
    Handles T-junction triangulations by comparing against every triangle
    that has a colinear overlapping edge, not just an exact shared edge."""
    n = len(tris)
    normals = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    normals /= np.linalg.norm(normals, axis=1)[:, None] + 1e-12
    edges = []
    for i in range(n):
        for k in range(3):
            a, b = tris[i, k], tris[i, (k + 1) % 3]
            edges.append((i, a, b))
    out = []
    cos_thr = math.cos(math.radians(angle_deg))
    for i, a, b in edges:
        d = b - a
        L = np.linalg.norm(d)
        if L < 1e-9:
            continue
        u = d / L
        feature = True   # boundary edge (no neighbor) is drawn
        found_neighbor = False
        for j, a2, b2 in edges:
            if j == i:
                continue
            # colinear?
            if np.linalg.norm(np.cross(a2 - a, u)) > 1e-6 or np.linalg.norm(np.cross(b2 - a, u)) > 1e-6:
                continue
            t0, t1 = sorted([np.dot(a2 - a, u), np.dot(b2 - a, u)])
            if t1 <= 1e-6 or t0 >= L - 1e-6:
                continue  # no overlap along the line
            found_neighbor = True
            if abs(np.dot(normals[i], normals[j])) < cos_thr:
                feature = True
                break
            feature = False
        if feature or not found_neighbor:
            out.append((a, b))
    # Drop engraving edges (the FRONT / F label): block geometry sits on the
    # 1/16" grid, lettering vertices never do. Measured from the bbox corner.
    lo = tris.reshape(-1, 3).min(axis=0)
    def on_grid(p, step=1 / 16, tol=0.004):
        q = (p - lo) / step
        return np.all(np.abs(q - np.round(q)) < tol / step)
    out = [(a, b) for a, b in out if on_grid(a) and on_grid(b)]
    # dedupe (same segment from both sides)
    uniq = {}
    for a, b in out:
        key = tuple(sorted([tuple(np.round(a, 5)), tuple(np.round(b, 5))]))
        uniq[key] = (a, b)
    return list(uniq.values())


def visible_runs(edge, tris, samples=400, eps=1e-4):
    """Split a 3D edge into the sub-segments not occluded by any triangle."""
    a, b = edge
    t = np.linspace(0, 1, samples)
    P = a[None, :] + t[:, None] * (b - a)[None, :]
    depth = P @ VIEW
    # 2D (iso-plane) coords for occlusion test: use true isometric basis
    # (the drawing is an affine scale of it, so visibility is identical).
    ex = np.array([C30, 0, -C30]); ey = np.array([-S30, 1, -S30])
    p2 = np.stack([P @ ex, P @ ey], axis=-1)
    T2 = np.stack([tris @ ex, tris @ ey], axis=-1)          # (n,3,2)
    hidden = np.zeros(samples, dtype=bool)
    for k in range(len(tris)):
        A, B, C = T2[k]
        # skip degenerate (edge-on) triangles
        area = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])
        if abs(area) < 1e-9:
            continue
        # barycentric
        v0, v1 = C - A, B - A
        v2 = p2 - A
        d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
        d02, d12 = v2 @ v0, v2 @ v1
        inv = 1.0 / (d00 * d11 - d01 * d01)
        u = (d11 * d02 - d01 * d12) * inv
        v = (d00 * d12 - d01 * d02) * inv
        inside = (u > 1e-6) & (v > 1e-6) & (u + v < 1 - 1e-6)
        if not inside.any():
            continue
        # depth of the triangle plane at those points
        w = 1 - u - v
        tri_depth = w * (tris[k, 0] @ VIEW) + v * (tris[k, 1] @ VIEW) + u * (tris[k, 2] @ VIEW)
        hidden |= inside & (tri_depth > depth + eps)
    runs, start = [], None
    for i in range(samples):
        if not hidden[i] and start is None:
            start = i
        if (hidden[i] or i == samples - 1) and start is not None:
            end = i - 1 if hidden[i] else i
            if end > start:
                runs.append((P[start], P[end]))
            start = None
    return runs


# ── Sheet ──────────────────────────────────────────────────────────────────
def draw_sheet(c, stl_path):
    c.setLineWidth(LINE_W)
    c.setStrokeColorRGB(0, 0, 0)
    c.setFillColorRGB(0, 0, 0)
    x0, top, x1, bottom = BORDER
    c.rect(x0, PAGE_H - bottom, x1 - x0, bottom - top, stroke=1, fill=0)
    c.line(x0, PAGE_H - TITLE_TOP, x1, PAGE_H - TITLE_TOP)
    for dx in TITLE_DIVIDERS:
        c.line(dx, PAGE_H - TITLE_TOP, dx, PAGE_H - bottom)
    for xa, xb, ya, yb in FIELDS:
        xs = np.arange(xa, xb + 0.01, DOT_PITCH)
        ys = np.arange(ya, yb + 0.01, DOT_PITCH)
        for y in ys:
            for x in xs:
                px, py = tl(x, y)
                c.circle(px, py, DOT_R, stroke=0, fill=1)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(24, 23.6, "STEMBUILDER.IO")

    tris = read_stl(stl_path)
    bbox = (tris.reshape(-1, 3).min(axis=0), tris.reshape(-1, 3).max(axis=0))
    c.setLineWidth(ISO_LINE_W)
    c.setLineCap(1)
    n_vis = 0
    for edge in feature_edges(tris):
        for pa, pb in visible_runs(edge, tris):
            (ax, ay), (bx, by) = project(pa, bbox), project(pb, bbox)
            c.line(*tl(ax, ay), *tl(bx, by))
            n_vis += 1
    return n_vis


def main():
    stl, out = sys.argv[1], sys.argv[2]
    c = canvas.Canvas(out, pagesize=landscape(letter))
    n = draw_sheet(c, stl)
    c.save()
    print(f"wrote {out} ({n} visible edge segments)")


if __name__ == "__main__":
    main()
