/**
 * DOM Source Cleaner - Portable Temporary Site Edition
 *
 * Usage:
 *   <script src="./dom-source-cleaner-portable-temporary-site.js" defer></script>
 *
 * Before moving to a Blob URL, this plug-in tries to fetch and embed resources.
 * Same-origin images, CSS, classic JavaScript, fonts and media are converted to
 * data URLs. Resources that cannot be fetched remain as absolute URLs.
 *
 * This increases inspection friction only. It is not strong secrecy.
 */
(function () {
  "use strict";

  const TEMP_ATTRIBUTE = "data-dom-source-cleaner-temporary";
  const BUILD_ATTRIBUTE = "data-dom-source-cleaner-building";
  const selfScript = document.currentScript;

  const options = {
    openTemporarySite: selfScript?.dataset.openTemporarySite !== "false",
    embedResources: selfScript?.dataset.embedResources !== "false",
    removeInlineHandlers: selfScript?.dataset.removeInlineHandlers !== "false",
    removeJavascriptUrls: selfScript?.dataset.removeJavascriptUrls !== "false",
    keepSelf: selfScript?.dataset.keepSelf === "true",
    maxResourceBytes: Number(selfScript?.dataset.maxResourceBytes || 8 * 1024 * 1024)
  };

  const resourceCache = new Map();

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
    if (!head) return;
    let base = head.querySelector("base");
    if (!base) {
      base = root.ownerDocument.createElement("base");
      head.prepend(base);
    }
    base.setAttribute("href", sourceUrl);
  }

  function toAbsoluteUrl(value, baseUrl) {
    if (!value || /^(?:data:|blob:|javascript:|mailto:|tel:|#)/i.test(value.trim())) {
      return value;
    }
    try {
      return new URL(value, baseUrl).href;
    } catch (_) {
      return value;
    }
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  async function responseToDataUrl(response) {
    const blob = await response.blob();
    if (blob.size > options.maxResourceBytes) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mime = blob.type || response.headers.get("content-type") || "application/octet-stream";
    return `data:${mime.split(";")[0]};base64,${bytesToBase64(bytes)}`;
  }

  async function fetchAsDataUrl(url) {
    if (!url || /^(?:data:|blob:|javascript:|mailto:|tel:|#)/i.test(url)) return url;
    if (resourceCache.has(url)) return resourceCache.get(url);

    const promise = (async function () {
      try {
        const response = await fetch(url, {
          cache: "force-cache",
          credentials: "same-origin"
        });
        if (!response.ok) return null;
        return await responseToDataUrl(response);
      } catch (_) {
        return null;
      }
    })();

    resourceCache.set(url, promise);
    return promise;
  }

  function escapeCssString(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  async function embedCssUrls(cssText, cssUrl) {
    const matches = [];
    const pattern = /url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi;
    let match;
    while ((match = pattern.exec(cssText)) !== null) {
      matches.push({ full: match[0], value: match[2] });
    }

    let output = cssText;
    for (const item of matches) {
      const raw = item.value.trim();
      if (/^(?:data:|blob:|#)/i.test(raw)) continue;
      const absolute = toAbsoluteUrl(raw, cssUrl);
      const dataUrl = options.embedResources ? await fetchAsDataUrl(absolute) : null;
      const replacement = dataUrl || absolute;
      output = output.split(item.full).join(`url("${escapeCssString(replacement)}")`);
    }
    return output;
  }

  async function fetchCssText(url, depth) {
    if (depth > 3) return "";
    try {
      const response = await fetch(url, { cache: "force-cache", credentials: "same-origin" });
      if (!response.ok) return "";
      let cssText = await response.text();

      const imports = [];
      const importPattern = /@import\s+(?:url\(\s*)?(['"]?)([^'"\)\s;]+)\1\s*\)?\s*([^;]*);/gi;
      let match;
      while ((match = importPattern.exec(cssText)) !== null) {
        imports.push({ full: match[0], href: match[2], media: match[3].trim() });
      }

      for (const item of imports) {
        const importUrl = toAbsoluteUrl(item.href, url);
        const imported = await fetchCssText(importUrl, depth + 1);
        const replacement = item.media && item.media.toLowerCase() !== "all"
          ? `@media ${item.media} {\n${imported}\n}`
          : imported;
        cssText = cssText.replace(item.full, replacement);
      }

      return await embedCssUrls(cssText, url);
    } catch (_) {
      return "";
    }
  }

  async function embedStyles(root, sourceUrl) {
    for (const style of root.querySelectorAll("style")) {
      if (!style.textContent) continue;
      style.textContent = await embedCssUrls(style.textContent, sourceUrl);
    }

    for (const link of Array.from(root.querySelectorAll("link[rel~='stylesheet']"))) {
      const href = toAbsoluteUrl(link.getAttribute("href"), sourceUrl);
      const cssText = await fetchCssText(href, 0);
      if (!cssText) {
        link.setAttribute("href", href);
        continue;
      }

      const style = root.ownerDocument.createElement("style");
      const media = (link.getAttribute("media") || "").trim();
      style.textContent = media && media.toLowerCase() !== "all"
        ? `@media ${media} {\n${cssText}\n}`
        : cssText;
      link.replaceWith(style);
    }
  }

  async function embedAttribute(root, selector, attribute, sourceUrl) {
    for (const element of root.querySelectorAll(selector)) {
      const raw = element.getAttribute(attribute);
      if (!raw) continue;
      const absolute = toAbsoluteUrl(raw, sourceUrl);
      const dataUrl = options.embedResources ? await fetchAsDataUrl(absolute) : null;
      element.setAttribute(attribute, dataUrl || absolute);
    }
  }

  async function embedSrcset(root, selector, sourceUrl) {
    for (const element of root.querySelectorAll(selector)) {
      const raw = element.getAttribute("srcset");
      if (!raw) continue;
      const candidates = raw.split(",").map(value => value.trim()).filter(Boolean);
      const converted = [];
      for (const candidate of candidates) {
        const parts = candidate.split(/\s+/);
        const absolute = toAbsoluteUrl(parts.shift(), sourceUrl);
        const dataUrl = options.embedResources ? await fetchAsDataUrl(absolute) : null;
        converted.push([dataUrl || absolute, ...parts].join(" "));
      }
      element.setAttribute("srcset", converted.join(", "));
    }
  }

  async function embedScripts(root, sourceUrl) {
    for (const script of root.querySelectorAll("script[src]")) {
      const raw = script.getAttribute("src");
      const absolute = toAbsoluteUrl(raw, sourceUrl);

      // data: module scripts cannot reliably resolve relative imports.
      if ((script.getAttribute("type") || "").toLowerCase() === "module") {
        script.setAttribute("src", absolute);
        continue;
      }

      const dataUrl = options.embedResources ? await fetchAsDataUrl(absolute) : null;
      script.setAttribute("src", dataUrl || absolute);
    }
  }

  function absolutizeNavigationAndForms(root, sourceUrl) {
    const mappings = [
      ["a[href]", "href"],
      ["area[href]", "href"],
      ["form[action]", "action"],
      ["button[formaction]", "formaction"],
      ["input[formaction]", "formaction"]
    ];
    for (const [selector, attribute] of mappings) {
      for (const element of root.querySelectorAll(selector)) {
        const value = element.getAttribute(attribute);
        if (value) element.setAttribute(attribute, toAbsoluteUrl(value, sourceUrl));
      }
    }
  }

  async function preparePortableClone(clone, sourceUrl) {
    ensureBaseElement(clone, sourceUrl);
    absolutizeNavigationAndForms(clone, sourceUrl);

    await embedStyles(clone, sourceUrl);
    await embedScripts(clone, sourceUrl);

    await embedAttribute(clone, "img[src]", "src", sourceUrl);
    await embedAttribute(clone, "input[type='image'][src]", "src", sourceUrl);
    await embedAttribute(clone, "video[src], audio[src], source[src], track[src], iframe[src]", "src", sourceUrl);
    await embedAttribute(clone, "video[poster]", "poster", sourceUrl);
    await embedAttribute(clone, "link[rel~='icon'][href], link[rel='manifest'][href]", "href", sourceUrl);
    await embedAttribute(clone, "object[data]", "data", sourceUrl);
    await embedSrcset(clone, "img[srcset], source[srcset]", sourceUrl);
  }

  async function openAsTemporarySite() {
    if (!options.openTemporarySite) return false;
    if (document.documentElement.hasAttribute(TEMP_ATTRIBUTE)) return false;
    if (document.documentElement.hasAttribute(BUILD_ATTRIBUTE)) return true;
    if (!/^(?:https?:|file:)$/.test(location.protocol)) return false;

    document.documentElement.setAttribute(BUILD_ATTRIBUTE, "1");
    const sourceUrl = location.href;
    const clone = document.documentElement.cloneNode(true);
    clone.removeAttribute(BUILD_ATTRIBUTE);
    clone.setAttribute(TEMP_ATTRIBUTE, "1");

    try {
      await preparePortableClone(clone, sourceUrl);
      const html = `${getDoctypeText()}\n${clone.outerHTML}`;
      const blob = new Blob([html], { type: "text/html;charset=UTF-8" });
      const temporaryUrl = URL.createObjectURL(blob);
      location.replace(temporaryUrl);
      return true;
    } catch (error) {
      document.documentElement.removeAttribute(BUILD_ATTRIBUTE);
      console.warn("DOM Source Cleaner: temporary page creation failed.", error);
      return false;
    }
  }

  function wrapMedia(cssText, mediaText) {
    const media = String(mediaText || "").trim();
    if (!media || media.toLowerCase() === "all") return cssText;
    return `@media ${media} {\n${cssText}\n}`;
  }

  function collectInlineStyles() {
    const cssTexts = [];
    document.querySelectorAll("style").forEach(function (style) {
      if (!style.textContent || style.disabled) return;
      cssTexts.push(wrapMedia(style.textContent, style.media && style.media.mediaText));
    });
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
        const normalized = value.trim().replace(/[\u0000-\u001F\u007F\s]+/g, "");
        if (/^javascript:/i.test(normalized)) element.removeAttribute(attributeName);
      }
    });
  }

  async function migrateStyles(cssTexts) {
    if (!cssTexts.length || !("adoptedStyleSheets" in document) || typeof CSSStyleSheet === "undefined") {
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

  async function cleanTemporarySite() {
    const cssTexts = collectInlineStyles();
    const migrated = await migrateStyles(cssTexts);

    if (migrated) {
      document.querySelectorAll("style, link[rel~='stylesheet']").forEach(node => node.remove());
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
    if (await openAsTemporarySite()) return;
    await cleanTemporarySite();
  }

  if (document.readyState === "complete") {
    void run();
  } else {
    addEventListener("load", function () { void run(); }, { once: true });
  }
})();
