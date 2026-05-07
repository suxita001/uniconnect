/* ═══════════════════════════════════════════
   UNICONNECT — script.js v2
   Full-featured: Auth, Posts, Chat, Profiles,
   CV, Applications, Notifications, Search
   ═══════════════════════════════════════════ */

// ── FIREBASE CONFIG ──────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyDtzRY0zJt0tTDua3GVNmbSZ64w5IWi7TE",
    authDomain: "agroweb-aad4a.firebaseapp.com",
    projectId: "agroweb-aad4a",
    storageBucket: "agroweb-aad4a.firebasestorage.app",
    messagingSenderId: "884211692036",
    appId: "1:884211692036:web:a4df9bf520ceaf088bbb51"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ── GLOBAL STATE ─────────────────────────────────
let currentUser     = null;
let currentUserData = null;
let allPosts        = [];
let savedPosts      = [];
let currentType     = 'all';
let currentPostId   = null;
let currentPostAuthorId = null;
let viewMode        = 'list';
let postsPerPage    = 10;
let postsShown      = 10;
let currentConvId   = null;
let convUnsubscribe = null;
let allConversations = [];
let viewingProfileId = null;
let notifUnsubscribe = null;
let notifOpen = false;

// ── PAGE LOAD ─────────────────────────────────────
window.addEventListener('load', () => {
    setTimeout(() => {
        const loader = document.getElementById('page-loader');
        if (loader) loader.classList.add('done');
    }, 900);
});

