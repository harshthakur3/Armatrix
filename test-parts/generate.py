"""Generate STL test parts for the Weld Seam Planner.

Each part is a small welded assembly built from separate plate/tube bodies that
touch along their joints, which is how weldments are usually exported from CAD.
Units are millimetres, Z is up.

Usage:  python generate.py            (writes the .stl files next to this script)
"""

import math
import struct
from pathlib import Path

OUT_DIR = Path(__file__).parent


# ---------------------------------------------------------------- geometry ---

def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def unit(v):
    length = math.sqrt(dot(v, v)) or 1.0
    return (v[0] / length, v[1] / length, v[2] / length)


def oriented_quad(a, b, c, d, outward):
    """Two triangles for quad a-b-c-d, wound so their normals face `outward`."""
    tris = [(a, b, c), (a, c, d)]
    if dot(cross(sub(b, a), sub(c, a)), outward) < 0:
        tris = [(a, c, b), (a, d, c)]
    return tris


def oriented_tri(a, b, c, outward):
    return [(a, b, c)] if dot(cross(sub(b, a), sub(c, a)), outward) >= 0 else [(a, c, b)]


def box(x0, y0, z0, x1, y1, z1):
    p = lambda x, y, z: (x, y, z)  # noqa: E731
    return (
        oriented_quad(p(x0, y0, z0), p(x1, y0, z0), p(x1, y1, z0), p(x0, y1, z0), (0, 0, -1))
        + oriented_quad(p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1), (0, 0, 1))
        + oriented_quad(p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1), (0, -1, 0))
        + oriented_quad(p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1), (0, 1, 0))
        + oriented_quad(p(x0, y0, z0), p(x0, y1, z0), p(x0, y1, z1), p(x0, y0, z1), (-1, 0, 0))
        + oriented_quad(p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1), (1, 0, 0))
    )


def triangle_plate_xz(points, y0, y1):
    """Triangular plate (gusset) lying in the XZ plane, extruded along Y."""
    (ax, az), (bx, bz), (cx, cz) = points
    front = [(ax, y0, az), (bx, y0, bz), (cx, y0, cz)]
    back = [(ax, y1, az), (bx, y1, bz), (cx, y1, cz)]
    centre = ((ax + bx + cx) / 3, (y0 + y1) / 2, (az + bz + cz) / 3)
    tris = oriented_tri(*front, (0, -1, 0)) + oriented_tri(*back, (0, 1, 0))
    for i in range(3):
        j = (i + 1) % 3
        mid = tuple((front[i][k] + front[j][k]) / 2 for k in range(3))
        tris += oriented_quad(front[i], front[j], back[j], back[i], sub(mid, centre))
    return tris


def tube_z(cx, cy, z0, z1, r_out, r_in, segments=96):
    """Round tube (pipe) along Z."""
    tris = []
    for i in range(segments):
        a0 = 2 * math.pi * i / segments
        a1 = 2 * math.pi * (i + 1) / segments
        ca0, sa0, ca1, sa1 = math.cos(a0), math.sin(a0), math.cos(a1), math.sin(a1)
        o0b, o1b = (cx + r_out * ca0, cy + r_out * sa0, z0), (cx + r_out * ca1, cy + r_out * sa1, z0)
        o0t, o1t = (o0b[0], o0b[1], z1), (o1b[0], o1b[1], z1)
        i0b, i1b = (cx + r_in * ca0, cy + r_in * sa0, z0), (cx + r_in * ca1, cy + r_in * sa1, z0)
        i0t, i1t = (i0b[0], i0b[1], z1), (i1b[0], i1b[1], z1)
        mid = (math.cos((a0 + a1) / 2), math.sin((a0 + a1) / 2), 0)
        tris += oriented_quad(o0b, o1b, o1t, o0t, mid)                       # outer wall
        tris += oriented_quad(i0b, i1b, i1t, i0t, (-mid[0], -mid[1], 0))     # inner wall
        tris += oriented_quad(o0t, o1t, i1t, i0t, (0, 0, 1))                 # top ring
        tris += oriented_quad(o0b, o1b, i1b, i0b, (0, 0, -1))                # bottom ring
    return tris


# Cyclic axis swaps keep triangle winding (normals) correct while turning a Z part sideways.
def _to_y(tris):
    return [tuple((p[1], p[2], p[0]) for p in tri) for tri in tris]


