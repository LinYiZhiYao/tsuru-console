import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, AlertCircle, Maximize2 } from 'lucide-react';
import { unwrap, cleanError } from '@/lib/utils';
import { StatusDot } from './Primitives';

interface TabProps {
  serverId: string;
  serverName: string;
  status: string;
  active: boolean;
  onClose: () => void;
  onTitle?: (title: string) => void;
}

/**
 * 终端配色 —— 故意保持深色。
 * 终端是「代码/日志阅读区」，浅底长时间看会累，也和整个应用的浅色壳形成明确分区。
 * 这里的色值不参与主题切换。
 */
const THEME = {
  background: '#141922',
  foreground: '#d6dce6',
  cursor: '#3ddba1',
  cursorAccent: '#141922',
  selectionBackground: 'rgba(61,219,161,0.26)',
  black: '#2a3242',
  red: '#f2718a',
  green: '#3ddba1',
  yellow: '#f0c04a',
  blue: '#6ba8f5',
  magenta: '#b39cf7',
  cyan: '#4ecfe0',
  white: '#c2cad6',
  brightBlack: '#6b7484',
  brightRed: '#f79bad',
  brightGreen: '#6ee8b5',
  brightYellow: '#f7d67a',
  brightBlue: '#9cc6f9',
  brightMagenta: '#cfc0fb',
  brightCyan: '#84e2ee',
  brightWhite: '#eef1f5',
};

/**
 * 单个终端标签页。
 * 每个标签持有独立的 xterm 实例与 SSH 会话；切换标签时只是隐藏 DOM，
 * 不销毁终端，避免丢失 scrollback 与正在跑的命令。
 */