// ── TOAST ─────────────────────────────────────────
function toast(msg, type = 'info', dur = 3500) {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span>${{success:'✅',error:'❌',info:'ℹ️'}[type]||'ℹ️'}</span><span>${msg}</span>`;
    c.appendChild(t);
    setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 400); }, dur);
}

// ── SECTION NAV ───────────────────────────────────
function showSection(id) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
    document.getElementById('hero-section').classList.add('hidden');
    const sec = document.getElementById(id);
    if (sec) sec.classList.remove('hidden');
    if (id === 'feed-section') {
        document.getElementById('hero-section').classList.remove('hidden');
        setTimeout(() => document.getElementById('main-content').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (id === 'profile-section' && currentUser) loadMyProfile();
    if (id === 'saved-section') renderSaved();
    if (id === 'dashboard-section' && currentUser) loadDashboard();
    if (id === 'my-posts-section' && currentUser) loadMyPosts(currentUser.uid);
}

function scrollToFeed() {
    document.getElementById('main-content').scrollIntoView({ behavior: 'smooth' });
}

// ── NAVBAR SCROLL ─────────────────────────────────
window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 30);
});

// ── USER MENU ─────────────────────────────────────
function toggleUserMenu() {
    const dd = document.getElementById('user-dropdown');
    dd.classList.toggle('hidden');
}
document.addEventListener('click', e => {
    const wrap = document.querySelector('.user-avatar-wrap');
    const dd = document.getElementById('user-dropdown');
    if (dd && wrap && !wrap.contains(e.target) && !dd.contains(e.target)) dd.classList.add('hidden');
    const notifPanel = document.getElementById('notif-panel');
    const notifBtn = document.getElementById('notif-btn');
    if (notifPanel && notifBtn && !notifPanel.contains(e.target) && !notifBtn.contains(e.target)) {
        notifPanel.classList.add('hidden');
        notifOpen = false;
    }
});

// ── AUTH STATE ────────────────────────────────────
auth.onAuthStateChanged(async user => {
    if (user) {
        currentUser = user;
        const snap = await db.collection('users').doc(user.uid).get();
        currentUserData = snap.data() || {};
        savedPosts = currentUserData.savedPosts || [];

        updateNavUser();
        subscribeNotifications();
        subscribeChatBadge();
        const cta = document.getElementById('sidebar-cta');
        if (cta) cta.style.display = 'none';
        document.querySelectorAll('.uni-company-only').forEach(el => {
            if (currentUserData.role === 'university' || currentUserData.role === 'company') {
                el.classList.remove('hidden');
            }
        });
    } else {
        currentUser = null;
        currentUserData = null;
        document.getElementById('auth-ui').classList.remove('hidden');
        document.getElementById('user-ui').classList.add('hidden');
    }
    loadPosts();
    loadActiveUnis();
    loadTagCloud();
});

function updateNavUser() {
    if (!currentUser || !currentUserData) return;
    document.getElementById('auth-ui').classList.add('hidden');
    document.getElementById('user-ui').classList.remove('hidden');
    const name = currentUserData.name || 'User';
    document.getElementById('dd-name').innerText = name;
    const roleLabels = { student: '🎓 სტუდენტი', university: '🏛️ უნივერსიტეტი', company: '🏢 კომპანია' };
    document.getElementById('dd-role').innerText = roleLabels[currentUserData.role] || '';
    setAvatarEl(document.getElementById('user-avatar-el'), currentUserData);
    setAvatarEl(document.getElementById('dd-avatar'), currentUserData);
    const saved = currentUserData.savedPosts || [];
    const badge = document.getElementById('saved-badge');
    if (saved.length > 0) { badge.classList.remove('hidden'); badge.innerText = saved.length; }
    else badge.classList.add('hidden');
}

function setAvatarEl(el, userData) {
    if (!el) return;
    if (userData && userData.avatarUrl) {
        el.innerHTML = `<img src="${userData.avatarUrl}" alt="">`;
    } else {
        el.innerHTML = userData ? (userData.name || 'U')[0].toUpperCase() : 'U';
    }
}

// ── POSTS ─────────────────────────────────────────
function loadPosts() {
    db.collection('posts').orderBy('createdAt', 'desc').onSnapshot(snap => {
        allPosts = [];
        snap.forEach(doc => allPosts.push({ id: doc.id, ...doc.data() }));
        applyFilters();
        updateStats();
        loadActiveUnis();
        loadTagCloud();
    });
}

function loadMyPosts(uid) {
    db.collection('posts').where('authorId', '==', uid).orderBy('createdAt', 'desc').onSnapshot(snap => {
        const myPosts = [];
        snap.forEach(doc => myPosts.push({ id: doc.id, ...doc.data() }));
        const list = document.getElementById('my-posts-list');
        const empty = document.getElementById('my-posts-empty');
        if (myPosts.length === 0) {
            list.innerHTML = '';
            if (empty) empty.classList.remove('hidden');
        } else {
            if (empty) empty.classList.add('hidden');
            list.innerHTML = myPosts.map(p => createPostCard(p, true)).join('');
        }
    });
}

function loadDashboard() {
    if (!currentUser) return;
    const uid = currentUser.uid;
    db.collection('posts').where('authorId', '==', uid).onSnapshot(snap => {
        const myPosts = [];
        snap.forEach(doc => myPosts.push({ id: doc.id, ...doc.data() }));
        const totalViews = myPosts.reduce((s, p) => s + (p.views || 0), 0);
        document.getElementById('d-total-posts').innerText = myPosts.length;
        document.getElementById('d-total-views').innerText = totalViews;
        document.getElementById('d-total-saves').innerText = (currentUserData?.savedPosts || []).length;
        const dlist = document.getElementById('dashboard-list');
        if (dlist) dlist.innerHTML = myPosts.map(p => createPostCard(p, true)).join('');
    });
    db.collection('applications').where('postAuthorId', '==', uid).orderBy('createdAt', 'desc').onSnapshot(snap => {
        document.getElementById('d-total-applications').innerText = snap.size;
        const list = document.getElementById('applications-list');
        if (!list) return;
        if (snap.empty) { list.innerHTML = '<p style="color:var(--soft);font-size:13px;padding:12px">განაცხადი ჯერ არ არის.</p>'; return; }
        list.innerHTML = '';
        snap.forEach(doc => {
            const a = doc.data();
            const div = document.createElement('div');
            div.className = 'app-card';
            div.innerHTML = `
                <div class="app-ava">${(a.applicantName || '?')[0].toUpperCase()}</div>
                <div style="flex:1">
                    <div class="app-name">${a.applicantName || '—'}</div>
                    <div class="app-post-title">${a.postTitle || '—'}</div>
                    ${a.message ? `<div class="app-msg">"${a.message}"</div>` : ''}
                    <div class="app-meta">
                        ${a.applicantEmail ? `<span>✉️ ${a.applicantEmail}</span>` : ''}
                        ${a.applicantPhone ? `<span>📞 ${a.applicantPhone}</span>` : ''}
                        ${a.cvLink ? `<span>📄 <a href="${a.cvLink}" target="_blank">CV</a></span>` : ''}
                    </div>
                </div>
            `;
            list.appendChild(div);
        });
    });
}

// ── FILTER / SEARCH ───────────────────────────────
const searchInput = document.getElementById('search-input');
let searchTimeout;
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        applyFilters();
        showSearchDropdown(searchInput.value.trim());
    }, 250);
});
searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) showSearchDropdown(searchInput.value.trim());
});

function showSearchDropdown(query) {
    const dd = document.getElementById('search-dropdown');
    if (!query || query.length < 2) { dd.classList.add('hidden'); return; }
    const results = allPosts.filter(p =>
        p.title?.toLowerCase().includes(query.toLowerCase()) ||
        p.authorName?.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 6);
    if (!results.length) { dd.classList.add('hidden'); return; }
    dd.innerHTML = results.map(p => `
        <div class="search-result-item" onclick="openPostDetails('${p.id}'); document.getElementById('search-dropdown').classList.add('hidden')">
            <span>${p.title}</span>
            <span class="sri-badge">${typeLabels[p.type]?.short || p.type}</span>
        </div>
    `).join('');
    dd.classList.remove('hidden');
}
document.addEventListener('click', e => {
    const dd = document.getElementById('search-dropdown');
    if (dd && !dd.contains(e.target) && e.target !== searchInput) dd.classList.add('hidden');
});

function filterByType(type, el) {
    currentType = type;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    postsShown = postsPerPage;
    applyFilters();
}

function applyFilters() {
    const query = searchInput.value.toLowerCase().trim();
    const sortBy = document.getElementById('sort-select').value;
    let filtered = [...allPosts];
    if (currentType !== 'all') filtered = filtered.filter(p => p.type === currentType);
    if (query) {
        filtered = filtered.filter(p =>
            p.title?.toLowerCase().includes(query) ||
            p.desc?.toLowerCase().includes(query) ||
            p.authorName?.toLowerCase().includes(query) ||
            p.location?.toLowerCase().includes(query) ||
            p.tags?.some(t => t.toLowerCase().includes(query))
        );
    }
    if (sortBy === 'popular')  filtered.sort((a,b) => (b.views||0)-(a.views||0));
    if (sortBy === 'deadline') filtered.sort((a,b) => {
        if (!a.deadline) return 1; if (!b.deadline) return -1;
        return new Date(a.deadline) - new Date(b.deadline);
    });
    const total = filtered.length;
    document.getElementById('results-count').innerText = `${total} შედეგი`;
    const list = document.getElementById('post-list');
    const noRes = document.getElementById('no-results');
    const loadWrap = document.getElementById('load-more-wrap');
    const visible = filtered.slice(0, postsShown);
    if (!visible.length) {
        list.innerHTML = '';
        noRes.classList.remove('hidden');
        if (loadWrap) loadWrap.classList.add('hidden');
    } else {
        noRes.classList.add('hidden');
        list.innerHTML = visible.map(p => createPostCard(p, currentUser?.uid === p.authorId)).join('');
        if (loadWrap) {
            if (postsShown < total) loadWrap.classList.remove('hidden');
            else loadWrap.classList.add('hidden');
        }
    }
}

function loadMorePosts() {
    postsShown += postsPerPage;
    applyFilters();
}

function setView(v, el) {
    viewMode = v;
    document.querySelectorAll('.vt-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    const list = document.getElementById('post-list');
    if (v === 'grid') list.classList.add('grid-view');
    else list.classList.remove('grid-view');
}

function searchTag(tag) {
    searchInput.value = tag;
    showSection('feed-section');
    applyFilters();
}

// ── POST CARD ─────────────────────────────────────
const typeLabels = {
    vacancy:   { label: '💼 ვაკანსია',   cls: 'tb-vacancy',   short: 'ვაკანსია' },
    volunteer: { label: '🤝 მოხალისე',   cls: 'tb-volunteer', short: 'მოხ.' },
    startup:   { label: '🚀 სტარტაპი',   cls: 'tb-startup',   short: 'სტარტაპი' },
    project:   { label: '📁 პროექტი',    cls: 'tb-project',   short: 'პროექტი' },
    event:     { label: '🎓 ღონისძიება', cls: 'tb-event',     short: 'ღონ.' },
    other:     { label: '📌 სხვა',       cls: 'tb-other',     short: 'სხვა' }
};
const formatLabels = { onsite: '📍 ოფლაინი', remote: '💻 Remote', hybrid: '🔀 Hybrid' };

function createPostCard(p, isOwner = false) {
    const t = typeLabels[p.type] || typeLabels.other;
    const sv = savedPosts.includes(p.id);
    const tags = (p.tags || []).slice(0, 4);
    const dl = p.deadline ? `<span><i class="fas fa-calendar-alt"></i>${p.deadline}</span>` : '';
    const sp = p.spots    ? `<span><i class="fas fa-users"></i>${p.spots}</span>` : '';
    const lc = p.location ? `<span><i class="fas fa-map-marker-alt"></i>${p.location}</span>` : '';
    return `
    <div class="post-card" onclick="openPostDetails('${p.id}')">
        <div class="post-card-top">
            <div>
                <div class="post-card-badges">
                    <span class="type-badge ${t.cls}">${t.label}</span>
                    ${p.format ? `<span class="format-badge">${formatLabels[p.format]||''}</span>` : ''}
                </div>
                <div class="post-title">${p.title}</div>
            </div>
            <button class="save-btn ${sv?'saved':''}" onclick="event.stopPropagation();toggleSavedItem('${p.id}')" title="შენახვა">
                <i class="fas fa-bookmark"></i>
            </button>
        </div>
        <div class="post-desc">${p.desc||''}</div>
        ${tags.length?`<div class="post-card-tags">${tags.map(tg=>`<span class="post-tag">#${tg}</span>`).join('')}</div>`:''}
        <div class="post-card-footer">
            <span><i class="fas fa-building"></i>${p.authorName||'—'}</span>
            ${lc}${dl}${sp}
            <span style="margin-left:auto"><i class="fas fa-eye"></i>${p.views||0}</span>
            ${isOwner?`
            <div class="card-owner-actions" onclick="event.stopPropagation()">
                <button class="card-apps-btn" onclick="openAppsForPost('${p.id}','${escapeHtml(p.title)}')"><i class="fas fa-inbox"></i> განაცხ.</button>
                <button class="card-delete-btn" onclick="deletePost('${p.id}')"><i class="fas fa-trash"></i></button>
            </div>`:''}
        </div>
    </div>`;
}

// ── POST DETAIL ───────────────────────────────────
function openPostDetails(postId) {
    currentPostId = postId;
    db.collection('posts').doc(postId).get().then(doc => {
        if (!doc.exists) return;
        const p = doc.data();
        currentPostAuthorId = p.authorId;
        const t = typeLabels[p.type] || typeLabels.other;
        const tb = document.getElementById('det-type-badge');
        tb.innerText = t.label; tb.className = `type-badge ${t.cls}`;
        document.getElementById('det-format-badge').innerText = p.format ? formatLabels[p.format] : '';
        document.getElementById('det-title').innerText = p.title;
        document.getElementById('det-desc').innerText = p.desc || '';

        // Author block
        const authorEl = document.getElementById('det-author');
        authorEl.innerHTML = `
            <div class="det-author-ava">${(p.authorName||'U')[0].toUpperCase()}</div>
            <div><div class="det-author-name">${p.authorName||'—'}</div><div class="det-author-role">${p.authorRole||''}</div></div>
            <i class="fas fa-chevron-right" style="margin-left:auto;color:var(--soft);font-size:11px"></i>
        `;

        // Meta
        const metaParts = [];
        if (p.location) metaParts.push(`<span><i class="fas fa-map-marker-alt"></i>${p.location}</span>`);
        if (p.deadline) metaParts.push(`<span><i class="fas fa-calendar-alt"></i>დედლაინი: ${p.deadline}</span>`);
        if (p.spots) metaParts.push(`<span><i class="fas fa-users"></i>${p.spots} ადგილი</span>`);
        document.getElementById('det-meta').innerHTML = metaParts.join('');

        const salRow = document.getElementById('det-salary-row');
        if (p.salary) { salRow.classList.remove('hidden'); document.getElementById('det-salary').innerText = p.salary; }
        else salRow.classList.add('hidden');

        // Tags
        document.getElementById('det-tags').innerHTML = (p.tags||[]).map(t=>`<span class="det-tag">#${t}</span>`).join('');

        // Contacts
        const contacts = [];
        if (p.contactEmail) contacts.push(`<a class="det-contact-email" href="mailto:${p.contactEmail}"><i class="fas fa-envelope"></i> ელ-ფოსტა</a>`);
        if (p.contactPhone) contacts.push(`<a class="det-contact-phone" href="tel:${p.contactPhone}"><i class="fas fa-phone"></i> დარეკვა</a>`);
        if (p.link) contacts.push(`<a class="det-contact-link" href="${p.link}" target="_blank"><i class="fas fa-external-link-alt"></i> ბმული</a>`);
        document.getElementById('det-contacts').innerHTML = contacts.join('');

        // Apply box
        const applyBox = document.getElementById('apply-box');
        if (!currentUser || currentUser.uid === p.authorId) applyBox.style.display = 'none';
        else applyBox.style.display = '';

        // Save btn
        document.getElementById('det-save-btn').classList.toggle('saved', savedPosts.includes(postId));

        // View count
        db.collection('posts').doc(postId).update({ views: firebase.firestore.FieldValue.increment(1) }).catch(()=>{});

        showModal('post-details-modal');
    });
}

