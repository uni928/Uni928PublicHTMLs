import { buildReaderHtml, recordToJson, safeFileBase } from './reader-template.js';

const $ = (id) => document.getElementById(id);
const state = {
  novels: [],
  settings: { autoCapture: true },
  selectedKey: null,
  directoryHandle: null,
  toastTimer: 0
};

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: '応答がありません。' });
    });
  });
}

function showToast(message, isError) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.toggle('is-error', Boolean(isError));
  toast.classList.add('is-visible');
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2800);
}

function formatDate(value) {
  if (!value) return '更新日時不明';
  try {
    return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return '更新日時不明';
  }
}

function downloadText(filename, content, mimeType) {
  const blob = new Blob(['\ufeff', content], { type: mimeType || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function recordFileBase(record) {
  const site = String(record?.sourceHost || '').replace(/^www\./i, '').trim();
  return safeFileBase((site ? site + '_' : '') + String(record?.title || 'novel'));
}

async function loadNovels() {
  const response = await send({ type: 'getNovels' });
  if (!response.ok) {
    showToast(response.error || '一覧を読み込めませんでした。', true);
    return;
  }
  state.novels = Array.isArray(response.novels) ? response.novels : [];
  if (!state.selectedKey || !state.novels.some((item) => item.key === state.selectedKey)) {
    state.selectedKey = state.novels[0]?.key || null;
  }
  renderNovelList();
}

async function getNovel(key) {
  const response = await send({ type: 'getNovel', key });
  if (!response.ok || !response.novel) {
    showToast(response.error || '小説データを読み込めませんでした。', true);
    return null;
  }
  return response.novel;
}

function renderNovelList() {
  const list = $('novelList');
  const empty = $('emptyState');
  list.replaceChildren();
  empty.hidden = state.novels.length !== 0;
  state.novels.forEach((summary) => {
    const card = document.createElement('article');
    card.className = 'novel-card' + (summary.key === state.selectedKey ? ' is-selected' : '');

    const main = document.createElement('div');
    main.className = 'novel-card-main';
    main.title = 'クリックで選択';
    const title = document.createElement('div');
    title.className = 'novel-title';
    title.textContent = summary.title || '無題の小説';
    const meta = document.createElement('div');
    meta.className = 'novel-meta';
    meta.textContent = String(summary.pageCount || 0) + 'ページ · ' + formatDate(summary.updatedAt);
    main.append(title, meta);
    main.addEventListener('click', () => {
      state.selectedKey = summary.key;
      renderNovelList();
    });

    const actions = document.createElement('div');
    actions.className = 'novel-actions';
    const viewerButton = document.createElement('button');
    viewerButton.className = 'button button-primary button-small';
    viewerButton.type = 'button';
    viewerButton.textContent = '閲覧サイト';
    viewerButton.addEventListener('click', () => exportReader(summary.key));
    const jsonButton = document.createElement('button');
    jsonButton.className = 'button button-small';
    jsonButton.type = 'button';
    jsonButton.textContent = 'JSON';
    jsonButton.addEventListener('click', () => exportJson(summary.key));
    const deleteButton = document.createElement('button');
    deleteButton.className = 'button button-danger button-small';
    deleteButton.type = 'button';
    deleteButton.textContent = '削除';
    deleteButton.addEventListener('click', () => removeNovel(summary));
    actions.append(viewerButton, jsonButton, deleteButton);
    card.append(main, actions);
    list.appendChild(card);
  });
}

async function exportReader(key) {
  const novel = await getNovel(key);
  if (!novel) return;
  downloadText(recordFileBase(novel) + '_閲覧.html', buildReaderHtml(novel), 'text/html;charset=utf-8');
  showToast('閲覧サイトを出力しました。');
}

async function exportJson(key) {
  const novel = await getNovel(key);
  if (!novel) return;
  downloadText(recordFileBase(novel) + '.json', recordToJson(novel), 'application/json;charset=utf-8');
  showToast('JSONを出力しました。');
}

async function removeNovel(summary) {
  if (!window.confirm('「' + summary.title + '」を削除しますか？')) return;
  const response = await send({ type: 'deleteNovel', key: summary.key });
  if (!response.ok) {
    showToast(response.error || '削除できませんでした。', true);
    return;
  }
  if (state.selectedKey === summary.key) state.selectedKey = null;
  await loadNovels();
  showToast('小説を削除しました。');
}

async function scanCurrentPage() {
  $('scanCurrent').disabled = true;
  $('scanCurrent').textContent = '取得中…';
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await send({ type: 'requestScan', tabId: tabs[0]?.id });
    if (!response.ok) {
      showToast(response.error || '現在のページを取得できませんでした。', true);
      return;
    }
    if (!response.page) {
      showToast('小説本文を見つけられませんでした。', true);
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    await loadNovels();
    showToast('現在のページを保存しました。');
  } finally {
    $('scanCurrent').disabled = false;
    $('scanCurrent').textContent = '現在のページを取得';
  }
}

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('novel-shelf-panel', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('handles')) request.result.createObjectStore('handles');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveDirectoryHandle(handle) {
  const db = await openHandleDb();
  await new Promise((resolve, reject) => {
    const request = db.transaction('handles', 'readwrite').objectStore('handles').put(handle, 'root');
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  db.close();
}

async function loadDirectoryHandle() {
  try {
    const db = await openHandleDb();
    const handle = await new Promise((resolve, reject) => {
      const request = db.transaction('handles', 'readonly').objectStore('handles').get('root');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

async function hasWritePermission(handle, request) {
  if (!handle) return false;
  const options = { mode: 'readwrite' };
  try {
    if (await handle.queryPermission(options) === 'granted') return true;
    return request ? await handle.requestPermission(options) === 'granted' : false;
  } catch {
    return false;
  }
}

function setFolderStatus(message) {
  $('folderStatus').textContent = message;
}

async function writeRecordToFolder(record, requestPermission) {
  const handle = state.directoryHandle;
  if (!handle || !(await hasWritePermission(handle, requestPermission))) return false;
  const fileHandle = await handle.getFileHandle(recordFileBase(record) + '.json', { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(recordToJson(record));
  await writable.close();
  return true;
}

async function syncAllToFolder() {
  if (!state.directoryHandle) return;
  if (!(await hasWritePermission(state.directoryHandle, false))) {
    setFolderStatus('同期先の権限が失効しています。「保存フォルダを選ぶ」から再許可してください。');
    return;
  }
  for (const summary of state.novels) {
    const novel = await getNovel(summary.key);
    if (novel) await writeRecordToFolder(novel, false);
  }
  setFolderStatus('同期先：' + state.directoryHandle.name + '（自動同期中）');
}

async function chooseFolder() {
  if (!window.showDirectoryPicker) {
    showToast('このChromeではローカルフォルダ同期に対応していません。', true);
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    if (!(await hasWritePermission(handle, true))) {
      showToast('保存フォルダへの書き込み権限が必要です。', true);
      return;
    }
    state.directoryHandle = handle;
    await saveDirectoryHandle(handle);
    setFolderStatus('同期先：' + handle.name + '（保存中…）');
    await syncAllToFolder();
    showToast('保存フォルダを設定しました。');
  } catch (error) {
    if (error?.name !== 'AbortError') showToast('保存フォルダを設定できませんでした。', true);
  }
}

function normalizeImportedRecord(data) {
  if (data && typeof data.title === 'string' && Array.isArray(data.pages)) return data;
  const oldNovel = data?.model?.novels?.[0] || data?.novels?.[0];
  if (!oldNovel) return null;
  return {
    schemaVersion: 1,
    title: oldNovel.title || '無題の小説',
    pages: Array.isArray(oldNovel.pages) ? oldNovel.pages.map((page, index) => ({
      number: page.number || index + 1,
      title: page.title || '',
      text: page.text || '',
      sourceUrl: page.sourceUrl || ''
    })) : []
  };
}

async function importJson(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const record = normalizeImportedRecord(data);
    if (!record || !record.title || !Array.isArray(record.pages)) throw new Error('形式が不正です');
    const response = await send({ type: 'importNovel', record });
    if (!response.ok) throw new Error(response.error || '保存できませんでした');
    await loadNovels();
    showToast('JSONを読み込みました。');
  } catch (error) {
    showToast('JSONを読み込めませんでした：' + error.message, true);
  }
}

async function updateCaptureSetting() {
  const response = await send({ type: 'setSettings', settings: { autoCapture: $('autoCapture').checked } });
  if (!response.ok) {
    showToast(response.error || '設定を保存できませんでした。', true);
    return;
  }
  state.settings = response.settings;
  $('captureStatus').textContent = state.settings.autoCapture ? '自動取得 ON' : '自動取得 OFF';
  $('captureStatus').style.color = state.settings.autoCapture ? 'var(--success)' : 'var(--muted)';
  $('captureStatus').style.background = state.settings.autoCapture ? '#effaf5' : '#f1f4f8';
  $('captureStatus').style.borderColor = state.settings.autoCapture ? '#bfe7d8' : 'var(--line)';
}

async function initialize() {
  const settingsResponse = await send({ type: 'getSettings' });
  if (settingsResponse.ok) {
    state.settings = settingsResponse.settings;
    $('autoCapture').checked = Boolean(state.settings.autoCapture);
    await updateCaptureSetting();
  }
  state.directoryHandle = await loadDirectoryHandle();
  if (state.directoryHandle) setFolderStatus('同期先：' + state.directoryHandle.name + '（確認中…）');
  await loadNovels();
  if (state.directoryHandle) await syncAllToFolder();
}

$('scanCurrent').addEventListener('click', scanCurrentPage);
$('chooseFolder').addEventListener('click', chooseFolder);
$('refresh').addEventListener('click', loadNovels);
$('importJson').addEventListener('change', importJson);
$('autoCapture').addEventListener('change', updateCaptureSetting);

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'novelUpdated') return;
  loadNovels().then(async () => {
    if (!state.directoryHandle || !message.summary?.key) return;
    const novel = await getNovel(message.summary.key);
    if (novel) {
      try {
        if (await writeRecordToFolder(novel, false)) setFolderStatus('同期先：' + state.directoryHandle.name + '（自動同期中）');
      } catch {
        setFolderStatus('JSON同期に失敗しました。保存フォルダの権限を確認してください。');
      }
    }
  });
});

initialize();
