#!/usr/bin/env bash
# 安装到用户目录，并在应用菜单里创建「GitHub Copilot 中文版」启动项。
set -euo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
TARGET="$DATA_HOME/copilot-zh"
APPS="$DATA_HOME/applications"

mkdir -p "$TARGET" "$APPS"
for f in launcher.sh inject.mjs scan.mjs payload.js dictionary.json lib README.md LICENSE; do
    [[ -e $HERE/$f ]] && cp -a "$HERE/$f" "$TARGET/"
done
chmod +x "$TARGET/launcher.sh" "$TARGET/inject.mjs" "$TARGET/scan.mjs"

DESKTOP="$APPS/copilot-zh.desktop"
cat > "$DESKTOP" <<DESKTOP_EOF
[Desktop Entry]
Type=Application
Name=GitHub Copilot 中文版
Comment=GitHub Copilot desktop with Chinese UI (runtime injection)
Exec=$TARGET/launcher.sh
Icon=/opt/github-copilot/github-copilot.png
Terminal=true
Categories=Development;
StartupWMClass=github
DESKTOP_EOF
chmod +x "$DESKTOP"

echo "[copilot-zh] 已安装到 $TARGET"
echo "[copilot-zh] 已创建启动项：$DESKTOP"
echo "[copilot-zh] 注意：请先完全退出正在运行的 Copilot，再从应用菜单启动「GitHub Copilot 中文版」"
