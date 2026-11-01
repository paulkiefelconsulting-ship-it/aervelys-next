"""Generate original AERVELYS NEXT app icons using the Python standard library.

No proprietary branding, third-party artwork or font files are required.
The Windows ICO holds a 256px PNG image. Run from desktop/ with:
    python scripts/make-icon.py
"""
from pathlib import Path
import math
import struct
import zlib

SIZE = 256
ROOT = Path(__file__).resolve().parents[1] / "assets"
ROOT.mkdir(parents=True, exist_ok=True)

def inside_poly(x, y, vertices):
    found = False
    j = len(vertices) - 1
    for i in range(len(vertices)):
        xi, yi = vertices[i]
        xj, yj = vertices[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            found = not found
        j = i
    return found

left = [(57, 185), (111, 66), (138, 66), (85, 185)]
right = [(118, 66), (146, 66), (203, 185), (169, 185)]
bar = [(98, 144), (165, 144), (174, 164), (90, 164)]
wing = [(147, 98), (216, 69), (202, 93), (154, 117)]

def pixel(x, y):
    # Rounded rectangle with subtle silver keyline.
    cx = max(34, min(x, 222))
    cy = max(34, min(y, 222))
    d2 = (x - cx) ** 2 + (y - cy) ** 2
    if d2 > 34 * 34:
        return (0, 0, 0, 0)
    border = x < 5 or x >= 251 or y < 5 or y >= 251 or d2 > 30 * 30 and (x < 36 or x > 219 or y < 36 or y > 219)
    if border:
        return (107, 154, 185, 255)
    if inside_poly(x, y, wing):
        return (46, 167, 224, 255)
    if any(inside_poly(x, y, polygon) for polygon in [left, right, bar]):
        return (245, 249, 252, 255)
    return (13 + y // 45, 36 + y // 22, 64 + y // 21, 255)

raw = bytearray()
for y in range(SIZE):
    raw.append(0)
    for x in range(SIZE):
        raw.extend(pixel(x, y))

def chunk(kind, payload):
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(
        ">I", zlib.crc32(kind + payload) & 0xffffffff
    )

png = (
    b"\x89PNG\r\n\x1a\n"
    + chunk(b"IHDR", struct.pack(">2I5B", SIZE, SIZE, 8, 6, 0, 0, 0))
    + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    + chunk(b"IEND", b"")
)
(ROOT / "icon.png").write_bytes(png)
# An ICO directory entry with width 0 encodes 256 pixels.
header = struct.pack("<HHH", 0, 1, 1)
entry = struct.pack("<BBBBHHII", 0, 0, 0, 0, 1, 32, len(png), 22)
(ROOT / "icon.ico").write_bytes(header + entry + png)
print("AERVELYS NEXT assets/icon.png + icon.ico created")
