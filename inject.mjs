#!/usr/bin/env node
// GitHub Copilot 桌面版（Linux / Tauri + WebKitGTK）中文界面注入器。
//
// 依赖：Node.js >= 22（内置 WebSocket）。零第三方依赖。
//
// 工作方式：
//   1. 连到 WebKitGTK 远程检查器（由启动器通过 WEBKIT_INSPECTOR_HTTP_SERVER 打开）；
//   2. 通过 Target.sendMessageToTarget 在页面里执行 Runtime.evaluate；
//   3. 注入 payload.js + 词典，页面自行用 MutationObserver 维持翻译；
//   4. 每 3 秒巡检一次：页面刷新/payload 丢失则重注，词典改动则热更新。

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {PageSession, findSocketUrl, inspectorReady} from './lib/wk.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.COPILOT_ZH_PORT || 9222);
const DICT_FILE = path.join(HERE, 'dictionary.json');
const PAYLOAD_FILE = path.join(HERE, 'payload.js');
const POLL_MS = Number(process.env.COPILOT_ZH_POLL_MS || 3000);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const log = (...args) => console.log('[copilot-zh]', ...args);

function buildSource() {
    const dictSource = fs.readFileSync(DICT_FILE, 'utf8');
    JSON.parse(dictSource); // 词典格式错误时尽早暴露，而不是在页面里静默失败
    const payload = fs.readFileSync(PAYLOAD_FILE, 'utf8');
    return [
        `window.__COPILOT_ZH_DICT__ = ${dictSource};`,
        payload,
        `;JSON.stringify(window.__copilotZh ? window.__copilotZh.stats : null)`,
    ].join('\n');
}

let session = null;
let dictMtime = 0;
let lastStats = null;

async function waitForInspector() {
    let announced = false;
    while (true) {
        if (await inspectorReady(PORT))
            return;
        if (!announced) {
            log(`等待 WebKit 检查器：http://127.0.0.1:${PORT}/`);
            log('如果一直没有反应，说明 Copilot 不是用本启动器打开的（缺少 WEBKIT_INSPECTOR_HTTP_SERVER）');
            announced = true;
        }
        await sleep(1000);
    }
}

async function ensureSession() {
    if (session && !session.closed)
        return session;
    const socketUrl = await findSocketUrl(PORT);
    session = new PageSession(socketUrl);
    await session.open();
    log('已连接检查器：' + socketUrl);
    return session;
}

async function inject() {
    const current = await ensureSession();
    const stats = await current.evalValue(buildSource());
    dictMtime = fs.statSync(DICT_FILE).mtimeMs;
    lastStats = stats ? JSON.parse(stats) : null;
    if (lastStats)
        log(`已注入：文本 ${lastStats.text} 处、属性 ${lastStats.attr} 处、整句 ${lastStats.whole} 处`);
    else
        log('已注入（页面尚未返回统计）');
}

async function probe() {
    const current = await ensureSession();
    const alive = await current.evalValue('typeof window.__copilotZh !== "undefined"');
    if (!alive) {
        log('页面已刷新，重新注入');
        await inject();
        return;
    }
    const raw = await current.evalValue('JSON.stringify(window.__copilotZh.stats)');
    const stats = raw ? JSON.parse(raw) : null;
    if (stats && (!lastStats || stats.text !== lastStats.text || stats.attr !== lastStats.attr)) {
        log(`翻译统计：文本 ${stats.text} 处、属性 ${stats.attr} 处、整句 ${stats.whole} 处`);
        lastStats = stats;
    }
}

async function main() {
    log('GitHub Copilot 中文界面（Linux/WebKitGTK 版）');
    await waitForInspector();
    await inject();

    const onExit = () => {
        session?.close();
        log('已停止注入，界面将在页面刷新后恢复英文。');
        process.exit(0);
    };
    process.on('SIGINT', onExit);
    process.on('SIGTERM', onExit);

    while (true) {
        await sleep(POLL_MS);
        try {
            if (session?.closed) {
                session = null;
                await inject();
                continue;
            }
            if (fs.statSync(DICT_FILE).mtimeMs > dictMtime) {
                log('词典已更新，热重载');
                await inject();
                continue;
            }
            await probe();
        } catch (err) {
            log('巡检失败，稍后重连：' + err.message);
            session?.close();
            session = null;
            await sleep(1000);
        }
    }
}

main().catch(err => {
    console.error('[copilot-zh] 致命错误：' + (err?.stack || err));
    process.exit(1);
});
