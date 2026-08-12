export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

export function safeFileBase(value) {
  const name = String(value || 'novel')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 90);
  return name || 'novel';
}

function pageInfoNumber(page) {
  if (page?.numberSource !== 'capture-order') {
    const direct = Number(page?.number || page?.pageNumber);
    if (Number.isInteger(direct) && direct > 0) return direct;
  }
  const value = String(page?.title || '') + ' ' + String(page?.sourceUrl || '');
  const match = value.match(/(?:第\s*)?(\d{1,6})\s*(?:話|章|回|ページ|page|episode|chapter)(?:\D|$)/i) ||
    value.match(/(?:episode|chapter|page|story|read|novel)[^\d]{0,8}(\d{1,6})(?:\D|$)/i);
  return match ? Number(match[1]) : null;
}

function comparePages(a, b) {
  const aInfo = pageInfoNumber(a);
  const bInfo = pageInfoNumber(b);
  if (aInfo !== null && bInfo === null) return -1;
  if (aInfo === null && bInfo !== null) return 1;
  if (aInfo !== null && bInfo !== null && aInfo !== bInfo) return aInfo - bInfo;
  const aNumber = Number(a?.number) || Number.MAX_SAFE_INTEGER;
  const bNumber = Number(b?.number) || Number.MAX_SAFE_INTEGER;
  if (aNumber !== bNumber) return aNumber - bNumber;
  const titleOrder = String(a?.title || '').localeCompare(String(b?.title || ''), 'ja');
  if (titleOrder) return titleOrder;
  return String(a?.sourceUrl || '').localeCompare(String(b?.sourceUrl || ''));
}

function sortedPages(value) {
  return (Array.isArray(value) ? value : []).slice().sort(comparePages);
}

export function recordToJson(record) {
  return JSON.stringify({
    schemaVersion: Number(record?.schemaVersion) || 1,
    title: String(record?.title || '無題の小説'),
    sourceHost: String(record?.sourceHost || ''),
    pages: sortedPages(record?.pages),
    sourceUrls: Array.isArray(record?.sourceUrls) ? record.sourceUrls : [],
    createdAt: Number(record?.createdAt) || Date.now(),
    updatedAt: Number(record?.updatedAt) || Date.now()
  }, null, 2);
}

