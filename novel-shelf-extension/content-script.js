(() => {
  'use strict';

  const KNOWN_SITES = [
    {
      test: /(?:^|\.)syosetu\.com$/i,
      body: ['#novel_honbun', '#novel_color', '.js-novel-text'],
      work: ['#novel_title', '.novel_title', '[data-novel-title]'],
      page: ['.chapter_title', '.novel_subtitle', '.p-novel__title'],
      known: true
    },
    {
      test: /(?:^|\.)syosetu\.org$/i,
      body: ['#honbun', '#novel_honbun', '.novel_view', '.novel_view_body', '#main'],
      work: ['h1', '.title', '[class*="title"]'],
      page: ['h1', 'h2', '.novel_subtitle'],
      known: true
    },
    {
      test: /kakuyomu\.jp$/i,
      body: ['.widget-episodeBody', '[data-episode-body]', '.episode-body'],
      work: ['a[href*="/works/"]', '[data-work-title]', '.widget-workTitle'],
      page: ['.widget-episodeTitle', '[data-episode-title]', 'h1'],
      known: true
    },
    {
      test: /(?:^|\.)alphapolis\.co\.jp$/i,
      body: ['.novel-body', '.novel_text', '[class*="novel"]'],
      work: ['.novel-title', '.title', 'h1'],
      page: ['.episode-title', '.chapter-title', 'h1', 'h2'],
      known: true
    },
    {
      test: /(?:^|\.)pixiv\.net$/i,
      path: /^\/novel(?:\/|$)/i,
      body: ['[class*="novel-text"]', '[class*="NovelText"]', 'main'],
      work: ['h1', '[class*="title"]'],
      page: ['h1', 'h2'],
      known: true
    }
  ];

  const EXCLUDED = [
    'script', 'style', 'noscript', 'template', 'nav', 'header', 'footer', 'aside',
    'form', 'button', 'input', 'select', 'textarea', '[aria-hidden="true"]',
    '.広告', '.ad', '.ads', '.advertisement', '.social-share', '.share-buttons',
    '[class*="advert"]', '[id*="advert"]', '[class*="comment"]', '[id*="comment"]'
  ];

  let lastFingerprint = '';
  let scanTimer = 0;
  let lastScanAt = 0;

  function text(value, maxLength) {
    const result = String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/g, ''))
      .join('\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
    return typeof maxLength === 'number' ? result.slice(0, maxLength) : result;
  }

  function one(selector) {
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  }

  function firstMatching(selectors) {
    for (const selector of selectors || []) {
      const element = one(selector);
      if (element && text(element.innerText || element.textContent).length) return element;
    }
    return null;
  }

  function meta(property) {
    const element = one('meta[property="' + property + '"], meta[name="' + property + '"]');
    return element?.content || '';
  }

  function siteRule() {
    const host = location.hostname;
    return KNOWN_SITES.find((rule) => rule.test.test(host) && (!rule.path || rule.path.test(location.pathname))) || null;
  }

  function cloneReadable(element) {
    const clone = element.cloneNode(true);
    for (const selector of EXCLUDED) {
      try {
        clone.querySelectorAll(selector).forEach((node) => node.remove());
      } catch {
        // ページ側の特殊なセレクターは無視します。
      }
    }
    return clone;
  }

  function candidateScore(element, value, preferred) {
    const label = ((element.id || '') + ' ' + (element.className || '')).toLowerCase();
    let score = Math.min(value.length / 120, 35);
    if (preferred) score += 100;
    if (/(novel|episode|chapter|story|本文|小説|article|prose|content)/i.test(label)) score += 30;
    if (/(main|article)/i.test(element.tagName || '')) score += 12;
    if (/(comment|footer|header|nav|menu|side|ad)/i.test(label)) score -= 40;
    const paragraphs = value.split(/\n\s*\n/).length;
    score += Math.min(paragraphs, 12);
    return score;
  }

  function findBody(rule) {
    const preferred = firstMatching(rule?.body);
    const candidates = [];
    if (preferred) candidates.push({ element: preferred, preferred: true });

    const selectors = [
      'article', 'main', '[role="main"]',
      '[class*="novel"]', '[class*="episode"]', '[class*="chapter"]',
      '[class*="story"]', '[class*="article"]', '[class*="content"]'
    ];
    for (const selector of selectors) {
      try {
        document.querySelectorAll(selector).forEach((element) => {
          if (!candidates.some((item) => item.element === element)) {
            candidates.push({ element, preferred: false });
          }
        });
      } catch {
        // 無効なサイト側セレクターは無視します。
      }
    }
    if (!candidates.length && document.body) candidates.push({ element: document.body, preferred: false });

    let best = null;
    for (const item of candidates) {
      const readable = cloneReadable(item.element);
      const value = text(readable.innerText || readable.textContent, 500000);
      if (value.length < 80) continue;
      const score = candidateScore(item.element, value, item.preferred);
      if (!best || score > best.score) best = { value, score, element: item.element };
    }
    return best;
  }

  function cleanTitle(value) {
    return text(value, 240)
      .replace(/\s*[|｜]\s*(小説|作品|[一-龠ぁ-んァ-ヶA-Za-z ]+?(?:公式|サイト|ホームページ))\s*$/i, '')
      .replace(/^\s*(?:読む|閲覧|小説)\s*[:：]\s*/i, '')
      .trim();
  }

  function getPageTitle(rule) {
    const element = firstMatching(rule?.page) || one('h1, h2');
    const value = cleanTitle(element?.innerText || element?.textContent || '');
    if (value && value.length <= 240) return value;
    return cleanTitle(meta('og:title') || document.title || '');
  }

  function getNovelTitle(rule, pageTitle) {
    const workElement = firstMatching(rule?.work);
    const explicit = cleanTitle(
      workElement?.getAttribute('data-novel-title') ||
      workElement?.getAttribute('data-work-title') ||
      workElement?.innerText ||
      workElement?.textContent ||
      ''
    );
    if (explicit && explicit !== pageTitle && explicit.length <= 140) return explicit;

    const dataElement = one('[data-novel-title], [data-work-title]');
    const dataTitle = cleanTitle(dataElement?.getAttribute('data-novel-title') || dataElement?.getAttribute('data-work-title') || '');
    if (dataTitle) return dataTitle;

    const documentTitle = cleanTitle(meta('og:title') || document.title || '');
    const parts = documentTitle.split(/\s+(?:\||｜|[-–—])\s+/).map(cleanTitle).filter(Boolean);
    const chapterLike = (value) => /(?:第\s*\d+\s*[話章回]|序章|終章|prologue|epilogue|chapter|episode)/i.test(value);
    const nonChapter = parts.find((part) => !chapterLike(part) && part !== pageTitle);
    if (nonChapter) return nonChapter;
    if (documentTitle && documentTitle !== pageTitle) return documentTitle;

    const heading = cleanTitle(one('h1')?.innerText || one('h1')?.textContent || '');
    return heading || location.hostname || '無題の小説';
  }

  function getPageNumber(pageTitle) {
    const dataElement = one('[data-page-number], [data-episode-number], [data-chapter-number]');
    const dataValue = dataElement?.getAttribute('data-page-number') ||
      dataElement?.getAttribute('data-episode-number') ||
      dataElement?.getAttribute('data-chapter-number');
    const candidates = [dataValue, new URL(location.href).searchParams.get('page'), new URL(location.href).searchParams.get('episode'), new URL(location.href).searchParams.get('chapter')];
    for (const candidate of candidates) {
      const number = Number(String(candidate || '').match(/\d+/)?.[0]);
      if (Number.isInteger(number) && number > 0) return number;
    }
    const fromTitle = String(pageTitle || '').match(/(?:第\s*)?(\d{1,5})\s*[話章回ページ]/i);
    if (fromTitle) return Number(fromTitle[1]);
    const pathMatches = location.pathname.match(/(?:episode|chapter|page|story|read|novel)[^\d]{0,8}(\d{1,5})(?:\D|$)/i);
    return pathMatches ? Number(pathMatches[1]) : null;
  }

  function isLikelyNovel(rule, body, pageTitle) {
    if (!rule) return false;
    if (!body || body.value.length < 120) return false;
    if (rule?.known) return true;
    const urlHint = /(?:novel|episode|chapter|story|works|read|ncode)/i.test(location.href);
    const titleHint = /(?:第\s*\d+\s*[話章回]|序章|終章|prologue|epilogue|chapter|episode|小説|物語)/i.test(pageTitle + ' ' + document.title);
    const paragraphCount = body.value.split(/\n\s*\n/).filter(Boolean).length;
    const longProse = body.value.length >= 900 && paragraphCount >= 4;
    return urlHint || titleHint || longProse;
  }

  function extractPage() {
    const rule = siteRule();
    if (!rule) return null;
    const body = findBody(rule);
    const pageTitle = getPageTitle(rule);
    if (!isLikelyNovel(rule, body, pageTitle)) return null;

    const canonical = one('link[rel="canonical"]')?.href || location.href;
    return {
      novelTitle: getNovelTitle(rule, pageTitle),
      pageTitle: pageTitle || '本文',
      pageNumber: getPageNumber(pageTitle),
      text: body.value,
      sourceUrl: canonical,
      sourceHost: location.hostname,
      capturedAt: Date.now()
    };
  }

  function fingerprint(page) {
    if (!page) return '';
    return [page.sourceUrl, page.novelTitle, page.pageTitle, page.text.length, page.text.slice(0, 160)].join('|');
  }

  function scan(sendEvenIfSame) {
    const now = Date.now();
    if (!sendEvenIfSame && now - lastScanAt < 700) return null;
    lastScanAt = now;
    const page = extractPage();
    const nextFingerprint = fingerprint(page);
    if (!page || (!sendEvenIfSame && nextFingerprint === lastFingerprint)) return page;
    lastFingerprint = nextFingerprint;
    try {
      chrome.runtime.sendMessage({ type: 'novelPageCaptured', page });
    } catch {
      // 拡張機能が更新・停止された場合はページ側では何もしません。
    }
    return page;
  }

  function scheduleScan(delay) {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => scan(false), delay || 900);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'scanNow') return false;
    const page = scan(true);
    sendResponse(page);
    return false;
  });

  window.addEventListener('load', () => scheduleScan(500), { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleScan(300);
  });
  window.addEventListener('scroll', () => scheduleScan(1200), { passive: true });

  if (document.body) {
    const observer = new MutationObserver(() => scheduleScan(1500));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  scheduleScan(1000);
})();
