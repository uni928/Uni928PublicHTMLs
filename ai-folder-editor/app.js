const MAX_DIRECT_PROMPT_LENGTH = 9921;
const MAX_DIFF_CELLS = 220000;
const MAX_DIFF_TOTAL_LINES = 3000;
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".svn",
  ".hg",
  "node_modules",
  "Library",
  "Temp",
  "Logs",
  "obj",
  "bin",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".idea",
  ".vscode",
]);

const TEXT_EXTENSIONS = new Set([
  ".as",
  ".asmdef",
  ".astro",
  ".bat",
  ".c",
  ".cc",
  ".cfg",
  ".cmd",
  ".config",
  ".cpp",
  ".cs",
  ".cshtml",
  ".csproj",
  ".css",
  ".csv",
  ".cxx",
  ".dart",
  ".fs",
  ".fsproj",
  ".go",
  ".h",
  ".hpp",
  ".html",
  ".htm",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".kts",
  ".less",
  ".lua",
  ".md",
  ".mjs",
  ".php",
  ".props",
  ".ps1",
  ".py",
  ".rb",
  ".rs",
  ".sass",
  ".scss",
  ".sh",
  ".sln",
  ".sql",
  ".svg",
  ".swift",
  ".targets",
  ".toml",
  ".ts",
  ".tsx",
  ".tsv",
  ".txt",
  ".uss",
  ".uxml",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
]);

const TEXT_FILE_NAMES = new Set([
  ".editorconfig",
  ".env",
  ".gitattributes",
  ".gitignore",
  ".npmrc",
  "Dockerfile",
  "LICENSE",
  "Makefile",
  "README",
]);

const BINARY_EXTENSIONS = new Set([
  ".7z",
  ".a",
  ".avi",
  ".bmp",
  ".dll",
  ".doc",
  ".docx",
  ".exe",
  ".gif",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".lockb",
  ".mov",
  ".mp3",
  ".mp4",
  ".o",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".psd",
  ".rar",
  ".so",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xls",
  ".xlsx",
  ".zip",
]);

const dom = {
  aiPanel: document.querySelector("#aiPanel"),
  appShell: document.querySelector("#appShell"),
  applyResultButton: document.querySelector("#applyResultButton"),
  centerDiffPanel: document.querySelector("#centerDiffPanel"),
  closeAiButton: document.querySelector("#closeAiButton"),
  closeSidebarButton: document.querySelector("#closeSidebarButton"),
  copyGeminiPromptButton: document.querySelector("#copyGeminiPromptButton"),
  copyPromptButton: document.querySelector("#copyPromptButton"),
  currentPath: document.querySelector("#currentPath"),
  diffPanel: document.querySelector("#diffPanel"),
  dirtyBadge: document.querySelector("#dirtyBadge"),
  editor: document.querySelector("#editor"),
  editorSurface: document.querySelector(".editor-surface"),
  fileTree: document.querySelector("#fileTree"),
  folderMeta: document.querySelector("#folderMeta"),
  lineNumbers: document.querySelector("#lineNumbers"),
  openFolderButton: document.querySelector("#openFolderButton"),
  promptInput: document.querySelector("#promptInput"),
  promptMeta: document.querySelector("#promptMeta"),
  resultInput: document.querySelector("#resultInput"),
  saveButton: document.querySelector("#saveButton"),
  sidebar: document.querySelector("#sidebar"),
  statusBar: document.querySelector("#statusBar"),
  toggleAiButton: document.querySelector("#toggleAiButton"),
  toggleSidebarButton: document.querySelector("#toggleSidebarButton"),
};

const state = {
  activePath: "",
  centerPreviewChange: null,
  clipboardUnknownFirstCopyDone: false,
  fileTree: null,
  files: new Map(),
  rootHandle: null,
  rootName: "",
};

dom.openFolderButton.addEventListener("click", openFolder);
dom.saveButton.addEventListener("click", saveActiveFile);
dom.toggleAiButton.addEventListener("click", () => setAiPanelOpen(!isAiPanelOpen()));
dom.closeAiButton.addEventListener("click", () => setAiPanelOpen(false));
dom.toggleSidebarButton.addEventListener("click", () => setSidebarOpen(!isSidebarOpen()));
dom.closeSidebarButton.addEventListener("click", () => setSidebarOpen(false));
dom.copyPromptButton.addEventListener("click", () => copyPromptAndOpenAi("chatgpt"));
dom.copyGeminiPromptButton.addEventListener("click", () => copyPromptAndOpenAi("gemini"));
dom.applyResultButton.addEventListener("click", prepareDiffFromResult);
dom.editor.addEventListener("input", onEditorInput);
dom.editor.addEventListener("scroll", syncLineNumberScroll);
dom.resultInput.addEventListener("input", normalizeResultInputSpecialSpaces);
dom.resultInput.addEventListener("paste", () => {
  requestAnimationFrame(normalizeResultInputSpecialSpaces);
});

document.addEventListener("keydown", (event) => {
  if (event.altKey && event.key.toLowerCase() === "g") {
    event.preventDefault();
    setAiPanelOpen(!isAiPanelOpen());
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveActiveFile();
  }
});

renderTree();
renderDiffEmpty();
updateLineNumbers();
dom.toggleAiButton.setAttribute("aria-expanded", "false");
dom.toggleSidebarButton.setAttribute("aria-expanded", "true");

async function openFolder() {
  if (!window.showDirectoryPicker) {
    setStatus("このブラウザではフォルダ編集APIが使えません。ChromeまたはEdgeでlocalhostから開いてください。", true);
    return;
  }

  try {
    const rootHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    state.rootHandle = rootHandle;
    state.rootName = rootHandle.name;
    state.files.clear();
    state.activePath = "";
    dom.editor.value = "";
    dom.editor.disabled = true;
    dom.currentPath.textContent = "ファイルを選択してください";
    dom.folderMeta.textContent = `${rootHandle.name} を編集中`;
    setStatus("フォルダを読み込んでいます...");
    state.fileTree = await scanDirectory(rootHandle, "");
    renderTree();
    setStatus(`${state.files.size} 件のテキスト候補を読み込みました。`);
  } catch (error) {
    if (error.name === "AbortError") {
      setStatus("フォルダ選択をキャンセルしました。");
      return;
    }
    setStatus(`フォルダを開けませんでした: ${error.message}`, true);
  }
}

async function scanDirectory(directoryHandle, directoryPath) {
  const directories = [];
  const files = [];

  for await (const [name, handle] of directoryHandle.entries()) {
    const path = joinPath(directoryPath, name);

    if (handle.kind === "directory") {
      if (IGNORED_DIRECTORIES.has(name)) continue;
      directories.push(await scanDirectory(handle, path));
      continue;
    }

    if (!isLikelyTextFileName(name)) continue;

    const meta = {
      content: "",
      dirty: false,
      handle,
      loaded: false,
      name,
      path,
      savedContent: "",
      skippedReason: "",
    };

    state.files.set(path, meta);
    files.push({ kind: "file", name, path });
  }

  directories.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  return {
    children: [...directories, ...files],
    kind: "directory",
    name: directoryPath ? getBaseName(directoryPath) : state.rootName,
    path: directoryPath,
  };
}

