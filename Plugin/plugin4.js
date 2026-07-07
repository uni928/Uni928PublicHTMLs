// ==UserScript==
// @name         Click Guard Confirm Full
// @namespace    uni928-click-guard
// @version      2.0.1
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
  }
})();
