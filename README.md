# GitHub Copilot 桌面版中文界面（Linux）

> 非官方汉化 · 运行时注入 · 不改动 Copilot 本体 · 升级不失效

给 **GitHub Copilot 桌面版（Linux）** 提供中文界面。

已知适用版本：`2.102.x`（AppImage，Tauri + WebKitGTK 4.1）。

---

## 为什么需要它

社区里流传的汉化方案（`zhao818/copilot-desktop-zh` 等）是为 **Windows** 写的：

| 环节 | Windows 方案 | Linux 实际情况 |
|---|---|---|
| WebView | WebView2（Chromium） | **WebKitGTK 4.1** |
| 调试通道 | `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` + CDP | 无 CDP；WebKit 用自己的检查器协议 |
| 注入方式 | `http://127.0.0.1:9222/json` → `page.webSocketDebuggerUrl` → `Runtime.evaluate` | 没有 `/json` 端点 |
| 启动器 | `启动 GitHub Copilot 中文版.cmd` + `..\github.exe` | 没有 `.exe`，也不是 `.cmd` |

在 Linux 上直接照搬会卡在 "连不上 9222" 这一步，什么都不会发生。本项目是按 WebKitGTK 的协议重写的，**不依赖任何二进制补丁**。

---

## 原理

```
启动器 (launcher.sh)
  └─ 设 WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:9222 后启动 Copilot
        └─ WebKitGTK 暴露远程检查器：http://127.0.0.1:9222/  →  目标列表
              └─ 注入器 (inject.mjs) 连 ws://127.0.0.1:9222/socket/1/1/WebPage
                    └─ 注意：这个 socket 是 WebKit 的 Target 域，
                       页面消息要包一层 Target.sendMessageToTarget，
                       回包走 Target.dispatchMessageFromTarget。
                    └─ Runtime.evaluate 注入 payload.js + dictionary.json
                          └─ 页面里用 MutationObserver 持续翻译（React 重渲染后依然生效）
```

`payload.js` 的翻译策略：

- **只做精确命中与显式正则**，不做模糊匹配，避免误伤聊天内容、代码、技能名、会话标题；
- 跳过 `pre / code / textarea / [contenteditable]`；
- 同步处理 `placeholder / aria-label / title / alt`；
- 幂等：重复注入只更新词典，不会叠加观察器；
- 所有异常吞掉，不会把应用弄崩。

---

## 安装

要求：**Node.js ≥ 22**（用到内置 WebSocket）、npm 以外的零依赖。

```bash
git clone https://github.com/michalrees/copilot-desktop-zh-linux.git
cd copilot-desktop-zh-linux
./install.sh
```

`install.sh` 会：

- 安装到 `${XDG_DATA_HOME:-~/.local/share}/copilot-zh`；
- 在应用菜单里创建 **「GitHub Copilot 中文版」** 启动项（`Terminal=true`，因为要留着注入器）。

## 使用

1. **先完全退出正在运行的 Copilot**（包括托盘图标）；
2. 从应用菜单点「GitHub Copilot 中文版」，或在终端跑：

```bash
~/.local/share/copilot-zh/launcher.sh
```

3. 界面即为中文；终端窗口（注入器）保持打开，关闭它 = 停止实时翻译。

> ⚠️ 必须用这个启动器打开才是中文。直接点官方图标启动的仍是英文（没有检查器端口，注入器无处可连）。

自定义 AppImage 路径：

```bash
COPILOT_APPIMAGE=/path/to/GitHub-Copilot-linux-x64.AppImage ./launcher.sh
```

端口被占用时：

```bash
COPILOT_ZH_PORT=9333 ./launcher.sh
```

---

## 扩充词典

`dictionary.json` 四个区块：

| 区块 | 作用 | 示例 |
|---|---|---|
| `texts` | 精确文本替换 | `"Sidebar": "侧边栏"` |
| `textPatterns` | 文本正则（`[正则, 替换, 标志]`） | `["^PID (\\d+) \\(current\\)$", "PID $1（当前）", ""]` |
| `attrs` | 属性精确替换（placeholder / aria-label / title / alt） | `"Resize sidebar": "调整侧边栏宽度"` |
| `attrPatterns` | 属性正则 | `["^(.+), open user menu$", "打开 $1 的用户菜单", ""]` |
| `wholeElements` | 被拆成多个文本节点的整句 | `"Chat: New chat": "聊天: 新建聊天"` |

改完**保存即生效**——注入器每 3 秒检查词典 mtime，变了就热重载，不用重启。

想找还没收录的文案：

```bash
~/.local/share/copilot-zh/scan.mjs        # 或者 node scan.mjs
node scan.mjs unknown.json                # 顺便写文件
```

`scan.mjs` 会跳过中文串和用户内容（会话标题、用户名等），只列出可能漏翻的英文界面文案。

---

## 已知限制

- 图标 / 图片里的英文无法翻译；
- 未收录的动态拼接文案会保留英文（用 `scan.mjs` 找出来补进词典）；
- 检查器端口只监听 `127.0.0.1`，且仅在用启动器运行时存在；
- 界面是运行时注入：刷新页面或关闭注入器后恢复英文，重开启动器即恢复；
- 应用升级后若前端结构大改，词典可能需要补充；注入机制本身不依赖版本。

## 卸载

```bash
~/.local/share/copilot-zh/uninstall.sh   # 删除安装目录与启动项
```

Copilot 本体不受任何影响（本项目从不修改 AppImage）。

## 免责声明

非官方社区汉化，与 GitHub 公司无关，仅供学习交流，请遵守 GitHub Copilot 服务条款。

## License

MIT
