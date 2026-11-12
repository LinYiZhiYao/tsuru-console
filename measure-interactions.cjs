/**
 * 全应用交互帧率扫描。
 *
 * 弹窗卡顿修完后，把其他高频交互也量一遍，确认没有同类隐患：
 *   idle / 页面切换 / 图表 hover（ECharts tooltip）/ 卡片 hover（柔光）
 *
 * 环境同 measure-modal-fps.cjs：静态 dist + mock + Edge --disable-gpu + 真实窗口。
 * 用法：node measure-interactions.cjs [--tag <label>]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, 'dist');
const OUT = path.join(__dirname, 'shots');
const TAG = (() => {
  const i = process.argv.indexOf('--tag');
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : 'run';
})();
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const START = () => {
  window.__frames = [];
  window.__sampling = true;
  window.__wallStart = performance.now();
  const tick = (t) => {
    if (!window.__sampling) return;
    window.__frames.push(t);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const STOP = () => {
  window.__sampling = false;
  const f = window.__frames || [];
  if (f.length < 2) return { frames: f.length, error: 'not enough frames' };
  const d = [];
  for (let i = 1; i < f.length; i++) {
    const delta = f[i] - f[i - 1];
    if (delta > 0.5) d.push(delta);
  }
  const sorted = [...d].sort((a, b) => a - b);
  const q = (p) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] * 10) / 10;
  const wall = performance.now() - window.__wallStart;
  return {
    frames: f.length,
    avgFps: Math.round((d.length / (wall / 1000)) * 10) / 10,
    p50: q(0.5),
    p95: q(0.95),
    max: Math.round(Math.max(...d) * 10) / 10,
    over32: d.filter((x) => x > 32).length,
    over50: d.filter((x) => x > 50).length,
    over100: d.filter((x) => x > 100).length,
  };
};

/** 在侧栏里按文字点导航（避免匹配到标题栏面包屑） */
const CLICK_NAV = (word) => {
  const aside = document.querySelector('aside');
  if (!aside) throw new Error('没有 aside');
  const b = [...aside.querySelectorAll('button, a')].find((x) =>
    (x.textContent || '').includes(word),
  );
  if (!b) throw new Error(`侧栏找不到导航: ${word}`);
  b.click();
};

const PROBE_BLUR = () => {
  const all = [...document.querySelectorAll('*')];
  const backs = all
    .map((el) => getComputedStyle(el).backdropFilter)
    .filter((v) => v && v !== 'none');
  return { backdropFilterCount: backs.length, values: [...new Set(backs)].slice(0, 5) };
};

(async () => {
  await new Promise((r) => server.listen(5401, r));
  const CANDIDATES = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
  const browser = await chromium.launch({
    executablePath,
    headless: false,
    args: ['--disable-gpu', '--enable-unsafe-swiftshader', '--window-size=1480,920'],
  });
  const page = await browser.newPage({ viewport: { width: 1480, height: 920 }, deviceScaleFactor: 1 });

  const src = fs.readFileSync(path.join(__dirname, 'verify-ui.cjs'), 'utf8');
  const m = src.match(/function mockScript\(\) \{[\s\S]*?\n\}/);
  if (!m) throw new Error('无法提取 mockScript');
  await page.addInitScript(new Function(`return (${m[0]})`)());

  await page.goto('http://localhost:5401/', { waitUntil: 'networkidle' });
  await sleep(1800);

  const sample = async (label, action, duration) => {
    await page.evaluate(START);
    if (action) await action();
    await sleep(duration);
    const s = await page.evaluate(STOP);
    console.log(
      `${label.padEnd(14)} fps=${String(s.avgFps).padStart(6)}  p50=${String(s.p50).padStart(5)}ms` +
        `  p95=${String(s.p95).padStart(6)}ms  max=${String(s.max).padStart(6)}ms` +
        `  >32=${s.over32}  >50=${s.over50}  >100=${s.over100}`,
    );
    return s;
  };

  console.log('\n=== 交互帧率（软件渲染）===');
  const idle = await sample('idle', null, 1100);

  const navToMonitor = await sample('切到监控', () => page.evaluate(CLICK_NAV, '监控'), 1000);
  await sleep(400);
  const navToServers = await sample('切到服务器', () => page.evaluate(CLICK_NAV, '服务器'), 1000);
  await sleep(400);
  const navToDash = await sample('切回总览', () => page.evaluate(CLICK_NAV, '总览'), 1000);
  await sleep(600);

  // 图表 hover：在 ECharts canvas 上来回移动，触发 tooltip 跟随
  const canvasBox = await page.locator('canvas').first().boundingBox();
  let chartHover;
  if (canvasBox) {
    chartHover = await sample(
      '图表 hover',
      async () => {
        for (let i = 0; i < 22; i++) {
          const x = canvasBox.x + 30 + (i % 11) * ((canvasBox.width - 60) / 11);
          const y = canvasBox.y + canvasBox.height * (0.35 + 0.25 * Math.sin(i / 2.5));
          await page.mouse.move(x, y);
          await sleep(30);
        }
      },
      400,
    );
  } else {
    chartHover = { error: 'no canvas' };
    console.log('图表 hover      跳过（没有 canvas）');
  }
  const hoverProbe = await page.evaluate(PROBE_BLUR);
  await page.screenshot({ path: path.join(OUT, `interactions-${TAG}-chart-hover.png`) });

  // 卡片 hover：在指标卡上移入移出
  const cardBox = await page.locator('.panel').first().boundingBox();
  let cardHover;
  if (cardBox) {
    cardHover = await sample(
      '卡片 hover',
      async () => {
        for (let i = 0; i < 10; i++) {
          await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
          await sleep(45);
          await page.mouse.move(cardBox.x - 30, cardBox.y - 30);
          await sleep(45);
        }
      },
      300,
    );
  } else {
    cardHover = { error: 'no panel' };
  }

  // hover 柔光行为验证：内联 opacity:0 曾覆盖 group-hover，导致反馈永远不显示。
  // 这里量 hover 前 / 过渡中 / 过渡后的 opacity，确认既显示又是渐变。
  const glow = page.locator('div[style*="blur(20px)"]').first();
  let hoverTrace = { error: 'glow element not found' };
  if (await glow.count()) {
    const card = glow.locator('..');
    await page.mouse.move(10, 10);
    await sleep(350);
    const before = await glow.evaluate((el) => Number(getComputedStyle(el).opacity));
    await card.hover();
    await sleep(120);
    const mid = await glow.evaluate((el) => Number(getComputedStyle(el).opacity));
    await sleep(320);
    const after = await glow.evaluate((el) => Number(getComputedStyle(el).opacity));
    hoverTrace = {
      before,
      midAfter120ms: mid,
      after,
      animated: mid > before && mid < after,
      visible: after > 0.9,
    };
    await page.screenshot({ path: path.join(OUT, `interactions-${TAG}-hover-glow.png`) });
  }

  console.log('\n=== blur probe（hover 时）===');
  console.log(JSON.stringify(hoverProbe, null, 2));
  console.log('\n=== hover 柔光 ===');
  console.log(JSON.stringify(hoverTrace, null, 2));

  const report = { tag: TAG, at: new Date().toISOString(), hoverProbe, hoverTrace, idle, navToMonitor, navToServers, navToDash, chartHover, cardHover };
  fs.writeFileSync(path.join(OUT, `interactions-${TAG}.json`), JSON.stringify(report, null, 2));

  await browser.close();
  server.close();
})().catch((e) => {
  console.error('measure-interactions failed:', e);
  server.close();
  process.exitCode = 1;
});
