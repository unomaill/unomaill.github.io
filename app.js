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

const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const userNameEl = document.getElementById("user-name");
const aliasEl = document.getElementById("alias-display");
const inboxListEl = document.getElementById("inbox-list");
const sendStatusEl = document.getElementById("send-status");

document.getElementById("google-signin-btn").addEventListener("click", async () => {
  await signInWithPopup(auth, provider);
});

document.getElementById("signout-btn").addEventListener("click", () => signOut(auth));
document.getElementById("refresh-btn").addEventListener("click", loadInbox);
document.getElementById("send-btn").addEventListener("click", sendMessage);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    loginScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
    return;
  }
  loginScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
  userNameEl.textContent = user.displayName || user.email;

  const alias = await registerAlias();
  aliasEl.textContent = alias;
  await loadInbox();
});

async function authedFetch(path, options = {}) {
  const idToken = await auth.currentUser.getIdToken();
  return fetch(`${WORKER_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${idToken}`,
    },
  });
}

async function registerAlias() {
  const res = await authedFetch("/api/register", { method: "POST" });
  const data = await res.json();
  return data.alias || "(failed to get alias)";
}

async function loadInbox() {
  inboxListEl.textContent = "Loading...";
  const res = await authedFetch("/api/inbox");
  const data = await res.json();

  if (!data.messages || data.messages.length === 0) {
    inboxListEl.textContent = "No messages yet.";
    return;
  }

  inboxListEl.innerHTML = data.messages
    .map(
      (m) => `
      <div class="message">
        <div class="from">${escapeHtml(m.from || "unknown")}</div>
        <div class="subject">${escapeHtml(m.subject || "(no subject)")}</div>
        <div>${escapeHtml((m.text || "").slice(0, 200))}</div>
        <div class="time">${new Date(m.receivedAt).toLocaleString()}</div>
      </div>`
    )
    .join("");
}

async function sendMessage() {
  const to = document.getElementById("compose-to").value.trim();
  const subject = document.getElementById("compose-subject").value.trim();
  const text = document.getElementById("compose-body").value.trim();

  if (!to || !subject || !text) {
    sendStatusEl.textContent = "Fill in all fields.";
    return;
  }

  sendStatusEl.textContent = "Sending...";
  const res = await authedFetch("/api/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, text }),
  });
  const data = await res.json();

  sendStatusEl.textContent = res.ok ? "Sent!" : `Error: ${data.error}`;
  if (res.ok) {
    document.getElementById("compose-to").value = "";
    document.getElementById("compose-subject").value = "";
    document.getElementById("compose-body").value = "";
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
