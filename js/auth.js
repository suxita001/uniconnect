// js/auth.js — WhisperNet Authentication
import { auth, db, storage } from "./firebase-init.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// ---- Random Avatars ----
const RANDOM_EMOJIS = ["🎭","🌀","👾","🦊","🐺","🎃","🧿","🦋","🌙","⚡","🔮","🎯","🧩","🦅","🐉"];
const GENDER_LABELS = { male: "♂ მამრობითი", female: "♀ მდედრობითი", other: "⚡ სხვა" };

let selectedGender = "male";
let uploadedPhotoFile = null;
let selectedEmoji = RANDOM_EMOJIS[Math.floor(Math.random() * RANDOM_EMOJIS.length)];

// Redirect if already logged in
onAuthStateChanged(auth, async (user) => {
  if (user) {
    window.location.href = "lobby.html";
  }
});

// ---- Helpers ----
function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.className = "toast", 3000);
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? "..." : btn.dataset.orig || btn.textContent;
}

// ---- Tab Switching ----
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".form-panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
  });
});

// ---- Gender Selection ----
document.querySelectorAll(".gender-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".gender-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedGender = btn.dataset.gender;
  });
});

// ---- Avatar Handling ----
document.getElementById("btn-upload-photo").addEventListener("click", () => {
  document.getElementById("photo-input").click();
});

document.getElementById("photo-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  uploadedPhotoFile = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = document.getElementById("avatar-img");
    img.src = ev.target.result;
    img.style.display = "block";
    document.getElementById("avatar-placeholder").style.display = "none";
  };
  reader.readAsDataURL(file);
});

document.getElementById("btn-random-avatar").addEventListener("click", () => {
  uploadedPhotoFile = null;
  selectedEmoji = RANDOM_EMOJIS[Math.floor(Math.random() * RANDOM_EMOJIS.length)];
  document.getElementById("avatar-random-emoji").textContent = selectedEmoji;
  document.getElementById("avatar-img").style.display = "none";
  document.getElementById("avatar-placeholder").style.display = "flex";
});

// ---- LOGIN ----
const btnLogin = document.getElementById("btn-login");
btnLogin.dataset.orig = "შესვლა";
btnLogin.addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();
  const pass = document.getElementById("login-pass").value;
  if (!email || !pass) return showToast("შეავსე ყველა ველი", "error");
  setLoading("btn-login", true);
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    showToast("კეთილი იყოს!", "success");
  } catch (e) {
    const msgs = {
      "auth/user-not-found": "მომხმარებელი არ მოიძებნა",
      "auth/wrong-password": "არასწორი პაროლი",
      "auth/invalid-email": "არასწორი ელ-ფოსტა",
      "auth/invalid-credential": "არასწორი მონაცემები"
    };
    showToast(msgs[e.code] || "შეცდომა: " + e.message, "error");
    setLoading("btn-login", false);
  }
});

// ---- REGISTER ----
const btnReg = document.getElementById("btn-register");
btnReg.dataset.orig = "ანგარიშის შექმნა";
btnReg.addEventListener("click", async () => {
  const name = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const pass = document.getElementById("reg-pass").value;
  if (!name || !email || !pass) return showToast("შეავსე ყველა ველი", "error");
  if (pass.length < 6) return showToast("პაროლი მინ. 6 სიმბოლო", "error");

  setLoading("btn-register", true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const user = cred.user;

    // Upload photo if selected
    let photoURL = null;
    if (uploadedPhotoFile) {
      const storageRef = ref(storage, `avatars/${user.uid}`);
      await uploadBytes(storageRef, uploadedPhotoFile);
      photoURL = await getDownloadURL(storageRef);
    }

    await updateProfile(user, { displayName: name, photoURL });

    // Save user doc
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      name,
      email,
      gender: selectedGender,
      genderLabel: GENDER_LABELS[selectedGender],
      photoURL,
      emoji: selectedEmoji,
      online: true,
      likes: 0,
      createdAt: serverTimestamp()
    });

    showToast("ანგარიში შეიქმნა! 🎉", "success");
  } catch (e) {
    const msgs = {
      "auth/email-already-in-use": "ეს ელ-ფოსტა უკვე გამოყენებულია",
      "auth/invalid-email": "არასწორი ელ-ფოსტა"
    };
    showToast(msgs[e.code] || "შეცდომა: " + e.message, "error");
    setLoading("btn-register", false);
  }
});

// ---- ANONYMOUS LOGIN ----
document.getElementById("btn-anon").addEventListener("click", async () => {
  try {
    const cred = await signInAnonymously(auth);
    const user = cred.user;
    const anonName = "ანონიმი_" + Math.floor(Math.random() * 9999);
    const anonEmoji = RANDOM_EMOJIS[Math.floor(Math.random() * RANDOM_EMOJIS.length)];

    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      name: anonName,
      email: null,
      gender: "other",
      genderLabel: "⚡ სხვა",
      photoURL: null,
      emoji: anonEmoji,
      online: true,
      likes: 0,
      isAnon: true,
      createdAt: serverTimestamp()
    });
    showToast("ანონიმური შესვლა!", "success");
  } catch (e) {
    showToast("შეცდომა: " + e.message, "error");
  }
});