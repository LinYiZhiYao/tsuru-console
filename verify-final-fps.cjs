/**
 * 在「真实打包成品 + NEBULA_DISABLE_GPU=1」下采样弹窗打开动画的帧率。
 *
 * measure-modal-fps.cjs 是静态 dist + Edge(--disable-gpu) 的近似环境，
 * 这个连的是真正带 preload / asar 的 Electron 窗口，代表用户双击 run-app.bat
 * 后实际看到的表现。
 *
 * 用法：node verify-final-fps.cjs
 */
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const pkg = require('./package.json');
const currentOut = pkg.build.directories.output;
const EXE = [
  path.join(ROOT, currentOut, 'win-unpacked', 'Nebula Console.exe'),
  path.join(ROOT, 'release-app2', 'win-unpacked', 'Nebula Console.exe'),
].find((p) => fs.existsSync(p));
const PORT = 9557;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const STOP_SAMPLER = () => {
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

async function main() {
  if (!EXE) throw new Error('找不到成品 exe');
  console.log('exe:', EXE);

  const child = spawn(EXE, [`--remote-debugging-port=${PORT}`], {
    cwd: path.dirname(EXE),
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, NEBULA_DISABLE_GPU: '1' },
  });
  child.unref();

  let browser = null;
  for (let i = 0; i < 60; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 2000 });
      break;
    } catch {
      await sleep(500);
    }
  }
  if (!browser) throw new Error(`CDP 端口 ${PORT} 未就绪`);

  let page = null;
  for (let i = 0; i < 30; i++) {
    const ctx = browser.contexts()[0];
    page = ctx && ctx.pages()[0];
    if (page) break;
    await sleep(300);
  }
  if (!page) throw new Error('没有找到渲染页面');

  await page.waitForLoadState('domcontentloaded');
  await sleep(1800);

  const env = await page.evaluate(() => ({
    title: document.title,
    nebula: typeof window.nebula,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    dpr: window.devicePixelRatio,
  }));
  console.log('env:', JSON.stringify(env));

  await page.evaluate(START_SAMPLER);
  await sleep(1100);
  const idle = await page.evaluate(STOP_SAMPLER);

  await page.evaluate(START_SAMPLER);
  await page.evaluate(CLICK_ADD);
  await sleep(1200);
  const opening = await page.evaluate(STOP_SAMPLER);

  const backdrop = await page.evaluate(() => {
    const o = document.querySelector('[data-modal-overlay]');
    return o ? getComputedStyle(o).backdropFilter : 'no-overlay';
  });

  await page.screenshot({ path: path.join(ROOT, 'shots', 'final-modal.png') });

  await page.evaluate(START_SAMPLER);
  await page.evaluate(CLICK_CANCEL);
  await sleep(800);
  const closing = await page.evaluate(STOP_SAMPLER);

  console.log('\n=== 真实成品 fps（NEBULA_DISABLE_GPU=1）===');
  for (const k of ['idle', 'opening', 'closing']) {
    const s = { idle, opening, closing }[k];
    console.log(
      `${k.padEnd(9)} fps=${String(s.avgFps).padStart(5)}  p50=${String(s.p50).padStart(5)}ms` +
        `  p95=${String(s.p95).padStart(6)}ms  max=${String(s.max).padStart(6)}ms` +
        `  >32ms=${s.over32}  >50ms=${s.over50}  >100ms=${s.over100}`,
    );
  }
  console.log('overlay backdropFilter:', backdrop);

  const report = { exe: EXE, at: new Date().toISOString(), env, backdrop, idle, opening, closing };
  fs.writeFileSync(path.join(ROOT, 'shots', 'final-fps.json'), JSON.stringify(report, null, 2));

  try {
    const session = await browser.newBrowserCDPSession();
    await session.send('Browser.close');
  } catch {
    /* ignore */
  }
}

main().catch((e) => {
  console.error('verify-final-fps failed:', e);
  process.exitCode = 1;
});
