import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FolderOpen,
  Shield,
  Info,
  Database,
  KeyRound,
  ExternalLink,
  Copy,
  Check,
  Server,
  Cloud,
} from 'lucide-react';
import { useApp } from '@/stores/app';
import { unwrap } from '@/lib/utils';
import type { AppInfo } from '@/types/bridge';

export function SettingsPage() {
  const servers = useApp((s) => s.servers);
  const accounts = useApp((s) => s.accounts);
  const toast = useApp((s) => s.toast);

  const [info, setInfo] = useState<AppInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setInfo(await unwrap(window.nebula.app.info()));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const copyPath = async () => {
    if (!info) return;
    await navigator.clipboard.writeText(info.userDataPath);
    setCopied(true);
    toast({ type: 'success', title: '路径已复制' });
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="h-full overflow-y-auto px-5 py-4">
      <div className="max-w-[1180px] grid grid-cols-2 gap-3 items-start">
        {/* 左列 */}
        <div className="space-y-3">
        {/* 数据概览 */}
        <Section title="数据概览" icon={Database}>
          <div className="grid grid-cols-3 gap-2.5">
            <Metric icon={Server} label="服务器" value={String(servers.length)} color="#0f9d70" />
            <Metric icon={Cloud} label="云账号" value={String(accounts.length)} color="#0891a8" />
            <Metric icon={KeyRound} label="已存凭据" value={String(info?.secretCount ?? 0)} color="#7454d8" />
          </div>
        </Section>

        {/* 存储位置 */}
        <Section title="数据存储" icon={FolderOpen}>
          <p className="text-[11.5px] text-[#6b7484] leading-relaxed mb-2.5">
            所有配置与凭据都保存在本机，不上传任何服务器。清除该目录会丢失全部服务器记录。
          </p>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-[8px]"
            style={{ background: 'rgba(16,24,40,0.04)', border: '1px solid rgba(16,24,40,0.055)' }}
          >
            <code className="text-[11px] font-mono text-[#5b6473] flex-1 truncate">
              {info?.userDataPath ?? '加载中…'}
            </code>
            <button
              onClick={copyPath}
              className="p-1 rounded text-[#8b94a3] hover:text-[#12171f] transition-colors duration-150 shrink-0"
              title="复制路径"
            >
              {copied ? <Check size={12} className="text-[#0f9d70]" /> : <Copy size={12} />}
            </button>
            <button
              onClick={() => info && void window.nebula.app.openPath(info.userDataPath)}
              className="p-1 rounded text-[#8b94a3] hover:text-[#12171f] transition-colors duration-150 shrink-0"
              title="在资源管理器中打开"
            >
              <FolderOpen size={12} />
            </button>
          </div>
        </Section>
        </div>

        {/* 右列 */}
        <div className="space-y-3">
        {/* 安全说明 */}
        <Section title="凭据安全" icon={Shield}>
          <div className="space-y-2.5">
            <Bullet>
              SSH 密码、私钥、云平台 AccessKey 保存在本地
              <code className="mx-1 px-1 py-0.5 rounded bg-[rgba(16,24,40,0.06)] text-[10.5px] font-mono text-[#0891a8]">
                vault.bin
              </code>
              ，使用 Windows DPAPI（绑定当前用户账户）加密。
            </Bullet>
            <Bullet>
              前端界面拿不到任何明文凭据，所有 SSH / 云 API 调用都在主进程完成。
            </Bullet>
            <Bullet>
              在别的电脑或用别的 Windows 账户打开本应用，无法解密这些凭据，需要重新录入。
            </Bullet>
            <Bullet tone="warn">
              云平台建议使用最小权限子账号密钥，不要用主账号长期 AccessKey。
            </Bullet>
          </div>
        </Section>

        {/* 关于 */}
        <Section title="关于" icon={Info}>
          <div className="space-y-1.5">
            <Row label="应用" value="Tsuru Console (鹤)" />
            <Row label="版本" value="0.1.0" />
            <Row label="Electron" value={info?.versions.electron ?? '—'} mono />
            <Row label="Node" value={info?.versions.node ?? '—'} mono />
            <Row label="Chromium" value={info?.versions.chrome ?? '—'} mono />
          </div>
          <p className="text-[10.5px] text-[#a8b0bd] mt-3 leading-relaxed">
            Tsuru（鹤）运维控制台。支持多云服务器纳管（AWS / 阿里云）、实时指标监控与告警、
            SSH 终端、SFTP 文件管理、Top 进程实时监控与管理、多机批量运维与快捷指令面板。
          </p>
        </Section>

        {/* 快捷键 */}
        <Section title="快捷键" icon={KeyRound}>
          <div className="space-y-1.5">
            <Row label="全局指令 / 搜索" value="Ctrl + K" mono />
            <Row label="批量执行命令" value="Ctrl + Enter" mono />
            <Row label="关闭弹窗" value="Esc" mono />
            <Row label="终端复制" value="选中即复制" />
            <Row label="终端粘贴" value="Ctrl + Shift + V" mono />
          </div>
        </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Info;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      className="panel px-4 py-3.5"
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon size={12} className="text-[#8b94a3]" />
        <h3 className="text-[12px] font-medium text-[#2c3543]">{title}</h3>
      </div>
      {children}
    </motion.div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="px-3 py-2.5 rounded-[9px]"
      style={{ background: 'rgba(16,24,40,0.025)', border: '1px solid rgba(16,24,40,0.045)' }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={10} style={{ color }} />
        <span className="text-[10px] text-[#8b94a3]">{label}</span>
      </div>
      <p className="text-[18px] font-semibold font-mono text-[#12171f] leading-none">{value}</p>
    </div>
  );
}

function Bullet({ children, tone }: { children: React.ReactNode; tone?: 'warn' }) {
  return (
    <div className="flex items-start gap-2">
      <span
        className="w-[4px] h-[4px] rounded-full mt-[6px] shrink-0"
        style={{ background: tone === 'warn' ? '#d97706' : '#0f9d70' }}
      />
      <p className="text-[11.5px] leading-relaxed" style={{ color: tone === 'warn' ? '#92642a' : '#5b6473' }}>
        {children}
      </p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11.5px] text-[#8b94a3]">{label}</span>
      <span className={`text-[11.5px] text-[#2c3543] ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
