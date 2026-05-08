// js/chat.js — WhisperNet Chat Logic (Improved v2)
import { auth, db } from "./firebase-init.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc,
  collection, query, orderBy, onSnapshot, serverTimestamp,
  writeBatch, getDocs, increment
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
  "მყუდრო ღამე თუ ხმაური? 🌙",
  "გყავს საუკეთესო მეგობარი?",
  "ცხოვრებაში ყველაზე ბედნიერი მომენტი?",
  "რა გაღიზიანებს ყველაზე მეტად?"
];

// ---- Emoji Reactions ----
const REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "🔥"];

let currentUser = null;
let roomData = null;
let partnerProfile = null;
let roomId = null;
let messagesUnsub = null;
let typingUnsub = null;
let roomUnsub = null;
let typingTimeout = null;
let liked = false;
let questionsVisible = false;
let partnerLeft = false;
let chatStartTime = Date.now();

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

  // Verify room still exists and is active
  const roomDocSnap = await getDoc(doc(db, "rooms", roomId));
  if (!roomDocSnap.exists() || roomDocSnap.data()?.active === false) {
    await deleteDoc(doc(db, "userRoom", currentUser.uid)).catch(() => {});
    window.location.href = "lobby.html";
    return;
  }

  // Load partner
  const partnerSnap = await getDoc(doc(db, "users", roomData.partnerId));
  partnerProfile = partnerSnap.exists() ? partnerSnap.data() : { name: "ანონიმი", emoji: "👤" };

  renderPartnerHeader();
  renderRoleBanner();
  initMessages();
  initTypingListener();
  initQuickQuestions();
  listenForPartnerLeave(); // now called immediately after roomId is set

  // Update message count
  updateDoc(doc(db, "rooms", roomId), { lastActivity: serverTimestamp() }).catch(() => {});
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
        if (change.doc.data().uid !== currentUser.uid) {
          updateDoc(change.doc.ref, { read: true }).catch(() => {});
        }
      } else if (change.type === "modified") {
        // Update read status / reactions in existing bubble
        const existing = document.querySelector(`.msg[data-id="${change.doc.id}"]`);
        if (existing) {
          const readSpan = existing.querySelector(".msg-read");
          if (readSpan && change.doc.data().uid === currentUser.uid) {
            readSpan.textContent = change.doc.data().read ? "✓✓" : "✓";
            if (change.doc.data().read) readSpan.classList.add("read-blue");
          }
          // Update reactions
          renderReactionsOnBubble(existing, change.doc.data().reactions || {});
        }
      }
    });
    scrollToBottom();
  });
}

function renderMessage(data, id) {
  const isMine = data.uid === currentUser.uid;
  const container = document.getElementById("messages-container");

  const hint = container.querySelector(".chat-start-hint");
  if (hint) hint.remove();

  // Avoid duplicate render
  if (document.querySelector(`.msg[data-id="${id}"]`)) return;

  const msgEl = document.createElement("div");
  msgEl.className = `msg ${isMine ? "mine" : "theirs"}`;
  msgEl.dataset.id = id;

  const time = data.createdAt?.toDate
    ? data.createdAt.toDate().toLocaleTimeString("ka-GE", { hour: "2-digit", minute: "2-digit" })
    : "";

  msgEl.innerHTML = `
    <div class="bubble" data-msgid="${id}">${escapeHtml(data.text)}</div>
    <div class="msg-meta">
      <span class="msg-time">${time}</span>
      ${isMine ? `<span class="msg-read ${data.read ? 'read-blue' : ''}">${data.read ? "✓✓" : "✓"}</span>` : ""}
    </div>
    <div class="msg-reactions" id="reactions-${id}"></div>
  `;

  // Long-press / right-click for reactions
  const bubble = msgEl.querySelector(".bubble");
  let pressTimer;

  bubble.addEventListener("mousedown", (e) => {
    pressTimer = setTimeout(() => showReactionPicker(id, msgEl, isMine), 500);
  });
  bubble.addEventListener("mouseup", () => clearTimeout(pressTimer));
  bubble.addEventListener("mouseleave", () => clearTimeout(pressTimer));
  bubble.addEventListener("touchstart", (e) => {
    pressTimer = setTimeout(() => showReactionPicker(id, msgEl, isMine), 500);
  }, { passive: true });
  bubble.addEventListener("touchend", () => clearTimeout(pressTimer));
  bubble.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showReactionPicker(id, msgEl, isMine);
  });

  container.appendChild(msgEl);

  if (data.reactions) renderReactionsOnBubble(msgEl, data.reactions);
}

