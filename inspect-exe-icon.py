"""检查 Windows exe 内嵌图标资源，并导出帧为 PNG 供肉眼验证。

用法：
    python inspect-exe-icon.py "release-app2/win-unpacked/Nebula Console.exe" shots/icon-final

不依赖任何第三方 PE 库，直接解析 PE32+ 的 .rsrc 目录，
把 RT_GROUP_ICON / RT_ICON 拆出来；DIB 帧手工转 BGRA->RGBA，PNG 帧直接落盘。
electron-builder 静默回退 Electron 默认图标时，用这个一眼就能看出来。
"""
import io
import os
import struct
import sys
from PIL import Image

exe_path = sys.argv[1] if len(sys.argv) > 1 else 'release-app2/win-unpacked/Nebula Console.exe'
out_prefix = sys.argv[2] if len(sys.argv) > 2 else 'shots/exe-icon'

d = open(exe_path, 'rb').read()
pe = struct.unpack_from('<I', d, 0x3C)[0]
assert d[pe:pe + 4] == b'PE\0\0', 'not a PE file'
coff = pe + 4
_, nsec, _, _, _, optsize, _ = struct.unpack_from('<HHIIIHH', d, coff)
opt = coff + 20
magic = struct.unpack_from('<H', d, opt)[0]
# PE32 (NSIS 安装包等 32 位 exe) DataDirectory 从 optional header +96 开始；
# PE32+ (Electron 主程序) 从 +112 开始。硬编码 PE32+ 会让 32 位 exe 的 .rsrc 解析成 None。
dd_base = opt + (112 if magic == 0x20B else 96)
rsrc_rva, _rsrc_size = struct.unpack_from('<II', d, dd_base + 16)  # DataDirectory[2] = resource

secs = []
for i in range(nsec):
    o = opt + optsize + 40 * i
    vsize, vaddr, rawsize, rawptr = struct.unpack_from('<IIII', d, o + 8)
    secs.append((vaddr, vsize, rawptr, rawsize))


def rva2off(rva):
    for vaddr, vsize, rawptr, rawsize in secs:
        if vaddr <= rva < vaddr + max(vsize, rawsize):
            return rawptr + (rva - vaddr)
    return None


rsrc = rva2off(rsrc_rva)


def entries(off):
    nn, ni = struct.unpack_from('<HH', d, off + 12)
    return [struct.unpack_from('<II', d, off + 16 + 8 * i) for i in range(nn + ni)]


items = []


def walk(off, level, path):
    for nm, off2 in entries(off):
        sub = rsrc + (off2 & 0x7FFFFFFF)
        if (off2 & 0x80000000) and level < 2:
            walk(sub, level + 1, path + (nm,))
        elif not (off2 & 0x80000000):
            drva, size, _cp, _res = struct.unpack_from('<IIII', d, sub)
            items.append((path + (nm,), rva2off(drva), size))


walk(rsrc, 0, ())

groups = [it for it in items if it[0][0] == 14]
icons = [it for it in items if it[0][0] == 3]
print('exe:', exe_path)
print('RT_GROUP_ICON:', len(groups), ' RT_ICON:', len(icons))

for _p, fo, _size in groups:
    _res, _typ, cnt = struct.unpack_from('<HHH', d, fo)
    print('  group count =', cnt)
    for i in range(cnt):
        w, h, _cc, _r, planes, bpp, binres, nid = struct.unpack_from('<BBBBHHIH', d, fo + 6 + 14 * i)
        print('    %3dx%-3d planes=%d bpp=%d bytes=%6d id=%d' % (w or 256, h or 256, planes, bpp, binres, nid))

os.makedirs(os.path.dirname(out_prefix) or '.', exist_ok=True)
for path, fo, size in icons:
    rid = path[1]
    blob = d[fo:fo + size]
    if blob.startswith(b'\x89PNG'):
        img = Image.open(io.BytesIO(blob)).convert('RGBA')
        kind = 'PNG'
    else:
        hsize, w, h2, _planes, bpp, _comp, _isz, _x, _y, _cu, _ci = struct.unpack_from('<IiiHHIIiiII', blob, 0)
        h = h2 // 2
        px = blob[hsize:hsize + w * h * 4]
        img = Image.frombytes('RGBA', (w, h), px, 'raw', 'BGRA').transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        kind = 'DIB/%dbpp' % bpp
    print('  id=%-3d %-10s %s' % (rid, kind, img.size))
    img.save(f'{out_prefix}-id{rid}.png')
    img.resize((256, 256), Image.Resampling.NEAREST).save(f'{out_prefix}-id{rid}-x256.png')
