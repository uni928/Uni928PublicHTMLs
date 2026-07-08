// ==UserScript==
// @name         Via Inject Blocker CSS Guard
// @namespace    uni928
// @version      1.0.0
// @description  via_inject_blocker.css のDOM挿入・適用を可能な範囲で無効化する
// @match        *://*/*
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  const TARGET_KEYWORDS = [
    "via_inject_blocker.css",
    "via-inject-blocker.css",
    "inject_blocker.css"
  ];

  function isTargetUrl(value) {
    if (!value) return false;
    const s = String(value).toLowerCase();
    return TARGET_KEYWORDS.some(k => s.includes(k));
  }

  function isTargetNode(node) {
    if (!node || node.nodeType !== 1) return false;

    const tag = node.tagName ? node.tagName.toLowerCase() : "";

    if (tag === "link") {
      const rel = (node.getAttribute("rel") || "").toLowerCase();
      const href = node.getAttribute("href") || node.href || "";

      if (rel.includes("stylesheet") && isTargetUrl(href)) {
        return true;
      }

      if (isTargetUrl(href)) {
        return true;
      }
    }

    if (tag === "style") {
      const text = node.textContent || "";
      if (isTargetUrl(text)) {
        return true;
      }
    }

    return false;
  }

  function disableNode(node) {
    if (!node || node.nodeType !== 1) return false;

    if (!isTargetNode(node)) return false;

    try {
      if (node.tagName && node.tagName.toLowerCase() === "link") {
        node.disabled = true;
        node.media = "not all";
        node.setAttribute("data-via-inject-blocked", "true");
        node.setAttribute("href", "about:blank");
      }

      if (node.tagName && node.tagName.toLowerCase() === "style") {
        node.setAttribute("data-via-inject-blocked", "true");
        node.textContent = "";
      }

      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }

      console.log("[Via CSS Guard] blocked:", node);
      return true;
    } catch (e) {
      console.warn("[Via CSS Guard] failed:", e);
      return false;
    }
  }

  function scanExisting() {
    try {
      document.querySelectorAll("link, style").forEach(disableNode);
    } catch (e) {
      // documentElement未生成タイミング対策
    }
  }

  // appendChild 経由の追加を妨害
  const originalAppendChild = Node.prototype.appendChild;
  Node.prototype.appendChild = function (child) {
    if (disableNode(child)) {
      return child;
    }
    return originalAppendChild.call(this, child);
  };

  // insertBefore 経由の追加を妨害
  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (newNode, referenceNode) {
    if (disableNode(newNode)) {
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, referenceNode);
  };

  // replaceChild 経由の追加を妨害
  const originalReplaceChild = Node.prototype.replaceChild;
  Node.prototype.replaceChild = function (newChild, oldChild) {
    if (disableNode(newChild)) {
      return oldChild;
    }
    return originalReplaceChild.call(this, newChild, oldChild);
  };

  // setAttribute で後から href を付けるパターン対策
  const originalSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    const tag = this.tagName ? this.tagName.toLowerCase() : "";
    const attr = String(name || "").toLowerCase();

    if (
      tag === "link" &&
      attr === "href" &&
      isTargetUrl(value)
    ) {
      console.log("[Via CSS Guard] blocked href setAttribute:", value);
      originalSetAttribute.call(this, "data-via-inject-blocked-href", String(value));
      originalSetAttribute.call(this, "href", "about:blank");
      this.disabled = true;
      this.media = "not all";
      return;
    }

    return originalSetAttribute.call(this, name, value);
  };

  // MutationObserver で後から追加されたものを削除
  function startObserver() {
    if (!document.documentElement) {
      setTimeout(startObserver, 10);
      return;
    }

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          disableNode(node);

          if (node && node.querySelectorAll) {
            node.querySelectorAll("link, style").forEach(disableNode);
          }
        }
      }

      scanExisting();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    scanExisting();
  }

  startObserver();

  document.addEventListener("DOMContentLoaded", scanExisting, true);
  window.addEventListener("load", scanExisting, true);
})();
