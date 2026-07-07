// ==UserScript==
// @name         Click Guard Confirm
// @namespace    uni928-click-guard
// @version      1.0.0
// @description  意図しない広告・外部リンク・危険操作っぽいクリック前に確認する
// @match        *://*/*
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  const GUARD_STATE = {
    bypassNext: false,
    lastConfirmTime: 0
  };

  const DANGEROUS_WORDS = [
    "購入",
    "注文",
    "決済",
    "支払い",
    "課金",
    "登録",
    "送信",
    "削除",
    "退会",
    "解約",
    "同意",
    "許可",
    "申し込む",
    "今すぐ",
    "ダウンロード",
    "インストール",
    "開く",
    "移動",
    "広告",
    "PR",
    "スポンサー",
    "sponsored",
    "ad",
    "buy",
    "purchase",
    "pay",
    "subscribe",
    "delete",
    "send",
    "submit",
    "install",
    "download",
    "open"
  ];

  const AD_HINTS = [
    "ad",
    "ads",
    "advert",
    "advertisement",
    "sponsor",
    "sponsored",
    "promotion",
    "promoted",
    "pr",
    "banner",
    "affiliate",
    "doubleclick",
    "googlesyndication",
    "adservice",
    "adnxs",
    "outbrain",
    "taboola"
  ];

  function normalizeText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function getClickableElement(start) {
    let el = start;

    while (el && el !== document && el !== document.documentElement) {
      if (
        el.tagName === "A" ||
        el.tagName === "BUTTON" ||
        el.tagName === "INPUT" ||
        el.tagName === "SUMMARY" ||
        el.getAttribute("role") === "button" ||
        el.getAttribute("role") === "link" ||
        typeof el.onclick === "function"
      ) {
        return el;
      }

      el = el.parentElement;
    }

    return null;
  }

  function getElementText(el) {
    if (!el) return "";

    const parts = [];

    parts.push(el.innerText);
    parts.push(el.textContent);
    parts.push(el.getAttribute("aria-label"));
    parts.push(el.getAttribute("title"));
    parts.push(el.getAttribute("alt"));
    parts.push(el.getAttribute("value"));
    parts.push(el.getAttribute("name"));
    parts.push(el.getAttribute("id"));
    parts.push(el.className);

    return normalizeText(parts.filter(Boolean).join(" "));
  }

  function getUrlFromElement(el) {
    if (!el) return "";

    const link = el.closest && el.closest("a[href]");
    if (link) return link.href || "";

    const form = el.closest && el.closest("form[action]");
    if (form) {
      try {
        return new URL(form.getAttribute("action"), location.href).href;
      } catch (e) {
        return form.getAttribute("action") || "";
      }
    }

    return "";
  }

  function isExternalUrl(url) {
    if (!url) return false;

    try {
      const u = new URL(url, location.href);
      return u.hostname !== location.hostname;
    } catch (e) {
      return false;
    }
  }

  function hasAdHint(el, url, text) {
    const joined = normalizeText([
      text,
      url,
      el && el.id,
      el && el.className,
      el && el.getAttribute && el.getAttribute("data-ad"),
      el && el.getAttribute && el.getAttribute("data-testid"),
      el && el.getAttribute && el.getAttribute("aria-label")
    ].filter(Boolean).join(" "));

    return AD_HINTS.some(word => joined.includes(word));
  }

  function hasDangerousWord(text) {
    return DANGEROUS_WORDS.some(word => {
      return text.includes(String(word).toLowerCase());
    });
  }

  function isLikelySubmitOrAction(el) {
    if (!el) return false;

    const tag = el.tagName;

    if (tag === "BUTTON") return true;

    if (tag === "INPUT") {
      const type = normalizeText(el.getAttribute("type"));
      return ["submit", "button", "image"].includes(type);
    }

    if (el.getAttribute("role") === "button") return true;

    return false;
  }

  function buildReason(el) {
    const text = getElementText(el);
    const url = getUrlFromElement(el);

    const reasons = [];

    if (hasAdHint(el, url, text)) {
      reasons.push("広告・PR・スポンサー枠の可能性があります。");
    }

    if (url && isExternalUrl(url)) {
      reasons.push("現在のサイトとは別のサイトへ移動する可能性があります。");
    }

    if (hasDangerousWord(text)) {
      reasons.push("購入・送信・登録・削除・ダウンロードなどの操作に見える文言があります。");
    }

    if (isLikelySubmitOrAction(el)) {
      reasons.push("ボタン操作により、入力内容の送信や画面変更が起こる可能性があります。");
    }

    if (!reasons.length) {
      return null;
    }

    return {
      text,
      url,
      reasons
    };
  }

  function shorten(value, max) {
    value = String(value || "").trim();
    if (value.length <= max) return value;
    return value.slice(0, max) + "…";
  }

  function showConfirm(info) {
    const lines = [];

    lines.push("この操作を実行しますか？");
    lines.push("");
    lines.push("起こりそうなこと:");

    info.reasons.forEach(reason => {
      lines.push("・" + reason);
    });

    if (info.url) {
      lines.push("");
      lines.push("移動先:");
      lines.push(shorten(info.url, 120));
    }

    if (info.text) {
      lines.push("");
      lines.push("押された要素:");
      lines.push(shorten(info.text, 120));
    }

    lines.push("");
    lines.push("Yes / OK を押すと実行します。");
    lines.push("キャンセルすると何もしません。");

    return window.confirm(lines.join("\n"));
  }

  function replayClick(el) {
    GUARD_STATE.bypassNext = true;

    setTimeout(() => {
      try {
        el.click();
      } catch (e) {
        const url = getUrlFromElement(el);
        if (url) {
          location.href = url;
        }
      }

      setTimeout(() => {
        GUARD_STATE.bypassNext = false;
      }, 300);
    }, 0);
  }

  function handleClick(event) {
    if (GUARD_STATE.bypassNext) return;

    const el = getClickableElement(event.target);
    if (!el) return;

    const info = buildReason(el);
    if (!info) return;

    const now = Date.now();

    // 連続クリック時の多重確認を少し抑制
    if (now - GUARD_STATE.lastConfirmTime < 300) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }

    GUARD_STATE.lastConfirmTime = now;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const ok = showConfirm(info);

    if (ok) {
      replayClick(el);
    }
  }

  function handleSubmit(event) {
    if (GUARD_STATE.bypassNext) return;

    const form = event.target;
    if (!form || form.tagName !== "FORM") return;

    const url = form.action || "";
    const info = {
      text: "フォーム送信",
      url,
      reasons: [
        "フォーム送信により、入力内容が送信される可能性があります。"
      ]
    };

    if (url && isExternalUrl(url)) {
      info.reasons.push("現在のサイトとは別のサイトへ送信される可能性があります。");
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const ok = showConfirm(info);

    if (ok) {
      GUARD_STATE.bypassNext = true;
      setTimeout(() => {
        try {
          form.submit();
        } finally {
          setTimeout(() => {
            GUARD_STATE.bypassNext = false;
          }, 300);
        }
      }, 0);
    }
  }

  document.addEventListener("click", handleClick, true);
  document.addEventListener("submit", handleSubmit, true);

})();
