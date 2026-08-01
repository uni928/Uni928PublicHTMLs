(function () {
  "use strict";

  const TAG_NAME = "html-part";
  const loadedExternalScripts = new Map();

  function absoluteUrl(value, baseUrl) {
    return new URL(value, baseUrl).href;
  }

  function shouldRewriteUrl(value) {
    if (!value) return false;
    const trimmed = value.trim();
    return !(
      trimmed.startsWith("#") ||
      trimmed.startsWith("data:") ||
      trimmed.startsWith("blob:") ||
      trimmed.startsWith("javascript:") ||
      trimmed.startsWith("mailto:") ||
      trimmed.startsWith("tel:")
    );
  }

  function rewriteSrcset(value, baseUrl) {
    return value
      .split(",")
      .map((candidate) => {
        const parts = candidate.trim().split(/\s+/);
        if (parts[0] && shouldRewriteUrl(parts[0])) {
          parts[0] = absoluteUrl(parts[0], baseUrl);
        }
        return parts.join(" ");
      })
      .join(", ");
  }

  function rewriteCssUrls(cssText, baseUrl) {
    return cssText
      .replace(
        /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
        (match, quote, url) => {
          if (!shouldRewriteUrl(url)) return match;
          return `url("${absoluteUrl(url, baseUrl)}")`;
        }
      )
      .replace(
        /@import\s+(?:url\(\s*)?(['"])([^'"]+)\1\s*\)?/gi,
        (match, quote, url) => {
          if (!shouldRewriteUrl(url)) return match;
          return `@import url("${absoluteUrl(url, baseUrl)}")`;
        }
      );
  }

  function rewriteElementUrls(root, baseUrl) {
    const urlAttributes = [
      "src",
      "href",
      "action",
      "formaction",
      "poster",
      "data",
      "cite",
      "background",
      "manifest"
    ];

    for (const element of root.querySelectorAll("*")) {
      for (const name of urlAttributes) {
        if (!element.hasAttribute(name)) continue;

        const value = element.getAttribute(name);
        if (shouldRewriteUrl(value)) {
          element.setAttribute(name, absoluteUrl(value, baseUrl));
        }
      }

      if (element.hasAttribute("srcset")) {
        element.setAttribute(
          "srcset",
          rewriteSrcset(element.getAttribute("srcset"), baseUrl)
        );
      }

      if (element.hasAttribute("style")) {
        element.setAttribute(
          "style",
          rewriteCssUrls(element.getAttribute("style"), baseUrl)
        );
      }

      if (element.tagName === "STYLE") {
        element.textContent = rewriteCssUrls(element.textContent, baseUrl);
      }
    }
  }

  function cloneExecutableScript(sourceScript, baseUrl) {
    const script = document.createElement("script");

    for (const attribute of sourceScript.attributes) {
      if (attribute.name === "src") continue;
      script.setAttribute(attribute.name, attribute.value);
    }

    if (sourceScript.src || sourceScript.getAttribute("src")) {
      script.src = absoluteUrl(
        sourceScript.getAttribute("src") || sourceScript.src,
        baseUrl
      );
    } else {
      script.textContent =
        sourceScript.textContent +
        `\n//# sourceURL=${baseUrl.replace(/\s/g, "%20")}#inline-script`;
    }

    return script;
  }

  function waitForScript(script) {
    return new Promise((resolve, reject) => {
      if (!script.src) {
        resolve();
        return;
      }

      script.addEventListener("load", resolve, { once: true });
      script.addEventListener(
        "error",
        () => reject(new Error(`スクリプトを読み込めませんでした: ${script.src}`)),
        { once: true }
      );
    });
  }

  async function executeScript(sourceScript, destination, baseUrl) {
    const executable = cloneExecutableScript(sourceScript, baseUrl);
    const isExternal = Boolean(executable.src);
    const allowDuplicate = sourceScript.hasAttribute("data-allow-duplicate");

    if (isExternal && !allowDuplicate) {
      const key = `${executable.type || "text/javascript"}::${executable.src}`;

      if (loadedExternalScripts.has(key)) {
        await loadedExternalScripts.get(key);
        sourceScript.remove();
        return;
      }

      const loading = waitForScript(executable);
      loadedExternalScripts.set(key, loading);

      sourceScript.replaceWith(executable);

      try {
        await loading;
      } catch (error) {
        loadedExternalScripts.delete(key);
        throw error;
      }

      return;
    }

    const loading = waitForScript(executable);
    sourceScript.replaceWith(executable);
    await loading;
  }

  function getIncludeChain(element, currentUrl) {
    const chain = [];

    for (
      let parent = element.parentElement?.closest(TAG_NAME);
      parent;
      parent = parent.parentElement?.closest(TAG_NAME)
    ) {
      if (parent.resolvedSrc) chain.unshift(parent.resolvedSrc);
    }

    chain.push(currentUrl);
    return chain;
  }

  async function waitForNestedParts(element) {
    while (true) {
      const nestedParts = [...element.querySelectorAll(TAG_NAME)].filter(
        (part) => part !== element
      );

      if (nestedParts.length === 0) return;

      await Promise.all(nestedParts.map((part) => part.whenReady));

      const pending = [...element.querySelectorAll(TAG_NAME)].some(
        (part) => part !== element && !part.isReady
      );

      if (!pending) return;
    }
  }

  class HtmlPart extends HTMLElement {
    constructor() {
      super();
      this._loadPromise = Promise.resolve();
      this._resolvedSrc = "";
      this._isReady = false;
    }

    static get observedAttributes() {
      return ["src"];
    }

    connectedCallback() {
      if (!this.hasAttribute("src")) {
        this.fail(new Error("html-part に src 属性がありません。"));
        return;
      }

      if (!this._started) {
        this._started = true;
        this.load();
      }
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (
        name === "src" &&
        this.isConnected &&
        this._started &&
        oldValue !== newValue
      ) {
        this.load();
      }
    }

    get whenReady() {
      return this._loadPromise;
    }

    get resolvedSrc() {
      return this._resolvedSrc;
    }

    get isReady() {
      return this._isReady;
    }

    async load() {
      this._isReady = false;
      this.setAttribute("aria-busy", "true");
      this.removeAttribute("data-error");

      this._loadPromise = this.performLoad().catch((error) => {
        this.fail(error);
        throw error;
      });

      return this._loadPromise;
    }

    async performLoad() {
      const rawSrc = this.getAttribute("src");
      const inheritedBase =
        this.parentElement?.closest(TAG_NAME)?.resolvedSrc || document.baseURI;
      const sourceUrl = absoluteUrl(rawSrc, inheritedBase);

      this._resolvedSrc = sourceUrl;

      const chain = getIncludeChain(this, sourceUrl);
      const duplicateIndex = chain.indexOf(sourceUrl);

      if (duplicateIndex !== chain.length - 1) {
        throw new Error(`循環参照を検出しました: ${chain.join(" -> ")}`);
      }

      const response = await fetch(sourceUrl, {
        credentials: "same-origin",
        cache: this.hasAttribute("no-cache") ? "no-store" : "default"
      });

      if (!response.ok) {
        throw new Error(
          `HTMLを読み込めませんでした: ${response.status} ${response.statusText}`
        );
      }

      const html = await response.text();
      const parsed = new DOMParser().parseFromString(html, "text/html");
      const fragment = document.createDocumentFragment();

      const headNodes = [...parsed.head.children].filter((node) =>
        node.matches('style, link[rel="stylesheet"], script')
      );

      for (const node of [...headNodes, ...parsed.body.childNodes]) {
        fragment.append(node.cloneNode(true));
      }

      const holder = document.createElement("div");
      holder.append(fragment);
      rewriteElementUrls(holder, sourceUrl);

      const scripts = [...holder.querySelectorAll("script")];

      this.replaceChildren(...holder.childNodes);

      for (const script of scripts) {
        if (!script.isConnected) continue;
        await executeScript(script, this, sourceUrl);
      }

      await waitForNestedParts(this);

      this._isReady = true;
      this.removeAttribute("aria-busy");
      this.setAttribute("data-loaded", "");
      this.dispatchEvent(
        new CustomEvent("htmlpartload", {
          bubbles: true,
          detail: { src: sourceUrl }
        })
      );
    }

    fail(error) {
      console.error("[html-part]", error);
      this._isReady = false;
      this.removeAttribute("aria-busy");
      this.setAttribute("data-error", "");
      this.textContent = `部品の読み込みに失敗しました: ${error.message}`;
      this.dispatchEvent(
        new CustomEvent("htmlparterror", {
          bubbles: true,
          detail: { src: this._resolvedSrc, error }
        })
      );
    }
  }

  if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, HtmlPart);
  }

  window.HtmlPartLoader = Object.freeze({
    tagName: TAG_NAME,
    whenReady(root = document) {
      return Promise.all(
        [...root.querySelectorAll(TAG_NAME)].map((part) => part.whenReady)
      );
    }
  });
})();
