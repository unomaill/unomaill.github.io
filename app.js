import { firebaseApp } from "./firebase-config.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

// Change this to your deployed Worker URL.
const WORKER_URL = "https://uno.csm-mohasin.workers.dev";

const auth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();

/* ------------------------------ DOM refs -------------------------------- */

const loginScreen = document.getElementById("login-screen");
const usernameScreen = document.getElementById("username-screen");
const appScreen = document.getElementById("app-screen");

const usernameInput = document.getElementById("username-input");
const usernameStatus = document.getElementById("username-status");
const claimBtn = document.getElementById("claim-btn");

const userNameEl = document.getElementById("user-name");
const aliasEl = document.getElementById("alias-display");
const inboxListEl = document.getElementById("inbox-list");
const sendStatusEl = document.getElementById("send-status");

const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-panel");
const closeSettingsBtn = document.getElementById("close-settings-btn");
const senderNameInput = document.getElementById("sender-name-input");
const saveSenderNameBtn = document.getElementById("save-sender-name-btn");
const senderNameStatus = document.getElementById("sender-name-status");

const composeTitle = document.getElementById("compose-title");
const composeTo = document.getElementById("compose-to");
const composeSubject = document.getElementById("compose-subject");
const composeBody = document.getElementById("compose-body");
const cancelReplyBtn = document.getElementById("cancel-reply-btn");

const modal = document.getElementById("email-modal");
const modalSubject = document.getElementById("modal-subject");
const modalFrom = document.getElementById("modal-from");
const modalTo = document.getElementById("modal-to");
const modalDate = document.getElementById("modal-date");
const modalBodyFrame = document.getElementById("modal-body-frame");
const modalReplyBtn = document.getElementById("modal-reply-btn");
const closeModalBtn = document.getElementById("close-modal-btn");

let currentAlias = "";
let currentSenderName = "";
let currentMessages = [];
let replyTarget = null; // the message currently being replied to

/* -------------------------------- auth ----------------------------------- */

document.getElementById("google-signin-btn").addEventListener("click", async () => {
  await signInWithPopup(auth, provider);
});
document.getElementById("signout-btn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showScreen(loginScreen);
    return;
  }
  userNameEl.textContent = user.displayName || user.email;

  const res = await authedFetch("/api/register", { method: "POST", body: "{}" });
  const data = await res.json();

  if (res.status === 400 || !data.alias) {
    // Not registered yet -> show username claim screen.
    showScreen(usernameScreen);
    return;
  }

  currentAlias = data.alias;
  currentSenderName = data.senderName || "";
  aliasEl.textContent = currentAlias;
  senderNameInput.value = currentSenderName;
  showScreen(appScreen);
  await loadInbox();
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
  aliasEl.textContent = currentAlias;
  senderNameInput.value = currentSenderName;
  showScreen(appScreen);
  await loadInbox();
});

/* -------------------------------- settings -------------------------------- */

settingsBtn.addEventListener("click", () => settingsPanel.classList.toggle("hidden"));
closeSettingsBtn.addEventListener("click", () => settingsPanel.classList.add("hidden"));

