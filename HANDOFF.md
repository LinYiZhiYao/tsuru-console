# Nebula Console — 交接文档

> 给接手的模型：这份文件自包含，**不需要读历史对话**。
> 生成时间：2026-11-12 15:47 GMT+8
> 项目根：`C:\Users\Linyizhi\WorkBuddy AI\2026-11-12-11-07-31\nebula-console`

---

## 0. 一句话现状

多云服务器管理桌面客户端（Electron + React + TS）已能跑、能打包、能免安装启动。
用户正在**自己测 bug**，最近一轮反馈是「添加服务器弹窗打开动画特别卡顿」，已定位并修复，
并做了全应用同类排查。**当前源码 / `dist/` 是最新的，但已打包成品的 asar 落后两处小修复**（见 §8）。

用户最后的指令是「先不用动了，给我写一个交接文件」——所以**本轮之后没有再改代码、没有重新打包**。

---

## 1. 项目是什么

| 项 | 内容 |
|---|---|
| 形态 | Windows 桌面客户端（Electron 33） |
| 目标 | 统一纳管多台不同云厂商服务器（AWS / 阿里云），做服务器与云资源管理 |
| 功能骨架 | 多服务器管理、SSH 终端（xterm.js）、SFTP 文件管理、云资源看板（AWS SDK v3 / 阿里云手写 HMAC-SHA1）、监控与告警、批量运维/脚本执行、凭据加密 |
| 技术栈 | Electron 33 + React 18 + TypeScript + Vite 6 + Tailwind CSS 3 + Framer Motion 11 + Zustand 5 + ECharts 5（按需引入）+ ssh2 1.16 |
| 主题 | **浅色**（用户明确从暗色改过来的，别改回去） |
| 页面 | 总览 / 服务器 / 服务器详情 / 终端 / 云资源 / 监控 / 批量运维 / 告警 / 设置 |

技术栈是用户拍板的：**否决了最初的 WPF/.NET**，原话「换个好点的技术栈，比较全面的，比较牛逼的，最好能流畅运行相关过渡动画」。

---

## 2. 用户硬性要求（必须遵守，别踩）

1. **过渡动画是硬性要求，不是加分项。** 任何新增/修改的 UI、状态切换都必须带动画，不接受「啪」一下硬切。
   - 页面/标签切换：淡入淡出 + 轻微位移（opacity + translateY）
   - 选中态：会**滑过去**的指示块（`layoutId`），不要每项自己硬切背景色
   - hover / press：短动画反馈，不要瞬时切换
   - 判断标准：**点下去瞬间变化 = 不合格**
   - ⚠️ **优化性能时不能用「删掉动画」当手段** —— 只能让动画变便宜（去掉 blur / scale，保留 opacity + transform）
2. **改完 UI 要自己截图验证，能测量就测量**（坐标、帧率、宽度），不要只靠肉眼描述。
3. **要「照着某个参考做」，第一步是找参考源码读参数，不许凭感觉调。**（用户为此发过火）
4. **任何不可逆操作（覆盖数据、发布、删除、改线上状态）：先备份 + 明确让用户确认，缺一不可。**「用户点了按钮」只是意图，不等于授权。
5. 交流用**简体中文**，简洁直接、有主见，不要「好的呢」/拍马屁/长篇铺垫。

---

## 3. 怎么打开（最重要，用户实际诉求）

用户原话：「我在哪打开这个，我点开要我安装啊主要是我还得自己测bug呢」。
**不要让用户点 `Nebula Console Setup 0.1.0.exe`** —— 那是发布用安装包。

| 用途 | 双击 | 说明 |
|---|---|---|
| **测 bug（主力）** | `dev.bat` | Vite HMR + Electron，改 `src/` 即时热更新，不用重新打包。黑窗口别关，按 `Ctrl+C` 退出。DevTools：菜单「视图 → 开发者工具」或 `Ctrl+Shift+I` |
| **验收成品** | `run-app.bat` | 直接起免安装版，不装、不留黑窗口 |

两个入口都设了 `NEBULA_DISABLE_GPU=1`（本机远程显示会话必开，否则 Electron GPU 进程 FATAL 退出）。

