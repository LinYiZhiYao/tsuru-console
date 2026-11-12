import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Cloud,
  RefreshCw,
  Loader2,
  Play,
  Square,
  RotateCw,
  Trash2,
  ServerCog as ServerPlus,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '@/stores/app';
import { Modal } from '@/components/Modal';
import { Chip, EmptyState, StatusDot } from '@/components/Primitives';
import { PROVIDER_META, unwrap, cleanError, fmtDateTime } from '@/lib/utils';
import type { CloudInstance, CloudProvider } from '@/types';

export function CloudPage() {
  const accounts = useApp((s) => s.accounts);
  const accountsLoading = useApp((s) => s.accountsLoading);
  const loadAccounts = useApp((s) => s.loadAccounts);
  const instances = useApp((s) => s.instances);
  const instancesLoading = useApp((s) => s.instancesLoading);
  const syncProgress = useApp((s) => s.syncProgress);
  const loadInstances = useApp((s) => s.loadInstances);
  const toast = useApp((s) => s.toast);
  const loadServers = useApp((s) => s.loadServers);

  const [addOpen, setAddOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [importTarget, setImportTarget] = useState<{ accountId: string; instance: CloudInstance } | null>(null);
  const [powering, setPowering] = useState<string | null>(null);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  // 首次拿到账号后自动展开并拉一次实例，避免页面一进来全是「0 个实例」像坏了
  const autoSynced = useRef(false);
  useEffect(() => {
    if (autoSynced.current || accounts.length === 0) return;
    autoSynced.current = true;
    const ids = accounts.map((a) => a.id);
    setExpanded(new Set(ids));
    for (const id of ids) {
      if (!instances[id]) void loadInstances(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  const toggleExpand = (id: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else {
        n.add(id);
        // 首次展开时自动拉取实例
        if (!instances[id]) void loadInstances(id);
      }
      return n;
    });
  };

  const handlePower = async (
    accountId: string,
    inst: CloudInstance,
    action: 'start' | 'stop' | 'reboot' | 'terminate',
  ) => {
    const labels = { start: '开机', stop: '关机', reboot: '重启', terminate: '销毁' };
    const warn =
      action === 'terminate'
        ? `\n\n⚠️ 销毁实例不可恢复，实例数据将被永久删除。\n\n请确认实例 ID：${inst.instanceId}`
        : '';
    if (!confirm(`确定对「${inst.name}」执行「${labels[action]}」？${warn}`)) return;

    setPowering(inst.instanceId);
    try {
      await unwrap(window.nebula.cloud.power(accountId, inst.instanceId, inst.region, action));
      toast({ type: 'success', title: `${labels[action]}指令已下发`, desc: inst.name });
      // 云平台状态变更需要几秒到几十秒，稍等后重新拉取
      setTimeout(() => void loadInstances(accountId), 3000);
    } catch (e) {
      toast({ type: 'error', title: `${labels[action]}失败`, desc: cleanError(e) });
    } finally {
      setPowering(null);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div
        className="flex items-center justify-between px-5 h-[52px] shrink-0 border-b"
        style={{ borderColor: 'rgba(16,24,40,0.06)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] text-[#8b94a3]">
            {accounts.length ? `${accounts.length} 个云账号` : '尚未接入云账号'}
          </span>
          <AnimatePresence>
            {syncProgress && (
              <motion.span
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                className="flex items-center gap-1.5 text-[11px] text-[#0891a8]"
              >
                <Loader2 size={11} className="animate-spin" />
                {syncProgress}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <button className="btn btn-primary" onClick={() => setAddOpen(true)} style={{ height: 30 }}>
          <Plus size={13} strokeWidth={2.6} />
          接入云账号
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden px-5 py-4">
        {accountsLoading && accounts.length === 0 ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="skeleton h-[64px] rounded-xl" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="h-full grid place-items-center">
            <EmptyState
              icon={<Cloud size={22} color="#a8b0bd" />}
              title="还没有接入云平台"
              desc="填入 AWS AccessKey 或阿里云 AccessKey，即可自动发现该账号下的 ECS/EC2 实例，一键纳入管理。"
              action={
                <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
                  接入第一个云账号
                </button>
              }
            />
          </div>
        ) : (
          <div className="max-w-[1100px] flex flex-col gap-3 h-full min-h-0">
            <div className="grid grid-cols-4 gap-2.5 shrink-0">
              <CloudStat label="云账号" value={String(accounts.length)} />
              <CloudStat
                label="已发现实例"
                value={String(Object.values(instances).reduce((n, l) => n + l.length, 0))}
              />
              <CloudStat
                label="运行中"
                value={String(
                  Object.values(instances)
                    .flat()
                    .filter((x) => isRunning(x.state)).length,
                )}
                color="#0f9d70"
              />
              <CloudStat
                label="已纳管"
                value={String(
                  Object.values(instances)
                    .flat()
                    .filter((x) => x.managed).length,
                )}
                color="#0891a8"
              />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
              {/* 内容高度不足时垂直居中；用 safe center 避免内容溢出后顶部被裁掉 */}
              <div
                className="space-y-2.5 min-h-full flex flex-col"
                style={{ justifyContent: 'safe center' }}
              >
                {accounts.map((acc, i) => {
              const prov = PROVIDER_META[acc.provider] ?? PROVIDER_META.manual;
              const isOpen = expanded.has(acc.id);
              const list = instances[acc.id] ?? [];
              const loading = instancesLoading === acc.id;

              return (
                <motion.div
                  key={acc.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                  className="panel overflow-hidden"
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button onClick={() => toggleExpand(acc.id)} className="text-[#8b94a3] hover:text-[#12171f] transition-colors duration-150">
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <div
                      className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0"
                      style={{ background: prov.bg, border: `1px solid ${prov.color}30` }}
                    >
                      <Cloud size={14} style={{ color: prov.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-[#12171f]">{acc.label}</span>
                        <Chip color={prov.color} bg={prov.bg}>
                          {prov.short}
                        </Chip>
                      </div>
                      <p className="text-[10.5px] text-[#a8b0bd] font-mono mt-0.5">
                        {acc.accessKeyId} · 添加于 {fmtDateTime(acc.createdAt)}
                      </p>
                    </div>

                    {/* 该账号下的实例统计，省去展开后自己数 */}
                    {list.length > 0 && (
                      <div className="flex items-center gap-3 shrink-0 mr-1">
                        <AccountStat
                          label="实例"
                          value={String(list.length)}
                        />
                        <AccountStat
                          label="运行中"
                          value={String(list.filter((x) => isRunning(x.state)).length)}
                          color="#0f9d70"
                        />
                        <AccountStat
                          label="已纳管"
                          value={String(list.filter((x) => x.managed).length)}
                          color="#0891a8"
                        />
                      </div>
                    )}
                    <button
                      className="btn btn-ghost"
                      style={{ height: 27 }}
                      onClick={() => void loadInstances(acc.id)}
                      disabled={loading}
                    >
                      {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                      同步实例
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ height: 27 }}
                      onClick={async () => {
                        try {
                          const msg = await unwrap(window.nebula.cloud.verify(acc.id));
                          toast({ type: 'success', title: '凭据有效', desc: msg });
                        } catch (e) {
                          toast({ type: 'error', title: '凭据验证失败', desc: cleanError(e) });
                        }
                      }}
                    >
                      <ShieldCheck size={11} />
                      验证
                    </button>
                    <button
                      className="btn btn-danger"
                      style={{ height: 27 }}
                      onClick={async () => {
                        if (!confirm(`确定移除云账号「${acc.label}」？\n\n已纳管的服务器记录会保留，不会删除。`)) return;
                        await unwrap(window.nebula.cloud.deleteAccount(acc.id));
                        toast({ type: 'success', title: '已移除云账号' });
                        await loadAccounts();
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                        style={{ borderTop: '1px solid rgba(16,24,40,0.06)' }}
                      >
                        {loading && list.length === 0 ? (
                          <div className="flex items-center justify-center gap-2 py-8 text-[#8b94a3]">
                            <Loader2 size={13} className="animate-spin" />
                            <span className="text-[11.5px]">正在拉取实例列表…</span>
                          </div>
                        ) : list.length === 0 ? (
                          <div className="py-8 text-center text-[11.5px] text-[#a8b0bd]">
                            没有找到实例。可能该账号下确实没有机器，或 AccessKey 缺少 ecs:DescribeInstances 权限。
                          </div>
                        ) : (
                          <table className="w-full border-collapse">
                            <thead>
                              <tr>
                                <th className="th">实例</th>
                                <th className="th">区域</th>
                                <th className="th">规格</th>
                                <th className="th">公网 IP</th>
                                <th className="th">状态</th>
                                <th className="th text-right">操作</th>
                              </tr>
                            </thead>
                            <tbody>
                              {list.map((inst, j) => (
                                <motion.tr
                                  key={inst.instanceId}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ delay: Math.min(j * 0.02, 0.2) }}
                                  className="row-interactive group"
                                >
                                  <td className="td">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[12px] text-[#12171f] truncate max-w-[170px]">{inst.name}</span>
                                      {inst.managed && (
                                        <Chip color="#0f9d70" bg="rgba(15,157,112,0.1)">
                                          已纳管
                                        </Chip>
                                      )}
                                    </div>
                                    <p className="text-[9.5px] text-[#a8b0bd] font-mono mt-0.5">{inst.instanceId}</p>
                                  </td>
                                  <td className="td font-mono text-[11px] text-[#6b7484]">{inst.region}</td>
                                  <td className="td font-mono text-[11px] text-[#6b7484]">{inst.instanceType}</td>
                                  <td className="td font-mono text-[11px] text-[#5b6473]">
                                    {inst.publicIp ?? <span className="text-[#c4cad3]">无公网</span>}
                                  </td>
                                  <td className="td">
                                    <InstanceState state={inst.state} />
                                  </td>
                                  <td className="td">
                                    <div
                                      className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                                    >
                                      {!inst.managed && inst.publicIp && (
                                        <button
                                          onClick={() => setImportTarget({ accountId: acc.id, instance: inst })}
                                          title="纳管这台机器"
                                          className="p-1.5 rounded-md text-[#8b94a3] hover:text-[#0f9d70] hover:bg-[rgba(15,157,112,0.1)] transition-all duration-150"
                                        >
                                          <ServerPlus size={12} />
                                        </button>
                                      )}
                                      <PowerBtn
                                        title="开机"
                                        disabled={powering === inst.instanceId || !isStopped(inst.state)}
                                        onClick={() => void handlePower(acc.id, inst, 'start')}
                                      >
                                        <Play size={11} />
                                      </PowerBtn>
                                      <PowerBtn
                                        title="关机"
                                        disabled={powering === inst.instanceId || !isRunning(inst.state)}
                                        onClick={() => void handlePower(acc.id, inst, 'stop')}
                                      >
                                        <Square size={11} />
                                      </PowerBtn>
                                      <PowerBtn
                                        title="重启"
                                        disabled={powering === inst.instanceId || !isRunning(inst.state)}
                                        onClick={() => void handlePower(acc.id, inst, 'reboot')}
                                      >
                                        <RotateCw size={11} />
                                      </PowerBtn>
                                      <button
                                        title="销毁实例（危险）"
                                        disabled={powering === inst.instanceId}
                                        onClick={() => void handlePower(acc.id, inst, 'terminate')}
                                        className="p-1.5 rounded-md text-[#8b94a3] hover:text-[#dc2f4b] hover:bg-[rgba(220,47,75,0.1)] transition-all duration-150 disabled:opacity-30"
                                      >
                                        <Trash2 size={11} />
                                      </button>
                                    </div>
                                  </td>
                                </motion.tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}</div>
            </div>
          </div>
        )}
      </div>

      <AddCloudDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <ImportInstanceDialog
        target={importTarget}
        onClose={() => setImportTarget(null)}
        onDone={async () => {
          setImportTarget(null);
          await loadServers();
          if (importTarget) await loadInstances(importTarget.accountId);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AccountStat({ label, value, color = '#5b6473' }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-end leading-none">
      <span className="text-[9.5px] text-[#a8b0bd] mb-1">{label}</span>
      <span className="text-[12px] font-mono font-medium" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function CloudStat({ label, value, color = '#12171f' }: { label: string; value: string; color?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      className="panel px-3.5 py-2.5 flex items-center justify-between"
    >
      <span className="text-[10.5px] text-[#8b94a3]">{label}</span>
      <span className="text-[16px] font-semibold font-mono leading-none" style={{ color }}>
        {value}
      </span>
    </motion.div>
  );
}

function isRunning(state: string) {
  return ['running', 'Running'].includes(state);
}
function isStopped(state: string) {
  return ['stopped', 'Stopped'].includes(state);
}

function InstanceState({ state }: { state: string }) {
  const running = isRunning(state);
  const stopped = isStopped(state);
  return (
    <span className="flex items-center gap-1.5 text-[11px]">
      <StatusDot status={running ? 'online' : stopped ? 'offline' : 'connecting'} size={5} />
      <span style={{ color: running ? '#0f9d70' : stopped ? '#6b7484' : '#b45309' }}>
        {running ? '运行中' : stopped ? '已停止' : state}
      </span>
    </span>
  );
}

function PowerBtn({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="p-1.5 rounded-md text-[#8b94a3] hover:text-[#12171f] hover:bg-[rgba(16,24,40,0.07)] transition-all duration-150 disabled:opacity-25 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */

function AddCloudDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const loadAccounts = useApp((s) => s.loadAccounts);
  const toast = useApp((s) => s.toast);

  const [provider, setProvider] = useState<CloudProvider>('aws');
  const [label, setLabel] = useState('');
  const [ak, setAk] = useState('');
  const [sk, setSk] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProvider('aws');
    setLabel('');
    setAk('');
    setSk('');
    setRegion('us-east-1');
    setVerified(null);
  }, [open]);

  useEffect(() => {
    setRegion(provider === 'aws' ? 'us-east-1' : 'cn-hangzhou');
    setVerified(null);
  }, [provider]);

  const handleSubmit = async () => {
    if (!label.trim() || !ak.trim() || !sk.trim()) {
      toast({ type: 'error', title: '请填写完整', desc: '名称、AccessKey ID、Secret 均为必填' });
      return;
    }
    const id = `${provider}-${Date.now()}`;
    setVerifying(true);
    try {
      await unwrap(
        window.nebula.cloud.addAccount({
          id,
          provider,
          label: label.trim(),
          accessKeyId: ak.trim(),
          accessKeySecret: sk.trim(),
          defaultRegion: provider === 'aws' ? region : undefined,
        }),
      );
      // 保存后立刻验证
      const msg = await unwrap(window.nebula.cloud.verify(id));
      setVerified(msg);
      toast({ type: 'success', title: '云账号已接入', desc: msg });
      await loadAccounts();
      setTimeout(onClose, 700);
    } catch (e) {
      toast({ type: 'error', title: '接入失败', desc: cleanError(e) });
      // 验证失败时把已写入的账号删掉，避免留垃圾配置
      try {
        await unwrap(window.nebula.cloud.deleteAccount(id));
      } catch {
        /* ignore */
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="接入云账号"
      subtitle="凭据使用系统加密存储，仅在本机使用"
      width={520}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={verifying}>
            {verifying ? <Loader2 size={13} className="animate-spin" /> : null}
            {verifying ? '验证中…' : '接入并验证'}
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div>
          <label className="label">云平台</label>
          <div
            className="flex p-[3px] rounded-[9px] relative"
            style={{ background: 'rgba(16,24,40,0.045)', border: '1px solid rgba(16,24,40,0.055)' }}
          >
            {(['aws', 'aliyun'] as CloudProvider[]).map((p) => {
              const active = provider === p;
              const meta = PROVIDER_META[p];
              return (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className="relative flex-1 h-[28px] rounded-[7px] text-[12px] flex items-center justify-center gap-1.5"
                  style={{ color: active ? '#12171f' : '#6b7484', transition: 'color 180ms' }}
                >
                  {active && (
                    <motion.div
                      layoutId="cloud-tab"
                      className="absolute inset-0 rounded-[7px]"
                      style={{ background: 'rgba(15,157,112,0.1)', border: '1px solid rgba(15,157,112,0.28)' }}
                      transition={{ type: 'spring', stiffness: 560, damping: 40 }}
                    />
                  )}
                  <span className="w-[6px] h-[6px] rounded-full relative" style={{ background: meta.color }} />
                  <span className="relative">{meta.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="label">账号备注名 *</label>
          <input
            className="field"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={provider === 'aws' ? '例如：生产账号 AWS' : '例如：阿里云-主账号'}
          />
        </div>

        <div>
          <label className="label">AccessKey ID *</label>
          <input
            className="field font-mono"
            value={ak}
            onChange={(e) => setAk(e.target.value)}
            placeholder={provider === 'aws' ? 'AKIA…' : 'LTAI…'}
          />
        </div>

        <div>
          <label className="label">AccessKey Secret *</label>
          <input
            className="field font-mono"
            type="password"
            value={sk}
            onChange={(e) => setSk(e.target.value)}
            placeholder="••••••••••••"
          />
        </div>

        <div>
          <label className="label">
            {provider === 'aws' ? '默认区域（用于凭据校验）' : '默认地域'}
          </label>
          <input
            className="field font-mono"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder={provider === 'aws' ? 'us-east-1' : 'cn-hangzhou'}
          />
          <p className="text-[10.5px] text-[#a8b0bd] mt-1.5 leading-relaxed">
            {provider === 'aws'
              ? '同步时会尝试常见的 7 个区域；若只想同步特定区域，可先写默认区域，之后在设置里调整。'
              : '同步时会调用 DescribeRegions 拿到账号可见的全部地域。'}
          </p>
        </div>

        <div
          className="flex items-start gap-2 px-3 py-2.5 rounded-[9px]"
          style={{ background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.1)' }}
        >
          <AlertTriangle size={12} className="text-[#b45309] mt-[2px] shrink-0" />
          <p className="text-[11px] text-[#92642a] leading-relaxed">
            建议使用最小权限子账号：AWS 需要 <span className="font-mono">ec2:DescribeInstances</span> + 启停权限；
            阿里云需要 <span className="font-mono">ecs:DescribeInstances</span> 等。不要用主账号长期密钥。
          </p>
        </div>

        <AnimatePresence>
          {verified && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-2 rounded-[9px] text-[11.5px]"
                style={{ background: 'rgba(15,157,112,0.07)', border: '1px solid rgba(34,201,139,0.22)', color: '#0f9d70' }}>
                <ShieldCheck size={13} />
                {verified}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function ImportInstanceDialog({
  target,
  onClose,
  onDone,
}: {
  target: { accountId: string; instance: CloudInstance } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useApp((s) => s.toast);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('ubuntu');
  const [port, setPort] = useState('22');
  const [authMethod, setAuthMethod] = useState<'password' | 'privateKey'>('privateKey');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [saving, setSaving] = useState(false);

  // 缓存最近一次非空 target，让 Modal 关闭时完整播放退场动画而不硬切卸载
  const lastTargetRef = useRef<{ accountId: string; instance: CloudInstance } | null>(null);
  if (target) {
    lastTargetRef.current = target;
  }
  const activeTarget = target ?? lastTargetRef.current;

  useEffect(() => {
    if (!target) return;
    setName(target.instance.name);
    // AWS 官方镜像默认 ec2-user，阿里云默认 root
    setUsername(target.instance.provider === 'aws' ? 'ec2-user' : 'root');
    setPort('22');
    setPassword('');
    setPrivateKey('');
    setAuthMethod('privateKey');
  }, [target]);

  const inst = activeTarget?.instance;

  const handleSave = async () => {
    if (!activeTarget || !inst) return;
    if (!username.trim()) {
      toast({ type: 'error', title: '请填写登录用户名' });
      return;
    }
    if (authMethod === 'privateKey' && !privateKey.trim()) {
      toast({ type: 'error', title: '请填写私钥内容', desc: '私钥认证需要粘贴实例对应的 PEM / OpenSSH 私钥' });
      return;
    }
    if (authMethod === 'password' && !password) {
      toast({ type: 'error', title: '请填写登录密码' });
      return;
    }
    setSaving(true);
    try {
      await unwrap(
        window.nebula.cloud.import({
          provider: inst.provider,
          instanceId: inst.instanceId,
          name: name.trim() || inst.name,
          host: inst.publicIp!,
          region: inst.region,
          cloudAccountId: activeTarget.accountId,
          username: username.trim(),
          port: Number(port) || 22,
          authMethod,
          secret: authMethod === 'password' ? { password } : { privateKey: privateKey.trim() },
        }),
      );
      toast({ type: 'success', title: '已纳管', desc: `${name || inst.name} · ${inst.publicIp}` });
      onDone();
    } catch (e) {
      toast({ type: 'error', title: '纳管失败', desc: cleanError(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title="纳管云实例"
      subtitle={inst ? `${inst.name} · ${inst.publicIp} · ${inst.region}` : ''}
      width={500}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <ServerPlus size={13} />}
            加入管理
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div>
          <label className="label">显示名称</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-[1fr_88px] gap-2.5">
          <div>
            <label className="label">登录用户</label>
            <input className="field font-mono" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="label">端口</label>
            <input
              className="field font-mono"
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
        </div>

        <div>
          <label className="label">认证方式</label>
          <div
            className="flex p-[3px] rounded-[9px] relative"
            style={{ background: 'rgba(16,24,40,0.045)', border: '1px solid rgba(16,24,40,0.055)' }}
          >
            {(['privateKey', 'password'] as const).map((m) => {
              const active = authMethod === m;
              return (
                <button
                  key={m}
                  onClick={() => setAuthMethod(m)}
                  className="relative flex-1 h-[26px] rounded-[7px] text-[11.5px]"
                  style={{ color: active ? '#12171f' : '#6b7484', transition: 'color 180ms' }}
                >
                  {active && (
                    <motion.div
                      layoutId="import-auth"
                      className="absolute inset-0 rounded-[7px]"
                      style={{ background: 'rgba(15,157,112,0.1)', border: '1px solid rgba(15,157,112,0.28)' }}
                      transition={{ type: 'spring', stiffness: 560, damping: 40 }}
                    />
                  )}
                  <span className="relative">{m === 'privateKey' ? '私钥' : '密码'}</span>
                </button>
              );
            })}
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {authMethod === 'privateKey' ? (
            <motion.div
              key="k"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <label className="label">私钥内容（创建实例时下载的 .pem）</label>
              <textarea
                className="field font-mono text-[11px]"
                rows={5}
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="-----BEGIN RSA PRIVATE KEY-----"
                spellCheck={false}
              />
            </motion.div>
          ) : (
            <motion.div
              key="p"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <label className="label">密码</label>
              <input
                className="field"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-[10.5px] text-[#a8b0bd] leading-relaxed">
          纳管后可在「服务器」页面对这台实例做 SSH 终端、文件管理、监控采集等全部操作。
        </p>
      </div>
    </Modal>
  );
}
