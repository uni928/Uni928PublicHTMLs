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

function makeNovelKey(title) {
  const normalized = normalizeTitle(title).toLocaleLowerCase('ja-JP');
  return STORAGE_PREFIX + encodeURIComponent(normalized).slice(0, 180);
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

function safeNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizePage(page, fallbackNumber) {
  const text = cleanText(page?.text, 500000);
  const sourceUrl = canonicalizeUrl(page?.sourceUrl || page?.url || '');
  return {
    number: safeNumber(page?.number || page?.pageNumber) || fallbackNumber,
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

  pages.sort((a, b) => a.number - b.number);
  return {
    schemaVersion: 1,
    title,
    pages,
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
    sourceHost: hostFromUrl(record.pages[0]?.sourceUrl || '')
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
  const key = makeNovelKey(novelTitle);
  const stored = await chrome.storage.local.get(key);
  const current = stored[key] ? normalizeRecord(stored[key]) : normalizeRecord({ title: novelTitle });
  const sourceUrl = canonicalizeUrl(page?.sourceUrl || page?.url || '');
  const text = cleanText(page?.text, 500000);
  if (!text || text.length < 80) return null;

  let target = current.pages.find((item) => item.sourceUrl && item.sourceUrl === sourceUrl);
  if (!target) {
    const requestedNumber = safeNumber(page?.pageNumber);
    let number = requestedNumber || Math.max(0, ...current.pages.map((item) => item.number)) + 1;
    if (current.pages.some((item) => item.number === number)) {
      number = Math.max(0, ...current.pages.map((item) => item.number)) + 1;
    }
    target = { number, title: '', text: '', sourceUrl, capturedAt: Date.now() };
    current.pages.push(target);
  }

  target.title = cleanText(page?.pageTitle || target.title || ('第' + target.number + 'ページ'), 240);
  target.text = text;
  target.sourceUrl = sourceUrl;
  target.capturedAt = Date.now();
  current.title = current.title || novelTitle;
  current.sourceUrls = Array.from(new Set([...(current.sourceUrls || []), sourceUrl].filter(Boolean))).slice(0, 100);
  current.pages.sort((a, b) => a.number - b.number);
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
  const key = makeNovelKey(normalized.title);
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
