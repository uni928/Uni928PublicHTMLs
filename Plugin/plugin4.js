// ==UserScript==
// @name         Click Guard Confirm Full
// @namespace    uni928-click-guard
// @version      1.2.0
// @description  広告・外部リンク・後から追加されたボタン・大きなスマホ広告風ボタンを押す前に確認する
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
    "advertisement",
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
    "adsbygoogle",
    "advertisement",
    "advert",
    "sponsored",
    "sponsor",
    "promotion",
    "promoted",
    "affiliate",
    "native-ad",
    "ad-banner",
    "ad-container",
    "ad-wrapper",
    "ad-slot",
    "googleads",
    "doubleclick",
    "googlesyndication",
    "adservice",
    "googletagservices",
    "taboola",
    "outbrain",
    "popin",
    "microad",
    "fluct"
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
      // localStorage が使えない場合は保存しない
    }
  }

  function getAllowKeyFromUrl(url) {
    try {
      const u = new URL(url, location.href);

      // 「https://」から次の「/」までを登録する想定
      // 例: https://example.com/path -> https://example.com
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
      // 実質的に https://example.com* のように扱う
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

  function getComputedStyleSafe(el, prop) {
    try {
      return window.getComputedStyle(el)[prop] || "";
    } catch (e) {
      return "";
    }
  }

  function isClickableElement(el) {
    if (!el || !el.tagName) return false;

    const tag = el.tagName;

    if (tag === "A" && el.hasAttribute("href")) return true;
    if (tag === "BUTTON") return true;
    if (tag === "INPUT") return true;
    if (tag === "SUMMARY") return true;
    if (tag === "LABEL") return true;

    const role = el.getAttribute("role");
    if (role === "button" || role === "link" || role === "menuitem") return true;

    if (typeof el.onclick === "function") return true;

    const tabindex = el.getAttribute("tabindex");
    if (tabindex !== null && tabindex !== "-1") {
      const cursor = getComputedStyleSafe(el, "cursor");
      if (cursor === "pointer") return true;
    }

    const styleCursor = getComputedStyleSafe(el, "cursor");
    if (styleCursor === "pointer") return true;

    return false;
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

  function queryClickableElements(root) {
    if (!root || !root.querySelectorAll) return [];

    const selector = [
      "a[href]",
      "button",
      "input",
      "summary",
      "label",
      "[role='button']",
      "[role='link']",
      "[role='menuitem']",
      "[onclick]",
      "[tabindex]"
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

    try {
      parts.push(String(el.className || ""));
    } catch (e) {
      // SVG 等で className が文字列でない場合の保険
    }

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

    const dataHref = el.getAttribute && (
      el.getAttribute("data-href") ||
      el.getAttribute("data-url") ||
      el.getAttribute("data-link")
    );

    if (dataHref) {
      try {
        return new URL(dataHref, location.href).href;
      } catch (e) {
        return dataHref;
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
    const parts = [
      text,
      url
    ];

    let current = el;
    let depth = 0;

    while (
      current &&
      current !== document &&
      current !== document.documentElement &&
      depth < 6
    ) {
      parts.push(current.id);

      try {
        parts.push(String(current.className || ""));
      } catch (e) {
        // SVG 等の保険
      }

      if (current.getAttribute) {
        parts.push(current.getAttribute("data-ad"));
        parts.push(current.getAttribute("data-testid"));
        parts.push(current.getAttribute("aria-label"));
        parts.push(current.getAttribute("title"));
        parts.push(current.getAttribute("src"));
        parts.push(current.getAttribute("href"));
      }

      current = current.parentElement;
      depth++;
    }

    const joined = normalizeText(parts.filter(Boolean).join(" "));

    return AD_HINTS.some(word => joined.includes(String(word).toLowerCase()));
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
      return ["submit", "button", "image", "reset"].includes(type);
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

  function isMobileLikeViewport() {
    const innerWidth = window.innerWidth || document.documentElement.clientWidth || 9999;
    const screenWidth = window.screen && window.screen.width ? window.screen.width : 9999;

    return Math.min(innerWidth, screenWidth) <= 768;
  }

  function getVisibleRectRatio(rect) {
    const vw = window.innerWidth || document.documentElement.clientWidth || 1;
    const vh = window.innerHeight || document.documentElement.clientHeight || 1;

    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(vw, rect.right);
    const bottom = Math.min(vh, rect.bottom);

    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);

    const area = width * height;
    const viewportArea = vw * vh;

    return {
      widthRatio: width / vw,
      heightRatio: height / vh,
      areaRatio: area / viewportArea,
      visibleWidth: width,
      visibleHeight: height
    };
  }

  function isLargeAdLikeElement(el) {
    if (!isMobileLikeViewport()) return false;
    if (!el || !el.getBoundingClientRect) return false;

    let current = el;
    let depth = 0;

    while (
      current &&
      current !== document &&
      current !== document.documentElement &&
      depth < 7
    ) {
      if (current.getBoundingClientRect) {
        const rect = current.getBoundingClientRect();

        if (rect.width > 0 && rect.height > 0) {
          const ratio = getVisibleRectRatio(rect);

          // 横一杯に近い、大きめの帯
          const isFullWidthBanner =
            ratio.widthRatio >= 0.9 &&
            ratio.heightRatio >= 0.14;

          // 画面面積のかなり大きな割合を占める
          const isLargeArea =
            ratio.areaRatio >= 0.28;

          // 全画面寄りのオーバーレイ
          const isOverlayLike =
            ratio.widthRatio >= 0.75 &&
            ratio.heightRatio >= 0.45;

          // 下部固定・上部固定の大きめバナー
          const position = getComputedStyleSafe(current, "position");

          const isFixedLarge =
            (position === "fixed" || position === "sticky") &&
            ratio.widthRatio >= 0.75 &&
            ratio.heightRatio >= 0.10;

          // 横幅いっぱいの大きな画像リンク・カードリンク想定
          const isWideCard =
            ratio.widthRatio >= 0.82 &&
            ratio.heightRatio >= 0.22;

          if (
            isFullWidthBanner ||
            isLargeArea ||
            isOverlayLike ||
            isFixedLarge ||
            isWideCard
          ) {
            return true;
          }
        }
      }

      current = current.parentElement;
      depth++;
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

    if (isLargeAdLikeElement(el)) {
      reasons.push("スマホ表示で、画面の大きな範囲を占めるボタン・リンク・広告枠の可能性があります。");
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
      lines.push(shorten(info.url, 180));
    }

    if (info.text) {
      lines.push("");
      lines.push("押された要素:");
      lines.push(shorten(info.text, 140));
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

    // 連打・二重発火の抑制
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

  function exposeDebugTools() {
    // Via のコンソール等から確認・削除できるようにする保険
    window.uni928ClickGuard = {
      getAllowList: function () {
        return loadAllowList();
      },
      clearAllowList: function () {
        saveAllowList([]);
        return [];
      },
      removeAllow: function (urlOrKey) {
        const key = getAllowKeyFromUrl(urlOrKey) || String(urlOrKey || "");
        const list = loadAllowList().filter(item => item !== key);
        saveAllowList(list);
        return list;
      },
      addAllow: function (urlOrKey) {
        const key = getAllowKeyFromUrl(urlOrKey) || String(urlOrKey || "");
        const list = loadAllowList();
        if (key && !list.includes(key)) {
          list.push(key);
          saveAllowList(list);
        }
        return loadAllowList();
      }
    };
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

    // DOMContentLoaded 前後のズレ対策
    setTimeout(() => {
      if (!GUARD_STATE.initialScanDone) {
        markInitialElements();
      }
    }, 1000);

    exposeDebugTools();
  }

  init();

})();