saveSenderNameBtn.addEventListener("click", async () => {
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

/* -------------------------------- inbox ----------------------------------- */

document.getElementById("refresh-btn").addEventListener("click", loadInbox);

async function loadInbox() {
  inboxListEl.textContent = "Loading...";
  const res = await authedFetch("/api/inbox");
  const data = await res.json();
  currentMessages = data.messages || [];

  if (currentMessages.length === 0) {
    inboxListEl.textContent = "No messages yet.";
    return;
  }

  inboxListEl.innerHTML = currentMessages
    .map(
      (m, i) => `
      <div class="message" data-index="${i}">
        <div class="from">${escapeHtml(displayName(m.from))}</div>
        <div class="subject">${escapeHtml(m.subject || "(no subject)")}</div>
        <div class="snippet">${escapeHtml(snippet(m))}</div>
        <div class="time">${formatDate(m.receivedAt)}</div>
      </div>`
    )
    .join("");

  inboxListEl.querySelectorAll(".message").forEach((el) => {
    el.addEventListener("click", () => openMessage(currentMessages[Number(el.dataset.index)]));
  });
}

function snippet(m) {
  const text = m.text || stripHtml(m.html || "");
  return text.slice(0, 140);
}

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || "";
}

function displayName(addr) {
  if (!addr) return "Unknown sender";
  const match = String(addr).match(/^(.*?)\s*<(.+)>$/);
  return match ? match[1].trim() || match[2] : addr;
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString();
}

/* ---------------------------- email detail view ---------------------------- */

function openMessage(message) {
  replyTarget = null;
  modalSubject.textContent = message.subject || "(no subject)";
  modalFrom.textContent = message.from || "Unknown";
  modalTo.textContent = message.to || currentAlias;
  modalDate.textContent = formatDate(message.receivedAt);

  const bodyHtml = message.html || `<pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(message.text || "")}</pre>`;
  modalBodyFrame.srcdoc = `<html><head><base target="_blank"><style>body{font-family:system-ui,sans-serif;margin:12px;word-wrap:break-word;}</style></head><body>${bodyHtml}</body></html>`;

  modalReplyBtn.onclick = () => startReply(message);
  modal.classList.remove("hidden");
}

closeModalBtn.addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.classList.add("hidden");
});

/* --------------------------------- reply ----------------------------------- */

function startReply(message) {
  replyTarget = message;
  modal.classList.add("hidden");

  composeTitle.textContent = "Reply";
  cancelReplyBtn.classList.remove("hidden");

  composeTo.value = extractEmail(message.from);
  composeSubject.value = /^re:/i.test(message.subject || "")
    ? message.subject
    : `Re: ${message.subject || ""}`;

  const quotedBody = message.html || `<div>${escapeHtml(message.text || "").replace(/\n/g, "<br>")}</div>`;
  composeBody.innerHTML =
    `<p><br></p><blockquote style="border-left:2px solid #ccc;margin:8px 0;padding-left:12px;color:#555;">` +
    `On ${formatDate(message.receivedAt)}, ${escapeHtml(message.from || "")} wrote:<br>${quotedBody}` +
    `</blockquote>`;

  document.getElementById("compose-to").scrollIntoView({ behavior: "smooth" });
}

cancelReplyBtn.addEventListener("click", resetCompose);

function extractEmail(addr) {
  if (!addr) return "";
  const match = String(addr).match(/<(.+)>/);
  return match ? match[1] : addr;
}

function resetCompose() {
  replyTarget = null;
  composeTitle.textContent = "Compose";
  cancelReplyBtn.classList.add("hidden");
  composeTo.value = "";
  composeSubject.value = "";
  composeBody.innerHTML = "";
  sendStatusEl.textContent = "";
}

/* ------------------------------ rich text editor ---------------------------- */

document.querySelectorAll(".editor-toolbar button").forEach((btn) => {
  btn.addEventListener("click", () => {
    composeBody.focus();
    const cmd = btn.dataset.cmd;
    if (cmd === "createLink") {
      const url = prompt("Link URL:");
      if (url) document.execCommand(cmd, false, url);
    } else {
      document.execCommand(cmd, false, null);
    }
  });
});

/* --------------------------------- send ------------------------------------ */

document.getElementById("send-btn").addEventListener("click", sendMessage);

async function sendMessage() {
  const to = composeTo.value.trim();
  const subject = composeSubject.value.trim();
  const html = composeBody.innerHTML.trim();
  const text = composeBody.innerText.trim();

  if (!to || !subject || (!text && !html)) {
    sendStatusEl.textContent = "Fill in all fields.";
    sendStatusEl.className = "status-text error";
    return;
  }

  sendStatusEl.textContent = "Sending...";
  sendStatusEl.className = "status-text";

  const res = await authedFetch("/api/send", {
    method: "POST",
    body: JSON.stringify({ to, subject, text, html }),
  });
  const data = await res.json();

  if (res.ok) {
    sendStatusEl.textContent = "Sent!";
    sendStatusEl.className = "status-text success";
    resetCompose();
    await loadInbox();
  } else {
    sendStatusEl.textContent = `Error: ${data.error}`;
    sendStatusEl.className = "status-text error";
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