`run-app.bat` 用 `dir /b /ad /o-d release-*` **自动发现最新的、且 exe 存在的成品目录**，不写死路径。
`dev.bat` 会清空沙箱注入的 `NODE_OPTIONS` / `PYTHONPATH`（见 §6）。

---

## 4. 关键文件速查

| 文件 | 作用 |
|---|---|
| `electron/main.ts` | 主进程：窗口、浅色 titleBarOverlay、GPU 兜底、IPC、生命周期 `cleanupApp()` 一次性 guard |
| `electron/services/monitor.ts` / `ssh.ts` | 指标采集 / SSH 会话 |
| `src/App.tsx` | 路由 + `PageShell` 页面转场 + 全局 `AddServerDialog` / `Toasts` |
| `src/components/Modal.tsx` | **通用弹窗**（本轮性能修复主战场） |
| `src/components/AddServerDialog.tsx` | 添加/编辑服务器表单 |
| `src/components/LineChart.tsx` | ECharts 按需封装（本轮去掉 tooltip backdrop-filter） |
| `src/pages/Dashboard.tsx` | 首页（本轮修 hover 柔光 bug） |
| `src/styles/index.css` | 浅色设计令牌 + `.panel` / `.btn` / `.field` |
| `package.json` | 脚本 + electron-builder 全部配置 |
| `dev.bat` / `run-app.bat` | 两个启动入口 |
| `prepare-dist.cjs` | 打包前自动换输出目录（绕开 asar 锁） |
| `fix-icon.cjs` + `tools/rcedit-x64.exe` | 打包后给 exe 写图标/版本信息（离线，不依赖 winCodeSign） |
| `cleanup-old-builds.bat` | 重启后清理废弃打包目录（**尚未运行过**） |

验证脚本（都可复用，见 §7）：
`verify-ui.cjs`、`measure.cjs`、`verify-final.cjs`、`verify-final-fps.cjs`、
`measure-modal-fps.cjs`、`measure-interactions.cjs`、`inspect-exe-icon.py`。
截图与 JSON 报告都在 `shots/`。

---

## 5. 本机环境 / 沙箱坑（血泪，别重踩）

### GPU / 渲染
- 机器是 RTX 5060 Laptop，但装了 ToDesk / Microsoft Remote Display Adapter，
  `nvidia-smi` 报 `Failed to initialize NVML: Unknown Error` 是常态，**别据此判断 GPU 不可用**。
- 但 Electron 在这台机器上仍会 GPU 进程 FATAL（`GPU process isn't usable. Goodbye.`）。
  → 主力方案就是 `NEBULA_DISABLE_GPU=1`；`main.ts` 另有 `.gpu-crashed` 标记 + `child-process-gone` 自愈（进程级 FATAL 时可能收不到，别全指望它）。
- **软件渲染下，任何覆盖大面积的 `backdrop-filter: blur()` 都是性能灾难**（见 §7.1）。
  小面积静态 `filter: blur()`（首页 8 个 80px 光晕）实测不是瓶颈，Chromium 会缓存位图。

### 沙箱注入
- `NODE_OPTIONS=--require=".../node-language-shim.cjs"` 会 monkey-patch `fs.promises.rm`，
  导致 Vite 依赖预构建清理 `deps_temp_*` 失败、进程自杀，`concurrently -k` 把 Electron 一起带走。
  → `dev.bat` 里 `set "NODE_OPTIONS="` / `set "PYTHONPATH="`；手工跑命令时也要带上。
- Python 装包同理要 `PYTHONPATH=`，pip 升级要用 `--force-reinstall`（直接 upgrade 会把 pip 卸坏）。
- `vite build` 清空 `dist` 可能触发 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`（阈值 50 个文件）。
  现在 dist 只有 2 个文件，直接 `npx vite build` 能过；文件多了就用 PowerShell 进程内
  `[System.IO.Directory]::Delete($dist, $true)` 先删。
- `Add-Type` 编译 C# 被安全策略 blanket 拦截 —— 别走「PowerShell 编译窗口截图」这条路，用 CDP。

### 网络 / 端口
- 系统有 `http_proxy=http://127.0.0.1:50123`，探测本地端口必须 `curl --noproxy '*'`。
- **Vite 只监听 `[::1]:5273`**：`localhost` / `[::1]` → 200，`127.0.0.1` → 000。
  这是正常的，**别把 000 误判成 dev 模式坏了**。