def _to_x(tris):
    return [tuple((p[2], p[0], p[1]) for p in tri) for tri in tris]


def tube_y(cx, cz, y0, y1, r_out, r_in, segments=96):
    """Round tube along Y, centred on (x=cx, z=cz)."""
    return _to_y(tube_z(cz, cx, y0, y1, r_out, r_in, segments))


def rhs_x(x0, x1, yc, zc, w, h, t):
    """Rectangular hollow section along X, built from its four walls."""
    y0, y1, z0, z1 = yc - w / 2, yc + w / 2, zc - h / 2, zc + h / 2
    return (box(x0, y0, z1 - t, x1, y1, z1) + box(x0, y0, z0, x1, y1, z0 + t)
            + box(x0, y0, z0 + t, x1, y0 + t, z1 - t) + box(x0, y1 - t, z0 + t, x1, y1, z1 - t))


def rhs_y(y0, y1, xc, zc, w, h, t):
    """Rectangular hollow section along Y, built from its four walls."""
    x0, x1, z0, z1 = xc - w / 2, xc + w / 2, zc - h / 2, zc + h / 2
    return (box(x0, y0, z1 - t, x1, y1, z1) + box(x0, y0, z0, x1, y1, z0 + t)
            + box(x0, y0, z0 + t, x0 + t, y1, z1 - t) + box(x1 - t, y0, z0 + t, x1, y1, z1 - t))


def triangle_plate_xy(points, z0, z1):
    """Triangular plate lying flat (in the XY plane), extruded along Z."""
    (ax, ay), (bx, by), (cx, cy) = points
    bottom = [(ax, ay, z0), (bx, by, z0), (cx, cy, z0)]
    top = [(ax, ay, z1), (bx, by, z1), (cx, cy, z1)]
    centre = ((ax + bx + cx) / 3, (ay + by + cy) / 3, (z0 + z1) / 2)
    tris = oriented_tri(*bottom, (0, 0, -1)) + oriented_tri(*top, (0, 0, 1))
    for i in range(3):
        j = (i + 1) % 3
        mid = tuple((bottom[i][k] + bottom[j][k]) / 2 for k in range(3))
        tris += oriented_quad(bottom[i], bottom[j], top[j], top[i], sub(mid, centre))
    return tris


# ---------------------------------------------------------------- writers ---

def write_binary(path, tris, name):
    with open(path, 'wb') as f:
        f.write(name.encode('ascii')[:80].ljust(80, b' '))
        f.write(struct.pack('<I', len(tris)))
        for a, b, c in tris:
            n = unit(cross(sub(b, a), sub(c, a)))
            f.write(struct.pack('<12fH', *n, *a, *b, *c, 0))


def write_ascii(path, tris, name):
    lines = [f'solid {name}']
    for a, b, c in tris:
        n = unit(cross(sub(b, a), sub(c, a)))
        lines.append(f'  facet normal {n[0]:.6f} {n[1]:.6f} {n[2]:.6f}')
        lines.append('    outer loop')
        for v in (a, b, c):
            lines.append(f'      vertex {v[0]:.4f} {v[1]:.4f} {v[2]:.4f}')
        lines.append('    endloop')
        lines.append('  endfacet')
    lines.append(f'endsolid {name}')
    path.write_text('\n'.join(lines) + '\n', encoding='ascii')


# ------------------------------------------------------------------ parts ---

def l_bracket_gusset():
    """L-bracket with a central rib: 3 fillet seams (wall-base, rib-base, rib-wall)."""
    t = 10
    return (
        box(0, 0, 0, 240, 160, t)                                   # base plate
        + box(0, 0, t, t, 160, 150)                                 # upright wall
        + triangle_plate_xz([(t, t), (130, t), (t, 130)], 75, 85)   # gusset rib
    )


def t_joint():
    """Web standing on a flange: 2 long fillet seams, one each side of the web."""
    return box(0, 0, 0, 300, 150, 12) + box(0, 70, 12, 300, 80, 132)


def butt_joint():
    """Two plates edge to edge with a 2 mm root gap: 1 straight butt seam."""
    return box(0, 0, 0, 200, 150, 8) + box(202, 0, 0, 402, 150, 8)


