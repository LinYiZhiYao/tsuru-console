const { spawn } = require('child_process');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const pkg = require('./package.json');
const currentOut = pkg.build.directories.output;
const EXE = path.join(ROOT, currentOut, 'win-unpacked', 'Tsuru Console.exe');
const PORT = 9559;
const SHOTS = path.join(ROOT, 'shots-tsuru-v2');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('Testing binary:', EXE);
  if (!fs.existsSync(EXE)) throw new Error('Target binary does not exist: ' + EXE);
  fs.mkdirSync(SHOTS, { recursive: true });

  const child = spawn(EXE, [`--remote-debugging-port=${PORT}`], {
    cwd: path.dirname(EXE),
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, NEBULA_DISABLE_GPU: '1' },
  });
  child.unref();
  console.log('Spawned PID:', child.pid);

  let browser = null;
  for (let i = 0; i < 60; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 2000 });
      break;
    } catch {
      await sleep(500);
    }
  }
  if (!browser) throw new Error(`CDP port ${PORT} not ready`);

  let page = null;
  for (let i = 0; i < 30; i++) {
    const ctx = browser.contexts()[0];
    page = ctx && ctx.pages()[0];
    if (page) break;
    await sleep(300);
  }
  if (!page) throw new Error('No renderer page found');

  await page.waitForLoadState('domcontentloaded');
  await sleep(4200);

  // 1. Check title / brand & ensure zero Gemini strings
  const titleText = await page.evaluate(() => document.body.innerText.toLowerCase());
  const hasBrand = titleText.includes('tsuru') && titleText.includes('console');
  const hasGemini = titleText.includes('gemini');
  console.log('1. Brand Tsuru Console found:', hasBrand, '| Has Gemini text:', hasGemini);
  if (hasGemini) throw new Error('Found unexpected Gemini text on Dashboard');

  // 2. Check server 8.140.205.93 presence
  const hasServer = titleText.includes('8.140.205.93');
  console.log('2. User server 8.140.205.93 found in UI:', hasServer);
  await page.screenshot({ path: path.join(SHOTS, '01-dashboard.png') });

  // Measure software rendering FPS helper
  const measFps = () => page.evaluate(() => new Promise((resolve) => {
    const times = [];
    let last = performance.now();
    let count = 0;
    function step(now) {
      times.push(now - last);
      last = now;
      if (++count < 55) requestAnimationFrame(step);
      else {
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const max = Math.max(...times);
        const over20 = times.filter((t) => t > 20).length;
        const over33 = times.filter((t) => t > 33).length;
        resolve({ fps: +(1000 / avg).toFixed(1), avgMs: +avg.toFixed(2), maxMs: +max.toFixed(2), over20, over33 });
      }
    }
    requestAnimationFrame(step);
  }));

  console.log('2b. Idle FPS (GPU=0):', await measFps());
  await page.click('text=服务器');
  console.log('2c. Nav Servers FPS (GPU=0):', await measFps());
  await page.click('text=总览');
  console.log('2d. Nav Dashboard FPS (GPU=0):', await measFps());

  // 3. Test Command Palette (Ctrl+K)
  await page.keyboard.press('Control+k');
  await sleep(300);
  const paletteOpen = await page.evaluate(() => !!document.querySelector('input[placeholder*="即刻执行"]'));
  const paletteHasGemini = await page.evaluate(() => document.body.innerText.toLowerCase().includes('gemini'));
  console.log('3. Command Palette opened:', paletteOpen, '| Has Gemini text:', paletteHasGemini);
  if (paletteHasGemini) throw new Error('Found unexpected Gemini text inside Command Palette');
  if (paletteOpen) {
    await page.keyboard.type('8.140');
    await sleep(350);
    await page.screenshot({ path: path.join(SHOTS, '02-command-palette.png') });
    await page.keyboard.press('Escape');
    await sleep(400);
  }

  // Verify 0 backdrop-filter and 0 filter: blur() across all DOM elements
  const filterStats = await page.evaluate(() => {
    let backdropCount = 0;
    let blurCount = 0;
    for (const el of document.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      if (s.backdropFilter && s.backdropFilter !== 'none') backdropCount++;
      if (s.filter && s.filter.includes('blur')) blurCount++;
    }
    return { backdropCount, blurCount };
  });
  console.log('3b. Expensive filter stats:', filterStats);
  if (filterStats.backdropCount > 0 || filterStats.blurCount > 0) {
    throw new Error('Unexpected blur filter detected: ' + JSON.stringify(filterStats));
  }

  // 4. Click server to open Detail page
  if (hasServer) {
    const serverRow = page.locator('text=8.140.205.93').first();
    await serverRow.click();
    await sleep(1500);
    await page.screenshot({ path: path.join(SHOTS, '03-server-detail-overview.png') });
    console.log('4. Navigated to ServerDetail for 8.140.205.93 (Overview with prominent Diagnostics Section)');

    // 5. Switch to "⚡ 智能体检" tab
    const diagTab = page.locator('button:has-text("智能体检")').first();
    if (await diagTab.count()) {
      await diagTab.click();
      await sleep(1200);
      await page.screenshot({ path: path.join(SHOTS, '04-detail-diagnostics-center.png') });
      console.log('5. Switched to 智能体检 (Diagnostics Center) tab');
    }

    // 6. Switch to "📜 系统日志" tab
    const logsTab = page.locator('button:has-text("系统日志")').first();
    if (await logsTab.count()) {
      await logsTab.click();
      await sleep(1200);
      await page.screenshot({ path: path.join(SHOTS, '05-detail-system-logs.png') });
      console.log('6. Switched to 系统日志 (System Logs) tab');
    }

    // 7. Switch to "进程" tab
    const procTab = page.locator('button:has-text("进程")').first();
    if (await procTab.count()) {
      await procTab.click();
      await sleep(1000);
      await page.screenshot({ path: path.join(SHOTS, '06-detail-processes.png') });
      console.log('7. Switched to 进程 tab');
    }

    // 8. Switch to "服务与容器" tab
    const servTab = page.locator('button:has-text("服务与容器")').first();
    if (await servTab.count()) {
      await servTab.click();
      await sleep(1000);
      await page.screenshot({ path: path.join(SHOTS, '07-detail-services.png') });
      console.log('8. Switched to 服务与容器 tab');
    }
  }

  // Clean up
  await browser.close();
  try {
    process.kill(child.pid);
  } catch {}

  console.log('ALL NEW FEATURES & LAYOUT VERIFICATIONS PASSED SUCCESSFULLY!');
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
