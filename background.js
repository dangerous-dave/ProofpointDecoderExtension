"use strict";

/* Right-click context menu */
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "decode-pp-url",
    title: "Decode Proofpoint URL → Clipboard",
    contexts: ["link", "selection", "page"]
  });
});

/* In-page notification when right-click copying */
function copyAndToastAt(text, hint) {
  function findAnchorRect(linkUrl) {
    if (!linkUrl) return null;
    const norm = s => {
      try { s = decodeURIComponent(s); } catch {}
      return String(s).trim();
    };
    const target = norm(linkUrl);
    let best = null;
    for (const a of document.querySelectorAll("a[href]")) {
      const hrefAbs = a.href || "";
      const hrefRaw = a.getAttribute("href") || "";
      if (norm(hrefAbs) === target || norm(hrefRaw) === target) {
        const r = a.getBoundingClientRect();
        if (r && r.width && r.height) { best = r; break; }
      }
    }
    return best;
  }

  function findSelectionRect() {
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    try {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r && (r.width || r.height)) return r;
      const n = sel.focusNode && sel.focusNode.nodeType === 3 ? sel.focusNode.parentElement : sel.focusNode;
      if (n && n.getBoundingClientRect) return n.getBoundingClientRect();
    } catch {}
    return null;
  }

  function placeToast(msg, rect) {
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "absolute",
      zIndex: 2147483647,
      background: "rgba(20,20,20,0.95)",
      color: "#e6e6e6",
      border: "5px solid rgba(0,255,0,.8)",
      borderRadius: "8px",
      padding: "8px 12px",
      font: "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
      transition: "opacity .2s ease, transform .2s ease",
      opacity: "1",
      transform: "translateY(0)",
      pointerEvents: "none",
      maxWidth: "60vw",
      whiteSpace: "nowrap"
    });
    el.textContent = msg;

    const root = document.documentElement;
    const body = document.body || root;
    body.appendChild(el);

    const pageX = window.scrollX;
    const pageY = window.scrollY;
    let x, y;

    if (rect) {
      const preferredX = rect.left + pageX;
      const preferredY = rect.bottom + pageY + 8;
      const maxX = pageX + document.documentElement.clientWidth - 12;
      x = Math.min(preferredX, maxX - 240);
      y = preferredY;
    } else {
      // Fallback: bottom-right
      x = pageX + document.documentElement.clientWidth - 12 - 240;
      y = pageY + document.documentElement.clientHeight - 12 - 40;
    }

    el.style.left = `${Math.max(x, pageX + 12)}px`;
    el.style.top = `${Math.max(y, pageY + 12)}px`;

    setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(6px)"; }, 1800);
    setTimeout(() => { el.remove(); }, 2000);
  }

  const rect =
    (hint && hint.selectionText ? findSelectionRect() : null) ||
    (hint && hint.linkUrl ? findAnchorRect(hint.linkUrl) : null) ||
    null;

  navigator.clipboard.writeText(text)
    .then(() => placeToast("Copied decoded URL", rect))
    .catch(() => placeToast("Copy failed", rect));
}

function toastAtFailure(msg, hint) {
  const rect =
    (hint && hint.selectionText ? (() => {
      try {
        const sel = window.getSelection && window.getSelection();
        if (sel && sel.rangeCount) return sel.getRangeAt(0).getBoundingClientRect();
      } catch {}
      return null;
    })() : null) ||
    (hint && hint.linkUrl ? (() => {
      for (const a of document.querySelectorAll("a[href]")) {
        if (a.href === hint.linkUrl || a.getAttribute("href") === hint.linkUrl) {
          return a.getBoundingClientRect();
        }
      }
      return null;
    })() : null) ||
    null;

  const el = document.createElement("div");
  Object.assign(el.style, {
    position: "absolute",
    zIndex: 2147483647,
    background: "rgba(120,20,20,0.95)",
    color: "#ffe",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: "8px",
    padding: "8px 12px",
    font: "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
    transition: "opacity .2s ease, transform .2s ease",
    opacity: "1",
    transform: "translateY(0)",
    pointerEvents: "none",
    whiteSpace: "nowrap"
  });
  el.textContent = msg;

  const pageX = window.scrollX, pageY = window.scrollY;
  let x, y;
  if (rect) {
    x = rect.left + pageX;
    y = rect.bottom + pageY + 8;
  } else {
    x = pageX + document.documentElement.clientWidth - 252;
    y = pageY + document.documentElement.clientHeight - 52;
  }
  el.style.left = `${Math.max(x, pageX + 12)}px`;
  el.style.top = `${Math.max(y, pageY + 12)}px`;

  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(6px)"; }, 1800);
  setTimeout(() => { el.remove(); }, 2000);
}

