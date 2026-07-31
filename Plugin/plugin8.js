/**
 * DOM Source Cleaner - Temporary Site Edition
 *
 * Usage:
 *   <script src="./dom-source-cleaner-temporary-site.js" defer></script>
 *
 * Optional data attributes:
 *   data-open-temporary-site="true"       // default: true
 *   data-remove-inline-handlers="true"    // default: true
 *   data-remove-javascript-urls="true"    // default: true
 *   data-keep-self="false"                // default: false
 *
 * The first load serializes the page into a Blob URL and opens it in the same tab.
 * The Blob page then migrates CSS to adoptedStyleSheets and removes source elements.
 * This increases inspection friction; it is not strong secrecy.
 */
(function () {
  "use strict";

  const TEMP_ATTRIBUTE = "data-dom-source-cleaner-temporary";
  const selfScript = document.currentScript;
  const options = {
    openTemporarySite: selfScript?.dataset.openTemporarySite !== "false",
    removeInlineHandlers: selfScript?.dataset.removeInlineHandlers !== "false",
    removeJavascriptUrls: selfScript?.dataset.removeJavascriptUrls !== "false",
    keepSelf: selfScript?.dataset.keepSelf === "true"
  };

  function getDoctypeText() {
    const doctype = document.doctype;
    if (!doctype) return "<!DOCTYPE html>";

    let value = `<!DOCTYPE ${doctype.name}`;
    if (doctype.publicId) value += ` PUBLIC "${doctype.publicId}"`;
    if (!doctype.publicId && doctype.systemId) value += " SYSTEM";
    if (doctype.systemId) value += ` "${doctype.systemId}"`;
    return `${value}>`;
  }

  function ensureBaseElement(root, sourceUrl) {
    const head = root.querySelector("head");
    if (!head || head.querySelector("base")) return;

    const base = root.ownerDocument.createElement("base");
    base.href = sourceUrl;
    head.prepend(base);
  }

  function openAsTemporarySite() {
    if (!options.openTemporarySite) return false;
    if (document.documentElement.hasAttribute(TEMP_ATTRIBUTE)) return false;
    if (!/^https?:$|^file:$/.test(location.protocol)) return false;

    const clone = document.documentElement.cloneNode(true);
    clone.setAttribute(TEMP_ATTRIBUTE, "1");
    ensureBaseElement(clone, location.href);

    const html = `${getDoctypeText()}\n${clone.outerHTML}`;
    const blob = new Blob([html], { type: "text/html;charset=UTF-8" });
    const temporaryUrl = URL.createObjectURL(blob);

    location.replace(temporaryUrl);
    return true;
  }

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
    if (!media || media.toLowerCase() === "all") return cssText;
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

    return rel.includes("stylesheet") &&
      !rel.includes("alternate") &&
      !link.disabled &&
      Boolean(link.href);
  }

  async function fetchCssFromLink(link) {
    if (!shouldMigrateStylesheet(link)) return null;

    try {
      const response = await fetch(link.href, {
        cache: "force-cache",
        credentials: "same-origin"
      });
      if (!response.ok) return null;

      let cssText = await response.text();
      cssText = cssText.replace(/@import\s+[^;]+;/gi, function (rule) {
        return `/* Unsupported import removed: ${rule} */`;
      });
      cssText = absolutizeCssUrls(cssText, link.href);
      return wrapMedia(cssText, link.media && link.media.mediaText);
    } catch (_) {
      return null;
    }
  }

  function collectInlineStyles() {
    const cssTexts = [];
    document.querySelectorAll("style").forEach(function (style) {
      if (!style.textContent || style.disabled) return;
      cssTexts.push(wrapMedia(
        style.textContent,
        style.media && style.media.mediaText
      ));
    });
    return cssTexts;
  }

  async function collectLinkedStyles() {
    const cssTexts = [];
    for (const link of document.querySelectorAll("link[rel~='stylesheet']")) {
      const cssText = await fetchCssFromLink(link);
      if (cssText) cssTexts.push(cssText);
    }
    return cssTexts;
  }

  function removeInlineEventHandlers() {
    document.querySelectorAll("*").forEach(function (element) {
      for (const attribute of Array.from(element.attributes)) {
        if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
      }
    });
  }

  function removeJavascriptUrls() {
    const attributes = ["href", "src", "action", "formaction", "xlink:href"];

    document.querySelectorAll("*").forEach(function (element) {
      for (const attributeName of attributes) {
        const value = element.getAttribute(attributeName);
        if (!value) continue;

        const normalized = value
          .trim()
          .replace(/[\u0000-\u001F\u007F\s]+/g, "");

        if (/^javascript:/i.test(normalized)) {
          element.removeAttribute(attributeName);
        }
      }
    });
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
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      return true;
    } catch (_) {
      return false;
    }
  }

  function removeSourceElements() {
    document.querySelectorAll("style").forEach(function (node) {
      node.remove();
    });

    document.querySelectorAll("link").forEach(function (link) {
      if (isStylesheetLink(link)) link.remove();
    });

    document.querySelectorAll("script").forEach(function (script) {
      if (options.keepSelf && script === selfScript) return;
      script.remove();
    });

    if (!options.keepSelf) selfScript?.remove();
  }

  async function cleanTemporarySite() {
    const cssTexts = [
      ...collectInlineStyles(),
      ...(await collectLinkedStyles())
    ];

    const migrated = await migrateStyles(cssTexts);

    // CSS migration failed: retain CSS nodes to avoid destroying the layout.
    if (migrated) {
      document.querySelectorAll("style").forEach(function (node) {
        node.remove();
      });
      document.querySelectorAll("link").forEach(function (link) {
        if (isStylesheetLink(link)) link.remove();
      });
    }

    if (options.removeInlineHandlers) removeInlineEventHandlers();
    if (options.removeJavascriptUrls) removeJavascriptUrls();

    document.querySelectorAll("script").forEach(function (script) {
      if (options.keepSelf && script === selfScript) return;
      script.remove();
    });

    if (!options.keepSelf) selfScript?.remove();
  }

  async function run() {
    if (openAsTemporarySite()) return;
    await cleanTemporarySite();
  }

  if (document.readyState === "complete") {
    void run();
  } else {
    addEventListener("load", function () {
      void run();
    }, { once: true });
  }
})();
