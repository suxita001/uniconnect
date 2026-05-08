// auth.js
import { auth, db, storage } from "./firebase-init.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const EMOJIS = ["🎭","🌀","👾","🦊","🐺","🎃","🧿","🦋","🌙","⚡","🔮","🎯","🧩","🦅","🐉"];
const GENDER_LABELS = { male:"♂ მამრობითი", female:"♀ მდედრობითი", other:"⚡ სხვა" };

let selectedGender = "male";
let uploadedPhoto = null;
let selectedEmoji = EMOJIS[Math.floor(Math.random()*EMOJIS.length)];

// If already logged in AND has profile → go to lobby
// Use sessionStorage flag to prevent loop
onAuthStateChanged(auth, async (user) => {
  if (!user) return; // stay on page
  // Check if we just registered/logged in from this page
  const justAuthed = sessionStorage.getItem("justAuthed");
  if (justAuthed) {
    sessionStorage.removeItem("justAuthed");
    window.location.href = "lobby.html";
    return;
  }
  // Returning user — check profile exists
  const snap = await getDoc(doc(db, "users", user.uid));
  if (snap.exists()) {
    window.location.href = "lobby.html";
  }
  // else: profile missing (incomplete reg), stay on page
});

function toast(msg, type="") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.className = "toast", 3000);
}

// Tabs
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".form-panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
  });
});

// Gender
document.querySelectorAll(".gender-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".gender-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedGender = btn.dataset.gender;
  });
});

// Avatar
document.getElementById("btn-upload-photo").addEventListener("click", () => document.getElementById("photo-input").click());
document.getElementById("photo-input").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  uploadedPhoto = file;
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById("avatar-img").src = ev.target.result;
    document.getElementById("avatar-img").style.display = "block";
    document.getElementById("avatar-placeholder").style.display = "none";
  };
  reader.readAsDataURL(file);
});
document.getElementById("btn-random-avatar").addEventListener("click", () => {
  uploadedPhoto = null;
  selectedEmoji = EMOJIS[Math.floor(Math.random()*EMOJIS.length)];
  document.getElementById("avatar-random-emoji").textContent = selectedEmoji;
  document.getElementById("avatar-img").style.display = "none";
  document.getElementById("avatar-placeholder").style.display = "flex";
});

// LOGIN
document.getElementById("btn-login").addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();
  const pass = document.getElementById("login-pass").value;
  if (!email || !pass) return toast("შეავსე ყველა ველი","error");
  const btn = document.getElementById("btn-login");
  btn.disabled = true; btn.textContent = "...";
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    sessionStorage.setItem("justAuthed","1");
    window.location.href = "lobby.html";
  } catch(e) {
    const m = {"auth/user-not-found":"მომხმარებელი არ მოიძებნა","auth/wrong-password":"არასწორი პაროლი","auth/invalid-credential":"არასწორი მონაცემები","auth/invalid-email":"არასწორი ელ-ფოსტა"};
    toast(m[e.code] || e.message, "error");
    btn.disabled = false; btn.textContent = "შესვლა";
  }
});

// REGISTER
document.getElementById("btn-register").addEventListener("click", async () => {
  const name = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const pass = document.getElementById("reg-pass").value;
  if (!name||!email||!pass) return toast("შეავსე ყველა ველი","error");
  if (pass.length < 6) return toast("პაროლი მინ. 6 სიმბოლო","error");
  const btn = document.getElementById("btn-register");
  btn.disabled = true; btn.textContent = "...";
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    let photoURL = null;
    if (uploadedPhoto) {
      const r = ref(storage, `avatars/${cred.user.uid}`);
      await uploadBytes(r, uploadedPhoto);
      photoURL = await getDownloadURL(r);
    }
    await updateProfile(cred.user, { displayName: name, photoURL });
    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid, name, email, gender: selectedGender,
      genderLabel: GENDER_LABELS[selectedGender], photoURL, emoji: selectedEmoji,
      online: false, likes: 0, createdAt: serverTimestamp()
    });
    sessionStorage.setItem("justAuthed","1");
    window.location.href = "lobby.html";
  } catch(e) {
    const m = {"auth/email-already-in-use":"ეს ელ-ფოსტა უკვე გამოყენებულია"};
    toast(m[e.code] || e.message, "error");
    btn.disabled = false; btn.textContent = "ანგარიშის შექმნა";
  }
});

// ANONYMOUS
document.getElementById("btn-anon").addEventListener("click", async () => {
  try {
    const cred = await signInAnonymously(auth);
    const name = "ანონიმი_" + Math.floor(Math.random()*9999);
    const emoji = EMOJIS[Math.floor(Math.random()*EMOJIS.length)];
    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid, name, email: null, gender: "other",
      genderLabel: "⚡ სხვა", photoURL: null, emoji,
      online: false, likes: 0, isAnon: true, createdAt: serverTimestamp()
    });
    sessionStorage.setItem("justAuthed","1");
    window.location.href = "lobby.html";
  } catch(e) { toast(e.message,"error"); }
});