function renderTree() {
  dom.fileTree.innerHTML = "";

  if (!state.fileTree) {
    const empty = document.createElement("div");
    empty.className = "diff-empty";
    empty.textContent = "フォルダを開くと、編集できるテキストファイルが表示されます。";
    dom.fileTree.append(empty);
    return;
  }

  dom.fileTree.append(renderTreeNode(state.fileTree));
}

function renderTreeNode(node) {
  const group = document.createElement("div");
  group.className = "tree-group";

  if (node.path) {
    const row = document.createElement("div");
    row.className = "tree-row";
    row.innerHTML = `<span class="tree-icon">▾</span><span class="tree-name"></span>`;
    row.querySelector(".tree-name").textContent = node.name;
    group.append(row);
  }

  const children = document.createElement("div");
  children.className = node.path ? "tree-children" : "tree-group";

  for (const child of node.children) {
    if (child.kind === "directory") {
      children.append(renderTreeNode(child));
    } else {
      const button = document.createElement("button");
      button.className = `tree-row${state.activePath === child.path ? " active" : ""}`;
      button.type = "button";
      button.title = child.path;
      button.dataset.path = child.path;

      const meta = state.files.get(child.path);
      const dirtyMark = meta?.dirty ? " *" : "";
      const icon = document.createElement("span");
      icon.className = "tree-icon";
      icon.textContent = "·";
      const name = document.createElement("span");
      name.className = "tree-name";
      name.textContent = `${child.name}${dirtyMark}`;

      button.append(icon, name);
      button.addEventListener("click", () => openFile(child.path));
      children.append(button);
    }
  }

  group.append(children);
  return group;
}

async function openFile(path) {
  const meta = state.files.get(path);
  if (!meta) return;

  syncActiveEditorToCache();

  try {
    await ensureFileLoaded(meta);
    state.activePath = path;
    dom.editor.value = meta.content;
    dom.editor.disabled = false;
    dom.currentPath.textContent = path;
    dom.promptMeta.textContent = "現在のファイルと、コード中で参照されている同名ファイルを自動で含めます。";
    updateDirtyUi();
    updateLineNumbers();
    renderTree();
    setStatus(`${path} を開きました。`);
  } catch (error) {
    setStatus(`${path} はテキストとして読み込めません: ${error.message}`, true);
  }
}

function onEditorInput() {
  if (!state.activePath) return;
  const meta = state.files.get(state.activePath);
  if (!meta) return;

  meta.content = dom.editor.value;
  meta.dirty = meta.content !== meta.savedContent;
  updateDirtyUi();
  updateLineNumbers();
  renderTree();
}

async function saveActiveFile() {
  if (!state.activePath) return;
  syncActiveEditorToCache();
  const meta = state.files.get(state.activePath);
  if (!meta) return;

  try {
    await writeMetaToDisk(meta);
    updateDirtyUi();
    renderTree();
    setStatus(`${meta.path} を保存しました。`);
  } catch (error) {
    setStatus(`保存できませんでした: ${error.message}`, true);
  }
}

async function ensureFileLoaded(meta) {
  if (meta.loaded) return;

  const file = await meta.handle.getFile();
  const content = await file.text();

  if (!looksUsefulText(content)) {
    meta.skippedReason = "文字化けまたはバイナリに近い内容";
    throw new Error(meta.skippedReason);
  }

  meta.content = content;
  meta.savedContent = content;
  meta.loaded = true;
}

async function writeMetaToDisk(meta) {
  await ensureWritablePermission(meta.handle);
  const writable = await meta.handle.createWritable();
  await writable.write(meta.content);
  await writable.close();
  meta.savedContent = meta.content;
  meta.dirty = false;
  meta.loaded = true;
}

async function ensureWritablePermission(handle) {
  const query = await handle.queryPermission?.({ mode: "readwrite" });
  if (query === "granted") return;
  const request = await handle.requestPermission?.({ mode: "readwrite" });
  if (request !== "granted") {
    throw new Error("書き込み権限がありません。");
  }
}

async function copyPromptAndOpenAi(target) {
  let popup = null;

  try {
    const userPrompt = dom.promptInput.value.trim();
    if (!userPrompt) throw new Error("依頼プロンプトを入力してください。");
    if (!state.rootHandle) throw new Error("先にフォルダを開いてください。");
    if (!state.activePath) throw new Error("先に編集対象のファイルを開いてください。");
    if (!navigator.clipboard?.writeText) throw new Error("このブラウザではクリップボードコピーが使えません。");

    const service = getAiServiceConfig(target);
    const permissionState = await getClipboardWritePermissionState();
    const copyOnlyFirst = permissionState === "unknown" && !state.clipboardUnknownFirstCopyDone;

    if (permissionState === "denied" || permissionState === "prompt") {
      const requestedState = await requestClipboardWritePermission();
      if (requestedState === "denied" || (permissionState === "denied" && requestedState !== "granted")) {
        throw new Error("クリップボードへのコピー権限がありません。ブラウザの権限設定を確認してください。");
      }
    }

    if (!copyOnlyFirst) {
      popup = window.open("about:blank", "_blank");
    }

    setStatus(`${service.name}用プロンプトを組み立てています...`);
    const { includedPaths, prompt } = await buildChatGptPrompt(userPrompt);
    await navigator.clipboard.writeText(prompt);
    state.clipboardUnknownFirstCopyDone = true;
    dom.promptMeta.textContent = `コピー済み: ${prompt.length}文字 / 対象: ${includedPaths.join(", ")}`;

    if (copyOnlyFirst) {
      setStatus(
        `プロンプトをコピーしました。クリップボード権限を事前確認できない環境のため、この初回は${service.name}を開きません。もう一度「${service.buttonLabel}」を押すと${service.name}を開きます。${prompt.length}文字、対象 ${includedPaths.length} ファイル。`,
      );
      return;
    }

    const url = buildAiServiceUrl(service.id, prompt);

    if (service.id === "gemini") {
      setStatus(
        `プロンプトをコピーし、Geminiを開きました。GeminiはURLにプロンプトを入れられないため、画面で貼り付けて実行してください。${prompt.length}文字、対象 ${includedPaths.length} ファイル。`,
      );
    } else if (prompt.length <= MAX_DIRECT_PROMPT_LENGTH) {
      setStatus(`プロンプトをコピーし、ChatGPTを開きました。${prompt.length}文字、対象 ${includedPaths.length} ファイル。`);
    } else {
      setStatus(
        `プロンプトをコピーしました。${prompt.length}文字のため、ChatGPT側で貼り付けて実行してください。対象 ${includedPaths.length} ファイル。`,
      );
    }

    openPromptTarget(url, popup, service.name);
  } catch (error) {
    if (popup) popup.close();
    setStatus(error.message, true);
  }
}

function getAiServiceConfig(target) {
  if (target === "gemini") {
    return {
      buttonLabel: "プロンプトをコピーしてGeminiを開く",
      id: "gemini",
      name: "Gemini",
    };
  }

  return {
    buttonLabel: "プロンプトをコピーしてChatGPTを開く",
    id: "chatgpt",
    name: "ChatGPT",
  };
}

async function getClipboardWritePermissionState() {
  if (!navigator.permissions?.query) return "unknown";

  try {
    const status = await navigator.permissions.query({ name: "clipboard-write" });
    return status.state;
  } catch {
    return "unknown";
  }
}

