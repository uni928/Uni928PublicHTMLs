// ==UserScript==
// @name         Click Guard Confirm Full
// @namespace    uni928-click-guard
// @version      1.2.1
// @description  広告・外部リンク・後から追加されたボタン・大きなスマホ広告風ボタンを押す前に確認する
// @match        *://*/*
// @run-at       document-start
// ==/UserScript==

(() => {
  "use strict";

  /*
    広告・後追加ボタン対策用の確認プラグイン

    方針:
    - input / textarea / select / option / contenteditable は対象外
    - スマホ幅のみ判定
    - 横幅が画面ギリギリ、または横一杯のクリック要素を検出
    - ページ表示後に追加された要素も MutationObserver で検出
    - クリック時に確認を出す
    - 一度「開く」を押したドメインは許可リストに入れる
    - 許可リストは localStorage に保存
  */

  const CONFIG = {
    mobileMaxWidth: 768,

    // 横ギリギリ判定
    wideRatio: 0.88,

    // かなり横一杯判定
    veryWideRatio: 0.92,

    // 最低高さ。低すぎる横線などを除外
    minHeight: 36,

    // 画面の大きな範囲を占める判定
    veryLargeHeightRatio: 0.22,

    // クリック監視済みマーク
    markedAttr: "data-large-mobile-click-guard",

    // 後追加要素マーク
    addedAttr: "data-added-after-load",

    // localStorage キー
    allowListStorageKey: "largeMobileClickGuardAllowListV1"
  };

  function loadAllowList() {
    try {
      const raw = localStorage.getItem(CONFIG.allowListStorageKey);
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveAllowList(list) {
    try {
      localStorage.setItem(CONFIG.allowListStorageKey, JSON.stringify(list));
    } catch (e) {
      // localStorage が使えない環境では無視
    }
  }

  function getOriginLike(url) {
    try {
      const u = new URL(url, location.href);
      return u.protocol + "//" + u.host;
    } catch (e) {
      return "";
    }
  }

  function isAllowedUrl(url) {
    const origin = getOriginLike(url);
    if (!origin) return false;

    const list = loadAllowList();

    return list.some((allowed) => {
      return origin === allowed || url.startsWith(allowed + "/");
    });
  }

  function addAllowedUrl(url) {
    const origin = getOriginLike(url);
    if (!origin) return;

    const list = loadAllowList();

    if (!list.includes(origin)) {
      list.push(origin);
      saveAllowList(list);
    }
  }

  function isExcludedInteractive(el) {
    if (!el || !(el instanceof HTMLElement)) return true;

    const tag = el.tagName.toLowerCase();

    // 入力系は対象外
    if (
      tag === "input" ||
      tag === "textarea" ||
      tag === "select" ||
      tag === "option"
    ) {
      return true;
    }

    // 入力系の内部も対象外
    if (el.closest("input, textarea, select, option")) {
      return true;
    }

    // 編集可能領域は対象外
    if (el.closest('[contenteditable="true"], [contenteditable="plaintext-only"]')) {
      return true;
    }

    return false;
  }

  function isVisibleElement(el) {
    if (!el || !(el instanceof HTMLElement)) return false;

    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);

    if (style.display === "none") return false;
    if (style.visibility === "hidden") return false;
    if (Number(style.opacity) === 0) return false;

    if (rect.width <= 0 || rect.height <= 0) return false;

    // 現在画面に全く入っていないものは除外
    if (rect.bottom <= 0) return false;
    if (rect.top >= window.innerHeight) return false;
    if (rect.right <= 0) return false;
    if (rect.left >= window.innerWidth) return false;

    return true;
  }

  function isMobileWidth() {
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    return vw > 0 && vw <= CONFIG.mobileMaxWidth;
  }

  function isClickableCandidate(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (isExcludedInteractive(el)) return false;

    const tag = el.tagName.toLowerCase();

    if (tag === "button") return true;
    if (tag === "a" && el.href) return true;
    if (el.getAttribute("role") === "button") return true;
    if (el.hasAttribute("onclick")) return true;
    if (typeof el.onclick === "function") return true;

    const style = getComputedStyle(el);

    if (style.cursor === "pointer") return true;

    // tabindex がある疑似ボタンも一応対象
    if (el.hasAttribute("tabindex")) {
      const tabindex = Number(el.getAttribute("tabindex"));
      if (!Number.isNaN(tabindex) && tabindex >= 0) return true;
    }

    return false;
  }

  function isAlmostFullWidthOnMobile(el) {
    if (!isMobileWidth()) return false;
    if (!el || !(el instanceof HTMLElement)) return false;
    if (isExcludedInteractive(el)) return false;
    if (!isVisibleElement(el)) return false;

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;

    if (!vw || !vh) return false;

    const widthRatio = rect.width / vw;
    const heightRatio = rect.height / vh;

    // 横ギリギリ、または横一杯
    const isWideEnough = widthRatio >= CONFIG.wideRatio;

    // 小さすぎる要素は除外
    const isTallEnough = rect.height >= CONFIG.minHeight;

    // 画面のかなり大きな範囲を占める要素
    const isVeryLarge =
      widthRatio >= CONFIG.veryWideRatio &&
      heightRatio >= CONFIG.veryLargeHeightRatio;

    return (isWideEnough && isTallEnough) || isVeryLarge;
  }

  function getElementUrl(el) {
    if (!el || !(el instanceof HTMLElement)) return "";

    const anchor = el.closest("a[href]");

    if (anchor && anchor.href) {
      return anchor.href;
    }

    const directHref = el.getAttribute("href");
    if (directHref) {
      try {
        return new URL(directHref, location.href).href;
      } catch (e) {
        return directHref;
      }
    }

    const dataUrl =
      el.getAttribute("data-href") ||
      el.getAttribute("data-url") ||
      el.getAttribute("data-link") ||
      el.getAttribute("data-target-url");

    if (dataUrl) {
      try {
        return new URL(dataUrl, location.href).href;
      } catch (e) {
        return dataUrl;
      }
    }

    return "";
  }

  function hasExternalUrl(el) {
    const url = getElementUrl(el);
    if (!url) return false;

    try {
      const u = new URL(url, location.href);
      return u.origin !== location.origin;
    } catch (e) {
      return false;
    }
  }

  function hasAdLikeHint(el) {
    if (!el || !(el instanceof HTMLElement)) return false;

    const url = getElementUrl(el);

    const text = [
      el.id || "",
      typeof el.className === "string" ? el.className : "",
      el.getAttribute("aria-label") || "",
      el.getAttribute("title") || "",
      el.getAttribute("data-ad-client") || "",
      el.getAttribute("data-ad-slot") || "",
      el.getAttribute("data-ad-format") || "",
      url || ""
    ]
      .join(" ")
      .toLowerCase();

    return /(^|[\s_-])(ad|ads)([\s_-]|$)|advert|advertisement|sponsor|sponsored|promo|promotion|doubleclick|googlesyndication|googleadservices|googletag|outbrain|taboola|criteo|amazon-adsystem/.test(text);
  }

  function wasAddedAfterLoad(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    return !!el.closest("[" + CONFIG.addedAttr +='="1"]') || el.getAttribute(CONFIG.addedAttr) === "1";
  }

  function getCandidateReason(el) {
    const reasons = [];

    if (isAlmostFullWidthOnMobile(el)) {
      reasons.push("スマホ画面で横幅が大きいクリック要素");
    }

    if (wasAddedAfterLoad(el)) {
      reasons.push("ページ表示後に追加された要素");
    }

    if (hasExternalUrl(el)) {
      reasons.push("外部サイトへ移動する可能性");
    }

    if (hasAdLikeHint(el)) {
      reasons.push("広告・スポンサー系の記述を含む可能性");
    }

    return reasons;
  }

  function shouldGuardElement(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (isExcludedInteractive(el)) return false;
    if (!isClickableCandidate(el)) return false;
    if (!isAlmostFullWidthOnMobile(el)) return false;

    const url = getElementUrl(el);

    // URL が許可済みなら確認しない
    if (url && isAllowedUrl(url)) {
      return false;
    }

    return true;
  }

  function showConfirm(el) {
    const reasons = getCandidateReason(el);
    const url = getElementUrl(el);
    const origin = url ? getOriginLike(url) : "";

    let message = "大きなクリック要素が押されました。\n\n";

    if (reasons.length) {
      message += "検出理由:\n";
      message += reasons.map((r) => "・" + r).join("\n");
      message += "\n\n";
    }

    if (origin) {
      message += "移動先:\n" + origin + "\n\n";
    }

    message += "開きますか？\n";
    message += "OKを押すと、このサイトは許可リストに追加されます。";

    const ok = window.confirm(message);

    if (ok && url) {
      addAllowedUrl(url);
    }

    return ok;
  }

  function guardClickEvent(e) {
    const path = typeof e.composedPath === "function" ? e.composedPath() : [];
    let target = null;

    for (const item of path) {
      if (item instanceof HTMLElement && shouldGuardElement(item)) {
        target = item;
        break;
      }
    }

    if (!target && e.target instanceof HTMLElement) {
      const closest = e.target.closest("a, button, [role='button'], [onclick], [tabindex]");
      if (closest && shouldGuardElement(closest)) {
        target = closest;
      }
    }

    if (!target) return;

    const ok = showConfirm(target);

    if (!ok) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }

  function markAddedTree(node) {
    if (!(node instanceof HTMLElement)) return;

    node.setAttribute(CONFIG.addedAttr, "1");

    const children = node.querySelectorAll("*");
    for (const child of children) {
      child.setAttribute(CONFIG.addedAttr, "1");
    }
  }

  function scanAndMarkExistingCandidates(root = document) {
    const selector = "a, button, [role='button'], [onclick], [tabindex]";

    const list = root.querySelectorAll ? root.querySelectorAll(selector) : [];

    for (const el of list) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.getAttribute(CONFIG.markedAttr) === "1") continue;

      if (shouldGuardElement(el)) {
        el.setAttribute(CONFIG.markedAttr, "1");
      }
    }
  }

  function observeAddedElements() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          markAddedTree(node);

          if (node.matches && node.matches("a, button, [role='button'], [onclick], [tabindex]")) {
            if (shouldGuardElement(node)) {
              node.setAttribute(CONFIG.markedAttr, "1");
              console.log("大きな後追加クリック要素候補:", node);
            }
          }

          const candidates = node.querySelectorAll
            ? node.querySelectorAll("a, button, [role='button'], [onclick], [tabindex]")
            : [];

          for (const el of candidates) {
            if (!(el instanceof HTMLElement)) continue;

            if (shouldGuardElement(el)) {
              el.setAttribute(CONFIG.markedAttr, "1");
              console.log("大きな後追加クリック要素候補:", el);
            }
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function exposeDebugApi() {
    window.LargeMobileClickGuard = {
      getAllowList() {
        return loadAllowList();
      },

      clearAllowList() {
        saveAllowList([]);
        console.log("許可リストを空にしました。");
      },

      addAllowOrigin(url) {
        addAllowedUrl(url);
        console.log("許可リストに追加しました:", getOriginLike(url));
      },

      scan() {
        scanAndMarkExistingCandidates(document);
        console.log("再スキャンしました。");
      },

      isTarget(el) {
        return shouldGuardElement(el);
      }
    };
  }

  function init() {
    // キャプチャ段階で先に拾う
    document.addEventListener("click", guardClickEvent, true);

    // 初期表示時点のものも一応スキャン
    scanAndMarkExistingCandidates(document);

    // 後から追加される広告・ボタンを監視
    observeAddedElements();

    // デバッグ用API
    exposeDebugApi();

    console.log("LargeMobileClickGuard 起動");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
