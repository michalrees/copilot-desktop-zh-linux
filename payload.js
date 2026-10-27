// 页面内运行的汉化引擎。
//
// 由 inject.mjs 通过 WebKit 检查器注入，前置一行 `window.__COPILOT_ZH_DICT__ = {...}`。
// 设计原则：
//   1. 只做「精确命中」与「显式正则」替换，不做模糊匹配，避免误伤用户内容；
//   2. 跳过代码块、输入框、可编辑区域；
//   3. 幂等：重复注入只会更新词典并重新应用，不会叠加观察器；
//   4. 任何异常都吞掉，绝不把应用弄崩。

(() => {
    'use strict';

    const SKIP_SELECTOR = 'pre, code, script, style, textarea, [contenteditable="true"], [data-copilot-zh="skip"]';
    const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
    const MAX_TEXT_LEN = 300;

    if (window.__copilotZh) {
        try {
            window.__copilotZh.reload(window.__COPILOT_ZH_DICT__);
        } catch (err) {
            console.warn('[copilot-zh] reload failed', err);
        }
        return;
    }

    const state = {
        dict: window.__COPILOT_ZH_DICT__ || {},
        textRes: [],
        attrRes: [],
        wholeEls: {},
        stats: {text: 0, attr: 0, whole: 0, runs: 0, lastRun: 0},
        scheduled: false,
    };

    function compile(dict) {
        state.dict = dict || {};
        const texts = state.dict.texts || {};
        const attrs = state.dict.attrs || {};
        state.textRes = (state.dict.textPatterns || []).map(([pattern, replacement, flags]) => {
            try {
                return [new RegExp(pattern, flags || ''), replacement];
            } catch {
                return null;
            }
        }).filter(Boolean);
        state.attrRes = (state.dict.attrPatterns || []).map(([pattern, replacement, flags]) => {
            try {
                return [new RegExp(pattern, flags || ''), replacement];
            } catch {
                return null;
            }
        }).filter(Boolean);
        state.wholeEls = state.dict.wholeElements || {};
        state.texts = texts;
        state.attrs = attrs;
    }

    function skip(el) {
        if (!el)
            return true;
        try {
            return Boolean(el.closest(SKIP_SELECTOR));
        } catch {
            return false;
        }
    }

    function translateTextNode(node) {
        if (!state.texts)
            return;
        const raw = node.nodeValue;
        const trimmed = raw.trim();
        if (!trimmed || trimmed.length > MAX_TEXT_LEN || !/[A-Za-z]/.test(trimmed))
            return;

        const hit = state.texts[trimmed];
        if (hit !== undefined) {
            if (trimmed === hit)
                return;
            node.nodeValue = raw.replace(trimmed, hit);
            state.stats.text++;
            return;
        }

        for (const [re, replacement] of state.textRes) {
            if (!re.test(trimmed))
                continue;
            const replaced = trimmed.replace(re, replacement);
            if (replaced === trimmed)
                return;
            node.nodeValue = raw.replace(trimmed, replaced);
            state.stats.text++;
            return;
        }
    }

    function maybeTranslateElement(el) {
        if (!el || el.children.length > 0 || skip(el))
            return;
        const textNodes = [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
        if (textNodes.length < 2)
            return;
        const full = el.textContent.trim();
        if (full.length > MAX_TEXT_LEN)
            return;
        const hit = state.wholeEls[full];
        if (hit === undefined || el.textContent === hit)
            return;
        el.textContent = hit;
        state.stats.whole++;
    }

    function translateAttributes() {
        if (!state.attrs)
            return;
        document.querySelectorAll('[placeholder],[aria-label],[title],[alt]').forEach(el => {
            if (skip(el))
                return;
            for (const attr of ATTRS) {
                const value = el.getAttribute(attr);
                if (!value || value.length > 300 || !/[A-Za-z]/.test(value))
                    continue;
                const hit = state.attrs[value];
                if (hit !== undefined) {
                    if (hit !== value) {
                        el.setAttribute(attr, hit);
                        state.stats.attr++;
                    }
                    continue;
                }
                for (const [re, replacement] of state.attrRes) {
                    if (!re.test(value))
                        continue;
                    const replaced = value.replace(re, replacement);
                    if (replaced !== value) {
                        el.setAttribute(attr, replaced);
                        state.stats.attr++;
                    }
                    break;
                }
            }
        });
    }

    function apply() {
        state.stats.runs++;
        state.stats.lastRun = Date.now();
        try {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            const nodes = [];
            let node;
            while ((node = walker.nextNode()))
                nodes.push(node);
            for (const textNode of nodes) {
                if (skip(textNode.parentElement))
                    continue;
                translateTextNode(textNode);
            }
            document.querySelectorAll('body *').forEach(maybeTranslateElement);
            translateAttributes();
        } catch (err) {
            console.warn('[copilot-zh] apply failed', err);
        }
    }

    function schedule() {
        if (state.scheduled)
            return;
        state.scheduled = true;
        setTimeout(() => {
            state.scheduled = false;
            apply();
        }, 60);
    }

    function reload(dict) {
        compile(dict);
        apply();
        return state.stats;
    }

    window.__copilotZh = {
        version: 1,
        get stats() {
            return {...state.stats};
        },
        reload,
        apply,
    };

    compile(state.dict);

    const start = () => {
        apply();
        try {
            const observer = new MutationObserver(schedule);
            observer.observe(document.body, {childList: true, subtree: true, characterData: true});
        } catch (err) {
            console.warn('[copilot-zh] observer failed', err);
        }
    };

    if (document.body)
        start();
    else
        document.addEventListener('DOMContentLoaded', start, {once: true});
})();