export function TerminalTab({ serverId, serverName, status, active, onClose, onTitle }: TabProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [state, setState] = useState<'connecting' | 'ready' | 'closed' | 'error'>('connecting');
  const [errMsg, setErrMsg] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [dims, setDims] = useState<{ cols: number; rows: number } | null>(null);

  /* 初始化终端 + 建立 SSH 会话 */
  useEffect(() => {
    if (!hostRef.current) return;
    let disposed = false;
    setState('connecting');
    setErrMsg('');

    const term = new Terminal({
      theme: THEME,
      fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
      fontSize: 12.5,
      lineHeight: 1.35,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 8000,
      allowProposedApi: true,
      convertEol: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(hostRef.current);
    termRef.current = term;
    fitRef.current = fit;

    const resizeSub = term.onResize(({ cols, rows }) => {
      setDims({ cols, rows });
      if (sessionRef.current) {
        void window.nebula.terminal.resize(sessionRef.current, cols, rows);
      }
    });

    term.writeln('\x1b[38;2;78;88;107m正在建立 SSH 连接…\x1b[0m');

    (async () => {
      // 等一帧让容器完成布局，先 fit 出真实行列数再发起 SSH shell 请求
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (disposed) return;
      try {
        fit.fit();
        setDims({ cols: term.cols, rows: term.rows });
      } catch {
        /* ignore */
      }

      try {
        const { sessionId } = await unwrap(
          window.nebula.terminal.open(serverId, term.cols || 80, term.rows || 24),
        );
        if (disposed) {
          void window.nebula.terminal.close(sessionId);
          return;
        }
        sessionRef.current = sessionId;
        setState('ready');
        term.clear();
        try {
          fit.fit();
          setDims({ cols: term.cols, rows: term.rows });
          void window.nebula.terminal.resize(sessionId, term.cols, term.rows);
        } catch {
          /* ignore */
        }
        term.focus();

        // 输入 → 主进程
        term.onData((data) => {
          void window.nebula.terminal.write(sessionId, data);
        });
      } catch (e) {
        if (disposed) return;
        setState('error');
        const msg = cleanError(e);
        setErrMsg(msg);
        term.writeln(`\x1b[38;2;251;113;133m连接失败：${msg}\x1b[0m`);
        term.writeln('');
        term.writeln('\x1b[38;2;78;88;107m请检查：主机地址与端口是否可达、安全组是否放行 22、凭据是否正确。\x1b[0m');
      }
    })();

    /* 输入来源：主进程推送的 SSH 输出 */
    const offData = window.nebula.on('terminal:data', (p: any) => {
      if (p.sessionId === sessionRef.current) term.write(p.data);
    });
    const offExit = window.nebula.on('terminal:exit', (p: any) => {
      if (p.sessionId !== sessionRef.current) return;
      setState('closed');
      term.writeln('');
      term.writeln(
        `\x1b[38;2;98;109;128m—— 会话已结束${p.message ? `：${p.message}` : ''}${
          p.code !== null && p.code !== undefined ? `（退出码 ${p.code}）` : ''
        } ——\x1b[0m`,
      );
      sessionRef.current = null;
    });

    /* 尺寸变化 */
    const ro = new ResizeObserver(() => {
      if (!fitRef.current || !termRef.current) return;
      try {
        fitRef.current.fit();
        setDims({ cols: termRef.current.cols, rows: termRef.current.rows });
        if (sessionRef.current) {
          void window.nebula.terminal.resize(sessionRef.current, termRef.current.cols, termRef.current.rows);
        }
      } catch {
        /* ignore */
      }
    });
    if (hostRef.current) ro.observe(hostRef.current);

    /* 选中即复制 + Ctrl+Shift+V 粘贴（与设置页快捷键说明一致） */
    term.onSelectionChange(() => {
      const sel = term.getSelection();
      if (sel) void navigator.clipboard.writeText(sel).catch(() => {});
    });

    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type === 'keydown' && ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === 'v') {
        ev.preventDefault();
        void navigator.clipboard
          .readText()
          .then((text) => {
            if (text && sessionRef.current) {
              void window.nebula.terminal.write(sessionRef.current, text);
            }
          })
          .catch(() => {});
        return false;
      }
      return true;
    });

    return () => {
      disposed = true;
      resizeSub.dispose();
      ro.disconnect();
      offData();
      offExit();
      if (sessionRef.current) {
        void window.nebula.terminal.close(sessionRef.current);
        sessionRef.current = null;
      }
      term.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, attempt]);

  /* 激活时重建尺寸并聚焦 */
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => {
      try {
        fitRef.current?.fit();
        if (termRef.current) {
          setDims({ cols: termRef.current.cols, rows: termRef.current.rows });
          if (sessionRef.current) {
            void window.nebula.terminal.resize(sessionRef.current, termRef.current.cols, termRef.current.rows);
          }
          termRef.current.focus();
        }
      } catch {
        /* ignore */
      }
    }, 60);
    return () => clearTimeout(t);
  }, [active]);

  const reconnect = useCallback(() => {
    setAttempt((a) => a + 1);
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col" style={{ display: active ? 'flex' : 'none' }}>
      {/* 终端状态条 */}
      <div
        className="flex items-center gap-2 px-3 h-[30px] shrink-0 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.07)', background: '#1a202b' }}
      >
        <StatusDot status={state === 'ready' ? 'online' : state === 'connecting' ? 'connecting' : 'offline'} size={6} />
        <span className="text-[11px] text-[#c2cad6] font-mono">{serverName}</span>
        <span className="text-[10px] text-[#78828f]">
          {state === 'ready' ? '已连接' : state === 'connecting' ? '连接中…' : state === 'closed' ? '已断开' : '连接失败'}
        </span>
        <div className="flex-1" />
        {(state === 'error' || state === 'closed') && (
          <button
            onClick={reconnect}
            className="text-[10.5px] text-[#f0c04a] hover:text-[#f7d67a] transition-colors duration-150"
          >
            重新连接
          </button>
        )}
        <span className="text-[10px] text-[#4d5665] font-mono">
          {dims ? `${dims.cols}×${dims.rows}` : termRef.current ? `${termRef.current.cols}×${termRef.current.rows}` : ''}
        </span>
      </div>

      {/* 终端本体 */}
      <div className="relative flex-1 min-h-0" style={{ background: '#141922' }}>
        <div ref={hostRef} className="absolute inset-0 px-2 py-1.5" />

        {/* 连接中遮罩 */}
        <AnimatePresence>
          {state === 'connecting' && (
            <motion.div
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ background: 'rgba(10,13,20,0.85)' }}
            >
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={18} className="animate-spin text-[#0f9d70]" />
                <p className="text-[11.5px] text-[#8b94a3]">正在握手…</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
