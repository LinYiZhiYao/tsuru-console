"""生成 Windows 标准 ICO（供 electron-builder / rcedit 嵌入 exe）。

踩过的坑：Pillow 直接 save(format='ICO') 会把所有帧都写成 PNG。
rcedit / app-builder 对小尺寸帧要求 DIB(BITMAPINFOHEADER + BGRA + AND mask)，
全 PNG 帧的 ICO 会被静默忽略，最后 exe 里仍是 Electron 默认图标。

所以这里：16/24/32/48/64/128 用 DIB，256 用 PNG（Vista+ 允许），
再手工拼 ICONDIR / ICONDIRENTRY，保证资源格式合规。
"""
import io
import struct
from PIL import Image

SRC = 'build/icon.png'
DST = 'build/icon.ico'
SIZES = [16, 24, 32, 48, 64, 128, 256]

src = Image.open(SRC).convert('RGBA')


def dib_frame(size: int) -> bytes:
    im = src.resize((size, size), Image.Resampling.LANCZOS)
    # DIB 像素是自下而上的 BGRA
    im = im.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    r, g, b, a = im.split()
    bgra = Image.merge('RGBA', (b, g, r, a)).tobytes()
    # AND mask：每行按 4 字节对齐，32bpp 带 alpha 时全 0
    mask_row_bytes = ((size + 31) // 32) * 4
    and_mask = b'\x00' * (mask_row_bytes * size)
    header = struct.pack(
        '<IiiHHIIiiII',
        40,               # biSize
        size,             # biWidth
        size * 2,         # biHeight = XOR 高度 + AND mask 高度
        1,                # biPlanes
        32,               # biBitCount
        0,                # biCompression = BI_RGB
        len(bgra) + len(and_mask),
        0, 0, 0, 0,
    )
    return header + bgra + and_mask


def png_frame(size: int) -> bytes:
    im = src.resize((size, size), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format='PNG')
    return buf.getvalue()


frames = [(s, png_frame(s) if s == 256 else dib_frame(s)) for s in SIZES]

out = io.BytesIO()
out.write(struct.pack('<HHH', 0, 1, len(frames)))   # ICONDIR: reserved, type=1, count
offset = 6 + 16 * len(frames)
for s, blob in frames:
    w = 0 if s >= 256 else s
    h = 0 if s >= 256 else s
    out.write(struct.pack('<BBBBHHII', w, h, 0, 0, 1, 32, len(blob), offset))
    offset += len(blob)
for _s, blob in frames:
    out.write(blob)

with open(DST, 'wb') as f:
    f.write(out.getvalue())

# 自检
check = Image.open(DST)
print(f'{DST}: {len(frames)} frames, {len(out.getvalue())} bytes')
print('sizes:', sorted(check.ico.sizes()))
for i, (s, blob) in enumerate(frames):
    kind = 'PNG' if blob.startswith(b'\x89PNG') else 'DIB'
    print(f'  {s:3d}x{s:<3d} {kind:3s} {len(blob):7d} bytes')