async function requestClipboardWritePermission() {
  if (!navigator.permissions?.request) return "unknown";

  try {
    const status = await navigator.permissions.request({ name: "clipboard-write" });
    return status.state;
  } catch {
    return "unknown";
  }
}

function buildAiServiceUrl(target, prompt) {
  if (target === "gemini") {
    return new URL("https://gemini.google.com/app");
  }

  const url = new URL("https://chatgpt.com/");
  url.searchParams.set("temporary-chat", "true");

  if (prompt.length <= MAX_DIRECT_PROMPT_LENGTH) {
    url.searchParams.set("prompt", prompt);
  }

  return url;
}

function openPromptTarget(url, popup, serviceName) {
  if (popup) {
    popup.location.href = url.toString();
    return;
  }

  const opened = window.open(url.toString(), "_blank", "noopener,noreferrer");
  if (!opened) {
    throw new Error(`${serviceName}を開けませんでした。ポップアップブロックを解除して、もう一度押してください。`);
  }
}

async function buildChatGptPrompt(userPrompt) {
  syncActiveEditorToCache();
  const activeMeta = state.files.get(state.activePath);
  await ensureFileLoaded(activeMeta);

  const referencedPaths = findReferencedFilePaths(activeMeta.content, userPrompt, state.activePath);
  const includedPaths = [state.activePath, ...referencedPaths];
  const fileBlocks = [];
  const skipped = [];

  for (const path of includedPaths) {
    const meta = state.files.get(path);
    if (!meta) continue;

    try {
      await ensureFileLoaded(meta);
      fileBlocks.push(formatFileBlock(path, meta.content));
    } catch (error) {
      skipped.push(`${path}: ${error.message}`);
    }
  }

  const skippedText = skipped.length
    ? `\n読み込み対象から除外したファイル:\n${skipped.map((item) => `- ${item}`).join("\n")}\n`
    : "";

  const prompt = [
    "あなたはAI Folder Editorのコード編集アシスタントです。",
    "ユーザーはChatGPTまたはGeminiの出力をアプリの「反映する」ボタンで読み取り、差分を確認して採用します。",
    "",
    "重要な返答ルール:",
    "- 返答は説明なしで、下の raw patch 形式だけにしてください。コードフェンスで囲んで構いません。",
    "- ファイル全文は返さず、変更に必要な最小の OLD/NEW だけを返してください。",
    "- OLD は、その時点のファイル内容に一度だけ完全一致する最小の旧コード断片にしてください。",
    "- OLD が複数一致しそうな場合だけ、前後の行を少し含めて一意にしてください。変更していない大きなコード塊は含めないでください。",
    "- NEW は OLD を置き換える新コード断片です。削除は NEW を空にしてください。",
    "- 追記や挿入は、OLD に挿入位置周辺の一意な既存断片、NEW にその既存断片へ追加コードを含めた断片を入れてください。",
    "- URLをMarkdownリンクにしないでください。コード内のURLはそのままテキストとして出してください。",
    "- インデントや空白には、通常の半角スペース U+0020 とタブ U+0009 だけを使ってください。",
    "- ノーブレークスペース、全角スペース、細いスペースなどの特殊空白文字を絶対に使わないでください。",
    "- OLD/NEW内のコードをコピーする際も、見た目が同じでも特殊空白に変換しないでください。",
    "- 1ファイル内に複数箇所の変更がある場合は、変更箇所ごとに *** Old / *** New を分けてください。",
    "- 同じOLDが複数回出る場合は、可能なら前後の行を含めて一意にしてください。",
    "- 変更不要なら Begin/End のみで FILE を出さないでください。",
    "",
    "推奨返答形式:",
    "```aife-patch",
    "*** Begin Patch",
    "*** File: relative/path.ext",
    "*** Old",
    "一意に一致する旧コード断片",
    "*** New",
    "置換後の新コード断片",
    "*** End File",
    "*** End Patch",
    "```",
    "",
    "JSONで返す場合は、old/newの文字列ではなくoldLines/newLinesを優先してください:",
    '{"format":"ai-folder-editor-patch-v1","summary":"短い要約","files":[{"path":"relative/path.ext","edits":[{"oldLines":["旧コード1","旧コード2"],"newLines":["新コード1","新コード2"]}]}]}',
    "",
    `ユーザーの依頼:\n${userPrompt}`,
    "",
    `編集対象フォルダ: ${state.rootName}`,
    `現在開いているファイル: ${state.activePath}`,
    skippedText.trim(),
    "",
    "対象コード:",
    fileBlocks.join("\n\n"),
  ]
    .filter((part) => part !== "")
    .join("\n");

  return { includedPaths: fileBlocks.map((block) => block.match(/^--- FILE: (.*) ---$/m)?.[1]).filter(Boolean), prompt };
}

function formatFileBlock(path, content) {
  return `--- FILE: ${path} ---\n${content}\n--- END FILE: ${path} ---`;
}

function findReferencedFilePaths(activeContent, userPrompt, activePath) {
  const haystack = `${activeContent}\n${userPrompt}`;
  const paths = [];

  for (const [path, meta] of state.files.entries()) {
    if (path === activePath) continue;

    const base = stripExtension(meta.name);
    const candidates = [meta.name, base].filter((value) => value && value.length >= 2);

    if (candidates.some((candidate) => containsToken(haystack, candidate))) {
      paths.push(path);
    }
  }

  return paths.sort((a, b) => a.localeCompare(b));
}

