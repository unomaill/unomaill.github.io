import { firebaseApp } from "./firebase-config.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

// Change this to your deployed Worker URL.
const WORKER_URL = "https://REPLACE_WITH_YOUR_WORKER.workers.dev";

const auth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();

/* ------------------------------ DOM refs -------------------------------- */

const loginScreen = document.getElementById("login-screen");
const usernameScreen = document.getElementById("username-screen");
const appScreen = document.getElementById("app-screen");
const contentEl = document.getElementById("content");
const globalSpinner = document.getElementById("global-spinner");

const usernameInput = document.getElementById("username-input");
const usernameStatus = document.getElementById("username-status");
const claimBtn = document.getElementById("claim-btn");

const searchInput = document.getElementById("search-input");
const avatarBtn = document.getElementById("avatar-btn");
const drawer = document.getElementById("drawer");
const drawerOverlay = document.getElementById("drawer-overlay");
const drawerAvatar = document.getElementById("drawer-avatar");
const drawerName = document.getElementById("drawer-name");
const drawerAlias = document.getElementById("drawer-alias");
const countInboxEl = document.getElementById("count-inbox");

const settingsModal = document.getElementById("settings-modal");
const senderNameInput = document.getElementById("sender-name-input");
const senderNameStatus = document.getElementById("sender-name-status");

/* -------------------------------- state ----------------------------------- */

let currentAlias = "";
let currentSenderName = "";
let displayNameOfUser = "";
let inboxCache = null; // raw messages array from /api/inbox (all folders)
let sentCache = null; // raw messages array from /api/sent
let searchQuery = "";

/* -------------------------------- auth ----------------------------------- */

document.getElementById("google-signin-btn").addEventListener("click", async () => {
  await signInWithPopup(auth, provider);
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showScreen(loginScreen);
    return;
  }
  displayNameOfUser = user.displayName || user.email || "";

  withSpinner(async () => {
    const res = await authedFetch("/api/register", { method: "POST", body: "{}" });
    const data = await res.json();

    if (res.status === 400 || !data.alias) {
      showScreen(usernameScreen);
      return;
    }

    currentAlias = data.alias;
    currentSenderName = data.senderName || "";
    senderNameInput.value = currentSenderName;
    setupAppShell();
    showScreen(appScreen);
    render();
  });
});

function showScreen(screen) {
  [loginScreen, usernameScreen, appScreen].forEach((s) => s.classList.add("hidden"));
  screen.classList.remove("hidden");
}

