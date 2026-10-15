"""Hand-build STEM Sketch doc_json files for the two Fill-the-Void SOLUTION
pieces (the complement of the printed block inside the 2" cube), the way a
student would: add/subtract cubes in a group. Used as the must-pass model
for the headless fit check. Cube convention: x/z = center, y = bottom (mm)."""
import json, sys
IN = 25.4
out_dir = sys.argv[1]

def cube(id_, op, w, h, d, x, ybot, z):
    return {"x": x * IN, "y": ybot * IN, "z": z * IN, "id": id_, "op": op, "type": "cube",
            "w": w * IN, "h": h * IN, "d": d * IN}

def doc(bodies, next_id):
    return {"grid": {"size": 304.8, "snap": True, "spacing": 12.7}, "bodies": bodies, "joints": [],
            "sketches": [], "nextBodyId": next_id, "nextJointId": 1, "nextSketchId": 1,
            "activeSketchId": None, "collisionWarnBodies": False, "collisionWarnGround": False}

# ── Void 1: complement of the Step Block ───────────────────────────────────
# Block profile (front view, x right, y up): left wall x∈[-1,-.5] full 2";
# then tops at 1.25 (x -.5..0)? NO — that's block 3. Step Block cut region:
#   x∈[-0.5,1] y∈[1.5,2]  |  x∈[0,1] y∈[1,1.5]  |  x∈[0.5,1] y∈[0.5,1]
# → three slabs through z (d = 2"), i.e. a 3-step inverted staircase.
v1 = doc([{"x": 0, "y": 0, "z": 0, "id": 10, "op": "add", "type": "group", "children": [
    cube(1, "add", 1.5, 0.5, 2, 0.25, 1.5, 0),
    cube(2, "add", 1.0, 0.5, 2, 0.5, 1.0, 0),
    cube(3, "add", 0.5, 0.5, 2, 0.75, 0.5, 0),
]}], 11)

# ── Void 2: complement of Four Posts ───────────────────────────────────────
# Lid: full 2×2 footprint from y=0.5 to 2 (1.5" tall), minus the four 0.5"
# corner posts: three reach y=1.25, back-left (x -1..-.5, z -1..-.5) reaches 2.
v2 = doc([{"x": 0, "y": 0, "z": 0, "id": 10, "op": "add", "type": "group", "children": [
    cube(1, "add", 2, 1.5, 2, 0, 0.5, 0),
    cube(2, "subtract", 0.5, 0.75, 0.5, -0.75, 0.5, 0.75),   # front-left post (to 1.25)
    cube(3, "subtract", 0.5, 0.75, 0.5, 0.75, 0.5, 0.75),    # front-right
    cube(4, "subtract", 0.5, 0.75, 0.5, 0.75, 0.5, -0.75),   # back-right
    cube(5, "subtract", 0.5, 1.5, 0.5, -0.75, 0.5, -0.75),   # back-left (to 2.0)
]}], 11)

json.dump(v1, open(f"{out_dir}/void1-solution.json", "w"))
json.dump(v2, open(f"{out_dir}/void2-solution.json", "w"))
print("wrote void1-solution.json (expect 3.0 in³) and void2-solution.json (expect 8-2.9375 = 5.0625 in³)")
