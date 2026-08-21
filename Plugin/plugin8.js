/**
 * DOM Source Cleaner
 *
 * Usage:
 *   <script src="https://uni928.github.io/Uni928PublicHTMLs/Plugin/plugin8.js"></script>
 *
 * Optional data attributes:
 *   data-remove-inline-handlers="true"
 *   data-remove-javascript-urls="true"
 *   data-keep-self="false"
 *
 * Notes:
 * - Removes style/link/script elements from the DOM after page load.
 * - Migrates readable CSS into adoptedStyleSheets when supported.
 * - This is obfuscation / inspection-friction, not strong secrecy.
 */
(function () {
  "use strict";

    let head = document.head || document.getElementsByTagName("head")[0];
  if (head) {

  const metas = [
    ["Cache-Control", "no-store, no-cache, must-revalidate, max-age=0"],
    ["Pragma", "no-cache"],
    ["Expires", "0"]
  ];

  for (const [httpEquiv, content] of metas) {
    const existing = Array.from(head.querySelectorAll("meta[http-equiv]")).find(
      meta => (meta.getAttribute("http-equiv") || "").toLowerCase() === httpEquiv.toLowerCase()
    );

    const meta = existing || document.createElement("meta");
    meta.setAttribute("http-equiv", httpEquiv);
    meta.setAttribute("content", content);

    if (!existing) head.prepend(meta);
  }
  }

  const selfScript = document.currentScript;
  const options = {
    removeInlineHandlers:
      selfScript?.dataset.removeInlineHandlers !== "false",
    removeJavascriptUrls:
      selfScript?.dataset.removeJavascriptUrls !== "false",
    keepSelf:
      selfScript?.dataset.keepSelf === "true"
  };

  function escapeCssString(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
  }

  function absolutizeCssUrls(cssText, cssUrl) {
    let baseUrl;

    try {
      baseUrl = new URL(cssUrl, document.baseURI);
    } catch (_) {
      return cssText;
    }

    return String(cssText).replace(
      /url\(\s*(['"]?)(?!data:|blob:|#|[a-z][a-z0-9+.-]*:|\/\/)([^'")]+)\1\s*\)/gi,
      function (match, quote, relativeUrl) {
        try {
          const absoluteUrl = new URL(relativeUrl.trim(), baseUrl).href;
          return `url("${escapeCssString(absoluteUrl)}")`;
        } catch (_) {
          return match;
        }
      }
    );
  }

  function wrapMedia(cssText, mediaText) {
    const media = String(mediaText || "").trim();

    if (!media || media.toLowerCase() === "all") {
      return cssText;
    }

    return `@media ${media} {\n${cssText}\n}`;
  }

  function isStylesheetLink(link) {
    const rel = (link.getAttribute("rel") || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    return rel.includes("stylesheet");
  }

  function shouldMigrateStylesheet(link) {
    const rel = (link.getAttribute("rel") || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    return (
      rel.includes("stylesheet") &&
      !rel.includes("alternate") &&
      !link.disabled &&
      Boolean(link.href)
    );
  }

  async function fetchCssFromLink(link) {
    if (!shouldMigrateStylesheet(link)) {
      return null;
    }

    try {
      const response = await fetch(link.href, {
        cache: "force-cache",
        credentials: "same-origin"
      });

      if (!response.ok) {
        return null;
      }

      let cssText = await response.text();

      cssText = cssText.replace(/@import\s+[^;]+;/gi, function (rule) {
        return `/* Unsupported import removed: ${rule} */`;
      });

      cssText = absolutizeCssUrls(cssText, link.href);
      cssText = wrapMedia(cssText, link.media && link.media.mediaText);

      return cssText;
    } catch (_) {
      return null;
    }
  }

  function collectInlineStyles() {
    const cssTexts = [];

    document.querySelectorAll("style").forEach(function (style) {
      if (!style.textContent || style.disabled) {
        return;
      }

      cssTexts.push(
        wrapMedia(style.textContent, style.media && style.media.mediaText)
      );
    });

    return cssTexts;
  }

  async function collectLinkedStyles() {
    const cssTexts = [];

    for (const link of document.querySelectorAll("link[rel~='stylesheet']")) {
      const cssText = await fetchCssFromLink(link);

      if (cssText) {
        cssTexts.push(cssText);
      }
    }

    return cssTexts;
  }

  function removeInlineEventHandlers() {
    document.querySelectorAll("*").forEach(function (element) {
      for (const attribute of Array.from(element.attributes)) {
        if (/^on/i.test(attribute.name)) {
          element.removeAttribute(attribute.name);
        }
      }
    });
  }

  function removeJavascriptUrls() {
    const attributes = [
      "href",
      "src",
      "action",
      "formaction",
      "xlink:href"
    ];

    document.querySelectorAll("*").forEach(function (element) {
      for (const attributeName of attributes) {
        const value = element.getAttribute(attributeName);

        if (!value) {
          continue;
        }

        const normalized = value
          .trim()
          .replace(/[\u0000-\u001F\u007F\s]+/g, "");

        if (/^javascript:/i.test(normalized)) {
          element.removeAttribute(attributeName);
        }
      }
    });
  }

  function removeSourceElements() {
    document.querySelectorAll("style").forEach(function (node) {
      node.remove();
    });

    document.querySelectorAll("link").forEach(function (link) {
      if (isStylesheetLink(link)) {
        link.remove();
      }
    });

    document.querySelectorAll("script").forEach(function (script) {
      if (options.keepSelf && script === selfScript) {
        return;
      }

      script.remove();
    });

    if (!options.keepSelf) {
      selfScript?.remove();
    }
  }

  async function migrateStyles(cssTexts) {
    if (
      !cssTexts.length ||
      !("adoptedStyleSheets" in document) ||
      typeof CSSStyleSheet === "undefined"
    ) {
      return false;
    }

    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(cssTexts.join("\n\n"));
      document.adoptedStyleSheets = [
        ...document.adoptedStyleSheets,
        sheet
      ];
      return true;
    } catch (_) {
      return false;
    }
  }

  async function run() {
    const cssTexts = [
      ...collectInlineStyles(),
      ...(await collectLinkedStyles())
    ];

    await migrateStyles(cssTexts);

    if (options.removeInlineHandlers) {
      removeInlineEventHandlers();
    }

    if (options.removeJavascriptUrls) {
      removeJavascriptUrls();
    }

    removeSourceElements();
  }

  if (document.readyState === "complete") {
    void run();
  } else {
    addEventListener("load", function () {
      void run();
    }, { once: true });
  }
})();
