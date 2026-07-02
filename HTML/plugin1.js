(function () {
  "use strict";

  const style = document.createElement("style");
  style.textContent = `
@layer imageGuardLite {
  /* 画像の選択・ドラッグ・長押しメニューを抑制 */
  img,
  picture,
  svg,
  canvas {
    -webkit-user-select: none;
    user-select: none;
    -webkit-user-drag: none;
    -webkit-touch-callout: none;
  }

  /* 画像だけをより強めに保護 */
  img {
    pointer-events: auto;
  }
}
`;
  document.head.appendChild(style);

  function protectImage(img) {
    img.setAttribute("draggable", "false");
    img.addEventListener("dragstart", function (event) {
      event.preventDefault();
    });
    img.addEventListener("contextmenu", function (event) {
      event.preventDefault();
    });
    img.addEventListener("selectstart", function (event) {
      event.preventDefault();
    });
  }

  function protectAllImages() {
    document.querySelectorAll("img").forEach(protectImage);
  }

  protectAllImages();

  const observer = new MutationObserver(function () {
    protectAllImages();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  document.addEventListener("dragstart", function (event) {
    if (event.target && event.target.closest && event.target.closest("img")) {
      event.preventDefault();
    }
  }, true);

  document.addEventListener("contextmenu", function (event) {
    if (event.target && event.target.closest && event.target.closest("img")) {
      event.preventDefault();
    }
  }, true);
})();
