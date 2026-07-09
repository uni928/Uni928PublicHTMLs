// ==UserScript==
// @name Via Text Input Helper Buttons
// @namespace https://uni928.local/
// @version 3.2.0
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

  function isTextInput_TwT_OwO_B(el) {
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

function isMemoryTarget_TwT_OwO_C(el) {
  if (!isTextInput_TwT_OwO_B(el)) return false;

  if (el.tagName === "INPUT") {
    const type = String(el.type || "").toLowerCase();

    if (type === "password") return false;
    if (type === "email") return false;
    if (type === "tel") return false;
  }

  if (isSensitiveInput_TwT_OwO_D(el)) return false;

  return true;
}

  // 危険そうな入力欄は記憶しない
function isSensitiveInput_TwT_OwO_D(el) {
  const joined = [
    el.id
  ].join(" ").toLowerCase();

  return /password|pass|token|api|secret|key|mail|email|tel|phone|address|住所|電話|メール|パスワード|認証|秘密|鍵/.test(joined);
}

  function getPageKey_TwT_OwO_E() {
    return location.origin + location.pathname;
  }

  function getElementKey_TwT_OwO_F(el) {
    if (el.id) return "id:" + el.id;
    if (el.name) return "name:" + el.name;

    const tag = String(el.tagName || "").toLowerCase();
    const all = Array.from(document.querySelectorAll(tag));
    const index = all.indexOf(el);

    return tag + ":index:" + index;
  }

  function getMemoryKey_TwT_OwO_G(el) {
    return getPageKey_TwT_OwO_E() + "||" + getElementKey_TwT_OwO_F(el);
  }

  function openDb_TwT_OwO_H() {
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

  async function saveMemory_TwT_OwO_I(el) {
    if (!isMemoryTarget_TwT_OwO_C(el)) {
      showMessage_TwT_OwO_R("この入力欄は記憶対象外です");
      return;
    }

    const text = getText_TwT_OwO_U(el);

    if (!text.trim()) {
      showMessage_TwT_OwO_R("入力内容が空です");
      return;
    }

    try {
      const db = await openDb_TwT_OwO_H();

      await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        store.put({
          key: getMemoryKey_TwT_OwO_G(el),
          pageKey: getPageKey_TwT_OwO_E(),
          elementKey: getElementKey_TwT_OwO_F(el),
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
      showMessage_TwT_OwO_R("記憶しました");
    } catch (_) {
      showMessage_TwT_OwO_R("記憶に失敗しました");
    }
  }

  async function loadMemoryForElement_TwT_OwO_J(el) {
    if (!isMemoryTarget_TwT_OwO_C(el)) return null;

    try {
      const db = await openDb_TwT_OwO_H();

      const data = await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(getMemoryKey_TwT_OwO_G(el));

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

  async function autoFillRememberedInputs_TwT_OwO_K() {
    const targets = Array.from(document.querySelectorAll("textarea, input, [contenteditable='true'], [contenteditable='']"))
      .filter(isMemoryTarget_TwT_OwO_C);

    for (const el of targets) {
      const current = getText_TwT_OwO_U(el);

      if (current.trim()) continue;

      const data = await loadMemoryForElement_TwT_OwO_J(el);

      if (data && typeof data.text === "string" && data.text) {
        setText_TwT_OwO_V(el, data.text);
        markAutoFilled_TwT_OwO_L(el);
      }
    }
  }

  function markAutoFilled_TwT_OwO_L(el) {
    try {
      el.setAttribute("data-via-helper-autofilled", "1");
    } catch (_) {}
  }

  function startAutoFillWatcher_TwT_OwO_M() {
    let runCount = 0;
    const maxRunCount = 2;

    function run_TwT_OwO_N() {
      runCount++;
      autoFillRememberedInputs_TwT_OwO_K();

      if (runCount < maxRunCount) {
        setTimeout(run_TwT_OwO_N, 1000);
      }
    }

    // サイトを開いて放置した場合でも、0.1秒後から自動入力を試します。
    setTimeout(run_TwT_OwO_N, 100);

    // GitHubなど、入力欄が後から追加されるサイト向けです。
    const observer = new MutationObserver(function () {
      autoFillRememberedInputs_TwT_OwO_K();
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

  function injectStyle_TwT_OwO_O() {
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

  function createPanel_TwT_OwO_P() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = PANEL_ID;

    panel.appendChild(createButton_TwT_OwO_S("コピー", copyAllText_TwT_OwO_d));
    panel.appendChild(createButton_TwT_OwO_S("削除", clearText_TwT_OwO_f));
    panel.appendChild(createButton_TwT_OwO_S("範囲選択指定", markOrSelectRange_TwT_OwO_h));
    // panel.appendChild(createButton_TwT_OwO_S("ブロック選択", selectCurrentBlock_TwT_OwO_i));

    const memoryBtn = createButton_TwT_OwO_S("記憶", saveMemory_TwT_OwO_I);
    memoryBtn.classList.add("via-helper-memory-btn");
    panel.appendChild(memoryBtn);

    const closeBtn = createButton_TwT_OwO_S("閉じる", function () {
      panelPausedUntil = Date.now() + 10000;
      hidePanel_TwT_OwO_n();
      clearRangeAnchor_TwT_OwO_g();
      // showMessage_TwT_OwO_R("10秒間閉じます");
    });
    closeBtn.classList.add("via-helper-close-btn");
    panel.appendChild(closeBtn);

    document.documentElement.appendChild(panel);
    return panel;
  }

  function createMessage_TwT_OwO_Q() {
    let message = document.getElementById(MESSAGE_ID);
    if (message) return message;

    message = document.createElement("div");
    message.id = MESSAGE_ID;
    document.documentElement.appendChild(message);
    return message;
  }

  function showMessage_TwT_OwO_R(text) {
    const message = createMessage_TwT_OwO_Q();
    clearTimeout(messageTimer);

    message.textContent = text;
    message.classList.add("is-visible");

    messageTimer = setTimeout(function () {
      message.classList.remove("is-visible");
    }, 1200);
  }

  function createButton_TwT_OwO_S(label, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;

    function run_TwT_OwO_N(event) {
      event.preventDefault();
      event.stopPropagation();

      clearTimeout(hideTimer);

      const el = activeEl;
      if (!isTextInput_TwT_OwO_B(el)) return;

      focusElement_TwT_OwO_T(el);
      handler(el);

      setTimeout(function () {
        if (isTextInput_TwT_OwO_B(el)) focusElement_TwT_OwO_T(el);
        updatePanelPosition_TwT_OwO_p();
      }, 0);
    }

    button.addEventListener("pointerdown", run_TwT_OwO_N, { passive: false });

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

  function focusElement_TwT_OwO_T(el) {
    try {
      el.focus({ preventScroll: true });
    } catch (_) {
      try {
        el.focus();
      } catch (_) {}
    }
  }

  function getText_TwT_OwO_U(el) {
    if (el.isContentEditable) return el.innerText || "";
    return String(el.value || "");
  }

  function setText_TwT_OwO_V(el, text) {
    if (el.isContentEditable) {
      el.innerText = text;
      dispatchInput_TwT_OwO_W(el);
      return;
    }

    el.value = text;
    dispatchInput_TwT_OwO_W(el);
  }

  function dispatchInput_TwT_OwO_W(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function getSelectionRange_TwT_OwO_X(el) {
    if (el.isContentEditable) {
      return getContentEditableSelectionRange_TwT_OwO_Z(el);
    }

    const len = getText_TwT_OwO_U(el).length;
    let start = typeof el.selectionStart === "number" ? el.selectionStart : len;
    let end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;

    start = Math.max(0, Math.min(start, len));
    end = Math.max(0, Math.min(end, len));

    return { start, end };
  }

  function setSelectionRangeSafe_TwT_OwO_Y(el, start, end) {
    if (el.isContentEditable) {
      setContentEditableSelectionRange_TwT_OwO_b(el, start, end);
      return;
    }

    try {
      el.setSelectionRange(start, end);
    } catch (_) {}
  }

  function getContentEditableSelectionRange_TwT_OwO_Z(root) {
    const selection = window.getSelection();
    const text = getText_TwT_OwO_U(root);
    const len = text.length;

    if (!selection || selection.rangeCount === 0) {
      return { start: len, end: len };
    }

    const range = selection.getRangeAt(0);

    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
      return { start: len, end: len };
    }

    const start = getTextOffset_TwT_OwO_a(root, range.startContainer, range.startOffset);
    const end = getTextOffset_TwT_OwO_a(root, range.endContainer, range.endOffset);

    return {
      start: Math.max(0, Math.min(start, len)),
      end: Math.max(0, Math.min(end, len))
    };
  }

  function getTextOffset_TwT_OwO_a(root, targetNode, targetOffset) {
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

  function setContentEditableSelectionRange_TwT_OwO_b(root, start, end) {
    const startPoint = findTextPoint_TwT_OwO_c(root, start);
    const endPoint = findTextPoint_TwT_OwO_c(root, end);

    if (!startPoint || !endPoint) return;

    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function findTextPoint_TwT_OwO_c(root, targetOffset) {
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

  async function copyAllText_TwT_OwO_d(el) {
    const text = getText_TwT_OwO_U(el);

    try {
      await navigator.clipboard.writeText(text);
      showMessage_TwT_OwO_R("コピーしました");
    } catch (_) {
      fallbackCopy_TwT_OwO_e(text);
      showMessage_TwT_OwO_R("コピーしました");
    }
  }

  function fallbackCopy_TwT_OwO_e(text) {
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

  function clearText_TwT_OwO_f(el) {
    setText_TwT_OwO_V(el, "");
    setSelectionRangeSafe_TwT_OwO_Y(el, 0, 0);
    clearRangeAnchor_TwT_OwO_g();
    showMessage_TwT_OwO_R("削除しました");
  }

  function clearRangeAnchor_TwT_OwO_g() {
    rangeAnchorEl = null;
    rangeAnchorPos = null;
  }

  function markOrSelectRange_TwT_OwO_h(el) {
    const range = getSelectionRange_TwT_OwO_X(el);
    const pos = range.end;

    if (rangeAnchorEl !== el || rangeAnchorPos === null) {
      rangeAnchorEl = el;
      rangeAnchorPos = pos;
      showMessage_TwT_OwO_R("開始位置を指定しました");
      return;
    }

    const start = Math.min(rangeAnchorPos, pos);
    const end = Math.max(rangeAnchorPos, pos);

    setSelectionRangeSafe_TwT_OwO_Y(el, start, end);
    clearRangeAnchor_TwT_OwO_g();

    showMessage_TwT_OwO_R(start === end ? "同じ位置です" : "範囲選択しました");
  }

  function selectCurrentBlock_TwT_OwO_i(el) {
    const text = getText_TwT_OwO_U(el);
    const range = getSelectionRange_TwT_OwO_X(el);
    const pos = range.start;
    const block = findParagraphBlock_TwT_OwO_j(text, pos);

    setSelectionRangeSafe_TwT_OwO_Y(el, block.start, block.end);
    clearRangeAnchor_TwT_OwO_g();
    showMessage_TwT_OwO_R("ブロック選択しました");
  }

  function findParagraphBlock_TwT_OwO_j(text, pos) {
    const len = text.length;
    pos = Math.max(0, Math.min(pos, len));

    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const normalizedPos = originalIndexToNormalizedIndex_TwT_OwO_k(text, pos);

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
      start: normalizedIndexToOriginalIndex_TwT_OwO_l(text, start),
      end: normalizedIndexToOriginalIndex_TwT_OwO_l(text, end)
    };
  }

  function originalIndexToNormalizedIndex_TwT_OwO_k(text, originalIndex) {
    let normalizedIndex = 0;

    for (let i = 0; i < originalIndex && i < text.length; i++) {
      if (text[i] === "\r") {
        if (text[i + 1] === "\n") i++;
      }

      normalizedIndex++;
    }

    return normalizedIndex;
  }

  function normalizedIndexToOriginalIndex_TwT_OwO_l(text, normalizedTarget) {
    let normalizedIndex = 0;

    for (let i = 0; i < text.length; i++) {
      if (normalizedIndex >= normalizedTarget) return i;

      if (text[i] === "\r" && text[i + 1] === "\n") i++;
      normalizedIndex++;
    }

    return text.length;
  }

  function showPanelFor_TwT_OwO_m(el) {
    if (Date.now() < panelPausedUntil) return;
    if (!isTextInput_TwT_OwO_B(el)) return;

    activeEl = el;

    const panel = createPanel_TwT_OwO_P();
    panel.classList.add("is-visible");
    updatePanelPosition_TwT_OwO_p();
  }

  function hidePanel_TwT_OwO_n() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.classList.remove("is-visible");
  }

  function hidePanelSoon_TwT_OwO_o() {
    clearTimeout(hideTimer);

    hideTimer = setTimeout(function () {
      hidePanel_TwT_OwO_n();

      if (!isTextInput_TwT_OwO_B(document.activeElement)) {
        activeEl = null;
      }
    }, 180);
  }

  function updatePanelPosition_TwT_OwO_p() {
    const panel = document.getElementById(PANEL_ID);
    const el = activeEl;

    if (!panel || !isTextInput_TwT_OwO_B(el)) return;

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

  function init_TwT_OwO_q() {
    injectStyle_TwT_OwO_O();
    createPanel_TwT_OwO_P();
    createMessage_TwT_OwO_Q();

    document.addEventListener("focusin", function (event) {
      if (isTextInput_TwT_OwO_B(event.target)) {
        showPanelFor_TwT_OwO_m(event.target);
      }
    });

    document.addEventListener("pointerdown", function (event) {
      const target = event.target;

      if (isTextInput_TwT_OwO_B(target)) {
        showPanelFor_TwT_OwO_m(target);
      }
    }, true);

    document.addEventListener("focusout", function () {
      hidePanelSoon_TwT_OwO_o();
    });

    document.addEventListener("selectionchange", function () {
      if (isTextInput_TwT_OwO_B(document.activeElement)) {
        activeEl = document.activeElement;
      }
    });

    window.addEventListener("scroll", function () {
      hidePanel_TwT_OwO_n();
    }, true);

    window.addEventListener("resize", function () {
      hidePanel_TwT_OwO_n();
    });

    startAutoFillWatcher_TwT_OwO_M();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init_TwT_OwO_q);
  } else {
    init_TwT_OwO_q();
  }
})();
