const INDEX_KEY = 'novelIndex';
const SETTINGS_KEY = 'novelSettings';
const STORAGE_PREFIX = 'novel:';
const DEFAULT_SETTINGS = {
  autoCapture: true
};

let mutationQueue = Promise.resolve();

function queueMutation(task) {
  const next = mutationQueue.then(task, task);
  mutationQueue = next.catch(() => undefined);
  return next;
}

function cleanText(value, maxLength) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  return typeof maxLength === 'number' ? text.slice(0, maxLength) : text;
}

function normalizeTitle(value) {
  return cleanText(value, 140)
    .replace(/\s+/g, ' ')
    .replace(/\s*[|｜]\s*[^|｜]+$/, '')
    .trim() || '無題の小説';
}

function makeNovelKey(title, site) {
  const normalized = normalizeTitle(title).toLocaleLowerCase('ja-JP');
  const siteKey = siteKeyFromUrl(site);
  const identity = siteKey ? siteKey + '|' + normalized : normalized;
  return STORAGE_PREFIX + encodeURIComponent(identity).slice(0, 180);
}

function makeLegacyNovelKey(title) {
  return STORAGE_PREFIX + encodeURIComponent(normalizeTitle(title).toLocaleLowerCase('ja-JP')).slice(0, 180);
}

function canonicalizeUrl(value) {
  try {
    const url = new URL(String(value));
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid']
      .forEach((name) => url.searchParams.delete(name));
    return url.href;
  } catch {
    return cleanText(value, 1000);
  }
}

function hostFromUrl(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

function siteKeyFromUrl(value) {
  const host = hostFromUrl(value || '') || String(value || '').toLowerCase().replace(/^www\./, '');
  if (!host) return '';
  const knownSites = [
    'syosetu.com', 'syosetu.org', 'kakuyomu.jp', 'alphapolis.co.jp', 'pixiv.net'
  ];
  return knownSites.find((site) => host === site || host.endsWith('.' + site)) || host;
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function extractPageInfo(value) {
  const source = cleanText(value, 500000).replace(/\s+/g, ' ');
  const match = source.match(/(\d{1,6})\s*\/\s*(\d{1,6})/) ||
    source.match(/(?:第\s*)?(\d{1,6})\s*ページ目?/i) ||
    source.match(/(?:第\s*)?(\d{1,6})\s*(?:話|章|回|episode|chapter)\b/i);
  return match ? { value: match[0].trim(), number: Number(match[1]) } : null;
}

function pageInfoNumber(page) {
  const explicitNumber = safeNumber(page?.pageNumberInfo);
  if (explicitNumber) return explicitNumber;
  const rememberedInfo = extractPageInfo(page?.pageInfo);
  if (rememberedInfo?.number) return rememberedInfo.number;
  if (!page?.pageInfo && page?.numberSource !== 'capture-order') {
    const direct = safeNumber(page?.number || page?.pageNumber);
    if (direct) return direct;
  }
  const value = String(page?.title || '') + ' ' + String(page?.sourceUrl || '');
  const match = value.match(/(\d{1,6})\s*\/\s*(\d{1,6})/) ||
    value.match(/(?:第\s*)?(\d{1,6})\s*(?:ページ目?|話|章|回|page|episode|chapter)(?:\D|$)/i) ||
    value.match(/(?:episode|chapter|page|story|read|novel)[^\d]{0,8}(\d{1,6})(?:\D|$)/i);
  return match ? Number(match[1]) : null;
}

function comparePages(a, b) {
  const aInfo = pageInfoNumber(a);
  const bInfo = pageInfoNumber(b);
  if (aInfo !== null && bInfo === null) return -1;
  if (aInfo === null && bInfo !== null) return 1;
  if (aInfo !== null && bInfo !== null && aInfo !== bInfo) return aInfo - bInfo;
  const aNumber = safeNumber(a?.number) || Number.MAX_SAFE_INTEGER;
  const bNumber = safeNumber(b?.number) || Number.MAX_SAFE_INTEGER;
  if (aNumber !== bNumber) return aNumber - bNumber;
  const titleOrder = String(a?.title || '').localeCompare(String(b?.title || ''), 'ja');
  if (titleOrder) return titleOrder;
  return String(a?.sourceUrl || '').localeCompare(String(b?.sourceUrl || ''));
}

function normalizePage(page, fallbackNumber) {
  const text = cleanText(page?.text, 500000);
  const sourceUrl = canonicalizeUrl(page?.sourceUrl || page?.url || '');
  const requestedNumber = safeNumber(page?.number || page?.pageNumber);
  const pageInfo = cleanText(page?.pageInfo || extractPageInfo(page?.title || page?.pageTitle)?.value, 120);
  const pageNumberInfo = safeNumber(page?.pageNumberInfo) || extractPageInfo(pageInfo)?.number || null;
  return {
    number: requestedNumber || fallbackNumber,
    numberSource: page?.numberSource || (requestedNumber ? 'page-info' : 'capture-order'),
    pageInfo,
    pageNumberInfo,
    title: cleanText(page?.title || page?.pageTitle, 240),
    text,
    sourceUrl,
    capturedAt: Number(page?.capturedAt) || Date.now()
  };
}

function normalizeRecord(record) {
  const title = normalizeTitle(record?.title || record?.novelTitle);
  const inputPages = Array.isArray(record?.pages) ? record.pages : [];
  const pages = [];
  const usedNumbers = new Set();
  const usedUrls = new Set();

  for (const input of inputPages) {
    const fallback = pages.length + 1;
    const page = normalizePage(input, fallback);
    if (!page.text || page.text.length < 1) continue;
    if (usedUrls.has(page.sourceUrl) && page.sourceUrl) continue;
    if (usedNumbers.has(page.number)) {
      page.number = Math.max(0, ...usedNumbers) + 1;
    }
    usedNumbers.add(page.number);
    if (page.sourceUrl) usedUrls.add(page.sourceUrl);
    pages.push(page);
  }

  pages.sort(comparePages);
  const sourceHost = siteKeyFromUrl(record?.sourceHost || pages[0]?.sourceUrl || '');
  return {
    schemaVersion: 3,
    title,
    pages,
    sourceHost,
    sourceUrls: Array.from(new Set([
      ...(Array.isArray(record?.sourceUrls) ? record.sourceUrls : []),
      ...pages.map((page) => page.sourceUrl).filter(Boolean)
    ])).slice(0, 100),
    createdAt: Number(record?.createdAt) || Date.now(),
    updatedAt: Number(record?.updatedAt) || Date.now()
  };
}

async function getSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] || {}) };
}

