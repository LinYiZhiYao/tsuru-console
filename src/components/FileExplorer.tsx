import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder,
  File as FileIcon,
  ChevronRight,
  ArrowUp,
  RefreshCw,
  Loader2,
  Home,
  Trash2,
  FolderPlus,
  Download,
  Eye,
  X,
  Save,
} from 'lucide-react';
import { useApp } from '@/stores/app';
import { Modal } from './Modal';
import { unwrap, cleanError, fmtBytes, fmtDateTime } from '@/lib/utils';
import type { RemoteFileEntry } from '@/types';

/**
 * 远端文件浏览器。
 * 只做 SFTP 允许的基本操作：浏览、删除、建目录、查看/编辑文本、下载。
 * 刻意不做「一键删目录」的递归删除 —— 远端数据不可逆，宁可让用户去终端里显式操作。
 */
export function FileExplorer({ serverId }: { serverId: string }) {
  const toast = useApp((s) => s.toast);

  const [cwd, setCwd] = useState<string>('');
  const [entries, setEntries] = useState<RemoteFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ path: string; content: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [mkdirName, setMkdirName] = useState('');
  const [mkdirSaving, setMkdirSaving] = useState(false);

  /** 用 ref 持有 loadDir，避免初始化 effect 依赖循环 */
  const loadDirRef = useRef<(p: string) => Promise<void>>(async () => {});

  /* 首次进入：定位家目录，拿到路径后立刻加载该目录 */
  useEffect(() => {
    (async () => {
      let home = '/';
      try {
        home = (await unwrap(window.nebula.files.home(serverId))) || '/';
      } catch (e) {
        toast({ type: 'error', title: '无法读取家目录', desc: cleanError(e) });
      }
      setCwd(home);
      await loadDirRef.current(home);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  const loadDir = useCallback(
    async (p: string) => {
      if (!p) return;
      setLoading(true);
      try {
        const list = await unwrap(window.nebula.files.list(serverId, p));
        setEntries(list);
        setCwd(p);
        setSelected(null);
      } catch (e) {
        toast({ type: 'error', title: '读取目录失败', desc: cleanError(e) });
      } finally {
        setLoading(false);
      }
    },
    [serverId, toast],
  );

  /* 让 ref 始终指向最新的 loadDir */
  useEffect(() => {
    loadDirRef.current = loadDir;
  }, [loadDir]);

  const parent = cwd === '/' ? '/' : cwd.replace(/\/[^/]+\/?$/, '') || '/';
  const crumbs = cwd.split('/').filter(Boolean);

  const handleOpen = (e: RemoteFileEntry) => {
    if (e.isDir) void loadDir(e.path);
    else void openEditor(e);
  };

  const openEditor = async (e: RemoteFileEntry) => {
    if (e.size > 1024 * 1024) {
      toast({ type: 'warn', title: '文件过大', desc: '超过 1 MB 的文件不支持内置编辑，请用终端处理' });
      return;
    }
    setBusy(e.path);
    try {
      const content = await unwrap(window.nebula.files.read(serverId, e.path));
      setEditing({ path: e.path, content });
    } catch (err) {
      toast({ type: 'error', title: '读取文件失败', desc: cleanError(err) });
    } finally {
      setBusy(null);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await unwrap(window.nebula.files.write(serverId, editing.path, editing.content));
      toast({ type: 'success', title: '已保存', desc: editing.path });
      setEditing(null);
      await loadDir(cwd);
    } catch (e) {
      toast({ type: 'error', title: '保存失败', desc: cleanError(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: RemoteFileEntry) => {
    if (!confirm(`确定删除「${e.name}」？\n\n路径：${e.path}\n\n此操作不可撤销。`)) return;
    setBusy(e.path);
    try {
      await unwrap(window.nebula.files.remove(serverId, e.path, e.isDir));
      toast({ type: 'success', title: '已删除', desc: e.name });
      await loadDir(cwd);
    } catch (err) {
      toast({
        type: 'error',
        title: '删除失败',
        desc: cleanError(err) + (e.isDir ? '（目录非空时无法删除，请用终端 rm -rf）' : ''),
      });
    } finally {
      setBusy(null);
    }
  };

  const handleMkdir = () => {
    setMkdirName('');
    setMkdirOpen(true);
  };

  const submitMkdir = async () => {
    const name = mkdirName.trim();
    if (!name) {
      toast({ type: 'warn', title: '请输入目录名称' });
      return;
    }
    if (name.includes('/') || name === '.' || name === '..') {
      toast({ type: 'error', title: '目录名称不合法', desc: '不能包含 / 或使用 . / ..' });
      return;
    }
    setMkdirSaving(true);
    try {
      await unwrap(window.nebula.files.mkdir(serverId, `${cwd === '/' ? '' : cwd}/${name}`));
      toast({ type: 'success', title: '目录已创建', desc: name });
      setMkdirOpen(false);
      await loadDir(cwd);
    } catch (e) {
      toast({ type: 'error', title: '创建失败', desc: cleanError(e) });
    } finally {
      setMkdirSaving(false);
    }
  };

  const handleDownload = async (e: RemoteFileEntry) => {
    // Electron 里没有浏览器的保存对话框，用 input 拿不到远端文件；
    // 这里把文件下载到用户数据目录下的 downloads 子目录，然后提示打开所在文件夹
    setBusy(e.path);
    try {
      const sep = navigator.userAgent.includes('Windows') ? '\\' : '/';
      const info = await unwrap(window.nebula.app.info());
      const localPath = `${info.userDataPath}${sep}downloads${sep}${e.name}`;
      await unwrap(window.nebula.files.download(serverId, e.path, localPath));
      toast({ type: 'success', title: '已下载', desc: localPath });
      void window.nebula.app.showItemInFolder(localPath);
    } catch (err) {
      toast({ type: 'error', title: '下载失败', desc: cleanError(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 路径栏 */}
      <div
        className="flex items-center gap-1.5 px-3 h-[38px] shrink-0 border-b"
        style={{ borderColor: 'rgba(16,24,40,0.045)' }}
      >
        <button
          onClick={() => void loadDir(parent)}
          disabled={cwd === '/'}
          className="p-1.5 rounded-md text-[#8b94a3] hover:text-[#12171f] hover:bg-[rgba(16,24,40,0.06)] transition-all duration-150 disabled:opacity-30"
          title="上级目录"
        >
          <ArrowUp size={13} />
        </button>
        <button
          onClick={async () => {
            try {
              const home = await unwrap(window.nebula.files.home(serverId));
              await loadDir(home || '/');
            } catch {
              await loadDir('/');
            }
          }}
          className="p-1.5 rounded-md text-[#8b94a3] hover:text-[#12171f] hover:bg-[rgba(16,24,40,0.06)] transition-all duration-150"
          title="家目录"
        >
          <Home size={13} />
        </button>

        {/* 面包屑 */}
        <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto">
          <button
            onClick={() => void loadDir('/')}
            className="text-[11.5px] text-[#6b7484] hover:text-[#0f9d70] px-1 py-0.5 rounded transition-colors duration-150 shrink-0 font-mono"
          >
            /
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center shrink-0">
              <ChevronRight size={10} className="text-[#c4cad3]" />
              <button
                onClick={() => void loadDir('/' + crumbs.slice(0, i + 1).join('/'))}
                className="text-[11.5px] px-1 py-0.5 rounded font-mono transition-colors duration-150"
                style={{ color: i === crumbs.length - 1 ? '#12171f' : '#6b7484' }}
              >
                {c}
              </button>
            </span>
          ))}
        </div>

        <button
          onClick={() => void loadDir(cwd)}
          className="p-1.5 rounded-md text-[#8b94a3] hover:text-[#12171f] hover:bg-[rgba(16,24,40,0.06)] transition-all duration-150"
          title="刷新"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={handleMkdir}
          className="p-1.5 rounded-md text-[#8b94a3] hover:text-[#12171f] hover:bg-[rgba(16,24,40,0.06)] transition-all duration-150"
          title="新建目录"
        >
          <FolderPlus size={13} />
        </button>
      </div>

      {/* 文件列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-[#8b94a3]">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-[11.5px]">读取中…</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Folder size={20} className="text-[#c4cad3]" />
            <p className="text-[11.5px] text-[#a8b0bd]">空目录</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0" style={{ background: '#fafbfc' }}>
              <tr>
                <th className="th">名称</th>
                <th className="th w-[90px]">大小</th>
                <th className="th w-[110px]">权限</th>
                <th className="th w-[150px]">修改时间</th>
                <th className="th w-[80px] text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {entries.map((e, i) => (
                  <motion.tr
                    key={e.path}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: Math.min(i * 0.012, 0.18), duration: 0.18 }}
                    onClick={() => handleOpen(e)}
                    className="row-interactive group"
                  >
                    <td className="td">
                      <div className="flex items-center gap-2">
                        {busy === e.path ? (
                          <Loader2 size={13} className="animate-spin text-[#0f9d70] shrink-0" />
                        ) : e.isDir ? (
                          <Folder size={13} className="text-[#0891a8] shrink-0" />
                        ) : (
                          <FileIcon size={13} className="text-[#8b94a3] shrink-0" />
                        )}
                        <span className="text-[12px] truncate" style={{ color: e.isDir ? '#12171f' : '#2c3543' }}>
                          {e.name}
                        </span>
                        {e.isSymlink && <span className="text-[9px] text-[#a8b0bd]">→</span>}
                      </div>
                    </td>
                    <td className="td font-mono text-[11px] text-[#6b7484]">
                      {e.isDir ? '—' : fmtBytes(e.size)}
                    </td>
                    <td className="td font-mono text-[11px] text-[#8b94a3]">{e.mode}</td>
                    <td className="td text-[11px] text-[#8b94a3]">{fmtDateTime(e.mtime)}</td>
                    <td className="td">
                      <div
                        className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        {!e.isDir && (
                          <>
                            <button
                              onClick={() => void openEditor(e)}
                              title="查看/编辑"
                              className="p-1.5 rounded-md text-[#8b94a3] hover:text-[#12171f] hover:bg-[rgba(16,24,40,0.07)] transition-all duration-150"
                            >
                              <Eye size={12} />
                            </button>
                            <button
                              onClick={() => void handleDownload(e)}
                              title="下载"
                              className="p-1.5 rounded-md text-[#8b94a3] hover:text-[#12171f] hover:bg-[rgba(16,24,40,0.07)] transition-all duration-150"
                            >
                              <Download size={12} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => void handleDelete(e)}
                          title="删除"
                          className="p-1.5 rounded-md text-[#8b94a3] hover:text-[#dc2f4b] hover:bg-[rgba(220,47,75,0.1)] transition-all duration-150"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>

      {/* 编辑器抽屉 */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 bottom-0 h-[70%] flex flex-col z-20 rounded-t-2xl overflow-hidden"
            style={{ background: '#fafbfc', borderTop: '1px solid rgba(16,24,40,0.075)', boxShadow: '0 -16px 48px -16px rgba(16,24,40,0.18)' }}
          >
            <div className="flex items-center gap-2 px-4 h-[40px] shrink-0 border-b border-[rgba(16,24,40,0.06)]">
              <FileIcon size={12} className="text-[#8b94a3]" />
              <span className="text-[11.5px] font-mono text-[#2c3543] truncate flex-1">{editing.path}</span>
              <span className="text-[10px] text-[#a8b0bd] font-mono">{editing.content.length} 字符</span>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
                style={{ height: 26, padding: '0 10px' }}
              >
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                保存
              </button>
              <button
                onClick={() => setEditing(null)}
                className="p-1.5 rounded-md text-[#8b94a3] hover:text-[#12171f] hover:bg-[rgba(16,24,40,0.06)] transition-all duration-150"
              >
                <X size={13} />
              </button>
            </div>
            <textarea
              value={editing.content}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              spellCheck={false}
              className="flex-1 w-full p-4 bg-transparent resize-none outline-none text-[#1c222c] font-mono text-[12px] leading-relaxed"
              style={{ tabSize: 2 }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 新建目录弹窗（Electron 禁用 window.prompt，使用统一动画 Modal） */}
      <Modal
        open={mkdirOpen}
        onClose={() => setMkdirOpen(false)}
        title="新建目录"
        subtitle={`将在 ${cwd || '/'} 下创建新文件夹`}
        width={420}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setMkdirOpen(false)}>
              取消
            </button>
            <button className="btn btn-primary" onClick={() => void submitMkdir()} disabled={mkdirSaving}>
              {mkdirSaving ? <Loader2 size={13} className="animate-spin" /> : <FolderPlus size={13} />}
              创建
            </button>
          </>
        }
      >
        <div>
          <label className="label">目录名称</label>
          <input
            className="field font-mono"
            value={mkdirName}
            onChange={(e) => setMkdirName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submitMkdir();
              }
            }}
            placeholder="例如：logs / backup"
            autoFocus
          />
        </div>
      </Modal>
    </div>
  );
}
