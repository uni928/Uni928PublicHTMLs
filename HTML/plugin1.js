(function () {
  "use strict";

  const CONFIG = {
    enabled: true,
    dbName: "html-cache-replace-lite",
    dbVersion: 1,
    storeName: "pages",
    key: location.origin + location.pathname,
    reloadFlag: "html-cache-replace-lite-reloaded"
  };

  if (!CONFIG.enabled) return;

  function openDb() {
    return new Promise(function (resolve, reject) {
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

  function getCurrentHtml() {
    const doctype = document.doctype
      ? "<!DOCTYPE " + document.doctype.name + ">"
      : "<!DOCTYPE html>";

    return doctype + "\n" + document.documentElement.outerHTML;
  }

  function replacePage(html) {
    document.open();
    document.write(html);
    document.close();
  }

  async function boot() {
    try {
      const saved = await idbGet(CONFIG.key);

      if (saved && saved.html) {
        replacePage(saved.html);
        return;
      }

      const currentHtml = getCurrentHtml();

      await idbSet(CONFIG.key, {
        html: currentHtml,
        savedAt: Date.now()
      });

      if (sessionStorage.getItem(CONFIG.reloadFlag) !== "1") {
        sessionStorage.setItem(CONFIG.reloadFlag, "1");
        location.reload();
      }
    } catch (error) {
      console.warn("HTML cache replace failed:", error);
    }
  }

  boot();
})();