async function getIndex() {
  const result = await chrome.storage.local.get(INDEX_KEY);
  return Array.isArray(result[INDEX_KEY]) ? result[INDEX_KEY] : [];
}

function summaryFromRecord(record, key) {
  return {
    key,
    title: record.title,
    pageCount: record.pages.length,
    updatedAt: record.updatedAt,
    sourceHost: hostFromUrl(record.pages[0]?.sourceUrl || '') || record.sourceHost || ''
  };
}

async function saveRecord(key, record) {
  const index = await getIndex();
  const summary = summaryFromRecord(record, key);
  const nextIndex = [summary, ...index.filter((item) => item.key !== key)]
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  await chrome.storage.local.set({ [key]: record, [INDEX_KEY]: nextIndex });
  return summary;
}

function notifyNovelUpdated(summary) {
  chrome.runtime.sendMessage({ type: 'novelUpdated', summary }).catch(() => undefined);
}

async function upsertNovelPage(page) {
  const novelTitle = normalizeTitle(page?.novelTitle || page?.title || hostFromUrl(page?.sourceUrl));
  const sourceUrl = canonicalizeUrl(page?.sourceUrl || page?.url || '');
  const sourceSite = siteKeyFromUrl(page?.sourceHost || sourceUrl);
  const scopedKey = makeNovelKey(novelTitle, sourceSite);
  const legacyKey = makeLegacyNovelKey(novelTitle);
  const stored = await chrome.storage.local.get([scopedKey, legacyKey]);
  let key = scopedKey;
  let current = stored[scopedKey] ? normalizeRecord(stored[scopedKey]) : null;
  if (!current && stored[legacyKey]) {
    const legacy = normalizeRecord(stored[legacyKey]);
    const legacySite = legacy.sourceHost || siteKeyFromUrl(legacy.pages[0]?.sourceUrl || '');
    if (!legacySite || !sourceSite || legacySite === sourceSite) {
      key = legacyKey;
      current = legacy;
    }
  }
  current ||= normalizeRecord({ title: novelTitle, sourceHost: sourceSite });
  const text = cleanText(page?.text, 500000);
  if (!text || text.length < 80) return null;

  const pageTitle = cleanText(page?.pageTitle, 240);
  const incomingPageInfo = cleanText(page?.pageInfo || extractPageInfo(page?.pageTitle)?.value, 120);
  const incomingPageNumberInfo = safeNumber(page?.pageNumberInfo) || extractPageInfo(incomingPageInfo)?.number || null;
  const requestedNumber = safeNumber(page?.pageNumber) || incomingPageNumberInfo || pageInfoNumber({ pageInfo: incomingPageInfo, title: page?.pageTitle, sourceUrl });
  let target = current.pages.find((item) => item.sourceUrl && sourceUrl && item.sourceUrl === sourceUrl);
  if (!target && requestedNumber) {
    target = current.pages.find((item) => pageInfoNumber(item) === requestedNumber &&
      (!pageTitle || !item.title || item.title === pageTitle));
  }
  if (!target && !sourceUrl && pageTitle) {
    target = current.pages.find((item) => item.title === pageTitle);
  }
  if (!target) {
    let number = requestedNumber || Math.max(0, ...current.pages.map((item) => item.number)) + 1;
    if (current.pages.some((item) => item.number === number)) {
      number = Math.max(0, ...current.pages.map((item) => item.number)) + 1;
    }
    target = {
      number,
      numberSource: requestedNumber ? 'page-info' : 'capture-order',
      pageInfo: incomingPageInfo,
      pageNumberInfo: incomingPageNumberInfo,
      title: '',
      text: '',
      sourceUrl,
      capturedAt: Date.now()
    };
    current.pages.push(target);
  }

  if (requestedNumber && target.number !== requestedNumber &&
      !current.pages.some((item) => item !== target && item.number === requestedNumber)) {
    target.number = requestedNumber;
    target.numberSource = 'page-info';
  }
  target.title = pageTitle || target.title || ('第' + target.number + 'ページ');
  target.pageInfo = incomingPageInfo || target.pageInfo || '';
  target.pageNumberInfo = incomingPageNumberInfo || target.pageNumberInfo || null;
  target.text = text;
  target.sourceUrl = sourceUrl;
  target.capturedAt = Date.now();
  if (!current.title || current.title === '無題の小説') current.title = novelTitle;
  current.sourceHost = current.sourceHost || sourceSite;
  current.sourceUrls = Array.from(new Set([...(current.sourceUrls || []), sourceUrl].filter(Boolean))).slice(0, 100);
  current.pages.sort(comparePages);
  current.updatedAt = Date.now();

  const summary = await saveRecord(key, current);
  notifyNovelUpdated(summary);
  return summary;
}

