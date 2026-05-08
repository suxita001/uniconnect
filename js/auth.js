// js/auth.js — WhisperNet Authentication (Improved v2)
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

const RANDOM_EMOJIS = ["🎭","🌀","👾","🦊","🐺","🎃","🧿","🦋","🌙","⚡","🔮","🎯","🧩","🦅","🐉","🌊","🎪","🦄","🌺","🎵"];
const GENDER_LABELS = { male: "♂ მამრობითი", female: "♀ მდედრობითი", other: "⚡ სხვა" };
const ANON_ADJ = ["სწრაფი","საიდუმლო","უჩინარი","ნათელი","ბნელი","კოსმოსური","ელვა","ქარი"];
const ANON_NOUN = ["მგელი","მელია","ჩიტი","ვარსკვლავი","ჩრდილი","ღრუბელი","მთვარე","ქვა"];

let selectedGender = "male";
let uploadedPhotoFile = null;
let selectedEmoji = RANDOM_EMOJIS[Math.floor(Math.random() * RANDOM_EMOJIS.length)];
let isSubmitting = false;

// Redirect if already logged in
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) window.location.href = "lobby.html";
  }
});

// ---- Helpers ----
function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.className = "toast", 3500);
}

function setLoading(btnId, loading, originalText) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.orig = btn.textContent;
    btn.innerHTML = `<span class="btn-spinner"></span> იტვირთება...`;
  } else {
    btn.textContent = originalText || btn.dataset.orig || btn.textContent;
  }
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
  if (file.size > 5 * 1024 * 1024) {
    showToast("ფოტო მაქს. 5MB", "error");
    return;
  }
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
  const emojiEl = document.getElementById("avatar-random-emoji");
  emojiEl.style.transform = "scale(0) rotate(-180deg)";
  setTimeout(() => {
    emojiEl.textContent = selectedEmoji;
    emojiEl.style.transition = "transform 0.3s cubic-bezier(0.34,1.56,0.64,1)";
    emojiEl.style.transform = "scale(1) rotate(0)";
  }, 150);
  document.getElementById("avatar-img").style.display = "none";
  document.getElementById("avatar-placeholder").style.display = "flex";
});

// ---- LOGIN ----
const btnLogin = document.getElementById("btn-login");
btnLogin.addEventListener("click", async () => {
  if (isSubmitting) return;
  const email = document.getElementById("login-email").value.trim();
  const pass = document.getElementById("login-pass").value;
  if (!email || !pass) return showToast("შეავსე ყველა ველი", "error");
  if (!validateEmail(email)) return showToast("არასწორი ელ-ფოსტის ფორმატი", "error");

  isSubmitting = true;
  setLoading("btn-login", true);
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    showToast("კეთილი იყოს! 👋", "success");
  } catch (e) {
    const msgs = {
      "auth/user-not-found": "მომხმარებელი არ მოიძებნა",
      "auth/wrong-password": "არასწორი პაროლი",
      "auth/invalid-email": "არასწორი ელ-ფოსტა",
      "auth/invalid-credential": "არასწორი ელ-ფოსტა ან პაროლი",
      "auth/too-many-requests": "ძალიან ბევრი მცდელობა, სცადე მოგვიანებით"
    };
    showToast(msgs[e.code] || "შეცდომა: " + e.message, "error");
    setLoading("btn-login", false, "შესვლა");
    isSubmitting = false;
  }
});
document.getElementById("login-pass").addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnLogin.click();
});

// ---- REGISTER ----
const btnReg = document.getElementById("btn-register");
btnReg.addEventListener("click", async () => {
  if (isSubmitting) return;
  const name = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const pass = document.getElementById("reg-pass").value;

  if (!name || !email || !pass) return showToast("შეავსე ყველა ველი", "error");
  if (name.length < 2) return showToast("სახელი მინ. 2 სიმბოლო", "error");
  if (!validateEmail(email)) return showToast("არასწორი ელ-ფოსტა", "error");
  if (pass.length < 6) return showToast("პაროლი მინ. 6 სიმბოლო", "error");

  isSubmitting = true;
  setLoading("btn-register", true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const user = cred.user;

    let photoURL = null;
    if (uploadedPhotoFile) {
      const storageRef = ref(storage, `avatars/${user.uid}`);
      await uploadBytes(storageRef, uploadedPhotoFile);
      photoURL = await getDownloadURL(storageRef);
    }

    await updateProfile(user, { displayName: name, photoURL });
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid, name, email,
      gender: selectedGender,
      genderLabel: GENDER_LABELS[selectedGender],
      photoURL, emoji: selectedEmoji,
      online: true, likes: 0, totalChats: 0,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp()
    });
    showToast("ანგარიში შეიქმნა! 🎉", "success");
  } catch (e) {
    const msgs = {
      "auth/email-already-in-use": "ეს ელ-ფოსტა უკვე გამოყენებულია",
      "auth/invalid-email": "არასწორი ელ-ფოსტა",
      "auth/weak-password": "პაროლი ძალიან სუსტია"
    };
    showToast(msgs[e.code] || "შეცდომა: " + e.message, "error");
    setLoading("btn-register", false, "ანგარიშის შექმნა");
    isSubmitting = false;
  }
});

// ---- ANONYMOUS LOGIN ----
document.getElementById("btn-anon").addEventListener("click", async () => {
  if (isSubmitting) return;
  isSubmitting = true;
  try {
    const cred = await signInAnonymously(auth);
    const user = cred.user;
    const anonName = ANON_ADJ[Math.floor(Math.random()*ANON_ADJ.length)] + "_" + ANON_NOUN[Math.floor(Math.random()*ANON_NOUN.length)];
    const anonEmoji = RANDOM_EMOJIS[Math.floor(Math.random() * RANDOM_EMOJIS.length)];

    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid, name: anonName, email: null,
      gender: "other", genderLabel: "⚡ სხვა",
      photoURL: null, emoji: anonEmoji,
      online: true, likes: 0, totalChats: 0,
      isAnon: true,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp()
    });
    showToast("ანონიმური შესვლა! 👻", "success");
  } catch (e) {
    showToast("შეცდომა: " + e.message, "error");
    isSubmitting = false;
  }
});
