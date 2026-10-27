#!/usr/bin/env bash
# 卸载：删除安装目录，并把桌面项还原成官方版本（不动 Copilot 本体）。
set -euo pipefail

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
DESKTOP="$DATA_HOME/applications/github-copilot.desktop"
BACKUP="$DESKTOP.copilot-zh.orig"

rm -rf "$DATA_HOME/copilot-zh"
rm -f "$HOME/.config/environment.d/10-copilot-zh.conf"
rm -f "$HOME/.config/autostart/copilot-zh-injector.desktop"
rm -f "$DATA_HOME/applications/copilot-zh.desktop"
if [[ -f $BACKUP ]]; then
    mv -f "$BACKUP" "$DESKTOP"
    echo "[copilot-zh] 桌面项已还原"
fi
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DATA_HOME/applications" 2>/dev/null || true
echo "[copilot-zh] 已卸载"
