/**
 * 布局测量脚本：用真实浏览器测量关键容器的实际坐标与尺寸，
 * 用来验证「填满屏幕」是否真的成立，而不是靠肉眼看截图。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) {
    res.writeHead(404);
    res.end('nf');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const mockSource = fs.readFileSync(path.join(__dirname, 'verify-ui.cjs'), 'utf8');

(async () => {
  await new Promise((r) => server.listen(5398, r));
  const CANDIDATES = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ executablePath, args: ['--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1480, height: 920 }, deviceScaleFactor: 1 });

  // 从 verify-ui.cjs 里加载 mock 数据（它导出的是 mockScript 函数，可直接复用）
  const verifySrc = mockSource;
  const fnMatch = verifySrc.match(/function mockScript\(\) \{[\s\S]*?\n\}/);
  if (!fnMatch) throw new Error('无法提取 mockScript');
  const mockScript = new Function(`return (${fnMatch[0]})`)();
  await page.addInitScript(mockScript);
  await page.goto('http://localhost:5398/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);

  const measure = async (label, sel) => {
    const box = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) };
    }, sel);
    console.log(label.padEnd(28), JSON.stringify(box));
    return box;
  };

  const vh = 920;
  console.log('--- 视口高度', vh, '---');
  await measure('main-scroll-container', 'main');
  await measure('dashboard root', 'main > div');
  await measure('总览内容', 'main .h-full.flex.flex-col');

  const overflow = await page.evaluate(() => {
    const els = [...document.querySelectorAll('main *')];
    return els
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { tag: e.tagName, cls: (e.className || '').toString().slice(0, 60), bottom: Math.round(r.bottom), h: Math.round(r.height) };
      })
      .filter((x) => x.bottom > 922)
      .slice(0, 10);
  });
  console.log('--- 超出视口的元素 ---');
  overflow.forEach((o) => console.log(' ', o.bottom, o.h, o.tag, o.cls));

  // 服务器状态卡片内部：列表区域高度 vs 卡片高度
  const cardDetail = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.panel')];
    return cards.slice(0, 4).map((c) => {
      const r = c.getBoundingClientRect();
      const kids = [...c.children].map((k) => {
        const kr = k.getBoundingClientRect();
        return { h: Math.round(kr.height), bottom: Math.round(kr.bottom) };
      });
      return { panelH: Math.round(r.height), bottom: Math.round(r.bottom), kids };
    });
  });
  console.log('--- 前 4 个 panel 的内部结构 ---');
  cardDetail.forEach((c) => console.log(' ', JSON.stringify(c)));

  // Dashboard 纵向三段的高度分布
  const rows = await page.evaluate(() => {
    const root = document.querySelector('main > div > div');
    if (!root) return null;
    return [...root.children].map((k) => {
      const r = k.getBoundingClientRect();
      return { cls: (k.className || '').toString().slice(0, 50), y: Math.round(r.y), h: Math.round(r.height), bottom: Math.round(r.bottom) };
    });
  });
  console.log('--- Dashboard 三段分布 ---');
  (rows || []).forEach((r) => console.log(' ', JSON.stringify(r)));

  // 服务器列表可用高度 vs 实际行高
  const listInfo = await page.evaluate(() => {
    const list = document.querySelector('main .panel .flex-1.min-h-0.overflow-y-auto');
    if (!list) return null;
    const r = list.getBoundingClientRect();
    return {
      containerH: Math.round(r.height),
      scrollH: list.scrollHeight,
      clientH: list.clientHeight,
      rowCount: list.children.length,
      rowH: list.children[0] ? Math.round(list.children[0].getBoundingClientRect().height) : 0,
    };
  });
  console.log('--- 服务器列表 ---', JSON.stringify(listInfo));

  // 底部趋势图与快捷入口
  const bottomInfo = await page.evaluate(() => {
    const all = [...document.querySelectorAll('main *')];
    const chart = all.find((e) => (e.textContent || '').includes('CPU 均值趋势'));
    const card = chart ? chart.closest('.panel') : null;
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return { y: Math.round(r.y), h: Math.round(r.height), bottom: Math.round(r.bottom) };
  });
  console.log('--- 底部趋势图卡片 ---', JSON.stringify(bottomInfo));

  await browser.close();
  server.close();
  process.exit(0);
})().catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});
