// ==UserScript==
// @name Via Cream Black Mode
// @namespace https://uni928.local/
// @version 1.0.0
// @description 全サイトをクリーム色背景と黒文字寄りにします。
// @match http*://*/*
// @grant none
// ==/UserScript==

(function () {
  "use strict";

  const STYLE_ID = "via-cream-black-mode-style";

  const CREAM = "#f6edcf";
  const CREAM_2 = "#fff6d8";
  const BLACK = "#111111";
  const BORDER = "#2a2418";

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
@layer viaCreamBlackMode {
  /* 全体の薄い背景をクリーム色へ */
  html,
  body {
    background: ${CREAM} !important;
    color: ${BLACK} !important;
  }

  /* 通常要素をクリーム色・黒文字へ寄せる */
  body,
  main,
  article,
  section,
  div,
  p,
  span,
  li,
  ul,
  ol,
  dl,
  dt,
  dd,
  table,
  tbody,
  thead,
  tfoot,
  tr,
  td,
  th,
  blockquote,
  pre,
  code {
    background-color: ${CREAM} !important;
    color: ${BLACK} !important;
    border-color: ${BORDER} !important;
    text-shadow: none !important;
    box-shadow: none !important;
  }

  /* 見出しも黒寄りに統一 */
  h1,
  h2,
  h3,
  h4,
  h5,
  h6,
  strong,
  b,
  em,
  small {
    color: ${BLACK} !important;
    background-color: transparent !important;
    text-shadow: none !important;
  }

  /* リンクは黒寄りのまま、下線で判別 */
  a,
  a:visited,
  a:hover,
  a:active {
    color: ${BLACK} !important;
    background-color: transparent !important;
    text-decoration: underline !important;
    text-shadow: none !important;
  }

  /* 入力欄・ボタン */
  input,
  textarea,
  select,
  button {
    background-color: ${CREAM_2} !important;
    color: ${BLACK} !important;
    border: 1px solid ${BORDER} !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }

  input::placeholder,
  textarea::placeholder {
    color: #4a4030 !important;
  }

  /* ヘッダー・フッター・ナビもクリーム色へ */
  header,
  footer,
  nav,
  aside,
  menu {
    background-color: ${CREAM} !important;
    color: ${BLACK} !important;
    border-color: ${BORDER} !important;
    box-shadow: none !important;
  }

  /* 白っぽいカード・記事枠をクリーム色へ */
  [class*="card"],
  [class*="Card"],
  [class*="box"],
  [class*="Box"],
  [class*="panel"],
  [class*="Panel"],
  [class*="content"],
  [class*="Content"],
  [class*="article"],
  [class*="Article"],
  [class*="body"],
  [class*="Body"] {
    background-color: ${CREAM} !important;
    color: ${BLACK} !important;
    border-color: ${BORDER} !important;
    box-shadow: none !important;
  }

  /* SVGアイコンは黒寄り */
  svg,
  svg * {
    color: ${BLACK} !important;
    fill: currentColor !important;
    stroke: currentColor !important;
  }

  /* 画像・動画は色を壊さない */
  img,
  video,
  canvas,
  picture,
  iframe {
    background-color: transparent !important;
    color: initial !important;
    filter: none !important;
  }

  /* 選択範囲 */
  ::selection {
    background: ${BLACK} !important;
    color: ${CREAM} !important;
  }
}
`;
    document.documentElement.appendChild(style);
  }

  function repaintLightInlineStyles() {
    const all = document.querySelectorAll("[style]");

    all.forEach(function (el) {
      const style = window.getComputedStyle(el);
      const bg = style.backgroundColor;
      const color = style.color;

      if (isLightColor(bg)) {
        el.style.setProperty("background-color", CREAM, "important");
      }

      if (isLightColor(color)) {
        el.style.setProperty("color", BLACK, "important");
      }
    });
  }

  function isLightColor(value) {
    const match = String(value || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) return false;

    const r = Number(match[1]);
    const g = Number(match[2]);
    const b = Number(match[3]);

    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    return brightness >= 180;
  }

  function startObserver() {
    const observer = new MutationObserver(function () {
      repaintLightInlineStyles();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"]
    });
  }

  function init() {
    injectStyle();
    repaintLightInlineStyles();
    startObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
