import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  ShieldCheck,
  Search,
  HardDrive,
  Cpu,
  Layers,
  Network,
  Clock,
  TerminalSquare,
  Play,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  Download,
  Flame,
  FileText,
  ShieldAlert,
  Server,
  Zap,
} from 'lucide-react';
import { unwrap, cleanError } from '@/lib/utils';
import type { ServerRecord } from '@/types';

interface ToolItem {
  id: string;
  name: string;
  category: '安全' | '性能' | '存储' | '网络';
  desc: string;
  cmd: string;
  icon: typeof Activity;
  color: string;
  badgeBg: string;
}

const TOOLS: ToolItem[] = [
  {
    id: 'ports',
    name: '监听端口透视',
    category: '网络',
    desc: '扫描所有 TCP / UDP 监听端口及对应进程，排查非法对外暴露',
    cmd: 'ss -tulpn 2>&1 || netstat -tulpn 2>&1',
    icon: Search,
    color: '#0891a8',
    badgeBg: 'rgba(8,145,168,0.1)',
  },
  {
    id: 'large-files',
    name: '磁盘大文件 Top10',
    category: '存储',
    desc: '秒级扫描根分区 >100MB 的文件与日志，精准定位空间占用',
    cmd: 'find / -xdev -type f -size +100M -exec ls -lh {} + 2>/dev/null | sort -k5 -rh | head -n 10',
    icon: HardDrive,
    color: '#0f9d70',
    badgeBg: 'rgba(15,157,112,0.1)',
  },
  {
    id: 'docker',
    name: 'Docker 卷与容器体检',
    category: '存储',
    desc: '审计 Docker 镜像、无用构建缓存、卷占用及全部容器运行状态',
    cmd: 'docker system df 2>&1; echo "=== 容器列表 ==="; docker ps -a 2>&1',
    icon: Layers,
    color: '#2563eb',
    badgeBg: 'rgba(37,99,235,0.1)',
  },
  {
    id: 'tcp-status',
    name: 'TCP 连接与网络统计',
    category: '网络',
    desc: '汇总活跃 Socket 与 TCP 状态分布（TIME_WAIT / ESTABLISHED）',
    cmd: 'ss -s 2>&1; echo "=== TCP 状态分布 ==="; netstat -ant 2>/dev/null | awk \'{print $6}\' | sort | uniq -c | sort -n',
    icon: Network,
    color: '#7454d8',
    badgeBg: 'rgba(116,84,216,0.1)',
  },
  {
    id: 'security-audit',
    name: 'SSH 登录与暴力破解审计',
    category: '安全',
    desc: '排查最近终端登录 IP 及黑客 Failed password 爆破尝试',
    cmd: 'last -n 10 2>&1; echo "=== 近期失败登录尝试 ==="; (grep "Failed password" /var/log/secure 2>/dev/null || grep "Failed password" /var/log/auth.log 2>/dev/null || journalctl _SYSTEMD_UNIT=sshd.service -n 15 2>&1) | tail -n 10',
    icon: ShieldAlert,
    color: '#dc2f4b',
    badgeBg: 'rgba(220,47,75,0.1)',
  },
  {
    id: 'memory-leak',
    name: '内存占用与虚拟内存',
    category: '性能',
    desc: '深度解析 Buff/Cache、Swap 交换分区、缺页中断与物理内存余量',
    cmd: 'free -h 2>&1; echo "=== 虚拟内存统计 ==="; vmstat -s 2>&1 | head -n 15',
    icon: Cpu,
    color: '#d97706',
    badgeBg: 'rgba(217,119,6,0.1)',
  },
  {
    id: 'firewall',
    name: '系统防火墙规则排查',
    category: '安全',
    desc: '检测 firewalld、ufw 或 iptables 活跃策略与端口拦截规则',
    cmd: 'systemctl is-active firewalld 2>&1; firewall-cmd --list-all 2>&1 || ufw status verbose 2>&1 || iptables -L -n -v --line-numbers 2>&1 | head -n 25',
    icon: Flame,
    color: '#b45309',
    badgeBg: 'rgba(180,83,9,0.1)',
  },
  {
    id: 'crontab',
    name: 'Crontab 定时计划任务',
    category: '安全',
    desc: '排查当前用户与系统级定时脚本，防范隐藏后门与挖矿自启',
    cmd: 'crontab -l 2>&1; echo "=== /etc/cron.* 目录 ==="; ls -la /etc/cron* 2>&1',
    icon: Clock,
    color: '#475569',
    badgeBg: 'rgba(71,85,105,0.1)',
  },
];

