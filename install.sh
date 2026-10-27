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

command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" 2>/dev/null || true

echo "[copilot-zh] 已安装到 $TARGET"
echo "[copilot-zh] 现在点「GitHub Copilot」图标即为中文界面（原名，不新增图标）"
echo "[copilot-zh] 提示：请先完全退出正在运行的 Copilot 再启动"