// ── APPLICATIONS FOR POST ─────────────────────────
function openAppsForPost(postId, postTitle) {
    const list = document.getElementById('apps-list');
    const title = document.getElementById('apps-modal-title');
    if (title) title.innerText = `📨 განაცხადები — ${postTitle}`;
    list.innerHTML = '<p style="color:var(--soft);font-size:13px;padding:12px">იტვირთება...</p>';
    showModal('applications-modal');
    db.collection('applications').where('postId','==',postId).orderBy('createdAt','desc').get().then(snap => {
        if (snap.empty) { list.innerHTML = '<p style="color:var(--soft);font-size:13px;padding:12px">განაცხადი ჯერ არ არის.</p>'; return; }
        list.innerHTML = '';
        snap.forEach(doc => {
            const a = doc.data();
            const div = document.createElement('div');
            div.className = 'app-card';
            div.innerHTML = `
                <div class="app-ava">${(a.applicantName||'?')[0].toUpperCase()}</div>
                <div style="flex:1">
                    <div class="app-name">${a.applicantName||'—'}</div>
                    ${a.message?`<div class="app-msg">"${a.message}"</div>`:''}
                    <div class="app-meta">
                        ${a.applicantEmail?`<span>✉️ ${a.applicantEmail}</span>`:''}
                        ${a.applicantPhone?`<span>📞 ${a.applicantPhone}</span>`:''}
                        ${a.cvLink?`<span>📄 <a href="${a.cvLink}" target="_blank" onclick="event.stopPropagation()">CV</a></span>`:''}
                    </div>
                </div>
            `;
            list.appendChild(div);
        });
    });
}

