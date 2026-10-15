"""Build the Fill-the-Void SOLUTION piece STL: target cube minus the printed
block, using the same boolean the in-tool check performs (cube anchored on
the block's bounding-box corner).

    python scripts/stem-sketch-void-solution-stl.py <block.stl> <solution.stl> [--cube 2]

Engraved lettering on the block (the F) is left in — it just becomes a tiny
raised F on the piece's mating face, which is harmless and actually helps
orient the pair. Pass --clean to strip it (drops every triangle with a vertex
off the 1/16" grid before the boolean).
"""
import sys
import re
import struct
import numpy as np
import manifold3d as m3


def read_stl_mm(path):
    b = open(path, 'rb').read()
    if b[:5] == b'solid' and b'facet' in b[:400]:
        v = re.findall(rb'vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)', b)
        return np.array([[float(a) for a in x] for x in v]).reshape(-1, 3, 3)
    n = struct.unpack_from('<I', b, 80)[0]
    return np.array([struct.unpack_from('<3f', b, 84 + 50 * i + 12 + 12 * k) for i in range(n) for k in range(3)]).reshape(-1, 3, 3)


def write_stl_ascii(path, tris, name="solution"):
    with open(path, 'w') as f:
        f.write(f"solid {name}\n")
        for t in tris:
            n = np.cross(t[1] - t[0], t[2] - t[0]); n = n / (np.linalg.norm(n) + 1e-12)
            f.write(f"  facet normal {n[0]:.6f} {n[1]:.6f} {n[2]:.6f}\n    outer loop\n")
            for p in t:
                f.write(f"      vertex {p[0]:.6f} {p[1]:.6f} {p[2]:.6f}\n")
            f.write("    endloop\n  endfacet\n")
        f.write(f"endsolid {name}\n")


def to_manifold(tris):
    verts = tris.reshape(-1, 3).astype(np.float32)
    uniq, inv = np.unique(np.round(verts, 5), axis=0, return_inverse=True)
    faces = inv.reshape(-1, 3).astype(np.uint32)
    mesh = m3.Mesh(vert_properties=uniq.astype(np.float32), tri_verts=faces)
    return m3.Manifold(mesh)


def main():
    args = sys.argv[1:]
    cube_in = 2.0
    clean = False
    if "--cube" in args:
        i = args.index("--cube"); cube_in = float(args[i + 1]); del args[i:i + 2]
    if "--clean" in args:
        args.remove("--clean"); clean = True
    src, out = args[0], args[1]
    tris = read_stl_mm(src)
    lo = tris.reshape(-1, 3).min(axis=0)
    if clean:
        q = (tris - lo) / (25.4 / 16)
        off = np.any(np.abs(q - np.round(q)) > 0.08, axis=(1, 2))
        tris = tris[~off]
    block = to_manifold(tris)
    s = cube_in * 25.4
    cube = m3.Manifold.cube([s, s, s]).translate([float(lo[0]), float(lo[1]), float(lo[2])])
    piece = cube - block
    mesh = piece.to_mesh()
    v = np.asarray(mesh.vert_properties)[:, :3]
    f = np.asarray(mesh.tri_verts)
    out_tris = v[f]
    write_stl_ascii(out, out_tris)
    print(f"block {block.volume() / 16387.064:.4f} in3  ->  piece {piece.volume() / 16387.064:.4f} in3, "
          f"{len(out_tris)} tris, bbox {(out_tris.reshape(-1, 3).max(0) - out_tris.reshape(-1, 3).min(0)) / 25.4}")
    print("wrote", out)


if __name__ == "__main__":
    main()
