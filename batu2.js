// ==UserScript==
// @name         Click Guard Confirm Full
// @namespace    uni928-click-guard
// @version      2.2.9
// @description  広告・外部リンク・後から追加されたボタン・大きなスマホ広告風ボタンを押す前に確認する
// @match        *://*/*
// @run-at       document-start
// ==/UserScript==

(() => {
  "use strict";

  /*
    AdLikeIdClassHider for Via Browser

    概要:
    - id / class に広告っぽい名前がある要素を非表示にします
    - input / textarea / select / option / contenteditable は対象外
    - 後から追加された広告要素も MutationObserver で監視します

    主な対象例:
    id="ad"
    id="adBanner"
    id="ad-banner"
    id="top-ad"
    id="top_ad"
    id="ad_area"
    class="ad"
    class="adBox"
    class="ad-box"
    class="side-ad"
    class="side_ad"
    class="article_ad_area"
    class="adsbygoogle"
    class="advertisement"
    class="sponsored"

    誤爆を避けたい例:
    header
    read
    loading
    address
    breadcrumb
  */

  const CONFIG = {
    markAttr: "data-via-hide-ad-like-id-class",
    styleId: "via-hide-ad-like-id-class-style",
    debug: false,

    excludedSelector: [
      "input",
      "textarea",
      "select",
      "option",
      "[contenteditable='true']",
      "[contenteditable='plaintext-only']"
    ].join(", ")
  };

  function log(...args) {
    if (CONFIG.debug) {
      console.log("[AdLikeIdClassHider]", ...args);
    }
  }

  function injectStyle() {
    if (document.getElementById(CONFIG.styleId)) return;

    const style = document.createElement("style");
    style.id = CONFIG.styleId;

    style.textContent = `
@layer base {
  /* Via: id/class が広告っぽい要素を非表示 */
  [${CONFIG.markAttr}="1"] {
    display: none;
  }
}
`;

    document.documentElement.appendChild(style);
  }

  function getClassText(el) {
    if (!el) return "";

    const className = el.getAttribute("class");

    if (!className) return "";

    return String(className);
  }

  function hasAdLikeName(value) {
    if (!value) return false;

    const rawNames = String(value)
      .split(/\s+/)
      .map((v) => v.trim())
      .filter(Boolean);

    for (const raw of rawNames) {
      const lower = raw.toLowerCase();

      /*
        完全一致:
        ad
        ads
      */
      if (lower === "ad" || lower === "ads") {
        return true;
      }

      /*
        区切り付き:
        ad-banner
        top-ad
        top_ad
        _ad_
        ad_area
        side-ad-box
      */
      if (/(^|[-_:./\\|])ads?($|[-_:./\\|])/.test(lower)) {
        return true;
      }

      /*
        ad* 判定:
        adBanner
        adBox
        adArea
        adsense
        adsbygoogle
      */
      if (
        /^ad[A-Z0-9_-]/.test(raw) ||
        /^ads[A-Z0-9_-]/.test(raw) ||
        /^ad[a-z0-9_-]/.test(lower) ||
        /^ads[a-z0-9_-]/.test(lower)
      ) {
        return true;
      }

      /*
        *ad 判定:
        topAd
        sideAd
        bannerAd
        nativeAd
      */
      if (
        /[A-Z0-9_-]Ad$/.test(raw) ||
        /[A-Z0-9_-]Ads$/.test(raw) ||
        /[a-z0-9_-]ad$/.test(lower) ||
        /[a-z0-9_-]ads$/.test(lower)
      ) {
        return true;
      }

      /*
        よくある広告系の名前
      */
      if (
        lower.includes("adsbygoogle") ||
        lower.includes("adsense") ||
        lower.includes("adslot") ||
        lower.includes("ad-slot") ||
        lower.includes("ad_slot") ||
        lower.includes("adunit") ||
        lower.includes("ad-unit") ||
        lower.includes("ad_unit") ||
        lower.includes("advert") ||
        lower.includes("advertisement") ||
        lower.includes("sponsored") ||
        lower.includes("sponsor") ||
        lower.includes("promotion") ||
        lower.includes("promo")
      ) {
        return true;
      }
    }

    return false;
  }

  function isExcluded(el) {
    if (!el || !(el instanceof HTMLElement)) return true;

    if (el.matches(CONFIG.excludedSelector)) {
      return true;
    }

    if (el.closest(CONFIG.excludedSelector)) {
      return true;
    }

    return false;
  }

  function shouldHideElement(el) {
    if (!el || !(el instanceof HTMLElement)) return false;

    if (isExcluded(el)) {
      return false;
    }

    const id = el.getAttribute("id") || "";
    const classText = getClassText(el);

    if (hasAdLikeName(id)) return true;
    if (hasAdLikeName(classText)) return true;

    return false;
  }

  function hideElement(el) {
    if (!el || !(el instanceof HTMLElement)) return;

    if (el.getAttribute(CONFIG.markAttr) === "1") {
      return;
    }

    el.setAttribute(CONFIG.markAttr, "1");
    log("hidden:", el);
  }

  function scan(root) {
    const scanRoot = root || document;

    if (scanRoot instanceof HTMLElement && shouldHideElement(scanRoot)) {
      hideElement(scanRoot);
    }

    if (!scanRoot.querySelectorAll) return;

    const list = scanRoot.querySelectorAll("[id], [class]");

    for (const el of list) {
      if (!(el instanceof HTMLElement)) continue;

      if (shouldHideElement(el)) {
        hideElement(el);
      }
    }
  }

  function observe() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const el = mutation.target;

          if (el instanceof HTMLElement && shouldHideElement(el)) {
            hideElement(el);
          }

          continue;
        }

        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          scan(node);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["id", "class"]
    });
  }

  function exposeApi() {
    window.AdLikeIdClassHider = {
      scan() {
        scan(document);
        console.log("AdLikeIdClassHider: 再スキャンしました。");
      },

      clear() {
        document
          .querySelectorAll("[" + CONFIG.markAttr + '="1"]')
          .forEach((el) => {
            el.removeAttribute(CONFIG.markAttr);
          });

        console.log("AdLikeIdClassHider: 非表示マークを解除しました。");
      },

      testName(name) {
        return hasAdLikeName(name);
      },

      shouldHide(el) {
        return shouldHideElement(el);
      },

      debugOn() {
        CONFIG.debug = true;
        console.log("AdLikeIdClassHider: debug ON");
      },

      debugOff() {
        CONFIG.debug = false;
        console.log("AdLikeIdClassHider: debug OFF");
      }
    };
  }

  function init() {
    injectStyle();
    scan(document);
    observe();
    exposeApi();

    log("started");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  {
      // インラインstyleの display: block !important を削除する
  function removeDisplayBlockImportant(root) {
    const scanRoot = root || document;

    const list = [];

    if (scanRoot instanceof HTMLElement) {
      list.push(scanRoot);
    }

    if (scanRoot.querySelectorAll) {
      list.push(...scanRoot.querySelectorAll("[style]"));
    }

    for (const el of list) {
      if (!(el instanceof HTMLElement)) continue;

      const displayValue = el.style.getPropertyValue("display");
      const displayPriority = el.style.getPropertyPriority("display");

      if (
        displayValue &&
        displayValue.trim().toLowerCase() === "block" &&
        displayPriority === "important"
      ) {
        el.style.removeProperty("display");
      }
    }
  }

  // 非表示対象に display: none !important を直接付与する
  function forceHideMarkedElements(root) {
    const scanRoot = root || document;
    const selector = "[" + CONFIG.markAttr + '="1"]';

    const list = [];

    if (scanRoot instanceof HTMLElement && scanRoot.matches(selector)) {
      list.push(scanRoot);
    }

    if (scanRoot.querySelectorAll) {
      list.push(...scanRoot.querySelectorAll(selector));
    }

    for (const el of list) {
      if (!(el instanceof HTMLElement)) continue;
      el.style.setProperty("display", "none", "important");
    }
  }

  // 全体読み込み完了後、広告が追加されたであろうタイミングで再スキャンする
  function scanAfterPageFullyLoaded() {
    const run = () => {
      removeDisplayBlockImportant(document);
      scan(document);
      forceHideMarkedElements(document);
      console.log("AdLikeIdClassHider: load後に再スキャンしました。");
    };

    if (document.readyState === "complete") {
      run();
    } else {
      window.addEventListener("load", run, { once: true });
    }

    // 広告は load 後に遅れて追加されることがあるため、追加で数回再スキャン
    window.addEventListener("load", () => {
      setTimeout(run, 1000);
      setTimeout(run, 3000);
      setTimeout(run, 6000);
      setTimeout(run, 10000);
    }, { once: true });
  }

  scanAfterPageFullyLoaded();

    // 横一杯要素のクリック系メソッドを無効化する
  function disableFullWidthElementMethods(root) {
    const scanRoot = root || document;

    const list = [];

    if (scanRoot instanceof HTMLElement) {
      list.push(scanRoot);
    }

    if (scanRoot.querySelectorAll) {
      list.push(
        ...scanRoot.querySelectorAll(
          "a, button, div, span, section, article, aside, ins, iframe, [onclick], [role='button'], [tabindex], [style]"
        )
      );
    }

    for (const el of list) {
      if (!(el instanceof HTMLElement)) continue;
      if (isExcluded(el)) continue;
      if (!isFullWidthLikeElement(el)) continue;

      emptyElementClickMethods(el);
    }
  }

 // スマホで横一杯に近く、画面の縦幅の1/3を超え、かつ一番手前にある要素か判定
function isFullWidthLikeElement(el) {
  if (!el || !(el instanceof HTMLElement)) return false;

  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;

  if (!vw || !vh) return false;

  // スマホ幅以外は対象外
  if (vw > 768) return false;

  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);

  // 非表示要素は対象外
  if (style.display === "none") return false;
  if (style.visibility === "hidden") return false;
  if (Number(style.opacity) === 0) return false;
  if (style.pointerEvents === "none") return false;

  // サイズがない要素は対象外
  if (rect.width <= 0 || rect.height <= 0) return false;

  // 画面内にないものは対象外
  if (rect.bottom <= 0) return false;
  if (rect.top >= vh) return false;
  if (rect.right <= 0) return false;
  if (rect.left >= vw) return false;

  const widthRatio = rect.width / vw;
  const heightRatio = rect.height / vh;

  // 横幅が画面の99%以上、つまりほぼ横一杯のものだけ対象
  if (widthRatio < 0.99) return false;

  // 画面の縦幅の1/3を超えるものだけ対象
  if (heightRatio <= 1 / 3) return false;

  // 一番手前にある要素だけ対象
  if (!isFrontMostElement(el, rect, vw, vh)) return false;

  return true;
}

// 対象要素が画面上で一番手前にあるか判定
function isFrontMostElement(el, rect, vw, vh) {
  if (!el || !(el instanceof HTMLElement)) return false;

  // 要素内の複数点を見る
  const points = [
    [rect.left + rect.width / 2, rect.top + rect.height / 2], // 中央
    [rect.left + rect.width * 0.25, rect.top + rect.height * 0.25], // 左上寄り
    [rect.left + rect.width * 0.75, rect.top + rect.height * 0.25], // 右上寄り
    [rect.left + rect.width * 0.25, rect.top + rect.height * 0.75], // 左下寄り
    [rect.left + rect.width * 0.75, rect.top + rect.height * 0.75]  // 右下寄り
  ];

  let frontHitCount = 0;

  for (const [xRaw, yRaw] of points) {
    const x = Math.min(Math.max(xRaw, 0), vw - 1);
    const y = Math.min(Math.max(yRaw, 0), vh - 1);

    const topEl = document.elementFromPoint(x, y);

    if (!topEl) continue;

    // 自分自身、または自分の子要素が最前面ならOK
    if (topEl === el || el.contains(topEl)) {
      frontHitCount++;
      continue;
    }

    // topEl の親に対象要素がいる場合もOK
    if (topEl.closest && topEl.closest("*") && el.contains(topEl)) {
      frontHitCount++;
    }
  }

  // 5点中3点以上が手前なら「一番手前」とみなす
  return frontHitCount >= 3;
}

  // 要素に付いているクリック系処理を空にする
  function emptyElementClickMethods(el) {
    if (!el || !(el instanceof HTMLElement)) return;

    // 二重処理防止
    if (el.getAttribute("data-full-width-method-disabled") === "1") {
      return;
    }

    el.setAttribute("data-full-width-method-disabled", "1");

    // HTML属性の onclick を削除
    if (el.hasAttribute("onclick")) {
      el.removeAttribute("onclick");
    }

    // DOMプロパティの onclick を空にする
    try {
      el.onclick = null;
    } catch (e) {}

    // aタグの遷移を無効化
    if (el.tagName.toLowerCase() === "a") {
      el.setAttribute("data-original-href", el.getAttribute("href") || "");
      el.removeAttribute("href");
      el.setAttribute("role", "presentation");
    }

    // よくあるURL系data属性を無効化
    const urlAttrs = [
      "data-href",
      "data-url",
      "data-link",
      "data-target",
      "data-target-url",
      "data-click-url",
      "data-redirect",
      "data-destination"
    ];

    for (const attr of urlAttrs) {
      if (el.hasAttribute(attr)) {
        el.setAttribute("data-original-" + attr, el.getAttribute(attr) || "");
        el.removeAttribute(attr);
      }
    }

    // button の submit 等を無効化
    if (el.tagName.toLowerCase() === "button") {
      el.setAttribute("type", "button");
    }

    // 見た目上も押せないようにする
    el.style.setProperty("pointer-events", "none", "important");
    el.style.setProperty("cursor", "default", "important");

    console.log("横一杯要素のクリック処理を無効化:", el);
  }

  // クリックイベントをキャプチャ段階で止める
  function blockFullWidthElementClickEvent(e) {
    const path = typeof e.composedPath === "function" ? e.composedPath() : [];

    for (const item of path) {
      if (!(item instanceof HTMLElement)) continue;
      if (isExcluded(item)) continue;

      if (
        item.getAttribute("data-full-width-method-disabled") === "1" ||
        isFullWidthLikeElement(item)
      ) {
        emptyElementClickMethods(item);

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        console.log("横一杯要素のクリック実行を停止:", item);
        return false;
      }
    }
  }

  // 今後 addEventListener で横一杯要素に click が登録されるのを防ぐ
  function patchAddEventListenerForFullWidthElements() {
    if (window.__fullWidthAddEventListenerPatched) return;
    window.__fullWidthAddEventListenerPatched = true;

    const originalAddEventListener = EventTarget.prototype.addEventListener;

    EventTarget.prototype.addEventListener = function(type, listener, options) {
      try {
        if (
          type === "click" &&
          this instanceof HTMLElement &&
          !isExcluded(this) &&
          isFullWidthLikeElement(this)
        ) {
          emptyElementClickMethods(this);
          console.log("横一杯要素への click addEventListener 登録を無効化:", this);
          return;
        }
      } catch (e) {}

      return originalAddEventListener.call(this, type, listener, options);
    };
  }

  // 後から追加される横一杯要素も無効化する
  function observeFullWidthMethodDisabler() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const el = mutation.target;

          if (el instanceof HTMLElement) {
            disableFullWidthElementMethods(el);
          }

          continue;
        }

        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          disableFullWidthElementMethods(node);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "id",
        "class",
        "style",
        "onclick",
        "href",
        "data-href",
        "data-url",
        "data-link",
        "data-target-url"
      ]
    });
  }

  // load後にも広告読み込み想定で複数回かける
  function runFullWidthMethodDisablerAfterLoad() {
    const run = () => {
      disableFullWidthElementMethods(document);
      console.log("横一杯要素のメソッド無効化を再実行しました。");
    };

    if (document.readyState === "complete") {
      run();
    } else {
      window.addEventListener("load", run, { once: true });
    }

    window.addEventListener("load", () => {
      setTimeout(run, 500);
      setTimeout(run, 1000);
      setTimeout(run, 3000);
      setTimeout(run, 6000);
      setTimeout(run, 10000);
    }, { once: true });
  }

  // 起動
  patchAddEventListenerForFullWidthElements();
  document.addEventListener("click", blockFullWidthElementClickEvent, true);
  disableFullWidthElementMethods(document);
  observeFullWidthMethodDisabler();
  runFullWidthMethodDisablerAfterLoad();
  }
})();
