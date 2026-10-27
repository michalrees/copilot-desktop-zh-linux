#!/usr/bin/env bash
# 启动 GitHub Copilot 桌面版并注入中文界面。
#
# 关键点：必须用本启动器打开 Copilot —— 它会设置
#   WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:<端口>
# 让 WebKitGTK 暴露远程检查器，注入器才有通道。直接点官方图标打开的是英文界面。

set -uo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PORT="${COPILOT_ZH_PORT:-9222}"
APPIMAGE="${COPILOT_APPIMAGE:-/opt/github-copilot/GitHub-Copilot-linux-x64.AppImage}"

die() { echo "[copilot-zh] 错误：$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "未找到 Node.js，请先安装 Node.js >= 22"
node -e 'if (+process.versions.node.split(".")[0] < 22) { console.error("需要 Node.js >= 22，当前 " + process.version); process.exit(1) }' \
    || die "Node.js 版本过低"

[[ -f $APPIMAGE ]] || die "找不到 Copilot AppImage：$APPIMAGE
可用环境变量 COPILOT_APPIMAGE 指定实际路径"

export WEBKIT_INSPECTOR_HTTP_SERVER="127.0.0.1:$PORT"

if ! curl -s -m 1 "http://127.0.0.1:$PORT/" 2>/dev/null | grep -q "Inspectable targets"; then
    if pgrep -f "GitHub-Copilot-linux-x64.AppImage" >/dev/null 2>&1; then
        die "已经有一个 Copilot 实例在运行，但它不是用本启动器打开的（没有检查器端口）。
请先完全退出 Copilot（包括托盘图标），再运行本启动器。"
    fi
    echo "[copilot-zh] 启动 Copilot ..."
    setsid "$APPIMAGE" >/dev/null 2>&1 &
fi

exec node "$HERE/inject.mjs"
