/*!
 * Article Jump Marker Plugin
 * Usage:
 * <span class="jump-marker" data-target="#setup">設定方法へ</span>
 */
(function () {
  "use strict";

  const CONFIG = {
    markerSelector: ".jump-marker",
    highlightClass: "jump-marker-highlight",
    activeClass: "jump-marker-active",
    highlightMs: 2600,
    scrollBehavior: "smooth",
    block: "start",
    inline: "nearest",
    offsetPx: 12
  };

  function injectStyle() {
    if (document.getElementById("jump-marker-plugin-style")) return;

    const style = document.createElement("style");
    style.id = "jump-marker-plugin-style";
    style.textContent = `
@layer base, jumpMarkerPlugin;

/* jump-marker-plugin: 押せるマーカーの見た目 */
@layer jumpMarkerPlugin {
  .jump-marker {
    cursor: pointer;
    color: #0969da;
    text-decoration: underline;
    text-underline-offset: 0.18em;
    border-radius: 0.25em;
    -webkit-tap-highlight-color: transparent;
  }

  .jump-marker:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 3px;
  }

  .jump-marker-active {
    opacity: 0.72;
  }

  .jump-marker-highlight {
    animation: jumpMarkerFlash 2.6s ease-out;
    border-radius: 0.28em;
  }

  @keyframes jumpMarkerFlash {
    0% {
      background: rgba(255, 230, 0, 0.75);
      box-shadow: 0 0 0 0.35em rgba(255, 230, 0, 0.45);
    }

    45% {
      background: rgba(255, 230, 0, 0.45);
      box-shadow: 0 0 0 0.2em rgba(255, 230, 0, 0.22);
    }

    100% {
      background: transparent;
      box-shadow: none;
    }
  }
}
`;
    document.head.appendChild(style);
  }

  function getTarget(marker) {
    const selector = marker.getAttribute("data-target");
    if (!selector) return null;

    try {
      return document.querySelector(selector);
    } catch (error) {
      console.warn("[jump-marker-plugin] Invalid data-target:", selector, error);
      return null;
    }
  }

  function scrollToTarget(target) {
    const rect = target.getBoundingClientRect();
    const top = window.scrollY + rect.top - CONFIG.offsetPx;

    window.scrollTo({
      top,
      behavior: CONFIG.scrollBehavior
    });
  }

  function highlightTarget(target) {
    target.classList.remove(CONFIG.highlightClass);

    // 同じ見出しを連続で押した時にもアニメーションを再発火させる
    void target.offsetWidth;

    target.classList.add(CONFIG.highlightClass);

    window.setTimeout(function () {
      target.classList.remove(CONFIG.highlightClass);
    }, CONFIG.highlightMs);
  }

  function activateMarker(marker) {
    const target = getTarget(marker);

    if (!target) {
      console.warn("[jump-marker-plugin] Target not found:", marker.getAttribute("data-target"));
      return;
    }

    marker.classList.add(CONFIG.activeClass);

    scrollToTarget(target);
    highlightTarget(target);

    window.setTimeout(function () {
      marker.classList.remove(CONFIG.activeClass);
    }, 400);
  }

  function setupMarker(marker) {
    if (marker.dataset.jumpMarkerReady === "1") return;

    marker.dataset.jumpMarkerReady = "1";

    if (!marker.hasAttribute("tabindex")) {
      marker.setAttribute("tabindex", "0");
    }

    if (!marker.hasAttribute("role")) {
      marker.setAttribute("role", "button");
    }

    marker.addEventListener("click", function () {
      activateMarker(marker);
    });

    marker.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateMarker(marker);
      }
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
    injectStyle();
    setupAllMarkers();
    observeAddedMarkers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