/* Decoder */
function decodeProofpoint(input) {
  if (!input) throw new Error("No input");
  const clean = input.trim().replace(/^["'<(]+/, "").replace(/[)">.\]}]+$/, "");

  const m = /https:\/\/urldefense(?:\.proofpoint)?\.com\/(v[0-9])\//.exec(clean);
  if (!m) throw new Error("Not a URL Defense URL");
  const v = m[1];

  const htmlUnescape = s =>
    s
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#(\d+);/g,  (_, d) => String.fromCharCode(parseInt(d, 10)));

  if (v === "v1") {
    const mm = /u=(.+?)&k=/.exec(clean);
    if (!mm) throw new Error("Parse error v1");
    return htmlUnescape(decodeURIComponent(mm[1]));
  }

  if (v === "v2") {
    const mm = /u=(.+?)&[dc]=/.exec(clean);
    if (!mm) throw new Error("Parse error v2");
    const trans = mm[1].replace(/-/g, "%").replace(/_/g, "/");
    return htmlUnescape(decodeURIComponent(trans));
  }

  if (v === "v3") {
    const key = "/v3/__";
    const i0 = clean.indexOf(key);
    if (i0 < 0) throw new Error("Parse error v3 A");
    const i1 = clean.indexOf("__;", i0 + key.length);
    if (i1 < 0) throw new Error("Parse error v3 B");
    const i2 = clean.indexOf("!", i1 + 3);
    if (i2 < 0) throw new Error("Parse error v3 C");

    let urlPart = clean.slice(i0 + key.length, i1);
    let encBytes = clean.slice(i1 + 3, i2);

    try { encBytes = decodeURIComponent(encBytes); } catch {}

    const ss = /^([a-z0-9+.-]+:\/)([^/].+)/i.exec(urlPart);
    if (ss && ss.length === 3) urlPart = ss[1] + "/" + ss[2];

    const encodedUrl = decodeURIComponent(urlPart);

    const base64UrlToUtf8 = b64u => {
      const cleaned = b64u.replace(/[^A-Za-z0-9\-_]/g, "");
      const b64 = cleaned.replace(/-/g, "+").replace(/_/g, "/");
      const pad = b64.length % 4 ? 4 - (b64.length % 4) : 0;
      const bin = atob(b64 + "=".repeat(pad));
      const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    };

    const dec_bytes = base64UrlToUtf8(encBytes);
    let marker = 0;

    const runMap = (() => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
      const map = {}; let len = 2;
      for (const ch of chars) map[ch] = len++;
      return map;
    })();

    const out = encodedUrl.replace(/\*(\*.)?/g, token => {
      if (token === "*") return dec_bytes[marker++] || "";
      if (token.startsWith("**")) {
        const key2 = token[token.length - 1];
        const runLen = runMap[key2];
        const run = dec_bytes.slice(marker, marker + runLen);
        marker += runLen;
        return run;
      }
      return token;
    });

    return out;
  }

  throw new Error("Unknown version");
}

/* Context-menu handler */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "decode-pp-url") return;
  const candidate = (info.linkUrl || info.selectionText || "").trim();
  const hint = { linkUrl: info.linkUrl || null, selectionText: info.selectionText || null };

  try {
    const decoded = decodeProofpoint(candidate);
    await chrome.storage.session.set({ lastDecoded: decoded, lastSource: candidate, lastError: null });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: copyAndToastAt,
      args: [decoded, hint]
    });
  } catch (e) {
    await chrome.storage.session.set({ lastError: String(e.message || e), lastSource: candidate });
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: toastAtFailure,
        args: ["Decode failed, see menu", hint]
      });
    } catch {}
  }
});

/* Expose decoder to popup */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "decode") {
    try { sendResponse({ ok: true, decoded: decodeProofpoint(msg.payload || "") }); }
    catch (e) { sendResponse({ ok: false, error: String(e.message || e) }); }
  }
  return true;
});
