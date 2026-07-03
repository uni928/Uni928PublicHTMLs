// ==UserScript==
// @name Novel Body Auto Reader
// @namespace https://uni928.local/
// @version 1.0.0
// @description 小説サイトの本文を自動読み上げします。小説名・メニュー・ページ数表記は除外します。
// @match https://*syosetu*/*
// @grant none
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
    lang: "ja-JP",
    rate: 2.0,
    pitch: 1.0,
    volume: 1.0,
    chunkMaxLength: 180,

    // スマホでページ描画後に本文が入るサイト向け
    startDelayMs: 1200,

    // Via/Androidで自動再生が止められた場合、本文タップで開始する
    enableTapFallback: true
  };

  const NOVEL_HOST_RULES = [
    /(^|\.)syosetu\.com$/,
    /(^|\.)ncode\.syosetu\.com$/,
    /(^|\.)kakuyomu\.jp$/,
    /(^|\.)alphapolis\.co\.jp$/,
    /(^|\.)novelup\.plus$/,
    /(^|\.)hameln\.sx$/,
    /(^|\.)estar\.jp$/,
    /(^|\.)pixiv\.net$/,
    /(^|\.)novel18\.syosetu\.com$/,
    /(^|\.)noc\.syosetu\.com$/,
    /(^|\.)mnlt\.syosetu\.com$/,
    /(^|\.)mid\.syosetu\.com$/,
    /(^|\.)yomou\.syosetu\.com$/
  ];

  const BODY_SELECTORS = [
    "#novel_honbun",
    ".novel_honbun",
    "#novel_content",
    ".novel_content",
    "#novel-body",
    ".novel-body",
    "#novelBody",
    ".novelBody",
    "#honbun",
    ".honbun",
    "#本文",
    ".本文",
    "#main_text",
    ".main_text",
    "#episode_body",
    ".episode_body",
    ".episodeBody",
    ".widget-episodeBody",
    ".p-novel__body",
    ".novel-viewer",
    ".novel_viewer",
    ".text",
    ".story",
    "article",
    "main"
  ];

  const TITLE_SELECTORS = [
    ".chapter-title",
    ".chapter_title",
    ".episode-title",
    ".episode_title",
    ".subtitle",
    ".sub-title",
    ".p-novel__title",
    ".widget-episodeTitle",
    "h2",
    "h3"
  ];

  const NOVEL_NAME_SELECTORS = [
    "h1",
    ".title",
    ".novel_title",
    ".novel-title",
    ".novelTitle",
    ".work-title",
    ".book-title",
    ".story-title",
    ".series-title",
    ".series_title"
  ];

  const EXCLUDE_SELECTORS = [
    "script",
    "style",
    "noscript",
    "header",
    "footer",
    "nav",
    "aside",
    "button",
    "select",
    "textarea",
    "input",
    "form",
    "iframe",
    "canvas",
    "svg",
    "[role='navigation']",
    "[role='banner']",
    "[role='contentinfo']",
    ".nav",
    ".navbar",
    ".menu",
    ".header",
    ".footer",
    ".sidebar",
    ".breadcrumb",
    ".pager",
    ".pagination",
    ".ranking",
    ".ad",
    ".ads",
    ".advertisement",
    ".comment",
    ".comments",
    ".review",
    ".bookmark",
    ".login",
    ".signup",
    ".author",
    ".writer"
  ];

  const EXCLUDE_TEXT_PATTERNS = [
    /^\d+\s*[\/／]\s*\d+$/,
    /^\d+\s*-\s*\d+\s*[\/／]\s*\d+$/,
    /^第?\s*\d+\s*(ページ|頁)$/,
    /^前へ$/,
    /^次へ$/,
    /^戻る$/,
    /^目次$/,
    /^しおり$/,
    /^ブックマーク$/,
    /^ログイン$/,
    /^会員登録$/,
    /^感想$/,
    /^レビュー$/,
    /^ランキング$/,
    /^作者$/,
    /^小説情報$/,
    /^更新通知$/,
    /^広告$/,
    /^PR$/i
  ];

  let chunks = [];
  let currentIndex = 0;
  let isReading = false;
  let started = false;
  let novelNameWords = [];

  function normalizeText(text) {
    return String(text || "")
      .replace(/\r/g, "\n")
      .replace(/[ \t　]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function normalizeForCompare(text) {
    return normalizeText(text)
      .replace(/[「」『』【】\[\]（）()〈〉《》“”"']/g, "")
      .replace(/[｜|:：\-―—_＿\s]/g, "")
      .toLowerCase();
  }

  function isNovelHost() {
    const host = location.hostname;
    return NOVEL_HOST_RULES.some(function (rule) {
      return rule.test(host);
    });
  }

  function isVisibleElement(el) {
    if (!el || el.nodeType !== 1) return false;

    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function matchesExcludeSelector(el) {
    if (!el || el.nodeType !== 1) return true;

    return EXCLUDE_SELECTORS.some(function (selector) {
      try {
        return el.matches(selector) || el.closest(selector);
      } catch (_) {
        return false;
      }
    });
  }

  function getTextFromSelectorList(selectors) {
    for (const selector of selectors) {
      const list = Array.from(document.querySelectorAll(selector));

      for (const el of list) {
        if (!isVisibleElement(el)) continue;
        if (matchesExcludeSelector(el)) continue;

        const text = normalizeText(el.innerText || el.textContent || "");
        if (text.length >= 3) return text;
      }
    }

    return "";
  }

  function collectNovelNameWords() {
    const words = [];

    for (const selector of NOVEL_NAME_SELECTORS) {
      document.querySelectorAll(selector).forEach(function (el) {
        const text = normalizeText(el.innerText || el.textContent || "");
        if (text.length >= 3) {
          words.push(normalizeForCompare(text));
        }
      });
    }

    const titleParts = normalizeText(document.title || "")
      .split(/\s*[-｜|:：]\s*/g)
      .map(normalizeText)
      .filter(function (part) {
        return part.length >= 3;
      });

    // document.title の先頭や末尾は小説名・サイト名のことが多いので除外候補にする
    if (titleParts[0]) words.push(normalizeForCompare(titleParts[0]));
    if (titleParts.length >= 3) words.push(normalizeForCompare(titleParts[titleParts.length - 1]));

    novelNameWords = Array.from(new Set(words.filter(Boolean)));
  }

  function isNovelNameLike(text) {
    const t = normalizeForCompare(text);
    if (!t) return false;

    return novelNameWords.some(function (word) {
      if (!word) return false;
      if (t === word) return true;
      if (t.length <= word.length + 8 && t.includes(word)) return true;
      if (word.length <= t.length + 8 && word.includes(t)) return true;
      return false;
    });
  }

  function looksLikeExcludedText(text) {
    const t = normalizeText(text);
    if (!t) return true;

    if (/^\d+\s*[\/／]\s*\d+$/.test(t)) return true;
    if (/^[\s\-_=＊*・…—―]+$/.test(t)) return true;
    if (isNovelNameLike(t)) return true;

    if (t.length <= 24) {
      for (const pattern of EXCLUDE_TEXT_PATTERNS) {
        if (pattern.test(t)) return true;
      }
    }

    return false;
  }

  function getEpisodeTitleFromDocumentTitle() {
    const rawTitle = normalizeText(document.title || "");
    if (!rawTitle) return "";

    const parts = rawTitle
      .split(/\s*[-｜|:：]\s*/g)
      .map(normalizeText)
      .filter(Boolean);

    const candidates = parts.filter(function (part) {
      if (part.length < 3) return false;
      if (looksLikeExcludedText(part)) return false;
      if (/小説家になろう|カクヨム|アルファポリス|pixiv|ハーメルン|エブリスタ/.test(part)) return false;
      return true;
    });

    // 「小説名 - 第14話 タイトル - サイト名」なら真ん中を優先
    if (candidates.length >= 2) {
      return candidates[1];
    }

    return candidates[0] || "";
  }

  function getEpisodeTitle() {
    const fromPage = getTextFromSelectorList(TITLE_SELECTORS);

    if (fromPage && !looksLikeExcludedText(fromPage)) {
      return fromPage;
    }

    const fromDocumentTitle = getEpisodeTitleFromDocumentTitle();

    if (fromDocumentTitle && !looksLikeExcludedText(fromDocumentTitle)) {
      return fromDocumentTitle;
    }

    return "";
  }

  function scoreReadableContainer(el) {
    if (!el || !isVisibleElement(el) || matchesExcludeSelector(el)) return -1;

    const text = normalizeText(el.innerText || "");
    if (text.length < 200) return -1;

    const pCount = el.querySelectorAll("p, br").length;
    const linkTextLength = Array.from(el.querySelectorAll("a"))
      .map(function (a) {
        return normalizeText(a.innerText || "").length;
      })
      .reduce(function (a, b) {
        return a + b;
      }, 0);

    const linkRatio = text.length ? linkTextLength / text.length : 1;

    if (linkRatio > 0.35) return -1;

    return text.length + pCount * 80 - linkRatio * 1000;
  }

  function findReadableRoot() {
    for (const selector of BODY_SELECTORS) {
      const candidates = Array.from(document.querySelectorAll(selector))
        .filter(function (el) {
          return scoreReadableContainer(el) > 0;
        })
        .sort(function (a, b) {
          return scoreReadableContainer(b) - scoreReadableContainer(a);
        });

      if (candidates[0]) return candidates[0];
    }

    return null;
  }

  function isNovelPage() {
    if (!isNovelHost()) return false;

    const root = findReadableRoot();
    if (!root) return false;

    const text = normalizeText(root.innerText || "");
    return text.length >= 300;
  }

  function collectReadableText(root) {
    const result = [];

    function walk(node) {
      if (!node) return;

      if (node.nodeType === Node.TEXT_NODE) {
        const text = normalizeText(node.nodeValue);
        if (!looksLikeExcludedText(text)) {
          result.push(text);
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const el = node;
      const tag = el.tagName.toLowerCase();

      if (!isVisibleElement(el)) return;
      if (matchesExcludeSelector(el)) return;

      // h1は小説名になりやすいので除外
      if (tag === "h1") return;

      // h2/h3などは本文側で拾うと重複しやすいので、タイトル抽出側に任せる
      if (/^h[2-6]$/.test(tag)) return;

      // リンク単体はメニュー化しやすいので除外
      if (tag === "a") return;

      if (tag === "br") {
        result.push("\n");
        return;
      }

      for (const child of Array.from(el.childNodes)) {
        walk(child);
      }

      if (["p", "div", "section", "article"].includes(tag)) {
        result.push("\n");
      }
    }

    walk(root);

    return normalizeText(result.join(""));
  }

  function splitIntoChunks(text) {
    const normalized = normalizeText(text);
    if (!normalized) return [];

    const rough = normalized
      .replace(/([。！？!?」』）\)])\s*/g, "$1\n")
      .split(/\n+/)
      .map(normalizeText)
      .filter(Boolean)
      .filter(function (line) {
        return !looksLikeExcludedText(line);
      });

    const output = [];

    for (const line of rough) {
      if (line.length <= CONFIG.chunkMaxLength) {
        output.push(line);
        continue;
      }

      let rest = line;
      while (rest.length > CONFIG.chunkMaxLength) {
        output.push(rest.slice(0, CONFIG.chunkMaxLength));
        rest = rest.slice(CONFIG.chunkMaxLength);
      }

      if (rest) output.push(rest);
    }

    return output;
  }

  function prepareChunks() {
    collectNovelNameWords();

    if (!isNovelPage()) {
      chunks = [];
      return [];
    }

    const root = findReadableRoot();
    if (!root) {
      chunks = [];
      return [];
    }

    const title = getEpisodeTitle();
    const bodyText = collectReadableText(root);
    const bodyChunks = splitIntoChunks(bodyText);

    chunks = [];

    if (title && !looksLikeExcludedText(title)) {
      chunks.push(title);
    }

    chunks.push(...bodyChunks);

    currentIndex = 0;
    return chunks;
  }

  function speakCurrent() {
    if (!isReading) return;

    if (!("speechSynthesis" in window)) {
      return;
    }

    if (currentIndex >= chunks.length) {
      stopReading();
      return;
    }

    const text = chunks[currentIndex];
    const utterance = new SpeechSynthesisUtterance(text);

    utterance.lang = CONFIG.lang;
    utterance.rate = 2.0;
    utterance.pitch = CONFIG.pitch;
    utterance.volume = CONFIG.volume;

    utterance.onend = function () {
      if (!isReading) return;
      currentIndex += 1;
      speakCurrent();
    };

    utterance.onerror = function () {
      if (!isReading) return;
      currentIndex += 1;
      speakCurrent();
    };

    window.speechSynthesis.speak(utterance);
  }

  function startReading() {
    if (started) return;
    started = true;

    if (!chunks.length) {
      prepareChunks();
    }

    if (!chunks.length) return;
    if (!("speechSynthesis" in window)) return;

    isReading = true;
    window.speechSynthesis.cancel();

    // Android系で voices 初期化が遅い場合の保険
    setTimeout(function () {
      speakCurrent();
    }, 100);
  }

  function stopReading() {
    isReading = false;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  function installTapFallback() {
    if (!CONFIG.enableTapFallback) return;

    let tapped = false;

    document.addEventListener(
      "touchend",
      function () {
        if (tapped) return;
        tapped = true;

        if (!started && chunks.length) {
          startReading();
        } else if ("speechSynthesis" in window && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      },
      { passive: true, once: true }
    );

    document.addEventListener(
      "click",
      function () {
        if (tapped) return;
        tapped = true;

        if (!started && chunks.length) {
          startReading();
        } else if ("speechSynthesis" in window && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      },
      { passive: true, once: true }
    );
  }

  function boot() {
    if (!("speechSynthesis" in window)) return;

    setTimeout(function () {
      prepareChunks();

      if (!chunks.length) return;

      installTapFallback();

      // 小説サイトの本文ページだけ自動再生
      startReading();
    }, CONFIG.startDelayMs);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.NovelBodyAutoReader = {
    start: startReading,
    stop: stopReading,
    reload: prepareChunks
  };
})();
