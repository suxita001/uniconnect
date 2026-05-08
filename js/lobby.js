// js/lobby.js — WhisperNet Lobby & Matchmaking
import { auth, db } from "./firebase-init.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
  collection, query, where, getDocs, serverTimestamp, limit, addDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---- Roleplay Personas ----
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

// ---- Auth Guard ----
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  currentUser = user;
  await loadProfile();
  initOnlineCounter();
  setUserOnline();
});

// ---- Load Profile ----
async function loadProfile() {
  const snap = await getDoc(doc(db, "users", currentUser.uid));
  if (!snap.exists()) { window.location.href = "index.html"; return; }
  userProfile = snap.data();

  const nameEl = document.getElementById("profile-name");
  const genderEl = document.getElementById("profile-gender");
  const avatarEl = document.getElementById("profile-avatar");
  const navAvatarEl = document.getElementById("nav-avatar");

  nameEl.textContent = userProfile.name || "გამოჩენილი";
  genderEl.textContent = userProfile.genderLabel || "";

  if (userProfile.photoURL) {
    avatarEl.innerHTML = `<img src="${userProfile.photoURL}" alt="avatar"/>`;
    navAvatarEl.innerHTML = `<img src="${userProfile.photoURL}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
  } else {
    avatarEl.textContent = userProfile.emoji || "👤";
    navAvatarEl.textContent = (userProfile.name || "?").charAt(0).toUpperCase();
  }
}

// ---- Online Presence ----
async function setUserOnline() {
  await updateDoc(doc(db, "users", currentUser.uid), {
    online: true,
    lastSeen: serverTimestamp()
  });
  window.addEventListener("beforeunload", () => {
    updateDoc(doc(db, "users", currentUser.uid), { online: false });
  });
}

// ---- Online Counter ----
function initOnlineCounter() {
  const q = query(collection(db, "users"), where("online", "==", true));
  onSnapshot(q, (snap) => {
    document.getElementById("online-count").textContent = snap.size;
  });
}

// ---- Mode Selection ----
document.querySelectorAll(".mode-card").forEach(card => {
  card.addEventListener("click", () => {
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

// ---- Find Chat ----
document.getElementById("btn-find-chat").addEventListener("click", async () => {
  document.getElementById("btn-find-chat").style.display = "none";
  document.getElementById("waiting-state").style.display = "block";

  // Look for existing waiter
  const waitingQ = query(
    collection(db, "waiting"),
    where("mode", "==", selectedMode),
    where("uid", "!=", currentUser.uid),
    limit(1)
  );

  const waitingSnap = await getDocs(waitingQ);

  if (!waitingSnap.empty) {
    // Found a match!
    const partner = waitingSnap.docs[0];
    const partnerData = partner.data();

    // Create room
    const roomRef = await addDoc(collection(db, "rooms"), {
      users: [currentUser.uid, partnerData.uid],
      mode: selectedMode,
      myRole: assignedRole,
      partnerRole: partnerData.role || null,
      createdAt: serverTimestamp(),
      active: true
    });

    // Save room ref for each user
    await setDoc(doc(db, "userRoom", currentUser.uid), {
      roomId: roomRef.id,
      partnerId: partnerData.uid,
      myRole: assignedRole,
      partnerRole: partnerData.role || null,
      mode: selectedMode
    });
    await setDoc(doc(db, "userRoom", partnerData.uid), {
      roomId: roomRef.id,
      partnerId: currentUser.uid,
      myRole: partnerData.role || null,
      partnerRole: assignedRole,
      mode: selectedMode
    });

    // Delete the waiting slot
    await deleteDoc(partner.ref);

    // Navigate
    window.location.href = "chat.html";
  } else {
    // Add self to waiting
    const myWaitRef = doc(db, "waiting", currentUser.uid);
    await setDoc(myWaitRef, {
      uid: currentUser.uid,
      mode: selectedMode,
      role: assignedRole,
      createdAt: serverTimestamp()
    });

    // Listen for room assignment
    waitingUnsub = onSnapshot(doc(db, "userRoom", currentUser.uid), (snap) => {
      if (snap.exists()) {
        if (waitingUnsub) waitingUnsub();
        window.location.href = "chat.html";
      }
    });
  }
});

// ---- Cancel Waiting ----
document.getElementById("btn-cancel").addEventListener("click", async () => {
  if (waitingUnsub) { waitingUnsub(); waitingUnsub = null; }
  await deleteDoc(doc(db, "waiting", currentUser.uid));
  document.getElementById("waiting-state").style.display = "none";
  document.getElementById("btn-find-chat").style.display = "inline-flex";
});

// ---- Logout ----
document.getElementById("btn-logout").addEventListener("click", async () => {
  await updateDoc(doc(db, "users", currentUser.uid), { online: false });
  await signOut(auth);
  window.location.href = "index.html";
});