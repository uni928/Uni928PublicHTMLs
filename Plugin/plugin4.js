// ==UserScript==
// @name         Click Guard Confirm with Dynamic Button Watch
// @namespace    uni928-click-guard
// @version      1.1.0
// @description  後から追加されたボタン・広告・外部リンク・危険操作っぽいクリック前に確認する
// @match        *://*/*
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  const STORAGE_KEY_ALLOW_LIST = "uni928_click_guard_allow_list_v1";

  const GUARD_STATE = {
    bypassNext: false,
    lastConfirmTime: 0,
    initialScanDone: false
  };

  const knownInitialElements = new WeakSet();
  const dynamicElements = new WeakSet();

  const DANGEROUS_WORDS = [
    "購入",
    "注文",
    "決済",
    "支払い",
    "課金",
    "登録",
    "送信",
    "削除",
    "退会",
    "解約",
    "同意",
    "許可",
    "申し込む",
    "今すぐ",
    "ダウンロード",
    "インストール",
    "開く",
    "移動",
    "広告",
    "PR",
    "スポンサー",
    "sponsored",
    "ad",
    "buy",
    "purchase",
    "pay",
    "subscribe",
    "delete",
    "send",
    "submit",
    "install",
    "download",
    "open"
  ];

  const AD_HINTS = [
    "ad",
    "ads",
    "advert",
    "advertisement",
    "sponsor",
    "sponsored",
    "promotion",
    "promoted",
    "pr",
    "banner",
    "affiliate",
    "doubleclick",
    "googlesyndication",
    "adservice",
    "adnxs",
    "outbrain",
    "taboola"
  ];

  function normalizeText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function loadAllowList() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_ALLOW_LIST);
      const list = JSON.parse(raw || "[]");
      return Array.isArray(list) ? list.filter(Boolean) : [];
    } catch (e) {
      return [];
    }
  }

  function saveAllowList(list) {
    try {
      const unique = Array.from(new Set(list.filter(Boolean)));
      localStorage.setItem(STORAGE_KEY_ALLOW_LIST, JSON.stringify(unique));
    } catch (e) {
      // localStorage が使えない場合は何もしない
    }
  }

  function getAllowKeyFromUrl(url) {
    try {
      const u = new URL(url, location.href);
      return u.protocol + "//" + u.host;
    } catch (e) {
      return "";
    }
  }

  function isAllowedUrl(url) {
    const key = getAllowKeyFromUrl(url);
    if (!key) return false;

    const allowList = loadAllowList();

    return allowList.some(allowed => {
      return key === allowed || key.startsWith(allowed);
    });
  }

  function addAllowUrl(url) {
    const key = getAllowKeyFromUrl(url);
    if (!key) return;

    const allowList = loadAllowList();

    if (!allowList.includes(key)) {
      allowList.push(key);
      saveAllowList(allowList);
    }
  }

  function getClickableElement(start) {
    let el = start;

    while (el && el !== document && el !== document.documentElement) {
      if (isClickableElement(el)) {
        return el;
      }

      el = el.parentElement;
    }

    return null;
  }

  function isClickableElement(el) {
    if (!el || !el.tagName) return false;

    const tag = el.tagName;

    if (tag === "A" && el.hasAttribute("href")) return true;
    if (tag === "BUTTON") return true;
    if (tag === "INPUT") return true;
    if (tag === "SUMMARY") return true;

    const role = el.getAttribute("role");
    if (role === "button" || role === "link") return true;

    if (typeof el.onclick === "function") return true;

    const styleCursor = getComputedStyleSafe(el, "cursor");
    if (styleCursor === "pointer") return true;

    return false;
  }

  function getComputedStyleSafe(el, prop) {
    try {
      return window.getComputedStyle(el)[prop] || "";
    } catch (e) {
      return "";
    }
  }

  function queryClickableElements(root) {
    if (!root || !root.querySelectorAll) return [];

    const selector = [
      "a[href]",
      "button",
      "input",
      "summary",
      "[role='button']",
      "[role='link']",
      "[onclick]"
    ].join(",");

    const list = Array.from(root.querySelectorAll(selector));

    if (root.nodeType === 1 && isClickableElement(root)) {
      list.unshift(root);
    }

    return list;
  }

  function markInitialElements() {
    const elements = queryClickableElements(document);

    elements.forEach(el => {
      knownInitialElements.add(el);
    });

    GUARD_STATE.initialScanDone = true;
  }

  function markDynamicElements(root) {
    const elements = queryClickableElements(root);

    elements.forEach(el => {
      if (!knownInitialElements.has(el)) {
        dynamicElements.add(el);
      }
    });
  }

  function startMutationObserver() {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node && node.nodeType === 1) {
            markDynamicElements(node);
          }
        });
      });
    });

    function observeNow() {
      if (!document.documentElement) {
        setTimeout(observeNow, 30);
        return;
      }

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }

    observeNow();
  }

  function getElementText(el) {
    if (!el) return "";

    const parts = [];

    parts.push(el.innerText);
    parts.push(el.textContent);
    parts.push(el.getAttribute("aria-label"));
    parts.push(el.getAttribute("title"));
    parts.push(el.getAttribute("alt"));
    parts.push(el.getAttribute("value"));
    parts.push(el.getAttribute("name"));
    parts.push(el.getAttribute("id"));
    parts.push(el.className);

    return normalizeText(parts.filter(Boolean).join(" "));
  }

  function getUrlFromElement(el) {
    if (!el) return "";

    const link = el.closest && el.closest("a[href]");
    if (link) return link.href || "";

    const form = el.closest && el.closest("form[action]");
    if (form) {
      try {
        return new URL(form.getAttribute("action"), location.href).href;
      } catch (e) {
        return form.getAttribute("action") || "";
      }
    }

    return "";
  }

  function isExternalUrl(url) {
    if (!url) return false;

    try {
      const u = new URL(url, location.href);
      return u.hostname !== location.hostname;
    } catch (e) {
      return false;
    }
  }

  function hasAdHint(el, url, text) {
    const joined = normalizeText([
      text,
      url,
      el && el.id,
      el && el.className,
      el && el.getAttribute && el.getAttribute("data-ad"),
      el && el.getAttribute && el.getAttribute("data-testid"),
      el && el.getAttribute && el.getAttribute("aria-label")
    ].filter(Boolean).join(" "));

    return AD_HINTS.some(word => joined.includes(word));
  }

  function hasDangerousWord(text) {
    return DANGEROUS_WORDS.some(word => {
      return text.includes(String(word).toLowerCase());
    });
  }

  function isLikelySubmitOrAction(el) {
    if (!el) return false;

    const tag = el.tagName;

    if (tag === "BUTTON") return true;

    if (tag === "INPUT") {
      const type = normalizeText(el.getAttribute("type"));
      return ["submit", "button", "image"].includes(type);
    }

    if (el.getAttribute("role") === "button") return true;

    return false;
  }

  function isDynamicElement(el) {
    if (!el) return false;

    let current = el;

    while (current && current !== document && current !== document.documentElement) {
      if (dynamicElements.has(current)) return true;
      current = current.parentElement;
    }

    return false;
  }

  function buildReason(el) {
    const text = getElementText(el);
    const url = getUrlFromElement(el);

    if (url && isAllowedUrl(url)) {
      return null;
    }

    const reasons = [];

    if (isDynamicElement(el)) {
      reasons.push("ページを開いた時点では存在せず、後から追加されたボタン・リンクの可能性があります。");
    }

    if (hasAdHint(el, url, text)) {
      reasons.push("広告・PR・スポンサー枠の可能性があります。");
    }

    if (url && isExternalUrl(url)) {
      reasons.push("現在のサイトとは別のサイトへ移動する可能性があります。");
    }

    if (hasDangerousWord(text)) {
      reasons.push("購入・送信・登録・削除・ダウンロードなどの操作に見える文言があります。");
    }

    if (isLikelySubmitOrAction(el)) {
      reasons.push("ボタン操作により、入力内容の送信や画面変更が起こる可能性があります。");
    }

    if (!reasons.length) {
      return null;
    }

    return {
      text,
      url,
      reasons
    };
  }

  function shorten(value, max) {
    value = String(value || "").trim();
    if (value.length <= max) return value;
    return value.slice(0, max) + "…";
  }

  function showConfirm(info) {
    const lines = [];

    lines.push("この操作を実行しますか？");
    lines.push("");
    lines.push("起こりそうなこと:");

    info.reasons.forEach(reason => {
      lines.push("・" + reason);
    });

    if (info.url) {
      lines.push("");
      lines.push("移動先:");
      lines.push(shorten(info.url, 160));
    }

    if (info.text) {
      lines.push("");
      lines.push("押された要素:");
      lines.push(shorten(info.text, 120));
    }

    lines.push("");
    lines.push("OK を押すと実行します。");
    lines.push("外部サイトを開く場合は、そのサイトを許可リストに追加します。");
    lines.push("キャンセルすると何もしません。");

    return window.confirm(lines.join("\n"));
  }

  function replayClick(el) {
    GUARD_STATE.bypassNext = true;

    setTimeout(() => {
      try {
        el.click();
      } catch (e) {
        const url = getUrlFromElement(el);
        if (url) {
          location.href = url;
        }
      }

      setTimeout(() => {
        GUARD_STATE.bypassNext = false;
      }, 300);
    }, 0);
  }

  function handleClick(event) {
    if (GUARD_STATE.bypassNext) return;

    const el = getClickableElement(event.target);
    if (!el) return;

    const info = buildReason(el);
    if (!info) return;

    const now = Date.now();

    if (now - GUARD_STATE.lastConfirmTime < 300) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }

    GUARD_STATE.lastConfirmTime = now;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const ok = showConfirm(info);

    if (ok) {
      if (info.url && isExternalUrl(info.url)) {
        addAllowUrl(info.url);
      }

      replayClick(el);
    }
  }

  function handleSubmit(event) {
    if (GUARD_STATE.bypassNext) return;

    const form = event.target;
    if (!form || form.tagName !== "FORM") return;

    const url = form.action || "";

    if (url && isAllowedUrl(url)) {
      return;
    }

    const reasons = [
      "フォーム送信により、入力内容が送信される可能性があります。"
    ];

    if (url && isExternalUrl(url)) {
      reasons.push("現在のサイトとは別のサイトへ送信される可能性があります。");
    }

    const info = {
      text: "フォーム送信",
      url,
      reasons
    };

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const ok = showConfirm(info);

    if (ok) {
      if (url && isExternalUrl(url)) {
        addAllowUrl(url);
      }

      GUARD_STATE.bypassNext = true;

      setTimeout(() => {
        try {
          form.submit();
        } finally {
          setTimeout(() => {
            GUARD_STATE.bypassNext = false;
          }, 300);
        }
      }, 0);
    }
  }

  function init() {
    startMutationObserver();

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        markInitialElements();
      }, { once: true });
    } else {
      markInitialElements();
    }

    // DOMContentLoaded 前に追加済みのものを拾う保険
    setTimeout(() => {
      if (!GUARD_STATE.initialScanDone) {
        markInitialElements();
      }
    }, 1000);
  }

  init();

})();
