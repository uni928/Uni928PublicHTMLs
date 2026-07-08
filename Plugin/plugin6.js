(function () {
  "use strict";

  const STYLE_ID = "uni-md-box-plugin-style";
  const TOAST_ID = "uni-md-box-plugin-toast";
  const PROCESSED_ATTR = "data-md-box-processed";

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("\n", "&#10;");
  }

  function sanitizeUrl(url) {
    const value = String(url || "").trim();
    if (/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(value)) return value;
    return "#";
  }

  function renderInline(markdown) {
    let text = escapeHtml(markdown);

    const codeStore = [];
    text = text.replace(/`([^`\n]+)`/g, function (_, code) {
      const index = codeStore.length;
      codeStore.push(code);
      return `@@CODE_${index}@@`;
    });

    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, label, url) {
      const safeUrl = sanitizeUrl(url);
      return `<a class="md-box-link" href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });

    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    text = text.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");

    text = text.replace(/@@CODE_(\d+)@@/g, function (_, index) {
      const code = codeStore[Number(index)] || "";
      return `<code class="md-inline-code" data-md-copy="${escapeAttr(code)}">${escapeHtml(code)}</code>`;
    });

    return text;
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
    const html = [];
    let i = 0;

    function readUntilBlank(start) {
      const parts = [];
      let j = start;
      while (j < lines.length && lines[j].trim() !== "") {
        parts.push(lines[j]);
        j++;
      }
      return { parts, next: j };
    }

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        i++;
        continue;
      }

      const fence = line.match(/^```([A-Za-z0-9_-]*)\s*$/);
      if (fence) {
        const lang = fence[1] || "";
        const codeLines = [];
        i++;

        while (i < lines.length && !/^```\s*$/.test(lines[i])) {
          codeLines.push(lines[i]);
          i++;
        }

        if (i < lines.length) i++;

        const codeText = codeLines.join("\n");
        html.push(
          `<div class="md-code-wrap">` +
            `<button class="md-code-copy" type="button" data-md-copy="${escapeAttr(codeText)}" aria-label="コードをコピー">コピー</button>` +
            `<pre class="md-code-block"><code${lang ? ` data-lang="${escapeAttr(lang)}"` : ""}>${escapeHtml(codeText)}</code></pre>` +
          `</div>`
        );
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        html.push(`<h${level} class="md-h md-h${level}">${renderInline(heading[2].trim())}</h${level}>`);
        i++;
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        html.push(`<hr class="md-hr">`);
        i++;
        continue;
      }

      if (/^>\s?/.test(line)) {
        const quoteLines = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          quoteLines.push(lines[i].replace(/^>\s?/, ""));
          i++;
        }
        html.push(`<blockquote class="md-quote">${renderMarkdown(quoteLines.join("\n"))}</blockquote>`);
        continue;
      }

      if (/^\s*[-*+]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
          i++;
        }
        html.push(`<ul class="md-list">${items.map(item => `<li>${renderInline(item)}</li>`).join("")}</ul>`);
        continue;
      }

      if (/^\s*\d+[.)]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
          i++;
        }
        html.push(`<ol class="md-list md-list-ordered">${items.map(item => `<li>${renderInline(item)}</li>`).join("")}</ol>`);
        continue;
      }

      const paragraph = readUntilBlank(i);
      html.push(`<p class="md-p">${renderInline(paragraph.parts.join(" "))}</p>`);
      i = paragraph.next;
    }

    return html.join("\n");
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    if (el.classList.contains("unsetAllMode")) {
      style.textContent = `
@layer base {
  /* md-box内だけ既存CSSの影響をできるだけ遮断 */
  .md-box,
  .md-box * {
    all: unset;
    box-sizing: border-box;
  }

  /* md-box本体の基本表示を再定義 */
  .md-box {
    display: block;
    max-width: 100%;
    line-height: 1.8;
    color: #1f2933;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 16px;
    overflow-wrap: anywhere;
  }

  /* よく使う文字装飾を復元 */
  .md-box strong {
    display: inline;
    font-weight: 700;
  }

  .md-box em {
    display: inline;
    font-style: italic;
  }

  /* 見出し */
  .md-box .md-h {
    display: block;
    margin: 1.1em 0 0.55em;
    line-height: 1.35;
    font-weight: 700;
    color: #102a43;
  }

  .md-box .md-h1 {
    font-size: 1.65em;
    padding-bottom: 0.25em;
    border-bottom: 2px solid #d9e8f5;
  }

  .md-box .md-h2 {
    font-size: 1.35em;
    padding-left: 0.5em;
    border-left: 4px solid #5aa7d6;
  }

  .md-box .md-h3 {
    font-size: 1.18em;
  }

  .md-box .md-h4,
  .md-box .md-h5,
  .md-box .md-h6 {
    font-size: 1.05em;
  }

  /* 段落 */
  .md-box .md-p {
    display: block;
    margin: 0.65em 0;
  }

  /* リスト */
  .md-box .md-list {
    display: block;
    margin: 0.65em 0;
    padding-left: 1.45em;
  }

  .md-box ul.md-list {
    list-style: disc;
  }

  .md-box ol.md-list {
    list-style: decimal;
  }

  .md-box .md-list li {
    display: list-item;
    margin: 0.25em 0;
  }

  /* 引用 */
  .md-box .md-quote {
    display: block;
    margin: 0.85em 0;
    padding: 0.65em 0.9em;
    border-left: 4px solid #9fc1d6;
    background: #f5fbff;
    color: #334e68;
  }

  .md-box .md-quote > :first-child {
    margin-top: 0;
  }

  .md-box .md-quote > :last-child {
    margin-bottom: 0;
  }

  /* 区切り線 */
  .md-box .md-hr {
    display: block;
    height: 0;
    border: 0;
    border-top: 1px solid #d9e2ec;
    margin: 1.2em 0;
  }

  /* リンク */
  .md-box .md-box-link {
    display: inline;
    color: #17628f;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
}

@layer make1 {
  /* インラインコード。クリックでコピー */
  .md-box .md-inline-code {
    position: relative;
    display: inline-flex;
    align-items: center;
    vertical-align: baseline;
    max-width: 100%;
    padding: 0.05em 1.75em 0.05em 0.35em;
    margin: 0 0.08em;
    border-radius: 4px;
    background: #edf7ff;
    color: #174a67;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 0.92em;
    line-height: 1.55;
    cursor: pointer;
    user-select: none;
    white-space: normal;
  }

  .md-box .md-inline-code::before,
  .md-box .md-inline-code::after {
    content: "";
    position: absolute;
    display: block;
    width: 0.58em;
    height: 0.58em;
    border: 1.5px solid currentColor;
    border-radius: 2px;
    background: #edf7ff;
  }

  .md-box .md-inline-code::before {
    right: 0.58em;
    bottom: 0.38em;
    opacity: 0.85;
  }

  .md-box .md-inline-code::after {
    right: 0.34em;
    bottom: 0.18em;
  }
}

@layer make2 {
  /* コードブロックとコピーボタン */
  .md-box .md-code-wrap {
    position: relative;
    display: block;
    margin: 0.9em 0;
  }

  .md-box .md-code-block {
    display: block;
    margin: 0;
    padding: 0.9em;
    padding-top: 2.5em;
    border: 1px solid #d9e2ec;
    border-radius: 10px;
    background: #f7fafc;
    overflow: auto;
    line-height: 1.55;
    white-space: pre;
  }

  .md-box .md-code-block code {
    display: inline;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 0.92em;
    white-space: pre;
  }

  .md-box .md-code-copy {
    position: absolute;
    top: 0.55em;
    right: 0.55em;
    display: inline-flex;
    align-items: center;
    gap: 0.35em;
    min-height: 28px;
    padding: 0.25em 0.6em;
    border: 1px solid #bcccdc;
    border-radius: 999px;
    background: #ffffff;
    color: #334e68;
    font: inherit;
    font-size: 0.82em;
    line-height: 1.3;
    cursor: pointer;
    user-select: none;
  }

  .md-box .md-code-copy::before {
    content: "";
    display: inline-block;
    width: 0.72em;
    height: 0.72em;
    border: 1.5px solid currentColor;
    border-radius: 2px;
    box-shadow: -0.25em -0.22em 0 -1px #fff, -0.25em -0.22em 0 0 currentColor;
  }
}

@layer make3 {
  /* コピー完了表示 */
  .md-box .md-copy-flash {
    background: #e9ffe9;
    color: #257a38;
  }

  /* トーストはmd-box外に出るため、単独で既存CSSを遮断 */
  .md-box-toast,
  .md-box-toast * {
    all: unset;
    box-sizing: border-box;
  }

  .md-box-toast {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%) translateY(12px);
    z-index: 2147483647;
    display: block;
    padding: 10px 14px;
    border-radius: 999px;
    background: rgba(20, 20, 20, 0.9);
    color: #fff;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 14px;
    line-height: 1.4;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s ease, transform 0.18s ease;
  }

  .md-box-toast.show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
`;
  } else {
    style.textContent = `
@layer base {
  /* Markdown表示エリアの基本 */
  .md-box {
    box-sizing: border-box;
    max-width: 100%;
    line-height: 1.8;
    color: #1f2933;
    overflow-wrap: anywhere;
  }

  .md-box * {
    box-sizing: border-box;
  }

  /* 見出し */
  .md-box .md-h {
    margin: 1.1em 0 0.55em;
    line-height: 1.35;
    font-weight: 700;
    color: #102a43;
  }

  .md-box .md-h1 {
    font-size: 1.65em;
    padding-bottom: 0.25em;
    border-bottom: 2px solid #d9e8f5;
  }

  .md-box .md-h2 {
    font-size: 1.35em;
    padding-left: 0.5em;
    border-left: 4px solid #5aa7d6;
  }

  .md-box .md-h3 {
    font-size: 1.18em;
  }

  .md-box .md-h4,
  .md-box .md-h5,
  .md-box .md-h6 {
    font-size: 1.05em;
  }

  /* 段落・リスト */
  .md-box .md-p {
    margin: 0.65em 0;
  }

  .md-box .md-list {
    margin: 0.65em 0;
    padding-left: 1.45em;
  }

  .md-box .md-list li {
    margin: 0.25em 0;
  }

  /* 引用 */
  .md-box .md-quote {
    margin: 0.85em 0;
    padding: 0.65em 0.9em;
    border-left: 4px solid #9fc1d6;
    background: #f5fbff;
    color: #334e68;
  }

  .md-box .md-quote > :first-child {
    margin-top: 0;
  }

  .md-box .md-quote > :last-child {
    margin-bottom: 0;
  }

  /* 区切り線 */
  .md-box .md-hr {
    border: 0;
    border-top: 1px solid #d9e2ec;
    margin: 1.2em 0;
  }

  /* リンク */
  .md-box .md-box-link {
    color: #17628f;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
}

@layer make1 {
  /* インラインコード。クリックでコピー */
  .md-box .md-inline-code {
    position: relative;
    display: inline-flex;
    align-items: center;
    vertical-align: baseline;
    max-width: 100%;
    padding: 0.05em 1.75em 0.05em 0.35em;
    margin: 0 0.08em;
    border-radius: 4px;
    background: #edf7ff;
    color: #174a67;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 0.92em;
    cursor: pointer;
    user-select: none;
  }

  .md-box .md-inline-code::before,
  .md-box .md-inline-code::after {
    content: "";
    position: absolute;
    width: 0.58em;
    height: 0.58em;
    border: 1.5px solid currentColor;
    border-radius: 2px;
    background: #edf7ff;
  }

  .md-box .md-inline-code::before {
    right: 0.58em;
    bottom: 0.38em;
    opacity: 0.85;
  }

  .md-box .md-inline-code::after {
    right: 0.34em;
    bottom: 0.18em;
  }
}

@layer make2 {
  /* コードブロックとコピー按钮 */
  .md-box .md-code-wrap {
    position: relative;
    margin: 0.9em 0;
  }

  .md-box .md-code-block {
    margin: 0;
    padding: 0.9em;
    padding-top: 2.5em;
    border: 1px solid #d9e2ec;
    border-radius: 10px;
    background: #f7fafc;
    overflow: auto;
    line-height: 1.55;
  }

  .md-box .md-code-block code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 0.92em;
    white-space: pre;
  }

  .md-box .md-code-copy {
    position: absolute;
    top: 0.55em;
    right: 0.55em;
    display: inline-flex;
    align-items: center;
    gap: 0.35em;
    min-height: 28px;
    padding: 0.25em 0.6em;
    border: 1px solid #bcccdc;
    border-radius: 999px;
    background: #ffffff;
    color: #334e68;
    font: inherit;
    font-size: 0.82em;
    cursor: pointer;
  }

  .md-box .md-code-copy::before {
    content: "";
    width: 0.72em;
    height: 0.72em;
    border: 1.5px solid currentColor;
    border-radius: 2px;
    box-shadow: -0.25em -0.22em 0 -1px #fff, -0.25em -0.22em 0 0 currentColor;
  }
}

@layer make3 {
  /* コピー完了表示 */
  .md-box .md-copy-flash {
    background: #e9ffe9;
    color: #257a38;
  }

  .md-box-toast {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%) translateY(12px);
    z-index: 2147483647;
    padding: 10px 14px;
    border-radius: 999px;
    background: rgba(20, 20, 20, 0.9);
    color: #fff;
    font-size: 14px;
    line-height: 1.4;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s ease, transform 0.18s ease;
  }

  .md-box-toast.show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
`;
  }
    document.head.appendChild(style);
  }

  function showToast(message) {
    let toast = document.getElementById(TOAST_ID);

    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.className = "md-box-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () {
      toast.classList.remove("show");
    }, 1200);
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }

  function onCopyClick(event) {
    const copyEl = event.target.closest("[data-md-copy]");
    if (!copyEl) return;

    const text = copyEl.getAttribute("data-md-copy") || "";
    if (!text) {
      showToast("コピーする文章がありません");
      return;
    }

    copyToClipboard(text)
      .then(function () {
        copyEl.classList.add("md-copy-flash");
        showToast("コピーしました");
        setTimeout(function () {
          copyEl.classList.remove("md-copy-flash");
        }, 700);
      })
      .catch(function (error) {
        console.error("コピーに失敗しました", error);
        showToast("コピーに失敗しました");
      });
  }

  function renderOne(el) {
    if (!el || el.getAttribute(PROCESSED_ATTR) === "1") return;

    const markdown = el.textContent || "";
    el.innerHTML = renderMarkdown(markdown);
    el.setAttribute(PROCESSED_ATTR, "1");
  }

  function renderAll(root) {
    const base = root || document;
    const targets = base.querySelectorAll(".md-box:not([" + PROCESSED_ATTR + "='1'])");
    targets.forEach(renderOne);
  }

  function init() {
    injectStyle();
    renderAll(document);
    document.addEventListener("click", onCopyClick);
  }

  window.MdBoxPlugin = {
    renderAll,
    renderOne,
    renderMarkdown
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
