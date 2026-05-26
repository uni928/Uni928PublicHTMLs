(() => {
  const STORE_KEY = 'gsm_memory_v1';
  const MAX_PROMPT_WITH_URL = 3000;
  const CHATGPT_BASE = 'https://chatgpt.com/?temporary-chat=true';
  const GEMINI_URL = 'https://gemini.google.com/app';
  // Gmail URL末尾のメッセージトークンから保存する先頭文字数です。
  // 3文字は情報量が少ない一方で衝突しやすいため、必要なら8〜10程度に変更してください。
  const MAIL_KEY_PREFIX_LENGTH = 3;

  const DEFAULT_MEMORY = {
    version: 1,
    updatedAt: null,
    rules: [],
    domains: {},
    senders: {},
    analyzedKeys: {},
    stats: { imports: 0, samples: 0 }
  };

  let memory = structuredClone(DEFAULT_MEMORY);
  let lastPromptEmails = [];
  let observer = null;
  let scanTimer = null;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'GSM_TOGGLE_PANEL') {
      init().then(() => togglePanel());
      sendResponse({ ok: true });
      return true;
    }
  });

  init();

  async function init() {
    memory = await loadMemory();
    ensurePanel();
    startObserver();
    scheduleScan();
  }

  function ensurePanel() {
    if (document.getElementById('gsm-panel')) return;
    const panel = document.createElement('section');
    panel.id = 'gsm-panel';
    panel.className = 'gsm-hidden';
    panel.innerHTML = `
      <div class="gsm-head">
        <div class="gsm-title">Gmail Suspicion Meter</div>
        <button class="gsm-close" title="閉じる">×</button>
      </div>
      <div class="gsm-body">
        <div class="gsm-note">
          表示中のメール一覧から、件名・送信者・短いスニペットだけを使ってAI判定用プロンプトを作ります。本文や添付ファイルは読みません。
        </div>
        <div class="gsm-row">
          <button id="gsm-open-chatgpt" class="gsm-btn primary">ChatGPTで判定</button>
          <button id="gsm-open-gemini" class="gsm-btn">Geminiで判定</button>
          <button id="gsm-rescan" class="gsm-btn">再スキャン</button>
        </div>
        <div class="gsm-note">
          AIの回答を下の欄に貼り付けて「反映」を押すと、メール本文ではなく、ドメイン・送信者・短い特徴ルールだけを保存します。
        </div>
        <textarea id="gsm-result" placeholder='AIのJSON結果を貼り付けます。例: {"items":[...],"rules":[...]}'></textarea>
        <div class="gsm-row">
          <button id="gsm-apply" class="gsm-btn primary">反映</button>
          <button id="gsm-copy-prompt" class="gsm-btn">プロンプトだけコピー</button>
          <button id="gsm-clear" class="gsm-btn danger">記憶を削除</button>
        </div>
        <div id="gsm-stats" class="gsm-stats"></div>
        <div id="gsm-status" class="gsm-status"></div>
      </div>`;
    document.documentElement.appendChild(panel);

    panel.querySelector('.gsm-close').addEventListener('click', () => panel.classList.add('gsm-hidden'));
    panel.querySelector('#gsm-open-chatgpt').addEventListener('click', () => openAi('chatgpt'));
    panel.querySelector('#gsm-open-gemini').addEventListener('click', () => openAi('gemini'));
    panel.querySelector('#gsm-copy-prompt').addEventListener('click', async () => {
      const emails = snapshotPromptEmails();
      await copyText(buildPrompt(emails));
      setStatus(`プロンプトをコピーしました。対象メール${emails.length}件を一時保持しました。`);
    });
    panel.querySelector('#gsm-apply').addEventListener('click', applyResult);
    panel.querySelector('#gsm-clear').addEventListener('click', clearMemory);
    panel.querySelector('#gsm-rescan').addEventListener('click', () => {
      scheduleScan(0);
      setStatus('再スキャンしました。');
    });
    updateStats();
  }

  function togglePanel() {
    const panel = document.getElementById('gsm-panel');
    panel.classList.toggle('gsm-hidden');
    scheduleScan(0);
    updateStats();
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function scheduleScan(delay = 350) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanVisibleRows, delay);
  }

  async function loadMemory() {
    const data = await chrome.storage.local.get(STORE_KEY);
    return normalizeMemory(data[STORE_KEY]);
  }

  async function saveMemory(nextMemory) {
    memory = normalizeMemory(nextMemory);
    await chrome.storage.local.set({ [STORE_KEY]: memory });
    updateStats();
    scheduleScan(0);
  }

  function normalizeMemory(value) {
    const merged = structuredClone(DEFAULT_MEMORY);
    if (!value || typeof value !== 'object') return merged;
    merged.version = 1;
    merged.updatedAt = value.updatedAt || null;
    merged.rules = Array.isArray(value.rules) ? value.rules.slice(0, 80).map(normalizeRule).filter(Boolean) : [];
    merged.domains = compactMap(value.domains, 120);
    merged.senders = compactMap(value.senders, 160);
    merged.analyzedKeys = compactAnalyzedKeys(value.analyzedKeys, 2500);
    merged.stats = { ...merged.stats, ...(value.stats || {}) };
    return merged;
  }

  function compactMap(obj, maxKeys) {
    const out = {};
    Object.entries(obj || {})
      .filter(([k, v]) => k && v && Number.isFinite(Number(v.score)))
      .sort((a, b) => (b[1].seen || 0) - (a[1].seen || 0))
      .slice(0, maxKeys)
      .forEach(([k, v]) => {
        out[String(k).toLowerCase().slice(0, 120)] = {
          score: clamp(Number(v.score), 0, 100),
          seen: clampInt(v.seen || 1, 1, 9999),
          reason: String(v.reason || '').slice(0, 80)
        };
      });
    return out;
  }

  function compactAnalyzedKeys(obj, maxKeys) {
    const out = {};
    Object.entries(obj || {})
      .filter(([key, value]) => key && value)
      .sort((a, b) => String(b[1]?.at || '').localeCompare(String(a[1]?.at || '')))
      .slice(0, maxKeys)
      .forEach(([key, value]) => {
        out[String(key).slice(0, 16)] = {
          at: String(value?.at || ''),
          score: clamp(Number(value?.score || 0), 0, 100)
        };
      });
    return out;
  }

  function normalizeRule(rule) {
    if (!rule || typeof rule !== 'object') return null;
    const type = String(rule.type || '').toLowerCase();
    const value = String(rule.value || '').toLowerCase().trim().slice(0, 80);
    const score = clamp(Number(rule.score), 0, 100);
    if (!['keyword', 'sender_keyword', 'domain', 'subject_keyword'].includes(type)) return null;
    if (!value || !Number.isFinite(score)) return null;
    return { type, value, score, reason: String(rule.reason || '').slice(0, 80) };
  }

  function collectVisibleEmails(limit = 60) {
    // 一覧取得は旧バージョンと同じく、URLトークンが取れない行も対象にします。
    // Gmailの一覧行では、環境や表示状態によってメールURLがDOM上に出ない場合があります。
    // そのため、mailKeyは「取れたら解析済み判定に使う補助情報」として扱います。
    const rows = findEmailRows().slice(0, limit);
    return rows.map((row, index) => {
      const parsed = parseRow(row);
      const token = extractGmailMessageTokenFromRow(row);
      const mailKey = makeAnalyzedKeyFromToken(token);
      const fallbackKey = makeFallbackAnalyzedKey(parsed);
      return {
        id: index + 1,
        mailKey,
        fallbackKey,
        sender: parsed.sender,
        domain: extractDomain(parsed.sender),
        subject: parsed.subject,
        snippet: parsed.snippet
      };
    }).filter(x => x.sender || x.subject || x.snippet);
  }

  function snapshotPromptEmails() {
    lastPromptEmails = collectVisibleEmails();
    return lastPromptEmails;
  }

  function findEmailRows() {
    const trRows = [...document.querySelectorAll('tr[role="row"]')]
      .filter(row => row.offsetParent && row.innerText && row.innerText.length > 10);
    if (trRows.length) return trRows;
    return [...document.querySelectorAll('div[role="link"][tabindex]')]
      .filter(row => row.offsetParent && row.innerText && row.innerText.length > 10);
  }

  function extractGmailMessageTokenFromRow(row) {
    // Gmailの一覧行に含まれる href / 属性から、#inbox/FMfc... の末尾トークンをできるだけ拾います。
    // ただし一覧表示ではURLがDOMに存在しないこともあるため、失敗時は空文字を返します。
    const hrefCandidates = [];
    for (const link of row.querySelectorAll('a[href]')) {
      hrefCandidates.push(link.href || '');
      hrefCandidates.push(link.getAttribute('href') || '');
    }
    for (const href of hrefCandidates) {
      const token = extractTokenFromHref(href);
      if (token) return token;
    }

    const attrNames = [
      'data-thread-id',
      'data-legacy-thread-id',
      'data-legacy-message-id',
      'data-legacy-last-message-id',
      'data-message-id'
    ];
    for (const name of attrNames) {
      const direct = row.getAttribute(name) || '';
      const nested = row.querySelector(`[${name}]`)?.getAttribute(name) || '';
      for (const value of [direct, nested]) {
        const token = cleanGmailToken(value);
        if (token) return token;
      }
    }
    return '';
  }

  function extractTokenFromHref(href) {
    const value = String(href || '');
    if (!value) return '';
    const hash = value.includes('#') ? value.split('#').pop() : value;
    const lastPart = hash.split(/[/?&]/).filter(Boolean).pop() || '';
    return cleanGmailToken(lastPart);
  }

  function cleanGmailToken(value) {
    const raw = String(value || '').trim().replace(/^thread-[af]:/i, '').replace(/^msg-[af]:/i, '');
    if (/^[A-Za-z0-9_-]{8,}$/.test(raw)) return raw;
    return '';
  }

 function makeAnalyzedKeyFromToken(token) {
   const text = String(token || '');
   return text.slice(-MAIL_KEY_PREFIX_LENGTH);
 }

  function makeFallbackAnalyzedKey(email) {
    // URLトークンが取れないGmail表示でも、判定直後の反映と再表示ができるようにする予備キーです。
    // 本文は使わず、一覧に見えている短い情報だけから短いハッシュを作ります。
    const source = `${normalizeSender(email.sender)}|${clean(email.subject).slice(0, 80)}|${clean(email.snippet).slice(0, 80)}`;
    if (!source.replace(/[|\s]/g, '')) return '';
    return `fb:${shortHash(source)}`;
  }

  function shortHash(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36).slice(0, 8);
  }

  function parseRow(row) {
    const senderEl = row.querySelector('.yW span[email], .yW span[name], [email]');
    const sender = clean(senderEl?.getAttribute('email') || senderEl?.getAttribute('name') || senderEl?.textContent || firstLine(row));
    const subjectEl = row.querySelector('.bog, [data-thread-id] .bog');
    const snippetEl = row.querySelector('.y2, .y6 span[id], .y6');
    let subject = clean(subjectEl?.textContent || '');
    let snippet = clean(snippetEl?.textContent || '');
    if (!subject) {
      const lines = row.innerText.split('\n').map(clean).filter(Boolean);
      subject = lines.find(line => line !== sender && line.length > 3) || '';
      snippet = lines.slice(2).join(' ').slice(0, 300);
    }
    return {
      sender: sender.slice(0, 160),
      subject: subject.slice(0, 220),
      snippet: snippet.replace(/^[-–—]\s*/, '').slice(0, 260)
    };
  }

  function firstLine(row) {
    return (row.innerText || '').split('\n').map(clean).find(Boolean) || '';
  }

  function scanVisibleRows() {
    for (const row of findEmailRows()) {
      const parsed = parseRow(row);
      const token = extractGmailMessageTokenFromRow(row);
      const mailKey = makeAnalyzedKeyFromToken(token);
      const fallbackKey = makeFallbackAnalyzedKey(parsed);
      const analyzed = (mailKey && memory.analyzedKeys[mailKey]) || (fallbackKey && memory.analyzedKeys[fallbackKey]);
      if (!analyzed) {
        clearDecoration(row);
        continue;
      }
      const result = scoreEmail(parsed);
      decorateRow(row, result);
    }
  }

  function scoreEmail(email) {
    let score = 8;
    const reasons = [];
    const text = `${email.sender} ${email.subject} ${email.snippet}`.toLowerCase();
    const domain = extractDomain(email.sender);
    const senderKey = normalizeSender(email.sender);

    const domainMem = domain ? memory.domains[domain] : null;
    if (domainMem) addWeighted(domainMem.score, .55, `domain:${domainMem.reason || domain}`);
    const senderMem = senderKey ? memory.senders[senderKey] : null;
    if (senderMem) addWeighted(senderMem.score, .65, `sender:${senderMem.reason || senderKey}`);

    for (const rule of memory.rules) {
      if (matchesRule(rule, email, text, domain)) addWeighted(rule.score, .45, rule.reason || rule.value);
    }

    const builtinRules = [
      [/緊急|至急|重要|警告|制限|停止|凍結|未払い|滞納|本人確認|認証|確認してください|アカウント|パスワード|セキュリティ|ログイン|期限/i, 28, '緊急・認証系の語句'],
      [/bit\.ly|tinyurl|t\.co|短縮url|http:\/\//i, 24, '短縮URLまたは非HTTPS'],
      [/無料|当選|高額|副業|投資|返金|還付|請求|支払い|ギフト|ポイント|クーポン/i, 18, '金銭・特典系の語句'],
      [/添付|請求書|invoice|payment|verify|urgent|suspended|limited|password|security|gift/i, 18, '英語の詐欺頻出語']
    ];
    for (const [re, add, reason] of builtinRules) {
      if (re.test(text)) {
        score += add;
        reasons.push(reason);
      }
    }
    if (domain && /gmail\.com|yahoo\.|outlook\.|hotmail\./i.test(domain) && /銀行|税務署|amazon|apple|microsoft|rakuten|楽天|paypal|netflix/i.test(text)) {
      score += 25;
      reasons.push('個人メール由来のブランド風メール');
    }

    return { score: clamp(Math.round(score), 0, 100), reasons: reasons.slice(0, 3) };

    function addWeighted(value, weight, reason) {
      score = Math.max(score, Number(value) * weight + score * (1 - weight));
      if (reason) reasons.push(reason);
    }
  }

  function matchesRule(rule, email, text, domain) {
    if (rule.type === 'keyword') return text.includes(rule.value);
    if (rule.type === 'sender_keyword') return email.sender.toLowerCase().includes(rule.value);
    if (rule.type === 'subject_keyword') return email.subject.toLowerCase().includes(rule.value);
    if (rule.type === 'domain') return domain === rule.value || domain.endsWith('.' + rule.value);
    return false;
  }

  function decorateRow(row, result) {
    let badge = row.querySelector(':scope .gsm-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'gsm-badge';
      const target = row.querySelector('.xS, .y6, .bog') || row.firstElementChild || row;
      target.appendChild(badge);
    }
    badge.textContent = `怪 ${result.score}%`;
    badge.title = result.reasons.length ? `怪しさ ${result.score}%\n${result.reasons.join('\n')}` : `怪しさ ${result.score}%`;
    badge.className = `gsm-badge ${riskClass(result.score)}`;
    row.classList.remove('gsm-row-mid', 'gsm-row-high', 'gsm-row-critical');
    if (result.score >= 85) row.classList.add('gsm-row-critical');
    else if (result.score >= 65) row.classList.add('gsm-row-high');
    else if (result.score >= 40) row.classList.add('gsm-row-mid');
  }

  function clearDecoration(row) {
    const badge = row.querySelector(':scope .gsm-badge');
    if (badge) badge.remove();
    row.classList.remove('gsm-row-mid', 'gsm-row-high', 'gsm-row-critical');
  }

  function riskClass(score) {
    if (score >= 85) return 'gsm-risk-critical';
    if (score >= 65) return 'gsm-risk-high';
    if (score >= 40) return 'gsm-risk-mid';
    return 'gsm-risk-low';
  }

  async function openAi(kind) {
    const emails = snapshotPromptEmails();
    const prompt = buildPrompt(emails);
    await copyText(prompt);
    setStatus(`${kind === 'chatgpt' ? 'ChatGPT' : 'Gemini'}用プロンプトをコピーしました。`);
    if (kind === 'chatgpt') {
      const encoded = encodeURIComponent(prompt);
      const url = prompt.length <= MAX_PROMPT_WITH_URL ? `${CHATGPT_BASE}&prompt=${encoded}` : CHATGPT_BASE;
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      window.open(GEMINI_URL, '_blank', 'noopener,noreferrer');
    }
  }

  function buildPrompt(emails) {
    const compactMemory = {
      rules: memory.rules.slice(0, 40),
      suspiciousDomains: topEntries(memory.domains, 30),
      suspiciousSenders: topEntries(memory.senders, 30),
      analyzedKeyCount: Object.keys(memory.analyzedKeys || {}).length
    };
    return `あなたはフィッシングメール・詐欺メールのリスク判定補助AIです。\n` +
      `次のGmail一覧データを、本文全文ではなく件名・送信者・短いスニペットだけで判定してください。\n` +
      `目的: Chrome拡張が次回以降に怪しさ%を表示するため、競合が少なく、情報量が少ない記憶だけを返すこと。\n\n` +
      `厳守事項:\n` +
      `- 出力はJSONのみ。説明文やMarkdownは禁止。\n` +
      `- メール本文、個人名、長い件名、長いスニペットを保存用ルールに含めない。\n` +
      `- 保存する特徴は domain / sender / 短いkeyword / subject_keyword / sender_keyword 程度に圧縮する。\n` +
      `- 正規の通知メールを過剰に危険扱いしない。\n` +
      `- scoreは0〜100。0安全、100非常に怪しい。\n` +
      `- itemsには必ず入力一覧のidをそのまま返す。mailKeyは出力不要。\n\n` +
      `出力JSONスキーマ:\n` +
      `{"items":[{"id":1,"score":0,"reason":"20字以内"}],"rules":[{"type":"keyword|subject_keyword|sender_keyword|domain","value":"短い特徴","score":0,"reason":"20字以内"}],"domains":{"example.com":{"score":0,"reason":"20字以内"}},"senders":{"sender@example.com":{"score":0,"reason":"20字以内"}}}\n\n` +
      `既存の圧縮記憶:\n${JSON.stringify(compactMemory)}\n\n` +
      `今回の表示メール一覧:\n${JSON.stringify(emails)}`;
  }

  function topEntries(obj, limit) {
    return Object.fromEntries(Object.entries(obj || {})
      .sort((a, b) => (b[1].score || 0) - (a[1].score || 0))
      .slice(0, limit));
  }

  async function applyResult() {
    const textarea = document.getElementById('gsm-result');
    const text = textarea.value.trim();
    if (!text) return setStatus('AIの結果を貼り付けてください。', true);
    let data;
    try {
      data = parseJsonLoose(text);
    } catch (error) {
      return setStatus('JSONを読み取れませんでした。AIの出力全体を貼り付けてください。', true);
    }

    const next = normalizeMemory(memory);
    let samples = 0;

    for (const rule of (data.rules || [])) {
      const normalized = normalizeRule(rule);
      if (!normalized) continue;
      upsertRule(next.rules, normalized);
    }
    for (const [domain, info] of Object.entries(data.domains || {})) {
      const key = String(domain).toLowerCase().trim().slice(0, 120);
      if (!key) continue;
      next.domains[key] = mergeScore(next.domains[key], info);
      samples++;
    }
    for (const [sender, info] of Object.entries(data.senders || {})) {
      const key = normalizeSender(sender).slice(0, 120);
      if (!key) continue;
      next.senders[key] = mergeScore(next.senders[key], info);
      samples++;
    }
    const visible = lastPromptEmails.length ? lastPromptEmails : collectVisibleEmails();
    for (const item of (data.items || [])) {
      const email = visible.find(e => Number(e.id) === Number(item.id));
      const score = clamp(Number(item.score), 0, 100);
      if (!email || !Number.isFinite(score)) continue;
      const analyzedKey = email.mailKey || email.fallbackKey || '';
      if (analyzedKey) {
        next.analyzedKeys[analyzedKey] = {
          at: new Date().toISOString(),
          score
        };
      }
      const domain = extractDomain(email.sender);
      const sender = normalizeSender(email.sender);
      const reason = String(item.reason || '').slice(0, 80);
      if (domain && (score >= 60 || score <= 20)) next.domains[domain] = mergeScore(next.domains[domain], { score, reason });
      if (sender && (score >= 75 || score <= 15)) next.senders[sender] = mergeScore(next.senders[sender], { score, reason });
      samples++;
    }

    next.rules = next.rules.sort((a, b) => b.score - a.score).slice(0, 80);
    next.updatedAt = new Date().toISOString();
    next.stats.imports = (next.stats.imports || 0) + 1;
    next.stats.samples = (next.stats.samples || 0) + samples;
    await saveMemory(next);
    textarea.value = '';
    setStatus(`反映しました。解析済み${Object.keys(next.analyzedKeys).length}件 / ルール${next.rules.length}件 / ドメイン${Object.keys(next.domains).length}件 / 送信者${Object.keys(next.senders).length}件`);
  }

  function mergeScore(oldValue, info) {
    const oldScore = Number(oldValue?.score ?? 0);
    const oldSeen = Number(oldValue?.seen ?? 0);
    const newScore = clamp(Number(info?.score), 0, 100);
    const seen = Math.min(oldSeen + 1, 9999);
    const score = oldSeen ? Math.round((oldScore * Math.min(oldSeen, 5) + newScore) / (Math.min(oldSeen, 5) + 1)) : newScore;
    return { score, seen, reason: String(info?.reason || oldValue?.reason || '').slice(0, 80) };
  }

  function upsertRule(rules, rule) {
    const existing = rules.find(r => r.type === rule.type && r.value === rule.value);
    if (existing) {
      existing.score = Math.round((existing.score + rule.score) / 2);
      existing.reason = rule.reason || existing.reason;
    } else {
      rules.push(rule);
    }
  }

  async function clearMemory() {
    if (!confirm('保存した怪しさの記憶を削除しますか？')) return;
    await saveMemory(structuredClone(DEFAULT_MEMORY));
    setStatus('記憶を削除しました。');
  }

  function parseJsonLoose(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) text = fenced[1];
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
    return JSON.parse(text);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  function updateStats() {
    const el = document.getElementById('gsm-stats');
    if (!el) return;
    el.innerHTML = `
      <div class="gsm-kv">
        <span>保存ルール</span><span>${memory.rules.length}</span>
        <span>保存ドメイン</span><span>${Object.keys(memory.domains).length}</span>
        <span>保存送信者</span><span>${Object.keys(memory.senders).length}</span>
        <span>解析済み</span><span>${Object.keys(memory.analyzedKeys || {}).length}</span>
        <span>反映回数</span><span>${memory.stats.imports || 0}</span>
      </div>`;
  }

  function setStatus(message, isError = false) {
    const el = document.getElementById('gsm-status');
    if (!el) return;
    el.textContent = message;
    el.style.color = isError ? '#b3261e' : '#188038';
  }

  function extractDomain(sender) {
    const email = String(sender || '').match(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/i);
    return email ? email[1].toLowerCase() : '';
  }

  function normalizeSender(sender) {
    const email = String(sender || '').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    return email ? email[0].toLowerCase() : clean(sender).toLowerCase().slice(0, 120);
  }

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  function clampInt(value, min, max) {
    return Math.round(clamp(Number(value), min, max));
  }
})();
