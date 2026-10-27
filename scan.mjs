#!/usr/bin/env node
// 扫描当前界面里「尚未收录」的英文文案，用于扩充 dictionary.json。
//
// 用法：
//   node scan.mjs            # 打印未收录文案
//   node scan.mjs out.json   # 另外写入 JSON 文件
//
// 扫描结果里以 @ 开头的是属性文案（placeholder / aria-label / title / alt）。

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {PageSession, findSocketUrl, inspectorReady} from './lib/wk.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.COPILOT_ZH_PORT || 9222);

const SCAN_EXPRESSION = `(() => {
    const skip = 'pre, code, script, style, textarea, [contenteditable="true"]';
    const found = new Set();
    // 翻译生效后再扫描时，DOM 里已经是中文 —— 跳过以中文为主的字符串，
    // 否则会把已经译好的界面当成「未收录」。
    const mostlyChinese = text => {
        const cjk = (text.match(/[\\u4e00-\\u9fff]/g) || []).length;
        const latin = (text.match(/[A-Za-z]/g) || []).length;
        return cjk > 0 && cjk >= latin * 0.6;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (!parent || parent.closest(skip))
            continue;
        const text = node.textContent.trim();
        if (text.length >= 2 && text.length <= 60 && /[A-Za-z]/.test(text) && !mostlyChinese(text))
            found.add(text);
    }
    document.querySelectorAll('[placeholder],[aria-label],[title],[alt]').forEach(el => {
        ['placeholder', 'aria-label', 'title', 'alt'].forEach(attr => {
            const value = el.getAttribute(attr);
            if (value && value.length >= 2 && value.length <= 80 && /[A-Za-z]/.test(value) && !mostlyChinese(value))
                found.add('@' + value);
        });
    });
    return JSON.stringify([...found]);
})()`;

async function main() {
    if (!await inspectorReady(PORT)) {
        console.error(`[copilot-zh] 检查器未就绪：http://127.0.0.1:${PORT}/ —— 请用启动器打开 Copilot`);
        process.exit(1);
    }

    const dict = JSON.parse(fs.readFileSync(path.join(HERE, 'dictionary.json'), 'utf8'));
    const knownText = new Set(Object.keys(dict.texts || {}));
    const knownAttr = new Set(Object.keys(dict.attrs || {}));
    const patterns = (dict.textPatterns || []).map(([p, , f]) => new RegExp(p, f || ''));
    const attrPatterns = (dict.attrPatterns || []).map(([p, , f]) => new RegExp(p, f || ''));

    const session = new PageSession(await findSocketUrl(PORT));
    await session.open();
    const raw = await session.evalValue(SCAN_EXPRESSION);
    session.close();

    const all = JSON.parse(raw);
    const unknown = all.filter(item => {
        if (item.startsWith('@')) {
            const value = item.slice(1);
            return !knownAttr.has(value) && !attrPatterns.some(re => re.test(value));
        }
        return !knownText.has(item) && !patterns.some(re => re.test(item));
    }).sort();

    console.log(`共扫描 ${all.length} 条，未收录 ${unknown.length} 条：`);
    for (const item of unknown)
        console.log('  ' + item);

    const outFile = process.argv[2];
    if (outFile) {
        fs.writeFileSync(outFile, JSON.stringify(unknown, null, 2) + '\n');
        console.log(`已写入 ${outFile}`);
    }
}

main().catch(err => {
    console.error('[copilot-zh] 扫描失败：' + (err?.stack || err));
    process.exit(1);
});
