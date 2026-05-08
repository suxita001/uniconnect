// js/chat.js — WhisperNet Chat Logic
import { auth, db } from "./firebase-init.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc,
  collection, query, orderBy, onSnapshot, serverTimestamp,
  writeBatch, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---- Quick Questions ----
const QUICK_QUESTIONS = [
  "გამარჯობა! 👋 როგორ ხარ?",
  "სად ხარ ახლა?",
  "რა გიყვარს ყველაზე მეტად ცხოვრებაში?",
  "ბოლო ნანახი ფილმი?",
  "ყველაზე სასაცილო ამბავი?",
  "მუსიკა გიყვარს?",
  "ოცნება გაქვს?",
  "ბედნიერი ხარ?",
  "ვინ ხარ სინამდვილეში? 🤔",
  "თუ შეეძლო, სად გაემგზავრებოდი?",
  "ყველაზე გიჟური რამ?",
  "მყუდრო ღამე თუ ხმაური? 🌙"
];

let currentUser = null;
let roomData = null;
let partnerProfile = null;
let roomId = null;
let messagesUnsub = null;
let typingUnsub = null;
let typingTimeout = null;
let liked = false;
let questionsVisible = false;

// ---- Auth Guard ----
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  currentUser = user;
  await initChat();
});

// ---- Init ----
async function initChat() {
  const roomSnap = await getDoc(doc(db, "userRoom", currentUser.uid));
  if (!roomSnap.exists()) { window.location.href = "lobby.html"; return; }
  roomData = roomSnap.data();
  roomId = roomData.roomId;

  // Load partner
  const partnerSnap = await getDoc(doc(db, "users", roomData.partnerId));
  partnerProfile = partnerSnap.exists() ? partnerSnap.data() : { name: "ანონიმი", emoji: "👤" };

  renderPartnerHeader();
  renderRoleBanner();
  initMessages();
  initTypingListener();
  initQuickQuestions();
}

// ---- Render Header ----
function renderPartnerHeader() {
  document.getElementById("header-name").textContent = partnerProfile.name || "ანონიმი";
  const av = document.getElementById("header-avatar");
  if (partnerProfile.photoURL) {
    av.innerHTML = `<img src="${partnerProfile.photoURL}" alt="avatar"/>`;
  } else {
    av.textContent = partnerProfile.emoji || "👤";
  }
}

// ---- Render Role Banner ----
function renderRoleBanner() {
  if (roomData.mode === "roleplay" && roomData.myRole) {
    document.getElementById("role-banner").style.display = "block";
    document.getElementById("my-role-display").textContent = roomData.myRole;
  }
}

// ---- Messages ----
function initMessages() {
  const msgsRef = collection(db, "rooms", roomId, "messages");
  const q = query(msgsRef, orderBy("createdAt", "asc"));
  messagesUnsub = onSnapshot(q, (snap) => {
    snap.docChanges().forEach(change => {
      if (change.type === "added") {
        renderMessage(change.doc.data(), change.doc.id);
        // Mark as read if from partner
        if (change.doc.data().uid !== currentUser.uid) {
          updateDoc(change.doc.ref, { read: true });
        }
      }
    });
    scrollToBottom();
  });
}

function renderMessage(data, id) {
  const isMine = data.uid === currentUser.uid;
  const container = document.getElementById("messages-container");

  // Remove start hint on first message
  const hint = container.querySelector(".chat-start-hint");
  if (hint) hint.remove();

  const msgEl = document.createElement("div");
  msgEl.className = `msg ${isMine ? "mine" : "theirs"}`;
  msgEl.dataset.id = id;

  const time = data.createdAt?.toDate
    ? data.createdAt.toDate().toLocaleTimeString("ka-GE", { hour: "2-digit", minute: "2-digit" })
    : "";

  msgEl.innerHTML = `
    <div class="bubble">${escapeHtml(data.text)}</div>
    <div style="display:flex;gap:4px;align-items:center">
      <span class="msg-time">${time}</span>
      ${isMine ? `<span class="msg-read">${data.read ? "✓✓" : "✓"}</span>` : ""}
    </div>
  `;
  container.appendChild(msgEl);
}

function scrollToBottom() {
  const c = document.getElementById("messages-container");
  c.scrollTop = c.scrollHeight;
}

// ---- Send Message ----
async function sendMessage(text) {
  if (!text.trim() || !roomId) return;
  const msgsRef = collection(db, "rooms", roomId, "messages");
  await addDoc(msgsRef, {
    uid: currentUser.uid,
    text: text.trim(),
    createdAt: serverTimestamp(),
    read: false
  });
  // Clear typing
  updateDoc(doc(db, "rooms", roomId, "typing", currentUser.uid), { isTyping: false }).catch(() => {});
}

document.getElementById("btn-send").addEventListener("click", () => {
  const input = document.getElementById("msg-input");
  sendMessage(input.value);
  input.value = "";
  autoResize(input);
});

document.getElementById("msg-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const input = e.target;
    sendMessage(input.value);
    input.value = "";
    autoResize(input);
  }
});

// ---- Typing Indicator ----
document.getElementById("msg-input").addEventListener("input", (e) => {
  autoResize(e.target);
  if (!roomId) return;
  setDoc(doc(db, "rooms", roomId, "typing", currentUser.uid), {
    isTyping: true, name: currentUser.displayName || "..."
  }, { merge: true });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    updateDoc(doc(db, "rooms", roomId, "typing", currentUser.uid), { isTyping: false }).catch(() => {});
  }, 2500);
});