export function buildReaderHtml(novel) {
  const title = String(novel?.title || '無題の小説');
  const pages = sortedPages(novel?.pages)
    .map((page, index) => ({
      number: Number(page.number) || index + 1,
      title: String(page.title || ''),
      text: String(page.text || ''),
      sourceUrl: String(page.sourceUrl || '')
    }));
  const data = { title, pages };
  const payload = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(title)} | 小説棚</title>
  <style>
    @layer reset, base, components, utilities, responsive;

    /* reset: 閲覧サイトの表示差を小さくします。 */
    @layer reset {
      *, *::before, *::after { box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body, h1, h2, h3, p, pre { margin: 0; }
      button, input, select { font: inherit; }
      button { border: 0; }
    }

    /* base: 読書に集中しやすいライトテーマを定義します。 */
    @layer base {
      :root {
        color-scheme: light;
        --bg: #f3f6fb;
        --paper: #ffffff;
        --paper-soft: #f8faff;
        --ink: #1a2738;
        --muted: #718096;
        --line: #dfe7f1;
        --accent: #3d69d8;
        --accent-dark: #2b51b6;
        --accent-soft: #edf2ff;
        --highlight: #fff1b8;
        --reader-size: 19px;
        --reader-width: 760px;
        --shadow: 0 16px 42px rgba(50, 74, 108, .10), 0 2px 8px rgba(50, 74, 108, .05);
      }

      body {
        min-width: 280px;
        background:
          radial-gradient(900px 520px at 90% -10%, #e7edff 0%, transparent 66%),
          radial-gradient(720px 420px at -8% 12%, #e7f6f2 0%, transparent 65%),
          var(--bg);
        color: var(--ink);
        font: 14px/1.65 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Yu Gothic", sans-serif;
      }

      .shell { width: min(1180px, calc(100% - 28px)); margin: 0 auto; padding: 14px 0 42px; }
      .serif { font-family: "BIZ UD明朝", "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", Georgia, serif; }
    }

    /* components: ヘッダー、読書面、目次、操作部品を整えます。 */
    @layer components {
      .topbar {
        position: sticky;
        top: 10px;
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 58px;
        padding: 9px 12px;
        border: 1px solid rgba(210, 222, 239, .95);
        border-radius: 16px;
        background: rgba(255, 255, 255, .88);
        box-shadow: 0 7px 24px rgba(52, 76, 110, .10);
        backdrop-filter: blur(14px);
      }
      .brand { min-width: 0; display: flex; align-items: center; gap: 9px; }
      .brand-mark { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; background: linear-gradient(145deg, #486fe2, #75a0ed); color: #fff; font-weight: 800; }
      .brand-copy { min-width: 0; }
      .brand-copy strong { display: block; overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
      .brand-copy span { display: block; overflow: hidden; color: var(--muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
      .top-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
      .button, .field, .select { border: 1px solid var(--line); border-radius: 9px; background: var(--paper); color: var(--ink); }
      .button { min-height: 32px; padding: 5px 9px; cursor: pointer; font-size: 12px; font-weight: 750; white-space: nowrap; }
      .button:hover { border-color: #aebfda; background: #f7f9fd; }
      .button:active { transform: translateY(1px); }
      .button-primary { border-color: var(--accent); background: var(--accent); color: #fff; }
      .button-primary:hover { border-color: var(--accent-dark); background: var(--accent-dark); }
      .button-icon { width: 32px; padding-inline: 0; font-size: 16px; }
      .field { width: 68px; min-height: 32px; padding: 4px 6px; text-align: center; }
      .select { max-width: 170px; min-height: 32px; padding: 4px 7px; font-size: 11px; }
      .search-box { display: flex; align-items: center; gap: 5px; min-width: 130px; padding: 0 7px; border: 1px solid var(--line); border-radius: 9px; background: var(--paper); }
      .search-box input { width: 100%; min-width: 0; padding: 6px 0; border: 0; outline: 0; background: transparent; color: var(--ink); font-size: 12px; }
      .search-count { color: var(--muted); font-size: 10px; white-space: nowrap; }

      .page-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; width: min(var(--reader-width), 100%); margin: 26px auto 13px; }
      .page-heading h1 { font-size: clamp(20px, 3vw, 28px); line-height: 1.3; letter-spacing: -.02em; }
      .page-heading p { margin-top: 5px; color: var(--muted); font-size: 12px; }
      .page-tools { display: flex; gap: 5px; }
      .progress { height: 4px; overflow: hidden; border-radius: 999px; background: #e3eaf5; }
      .progress > span { display: block; width: 0; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #587de2, #7aa2ed); transition: width .25s ease; }

      .layout { display: grid; grid-template-columns: minmax(0, var(--reader-width)) 270px; align-items: start; justify-content: center; gap: 18px; margin-top: 16px; }
      .reader-card, .toc-card, .bottom-card { border: 1px solid var(--line); border-radius: 20px; background: rgba(255,255,255,.94); box-shadow: var(--shadow); }
      .reader-card { min-width: 0; padding: clamp(23px, 4vw, 48px) clamp(18px, 5vw, 62px) 28px; }
      .reader-text { min-height: 54vh; color: #263449; font-size: var(--reader-size); line-height: 2.05; letter-spacing: .035em; white-space: pre-wrap; overflow-wrap: anywhere; }
      .reader-text .line { border-radius: 5px; transition: background .15s ease; }
      .reader-text .tts-current { background: #e8efff; box-shadow: 0 0 0 3px #e8efff; }
      .reader-text .search-hit { background: var(--highlight); box-shadow: 0 0 0 2px var(--highlight); }
      .reader-text .search-current { background: #ffcf55; }
      .reader-footer { display: flex; justify-content: space-between; gap: 8px; margin-top: 30px; padding-top: 16px; border-top: 1px solid #edf1f6; }
      .source-link { display: block; max-width: 55%; overflow: hidden; color: var(--muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
      .source-link:hover { color: var(--accent); }

      .toc-card { position: sticky; top: 82px; max-height: calc(100vh - 98px); overflow: auto; padding: 16px; }
      .toc-card h2 { font-size: 15px; }
      .toc-card p { margin-top: 2px; color: var(--muted); font-size: 11px; }
      .toc-list { display: grid; gap: 5px; margin-top: 12px; }
      .toc-item { display: grid; grid-template-columns: 34px 1fr; gap: 6px; width: 100%; padding: 8px; border: 1px solid transparent; border-radius: 9px; background: transparent; color: var(--ink); cursor: pointer; text-align: left; }
      .toc-item:hover { background: var(--paper-soft); }
      .toc-item.is-current { border-color: #cbd9fb; background: var(--accent-soft); color: var(--accent-dark); }
      .toc-number { color: var(--muted); font-size: 10px; font-weight: 800; }
      .toc-title { overflow: hidden; font-size: 11px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }

      .bottom-card { width: min(var(--reader-width), 100%); margin: 18px auto 0; padding: 12px 15px; }
      .bottom-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .bottom-row strong { font-size: 12px; }
      .page-list { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; }
      .page-chip { min-width: 31px; min-height: 29px; padding: 4px 7px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); color: var(--muted); cursor: pointer; font-size: 11px; }
      .page-chip:hover { border-color: #aebfda; color: var(--accent); }
      .page-chip.is-current { border-color: var(--accent); background: var(--accent); color: #fff; font-weight: 800; }
      .hint { margin-top: 8px; color: var(--muted); font-size: 10px; }
      .hidden { display: none; }
      .status-line { min-height: 18px; margin-top: 8px; color: var(--muted); font-size: 11px; }
    }

    /* utilities: 表示切り替え用の補助状態です。 */
    @layer utilities {
      body.reader-wide { --reader-width: 900px; }
      body.reader-compact .reader-text { line-height: 1.82; }
    }

    /* responsive: スマートフォンでは目次を折りたたみ式にします。 */
    @layer responsive {
      @media (max-width: 900px) {
        .layout { grid-template-columns: minmax(0, var(--reader-width)); }
        .toc-card { position: static; max-height: none; }
        .toc-card.mobile-hidden { display: none; }
      }
      @media (max-width: 650px) {
        .shell { width: min(100% - 18px, 760px); padding-top: 8px; }
        .topbar { top: 4px; flex-wrap: wrap; gap: 6px; padding: 8px; }
        .brand { flex: 1 1 100%; }
        .top-actions { width: 100%; margin-left: 0; overflow-x: auto; }
        .search-box { flex: 1 1 120px; }
        .page-heading { margin-top: 20px; }
        .page-heading h1 { font-size: 21px; }
        .reader-card { padding: 23px 17px; border-radius: 16px; }
        .reader-text { min-height: 62vh; font-size: var(--reader-size); line-height: 1.95; }
        .reader-footer { align-items: flex-start; flex-direction: column; }
        .source-link { max-width: 100%; }
        .bottom-card { border-radius: 14px; }
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">読</div>
        <div class="brand-copy">
          <strong id="brandTitle"></strong>
          <span>小説棚・ライトテーマ閲覧サイト</span>
        </div>
      </div>
      <div class="top-actions">
        <button class="button" id="tocToggle" type="button">目次</button>
        <button class="button button-icon" id="prevPage" type="button" title="前のページ">←</button>
        <input class="field" id="pageInput" type="number" min="1" inputmode="numeric" aria-label="ページ番号">
        <button class="button button-icon" id="nextPage" type="button" title="次のページ">→</button>
        <button class="button button-icon" id="fontDown" type="button" title="文字を小さく">A−</button>
        <button class="button button-icon" id="fontUp" type="button" title="文字を大きく">A＋</button>
        <button class="button" id="wideToggle" type="button">幅を広げる</button>
        <button class="button" id="printPage" type="button">印刷</button>
      </div>
    </header>

    <section class="page-heading">
      <div>
        <h1 id="pageTitle"></h1>
        <p id="pageMeta"></p>
      </div>
      <div class="search-box">
        <span aria-hidden="true">⌕</span>
        <input id="searchInput" type="search" placeholder="本文を検索" autocomplete="off">
        <span class="search-count" id="searchCount"></span>
      </div>
    </section>
    <div class="progress" aria-label="読書進捗"><span id="progressBar"></span></div>

    <div class="layout">
      <main class="reader-card" id="readerCard">
        <pre class="reader-text serif" id="readerText"></pre>
        <div class="status-line" id="statusLine" role="status" aria-live="polite"></div>
        <div class="reader-footer">
          <a class="source-link" id="sourceLink" target="_blank" rel="noopener noreferrer"></a>
          <div class="page-tools">
            <button class="button" id="prevPageBottom" type="button">← 前へ</button>
            <button class="button button-primary" id="ttsStart" type="button">▶ 読み上げ</button>
            <button class="button" id="ttsPause" type="button" disabled>⏸ 一時停止</button>
            <button class="button" id="ttsStop" type="button" disabled>■ 停止</button>
            <button class="button" id="nextPageBottom" type="button">次へ →</button>
          </div>
        </div>
      </main>

      <aside class="toc-card" id="tocCard">
        <h2>目次</h2>
        <p id="tocSummary"></p>
        <select class="select" id="voiceSelect" aria-label="読み上げ音声" style="margin-top:10px;width:100%;max-width:none">
          <option value="">ブラウザ既定の音声</option>
        </select>
        <label class="hint" for="rateInput">読み上げ速度 <input class="field" id="rateInput" type="number" min="0.5" max="2" step="0.1" value="1.0"></label>
        <nav class="toc-list" id="tocList" aria-label="目次一覧"></nav>
      </aside>
    </div>

    <section class="bottom-card">
      <div class="bottom-row">
        <strong>ページ一覧</strong>
        <span class="hint" id="keyboardHint">← → で移動 / T で目次 / Spaceで読み上げ停止</span>
      </div>
      <nav class="page-list" id="pageList" aria-label="ページ一覧"></nav>
    </section>
  </div>

  <script>
    const DATA = ${payload};
    const pages = Array.isArray(DATA.pages) ? DATA.pages : [];
    let currentIndex = 0;
    let lineNodes = [];
    let ttsRunning = false;
    let ttsPaused = false;
    let ttsLine = 0;
    let currentUtterance = null;
    let selectedVoiceName = '';
    let voices = [];
    const storagePrefix = 'novel-shelf-reader:' + encodeURIComponent(DATA.title);

    const $ = (id) => document.getElementById(id);
    const brandTitle = $('brandTitle');
    const pageTitle = $('pageTitle');
    const pageMeta = $('pageMeta');
    const pageInput = $('pageInput');
    const readerText = $('readerText');
    const sourceLink = $('sourceLink');
    const pageList = $('pageList');
    const tocList = $('tocList');
    const tocCard = $('tocCard');
    const searchInput = $('searchInput');
    const searchCount = $('searchCount');
    const statusLine = $('statusLine');
    const rateInput = $('rateInput');

    function storageGet(key, fallback) {
      try {
        const value = localStorage.getItem(storagePrefix + ':' + key);
        return value === null ? fallback : value;
      } catch (_) { return fallback; }
    }

    function storageSet(key, value) {
      try { localStorage.setItem(storagePrefix + ':' + key, String(value)); } catch (_) {}
    }

    function pageText(page) {
      return String(page?.text || '');
    }

    function renderText() {
      readerText.replaceChildren();
      const lines = pageText(pages[currentIndex]).split('\\n');
      lineNodes = [];
      lines.forEach((line, index) => {
        const node = document.createElement('span');
        node.className = 'line';
        node.textContent = line || ' ';
        lineNodes.push(node);
        readerText.appendChild(node);
        if (index < lines.length - 1) readerText.appendChild(document.createTextNode('\\n'));
      });
      applySearch();
    }

    function renderToc() {
      tocList.replaceChildren();
      pageList.replaceChildren();
      pages.forEach((page, index) => {
        const label = String(page.title || 'タイトル未設定');
        const tocButton = document.createElement('button');
        tocButton.type = 'button';
        tocButton.className = 'toc-item' + (index === currentIndex ? ' is-current' : '');
        const number = document.createElement('span');
        number.className = 'toc-number';
        number.textContent = String(page.number || index + 1);
        const title = document.createElement('span');
        title.className = 'toc-title';
        title.textContent = label;
        tocButton.append(number, title);
        tocButton.addEventListener('click', () => setPage(index));
        tocList.appendChild(tocButton);

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'page-chip' + (index === currentIndex ? ' is-current' : '');
        chip.textContent = String(page.number || index + 1);
        chip.title = label;
        chip.addEventListener('click', () => setPage(index));
        pageList.appendChild(chip);
      });
      $('tocSummary').textContent = pages.length + ' ページ';
    }

    function setPage(index, options) {
      if (!pages.length) return;
      const nextIndex = Math.max(0, Math.min(pages.length - 1, Number(index) || 0));
      const keepTts = Boolean(options && options.keepTts);
      if (ttsRunning && !keepTts) stopSpeech(false);
      currentIndex = nextIndex;
      const page = pages[currentIndex];
      const label = String(page.title || '本文');
      pageTitle.textContent = label;
      brandTitle.textContent = DATA.title;
      pageMeta.textContent = 'ページ ' + String(page.number || currentIndex + 1) + ' ／ 全' + pages.length + 'ページ';
      pageInput.value = String(page.number || currentIndex + 1);
      sourceLink.textContent = page.sourceUrl || '';
      sourceLink.href = page.sourceUrl || '#';
      sourceLink.hidden = !page.sourceUrl;
      $('progressBar').style.width = (((currentIndex + 1) / pages.length) * 100).toFixed(2) + '%';
      renderText();
      renderToc();
      storageSet('page', currentIndex);
      document.title = DATA.title + ' | ' + label;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (keepTts) {
        ttsLine = 0;
        speakNextLine();
      }
    }

    function goRelative(delta) {
      setPage(currentIndex + delta);
    }

    function applySearch() {
      const query = searchInput.value.trim().toLocaleLowerCase('ja-JP');
      let hits = [];
      lineNodes.forEach((node, index) => {
        node.classList.remove('search-hit', 'search-current');
        if (query && node.textContent.toLocaleLowerCase('ja-JP').includes(query)) {
          node.classList.add('search-hit');
          hits.push(index);
        }
      });
      searchCount.textContent = query ? String(hits.length) + '行' : '';
      if (query && hits.length) {
        const currentHit = hits.find((index) => index >= ttsLine) ?? hits[0];
        lineNodes[currentHit].classList.add('search-current');
      }
    }

    function highlightTtsLine(index) {
      lineNodes.forEach((node) => node.classList.remove('tts-current'));
      const node = lineNodes[index];
      if (!node) return;
      node.classList.add('tts-current');
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    function selectedVoice() {
      return voices.find((voice) => voice.name === selectedVoiceName) ||
        voices.find((voice) => String(voice.lang || '').toLowerCase().startsWith('ja')) || null;
    }

    function populateVoices() {
      if (!('speechSynthesis' in window)) return;
      voices = window.speechSynthesis.getVoices() || [];
      const keep = selectedVoiceName;
      $('voiceSelect').replaceChildren();
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'ブラウザ既定の音声';
      $('voiceSelect').appendChild(defaultOption);
      voices.sort((a, b) => {
        const aja = String(a.lang || '').toLowerCase().startsWith('ja') ? 0 : 1;
        const bja = String(b.lang || '').toLowerCase().startsWith('ja') ? 0 : 1;
        return aja - bja || a.name.localeCompare(b.name);
      }).forEach((voice) => {
        const option = document.createElement('option');
        option.value = voice.name;
        option.textContent = voice.name + (voice.lang ? ' / ' + voice.lang : '');
        $('voiceSelect').appendChild(option);
      });
      $('voiceSelect').value = keep;
      selectedVoiceName = $('voiceSelect').value;
    }

    function updateTtsButtons() {
      $('ttsStart').textContent = ttsRunning ? '▶ 読み上げ中' : '▶ 読み上げ';
      $('ttsPause').disabled = !ttsRunning;
      $('ttsStop').disabled = !ttsRunning;
      $('ttsPause').textContent = ttsPaused ? '▶ 再開' : '⏸ 一時停止';
    }

    function stopSpeech(resetOffset) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      if (!resetOffset) storageSet('tts:' + currentIndex, ttsLine);
      else storageSet('tts:' + currentIndex, 0);
      ttsRunning = false;
      ttsPaused = false;
      currentUtterance = null;
      lineNodes.forEach((node) => node.classList.remove('tts-current'));
      updateTtsButtons();
    }

    function speakNextLine() {
      if (!ttsRunning || !('speechSynthesis' in window)) return;
      if (ttsLine >= lineNodes.length) {
        if (currentIndex < pages.length - 1) {
          setPage(currentIndex + 1, { keepTts: true });
        } else {
          stopSpeech(true);
          statusLine.textContent = '最後のページまで読み上げました。';
        }
        return;
      }
      const line = lineNodes[ttsLine]?.textContent?.trim() || '';
      highlightTtsLine(ttsLine);
      if (!line) {
        ttsLine += 1;
        storageSet('tts:' + currentIndex, ttsLine);
        window.setTimeout(speakNextLine, 20);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(line);
      utterance.lang = 'ja-JP';
      utterance.rate = Math.min(2, Math.max(.5, Number(rateInput.value) || 1));
      const voice = selectedVoice();
      if (voice) utterance.voice = voice;
      utterance.onend = () => {
        if (!ttsRunning) return;
        ttsLine += 1;
        storageSet('tts:' + currentIndex, ttsLine);
        speakNextLine();
      };
      utterance.onerror = () => {
        if (ttsRunning) statusLine.textContent = '読み上げを続行できませんでした。';
        stopSpeech(false);
      };
      currentUtterance = utterance;
      window.speechSynthesis.speak(utterance);
    }

    function startSpeech() {
      if (!('speechSynthesis' in window)) {
        statusLine.textContent = 'このブラウザでは読み上げを利用できません。';
        return;
      }
      window.speechSynthesis.cancel();
      ttsLine = Math.max(0, Math.min(lineNodes.length - 1, Number(storageGet('tts:' + currentIndex, 0)) || 0));
      ttsRunning = true;
      ttsPaused = false;
      updateTtsButtons();
      speakNextLine();
    }

    function pauseSpeech() {
      if (!ttsRunning || !('speechSynthesis' in window)) return;
      if (ttsPaused) {
        window.speechSynthesis.resume();
        ttsPaused = false;
      } else {
        window.speechSynthesis.pause();
        ttsPaused = true;
        storageSet('tts:' + currentIndex, ttsLine);
      }
      updateTtsButtons();
    }

    $('prevPage').addEventListener('click', () => goRelative(-1));
    $('nextPage').addEventListener('click', () => goRelative(1));
    $('prevPageBottom').addEventListener('click', () => goRelative(-1));
    $('nextPageBottom').addEventListener('click', () => goRelative(1));
    $('pageInput').addEventListener('change', () => {
      const value = Number(pageInput.value);
      const exact = pages.findIndex((page) => Number(page.number) === value);
      setPage(exact >= 0 ? exact : value - 1);
    });
    $('fontDown').addEventListener('click', () => {
      const current = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reader-size')) || 19;
      document.documentElement.style.setProperty('--reader-size', Math.max(15, current - 1) + 'px');
      storageSet('fontSize', Math.max(15, current - 1));
    });
    $('fontUp').addEventListener('click', () => {
      const current = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reader-size')) || 19;
      document.documentElement.style.setProperty('--reader-size', Math.min(27, current + 1) + 'px');
      storageSet('fontSize', Math.min(27, current + 1));
    });
    $('wideToggle').addEventListener('click', () => {
      document.body.classList.toggle('reader-wide');
      $('wideToggle').textContent = document.body.classList.contains('reader-wide') ? '幅を戻す' : '幅を広げる';
      storageSet('wide', document.body.classList.contains('reader-wide') ? '1' : '0');
    });
    $('tocToggle').addEventListener('click', () => tocCard.classList.toggle('mobile-hidden'));
    $('printPage').addEventListener('click', () => window.print());
    searchInput.addEventListener('input', applySearch);
    $('ttsStart').addEventListener('click', () => {
      if (ttsRunning) stopSpeech(false);
      else startSpeech();
    });
    $('ttsPause').addEventListener('click', pauseSpeech);
    $('ttsStop').addEventListener('click', () => stopSpeech(true));
    $('voiceSelect').addEventListener('change', () => {
      selectedVoiceName = $('voiceSelect').value;
      storageSet('voice', selectedVoiceName);
      if (ttsRunning) { stopSpeech(false); startSpeech(); }
    });
    rateInput.addEventListener('change', () => {
      const rate = Math.min(2, Math.max(.5, Number(rateInput.value) || 1));
      rateInput.value = String(rate);
      storageSet('rate', rate);
      if (ttsRunning) { stopSpeech(false); startSpeech(); }
    });

    window.addEventListener('keydown', (event) => {
      if (event.target && /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'h') goRelative(-1);
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'l') goRelative(1);
      if (event.key.toLowerCase() === 't') tocCard.classList.toggle('mobile-hidden');
      if (event.key === ' ' && ttsRunning) { event.preventDefault(); pauseSpeech(); }
    });

    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = populateVoices;
      populateVoices();
    } else {
      $('voiceSelect').disabled = true;
      rateInput.disabled = true;
    }

    const savedFontSize = Number(storageGet('fontSize', 19));
    if (savedFontSize) document.documentElement.style.setProperty('--reader-size', Math.min(27, Math.max(15, savedFontSize)) + 'px');
    if (storageGet('wide', '0') === '1') {
      document.body.classList.add('reader-wide');
      $('wideToggle').textContent = '幅を戻す';
    }
    rateInput.value = storageGet('rate', '1.0');
    selectedVoiceName = storageGet('voice', '');
    if (window.matchMedia('(max-width: 900px)').matches) tocCard.classList.add('mobile-hidden');
    brandTitle.textContent = DATA.title;
    if (pages.length) setPage(Number(storageGet('page', 0)) || 0);
    else {
      pageTitle.textContent = '本文がありません';
      pageMeta.textContent = '保存されたページがありません。';
    }
    updateTtsButtons();
  </script>
</body>
</html>`;
}
