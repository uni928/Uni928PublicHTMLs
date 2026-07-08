(function () {
  "use strict";

  const STYLE_ID = "uni-copy-text-plugin-style";
  const TOAST_ID = "uni-copy-text-plugin-toast";

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
@layer base {
  .copy-text {
    position: relative;
    display: inline-flex;
    align-items: center;
    vertical-align: baseline;
    cursor: pointer;
    user-select: none;
    color: #17628f;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
    background: #eaf6ff;
    border-radius: 4px;
    padding: 1px 24px 1px 4px;
    margin: 0 2px;
    line-height: 1.4;
  }

  .copy-text::before {
    content: "";
    position: absolute;
    right: 11px;
    bottom: 5px;
    width: 8px;
    height: 8px;
    border: 1.5px solid currentColor;
    border-radius: 2px;
    background: #eaf6ff;
    opacity: 0.9;
    box-sizing: border-box;
  }

  .copy-text::after {
    content: "";
    position: absolute;
    right: 7px;
    bottom: 2px;
    width: 8px;
    height: 8px;
    border: 1.5px solid currentColor;
    border-radius: 2px;
    background: #eaf6ff;
    box-sizing: border-box;
  }

  .copy-text.copied {
    background: #e9ffe9;
    color: #257a38;
  }

  .copy-text.copied::before,
  .copy-text.copied::after {
    background: #e9ffe9;
  }

  .copy-text-toast {
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

  .copy-text-toast.show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
`;
    document.head.appendChild(style);
  }

  function showToast(message) {
    let toast = document.getElementById(TOAST_ID);

    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.className = "copy-text-toast";
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

  async function copyText(text) {
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

  function getCopyTargetText(el) {
    const customText = el.getAttribute("data-copy-text");
    if (customText !== null) return customText;
    return el.innerText.trim();
  }

  function onClick(event) {
    const el = event.target.closest(".copy-text");
    if (!el) return;

    const text = getCopyTargetText(el);
    if (!text) {
      showToast("コピーする文章がありません");
      return;
    }

    copyText(text)
      .then(function () {
        el.classList.add("copied");
        showToast("コピーしました");

        setTimeout(function () {
          el.classList.remove("copied");
        }, 700);
      })
      .catch(function (error) {
        console.error("コピーに失敗しました", error);
        showToast("コピーに失敗しました");
      });
  }

  function init() {
    injectStyle();
    document.addEventListener("click", onClick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