// ── SEND APPLICATION ──────────────────────────────
async function sendApplication() {
    if (!currentUser) { toast('გთხოვთ შეხვიდეთ', 'error'); return; }
    const msg = document.getElementById('apply-message').value.trim();
    const cvLink = document.getElementById('apply-cv-link').value.trim();
    if (!msg && !cvLink) { toast('შეავსე მინიმუმ ერთი ველი', 'error'); return; }
    const post = allPosts.find(p => p.id === currentPostId);
    if (!post) return;
    // Check duplicate
    const dup = await db.collection('applications')
        .where('postId','==',currentPostId)
        .where('applicantId','==',currentUser.uid)
        .get();
    if (!dup.empty) { toast('უკვე გაგზავნილია განაცხადი ამ პოსტზე', 'info'); return; }
    try {
        await db.collection('applications').add({
            postId: currentPostId, postTitle: post.title, postAuthorId: post.authorId,
            applicantId: currentUser.uid, applicantName: currentUserData.name,
            applicantEmail: currentUserData.email || '', applicantPhone: currentUserData.phone || '',
            message: msg, cvLink, status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // Send notification to post author
        await sendNotification(post.authorId, {
            type: 'application', text: `${currentUserData.name}-მ გაგზავნა განაცხადი "${post.title}"-ზე`,
            postId: currentPostId, fromUserId: currentUser.uid, fromUserName: currentUserData.name
        });
        toast('განაცხადი გაიგზავნა! 🎉', 'success');
        document.getElementById('apply-message').value = '';
        document.getElementById('apply-cv-link').value = '';
        closeModal('post-details-modal');
    } catch(err) { toast('შეცდომა: '+err.message, 'error'); }
}

// ── CREATE POST ───────────────────────────────────
document.getElementById('add-post-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUser) { toast('გთხოვთ შეხვიდეთ', 'error'); return; }
    const btn = document.getElementById('submit-btn');
    btn.disabled = true; btn.innerHTML = 'იგზავნება... <i class="fas fa-spinner fa-spin"></i>';
    try {
        const tags = document.getElementById('p-tags').value.split(',').map(t=>t.trim()).filter(Boolean);
        await db.collection('posts').add({
            title:        document.getElementById('p-title').value.trim(),
            type:         document.getElementById('p-type').value,
            format:       document.getElementById('p-format').value,
            location:     document.getElementById('p-location').value.trim(),
            desc:         document.getElementById('p-desc').value.trim(),
            spots:        document.getElementById('p-spots').value || null,
            deadline:     document.getElementById('p-deadline').value || null,
            salary:       document.getElementById('p-salary').value.trim() || null,
            tags,
            contactEmail: document.getElementById('p-contact-email').value.trim() || null,
            contactPhone: document.getElementById('p-contact-phone').value.trim() || null,
            link:         document.getElementById('p-link').value.trim() || null,
            authorId: currentUser.uid, authorName: currentUserData.name,
            authorRole: currentUserData.role, views: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        toast('პოსტი გამოქვეყნდა! 🎉', 'success');
        e.target.reset();
        showSection('my-posts-section');
    } catch(err) { toast('შეცდომა: '+err.message, 'error'); }
    finally { btn.disabled = false; btn.innerHTML = 'გამოქვეყნება <i class="fas fa-paper-plane"></i>'; }
});

// ── DELETE POST ───────────────────────────────────
async function deletePost(postId) {
    if (!confirm('დარწმუნებული ხარ, რომ გსურს წაშლა?')) return;
    try {
        await db.collection('posts').doc(postId).delete();
        toast('პოსტი წაიშალა', 'success');
    } catch(err) { toast('შეცდომა: '+err.message, 'error'); }
}

// ── SAVED ─────────────────────────────────────────
async function toggleSavedItem(postId) {
    if (!currentUser) { toast('გთხოვთ შეხვიდეთ', 'info'); showModal('auth-modal'); return; }
    const idx = savedPosts.indexOf(postId);
    if (idx > -1) { savedPosts.splice(idx, 1); toast('ამოიღეთ შენახულიდან', 'info'); }
    else { savedPosts.push(postId); toast('შენახულია 🔖', 'success'); }
    await db.collection('users').doc(currentUser.uid).update({ savedPosts });
    if (currentUserData) currentUserData.savedPosts = savedPosts;
    const badge = document.getElementById('saved-badge');
    if (savedPosts.length > 0) { badge.classList.remove('hidden'); badge.innerText = savedPosts.length; }
    else badge.classList.add('hidden');
    applyFilters();
    const sb = document.getElementById('det-save-btn');
    if (sb && currentPostId === postId) sb.classList.toggle('saved', savedPosts.includes(postId));
}

function toggleSaved() {
    if (!currentUser) { showModal('auth-modal'); return; }
    showSection('saved-section');
}

function renderSaved() {
    const list = document.getElementById('saved-list');
    const empty = document.getElementById('saved-empty');
    if (!savedPosts.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    const wished = allPosts.filter(p => savedPosts.includes(p.id));
    list.innerHTML = wished.map(p => createPostCard(p)).join('');
}

// ── STATS ──────────────────────────────────────────
function updateStats() {
    document.getElementById('stat-posts').innerText = allPosts.length;
    const orgs = new Set(allPosts.filter(p => p.authorRole!=='student').map(p=>p.authorId)).size;
    const students = new Set(allPosts.filter(p => p.authorRole==='student').map(p=>p.authorId)).size;
    document.getElementById('stat-unis').innerText = orgs;
    document.getElementById('stat-students').innerText = students;
}

// ── ACTIVE UNIS SIDEBAR ───────────────────────────
function loadActiveUnis() {
    const map = {};
    allPosts.forEach(p => {
        if (p.authorId) {
            map[p.authorId] = map[p.authorId] || { name: p.authorName||'?', count:0, role: p.authorRole };
            map[p.authorId].count++;
        }
    });
    const sorted = Object.entries(map).sort((a,b)=>b[1].count-a[1].count).slice(0,5);
    const el = document.getElementById('active-unis-list');
    if (!el) return;
    el.innerHTML = sorted.map(([uid, info]) => `
        <div class="org-item" onclick="viewProfile('${uid}')">
            <div class="org-avatar">${info.name[0].toUpperCase()}</div>
            <div><div class="org-name">${info.name}</div><div class="org-count">${info.count} პოსტი</div></div>
        </div>
    `).join('') || '<p style="font-size:13px;color:var(--soft)">ჯერ ცარიელია</p>';
}

function loadTagCloud() {
    const tagCount = {};
    allPosts.forEach(p => (p.tags||[]).forEach(t => { tagCount[t] = (tagCount[t]||0)+1; }));
    const sorted = Object.entries(tagCount).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const el = document.getElementById('tag-cloud');
    if (!el) return;
    el.innerHTML = sorted.map(([t]) => `<span class="tag-pill" onclick="searchTag('${t}')">#${t}</span>`).join('') ||
        ['IT','Design','Marketing','Finance','Law'].map(t=>`<span class="tag-pill" onclick="searchTag('${t}')">#${t}</span>`).join('');
}

// ══════════════════════════════════════════════════
//   PROFILE SYSTEM
// ══════════════════════════════════════════════════

function loadMyProfile() {
    if (!currentUser || !currentUserData) return;
    renderProfilePage(currentUser.uid, currentUserData, true);
    loadProfilePosts(currentUser.uid, true);
    loadCVData(currentUser.uid, true);
}

function renderProfilePage(uid, data, isOwner) {
    const roleLabels = { student:'🎓 სტუდენტი', university:'🏛️ უნივერსიტეტი', company:'🏢 კომპანია' };

    // Cover
    const coverEl = document.getElementById('profile-cover-el');
    if (data.coverUrl) {
        coverEl.style.backgroundImage = `url(${data.coverUrl})`;
        coverEl.style.backgroundSize = 'cover';
        coverEl.style.backgroundPosition = 'center';
    }
    if (!isOwner) {
        const cb = document.getElementById('cover-edit-btn');
        if (cb) cb.style.display = 'none';
    }

    // Avatar
    const ava = document.getElementById('profile-avatar-el');
    if (data.avatarUrl) ava.innerHTML = `<img src="${data.avatarUrl}" alt="">`;
    else ava.innerHTML = (data.name||'U')[0].toUpperCase();

    const editBtn = document.querySelector('.avatar-edit-btn');
    if (editBtn) editBtn.style.display = isOwner ? '' : 'none';

    document.getElementById('profile-name-el').innerText = data.name || '';
    document.getElementById('profile-role-badge').innerText = roleLabels[data.role] || data.role || '';
    document.getElementById('profile-bio-el').innerText = data.bio || '';

    // Meta
    const uniEl = document.getElementById('pm-uni');
    if (data.university) { uniEl.classList.remove('hidden'); document.getElementById('pm-uni-text').innerText = data.university; }
    else uniEl.classList.add('hidden');
    const locEl = document.getElementById('pm-location');
    if (data.location) { locEl.classList.remove('hidden'); document.getElementById('pm-location-text').innerText = data.location; }
    else locEl.classList.add('hidden');
    const webEl = document.getElementById('pm-website');
    if (data.website) {
        webEl.classList.remove('hidden');
        const wLink = document.getElementById('pm-website-link');
        wLink.href = data.website; wLink.innerText = data.website.replace(/https?:\/\//, '');
    } else webEl.classList.add('hidden');
    document.getElementById('pm-joined-text').innerText = data.createdAt ? 'გაწევრიანდა ' + formatDate(data.createdAt.toDate?.() || new Date()) : '';

    // Skills
    const skills = data.skills || [];
    const skillsRow = document.getElementById('profile-skills-row');
    skillsRow.innerHTML = skills.map(s => `<span class="skill-tag">${s}</span>`).join('');

    // Actions
    const actionsEl = document.getElementById('profile-actions-el');
    if (isOwner) {
        actionsEl.innerHTML = `<button class="btn-primary" onclick="openEditProfile()"><i class="fas fa-edit"></i> პროფილის რედაქტირება</button>`;
    } else {
        actionsEl.innerHTML = `
            <button class="btn-primary" onclick="startChat('${uid}', '${escapeHtml(data.name||'')}')"><i class="fas fa-comment"></i> შეტყობინება</button>
        `;
    }

    // Show student tabs
    const stuTab = document.querySelector('.student-tab');
    if (stuTab) stuTab.classList.toggle('hidden', data.role !== 'student');

    // About tab
    renderAboutTab(data);

    // CV buttons - hide for non-owners
    document.querySelectorAll('#add-edu-btn, #add-exp-btn, #add-cert-btn').forEach(btn => {
        btn.style.display = isOwner ? '' : 'none';
    });
}

function renderAboutTab(data) {
    const roleLabels = { student:'სტუდენტი', university:'უნივერსიტეტი', company:'კომპანია' };
    const rows = [
        { key: 'სახელი', val: data.name },
        { key: 'როლი', val: roleLabels[data.role] || data.role },
        { key: 'ელ-ფოსტა', val: data.email },
        { key: 'ტელეფონი', val: data.phone },
        { key: 'ქალაქი', val: data.location },
        { key: 'უნივერსიტეტი', val: data.university },
        { key: 'სპეციალობა', val: data.faculty },
        { key: 'ვებ-საიტი', val: data.website },
        { key: 'Bio', val: data.bio },
    ].filter(r => r.val);
    document.getElementById('about-grid').innerHTML = rows.map(r => `
        <div class="about-row"><div class="about-key">${r.key}</div><div class="about-val">${r.val}</div></div>
    `).join('') || '<p style="color:var(--soft);font-size:13px">ინფო არ არის</p>';
}

function loadProfilePosts(uid, isOwner) {
    db.collection('posts').where('authorId','==',uid).orderBy('createdAt','desc').get().then(snap => {
        const posts = [];
        snap.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));
        const list = document.getElementById('profile-posts-list');
        const empty = document.getElementById('profile-posts-empty');
        if (!posts.length) {
            list.innerHTML = '';
            empty.classList.remove('hidden');
        } else {
            empty.classList.add('hidden');
            list.innerHTML = posts.map(p => createPostCard(p, isOwner)).join('');
        }
    });
}

function loadCVData(uid, isOwner) {
    // Education
    db.collection('users').doc(uid).collection('education').orderBy('startYear', 'desc').onSnapshot(snap => {
        const list = document.getElementById('education-list');
        if (!list) return;
        if (snap.empty) { list.innerHTML = '<p style="color:var(--soft);font-size:13px">განათლება არ არის დამატებული</p>'; return; }
        list.innerHTML = '';
        snap.forEach(doc => {
            const e = doc.data();
            const div = document.createElement('div');
            div.className = 'cv-item';
            div.innerHTML = `
                <div class="cv-item-header">
                    <div>
                        <div class="cv-item-title">${e.school||''}</div>
                        <div class="cv-item-org">${e.degree||''} ${e.field?'· '+e.field:''}</div>
                    </div>
                    <div class="cv-item-date">${e.startYear||''} – ${e.endYear||''}</div>
                </div>
                ${e.desc?`<div class="cv-item-desc">${e.desc}</div>`:''}
                ${isOwner?`<button class="cv-item-delete" onclick="deleteCVItem('education','${doc.id}')"><i class="fas fa-trash"></i></button>`:''}
            `;
            list.appendChild(div);
        });
    });
    // Experience
    db.collection('users').doc(uid).collection('experience').orderBy('startYear', 'desc').onSnapshot(snap => {
        const list = document.getElementById('experience-list');
        if (!list) return;
        if (snap.empty) { list.innerHTML = '<p style="color:var(--soft);font-size:13px">გამოცდილება არ არის</p>'; return; }
        list.innerHTML = '';
        snap.forEach(doc => {
            const e = doc.data();
            const div = document.createElement('div');
            div.className = 'cv-item';
            div.innerHTML = `
                <div class="cv-item-header">
                    <div>
                        <div class="cv-item-title">${e.position||''}</div>
                        <div class="cv-item-org">${e.company||''}</div>
                    </div>
                    <div class="cv-item-date">${e.startYear||''} – ${e.endYear||''}</div>
                </div>
                ${e.desc?`<div class="cv-item-desc">${e.desc}</div>`:''}
                ${isOwner?`<button class="cv-item-delete" onclick="deleteCVItem('experience','${doc.id}')"><i class="fas fa-trash"></i></button>`:''}
            `;
            list.appendChild(div);
        });
    });
    // Certificates
    db.collection('users').doc(uid).collection('certificates').orderBy('year', 'desc').onSnapshot(snap => {
        const list = document.getElementById('certificates-list');
        if (!list) return;
        if (snap.empty) { list.innerHTML = '<p style="color:var(--soft);font-size:13px">სერტიფიკატი არ არის</p>'; return; }
        list.innerHTML = '';
        snap.forEach(doc => {
            const c = doc.data();
            const div = document.createElement('div');
            div.className = 'cv-item';
            div.innerHTML = `
                <div class="cv-item-header">
                    <div>
                        <div class="cv-item-title">🏆 ${c.title||''}</div>
                        <div class="cv-item-org">${c.issuer||''}</div>
                    </div>
                    <div class="cv-item-date">${c.year||''}</div>
                </div>
                ${c.link?`<a href="${c.link}" target="_blank" class="cv-item-link"><i class="fas fa-external-link-alt"></i> სერტიფიკატი</a>`:''}
                ${isOwner?`<button class="cv-item-delete" onclick="deleteCVItem('certificates','${doc.id}')"><i class="fas fa-trash"></i></button>`:''}
            `;
            list.appendChild(div);
        });
    });
}

async function deleteCVItem(collection, docId) {
    if (!currentUser) return;
    if (!confirm('წაიშალოს?')) return;
    await db.collection('users').doc(currentUser.uid).collection(collection).doc(docId).delete();
    toast('წაიშალა', 'success');
}

function switchProfileTab(tab, el) {
    document.querySelectorAll('.ptab').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    document.querySelectorAll('.ptab-content').forEach(c => c.classList.add('hidden'));
    const content = document.getElementById(`ptab-${tab}`);
    if (content) content.classList.remove('hidden');
}

// EDIT PROFILE
function openEditProfile() {
    if (!currentUserData) return;
    document.getElementById('ep-name').value = currentUserData.name || '';
    document.getElementById('ep-bio').value = currentUserData.bio || '';
    document.getElementById('ep-location').value = currentUserData.location || '';
    document.getElementById('ep-website').value = currentUserData.website || '';
    document.getElementById('ep-university').value = currentUserData.university || '';
    document.getElementById('ep-faculty').value = currentUserData.faculty || '';
    document.getElementById('ep-skills').value = (currentUserData.skills||[]).join(', ');
    document.getElementById('ep-phone').value = currentUserData.phone || '';
    showModal('edit-profile-modal');
}

document.getElementById('edit-profile-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUser) return;
    const skills = document.getElementById('ep-skills').value.split(',').map(s=>s.trim()).filter(Boolean);
    const updates = {
        name: document.getElementById('ep-name').value.trim(),
        bio: document.getElementById('ep-bio').value.trim(),
        location: document.getElementById('ep-location').value.trim(),
        website: document.getElementById('ep-website').value.trim(),
        university: document.getElementById('ep-university').value.trim(),
        faculty: document.getElementById('ep-faculty').value.trim(),
        skills, phone: document.getElementById('ep-phone').value.trim()
    };
    try {
        await db.collection('users').doc(currentUser.uid).update(updates);
        Object.assign(currentUserData, updates);
        closeModal('edit-profile-modal');
        toast('პროფილი განახლდა! ✅', 'success');
        renderProfilePage(currentUser.uid, currentUserData, true);
        updateNavUser();
    } catch(err) { toast('შეცდომა: '+err.message, 'error'); }
});

// ADD CV ITEMS
function openAddEducation() { if (!currentUser) return; showModal('add-edu-modal'); }
function openAddExperience() { if (!currentUser) return; showModal('add-exp-modal'); }
function openAddCertificate() { if (!currentUser) return; showModal('add-cert-modal'); }

document.getElementById('add-edu-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid).collection('education').add({
            school: document.getElementById('edu-school').value.trim(),
            degree: document.getElementById('edu-degree').value.trim(),
            field: document.getElementById('edu-field').value.trim(),
            startYear: document.getElementById('edu-start').value.trim(),
            endYear: document.getElementById('edu-end').value.trim(),
            desc: document.getElementById('edu-desc').value.trim(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeModal('add-edu-modal'); e.target.reset(); toast('განათლება დაემატა ✅', 'success');
    } catch(err) { toast('შეცდომა: '+err.message, 'error'); }
});

document.getElementById('add-exp-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid).collection('experience').add({
            company: document.getElementById('exp-company').value.trim(),
            position: document.getElementById('exp-position').value.trim(),
            startYear: document.getElementById('exp-start').value.trim(),
            endYear: document.getElementById('exp-end').value.trim(),
            desc: document.getElementById('exp-desc').value.trim(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeModal('add-exp-modal'); e.target.reset(); toast('გამოცდილება დაემატა ✅', 'success');
    } catch(err) { toast('შეცდომა: '+err.message, 'error'); }
});

