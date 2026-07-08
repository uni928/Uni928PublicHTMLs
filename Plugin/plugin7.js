/*!
 * Article Jump Marker Plugin
 * id / class convention version
 *
 * Jump source:
 * <span class="jump-marker jm-to-setup">設定方法へ</span>
 *
 * Jump target:
 * <h2 id="setup">設定方法</h2>
 * or
 * <h2 class="setup">設定方法</h2>
 */
(function () {
  "use strict";

  const CONFIG = {
    markerSelector: ".jump-marker",
    jumpPrefix: "jm-to-",
    highlightClass: "jump-marker-highlight",
    highlightMs: 2600,
    offsetPx: 12,
    scrollBehavior: "smooth"
  };

  function injectHighlightStyle() {
    if (document.getElementById("jump-marker-plugin-style")) return;

    const style = document.createElement("style");
    style.id = "jump-marker-plugin-style";

    style.textContent = `
@layer jumpMarkerPlugin {
  /* ジャンプ先だけ一時的に背景を変える */
  .jump-marker-highlight {
    animation: jumpMarkerHighlight 2.6s ease-out;
  }

  @keyframes jumpMarkerHighlight {
    0% {
      background: rgba(255, 230, 0, 0.75);
    }

    100% {
      background: transparent;
    }
  }
}
`;

    document.head.appendChild(style);
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }

    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function getTargetName(marker) {
    const classes = Array.from(marker.classList || []);

    const foundClass = classes.find(function (className) {
      return className.indexOf(CONFIG.jumpPrefix) === 0;
    });

    if (foundClass) {
      return foundClass.slice(CONFIG.jumpPrefix.length);
    }

    if (marker.id && marker.id.indexOf(CONFIG.jumpPrefix) === 0) {
      return marker.id.slice(CONFIG.jumpPrefix.length);
    }

    return "";
  }

  function getTarget(marker) {
    const targetName = getTargetName(marker);
    if (!targetName) return null;

    const escapedName = cssEscape(targetName);

    return (
      document.getElementById(targetName) ||
      document.querySelector("." + escapedName)
    );
  }

  function scrollToTarget(target) {
    const rect = target.getBoundingClientRect();
    const top = window.scrollY + rect.top - CONFIG.offsetPx;

    window.scrollTo({
      top: top,
      behavior: CONFIG.scrollBehavior
    });
  }

  function highlightTarget(target) {
    target.classList.remove(CONFIG.highlightClass);

    // 同じ対象を連続クリックした時にもアニメーションを再発火させる
    void target.offsetWidth;

    target.classList.add(CONFIG.highlightClass);

    window.setTimeout(function () {
      target.classList.remove(CONFIG.highlightClass);
    }, CONFIG.highlightMs);
  }

  function activateMarker(marker) {
    const target = getTarget(marker);

    if (!target) {
      console.warn("[jump-marker-plugin] Target not found:", marker);
      return;
    }

    scrollToTarget(target);
    highlightTarget(target);
  }

  function setupMarker(marker) {
    if (!marker || marker.dataset.jumpMarkerReady === "1") return;

    marker.dataset.jumpMarkerReady = "1";

    marker.addEventListener("click", function () {
      activateMarker(marker);
    });
  }

  function setupAllMarkers(root) {
    const scope = root || document;
    const markers = scope.querySelectorAll(CONFIG.markerSelector);

    markers.forEach(setupMarker);
  }

  function observeAddedMarkers() {
    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (!(node instanceof Element)) return;

          if (node.matches && node.matches(CONFIG.markerSelector)) {
            setupMarker(node);
          }

          setupAllMarkers(node);
        });
      });
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function init() {
    injectHighlightStyle();
    setupAllMarkers();
    observeAddedMarkers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
