// js/firebase-init.js — WhisperNet
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDtzRY0zJt0tTDua3GVNmbSZ64w5IWi7TE",
  authDomain: "agroweb-aad4a.firebaseapp.com",
  projectId: "agroweb-aad4a",
  storageBucket: "agroweb-aad4a.firebasestorage.app",
  messagingSenderId: "884211692036",
  appId: "1:884211692036:web:a4df9bf520ceaf088bbb51"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;