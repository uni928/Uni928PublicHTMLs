// ==UserScript==
// @name Via Text Input Helper Buttons
// @namespace https://uni928.local/
// @version 1.0.0
// @description 入力欄フォーカス中にコピー・貼り付け・削除・前削除・後ろ削除ボタンを表示します。
// @match http*://*/*
// @grant none
// ==/UserScript==

(function () {
  "use strict";

  const PANEL_ID = "via-text-input-helper-panel";
  const STYLE_ID = "via-text-input-helper-style";

  let activeEl = null;
  let hideTimer = null;

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
        "password",
        "number"
      ].includes(type);
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
}
`;
    document.documentElement.appendChild(style);
  }

  function createPanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = PANEL_ID;

    panel.appendChild(createButton("コピー", copyText));
    panel.appendChild(createButton("貼り付け", pasteText));
    panel.appendChild(createButton("削除", clearText));
    panel.appendChild(createButton("前を削除", deleteBeforeCursor));
    panel.appendChild(createButton("後ろを削除", deleteAfterCursor));

    document.documentElement.appendChild(panel);
    return panel;
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
    if (el.isContentEditable) {
      return el.innerText || "";
    }

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
      const sel = window.getSelection();
      const len = getText(el).length;

      if (!sel || sel.rangeCount === 0) {
        return { start: len, end: len };
      }

      return { start: len, end: len };
    }

    const len = getText(el).length;

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

  async function copyText(el) {
    const text = getSelectedOrAllText(el);

    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      fallbackCopy(text);
    }
  }

  function getSelectedOrAllText(el) {
    if (el.isContentEditable) {
      const selected = String(window.getSelection ? window.getSelection() : "");
      return selected || getText(el);
    }

    const text = getText(el);
    const range = getSelectionRange(el);

    if (range.end > range.start) {
      return text.slice(range.start, range.end);
    }

    return text;
  }

  function fallbackCopy(text) {
    const temp = document.createElement("textarea");
    temp.value = text;
    temp.style.position = "fixed";
    temp.style.left = "-9999px";
    temp.style.top = "0";
    document.body.appendChild(temp);
    temp.focus();
    temp.select();

    try {
      document.execCommand("copy");
    } catch (_) {}

    temp.remove();
  }

  async function pasteText(el) {
    let clip = "";

    try {
      clip = await navigator.clipboard.readText();
    } catch (_) {
      const manual = prompt("貼り付ける文字を入力してください。", "");
      if (manual == null) return;
      clip = manual;
    }

    insertAtCursor(el, clip);
  }

  function insertAtCursor(el, insertText) {
    if (el.isContentEditable) {
      document.execCommand("insertText", false, insertText);
      dispatchInput(el);
      return;
    }

    const text = getText(el);
    const range = getSelectionRange(el);

    const before = text.slice(0, range.start);
    const after = text.slice(range.end);
    const next = before + insertText + after;
    const nextPos = before.length + insertText.length;

    setText(el, next);
    setSelectionRangeSafe(el, nextPos, nextPos);
  }

  function clearText(el) {
    setText(el, "");

    if (!el.isContentEditable) {
      setSelectionRangeSafe(el, 0, 0);
    }
  }

  function deleteBeforeCursor(el) {
    if (el.isContentEditable) {
      // contenteditableは正確なカーソル位置取得が複雑なので全削除寄りにしない
      document.execCommand("delete", false);
      dispatchInput(el);
      return;
    }

    const text = getText(el);
    const range = getSelectionRange(el);

    const before = text.slice(0, range.start);
    const after = text.slice(range.end);

    // 選択範囲がある場合は選択範囲だけ削除
    if (range.end > range.start) {
      const next = before + after;
      setText(el, next);
      setSelectionRangeSafe(el, range.start, range.start);
      return;
    }

    // 現在位置より前を削除。入力位置は削除した分だけ前、つまり0へ移動
    setText(el, text.slice(range.start));
    setSelectionRangeSafe(el, 0, 0);
  }

  function deleteAfterCursor(el) {
    if (el.isContentEditable) {
      document.execCommand("forwardDelete", false);
      dispatchInput(el);
      return;
    }

    const text = getText(el);
    const range = getSelectionRange(el);

    const before = text.slice(0, range.start);
    const after = text.slice(range.end);

    // 選択範囲がある場合は選択範囲だけ削除
    if (range.end > range.start) {
      const next = before + after;
      setText(el, next);
      setSelectionRangeSafe(el, range.start, range.start);
      return;
    }

    // 現在位置より後ろを削除。入力位置はそのまま
    setText(el, before);
    setSelectionRangeSafe(el, before.length, before.length);
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

    // 下に出せない場合は上に出す
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