document.getElementById('add-cert-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid).collection('certificates').add({
            title: document.getElementById('cert-title').value.trim(),
            issuer: document.getElementById('cert-issuer').value.trim(),
            year: document.getElementById('cert-date').value.trim(),
            link: document.getElementById('cert-link').value.trim(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeModal('add-cert-modal'); e.target.reset(); toast('სერტიფიკატი დაემატა 🏆', 'success');
    } catch(err) { toast('შეცდომა: '+err.message, 'error'); }
});

// Avatar / Cover upload (base64 since no Storage)
function triggerAvatarUpload() {
    if (!currentUser) return;
    document.getElementById('avatar-input').click();
}
function triggerCoverUpload() {
    if (!currentUser) return;
    document.getElementById('cover-input').click();
}

async function uploadAvatar(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast('ფაილი ძალიან დიდია (მაქს. 2MB)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
        const dataUrl = e.target.result;
        try {
            await db.collection('users').doc(currentUser.uid).update({ avatarUrl: dataUrl });
            currentUserData.avatarUrl = dataUrl;
            const ava = document.getElementById('profile-avatar-el');
            ava.innerHTML = `<img src="${dataUrl}" alt="">`;
            updateNavUser();
            toast('ფოტო განახლდა! ✅', 'success');
        } catch(err) { toast('შეცდომა: '+err.message, 'error'); }
    };
    reader.readAsDataURL(file);
}

