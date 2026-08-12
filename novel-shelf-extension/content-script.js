(() => {
  'use strict';

  const KNOWN_SITES = [
    {
      test: /(?:^|\.)syosetu\.com$/i,
      body: ['#novel_honbun', '#novel_color', '.js-novel-text', '.p-novel__body', '[class*="novel_honbun"]'],
      work: ['#novel_title', '.novel_title', '[data-novel-title]'],
      page: ['.chapter_title', '.novel_subtitle', '.p-novel__title'],
      known: true
    },
    {
      test: /(?:^|\.)syosetu\.org$/i,
      site: 'hameln',
      body: ['#honbun', '#novel_honbun', '.novel_view', '.novel_view_body', '[id*="honbun"]', '[class*="honbun"]', '#main'],
      work: ['a[href="./"]', 'a[href="../"]', 'a[rel="bookmark"]', 'h1', '.title', '[class*="title"]'],
      page: ['h1', 'h2', '.novel_subtitle'],
      known: true
    },
    {
      test: /kakuyomu\.jp$/i,
      body: ['.widget-episodeBody', '.widget-episodeBody__content', '[data-episode-body]', '[data-testid*="episode"]', '.episode-body'],
      work: ['[data-work-title]', '.widget-workTitle', 'a[href*="/works/"]'],
      page: ['.widget-episodeTitle', '[data-episode-title]', 'h1'],
      known: true
    },
    {
      test: /(?:^|\.)alphapolis\.co\.jp$/i,
      body: ['.novel-body', '.novel-body-inner', '.novel_text', '[class*="novel-body"]', '[class*="novel-text"]'],
      work: ['.novel-title', '.title', 'h1'],
      page: ['.episode-title', '.chapter-title', 'h1', 'h2'],
      known: true
    },
    {
      test: /(?:^|\.)pixiv\.net$/i,
      path: /^\/novel(?:\/|$)/i,
      body: ['[class*="novel-text"]', '[class*="NovelText"]', '[data-testid*="novel"]', 'main'],
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
  let captureRetryTimers = [];
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

  function paragraphFallback() {
    const values = [];
    document.querySelectorAll('p, [role="paragraph"]').forEach((element) => {
      if (element.closest('nav, header, footer, aside, form, button, [aria-hidden="true"], [class*="comment"], [class*="advert"]')) return;
      const value = text(element.innerText || element.textContent);
      if (value.length >= 20) values.push(value);
    });
    const uniqueValues = Array.from(new Set(values));
    if (uniqueValues.length < 3) return null;
    const value = uniqueValues.join('\n\n');
    return { value, score: Math.min(value.length / 120, 35) + uniqueValues.length + 18, element: document.body };
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
      '[class*="story"]', '[class*="article"]', '[class*="content"]',
      '[class*="body"]', '[class*="text"]', '[data-testid*="content"]'
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
    const paragraph = paragraphFallback();
    if (paragraph && (!best || paragraph.score > best.score || best.element === document.body)) best = paragraph;
    return best;
  }

  function cleanTitle(value) {
    return text(value, 240)
      .replace(/\s*[|｜]\s*(小説|作品|[一-龠ぁ-んァ-ヶA-Za-z ]+?(?:公式|サイト|ホームページ))\s*$/i, '')
      .replace(/^\s*(?:読む|閲覧|小説)\s*[:：]\s*/i, '')
      .trim();
  }

  function parseHamelnTitle(value) {
    const source = cleanTitle(value);
    const parts = source.split(/\s+-\s+/).map(cleanTitle).filter(Boolean);
    if (parts.length < 3) return null;
    return {
      pageTitle: parts.slice(0, -2).join(' - '),
      novelTitle: parts.slice(-2).join(' - ')
    };
  }

  function elementTitle(element) {
    return cleanTitle(
      element?.getAttribute('data-novel-title') ||
      element?.getAttribute('data-work-title') ||
      element?.getAttribute('title') ||
      element?.getAttribute('aria-label') ||
      element?.innerText ||
      element?.textContent ||
      ''
    );
  }

  function getPageTitle(rule) {
    if (rule?.site === 'hameln') {
      const parsed = parseHamelnTitle(document.title);
      if (parsed?.pageTitle) return parsed.pageTitle;
    }
    const element = firstMatching(rule?.page) || one('h1, h2');
    const value = cleanTitle(element?.innerText || element?.textContent || '');
    if (value && value.length <= 240) return value;
    return cleanTitle(meta('og:title') || document.title || '');
  }

  function getNovelTitle(rule, pageTitle) {
    const workElement = firstMatching(rule?.work);
    const explicit = elementTitle(workElement);
    if (explicit && explicit !== pageTitle && explicit.length <= 140) return explicit;
    if (rule?.site === 'hameln') {
      const parsed = parseHamelnTitle(document.title);
      if (parsed?.novelTitle) return parsed.novelTitle;
    }

    const dataElement = one('[data-novel-title], [data-work-title]');
    const dataTitle = cleanTitle(dataElement?.getAttribute('data-novel-title') || dataElement?.getAttribute('data-work-title') || '');
    if (dataTitle) return dataTitle;

    const documentTitle = cleanTitle(meta('og:title') || document.title || '');
    const parts = documentTitle.split(/\s+(?:\||｜|[-–—])\s+/).map(cleanTitle).filter(Boolean);
    const chapterLike = (value) => /(?:第\s*\d+\s*[話章回]|序章|終章|prologue|epilogue|chapter|episode)/i.test(value);
    const nonChapter = parts.find((part) => !chapterLike(part) && !extractPageInfo(part) && part !== pageTitle);
    if (nonChapter) return nonChapter;
    if (documentTitle && documentTitle !== pageTitle) return documentTitle;

    const heading = cleanTitle(one('h1')?.innerText || one('h1')?.textContent || '');
    return heading || location.hostname || '無題の小説';
  }

  function extractPageInfo(value) {
    const source = text(value, 500000).replace(/\s+/g, ' ').trim();
    const match = source.match(/(\d{1,6})\s*\/\s*(\d{1,6})/) ||
      source.match(/(?:第\s*)?(\d{1,6})\s*ページ目?\b/i) ||
      source.match(/(?:第\s*)?(\d{1,6})\s*(?:話|章|回|episode|chapter)\b/i);
    if (!match) return null;
    return { value: match[0].trim(), number: Number(match[1]) };
  }

  function getPageInfo(pageTitle, body) {
    const dataElement = one('[data-page-info], [data-page-number], [data-page-count], [aria-label*="ページ"]');
    const pageElements = [
      firstMatching(['.page-info', '.page-number', '.pager', '.pagination', '[class*="page-info"]', '[class*="pagination"]']),
      dataElement
    ];
    const candidates = [
      dataElement?.getAttribute('data-page-info'),
      dataElement?.getAttribute('data-page-number'),
      dataElement?.getAttribute('data-page-count'),
      ...pageElements.map((element) => element?.innerText || element?.textContent || ''),
      document.body?.innerText || document.body?.textContent || '',
      body?.value,
      pageTitle,
      document.title
    ];
    for (const candidate of candidates) {
      const info = extractPageInfo(candidate);
      if (info) return info;
    }
    return null;
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
    const pageInfo = extractPageInfo(pageTitle) || extractPageInfo(document.title);
    if (pageInfo?.number) return pageInfo.number;
    const fromTitle = String(pageTitle || '').match(/(?:第\s*)?(\d{1,6})\s*[話章回ページ]/i) ||
      String(document.title || '').match(/(?:第\s*)?(\d{1,6})\s*[話章回ページ]/i);
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
    const pageInfo = getPageInfo(pageTitle, body);
    if (!isLikelyNovel(rule, body, pageTitle)) return null;

    const canonical = one('link[rel="canonical"]')?.href || location.href;
    return {
      novelTitle: getNovelTitle(rule, pageTitle),
      pageTitle: pageTitle || '本文',
      pageInfo: pageInfo?.value || '',
      pageNumberInfo: pageInfo?.number || null,
      pageNumber: pageInfo?.number || getPageNumber(pageTitle),
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

  function clearCaptureRetryTimers() {
    captureRetryTimers.forEach((timer) => window.clearTimeout(timer));
    captureRetryTimers = [];
  }

  function startCaptureRetries(firstDelay, onFirstCapture) {
    clearCaptureRetryTimers();
    [0, 2000, 4000].forEach((offset, index) => {
      const timer = window.setTimeout(() => {
        const page = scan(index > 0);
        if (index === 0 && onFirstCapture) onFirstCapture(page);
      }, Math.max(0, Number(firstDelay) || 0) + offset);
      captureRetryTimers.push(timer);
    });
  }

  function scheduleScan(delay) {
    window.clearTimeout(scanTimer);
    clearCaptureRetryTimers();
    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      startCaptureRetries(0);
    }, Math.max(0, Number(delay) || 1000));
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'scanNow') return false;
    window.clearTimeout(scanTimer);
    scanTimer = 0;
    startCaptureRetries(1000, sendResponse);
    return true;
  });

  window.addEventListener('load', () => scheduleScan(1000), { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleScan(1000);
  });
  window.addEventListener('scroll', () => scheduleScan(1000), { passive: true });

  if (document.body) {
    const observer = new MutationObserver(() => scheduleScan(1000));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  scheduleScan(1000);
})();