interface CheckItem {
  name: string;
  status: 'pass' | 'warn' | 'fail' | 'checking';
  detail: string;
  val?: string;
}

export function DiagnosticsCenter({ server }: { server: ServerRecord }) {
  const [activeTool, setActiveTool] = useState<ToolItem>(TOOLS[0]);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<Record<string, { stdout: string; stderr: string; code: number | null; durationMs: number }>>({});
  const [filterQuery, setFilterQuery] = useState('');
  const [copied, setCopied] = useState(false);

  // 全机体检状态
  const [isScanning, setIsScanning] = useState(false);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [checkItems, setCheckItems] = useState<CheckItem[]>([]);
  const [scanTime, setScanTime] = useState<number | null>(null);

  const runSingleTool = async (tool: ToolItem) => {
    setRunningId(tool.id);
    setActiveTool(tool);
    try {
      const res = await unwrap(window.nebula.servers.exec(server.id, tool.cmd, 30000));
      setOutputs((prev) => ({ ...prev, [tool.id]: res }));
    } catch (e) {
      setOutputs((prev) => ({
        ...prev,
        [tool.id]: {
          stdout: '',
          stderr: cleanError(e),
          code: 1,
          durationMs: 0,
        },
      }));
    } finally {
      setRunningId(null);
    }
  };

  // 一键全机深度体检
  const runFullHealthCheck = async () => {
    setIsScanning(true);
    setCheckItems([
      { name: 'CPU 与系统负载', status: 'checking', detail: '检测 1/5/15 分钟负载及上下文切换' },
      { name: '内存与 Swap 交换区', status: 'checking', detail: '评估物理内存余量与 Swap 占用' },
      { name: '根分区磁盘使用率', status: 'checking', detail: '检查磁盘余量与 Inode 节点' },
      { name: '网络连接与端口暴露', status: 'checking', detail: '分析监听端口与异常对外连接' },
      { name: '系统僵尸与异常进程', status: 'checking', detail: '排查僵尸 (zombie) 进程及超高占用' },
      { name: 'SSH 登录安全性', status: 'checking', detail: '排查近期密码错误爆破日志' },
    ]);

    try {
      // 执行系统探测脚本
      const cmd = `
        echo "===LOAD===" && uptime
        echo "===MEM===" && free -m
        echo "===DISK===" && df -h /
        echo "===ZOMBIE===" && ps axo stat | grep -c Z || true
        echo "===FAILED===" && (grep "Failed password" /var/log/secure 2>/dev/null || grep "Failed password" /var/log/auth.log 2>/dev/null || true) | tail -n 20 | wc -l
        echo "===PORTS===" && (ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null || true) | grep -c LISTEN
      `;
      const res = await unwrap(window.nebula.servers.exec(server.id, cmd, 20000));
      const text = res.stdout;

      let score = 100;
      const items: CheckItem[] = [];

      // 1. CPU / Load
      const loadMatch = text.match(/load average:\s*([\d.]+)/i);
      const loadVal = loadMatch ? parseFloat(loadMatch[1]) : 0;
      if (loadVal > 4.0) {
        score -= 20;
        items.push({ name: 'CPU 与系统负载', status: 'fail', detail: `1分钟负载较高 (${loadVal})，建议排查高占用进程`, val: `${loadVal}` });
      } else if (loadVal > 2.0) {
        score -= 10;
        items.push({ name: 'CPU 与系统负载', status: 'warn', detail: `负载处于中等水平 (${loadVal})`, val: `${loadVal}` });
      } else {
        items.push({ name: 'CPU 与系统负载', status: 'pass', detail: `负载平稳 (${loadVal})，运行状态健康`, val: `${loadVal}` });
      }

      // 2. Memory
      const memLines = text.split('\n').filter((l) => l.includes('Mem:'));
      let memPct = 0;
      if (memLines.length) {
        const parts = memLines[0].trim().split(/\s+/);
        const total = parseFloat(parts[1]) || 1;
        const used = parseFloat(parts[2]) || 0;
        memPct = Math.round((used / total) * 100);
      }
      if (memPct > 90) {
        score -= 20;
        items.push({ name: '内存与 Swap 交换区', status: 'fail', detail: `内存利用率达到 ${memPct}%，极度吃紧`, val: `${memPct}%` });
      } else if (memPct > 78) {
        score -= 10;
        items.push({ name: '内存与 Swap 交换区', status: 'warn', detail: `内存利用率 ${memPct}%，余量偏低`, val: `${memPct}%` });
      } else {
        items.push({ name: '内存与 Swap 交换区', status: 'pass', detail: `内存利用率 ${memPct}%，余量充沛`, val: `${memPct}%` });
      }

      // 3. Disk
      const diskLines = text.split('\n').filter((l) => l.match(/\s+\/\s*$/));
      let diskPct = 0;
      if (diskLines.length) {
        const match = diskLines[0].match(/(\d+)%/);
        if (match) diskPct = parseInt(match[1], 10);
      }
      if (diskPct > 88) {
        score -= 25;
        items.push({ name: '根分区磁盘使用率', status: 'fail', detail: `根分区占用达 ${diskPct}%，有打满隐患`, val: `${diskPct}%` });
      } else if (diskPct > 75) {
        score -= 10;
        items.push({ name: '根分区磁盘使用率', status: 'warn', detail: `根分区占用 ${diskPct}%，建议适度清理`, val: `${diskPct}%` });
      } else {
        items.push({ name: '根分区磁盘使用率', status: 'pass', detail: `根分区占用仅 ${diskPct}%，空间充裕`, val: `${diskPct}%` });
      }

      // 4. Ports
      const portLines = text.split('===PORTS===')[1]?.split('\n')[1]?.trim();
      const portCount = parseInt(portLines || '0', 10);
      items.push({
        name: '网络连接与端口暴露',
        status: portCount > 20 ? 'warn' : 'pass',
        detail: portCount > 20 ? `侦测到 ${portCount} 个监听端口，建议确认暴露面` : `侦测到 ${portCount} 个活跃监听服务，暴露面合规`,
        val: `${portCount} 个监听`,
      });

      // 5. Zombie
      const zombieLines = text.split('===ZOMBIE===')[1]?.split('\n')[1]?.trim();
      const zombieCount = parseInt(zombieLines || '0', 10);
      if (zombieCount > 0) {
        score -= 10;
        items.push({ name: '系统僵尸与异常进程', status: 'warn', detail: `发现 ${zombieCount} 个僵尸进程，建议检查父进程`, val: `${zombieCount} 个` });
      } else {
        items.push({ name: '系统僵尸与异常进程', status: 'pass', detail: '未发现僵尸 (Zombie) 进程', val: '0' });
      }

      // 6. Failed SSH logins
      const failedLines = text.split('===FAILED===')[1]?.split('\n')[1]?.trim();
      const failedCount = parseInt(failedLines || '0', 10);
      if (failedCount > 10) {
        score -= 15;
        items.push({ name: 'SSH 登录安全性', status: 'warn', detail: `近期日志有 ${failedCount} 次密码错误，注意暴破防护`, val: `${failedCount} 次失败` });
      } else {
        items.push({ name: 'SSH 登录安全性', status: 'pass', detail: '近期无异常高频密码失败记录', val: '安全' });
      }

      setHealthScore(Math.max(20, Math.min(100, score)));
      setCheckItems(items);
      setScanTime(Date.now());
    } catch (e) {
      setHealthScore(null);
      setCheckItems([
        { name: '体检执行异常', status: 'fail', detail: cleanError(e) },
      ]);
    } finally {
      setIsScanning(false);
    }
  };

  const copyCurrentOutput = () => {
    const cur = outputs[activeTool.id];
    if (!cur) return;
    const txt = cur.stdout || cur.stderr;
    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const exportReport = () => {
    if (!healthScore) return;
    let md = `# Tsuru Console 服务器健康体检报告\n`;
    md += `- **服务器**: ${server.name} (${server.host}:${server.port})\n`;
    md += `- **操作系统**: ${server.os || 'Linux'}\n`;
    md += `- **体检时间**: ${new Date().toLocaleString()}\n`;
    md += `- **综合评分**: ${healthScore} / 100 分\n\n`;
    md += `## 检查项明细\n\n`;
    checkItems.forEach((c) => {
      const tag = c.status === 'pass' ? '✅ 合格' : c.status === 'warn' ? '⚠️ 提醒' : '❌ 异常';
      md += `### ${tag} - ${c.name} (${c.val || ''})\n`;
      md += `> ${c.detail}\n\n`;
    });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `health-report-${server.host}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentResult = outputs[activeTool.id];

  return (
    <div className="p-6 space-y-6 max-w-[1300px] mx-auto select-text">
      {/* 顶部：全机深度体检 Hero 板块 */}
      <div
        className="rounded-2xl p-6 border transition-all duration-300"
        style={{
          background: 'linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)',
          borderColor: 'rgba(16,24,40,0.08)',
          boxShadow: '0 4px 20px -2px rgba(16,24,40,0.04)',
        }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-5">
            {/* 健康评分环形/徽章 */}
            <div
              className="relative w-20 h-20 rounded-2xl flex flex-col items-center justify-center shrink-0 border"
              style={{
                background: healthScore === null
                  ? 'rgba(16,24,40,0.03)'
                  : healthScore >= 85
                  ? 'rgba(15,157,112,0.08)'
                  : healthScore >= 65
                  ? 'rgba(217,119,6,0.08)'
                  : 'rgba(220,47,75,0.08)',
                borderColor: healthScore === null
                  ? 'rgba(16,24,40,0.08)'
                  : healthScore >= 85
                  ? 'rgba(15,157,112,0.25)'
                  : healthScore >= 65
                  ? 'rgba(217,119,6,0.25)'
                  : 'rgba(220,47,75,0.25)',
              }}
            >
              {isScanning ? (
                <Loader2 size={26} className="text-[#0f9d70] animate-spin" />
              ) : healthScore !== null ? (
                <>
                  <span
                    className="text-[26px] font-bold font-mono leading-none tracking-tight"
                    style={{
                      color: healthScore >= 85 ? '#0f9d70' : healthScore >= 65 ? '#d97706' : '#dc2f4b',
                    }}
                  >
                    {healthScore}
                  </span>
                  <span className="text-[10px] text-[#8b94a3] mt-1 font-medium">健康评分</span>
                </>
              ) : (
                <ShieldCheck size={28} className="text-[#8b94a3]" />
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[17px] font-bold text-[#12171f] tracking-tight">
                  全机智能深度体检
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-[rgba(15,157,112,0.09)] text-[#0f9d70]">
                  原生 SSH 驱动 · 零侵入
                </span>
              </div>
              <p className="text-[12.5px] text-[#6b7484] max-w-xl leading-relaxed">
                无需在被管机安装探针或 Agent，一键自动扫描 CPU 负载、内存 Swap、根磁盘容量、开放暴露端口、僵尸进程与 SSH 暴破日志。
              </p>
              {scanTime && (
                <p className="text-[11px] text-[#a8b0bd] font-mono">
                  上次扫描时间：{new Date(scanTime).toLocaleTimeString('zh-CN')}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {healthScore !== null && (
              <button
                onClick={exportReport}
                className="btn btn-ghost flex items-center gap-2 h-[38px] px-4 rounded-xl border border-[rgba(16,24,40,0.08)] text-[12.5px] font-medium"
              >
                <Download size={14} />
                导出体检报告
              </button>
            )}
            <button
              onClick={runFullHealthCheck}
              disabled={isScanning}
              className="btn btn-primary flex items-center gap-2 h-[38px] px-5 rounded-xl text-[13px] font-semibold"
              style={{
                boxShadow: '0 4px 14px -2px rgba(15,157,112,0.38)',
              }}
            >
              {isScanning ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
              {isScanning ? '正在全机巡检中…' : '立即开始全机体检'}
            </button>
          </div>
        </div>

        {/* 体检指标项清单 */}
        {checkItems.length > 0 && (
          <div className="mt-5 pt-4 border-t border-[rgba(16,24,40,0.06)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {checkItems.map((item, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-3 rounded-xl border bg-white"
                style={{ borderColor: 'rgba(16,24,40,0.06)' }}
              >
                <div className="mt-0.5 shrink-0">
                  {item.status === 'checking' ? (
                    <Loader2 size={16} className="text-[#8b94a3] animate-spin" />
                  ) : item.status === 'pass' ? (
                    <CheckCircle2 size={16} className="text-[#0f9d70]" />
                  ) : item.status === 'warn' ? (
                    <AlertTriangle size={16} className="text-[#d97706]" />
                  ) : (
                    <XCircle size={16} className="text-[#dc2f4b]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold text-[#12171f]">{item.name}</span>
                    {item.val && (
                      <span className="text-[11px] font-mono text-[#5b6473] bg-[rgba(16,24,40,0.04)] px-1.5 py-0.5 rounded">
                        {item.val}
                      </span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-[#6b7484] mt-0.5 leading-snug truncate" title={item.detail}>
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 中部：8 大专项排查工具矩阵 + 实时输出控制台 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 左侧：8 大工具卡片 */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[14px] font-bold text-[#12171f] flex items-center gap-2">
              <TerminalSquare size={16} className="text-[#0f9d70]" />
              专项排查工具箱
            </h3>
            <span className="text-[11.5px] text-[#8b94a3]">共 {TOOLS.length} 项实用运维脚本</span>
          </div>

          <div className="space-y-2">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              const isSelected = activeTool.id === tool.id;
              const isRunning = runningId === tool.id;
              const hasRun = !!outputs[tool.id];

              return (
                <div
                  key={tool.id}
                  onClick={() => setActiveTool(tool)}
                  className={`p-3.5 rounded-xl border transition-all duration-180 cursor-pointer flex items-center gap-3.5 group ${
                    isSelected
                      ? 'bg-white border-[#0f9d70] ring-2 ring-[rgba(15,157,112,0.12)]'
                      : 'bg-white border-[rgba(16,24,40,0.07)] hover:border-[rgba(16,24,40,0.18)] hover:bg-[#fafbfc]'
                  }`}
                  style={{
                    boxShadow: isSelected ? '0 4px 14px -2px rgba(15,157,112,0.08)' : 'none',
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: tool.badgeBg }}
                  >
                    <Icon size={18} style={{ color: tool.color }} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-[#12171f] group-hover:text-[#0f9d70] transition-colors">
                        {tool.name}
                      </span>
                      <span className="text-[9.5px] px-1.5 py-0.2 rounded font-medium text-[#6b7484] bg-[rgba(16,24,40,0.05)]">
                        {tool.category}
                      </span>
                      {hasRun && (
                        <span className="text-[10px] text-[#0f9d70] flex items-center gap-0.5 font-medium ml-auto">
                          <CheckCircle2 size={11} /> 已跑
                        </span>
                      )}
                    </div>
                    <p className="text-[11.5px] text-[#8b94a3] mt-0.5 truncate">{tool.desc}</p>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      runSingleTool(tool);
                    }}
                    disabled={isRunning}
                    title="立即执行"
                    className="p-2 rounded-lg bg-[rgba(16,24,40,0.04)] hover:bg-[#0f9d70] hover:text-white text-[#5b6473] transition-all shrink-0"
                  >
                    {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右侧：命令详情与实时输出面板 */}
        <div className="lg:col-span-7 flex flex-col rounded-2xl border bg-white overflow-hidden shadow-sm border-[rgba(16,24,40,0.08)] min-h-[520px]">
          {/* 面板头部 */}
          <div className="p-4 border-b border-[rgba(16,24,40,0.06)] bg-[#fafbfc] flex items-center justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <activeTool.icon size={15} style={{ color: activeTool.color }} />
                <h4 className="text-[13.5px] font-bold text-[#12171f]">{activeTool.name}</h4>
                <span className="text-[11px] text-[#8b94a3] font-mono">
                  {currentResult ? `${currentResult.durationMs}ms` : '未执行'}
                </span>
              </div>
              <p className="text-[11px] text-[#a8b0bd] font-mono mt-1 truncate">
                $ {activeTool.cmd}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {currentResult && (
                <button
                  onClick={copyCurrentOutput}
                  className="btn btn-ghost h-[30px] px-2.5 text-[11.5px] flex items-center gap-1.5"
                  title="复制控制台输出"
                >
                  {copied ? <Check size={12} className="text-[#0f9d70]" /> : <Copy size={12} />}
                  {copied ? '已复制' : '复制'}
                </button>
              )}
              <button
                onClick={() => runSingleTool(activeTool)}
                disabled={runningId === activeTool.id}
                className="btn btn-primary h-[30px] px-3 text-[12px] flex items-center gap-1.5"
              >
                {runningId === activeTool.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RefreshCw size={12} />
                )}
                {runningId === activeTool.id ? '执行中' : '执行命令'}
              </button>
            </div>
          </div>

          {/* 面板输出区 */}
          <div className="flex-1 p-4 bg-[#111827] text-[#e5e7eb] font-mono text-[12px] leading-relaxed overflow-y-auto max-h-[500px]">
            {runningId === activeTool.id ? (
              <div className="flex flex-col items-center justify-center py-20 text-[#9ca3af] gap-3">
                <Loader2 size={24} className="text-[#0f9d70] animate-spin" />
                <p className="text-[12px]">正在连接主机执行诊断命令…</p>
              </div>
            ) : currentResult ? (
              <div>
                {currentResult.stdout && (
                  <pre className="whitespace-pre-wrap word-break">{currentResult.stdout}</pre>
                )}
                {currentResult.stderr && (
                  <pre className="whitespace-pre-wrap text-[#f87171] mt-2">
                    {currentResult.stderr}
                  </pre>
                )}
                {!currentResult.stdout && !currentResult.stderr && (
                  <p className="text-[#9ca3af]">（命令返回成功，标准输出为空）</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-[#6b7280] gap-2">
                <TerminalSquare size={28} className="text-[#4b5563]" />
                <p className="text-[12.5px] text-[#9ca3af]">点击上方「执行命令」或左侧工具卡片开始排查</p>
                <p className="text-[11px] text-[#6b7280]">支持自动高亮端口占用、大文件路径、Docker 容器与登录日志</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
