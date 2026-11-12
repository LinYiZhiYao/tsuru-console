import type { Res } from '@/types/bridge';

/** 统一解包 IPC 返回，失败时抛出可读错误 */
export async function unwrap<T>(p: Promise<Res<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

export function fmtBytes(bytes?: number, digits = 1): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export function fmtUptime(sec?: number): string {
  if (!sec || sec <= 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} 天 ${h} 小时`;
  if (h > 0) return `${h} 小时 ${m} 分`;
  return `${m} 分`;
}

export function fmtPercent(v?: number): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—';
  return `${v.toFixed(1)}%`;
}

export function fmtRelative(ts?: number): string {
  if (!ts) return '从未';
  const diff = Date.now() - ts;
  if (diff < 10_000) return '刚刚';
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export function fmtDateTime(ts?: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`;
}

export function fmtTime(ts?: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 状态 → 颜色 / 文案（浅底配色，饱和度比深色版低一档） */
export const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  online: { label: '在线', color: '#0f9d70', bg: 'rgba(15,157,112,0.1)' },
  offline: { label: '离线', color: '#dc2f4b', bg: 'rgba(220,47,75,0.09)' },
  connecting: { label: '连接中', color: '#d97706', bg: 'rgba(217,119,6,0.1)' },
  error: { label: '异常', color: '#dc2f4b', bg: 'rgba(220,47,75,0.09)' },
  unknown: { label: '未知', color: '#8b94a3', bg: 'rgba(139,148,163,0.1)' },
};

/** 云厂商展示信息 */
export const PROVIDER_META: Record<string, { name: string; short: string; color: string; bg: string }> = {
  aws: { name: 'Amazon Web Services', short: 'AWS', color: '#c77700', bg: 'rgba(255,153,0,0.12)' },
  aliyun: { name: '阿里云', short: '阿里云', color: '#d45f00', bg: 'rgba(255,106,0,0.11)' },
  tencent: { name: '腾讯云', short: '腾讯云', color: '#0084cc', bg: 'rgba(0,164,255,0.11)' },
  azure: { name: 'Microsoft Azure', short: 'Azure', color: '#0069b4', bg: 'rgba(0,120,212,0.1)' },
  manual: { name: '手动添加', short: '手动', color: '#5b6473', bg: 'rgba(91,100,115,0.09)' },
};

/** 简化 SSH 错误信息 */
export function cleanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('All configured authentication methods failed')) {
    return '认证失败：用户名、密码或密钥不正确';
  }
  if (msg.includes('ECONNREFUSED')) return '连接被拒绝：端口未开放或 SSH 服务未启动';
  if (msg.includes('ETIMEDOUT') || msg.includes('连接超时')) return '连接超时：检查主机地址、端口与安全组';
  if (msg.includes('ENOTFOUND')) return '主机地址解析失败：域名不存在';
  if (msg.includes('EHOSTUNREACH')) return '主机不可达：网络不通';
  if (msg.includes('Cannot parse privateKey')) return '私钥格式无法解析，请确认是 PEM/OpenSSH 格式';
  return msg;
}
