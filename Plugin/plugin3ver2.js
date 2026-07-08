// ==UserScript==
// @name Via Text Input Helper Buttons
// @namespace https://uni928.local/
// @version 2.0.1
// @description 入力欄フォーカス中にコピー・削除・範囲選択指定・ブロック選択ボタンを表示します。
// @match http*://*/*
// @grant none
// ==/UserScript==

(function () {
  "use strict";

  const PANEL_ID = "via-text-input-helper-panel";
  const STYLE_ID = "via-text-input-helper-style";
  const MESSAGE_ID = "via-text-input-helper-message";

  let activeEl = null;
  let hideTimer = null;
  let messageTimer = null;

  // 範囲選択指定用：1回目のカーソル位置を保存
  let rangeAnchorEl = null;
  let rangeAnchorPos = null;

  function isTextInput(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;

    if (el.tagName === "INPUT") {
      const type = String(el.type || "text").toLowerCase();
      return ["text", "search", "url", "tel", "email", "password", "number"].includes(type);
    }

    if (el.isContentEditable) return true;
    return false;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
@layer viaTextInputHelper {
  /* 入力欄用の補助ボタンパネル */
  #${PANEL_ID} {
    position: fixed;
    z-index: 2147483647;
    display: none;
    flex-wrap: wrap;
    gap: 6px;
    max-width: calc(100vw - 12px);
    padding: 6px;
    border-radius: 10px;
    background: rgba(20, 20, 20, 0.88);
    box-shadow: 0 4px 16px rgba(0, 0, 0, .25);
    box-sizing: border-box;
  }

  #${PANEL_ID}.is-visible {
    display: flex;
  }

  #${PANEL_ID} button {
    border: 0;
    border-radius: 8px;
    padding: 8px 10px;
    background: #fff6d8;
    color: #111;
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
  }

  #${PANEL_ID} button:active {
    transform: translateY(1px);
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
    panel.appendChild(createButton("ブロック選択", selectCurrentBlock));

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
        focusElement(el);
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
    const len = getText(el).length;

    if (el.isContentEditable) {
      return { start: len, end: len };
    }

    let start = typeof el.selectionStart === "number" ? el.selectionStart : len;
    let end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;

    start = Math.max(0, Math.min(start, len));
    end = Math.max(0, Math.min(end, len));

    return { start, end };
  }

  function setSelectionRangeSafe(el, start, end) {
    if (el.isContentEditable) return;

    try {
      el.setSelectionRange(start, end);
    } catch (_) {}
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

    if (!el.isContentEditable) {
      setSelectionRangeSafe(el, 0, 0);
    }

    clearRangeAnchor();
    showMessage("削除しました");
  }

  function clearRangeAnchor() {
    rangeAnchorEl = null;
    rangeAnchorPos = null;
  }

  function markOrSelectRange(el) {
    if (el.isContentEditable) {
      showMessage("通常入力欄のみ対応です");
      return;
    }

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

    if (start === end) {
      showMessage("同じ位置です");
    } else {
      showMessage("範囲選択しました");
    }
  }

  function selectCurrentBlock(el) {
    if (el.isContentEditable) {
      selectContentEditableBlock(el);
      return;
    }

    const text = getText(el);
    const range = getSelectionRange(el);
    const pos = range.start;

    let start = text.lastIndexOf("\n\n", Math.max(0, pos - 1));
    start = start === -1 ? 0 : start + 1;

    let end = text.indexOf("\n\n", pos);
    end = end === -1 ? text.length : end;

    setSelectionRangeSafe(el, start, end);
    clearRangeAnchor();
    showMessage("ブロック選択しました");
  }

  function selectContentEditableBlock(el) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      showMessage("選択できませんでした");
      return;
    }

    const text = el.innerText || "";
    if (!text) {
      showMessage("空です");
      return;
    }

    // contentEditableはDOM構造差が大きいため、現在行全体をexecCommandで選ぶのは不安定。
    // ここではブラウザ標準の行選択に近い操作として現在段落を選択します。
    try {
      document.execCommand("selectAll", false);
      showMessage("ブロック選択しました");
    } catch (_) {
      showMessage("選択できませんでした");
    }
  }

  function showPanelFor(el) {
    if (!isTextInput(el)) return;

    activeEl = el;

    const panel = createPanel();
    panel.classList.add("is-visible");

    updatePanelPosition();
  }

  function hidePanelSoon() {
    clearTimeout(hideTimer);

    hideTimer = setTimeout(function () {
      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        panel.classList.remove("is-visible");
      }

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

    let left = rect.left;
    let top = rect.bottom + 6;

    const maxLeft = window.innerWidth - panelRect.width - 6;

    if (left > maxLeft) left = maxLeft;
    if (left < 6) left = 6;

    if (top + panelRect.height > window.innerHeight - 6) {
      top = rect.top - panelRect.height - 6;
    }

    if (top < 6) top = 6;

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

    document.addEventListener("focusout", function () {
      hidePanelSoon();
    });

    document.addEventListener("selectionchange", function () {
      if (isTextInput(document.activeElement)) {
        activeEl = document.activeElement;
        updatePanelPosition();
      }
    });

    window.addEventListener("scroll", updatePanelPosition, true);
    window.addEventListener("resize", updatePanelPosition);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
