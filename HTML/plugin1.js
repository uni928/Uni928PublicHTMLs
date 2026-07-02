(function () {
  "use strict";

  const CONFIG = {
    enabled: true,

    // IndexedDB設定
    dbName: "html-cache-replace-lite",
    dbVersion: 1,
    storeName: "pages",
    key: location.origin + location.pathname,

    // 初回保存後に1回だけ更新する
    reloadAfterFirstSave: true,
    reloadFlag: "html-cache-replace-lite-reloaded",

    // 保存済みHTMLを削除したい場合: ?clearHtmlCache=1
    clearQueryName: "clearHtmlCache",

    // 保存時にこのプラグイン自身のscriptタグを消す
    removeSelfBeforeSave: true
  };

  if (!CONFIG.enabled) return;

  const selfScript = document.currentScript;
  let imageObserver = null;
  const protectedImages = new WeakSet();

  function installImageGuardLite() {
    ensureImageGuardStyle();
    protectAllImages();
    installImageGuardDocumentEvents();
    restartImageObserver();
  }

  function ensureImageGuardStyle() {
    if (document.getElementById("image-guard-lite-style")) return;

    const style = document.createElement("style");
    style.id = "image-guard-lite-style";
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
  }

  function protectImage(img) {
    if (!img || protectedImages.has(img)) return;

    protectedImages.add(img);
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

  function installImageGuardDocumentEvents() {
    if (window.__imageGuardLiteDocumentEventsInstalled) return;
    window.__imageGuardLiteDocumentEventsInstalled = true;

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

    document.addEventListener("selectstart", function (event) {
      if (event.target && event.target.closest && event.target.closest("img")) {
        event.preventDefault();
      }
    }, true);
  }

  function restartImageObserver() {
    if (imageObserver) {
      try {
        imageObserver.disconnect();
      } catch (_) {}
    }

    imageObserver = new MutationObserver(function () {
      ensureImageGuardStyle();
      protectAllImages();
    });

    imageObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("このブラウザはIndexedDBに対応していません。"));
        return;
      }

      const request = indexedDB.open(CONFIG.dbName, CONFIG.dbVersion);

      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains(CONFIG.storeName)) {
          db.createObjectStore(CONFIG.storeName);
        }
      };

      request.onsuccess = function () {
        resolve(request.result);
      };

      request.onerror = function () {
        reject(request.error || new Error("IndexedDBを開けませんでした。"));
      };
    });
  }

  async function idbGet(key) {
    const db = await openDb();

    return new Promise(function (resolve, reject) {
      const tx = db.transaction(CONFIG.storeName, "readonly");
      const store = tx.objectStore(CONFIG.storeName);
      const request = store.get(key);

      request.onsuccess = function () {
        resolve(request.result || null);
      };

      request.onerror = function () {
        reject(request.error || new Error("IndexedDBの読込に失敗しました。"));
      };

      tx.oncomplete = function () {
        db.close();
      };

      tx.onerror = function () {
        db.close();
        reject(tx.error || new Error("IndexedDBの読込に失敗しました。"));
      };
    });
  }

  async function idbSet(key, value) {
    const db = await openDb();

    return new Promise(function (resolve, reject) {
      const tx = db.transaction(CONFIG.storeName, "readwrite");
      const store = tx.objectStore(CONFIG.storeName);

      store.put(value, key);

      tx.oncomplete = function () {
        db.close();
        resolve();
      };

      tx.onerror = function () {
        db.close();
        reject(tx.error || new Error("IndexedDBの保存に失敗しました。"));
      };
    });
  }

  async function idbDelete(key) {
    const db = await openDb();

    return new Promise(function (resolve, reject) {
      const tx = db.transaction(CONFIG.storeName, "readwrite");
      const store = tx.objectStore(CONFIG.storeName);

      store.delete(key);

      tx.oncomplete = function () {
        db.close();
        resolve();
      };

      tx.onerror = function () {
        db.close();
        reject(tx.error || new Error("IndexedDBの削除に失敗しました。"));
      };
    });
  }

  function hasClearQuery() {
    try {
      const params = new URLSearchParams(location.search);
      return params.get(CONFIG.clearQueryName) === "1";
    } catch (_) {
      return false;
    }
  }

  function removeClearQueryFromUrl() {
    try {
      const url = new URL(location.href);
      if (!url.searchParams.has(CONFIG.clearQueryName)) return;

      url.searchParams.delete(CONFIG.clearQueryName);
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch (_) {}
  }

  function getDoctypeHtml() {
    if (!document.doctype) return "<!DOCTYPE html>";

    let html = "<!DOCTYPE " + document.doctype.name;

    if (document.doctype.publicId) {
      html += ' PUBLIC "' + document.doctype.publicId + '"';
    }

    if (document.doctype.systemId) {
      html += ' "' + document.doctype.systemId + '"';
    }

    html += ">";

    return html;
  }

  function isSelfScriptLike(script) {
    if (!selfScript || !script) return false;

    if (script.getAttribute("data-image-cache-guard-lite") === "true") {
      return true;
    }

    if (selfScript.src && script.src && script.src === selfScript.src) {
      return true;
    }

    if (!selfScript.src && script.textContent === selfScript.textContent) {
      return true;
    }

    return false;
  }

  function getCurrentHtmlForSave() {
    const clonedDocumentElement = document.documentElement.cloneNode(true);

    if (CONFIG.removeSelfBeforeSave) {
      clonedDocumentElement.querySelectorAll("script").forEach(function (script) {
        if (isSelfScriptLike(script)) {
          script.remove();
        }
      });
    }

    return getDoctypeHtml() + "\n" + clonedDocumentElement.outerHTML;
  }

  function copyAttributes(from, to) {
    Array.from(to.attributes).forEach(function (attr) {
      to.removeAttribute(attr.name);
    });

    Array.from(from.attributes).forEach(function (attr) {
      try {
        to.setAttribute(attr.name, attr.value);
      } catch (_) {}
    });
  }

  function copyScriptAttributes(from, to) {
    Array.from(from.attributes).forEach(function (attr) {
      try {
        to.setAttribute(attr.name, attr.value);
      } catch (_) {}
    });
  }

  function collectScripts(root) {
    const scripts = [];

    root.querySelectorAll("script").forEach(function (script) {
      if (script.getAttribute("data-image-cache-guard-lite") === "true") {
        script.remove();
        return;
      }

      scripts.push({
        parentTagName: script.parentElement ? script.parentElement.tagName.toLowerCase() : "body",
        attrs: Array.from(script.attributes).map(function (attr) {
          return {
            name: attr.name,
            value: attr.value
          };
        }),
        text: script.textContent || ""
      });

      script.remove();
    });

    return scripts;
  }

  function appendChildren(from, to) {
    while (to.firstChild) {
      to.removeChild(to.firstChild);
    }

    Array.from(from.childNodes).forEach(function (node) {
      to.appendChild(document.importNode(node, true));
    });
  }

  function runScriptRecord(record) {
    return new Promise(function (resolve) {
      const script = document.createElement("script");
      let done = false;

      function finish() {
        if (done) return;
        done = true;
        resolve();
      }

      record.attrs.forEach(function (attr) {
        try {
          script.setAttribute(attr.name, attr.value);
        } catch (_) {}
      });

      script.onload = finish;
      script.onerror = finish;

      const hasSrc = script.getAttribute("src");

      if (hasSrc) {
        const parent = record.parentTagName === "head" ? document.head : document.body;
        parent.appendChild(script);
        return;
      }

      script.textContent = record.text || "";
      const parent = record.parentTagName === "head" ? document.head : document.body;
      parent.appendChild(script);
      finish();
    });
  }

  async function runScriptsSequentially(records) {
    for (const record of records) {
      await runScriptRecord(record);
    }
  }

  async function replacePageWithoutDocumentWrite(html) {
    const parsed = new DOMParser().parseFromString(String(html || ""), "text/html");

    if (!parsed || !parsed.documentElement) {
      throw new Error("保存済みHTMLの解析に失敗しました。");
    }

    const scripts = collectScripts(parsed);

    copyAttributes(parsed.documentElement, document.documentElement);

    if (parsed.head) {
      appendChildren(parsed.head, document.head);
    }

    if (parsed.body) {
      copyAttributes(parsed.body, document.body);
      appendChildren(parsed.body, document.body);
    } else {
      document.body.innerHTML = "";
    }

    installImageGuardLite();

    await runScriptsSequentially(scripts);

    installImageGuardLite();
  }

  async function saveCurrentHtmlIfNeeded() {
    const currentHtml = getCurrentHtmlForSave();

    await idbSet(CONFIG.key, {
      html: currentHtml,
      savedAt: Date.now(),
      url: location.href
    });
  }

  async function bootHtmlCacheReplace() {
    try {
      if (hasClearQuery()) {
        await idbDelete(CONFIG.key);
        removeClearQueryFromUrl();
        sessionStorage.removeItem(CONFIG.reloadFlag);
        return;
      }

      const saved = await idbGet(CONFIG.key);

      if (saved && typeof saved.html === "string" && saved.html.trim()) {
        await replacePageWithoutDocumentWrite(saved.html);
        return;
      }

      await saveCurrentHtmlIfNeeded();

      if (
        CONFIG.reloadAfterFirstSave &&
        sessionStorage.getItem(CONFIG.reloadFlag) !== "1"
      ) {
        sessionStorage.setItem(CONFIG.reloadFlag, "1");
        location.reload();
      }
    } catch (error) {
      console.warn("HTML cache replace failed:", error);
    }
  }

  installImageGuardLite();
  bootHtmlCacheReplace();
})();
