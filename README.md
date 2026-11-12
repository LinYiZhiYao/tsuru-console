# Tsuru Console · 鹤 🪶

<p align="center">
  <img src="build/icon.png" width="128" height="128" alt="Tsuru Console Logo" />
</p>

<p align="center">
  <strong>现代化 · 动效优先 · 轻量零侵入的多云与多服务器运维控制台</strong>
</p>

<p align="center">
  <a href="https://github.com/LinYiZhiYao/tsuru-console/releases"><img src="https://img.shields.io/github/v/release/LinYiZhiYao/tsuru-console?color=0f9d70&label=Release" alt="Release" /></a>
  <img src="https://img.shields.io/badge/Electron-33.4.11-0891a8" alt="Electron 33" />
  <img src="https://img.shields.io/badge/React-18.3-2563eb" alt="React 18" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-7454d8" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.4-0f9d70" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/License-MIT-dc2f4b" alt="License" />
</p>

---

## 🌟 核心特性 (Key Features)

### 1. ⚡ 原生 SSH 驱动 · 零侵入轻量运维
* **无需安装任何 Agent / 探针**：不占用被管宿主机宝贵的常驻内存，通过原生 SSH2 与 Linux 核心工具链（`systemd`、`procfs`、`ss` 等）直接交互。
* **即录即用**：支持密码认证、私钥免密登录与系统 SSH Agent。
* **敏感凭据硬件隔离**：私钥与密码采用 Windows 本地 DPAPI 双向非对称加密存储在安全 Vault 中，渲染进程完全无法触碰明文凭据。

### 2. 🎯 一键全机智能体检与评分系统 (Health Audit)
* **6 大核心系统维度全自动扫描**：
  * **CPU 与负载**：1/5/15 分钟系统平均负载与核心压力评估；
  * **内存与 Swap**：物理可用内存余量与 Swap 交换区压力；
  * **根分区磁盘与 Inode**：磁盘空间占用预警；
  * **网络端口暴露面**：公网监听端口与未授权暴露检查；
  * **僵尸与异常进程**：排查僵尸（Zombie）进程与高危资源抢占；
  * **SSH 登录安全性**：实时分析黑客密码爆破与近期登录行为。
* **综合健康评分（0 ~ 100 分）**：自动评分给出评级与修复建议。
* **一键导出 Markdown 巡检报告**：一键生成结构化标准运维报告，方便记录与归档。

### 3. 🔍 8 大专项运维排查工具箱 (Diagnostic Toolkit)
详情页 C 位直达，一键点击秒出结果：
* 🔍 **监听端口透视**（`ss -tulpn`）：扫描所有 TCP/UDP 监听端口及对应进程 PID；
* 💾 **磁盘大文件清理 Top10**（`find / -size +100M`）：秒级扫描根分区 >100MB 巨型日志与文件；
* 🐳 **Docker 卷与容器体检**（`docker system df` + `docker ps -a`）：审计容器状态、镜像空间占用与悬空卷；
* 🌐 **TCP 连接状态分布**（`ss -s` + TCP 状态分布统计）：分析 TIME_WAIT、ESTABLISHED 连接健康度；
* 🛡️ **SSH 登录与暴破审计**（`last -n 10` + `grep Failed password`）：快速发现密码试错与未知 IP 登录；
* 🧠 **内存泄漏与虚拟内存**（`free -h` + `vmstat -s`）：分析 Buff/Cache、缺页中断与物理内存利用率；
* 🔥 **系统防火墙规则**（`firewalld` / `ufw` / `iptables`）：查看当前活跃规则与放行端口；
* ⏰ **Crontab 计划任务排查**（`crontab -l` + `/etc/cron.*`）：审查计划任务，杜绝隐藏后门与恶意挖矿脚本。

### 4. 📜 实时系统与服务日志查看器 (System Logs)
无需反复登录终端敲命令，图形化查看实时滚动日志：
* **系统主日志**（`journalctl -n {lines} --no-pager`）
* **内核消息**（`dmesg -T`）
* **SSH 安全登录日志**（精准过滤 `sshd` 认证流水）
* **Docker 守护进程日志**（`journalctl -u docker`）
* **仅看系统报错**（`journalctl -p err..emerg`）
* 配备 **行数切换（50/150/300/500 行）**、**关键字实时高亮过滤**、**错误日志自动标红**、**一键复制** 与 **自动滚底开关**。

### 5. 🎛️ 系统服务与 Docker 容器可视化纳管
* **Systemd 核心服务管理**：自动识别 `nginx`、`sshd`、`crond`、`systemd-journald` 等核心服务，支持一键 start / stop / restart 与实时状态展示。
* **Docker 容器管理**：展示容器 ID、镜像名、运行状态、映射端口，支持容器的启停与重启。

### 6. 📊 活跃进程树管理 (Top Processes)
* 实时拉取宿主机 CPU / 内存占用前 50 的活跃进程；
* 支持按 CPU、按内存、按 PID 一键排序与关键字实时过滤；
* 支持选中高危或卡死进程直接发起安全终止（SIGTERM）。

### 7. ⌨️ Raycast 级全局指令面板 (Command Palette)
* 全局随时通过 `Ctrl + K` 呼出快捷指令中心；
* 模糊搜索纳管服务器并键盘直达（`↑`/`↓`/`Enter`）；
* 快速跳转 8 大功能页面、一键呼出新建服务器与体检工具。

