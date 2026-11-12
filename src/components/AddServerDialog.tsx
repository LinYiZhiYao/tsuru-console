import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Server, KeyRound, Lock, Fingerprint, Loader2, Check, X } from 'lucide-react';
import { Modal } from './Modal';
import { useApp } from '@/stores/app';
import { unwrap, cleanError } from '@/lib/utils';
import type { AuthMethod } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 传入则进入编辑模式 */
  editing?: { id: string; name: string; host: string; port: number; username: string; authMethod: AuthMethod; tags: string[]; note?: string } | null;
}

const AUTH_TABS: { key: AuthMethod; label: string; icon: typeof Lock; hint: string }[] = [
  { key: 'password', label: '密码', icon: Lock, hint: '使用登录密码认证' },
  { key: 'privateKey', label: '私钥', icon: KeyRound, hint: '粘贴 PEM / OpenSSH 私钥内容' },
  { key: 'agent', label: 'SSH Agent', icon: Fingerprint, hint: '使用本机 ssh-agent 中已加载的密钥' },
];

export function AddServerDialog({ open, onClose, editing }: Props) {
  const toast = useApp((s) => s.toast);
  const loadServers = useApp((s) => s.loadServers);

  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('root');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('password');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [secretFlags, setSecretFlags] = useState<{
    hasPassword: boolean;
    hasPrivateKey: boolean;
    hasPassphrase: boolean;
  }>({ hasPassword: false, hasPrivateKey: false, hasPassphrase: false });

  // 退场动画期间保持上一次的编辑态文案，避免关闭瞬间标题跳回「添加服务器」
  const lastEditingRef = useRef<Props['editing']>(null);
  if (open) {
    lastEditingRef.current = editing ?? null;
  }
  const displayEditing = open ? editing : lastEditingRef.current;

  /* 打开或切换编辑目标 ID 时重置或填充（仅依赖 editing?.id，防止后台 status 推送重渲染清空表单） */
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setHost(editing.host);
      setPort(String(editing.port));
      setUsername(editing.username);
      setAuthMethod(editing.authMethod);
      setTags(editing.tags);
      setNote(editing.note ?? '');
      // 编辑模式不回填密码 / 私钥（主进程不会把明文送到前端）
      setPassword('');
      setPrivateKey('');
      setPassphrase('');
      void unwrap(window.nebula.servers.secretFlags(editing.id))
        .then((flags) => setSecretFlags(flags))
        .catch(() => setSecretFlags({ hasPassword: false, hasPrivateKey: false, hasPassphrase: false }));
    } else {
      setName('');
      setHost('');
      setPort('22');
      setUsername('root');
      setAuthMethod('password');
      setPassword('');
      setPrivateKey('');
      setPassphrase('');
      setTags([]);
      setNote('');
      setSecretFlags({ hasPassword: false, hasPrivateKey: false, hasPassphrase: false });
    }
    setTestResult(null);
    setTagInput('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const canTest = host.trim() && username.trim() && port && (
    authMethod === 'agent' ||
    (authMethod === 'password' && password) ||
    (authMethod === 'privateKey' && privateKey)
  );

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await unwrap(
        window.nebula.servers.testDraft({
          host: host.trim(),
          port: Number(port) || 22,
          username: username.trim(),
          authMethod,
          password: authMethod === 'password' ? password : undefined,
          privateKey: authMethod === 'privateKey' ? privateKey : undefined,
          passphrase: authMethod === 'privateKey' ? passphrase : undefined,
        }),
      );
      setTestResult({ ok: true, msg: `连接成功（${r.latencyMs} ms）` });
    } catch (e) {
      setTestResult({ ok: false, msg: cleanError(e) });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !host.trim() || !username.trim()) {
      toast({ type: 'error', title: '请填写完整信息', desc: '名称、主机地址、用户名都是必填项' });
      return;
    }
    if (authMethod === 'password' && !password && (!editing || !secretFlags.hasPassword)) {
      toast({ type: 'error', title: '请填写登录密码', desc: '当前认证方式需要提供 SSH 登录密码' });
      return;
    }
    if (authMethod === 'privateKey' && !privateKey.trim() && (!editing || !secretFlags.hasPrivateKey)) {
      toast({ type: 'error', title: '请填写私钥内容', desc: '当前认证方式需要提供 PEM / OpenSSH 私钥' });
      return;
    }
    setSaving(true);
    try {
      const secret =
        authMethod === 'agent'
          ? undefined
          : authMethod === 'password'
            ? { password }
            : { privateKey: privateKey.trim(), passphrase };
      // 编辑模式下若没重新填凭据，就不覆盖原有凭据
      const hasNewSecret =
        authMethod === 'agent'
          ? false
          : authMethod === 'password'
            ? Boolean(password)
            : Boolean(privateKey.trim());

      if (editing) {
        await unwrap(
          window.nebula.servers.update(editing.id, {
            name: name.trim(),
            host: host.trim(),
            port: Number(port) || 22,
            username: username.trim(),
            authMethod,
            tags,
            note,
            secret: hasNewSecret ? secret : undefined,
          }),
        );
        toast({ type: 'success', title: '已保存修改' });
      } else {
        await unwrap(
          window.nebula.servers.create({
            name: name.trim(),
            host: host.trim(),
            port: Number(port) || 22,
            username: username.trim(),
            authMethod,
            tags,
            note,
            secret,
          }),
        );
        toast({ type: 'success', title: '服务器已添加', desc: `${name} · ${host}` });
      }
      await loadServers();
      onClose();
    } catch (e) {
      toast({ type: 'error', title: '保存失败', desc: cleanError(e) });
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={displayEditing ? '编辑服务器' : '添加服务器'}
      subtitle={displayEditing ? '修改连接信息，留空的凭据字段将保持不变' : '手动录入一台可 SSH 访问的服务器'}
      width={580}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-ghost" onClick={handleTest} disabled={!canTest || testing}>
            {testing ? <Loader2 size={13} className="animate-spin" /> : <Server size={13} />}
            {testing ? '测试中…' : '测试连接'}
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            {displayEditing ? '保存修改' : '添加'}
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div>
          <label className="label">显示名称 *</label>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：AWS 东京-Web-01"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-[1fr_88px] gap-2.5">
          <div>
            <label className="label">主机地址 *</label>
            <input
              className="field font-mono"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.10 或 example.com"
            />
          </div>
          <div>
            <label className="label">端口</label>
            <input
              className="field font-mono"
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="22"
            />
          </div>
        </div>

        <div>
          <label className="label">用户名 *</label>
          <input
            className="field font-mono"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="root / ubuntu / ec2-user"
          />
        </div>

        {/* 认证方式切换：滑动指示块 */}
        <div>
          <label className="label">认证方式</label>
          <div
            className="flex p-[3px] rounded-[9px] relative"
            style={{ background: 'rgba(16,24,40,0.045)', border: '1px solid rgba(16,24,40,0.055)' }}
          >
            {AUTH_TABS.map((t) => {
              const active = authMethod === t.key;
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => {
                    setAuthMethod(t.key);
                    setTestResult(null);
                  }}
                  className="relative flex-1 h-[26px] rounded-[7px] flex items-center justify-center gap-1.5 text-[11.5px]"
                  style={{ color: active ? '#12171f' : '#6b7484', transition: 'color 180ms' }}
                >
                  {active && (
                    <motion.div
                      layoutId="auth-tab"
                      className="absolute inset-0 rounded-[7px]"
                      style={{
                        background: 'rgba(15,157,112,0.1)',
                        border: '1px solid rgba(15,157,112,0.28)',
                      }}
                      transition={{ type: 'spring', stiffness: 560, damping: 40 }}
                    />
                  )}
                  <Icon size={12} className="relative" />
                  <span className="relative">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 凭据输入区：高度切换用 AnimatePresence，避免布局突跳。
            initial={false}：弹窗首次打开时直接给终态，别在入场动画里再叠一轮
            height:0→auto 的逐帧重排（软件渲染下会和遮罩一起把帧率打穿）。 */}
        <AnimatePresence mode="wait" initial={false}>
          {authMethod === 'password' && (
            <motion.div
              key="pw"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <label className="label">
                密码 {editing && <span className="text-[#a8b0bd] font-normal">（留空则不修改）</span>}
              </label>
              <input
                className="field"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </motion.div>
          )}

          {authMethod === 'privateKey' && (
            <motion.div
              key="key"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden space-y-2.5"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label mb-0">
                    私钥内容 {editing && <span className="text-[#a8b0bd] font-normal">（留空则不修改）</span>}
                  </label>
                  <span className="text-[10px] text-[#a8b0bd]">PEM / OpenSSH / PKCS#8</span>
                </div>
                <textarea
                  className="field font-mono text-[11px]"
                  rows={6}
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n…\n-----END OPENSSH PRIVATE KEY-----'}
                  spellCheck={false}
                />
              </div>
              <div>
                <label className="label">私钥口令（可选）</label>
                <input
                  className="field"
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="若私钥未加密则留空"
                />
              </div>
            </motion.div>
          )}

          {authMethod === 'agent' && (
            <motion.div
              key="agent"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div
                className="px-3 py-2.5 rounded-[9px] text-[11.5px] leading-relaxed"
                style={{ background: 'rgba(8,145,168,0.07)', border: '1px solid rgba(8,145,168,0.1)', color: '#5b6473' }}
              >
                将使用本机 <span className="font-mono text-[#0891a8]">ssh-agent</span> 中已加载的密钥。
                前提：Windows 上已启动 OpenSSH Authentication Agent 服务，且 <span className="font-mono">ssh-add</span> 添加过私钥。
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 测试结果 */}
        <AnimatePresence initial={false}>
          {testResult && (
            <motion.div
              initial={{ opacity: 0, y: -4, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div
                className="flex items-start gap-2 px-3 py-2 rounded-[9px] text-[11.5px]"
                style={{
                  background: testResult.ok ? 'rgba(15,157,112,0.07)' : 'rgba(220,47,75,0.07)',
                  border: `1px solid ${testResult.ok ? 'rgba(34,201,139,0.22)' : 'rgba(244,63,94,0.22)'}`,
                  color: testResult.ok ? '#0f9d70' : '#dc2f4b',
                }}
              >
                {testResult.ok ? <Check size={13} className="mt-[1px] shrink-0" /> : <X size={13} className="mt-[1px] shrink-0" />}
                <span className="leading-relaxed break-all">{testResult.msg}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 标签 */}
        <div>
          <label className="label">标签（可选，便于分组筛选）</label>
          <div className="flex gap-2">
            <input
              className="field flex-1"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="输入后回车添加，如 生产 / web / 东京"
            />
          </div>
          <AnimatePresence initial={false}>
            {tags.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap gap-1.5 mt-2 overflow-hidden"
              >
                {tags.map((t) => (
                  <motion.span
                    key={t}
                    layout
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.16 }}
                    className="inline-flex items-center gap-1 h-[22px] pl-2 pr-1 rounded-[6px] text-[11px]"
                    style={{ background: 'rgba(15,157,112,0.1)', color: '#0f9d70', border: '1px solid rgba(15,157,112,0.18)' }}
                  >
                    {t}
                    <button
                      onClick={() => setTags(tags.filter((x) => x !== t))}
                      className="hover:bg-[rgba(16,24,40,0.09)] rounded p-0.5 transition-colors duration-150"
                    >
                      <X size={10} />
                    </button>
                  </motion.span>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div>
          <label className="label">备注（可选）</label>
          <textarea
            className="field"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="用途说明"
          />
        </div>
      </div>
    </Modal>
  );
}