function containsToken(text, token) {
  if (!token) return false;
  const escaped = escapeRegExp(token);
  const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escaped}($|[^A-Za-z0-9_])`);
  return pattern.test(text);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function prepareDiffFromResult() {
  try {
    const raw = normalizeSpecialSpaces(dom.resultInput.value).trim();
    if (raw !== dom.resultInput.value.trim()) {
      dom.resultInput.value = raw;
    }
    if (!raw) throw new Error("ChatGPTまたはGeminiの結果を貼り付けてください。");
    if (!state.rootHandle) throw new Error("先にフォルダを開いてください。");

    syncActiveEditorToCache();
    const parsed = parseResultJson(raw);
    const files = Array.isArray(parsed) ? parsed : parsed.files;

    if (!Array.isArray(files)) {
      throw new Error("JSONに files 配列が見つかりません。");
    }

    const expectedEditCount = files.reduce((sum, file) => {
      const edits = file.edits ?? file.patch ?? file.operations;
      return sum + (Array.isArray(edits) ? edits.length : 1);
    }, 0);

    const changes = [];

    for (const file of files) {
      const path = normalizeResultPath(file.path);
      if (!path) throw new Error("空のpathを含む結果があります。");

      const originalContent = await getCurrentContent(path);
      let content;

      if (Array.isArray(file.edits) || Array.isArray(file.patch) || Array.isArray(file.operations)) {
        const editList = file.edits ?? file.patch ?? file.operations;

        if (editList.length === 0) {
          continue;
        }

        let previewContent = originalContent;

        editList.forEach((edit, editIndex) => {
          const beforeEditContent = previewContent;
          const afterEditContent = applyPatchEdits(beforeEditContent, [edit], path, { allowFirstWhenMultiple: true });

          changes.push({
            content: afterEditContent,
            editBlockIndex: editIndex + 1,
            editBlockTotal: editList.length,
            editCount: 1,
            edits: [edit],
            oldContent: beforeEditContent,
            path,
            status: "pending",
          });

          previewContent = afterEditContent;
        });

        continue;
      } else {
        const rawContent = file.content ?? file.contentLines ?? file.newContent ?? file.body;
        content = coerceContent(rawContent);
        if (content === null) throw new Error(`${path} のcontentまたはeditsが見つかりません。`);
        if (Array.isArray(rawContent) && file.finalNewline === true && !content.endsWith("\n")) {
          content += "\n";
        }
        content = alignLineEndings(content, detectLineEnding(originalContent));
      }

      if (originalContent === content) continue;

      changes.push({
        content,
        editBlockIndex: 1,
        editBlockTotal: 1,
        editCount: 1,
        oldContent: originalContent,
        path,
        status: "pending",
      });
    }

    if (changes.length !== expectedEditCount) {
      throw new Error(`差分ブロック数が一致しません。期待: ${expectedEditCount} / 表示予定: ${changes.length}`);
    }

    renderDiffPanel(changes);

    if (changes.length === 0) {
      setStatus("反映できる差分はありませんでした。");
    } else {
      setStatus(`${changes.length} 編集ブロックの差分を確認できます。採用または元のままを選んでください。`);
    }
  } catch (error) {
    renderDiffError(error);
    setStatus(firstErrorLine(error.message), true);
  }
}

function parseResultJson(raw) {
  const trimmed = raw.trim();
  const patchResult = parseRawPatchResult(trimmed);
  if (patchResult) return patchResult;

  const fenced = trimmed.match(/^```(?:json|javascript|js)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const candidatePatchResult = parseRawPatchResult(candidate);
  if (candidatePatchResult) return candidatePatchResult;

  const jsonCandidates = [candidate];
  const firstObject = candidate.indexOf("{");
  const lastObject = candidate.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    jsonCandidates.push(candidate.slice(firstObject, lastObject + 1));
  }

  const firstArray = candidate.indexOf("[");
  const lastArray = candidate.lastIndexOf("]");
  if (firstArray >= 0 && lastArray > firstArray) {
    jsonCandidates.push(candidate.slice(firstArray, lastArray + 1));
  }

  for (const jsonCandidate of jsonCandidates) {
    try {
      return JSON.parse(jsonCandidate);
    } catch {
      // Try the next candidate, then fall back to the loose parser below.
    }
  }

  const loosePatchResult = parseLooseJsonPatchResult(candidate);
  if (loosePatchResult) return loosePatchResult;

  throw new Error("パッチとして解析できませんでした。ChatGPTまたはGeminiの返答全体を貼り付けてください。");
}

function parseRawPatchResult(raw) {
  const text = stripPatchFence(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text.includes("*** Begin Patch") || !text.includes("*** File:")) return null;

  const lines = text.split("\n");
  const files = [];
  let index = 0;

  const isMarker = (line, marker) => normalizeSpecialSpaces(line).trim() === marker;
  const isFileMarker = (line) => normalizeSpecialSpaces(line).trim().startsWith("*** File:");

  while (index < lines.length) {
    const marker = normalizeSpecialSpaces(lines[index]).trim();

    if (!marker.startsWith("*** File:")) {
      index += 1;
      continue;
    }

    const path = marker.replace(/^\*\*\* File:\s*/, "").trim();
    const edits = [];
    index += 1;

    while (index < lines.length) {
      const current = normalizeSpecialSpaces(lines[index]).trim();

      if (current === "*** End File") {
        index += 1;
        break;
      }

      if (current === "*** End Patch" || current.startsWith("*** File:")) {
        break;
      }

      if (current !== "*** Old") {
        index += 1;
        continue;
      }

      index += 1;
      const oldLines = [];

      while (index < lines.length && !isMarker(lines[index], "*** New")) {
        const maybeMarker = normalizeSpecialSpaces(lines[index]).trim();

        if (maybeMarker === "*** Old" || maybeMarker === "*** End File" || maybeMarker === "*** End Patch" || maybeMarker.startsWith("*** File:")) {
          throw new Error(`${path} の編集ブロック ${edits.length + 1} に *** New がありません。`);
        }

        oldLines.push(lines[index]);
        index += 1;
      }

      if (index >= lines.length || !isMarker(lines[index], "*** New")) {
        throw new Error(`${path} の編集ブロック ${edits.length + 1} に *** New がありません。`);
      }

      index += 1;
      const newLines = [];

      while (index < lines.length) {
        const maybeMarker = normalizeSpecialSpaces(lines[index]).trim();

        if (maybeMarker === "*** Old" || maybeMarker === "*** End File" || maybeMarker === "*** End Patch" || maybeMarker.startsWith("*** File:")) {
          break;
        }

        newLines.push(lines[index]);
        index += 1;
      }

      const oldText = normalizeSpecialSpaces(trimOneTrailingLineBreak(oldLines.join("\n")));
      const newText = normalizeSpecialSpaces(trimOneTrailingLineBreak(newLines.join("\n")));

      if (!oldText) {
        throw new Error(`${path} の編集ブロック ${edits.length + 1} の Old が空です。`);
      }

      edits.push({ old: oldText, new: newText });
    }

    if (edits.length > 0) {
      files.push({ path, edits });
    }
  }

  const rawOldCount = lines.filter((line) => normalizeSpecialSpaces(line).trim() === "*** Old").length;
  const parsedOldCount = files.reduce((sum, file) => sum + file.edits.length, 0);

  if (rawOldCount !== parsedOldCount) {
    throw new Error(`raw patchのOld数と解析数が一致しません。Old数: ${rawOldCount} / 解析: ${parsedOldCount}`);
  }

  return { files, format: "ai-folder-editor-raw-patch-v5", summary: "raw patch" };
}

