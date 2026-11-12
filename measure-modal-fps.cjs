/**
 * 弹窗打开动画帧率采样器。
 *
 * 目的：用数字证明「打开弹窗时卡顿」，而不是靠肉眼。
 * 手法：托管 dist/ + 注入 mock（复用 verify-ui.cjs），用 --disable-gpu 的 Edge
 *       模拟本机 NEBULA_DISABLE_GPU=1 的软件渲染环境，再在 rAF 上采样帧间隔。
 *
 * 采样三段：idle 基线 / 打开弹窗 / 关闭弹窗。
 * 输出每段的平均 fps、帧间隔分位数、掉帧数、最长帧，
 * 以及页面上 backdrop-filter / filter 的使用情况（定位元凶）。
 *
 * 用法：node measure-modal-fps.cjs [--tag <label>]
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
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 在页面里启动 rAF 采样器 */
const START_SAMPLER = () => {
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

/** 停止采样并算统计 */
const STOP_SAMPLER = () => {
  window.__sampling = false;
  const f = window.__frames || [];
  if (f.length < 2) return { frames: f.length, error: 'not enough frames' };
  // headless / 追赶帧会给同一帧多次回调打出相同时间戳，先去重再统计
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
    durationMs: Math.round(wall),
    avgFps: Math.round((d.length / (wall / 1000)) * 10) / 10,
    p50: q(0.5),
    p90: q(0.9),
    p95: q(0.95),
    max: Math.round(Math.max(...d) * 10) / 10,
    over32: d.filter((x) => x > 32).length,
    over50: d.filter((x) => x > 50).length,
    over100: d.filter((x) => x > 100).length,
    worstFrames: [...d].sort((a, b) => b - a).slice(0, 5).map((x) => Math.round(x)),
  };
};

