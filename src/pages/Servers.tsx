import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Server as ServerIcon,
  TerminalSquare,
  FolderOpen,
  Trash2,
  Pencil,
  RefreshCw,
  Loader2,
  LayoutGrid,
  List,
  Activity,
} from 'lucide-react';
import { useApp } from '@/stores/app';
import { StatusDot, Chip, EmptyState, SkeletonRows } from '@/components/Primitives';
import { AddServerDialog } from '@/components/AddServerDialog';
import { PROVIDER_META, STATUS_META, fmtRelative, unwrap, cleanError } from '@/lib/utils';
import type { ServerRecord } from '@/types';

export function ServersPage({ onAdd }: { onAdd?: () => void }) {
  const servers = useApp((s) => s.servers);
  const loading = useApp((s) => s.serversLoading);
  const navigate = useApp((s) => s.navigate);
  const openTerminalTab = useApp((s) => s.openTerminalTab);
  const loadServers = useApp((s) => s.loadServers);
  const toast = useApp((s) => s.toast);

  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [editing, setEditing] = useState<ServerRecord | null>(null);
  const [probing, setProbing] = useState<Set<string>>(new Set());

  const allTags = useMemo(() => {
    const set = new Set<string>();
    servers.forEach((s) => s.tags.forEach((t) => set.add(t)));
    return [...set];
  }, [servers]);

  const filtered = useMemo(() => {
    return servers.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (tagFilter && !s.tags.includes(tagFilter)) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.host.toLowerCase().includes(q) ||
          s.username.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [servers, query, tagFilter, statusFilter]);

  const handleProbe = async (s: ServerRecord) => {
    setProbing((p) => new Set(p).add(s.id));
    try {
      const r = await unwrap(window.nebula.servers.probe(s.id));
      toast({ type: 'success', title: `${s.name} 连接正常`, desc: `延迟 ${r.latencyMs} ms · ${r.os}` });
      await loadServers();
    } catch (e) {
      toast({ type: 'error', title: `${s.name} 连接失败`, desc: cleanError(e) });
      await loadServers();
    } finally {
      setProbing((p) => {
        const n = new Set(p);
        n.delete(s.id);
        return n;
      });
    }
  };

  const handleDelete = async (s: ServerRecord) => {
    if (!confirm(`确定移除「${s.name}」？\n这将删除本地保存的连接信息和凭据，不会影响服务器本身。`)) return;
    try {
      await unwrap(window.nebula.servers.remove(s.id));
      toast({ type: 'success', title: '已移除', desc: s.name });
      await loadServers();
    } catch (e) {
      toast({ type: 'error', title: '移除失败', desc: cleanError(e) });
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 工具栏 */}
      <div
        className="flex items-center gap-2 px-5 h-[52px] shrink-0 border-b"
        style={{ borderColor: 'rgba(16,24,40,0.06)' }}
      >
        <div className="relative flex-1 max-w-[280px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#a8b0bd]" />
          <input
            className="field pl-8"
            style={{ height: 30 }}
            placeholder="搜索名称、IP、标签…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* 状态筛选：滑动指示块 */}
        <div
          className="flex p-[3px] rounded-[8px] relative"
          style={{ background: 'rgba(16,24,40,0.04)', border: '1px solid rgba(16,24,40,0.055)' }}
        >
          {(['all', 'online', 'offline'] as const).map((k) => {
            const active = statusFilter === k;
            const label = k === 'all' ? '全部' : k === 'online' ? '在线' : '离线';
            return (
              <button
                key={k}
                onClick={() => setStatusFilter(k)}
                className="relative px-2.5 h-[24px] rounded-[6px] text-[11px]"
                style={{ color: active ? '#12171f' : '#6b7484', transition: 'color 180ms' }}
              >
                {active && (
                  <motion.div
                    layoutId="status-filter"
                    className="absolute inset-0 rounded-[6px] bg-[rgba(16,24,40,0.09)]"
                    transition={{ type: 'spring', stiffness: 560, damping: 40 }}
                  />
                )}
                <span className="relative">{label}</span>
              </button>
            );
          })}
        </div>

        {/* 标签筛选 */}
        <AnimatePresence>
          {allTags.length > 0 && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="flex items-center gap-1 overflow-hidden"
            >
              {allTags.slice(0, 6).map((t) => (
                <button
                  key={t}
                  onClick={() => setTagFilter(tagFilter === t ? null : t)}
                  className="h-[22px] px-2 rounded-[5px] text-[10.5px] whitespace-nowrap transition-all duration-150"
                  style={{
                    background: tagFilter === t ? 'rgba(15,157,112,0.1)' : 'rgba(16,24,40,0.035)',
                    color: tagFilter === t ? '#0f9d70' : '#6b7484',
                    border: `1px solid ${tagFilter === t ? 'rgba(15,157,112,0.28)' : 'transparent'}`,
                  }}
                >
                  {t}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1" />

        <div
          className="flex p-[3px] rounded-[8px]"
          style={{ background: 'rgba(16,24,40,0.04)', border: '1px solid rgba(16,24,40,0.055)' }}
        >
          {([['table', List], ['grid', LayoutGrid]] as const).map(([k, Icon]) => (
            <button
              key={k}
              onClick={() => setView(k)}
              className="relative w-[26px] h-[24px] rounded-[6px] flex items-center justify-center"
              style={{ color: view === k ? '#12171f' : '#8b94a3', transition: 'color 180ms' }}
            >
              {view === k && (
                <motion.div
                  layoutId="view-toggle"
                  className="absolute inset-0 rounded-[6px] bg-[rgba(16,24,40,0.09)]"
                  transition={{ type: 'spring', stiffness: 560, damping: 40 }}
                />
              )}
              <Icon size={12} className="relative" />
            </button>
          ))}
        </div>

        <button className="btn btn-ghost" onClick={() => void loadServers()} style={{ height: 30 }}>
          <RefreshCw size={12} />
        </button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {loading && servers.length === 0 ? (
          <div className="px-5 py-4">
            <SkeletonRows rows={6} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 grid place-items-center px-5">
            <EmptyState
              icon={<ServerIcon size={22} color="#a8b0bd" />}
              title={servers.length === 0 ? '还没有服务器' : '没有匹配的服务器'}
              desc={
                servers.length === 0
                  ? '添加一台服务器开始管理。支持密码、私钥、SSH Agent 三种认证方式。'
                  : '换个关键词或清除筛选条件试试'
              }
              action={
                servers.length === 0 ? (
                  <button className="btn btn-primary" onClick={onAdd}>
                    添加第一台服务器
                  </button>
                ) : null
              }
            />
          </div>
        ) : view === 'table' ? (
          <>
            <TableView
              servers={filtered}
              probing={probing}
              onOpen={(id) => navigate({ name: 'server', id })}
              onTerminal={(id) => openTerminalTab(id)}
              onEdit={setEditing}
              onDelete={handleDelete}
              onProbe={handleProbe}
            />
            {/* 表格下方收口：行数少时用分布带填满剩余空间 */}
            <DistributionStrip servers={filtered} />
          </>
        ) : (
          <GridView
            servers={filtered}
            onOpen={(id) => navigate({ name: 'server', id })}
            onTerminal={(id) => openTerminalTab(id)}
          />
        )}
      </div>

      {/* 底部状态栏：把剩余高度收口，避免列表短时下方空一大片 */}
      <div
        className="flex items-center gap-4 px-5 h-[34px] shrink-0 border-t text-[11px]"
        style={{ borderColor: 'rgba(16,24,40,0.06)', background: '#fafbfc', color: '#8b94a3' }}
      >
        <span>
          共 <span className="text-[#2c3543] font-medium">{servers.length}</span> 台
          {filtered.length !== servers.length && (
            <span className="text-[#a8b0bd]">（筛选出 {filtered.length} 台）</span>
          )}
        </span>
        <span className="w-px h-3 bg-[rgba(16,24,40,0.09)]" />
        <span className="flex items-center gap-1.5">
          <span className="w-[5px] h-[5px] rounded-full bg-[#0f9d70]" />
          在线 {servers.filter((s) => s.status === 'online').length}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-[5px] h-[5px] rounded-full bg-[#dc2f4b]" />
          离线 {servers.filter((s) => s.status === 'offline').length}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-[5px] h-[5px] rounded-full bg-[#8b94a3]" />
          未知 {servers.filter((s) => s.status === 'unknown').length}
        </span>
        <div className="flex-1" />
        {tagFilter && (
          <button
            onClick={() => setTagFilter(null)}
            className="flex items-center gap-1 px-1.5 h-[20px] rounded-[4px] transition-colors duration-150"
            style={{ background: 'rgba(15,157,112,0.1)', color: '#0f9d70' }}
          >
            #{tagFilter} · 清除
          </button>
        )}
        <span className="font-mono text-[10px] text-[#a8b0bd]">
          每 45 秒自动探测连通性
        </span>
      </div>

      <AddServerDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        editing={
          editing
            ? {
                id: editing.id,
                name: editing.name,
                host: editing.host,
                port: editing.port,
                username: editing.username,
                authMethod: editing.authMethod,
                tags: editing.tags,
                note: editing.note,
              }
            : null
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * 表格下方的分布带。
 * 表格行高不适合强行拉伸（一行 50px 拉到 90px 会很难看），
 * 改为在剩余空间里补一块「按来源 / 按系统」的分布统计，既有信息量又填满屏幕。
 */
function DistributionStrip({ servers }: { servers: ServerRecord[] }) {
  const byOrigin = useMemo(() => {
    const m = new Map<string, number>();
    servers.forEach((s) => m.set(s.origin, (m.get(s.origin) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [servers]);

  const byOs = useMemo(() => {
    const m = new Map<string, number>();
    servers.forEach((s) => {
      // 只取系统族名，避免 "Ubuntu 22.04.4 LTS" / "Ubuntu 24.04" 被拆成两项
      const raw = s.os?.trim();
      if (!raw) return;
      const family = raw.split(/\s+/)[0];
      m.set(family, (m.get(family) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [servers]);

  const total = servers.length || 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="px-5 pb-4 pt-1"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="panel px-4 py-3.5 flex flex-col">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <span className="text-[11.5px] font-medium text-[#2c3543]">按来源分布</span>
            <span className="text-[10px] text-[#a8b0bd]">{servers.length} 台</span>
          </div>
          <div className="flex flex-col gap-3.5">
            {byOrigin.map(([origin, count], i) => {
              const meta = PROVIDER_META[origin] ?? PROVIDER_META.manual;
              return (
                <div key={origin} className="flex items-center gap-3">
                  <span className="text-[11.5px] text-[#5b6473] w-[64px] shrink-0 truncate">
                    {meta.short}
                  </span>
                  <div className="flex-1 h-[7px] rounded-full overflow-hidden" style={{ background: 'rgba(16,24,40,0.06)' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(count / total) * 100}%` }}
                      transition={{ delay: 0.05 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full rounded-full"
                      style={{ background: meta.color }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-[#5b6473] w-[52px] text-right shrink-0">
                    {count}
                    <span className="text-[#c4cad3] ml-1">{Math.round((count / total) * 100)}%</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel px-4 py-3.5 flex flex-col">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <span className="text-[11.5px] font-medium text-[#2c3543]">按系统分布</span>
            <span className="text-[10px] text-[#a8b0bd]">
              {byOs.length > 0 ? `${byOs.length} 类` : '待探测'}
            </span>
          </div>
          {byOs.length === 0 ? (
            <p className="text-[10.5px] text-[#a8b0bd] leading-relaxed">
              还没有探测到操作系统信息。点击行内的「测试连接」即可获取。
            </p>
          ) : (
            <div className="flex flex-col gap-3.5">
              {byOs.map(([os, count], i) => (
                <div key={os} className="flex items-center gap-3">
                  <span className="text-[11.5px] text-[#5b6473] w-[64px] shrink-0 truncate" title={os}>
                    {os}
                  </span>
                  <div className="flex-1 h-[7px] rounded-full overflow-hidden" style={{ background: 'rgba(16,24,40,0.06)' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(count / total) * 100}%` }}
                      transition={{ delay: 0.05 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full rounded-full"
                      style={{ background: '#5b6473' }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-[#5b6473] w-[52px] text-right shrink-0">
                    {count}
                    <span className="text-[#c4cad3] ml-1">{Math.round((count / total) * 100)}%</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function TableView({
  servers,
  probing,
  onOpen,
  onTerminal,
  onEdit,
  onDelete,
  onProbe,
}: {
  servers: ServerRecord[];
  probing: Set<string>;
  onOpen: (id: string) => void;
  onTerminal: (id: string) => void;
  onEdit: (s: ServerRecord) => void;
  onDelete: (s: ServerRecord) => void;
  onProbe: (s: ServerRecord) => void;
}) {
  return (
    <table className="w-full border-collapse">
      <thead className="sticky top-0 z-10" style={{ background: '#fafbfc' }}>
        <tr>
          <th className="th w-8" />
          <th className="th">名称</th>
          <th className="th">地址</th>
          <th className="th">来源</th>
          <th className="th">系统</th>
          <th className="th">延迟</th>
          <th className="th">最近在线</th>
          <th className="th text-right">操作</th>
        </tr>
      </thead>
      <tbody>
        <AnimatePresence initial={false}>
          {servers.map((s, i) => {
            const prov = PROVIDER_META[s.origin] ?? PROVIDER_META.manual;
            const meta = STATUS_META[s.status] ?? STATUS_META.unknown;
            const isProbing = probing.has(s.id);
            return (
              <motion.tr
                key={s.id}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -12, transition: { duration: 0.15 } }}
                transition={{ delay: Math.min(i * 0.025, 0.2), duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="row-interactive group"
                onClick={() => onOpen(s.id)}
              >
                <td className="td">
                  <StatusDot status={s.status} />
                </td>
                <td className="td">
                  <div className="font-medium text-[#12171f] truncate max-w-[180px]">{s.name}</div>
                  {s.tags.length > 0 && (
                    <div className="flex gap-1 mt-0.5">
                      {s.tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-[9.5px] text-[#a8b0bd]">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="td font-mono text-[11.5px] text-[#5b6473]">
                  {s.host}
                  <span className="text-[#a8b0bd]">:{s.port}</span>
                </td>
                <td className="td">
                  <Chip color={prov.color} bg={prov.bg}>
                    {prov.short}
                  </Chip>
                </td>
                <td className="td text-[11.5px] text-[#6b7484] truncate max-w-[160px]">
                  {s.os ?? '—'}
                </td>
                <td className="td font-mono text-[11.5px]">
                  {s.latencyMs ? (
                    <span style={{ color: s.latencyMs < 100 ? '#0f9d70' : s.latencyMs < 300 ? '#b45309' : '#dc2f4b' }}>
                      {s.latencyMs} ms
                    </span>
                  ) : (
                    <span className="text-[#c4cad3]">—</span>
                  )}
                </td>
                <td className="td text-[11.5px] text-[#6b7484]">{fmtRelative(s.lastSeenAt)}</td>
                <td className="td">
                  <div
                    className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <IconBtn title="打开终端" onClick={() => onTerminal(s.id)}>
                      <TerminalSquare size={13} />
                    </IconBtn>
                    <IconBtn title="测试连接" onClick={() => onProbe(s)} disabled={isProbing}>
                      {isProbing ? <Loader2 size={13} className="animate-spin" /> : <Activity size={13} />}
                    </IconBtn>
                    <IconBtn title="编辑" onClick={() => onEdit(s)}>
                      <Pencil size={13} />
                    </IconBtn>
                    <IconBtn title="移除" onClick={() => onDelete(s)} danger>
                      <Trash2 size={13} />
                    </IconBtn>
                  </div>
                </td>
              </motion.tr>
            );
          })}
        </AnimatePresence>
      </tbody>
    </table>
  );
}

function GridView({
  servers,
  onOpen,
  onTerminal,
}: {
  servers: ServerRecord[];
  onOpen: (id: string) => void;
  onTerminal: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3 p-5">
      {servers.map((s, i) => {
        const prov = PROVIDER_META[s.origin] ?? PROVIDER_META.manual;
        return (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.035, 0.25), duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -2 }}
            onClick={() => onOpen(s.id)}
            className="panel px-3.5 py-3 cursor-pointer group relative overflow-hidden"
          >
            <div className="flex items-start justify-between mb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <StatusDot status={s.status} />
                <span className="text-[12.5px] font-medium text-[#12171f] truncate">{s.name}</span>
              </div>
              <Chip color={prov.color} bg={prov.bg}>
                {prov.short}
              </Chip>
            </div>
            <p className="text-[10.5px] font-mono text-[#a8b0bd] mb-2.5 truncate">
              {s.username}@{s.host}:{s.port}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#a8b0bd]">{fmtRelative(s.lastSeenAt)}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTerminal(s.id);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[#8b94a3] hover:text-[#0f9d70] p-1 rounded"
              >
                <TerminalSquare size={12} />
              </button>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-md transition-all duration-150 disabled:opacity-40 ${
        danger
          ? 'text-[#8b94a3] hover:text-[#dc2f4b] hover:bg-[rgba(220,47,75,0.1)]'
          : 'text-[#8b94a3] hover:text-[#12171f] hover:bg-[rgba(16,24,40,0.07)]'
      }`}
    >
      {children}
    </button>
  );
}