function stripPatchFence(raw) {
  const fenced = raw.match(/^```(?:aife-patch|patch|diff|text)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : raw;
}

function parseRawPatchEdits(block, path) {
  const edits = [];
  let cursor = 0;

  while (cursor < block.length) {
    const oldMarker = findLineMarker(block, "*** Old", cursor);
    if (oldMarker < 0) break;

    const oldStart = nextLineStart(block, oldMarker);
    const newMarker = findLineMarker(block, "*** New", oldStart);
    if (newMarker < 0) {
      throw new Error(`${path} のraw patchに *** New がありません。`);
    }

    const newStart = nextLineStart(block, newMarker);
    const nextOldMarker = findLineMarker(block, "*** Old", newStart);
    const endFileMarker = findLineMarker(block, "*** End File", newStart);
    const editEndCandidates = [nextOldMarker, endFileMarker].filter((value) => value >= 0);
    const editEnd = editEndCandidates.length ? Math.min(...editEndCandidates) : block.length;

    edits.push({
      old: trimOneTrailingLineBreak(block.slice(oldStart, newMarker)),
      new: trimOneTrailingLineBreak(block.slice(newStart, editEnd)),
    });
    cursor = editEnd;
  }

  return edits;
}

function findLineMarker(text, marker, start) {
  const pattern = new RegExp(`(^|\\n)${escapeRegExp(marker)}(?:\\r?\\n|$)`, "g");
  pattern.lastIndex = start;
  const match = pattern.exec(text);
  return match ? match.index + (match[1] ? 1 : 0) : -1;
}

function nextLineStart(text, markerIndex) {
  const nextNewline = text.indexOf("\n", markerIndex);
  return nextNewline < 0 ? text.length : nextNewline + 1;
}

function trimOneTrailingLineBreak(text) {
  return text.replace(/\r?\n$/, "");
}

function parseLooseJsonPatchResult(source) {
  const files = [];
  let cursor = 0;

  while (cursor < source.length) {
    const pathMatch = findLooseKeyString(source, "path", cursor);
    if (!pathMatch) break;

    const path = decodeLooseJsonString(pathMatch.value);
    const editsStart = source.indexOf('"edits"', pathMatch.end);
    if (editsStart < 0) break;

    const nextPathMatch = findLooseKeyString(source, "path", pathMatch.end);
    const fileEnd = nextPathMatch ? nextPathMatch.start : source.length;
    const edits = [];
    let editCursor = editsStart;

    while (editCursor < fileEnd) {
      const oldMatch = findLooseKeyString(source, "old", editCursor);
      if (!oldMatch || oldMatch.start >= fileEnd) break;
      const newMatch = findLooseKeyString(source, "new", oldMatch.end);
      if (!newMatch || newMatch.start >= fileEnd) {
        throw new Error(`${path} の崩れたJSONパッチに new が見つかりません。`);
      }

      const oldEnd = findLooseOldEnd(source, oldMatch.valueStart, newMatch.start);
      const newEnd = findLooseNewEnd(source, newMatch.valueStart, fileEnd);

      edits.push({
        old: decodeLooseJsonString(source.slice(oldMatch.valueStart, oldEnd)),
        new: decodeLooseJsonString(source.slice(newMatch.valueStart, newEnd.index)),
      });

      editCursor = newEnd.kind === "nextEdit" ? newEnd.index + 1 : fileEnd;
    }

    if (edits.length > 0) files.push({ path, edits });
    cursor = fileEnd;
  }

  return files.length ? { files, format: "ai-folder-editor-loose-json-patch", summary: "loose json patch" } : null;
}

function findLooseKeyString(source, key, start) {
  const pattern = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*"`, "g");
  pattern.lastIndex = start;
  const match = pattern.exec(source);
  if (!match) return null;

  const valueStart = pattern.lastIndex;
  const valueEnd = findLooseSimpleStringEnd(source, valueStart);
  return {
    end: valueEnd + 1,
    start: match.index,
    value: source.slice(valueStart, valueEnd),
    valueStart,
  };
}

function findLooseSimpleStringEnd(source, start) {
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '"' && source[index - 1] !== "\\") return index;
  }
  return source.length;
}

function findLooseOldEnd(source, oldStart, newKeyStart) {
  const between = source.slice(oldStart, newKeyStart);
  const separator = between.match(/"\s*,\s*$/);
  return separator ? oldStart + between.length - separator[0].length : newKeyStart;
}

function findLooseNewEnd(source, start, fileEnd) {
  const patterns = [
    { kind: "nextEdit", pattern: /"\s*\}\s*,\s*\{\s*"old"\s*:\s*"/g },
    { kind: "nextFile", pattern: /"\s*\}\s*\]\s*,\s*\{\s*"path"\s*:\s*"/g },
    { kind: "end", pattern: /"\s*\}\s*\]\s*\}\s*\]\s*\}?/g },
  ];

  let best = null;
  for (const item of patterns) {
    item.pattern.lastIndex = start;
    const match = item.pattern.exec(source);
    if (!match || match.index > fileEnd) continue;
    if (!best || match.index < best.index) {
      best = { index: match.index, kind: item.kind };
    }
  }

  return best || { index: fileEnd, kind: "end" };
}

function decodeLooseJsonString(value) {
  return value.replace(/\\(u[0-9a-fA-F]{4}|["\\/bfnrt])/g, (_, escape) => {
    if (escape === '"') return '"';
    if (escape === "\\") return "\\";
    if (escape === "/") return "/";
    if (escape === "b") return "\b";
    if (escape === "f") return "\f";
    if (escape === "n") return "\n";
    if (escape === "r") return "\r";
    if (escape === "t") return "\t";
    return String.fromCharCode(Number.parseInt(escape.slice(1), 16));
  });
}

function applyPatchEdits(oldContent, edits, path, options = {}) {
  if (!Array.isArray(edits)) {
    throw new Error(`${path} のeditsが配列ではありません。`);
  }

  let content = oldContent;

  edits.forEach((edit, index) => {
    if (!edit || typeof edit !== "object") {
      throw new Error(`${path} のedits[${index}]がオブジェクトではありません。`);
    }

    const oldValue = pickPatchField(edit, ["old", "oldText", "find", "search", "oldLines"]);
    const newValue = pickPatchField(edit, ["new", "newText", "replace", "replacement", "newLines"]);
    let oldText = coerceContent(oldValue);
    let newText = coerceContent(newValue);

    if (oldText !== null) oldText = normalizeSpecialSpaces(oldText);
    if (newText !== null) newText = normalizeSpecialSpaces(newText);

    if (oldText === null) throw new Error(`${path} のedits[${index}].oldが文字列ではありません。`);
    if (newText === null) throw new Error(`${path} のedits[${index}].newが文字列ではありません。`);
    if (Array.isArray(oldValue) && edit.oldFinalNewline === true && !oldText.endsWith("\n")) oldText += "\n";
    if (Array.isArray(newValue) && edit.newFinalNewline === true && !newText.endsWith("\n")) newText += "\n";
    if (oldText.length === 0) throw new Error(`${path} のedits[${index}].oldが空です。`);

    const lineEnding = detectLineEnding(content);
    oldText = alignLineEndings(oldText, lineEnding);
    newText = alignLineEndings(newText, lineEnding);
    content = replacePatchText(content, oldText, newText, edit.occurrence, path, index, options);
  });

  return content;
}

function pickPatchField(source, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key];
    }
  }
  return undefined;
}

function replacePatchText(source, oldText, newText, occurrence, path, editIndex, options = {}) {
  let positions = findAllOccurrences(source, oldText);
  let replacementOldLength = oldText.length;

  if (positions.length === 0) {
    const repairedOldText = normalizeCopiedMarkdownLinks(oldText);
    if (repairedOldText !== oldText) {
      const repairedPositions = findAllOccurrences(source, repairedOldText);
      if (repairedPositions.length > 0) {
        oldText = repairedOldText;
        newText = normalizeCopiedMarkdownLinks(newText);
        positions = repairedPositions;
        replacementOldLength = oldText.length;
      }
    }
  }

  if (positions.length === 0) {
    const flexible = findFlexibleMatch(source, oldText);

    if (flexible) {
      positions = [flexible.position];
      replacementOldLength = flexible.length;
    }
  }

  if (positions.length === 0) {
    throw new Error(
      [
        `${path} のedits[${editIndex}].oldが現在の内容に一致しません。`,
        "Oldの内容:",
        formatErrorSnippet(oldText),
      ].join("\n"),
    );
  }

  let position;

  if (occurrence === undefined || occurrence === null) {
    if (positions.length > 1 && !options.allowFirstWhenMultiple) {
      throw new Error(
        [
          `${path} のedits[${editIndex}].oldが${positions.length}回一致します。`,
          "再度「プロンプトをコピーしてChatGPTを開く」を実行して、一意なOldを含むパッチを生成してください。",
          "Oldの内容:",
          formatErrorSnippet(oldText),
        ].join("\n"),
      );
    }
    position = positions[0];
  } else {
    const occurrenceNumber = Number(occurrence);
    if (!Number.isInteger(occurrenceNumber) || occurrenceNumber < 1) {
      throw new Error(`${path} のedits[${editIndex}].occurrenceは1以上の整数にしてください。`);
    }
    if (occurrenceNumber > positions.length) {
      throw new Error(`${path} のedits[${editIndex}].occurrenceが一致数を超えています。`);
    }
    position = positions[occurrenceNumber - 1];
  }

  return replaceRangeAndNormalizeSpecialSpaces(source, position, replacementOldLength, newText);
}