/** 逐帧记录面板的 opacity / translateY，证明过渡仍在插值而不是硬切 */
const START_TRACE = () => {
  window.__trace = [];
  window.__traceOn = true;
  window.__traceT0 = performance.now();
  const tick = () => {
    if (!window.__traceOn) return;
    const p = document.querySelector('[data-modal-panel]');
    if (p) {
      const cs = getComputedStyle(p);
      window.__trace.push({
        t: Math.round(performance.now() - window.__traceT0),
        o: Math.round(Number(cs.opacity) * 1000) / 1000,
        tr: cs.transform,
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const STOP_TRACE = () => {
  window.__traceOn = false;
  const tr = window.__trace || [];
  const opacities = [...new Set(tr.map((x) => x.o))];
  const yOf = (s) => {
    const m = /matrix\([^)]*,\s*([-\d.]+)\)/.exec(s || '');
    return m ? Math.round(Number(m[1]) * 10) / 10 : null;
  };
  const ys = [...new Set(tr.map((x) => yOf(x.tr)).filter((v) => v !== null))];
  return {
    frames: tr.length,
    distinctOpacity: opacities.length,
    opacityRange: [Math.min(...opacities), Math.max(...opacities)],
    distinctTranslateY: ys.length,
    yRange: ys.length ? [Math.min(...ys), Math.max(...ys)] : null,
    head: tr.slice(0, 14).map((x) => `${x.t}ms o=${x.o} y=${yOf(x.tr)}`),
  };
};

const CLICK_ADD = () => {
  const b = [...document.querySelectorAll('button')].find((x) =>
    (x.textContent || '').includes('添加服务器'),
  );
  if (!b) throw new Error('找不到「添加服务器」按钮');
  b.click();
};

const CLICK_CANCEL = () => {
  const b = [...document.querySelectorAll('button')].find((x) =>
    (x.textContent || '').trim() === '取消',
  );
  if (!b) throw new Error('找不到「取消」按钮');
  b.click();
};

(async () => {
  await new Promise((r) => server.listen(5399, r));

  const CANDIDATES = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
  if (!executablePath) throw new Error('找不到 Edge');

  // 真实窗口才有 vsync，rAF 时间戳可用于算帧率；headless 会插入重复时间戳的追赶帧
  const browser = await chromium.launch({
    executablePath,
    headless: false,
    args: ['--disable-gpu', '--enable-unsafe-swiftshader', '--window-size=1480,920'],
  });
  const page = await browser.newPage({ viewport: { width: 1480, height: 920 }, deviceScaleFactor: 1 });

  const verifySrc = fs.readFileSync(path.join(__dirname, 'verify-ui.cjs'), 'utf8');
  const fnMatch = verifySrc.match(/function mockScript\(\) \{[\s\S]*?\n\}/);
  if (!fnMatch) throw new Error('无法提取 mockScript');
  const mockScript = new Function(`return (${fnMatch[0]})`)();
  await page.addInitScript(mockScript);

  await page.goto('http://localhost:5399/', { waitUntil: 'networkidle' });
  await sleep(1800); // 首屏入场动画结束

  const styleProbe = await page.evaluate(() => {
    const all = [...document.querySelectorAll('*')];
    const backdrops = all
      .map((el) => ({ el, v: getComputedStyle(el).backdropFilter }))
      .filter((x) => x.v && x.v !== 'none')
      .map((x) => ({
        tag: x.el.tagName.toLowerCase(),
        cls: (x.el.className || '').toString().slice(0, 90),
        value: x.v,
        area: Math.round(x.el.getBoundingClientRect().width * x.el.getBoundingClientRect().height),
      }));
    const filters = all
      .map((el) => ({ el, v: getComputedStyle(el).filter }))
      .filter((x) => x.v && x.v !== 'none' && x.v.includes('blur'))
      .map((x) => ({ tag: x.el.tagName.toLowerCase(), value: x.v }));
    return { backdropCount: backdrops.length, backdrops: backdrops.slice(0, 8), filterCount: filters.length };
  });

  // 1) idle 基线
  await page.evaluate(START_SAMPLER);
  await sleep(1100);
  const idle = await page.evaluate(STOP_SAMPLER);

  // 2) 打开弹窗（动画期间）
  await page.evaluate(START_SAMPLER);
  await page.evaluate(CLICK_ADD);
  await sleep(1200);
  const opening = await page.evaluate(STOP_SAMPLER);
  await page.screenshot({ path: path.join(OUT, `modal-${TAG}-open.png`) });

  // 中间态截图：再开关一次，在 ~90ms 时抓一帧
  await page.evaluate(CLICK_CANCEL);
  await sleep(500);
  await page.evaluate(START_SAMPLER);
  await page.evaluate(CLICK_ADD);
  await sleep(90);
  await page.screenshot({ path: path.join(OUT, `modal-${TAG}-mid.png`) });
  const midProbe = await page.evaluate(() => {
    const overlay = [...document.querySelectorAll('div')].find(
      (d) => getComputedStyle(d).backdropFilter !== 'none' && d.getBoundingClientRect().width > 1000,
    );
    return overlay ? getComputedStyle(overlay).backdropFilter : 'no-backdrop-overlay';
  });
  await sleep(900);
  await page.evaluate(STOP_SAMPLER);

  // 2.5) 动画轨迹：验证过渡仍在逐帧插值（改完动画后必须证明它没变成硬切）
  await page.evaluate(CLICK_CANCEL);
  await sleep(450);
  await page.evaluate(START_TRACE);
  await page.evaluate(CLICK_ADD);
  await sleep(600);
  const trace = await page.evaluate(STOP_TRACE);

  // 3) 关闭弹窗（动画期间）
  await page.evaluate(START_SAMPLER);
  await page.evaluate(CLICK_CANCEL);
  await sleep(800);
  const closing = await page.evaluate(STOP_SAMPLER);

  const report = { tag: TAG, at: new Date().toISOString(), styleProbe, midProbe, trace, idle, opening, closing };
  console.log('\n=== style probe ===');
  console.log(JSON.stringify(styleProbe, null, 2));
  console.log('\n=== animation trace ===');
  console.log(JSON.stringify(trace, null, 2));
  console.log('\n=== fps ===');
  for (const k of ['idle', 'opening', 'closing']) {
    const s = report[k];
    console.log(
      `${k.padEnd(9)} fps=${String(s.avgFps).padStart(5)}  p50=${String(s.p50).padStart(5)}ms` +
        `  p95=${String(s.p95).padStart(6)}ms  max=${String(s.max).padStart(6)}ms` +
        `  >32ms=${s.over32}  >50ms=${s.over50}  >100ms=${s.over100}` +
        `  worst=[${s.worstFrames.join(',')}]`,
    );
  }
  console.log('\nmidProbe:', midProbe);
  fs.writeFileSync(path.join(OUT, `modal-fps-${TAG}.json`), JSON.stringify(report, null, 2));

  await browser.close();
  server.close();
})().catch((e) => {
  console.error('measure-modal-fps failed:', e);
  server.close();
  process.exitCode = 1;
});
