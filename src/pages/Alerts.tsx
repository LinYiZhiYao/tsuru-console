import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Bell, Trash2, Check, Loader2, AlertTriangle, BellOff } from 'lucide-react';
import { useApp } from '@/stores/app';
import { Modal } from '@/components/Modal';
import { EmptyState, Chip, StatusDot } from '@/components/Primitives';
import { unwrap, cleanError, fmtRelative } from '@/lib/utils';
import type { AlertRule, AlertEvent } from '@/types';

const METRIC_LABELS: Record<string, string> = {
  cpu: 'CPU 使用率',
  mem: '内存使用率',
  disk: '磁盘使用率',
  offline: '离线',
};

export function AlertsPage() {
  const servers = useApp((s) => s.servers);
  const alerts = useApp((s) => s.alerts);
  const loadAlerts = useApp((s) => s.loadAlerts);
  const ackAlert = useApp((s) => s.ackAlert);
  const clearAlerts = useApp((s) => s.clearAlerts);
  const toast = useApp((s) => s.toast);

  const [rules, setRules] = useState<AlertRule[]>([]);
  const [tab, setTab] = useState<'rules' | 'events'>('rules');
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadRules = async () => {
    try {
      setRules(await unwrap(window.nebula.metrics.rules()));
    } catch (e) {
      toast({ type: 'error', title: '加载规则失败', desc: cleanError(e) });
    }
  };

  useEffect(() => {
    void loadRules();
    void loadAlerts();
    const t = setInterval(() => void loadAlerts(), 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteRule = async (r: AlertRule) => {
    if (!confirm(`确定删除规则「${r.name}」？`)) return;
    await unwrap(window.nebula.metrics.deleteRule(r.id));
    toast({ type: 'success', title: '规则已删除' });
    await loadRules();
  };

  const handleToggleRule = async (r: AlertRule) => {
    await unwrap(window.nebula.metrics.upsertRule({ ...r, enabled: !r.enabled }));
    await loadRules();
  };

  const unacked = alerts.filter((a) => !a.acknowledged);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div
        className="flex items-center gap-2 px-5 h-[52px] shrink-0 border-b"
        style={{ borderColor: 'rgba(16,24,40,0.06)' }}
      >
        <div
          className="flex p-[3px] rounded-[8px] relative"
          style={{ background: 'rgba(16,24,40,0.04)', border: '1px solid rgba(16,24,40,0.055)' }}
        >
          {([
            ['rules', `规则 ${rules.length}`],
            ['events', `告警记录 ${unacked.length ? `(${unacked.length})` : ''}`],
          ] as const).map(([k, label]) => {
            const active = tab === k;
            return (
              <button
                key={k}
                onClick={() => setTab(k)}
                className="relative px-3 h-[24px] rounded-[6px] text-[11px]"
                style={{ color: active ? '#12171f' : '#6b7484', transition: 'color 180ms' }}
              >
                {active && (
                  <motion.div
                    layoutId="alert-tab"
                    className="absolute inset-0 rounded-[6px] bg-[rgba(16,24,40,0.09)]"
                    transition={{ type: 'spring', stiffness: 560, damping: 40 }}
                  />
                )}
                <span className="relative">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {tab === 'events' && alerts.length > 0 && (
          <button
            className="btn btn-ghost"
            style={{ height: 28 }}
            onClick={async () => {
              if (!confirm('清空全部告警记录？')) return;
              await clearAlerts();
              toast({ type: 'success', title: '已清空告警记录' });
            }}
          >
            <Trash2 size={11} />
            清空记录
          </button>
        )}
        <button
          className="btn btn-primary"
          style={{ height: 30 }}
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus size={13} strokeWidth={2.6} />
          新建规则
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        <AnimatePresence mode="wait">
          {tab === 'rules' ? (
            <motion.div
              key="rules"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="min-h-full flex flex-col justify-center"
            >
              {rules.length === 0 ? (
                <div className="h-full grid place-items-center">
                  <EmptyState
                    icon={<Bell size={22} color="#a8b0bd" />}
                    title="还没有告警规则"
                    desc="给服务器设置阈值规则（如 CPU > 85% 连续 3 次），触发后会在这里记录并弹通知。"
                    action={
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          setEditing(null);
                          setDialogOpen(true);
                        }}
                      >
                        新建规则
                      </button>
                    }
                  />
                </div>
              ) : (
                <div className="w-full max-w-[900px] self-center space-y-2">
                  {/* 规则概览 */}
                  <div className="grid grid-cols-3 gap-2.5 mb-3">
                    <AlertStat label="规则总数" value={String(rules.length)} />
                    <AlertStat
                      label="已启用"
                      value={String(rules.filter((r) => r.enabled).length)}
                      color="#0f9d70"
                    />
                    <AlertStat
                      label="未处理告警"
                      value={String(unacked.length)}
                      color={unacked.length ? '#dc2f4b' : '#0f9d70'}
                    />
                  </div>
                  {rules.map((r, i) => {
                    const server = servers.find((s) => s.id === r.serverId);
                    return (
                      <motion.div
                        key={r.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04, duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        className="panel px-4 py-3 flex items-center gap-3"
                      >
                        <StatusDot status={r.enabled ? 'online' : 'unknown'} size={7} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[12.5px] font-medium text-[#12171f]">{r.name}</span>
                            <Chip color="#6b7484" bg="rgba(16,24,40,0.045)">
                              {METRIC_LABELS[r.metric]}
                              {r.metric !== 'offline' && ` > ${r.threshold}%`}
                            </Chip>
                            {r.consecutive > 1 && (
                              <span className="text-[10px] text-[#a8b0bd]">连续 {r.consecutive} 次</span>
                            )}
                          </div>
                          <p className="text-[10.5px] text-[#a8b0bd] mt-1">
                            {server ? `${server.name} · ${server.host}` : '服务器已移除'}
                          </p>
                        </div>
                        <button
                          onClick={() => void handleToggleRule(r)}
                          className="h-[22px] px-2 rounded-[5px] text-[10.5px] transition-all duration-150"
                          style={{
                            background: r.enabled ? 'rgba(15,157,112,0.1)' : 'rgba(16,24,40,0.045)',
                            color: r.enabled ? '#0f9d70' : '#8b94a3',
                          }}
                        >
                          {r.enabled ? '已启用' : '已停用'}
                        </button>
                        <button
                          onClick={() => {
                            setEditing(r);
                            setDialogOpen(true);
                          }}
                          className="text-[10.5px] text-[#8b94a3] hover:text-[#12171f] px-2 transition-colors duration-150"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => void handleDeleteRule(r)}
                          className="p-1.5 rounded-md text-[#8b94a3] hover:text-[#dc2f4b] hover:bg-[rgba(220,47,75,0.1)] transition-all duration-150"
                        >
                          <Trash2 size={12} />
                        </button>
                      </motion.div>
                    );
                  })}
                  {/* 规则生效说明：既填充下方留白，也解释了「为什么告警没触发」 */}
                  <div
                    className="mt-3 px-3.5 py-3 rounded-[10px]"
                    style={{
                      background: 'rgba(16,24,40,0.018)',
                      border: '1px dashed rgba(16,24,40,0.09)',
                    }}
                  >
                    <p className="text-[10.5px] text-[#8b94a3] leading-relaxed">
                      规则每 15 秒判定一次。为避免指标抖动误报，需要「连续 N 次超过阈值」才会触发；
                      告警触发后同一规则有 5 分钟冷却期，期间不会重复推送。
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="events"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="min-h-full flex flex-col justify-center"
            >
              {alerts.length === 0 ? (
                <div className="h-full grid place-items-center">
                  <EmptyState
                    icon={<BellOff size={22} color="#a8b0bd" />}
                    title="暂无告警记录"
                    desc="一切正常。触发规则后会在此处留痕。"
                  />
                </div>
              ) : (
                <div className="max-w-[900px] space-y-1.5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertStat label="全部记录" value={String(alerts.length)} />
                    <AlertStat label="未处理" value={String(unacked.length)} color={unacked.length ? '#dc2f4b' : '#0f9d70'} />
                    <AlertStat label="已处理" value={String(alerts.length - unacked.length)} />
                  </div>
                  {alerts.map((a, i) => (
                    <EventRow key={a.id} event={a} index={i} onAck={() => void ackAlert(a.id)} />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <RuleDialog
        open={dialogOpen}
        rule={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={async () => {
          setDialogOpen(false);
          await loadRules();
        }}
      />
    </div>
  );
}

function AlertStat({ label, value, color = '#12171f' }: { label: string; value: string; color?: string }) {
  return (
    <div
      className="flex-1 flex items-center justify-between px-3 py-2 rounded-[9px]"
      style={{ background: 'rgba(16,24,40,0.025)', border: '1px solid rgba(16,24,40,0.05)' }}
    >
      <span className="text-[10.5px] text-[#8b94a3]">{label}</span>
      <span className="text-[14px] font-semibold font-mono leading-none" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function EventRow({ event, index, onAck }: { event: AlertEvent; index: number; onAck: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.25), duration: 0.22 }}
      className="flex items-center gap-3 px-3.5 py-2.5 rounded-[9px]"
      style={{
        background: event.acknowledged ? 'rgba(16,24,40,0.015)' : 'rgba(244,63,94,0.05)',
        border: `1px solid ${event.acknowledged ? 'rgba(16,24,40,0.045)' : 'rgba(220,47,75,0.1)'}`,
      }}
    >
      <AlertTriangle
        size={13}
        style={{ color: event.acknowledged ? '#c4cad3' : '#dc2f4b' }}
        className="shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[11.5px] text-[#2c3543] truncate">{event.message}</p>
        <p className="text-[10px] text-[#a8b0bd] font-mono mt-0.5">
          {fmtRelative(event.at)} · 阈值 {event.threshold}%
        </p>
      </div>
      {event.acknowledged ? (
        <span className="text-[10px] text-[#c4cad3] flex items-center gap-1">
          <Check size={10} /> 已处理
        </span>
      ) : (
        <button
          onClick={onAck}
          className="h-[22px] px-2 rounded-[5px] text-[10.5px] transition-all duration-150"
          style={{ background: 'rgba(16,24,40,0.055)', color: '#5b6473' }}
        >
          标为已读
        </button>
      )}
    </motion.div>
  );
}

function RuleDialog({
  open,
  rule,
  onClose,
  onSaved,
}: {
  open: boolean;
  rule: AlertRule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const servers = useApp((s) => s.servers);
  const toast = useApp((s) => s.toast);

  const [name, setName] = useState('');
  const [serverId, setServerId] = useState('');
  const [metric, setMetric] = useState<AlertRule['metric']>('cpu');
  const [threshold, setThreshold] = useState('85');
  const [consecutive, setConsecutive] = useState('3');
  const [saving, setSaving] = useState(false);

  const lastRuleRef = useRef<AlertRule | null>(null);
  if (open) {
    lastRuleRef.current = rule;
  }
  const displayRule = open ? rule : lastRuleRef.current;

  useEffect(() => {
    if (!open) return;
    if (rule) {
      setName(rule.name);
      setServerId(rule.serverId);
      setMetric(rule.metric);
      setThreshold(String(rule.threshold));
      setConsecutive(String(rule.consecutive));
    } else {
      setName('');
      setServerId(servers[0]?.id ?? '');
      setMetric('cpu');
      setThreshold('85');
      setConsecutive('3');
    }
    // 仅在弹窗打开或切换规则 ID 时初始化，防止后台 servers 状态更新重置正在编辑的表单
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule?.id]);

  const handleSave = async () => {
    if (!name.trim() || !serverId) {
      toast({ type: 'error', title: '请填写规则名称并选择服务器' });
      return;
    }
    setSaving(true);
    try {
      await unwrap(
        window.nebula.metrics.upsertRule({
          id: rule?.id ?? `rule-${Date.now()}`,
          name: name.trim(),
          serverId,
          metric,
          threshold: Number(threshold) || 85,
          consecutive: Math.max(1, Number(consecutive) || 1),
          enabled: rule?.enabled ?? true,
          createdAt: rule?.createdAt ?? Date.now(),
        }),
      );
      toast({ type: 'success', title: rule ? '规则已更新' : '规则已创建' });
      onSaved();
    } catch (e) {
      toast({ type: 'error', title: '保存失败', desc: cleanError(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={displayRule ? '编辑告警规则' : '新建告警规则'}
      subtitle="后台每 15 秒采集一次指标，连续命中阈值后触发告警"
      width={480}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            保存
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div>
          <label className="label">规则名称</label>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：Web-01 CPU 过高"
          />
        </div>

        <div>
          <label className="label">目标服务器</label>
          <select
            className="field"
            value={serverId}
            onChange={(e) => setServerId(e.target.value)}
            style={{ cursor: 'pointer' }}
          >
            {servers.length === 0 && <option value="">（没有可用服务器）</option>}
            {servers.map((s) => (
              <option key={s.id} value={s.id} style={{ background: '#ffffff' }}>
                {s.name} · {s.host}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">监控指标</label>
          <div className="grid grid-cols-4 gap-1.5">
            {(['cpu', 'mem', 'disk', 'offline'] as const).map((m) => {
              const active = metric === m;
              return (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className="relative h-[30px] rounded-[7px] text-[11px]"
                  style={{
                    background: active ? 'rgba(15,157,112,0.1)' : 'rgba(16,24,40,0.035)',
                    border: `1px solid ${active ? 'rgba(15,157,112,0.28)' : 'rgba(16,24,40,0.055)'}`,
                    color: active ? '#0f9d70' : '#6b7484',
                    transition: 'all 180ms cubic-bezier(0.22,1,0.36,1)',
                  }}
                >
                  {METRIC_LABELS[m]}
                </button>
              );
            })}
          </div>
        </div>

        <AnimatePresence>
          {metric !== 'offline' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden space-y-3.5"
            >
              <div>
                <label className="label">阈值（%）</label>
                <input
                  className="field font-mono"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="85"
                />
              </div>
              <div>
                <label className="label">连续命中次数</label>
                <input
                  className="field font-mono"
                  value={consecutive}
                  onChange={(e) => setConsecutive(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="3"
                />
                <p className="text-[10.5px] text-[#a8b0bd] mt-1.5">
                  连续 N 次采样都超过阈值才告警，避免瞬时抖动误报。采样间隔 15 秒。
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  );
}