// ---- Reaction Picker ----
function showReactionPicker(msgId, msgEl, isMine) {
  // Remove any existing picker
  document.querySelectorAll(".reaction-picker").forEach(p => p.remove());

  const picker = document.createElement("div");
  picker.className = "reaction-picker";
  REACTIONS.forEach(emoji => {
    const btn = document.createElement("button");
    btn.className = "reaction-btn";
    btn.textContent = emoji;
    btn.addEventListener("click", async () => {
      picker.remove();
      await addReaction(msgId, emoji);
    });
    picker.appendChild(btn);
  });

  msgEl.appendChild(picker);

  // Auto-close
  setTimeout(() => picker.remove(), 3000);
  document.addEventListener("click", () => picker.remove(), { once: true });
}

async function addReaction(msgId, emoji) {
  const msgRef = doc(db, "rooms", roomId, "messages", msgId);
  const snap = await getDoc(msgRef);
  if (!snap.exists()) return;
  const reactions = snap.data().reactions || {};
  // Toggle: if user already reacted with this emoji, remove it
  const key = `${emoji}_${currentUser.uid}`;
  if (reactions[key]) {
    delete reactions[key];
  } else {
    reactions[key] = emoji;
  }
  await updateDoc(msgRef, { reactions }).catch(() => {});
}

function renderReactionsOnBubble(msgEl, reactions) {
  const container = msgEl.querySelector(".msg-reactions");
  if (!container) return;

  // Count reactions by emoji
  const counts = {};
  Object.values(reactions).forEach(emoji => {
    counts[emoji] = (counts[emoji] || 0) + 1;
  });

  container.innerHTML = "";
  Object.entries(counts).forEach(([emoji, count]) => {
    const badge = document.createElement("span");
    badge.className = "reaction-badge";
    badge.textContent = `${emoji} ${count}`;
    container.appendChild(badge);
  });
}

function scrollToBottom(smooth = false) {
  const c = document.getElementById("messages-container");
  if (smooth) {
    c.scrollTo({ top: c.scrollHeight, behavior: "smooth" });
  } else {
    c.scrollTop = c.scrollHeight;
  }
}

// ---- Send Message ----
async function sendMessage(text) {
  if (!text.trim() || !roomId || partnerLeft) return;
  const msgsRef = collection(db, "rooms", roomId, "messages");
  await addDoc(msgsRef, {
    uid: currentUser.uid,
    text: text.trim(),
    createdAt: serverTimestamp(),
    read: false,
    reactions: {}
  });
  updateDoc(doc(db, "rooms", roomId), {
    lastActivity: serverTimestamp(),
    messageCount: increment(1)
  }).catch(() => {});
  // Clear typing
  setDoc(doc(db, "rooms", roomId, "typing", currentUser.uid), { isTyping: false }, { merge: true }).catch(() => {});
  clearTimeout(typingTimeout);
}

document.getElementById("btn-send").addEventListener("click", () => {
  const input = document.getElementById("msg-input");
  const text = input.value.trim();
  if (!text) return;
  sendMessage(text);
  input.value = "";
  autoResize(input);
});

document.getElementById("msg-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const input = e.target;
    const text = input.value.trim();
    if (!text) return;
    sendMessage(text);
    input.value = "";
    autoResize(input);
  }
});

// ---- Typing Indicator ----
document.getElementById("msg-input").addEventListener("input", (e) => {
  autoResize(e.target);
  if (!roomId || partnerLeft) return;
  setDoc(doc(db, "rooms", roomId, "typing", currentUser.uid), {
    isTyping: true,
    name: currentUser.displayName || "..."
  }, { merge: true });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    setDoc(doc(db, "rooms", roomId, "typing", currentUser.uid), { isTyping: false }, { merge: true }).catch(() => {});
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
  }, () => { /* ignore errors after room delete */ });
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
      sendMessage(q);
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

  // Show likes count
  const likesCount = document.getElementById("modal-likes-count");
  if (likesCount) likesCount.textContent = partnerProfile.likes || 0;

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