- 高 DPI 150%（LogPixels 144）：CDP 里 `innerWidth=1480`、`dpr=1.5`，
  PowerShell `CopyFromScreen` 截图会物理/逻辑像素错乱，改用 CDP 截图。

### 打包（electron-builder 五连坑，均已解决）
1. `cpu-features` node-gyp 失败 → `npmRebuild: false` + `files` 排除 `cpu-features` / `nan`
2. Electron 二进制下载 EOF → `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`
3. 无证书签名失败 → `win.signAndEditExecutable: false`
   ⚠️ **但这个开关会跳过 `signAndEditResources()`，连 `--set-icon` 一起跳过**。
   去掉它又会卡在 `winCodeSign` 下载（包里带 macOS 符号链接，无管理员权限 7za 解压失败 → 无限重试）。
   → 最终解法：保留开关，打包后用 `fix-icon.cjs` 调 `tools/rcedit-x64.exe` 直接改 exe 资源。
4. **`app.asar` 一旦被运行过就被系统锁死**，连整个 `win-unpacked` 目录 rename 都 `Permission denied`
   （目录级锁，重启前无解）→ 每次打包必须换 `directories.output`，`prepare-dist.cjs` 自动做。
5. NSIS 收尾 `SAFE_DELETE_BULK_CONFIRM_REQUIRED` 报错不影响产物，安装包和 win-unpacked 都已生成。

图标：`build/icon.ico` 是 7 帧（16/24/32/48/64/128/256，小尺寸必须 DIB，Pillow 默认全 PNG 不行），
绿色渐变 + 白色 lucide Cloud。Setup.exe 的图标本来就是对的，只有主程序 exe 需要 `fix-icon.cjs`。

### 打包脚本
```json
"dist":          "node prepare-dist.cjs && npm run build && npm run electron:build:main && cross-env ELECTRON_MIRROR=... electron-builder --win && node fix-icon.cjs",
"dist:portable": "同上，但 --dir（只出免安装目录，不出 Setup.exe）"
```
`prepare-dist.cjs` 会写回 `package.json` 的 `build.directories.output`；
`fix-icon.cjs` 和 `verify-final.cjs` 都从 `package.json` 读该值，三方自动对齐。

---

## 6. 本轮（2026-11-12 下午）做了什么

### 6.1 用户反馈：弹窗打开动画特别卡顿（配图为「添加服务器」弹窗）

**先量化再改**（用户要求能测量就测量）。`measure-modal-fps.cjs`：静态 `dist/` + mock + Edge `--disable-gpu`、
**必须 `headless: false`**（headless 会插入重复时间戳的追赶帧，算出 p50=0 的假数据）；rAF 采样 idle / 打开 / 关闭。

| 阶段 | 修改前 | 修改后（真实成品） |
|---|---|---|
| idle | 178 fps / 5.6ms | 179 fps / 5.6ms |
| **打开弹窗** | **14.7 fps，p50 72.3ms，16 帧 >50ms，max 94.4ms** | **158.7 fps，p50 5.6ms，0 掉帧，max 16.7ms** |
| 关闭弹窗 | 115 fps，3 帧 67–89ms | 159.7 fps，0 掉帧 |

**根因（两个叠加）**
1. `Modal.tsx` 遮罩 `backdropFilter: blur(4px)` 覆盖 `fixed inset-0` 整个视口。
   软件渲染下每帧把 1480×920 背景重新高斯模糊，约 70–95ms/帧；而且这层只要存在，
   背景任何重绘（监控定时器/图表）都持续触发重算，**不只是动画期间卡**。
   → 改纯半透明遮罩 `rgba(16,24,40,0.38)` + `willChange:'opacity'`。
   视觉上背景从「模糊」变「清晰但压暗」，层次靠遮罩维持，截图确认可接受。
