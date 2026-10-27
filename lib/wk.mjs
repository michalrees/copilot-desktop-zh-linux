// WebKitGTK 远程检查器的最小客户端。
//
// WebKitGTK 的 `WEBKIT_INSPECTOR_HTTP_SERVER=host:port` 会暴露一个 HTTP 页面，
// 页面上列出可检查目标，并给出形如 /socket/<a>/<b>/WebPage 的 WebSocket 地址。
// 该 socket 使用的是 WebKit 的 **Target 域** 协议：页面的检查器消息必须用
// Target.sendMessageToTarget 包一层（message 字段是内层协议的 JSON 字符串），
// 回包则通过 Target.dispatchMessageFromTarget 事件下发。
//
// 这一点与 Chromium 的 CDP 不同（CDP 直接连页面 socket 即可），所以
// 针对 WebView2 写的注入器无法直接复用。

import http from 'node:http';

export function httpGet(url, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => (body += chunk));
            res.on('end', () => resolve({status: res.statusCode, body}));
        });
        req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
        req.on('error', reject);
    });
}

export async function inspectorReady(port, timeoutMs = 2000) {
    try {
        const {status, body} = await httpGet(`http://127.0.0.1:${port}/`, timeoutMs);
        return status === 200 && body.includes('Inspectable targets');
    } catch {
        return false;
    }
}

export async function findSocketUrl(port) {
    const {body} = await httpGet(`http://127.0.0.1:${port}/`);
    const match = body.match(/socket\/\d+\/\d+\/[A-Za-z]+/);
    return `ws://127.0.0.1:${port}/${match ? match[0] : 'socket/1/1/WebPage'}`;
}

// 目标信息：名称与页面 URL。用于确认端口背后确实是 Copilot，
// 而不是会话里其它抢先绑定了同一端口的 WebKitGTK 应用。
export async function findTargetInfo(port) {
    const {body} = await httpGet(`http://127.0.0.1:${port}/`);
    const socket = body.match(/socket\/\d+\/\d+\/[A-Za-z]+/);
    return {
        socketUrl: `ws://127.0.0.1:${port}/${socket ? socket[0] : 'socket/1/1/WebPage'}`,
        name: (body.match(/class="targetname">([^<]*)</) || [])[1] || '',
        url: (body.match(/class="targeturl">([^<]*)</) || [])[1] || '',
    };
}

// 端口背后是否是 Copilot 自己的页面（Tauri 自定义协议）
export function isCopilotTarget(target) {
    if (!target)
        return false;
    if ((target.url || '').startsWith('tauri:'))
        return true;
    return /copilot/i.test(target.name || '');
}

export class PageSession {
    constructor(socketUrl, {timeout = 20000, log = () => {}} = {}) {
        this.socketUrl = socketUrl;
        this.timeout = timeout;
        this.log = log;
        this.ws = null;
        this.targetId = null;
        this.nextId = 0;
        this.closed = false;
        this._pending = new Map();
    }

    open() {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(this.socketUrl);
            this.ws = ws;

            const fail = err => {
                clearTimeout(timer);
                try {
                    ws.close();
                } catch {
                    /* ignore */
                }
                reject(err);
            };

            const timer = setTimeout(() => fail(new Error('连接检查器超时')), this.timeout);

            ws.addEventListener('error', () => fail(new Error('检查器连接失败')));
            ws.addEventListener('close', () => {
                this.closed = true;
                for (const {reject: rejectPending} of this._pending.values())
                    rejectPending(new Error('检查器连接已关闭'));
                this._pending.clear();
            });

            ws.addEventListener('message', event => {
                let msg;
                try {
                    msg = JSON.parse(String(event.data));
                } catch {
                    return;
                }

                if (msg.method === 'Target.targetCreated' && !this.targetId) {
                    this.targetId = msg.params.targetInfo.targetId;
                    clearTimeout(timer);
                    resolve(this);
                    return;
                }

                if (msg.method === 'Target.dispatchMessageFromTarget') {
                    let inner;
                    try {
                        inner = JSON.parse(msg.params.message);
                    } catch {
                        return;
                    }
                    const pending = this._pending.get(inner.id);
                    if (!pending)
                        return;
                    this._pending.delete(inner.id);
                    clearTimeout(pending.timer);
                    pending.resolve(inner);
                }
            });
        });
    }

    evaluate(expression, {awaitPromise = true, returnByValue = true, timeout = 15000} = {}) {
        if (!this.targetId)
            return Promise.reject(new Error('尚未连上目标的 Target 域'));

        const id = ++this.nextId;
        const inner = JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: {expression, returnByValue, awaitPromise, objectGroup: 'copilot-zh'},
        });

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._pending.delete(id);
                reject(new Error('执行 JS 超时'));
            }, timeout);

            this._pending.set(id, {resolve, reject, timer});

            try {
                this.ws.send(JSON.stringify({
                    id: ++this.nextId,
                    method: 'Target.sendMessageToTarget',
                    params: {targetId: this.targetId, message: inner},
                }));
            } catch (err) {
                clearTimeout(timer);
                this._pending.delete(id);
                reject(err);
            }
        });
    }

    // 返回 JS 表达式的值；页面抛异常时 reject。
    async evalValue(expression, options) {
        const res = await this.evaluate(expression, options);
        if (res.error)
            throw new Error(res.error.message || JSON.stringify(res.error));
        if (res.result?.wasThrown)
            throw new Error(res.result.result?.description || '页面内抛出异常');
        return res.result?.result?.value;
    }

    close() {
        this.closed = true;
        try {
            this.ws?.close();
        } catch {
            /* ignore */
        }
    }
}