function initTypingListener() {
  const typingRef = doc(db, "rooms", roomId, "typing", roomData.partnerId);
  typingUnsub = onSnapshot(typingRef, (snap) => {
    const indicator = document.getElementById("typing-indicator");
    if (snap.exists() && snap.data().isTyping) {
      document.getElementById("typing-name").textContent = partnerProfile.name || "ანონიმი";
      indicator.style.display = "flex";
    } else {
      indicator.style.display = "none";
    }
  });
}

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 100) + "px";
}

// ---- Quick Questions ----
function initQuickQuestions() {
  const scroll = document.getElementById("qq-scroll");
  QUICK_QUESTIONS.forEach(q => {
    const chip = document.createElement("button");
    chip.className = "qq-chip";
    chip.textContent = q;
    chip.addEventListener("click", () => {
      const input = document.getElementById("msg-input");
      input.value = q;
      sendMessage(q);
      input.value = "";
      toggleQuestions(false);
    });
    scroll.appendChild(chip);
  });
}

document.getElementById("btn-questions").addEventListener("click", () => {
  toggleQuestions(!questionsVisible);
});

function toggleQuestions(show) {
  questionsVisible = show;
  document.getElementById("quick-questions-panel").style.display = show ? "block" : "none";
  document.getElementById("btn-questions").style.borderColor = show ? "var(--accent-2)" : "";
}

// ---- Partner Profile Modal ----
document.getElementById("btn-view-profile").addEventListener("click", openProfileModal);

function openProfileModal() {
  const modal = document.getElementById("profile-modal");
  const av = document.getElementById("modal-avatar");
  document.getElementById("modal-name").textContent = partnerProfile.name || "ანონიმი";
  document.getElementById("modal-gender").textContent = partnerProfile.genderLabel || "";

  if (partnerProfile.photoURL) {
    av.innerHTML = `<img src="${partnerProfile.photoURL}" alt="avatar"/>`;
  } else {
    av.textContent = partnerProfile.emoji || "👤";
  }

  if (roomData.mode === "roleplay" && roomData.partnerRole) {
    const badge = document.getElementById("modal-role-badge");
    badge.style.display = "inline-block";
    badge.textContent = "🎭 " + roomData.partnerRole;
  }

  document.getElementById("like-icon").textContent = liked ? "❤️" : "🤍";
  document.getElementById("like-label").textContent = liked ? "მოგეწონა!" : "მომწონს";
  modal.style.display = "flex";
}

document.getElementById("modal-close").addEventListener("click", () => {
  document.getElementById("profile-modal").style.display = "none";
});
document.getElementById("profile-modal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = "none";
});

// ---- Like ----
document.getElementById("btn-like").addEventListener("click", async () => {
  if (liked) return;
  liked = true;
  document.getElementById("like-icon").textContent = "❤️";
  document.getElementById("like-label").textContent = "მოგეწონა!";
  document.getElementById("btn-like").classList.add("liked");
  // Increment partner's likes
  const partnerRef = doc(db, "users", roomData.partnerId);
  const pSnap = await getDoc(partnerRef);
  if (pSnap.exists()) {
    await updateDoc(partnerRef, { likes: (pSnap.data().likes || 0) + 1 });
  }
});

// ---- Leave Chat / Cleanup ----
async function leaveChat() {
  if (messagesUnsub) messagesUnsub();
  if (typingUnsub) typingUnsub();

  if (roomId) {
    // Delete all messages
    const msgsSnap = await getDocs(collection(db, "rooms", roomId, "messages"));
    const batch = writeBatch(db);
    msgsSnap.forEach(d => batch.delete(d.ref));
    // Delete typing
    const typingSnap = await getDocs(collection(db, "rooms", roomId, "typing"));
    typingSnap.forEach(d => batch.delete(d.ref));
    // Delete room
    batch.delete(doc(db, "rooms", roomId));
    batch.delete(doc(db, "userRoom", currentUser.uid));
    await batch.commit();
  }

  window.location.href = "lobby.html";
}

document.getElementById("btn-leave").addEventListener("click", async () => {
  if (confirm("ჩატიდან გამოხვალ? ჩატი წაიშლება.")) {
    await leaveChat();
  }
});

// Cleanup on close
window.addEventListener("beforeunload", () => {
  if (roomId) {
    deleteDoc(doc(db, "userRoom", currentUser.uid));
    updateDoc(doc(db, "rooms", roomId), { active: false }).catch(() => {});
  }
});

// ---- Listen for partner leaving ----
function listenForPartnerLeave() {
  const roomRef = doc(db, "rooms", roomId);
  onSnapshot(roomRef, (snap) => {
    if (!snap.exists() || snap.data()?.active === false) {
      appendSystemMsg("პარტნიორი გამოვიდა ჩატიდან 👋");
      document.getElementById("btn-send").disabled = true;
      document.getElementById("partner-status").textContent = "გამოვიდა";
      document.getElementById("partner-status").style.color = "var(--danger)";
    }
  });
}

function appendSystemMsg(text) {
  const container = document.getElementById("messages-container");
  const el = document.createElement("div");
  el.className = "msg-system";
  el.textContent = text;
  container.appendChild(el);
  scrollToBottom();
}

// ---- Utils ----
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Start partner leave listener after init
setTimeout(() => {
  if (roomId) listenForPartnerLeave();
}, 2000);