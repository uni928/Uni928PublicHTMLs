(function () {
  "use strict";

  const PLUGIN_NAME = "NovelBodyReader";

  const config = {
    autoStart: false,
    rate: 2.0, // 2倍固定
    pitch: 1.0,
    volume: 1.0,
    lang: "ja-JP",
    chunkMaxLength: 180,

    excludeTextPatterns: [
      // 14/1042 のようなページ数・進捗表記
      /^\d+\s*\/\s*\d+$/,
      /^\d+\s*／\s*\d+$/,
      /^\d+\s*-\s*\d+\s*\/\s*\d+$/,

      // ページ・話数・章っぽい短い表記
      /^第?\s*\d+\s*(話|章|部|節|ページ|頁)$/i,
      /^chapter\s*\d+/i,
      /^episode\s*\d+/i,

      // ナビ・UI
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
      /^この作品を/,
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

      // タイトル・作品名・作者情報っぽい場所
      ".title",
      ".novel_title",
      ".novel-title",
      ".novelTitle",
      ".chapter-title",
      ".chapter_title",
      ".subtitle",
      ".sub-title",
      ".work-title",
      ".book-title",
      ".story-title",
      ".author",
      ".writer"
    ],

    preferredBodySelectors: [
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
      "#content",
      ".content",
      "article",
      "main"
    ]
  };

  let chunks = [];
  let currentIndex = 0;
  let isReading = false;
  let isPaused = false;
  let currentUtterance = null;
  let panel = null;
  let pageTitleWords = [];

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

  function splitTitleWords(text) {
    const title = normalizeText(text)
      .replace(/\s*[-｜|:：]\s*/g, "\n")
      .replace(/[「」『』【】\[\]（）()]/g, "\n");

    return title
      .split(/\n+/)
      .map(normalizeText)
      .filter(function (word) {
        return word.length >= 3;
      })
      .map(normalizeForCompare)
      .filter(Boolean);
  }

  function collectPageTitleWords() {
    const words = [];

    words.push(...splitTitleWords(document.title || ""));

    const titleSelectors = [
      "h1",
      ".title",
      ".novel_title",
      ".novel-title",
      ".novelTitle",
      ".work-title",
      ".book-title",
      ".story-title"
    ];

    for (const selector of titleSelectors) {
      document.querySelectorAll(selector).forEach(function (el) {
        words.push(...splitTitleWords(el.innerText || el.textContent || ""));
      });
    }

    pageTitleWords = Array.from(new Set(words));
  }

  function isSameAsPageTitle(text) {
    const t = normalizeForCompare(text);
    if (!t) return false;

    return pageTitleWords.some(function (word) {
      if (!word) return false;

      // 完全一致
      if (t === word) return true;

      // 小説名を含む短い見出しを除外
      if (t.length <= word.length + 8 && t.includes(word)) return true;

      // document.title 側が「小説名 - サイト名」の場合の除外
      if (word.length <= t.length + 8 && word.includes(t)) return true;

      return false;
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

    return config.excludeSelectors.some(function (selector) {
      try {
        return el.matches(selector) || el.closest(selector);
      } catch (_) {
        return false;
      }
    });
  }

  function looksLikeTitleOrMenuText(text) {
    const t = normalizeText(text);
    if (!t) return true;

    // 14/1042 など
    if (/^\d+\s*[\/／]\s*\d+$/.test(t)) return true;

    // 小説名・ページタイトルっぽいもの
    if (isSameAsPageTitle(t)) return true;

    // 短すぎる単独行
    if (t.length <= 2) return true;

    // 短いUI文言
    if (t.length <= 24) {
      for (const pattern of config.excludeTextPatterns) {
        if (pattern.test(t)) return true;
      }
    }

    // 記号だけ
    if (/^[\s\-_=＊*・…—―]+$/.test(t)) return true;

    return false;
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

    const all = Array.from(document.body.querySelectorAll("article, main, section, div"));
    const best = all
      .map(function (el) {
        return {
          el: el,
          score: scoreReadableContainer(el)
        };
      })
      .filter(function (item) {
        return item.score > 0;
      })
      .sort(function (a, b) {
        return b.score - a.score;
      })[0];

    return best ? best.el : document.body;
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

      if (!isVisibleElement(el)) return;
      if (matchesExcludeSelector(el)) return;

      const tag = el.tagName.toLowerCase();

      // h1〜h6 は小説名・話タイトルの可能性が高いので除外
      if (/^h[1-6]$/.test(tag)) return;

      // aタグ単体はメニュー・リンクの可能性が高いので除外
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
    collectPageTitleWords();

    const root = findReadableRoot();
    const text = collectReadableText(root);

    chunks = splitIntoChunks(text);
    currentIndex = 0;

    updatePanelStatus();
    return chunks;
  }

  function speakCurrent() {
    if (!("speechSynthesis" in window)) {
      alert("このブラウザは音声読み上げに対応していません。");
      return;
    }

    if (currentIndex >= chunks.length) {
      stopReading();
      return;
    }

    isReading = true;
    isPaused = false;

    currentUtterance = new SpeechSynthesisUtterance(chunks[currentIndex]);
    currentUtterance.lang = config.lang;
    currentUtterance.rate = 2.0; // 2倍固定
    currentUtterance.pitch = config.pitch;
    currentUtterance.volume = config.volume;

    currentUtterance.onend = function () {
      if (!isReading || isPaused) return;
      currentIndex += 1;
      updatePanelStatus();
      speakCurrent();
    };

    currentUtterance.onerror = function () {
      currentIndex += 1;
      updatePanelStatus();
      speakCurrent();
    };

    updatePanelStatus();
    window.speechSynthesis.speak(currentUtterance);
  }

  function startReading() {
    window.speechSynthesis.cancel();

    if (!chunks.length) {
      prepareChunks();
    }

    if (!chunks.length) {
      alert("読み上げ対象の本文が見つかりませんでした。");
      return;
    }

    isReading = true;
    isPaused = false;
    speakCurrent();
  }

  function pauseReading() {
    if (!isReading) return;
    isPaused = true;
    window.speechSynthesis.pause();
    updatePanelStatus();
  }

  function resumeReading() {
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
    window.speechSynthesis.cancel();
    updatePanelStatus();
  }

  function nextChunk() {
    if (!chunks.length) prepareChunks();

    currentIndex = Math.min(currentIndex + 1, chunks.length);
    window.speechSynthesis.cancel();

    if (isReading && currentIndex < chunks.length) {
      speakCurrent();
    }

    updatePanelStatus();
  }

  function prevChunk() {
    if (!chunks.length) prepareChunks();

    currentIndex = Math.max(currentIndex - 1, 0);
    window.speechSynthesis.cancel();

    if (isReading) {
      speakCurrent();
    }

    updatePanelStatus();
  }

  function createPanel() {
    if (panel) return panel;

    const style = document.createElement("style");
    style.textContent = `
@layer novelBodyReader {
  /* 読み上げ操作パネル */
  .nbr-panel {
    position: fixed;
    right: 12px;
    bottom: 12px;
    z-index: 2147483647;
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 8px;
    border-radius: 12px;
    background: rgba(20, 20, 20, 0.86);
    color: #fff;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, .25);
  }

  .nbr-panel button {
    border: 0;
    border-radius: 8px;
    padding: 6px 8px;
    background: #fff;
    color: #111;
    cursor: pointer;
    font-size: 12px;
  }

  .nbr-panel button:hover {
    filter: brightness(0.92);
  }

  .nbr-status {
    min-width: 88px;
    text-align: center;
    opacity: .9;
  }
}
`;
    document.head.appendChild(style);

    panel = document.createElement("div");
    panel.className = "nbr-panel";

    const prevButton = document.createElement("button");
    prevButton.textContent = "前";
    prevButton.addEventListener("click", prevChunk);

    const playButton = document.createElement("button");
    playButton.textContent = "再生";
    playButton.addEventListener("click", startReading);

    const pauseButton = document.createElement("button");
    pauseButton.textContent = "一時停止";
    pauseButton.addEventListener("click", pauseReading);

    const resumeButton = document.createElement("button");
    resumeButton.textContent = "再開";
    resumeButton.addEventListener("click", resumeReading);

    const nextButton = document.createElement("button");
    nextButton.textContent = "次";
    nextButton.addEventListener("click", nextChunk);

    const stopButton = document.createElement("button");
    stopButton.textContent = "停止";
    stopButton.addEventListener("click", stopReading);

    const status = document.createElement("span");
    status.className = "nbr-status";
    status.textContent = "未準備";

    panel.appendChild(prevButton);
    panel.appendChild(playButton);
    panel.appendChild(pauseButton);
    panel.appendChild(resumeButton);
    panel.appendChild(nextButton);
    panel.appendChild(stopButton);
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
    status.textContent = state + " " + Math.min(currentIndex + 1, chunks.length) + "/" + chunks.length;
  }

  function init() {
    createPanel();

    setTimeout(function () {
      prepareChunks();

      if (config.autoStart) {
        startReading();
      }
    }, 500);
  }

  window[PLUGIN_NAME] = {
    start: startReading,
    pause: pauseReading,
    resume: resumeReading,
    stop: stopReading,
    next: nextChunk,
    prev: prevChunk,
    reload: prepareChunks,
    config: config
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
