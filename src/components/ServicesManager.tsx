import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers,
  Box,
  RefreshCw,
  Loader2,
  Play,
  Square,
  RotateCw,
  FileText,
  AlertTriangle,
  Check,
  Copy,
  Terminal,
} from 'lucide-react';
import { useApp } from '@/stores/app';
import { Modal } from '@/components/Modal';
import { unwrap, cleanError } from '@/lib/utils';
import type { ServerRecord, SystemServiceInfo, DockerContainerInfo } from '@/types';

interface Props {
  server: ServerRecord;
}

export function ServicesManager({ server }: Props) {
  const toast = useApp((s) => s.toast);

  const [services, setServices] = useState<SystemServiceInfo[]>([]);
  const [containers, setContainers] = useState<DockerContainerInfo[]>([]);
  const [hasDocker, setHasDocker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'systemd' | 'docker'>('systemd');

  // 日志查看弹窗
  const [logModal, setLogModal] = useState<{ title: string; subtitle: string; content: string } | null>(null);
  const [operatingKey, setOperatingKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    if (server.status === 'offline') return;
    setLoading(true);
    try {
      const [svcRes, docRes] = await Promise.all([
        unwrap(window.nebula.servers.services(server.id)).catch(() => ({ available: false, services: [] })),
        unwrap(window.nebula.servers.dockerContainers(server.id)).catch(() => ({ hasDocker: false, containers: [] })),
      ]);
      setServices(svcRes.services || []);
      setHasDocker(docRes.hasDocker);
      setContainers(docRes.containers || []);
    } catch (e) {
      toast({ type: 'error', title: '加载服务信息失败', desc: cleanError(e) });
    } finally {
      setLoading(false);
    }
  }, [server.id, server.status, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleServiceAction = async (svc: SystemServiceInfo, action: 'start' | 'stop' | 'restart' | 'logs') => {
    setOperatingKey(`svc-${svc.name}-${action}`);
    try {
      const r = await unwrap(window.nebula.servers.manageService(server.id, svc.name, action));
      if (action === 'logs') {
        setLogModal({
          title: `服务日志 · ${svc.name}`,
          subtitle: `journalctl -u ${svc.name} -n 35`,
          content: r.message,
        });
      } else {
        toast({ type: r.ok ? 'success' : 'error', title: `${svc.name} ${action} 完成` });
        setTimeout(() => void loadData(), 800);
      }
    } catch (e) {
      toast({ type: 'error', title: '操作失败', desc: cleanError(e) });
    } finally {
      setOperatingKey(null);
    }
  };

  const handleDockerAction = async (c: DockerContainerInfo, action: 'start' | 'stop' | 'restart' | 'logs') => {
    setOperatingKey(`doc-${c.id}-${action}`);
    try {
      const r = await unwrap(window.nebula.servers.manageDocker(server.id, c.id, action));
      if (action === 'logs') {
        setLogModal({
          title: `容器日志 · ${c.names || c.id.slice(0, 12)}`,
          subtitle: `docker logs --tail 40 ${c.names || c.id}`,
          content: r.message,
        });
      } else {
        toast({ type: r.ok ? 'success' : 'error', title: `${c.names || c.id.slice(0, 8)} ${action} 完成` });
        setTimeout(() => void loadData(), 800);
      }
    } catch (e) {
      toast({ type: 'error', title: '操作失败', desc: cleanError(e) });
    } finally {
      setOperatingKey(null);
    }
  };

  return (
    <div className="h-full flex flex-col p-5 overflow-hidden">
      {/* 顶栏控制 */}
      <div className="flex items-center justify-between mb-3.5 shrink-0">
        <div
          className="flex p-[3px] rounded-[9px]"
          style={{ background: 'rgba(16,24,40,0.04)', border: '1px solid rgba(16,24,40,0.055)' }}
        >
          <button
            onClick={() => setActiveSubTab('systemd')}
            className="flex items-center gap-1.5 px-3 h-[26px] rounded-[7px] text-[11.5px] transition-all duration-150"
            style={{
              color: activeSubTab === 'systemd' ? '#12171f' : '#6b7484',
              background: activeSubTab === 'systemd' ? '#ffffff' : 'transparent',
              fontWeight: activeSubTab === 'systemd' ? 550 : 450,
              boxShadow: activeSubTab === 'systemd' ? '0 1px 3px rgba(16,24,40,0.08)' : 'none',
            }}
          >
            <Layers size={12} className={activeSubTab === 'systemd' ? 'text-[#0f9d70]' : ''} />
            <span>核心系统服务 ({services.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('docker')}
            className="flex items-center gap-1.5 px-3 h-[26px] rounded-[7px] text-[11.5px] transition-all duration-150"
            style={{
              color: activeSubTab === 'docker' ? '#12171f' : '#6b7484',
              background: activeSubTab === 'docker' ? '#ffffff' : 'transparent',
              fontWeight: activeSubTab === 'docker' ? 550 : 450,
              boxShadow: activeSubTab === 'docker' ? '0 1px 3px rgba(16,24,40,0.08)' : 'none',
            }}
          >
            <Box size={12} className={activeSubTab === 'docker' ? 'text-[#0891a8]' : ''} />
            <span>Docker 容器 {hasDocker ? `(${containers.length})` : '(未检测到)'}</span>
          </button>
        </div>

        <button
          className="btn btn-ghost"
          style={{ height: 30 }}
          onClick={() => void loadData()}
          disabled={loading || server.status === 'offline'}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          刷新
        </button>
      </div>

      {/* 内容卡片区 */}
      <div className="flex-1 min-h-0 panel overflow-hidden flex flex-col">
        {server.status === 'offline' ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <AlertTriangle size={24} className="text-[#a8b0bd] mb-2" />
            <p className="text-[13px] font-medium text-[#12171f]">服务器离线中</p>
            <p className="text-[11px] text-[#8b94a3] mt-1">请先保证主机连通性</p>
          </div>
        ) : loading && services.length === 0 && containers.length === 0 ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-[#8b94a3]">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-[12px]">正在读取服务与容器状态…</span>
          </div>
        ) : activeSubTab === 'systemd' ? (
          /* Systemd 服务列表 */
          <div className="flex-1 min-h-0 overflow-y-auto">
            {services.length === 0 ? (
              <div className="py-12 text-center text-[12px] text-[#a8b0bd]">
                没有检测到常见核心服务（或该主机未使用 Systemd）
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10" style={{ background: '#fafbfc' }}>
                  <tr>
                    <th className="th w-[180px]">服务名</th>
                    <th className="th w-[110px]">运行状态</th>
                    <th className="th w-[100px]">加载状态</th>
                    <th className="th">描述信息</th>
                    <th className="th text-right w-[180px]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((svc) => {
                    const isActive = svc.active === 'active';
                    const isFailed = svc.active === 'failed';
                    return (
                      <tr key={svc.name} className="row-interactive group">
                        <td className="td font-mono font-medium text-[12px] text-[#12171f]">
                          {svc.name}.service
                        </td>
                        <td className="td">
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-medium font-mono"
                            style={{
                              background: isActive ? 'rgba(15,157,112,0.1)' : isFailed ? 'rgba(220,47,75,0.1)' : 'rgba(16,24,40,0.05)',
                              color: isActive ? '#0f9d70' : isFailed ? '#dc2f4b' : '#8b94a3',
                            }}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isActive ? 'bg-[#0f9d70] animate-pulse' : isFailed ? 'bg-[#dc2f4b]' : 'bg-[#a8b0bd]'
                              }`}
                            />
                            {svc.active} ({svc.sub})
                          </span>
                        </td>
                        <td className="td text-[11px] text-[#6b7484] font-mono">
                          {svc.load}
                        </td>
                        <td className="td text-[11.5px] text-[#5b6473] truncate max-w-[360px]" title={svc.description}>
                          {svc.description}
                        </td>
                        <td className="td text-right">
                          <div
                            className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => void handleServiceAction(svc, 'restart')}
                              disabled={operatingKey !== null}
                              className="px-2 py-1 rounded text-[10.5px] text-[#5b6473] hover:text-[#0f9d70] hover:bg-[rgba(15,157,112,0.1)] transition-colors flex items-center gap-1"
                              title="重启服务"
                            >
                              <RotateCw size={11} className={operatingKey === `svc-${svc.name}-restart` ? 'animate-spin' : ''} />
                              重启
                            </button>
                            {isActive ? (
                              <button
                                onClick={() => void handleServiceAction(svc, 'stop')}
                                disabled={operatingKey !== null}
                                className="px-2 py-1 rounded text-[10.5px] text-[#5b6473] hover:text-[#dc2f4b] hover:bg-[rgba(220,47,75,0.1)] transition-colors"
                              >
                                停止
                              </button>
                            ) : (
                              <button
                                onClick={() => void handleServiceAction(svc, 'start')}
                                disabled={operatingKey !== null}
                                className="px-2 py-1 rounded text-[10.5px] text-[#0f9d70] hover:bg-[rgba(15,157,112,0.1)] transition-colors"
                              >
                                启动
                              </button>
                            )}
                            <button
                              onClick={() => void handleServiceAction(svc, 'logs')}
                              disabled={operatingKey !== null}
                              className="p-1 rounded text-[#8b94a3] hover:text-[#12171f] hover:bg-[rgba(16,24,40,0.06)] transition-colors"
                              title="查看最近日志"
                            >
                              <FileText size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          /* Docker 容器列表 */
          <div className="flex-1 min-h-0 overflow-y-auto">
            {!hasDocker ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <Box size={28} className="text-[#c4cad3] mb-2" />
                <p className="text-[13px] font-medium text-[#12171f]">当前主机未检测到 Docker 环境</p>
                <p className="text-[11px] text-[#8b94a3] mt-1">若已安装，请确保 docker 命令在 PATH 中且具有调用权限</p>
              </div>
            ) : containers.length === 0 ? (
              <div className="py-12 text-center text-[12px] text-[#a8b0bd]">
                未运行或创建任何 Docker 容器
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10" style={{ background: '#fafbfc' }}>
                  <tr>
                    <th className="th w-[160px]">容器名</th>
                    <th className="th w-[110px]">状态</th>
                    <th className="th w-[200px]">镜像 Image</th>
                    <th className="th">端口映射 Ports</th>
                    <th className="th text-right w-[180px]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {containers.map((c) => {
                    const isUp = c.status.toLowerCase().includes('up');
                    return (
                      <tr key={c.id} className="row-interactive group">
                        <td className="td">
                          <span className="font-medium text-[12px] text-[#12171f] truncate block">
                            {c.names}
                          </span>
                          <span className="text-[9.5px] font-mono text-[#a8b0bd]">
                            {c.id.slice(0, 12)}
                          </span>
                        </td>
                        <td className="td">
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-medium"
                            style={{
                              background: isUp ? 'rgba(15,157,112,0.1)' : 'rgba(16,24,40,0.06)',
                              color: isUp ? '#0f9d70' : '#8b94a3',
                            }}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isUp ? 'bg-[#0f9d70] animate-pulse' : 'bg-[#a8b0bd]'}`} />
                            {c.status}
                          </span>
                        </td>
                        <td className="td font-mono text-[11px] text-[#5b6473] truncate max-w-[200px]" title={c.image}>
                          {c.image}
                        </td>
                        <td className="td font-mono text-[11px] text-[#6b7484] truncate max-w-[280px]" title={c.ports}>
                          {c.ports || '—'}
                        </td>
                        <td className="td text-right">
                          <div
                            className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => void handleDockerAction(c, 'restart')}
                              disabled={operatingKey !== null}
                              className="px-2 py-1 rounded text-[10.5px] text-[#5b6473] hover:text-[#0891a8] hover:bg-[rgba(8,145,168,0.1)] transition-colors flex items-center gap-1"
                              title="重启容器"
                            >
                              <RotateCw size={11} className={operatingKey === `doc-${c.id}-restart` ? 'animate-spin' : ''} />
                              重启
                            </button>
                            {isUp ? (
                              <button
                                onClick={() => void handleDockerAction(c, 'stop')}
                                disabled={operatingKey !== null}
                                className="px-2 py-1 rounded text-[10.5px] text-[#5b6473] hover:text-[#dc2f4b] hover:bg-[rgba(220,47,75,0.1)] transition-colors"
                              >
                                停止
                              </button>
                            ) : (
                              <button
                                onClick={() => void handleDockerAction(c, 'start')}
                                disabled={operatingKey !== null}
                                className="px-2 py-1 rounded text-[10.5px] text-[#0f9d70] hover:bg-[rgba(15,157,112,0.1)] transition-colors"
                              >
                                启动
                              </button>
                            )}
                            <button
                              onClick={() => void handleDockerAction(c, 'logs')}
                              disabled={operatingKey !== null}
                              className="p-1 rounded text-[#8b94a3] hover:text-[#12171f] hover:bg-[rgba(16,24,40,0.06)] transition-colors"
                              title="查看实时日志"
                            >
                              <FileText size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* 日志弹窗 */}
      <Modal
        open={Boolean(logModal)}
        onClose={() => setLogModal(null)}
        title={logModal?.title ?? '日志'}
        subtitle={logModal?.subtitle}
        width={720}
        footer={
          <>
            <button
              className="btn btn-ghost"
              onClick={() => {
                if (!logModal) return;
                void navigator.clipboard.writeText(logModal.content);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check size={12} className="text-[#0f9d70]" /> : <Copy size={12} />}
              {copied ? '已复制' : '复制日志'}
            </button>
            <button className="btn btn-primary" onClick={() => setLogModal(null)}>
              关闭
            </button>
          </>
        }
      >
        <div
          className="p-3.5 rounded-xl font-mono text-[11px] leading-relaxed max-h-[52vh] overflow-auto select-text whitespace-pre"
          style={{ background: '#0e131b', color: '#88e7b9', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {logModal?.content}
        </div>
      </Modal>
    </div>
  );
}
