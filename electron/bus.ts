import { BrowserWindow } from 'electron';
import type { AppEventMap } from './types';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null) {
  mainWindow = win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/** 主进程 → 渲染进程的单向推送 */
export function emit<K extends keyof AppEventMap>(channel: K, payload: AppEventMap[K]) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(`evt:${String(channel)}`, payload);
  }
}
