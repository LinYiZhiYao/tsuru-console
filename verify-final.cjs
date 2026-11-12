/**
 * 对最终免安装成品做一次真实的运行时验证。
 * 启动 release-final/win-unpacked/Nebula Console.exe，通过 CDP 连上去量布局、主题、
 * 标题栏控制区避让、水平溢出，并截整页 + 标题栏局部放大图。
 *
 * 与 verify-ui.cjs 的区别：那个是托管静态 dist/ + mock window.nebula 的 11 页截图；
 * 这个连的是真正打包后的 Electron 窗口，用真实 preload 注入的 API。
 */
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
// prepare-dist.cjs 每次打包都会换输出目录，这里跟 fix-icon.cjs 一样从 package.json 读，
// 避免验证脚本永远指向旧成品。
const pkg = require('./package.json');
const currentOut = pkg.build.directories.output;
const EXE = [
  path.join(ROOT, currentOut, 'win-unpacked', 'Tsuru Console.exe'),
  path.join(ROOT, currentOut, 'win-unpacked', 'Nebula Console.exe'),
  path.join(ROOT, 'release-app2', 'win-unpacked', 'Nebula Console.exe'),
  path.join(ROOT, 'release-app', 'win-unpacked', 'Nebula Console.exe'),
  path.join(ROOT, 'release-final', 'win-unpacked', 'Nebula Console.exe'),
].find((p) => fs.existsSync(p));
const PORT = 9555;
const SHOTS = path.join(ROOT, 'shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!EXE) throw new Error('找不到成品 exe（release-app / release-final 都没有 win-unpacked）');
  fs.mkdirSync(SHOTS, { recursive: true });

  const child = spawn(EXE, [`--remote-debugging-port=${PORT}`], {
    cwd: path.dirname(EXE),
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, NEBULA_DISABLE_GPU: '1' },
  });
  child.unref();
  console.log('spawned pid:', child.pid);

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
  await sleep(1500); // 等首屏 Framer Motion 入场动画结束

  const info = await page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const buttons = [...document.querySelectorAll('button')];
    const addBtn = buttons.find((b) => (b.textContent || '').includes('添加服务器'));
    const rect = addBtn ? addBtn.getBoundingClientRect() : null;
    const controlZoneStart = window.innerWidth - 138;
    const text = body.innerText || '';
    return {
      title: document.title,
      url: location.href,
      bodyBg: getComputedStyle(body).backgroundColor,
      rootChildren: root ? root.children.length : -1,
      nebulaType: typeof window.nebula,
      buttonCount: buttons.length,
      navWords: ['总览', '服务器', '终端', '云资源', '监控', '告警', '批量', '设置'].filter((w) =>
        text.includes(w),
      ),
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      dpr: window.devicePixelRatio,
      scrollW: de.scrollWidth,
      clientW: de.clientWidth,
      scrollH: de.scrollHeight,
      clientH: de.clientHeight,
      horizontalOverflow: de.scrollWidth > de.clientWidth,
      addBtnRight: rect ? Math.round(rect.right) : null,
      controlZoneStart,
      overlapsControlZone: rect ? rect.right > controlZoneStart : null,
      textSample: text.slice(0, 220).replace(/\n/g, ' | '),
    };
  });

  console.log('\n=== 运行时验证 ===');
  console.log(JSON.stringify(info, null, 2));

  const shotFull = path.join(SHOTS, 'final-verified.png');
  const shotTitle = path.join(SHOTS, 'final-titlebar-2x.png');
  await page.screenshot({ path: shotFull });
  await page.screenshot({
    path: shotTitle,
    clip: { x: 0, y: 0, width: Math.min(info.innerWidth, 1480), height: 60 },
    scale: 'device',
  });
  console.log('\nscreenshots:', shotFull, shotTitle);

  const report = { ...info, at: new Date().toISOString(), screenshots: [shotFull, shotTitle] };
  fs.writeFileSync(path.join(SHOTS, 'final-verify.json'), JSON.stringify(report, null, 2));

  // Browser.close 会真正走 Electron 的退出流程（顺带验证 cleanup guard），
  // 比 taskkill 更干净，不会留下子进程。
  try {
    const session = await browser.newBrowserCDPSession();
    await session.send('Browser.close');
    console.log('Browser.close sent');
  } catch (e) {
    console.warn('Browser.close 失败（可手动关闭窗口）:', e.message);
  }
}

main().catch((e) => {
  console.error('verify-final failed:', e);
  process.exitCode = 1;
});
