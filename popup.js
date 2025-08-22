"use strict";

const $ = s => document.querySelector(s);
const input = $("#input");
const output = $("#output");
const statusEl = $("#status");
const resultsEl = $("#results");
const countEl = $("#count");
const themeBtn = $("#themeBtn");

const setStatus = t => statusEl.textContent = t || "";

/* Theme handling with persistence */
const THEME_KEY = "theme"; // "dark" or "light"

function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.body.classList.remove("theme-dark", "theme-light");
  document.body.classList.add(`theme-${t}`);
  // Show target theme icon
  themeBtn.textContent = t === "light" ? "🌑" : "☀️";
  themeBtn.setAttribute("aria-label", `Switch to ${t === "light" ? "dark" : "light"} theme`);
}

async function loadTheme() {
  const obj = await chrome.storage.local.get(THEME_KEY);
  applyTheme(obj[THEME_KEY] || "dark");
}
async function toggleTheme() {
  const isLight = document.body.classList.contains("theme-light");
  const next = isLight ? "dark" : "light";
  applyTheme(next);
  await chrome.storage.local.set({ [THEME_KEY]: next });
}
themeBtn.addEventListener("click", toggleTheme);

/* Decode helper */
async function decodeOne(str) {
  const res = await chrome.runtime.sendMessage({ type: "decode", payload: str });
  if (res?.ok) return { ok: true, decoded: res.decoded };
  return { ok: false, error: res?.error || "unknown" };
}

/* Manual decode */
$("#decodeBtn").addEventListener("click", async () => {
  setStatus("");
  const s = input.value.trim();
  if (!s) return;
  const r = await decodeOne(s);
  if (r.ok) { output.value = r.decoded; setStatus("Decoded"); }
  else { output.value = ""; setStatus("Error: " + r.error); }
});
$("#copySingleBtn").addEventListener("click", async () => {
  if (!output.value) return;
  await navigator.clipboard.writeText(output.value);
  setStatus("Copied");
});

/* Scan page for encoded URLs */
$("#scanBtn").addEventListener("click", async () => {
  setStatus("Scanning…");
  resultsEl.innerHTML = "";
  countEl.textContent = "0 found";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { setStatus("No active tab"); return; }

  const [{ result: found = [] } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const re = /https:\/\/urldefense(?:\.proofpoint)?\.com\/v[0-9]\/[^\s"'<>)]*/ig;
      const set = new Set();

      for (const a of document.querySelectorAll("a[href]")) {
        const href = a.getAttribute("href");
        if (href && re.test(href)) set.add(href);
        re.lastIndex = 0;
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n, cap = 0;
      while ((n = walker.nextNode()) && cap < 50000) {
        const t = n.nodeValue;
        if (t && t.length < 5000) {
          let m; re.lastIndex = 0;
          while ((m = re.exec(t)) !== null) set.add(m[0]);
        }
        cap += t ? t.length : 0;
      }
      return Array.from(set).slice(0, 200);
    }
  });

  if (!found.length) { setStatus("No encoded URLs found"); return; }
  countEl.textContent = `${found.length} found`;

  for (const enc of found) {
    const row = document.createElement("div");
    row.className = "item";

    const encLbl = document.createElement("div");
    encLbl.className = "label";
    encLbl.textContent = "Encoded";

    const encTxt = document.createElement("div");
    encTxt.className = "mono truncate-3";
    encTxt.textContent = enc;

    const spacer = document.createElement("div");
    spacer.className = "spacer-line";

    const decLbl = document.createElement("div");
    decLbl.className = "label";
    decLbl.textContent = "Decoded";

    const decTxt = document.createElement("div");
    decTxt.className = "mono truncate-2 decoded-text";
    decTxt.textContent = "…";

    const actions = document.createElement("div");
    actions.className = "actions";
    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy decoded";
    copyBtn.disabled = true;
    actions.appendChild(copyBtn);

    row.appendChild(encLbl);
    row.appendChild(encTxt);
    row.appendChild(spacer);
    row.appendChild(decLbl);
    row.appendChild(decTxt);
    row.appendChild(actions);
    resultsEl.appendChild(row);

    try {
      const r = await decodeOne(enc);
      if (r.ok) {
        decTxt.textContent = r.decoded;
        copyBtn.disabled = false;
        copyBtn.addEventListener("click", async () => {
          await navigator.clipboard.writeText(r.decoded);
          setStatus("Copied");
        });
      } else {
        decTxt.textContent = "[error] " + r.error;
      }
    } catch (e) {
      decTxt.textContent = "[error] " + String(e);
    }
  }

  setStatus("Scan complete");
});

/* Init */
(async () => {
  await loadTheme();
  const { lastDecoded, lastSource, lastError } = await chrome.storage.session.get([
    "lastDecoded", "lastSource", "lastError"
  ]);
  if (lastSource) input.value = lastSource;
  if (lastDecoded) output.value = lastDecoded;
  if (lastError) setStatus("Last error: " + lastError);
})();