function findAllOccurrences(source, search) {
  const positions = [];
  let searchIndex = 0;

  while (searchIndex <= source.length) {
    const position = source.indexOf(search, searchIndex);
    if (position < 0) break;
    positions.push(position);
    searchIndex = position + search.length;
  }

  return positions;
}

function normalizeCopiedMarkdownLinks(text) {
  return text.replace(/\[([\s\S]*?)\]\((?:https?:\/\/|mailto:)[^)]+\)/g, "$1");
}

function normalizeSpecialSpaces(text) {
  return String(text).replace(/[\u00a0\u1680\u180e\u2000-\u200b\u202f\u205f\u3000\ufeff]/g, " ");
}

function normalizeResultInputSpecialSpaces() {
  const normalized = normalizeSpecialSpaces(dom.resultInput.value);
  if (normalized === dom.resultInput.value) return;

  const selectionStart = dom.resultInput.selectionStart;
  const selectionEnd = dom.resultInput.selectionEnd;
  dom.resultInput.value = normalized;
  dom.resultInput.setSelectionRange(selectionStart, selectionEnd);
}

function normalizePatchLeadingWhitespace(text) {
  return normalizeSpecialSpaces(text).replace(/(^|\n)([ \t]+)/g, (_, lineStart, indent) => {
    return `${lineStart}${indent.replace(/[^\t]/g, " ")}`;
  });
}

function normalizePatchLooseLine(line) {
  return normalizeSpecialSpaces(line).replace(/[ \t]+$/g, "");
}

function getLineRanges(text) {
  const ranges = [];
  let start = 0;

  for (let index = 0; index <= text.length; index += 1) {
    if (index === text.length || text[index] === "\n") {
      let end = index;
      if (end > start && text[end - 1] === "\r") end -= 1;
      ranges.push({
        end,
        line: text.slice(start, end),
        next: index < text.length ? index + 1 : index,
        start,
      });
      start = index + 1;
    }
  }

  return ranges;
}

function findFlexibleMatch(source, search) {
  const sourceRanges = getLineRanges(source);
  const searchLines = String(search).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const normalizedSearch = searchLines.map(normalizePatchLooseLine).join("\n").trim();

  for (let i = 0; i <= sourceRanges.length - searchLines.length; i += 1) {
    const sourceSlice = sourceRanges.slice(i, i + searchLines.length);
    const normalizedCandidate = sourceSlice.map((item) => normalizePatchLooseLine(item.line)).join("\n").trim();

    if (normalizedCandidate === normalizedSearch) {
      return {
        length: sourceSlice.at(-1).end - sourceSlice[0].start,
        position: sourceSlice[0].start,
      };
    }
  }

  return null;
}

function replaceRangeAndNormalizeSpecialSpaces(source, position, length, replacement) {
  const before = source.slice(0, position);
  const matched = source.slice(position, position + length);
  const after = source.slice(position + length);
  const normalizedReplacement = normalizeSpecialSpaces(replacement);

  if (normalizeSpecialSpaces(matched) === normalizedReplacement) {
    return `${before}${normalizeSpecialSpaces(matched)}${after}`;
  }

  return `${before}${normalizedReplacement}${after}`;
}

function formatErrorSnippet(text) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized.length <= 1200) return normalized;
  return `${normalized.slice(0, 1200)}\n... (${normalized.length - 1200}文字省略)`;
}

function firstErrorLine(message) {
  return String(message).split(/\r?\n/)[0] || "エラーが発生しました。";
}

function renderDiffError(error) {
  hideCenterDiffPreview();
  dom.diffPanel.innerHTML = "";

  const card = document.createElement("article");
  card.className = "diff-card diff-error-card";

  const header = document.createElement("header");
  header.className = "diff-card-header";

  const titleRow = document.createElement("div");
  titleRow.className = "diff-title-row";

  const title = document.createElement("div");
  title.className = "diff-path";
  title.textContent = "反映エラー";

  const status = document.createElement("div");
  status.className = "diff-stats";
  status.textContent = "パッチを反映できませんでした";

  titleRow.append(title, status);

  const body = document.createElement("pre");
  body.className = "diff-error-body";
  body.textContent = error?.message || String(error);

  header.append(titleRow);
  card.append(header, body);
  dom.diffPanel.append(card);
}

function renderDiffPanel(changes) {
  dom.diffPanel.innerHTML = "";
  const pendingChanges = changes.filter((change) => change.status === "pending");

  if (pendingChanges.length === 0) {
    renderDiffEmpty("差分はありません。");
    return;
  }

  if (state.centerPreviewChange && state.centerPreviewChange.status !== "pending") {
    hideCenterDiffPreview();
  }

  const toolbar = document.createElement("div");
  toolbar.className = "diff-toolbar";

  const acceptAll = document.createElement("button");
  acceptAll.className = "primary-button";
  acceptAll.type = "button";
  acceptAll.textContent = "すべて採用";
  acceptAll.addEventListener("click", async () => {
    try {
      for (const change of pendingChanges) {
        if (change.status === "pending") {
          await acceptChange(change);
        }
      }
      renderDiffPanel(changes);
    } catch (error) {
      renderDiffError(error);
      setStatus(firstErrorLine(error.message), true);
    }
  });

  const close = document.createElement("button");
  close.className = "ghost-button";
  close.type = "button";
  close.textContent = "差分を閉じる";
  close.addEventListener("click", renderDiffEmpty);

  toolbar.append(acceptAll, close);
  dom.diffPanel.append(toolbar);

  for (const change of pendingChanges) {
    dom.diffPanel.append(renderChangeCard(change, changes));
  }
}

async function showChangeInCenter(change, allChanges) {
  if (change.status !== "pending") return;

  if (state.activePath !== change.path && state.files.has(change.path)) {
    await openFile(change.path);
  }

  state.centerPreviewChange = change;
  renderCenterDiffPanel(change, allChanges);

  requestAnimationFrame(() => {
    const target = dom.centerDiffPanel.querySelector(".diff-row.added, .diff-row.removed");
    target?.scrollIntoView({ block: "center" });
  });
}