async function listNovels() {
  const index = await getIndex();
  if (!index.length) return [];
  const values = await chrome.storage.local.get(index.map((item) => item.key));
  const valid = [];
  for (const item of index) {
    const record = values[item.key];
    if (record) valid.push(summaryFromRecord(normalizeRecord(record), item.key));
  }
  if (valid.length !== index.length) {
    await chrome.storage.local.set({ [INDEX_KEY]: valid });
  }
  return valid;
}

async function getNovel(key) {
  if (!String(key || '').startsWith(STORAGE_PREFIX)) return null;
  const result = await chrome.storage.local.get(String(key));
  return result[key] ? normalizeRecord(result[key]) : null;
}

async function importNovel(record) {
  const normalized = normalizeRecord(record);
  const key = makeNovelKey(normalized.title, normalized.sourceHost);
  normalized.updatedAt = Date.now();
  const summary = await saveRecord(key, normalized);
  notifyNovelUpdated(summary);
  return summary;
}

async function deleteNovel(key) {
  if (!String(key || '').startsWith(STORAGE_PREFIX)) return false;
  const index = await getIndex();
  await chrome.storage.local.remove(key);
  await chrome.storage.local.set({
    [INDEX_KEY]: index.filter((item) => item.key !== key)
  });
  return true;
}

async function requestScan(tabId) {
  if (!tabId) return { ok: false, error: 'タブが見つかりません。' };
  try {
    const page = await chrome.tabs.sendMessage(tabId, { type: 'scanNow' });
    return { ok: true, page: page || null };
  } catch {
    return { ok: false, error: 'このページは読み取り対象にできません。' };
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
  }
});

chrome.runtime.onStartup?.addListener(async () => {
  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (chrome.sidePanel?.open) {
    await chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-panel') return;
  const windows = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
  if (windows?.id && chrome.sidePanel?.open) {
    await chrome.sidePanel.open({ windowId: windows.id }).catch(() => undefined);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message?.type;

  if (type === 'novelPageCaptured') {
    queueMutation(async () => {
      const settings = await getSettings();
      if (!settings.autoCapture) return null;
      return upsertNovelPage(message.page);
    }).then((summary) => sendResponse({ ok: true, summary })).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (type === 'getNovels') {
    listNovels().then((novels) => sendResponse({ ok: true, novels })).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (type === 'getNovel') {
    getNovel(message.key).then((novel) => sendResponse({ ok: true, novel })).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (type === 'getSettings') {
    getSettings().then((settings) => sendResponse({ ok: true, settings })).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (type === 'setSettings') {
    queueMutation(async () => {
      const settings = { ...DEFAULT_SETTINGS, ...(message.settings || {}) };
      await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
      return settings;
    }).then((settings) => sendResponse({ ok: true, settings })).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (type === 'requestScan') {
    requestScan(sender.tab?.id || message.tabId).then(sendResponse);
    return true;
  }

  if (type === 'importNovel') {
    queueMutation(() => importNovel(message.record)).then((summary) => sendResponse({ ok: true, summary })).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (type === 'deleteNovel') {
    queueMutation(() => deleteNovel(message.key)).then((deleted) => sendResponse({ ok: deleted })).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  return false;
});
