// js/lobby.js — WhisperNet Lobby & Matchmaking (FIXED)
import { auth, db } from "./firebase-init.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
  collection, query, where, getDocs, serverTimestamp, limit, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ROLES = [
  "სეიმური_სპაი 🕵️", "გამომძიებელი_7 🔍", "ქარხნის_მუშა ⚙️",
  "კოსმოს_მოგზაური 🚀", "ბარდი_ბარბაროსი 🏴‍☠️", "ჯადოქარი_X 🔮",
  "ნინჯა_კოდი 🥷", "ციფრული_მოჩვენება 👻", "ქალაქის_გმირი ⚡",
  "საიდუმლო_დეტექტივი 🦊", "ვულკანი_მომხსენებელი 🌋", "ანტარქტიდის_მეთვალყურე 🐧"
];

let currentUser = null;
let userProfile = null;
let selectedMode = "classic";
let assignedRole = null;
let waitingUnsub = null;
let isSearching = false;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  currentUser = user;
  await deleteDoc(doc(db, "userRoom", user.uid)).catch(() => {});
  await deleteDoc(doc(db, "waiting", user.uid)).catch(() => {});
  await loadProfile();
  initOnlineCounter();
  setUserOnline();
});

async function loadProfile() {
  const snap = await getDoc(doc(db, "users", currentUser.uid));
  if (!snap.exists()) { window.location.href = "index.html"; return; }
  userProfile = snap.data();
  document.getElementById("profile-name").textContent = userProfile.name || "გამოჩენილი";
  document.getElementById("profile-gender").textContent = userProfile.genderLabel || "";
  const avatarEl = document.getElementById("profile-avatar");
  const navAvatarEl = document.getElementById("nav-avatar");
  if (userProfile.photoURL) {
    avatarEl.innerHTML = `<img src="${userProfile.photoURL}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
    navAvatarEl.innerHTML = `<img src="${userProfile.photoURL}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
  } else {
    avatarEl.textContent = userProfile.emoji || "👤";
    navAvatarEl.textContent = (userProfile.name || "?").charAt(0).toUpperCase();
  }
}

async function setUserOnline() {
  try {
    await updateDoc(doc(db, "users", currentUser.uid), { online: true, lastSeen: serverTimestamp() });
  } catch (e) {
    await setDoc(doc(db, "users", currentUser.uid), { online: true, lastSeen: serverTimestamp() }, { merge: true });
  }
  window.addEventListener("beforeunload", () => {
    deleteDoc(doc(db, "waiting", currentUser.uid));
    updateDoc(doc(db, "users", currentUser.uid), { online: false }).catch(() => {});
  });
}

function initOnlineCounter() {
  const q = query(collection(db, "users"), where("online", "==", true));
  onSnapshot(q, (snap) => {
    document.getElementById("online-count").textContent = snap.size;
  });
}

document.querySelectorAll(".mode-card").forEach(card => {
  card.addEventListener("click", () => {
    if (isSearching) return;
    document.querySelectorAll(".mode-card").forEach(c => c.classList.remove("active"));
    card.classList.add("active");
    selectedMode = card.dataset.mode;
    const rolePreview = document.getElementById("role-preview");
    if (selectedMode === "roleplay") {
      assignedRole = ROLES[Math.floor(Math.random() * ROLES.length)];
      document.getElementById("role-display").textContent = assignedRole;
      rolePreview.style.display = "block";
    } else {
      assignedRole = null;
      rolePreview.style.display = "none";
    }
  });
});

document.getElementById("btn-find-chat").addEventListener("click", async () => {
  if (isSearching) return;
  isSearching = true;
  document.getElementById("btn-find-chat").style.display = "none";
  document.getElementById("waiting-state").style.display = "block";
  try {
    await findOrWait();
  } catch (e) {
    console.error("Matchmaking error:", e);
    showError("შეცდომა: " + e.message);
    resetUI();
  }
});

async function findOrWait() {
  // Only filter by mode — no != to avoid needing composite index
  const waitingQ = query(collection(db, "waiting"), where("mode", "==", selectedMode), limit(10));
  const waitingSnap = await getDocs(waitingQ);
  const others = waitingSnap.docs.filter(d => d.data().uid !== currentUser.uid);

  if (others.length > 0) {
    const partnerDoc = others[0];
    let matched = false;
    let partnerData = null;

    try {
      await runTransaction(db, async (transaction) => {
        const freshSnap = await transaction.get(partnerDoc.ref);
        if (!freshSnap.exists()) return; // already claimed
        partnerData = freshSnap.data();
        matched = true;

        const roomRef = doc(collection(db, "rooms"));
        transaction.set(roomRef, {
          users: [currentUser.uid, partnerData.uid],
          mode: selectedMode,
          createdAt: serverTimestamp(),
          active: true
        });
        transaction.set(doc(db, "userRoom", currentUser.uid), {
          roomId: roomRef.id,
          partnerId: partnerData.uid,
          myRole: assignedRole,
          partnerRole: partnerData.role || null,
          mode: selectedMode
        });
        transaction.set(doc(db, "userRoom", partnerData.uid), {
          roomId: roomRef.id,
          partnerId: currentUser.uid,
          myRole: partnerData.role || null,
          partnerRole: assignedRole,
          mode: selectedMode
        });
        transaction.delete(partnerDoc.ref);
      });

      if (matched) {
        window.location.href = "chat.html";
        return;
      }
    } catch (e) {
      console.log("Transaction failed, will wait:", e.message);
    }
  }

  // No match — join waiting room
  await setDoc(doc(db, "waiting", currentUser.uid), {
    uid: currentUser.uid,
    mode: selectedMode,
    role: assignedRole || null,
    createdAt: serverTimestamp()
  });

  // Listen for partner to assign us a room
  waitingUnsub = onSnapshot(doc(db, "userRoom", currentUser.uid), (snap) => {
    if (snap.exists()) {
      if (waitingUnsub) { waitingUnsub(); waitingUnsub = null; }
      window.location.href = "chat.html";
    }
  });
}

document.getElementById("btn-cancel").addEventListener("click", async () => {
  resetUI();
  if (waitingUnsub) { waitingUnsub(); waitingUnsub = null; }
  await deleteDoc(doc(db, "waiting", currentUser.uid)).catch(() => {});
});

function resetUI() {
  isSearching = false;
  document.getElementById("waiting-state").style.display = "none";
  document.getElementById("btn-find-chat").style.display = "inline-flex";
}

function showError(msg) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1a1a2e;border:1px solid #f87171;color:#f87171;padding:10px 20px;border-radius:12px;font-size:0.85rem;z-index:9999";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

document.getElementById("btn-logout").addEventListener("click", async () => {
  if (waitingUnsub) { waitingUnsub(); waitingUnsub = null; }
  await deleteDoc(doc(db, "waiting", currentUser.uid)).catch(() => {});
  await updateDoc(doc(db, "users", currentUser.uid), { online: false }).catch(() => {});
  await signOut(auth);
  window.location.href = "index.html";
});
