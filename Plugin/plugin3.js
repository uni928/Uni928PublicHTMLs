// ==UserScript==
// @name Via Text Input Helper Buttons
// @namespace https://uni928.local/
// @version 3.4.0
// @description 入力欄フォーカス中にコピー・削除・範囲選択指定を表示し、旧バージョンの記憶データが残っている場合は自動削除します。
// @match http*://*/*
// @grant none
// ==/UserScript==

(function () {
  "use strict";

  const PANEL_ID = "via-text-input-helper-panel";
  const OTHER_PANEL_ID = "via-text-input-helper-other-panel";
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

    if (el.tagName === "TEXTAREA") {
      return true;
    }

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
    if (!isTextInput_TwT_OwO_B(el)) {
      return false;
    }

    if (el.tagName === "INPUT") {
      const type = String(el.type || "").toLowerCase();

      if (type === "password") return false;
      if (type === "email") return false;
      if (type === "tel") return false;
    }

    if (isSensitiveInput_TwT_OwO_D(el)) {
      return false;
    }

    return true;
  }

  // 危険そうな入力欄は記憶しません。
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
    if (el.id) {
      return "id:" + el.id;
    }

    if (el.name) {
      return "name:" + el.name;
    }

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
          db.createObjectStore(STORE_NAME, {
            keyPath: "key"
          });
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

        tx.oncomplete = function () {
          resolve();
        };

        tx.onerror = function () {
          reject(tx.error);
        };

        tx.onabort = function () {
          reject(tx.error);
        };
      });

      db.close();
      showMessage_TwT_OwO_R("記憶しました");
    } catch (_) {
      showMessage_TwT_OwO_R("記憶に失敗しました");
    }
  }

  async function clearAllMemory_TwT_OwO_J() {
    const accepted = window.confirm(
      "保存されている記憶をすべて削除します。\nこの操作は元に戻せません。\n\n削除しますか？"
    );

    if (!accepted) {
      showMessage_TwT_OwO_R("削除を中止しました");
      return;
    }

    try {
      const db = await openDb_TwT_OwO_H();

      await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        store.clear();

        tx.oncomplete = function () {
          resolve();
        };

        tx.onerror = function () {
          reject(tx.error);
        };

        tx.onabort = function () {
          reject(tx.error);
        };
      });

      db.close();

      showMainPanel_TwT_OwO_r();
      showMessage_TwT_OwO_R("記憶を全削除しました");
    } catch (_) {
      showMessage_TwT_OwO_R("記憶の削除に失敗しました");
    }
  }

  async function loadMemoryForElement_TwT_OwO_K(el) {
    if (!isMemoryTarget_TwT_OwO_C(el)) {
      return null;
    }

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

  async function autoFillRememberedInputs_TwT_OwO_L() {
    const targets = Array.from(
      document.querySelectorAll(
        "textarea, input, [contenteditable='true'], [contenteditable='']"
      )
    ).filter(isMemoryTarget_TwT_OwO_C);

    for (const el of targets) {
      const current = getText_TwT_OwO_U(el);

      if (current.trim()) {
        continue;
      }

      const data = await loadMemoryForElement_TwT_OwO_K(el);

      if (
        data &&
        typeof data.text === "string" &&
        data.text
      ) {
        setText_TwT_OwO_V(el, data.text);
        markAutoFilled_TwT_OwO_M(el);
      }
    }
  }

  function markAutoFilled_TwT_OwO_M(el) {
    try {
      el.setAttribute("data-via-helper-autofilled", "1");
    } catch (_) {}
  }

  function startAutoFillWatcher_TwT_OwO_N() {
    let runCount = 0;
    const maxRunCount = 2;

    function run_TwT_OwO_O() {
      runCount++;
      autoFillRememberedInputs_TwT_OwO_L();

      if (runCount < maxRunCount) {
        setTimeout(run_TwT_OwO_O, 1000);
      }
    }

    // サイトを開いて放置した場合でも、0.1秒後から自動入力を試します。
    setTimeout(run_TwT_OwO_O, 100);

    // GitHubなど、入力欄が後から追加されるサイト向けです。
    const observer = new MutationObserver(function () {
      autoFillRememberedInputs_TwT_OwO_L();
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

  // 旧バージョンで保存済みの記憶が存在する場合だけ、自動で全削除します。
  // indexedDB.databases() が使えない環境では、新規DB作成を避けるため何もしません。
  async function clearExistingMemoryAutomatically_TwT_OwO_AA() {
    if (
      !window.indexedDB ||
      typeof indexedDB.databases !== "function"
    ) {
      return;
    }

    try {
      const databases = await indexedDB.databases();
      const exists = databases.some(function (info) {
        return info && info.name === DB_NAME;
      });

      if (!exists) {
        return;
      }

      const db = await new Promise(function (resolve, reject) {
        const req = indexedDB.open(DB_NAME);

        req.onsuccess = function () {
          resolve(req.result);
        };

        req.onerror = function () {
          reject(req.error);
        };

        req.onupgradeneeded = function () {
          try {
            req.transaction.abort();
          } catch (_) {}
        };
      });

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.close();
        return;
      }

      const count = await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.count();

        req.onsuccess = function () {
          resolve(req.result || 0);
        };

        req.onerror = function () {
          reject(req.error);
        };
      });

      if (count <= 0) {
        db.close();
        return;
      }

      await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        store.clear();

        tx.oncomplete = resolve;
        tx.onerror = function () {
          reject(tx.error);
        };
        tx.onabort = function () {
          reject(tx.error);
        };
      });

      db.close();
      showMessage_TwT_OwO_R("旧バージョンの記憶を全削除しました");
    } catch (_) {
      // 削除失敗時も入力補助機能は継続します。
    }
  }

  function injectStyle_TwT_OwO_P() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;

    style.textContent = `
@layer viaTextInputHelperBase, viaTextInputHelperPanels, viaTextInputHelperButtons, viaTextInputHelperMessage;

@layer viaTextInputHelperBase {
  #${PANEL_ID},
  #${OTHER_PANEL_ID},
  #${MESSAGE_ID} {
    box-sizing: border-box;
  }

  #${PANEL_ID} *,
  #${OTHER_PANEL_ID} *,
  #${MESSAGE_ID} * {
    box-sizing: border-box;
  }
}

@layer viaTextInputHelperPanels {
  /* メインパネルとその他パネル */
  #${PANEL_ID},
  #${OTHER_PANEL_ID} {
    position: fixed;
    z-index: 2147483647;
    display: none;
    flex-wrap: wrap;
    gap: 6px;
    max-width: calc(100vw - 20px);
    padding: 6px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    background: rgba(20, 20, 20, 0.92);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  }

  #${PANEL_ID}.is-visible,
  #${OTHER_PANEL_ID}.is-visible {
    display: flex;
  }

  #${OTHER_PANEL_ID} {
    min-width: 120px;
  }
}

@layer viaTextInputHelperButtons {
  /* サイト側CSSで文字色が潰れるのを防ぎます。 */
  #${PANEL_ID} button,
  #${OTHER_PANEL_ID} button {
    appearance: none;
    -webkit-appearance: none;
    min-height: 34px;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid rgba(0, 0, 0, 0.28);
    border-radius: 8px;
    background: #fff6d8;
    color: #111111;
    -webkit-text-fill-color: #111111;
    text-shadow: none;
    font: 700 13px/1.1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0.02em;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
  }

  #${PANEL_ID} button:active,
  #${OTHER_PANEL_ID} button:active {
    transform: translateY(1px);
  }

  /* その他ボタン */
  #${PANEL_ID} .via-helper-other-btn {
    background: #dbeeff;
    color: #071f35;
    -webkit-text-fill-color: #071f35;
    border-color: rgba(7, 31, 53, 0.28);
  }

  /* 記憶ボタン */
  #${OTHER_PANEL_ID} .via-helper-memory-btn {
    background: #d8ffe4;
    color: #082b13;
    -webkit-text-fill-color: #082b13;
    border-color: rgba(8, 43, 19, 0.28);
  }

  /* 記憶全削除ボタン */
  #${OTHER_PANEL_ID} .via-helper-delete-memory-btn {
    background: #ffdddd;
    color: #3a0505;
    -webkit-text-fill-color: #3a0505;
    border-color: rgba(58, 5, 5, 0.28);
  }

  /* 戻るボタン */
  #${OTHER_PANEL_ID} .via-helper-back-btn {
    background: #eeeeee;
    color: #181818;
    -webkit-text-fill-color: #181818;
    border-color: rgba(24, 24, 24, 0.28);
  }

  /* 閉じるボタン */
  #${PANEL_ID} .via-helper-close-btn,
  #${OTHER_PANEL_ID} .via-helper-close-btn {
    background: #ffd8d8;
    color: #3a0505;
    -webkit-text-fill-color: #3a0505;
    border-color: rgba(58, 5, 5, 0.28);
  }
}

@layer viaTextInputHelperMessage {
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
    font: 500 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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

  function createPanel_TwT_OwO_Q() {
    let panel = document.getElementById(PANEL_ID);

    if (panel) {
      return panel;
    }

    panel = document.createElement("div");
    panel.id = PANEL_ID;

    panel.appendChild(
      createInputButton_TwT_OwO_T(
        "コピー",
        copyAllText_TwT_OwO_d
      )
    );

    panel.appendChild(
      createInputButton_TwT_OwO_T(
        "削除",
        clearText_TwT_OwO_f
      )
    );

    panel.appendChild(
      createInputButton_TwT_OwO_T(
        "範囲選択指定",
        markOrSelectRange_TwT_OwO_h
      )
    );

    // panel.appendChild(
    //   createInputButton_TwT_OwO_T(
    //     "ブロック選択",
    //     selectCurrentBlock_TwT_OwO_i
    //   )
    // );

    // 「その他」機能は廃止したため、ボタンをコメントアウトしています。
    // const otherBtn = createPanelButton_TwT_OwO_U(
    //   "その他",
    //   function () {
    //     showOtherPanel_TwT_OwO_s();
    //   }
    // );
    //
    // otherBtn.classList.add("via-helper-other-btn");
    // panel.appendChild(otherBtn);

    const closeBtn = createPanelButton_TwT_OwO_U(
      "閉じる",
      closePanelsTemporarily_TwT_OwO_t
    );

    closeBtn.classList.add("via-helper-close-btn");
    panel.appendChild(closeBtn);

    document.documentElement.appendChild(panel);

    return panel;
  }

  function createOtherPanel_TwT_OwO_R() {
    let panel = document.getElementById(OTHER_PANEL_ID);

    if (panel) {
      return panel;
    }

    panel = document.createElement("div");
    panel.id = OTHER_PANEL_ID;

    const memoryBtn = createInputButton_TwT_OwO_T(
      "記憶",
      saveMemory_TwT_OwO_I
    );

    memoryBtn.classList.add("via-helper-memory-btn");
    panel.appendChild(memoryBtn);

    const deleteMemoryBtn = createPanelButton_TwT_OwO_U(
      "記憶全削除",
      function () {
        clearAllMemory_TwT_OwO_J();
      }
    );

    deleteMemoryBtn.classList.add("via-helper-delete-memory-btn");
    panel.appendChild(deleteMemoryBtn);

    const backBtn = createPanelButton_TwT_OwO_U(
      "戻る",
      function () {
        showMainPanel_TwT_OwO_r();
      }
    );

    backBtn.classList.add("via-helper-back-btn");
    panel.appendChild(backBtn);

    const closeBtn = createPanelButton_TwT_OwO_U(
      "閉じる",
      closePanelsTemporarily_TwT_OwO_t
    );

    closeBtn.classList.add("via-helper-close-btn");
    panel.appendChild(closeBtn);

    document.documentElement.appendChild(panel);

    return panel;
  }

  function createMessage_TwT_OwO_S() {
    let message = document.getElementById(MESSAGE_ID);

    if (message) {
      return message;
    }

    message = document.createElement("div");
    message.id = MESSAGE_ID;

    document.documentElement.appendChild(message);

    return message;
  }

  function showMessage_TwT_OwO_R(text) {
    const message = createMessage_TwT_OwO_S();

    clearTimeout(messageTimer);

    message.textContent = text;
    message.classList.add("is-visible");

    messageTimer = setTimeout(function () {
      message.classList.remove("is-visible");
    }, 1200);
  }

  // 入力欄を操作するボタンを作成します。
  function createInputButton_TwT_OwO_T(label, handler) {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = label;

    function run_TwT_OwO_V(event) {
      event.preventDefault();
      event.stopPropagation();

      clearTimeout(hideTimer);

      const el = activeEl;

      if (!isTextInput_TwT_OwO_B(el)) {
        showMessage_TwT_OwO_R("入力欄が選択されていません");
        return;
      }

      focusElement_TwT_OwO_W(el);
      handler(el);

      setTimeout(function () {
        if (isTextInput_TwT_OwO_B(el)) {
          focusElement_TwT_OwO_W(el);
        }

        updatePanelPosition_TwT_OwO_p();
      }, 0);
    }

    addButtonEvents_TwT_OwO_X(button, run_TwT_OwO_V);

    return button;
  }

  // 入力欄を必要としないパネル操作用ボタンを作成します。
  function createPanelButton_TwT_OwO_U(label, handler) {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = label;

    function run_TwT_OwO_V(event) {
      event.preventDefault();
      event.stopPropagation();

      clearTimeout(hideTimer);
      handler();

      setTimeout(function () {
        updatePanelPosition_TwT_OwO_p();
      }, 0);
    }

    addButtonEvents_TwT_OwO_X(button, run_TwT_OwO_V);

    return button;
  }

  function addButtonEvents_TwT_OwO_X(button, handler) {
    button.addEventListener(
      "pointerdown",
      handler,
      {
        passive: false
      }
    );

    button.addEventListener(
      "touchend",
      function (event) {
        event.preventDefault();
        event.stopPropagation();
      },
      {
        passive: false
      }
    );

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
    });
  }

  function focusElement_TwT_OwO_W(el) {
    try {
      el.focus({
        preventScroll: true
      });
    } catch (_) {
      try {
        el.focus();
      } catch (_) {}
    }
  }

  function getText_TwT_OwO_U(el) {
    if (el.isContentEditable) {
      return el.innerText || "";
    }

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
    el.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );

    el.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );
  }

  function getSelectionRange_TwT_OwO_X(el) {
    if (el.isContentEditable) {
      return getContentEditableSelectionRange_TwT_OwO_Z(el);
    }

    const len = getText_TwT_OwO_U(el).length;

    let start = typeof el.selectionStart === "number"
      ? el.selectionStart
      : len;

    let end = typeof el.selectionEnd === "number"
      ? el.selectionEnd
      : start;

    start = Math.max(0, Math.min(start, len));
    end = Math.max(0, Math.min(end, len));

    return {
      start,
      end
    };
  }

  function setSelectionRangeSafe_TwT_OwO_Y(el, start, end) {
    if (el.isContentEditable) {
      setContentEditableSelectionRange_TwT_OwO_b(
        el,
        start,
        end
      );

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
      return {
        start: len,
        end: len
      };
    }

    if (
      !root.contains(selection.anchorNode) ||
      !root.contains(selection.focusNode)
    ) {
      return {
        start: len,
        end: len
      };
    }

    let startNode = selection.anchorNode;
    let startOffset = selection.anchorOffset;
    let endNode = selection.focusNode;
    let endOffset = selection.focusOffset;

    // 後ろから前へ選択している場合は入れ替えます。
    const pos = startNode.compareDocumentPosition(endNode);

    if (
      (pos & Node.DOCUMENT_POSITION_PRECEDING) ||
      (
        startNode === endNode &&
        startOffset > endOffset
      )
    ) {
      [startNode, endNode] = [
        endNode,
        startNode
      ];

      [startOffset, endOffset] = [
        endOffset,
        startOffset
      ];
    }

    const start = getTextOffset_TwT_OwO_a(
      root,
      startNode,
      startOffset
    );

    const end = getTextOffset_TwT_OwO_a(
      root,
      endNode,
      endOffset
    );

    return {
      start: Math.max(0, Math.min(start, len)),
      end: Math.max(0, Math.min(end, len))
    };
  }

  function getTextOffset_TwT_OwO_a(
    root,
    targetNode,
    targetOffset
  ) {
    let offset = 0;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT
    );

    while (walker.nextNode()) {
      const node = walker.currentNode;

      if (node === targetNode) {
        return offset + targetOffset;
      }

      offset += node.nodeValue.length;
    }

    return offset;
  }

  function setContentEditableSelectionRange_TwT_OwO_b(
    root,
    start,
    end
  ) {
    const startPoint = findTextPoint_TwT_OwO_c(
      root,
      start
    );

    const endPoint = findTextPoint_TwT_OwO_c(
      root,
      end
    );

    if (!startPoint || !endPoint) {
      return;
    }

    const range = document.createRange();

    range.setStart(
      startPoint.node,
      startPoint.offset
    );

    range.setEnd(
      endPoint.node,
      endPoint.offset
    );

    const selection = window.getSelection();

    selection.removeAllRanges();
    selection.addRange(range);
  }

  function findTextPoint_TwT_OwO_c(
    root,
    targetOffset
  ) {
    let currentOffset = 0;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT
    );

    let lastTextNode = null;

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const nextOffset = currentOffset + node.nodeValue.length;

      if (targetOffset <= nextOffset) {
        return {
          node,
          offset: Math.max(
            0,
            targetOffset - currentOffset
          )
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

    root.appendChild(
      document.createTextNode("")
    );

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

    if (
      rangeAnchorEl !== el ||
      rangeAnchorPos === null
    ) {
      rangeAnchorEl = el;
      rangeAnchorPos = pos;

      showMessage_TwT_OwO_R("開始位置を指定しました");
      return;
    }

    const start = Math.min(
      rangeAnchorPos,
      pos
    );

    const end = Math.max(
      rangeAnchorPos,
      pos
    );

    setSelectionRangeSafe_TwT_OwO_Y(
      el,
      start,
      end
    );

    clearRangeAnchor_TwT_OwO_g();

    showMessage_TwT_OwO_R(
      start === end
        ? "同じ位置です"
        : "範囲選択しました"
    );
  }

  function selectCurrentBlock_TwT_OwO_i(el) {
    const text = getText_TwT_OwO_U(el);
    const range = getSelectionRange_TwT_OwO_X(el);
    const pos = range.start;

    const block = findParagraphBlock_TwT_OwO_j(
      text,
      pos
    );

    setSelectionRangeSafe_TwT_OwO_Y(
      el,
      block.start,
      block.end
    );

    clearRangeAnchor_TwT_OwO_g();

    showMessage_TwT_OwO_R("ブロック選択しました");
  }

  function findParagraphBlock_TwT_OwO_j(text, pos) {
    const len = text.length;

    pos = Math.max(
      0,
      Math.min(pos, len)
    );

    const normalized = text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

    const normalizedPos =
      originalIndexToNormalizedIndex_TwT_OwO_k(
        text,
        pos
      );

    let start = 0;
    let end = normalized.length;

    const before = normalized.slice(
      0,
      normalizedPos
    );

    const after = normalized.slice(
      normalizedPos
    );

    const beforeIndex = before.lastIndexOf("\n\n");

    if (beforeIndex !== -1) {
      start = beforeIndex + 2;
    }

    const afterIndex = after.indexOf("\n\n");

    if (afterIndex !== -1) {
      end = normalizedPos + afterIndex;
    }

    while (
      start < end &&
      normalized[start] === "\n"
    ) {
      start++;
    }

    while (
      end > start &&
      normalized[end - 1] === "\n"
    ) {
      end--;
    }

    return {
      start: normalizedIndexToOriginalIndex_TwT_OwO_l(
        text,
        start
      ),
      end: normalizedIndexToOriginalIndex_TwT_OwO_l(
        text,
        end
      )
    };
  }

  function originalIndexToNormalizedIndex_TwT_OwO_k(
    text,
    originalIndex
  ) {
    let normalizedIndex = 0;

    for (
      let i = 0;
      i < originalIndex && i < text.length;
      i++
    ) {
      if (text[i] === "\r") {
        if (text[i + 1] === "\n") {
          i++;
        }
      }

      normalizedIndex++;
    }

    return normalizedIndex;
  }

  function normalizedIndexToOriginalIndex_TwT_OwO_l(
    text,
    normalizedTarget
  ) {
    let normalizedIndex = 0;

    for (
      let i = 0;
      i < text.length;
      i++
    ) {
      if (normalizedIndex >= normalizedTarget) {
        return i;
      }

      if (
        text[i] === "\r" &&
        text[i + 1] === "\n"
      ) {
        i++;
      }

      normalizedIndex++;
    }

    return text.length;
  }

  function showPanelFor_TwT_OwO_m(el) {
    if (Date.now() < panelPausedUntil) {
      return;
    }

    if (!isTextInput_TwT_OwO_B(el)) {
      return;
    }

    activeEl = el;

    createPanel_TwT_OwO_Q();
    // createOtherPanel_TwT_OwO_R();

    showMainPanel_TwT_OwO_r();
  }

  function hidePanel_TwT_OwO_n() {
    const panel = document.getElementById(PANEL_ID);

    if (panel) {
      panel.classList.remove("is-visible");
    }
  }

  function hideOtherPanel_TwT_OwO_o() {
    const panel = document.getElementById(OTHER_PANEL_ID);

    if (panel) {
      panel.classList.remove("is-visible");
    }
  }

  function hideAllPanels_TwT_OwO_q() {
    hidePanel_TwT_OwO_n();
    hideOtherPanel_TwT_OwO_o();
  }

  function showMainPanel_TwT_OwO_r() {
    if (Date.now() < panelPausedUntil) {
      return;
    }

    const mainPanel = createPanel_TwT_OwO_Q();
    // const otherPanel = createOtherPanel_TwT_OwO_R();

    // otherPanel.classList.remove("is-visible");
    mainPanel.classList.add("is-visible");

    updatePanelPosition_TwT_OwO_p();
  }

  function showOtherPanel_TwT_OwO_s() {
    if (Date.now() < panelPausedUntil) {
      return;
    }

    const mainPanel = createPanel_TwT_OwO_Q();
    const otherPanel = createOtherPanel_TwT_OwO_R();

    mainPanel.classList.remove("is-visible");
    otherPanel.classList.add("is-visible");

    updatePanelPosition_TwT_OwO_p();
  }

  function closePanelsTemporarily_TwT_OwO_t() {
    panelPausedUntil = Date.now() + 10000;

    hideAllPanels_TwT_OwO_q();
    clearRangeAnchor_TwT_OwO_g();
  }

  function hidePanelSoon_TwT_OwO_o() {
    clearTimeout(hideTimer);

    hideTimer = setTimeout(function () {
      hideAllPanels_TwT_OwO_q();

      if (
        !isTextInput_TwT_OwO_B(
          document.activeElement
        )
      ) {
        activeEl = null;
      }
    }, 180);
  }

  function getVisiblePanel_TwT_OwO_u() {
    const otherPanel = document.getElementById(
      OTHER_PANEL_ID
    );

    if (
      otherPanel &&
      otherPanel.classList.contains("is-visible")
    ) {
      return otherPanel;
    }

    const mainPanel = document.getElementById(
      PANEL_ID
    );

    if (
      mainPanel &&
      mainPanel.classList.contains("is-visible")
    ) {
      return mainPanel;
    }

    return null;
  }

  function updatePanelPosition_TwT_OwO_p() {
    const panel = getVisiblePanel_TwT_OwO_u();
    const el = activeEl;

    if (
      !panel ||
      !isTextInput_TwT_OwO_B(el)
    ) {
      return;
    }

    const rect = el.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    let left = rect.right + 12;
    let top = rect.bottom + 12;

    if (
      left + panelRect.width >
      window.innerWidth - 10
    ) {
      left = rect.left - panelRect.width - 12;
    }

    if (left < 10) {
      left = Math.max(
        10,
        window.innerWidth - panelRect.width - 10
      );
    }

    if (
      top + panelRect.height >
      window.innerHeight - 10
    ) {
      top = rect.top - panelRect.height - 12;
    }

    if (top < 10) {
      top = 10;
    }

    panel.style.left = left + "px";
    panel.style.top = top + "px";
  }

  function isInsideHelperPanel_TwT_OwO_v(target) {
    if (!(target instanceof Node)) {
      return false;
    }

    const mainPanel = document.getElementById(
      PANEL_ID
    );

    const otherPanel = document.getElementById(
      OTHER_PANEL_ID
    );

    return !!(
      (mainPanel && mainPanel.contains(target)) ||
      (otherPanel && otherPanel.contains(target))
    );
  }

  function init_TwT_OwO_q() {
    injectStyle_TwT_OwO_P();
    createPanel_TwT_OwO_Q();
    // createOtherPanel_TwT_OwO_R();
    createMessage_TwT_OwO_S();

    document.addEventListener("focusin", function (event) {
      if (isTextInput_TwT_OwO_B(event.target)) {
        showPanelFor_TwT_OwO_m(event.target);
      }
    });

    document.addEventListener(
      "pointerdown",
      function (event) {
        const target = event.target;

        if (isInsideHelperPanel_TwT_OwO_v(target)) {
          clearTimeout(hideTimer);
          return;
        }

        if (isTextInput_TwT_OwO_B(target)) {
          showPanelFor_TwT_OwO_m(target);
        }
      },
      true
    );

    document.addEventListener("focusout", function (event) {
      const relatedTarget = event.relatedTarget;

      if (isInsideHelperPanel_TwT_OwO_v(relatedTarget)) {
        return;
      }

      hidePanelSoon_TwT_OwO_o();
    });

    document.addEventListener("selectionchange", function () {
      if (
        isTextInput_TwT_OwO_B(
          document.activeElement
        )
      ) {
        activeEl = document.activeElement;
      }
    });

    window.addEventListener(
      "scroll",
      function () {
        hideAllPanels_TwT_OwO_q();
      },
      true
    );

    window.addEventListener("resize", function () {
      hideAllPanels_TwT_OwO_q();
    });

    // 記憶機能は廃止したため、自動入力は開始しません。
    // startAutoFillWatcher_TwT_OwO_N();

    clearExistingMemoryAutomatically_TwT_OwO_AA();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init_TwT_OwO_q
    );
  } else {
    init_TwT_OwO_q();
  }
})();
