// ==UserScript==
// @name Novel Body Reader for Syosetu
// @namespace https://uni928.local/
// @version 1.2.0
// @description syosetu系ページの本文を右下ボタンから読み上げます。
// @match http*syosetu*
// @grant none
// ==/UserScript==

(function () {
  "use strict";

  const PLUGIN_NAME = "NovelBodyReader";

  const config = {
    autoStart: false,
    rate: 2.0,
    pitch: 1.0,
    volume: 1.0,
    lang: "ja-JP",
    chunkMaxLength: 180,

    excludeTextPatterns: [
      /^\d+\s*[\/／]\s*\d+$/,
      /^\d+\s*-\s*\d+\s*[\/／]\s*\d+$/,
      /^第?\s*\d+\s*(ページ|頁)$/i,
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
    ],

    excludeSelectors: [
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
      ".writer",
      ".novel_title",
      ".novel-title",
      ".novelTitle",
      ".work-title",
      ".book-title",
      ".story-title",
      ".series-title",
      ".series_title"
    ],

    preferredBodySelectors: [
      "#novel_honbun",
      ".novel_honbun",
      "#novel_color",
      "#novel_view",
      ".novel_view",
      "#novel_content",
      ".novel_content",
      "#novel-body",
      ".novel-body",
      "#novelBody",
      ".novelBody",
      "#honbun",
      ".honbun",
      "#main_text",
      ".main_text",
      "#episode_body",
      ".episode_body",
      "#content",
      ".content",
      "article",
      "main"
    ],

    titleSelectors: [
      ".novel_subtitle",
      "#novel_subtitle",
      ".chapter-title",
      ".chapter_title",
      ".episode-title",
      ".episode_title",
      ".subtitle",
      ".sub-title",
      "h2",
      "h3"
    ]
  };

  let chunks = [];
  let currentIndex = 0;
  let isReading = false;
  let isPaused = false;
  let currentUtterance = null;
  let panel = null;
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

    return true;
  }

  function matchesExcludeSelector(el) {
    if (!el || el.nodeType !== 1) return true;

    return config.excludeSelectors.some(function (selector) {
      try {
        return el.matches(selector) || el.closest(selector);
      } catch (_) {
        return false;
      }
    });
  }

  function collectNovelNameWords() {
    const words = [];

    const titleSelectors = [
      "h1",
      ".novel_title",
      ".novel-title",
      ".novelTitle",
      ".work-title",
      ".book-title",
      ".story-title",
      ".series-title",
      ".series_title"
    ];

    titleSelectors.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (el) {
        const text = normalizeText(el.innerText || el.textContent || "");
        if (text.length >= 3) {
          words.push(normalizeForCompare(text));
        }
      });
    });

    const titleParts = normalizeText(document.title || "")
      .split(/\s*[-｜|:：]\s*/g)
      .map(normalizeText)
      .filter(function (part) {
        return part.length >= 3;
      });

    if (titleParts[0]) {
      words.push(normalizeForCompare(titleParts[0]));
    }

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

  function looksLikeTitleOrMenuText(text) {
    const t = normalizeText(text);
    if (!t) return true;

    if (/^\d+\s*[\/／]\s*\d+$/.test(t)) return true;
    if (/^[\s\-_=＊*・…—―]+$/.test(t)) return true;
    if (isNovelNameLike(t)) return true;

    if (t.length <= 2) return true;

    if (t.length <= 24) {
      for (const pattern of config.excludeTextPatterns) {
        if (pattern.test(t)) return true;
      }
    }

    return false;
  }

  function scoreReadableContainer(el) {
    if (!el || !isVisibleElement(el) || matchesExcludeSelector(el)) return -1;

    const text = normalizeText(el.innerText || el.textContent || "");
    if (text.length < 20) return -1;

    const pCount = el.querySelectorAll("p, br").length;

    const linkTextLength = Array.from(el.querySelectorAll("a"))
      .map(function (a) {
        return normalizeText(a.innerText || a.textContent || "").length;
      })
      .reduce(function (a, b) {
        return a + b;
      }, 0);

    const linkRatio = text.length ? linkTextLength / text.length : 1;

    if (linkRatio > 0.35) return -1;

    return text.length + pCount * 80 - linkRatio * 1000;
  }

  function findReadableRoot() {
    for (const selector of config.preferredBodySelectors) {
      const candidates = Array.from(document.querySelectorAll(selector))
        .filter(function (el) {
          return scoreReadableContainer(el) > 0;
        })
        .sort(function (a, b) {
          return scoreReadableContainer(b) - scoreReadableContainer(a);
        });

      if (candidates[0]) return candidates[0];
    }

    return document.body;
  }

  function getEpisodeTitle() {
    for (const selector of config.titleSelectors) {
      const list = Array.from(document.querySelectorAll(selector));

      for (const el of list) {
        if (!isVisibleElement(el)) continue;
        if (matchesExcludeSelector(el)) continue;

        const text = normalizeText(el.innerText || el.textContent || "");
        if (text.length >= 3 && !looksLikeTitleOrMenuText(text)) {
          return text;
        }
      }
    }

    return "";
  }

  function collectReadableText(root) {
    const result = [];

    function walk(node) {
      if (!node) return;

      if (node.nodeType === Node.TEXT_NODE) {
        const text = normalizeText(node.nodeValue);
        if (!looksLikeTitleOrMenuText(text)) {
          result.push(text);
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const el = node;
      const tag = el.tagName.toLowerCase();

      if (!isVisibleElement(el)) return;
      if (matchesExcludeSelector(el)) return;

      if (tag === "h1") return;
      if (/^h[2-6]$/.test(tag)) return;
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
      .map(function (line) {
        return normalizeText(line);
      })
      .filter(Boolean)
      .filter(function (line) {
        return !looksLikeTitleOrMenuText(line);
      });

    const output = [];

    for (const line of rough) {
      if (line.length <= config.chunkMaxLength) {
        output.push(line);
        continue;
      }

      let rest = line;
      while (rest.length > config.chunkMaxLength) {
        output.push(rest.slice(0, config.chunkMaxLength));
        rest = rest.slice(config.chunkMaxLength);
      }

      if (rest) output.push(rest);
    }

    return output;
  }

  function prepareChunks() {
    collectNovelNameWords();

    const root = findReadableRoot();
    const title = getEpisodeTitle();
    const text = collectReadableText(root);
    const bodyChunks = splitIntoChunks(text);

    chunks = [];

    if (title && !looksLikeTitleOrMenuText(title)) {
      chunks.push(title);
    }

    chunks.push(...bodyChunks);

    currentIndex = 0;
    updatePanelStatus();
    return chunks;
  }

  function speakCurrent() {
    if (!("speechSynthesis" in window)) {
      alert("このブラウザは音声読み上げに対応していません。");
      return;
    }

    if (!isReading) return;

    if (currentIndex >= chunks.length) {
      stopReading();
      return;
    }

    const text = chunks[currentIndex];

    if (!text) {
      currentIndex += 1;
      speakCurrent();
      return;
    }

    isPaused = false;

    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.lang = config.lang;
    currentUtterance.rate = 2.0;
    currentUtterance.pitch = config.pitch;
    currentUtterance.volume = config.volume;

    currentUtterance.onstart = function () {
      updatePanelStatus();
    };

    currentUtterance.onend = function () {
      if (!isReading || isPaused) return;
      currentIndex += 1;
      updatePanelStatus();
      speakCurrent();
    };

    currentUtterance.onerror = function () {
      if (!isReading || isPaused) return;
      currentIndex += 1;
      updatePanelStatus();
      speakCurrent();
    };

    updatePanelStatus();

    // スマホ対策：ユーザー操作中に直接 speak します
    window.speechSynthesis.speak(currentUtterance);
  }

  function startReading() {
    if (!("speechSynthesis" in window)) {
      alert("このブラウザは音声読み上げに対応していません。");
      return;
    }

    window.speechSynthesis.cancel();

    prepareChunks();

    if (!chunks.length) {
      alert("読み上げ対象の本文が見つかりませんでした。");
      updatePanelStatus();
      return;
    }

    currentIndex = 0;
    isReading = true;
    isPaused = false;

    updatePanelStatus();

    // voices 初期化用。失敗しても問題ありません。
    try {
      window.speechSynthesis.getVoices();
    } catch (_) {}

    speakCurrent();
  }

  function pauseReading() {
    if (!isReading) return;

    isPaused = true;
    window.speechSynthesis.pause();
    updatePanelStatus();
  }

  function resumeReading() {
    if (!("speechSynthesis" in window)) return;

    if (!isReading) {
      startReading();
      return;
    }

    isPaused = false;
    window.speechSynthesis.resume();
    updatePanelStatus();
  }

  function stopReading() {
    isReading = false;
    isPaused = false;
    currentUtterance = null;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    updatePanelStatus();
  }

  function nextChunk() {
    if (!chunks.length) prepareChunks();

    currentIndex = Math.min(currentIndex + 1, Math.max(chunks.length - 1, 0));

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    if (isReading) {
      speakCurrent();
    }

    updatePanelStatus();
  }

  function prevChunk() {
    if (!chunks.length) prepareChunks();

    currentIndex = Math.max(currentIndex - 1, 0);

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    if (isReading) {
      speakCurrent();
    }

    updatePanelStatus();
  }

  function speakTest() {
    if (!("speechSynthesis" in window)) {
      alert("このブラウザは音声読み上げに対応していません。");
      return;
    }

    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance("音声テストです。");
    u.lang = config.lang;
    u.rate = 2.0;
    u.pitch = config.pitch;
    u.volume = config.volume;

    window.speechSynthesis.speak(u);
  }

  function createButton(label, handler) {
    const button = document.createElement("button");
    button.textContent = label;

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      handler();
    });

    button.addEventListener(
      "touchend",
      function (event) {
        event.preventDefault();
        event.stopPropagation();
        handler();
      },
      { passive: false }
    );

    return button;
  }

  function createPanel() {
    if (panel) return panel;

    const style = document.createElement("style");
    style.textContent = `
@layer novelBodyReader {
  /* 右下の読み上げ操作パネル */
  .nbr-panel {
    position: fixed;
    right: 8px;
    bottom: 8px;
    z-index: 2147483647;
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    align-items: center;
    max-width: calc(100vw - 16px);
    padding: 8px;
    border-radius: 12px;
    background: rgba(20, 20, 20, 0.88);
    color: #fff;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, .25);
  }

  .nbr-panel button {
    border: 0;
    border-radius: 8px;
    padding: 8px 9px;
    background: #fff;
    color: #111;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    touch-action: manipulation;
  }

  .nbr-status {
    min-width: 98px;
    text-align: center;
    opacity: .9;
    white-space: nowrap;
  }
}
`;
    document.head.appendChild(style);

    panel = document.createElement("div");
    panel.className = "nbr-panel";

    const prevButton = createButton("前", prevChunk);
    const playButton = createButton("再生", startReading);
    const pauseButton = createButton("一時停止", pauseReading);
    const resumeButton = createButton("再開", resumeReading);
    const nextButton = createButton("次", nextChunk);
    const stopButton = createButton("停止", stopReading);
    const reloadButton = createButton("再読込", function () {
      stopReading();
      prepareChunks();
    });
    const testButton = createButton("テスト", speakTest);

    const status = document.createElement("span");
    status.className = "nbr-status";
    status.textContent = "未準備";

    panel.appendChild(prevButton);
    panel.appendChild(playButton);
    panel.appendChild(pauseButton);
    panel.appendChild(resumeButton);
    panel.appendChild(nextButton);
    panel.appendChild(stopButton);
    panel.appendChild(reloadButton);
    panel.appendChild(testButton);
    panel.appendChild(status);

    document.body.appendChild(panel);

    updatePanelStatus();
    return panel;
  }

  function updatePanelStatus() {
    const status = panel ? panel.querySelector(".nbr-status") : null;
    if (!status) return;

    if (!chunks.length) {
      status.textContent = "未準備";
      return;
    }

    const state = isPaused ? "一時停止" : isReading ? "再生中" : "停止中";
    status.textContent =
      state + " " + Math.min(currentIndex + 1, chunks.length) + "/" + chunks.length;
  }

  function init() {
    createPanel();

    setTimeout(function () {
      prepareChunks();
    }, 800);
  }

  window[PLUGIN_NAME] = {
    start: startReading,
    pause: pauseReading,
    resume: resumeReading,
    stop: stopReading,
    next: nextChunk,
    prev: prevChunk,
    reload: prepareChunks,
    test: speakTest,
    config: config
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
