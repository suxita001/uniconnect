// js/lobby.js — WhisperNet Lobby & Matchmaking (Improved v2)
import { auth, db } from "./firebase-init.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
  collection, query, where, getDocs, serverTimestamp, limit,
  addDoc, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ROLES = [
  "სეიმური_სპაი 🕵️", "გამომძიებელი_7 🔍", "ქარხნის_მუშა ⚙️",
  "კოსმოს_მოგზაური 🚀", "ბარდი_ბარბაროსი 🏴‍☠️", "ჯადოქარი_X 🔮",
  "ნინჯა_კოდი 🥷", "ციფრული_მოჩვენება 👻", "ქალაქის_გმირი ⚡",
  "საიდუმლო_დეტექტივი 🦊", "ვულკანი_მომხსენებელი 🌋", "ანტარქტიდის_მეთვალყურე 🐧",
  "დროის_მოგზაური ⏰", "ოკეანის_მეურნე 🌊", "ღრუბლის_მხატვარი 🎨"
];

let currentUser = null;
let userProfile = null;
let selectedMode = "classic";
let assignedRole = null;
let waitingUnsub = null;
let isSearching = false;

// ---- Auth Guard ----
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  currentUser = user;

  // Clean up any leftover waiting state from previous session
  await deleteDoc(doc(db, "waiting", currentUser.uid)).catch(() => {});

  await loadProfile();
  initOnlineCounter();
  setUserOnline();
});

// ---- Load Profile ----
async function loadProfile() {
  const snap = await getDoc(doc(db, "users", currentUser.uid));
  if (!snap.exists()) { window.location.href = "index.html"; return; }
  userProfile = snap.data();

  document.getElementById("profile-name").textContent = userProfile.name || "გამოჩენილი";
  document.getElementById("profile-gender").textContent = userProfile.genderLabel || "";

  // Show likes count
  if (userProfile.likes > 0) {
    const likesEl = document.getElementById("profile-likes");
    if (likesEl) {
      likesEl.textContent = `❤️ ${userProfile.likes}`;
      likesEl.style.display = "inline-block";
    }
  }

  const avatarEl = document.getElementById("profile-avatar");
  const navAvatarEl = document.getElementById("nav-avatar");

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
  }).catch(() => {});

  // Set offline on close
  window.addEventListener("beforeunload", () => {
    // Use navigator.sendBeacon or synchronous-compatible approach
    updateDoc(doc(db, "users", currentUser.uid), { online: false }).catch(() => {});
    if (isSearching) {
      deleteDoc(doc(db, "waiting", currentUser.uid)).catch(() => {});
    }
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

// ---- Find Chat ----
document.getElementById("btn-find-chat").addEventListener("click", async () => {
  if (isSearching) return;
  isSearching = true;

  document.getElementById("btn-find-chat").style.display = "none";
  document.getElementById("waiting-state").style.display = "block";

  try {
    const waitingQ = query(
      collection(db, "waiting"),
      where("mode", "==", selectedMode),
      where("uid", "!=", currentUser.uid),
      limit(5)
    );

    const waitingSnap = await getDocs(waitingQ);
    let matched = false;

    for (const partnerDoc of waitingSnap.docs) {
      try {
        const partnerData = partnerDoc.data();

        // Pre-create roomRef OUTSIDE transaction (collection() inside transaction is not allowed)
        const roomRef = doc(collection(db, "rooms"));

        await runTransaction(db, async (transaction) => {
          // Verify partner is still waiting
          const partnerWaitSnap = await transaction.get(partnerDoc.ref);
          if (!partnerWaitSnap.exists()) throw new Error("already_matched");

          transaction.set(roomRef, {
            users: [currentUser.uid, partnerData.uid],
            mode: selectedMode,
            active: true,
            createdAt: serverTimestamp(),
            messageCount: 0
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

        matched = true;
        updateDoc(doc(db, "users", currentUser.uid), { totalChats: (userProfile.totalChats || 0) + 1 }).catch(() => {});
        window.location.href = "chat.html";
        break;
      } catch (err) {
        if (err.message === "already_matched") continue;
        throw err;
      }
    }

    if (!matched) {
      await setDoc(doc(db, "waiting", currentUser.uid), {
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
  } catch (err) {
    console.error("Matchmaking error:", err);
    showLobbyToast("შეცდომა, სცადე თავიდან", "error");
    cancelSearch();
  }
});

// ---- Cancel Waiting ----
document.getElementById("btn-cancel").addEventListener("click", cancelSearch);

async function cancelSearch() {
  if (waitingUnsub) { waitingUnsub(); waitingUnsub = null; }
  await deleteDoc(doc(db, "waiting", currentUser.uid)).catch(() => {});
  isSearching = false;
  document.getElementById("waiting-state").style.display = "none";
  document.getElementById("btn-find-chat").style.display = "inline-flex";
}

// ---- Logout ----
document.getElementById("btn-logout").addEventListener("click", async () => {
  if (isSearching) await cancelSearch();
  await updateDoc(doc(db, "users", currentUser.uid), { online: false }).catch(() => {});
  await signOut(auth);
  window.location.href = "index.html";
});

// ---- Toast helper ----
function showLobbyToast(msg, type = "") {
  let toast = document.getElementById("lobby-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "lobby-toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.className = "toast", 3000);
}
