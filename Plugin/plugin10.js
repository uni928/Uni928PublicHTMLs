/*
 * plugin10.js
 * 画像保持＋円形マスクによるページ間遷移プラグイン
 *
 * ページ側には次の1行だけを記述します。
 * <script src="https://uni928.github.io/Uni928PublicHTMLs/Plugin/plugin10.js"></script>
 */
(() => {
  'use strict';

  if (window.__pageTransitionPlugin10) {
    return;
  }
  window.__pageTransitionPlugin10 = true;

  const CONFIG = Object.freeze({
    key: 'uni928-page-transition-v10',
    database: 'uni928-page-transition-v10-db',
    store: 'frames',
    captureLibraryUrl: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
    captureTimeout: 3500,
    revealDuration: 2200,
    maxDevicePixelRatio: 1.5,
    imageQuality: 0.78,
    zIndex: 2147483000
  });

  const state = {
    navigating: false,
    captureLibraryPromise: null
  };

  /* base: プラグインの最小限の表示設定を追加します。 */
  const style = document.createElement('style');
  style.textContent = String.raw`
    @layer page-transition-plugin {
      .page-transition-capturing {
        cursor: progress;
      }

      .page-transition-canvas {
        position: fixed;
        inset: 0;
        z-index: ${CONFIG.zIndex};
        display: block;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
      }

      .page-transition-status {
        position: fixed;
        right: 14px;
        bottom: 12px;
        z-index: ${CONFIG.zIndex + 1};
        color: rgba(255, 255, 255, .62);
        font: 11px/1.4 system-ui, sans-serif;
        letter-spacing: .08em;
        pointer-events: none;
        opacity: 0;
        transition: opacity 160ms ease;
      }

      .page-transition-status.is-visible {
        opacity: 1;
      }

      @media (prefers-reduced-motion: reduce) {
        .page-transition-canvas,
        .page-transition-status {
          display: none;
        }
      }
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeUrl(url) {
    const normalized = new URL(url, window.location.href);
    normalized.hash = '';
    return normalized.href;
  }

  function isReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function showStatus(text) {
    let status = document.querySelector('.page-transition-status');
    if (!status) {
      status = document.createElement('span');
      status.className = 'page-transition-status';
      status.setAttribute('aria-hidden', 'true');
      document.body.appendChild(status);
    }
    status.textContent = text;
    status.classList.add('is-visible');
    return status;
  }

  function hideStatus(status) {
    if (!status) {
      return;
    }
    status.classList.remove('is-visible');
    window.setTimeout(() => status.remove(), 240);
  }

  function loadCaptureLibrary() {
    if (typeof window.html2canvas === 'function') {
      return Promise.resolve(window.html2canvas);
    }
    if (state.captureLibraryPromise) {
      return state.captureLibraryPromise;
    }

    state.captureLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CONFIG.captureLibraryUrl;
      script.async = true;
      script.onload = () => {
        if (typeof window.html2canvas === 'function') {
          resolve(window.html2canvas);
        } else {
          reject(new Error('html2canvas was not initialized'));
        }
      };
      script.onerror = () => reject(new Error('html2canvas could not be loaded'));
      (document.head || document.documentElement).appendChild(script);
    });

    return state.captureLibraryPromise;
  }

  function withTimeout(promise, timeout) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error('capture timeout')), timeout);
      })
    ]);
  }

  function fallbackSnapshot() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const background = getComputedStyle(document.body).backgroundColor || '#101820';
    const title = String(document.title || 'Previous page')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${background}"/><text x="24" y="48" fill="#ffffff" font-family="system-ui,sans-serif" font-size="18">${title}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  async function captureViewport() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, CONFIG.maxDevicePixelRatio);

    try {
      const html2canvas = await withTimeout(loadCaptureLibrary(), CONFIG.captureTimeout);
      const canvas = await withTimeout(html2canvas(document.documentElement, {
        backgroundColor: null,
        allowTaint: false,
        useCORS: true,
        imageTimeout: 1500,
        logging: false,
        scale: devicePixelRatio,
        x: scrollX,
        y: scrollY,
        width,
        height,
        windowWidth: Math.max(width, document.documentElement.scrollWidth),
        windowHeight: Math.max(height, document.documentElement.scrollHeight),
        scrollX,
        scrollY
      }), CONFIG.captureTimeout);

      let image = canvas.toDataURL('image/jpeg', CONFIG.imageQuality);
      if (image.length > 4000000) {
        image = canvas.toDataURL('image/jpeg', 0.62);
      }
      return { image, width, height, scrollX, scrollY };
    } catch (error) {
      return { image: fallbackSnapshot(), width, height, scrollX, scrollY, fallback: true };
    }
  }

  function openDatabase(mode, action) {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB is unavailable'));
        return;
      }
      const request = window.indexedDB.open(CONFIG.database, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(CONFIG.store)) {
          request.result.createObjectStore(CONFIG.store);
        }
      };
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(CONFIG.store, mode);
        const store = transaction.objectStore(CONFIG.store);
        transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
        action(store, resolve, reject);
      };
    });
  }

  function writeIndexedDb(value) {
    return openDatabase('readwrite', (store, resolve, reject) => {
      const request = store.put(value, CONFIG.key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('IndexedDB write failed'));
    });
  }

  function readIndexedDb() {
    return openDatabase('readonly', (store, resolve, reject) => {
      const request = store.get(CONFIG.key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
    });
  }

  function deleteIndexedDb() {
    return openDatabase('readwrite', (store, resolve, reject) => {
      const request = store.delete(CONFIG.key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('IndexedDB delete failed'));
    });
  }

  async function saveFrame(targetUrl, pointer) {
    const snapshot = await captureViewport();
    const value = {
      ...snapshot,
      targetUrl: normalizeUrl(targetUrl),
      pointerX: clamp(pointer.x / Math.max(1, window.innerWidth), 0, 1),
      pointerY: clamp(pointer.y / Math.max(1, window.innerHeight), 0, 1),
      createdAt: Date.now()
    };

    try {
      sessionStorage.setItem(CONFIG.key, JSON.stringify(value));
      return value;
    } catch (error) {
      await writeIndexedDb(value);
      return value;
    }
  }

  async function readFrame() {
    try {
      const raw = sessionStorage.getItem(CONFIG.key);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (error) {}
    try {
      return await readIndexedDb();
    } catch (error) {
      return null;
    }
  }

  function clearFrame() {
    try {
      sessionStorage.removeItem(CONFIG.key);
    } catch (error) {}
    deleteIndexedDb().catch(() => {});
  }

  function shouldHandleLink(link, event) {
    if (!link || !link.href || link.hasAttribute('download') || link.target === '_blank' || link.target === '_parent' || link.target === '_top') {
      return false;
    }
    if (link.hasAttribute('data-transition-ignore') || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return false;
    }
    const url = new URL(link.href, document.baseURI);
    const current = new URL(window.location.href);
    if (!/^https?:$/.test(url.protocol) || url.origin !== current.origin) {
      return false;
    }
    url.hash = '';
    current.hash = '';
    return url.href !== current.href;
  }

  async function navigate(link, event) {
    if (state.navigating) {
      return;
    }
    state.navigating = true;
    document.documentElement.classList.add('page-transition-capturing');
    const status = showStatus('保存中');
    const hasMousePoint = event.detail > 0 || Boolean(event.pointerType);
    const linkRect = link.getBoundingClientRect();
    const pointer = {
      x: hasMousePoint && Number.isFinite(event.clientX) ? event.clientX : linkRect.left + linkRect.width / 2,
      y: hasMousePoint && Number.isFinite(event.clientY) ? event.clientY : linkRect.top + linkRect.height / 2
    };

    try {
      await saveFrame(link.href, pointer);
    } catch (error) {
      clearFrame();
    }
    hideStatus(status);
    window.location.href = link.href;
  }

  function revealFrame(frame) {
    if (!frame || !frame.image || normalizeUrl(window.location.href) !== frame.targetUrl || isReducedMotion()) {
      clearFrame();
      return;
    }

    const image = new Image();
    image.onload = () => {
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const ratioX = clamp(Number(frame.pointerX) || 0.5, 0, 1);
      const ratioY = clamp(Number(frame.pointerY) || 0.5, 0, 1);
      const centerX = ratioX * width;
      const centerY = ratioY * height;
      const maximumRadius = Math.hypot(Math.max(centerX, width - centerX), Math.max(centerY, height - centerY)) + 12;
      const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDevicePixelRatio);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) {
        clearFrame();
        return;
      }
      canvas.className = 'page-transition-canvas';
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);
      canvas.setAttribute('aria-hidden', 'true');
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.drawImage(image, 0, 0, width, height);
      document.body.appendChild(canvas);

      const startedAt = performance.now();
      const animate = (now) => {
        const progress = clamp((now - startedAt) / CONFIG.revealDuration, 0, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const radius = maximumRadius * eased;
        context.save();
        context.globalCompositeOperation = 'destination-out';
        context.beginPath();
        context.arc(centerX, centerY, radius, 0, Math.PI * 2);
        context.fill();
        context.restore();
        if (progress < 1) {
          window.requestAnimationFrame(animate);
        } else {
          canvas.remove();
          clearFrame();
        }
      };
      window.requestAnimationFrame(animate);
      window.setTimeout(() => {
        canvas.remove();
        clearFrame();
      }, CONFIG.revealDuration + 1200);
    };
    image.onerror = () => clearFrame();
    image.src = frame.image;
  }

  function installLinkHandler() {
    document.addEventListener('click', (event) => {
      const link = event.target.closest && event.target.closest('a[href]');
      if (!shouldHandleLink(link, event)) {
        return;
      }
      event.preventDefault();
      navigate(link, event);
    }, true);
  }

  function exposeApi() {
    window.PageTransition10 = Object.freeze({
      go(url, options = {}) {
        const link = document.createElement('a');
        link.href = url;
        return navigate(link, {
          clientX: Number.isFinite(options.x) ? options.x : window.innerWidth / 2,
          clientY: Number.isFinite(options.y) ? options.y : window.innerHeight / 2,
          button: 0,
          defaultPrevented: false,
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false
        });
      },
      clear() {
        clearFrame();
      }
    });
  }

  function boot() {
    installLinkHandler();
    exposeApi();
    loadCaptureLibrary().catch(() => {});
    readFrame().then(revealFrame).catch(() => clearFrame());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
