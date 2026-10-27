#!/usr/bin/env bash
# 安装到用户目录，并把「GitHub Copilot」桌面项指向中文版启动器。
#
# 注意：这里刻意 **不新建** 第二个 .desktop 文件。Ubuntu Dock 会把
# 「所有 StartupWMClass 与运行中窗口匹配」的桌面项都列出来，两个文件
# 同时声明 StartupWMClass=github 就会出现两个一模一样的图标。
# 因此改为改写官方那份 github-copilot.desktop 的 Exec，并备份原件。
set -euo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
TARGET="$DATA_HOME/copilot-zh"
APPS="$DATA_HOME/applications"
DESKTOP="$APPS/github-copilot.desktop"
BACKUP="$DESKTOP.copilot-zh.orig"

mkdir -p "$TARGET" "$APPS"
for f in launcher.sh inject.mjs scan.mjs payload.js dictionary.json lib README.md LICENSE; do
    [[ -e $HERE/$f ]] && cp -a "$HERE/$f" "$TARGET/"
done
chmod +x "$TARGET/launcher.sh" "$TARGET/inject.mjs" "$TARGET/scan.mjs"

# 清掉旧版本安装过的独立桌面项（会造成重复图标）
rm -f "$APPS/copilot-zh.desktop"

if [[ ! -f $DESKTOP ]]; then
    echo "[copilot-zh] 警告：找不到 $DESKTOP，跳过桌面项改写" >&2
    echo "[copilot-zh] 你可以直接用 $TARGET/launcher.sh 启动" >&2
else
    [[ -f $BACKUP ]] || cp -a "$DESKTOP" "$BACKUP"
    if grep -q "^Exec=.*copilot-zh/launcher.sh" "$DESKTOP"; then
        echo "[copilot-zh] 桌面项已指向中文版启动器，跳过"
    else
        python3 - "$DESKTOP" "$TARGET/launcher.sh" <<'PY'
import sys, pathlib
desktop = pathlib.Path(sys.argv[1])
launcher = sys.argv[2]
lines = desktop.read_text(encoding='utf-8').splitlines()
out = []
for line in lines:
    if line.startswith('Exec='):
        out.append(f'Exec={launcher} %u')
    elif line.startswith('X-CopilotZh='):
        continue
    else:
        out.append(line)
out.insert(1, 'X-CopilotZh=1')
desktop.write_text('\n'.join(out) + '\n', encoding='utf-8')
PY
        echo "[copilot-zh] 已改写桌面项：$DESKTOP"
    fi
fi

# 会话级环境变量：让 Dock / 菜单 / 终端 等任何启动方式都带上检查器开关。
# 需要重新登录一次才生效（environment.d 由 systemd 用户实例在登录时读取）。
PORT="${COPILOT_ZH_PORT:-9222}"
ENV_DIR="$HOME/.config/environment.d"
mkdir -p "$ENV_DIR"
cat > "$ENV_DIR/10-copilot-zh.conf" <<ENV_EOF
# 由 copilot-zh 安装：让 WebKitGTK 暴露远程检查器，供汉化注入器连接
WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:$PORT
ENV_EOF

# 登录自启注入器：应用随时启动都能被翻译
AUTOSTART_DIR="$HOME/.config/autostart"
mkdir -p "$AUTOSTART_DIR"
cat > "$AUTOSTART_DIR/copilot-zh-injector.desktop" <<AUTOSTART_EOF
[Desktop Entry]
Type=Application
Name=Copilot 中文注入器
Comment=GitHub Copilot 中文界面的运行时注入器
Exec=$TARGET/inject.mjs
Terminal=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
AUTOSTART_EOF
chmod +x "$AUTOSTART_DIR/copilot-zh-injector.desktop"

command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" 2>/dev/null || true

echo "[copilot-zh] 已安装到 $TARGET"
echo "[copilot-zh] 已写入 $ENV_DIR/10-copilot-zh.conf（会话级检查器开关）"
echo "[copilot-zh] 已写入 $AUTOSTART_DIR/copilot-zh-injector.desktop（登录自启注入器）"
echo "[copilot-zh] 让一切启动方式都生效，需要重新登录一次；"
echo "[copilot-zh] 只想立刻试，可以先完全退出 Copilot，再跑 $TARGET/launcher.sh"
