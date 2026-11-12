const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { spawnSync } = require('child_process');

const SIZE = 1024;
const RADIUS = 230; // 现代圆角

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f9d70"/>
      <stop offset="55%" stop-color="#0891a8"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="crane-wing-left" x1="16" y1="6" x2="36" y2="38" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff" stop-opacity="0.98"/>
      <stop offset="1" stop-color="#f0fdf4" stop-opacity="0.82"/>
    </linearGradient>
    <linearGradient id="crane-wing-right" x1="48" y1="10" x2="32" y2="40" gradientUnits="userSpaceOnUse">
      <stop stop-color="#e0f2fe" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#bae6fd" stop-opacity="0.65"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="rgba(0,0,0,0.3)"/>
    </filter>
  </defs>

  <!-- 渐变背景圆角方块 -->
  <rect x="32" y="32" width="${SIZE - 64}" height="${SIZE - 64}" rx="${RADIUS}" ry="${RADIUS}" fill="url(#bg)" filter="url(#shadow)"/>

  <!-- Tsuru 折纸丹顶鹤 矢量图标 (viewBox 0 0 64 64) 缩放至 620x620 居中 -->
  <g transform="translate(202, 202) scale(9.6875)">
    <!-- 尾羽与下身 -->
    <polygon points="32,46 14,40 32,58" fill="url(#crane-wing-right)" opacity="0.88" />
    <!-- 右翼（背景翼） -->
    <polygon points="32,28 54,10 40,38" fill="url(#crane-wing-right)" />
    <!-- 鹤颈与头部 -->
    <polygon points="32,28 12,18 20,12 26,20" fill="url(#crane-wing-left)" />
    <!-- 丹顶红点（丹顶鹤朱砂特征点睛） -->
    <circle cx="15" cy="14" r="2.5" fill="#dc2f4b" stroke="#ffffff" stroke-width="0.5" />
    <!-- 左翼（主翼前方） -->
    <polygon points="32,28 8,6 28,42" fill="url(#crane-wing-left)" />
    <!-- 躯干中心脊线折面 -->
    <polygon points="32,28 28,42 38,36" fill="#ffffff" opacity="0.96" />
  </g>
</svg>`;

async function main() {
  console.log('Rendering Tsuru icon with Playwright (msedge)...');
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`, { waitUntil: 'load' });
  const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
  await browser.close();

  const outDir = path.join(__dirname, 'build');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'icon.png'), buf);
  console.log('Wrote build/icon.png (1024x1024)');

  // 运行 python make-ico.py 编译高质量包含多尺寸 DIB + PNG 的 Windows ICO 文件
  console.log('Running python make-ico.py to generate multi-size ICO...');
  const py = spawnSync('python', ['make-ico.py'], { cwd: __dirname, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '', PYTHONPATH: '' } });
  if (py.error || py.status !== 0) {
    console.error('python error:', py.stderr || py.error);
    process.exit(1);
  }
  console.log(py.stdout);

  // 同步复制到根目录 icon.ico
  fs.copyFileSync(path.join(outDir, 'icon.ico'), path.join(__dirname, 'icon.ico'));
  console.log('Updated icon.ico in root and build/ directories.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
