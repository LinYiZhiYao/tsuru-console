import { app, BrowserWindow, shell, Menu, nativeTheme } from 'electron';
import path from 'path';
import fs from 'fs';
import { registerIpc } from './ipc';
import { setMainWindow } from './bus';
import { startMonitor, stopMonitor } from './services/monitor';
import { closeAllSessions } from './services/ssh';

/**
 * 是否为开发模式。
 * 注意不能用 `!app.isPackaged` 判断：未打包直接跑 `electron .` 时 isPackaged 也是 false，
 * 这样生产产物永远加载不到。约定：只有显式设置 NEBULA_DEV=1 才连 Vite dev server。
 */
const isDev = process.env.NEBULA_DEV === '1';
const DEV_URL = 'http://localhost:5273';

/**
 * GPU 兼容性处理。
 * 在远程桌面 / ToDesk 虚拟显示 / 部分虚拟机里，Chromium 的 GPU 进程会启动失败，
 * 并在反复重启后 FATAL 退出（"GPU process isn't usable. Goodbye."）。
 * 检测到这种环境时用 SwiftShader 软件渲染兜底 —— 动画依然由合成器 60fps 驱动，
 * 只是没有硬件光栅化，对管理后台这种界面完全够用。
 *
 * 判定方式：
 *   1) 显式环境变量 NEBULA_DISABLE_GPU=1
 *   2) 启动参数带 --disable-gpu
 *   3) 标记文件 .gpu-crashed 存在（上次真的崩过，见下方 onGpuCrash）
 */

/** 崩溃标记路径必须在 app ready 之前算出来，所以不能用 app.getPath（那时还不可用） */
function gpuCrashMarker(): string {
  try {
    return path.join(app.getPath('userData'), '.gpu-crashed');
  } catch {
    return '';
  }
}

function shouldDisableGpu(): boolean {
  if (process.env.NEBULA_DISABLE_GPU === '1') return true;
  if (process.argv.includes('--disable-gpu')) return true;
  const marker = gpuCrashMarker();
  if (marker && fs.existsSync(marker)) return true;
  return false;
}

const gpuDisabled = shouldDisableGpu();
if (gpuDisabled) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('in-process-gpu');
  app.commandLine.appendSwitch('use-gl', 'swiftshader');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('disable-features', 'Vulkan');
}

/**
 * GPU 崩溃自愈。
 * 进程直接 FATAL 退出时来不及写标记，但 Chromium 有时只是「GPU 子进程挂了」，
 * 主进程还能收到 child-process-gone。此时立刻落一个标记文件，
 * 下一次启动就会自动切到软件渲染，用户不用手动加参数。
 */
function installGpuCrashWatch() {
  app.on('child-process-gone', (_e, details) => {
    if (details.type !== 'GPU') return;
    // 正常退出（reason === 'clean-exit'）不算崩溃
    if (details.reason === 'clean-exit') return;
    try {
      const marker = gpuCrashMarker();
      if (!marker) return;
      fs.writeFileSync(
        marker,
        JSON.stringify({ at: new Date().toISOString(), reason: details.reason, code: details.exitCode }, null, 2),
      );
      console.warn('[gpu] GPU 进程异常退出，已记录标记，下次启动将使用软件渲染:', details.reason);
    } catch {
      /* ignore */
    }
  });
}

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    backgroundColor: '#f6f7f9',
    title: 'Tsuru Console',
    // 开发时在项目 build/ 下；打包后随 files 进入 asar，与 dist-electron 同级
    icon: path.join(__dirname, '../build/icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#6b7484',
      // 与 TitleBar 的 h-[52px] 对齐，否则原生按钮会和自定义标题内容垂直错位
      height: 52,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false,
    },
  });

  setMainWindow(win);

  // 首帧渲染完成后再显示，避免白屏闪烁
  win.once('ready-to-show', () => {
    win?.show();
  });

  if (isDev) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 外链走系统浏览器，不在应用内打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => {
    setMainWindow(null);
    win = null;
  });
}

/** 精简菜单：保留复制/粘贴/开发者工具，去掉用不到的默认项 */
function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [{ role: 'quit', label: '退出' }],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// 单实例锁：重复启动时聚焦已有窗口
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    nativeTheme.themeSource = 'light';
    installGpuCrashWatch();
    registerIpc();
    buildMenu();
    createWindow();
    startMonitor();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  /**
   * 统一清理入口。
   * 非 macOS 上 window-all-closed 会调用 app.quit()，进而再触发 before-quit，
   * 所以两个事件都会走到这里 —— 用一次性 guard 保证 stopMonitor / closeAllSessions
   * 只执行一次，避免重复 clearInterval 和重复关闭 SSH 会话。
   *
   * macOS 上关掉所有窗口并不代表退出应用（activate 时还会重新建窗），
   * 因此不在 window-all-closed 里清理；真正的退出统一由 before-quit 收口。
   */
  let cleanedUp = false;
  function cleanupApp() {
    if (cleanedUp) return;
    cleanedUp = true;
    stopMonitor();
    closeAllSessions();
  }

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      cleanupApp();
      app.quit();
    }
  });

  app.on('before-quit', () => {
    cleanupApp();
  });
}
