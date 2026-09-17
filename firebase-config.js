// Get these values from: Firebase console > Project settings > General > Your apps > SDK setup
// These are PUBLIC identifiers (safe to expose in frontend code) — they are not secrets.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";

export const firebaseConfig = {
  apiKey: "REPLACE_WITH_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_PROJECT_ID",
  appId: "REPLACE_WITH_APP_ID",
};

export const firebaseApp = initializeApp(firebaseConfig);