// ---- Like (with Firestore increment) ----
document.getElementById("btn-like").addEventListener("click", async () => {
  if (liked) return;
  liked = true;
  document.getElementById("like-icon").textContent = "❤️";
  document.getElementById("like-label").textContent = "მოგეწონა!";
  document.getElementById("btn-like").classList.add("liked");
  // Use increment to avoid race condition
  await updateDoc(doc(db, "users", roomData.partnerId), {
    likes: increment(1)
  }).catch(() => {});
});

// ---- Leave Chat / Cleanup ----
async function leaveChat() {
  // Stop all listeners first
  if (messagesUnsub) { messagesUnsub(); messagesUnsub = null; }
  if (typingUnsub) { typingUnsub(); typingUnsub = null; }
  if (roomUnsub) { roomUnsub(); roomUnsub = null; }

  if (roomId) {
    try {
      const batch = writeBatch(db);

      // Delete all messages
      const msgsSnap = await getDocs(collection(db, "rooms", roomId, "messages"));
      msgsSnap.forEach(d => batch.delete(d.ref));

      // Delete typing subcollection
      const typingSnap = await getDocs(collection(db, "rooms", roomId, "typing"));
      typingSnap.forEach(d => batch.delete(d.ref));

      // Mark room inactive (partner will see this)
      batch.update(doc(db, "rooms", roomId), { active: false });

      // Delete BOTH users' userRoom docs
      batch.delete(doc(db, "userRoom", currentUser.uid));

      await batch.commit();

      // Delete room doc separately (after batch)
      await deleteDoc(doc(db, "rooms", roomId)).catch(() => {});
    } catch (err) {
      console.error("Error during cleanup:", err);
    }
  }

  window.location.href = "lobby.html";
}

document.getElementById("btn-leave").addEventListener("click", async () => {
  if (confirm("ჩატიდან გამოხვალ?")) {
    await leaveChat();
  }
});

// Cleanup on page close
window.addEventListener("beforeunload", () => {
  if (roomId) {
    // Best effort sync cleanup
    updateDoc(doc(db, "rooms", roomId), { active: false }).catch(() => {});
    deleteDoc(doc(db, "userRoom", currentUser.uid)).catch(() => {});
  }
});

// ---- Listen for partner leaving ----
function listenForPartnerLeave() {
  const roomRef = doc(db, "rooms", roomId);
  roomUnsub = onSnapshot(roomRef, (snap) => {
    if (!snap.exists() || snap.data()?.active === false) {
      if (partnerLeft) return; // already handled
      partnerLeft = true;

      // Clean up listeners
      if (typingUnsub) { typingUnsub(); typingUnsub = null; }

      appendSystemMsg("პარტნიორი გამოვიდა ჩატიდან 👋");
      document.getElementById("btn-send").disabled = true;
      document.getElementById("msg-input").disabled = true;
      document.getElementById("partner-status").textContent = "გამოვიდა";
      document.getElementById("partner-status").style.color = "var(--danger)";
      document.getElementById("typing-indicator").style.display = "none";

      // Show "new chat" button
      showNewChatButton();
    }
  }, () => { /* ignore errors */ });
}

function showNewChatButton() {
  const existing = document.getElementById("btn-new-chat");
  if (existing) return;
  const btn = document.createElement("button");
  btn.id = "btn-new-chat";
  btn.className = "btn-new-chat";
  btn.innerHTML = "⚡ ახალი ჩატი";
  btn.addEventListener("click", async () => {
    // Clean up current userRoom
    await deleteDoc(doc(db, "userRoom", currentUser.uid)).catch(() => {});
    window.location.href = "lobby.html";
  });
  document.querySelector(".chat-footer").prepend(btn);
}

function appendSystemMsg(text) {
  const container = document.getElementById("messages-container");
  const el = document.createElement("div");
  el.className = "msg-system";
  el.textContent = text;
  container.appendChild(el);
  scrollToBottom(true);
}

// ---- Utils ----
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