async function authedFetch(path, options = {}) {
  const idToken = await auth.currentUser.getIdToken();
  return fetch(`${WORKER_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      Authorization: `Bearer ${idToken}`,
    },
  });
}

function withSpinner(fn) {
  globalSpinner.classList.remove("hidden");
  return Promise.resolve(fn()).finally(() => globalSpinner.classList.add("hidden"));
}

/* --------------------------- username claim ------------------------------ */

let usernameCheckTimer = null;

usernameInput.addEventListener("input", () => {
  const name = usernameInput.value.trim().toLowerCase();
  claimBtn.disabled = true;
  usernameStatus.textContent = "";
  usernameStatus.className = "status-text";
  if (!name) return;
  clearTimeout(usernameCheckTimer);
  usernameCheckTimer = setTimeout(() => checkUsername(name), 400);
});

async function checkUsername(name) {
  usernameStatus.textContent = "Checking...";
  const res = await fetch(`${WORKER_URL}/api/check-username?name=${encodeURIComponent(name)}`);
  const data = await res.json();
  if (data.available) {
    usernameStatus.textContent = `${name}@uno.pro.bd is available`;
    usernameStatus.className = "status-text success";
    claimBtn.disabled = false;
  } else {
    usernameStatus.textContent = data.reason || "Not available";
    usernameStatus.className = "status-text error";
    claimBtn.disabled = true;
  }
}

claimBtn.addEventListener("click", async () => {
  const username = usernameInput.value.trim().toLowerCase();
  claimBtn.disabled = true;
  usernameStatus.textContent = "Claiming...";

  const res = await authedFetch("/api/register", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
  const data = await res.json();

  if (!res.ok) {
    usernameStatus.textContent = data.error || "Failed to claim username";
    usernameStatus.className = "status-text error";
    claimBtn.disabled = false;
    return;
  }

  currentAlias = data.alias;
  currentSenderName = data.senderName || "";
  senderNameInput.value = currentSenderName;
  setupAppShell();
  showScreen(appScreen);
  navigate({ view: "inbox" }, { replace: true });
});

/* ------------------------------- app shell -------------------------------- */

function setupAppShell() {
  const initial = initials(displayNameOfUser || currentAlias);
  avatarBtn.textContent = initial;
  drawerAvatar.textContent = initial;
  drawerName.textContent = displayNameOfUser;
  drawerAlias.textContent = currentAlias;
}

function initials(name) {
  return (name || "?").trim().charAt(0).toUpperCase();
}

document.getElementById("menu-btn").addEventListener("click", openDrawer);
avatarBtn.addEventListener("click", openDrawer);
drawerOverlay.addEventListener("click", closeDrawer);

function openDrawer() {
  drawer.classList.add("open");
  drawerOverlay.classList.remove("hidden");
}
function closeDrawer() {
  drawer.classList.remove("open");
  drawerOverlay.classList.add("hidden");
}

drawer.querySelectorAll("[data-nav]").forEach((btn) => {
  btn.addEventListener("click", () => {
    closeDrawer();
    navigate({ view: btn.dataset.nav });
  });
});
drawer.querySelector('[data-action="settings"]').addEventListener("click", () => {
  closeDrawer();
  settingsModal.classList.remove("hidden");
});
drawer.querySelector('[data-action="signout"]').addEventListener("click", () => signOut(auth));

document.querySelectorAll("[data-close-settings]").forEach((el) =>
  el.addEventListener("click", () => settingsModal.classList.add("hidden"))
);
document.getElementById("save-sender-name-btn").addEventListener("click", async () => {
  const senderName = senderNameInput.value.trim();
  senderNameStatus.textContent = "Saving...";
  const res = await authedFetch("/api/profile", {
    method: "POST",
    body: JSON.stringify({ senderName }),
  });
  const data = await res.json();
  if (res.ok) {
    currentSenderName = data.senderName || "";
    senderNameStatus.textContent = "Saved.";
    senderNameStatus.className = "status-text success";
  } else {
    senderNameStatus.textContent = data.error || "Failed to save";
    senderNameStatus.className = "status-text error";
  }
});

document.getElementById("fab-compose").addEventListener("click", () => navigate({ compose: "new" }));

let searchDebounce = null;
searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    searchQuery = searchInput.value.trim().toLowerCase();
    render();
  }, 150);
});

/* -------------------------------- routing ---------------------------------- */

function navigate(params, { replace = false } = {}) {
  const url = new URL(window.location.href);
  url.search = "";
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  if (replace) history.replaceState({}, "", url);
  else history.pushState({}, "", url);
  render();
}

window.addEventListener("popstate", render);

function currentParams() {
  return new URLSearchParams(window.location.search);
}

async function render() {
  if (appScreen.classList.contains("hidden")) return; // not logged in yet
  const params = currentParams();

  if (params.get("compose")) {
    await renderCompose(params);
    return;
  }
  if (params.get("email")) {
    await renderDetail(params);
    return;
  }
  const view = params.get("view") || "inbox";
  await renderList(view);
}

/* ------------------------------ token helper -------------------------------- */

function makeToken(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/* -------------------------------- data loading ------------------------------- */

async function ensureInboxLoaded(force = false) {
  if (inboxCache && !force) return inboxCache;
  const res = await authedFetch("/api/inbox");
  const data = await res.json();
  inboxCache = data.messages || [];
  return inboxCache;
}

async function ensureSentLoaded(force = false) {
  if (sentCache && !force) return sentCache;
  const res = await authedFetch("/api/sent");
  const data = await res.json();
  sentCache = data.messages || [];
  return sentCache;
}

function unreadInboxCount() {
  if (!inboxCache) return 0;
  return inboxCache.filter((m) => m.folder === "inbox" && !m.read).length;
}

/* ----------------------------------- list view -------------------------------- */

const FOLDER_META = {
  inbox: { title: "Inbox", emptyEmoji: "\u{1F4EC}", emptyText: "Your inbox is empty" },
  archive: { title: "Archive", emptyEmoji: "\u{1F5C4}\uFE0F", emptyText: "Nothing archived yet" },
  trash: { title: "Trash", emptyEmoji: "\u{1F5D1}\uFE0F", emptyText: "Trash is empty" },
  sent: { title: "Sent", emptyEmoji: "\u{1F4E4}", emptyText: "No sent messages yet" },
};

async function renderList(view) {
  highlightDrawer(view);
  contentEl.innerHTML = `
    <div class="folder-title">${FOLDER_META[view].title}</div>
    <div id="list-slot">${skeletonHtml()}</div>
  `;

  const isSent = view === "sent";
  const all = isSent ? await ensureSentLoaded() : await ensureInboxLoaded();
  countInboxEl.textContent = unreadInboxCount() || "";

  let items = isSent ? all : all.filter((m) => m.folder === view);

  if (searchQuery) {
    items = items.filter((m) => {
      const hay = `${m.from || ""} ${m.to || ""} ${m.subject || ""} ${m.text || stripHtml(m.html || "")}`.toLowerCase();
      return hay.includes(searchQuery);
    });
  }

  items.sort((a, b) => new Date(b.receivedAt || b.sentAt) - new Date(a.receivedAt || a.sentAt));

  const slot = document.getElementById("list-slot");
  if (items.length === 0) {
    slot.innerHTML = `<div class="empty-state"><div class="emoji">${FOLDER_META[view].emptyEmoji}</div>${FOLDER_META[view].emptyText}</div>`;
    return;
  }

  slot.innerHTML = items.map((m) => messageCardHtml(m, view)).join("");

  slot.querySelectorAll(".message-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".msg-actions")) return;
      const id = card.dataset.id;
      navigate({ view, email: id, token: makeToken(id), folder: view });
    });
  });

  slot.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await handleAction(btn.dataset.act, btn.dataset.id, view);
    });
  });
}

function highlightDrawer(view) {
  drawer.querySelectorAll("[data-nav]").forEach((b) => b.classList.toggle("active", b.dataset.nav === view));
}

function messageCardHtml(m, view) {
  const isSent = view === "sent";
  const person = isSent ? m.to : m.from;
  const unread = !isSent && view === "inbox" && !m.read;
  const time = formatTime(m.receivedAt || m.sentAt);
  const snip = escapeHtml(snippet(m));

  let actions = "";
  if (view === "inbox") {
    actions = `
      <button class="chip-btn" data-act="archive" data-id="${m.id}">Archive</button>
      <button class="chip-btn danger" data-act="trash" data-id="${m.id}">Trash</button>`;
  } else if (view === "archive") {
    actions = `
      <button class="chip-btn success" data-act="restore" data-id="${m.id}">Unarchive</button>
      <button class="chip-btn danger" data-act="trash" data-id="${m.id}">Trash</button>`;
  } else if (view === "trash") {
    actions = `
      <button class="chip-btn success" data-act="restore" data-id="${m.id}">Restore</button>
      <button class="chip-btn danger" data-act="delete" data-id="${m.id}">Delete forever</button>`;
  }

  return `
    <div class="message-card ${unread ? "unread" : ""}" data-id="${m.id}">
      <div class="msg-avatar">${escapeHtml(initials(displayName(person)))}</div>
      <div class="msg-body">
        <div class="msg-top-row">
          <div class="msg-from">${isSent ? "To: " : ""}${escapeHtml(displayName(person))}</div>
          <div class="msg-time">${time}</div>
        </div>
        <div class="msg-subject">${escapeHtml(m.subject || "(no subject)")}</div>
        <div class="msg-snippet">${snip}</div>
        ${actions ? `<div class="msg-actions">${actions}</div>` : ""}
      </div>
    </div>`;
}

async function handleAction(act, id, view) {
  if (act === "archive") await updateMessage(id, { folder: "archive" });
  if (act === "trash") await updateMessage(id, { folder: "trash" });
  if (act === "restore") await updateMessage(id, { folder: "inbox" });
  if (act === "delete") {
    if (!confirm("Permanently delete this message?")) return;
    await deleteMessageForever(id);
  }
  await renderList(view);
}

async function updateMessage(id, changes) {
  await authedFetch("/api/message/update", { method: "POST", body: JSON.stringify({ id, ...changes }) });
  applyLocalChange(id, changes);
}

async function deleteMessageForever(id) {
  await authedFetch("/api/message/delete", { method: "POST", body: JSON.stringify({ id }) });
  if (inboxCache) inboxCache = inboxCache.filter((m) => m.id !== id);
}

function applyLocalChange(id, changes) {
  if (!inboxCache) return;
  const m = inboxCache.find((x) => x.id === id);
  if (m) Object.assign(m, changes);
}

function skeletonHtml() {
  return Array.from({ length: 4 })
    .map(
      () => `
    <div class="skeleton">
      <div class="skel-block skel-avatar"></div>
      <div class="skel-lines"><div style="width:40%"></div><div style="width:80%"></div><div style="width:60%"></div></div>
    </div>`
    )
    .join("");
}

/* ---------------------------------- detail view -------------------------------- */

async function renderDetail(params) {
  const id = params.get("email");
  const token = params.get("token");
  const folder = params.get("folder") || "inbox";

  contentEl.innerHTML = `<div class="detail-header"><button class="icon-btn" id="back-btn">&larr;</button><h2>Message</h2></div>${skeletonHtml()}`;
  document.getElementById("back-btn").addEventListener("click", () => navigate({ view: folder }));

  const isSent = folder === "sent";
  const all = isSent ? await ensureSentLoaded() : await ensureInboxLoaded();
  const message = all.find((m) => m.id === id);

  if (!message || makeToken(id) !== token) {
    contentEl.innerHTML = `<div class="empty-state"><div class="emoji">\u{1F937}</div>Message not found.</div>`;
    return;
  }

  if (!isSent && !message.read) {
    updateMessage(id, { read: true });
  }

  const person = isSent ? message.to : message.from;
  const bodyHtml =
    message.html ||
    `<pre style="white-space:pre-wrap;font-family:inherit;margin:0;">${escapeHtml(message.text || "")}</pre>`;

  let toolbar = "";
  if (folder === "inbox") {
    toolbar = `
      <button class="chip-btn" data-act="archive">Archive</button>
      <button class="chip-btn danger" data-act="trash">Trash</button>`;
  } else if (folder === "archive") {
    toolbar = `
      <button class="chip-btn success" data-act="restore">Unarchive</button>
      <button class="chip-btn danger" data-act="trash">Trash</button>`;
  } else if (folder === "trash") {
    toolbar = `
      <button class="chip-btn success" data-act="restore">Restore</button>
      <button class="chip-btn danger" data-act="delete">Delete forever</button>`;
  }

  contentEl.innerHTML = `
    <div class="detail-header"><button class="icon-btn" id="back-btn">&larr;</button><h2>${FOLDER_META[folder].title}</h2></div>
    <div class="detail-card">
      <div class="detail-subject">${escapeHtml(message.subject || "(no subject)")}</div>
      <div class="detail-meta-row"><div class="msg-avatar">${escapeHtml(initials(displayName(person)))}</div>
        <div class="detail-meta-text">
          <div><span class="label">${isSent ? "To:" : "From:"}</span>${escapeHtml(person || "")}</div>
          <div><span class="label">Date:</span>${formatDate(message.receivedAt || message.sentAt)}</div>
        </div>
      </div>
      <div class="detail-toolbar">${toolbar}${!isSent ? `<button class="btn btn-primary" id="reply-btn" style="padding:8px 16px;">Reply</button>` : ""}</div>
      <iframe class="detail-body-frame" sandbox="allow-same-origin" srcdoc="${escapeAttr(
        `<html><head><base target="_blank"><style>body{font-family:system-ui,sans-serif;margin:0;word-wrap:break-word;font-size:14px;}</style></head><body>${bodyHtml}</body></html>`
      )}"></iframe>
    </div>
  `;

  document.getElementById("back-btn").addEventListener("click", () => navigate({ view: folder }));
  const replyBtn = document.getElementById("reply-btn");
  if (replyBtn) replyBtn.addEventListener("click", () => navigate({ compose: "reply", replyTo: id, folder }));

  contentEl.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const act = btn.dataset.act;
      if (act === "archive") await updateMessage(id, { folder: "archive" });
      if (act === "trash") await updateMessage(id, { folder: "trash" });
      if (act === "restore") await updateMessage(id, { folder: "inbox" });
      if (act === "delete") {
        if (!confirm("Permanently delete this message?")) return;
        await deleteMessageForever(id);
        navigate({ view: "trash" });
        return;
      }
      navigate({ view: folder });
    });
  });
}

/* ----------------------------------- compose view -------------------------------- */

async function renderCompose(params) {
  const mode = params.get("compose");
  const replyTo = params.get("replyTo");
  const folder = params.get("folder") || "inbox";

  let prefillTo = "";
  let prefillSubject = "";
  let quoted = "";

  if (mode === "reply" && replyTo) {
    const all = await ensureInboxLoaded();
    const original = all.find((m) => m.id === replyTo);
    if (original) {
      prefillTo = extractEmail(original.from);
      prefillSubject = /^re:/i.test(original.subject || "") ? original.subject : `Re: ${original.subject || ""}`;
      const originalBody = original.html || `<div>${escapeHtml(original.text || "").replace(/\n/g, "<br>")}</div>`;
      quoted =
        `<p><br></p><blockquote style="border-left:2px solid #ddd;margin:8px 0;padding-left:12px;color:#666;">` +
        `On ${formatDate(original.receivedAt)}, ${escapeHtml(original.from || "")} wrote:<br>${originalBody}` +
        `</blockquote>`;
    }
  }

  contentEl.innerHTML = `
    <div class="detail-header"><button class="icon-btn" id="back-btn">&larr;</button><h2>${mode === "reply" ? "Reply" : "New message"}</h2></div>
    <div class="compose-card">
      <div class="field-group">
        <input id="compose-to" class="field-input" type="email" placeholder=" " value="${escapeAttr(prefillTo)}" />
        <label class="field-label">To</label>
      </div>
      <div class="field-group">
        <input id="compose-subject" class="field-input" type="text" placeholder=" " value="${escapeAttr(prefillSubject)}" />
        <label class="field-label">Subject</label>
      </div>
      <div class="editor-toolbar">
        <button type="button" data-cmd="bold" title="Bold"><b>B</b></button>
        <button type="button" data-cmd="italic" title="Italic"><i>I</i></button>
        <button type="button" data-cmd="underline" title="Underline"><u>U</u></button>
        <button type="button" data-cmd="insertUnorderedList" title="Bullet list">&#8226; List</button>
        <button type="button" data-cmd="insertOrderedList" title="Numbered list">1. List</button>
        <button type="button" data-cmd="createLink" title="Insert link">Link</button>
        <button type="button" data-cmd="removeFormat" title="Clear formatting">Clear</button>
      </div>
      <div id="compose-body" class="editor-body" contenteditable="true" data-placeholder="Write your message...">${quoted}</div>
      <button id="send-btn" class="btn btn-primary btn-block">Send</button>
      <div id="send-status" class="status-text"></div>
    </div>
  `;

  document.getElementById("back-btn").addEventListener("click", () => navigate({ view: folder }));

  contentEl.querySelectorAll(".editor-toolbar button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const body = document.getElementById("compose-body");
      body.focus();
      const cmd = btn.dataset.cmd;
      if (cmd === "createLink") {
        const url = prompt("Link URL:");
        if (url) document.execCommand(cmd, false, url);
      } else {
        document.execCommand(cmd, false, null);
      }
    });
  });

  document.getElementById("send-btn").addEventListener("click", async () => {
    const to = document.getElementById("compose-to").value.trim();
    const subject = document.getElementById("compose-subject").value.trim();
    const bodyEl = document.getElementById("compose-body");
    const html = bodyEl.innerHTML.trim();
    const text = bodyEl.innerText.trim();
    const statusEl = document.getElementById("send-status");

    if (!to || !subject || (!text && !html)) {
      statusEl.textContent = "Fill in all fields.";
      statusEl.className = "status-text error";
      return;
    }

    statusEl.textContent = "Sending...";
    statusEl.className = "status-text";

    const res = await withSpinner(() =>
      authedFetch("/api/send", { method: "POST", body: JSON.stringify({ to, subject, text, html }) })
    );
    const data = await res.json();

    if (res.ok) {
      sentCache = null; // force refresh next time Sent is opened
      navigate({ view: "inbox" });
    } else {
      statusEl.textContent = `Error: ${data.error}`;
      statusEl.className = "status-text error";
    }
  });
}

/* ---------------------------------- utilities ------------------------------------ */

function snippet(m) {
  const text = m.text || stripHtml(m.html || "");
  return text.slice(0, 100);
}
function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || "";
}
function displayName(addr) {
  if (!addr) return "Unknown";
  const match = String(addr).match(/^(.*?)\s*<(.+)>$/);
  return match ? match[1].trim() || match[2] : addr;
}
function extractEmail(addr) {
  if (!addr) return "";
  const match = String(addr).match(/<(.+)>/);
  return match ? match[1] : addr;
}
function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString();
}
function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
function escapeAttr(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