function renderCenterDiffPanel(change, allChanges) {
  dom.centerDiffPanel.innerHTML = "";
  dom.centerDiffPanel.hidden = false;
  dom.editorSurface.hidden = true;

  const toolbar = document.createElement("div");
  toolbar.className = "diff-toolbar center-diff-toolbar";

  const title = document.createElement("div");
  title.className = "diff-path";
  title.textContent = `中央パネル確認: ${change.path}${change.editBlockIndex ? ` / 編集ブロック ${change.editBlockIndex}/${change.editBlockTotal || "?"}` : ""}`;

  const status = document.createElement("div");
  status.className = "diff-stats";
  const diff = buildLineDiff(change.oldContent, change.content);
  status.textContent = `+${diff.added} / -${diff.removed}`;

  const actions = document.createElement("div");
  actions.className = "diff-actions";

  const accept = document.createElement("button");
  accept.className = "choice-button accept";
  accept.type = "button";
  accept.textContent = "反映する";
  accept.addEventListener("click", async () => {
    try {
      await acceptChange(change);
      hideCenterDiffPreview();
      renderDiffPanel(allChanges);
    } catch (error) {
      renderDiffError(error);
      setStatus(firstErrorLine(error.message), true);
    }
  });

  const reject = document.createElement("button");
  reject.className = "choice-button reject";
  reject.type = "button";
  reject.textContent = "反映しない";
  reject.addEventListener("click", () => {
    change.status = "skipped";
    hideCenterDiffPreview();
    renderDiffPanel(allChanges);
  });

  const close = document.createElement("button");
  close.className = "ghost-button";
  close.type = "button";
  close.textContent = "閉じる";
  close.addEventListener("click", hideCenterDiffPreview);

  actions.append(accept, reject, close);
  toolbar.append(title, status, actions);
  dom.centerDiffPanel.append(toolbar);

  const rows = document.createElement("div");
  rows.className = "center-code-diff";

  for (const row of diff.rows) {
    rows.append(renderDiffRow(row));
  }

  dom.centerDiffPanel.append(rows);
}

function hideCenterDiffPreview() {
  state.centerPreviewChange = null;
  dom.centerDiffPanel.innerHTML = "";
  dom.centerDiffPanel.hidden = true;
  dom.editorSurface.hidden = false;
}

function renderChangeCard(change, allChanges) {
  const card = document.createElement("article");
  card.className = `diff-card ${change.status}`;

  const header = document.createElement("header");
  header.className = "diff-card-header";

  const titleRow = document.createElement("div");
  titleRow.className = "diff-title-row";

  const title = document.createElement("div");
  title.className = "diff-path";
  title.textContent = `${change.path}${change.editBlockIndex ? ` / 編集ブロック ${change.editBlockIndex}/${change.editBlockTotal || "?"}` : ""}`;

  const status = document.createElement("div");
  status.className = "diff-stats";
  status.textContent = `${getChangeStatusText(change.status)}${change.editBlockIndex ? ` / 編集ブロック ${change.editBlockIndex}/${change.editBlockTotal || "?"}` : ""}`;

  titleRow.append(title, status);

  const diff = buildLineDiff(change.oldContent, change.content);
  const stats = document.createElement("div");
  stats.className = "diff-stats";
  stats.textContent = `+${diff.added} / -${diff.removed}`;

  const actions = document.createElement("div");
  actions.className = "diff-actions";

  const accept = document.createElement("button");
  accept.className = "choice-button accept";
  accept.type = "button";
  accept.textContent = "提案を採用";
  accept.disabled = change.status !== "pending";
  accept.addEventListener("click", async () => {
    try {
      await acceptChange(change);
      if (state.centerPreviewChange === change) hideCenterDiffPreview();
      renderDiffPanel(allChanges);
    } catch (error) {
      renderDiffError(error);
      setStatus(firstErrorLine(error.message), true);
    }
  });

  const reject = document.createElement("button");
  reject.className = "choice-button reject";
  reject.type = "button";
  reject.textContent = "元のまま";
  reject.disabled = change.status !== "pending";
  reject.addEventListener("click", () => {
    change.status = "skipped";
    if (state.centerPreviewChange === change) hideCenterDiffPreview();
    renderDiffPanel(allChanges);
  });

  const center = document.createElement("button");
  center.className = "choice-button center-check";
  center.type = "button";
  center.textContent = "中央パネルで確認";
  center.disabled = change.status !== "pending";
  center.addEventListener("click", () => {
    showChangeInCenter(change, allChanges);
  });

  actions.append(accept, reject, center);
  header.append(titleRow, stats, actions);

  const rows = document.createElement("div");
  rows.className = "diff-rows";

  for (const row of compactRows(diff.rows)) {
    rows.append(renderDiffRow(row));
  }

  card.append(header, rows);
  return card;
}

function renderDiffRow(row) {
  const line = document.createElement("div");
  line.className = `diff-row ${row.type}`;

  const oldLine = document.createElement("span");
  oldLine.className = "old-line";
  oldLine.textContent = row.oldLine ?? "";

  const newLine = document.createElement("span");
  newLine.className = "new-line";
  newLine.textContent = row.newLine ?? "";

  const code = document.createElement("code");
  code.textContent = row.text;

  line.append(oldLine, newLine, code);
  return line;
}

async function acceptChange(change) {
  const meta = await getOrCreateMeta(change.path);

  let nextContent = change.content;

  if (Array.isArray(change.edits) && change.edits.length > 0) {
    const currentContent = state.activePath === change.path ? dom.editor.value : await getCurrentContent(change.path);
    nextContent = applyPatchEdits(currentContent, change.edits, change.path, { allowFirstWhenMultiple: true });
  }

  meta.content = nextContent;
  meta.loaded = true;
  meta.dirty = true;
  await writeMetaToDisk(meta);

  if (state.activePath === change.path) {
    dom.editor.value = meta.content;
    updateLineNumbers();
  }

  change.status = "applied";
  updateDirtyUi();
  renderTree();
  setStatus(`${change.path}${change.editBlockIndex ? ` の編集ブロック ${change.editBlockIndex}/${change.editBlockTotal || "?"}` : ""} に提案を反映しました。`);
}

async function getCurrentContent(path) {
  if (path === state.activePath) {
    return dom.editor.value;
  }

  const meta = state.files.get(path);
  if (!meta) return "";

  await ensureFileLoaded(meta);
  return meta.content;
}

async function getOrCreateMeta(path) {
  const existing = state.files.get(path);
  if (existing) return existing;

  const handle = await getFileHandleByPath(path, true);
  const meta = {
    content: "",
    dirty: false,
    handle,
    loaded: true,
    name: getBaseName(path),
    path,
    savedContent: "",
    skippedReason: "",
  };
  state.files.set(path, meta);
  await refreshTreeAfterCreate(path);
  return meta;
}

async function refreshTreeAfterCreate(pathToKeepActive) {
  if (!state.rootHandle) return;
  const activePath = state.activePath || pathToKeepActive;
  const previousFiles = new Map(state.files);
  state.files.clear();
  state.fileTree = await scanDirectory(state.rootHandle, "");

  for (const [path, meta] of state.files.entries()) {
    const previous = previousFiles.get(path);
    if (!previous) continue;

    meta.content = previous.content;
    meta.dirty = previous.dirty;
    meta.loaded = previous.loaded;
    meta.savedContent = previous.savedContent;
    meta.skippedReason = previous.skippedReason;
  }

  state.activePath = activePath;
  renderTree();
}

async function getFileHandleByPath(path, create) {
  const segments = path.split("/").filter(Boolean);
  let directory = state.rootHandle;

  for (const segment of segments.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(segment, { create });
  }

  return directory.getFileHandle(segments.at(-1), { create });
}

