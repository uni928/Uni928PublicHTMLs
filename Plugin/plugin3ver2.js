// ==UserScript==
// @name Via Text Input Helper Buttons
// @namespace https://uni928.local/
// @version 2.2.0
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

  let rangeAnchorEl = null;
  let rangeAnchorPos = null;

  let isVisible = true;

  function isTextInput(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;

    if (el.tagName === "INPUT") {
      const type = String(el.type || "text").toLowerCase();
      return ["text", "search", "url", "tel", "email", "password", "number"].includes(type);
    }

    return !!el.isContentEditable;
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
    if(!isVisible) return null;
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = PANEL_ID;

    panel.appendChild(createButton("コピー", copyAllText));
    panel.appendChild(createButton("削除", clearText));
    panel.appendChild(createButton("範囲選択指定", markOrSelectRange));
    panel.appendChild(createButton("ブロック選択", selectCurrentBlock));
    panel.appendChild(createButton("この画面中は閉じる", setVisible));

    document.documentElement.appendChild(panel);
    return panel;
  }

  function setVisible() {
    isVisible = false;
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

    const start = findParagraphStart(text, pos);
    const end = findParagraphEnd(text, pos);

    setSelectionRangeSafe(el, start, end);
    clearRangeAnchor();

    showMessage("ブロック選択しました");
  }

  function findParagraphStart(text, pos) {
    const before = text.slice(0, pos);
    const index = before.lastIndexOf("\n\n");
    return index === -1 ? 0 : index + 2;
  }

  function findParagraphEnd(text, pos) {
    const index = text.indexOf("\n\n", pos);
    return index === -1 ? text.length : index;
  }

  function showPanelFor(el) {
    if (!isTextInput(el)) return;

    activeEl = el;
    createPanel().classList.add("is-visible");
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

    let left = rect.right - panelRect.width;
    let top = rect.bottom + 6;

    if (left < 6) left = 6;
    if (left + panelRect.width > window.innerWidth - 6) {
      left = window.innerWidth - panelRect.width - 6;
    }

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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
