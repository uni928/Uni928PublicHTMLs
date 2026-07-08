// ==UserScript==
// @name Via Text Input Helper Buttons
// @namespace https://uni928.local/
// @version 3.0.3
// @description 入力欄フォーカス中にコピー・削除・範囲選択指定・記憶ボタンを表示し、記憶内容を自動入力します。
// @match http*://*/*
// @grant none
// ==/UserScript==

(function () {
  "use strict";

  const PANEL_ID = "via-text-input-helper-panel";
  const STYLE_ID = "via-text-input-helper-style";
  const MESSAGE_ID = "via-text-input-helper-message";

  const DB_NAME = "via_text_input_helper_db";
  const DB_VERSION = 1;
  const STORE_NAME = "memory";

  let activeEl = null;
  let hideTimer = null;
  let messageTimer = null;
  let panelPausedUntil = 0;

  let rangeAnchorEl = null;
  let rangeAnchorPos = null;

  function isTextInput(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;

    if (el.tagName === "INPUT") {
      const type = String(el.type || "text").toLowerCase();

      return [
        "text",
        "search",
        "url",
        "tel",
        "email",
        "number"
      ].includes(type);
    }

    return !!el.isContentEditable;
  }

  function isMemoryTarget(el) {
    if (!isTextInput(el)) return false;
    if (el.tagName === "INPUT" && String(el.type || "").toLowerCase() === "password") return false;
    return true;
  }

  function getPageKey() {
    return location.origin + location.pathname;
  }

  function getElementKey(el) {
    if (el.id) return "id:" + el.id;
    if (el.name) return "name:" + el.name;

    const tag = String(el.tagName || "").toLowerCase();
    const all = Array.from(document.querySelectorAll(tag));
    const index = all.indexOf(el);

    return tag + ":index:" + index;
  }

  function getMemoryKey(el) {
    return getPageKey() + "||" + getElementKey(el);
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = function () {
        const db = req.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };

      req.onsuccess = function () {
        resolve(req.result);
      };

      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  async function saveMemory(el) {
    if (!isMemoryTarget(el)) {
      showMessage("この入力欄は記憶対象外です");
      return;
    }

    const text = getText(el);

    if (!text.trim()) {
      showMessage("入力内容が空です");
      return;
    }

    try {
      const db = await openDb();

      await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        store.put({
          key: getMemoryKey(el),
          pageKey: getPageKey(),
          elementKey: getElementKey(el),
          url: location.href,
          text,
          savedAt: Date.now()
        });

        tx.oncomplete = resolve;
        tx.onerror = function () {
          reject(tx.error);
        };
      });

      db.close();
      showMessage("記憶しました");
    } catch (_) {
      showMessage("記憶に失敗しました");
    }
  }

  async function loadMemoryForElement(el) {
    if (!isMemoryTarget(el)) return null;

    try {
      const db = await openDb();

      const data = await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(getMemoryKey(el));

        req.onsuccess = function () {
          resolve(req.result || null);
        };

        req.onerror = function () {
          reject(req.error);
        };
      });

      db.close();
      return data;
    } catch (_) {
      return null;
    }
  }

  async function autoFillRememberedInputs() {
    const targets = Array.from(document.querySelectorAll("textarea, input, [contenteditable='true'], [contenteditable='']"))
      .filter(isMemoryTarget);

    for (const el of targets) {
      const current = getText(el);

      if (current.trim()) continue;

      const data = await loadMemoryForElement(el);

      if (data && typeof data.text === "string" && data.text) {
        setText(el, data.text);
        markAutoFilled(el);
      }
    }
  }

  function markAutoFilled(el) {
    try {
      el.setAttribute("data-via-helper-autofilled", "1");
    } catch (_) {}
  }

  function startAutoFillWatcher() {
    let runCount = 0;
    const maxRunCount = 20;

    function run() {
      runCount++;
      autoFillRememberedInputs();

      if (runCount < maxRunCount) {
        setTimeout(run, 1000);
      }
    }

    // サイトを開いて放置した場合でも、5秒後から自動入力を試します。
    setTimeout(run, 5000);

    // GitHubなど、入力欄が後から追加されるサイト向けです。
    const observer = new MutationObserver(function () {
      autoFillRememberedInputs();
    });

    try {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });

      setTimeout(function () {
        observer.disconnect();
      }, 30000);
    } catch (_) {}
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
@layer viaTextInputHelper {
  /* パネル本体 */
  #${PANEL_ID} {
    position: fixed;
    z-index: 2147483647;
    display: none;
    flex-wrap: wrap;
    gap: 6px;
    max-width: calc(100vw - 20px);
    padding: 6px;
    border-radius: 10px;
    background: rgba(20, 20, 20, 0.9);
    box-shadow: 0 4px 16px rgba(0, 0, 0, .25);
    box-sizing: border-box;
  }

  #${PANEL_ID}.is-visible {
    display: flex;
  }

  /* サイト側CSSで文字色が潰れるのを防ぐ */
  #${PANEL_ID} button {
    appearance: none;
    -webkit-appearance: none;
    border: 1px solid rgba(0, 0, 0, 0.28);
    border-radius: 8px;
    padding: 8px 10px;
    background: #fff6d8;
    color: #111111;
    -webkit-text-fill-color: #111111;
    text-shadow: none;
    font: 700 13px/1.1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0.02em;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    box-sizing: border-box;
    min-height: 34px;
  }

  #${PANEL_ID} button:active {
    transform: translateY(1px);
  }

  /* 記憶ボタン */
  #${PANEL_ID} .via-helper-memory-btn {
    background: #d8ffe4;
    color: #082b13;
    -webkit-text-fill-color: #082b13;
    border-color: rgba(8, 43, 19, 0.28);
  }

  /* 閉じるボタン */
  #${PANEL_ID} .via-helper-close-btn {
    background: #ffd8d8;
    color: #3a0505;
    -webkit-text-fill-color: #3a0505;
    border-color: rgba(58, 5, 5, 0.28);
  }

  /* 操作結果メッセージ */
  #${MESSAGE_ID} {
    position: fixed;
    left: 50%;
    bottom: 72px;
    z-index: 2147483647;
    display: none;
    max-width: calc(100vw - 24px);
    transform: translateX(-50%);
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(20, 20, 20, 0.88);
    color: #fff6d8;
    -webkit-text-fill-color: #fff6d8;
    font-size: 13px;
    line-height: 1.4;
    box-sizing: border-box;
    pointer-events: none;
    white-space: nowrap;
  }

  #${MESSAGE_ID}.is-visible {
    display: block;
  }
}
`;
    document.documentElement.appendChild(style);
  }

  function createPanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = PANEL_ID;

    panel.appendChild(createButton("コピー", copyAllText));
    panel.appendChild(createButton("削除", clearText));
    panel.appendChild(createButton("範囲選択指定", markOrSelectRange));
    // panel.appendChild(createButton("ブロック選択", selectCurrentBlock));

    const memoryBtn = createButton("記憶", saveMemory);
    memoryBtn.classList.add("via-helper-memory-btn");
    panel.appendChild(memoryBtn);

    const closeBtn = createButton("閉じる", function () {
      panelPausedUntil = Date.now() + 10000;
      hidePanel();
      clearRangeAnchor();
      // showMessage("10秒間閉じます");
    });
    closeBtn.classList.add("via-helper-close-btn");
    panel.appendChild(closeBtn);

    document.documentElement.appendChild(panel);
    return panel;
  }

  function createMessage() {
    let message = document.getElementById(MESSAGE_ID);
    if (message) return message;

    message = document.createElement("div");
    message.id = MESSAGE_ID;
    document.documentElement.appendChild(message);
    return message;
  }

  function showMessage(text) {
    const message = createMessage();
    clearTimeout(messageTimer);

    message.textContent = text;
    message.classList.add("is-visible");

    messageTimer = setTimeout(function () {
      message.classList.remove("is-visible");
    }, 1200);
  }

  function createButton(label, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;

    function run(event) {
      event.preventDefault();
      event.stopPropagation();

      clearTimeout(hideTimer);

      const el = activeEl;
      if (!isTextInput(el)) return;

      focusElement(el);
      handler(el);

      setTimeout(function () {
        if (isTextInput(el)) focusElement(el);
        updatePanelPosition();
      }, 0);
    }

    button.addEventListener("pointerdown", run, { passive: false });

    button.addEventListener("touchend", function (event) {
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false });

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
    });

    return button;
  }

  function focusElement(el) {
    try {
      el.focus({ preventScroll: true });
    } catch (_) {
      try {
        el.focus();
      } catch (_) {}
    }
  }

  function getText(el) {
    if (el.isContentEditable) return el.innerText || "";
    return String(el.value || "");
  }

  function setText(el, text) {
    if (el.isContentEditable) {
      el.innerText = text;
      dispatchInput(el);
      return;
    }

    el.value = text;
    dispatchInput(el);
  }

  function dispatchInput(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function getSelectionRange(el) {
    if (el.isContentEditable) {
      return getContentEditableSelectionRange(el);
    }

    const len = getText(el).length;
    let start = typeof el.selectionStart === "number" ? el.selectionStart : len;
    let end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;

    start = Math.max(0, Math.min(start, len));
    end = Math.max(0, Math.min(end, len));

    return { start, end };
  }

  function setSelectionRangeSafe(el, start, end) {
    if (el.isContentEditable) {
      setContentEditableSelectionRange(el, start, end);
      return;
    }

    try {
      el.setSelectionRange(start, end);
    } catch (_) {}
  }

  function getContentEditableSelectionRange(root) {
    const selection = window.getSelection();
    const text = getText(root);
    const len = text.length;

    if (!selection || selection.rangeCount === 0) {
      return { start: len, end: len };
    }

    const range = selection.getRangeAt(0);

    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
      return { start: len, end: len };
    }

    const start = getTextOffset(root, range.startContainer, range.startOffset);
    const end = getTextOffset(root, range.endContainer, range.endOffset);

    return {
      start: Math.max(0, Math.min(start, len)),
      end: Math.max(0, Math.min(end, len))
    };
  }

  function getTextOffset(root, targetNode, targetOffset) {
    let offset = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const node = walker.currentNode;

      if (node === targetNode) {
        return offset + targetOffset;
      }

      offset += node.nodeValue.length;
    }

    return offset;
  }

  function setContentEditableSelectionRange(root, start, end) {
    const startPoint = findTextPoint(root, start);
    const endPoint = findTextPoint(root, end);

    if (!startPoint || !endPoint) return;

    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function findTextPoint(root, targetOffset) {
    let currentOffset = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let lastTextNode = null;

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const nextOffset = currentOffset + node.nodeValue.length;

      if (targetOffset <= nextOffset) {
        return {
          node,
          offset: Math.max(0, targetOffset - currentOffset)
        };
      }

      currentOffset = nextOffset;
      lastTextNode = node;
    }

    if (lastTextNode) {
      return {
        node: lastTextNode,
        offset: lastTextNode.nodeValue.length
      };
    }

    root.appendChild(document.createTextNode(""));
    return {
      node: root.firstChild,
      offset: 0
    };
  }

  async function copyAllText(el) {
    const text = getText(el);

    try {
      await navigator.clipboard.writeText(text);
      showMessage("コピーしました");
    } catch (_) {
      fallbackCopy(text);
      showMessage("コピーしました");
    }
  }

  function fallbackCopy(text) {
    const temp = document.createElement("textarea");
    temp.value = text;
    temp.style.position = "fixed";
    temp.style.left = "-9999px";
    temp.style.top = "0";
    temp.style.opacity = "0";
    document.body.appendChild(temp);

    temp.focus();
    temp.select();

    try {
      document.execCommand("copy");
    } catch (_) {}

    temp.remove();
  }

  function clearText(el) {
    setText(el, "");
    setSelectionRangeSafe(el, 0, 0);
    clearRangeAnchor();
    showMessage("削除しました");
  }

  function clearRangeAnchor() {
    rangeAnchorEl = null;
    rangeAnchorPos = null;
  }

  function markOrSelectRange(el) {
    const range = getSelectionRange(el);
    const pos = range.end;

    if (rangeAnchorEl !== el || rangeAnchorPos === null) {
      rangeAnchorEl = el;
      rangeAnchorPos = pos;
      showMessage("開始位置を指定しました");
      return;
    }

    const start = Math.min(rangeAnchorPos, pos);
    const end = Math.max(rangeAnchorPos, pos);

    setSelectionRangeSafe(el, start, end);
    clearRangeAnchor();

    showMessage(start === end ? "同じ位置です" : "範囲選択しました");
  }

  function selectCurrentBlock(el) {
    const text = getText(el);
    const range = getSelectionRange(el);
    const pos = range.start;
    const block = findParagraphBlock(text, pos);

    setSelectionRangeSafe(el, block.start, block.end);
    clearRangeAnchor();
    showMessage("ブロック選択しました");
  }

  function findParagraphBlock(text, pos) {
    const len = text.length;
    pos = Math.max(0, Math.min(pos, len));

    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const normalizedPos = originalIndexToNormalizedIndex(text, pos);

    let start = 0;
    let end = normalized.length;

    const before = normalized.slice(0, normalizedPos);
    const after = normalized.slice(normalizedPos);

    const beforeIndex = before.lastIndexOf("\n\n");
    if (beforeIndex !== -1) start = beforeIndex + 2;

    const afterIndex = after.indexOf("\n\n");
    if (afterIndex !== -1) end = normalizedPos + afterIndex;

    while (start < end && normalized[start] === "\n") start++;
    while (end > start && normalized[end - 1] === "\n") end--;

    return {
      start: normalizedIndexToOriginalIndex(text, start),
      end: normalizedIndexToOriginalIndex(text, end)
    };
  }

  function originalIndexToNormalizedIndex(text, originalIndex) {
    let normalizedIndex = 0;

    for (let i = 0; i < originalIndex && i < text.length; i++) {
      if (text[i] === "\r") {
        if (text[i + 1] === "\n") i++;
      }

      normalizedIndex++;
    }

    return normalizedIndex;
  }

  function normalizedIndexToOriginalIndex(text, normalizedTarget) {
    let normalizedIndex = 0;

    for (let i = 0; i < text.length; i++) {
      if (normalizedIndex >= normalizedTarget) return i;

      if (text[i] === "\r" && text[i + 1] === "\n") i++;
      normalizedIndex++;
    }

    return text.length;
  }

  function showPanelFor(el) {
    if (Date.now() < panelPausedUntil) return;
    if (!isTextInput(el)) return;

    activeEl = el;

    const panel = createPanel();
    panel.classList.add("is-visible");
    updatePanelPosition();
  }

  function hidePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.classList.remove("is-visible");
  }

  function hidePanelSoon() {
    clearTimeout(hideTimer);

    hideTimer = setTimeout(function () {
      hidePanel();

      if (!isTextInput(document.activeElement)) {
        activeEl = null;
      }
    }, 180);
  }

  function updatePanelPosition() {
    const panel = document.getElementById(PANEL_ID);
    const el = activeEl;

    if (!panel || !isTextInput(el)) return;

    const rect = el.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    let left = rect.right + 12;
    let top = rect.bottom + 12;

    if (left + panelRect.width > window.innerWidth - 10) {
      left = rect.left - panelRect.width - 12;
    }

    if (left < 10) {
      left = Math.max(10, window.innerWidth - panelRect.width - 10);
    }

    if (top + panelRect.height > window.innerHeight - 10) {
      top = rect.top - panelRect.height - 12;
    }

    if (top < 10) {
      top = 10;
    }

    panel.style.left = left + "px";
    panel.style.top = top + "px";
  }

  function init() {
    injectStyle();
    createPanel();
    createMessage();

    document.addEventListener("focusin", function (event) {
      if (isTextInput(event.target)) {
        showPanelFor(event.target);
      }
    });

    document.addEventListener("pointerdown", function (event) {
      const target = event.target;

      if (isTextInput(target)) {
        showPanelFor(target);
      }
    }, true);

    document.addEventListener("focusout", function () {
      hidePanelSoon();
    });

    document.addEventListener("selectionchange", function () {
      if (isTextInput(document.activeElement)) {
        activeEl = document.activeElement;
      }
    });

    window.addEventListener("scroll", function () {
      hidePanel();
    }, true);

    window.addEventListener("resize", function () {
      hidePanel();
    });

    startAutoFillWatcher();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