function buildLineDiff(oldText, newText) {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);

  if (oldLines.length * newLines.length > MAX_DIFF_CELLS || oldLines.length + newLines.length > MAX_DIFF_TOTAL_LINES) {
    return buildCompactWholeFileDiff(oldLines, newLines);
  }

  const width = newLines.length + 1;
  const table = new Uint16Array((oldLines.length + 1) * width);

  for (let i = oldLines.length - 1; i >= 0; i -= 1) {
    for (let j = newLines.length - 1; j >= 0; j -= 1) {
      const index = i * width + j;
      table[index] =
        oldLines[i] === newLines[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const rows = [];
  let i = 0;
  let j = 0;
  let oldLine = 1;
  let newLine = 1;
  let added = 0;
  let removed = 0;

  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      rows.push({ newLine: newLine++, oldLine: oldLine++, text: oldLines[i], type: "context" });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      rows.push({ oldLine: oldLine++, text: oldLines[i], type: "removed" });
      removed += 1;
      i += 1;
    } else {
      rows.push({ newLine: newLine++, text: newLines[j], type: "added" });
      added += 1;
      j += 1;
    }
  }

  while (i < oldLines.length) {
    rows.push({ oldLine: oldLine++, text: oldLines[i], type: "removed" });
    removed += 1;
    i += 1;
  }

  while (j < newLines.length) {
    rows.push({ newLine: newLine++, text: newLines[j], type: "added" });
    added += 1;
    j += 1;
  }

  return { added, removed, rows };
}

function buildCompactWholeFileDiff(oldLines, newLines) {
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix + prefix < oldLines.length &&
    suffix + prefix < newLines.length &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const rows = [];

  for (let i = Math.max(0, prefix - 4); i < prefix; i += 1) {
    rows.push({ newLine: i + 1, oldLine: i + 1, text: oldLines[i], type: "context" });
  }

  if (prefix > 4) {
    rows.unshift({ text: `${prefix - 4} 行の共通部分を省略`, type: "omit" });
  }

  for (let i = prefix; i < oldLines.length - suffix; i += 1) {
    rows.push({ oldLine: i + 1, text: oldLines[i], type: "removed" });
  }

  for (let i = prefix; i < newLines.length - suffix; i += 1) {
    rows.push({ newLine: i + 1, text: newLines[i], type: "added" });
  }

  if (suffix > 4) {
    rows.push({ text: `${suffix - 4} 行の共通部分を省略`, type: "omit" });
  }

  for (let i = Math.max(prefix, oldLines.length - suffix); i < oldLines.length; i += 1) {
    const newLine = newLines.length - oldLines.length + i + 1;
    rows.push({ newLine, oldLine: i + 1, text: oldLines[i], type: "context" });
  }

  return {
    added: Math.max(0, newLines.length - prefix - suffix),
    removed: Math.max(0, oldLines.length - prefix - suffix),
    rows,
  };
}

function compactRows(rows) {
  const result = [];
  let contextRun = [];

  const flushContext = () => {
    if (contextRun.length <= 8) {
      result.push(...contextRun);
    } else {
      result.push(...contextRun.slice(0, 3));
      result.push({ text: `${contextRun.length - 6} 行の共通部分を省略`, type: "omit" });
      result.push(...contextRun.slice(-3));
    }
    contextRun = [];
  };

  for (const row of rows) {
    if (row.type === "context") {
      contextRun.push(row);
    } else {
      flushContext();
      result.push(row);
    }
  }

  flushContext();
  return result;
}

function splitLines(text) {
  if (text === "") return [];
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function syncActiveEditorToCache() {
  if (!state.activePath) return;
  const meta = state.files.get(state.activePath);
  if (!meta) return;
  meta.content = dom.editor.value;
  meta.dirty = meta.content !== meta.savedContent;
}

function updateDirtyUi() {
  const meta = state.files.get(state.activePath);
  const dirty = Boolean(meta?.dirty);
  dom.dirtyBadge.hidden = !dirty;
  dom.saveButton.disabled = !state.activePath || !dirty;
}

function updateLineNumbers() {
  const lines = Math.max(1, dom.editor.value.split(/\r\n|\r|\n/).length);
  dom.lineNumbers.textContent = Array.from({ length: lines }, (_, index) => index + 1).join("\n");
  syncLineNumberScroll();
}

function syncLineNumberScroll() {
  dom.lineNumbers.scrollTop = dom.editor.scrollTop;
}

function setAiPanelOpen(open) {
  dom.aiPanel.hidden = !open;
  dom.appShell.classList.toggle("ai-closed", !open);
  dom.toggleAiButton.setAttribute("aria-expanded", String(open));
  if (open) {
    dom.promptInput.focus();
  }
}

function isAiPanelOpen() {
  return !dom.aiPanel.hidden;
}

function setSidebarOpen(open) {
  dom.appShell.classList.toggle("sidebar-closed", !open);
  dom.toggleSidebarButton.setAttribute("aria-expanded", String(open));
}

function isSidebarOpen() {
  return !dom.appShell.classList.contains("sidebar-closed");
}

function renderDiffEmpty(message = "ChatGPTまたはGeminiの結果を反映すると、ここに差分が表示されます。") {
  dom.diffPanel.innerHTML = "";
  hideCenterDiffPreview();

  const empty = document.createElement("div");
  empty.className = "diff-empty";
  empty.textContent = message;
  dom.diffPanel.append(empty);
}

function setStatus(message, isError = false) {
  dom.statusBar.textContent = message;
  dom.statusBar.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function isLikelyTextFileName(name) {
  const extension = getExtension(name);
  if (BINARY_EXTENSIONS.has(extension)) return false;
  return TEXT_EXTENSIONS.has(extension) || TEXT_FILE_NAMES.has(name) || (!extension && !name.includes("."));
}

function looksUsefulText(content) {
  if (content.includes("\u0000")) return false;
  if (!content) return true;

  const replacementCount = countMatches(content, "\uFFFD");
  if (replacementCount / content.length > 0.01) return false;

  const sample = content.slice(0, 6000);
  let suspiciousControls = 0;

  for (const char of sample) {
    const code = char.charCodeAt(0);
    const allowed = code === 9 || code === 10 || code === 13;
    if (code < 32 && !allowed) suspiciousControls += 1;
  }

  return suspiciousControls / sample.length < 0.004;
}

function countMatches(text, char) {
  let count = 0;
  for (const current of text) {
    if (current === char) count += 1;
  }
  return count;
}

function detectLineEnding(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function alignLineEndings(text, lineEnding) {
  return text.replace(/\r\n|\r|\n/g, lineEnding);
}

function normalizeResultPath(path) {
  if (typeof path !== "string") return "";

  const normalized = path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .join("/");

  if (!normalized || normalized.includes("..") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`安全でないpathです: ${path}`);
  }

  if (!isLikelyTextFileName(getBaseName(normalized))) {
    throw new Error(`テキスト対象外の拡張子です: ${normalized}`);
  }

  return normalized;
}

function coerceContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content) && content.every((line) => typeof line === "string")) {
    return content.join("\n");
  }
  return null;
}

function getChangeStatusText(status) {
  if (status === "applied") return "採用済み";
  if (status === "skipped") return "元のまま";
  return "確認待ち";
}

function getExtension(name) {
  const index = name.lastIndexOf(".");
  if (index <= 0) return "";
  return name.slice(index).toLowerCase();
}

function stripExtension(name) {
  const index = name.lastIndexOf(".");
  if (index <= 0) return name;
  return name.slice(0, index);
}

function getBaseName(path) {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function joinPath(base, name) {
  return base ? `${base}/${name}` : name;
}