2. `AddServerDialog.tsx` 三个 `AnimatePresence` 首次挂载也在播 `height:0→auto`，
   逐帧重排整个表单，和入场动画撞车 → 全部加 `initial={false}`
   （首次打开直接终态，**切换认证方式时动画照旧**）。

另：面板入场去掉 `scale`（只留 `opacity + y`），加 `willChange:'transform, opacity'`；
`Toasts.tsx` 挂在 96% 不透明白底上的 `backdropFilter: blur(16px)` 纯属浪费，删掉。

**证明动画没被改成硬切**（用户硬性要求）：给 Modal 加 `data-modal-overlay` / `data-modal-panel`，
逐帧读 computed style → **18 个不同 opacity（0→1）、15 个不同 translateY（13.5px→0）**，
轨迹如 `8ms o=0 y=13.5` → `38ms o=0.477 y=7.2` → `106ms o=0.904 y=1.3`。

### 6.2 全应用同类排查（主动做的，用户没点名）

- `LineChart.tsx` ECharts tooltip：背景 `rgba(255,255,255,0.98)` 上挂 `backdrop-filter: blur(8px)`，
  视觉零贡献但鼠标移动时逐帧重算 → **删除**。
- `Dashboard.tsx` QuickAction 卡片 hover 柔光：内联 `opacity: 0` 覆盖了 Tailwind 的
  `group-hover:opacity-100`，**hover 反馈实际是死的** → 删内联 opacity。
  ⚠️ 修的时候一度把 `/* */` 注释写进 JSX 标签属性之间（语法错误），已挪到标签外，tsc 通过。
  验证：opacity `0 → 0.663(120ms) → 1`，`animated: true`、`visible: true`。

**交互帧率扫描（`measure-interactions.cjs`，软件渲染）**

| 交互 | fps | 掉帧 |
|---|---|---|
| idle | 179.1 | 0 |
| 切到监控 / 服务器 / 总览 | 116 / 123.7 / 113.1 | 仅「切回总览」1 帧 33.3ms（ECharts 重初始化，正常） |
| 图表 hover | 178.7 | 0 |
| 卡片 hover | 179.2 | 0 |
| hover 时 `backdropFilterCount` | — | **0** |

**布局验证（`verify-final.cjs` 连真实成品 CDP）**：`bodyBg=rgb(244,246,248)`、
`rootChildren=1`、`window.nebula=object`、8 个导航齐全、`1480×920 / dpr=1.5`、
`scrollW===clientW===1480`（无溢出）、`addBtnRight=1332 < controlZoneStart=1342`（不遮挡原生按钮）。

---

## 7. 验证工具怎么用

所有脚本都在项目根，用 managed node：
```
C:/Users/Linyizhi/.workbuddy-ai/binaries/node/versions/22.22.2-2/node.exe <脚本> [参数]
```
前面加 `NODE_OPTIONS= PYTHONPATH=`（避开沙箱 shim）。

| 脚本 | 命令 | 产出 |
|---|---|---|
| `measure-modal-fps.cjs` | `--tag <label>` | 弹窗 idle/打开/关闭帧率 + 动画轨迹 + `shots/modal-*.png` / `modal-fps-*.json` |
| `measure-interactions.cjs` | `--tag <label>` | 页面切换/图表 hover/卡片 hover 帧率 + hover 柔光 opacity 轨迹 |
| `verify-final-fps.cjs` | 无 | **CDP 连真实成品**（`NEBULA_DISABLE_GPU=1`）复测帧率，`shots/final-fps.json` |
| `verify-final.cjs` | 无 | CDP 布局验证 + `shots/final-verified.png` |
| `verify-ui.cjs` | 无 | 托管 dist + mock，11 页截图（静态视觉） |
| `measure.cjs` | 无 | 布局坐标测量 |
| `inspect-exe-icon.py` | `<exe> <输出前缀>` | 解析 PE 资源段、渲染内嵌图标（支持 PE32 / PE32+） |

Python 用 `C:/Users/Linyizhi/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe`，同样带 `PYTHONPATH=`。

---