### 8. ☁️ 多云资源同步管理
* 原生集成阿里云 ECS 与 AWS EC2 驱动；
* 自动分页多地域实例同步、实例规格与状态查看；
* 支持一键电源操作（开机 / 关机 / 重启）与一键导入为本地 SSH 纳管服务器。

### 9. 🖥️ 多标签终端与 SFTP 远程文件管理器
* **多标签交互终端**：集成 xterm.js，支持多机并发会话、智能断线重试与自适应窗口大小。
* **SFTP 文件管理器**：支持远程文件与目录树浏览、文件上传、远程下载、新建与删除。

### 10. 🪶 极限流畅度与丹顶鹤品牌美学
* 全站严格恪守 **0 `backdrop-filter: blur()`** 性能规范，杜绝 GPU 毛玻璃光栅化掉帧瓶颈，即使在纯软件渲染（`NEBULA_DISABLE_GPU=1`）下转场帧率亦稳定保持在 150+ FPS。
* 定制「折纸丹顶鹤」品牌徽标与设计语言，浅色现代界面排版清晰大气。

---

## 🚀 快速开始 (Quick Start)

### 方式一：下载即用（便携版）
从 [Releases 页面](https://github.com/LinYiZhiYao/tsuru-console/releases) 下载最新版本的 `Tsuru-Console-v0.1.0-win-x64.zip`，解压后双击 `Tsuru Console.exe`（或运行目录下的 `run-app.bat`）即可使用。

### 方式二：从源码运行与构建

#### 环境要求
* Node.js >= 18.0.0
* Python >= 3.8（用于编译 Windows 高保真多尺寸 ICO 图标）

```bash
# 1. 克隆本仓库
git clone https://github.com/LinYiZhiYao/tsuru-console.git
cd tsuru-console

# 2. 安装依赖
npm install

# 3. 本地开发调试（同时启动 Vite 与 Electron）
npm run dev:all

# 4. 构建 Windows 便携版发行包
npm run dist:portable
```

构建产物将输出在 `release-build-*/win-unpacked/` 目录中。

---

## 🛠️ 技术栈 (Tech Stack)

| 领域 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **桌面运行时** | Electron 33.4.11 | `contextIsolation: true` 严格白名单 IPC 通信 |
| **前端框架** | React 18.3 + TypeScript 5.7 | 函数组件与 Hooks 驱动 |
| **状态管理** | Zustand 5.0 | 轻量、高响应度的全局状态与路由管理 |
| **UI 动效** | Framer Motion 11.13 | 声明式弹簧物理转场与 Layout 动画 |
| **样式工程** | Tailwind CSS 3.4 | 语义化实用原子类与无抖动排版 |
| **图表可视化** | ECharts 5.5 + echarts-for-react | 时序图与负载监控面积折线图 |
| **终端引擎** | Xterm.js 5.3 + xterm-addon-fit | 硬件加速平滑流式终端 |
| **SSH 协议栈** | ssh2 1.16 | Node.js 原生纯 JavaScript SSH 客户端 |
| **多云客户端** | AWS SDK v3 + Aliyun OpenAPI | 实例拉取与电源生命周期控制 |
| **安全存储** | Windows DPAPI (Crypt32) | 本地硬件绑定的凭据隔离与加密 |

---

## 📂 目录架构 (Architecture)

```text
tsuru-console/
├── electron/                  # Electron 主进程源码
│   ├── db.ts                  # 本地 JSON 数据仓储与自动数据迁移
│   ├── main.ts                # 主窗口生命周期管理与安全隔离
│   ├── preload.ts             # ContextBridge 严格白名单暴露
│   ├── ipc/                   # IPC 通信路由分发器
│   └── services/              # 核心业务服务层
│       ├── ssh.ts             # 原生 SSH2 会话、进程管理、Systemd 与命令通道
│       ├── monitor.ts         # 指标历史采样聚合与告警引擎
│       ├── servers.ts         # 服务器 CRUD 与系统信息探测
│       └── cloud/             # AWS 与阿里云云实例驱动
├── src/                       # React 渲染进程源码
│   ├── components/            # UI 组件库
│   │   ├── DiagnosticsCenter.tsx # 全机深度智能体检与专项排查工具箱
│   │   ├── SystemLogsManager.tsx # 实时系统与服务日志查看器
│   │   ├── ProcessManager.tsx    # 进程管理器与 PID 过滤器
│   │   ├── ServicesManager.tsx   # Systemd 服务与 Docker 容器纳管
│   │   ├── CommandPalette.tsx    # Ctrl+K 全局指令面板
│   │   ├── CraneLogo.tsx         # 折纸丹顶鹤矢量品牌 Logo
│   │   └── TerminalTab.tsx       # xterm.js 交互式终端
│   ├── pages/                 # 页面路由（总览、服务器详情、监控、批量、设置等）
│   └── stores/                # Zustand 全局 Store (app.ts)
├── build/                     # 图标与静态打包资源
├── run-app.bat                # 一键自发现启动最新便携式应用脚本
└── package.json               # 项目配置与构建脚本
```

---

## 📜 开源协议 (License)

本项目基于 [MIT License](LICENSE) 许可协议开源。
