/**
 * 打包前置：自动切换到一个未被锁住的输出目录。
 *
 * 背景：app.asar 一旦被 Electron 运行过，Windows 会一直持有句柄，
 * 连整个 win-unpacked 目录 rename 都报 Permission denied。
 * electron-builder 重新打包时会 EnsureEmptyDir(win-unpacked)，撞上锁直接失败：
 *   "remove ... app.asar: The process cannot access the file because it is being used by another process"
 *
 * 所以只要当前输出目录里已经有成品，就换一个新的带时间戳的目录名。
 * 三方自动对齐，不用手工同步：
 *   - 本脚本写回 package.json 的 build.directories.output
 *   - electron-builder 读该值作为输出目录
 *   - fix-icon.cjs 也从 package.json 读该值，自动找到新 exe
 *   - run-app.bat 按修改时间自动发现最新的成品目录
 *
 * 旧目录（含被锁的 asar）重启后用 cleanup-old-builds.bat 清理。
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const prev = pkg.build.directories.output;
const asar = path.join(ROOT, prev, 'win-unpacked', 'resources', 'app.asar');

if (!fs.existsSync(asar)) {
  console.log(`[prepare-dist] 输出目录可复用: ${prev}`);
  process.exit(0);
}

const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
let next = `release-build-${stamp}`;
let n = 2;
while (fs.existsSync(path.join(ROOT, next))) {
  next = `release-build-${stamp}-${n++}`;
}

pkg.build.directories.output = next;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`[prepare-dist] ${prev} 已有成品（app.asar 会被系统锁住），输出目录切换为: ${next}`);