## 8. ⚠️ 当前状态与遗留（接手先看这里）

### 最新状态（2026-11-12 19:00 已全量对齐）
- **源码 + `dist/` + `dist-electron/` + 已打包成品 `release-build-20261112-185301/` 全部对齐最新代码**。
- 已完成全量 38 项 Bug 修复（含文件编辑器 1MB 上限对齐与 UTF-8 校验、SFTP 原位写保留权限/属主/软链、SSH Agent 认证凭据修复、`connectTransient` 异常不挂起、`/proc/stat` 双次采样真实 CPU、全离线机器告警评估、云账号 Secret DPAPI 加密与自动迁移、编辑弹窗防后台推送重置、文件管理器 Modal 新建目录、自动创建 downloads 目录、终端跨页面保活与 PTY 尺寸同步、Modal 浅色底栏修复等）。
- `run-app.bat` 与 `dev.bat` 均可直接双击启动最新代码。

### 环境状态（15:47 只读确认）
- 无 `Nebula Console.exe` / `electron.exe` 进程；有 3 个 `node.exe`（端口均未监听，疑似 IDE/沙箱自身进程，**没有贸然清理**）。
- 端口 `5273 / 9555 / 9557 / 5399 / 5401` 全部空闲。
- 最后一次 `dev.bat` 复测的命令被中断、**结果未确认**（此前 15:30 那轮是好的：Vite ready、Electron 3 进程、退出零残留）。
  接手后如要确认，跑一次 `dev.bat` 即可。

### 废弃打包目录（约 1.5GB，重启前删不掉）
`release` / `release-out` / `dist-release` / `release-final`（已被失败打包清空、缺 exe，是坏的）/
`release-app` / `release-app2` / `release-app3` / `release-build-20261112-153809`（当前有效）。
- 目录级锁，**重启后才能删**；`cleanup-old-builds.bat` 已写好但**从未运行过**。
- ⚠️ 删除属不可逆操作，**先让用户确认再执行**，别自作主张。
- `release-app2/win-unpacked/Nebula Console.exe.bak` 是改图标前的 184MB 回滚备份，确认无需回滚后再删。

### 其他已知取舍 / 技术债
- Servers 表格页只有 4 行数据时底部仍有留白：**主动决定不强行拉伸**（既填满又好看是伪命题），
  已加 `DistributionStrip` 信息带。别再试图拉高行高。
- `.gpu-crashed` 自动标记只覆盖 `child-process-gone`；进程级 FATAL 可能收不到 → 本机仍靠 `NEBULA_DISABLE_GPU=1`。
- `electron/main.ts` 的 `cleanupApp()` 一次性 guard 已加，修了 macOS 关窗就停监控的老问题。
- Setup.exe 图标经 PE 资源解析确认是云朵（7 帧），`signAndEditExecutable: false` 对 NSIS 只跳过 elevate.exe 签名，不影响图标。

---

## 9. 给接手模型的建议

**别做**
- 别把浅色主题改回暗色；别删过渡动画来「优化性能」。
- 别再往任何大面积元素上加 `backdrop-filter: blur()`。
- 别让用户点 Setup.exe 去测 bug。
- 别在没确认的情况下删旧打包目录 / `.bak` / 覆盖任何产物。
- 别用 `127.0.0.1:5273` 的 `000` 判断 dev 模式坏了。
- 别用 `Add-Type` 编译 C# 做截图。

**优先做**
1. 用户继续测 bug 时，**先问清楚他打开的是 `dev.bat` 还是 `run-app.bat`** ——
   前者 HMR 已是最新，后者需要重打包才能看到最后两处修复。
2. 若要交付，跑 `npm run dist:portable`，再跑 `verify-final.cjs` + `verify-final-fps.cjs` 复核。
3. 再遇到「卡顿」，复用 `measure-modal-fps.cjs` / `measure-interactions.cjs` **先量化**，
   重点查 `backdrop-filter`、`filter: blur`、`scale` 动画、`height:auto` 动画、`layout` 动画。
4. 重启后（经用户确认）跑 `cleanup-old-builds.bat` 回收约 1.5GB。
