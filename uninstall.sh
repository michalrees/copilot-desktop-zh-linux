#!/usr/bin/env bash
# 卸载：删除安装目录与启动项（不动 Copilot 本体）。
set -euo pipefail

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
rm -rf "$DATA_HOME/copilot-zh"
rm -f "$DATA_HOME/applications/copilot-zh.desktop"
echo "[copilot-zh] 已卸载"