async function uploadCover(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast('ფაილი ძალიან დიდია (მაქს. 3MB)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
        const dataUrl = e.target.result;
        try {
            await db.collection('users').doc(currentUser.uid).update({ coverUrl: dataUrl });
            currentUserData.coverUrl = dataUrl;
            const coverEl = document.getElementById('profile-cover-el');
            coverEl.style.backgroundImage = `url(${dataUrl})`;
            coverEl.style.backgroundSize = 'cover';
            toast('Cover განახლდა! ✅', 'success');
        } catch(err) { toast('შეცდომა: '+err.message, 'error'); }
    };
    reader.readAsDataURL(file);
}

// VIEW OTHER PROFILES
async function viewProfile(uid) {
    if (!uid) return;
    if (currentUser && uid === currentUser.uid) { showSection('profile-section'); return; }
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) { toast('პროფილი ვერ მოიძებნა', 'error'); return; }
    const data = snap.data();
    const roleLabels = { student:'🎓 სტუდენტი', university:'🏛️ უნივერსიტეტი', company:'🏢 კომპანია' };
    const meta = [];
    if (data.university) meta.push(`<span><i class="fas fa-university"></i>${data.university}</span>`);
    if (data.location) meta.push(`<span><i class="fas fa-map-marker-alt"></i>${data.location}</span>`);
    if (data.website) meta.push(`<span><i class="fas fa-globe"></i><a href="${data.website}" target="_blank">${data.website.replace(/https?:\/\//,'')}</a></span>`);
    const skills = (data.skills||[]).map(s=>`<span class="skill-tag">${s}</span>`).join('');
    const avaHtml = data.avatarUrl ? `<img src="${data.avatarUrl}" alt="">` : (data.name||'U')[0].toUpperCase();
    const viewContent = document.getElementById('view-profile-content');
    viewContent.innerHTML = `
        <div class="vp-header">
            <div class="vp-avatar">${avaHtml}</div>
            <div>
                <div class="vp-name">${data.name||''}</div>
                <span class="vp-role">${roleLabels[data.role]||''}</span>
                ${data.bio?`<div class="vp-bio">${data.bio}</div>`:''}
                <div class="vp-meta">${meta.join('')}</div>
                ${skills?`<div class="vp-skills">${skills}</div>`:''}
            </div>
        </div>
        <div class="vp-actions">
            ${currentUser?`<button class="btn-primary" onclick="startChat('${uid}','${escapeHtml(data.name||'')}');closeModal('view-profile-modal')"><i class="fas fa-comment"></i> შეტყობინება</button>`:''}
        </div>
        <h4 style="margin:20px 0 12px;font-family:'Cabinet Grotesk';font-size:1rem">პოსტები</h4>
        <div id="vp-posts-list" class="post-list"></div>
    `;
    db.collection('posts').where('authorId','==',uid).orderBy('createdAt','desc').limit(5).get().then(snap => {
        const list = document.getElementById('vp-posts-list');
        if (!list) return;
        const posts = [];
        snap.forEach(doc => posts.push({id:doc.id,...doc.data()}));
        list.innerHTML = posts.length ? posts.map(p=>createPostCard(p,false)).join('') : '<p style="color:var(--soft);font-size:13px">პოსტი არ არის</p>';
    });
    showModal('view-profile-modal');
}

// ══════════════════════════════════════════════════
//   CHAT SYSTEM
// ══════════════════════════════════════════════════

function openChat() {
    if (!currentUser) { showModal('auth-modal'); return; }
    document.getElementById('chat-panel').classList.remove('hidden');
    document.getElementById('chat-overlay').classList.remove('hidden');
    loadConversations();
}
function closeChat() {
    document.getElementById('chat-panel').classList.add('hidden');
    document.getElementById('chat-overlay').classList.add('hidden');
    if (convUnsubscribe) { convUnsubscribe(); convUnsubscribe = null; }
    currentConvId = null;
}

