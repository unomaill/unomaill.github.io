// Get these values from: Firebase console > Project settings > General > Your apps > SDK setup
// These are PUBLIC identifiers (safe to expose in frontend code) — they are not secrets.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDGyhEEjtbpcTVhmjkzfqzV72fZqayDb5c",
  authDomain: "unomailbd.firebaseapp.com",
  projectId: "unomailbd",
  appId: "1:481222796028:web:41ecd7e95aefce12186d79",
};

export const firebaseApp = initializeApp(firebaseConfig);
