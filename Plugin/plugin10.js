/*
 * plugin10.js
 * VERSION: 10.5.1-low-memory-mobile-bypass
 * 画像保持＋円形マスクによるページ間遷移プラグイン
 * html2canvas はオンラインCDNから読み込みます。
 *
 * ページ側には次の1行だけを記述します。
 * <script src="https://uni928.github.io/Uni928PublicHTMLs/Plugin/plugin10.js"></script>
 * html2canvasをプラグインより先に読み込む場合は次の1行を追加できます。
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
 */
(() => {
  'use strict';

  if (window.__pageTransitionPlugin10) {
    return;
  }
  window.__pageTransitionPlugin10 = true;

  const transitionHashPrefix = '#page-transition-v10=';
  const hasIncomingFrame = window.location.hash.startsWith(transitionHashPrefix);
  const prefersReducedMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 低メモリのスマホでは、重い画面キャプチャと遷移アニメーションを行いません。
  // navigator.deviceMemory は対応ブラウザで概算RAM容量(GB)を返します。
  const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  const deviceMemoryGb = Number(navigator.deviceMemory);
  const isLowMemoryMobile = isMobileDevice
    && Number.isFinite(deviceMemoryGb)
    && deviceMemoryGb <= 4;

  // 前画面データがある場合は、DOMの描画より先に次画面を隠します。
  // このスクリプトは<head>内で読み込むと、初回表示のちらつきを最小化できます。
  if (hasIncomingFrame && !prefersReducedMotion && !isLowMemoryMobile && document.documentElement) {
    document.documentElement.classList.add('page-transition-pending');
  }

  const CONFIG = Object.freeze({
    captureLibraryUrl: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    frameHashKey: 'page-transition-v10',
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
      /* 保持画像を全面に被せるまで、遷移先の描画を隠します。 */
      .page-transition-pending body {
        visibility: hidden;
      }

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
        visibility: visible;
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
      const existingScript = Array.from(document.scripts).find((script) => {
        try {
          return new URL(script.src, document.baseURI).href === CONFIG.captureLibraryUrl;
        } catch (error) {
          return false;
        }
      });
      const script = existingScript || document.createElement('script');

      const resolveLibrary = () => {
        if (typeof window.html2canvas === 'function') {
          resolve(window.html2canvas);
        } else {
          reject(new Error('html2canvas was not initialized'));
        }
      };

      script.addEventListener('load', resolveLibrary, { once: true });
      script.addEventListener('error', () => reject(new Error('html2canvas could not be loaded')), { once: true });

      if (!existingScript) {
        script.src = CONFIG.captureLibraryUrl;
        script.async = true;
        script.dataset.pageTransitionDependency = 'html2canvas';
        (document.head || document.documentElement).appendChild(script);
      } else if (typeof window.html2canvas === 'function') {
        resolveLibrary();
      }
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
    // html2canvasのスクロール再現には依存せず、全体画像から現在位置を切り出します。
    const scrollX = Math.max(0, Number(window.scrollX ?? window.pageXOffset ?? document.documentElement.scrollLeft ?? 0));
    const scrollY = Math.max(0, Number(window.scrollY ?? window.pageYOffset ?? document.documentElement.scrollTop ?? 0));
    const documentWidth = Math.max(width, document.documentElement.scrollWidth);
    const documentHeight = Math.max(height, document.documentElement.scrollHeight);
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, CONFIG.maxDevicePixelRatio);

    try {
      const html2canvas = await withTimeout(loadCaptureLibrary(), CONFIG.captureTimeout);
      const fullCanvas = await withTimeout(html2canvas(document.documentElement, {
        backgroundColor: null,
        allowTaint: false,
        useCORS: true,
        imageTimeout: 1500,
        logging: false,
        scale: devicePixelRatio,
        x: 0,
        y: 0,
        width: documentWidth,
        height: documentHeight,
        windowWidth: documentWidth,
        windowHeight: documentHeight,
        scrollX: 0,
        scrollY: 0
      }), CONFIG.captureTimeout);

      const viewportCanvas = document.createElement('canvas');
      viewportCanvas.width = Math.ceil(width * devicePixelRatio);
      viewportCanvas.height = Math.ceil(height * devicePixelRatio);
      const viewportContext = viewportCanvas.getContext('2d');
      if (!viewportContext) {
        throw new Error('viewport canvas context unavailable');
      }
      viewportContext.drawImage(
        fullCanvas,
        Math.round(scrollX * devicePixelRatio),
        Math.round(scrollY * devicePixelRatio),
        viewportCanvas.width,
        viewportCanvas.height,
        0,
        0,
        viewportCanvas.width,
        viewportCanvas.height
      );
      const image = viewportCanvas.toDataURL('image/jpeg', CONFIG.imageQuality);
      return {
        image,
        width,
        height,
        scrollX,
        scrollY,
        captureMode: 'full-document-crop'
      };
    } catch (error) {
      return { image: fallbackSnapshot(), width, height, scrollX, scrollY, fallback: true };
    }
  }

  function encodeBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  }

  function decodeBase64(value) {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function createTransitionUrl(targetUrl, frame) {
    const destination = new URL(targetUrl, window.location.href);
    const payload = encodeBase64(JSON.stringify(frame));
    destination.hash = `${CONFIG.frameHashKey}=${payload}`;
    return destination.href;
  }

  function readFrameFromLocation() {
    const hash = window.location.hash;
    const prefix = `#${CONFIG.frameHashKey}=`;
    if (!hash.startsWith(prefix)) {
      return null;
    }

    try {
      const encodedPayload = decodeURIComponent(hash.slice(prefix.length));
      const frame = JSON.parse(decodeBase64(encodedPayload));
      return frame && typeof frame === 'object' ? frame : null;
    } catch (error) {
      return null;
    }
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

    return {
      ...value,
      transitionUrl: createTransitionUrl(targetUrl, value)
    };
  }

  async function readFrame() {
    return readFrameFromLocation();
  }

  function clearFrame() {
    document.documentElement.classList.remove('page-transition-pending');

    if (!window.location.hash.startsWith(`#${CONFIG.frameHashKey}=`)) {
      return;
    }

    try {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.hash = '';
      window.history.replaceState(null, document.title, cleanUrl.href);
    } catch (error) {
      // file:// 環境で History API が制限される場合も、遷移自体は完了させます。
    }
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
    const isLocalFileNavigation = url.protocol === 'file:' && current.protocol === 'file:';
    if (!/^(https?:|file:)$/.test(url.protocol)) {
      return false;
    }
    if (!isLocalFileNavigation && url.origin !== current.origin) {
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

    let destinationUrl = link.href;
    try {
      const frame = await saveFrame(link.href, pointer);
      destinationUrl = frame.transitionUrl;
    } catch (error) {
      // キャプチャに失敗した場合は、画像なしで通常遷移します。
    }
    hideStatus(status);
    window.location.href = destinationUrl;
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
      canvas.style.visibility = 'visible';
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);
      canvas.setAttribute('aria-hidden', 'true');
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.drawImage(image, 0, 0, width, height);
      document.documentElement.appendChild(canvas);
      // 保持画像を全面に配置した後、遷移先を背面に表示します。
      document.documentElement.classList.remove('page-transition-pending');

      const startedAt = performance.now();
      const animate = (now) => {
        const progress = clamp((now - startedAt) / CONFIG.revealDuration, 0, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const radius = maximumRadius * eased;
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        context.save();
        context.globalCompositeOperation = 'destination-out';
        context.beginPath();
        context.arc(centerX, centerY, radius, 0, Math.PI * 2);
        context.fill();
        context.restore();
        if (progress < 1) {
          window.requestAnimationFrame(animate);
        } else {
          // 円が完全に広がった画像を1フレーム表示してから保持画像を破棄します。
          window.requestAnimationFrame(() => {
            canvas.remove();
            clearFrame();
          });
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
      version: '10.5.1-low-memory-mobile-bypass',
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
    exposeApi();

    // 低メモリのスマホではプラグイン処理を無効化し、通常のリンク遷移に任せます。
    // 遷移用ハッシュ付きURLで到着した場合だけ、URLを通常状態へ戻します。
    if (isLowMemoryMobile) {
      clearFrame();
      return;
    }

    installLinkHandler();
    const frame = readFrameFromLocation();
    revealFrame(frame);
    loadCaptureLibrary().catch(() => {});
  }

  // DOMContentLoadedを待たず、スクリプト実行直後に復元を開始します。
  boot();
})();
