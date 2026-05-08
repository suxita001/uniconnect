// lobby.js
import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, serverTimestamp, limit, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ROLES = ["სეიმური_სპაი 🕵️","გამომძიებელი_7 🔍","ქარხნის_მუშა ⚙️","კოსმოს_მოგზაური 🚀","ჯადოქარი_X 🔮","ნინჯა_კოდი 🥷","ციფრული_მოჩვენება 👻","საიდუმლო_დეტექტივი 🦊"];

let currentUser = null;
let selectedMode = "classic";
let assignedRole = null;
let waitingUnsub = null;
let isSearching = false;

// Single auth check — no redirect loop
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  if (currentUser) return; // already initialized, ignore token refreshes
  currentUser = user;
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) { window.location.href = "index.html"; return; }
  renderProfile(snap.data());
  setDoc(doc(db, "users", user.uid), { online: true, lastSeen: serverTimestamp() }, { merge: true });
  initOnlineCounter();
  window.addEventListener("beforeunload", cleanup);
});

function renderProfile(p) {
  document.getElementById("profile-name").textContent = p.name || "სტუმარი";
  document.getElementById("profile-gender").textContent = p.genderLabel || "";
  const av = document.getElementById("profile-avatar");
  const nav = document.getElementById("nav-avatar");
  if (p.photoURL) {
    const s = "width:100%;height:100%;object-fit:cover;border-radius:50%";
    av.innerHTML = `<img src="${p.photoURL}" style="${s}"/>`;
    nav.innerHTML = `<img src="${p.photoURL}" style="${s}"/>`;
  } else {
    av.textContent = p.emoji || "👤";
    nav.textContent = (p.name||"?")[0].toUpperCase();
  }
}

function initOnlineCounter() {
  onSnapshot(query(collection(db, "users"), where("online","==",true)), s => {
    document.getElementById("online-count").textContent = s.size;
  });
}

function cleanup() {
  if (currentUser) {
    setDoc(doc(db, "users", currentUser.uid), { online: false }, { merge: true });
    deleteDoc(doc(db, "waiting", currentUser.uid));
  }
}

// Mode cards
document.querySelectorAll(".mode-card").forEach(card => {
  card.addEventListener("click", () => {
    if (isSearching) return;
    document.querySelectorAll(".mode-card").forEach(c => c.classList.remove("active"));
    card.classList.add("active");
    selectedMode = card.dataset.mode;
    const rp = document.getElementById("role-preview");
    if (selectedMode === "roleplay") {
      assignedRole = ROLES[Math.floor(Math.random()*ROLES.length)];
      document.getElementById("role-display").textContent = assignedRole;
      rp.style.display = "block";
    } else {
      assignedRole = null;
      rp.style.display = "none";
    }
  });
});

document.getElementById("btn-find-chat").addEventListener("click", async () => {
  if (!currentUser || isSearching) return;
  isSearching = true;
  document.getElementById("btn-find-chat").style.display = "none";
  document.getElementById("waiting-state").style.display = "block";

  // Clean any stale state
  await deleteDoc(doc(db, "waiting", currentUser.uid)).catch(()=>{});
  await deleteDoc(doc(db, "userRoom", currentUser.uid)).catch(()=>{});

  try { await findOrWait(); }
  catch(e) { toast(e.message, true); resetUI(); }
});

async function findOrWait() {
  const snap = await getDocs(query(collection(db,"waiting"), where("mode","==",selectedMode), limit(10)));
  const others = snap.docs.filter(d => d.data().uid !== currentUser.uid);

  if (others.length > 0) {
    let matched = false;
    try {
      await runTransaction(db, async tx => {
        const fresh = await tx.get(others[0].ref);
        if (!fresh.exists()) return;
        const p = fresh.data();
        matched = true;
        const roomRef = doc(collection(db,"rooms"));
        tx.set(roomRef, { users:[currentUser.uid, p.uid], mode:selectedMode, createdAt:serverTimestamp(), active:true });
        tx.set(doc(db,"userRoom",currentUser.uid), { roomId:roomRef.id, partnerId:p.uid, myRole:assignedRole, partnerRole:p.role||null, mode:selectedMode });
        tx.set(doc(db,"userRoom",p.uid), { roomId:roomRef.id, partnerId:currentUser.uid, myRole:p.role||null, partnerRole:assignedRole, mode:selectedMode });
        tx.delete(others[0].ref);
      });
      if (matched) { window.location.href = "chat.html"; return; }
    } catch(e) { console.log("tx failed:", e.message); }
  }

  // Join waiting
  await setDoc(doc(db,"waiting",currentUser.uid), { uid:currentUser.uid, mode:selectedMode, role:assignedRole||null, createdAt:serverTimestamp() });
  waitingUnsub = onSnapshot(doc(db,"userRoom",currentUser.uid), s => {
    if (s.exists()) {
      if (waitingUnsub) { waitingUnsub(); waitingUnsub = null; }
      window.location.href = "chat.html";
    }
  });
}

document.getElementById("btn-cancel").addEventListener("click", async () => {
  if (waitingUnsub) { waitingUnsub(); waitingUnsub = null; }
  await deleteDoc(doc(db,"waiting",currentUser.uid)).catch(()=>{});
  resetUI();
});

function resetUI() {
  isSearching = false;
  document.getElementById("waiting-state").style.display = "none";
  document.getElementById("btn-find-chat").style.display = "inline-flex";
}

document.getElementById("btn-logout").addEventListener("click", async () => {
  if (waitingUnsub) { waitingUnsub(); waitingUnsub = null; }
  cleanup();
  await signOut(auth);
  window.location.href = "index.html";
});

function toast(msg, err=false) {
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#111;border:1px solid ${err?"#f87171":"#4ade80"};color:${err?"#f87171":"#4ade80"};padding:10px 20px;border-radius:12px;font-size:.85rem;z-index:9999`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 3500);
}