async function startChat(targetUid, targetName) {
    if (!currentUser) { showModal('auth-modal'); return; }
    if (targetUid === currentUser.uid) { toast('შენთვის ვერ გაგზავნი', 'info'); return; }
    // Create or find conversation
    const convId = [currentUser.uid, targetUid].sort().join('_');
    const convRef = db.collection('conversations').doc(convId);
    const snap = await convRef.get();
    if (!snap.exists) {
        await convRef.set({
            participants: [currentUser.uid, targetUid],
            participantNames: { [currentUser.uid]: currentUserData.name, [targetUid]: targetName },
            lastMessage: '', lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
            unread: { [currentUser.uid]: 0, [targetUid]: 0 },
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    openChat();
    setTimeout(() => openConversation(convId, targetName), 300);
}

function loadConversations() {
    if (!currentUser) return;
    db.collection('conversations')
        .where('participants', 'array-contains', currentUser.uid)
        .orderBy('lastMessageAt', 'desc')
        .onSnapshot(snap => {
            allConversations = [];
            snap.forEach(doc => allConversations.push({ id: doc.id, ...doc.data() }));
            renderConversationList(allConversations);
            // Update chat badge
            let totalUnread = 0;
            allConversations.forEach(c => { totalUnread += (c.unread && c.unread[currentUser.uid]) || 0; });
            const badge = document.getElementById('chat-badge');
            if (totalUnread > 0) { badge.classList.remove('hidden'); badge.innerText = totalUnread; }
            else badge.classList.add('hidden');
        });
}

function renderConversationList(convs) {
    const list = document.getElementById('conversations-list');
    if (!list) return;
    const sidebar = document.querySelector('.chat-sidebar');
    if (!sidebar.querySelector('.new-chat-btn')) {
        const nb = document.createElement('div');
        nb.className = 'new-chat-btn';
        nb.innerHTML = `<button onclick="showNewChatSearch()"><i class="fas fa-edit"></i> ახალი შეტყობინება</button>`;
        sidebar.insertBefore(nb, list);
    }
    if (!convs.length) { list.innerHTML = '<p style="padding:16px;font-size:13px;color:var(--soft)">საუბარი ჯერ არ არის</p>'; return; }
    list.innerHTML = convs.map(conv => {
        const otherId = conv.participants.find(p => p !== currentUser.uid);
        const otherName = (conv.participantNames && conv.participantNames[otherId]) || 'მომხ.';
        const unread = (conv.unread && conv.unread[currentUser.uid]) || 0;
        const isActive = conv.id === currentConvId;
        return `
            <div class="conv-item ${isActive?'active':''}" onclick="openConversation('${conv.id}','${escapeHtml(otherName)}','${otherId}')">
                <div class="conv-ava">
                    ${otherName[0].toUpperCase()}
                    ${unread>0?`<div class="conv-unread-dot"></div>`:''}
                </div>
                <div class="conv-info">
                    <div class="conv-name">${otherName}</div>
                    <div class="conv-last">${conv.lastMessage||'შეტყობინება არ არის'}</div>
                </div>
            </div>
        `;
    }).join('');
}

function filterConversations() {
    const q = document.getElementById('chat-search-input').value.toLowerCase();
    const filtered = allConversations.filter(conv => {
        const otherId = conv.participants.find(p => p !== currentUser.uid);
        const name = (conv.participantNames && conv.participantNames[otherId]) || '';
        return name.toLowerCase().includes(q);
    });
    renderConversationList(filtered);
}

function showNewChatSearch() {
    const main = document.getElementById('chat-main');
    main.innerHTML = `
        <div style="padding:16px;flex:1;display:flex;flex-direction:column;gap:12px">
            <h4 style="font-family:'Cabinet Grotesk';font-size:1rem">ახალი შეტყობინება</h4>
            <input type="text" id="new-chat-name" placeholder="სახელი / ელ-ფოსტა..." style="border:2px solid var(--border);border-radius:var(--r-md);padding:10px 14px;font-size:14px;font-family:'DM Sans';outline:none" oninput="searchUsersForChat()">
            <div id="chat-user-results"></div>
        </div>
    `;
}

async function searchUsersForChat() {
    const q = document.getElementById('new-chat-name')?.value.trim().toLowerCase();
    const res = document.getElementById('chat-user-results');
    if (!q || q.length < 2) { if (res) res.innerHTML = ''; return; }
    const snap = await db.collection('users').get();
    const users = [];
    snap.forEach(doc => {
        if (doc.id === currentUser.uid) return;
        const d = doc.data();
        if ((d.name||'').toLowerCase().includes(q) || (d.email||'').toLowerCase().includes(q)) {
            users.push({ id: doc.id, ...d });
        }
    });
    if (!res) return;
    res.innerHTML = users.slice(0,6).map(u => `
        <div style="padding:10px;background:var(--bg);border-radius:var(--r-md);display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:6px;transition:0.2s" onclick="startChat('${u.id}','${escapeHtml(u.name||'')}')">
            <div style="width:36px;height:36px;background:var(--accent-pale);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--accent)">${(u.name||'U')[0].toUpperCase()}</div>
            <div><div style="font-weight:700;font-size:13px">${u.name||''}</div><div style="font-size:11px;color:var(--soft)">${u.email||''}</div></div>
        </div>
    `).join('') || '<p style="font-size:13px;color:var(--soft)">მომხმარებელი ვერ მოიძებნა</p>';
}

function openConversation(convId, otherName, otherId) {
    currentConvId = convId;
    renderConversationList(allConversations);
    const main = document.getElementById('chat-main');
    main.innerHTML = `
        <div class="chat-conv-header">
            <div style="width:34px;height:34px;background:var(--accent-pale);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--accent)">${otherName[0].toUpperCase()}</div>
            <div>
                <div class="chat-conv-name">${otherName}</div>
            </div>
        </div>
        <div class="messages-area" id="messages-area"></div>
        <div class="chat-input-area">
            <textarea id="chat-msg-input" placeholder="შეტყობინება..." rows="1" onkeydown="chatKeydown(event, '${convId}', '${otherId}', '${escapeHtml(otherName)}')"></textarea>
            <button class="chat-send-btn" onclick="sendMessage('${convId}', '${otherId}', '${escapeHtml(otherName)}')"><i class="fas fa-paper-plane"></i></button>
        </div>
    `;
    // Mark as read
    db.collection('conversations').doc(convId).update({ [`unread.${currentUser.uid}`]: 0 }).catch(()=>{});
    // Subscribe messages
    if (convUnsubscribe) convUnsubscribe();
    convUnsubscribe = db.collection('conversations').doc(convId).collection('messages')
        .orderBy('createdAt', 'asc')
        .onSnapshot(snap => {
            const area = document.getElementById('messages-area');
            if (!area) return;
            const atBottom = area.scrollHeight - area.scrollTop <= area.clientHeight + 50;
            area.innerHTML = snap.docs.map(doc => {
                const m = doc.data();
                const isSent = m.senderId === currentUser.uid;
                const time = m.createdAt ? formatTime(m.createdAt.toDate?.() || new Date()) : '';
                return `
                    <div class="msg-bubble ${isSent?'sent':'received'}">
                        <div class="msg-text">${escapeHtml(m.text)}</div>
                        <div class="msg-time">${time}</div>
                    </div>
                `;
            }).join('');
            if (atBottom || snap.docChanges().some(c => c.type === 'added')) {
                area.scrollTop = area.scrollHeight;
            }
        });
}

function chatKeydown(e, convId, otherId, otherName) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(convId, otherId, otherName);
    }
}

async function sendMessage(convId, otherId, otherName) {
    const input = document.getElementById('chat-msg-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    try {
        const batch = db.batch();
        const msgRef = db.collection('conversations').doc(convId).collection('messages').doc();
        batch.set(msgRef, {
            text, senderId: currentUser.uid, senderName: currentUserData.name,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        batch.update(db.collection('conversations').doc(convId), {
            lastMessage: text, lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
            [`unread.${otherId}`]: firebase.firestore.FieldValue.increment(1)
        });
        await batch.commit();
        // Notification
        await sendNotification(otherId, {
            type: 'message', text: `${currentUserData.name}: ${text.slice(0,60)}${text.length>60?'...':''}`,
            convId, fromUserId: currentUser.uid, fromUserName: currentUserData.name
        });
    } catch(err) { toast('შეცდომა: '+err.message, 'error'); }
}

function subscribeChatBadge() {
    if (!currentUser) return;
    db.collection('conversations').where('participants','array-contains',currentUser.uid)
        .onSnapshot(snap => {
            let total = 0;
            snap.forEach(doc => { total += (doc.data().unread?.[currentUser.uid]) || 0; });
            const badge = document.getElementById('chat-badge');
            if (total > 0) { badge.classList.remove('hidden'); badge.innerText = total; }
            else badge.classList.add('hidden');
        });
}

// ══════════════════════════════════════════════════
//   NOTIFICATIONS
// ══════════════════════════════════════════════════

async function sendNotification(toUid, data) {
    try {
        await db.collection('notifications').add({
            toUid, ...data, read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch(e) {}
}

function subscribeNotifications() {
    if (!currentUser) return;
    if (notifUnsubscribe) notifUnsubscribe();
    notifUnsubscribe = db.collection('notifications')
        .where('toUid', '==', currentUser.uid)
        .orderBy('createdAt', 'desc').limit(20)
        .onSnapshot(snap => {
            const unread = snap.docs.filter(d => !d.data().read).length;
            const badge = document.getElementById('notif-badge');
            if (unread > 0) { badge.classList.remove('hidden'); badge.innerText = unread; }
            else badge.classList.add('hidden');
            // Render
            const list = document.getElementById('notif-list');
            if (!list) return;
            if (snap.empty) { list.innerHTML = '<div class="notif-empty">შეტყობინება არ არის</div>'; return; }
            list.innerHTML = snap.docs.map(doc => {
                const n = doc.data();
                const icons = { application:'📨', message:'💬', post:'📋', info:'ℹ️' };
                const time = n.createdAt ? formatTime(n.createdAt.toDate?.() || new Date()) : '';
                return `<div class="notif-item ${n.read?'':'unread'}" onclick="handleNotifClick('${doc.id}', ${JSON.stringify(n).replace(/"/g,'&quot;')})">
                    <div class="notif-item-icon">${icons[n.type]||'🔔'}</div>
                    <div class="notif-item-text"><div class="notif-item-title">${n.text||''}</div><div class="notif-item-time">${time}</div></div>
                </div>`;
            }).join('');
        });
}

function toggleNotifications() {
    const panel = document.getElementById('notif-panel');
    notifOpen = !notifOpen;
    panel.classList.toggle('hidden', !notifOpen);
}

async function markAllRead() {
    if (!currentUser) return;
    const snap = await db.collection('notifications').where('toUid','==',currentUser.uid).where('read','==',false).get();
    const batch = db.batch();
    snap.forEach(doc => batch.update(doc.ref, { read: true }));
    await batch.commit();
}

async function handleNotifClick(notifId, data) {
    await db.collection('notifications').doc(notifId).update({ read: true });
    document.getElementById('notif-panel').classList.add('hidden');
    notifOpen = false;
    if (data.type === 'application' && data.postId) openPostDetails(data.postId);
    else if (data.type === 'message' && data.convId) {
        openChat();
        setTimeout(() => openConversation(data.convId, data.fromUserName||'?', data.fromUserId||''), 400);
    }
}

// ══════════════════════════════════════════════════
//   AUTH
// ══════════════════════════════════════════════════

document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.innerHTML = 'მოცდა... <i class="fas fa-spinner fa-spin"></i>';
    try {
        await auth.signInWithEmailAndPassword(
            document.getElementById('login-email').value,
            document.getElementById('login-password').value
        );
        closeModal('auth-modal');
        toast('კეთილი იყოს თქვენი მობრძანება! 👋', 'success');
    } catch(err) { toast('შეცდომა: '+translateFirebaseError(err.code), 'error'); }
    finally { btn.disabled = false; btn.innerHTML = 'შესვლა <i class="fas fa-arrow-right"></i>'; }
});

document.getElementById('register-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.innerHTML = 'მოცდა... <i class="fas fa-spinner fa-spin"></i>';
    const email = document.getElementById('reg-email').value.toLowerCase().trim();
    const name  = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const role  = document.getElementById('reg-role').value;
    const pass  = document.getElementById('reg-password').value;
    const uniName = document.getElementById('reg-university')?.value.trim();
    if (pass.length < 6) {
        toast('პაროლი მინიმუმ 6 სიმბოლო', 'error');
        btn.disabled = false; btn.innerHTML = 'ანგარიშის შექმნა <i class="fas fa-arrow-right"></i>'; return;
    }
    try {
        const res = await auth.createUserWithEmailAndPassword(email, pass);
        await db.collection('users').doc(res.user.uid).set({
            name, email, role, phone, university: uniName || null,
            bio: '', location: '', website: '', skills: [], savedPosts: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeModal('auth-modal');
        toast('ანგარიში შეიქმნა! 🎉', 'success');
    } catch(err) { toast('შეცდომა: '+translateFirebaseError(err.code), 'error'); }
    finally { btn.disabled = false; btn.innerHTML = 'ანგარიშის შექმნა <i class="fas fa-arrow-right"></i>'; }
});

function translateFirebaseError(code) {
    const m = {
        'auth/user-not-found': 'მომხ. ვერ მოიძებნა',
        'auth/wrong-password': 'პაროლი არასწორია',
        'auth/email-already-in-use': 'ეს ელ-ფოსტა უკვე გამოიყენება',
        'auth/invalid-email': 'ელ-ფოსტა არასწორი ფორმატია',
        'auth/weak-password': 'პაროლი ძალიან სუსტია',
        'auth/too-many-requests': 'ძალიან ბევრი მცდელობა. სცადე მოგვიანებით.',
        'auth/invalid-credential': 'ელ-ფოსტა ან პაროლი არასწორია',
    };
    return m[code] || 'უცნობი შეცდომა';
}

function selectRole(role, el) {
    document.querySelectorAll('.role-opt').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('reg-role').value = role;
    const uniWrap = document.getElementById('student-uni-wrap');
    if (uniWrap) uniWrap.style.display = role === 'student' ? '' : 'none';
}

function toggleAuthMode(mode) {
    const lf = document.getElementById('login-form');
    const rf = document.getElementById('register-form');
    const lb = document.getElementById('login-tab-btn');
    const rb = document.getElementById('register-tab-btn');
    if (mode === 'login') { lf.classList.remove('hidden'); rf.classList.add('hidden'); lb.classList.add('active'); rb.classList.remove('active'); }
    else { lf.classList.add('hidden'); rf.classList.remove('hidden'); lb.classList.remove('active'); rb.classList.add('active'); }
}

// ── MODALS ────────────────────────────────────────
function showModal(id) {
    const el = document.getElementById(id);
    el.style.display = 'flex';
}
function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}
document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
});

// ── LOGOUT ────────────────────────────────────────
function logout() {
    auth.signOut().then(() => { toast('გამოსვლა წარმატებული', 'info'); location.reload(); });
}

// ── HELPERS ───────────────────────────────────────
function escapeHtml(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function formatDate(date) {
    if (!date) return '';
    return date.toLocaleDateString('ka-GE', { year: 'numeric', month: 'long' });
}
function formatTime(date) {
    if (!date) return '';
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return 'ახლა';
    if (diff < 3600000) return Math.floor(diff/60000) + ' წ. წინ';
    if (diff < 86400000) return Math.floor(diff/3600000) + ' სთ. წინ';
    return date.toLocaleDateString('ka-GE', { day: 'numeric', month: 'short' });
}
function debounce(fn, delay) { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a),delay); }; }

// Auto-resize chat textarea
document.addEventListener('input', e => {
    if (e.target.id === 'chat-msg-input') {
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
    }
});

// ── INIT ──────────────────────────────────────────
document.getElementById('hero-section').classList.remove('hidden');
document.getElementById('feed-section').classList.remove('hidden');