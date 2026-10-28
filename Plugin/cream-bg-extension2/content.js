(() => {
  if (location.protocol === 'file:') return;

  // 二重実行時は以前の監視と未処理の作業を停止する。
  const key = '__twoToneCleanup__';
  if (typeof window[key] === 'function') window[key]();

  const CREAM = 'rgb(255, 243, 214)';
  const BLACK = 'rgb(18, 18, 18)';
  const THRESHOLD = 160;
  const ALPHA_MIN = 0.12;
  const TIME_BUDGET_MS = 8;
  const props = ['color', 'background-color', 'border-top-color', 'border-right-color',
    'border-bottom-color', 'border-left-color', 'outline-color', 'text-decoration-color',
    'caret-color', 'column-rule-color'];
  const skipped = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'META', 'LINK']);
  const pending = new Set();
  let frame = 0;
  let observer;
  let stopped = false;

  function twoTone(value) {
    const m = value && value.match(/^rgba?\(\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*(?:,|\/)\s*([\d.]+%?))?\s*\)$/i);
    if (!m) return null;
    const alpha = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : Number(m[4]);
    if (alpha < ALPHA_MIN) return null;
    return 0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]) >= THRESHOLD ? CREAM : BLACK;
  }

  function process(el) {
    if (!el.isConnected || !el.style || skipped.has(el.tagName)) return;
    const cs = getComputedStyle(el);
    const changes = [];
    const rect = el.getBoundingClientRect();
    const tiny = rect.width < 8 || rect.height < 8;
    for (const prop of props) {
      if (tiny && prop === 'background-color') continue;
      const value = twoTone(cs.getPropertyValue(prop));
      if (value) changes.push([prop, value]);
    }
    if (el.namespaceURI === 'http://www.w3.org/2000/svg') {
      for (const prop of ['fill', 'stroke']) {
        const value = twoTone(cs.getPropertyValue(prop));
        if (value) changes.push([prop, value]);
      }
    }
    for (const prop of ['box-shadow', 'text-shadow']) {
      const original = cs.getPropertyValue(prop);
      if (!original || original === 'none') continue;
      const value = original.replace(/rgba?\([^)]+\)/gi, color => twoTone(color) || color);
      if (value !== original) changes.push([prop, value]);
    }
    if (el === document.documentElement || el === document.body) changes.push(['background-color', CREAM]);
    for (const [prop, value] of changes) {
      if (el.style.getPropertyValue(prop) !== value || el.style.getPropertyPriority(prop) !== 'important') {
        el.style.setProperty(prop, value, 'important');
      }
    }
  }

  // 親ノードをキューに入れ、子孫は TreeWalker でフレームをまたいで処理する。
  const walks = [];
  function enqueue(root) {
    if (!(root instanceof Element) || skipped.has(root.tagName) || pending.has(root)) return;
    pending.add(root);
    walks.push({ root, walker: document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT), current: root });
    if (!frame) frame = requestAnimationFrame(run);
  }
  function run() {
    frame = 0;
    const end = performance.now() + TIME_BUDGET_MS;
    while (walks.length && performance.now() < end) {
      const job = walks[0];
      if (job.current) process(job.current);
      job.current = job.walker.nextNode();
      if (!job.current) {
        pending.delete(job.root);
        walks.shift();
      }
    }
    if (walks.length && !stopped) frame = requestAnimationFrame(run);
  }
  function start() {
    if (stopped || !document.documentElement) return;
    enqueue(document.documentElement);
    observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'childList') {
          for (const node of record.addedNodes) if (node.nodeType === 1) enqueue(node);
        } else if (record.type === 'attributes') {
          // class の変更は子孫の継承色にも影響する。
          enqueue(record.target);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }
  window[key] = () => {
    stopped = true;
    if (frame) cancelAnimationFrame(frame);
    if (observer) observer.disconnect();
    document.removeEventListener('DOMContentLoaded', start);
    walks.length = 0;
    pending.clear();
    delete window[key];
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