def open_box():
    """Base with four walls: 4 floor fillets plus 4 vertical corner seams."""
    t = 6
    return (
        box(0, 0, 0, 200, 140, t)
        + box(0, 0, t, 200, t, 100)
        + box(0, 140 - t, t, 200, 140, 100)
        + box(0, t, t, t, 140 - t, 100)
        + box(200 - t, t, t, 200, 140 - t, 100)
    )


def pipe_flange():
    """Pipe standing on a square flange plate: 1 circular fillet seam."""
    return box(0, 0, 0, 200, 200, 12) + tube_z(100, 100, 12, 172, 50, 44)


def truck_chassis():
    """
    A ~4 m truck chassis frame: a large, realistic weldment with many joint types.
      - 2 side rails and 6 cross members (rectangular hollow sections): tube-to-tube fillets
      - 24 corner gusset plates inside every rail/cross-member corner
      - front and rear bumper plates: rail ends welded all round
      - 8 spring hangers: plate pairs under the rails with a round pin through each pair
      - a roll bar: two round posts on base plates joined by a round crossbar
      - 4 engine mounts: pads with round bosses (circular seams)
      - 4 fuel-tank brackets on the outside of the rails
    """
    length, t = 4000, 8
    rails_y = (-450, 450)  # rail centres; each rail is 100 wide, so inner faces are at y = +-400
    tris = []

    for yc in rails_y:
        tris += rhs_x(0, length, yc, 100, 100, 200, t)

    for xc in (300, 1000, 1800, 2600, 3300, 3800):
        tris += rhs_y(-400, 400, xc, 100, 80, 200, t)
        # Corner gussets at mid-height, welded to the rail's inner face and the member's side.
        for side in (-1, 1):
            for ys in (-1, 1):
                cx, cy = xc + side * 40, ys * 400
                corner = [(cx, cy), (cx + side * 150, cy), (cx, cy - ys * 150)]
                tris += triangle_plate_xy(corner, 92, 108)

    tris += box(-20, -550, -25, 0, 550, 225)                 # front bumper plate
    tris += box(length, -550, -25, length + 20, 550, 225)    # rear bumper plate

    for x in (600, 1400, 2900, 3500):
        for yc in rails_y:
            tris += box(x - 60, yc - 45, -160, x + 60, yc - 35, 0)   # hanger cheek
            tris += box(x - 60, yc + 35, -160, x + 60, yc + 45, 0)   # hanger cheek
            tris += tube_y(x, -100, yc - 35, yc + 35, 20, 12)        # spring pin

    for yc in rails_y:
        tris += box(1100, yc - 100, 200, 1300, yc + 100, 216)       # roll-bar base plate
        tris += tube_z(1200, yc, 216, 1400, 38, 33)                # roll-bar post
    tris += tube_y(1200, 1350, -412, 412, 30, 26)                  # roll-bar crossbar

    for x in (500, 700):
        for yc in rails_y:
            tris += box(x - 60, yc - 60, 200, x + 60, yc + 60, 212)  # engine mount pad
            tris += tube_z(x, yc, 212, 262, 25, 12)                # engine mount boss

    for x in (2200, 2600):
        for s in (-1, 1):
            face = s * 500  # outer face of the rail
            tris += box(x - 40, min(face, face + s * 8), 20, x + 40, max(face, face + s * 8), 180)
            tris += box(x - 40, min(face + s * 8, face + s * 200), 20, x + 40, max(face + s * 8, face + s * 200), 28)

    return tris


PARTS = {
    'l-bracket-gusset': l_bracket_gusset,
    't-joint': t_joint,
    'butt-joint': butt_joint,
    'open-box': open_box,
    'pipe-flange': pipe_flange,
    'truck-chassis': truck_chassis,
}


if __name__ == '__main__':
    for name, build in PARTS.items():
        tris = build()
        write_binary(OUT_DIR / f'{name}.stl', tris, f'Armatrix test part {name} (mm)')
        print(f'{name}.stl  {len(tris)} triangles')
    # One ASCII copy, since real-world STL files come in both encodings.
    write_ascii(OUT_DIR / 't-joint-ascii.stl', t_joint(), 't_joint')
    print('t-joint-ascii.stl  (ASCII encoding)')
