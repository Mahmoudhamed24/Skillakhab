(function () {
      function forceHideLoading() {
        const el = document.getElementById('loadScreen');
        if (!el) return;
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        el.style.display = 'none';
      }

      // Hide even if the main app hits a runtime error later.
      const hideSoon = () => setTimeout(forceHideLoading, 1800);

      if (document.readyState === 'complete' || document.readyState === 'interactive') hideSoon();
      else window.addEventListener('DOMContentLoaded', hideSoon, { once: true });

      window.addEventListener('load', () => setTimeout(forceHideLoading, 1200), { once: true });
      setTimeout(forceHideLoading, 6000);
    })();
  

    /* ── FIREBASE INIT ── */
    firebase.initializeApp({
      apiKey: "AIzaSyAfQUrsU1y0nHSdqOw4EA9wWkouLzOA9Ps",
      authDomain: "fir-c24f7.firebaseapp.com",
      projectId: "fir-c24f7",
      storageBucket: "fir-c24f7.firebasestorage.app",
      messagingSenderId: "65956673453",
      appId: "1:65956673453:web:d4e620b2621aba8a215324"
    });
    const auth = firebase.auth();
    const db = firebase.firestore();

    /* ── CONSTANTS ── */
    const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const TIMES = [
      { v: '08:00', lbl: '8 ص (صباحاً)' }, { v: '09:00', lbl: '9 ص (صباحاً)' },
      { v: '10:00', lbl: '10 ص (صباحاً)' }, { v: '11:00', lbl: '11 ص (صباحاً)' },
      { v: '12:00', lbl: '12 م (ظهراً)' }, { v: '13:00', lbl: '1 م (بعد الظهر)' },
      { v: '14:00', lbl: '2 م (بعد الظهر)' }, { v: '15:00', lbl: '3 م (بعد الظهر)' },
      { v: '16:00', lbl: '4 م (مساءً)' }, { v: '17:00', lbl: '5 م (مساءً)' },
      { v: '18:00', lbl: '6 م (مساءً)' }, { v: '19:00', lbl: '7 م (مساءً)' },
      { v: '20:00', lbl: '8 م (مساءً)' }
    ];
    // Helper: get label from time value
    function timeLbl(v) { const t = TIMES.find(x => x.v === v); return t ? t.lbl : v; }
    const ABG = ['#fde68a', '#5eead4', '#a78bfa', '#86efac', '#fca5a5', '#fcd34d', '#6ee7b7', '#c4b5fd', '#bae6fd', '#fda4af'];
    const AFG = ['#78350f', '#065f46', '#4c1d95', '#166534', '#9f1239', '#78350f', '#064e3b', '#4c1d95', '#075985', '#9f1239'];
    const CATCOL = { 'برمجة': '#0ea5e9', 'تصميم': '#a855f7', 'لغات': '#10b981', 'Excel': '#f59e0b', 'تسويق': '#ef4444', 'مونتاج': '#f97316', 'مهارات وظيفية': '#6366f1', 'موسيقى': '#ec4899' };
    const RTC = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun2.l.google.com:19302' }] };
    function escapeHTML(v = '') {
      return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function fmtEGP(v) {
      const n = Number(v || 0);
      return `${n.toFixed(2)} ج.م`;
    }

    async function getLatestPairBooking(otherUid) {
      if (!CU || !otherUid) return null;
      try {
        const [s1, s2] = await Promise.all([
          db.collection('bookings').where('studentId', '==', CU.uid).get().catch(() => ({ docs: [] })),
          db.collection('bookings').where('tutorId', '==', CU.uid).get().catch(() => ({ docs: [] }))
        ]);
        const list = [...s1.docs, ...s2.docs]
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(b => (b.studentId === CU.uid && b.tutorId === otherUid) || (b.tutorId === CU.uid && b.studentId === otherUid))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        return list[0] || null;
      } catch (e) {
        return null;
      }
    }

    async function refreshChatState(otherUid) {
      const rel = allContacts[otherUid] || { uid: otherUid };
      const latest = await getLatestPairBooking(otherUid);
      const allowed = !!latest && latest.status === 'confirmed';
      const statusMap = {
        confirmed: 'جلسة نشطة — الشات مفتوح',
        pending: 'بانتظار موافقة المعلم',
        completed: 'انتهت الجلسة',
        cancelled: 'تم إلغاء الجلسة',
        refunded: 'تمت إعادة المبلغ',
      };
      rel.latestBooking = latest || null;
      rel.chatAllowed = allowed;
      rel.chatStatus = latest ? (statusMap[latest.status] || latest.status) : 'لا توجد جلسة نشطة';
      allContacts[otherUid] = rel;
      return rel;
    }

    function canBookTarget(targetId) {
      if (!CU || !CP || !targetId) return false;
      if (CU.uid === targetId) return false;
      // Only learner/both/admin accounts may book. Tutor-only accounts cannot.
      if (CP.role === 'tutor') return false;
      return true;
    }

    async function mirrorSessionToChat(booking, text, senderName, senderPhoto) {
      if (!booking || !booking.studentId || !booking.tutorId) return;
      const threadId = [booking.studentId, booking.tutorId].sort().join('_');
      const payload = {
        threadId,
        senderId: CU.uid,
        senderName: senderName || CP?.name || '—',
        senderPhoto: senderPhoto || CP?.photo || '',
        receiverId: CU.uid === booking.studentId ? booking.tutorId : booking.studentId,
        receiverName: CU.uid === booking.studentId ? booking.tutorName || '—' : booking.studentName || '—',
        receiverPhoto: '',
        text,
        read: false,
        sessionId: booking.id,
        bookingId: booking.id,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.collection('messages').add(payload);
    }

    function setChatUiState(allowed, statusText, showCall = false) {
      const input = document.getElementById('chatInpArea');
      const call = document.getElementById('chatCallBtn');
      const status = document.getElementById('chatHdrStatus');
      const msgs = document.getElementById('chatMsgs');
      if (input) input.style.display = allowed ? 'flex' : 'none';
      if (call) call.style.display = showCall ? 'flex' : 'none';
      if (status && statusText) status.textContent = statusText;
      if (msgs && !allowed && !document.getElementById('chatLockNotice')) {
        msgs.insertAdjacentHTML('afterbegin', `
          <div id="chatLockNotice" style="margin:10px 0 6px;padding:12px 14px;border-radius:14px;background:#fff8e1;border:1px solid #f4d06f;color:#8a5a00;font-size:.82rem;line-height:1.75">
            💬 الشات مغلق الآن. يفتح فقط بعد تأكيد الجلسة ويغلق تلقائياً بعد انتهائها.
          </div>
        `);
      }
      const lock = document.getElementById('chatLockNotice');
      if (allowed && lock) lock.remove();
    }


    /* ── APP STATE ── */
    let CU = null, CP = null, walBal = 0;
    let allT = [], curT = null, selDate = null, selTime = null;
    let regRole = 'learner', r3SkList = [], regStep = 1;
    let edSkList = [];
    let revStar = 0, revBid = null, revTid = null;
    let dashTab = 'overview';
    let pc = null, locSt = null, scrSt = null, micOn = true, camOn = true, scrOn = false;
    let sesTInt = null, sesSec = 0, sesChatL = null, curSesBid = null, curSesBk = null, unreadSes = 0;
    let curChatUid = null, chatL = null, allContacts = {};
    let msgUnsubL = null;
    let toastTmr = null;

    /* ── SETUP CHECK ── */
    window.addEventListener('DOMContentLoaded', () => {
      // Show setup banner if Firestore hasn't been initialized yet
      db.collection('_ping').doc('test').get().then(() => {
        // Firestore works fine
      }).catch(err => {
        if (err.code === 'permission-denied' || err.code === 'unavailable') {
          // Show setup guide
          const banner = document.createElement('div');
          banner.style.cssText = 'position:fixed;top:64px;inset-inline:0;background:#f59e0b;color:#111;padding:12px 20px;z-index:90;text-align:center;font-size:.88rem;font-weight:600;display:flex;align-items:center;justify-content:center;gap:10px';
          banner.innerHTML = `طور مهارتك<strong></strong>  مع Skillak <strong></strong> <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;font-size:1.2rem">✕</button>`;
          document.body.appendChild(banner);
        }
      });

      // Extra safety: if anything blocks auth or Firestore for too long, release the UI anyway.
      setTimeout(() => {
        const el = document.getElementById('loadScreen');
        if (el && getComputedStyle(el).display !== 'none') {
          hideLd(true);
        }
      }, 5000);
    });

    /* ── FIREBASE SETUP CHECK ── */
    setTimeout(() => {
      db.collection('users').limit(1).get().catch(err => {
        if (err.code === 'permission-denied' || err.message?.includes('offline') || err.message?.includes('unavailable')) {
          const b = document.createElement('div');
          b.id = 'setupBanner';
          b.style.cssText = 'position:fixed;top:var(--nh);right:0;left:0;background:#f59e0b;color:#111;padding:11px 20px;z-index:90;text-align:center;font-size:.85rem;font-weight:600;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap';
          b.innerHTML = ` تعلّم أي مهارة <strong> من شخص حقيقي </strong> في وقتك أنت<strong> مع Skillak </strong> <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;font-size:1.2rem">✕</button>`;
          document.body.appendChild(b);
        }
      });
    }, 3000);

    /* ── AUTH LISTENER ── */
    auth.onAuthStateChanged(async user => {
      CU = user;
      if (user) {
        try {
          const s = await db.collection('users').doc(user.uid).get();
          if (s.exists) {
            CP = s.data();
            await loadWal();
            updNavU();
            startMsgL();
            console.log('✅ User loaded:', CP.name, '| Role:', CP.role);
          } else {
            // User exists in Auth but not in Firestore - create basic profile
            console.warn('User in Auth but not in Firestore - creating profile');
            CP = { uid: user.uid, email: user.email, name: user.email.split('@')[0], role: 'learner', isApproved: true, rating: 0, totalReviews: 0, totalSessions: 0 };
            await db.collection('users').doc(user.uid).set({ ...CP, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            await db.collection('wallets').doc(user.uid).set({ balance: 0, userId: user.uid });
            updNavU();
            startMsgL();
          }
        } catch (e) { console.error('auth state:', e); }
      } else {
        CP = null; walBal = 0; updNavG();
      }
      hideLd();
      await seedAndLoad();
    });

    function hideLd(force = false) {
      const el = document.getElementById('loadScreen');
      if (!el) return;
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      const hideNow = () => { el.style.display = 'none'; };
      if (force) hideNow();
      else setTimeout(hideNow, 420);
    }

    // Fallbacks so the app never stays stuck on the loading screen
    window.addEventListener('load', () => {
      setTimeout(() => hideLd(true), 900);
    });
    setTimeout(() => {
      const el = document.getElementById('loadScreen');
      if (el && getComputedStyle(el).display !== 'none') {
        console.warn('Loading screen fallback triggered');
        hideLd(true);
      }
    }, 12000);

    /* ── NAV ── */
    function updNavU() {
      document.getElementById('ngst').style.display = 'none';
      document.getElementById('nusr').style.display = 'flex';
      const av = document.getElementById('navAv');
      if (CP?.photo) { av.innerHTML = `<img src="${CP.photo}">`; }
      else { av.textContent = CP?.name?.[0] || 'أ'; av.style.background = CP?.color || 'var(--amber)'; }
      document.getElementById('nwAmt').textContent = walBal.toFixed(2) + ' ج.م';
      document.getElementById('nlD').style.display = 'block';
      document.getElementById('nlC').style.display = 'block';
      document.getElementById('nlA').style.display = CP?.role === 'admin' ? 'block' : 'none';
      // Update mobile menu
      if (typeof updMobNav === 'function') updMobNav();
    }
    function updNavG() {
      document.getElementById('ngst').style.display = 'flex';
      document.getElementById('nusr').style.display = 'none';
      document.getElementById('nlD').style.display = 'none';
      document.getElementById('nlC').style.display = 'none';
      document.getElementById('nlA').style.display = 'none';
      // Update mobile menu
      if (typeof updMobNav === 'function') updMobNav();
    }

    /* ── MSG BADGE LISTENER ── */
    let bookingNotifL = null;
    function startMsgL() {
      if (!CU || msgUnsubL) return;
      // Unread messages badge
      msgUnsubL = db.collection('messages')
        .where('receiverId', '==', CU.uid)
        .where('read', '==', false)
        .onSnapshot(snap => {
          const cnt = snap.size;
          const badge = document.getElementById('msgBadge');
          const bnBadge = document.getElementById('bnBadge');
          if (cnt > 0) {
            badge.textContent = cnt > 9 ? '9+' : cnt; badge.classList.remove('hidden');
            if (bnBadge) { bnBadge.textContent = cnt > 9 ? '9+' : cnt; bnBadge.classList.remove('hidden'); }
          } else {
            badge.classList.add('hidden');
            if (bnBadge) bnBadge.classList.add('hidden');
          }
        }, err => console.warn('msgBadge listener:', err.code));

      // Real-time booking notifications for tutors
      if (CP && (CP.role === 'tutor' || CP.role === 'both')) {
        if (!bookingNotifL) {
          let isFirst = true;
          bookingNotifL = db.collection('bookings')
            .where('tutorId', '==', CU.uid)
            .where('status', '==', 'confirmed')
            .onSnapshot(snap => {
              if (isFirst) { isFirst = false; return; } // skip initial load
              snap.docChanges().forEach(change => {
                if (change.type === 'added') {
                  const bk = change.doc.data();
                  showT(`🔔 حجز جديد من ${bk.studentName || 'طالب'} بتاريخ ${bk.date} ${bk.time}`, 'inf');
                }
              });
            });
        }
      }
    }

    /* ── SEED + LOAD TEACHERS ── */
    async function seedAndLoad() {
      // No demo seeding - only real users from Firestore
      await loadT();
    }

    async function loadT() {
      try {
        // Query without orderBy to avoid needing a composite index
        // We sort client-side by rating
        // Load ALL tutors regardless of isApproved (filter client-side)
        const snap = await db.collection('users')
          .where('role', 'in', ['tutor', 'both'])
          .get();
        allT = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(t => t.isApproved !== false) // show approved tutors (default true if not set)
          .sort((a, b) => (b.rating || 0) - (a.rating || 0)); // sort by rating desc
        const tc = allT.length;
        const ts = allT.reduce((s, t) => s + (t.totalSessions || 0), 0);
        const hST = document.getElementById('hST'); if (hST) hST.textContent = tc + '+';
        const hSS = document.getElementById('hSS'); if (hSS) hSS.textContent = (ts > 999 ? Math.round(ts / 1000) + 'K' : ts) + '+';
        const hTag = document.getElementById('hTagCnt'); if (hTag) hTag.textContent = tc + '+';
        renderFeat();
        renderExplore();
        renderHeroCards();
      } catch (e) { console.error('loadT:', e); }
    }

    function renderHeroCards() {
      const el = document.getElementById('heroFloatCards');
      if (!el || !allT.length) return;
      const top3 = allT.slice(0, 3);
      el.innerHTML = top3.map((t, i) => {
        const bg = t.color || ABG[i % ABG.length];
        const fg = t.fgColor || AFG[i % AFG.length];
        const avHTML = t.photo
          ? `<img src="${t.photo}" style="width:40px;height:40px;border-radius:50%;object-fit:cover">`
          : `<div class="fcav" style="background:${bg};color:${fg}">${t.emoji || t.name?.[0] || 'م'}</div>`;
        const cat = (t.skills || []).slice(0, 2).join(' & ') || t.category || '';
        const genderWord = ['س', 'ن', 'ر', 'ل', 'م'].includes(t.name?.[0]) ? 'متصلة الآن' : 'متصل الآن';
        return `<div class="fc">${avHTML}<div><div class="fcname">${t.name}</div><div class="fcsub">${cat} · $${t.price || 0}/ساعة</div><div class="lb"><div class="ld"></div>${genderWord}</div></div></div>`;
      }).join('');
    }

    /* ── TEACHER CARD HTML ── */
    function tcHTML(t) {
      const idx = (t.name?.charCodeAt(0) || 0) % ABG.length;
      const bg = t.color || ABG[idx];
      const fg = t.fgColor || AFG[idx];
      const avIn = t.photo
        ? `<img src="${t.photo}" style="width:100%;height:100%;object-fit:cover">`
        : `<span style="color:${fg}">${t.emoji || t.name?.[0] || '؟'}</span>`;
      const bc = CATCOL[t.category] || '#0d6e75';
      const rat = t.rating ? parseFloat(t.rating).toFixed(1) : '—';
      const skStr = (t.skills || []).slice(0, 3).join(' · ');
      return `<div class="tc" onclick="openProf('${t.id}')">
    <div class="tcban" style="background:linear-gradient(135deg,${bc} 0%,${bc}bb 100%)">
      <div class="tcav" style="background:${bg}">${avIn}</div><div class="tcdot"></div>
    </div>
    <div class="tcb">
      <div class="tcname">${t.name}</div>
      <div class="tcsk">${skStr}</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:2px">
        <span class="tag">${t.category || ''}</span>
        <span class="tag tag-a" style="margin-right:4px">${t.lang || ''}</span>
        ${t.experience ? `<span class="tag tag-g" style="margin-right:4px">${t.experience}سنة خبرة </span>` : ''}
      </div>
      <div class="tcmeta">
        <div class="tcrat"><span class="stars">★</span> ${rat} <span style="color:var(--muted);font-size:.78rem">(${t.totalReviews || 0})</span></div>
        <div class="tcprice">$${t.price || 0} <small>/ ساعة</small></div>
      </div>
    </div>
  </div>`;
    }

    function renderFeat() {
      const el = document.getElementById('featGrid'); if (!el) return;
      const top = allT.slice(0, 4); // already sorted by rating desc
      el.innerHTML = top.length ? top.map(tcHTML).join('') : '<div class="empty"><div class="emptyic">👨‍🏫</div><p>لا يوجد معلمون بعد</p></div>';
    }

    /* ── EXPLORE ── */
    function renderExplore() {
      const q = (document.getElementById('exSrch')?.value || '').toLowerCase();
      const cat = document.getElementById('exCat')?.value || '';
      const minR = parseFloat(document.getElementById('exRat')?.value || 0);
      const maxP = parseFloat(document.getElementById('exPrc')?.value || 9999);
      const lng = document.getElementById('exLng')?.value || '';
      const srt = document.getElementById('exSort')?.value || 'rating';

      let list = allT.filter(t => {
        const ms = !q || t.name?.toLowerCase().includes(q) || (t.skills || []).some(s => s.toLowerCase().includes(q)) || t.category?.toLowerCase().includes(q) || t.bio?.toLowerCase().includes(q);
        return ms && (!cat || t.category === cat) && (t.rating || 0) >= minR && (t.price || 0) <= maxP && (!lng || t.lang === lng);
      });

      // Sort
      if (srt === 'sessions') list = [...list].sort((a, b) => (b.totalSessions || 0) - (a.totalSessions || 0));
      else if (srt === 'price_asc') list = [...list].sort((a, b) => (a.price || 0) - (b.price || 0));
      else if (srt === 'price_desc') list = [...list].sort((a, b) => (b.price || 0) - (a.price || 0));
      // default 'rating' — allT is already sorted by rating desc from Firestore

      const el = document.getElementById('exploreGrid');
      const cnt = document.getElementById('exCnt');
      if (cnt) cnt.textContent = `عرض ${list.length} من ${allT.length} معلم`;
      if (el) el.innerHTML = list.length ? list.map(tcHTML).join('') : `<div class="empty"><div class="emptyic">🔍</div><p style="font-weight:700;font-size:1rem;margin-bottom:8px">لم يتم العثور على نتائج</p><p>جرّب تغيير كلمة البحث أو الفلاتر</p></div>`;
    }

    /* ── PROFILE ── */
    async function openProf(id) {
      // Always fetch fresh from Firestore to get latest rating/availability
      try {
        const s = await db.collection('users').doc(id).get();
        if (s.exists) {
          curT = { id: s.id, ...s.data() };
          // Update local cache too
          const idx = allT.findIndex(t => t.id === id);
          if (idx >= 0) allT[idx] = curT;
          else allT.push(curT);
        }
      } catch (e) {
        curT = allT.find(t => t.id === id);
      }
      if (!curT) { showT('تعذّر تحميل بيانات المعلم', 'err'); return; }
      selDate = null; selTime = null;
      const t = curT;
      const idx = (t.name?.charCodeAt(0) || 0) % ABG.length;
      const bg = t.color || ABG[idx];
      const fg = t.fgColor || AFG[idx];
      const avIn = t.photo ? `<img src="${t.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : `<span style="color:${fg}">${t.emoji || t.name?.[0] || '؟'}</span>`;

      // Load reviews
      let revHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.83rem">لا توجد تقييمات بعد. كن أول من يقيّم!</div>';
      try {
        const rs = await db.collection('reviews').where('tutorId', '==', id).limit(5).get();
        if (!rs.empty) revHTML = rs.docs.map(d => {
          const r = d.data();
          const dt = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString('ar-SA') : '';
          const st = '★'.repeat(r.rating || 5) + '☆'.repeat(5 - (r.rating || 5));
          return `<div class="revitem"><div class="revhd"><div class="revname">${r.studentName || 'طالب'} <span class="stars" style="font-size:.8rem">${st}</span></div><div class="revdate">${dt}</div></div><p class="revtxt">${r.comment || ''}</p></div>`;
        }).join('');
      } catch (e) { }

      // Load availability
      let avHTML = '<div style="color:var(--muted);font-size:.81rem">لا توجد أوقات محددة</div>';
      try {
        const av = await db.collection('availability').doc(id).get();
        if (av.exists && av.data().slots) {
          const sl = av.data().slots;
          const adays = DAYS.filter(d => sl[d] && sl[d].length);
          if (adays.length) avHTML = `<div class="avdisp">${adays.map(d => `<div class="avdcol"><div class="avdname">${d}</div>${(sl[d] || []).map(s => `<div class="avdslot">${s}</div>`).join('')}</div>`).join('')}</div>`;
        }
      } catch (e) { }

      document.getElementById('profMain').innerHTML = `
    <div class="profhero">
      <div class="profav" style="background:${bg}">${avIn}</div>
      <div>
        <div class="profname">${t.name}</div>
        <div class="profmeta">
          <span>⭐ ${(t.rating || 0).toFixed(1)} · ${t.totalReviews || 0} تقييم</span>
          <span>🎯 ${t.totalSessions || 0} جلسة</span>
          <span>🌐 ${t.lang || ''}</span>
          <span>📍 ${t.country || ''}</span>
          <span>📂 ${t.category || ''}</span>
        </div>
      </div>
    </div>
    <div class="profsec"><h3>نبذة تعريفية</h3><p style="color:#374151;line-height:1.78;font-size:.88rem">${t.bio || 'لا يوجد وصف.'}</p></div>
    <div class="profsec">
      <h3>الخبرة والكفاءات</h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
        ${t.experience ? `<div class="expb"><span>🏆</span><div><strong>${t.experience} سنة</strong><div style="font-size:.72rem;color:var(--muted)">خبرة</div></div></div>` : ''}
        <div class="expb"><span>📂</span><div><strong>${t.category || '—'}</strong><div style="font-size:.72rem;color:var(--muted)">التخصص</div></div></div>
        <div class="expb"><span>💰</span><div><strong>$${t.price || 0}/ساعة</strong><div style="font-size:.72rem;color:var(--muted)">السعر</div></div></div>
      </div>
      <div class="skchips">${(t.skills || []).map(s => `<span class="skchip">${s}</span>`).join('')}</div>
    </div>
    <div class="profsec"><h3>الأوقات المتاحة للحجز</h3>${avHTML}</div>
    <div class="profsec"><h3>تقييمات الطلاب (${t.totalReviews || 0})</h3>${revHTML}</div>
  `;

      const mustLogin = !CU;
      const canChat = CU && CU.uid !== id;
      const safeId = id.replace(/'/g, "\\'");
      const safeName = (t.name || '').replace(/'/g, "\\'");
      const safeEmoji = (t.emoji || t.name?.[0] || '؟').replace(/'/g, "\\'");
      const safeColor = (t.color || ABG[idx]).replace(/'/g, "\\'");
      const safeFgCol = (t.fgColor || AFG[idx]).replace(/'/g, "\\'");

      document.getElementById('profSidebar').innerHTML = `
    <div class="bksb">
      <div class="bkprice">$${t.price || 0}</div>
      <div class="bkplbl">لكل ساعة · جلسة فيديو مباشر 🎥</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:13px">
        <span class="tag">⭐ ${(t.rating || 0).toFixed(1)}</span>
        <span class="tag tag-g">✅ ${t.totalSessions || 0} جلسة</span>
        <span class="tag tag-a">🌐 ${t.lang || ''}</span>
      </div>
      <div class="fg"><label>📅 اختر التاريخ</label><input type="date" id="bkDI" min="${new Date().toISOString().split('T')[0]}" onchange="onDateChg('${safeId}')"/></div>
      <div id="slotsArea"><div style="font-size:.78rem;color:var(--muted);padding:9px;background:var(--cream2);border-radius:var(--rsm)">اختر تاريخاً لعرض الأوقات المتاحة</div></div>
      <button class="btn btn-p" style="width:100%;margin-top:12px;margin-bottom:8px" onclick="${mustLogin ? `openM('loginMod')` : (!canBookTarget('${safeId}') ? `showT('لا يمكنك حجز جلسة مع نفسك أو كمعلّم فقط','err')` : 'openBkMod()')}">
        ${mustLogin ? '🔐 سجّل دخولك للحجز' : '📅 احجز جلسة فيديو الآن'}
      </button>
      ${canChat ? `<button class="btn btn-o" style="width:100%;margin-bottom:8px" onclick="openChatWith('${safeId}','${safeName}','','${safeColor}','${safeFgCol}','${safeEmoji}')">💬 راسل المعلم واستفسر</button>` : ''}
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);font-size:.7rem;color:var(--muted);text-align:center;line-height:1.85">
        🎥 فيديو مباشر داخل المنصة<br/>🎤 ميكروفون · 📷 كاميرا · 🖥️ مشاركة شاشة<br/>💬 شات مثل واتساب مع المعلم<br/>💳 دفع آمن من محفظتك
      </div>
    </div>
  `;
      go('profile');
    }

    async function onDateChg(tid) {
      const v = document.getElementById('bkDI')?.value;
      if (!v) return;
      selDate = v; selTime = null;
      const area = document.getElementById('slotsArea');
      area.innerHTML = '<div style="padding:9px;color:var(--muted);font-size:.8rem;display:flex;align-items:center;gap:7px"><div class="spin spin-sm"></div> جاري تحميل المواعيد...</div>';
      let booked = [];
      try {
        const bs = await db.collection('bookings').where('tutorId', '==', tid).where('date', '==', v).where('status', 'in', ['pending', 'confirmed']).get();
        booked = bs.docs.map(d => d.data().time);
      } catch (e) { }
      let slots = [];
      try {
        const av = await db.collection('availability').doc(tid).get();
        if (av.exists && av.data().slots) {
          const dn = DAYS[new Date(v + 'T12:00:00').getDay()];
          if (av.data().slots[dn]) slots = av.data().slots[dn];
        }
      } catch (e) { }
      if (!slots.length) {
        area.innerHTML = '<div style="font-size:.82rem;color:var(--red);padding:12px 14px;background:var(--red2);border-radius:var(--rsm);border-right:3px solid var(--red)">⛔ المعلم غير متاح في هذا اليوم. جرّب يوماً آخر.</div>';
        return;
      }
      area.innerHTML = `<div class="fg" style="margin-bottom:0"><label style="margin-bottom:7px">⏰ اختر وقت الجلسة (${slots.length - booked.length} متاح)</label><div class="tsGrid">${slots.map(s => {
        const tk = booked.includes(s);
        const lbl = timeLbl(s);
        return `<div class="tsbtn ${tk ? 'taken' : ''}" ${!tk ? `onclick="selSlot('${s}',this)"` : ''}>
      ${tk ? `${lbl}<br><small style="font-size:.6rem;opacity:.7">محجوز</small>` : lbl}
    </div>`;
      }).join('')}</div></div>`;
    }

    function selSlot(t, el) {
      document.querySelectorAll('.tsbtn:not(.taken)').forEach(b => b.classList.remove('sel'));
      el.classList.add('sel');
      selTime = t;
    }

    function openBkMod() {
      if (!CU) { openM('loginMod'); return; }
      if (!selDate) { showT('اختر تاريخاً أولاً', 'err'); return; }
      if (!selTime) { showT('اختر وقت الجلسة', 'err'); return; }
      const t = curT, fee = +(t.price * (platformCommission / 100)).toFixed(2), tot = t.price + fee;
      document.getElementById('bkTch').textContent = t.name;
      document.getElementById('bkDt').textContent = selDate;
      document.getElementById('bkTm').textContent = timeLbl(selTime) || selTime;
      document.getElementById('bkPrc').textContent = t.price + ' ج.م';
      document.getElementById('bkFee').textContent = fee.toFixed(2) + ' ج.م';
      document.getElementById('bkTot').textContent = tot.toFixed(2) + ' ج.م';
      document.getElementById('bkBal').textContent = walBal.toFixed(2) + ' ج.م';
      const ins = walBal < tot;
      document.getElementById('bkInsuf').classList.toggle('hidden', !ins);
      document.getElementById('bkBtn').disabled = ins;
      openM('bkMod');
    }

    async function confirmBk() {
      if (!CU || !curT) return;
      const t = curT;
      const noteEl = document.getElementById('bkNote');
      const btn = document.getElementById('bkBtn');
      if (!selDate) { showT('اختر تاريخ الجلسة أولاً', 'err'); return; }
      if (!selTime) { showT('اختر وقت الجلسة أولاً', 'err'); return; }
      if (!canBookTarget(t.id)) { showT('لا يمكنك الحجز مع نفسك أو كمعلّم فقط', 'err'); closeM('bkMod'); return; }
      if (btn) { btn.textContent = 'جاري الحجز...'; btn.disabled = true; }
      const fee = +(t.price * (platformCommission / 100)).toFixed(2), tot = t.price + fee;
      try {
        // Hold money from student wallet immediately
        await db.runTransaction(async tx => {
          const r = db.collection('wallets').doc(CU.uid);
          const s = await tx.get(r);
          const b = s.exists ? (s.data().balance || 0) : 0;
          if (b < tot) throw new Error('رصيد غير كافٍ');
          tx.set(r, { balance: b - tot, userId: CU.uid }, { merge: true });
        });
        const bRef = await db.collection('bookings').add({
          studentId: CU.uid, studentName: CP?.name || CU.email,
          studentPhone: CP?.phone || '',
          tutorId: t.id, tutorName: t.name,
          date: selDate, time: selTime, timeLbl: timeLbl(selTime), duration: 60,
          price: t.price, fee, total: tot,
          note: noteEl?.value || '',
          status: 'pending',
          reviewed: false, paymentStatus: 'held',
          adminConfirmed: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await db.collection('transactions').add({
          userId: CU.uid, type: 'debit', kind: 'booking', amount: tot,
          description: `حجز جلسة مع ${t.name} — بتاريخ ${selDate} ${timeLbl(selTime)}`,
          bookingId: bRef.id, status: 'held',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        const threadId = [CU.uid, t.id].sort().join('_');
        await db.collection('messages').add({
          threadId, senderId: CU.uid, senderName: CP?.name || '—', senderPhoto: CP?.photo || '',
          receiverId: t.id, receiverName: t.name, receiverPhoto: t.photo || '',
          text: `📅 طلب حجز جلسة بتاريخ ${selDate} الساعة ${timeLbl(selTime)}.${noteEl?.value ? '\nملاحظة: ' + noteEl.value : ''}\n⏳ يُرجى الموافقة أو الرفض من لوحة التحكم.`,
          read: false, isBookingNotif: true, bookingId: bRef.id,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(() => { });
        walBal -= tot;
        const nw = document.getElementById('nwAmt');
        if (nw) nw.textContent = walBal.toFixed(2) + ' ج.م';
        closeM('bkMod');
        showT('⏳ تم تقديم طلب الحجز — في انتظار موافقة المعلم', 'suc');
        allContacts[t.id] = { uid: t.id, name: t.name, photo: t.photo || '', color: t.color || '', fgColor: t.fgColor || '', emoji: t.emoji || t.name?.[0] || '؟' };
        setTimeout(() => { dashTab = 'sessions'; go('dashboard'); }, 1400);
      } catch (e) {
        showT('خطأ: ' + e.message, 'err');
      } finally {
        if (btn) { btn.textContent = 'تأكيد الدفع والحجز'; btn.disabled = false; }
      }
    }

    // Tutor: approve booking
    async function tutorApproveBk(bid, studentId, tot) {
      if (!confirm('الموافقة على هذا الحجز؟')) return;
      try {
        await db.collection('bookings').doc(bid).update({ status: 'confirmed', confirmedAt: firebase.firestore.FieldValue.serverTimestamp() });
        // Notify student
        const bData = (await db.collection('bookings').doc(bid).get()).data();
        const threadId = [CU.uid, studentId].sort().join('_');
        await db.collection('messages').add({
          threadId, senderId: CU.uid, senderName: CP?.name || '—', senderPhoto: CP?.photo || '',
          receiverId: studentId, receiverName: bData?.studentName || '—', receiverPhoto: '',
          text: `✅ تمت الموافقة على حجزك بتاريخ ${bData?.date || ''} الساعة ${bData?.timeLbl || bData?.time || ''}.\nنراك قريباً! 🎉`,
          read: false, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(() => { });
        showT('✅ تمت الموافقة على الحجز وإشعار الطالب', 'suc');
        await dNav('sessions');
      } catch (e) { showT('خطأ: ' + e.message, 'err'); }
    }

    // Tutor: reject booking (refund student)
    async function tutorRejectBk(bid, studentId, refund) {
      if (!confirm('رفض هذا الحجز؟ سيتم استرداد المبلغ للطالب.')) return;
      try {
        await db.runTransaction(async tx => {
          const wr = db.collection('wallets').doc(studentId);
          const ws = await tx.get(wr);
          const wb = ws.exists ? (ws.data().balance || 0) : 0;
          tx.set(wr, { balance: wb + refund, userId: studentId }, { merge: true });
          tx.update(db.collection('bookings').doc(bid), { status: 'cancelled', rejectedBy: 'tutor', cancelledAt: firebase.firestore.FieldValue.serverTimestamp() });
        });
        await db.collection('transactions').add({
          userId: studentId, type: 'credit', kind: 'booking', amount: refund,
          description: 'استرداد — رفض المعلم للحجز', bookingId: bid,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // Notify student
        const bData = (await db.collection('bookings').doc(bid).get()).data();
        const threadId = [CU.uid, studentId].sort().join('_');
        await db.collection('messages').add({
          threadId, senderId: CU.uid, senderName: CP?.name || '—', senderPhoto: CP?.photo || '',
          receiverId: studentId, receiverName: bData?.studentName || '—', receiverPhoto: '',
          text: `❌ عذراً، لم أتمكن من تأكيد حجزك بتاريخ ${bData?.date || ''}.\nتم استرداد المبلغ كاملاً لمحفظتك. يمكنك اختيار وقت آخر.`,
          read: false, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(() => { });
        showT('تم رفض الحجز وإعادة المبلغ للطالب', 'suc');
        await dNav('sessions');
      } catch (e) { showT('خطأ: ' + e.message, 'err'); }
    }

    /* ── WALLET ── */
    async function loadWal() {
      if (!CU) return;
      try {
        const s = await db.collection('wallets').doc(CU.uid).get();
        walBal = s.exists ? (s.data().balance || 0) : 0;
        const el = document.getElementById('nwAmt'); if (el) el.textContent = walBal.toFixed(2) + ' ج.م';
      } catch (e) { }
    }

    /* ══════════════════════════════════════════════
       MULTI-METHOD PAYMENT SYSTEM
       ══════════════════════════════════════════════ */

    let paySelectedAmt = 0;
    let activePayTab = 'instapay';
    let activeWdMethod = '';

    function selAmt(amt, btn) {
      paySelectedAmt = amt;
      document.getElementById('customAmt').value = '';
      document.querySelectorAll('.amt-btn').forEach(b => b.classList.remove('sel', 'selected'));
      btn.classList.add('sel', 'selected');
      showPayAmt();
    }

    function selAmtCustom(amt) {
      paySelectedAmt = amt;
      document.querySelectorAll('.amt-btn').forEach(b => b.classList.remove('sel', 'selected'));
      showPayAmt();
    }

    function showPayAmt() {
      const d = document.getElementById('paySelDisplay');
      const a = document.getElementById('paySelAmt');
      if (paySelectedAmt > 0) {
        if (d) d.style.display = 'block';
        if (a) a.textContent = `${paySelectedAmt} جنيه مصري`;
      } else {
        if (d) d.style.display = 'none';
      }
    }

    function switchPayTab(tab, btn) {
      activePayTab = tab;
      document.querySelectorAll('.pay-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.pay-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(`panel-${tab}`).classList.add('active');
    }

    function cpyTxt(txt, lbl) {
      navigator.clipboard.writeText(txt).then(() => showT(`✅ تم نسخ ${lbl}`, 'suc')).catch(() => showT('تعذّر النسخ', 'err'));
    }

    function genFawryCode() {
      const code = '01004959936';
      const el = document.getElementById('fawryCode');
      if (el) el.textContent = code;
      cpyTxt(code, 'رقم Fawry');
    }

    function selWdMethod(method) {
      activeWdMethod = method;
      document.querySelectorAll('.withdraw-method-btn').forEach(b => b.classList.remove('sel'));
      document.getElementById(`wm-${method}`)?.classList.add('sel');
      const lbl = document.getElementById('wdAccLabel');
      if (lbl) {
        const labels = { instapay: 'رقم الهاتف المسجل في InstaPay', vodafone: 'رقم فودافون كاش', bank: 'رقم الحساب البنكي + اسم البنك' };
        lbl.innerHTML = (labels[method] || 'رقم الحساب') + ' <span class="req">*</span>';
      }
    }

    async function submitPayment() {
      if (!CU) { openM('loginMod'); return; }
      if (!paySelectedAmt || paySelectedAmt < 20) { showT('الحد الأدنى للشحن 20 جنيه', 'err'); return; }

      const refInput = document.getElementById(`ref-${activePayTab}`);
      const ref = refInput?.value.trim();
      if (!ref) { showT('أدخل رقم العملية / الإيصال أولاً', 'err'); return; }

      const btn = document.getElementById('paySubmitBtn');
      btn.disabled = true;
      btn.innerHTML = '<div class="spin spin-sm spin-wh" style="display:inline-block"></div> جاري الإرسال...';

      const methodNames = { instapay: 'InstaPay', vodafone: 'فودافون كاش', fawry: 'Fawry', bank: 'تحويل بنكي' };
      const reqRef = db.collection('paymentRequests').doc();

      try {
        await db.runTransaction(async tx => {
          tx.set(reqRef, {
            userId: CU.uid,
            userName: CP?.name || CU.email,
            userPhone: CP?.phone || '',
            amount: paySelectedAmt,
            currency: 'EGP',
            method: activePayTab,
            methodName: methodNames[activePayTab] || activePayTab,
            refNumber: ref,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          tx.set(db.collection('transactions').doc(reqRef.id), {
            userId: CU.uid,
            type: 'credit',
            kind: 'topup',
            amount: paySelectedAmt,
            currency: 'EGP',
            status: 'pending',
            description: `طلب شحن محفظة — ${methodNames[activePayTab] || activePayTab}`,
            requestId: reqRef.id,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        });

        const pdAmt = document.getElementById('pdAmt');
        const pdMethod = document.getElementById('pdMethod');
        if (pdAmt) pdAmt.textContent = `${paySelectedAmt} جنيه مصري`;
        if (pdMethod) pdMethod.textContent = methodNames[activePayTab];
        openM('payDoneMod');
        if (refInput) refInput.value = '';
        const customAmt = document.getElementById('customAmt');
        if (customAmt) customAmt.value = '';
        paySelectedAmt = 0;
        document.querySelectorAll('.amt-btn').forEach(b => b.classList.remove('sel', 'selected'));
        const psd = document.getElementById('paySelDisplay');
        if (psd) psd.style.display = 'none';
        await loadTxList().catch(() => { });
      } catch (e) {
        showT('خطأ: ' + e.message, 'err');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>📤</span> إرسال طلب الشحن';
      }
    }

    // Old submitWithdrawal replaced by new version in buildWithdrawPage

    async function loadWdHistory() {
      const el = document.getElementById('wdHistory'); if (!el || !CU) return;
      const snap = await db.collection('withdrawalRequests').where('userId', '==', CU.uid).get().catch(() => ({ docs: [] }));
      const docs = [...snap.docs].map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .slice(0, 10);

      if (!docs.length) { el.innerHTML = ''; return; }

      const stMap = {
        pending: '<span class="wrq-status wrq-pending">⏳ قيد المراجعة</span>',
        approved: '<span class="wrq-status wrq-approved">✅ تمت الموافقة</span>',
        rejected: '<span class="wrq-status wrq-rejected">❌ مرفوض</span>'
      };

      el.innerHTML = `<div style="font-weight:700;font-size:.85rem;margin-bottom:10px">طلبات السحب السابقة</div>` +
        docs.map(r => {
          const dt = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString('ar-SA') : '—';
          return `<div class="withdraw-req-card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
            <div>
              <div style="font-weight:700;font-size:.86rem">${r.amount} ${r.currency} — ${r.methodName}</div>
              <div style="font-size:.72rem;color:var(--muted);margin-top:3px">${r.accountNumber} · ${dt}</div>
            </div>
            ${stMap[r.status] || ''}
          </div></div>`;
        }).join('');
    }

    async function loadTxList() {
      const el = document.getElementById('txList'); if (!el || !CU) return;
      el.innerHTML = '<div style="padding:28px;text-align:center"><div class="spin" style="margin:0 auto"></div></div>';
      const ws = await db.collection('wallets').doc(CU.uid).get().catch(() => null);
      if (ws?.exists) {
        walBal = ws.data().balance || 0;
        const wb = document.getElementById('wBal'); if (wb) wb.textContent = walBal.toFixed(2);
        const navAmt = document.getElementById('nwAmt'); if (navAmt) navAmt.textContent = walBal.toFixed(2) + ' ج.م';
      }

      const wdBal = document.getElementById('wdBal');
      if (wdBal) wdBal.textContent = walBal.toFixed(2) + ' ج.م';

      const isTutor = CP?.role === 'tutor' || CP?.role === 'both' || CP?.role === 'admin';
      const wCard = document.getElementById('withdrawCard');
      if (wCard) wCard.style.display = isTutor ? 'block' : 'none';
      if (isTutor) loadWdHistory();

      const snap = await db.collection('transactions').where('userId', '==', CU.uid).get().catch(() => ({ docs: [] }));
      const visible = [...snap.docs].map(d => ({ id: d.id, ...d.data() }))
        .filter(tx => {
          const kind = String(tx.kind || '').toLowerCase();
          if (!kind) {
            const desc = String(tx.description || '').toLowerCase();
            return /شحن|سحب|withdraw|top.?up|payment/.test(desc);
          }
          return kind === 'topup' || kind === 'withdrawal';
        })
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      if (!visible.length) {
        el.innerHTML = '<div class="empty" style="padding:40px"><div class="emptyic">📭</div><p>لا توجد معاملات مالية بعد</p><p style="font-size:.8rem;color:var(--muted);margin-top:6px">ستظهر هنا عمليات الشحن والسحب الخاصة بك فقط</p></div>';
        return;
      }

      let totalIn = 0, totalOut = 0;
      visible.forEach(tx => {
        const kind = String(tx.kind || '').toLowerCase();
        if (kind === 'topup' && tx.status === 'approved') totalIn += tx.amount || 0;
        if (kind === 'withdrawal' && tx.status === 'approved') totalOut += tx.amount || 0;
      });
      const ti = document.getElementById('wTotalIn');
      const to = document.getElementById('wTotalOut');
      if (ti) ti.textContent = totalIn.toFixed(2) + ' ج.م';
      if (to) to.textContent = totalOut.toFixed(2) + ' ج.م';

      const statusPill = (status, kind) => {
        const map = {
          pending: '<span class="pill pp">⏳ قيد المراجعة</span>',
          approved: '<span class="pill pc">✅ معتمد</span>',
          rejected: '<span class="pill pca">❌ مرفوض</span>'
        };
        return map[status] || `<span class="pill ${kind === 'topup' ? 'pc' : 'pp'}">${status || '—'}</span>`;
      };

      el.innerHTML = visible.map(tx => {
        const kind = String(tx.kind || '').toLowerCase();
        const isIn = kind === 'topup';
        const isOut = kind === 'withdrawal';
        const dt = tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';
        const desc = tx.description || (isIn ? 'شحن محفظة' : isOut ? 'سحب أرباح' : '-');
        const amtSign = isIn ? '+' : '-';
        return `<div class="txitem">
          <div style="display:flex;align-items:center;gap:12px">
            <div class="txic ${isIn ? 'cr' : 'db'}" style="font-size:1.1rem">${isIn ? '💰' : '💸'}</div>
            <div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <div style="font-weight:700;font-size:.84rem">${desc}</div>
                ${statusPill(tx.status, kind)}
              </div>
              <div style="font-size:.71rem;color:var(--muted);margin-top:2px">${dt}</div>
            </div>
          </div>
          <div class="${isIn ? 'txcr' : 'txdb'}" style="font-weight:900;font-size:.95rem">
            ${amtSign}${(tx.amount || 0).toFixed(2)} ج.م
          </div>
        </div>`;
      }).join('');
    }

    /* ── WHATSAPP CHAT ── */
    function openChatWith(uid, name, photo, color, fgColor, emoji) {
      if (!CU) { openM('loginMod'); return; }
      allContacts[uid] = { uid, name, photo: photo || '', color: color || '', fgColor: fgColor || '', emoji: emoji || name?.[0] || '؟' };
      go('chat');
      setTimeout(() => openConv(uid), 150);
    }

    async function loadChatPage() {
      if (!CU) return;
      await loadContacts();
      if (curChatUid && allContacts[curChatUid]) await openConv(curChatUid);
    }

    async function loadContacts() {
      if (!CU) return;
      const uid = CU.uid;
      try {
        const [s1, s2] = await Promise.all([
          db.collection('messages').where('senderId', '==', uid).get().catch(() => ({ docs: [] })),
          db.collection('messages').where('receiverId', '==', uid).get().catch(() => ({ docs: [] }))
        ]);
        const threads = {};
        [...s1.docs, ...s2.docs].forEach(d => {
          const m = d.data();
          const oid = m.senderId === uid ? m.receiverId : m.senderId;
          const onam = m.senderId === uid ? m.receiverName : m.senderName;
          const oph = m.senderId === uid ? (m.receiverPhoto || '') : (m.senderPhoto || '');
          const ts = m.createdAt?.seconds || 0;
          if (!threads[oid] || ts > (threads[oid].ts || 0)) {
            threads[oid] = { uid: oid, name: onam || '—', photo: oph, lastMsg: m.text || '', ts, unread: 0 };
          }
        });
        // Count unread messages per thread
        [...s2.docs].forEach(d => {
          const m = d.data();
          if (!m.read && threads[m.senderId]) {
            threads[m.senderId].unread = (threads[m.senderId].unread || 0) + 1;
          }
        });
        // Merge with allContacts for avatar/color info
        Object.values(threads).forEach(c => {
          if (!allContacts[c.uid]) {
            allContacts[c.uid] = { uid: c.uid, name: c.name, photo: c.photo, color: '', fgColor: '', emoji: c.name?.[0] || '؟' };
          } else {
            allContacts[c.uid].name = c.name || allContacts[c.uid].name;
          }
        });
        renderContacts(Object.values(threads).filter(t => t.uid).sort((a, b) => b.ts - a.ts));
      } catch (e) {
        console.error('loadContacts:', e);
      }
    }

    function renderContacts(list) {
      const el = document.getElementById('contactsList'); if (!el) return;
      if (!list.length) {
        el.innerHTML = '<div class="nocont"><div class="emptyic" style="font-size:2.5rem;margin-bottom:8px">💬</div><p>لا توجد محادثات بعد.<br/>ابحث عن معلم وراسله!</p></div>';
        return;
      }
      el.innerHTML = list.map(c => {
        const ci = allContacts[c.uid] || {};
        const idx = (c.name?.charCodeAt(0) || 0) % ABG.length;
        const bg = ci.color || ABG[idx];
        const fg = ci.fgColor || AFG[idx];
        const avC = ci.photo ? `<img src="${ci.photo}" style="width:46px;height:46px;border-radius:50%;object-fit:cover">` : `<span style="color:${fg};font-weight:900;font-family:'Fraunces',serif">${ci.emoji || c.name?.[0] || '؟'}</span>`;
        const time = c.ts ? new Date(c.ts * 1000).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }) : '';
        return `<div class="citem ${c.uid === curChatUid ? 'act' : ''}" id="ci-${c.uid}" onclick="openConv('${c.uid}')">
      <div class="ciav" style="background:${bg}">${avC}</div>
      <div class="ciinfo">
        <div class="ciname">${c.name || '—'}</div>
        <div class="ciprev">${c.lastMsg || 'ابدأ المحادثة...'}</div>
      </div>
      <div class="citime">${time}</div>
      ${c.unread > 0 ? `<div class="cibadge">${c.unread > 9 ? '9+' : c.unread}</div>` : ''}
    </div>`;
      }).join('');
    }

    function filterContacts() {
      const q = (document.getElementById('cpSrch')?.value || '').toLowerCase();
      document.querySelectorAll('.citem').forEach(el => {
        const nm = el.querySelector('.ciname')?.textContent.toLowerCase() || '';
        el.style.display = (!q || nm.includes(q)) ? 'flex' : 'none';
      });
    }

    async function openConv(uid) {
      curChatUid = uid;
      const ci = allContacts[uid] || {};
      if (chatL) { chatL(); chatL = null; }

      const refreshed = await refreshChatState(uid);
      const idx = (refreshed.name?.charCodeAt(0) || 0) % ABG.length;
      const bg = refreshed.color || ABG[idx];
      const fg = refreshed.fgColor || AFG[idx];
      const hdrAv = document.getElementById('chatHdrAv');
      if (refreshed.photo) { hdrAv.innerHTML = `<img src="${escapeHTML(refreshed.photo)}" style="width:38px;height:38px;border-radius:50%;object-fit:cover">`; }
      else { hdrAv.textContent = refreshed.emoji || refreshed.name?.[0] || '؟'; }
      hdrAv.style.background = bg;
      const chatHdrName = document.getElementById('chatHdrName');
      if (chatHdrName) chatHdrName.textContent = refreshed.name || '—';
      if (CP?.role === 'admin' && uid !== supportAdminUid) {
        const chatHdrStatus = document.getElementById('chatHdrStatus');
        if (chatHdrStatus) chatHdrStatus.textContent = 'دردشة مفتوحة من خدمة العملاء';
      }
      setChatUiState(!!refreshed.chatAllowed, refreshed.chatStatus || 'لا توجد جلسة نشطة', !!refreshed.chatAllowed);

      document.querySelectorAll('.citem').forEach(el => el.classList.toggle('act', el.id === `ci-${uid}`));

      const threadId = [CU.uid, uid].sort().join('_');
      const msgsEl = document.getElementById('chatMsgs');
      msgsEl.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;color:var(--muted)"><div class="spin spin-sm"></div><span style="font-size:.84rem">جاري تحميل الرسائل...</span></div>';

      chatL = db.collection('messages').where('threadId', '==', threadId).onSnapshot(async snap => {
        if (!snap.docs.length) {
          msgsEl.innerHTML = '<div class="chatempty"><div class="chatemptyic">👋</div><p style="font-weight:700;margin-bottom:6px">ابدأ المحادثة!</p><p style="font-size:.82rem;color:var(--muted)">اكتب رسالتك الأولى أدناه</p></div>';
          return;
        }

        const docs = [...snap.docs].sort((a, b) => {
          const ta = a.data().createdAt?.seconds || 0;
          const tb = b.data().createdAt?.seconds || 0;
          return ta - tb;
        });

        const unread = docs.filter(d => d.data().receiverId === CU.uid && !d.data().read);
        if (unread.length) {
          const batch = db.batch();
          unread.forEach(d => batch.update(d.ref, { read: true }));
          batch.commit().catch(() => { });
        }

        let prevDate = '', html = '';
        const todayStr = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });

        docs.forEach(d => {
          const m = d.data();
          const mine = m.senderId === CU.uid;
          const dt = m.createdAt?.toDate ? m.createdAt.toDate() : new Date();
          const dateStr = dt.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
          const timeStr = dt.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });

          if (dateStr !== prevDate) {
            html += `<div class="datesep"><span>${dateStr === todayStr ? 'اليوم' : escapeHTML(dateStr)}</span></div>`;
            prevDate = dateStr;
          }

          const rtick = mine ? (m.read ? `<span class="rtick" title="مُقرأة">✓✓</span>` : `<span style="color:rgba(0,0,0,.35);font-size:.7rem">✓</span>`) : '';
          const senderLabel = !mine ? (escapeHTML(m.senderName || (m.senderRole === 'support' ? 'خدمة العملاء' : '')) || '') : '';
          html += `<div class="mrow ${mine ? 'mine' : 'theirs'}">
        <div class="mbub ${mine ? 'mine' : 'theirs'}">
          ${senderLabel ? `<div class="msender">${senderLabel}</div>` : ''}
          <div class="mtext">${escapeHTML(m.text || '')}</div>
          <div class="mtime"><span>${timeStr}</span>${rtick}</div>
        </div>
      </div>`;
        });

        msgsEl.innerHTML = html;
        setTimeout(() => { msgsEl.scrollTop = msgsEl.scrollHeight; }, 30);
      }, err => {
        console.error('chat listener error:', err);
        msgsEl.innerHTML = `<div style="text-align:center;padding:30px;color:var(--red)"><div style="font-size:2rem;margin-bottom:10px">⚠️</div><p style="font-weight:700">تعذّر تحميل الرسائل</p><p style="font-size:.8rem;color:var(--muted);margin-top:6px">${escapeHTML(err.message || '')}</p></div>`;
      });
    }

    async function sendMsg() {
      const inp = document.getElementById('chatInp');
      const text = inp.value.trim();
      if (!text || !curChatUid || !CU) return;
      const rel = await refreshChatState(curChatUid);
      if (!rel.chatAllowed) {
        showT('الشات يعمل بعد تأكيد الجلسة فقط', 'err');
        return;
      }
      inp.value = '';
      const threadId = [CU.uid, curChatUid].sort().join('_');
      const tgt = allContacts[curChatUid] || {};
      try {
        const isAdminSupport = CP?.role === 'admin';
        const payload = {
          threadId,
          senderId: CU.uid,
          senderName: isAdminSupport ? 'خدمة العملاء' : (CP?.name || '—'),
          senderPhoto: CP?.photo || '',
          senderRole: isAdminSupport ? 'support' : 'user',
          receiverId: curChatUid, receiverName: tgt.name || '—', receiverPhoto: tgt.photo || '',
          text, read: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('messages').add(payload);
        if (rel.latestBooking?.id) {
          await db.collection('sessions').doc(rel.latestBooking.id).collection('chat').add({
            senderId: CU.uid,
            senderName: CP?.name || '—',
            text,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          }).catch(() => { });
        }
        await loadContacts();
      } catch (e) { showT('خطأ في الإرسال', 'err'); }
    }

    function startVideoFromChat() {
      if (!curChatUid) { go('dashboard'); setTimeout(() => dNav('sessions'), 120); return; }
      go('dashboard');
      setTimeout(() => dNav('sessions'), 120);
    }

    /* ── SESSION (WebRTC) ── */
    async function enterSession(bookingId) {
      const bS = await db.collection('bookings').doc(bookingId).get();
      if (!bS.exists) { showT('لم يتم العثور على الجلسة', 'err'); return; }
      const bk = bS.data();
      if (bk.status !== 'confirmed') { showT('الجلسة غير مؤكدة بعد', 'err'); return; }
      const isTutor = bk.tutorId === CU.uid;
      curSesBid = bookingId; curSesBk = bk; sesSec = 0; unreadSes = 0;
      if (sesTInt) clearInterval(sesTInt);
      if (sesChatL) sesChatL();
      document.getElementById('sesTitle').textContent = `جلسة مع ${isTutor ? bk.studentName : bk.tutorName}`;
      document.getElementById('mainNav').style.display = 'none';
      document.getElementById('waitOv').classList.remove('hidden');
      document.getElementById('sesDot').style.background = 'var(--amber)';
      document.getElementById('sesTxt').textContent = 'جاري الاتصال...';
      document.getElementById('sesTimer').textContent = '00:00:00';
      go('session');

      // Get media
      try {
        locSt = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('locVid').srcObject = locSt;
        micOn = true; camOn = true; updCtrl();
      } catch (e) { showT('⚠️ تعذّر الوصول للكاميرا/الميكروفون: ' + e.message, 'err'); locSt = null; }

      // WebRTC
      pc = new RTCPeerConnection(RTC);
      if (locSt) locSt.getTracks().forEach(t => pc.addTrack(t, locSt));

      pc.ontrack = e => {
        document.getElementById('remVid').srcObject = e.streams[0];
        document.getElementById('waitOv').classList.add('hidden');
        document.getElementById('sesDot').style.background = 'var(--green)';
        document.getElementById('sesTxt').textContent = 'متصل';
        if (!sesTInt) {
          sesTInt = setInterval(() => {
            sesSec++;
            const h = Math.floor(sesSec / 3600), m = Math.floor((sesSec % 3600) / 60), s = sesSec % 60;
            document.getElementById('sesTimer').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
          }, 1000);
        }
      };
      pc.oniceconnectionstatechange = () => {
        if (['failed', 'disconnected'].includes(pc.iceConnectionState)) {
          document.getElementById('sesDot').style.background = 'var(--red)';
          document.getElementById('sesTxt').textContent = 'انقطع الاتصال...';
          document.getElementById('waitOv').classList.remove('hidden');
        }
      };

      const sesRef = db.collection('sessions').doc(bookingId);

      if (isTutor) {
        pc.onicecandidate = async e => { if (e.candidate) await sesRef.collection('tCand').add(e.candidate.toJSON()); };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sesRef.set({ offer: { type: offer.type, sdp: offer.sdp }, tutorId: CU.uid, status: 'active', startedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        sesRef.onSnapshot(async snap => {
          const d = snap.data();
          if (d?.answer && !pc.currentRemoteDescription) {
            try { await pc.setRemoteDescription(new RTCSessionDescription(d.answer)); } catch (e) { }
          }
        });
        sesRef.collection('sCand').onSnapshot(snap => {
          snap.docChanges().forEach(async c => {
            if (c.type === 'added') { try { await pc.addIceCandidate(new RTCIceCandidate(c.doc.data())); } catch (e) { } }
          });
        });
      } else {
        pc.onicecandidate = async e => { if (e.candidate) await sesRef.collection('sCand').add(e.candidate.toJSON()); };
        const doAns = async of => {
          if (pc.currentRemoteDescription) return;
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(of));
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            await sesRef.update({ answer: { type: ans.type, sdp: ans.sdp }, studentId: CU.uid });
          } catch (e) { console.error('answer:', e); }
        };
        const sn = await sesRef.get();
        if (sn.exists && sn.data()?.offer) await doAns(sn.data().offer);
        else sesRef.onSnapshot(async sn => { const d = sn.data(); if (d?.offer && !pc.currentRemoteDescription) await doAns(d.offer); });
        sesRef.collection('tCand').onSnapshot(snap => {
          snap.docChanges().forEach(async c => {
            if (c.type === 'added') { try { await pc.addIceCandidate(new RTCIceCandidate(c.doc.data())); } catch (e) { } }
          });
        });
      }
      loadSesChat(bookingId);
    }

    function loadSesChat(bid) {
      if (sesChatL) sesChatL();
      sesChatL = db.collection('sessions').doc(bid).collection('chat').orderBy('createdAt', 'asc').onSnapshot(snap => {
        const el = document.getElementById('sesMsgs'); if (!el) return;
        el.innerHTML = snap.docs.map(d => {
          const m = d.data(), mine = m.senderId === CU?.uid;
          const t = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }) : '';
          return `<div style="display:flex;flex-direction:column;align-items:${mine ? 'flex-end' : 'flex-start'}">
        <div class="sesmb ${mine ? 'mine' : 'theirs'}">${escapeHTML(m.text || '')}<div class="sesmeta">${t}</div></div>
      </div>`;
        }).join('');
        el.scrollTop = el.scrollHeight;
        const canTalk = !!curSesBk && curSesBk.status === 'confirmed';
        const inp = document.getElementById('sesInp');
        if (inp) inp.disabled = !canTalk;
        const btn = document.querySelector('#sesChatPnl .btn.btn-p.btn-sm');
        if (btn) btn.disabled = !canTalk;
        if (document.getElementById('sesChatPnl').classList.contains('hidden')) {
          unreadSes++;
          if (unreadSes > 0) document.getElementById('chatTogBtn').classList.add('unread');
        } else {
          unreadSes = 0; document.getElementById('chatTogBtn').classList.remove('unread');
        }
      });
    }

    async function sendSesMsg() {
      const inp = document.getElementById('sesInp'), text = inp.value.trim();
      if (!text || !curSesBid || !curSesBk || curSesBk.status !== 'confirmed') {
        showT('الشات يعمل فقط أثناء الجلسة المؤكدة', 'err');
        return;
      }
      inp.value = '';
      try {
        await db.collection('sessions').doc(curSesBid).collection('chat').add({
          senderId: CU.uid,
          senderName: CP?.name || 'أنا',
          text,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await mirrorSessionToChat(curSesBk, text, CP?.name || 'أنا', CP?.photo || '');
      }
      catch (e) { }
    }

    function toggleSesChat() {
      const p = document.getElementById('sesChatPnl');
      p.classList.toggle('hidden');
      if (!p.classList.contains('hidden')) { unreadSes = 0; document.getElementById('chatTogBtn').classList.remove('unread'); }
    }

    function togMic() {
      if (!locSt) return;
      micOn = !micOn;
      locSt.getAudioTracks().forEach(t => t.enabled = micOn);
      updCtrl();
    }
    function togCam() {
      if (!locSt) return;
      camOn = !camOn;
      locSt.getVideoTracks().forEach(t => t.enabled = camOn);
      document.getElementById('camOffOv').style.display = camOn ? 'none' : 'flex';
      updCtrl();
    }
    async function togScr() {
      if (scrOn) {
        if (scrSt) scrSt.getTracks().forEach(t => t.stop());
        if (locSt) {
          const ct = locSt.getVideoTracks()[0];
          if (ct) {
            const s = pc?.getSenders().find(s => s.track?.kind === 'video');
            if (s) await s.replaceTrack(ct).catch(() => { });
            document.getElementById('locVid').srcObject = locSt;
          }
        }
        scrOn = false;
      } else {
        try {
          scrSt = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          const st = scrSt.getVideoTracks()[0];
          const s = pc?.getSenders().find(s => s.track?.kind === 'video');
          if (s) await s.replaceTrack(st).catch(() => { });
          document.getElementById('locVid').srcObject = scrSt;
          st.onended = () => { scrOn = true; togScr(); };
          scrOn = true;
        } catch (e) { showT('تعذّرت مشاركة الشاشة: ' + e.message, 'err'); return; }
      }
      updCtrl();
    }
    function updCtrl() {
      const m = document.getElementById('micBtn'); m.className = 'cbtn ' + (micOn ? 'on' : 'off'); m.textContent = micOn ? '🎤' : '🔇';
      const c = document.getElementById('camBtn'); c.className = 'cbtn ' + (camOn ? 'on' : 'off'); c.textContent = camOn ? '📷' : '📵';
      const s = document.getElementById('scrBtn'); s.className = 'cbtn ' + (scrOn ? 'scron' : 'on'); s.textContent = scrOn ? '⏹️' : '🖥️';
    }

    async function endSession() {
      const mins = Math.floor(sesSec / 60);
      const secs = sesSec % 60;
      const durStr = mins > 0 ? `${mins} دقيقة ${secs > 0 ? 'و' + secs + ' ثانية' : ''}` : `${secs} ثانية`;
      if (!confirm(`هل تريد إنهاء الجلسة؟\nمدة الجلسة: ${durStr}`)) return;
      if (sesTInt) clearInterval(sesTInt);
      if (sesChatL) sesChatL();
      if (pc) { pc.close(); pc = null; }
      if (locSt) locSt.getTracks().forEach(t => t.stop());
      if (scrSt) scrSt.getTracks().forEach(t => t.stop());
      locSt = null; scrSt = null;

      if (curSesBid) {
        try {
          const bS = await db.collection('bookings').doc(curSesBid).get();
          const bk = bS.data();
          await db.collection('sessions').doc(curSesBid).update({ status: 'ended', endedAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => { });
          await db.collection('bookings').doc(curSesBid).update({ status: 'completed' }).catch(() => { });
          curSesBk = null;
          curSesBk = null;
          curSesBk = null;

          if (bk?.tutorId === CU?.uid) {
            const net = bk.price - (bk.fee || 0);
            await db.runTransaction(async tx => {
              const r = db.collection('wallets').doc(CU.uid);
              const s = await tx.get(r);
              const b = s.exists ? (s.data().balance || 0) : 0;
              tx.set(r, { balance: b + net, userId: CU.uid }, { merge: true });
            });
            await db.collection('transactions').add({ userId: CU.uid, type: 'credit', kind: 'booking', amount: net, description: `أرباح جلسة مع ${bk.studentName}`, bookingId: curSesBid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            await loadWal();
            document.getElementById('mainNav').style.display = '';
            go('dashboard');
            // Tutor also gets review prompt
            setTimeout(() => {
              revBid = curSesBid; revTid = bk.studentId;
              const ti = document.getElementById('revTutorInfo');
              if (ti) {
                const stBg = ABG[(bk.studentName?.charCodeAt(0) || 0) % ABG.length] || '#fde68a';
                ti.innerHTML = `<div style="width:42px;height:42px;border-radius:50%;background:${stBg};display:flex;align-items:center;justify-content:center;font-weight:900;font-family:'Fraunces',serif;font-size:1.1rem;flex-shrink:0">${bk.studentName?.[0] || 'ط'}</div><div><div style="font-weight:700;font-size:.9rem">${bk.studentName}</div><div style="font-size:.75rem;color:var(--muted)">طالب · ${bk.date} ${bk.time}</div></div>`;
              }
              const sub = document.getElementById('revSub');
              if (sub) sub.textContent = `قيّم جلستك مع ${bk.studentName}`;
              const revH = document.querySelector('#revMod .mtitle, #revMod [style*="انتهت"]');
              setSt(0); document.getElementById('revCmt').value = '';
              openM('revMod');
              showT(`✅ أرباحك $${net.toFixed(2)} أُضيفت لمحفظتك. 💰`, 'suc');
            }, 700);
          } else {
            // Show review modal for student
            document.getElementById('mainNav').style.display = '';
            go('dashboard');
            setTimeout(() => {
              revBid = curSesBid; revTid = bk.tutorId;
              // Populate tutor mini-card
              const ti = document.getElementById('revTutorInfo');
              if (ti) {
                const tData = allT.find(t => t.id === bk.tutorId) || {};
                const bg = tData.color || '#fde68a';
                const avHTML = tData.photo ? `<img src="${tData.photo}" style="width:42px;height:42px;border-radius:50%;object-fit:cover">` : `<div style="width:42px;height:42px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:900;font-family:'Fraunces',serif;font-size:1.1rem;flex-shrink:0">${bk.tutorName?.[0] || 'م'}</div>`;
                ti.innerHTML = `${avHTML}<div><div style="font-weight:700;font-size:.9rem">${bk.tutorName}</div><div style="font-size:.75rem;color:var(--muted)">${tData.category || 'معلم'} · ${bk.date} ${bk.time}</div></div>`;
              }
              const sub = document.getElementById('revSub');
              if (sub) sub.textContent = `كيف كانت جلستك مع ${bk.tutorName}؟`;
              setSt(0); document.getElementById('revCmt').value = '';
              openM('revMod');
            }, 600);
          }
        } catch (e) {
          console.error('endSession:', e);
          document.getElementById('mainNav').style.display = '';
          go('dashboard');
        }
      } else {
        document.getElementById('mainNav').style.display = '';
        go('dashboard');
      }
    }

    /* ── REVIEWS ── */
    const STAR_LABELS = ['', 'ضعيف 😞', 'مقبول 😐', 'جيد 🙂', 'جيد جداً 😊', 'ممتاز! 🌟'];
    function setSt(n) {
      revStar = n;
      document.querySelectorAll('.sbtn').forEach((b, i) => b.classList.toggle('lit', i < n));
      const lbl = document.getElementById('revStarLbl');
      if (lbl) lbl.textContent = STAR_LABELS[n] || '';
    }

    async function subRev() {
      if (!revStar) { showT('اختر عدد النجوم أولاً', 'err'); return; }
      const comment = document.getElementById('revCmt').value;
      try {
        await db.collection('reviews').add({
          bookingId: revBid, tutorId: revTid,
          studentId: CU.uid, studentName: CP?.name || 'طالب',
          rating: revStar, comment,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await db.collection('bookings').doc(revBid).update({ reviewed: true });
        // Update tutor rating
        const tS = await db.collection('users').doc(revTid).get();
        if (tS.exists) {
          const td = tS.data();
          const tot = (td.totalReviews || 0) + 1;
          const nr = (((td.rating || 0) * (td.totalReviews || 0)) + revStar) / tot;
          await db.collection('users').doc(revTid).update({ rating: parseFloat(nr.toFixed(2)), totalReviews: tot });
        }
        closeM('revMod');
        showT('✅ شكراً على تقييمك! ساعدت المجتمع.', 'suc');
        await loadT(); // Reload to get updated ratings
      } catch (e) { showT('خطأ: ' + e.message, 'err'); }
    }

    function openRevFromBk(bid, tid, tname) {
      revBid = bid; revTid = tid;
      document.getElementById('revSub').textContent = `كيف كانت جلستك مع ${tname}؟`;
      setSt(0); document.getElementById('revCmt').value = '';
      openM('revMod');
    }

    /* ── DASHBOARD ── */
    function buildSb() {
      if (!CP) return;
      const p = CP;
      const isTutor = p.role === 'tutor' || p.role === 'both' || p.role === 'admin';
      const rMap = { learner: 'متعلم', tutor: 'معلم', both: 'متعلم ومعلم', admin: 'مدير' };
      const sa = document.getElementById('sbAv');
      if (p.photo) sa.innerHTML = `<img src="${p.photo}">`;
      else { sa.textContent = p.name?.[0] || 'أ'; sa.style.background = p.color || 'var(--amber)'; }
      document.getElementById('sbNm').textContent = p.name || '—';
      document.getElementById('sbRl').textContent = rMap[p.role] || p.role;

      const items = [
        { k: 'overview', i: '📊', l: 'الرئيسية', show: true },
        { k: 'sessions', i: '📅', l: 'جلساتي', show: true },
        { k: 'chat', i: '💬', l: 'الرسائل', show: true },
        { k: 'wallet', i: '💳', l: 'المحفظة', show: true },
      ];
      if (isTutor) items.push(
        { k: 'availability', i: '🕐', l: 'أوقاتي المتاحة', show: true },
        { k: 'earnings', i: '💰', l: 'الأرباح', show: true },
        { k: 'myReviews', i: '⭐', l: 'تقييماتي', show: true }
      );
      items.push(
        { k: 'editProfile', i: '👤', l: 'الملف الشخصي', show: true },
        { k: 'logout', i: '🚪', l: 'تسجيل الخروج', show: true }
      );
      document.getElementById('sbNav').innerHTML = items.map(it =>
        `<div class="ni ${it.k === dashTab ? 'act' : ''}" onclick="dNav('${it.k}')"><span class="nic">${it.i}</span>${it.l}</div>`
      ).join('');
    }

    async function dNav(k) {
      if (k === 'logout') { doLogout(); return; }
      if (k === 'editProfile') { go('editProfile'); return; }
      if (k === 'wallet') { go('wallet'); return; }
      if (k === 'chat') { go('chat'); return; }
      if (k === 'withdraw') { go('wallet'); return; }
      dashTab = k; buildSb();
      const el = document.getElementById('dashCon');
      el.innerHTML = '<div style="text-align:center;padding:80px"><div class="spin" style="margin:0 auto"></div></div>';
      if (k === 'overview') await rdOverview(el);
      else if (k === 'sessions') await rdSessions(el);
      else if (k === 'availability') await rdAvail(el);
      else if (k === 'earnings') await rdEarnings(el);
      else if (k === 'myReviews') await rdReviews(el);
    }

    function isSesTm(date, time) {
      if (!date || !time) return false;
      const now = new Date();
      const ses = new Date(`${date}T${time}:00`);
      const diffMins = (ses - now) / 60000;
      return diffMins < 60 && diffMins > -180; // 60 min before until 3 hours after
    }

    function canJoinSession(b) {
      // Can always join if confirmed — show button regardless of time window
      return b.status === 'confirmed';
    }

    function bkTblHTML(list) {
      if (!list.length) return `<div style="text-align:center;padding:40px;color:var(--muted)"><div style="font-size:2.5rem;margin-bottom:10px">📭</div><p>لا توجد جلسات بعد.</p><a style="color:var(--teal);cursor:pointer;font-weight:600;display:inline-block;margin-top:8px" onclick="go('explore')">اعثر على معلم ←</a></div>`;
      const stL = { pending: '⏳ بانتظار الموافقة', confirmed: '✅ مؤكد', completed: '🏁 مكتمل', cancelled: '❌ ملغى', refunded: '↩️ مسترد' };
      const stCls = { pending: 'pp', confirmed: 'pc', completed: 'pco', cancelled: 'pca', refunded: 'pc' };
      const isMobile = window.innerWidth <= 768;

      if (isMobile) {
        return `<div class="bkcards">
  ${list.map(b => {
          const isS = b.studentId === CU?.uid;
          const isTutorOfBooking = b.tutorId === CU?.uid;
          const other = isS ? b.tutorName : b.studentName;
          const otherUid = isS ? b.tutorId : b.studentId;
          const canJoin = canJoinSession(b);
          const canRev = isS && b.status === 'completed' && !b.reviewed;
          const canCan = isS && ['pending'].includes(b.status);
          const canTutorAct = isTutorOfBooking && b.status === 'pending';
          const canChat = otherUid && CU?.uid !== otherUid;
          const safeName = escapeHTML(other || '—').replace(/'/g, "\\'");
          const safeUid = (otherUid || '').replace(/'/g, "\\'");
          const avBg = ABG[(other?.charCodeAt(0) || 0) % ABG.length] || '#fde68a';
          return `<div class="bkcard">
          <div class="bkcard-h">
            <div style="display:flex;align-items:center;gap:10px;min-width:0">
              <div class="tav" style="background:${avBg};flex-shrink:0">${escapeHTML(other?.[0] || '؟')}</div>
              <div style="min-width:0">
                <div class="bkcard-title">${escapeHTML(other || '—')}</div>
                <div class="bkcard-sub">${isS ? 'معلم' : 'طالب'} · ${escapeHTML(b.date || '—')} · ${escapeHTML(b.timeLbl || b.time || '')}</div>
              </div>
            </div>
            <span class="pill ${stCls[b.status] || 'pp'}" style="white-space:nowrap">${stL[b.status] || escapeHTML(b.status || '')}</span>
          </div>
          <div class="bkcard-meta">
            <span class="tag">⏱️ ${escapeHTML(String(b.duration || 60))} دقيقة</span>
            <span class="tag tag-a">💰 ${Number(b.price || 0).toFixed(2)} ج.م</span>
          </div>
          <div class="bkcard-kv">
            <span class="k">التاريخ</span><span>${escapeHTML(b.date || '—')}</span>
            <span class="k">الوقت</span><span>${escapeHTML(b.timeLbl || b.time || '—')}</span>
          </div>
          <div class="bkcard-actions">
            ${canTutorAct ? `<button class="btn btn-s btn-xs" onclick="tutorApproveBk('${b.id}','${b.studentId}',${b.total || b.price || 0})">✅ موافقة</button><button class="btn btn-d btn-xs" onclick="tutorRejectBk('${b.id}','${b.studentId}',${b.total || b.price || 0})">❌ رفض</button>` : ''}
            ${canJoin ? `<button class="btn btn-p btn-xs" style="background:linear-gradient(135deg,var(--teal),var(--teal2));font-weight:800;letter-spacing:.02em" onclick="enterSession('${b.id}')">🎥 دخول الجلسة</button>` : ''}
            ${canChat ? `<button class="btn btn-xs" style="background:var(--wa-green);color:#fff" onclick="openChatWith('${safeUid}','${safeName}','','','','${escapeHTML(other?.[0] || '؟')}')">💬 شات</button>` : ''}
            ${canRev ? `<button class="btn btn-a btn-xs" onclick="openRevFromBk('${b.id}','${b.tutorId}','${escapeHTML(b.tutorName || '')}')">⭐ قيّم</button>` : ''}
            ${canCan ? `<button class="btn btn-xs" style="background:transparent;color:var(--red);border:1.5px solid var(--red);border-radius:var(--rxs)" onclick="cancelBk('${b.id}',${b.total || b.price || 0})">إلغاء</button>` : ''}
            ${!canTutorAct && !canJoin && !canRev && !canCan && !canChat ? '<span style="color:var(--muted);font-size:.78rem">—</span>' : ''}
          </div>
        </div>`;
        }).join('')}
        </div>`;
      }

      return `<div class="dtbl-wrap"><table class="dtbl"><thead><tr><th>الطرف الآخر</th><th>التاريخ والوقت</th><th>المبلغ</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>
  ${list.map(b => {
        const isS = b.studentId === CU?.uid;
        const isTutorOfBooking = b.tutorId === CU?.uid;
        const other = isS ? b.tutorName : b.studentName;
        const otherUid = isS ? b.tutorId : b.studentId;
        const canJoin = canJoinSession(b);
        const canRev = isS && b.status === 'completed' && !b.reviewed;
        const canCan = isS && ['pending'].includes(b.status);
        const canTutorAct = isTutorOfBooking && b.status === 'pending';
        const canChat = otherUid && CU?.uid !== otherUid;
        const safeName = escapeHTML(other || '').replace(/'/g, "\\'");
        const safeUid = (otherUid || '').replace(/'/g, "\\'");
        const avBg = ABG[(other?.charCodeAt(0) || 0) % ABG.length] || '#fde68a';
        return `<tr>
      <td><div style="display:flex;align-items:center;gap:9px">
        <div class="tav" style="background:${avBg}">${escapeHTML(other?.[0] || '؟')}</div>
        <div><div style="font-weight:700;font-size:.87rem">${escapeHTML(other || '—')}</div><div style="font-size:.71rem;color:var(--muted)">${isS ? 'معلم' : 'طالب'}</div></div>
      </div></td>
      <td><div style="font-weight:600;font-size:.86rem">${escapeHTML(b.date || '—')}</div><div style="font-size:.76rem;color:var(--muted)">${escapeHTML(b.time || '')} · ${escapeHTML(String(b.duration || 60))} دقيقة</div></td>
      <td style="font-weight:700;color:var(--teal);font-size:.92rem">${Number(b.price || 0).toFixed(2)} ج.م</td>
      <td><span class="pill ${stCls[b.status] || 'pp'}" style="white-space:nowrap">${stL[b.status] || escapeHTML(b.status || '')}</span></td>
      <td><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">
        ${canTutorAct ? `<button class="btn btn-s btn-xs" onclick="tutorApproveBk('${b.id}','${b.studentId}',${b.total || b.price || 0})">✅ موافقة</button><button class="btn btn-d btn-xs" onclick="tutorRejectBk('${b.id}','${b.studentId}',${b.total || b.price || 0})">❌ رفض</button>` : ''}
        ${canJoin ? `<button class="btn btn-p btn-xs" style="background:linear-gradient(135deg,var(--teal),var(--teal2));font-weight:800;letter-spacing:.02em" onclick="enterSession('${b.id}')">🎥 دخول الجلسة</button>` : ''}
        ${canChat ? `<button class="btn btn-xs" style="background:var(--wa-green);color:#fff" onclick="openChatWith('${safeUid}','${safeName}','','','','${escapeHTML(other?.[0] || '؟')}')">💬 شات</button>` : ''}
        ${canRev ? `<button class="btn btn-a btn-xs" onclick="openRevFromBk('${b.id}','${b.tutorId}','${escapeHTML(b.tutorName || '')}')">⭐ قيّم</button>` : ''}
        ${canCan ? `<button class="btn btn-xs" style="background:transparent;color:var(--red);border:1.5px solid var(--red);border-radius:var(--rxs)" onclick="cancelBk('${b.id}',${b.total || b.price || 0})">إلغاء</button>` : ''}
        ${!canTutorAct && !canJoin && !canRev && !canCan && !canChat ? '<span style="color:var(--muted);font-size:.78rem">—</span>' : ''}
      </div></td>
    </tr>`;
      }).join('')}</tbody></table></div>`;
    }

    async function rdOverview(el) {
      const uid = CU.uid, p = CP;
      const isTutor = p.role === 'tutor' || p.role === 'both' || p.role === 'admin';
      const [sb, tb] = await Promise.all([
        db.collection('bookings').where('studentId', '==', uid).get().catch(() => ({ docs: [] })),
        db.collection('bookings').where('tutorId', '==', uid).get().catch(() => ({ docs: [] }))
      ]);
      const compT = tb.docs.filter(d => d.data().status === 'completed');
      const earnings = compT.reduce((s, d) => s + ((d.data().price || 0) - (d.data().fee || 0)), 0);
      const upcoming = sb.docs.filter(d => ['pending', 'confirmed'].includes(d.data().status)).length;
      const all = [...sb.docs, ...tb.docs].map(d => ({ id: d.id, ...d.data() })).filter((b, i, a) => a.findIndex(x => x.id === b.id) === i).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 10);

      el.innerHTML = `
    <div class="dashphdr">
      <div><div style="font-size:.72rem;font-weight:800;letter-spacing:.1em;color:var(--amber);margin-bottom:3px">لوحة التحكم</div><div class="dashph">مرحباً، ${p.name?.split(' ')[0] || 'أهلاً'} 👋</div></div>
      <button class="btn btn-p" onclick="go('explore')">+ احجز جلسة جديدة</button>
    </div>
    <div class="srow">
      <div class="sc acc"><div class="scic">📅</div><div class="scval">${sb.docs.length}</div><div class="sclbl">جلساتي كطالب</div></div>
      <div class="sc"><div class="scic">⏰</div><div class="scval">${upcoming}</div><div class="sclbl">جلسات قادمة</div></div>
      ${isTutor ? `
      <div class="sc amb"><div class="scic">💰</div><div class="scval">$${earnings.toFixed(0)}</div><div class="sclbl">صافي أرباحي</div></div>
      <div class="sc"><div class="scic">⭐</div><div class="scval">${(p.rating || 0).toFixed(1) || '—'}</div><div class="sclbl">تقييمي كمعلم</div></div>
      ` : `
      <div class="sc"><div class="scic">💳</div><div class="scval" style="font-size:1.4rem">${walBal.toFixed(0)}<span style="font-size:.7rem;font-weight:600;opacity:.6"> ج.م</span></div><div class="sclbl">رصيد المحفظة</div></div>
      <div class="sc"><div class="scic">✅</div><div class="scval">${sb.docs.filter(d => d.data().status === 'completed').length}</div><div class="sclbl">جلسات مكتملة</div></div>
      `}
    </div>
    ${isTutor ? `<div class="dsec" style="margin-bottom:18px"><div class="dsech"><div class="dsect">📊 ملفي كمعلم — ${(p.rating || 0).toFixed(1)} ⭐ · ${p.totalReviews || 0} تقييم</div><button class="btn btn-gh btn-sm" onclick="go('editProfile')">تعديل الملف</button></div><div style="padding:16px;display:flex;gap:18px;flex-wrap:wrap"><div class="expb"><span>💰</span><div><strong>$${p.price || 0}/ساعة</strong><div style="font-size:.7rem;color:var(--muted)">السعر</div></div></div><div class="expb"><span>🏆</span><div><strong>${p.experience || 0} سنة</strong><div style="font-size:.7rem;color:var(--muted)">خبرة</div></div></div><button class="btn btn-o btn-sm" onclick="dNav('availability')">⏰ إدارة الأوقات المتاحة</button></div></div>` : ''}
    ${upcoming > 0 ? `<div class="dsec" style="margin-bottom:18px;border-color:var(--teal);"><div class="dsech" style="background:var(--teal3)"><div class="dsect" style="color:var(--teal)">⏰ جلساتك القادمة (${upcoming})</div><button class="btn btn-p btn-sm" onclick="dNav('sessions')">عرض الكل</button></div>${bkTblHTML(all.filter(b => ['pending', 'confirmed'].includes(b.status) && b.studentId === uid))}</div>` : ''}
    <div class="dsec"><div class="dsech"><div class="dsect">آخر الجلسات</div><button class="btn btn-gh btn-sm" onclick="dNav('sessions')">عرض الكل</button></div>${bkTblHTML(all)}</div>
  `;
    }

    async function rdSessions(el) {
      const uid = CU.uid;
      const [s, t] = await Promise.all([
        db.collection('bookings').where('studentId', '==', uid).get().catch(() => ({ docs: [] })),
        db.collection('bookings').where('tutorId', '==', uid).get().catch(() => ({ docs: [] }))
      ]);
      const all = [...s.docs, ...t.docs].map(d => ({ id: d.id, ...d.data() })).filter((b, i, a) => a.findIndex(x => x.id === b.id) === i).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); // sorted client-side
      el.innerHTML = `<div class="dashphdr"><div class="dashph">📅 كل جلساتي</div><button class="btn btn-p" onclick="go('explore')">+ حجز جديد</button></div><div class="dsec">${bkTblHTML(all)}</div>`;
    }

    async function buildWithdrawPage(el) {
      const ws = await db.collection('wallets').doc(CU.uid).get().catch(() => null);
      const walBalance = ws?.exists ? (ws.data().balance || 0) : 0;
      const wdSnap = await db.collection('withdrawalRequests').where('userId', '==', CU.uid).orderBy('createdAt', 'desc').limit(10).get().catch(() => ({ docs: [] }));
      const stLbl = { pending: '⏳ قيد المراجعة', approved: '✅ معتمد', rejected: '❌ مرفوض' };
      const stCl = { pending: 'pp', approved: 'pc', rejected: 'pca' };
      el.innerHTML = `
        <div class="dashphdr"><div class="dashph">🏦 سحب الأرباح</div></div>
        <div style="max-width:600px">
          <div style="background:linear-gradient(135deg,#065f46,#10b981);border-radius:18px;padding:22px 24px;color:#fff;margin-bottom:20px">
            <div style="font-size:.76rem;opacity:.7;margin-bottom:4px">الرصيد المتاح للسحب</div>
            <div style="font-family:'Fraunces',serif;font-size:2.5rem;font-weight:900">${walBalance.toFixed(2)} ج.م</div>
            <div style="font-size:.72rem;opacity:.55;margin-top:6px">الحد الأدنى للسحب: 100 ج.م</div>
          </div>
          <div class="card" style="margin-bottom:20px">
            <div class="ch"><div class="ct">💸 طلب سحب جديد</div></div>
            <div class="cb">
              <div class="fg">
                <label>المبلغ المطلوب (ج.م) <span class="req">*</span></label>
                <input type="number" id="wdAmt" placeholder="الحد الأدنى 100 ج.م" min="100" max="${walBalance}"/>
                <div class="fh">رصيدك المتاح: ${walBalance.toFixed(2)} ج.م</div>
              </div>
              <div class="fg fr">
                <div>
                  <label>طريقة الاستلام <span class="req">*</span></label>
                  <select id="wdMethod" onchange="updWdFields()">
                    <option value="instapay">InstaPay</option>
                    <option value="vodafone">فودافون كاش</option>
                    <option value="bank">تحويل بنكي</option>
                  </select>
                </div>
                <div>
                  <label id="wdAccLbl">رقم الهاتف <span class="req">*</span></label>
                  <input type="text" id="wdAccount" placeholder="01xxxxxxxxx"/>
                </div>
              </div>
              <div class="fg">
                <label>الاسم الكامل <span class="req">*</span></label>
                <input type="text" id="wdName" placeholder="الاسم كما في البنك/المحفظة" value="${CP?.name || ''}"/>
              </div>
              <button class="btn btn-p" style="width:100%;padding:13px;background:linear-gradient(135deg,#065f46,#10b981)" onclick="submitWithdrawal()">
                🏦 تقديم طلب السحب
              </button>
            </div>
          </div>
          <div class="card">
            <div class="ch"><div class="ct">📋 سجل طلبات السحب</div></div>
            <div style="padding:0">
              ${wdSnap.docs.length ? wdSnap.docs.map(d => {
        const w = { ...d.data(), id: d.id };
        const dt = w.createdAt?.toDate ? w.createdAt.toDate().toLocaleDateString('ar-SA') : '—';
        return `<div class="txitem" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
                  <div style="display:flex;align-items:center;gap:12px">
                    <div class="txic db">💸</div>
                    <div>
                      <div style="font-weight:700;font-size:.84rem">\${w.amount} ج.م ← \${w.methodName||w.method}</div>
                      <div style="font-size:.7rem;color:var(--muted)">\${dt} · \${w.accountNumber||''}</div>
                    </div>
                  </div>
                  <span class="pill \${stCl[w.status]||'pp'}">\${stLbl[w.status]||w.status}</span>
                </div>`;
      }).join('') : '<div style="text-align:center;padding:28px;color:var(--muted)">لا توجد طلبات سحب سابقة</div>'}
            </div>
          </div>
        </div>`;
    }

    function getWdElements() {
      const methodEl = document.getElementById('wdMethod');
      const amtEl = document.getElementById('wdAmt');
      const accountEl = document.getElementById('wdAccount') || document.getElementById('wdAccNum');
      const nameEl = document.getElementById('wdName') || document.getElementById('wdAccName');
      const labelEl = document.getElementById('wdAccLbl') || document.getElementById('wdAccLabel');
      return { methodEl, amtEl, accountEl, nameEl, labelEl };
    }

    function updWdFields() {
      const { methodEl, accountEl, labelEl } = getWdElements();
      const m = methodEl?.value;
      if (!labelEl || !accountEl) return;
      if (m === 'bank') {
        labelEl.innerHTML = 'رقم الحساب / IBAN <span class="req">*</span>';
        accountEl.placeholder = 'EG18XXXX...';
      } else if (m === 'instapay') {
        labelEl.innerHTML = 'رقم الهاتف / InstaPay <span class="req">*</span>';
        accountEl.placeholder = '01xxxxxxxxx';
      } else {
        labelEl.innerHTML = 'رقم الهاتف <span class="req">*</span>';
        accountEl.placeholder = '01xxxxxxxxx';
      }
      accountEl.style.direction = 'ltr';
    }

    async function submitWithdrawal() {
      if (!CU) { openM('loginMod'); return; }

      const { methodEl, amtEl, accountEl, nameEl } = getWdElements();
      const amt = parseFloat(amtEl?.value || 0);
      const method = methodEl?.value || 'instapay';
      const account = accountEl?.value?.trim();
      const name = nameEl?.value?.trim();
      const methodNames = { instapay: 'InstaPay', vodafone: 'فودافون كاش', bank: 'تحويل بنكي' };

      if (!amt || amt < 100) { showT('الحد الأدنى للسحب 100 ج.م', 'err'); return; }
      if (!account) { showT('أدخل رقم الحساب أو الهاتف', 'err'); return; }
      if (!name) { showT('أدخل اسمك الكامل', 'err'); return; }

      const reqRef = db.collection('withdrawalRequests').doc();
      try {
        await db.runTransaction(async tx => {
          const r = db.collection('wallets').doc(CU.uid);
          const s = await tx.get(r);
          const bal = s.exists ? (s.data().balance || 0) : 0;
          if (amt > bal) throw new Error(`رصيدك (${bal.toFixed(2)} ج.م) غير كافٍ`);
          tx.set(r, { balance: bal - amt, userId: CU.uid }, { merge: true });
          tx.set(reqRef, {
            userId: CU.uid,
            userName: CP?.name || '—',
            userPhone: CP?.phone || '',
            amount: amt,
            currency: 'EGP',
            method,
            methodName: methodNames[method] || method,
            accountNumber: account,
            accountName: name,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          tx.set(db.collection('transactions').doc(reqRef.id), {
            userId: CU.uid,
            type: 'debit',
            kind: 'withdrawal',
            amount: amt,
            currency: 'EGP',
            status: 'pending',
            description: `طلب سحب أرباح — ${methodNames[method] || method}`,
            requestId: reqRef.id,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        });

        walBal = Math.max(0, walBal - amt);
        const nw = document.getElementById('nwAmt'); if (nw) nw.textContent = walBal.toFixed(2) + ' ج.م';
        const wb = document.getElementById('wBal'); if (wb) wb.textContent = walBal.toFixed(2);
        const wdBal = document.getElementById('wdBal'); if (wdBal) wdBal.textContent = walBal.toFixed(2) + ' ج.م';
        if (amtEl) amtEl.value = '';
        if (accountEl) accountEl.value = '';
        if (nameEl && CP?.name) nameEl.value = CP.name;

        showT('✅ تم تقديم طلب السحب — تم حجز المبلغ بانتظار مراجعة الإدارة', 'suc');
        await loadTxList().catch(() => { });
        dNav('withdraw');
      } catch (e) {
        showT('خطأ: ' + e.message, 'err');
      }
    }

    async function cancelBk(bid, refund) {
      if (!confirm('إلغاء هذا الحجز واسترداد المبلغ؟')) return;
      try {
        await db.collection('bookings').doc(bid).update({ status: 'cancelled' });
        await db.runTransaction(async tx => {
          const r = db.collection('wallets').doc(CU.uid);
          const s = await tx.get(r);
          const b = s.exists ? (s.data().balance || 0) : 0;
          tx.set(r, { balance: b + refund, userId: CU.uid }, { merge: true });
        });
        await db.collection('transactions').add({ userId: CU.uid, type: 'credit', kind: 'booking', amount: refund, description: 'استرداد حجز ملغى', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        walBal += refund;
        document.getElementById('nwAmt').textContent = walBal.toFixed(2) + ' ج.م';
        showT(`✅ تم الإلغاء واسترداد ${parseFloat(refund).toFixed(2)} ج.م`, 'suc');
        await dNav('sessions');
      } catch (e) { showT('خطأ: ' + e.message, 'err'); }
    }

    async function rdAvail(el) {
      let saved = {};
      try { const s = await db.collection('availability').doc(CU.uid).get(); if (s.exists) saved = s.data().slots || {}; } catch (e) { }
      const grid = DAYS.map(day => {
        const ds = saved[day] || [];
        return `<div class="avday"><div class="avdlbl">${day}</div><div class="avtog-group"><div class="avtog-sect">🌅 صباحاً</div>${TIMES.filter(t => parseInt(t.v) < 12).map(t => `<div class="avtog ${ds.includes(t.v) ? 'on' : ''}" data-day="${day}" data-time="${t.v}" onclick="this.classList.toggle('on')">${t.lbl}</div>`).join('')}<div class="avtog-sect">🌆 مساءً</div>${TIMES.filter(t => parseInt(t.v) >= 12).map(t => `<div class="avtog ${ds.includes(t.v) ? 'on' : ''}" data-day="${day}" data-time="${t.v}" onclick="this.classList.toggle('on')">${t.lbl}</div>`).join('')}</div></div>`;
      }).join('');
      el.innerHTML = `<div class="dashphdr"><div class="dashph">🕐 أوقاتي المتاحة</div><button class="btn btn-p" onclick="saveAvail()">💾 حفظ الجدول</button></div><div class="card"><div class="cb"><p style="font-size:.82rem;color:var(--muted);margin-bottom:13px">انقر على الوقت لتفعيله. الأوقات الخضراء ستظهر للطلاب عند الحجز.</p><div class="avgrid">${grid}</div></div></div>`;
    }

    async function saveAvail() {
      const chips = document.querySelectorAll('.avgrid .avtog.on, .av-grid .avtog.on, #avGrid .avtog.on');
      const slots = {};
      chips.forEach(c => {
        const d = c.dataset.day, t = c.dataset.time;
        if (d && t) { if (!slots[d]) slots[d] = []; if (!slots[d].includes(t)) slots[d].push(t); }
      });
      try {
        await db.collection('availability').doc(CU.uid).set({ tutorId: CU.uid, slots, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        showT('✅ تم حفظ جدولك بنجاح', 'suc');
      } catch (e) { showT('خطأ: ' + e.message, 'err'); }
    }

    async function rdEarnings(el) {
      const snap = await db.collection('bookings').where('tutorId', '==', CU.uid).get().catch(() => ({ docs: [] }));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const comp = all.filter(b => b.status === 'completed');
      const gross = comp.reduce((s, b) => s + (b.price || 0), 0);
      const fees = comp.reduce((s, b) => s + (b.fee || 0), 0);
      const net = gross - fees;
      // Get wallet balance
      const ws = await db.collection('wallets').doc(CU.uid).get().catch(() => null);
      const walBalance = ws?.exists ? (ws.data().balance || 0) : 0;
      // Get pending withdrawal
      const wdSnap = await db.collection('withdrawalRequests').where('userId', '==', CU.uid).where('status', '==', 'pending').get().catch(() => ({ size: 0 }));
      el.innerHTML = `<div class="dashph" style="margin-bottom:20px">💰 الأرباح والإيرادات</div>
  <div class="srow" style="margin-bottom:20px">
    <div class="sc acc"><div class="scic">💵</div><div class="scval" style="font-size:1.5rem">${gross.toFixed(0)}</div><div class="sclbl">إجمالي الإيرادات (ج.م)</div></div>
    <div class="sc"><div class="scic">💸</div><div class="scval" style="font-size:1.5rem">${fees.toFixed(0)}</div><div class="sclbl">عمولة المنصة ${platformCommission}%</div></div>
    <div class="sc amb"><div class="scic">🏦</div><div class="scval" style="font-size:1.5rem">${net.toFixed(0)}</div><div class="sclbl">صافي الأرباح (ج.م)</div></div>
    <div class="sc"><div class="scic">💳</div><div class="scval" style="font-size:1.5rem">${walBalance.toFixed(0)}</div><div class="sclbl">رصيد المحفظة (ج.م)</div></div>
    <div class="sc"><div class="scic">📊</div><div class="scval" style="font-size:1.5rem">${comp.length}</div><div class="sclbl">جلسات مكتملة</div></div>
  </div>
  ${wdSnap.size ? `<div style="background:var(--amber3);border:1px solid rgba(245,158,11,.3);border-radius:var(--r);padding:12px 16px;margin-bottom:16px;font-size:.82rem">⏳ لديك <strong>${wdSnap.size}</strong> طلب سحب قيد المراجعة</div>` : ''}
  <div style="margin-bottom:20px;display:flex;gap:10px;flex-wrap:wrap">
    <button class="btn btn-p" onclick="dNav('withdraw')" style="background:linear-gradient(135deg,#065f46,#10b981)">
      🏦 طلب سحب الأرباح
    </button>
    <button class="btn btn-gh" onclick="go('wallet')">💳 شحن المحفظة</button>
  </div>
  <div class="dsec" style="overflow-x:auto">${comp.length ? `<table class="dtbl"><thead><tr><th>الطالب</th><th>التاريخ والوقت</th><th>المدة</th><th>الإيراد</th><th>العمولة</th><th>الصافي</th><th>الحالة</th></tr></thead><tbody>
    ${comp.map(b => `<tr>
      <td><strong>${b.studentName || '—'}</strong></td>
      <td style="white-space:nowrap;font-size:.8rem">${b.date || '—'}<br><span style="color:var(--muted);font-size:.72rem">${b.timeLbl || b.time || ''}</span></td>
      <td style="font-size:.8rem">${b.actualDuration ? b.actualDuration + 'د' : (b.duration || 60) + 'د'}</td>
      <td style="color:var(--teal);font-weight:800">${b.price || 0} ج.م</td>
      <td style="color:var(--muted);font-size:.82rem">${(b.fee || 0).toFixed(2)} ج.م</td>
      <td style="color:var(--green);font-weight:800">${((b.price || 0) - (b.fee || 0)).toFixed(2)} ج.م</td>
      <td>${b.adminConfirmed ? '<span class="pill pc">✓ مُحوَّل</span>' : '<span class="pill pp">⏳ بانتظار الإدارة</span>'}</td>
    </tr>`).join('')}</tbody></table>` : '<div style="text-align:center;padding:32px;color:var(--muted)">لا توجد جلسات مكتملة بعد</div>'}</div>`;
    }

    async function rdReviews(el) {
      const p = CP, isTutor = p.role === 'tutor' || p.role === 'both' || p.role === 'admin';
      const snap = await db.collection('reviews').where(isTutor ? 'tutorId' : 'studentId', '==', CU.uid).get().catch(() => ({ docs: [] }));
      const revs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const avg = revs.length ? (revs.reduce((s, r) => s + (r.rating || 0), 0) / revs.length).toFixed(1) : '—';
      el.innerHTML = `<div class="dashph" style="margin-bottom:20px">⭐ التقييمات</div>
  <div class="dsec" style="margin-bottom:16px"><div class="cb" style="display:flex;align-items:center;gap:16px">
    <div style="font-family:'Fraunces',serif;font-size:3rem;font-weight:900;color:var(--amber)">${avg}</div>
    <div><div style="font-weight:700">متوسط التقييم</div><div style="color:var(--muted);font-size:.8rem">${revs.length} تقييم إجمالي</div></div>
  </div></div>
  <div class="dsec">${revs.length ? revs.map(r => `<div style="padding:15px 18px;border-bottom:1px solid var(--border)"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><div style="font-weight:600">${r[isTutor ? 'studentName' : 'tutorName'] || '—'} <span class="stars">${'★'.repeat(r.rating || 5)}</span></div><div style="font-size:.71rem;color:var(--muted)">${r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString('ar-SA') : ''}</div></div><p style="font-size:.83rem;color:#374151">${r.comment || ''}</p></div>`).join('') : '<div style="text-align:center;padding:32px;color:var(--muted)">لا توجد تقييمات بعد</div>'}</div>`;
    }

    /* ── EDIT PROFILE ── */
    async function loadEditProf() {
      if (!CP) return;
      const p = CP;
      const isTutor = p.role === 'tutor' || p.role === 'both' || p.role === 'admin';
      document.getElementById('editFN').value = p.name?.split(' ')[0] || '';
      document.getElementById('editLN').value = p.name?.split(' ').slice(1).join(' ') || '';
      document.getElementById('editBio').value = p.bio || '';
      document.getElementById('editCnt').value = p.country || '';
      document.getElementById('editLng').value = p.lang || 'عربي';
      document.getElementById('editPh').value = p.photo || '';
      prvEditAv();
      if (isTutor) {
        document.getElementById('editTutSec').classList.remove('hidden');
        document.getElementById('editAvailSec').classList.remove('hidden');
        document.getElementById('editCat').value = p.category || 'برمجة';
        document.getElementById('editPrc').value = p.price || '';
        document.getElementById('editExp').value = p.experience || '';
        edSkList = Array.isArray(p.skills) ? [...p.skills] : [];
        rdEdSk();
        await buildEditAvGrid();
      }
    }

    function prvEditAv() {
      const url = document.getElementById('editPh').value;
      const el = document.getElementById('editAvPr');
      if (url) { el.innerHTML = `<img src="${url}">`; }
      else { el.textContent = CP?.name?.[0] || 'أ'; el.style.background = CP?.color || 'var(--amber)'; }
    }

    function rdEdSk() {
      const box = document.getElementById('skBox'), inp = document.getElementById('skInp');
      box.querySelectorAll('.sktag').forEach(e => e.remove());
      edSkList.forEach(s => {
        const t = document.createElement('div'); t.className = 'sktag';
        t.innerHTML = `${s}<button onclick="edSkList=edSkList.filter(x=>x!=='${s}');rdEdSk()" type="button">×</button>`;
        box.insertBefore(t, inp);
      });
    }
    function hdlSkEdit(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = e.target.value.trim();
        if (v && !edSkList.includes(v)) { edSkList.push(v); rdEdSk(); }
        e.target.value = '';
      }
    }

    async function buildEditAvGrid() {
      let saved = {};
      try { const s = await db.collection('availability').doc(CU.uid).get(); if (s.exists) saved = s.data().slots || {}; } catch (e) { }
      document.getElementById('avGrid').innerHTML = DAYS.map(day => {
        const ds = saved[day] || [];
        return `<div class="avday"><div class="avdlbl">${day}</div><div class="avtog-group"><div class="avtog-sect">🌅 صباحاً</div>${TIMES.filter(t => parseInt(t.v) < 12).map(t => `<div class="avtog ${ds.includes(t.v) ? 'on' : ''}" data-day="${day}" data-time="${t.v}" onclick="this.classList.toggle('on')">${t.lbl}</div>`).join('')}<div class="avtog-sect">🌆 مساءً</div>${TIMES.filter(t => parseInt(t.v) >= 12).map(t => `<div class="avtog ${ds.includes(t.v) ? 'on' : ''}" data-day="${day}" data-time="${t.v}" onclick="this.classList.toggle('on')">${t.lbl}</div>`).join('')}</div></div>`;
      }).join('');
    }

    async function savePrf() {
      const first = document.getElementById('editFN').value.trim();
      if (!first) { showT('أدخل اسمك الأول', 'err'); return; }
      const p = CP, isTutor = p.role === 'tutor' || p.role === 'both' || p.role === 'admin';
      const data = {
        name: `${first} ${document.getElementById('editLN').value.trim()}`.trim(),
        bio: document.getElementById('editBio').value,
        country: document.getElementById('editCnt').value,
        lang: document.getElementById('editLng').value,
        photo: selectedEditPhoto || document.getElementById('editPh').value
      };
      if (isTutor) {
        data.category = document.getElementById('editCat').value;
        data.price = parseFloat(document.getElementById('editPrc').value) || 0;
        data.experience = parseInt(document.getElementById('editExp').value) || 0;
        data.skills = edSkList;
        data.isApproved = true;
        // Save availability
        const chips = document.querySelectorAll('#avGrid .avtog.on');
        const slots = {};
        chips.forEach(c => {
          const d = c.dataset.day, t = c.dataset.time;
          if (d && t) { if (!slots[d]) slots[d] = []; if (!slots[d].includes(t)) slots[d].push(t); }
        });
        if (Object.keys(slots).length) await db.collection('availability').doc(CU.uid).set({ tutorId: CU.uid, slots, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      }
      try {
        await db.collection('users').doc(CU.uid).update(data);
        // Refresh from Firestore
        const freshSnap = await db.collection('users').doc(CU.uid).get();
        if (freshSnap.exists) CP = freshSnap.data();
        else CP = { ...CP, ...data };
        updNavU();
        await loadT(); // Reload all tutors to reflect changes
        showT('✅ تم حفظ الملف الشخصي بنجاح', 'suc');
        go('dashboard');
      } catch (e) { showT('خطأ: ' + e.message, 'err'); }
    }

    /* ── REGISTRATION ── */
    function pickRole(r) {
      regRole = r;
      ['learner', 'tutor', 'both'].forEach(x => document.getElementById(`ro-${x}`)?.classList.toggle('act', x === r));
    }

    function gRS(step) {
      if (step === 3) {
        const f = document.getElementById('r2F').value.trim();
        const e = document.getElementById('r2E').value.trim();
        const p = document.getElementById('r2P').value;
        if (!f || !e || !p) { showT('يرجى ملء جميع الحقول', 'err'); return; }
        if (p.length < 6) { showT('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'err'); return; }
        if (regRole === 'learner') { doReg(); return; } // Skip tutor steps for learner
      }
      if (step === 4) {
        if (!document.getElementById('r3Bio')?.value.trim()) { showT('أضف نبذة تعريفية', 'err'); return; }
        if (!document.getElementById('r3Prc')?.value) { showT('أدخل السعر بالساعة', 'err'); return; }
        buildRegAv();
      }
      for (let i = 1; i <= 4; i++) document.getElementById(`rS${i}`)?.classList.toggle('hidden', i !== step);
      regStep = step; updSD();
    }

    function updSD() {
      for (let i = 1; i <= 4; i++) {
        const d = document.getElementById(`sd${i}`), l = document.getElementById(`sl${i}`);
        if (d) d.className = 'sd' + (i < regStep ? ' done' : i === regStep ? ' act' : '');
        if (l) l.className = 'sline' + (i < regStep ? ' done' : '');
      }
    }

    function hdlR3Sk(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = e.target.value.trim();
        if (v && !r3SkList.includes(v)) { r3SkList.push(v); rdR3Sk(); }
        e.target.value = '';
      }
    }
    function rdR3Sk() {
      const box = document.getElementById('r3SkBox'), inp = document.getElementById('r3SkI');
      box.querySelectorAll('.sktag').forEach(e => e.remove());
      r3SkList.forEach(s => {
        const t = document.createElement('div'); t.className = 'sktag';
        t.innerHTML = `${s}<button onclick="r3SkList=r3SkList.filter(x=>x!=='${s}');rdR3Sk()" type="button">×</button>`;
        box.insertBefore(t, inp);
      });
    }

    function buildRegAv() {
      const grid = document.getElementById('regAvGrid'); if (!grid) return;
      grid.innerHTML = DAYS.map(day => `<div class="avday"><div class="avdlbl">${day}</div><div class="avtog-group"><div class="avtog-sect">🌅 صباحاً</div>${TIMES.filter(t => parseInt(t.v) < 12).map(t => `<div class="avtog" data-day="${day}" data-time="${t.v}" onclick="this.classList.toggle('on')">${t.lbl}</div>`).join('')}<div class="avtog-sect">🌆 مساءً</div>${TIMES.filter(t => parseInt(t.v) >= 12).map(t => `<div class="avtog" data-day="${day}" data-time="${t.v}" onclick="this.classList.toggle('on')">${t.lbl}</div>`).join('')}</div></div>`).join('');
    }

    async function doReg() {
      const email = document.getElementById('r2E').value.trim();
      const pass = document.getElementById('r2P').value;
      const first = document.getElementById('r2F').value.trim();
      const last = document.getElementById('r2L').value.trim();
      const phone = document.getElementById('r2Ph')?.value?.trim() || '';
      const btn = document.getElementById('finRegBtn');
      if (!first) { showT('أدخل اسمك الأول', 'err'); return; }
      if (!email || !email.includes('@')) { showT('أدخل بريدًا إلكترونيًا صحيحًا', 'err'); return; }
      if (!phone || phone.length < 10) { showT('أدخل رقم هاتف صحيح (10 أرقام على الأقل)', 'err'); return; }
      if (pass.length < 6) { showT('كلمة المرور قصيرة جداً (6 أحرف على الأقل)', 'err'); return; }
      if (btn) { btn.textContent = 'جاري الإنشاء...'; btn.disabled = true; }
      try {
        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        const uid = cred.user.uid;
        const isTutor = regRole === 'tutor' || regRole === 'both';

        // Collect availability
        const avSlots = {};
        document.querySelectorAll('#regAvGrid .avtog.on').forEach(el => {
          const d = el.dataset.day, t = el.dataset.time;
          if (d && t) { if (!avSlots[d]) avSlots[d] = []; if (!avSlots[d].includes(t)) avSlots[d].push(t); }
        });

        const profile = {
          uid, email, phone, name: `${first} ${last}`.trim(),
          role: regRole, bio: '', photo: regPhotoData || '', skills: [], price: 0,
          lang: 'عربي', country: '', category: '', rating: 0,
          totalReviews: 0, totalSessions: 0,
          isApproved: !isTutor,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (isTutor) {
          profile.bio = document.getElementById('r3Bio')?.value || '';
          profile.experience = parseInt(document.getElementById('r3Exp')?.value) || 0;
          profile.price = parseFloat(document.getElementById('r3Prc')?.value) || 0;
          profile.category = document.getElementById('r3Cat')?.value || '';
          profile.lang = document.getElementById('r3Lng')?.value || 'عربي';
          profile.country = document.getElementById('r3Cnt')?.value || '';
          profile.skills = r3SkList;
          profile.isApproved = true;
        }

        const batch = db.batch();
        batch.set(db.collection('users').doc(uid), profile);
        batch.set(db.collection('wallets').doc(uid), { balance: 0, userId: uid });
        if (isTutor && Object.keys(avSlots).length) {
          batch.set(db.collection('availability').doc(uid), { tutorId: uid, slots: avSlots, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        }
        await batch.commit();

        CP = profile;
        closeM('regMod');
        showT(`🎉 مرحباً ${first}! تم إنشاء حسابك بنجاح.`, 'suc');
        updNavU();
        startMsgL();
        // Add tutor to local list immediately so they show up in explore
        if (isTutor) {
          allT.push({ ...profile, id: uid });
          allT.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        }
        await loadT(); // Also reload from Firestore
        go('dashboard');
      } catch (e) {
        const errMap = {
          'auth/email-already-in-use': 'هذا البريد الإلكتروني مستخدم بالفعل. <a onclick="switchM(\'regMod\',\'loginMod\')" style="color:var(--teal);cursor:pointer;text-decoration:underline">سجّل دخولك</a>',
          'auth/invalid-email': 'صيغة البريد الإلكتروني غير صحيحة',
          'auth/weak-password': 'كلمة المرور ضعيفة جداً (يجب أن تكون 6 أحرف على الأقل)',
          'auth/network-request-failed': 'تحقق من اتصالك بالإنترنت',
        };
        const msg = errMap[e.code] || e.message;
        showT('خطأ: ' + msg.replace(/<[^>]*>/g, ''), 'err');
        if (btn) { btn.textContent = '🎉 إنشاء الحساب'; btn.disabled = false; }
      }
    }

    /* ── AUTH ── */
    function togPassVis(inputId, btn) {
      const inp = document.getElementById(inputId);
      if (!inp) return;
      if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
      else { inp.type = 'password'; btn.textContent = '👁'; }
    }

    async function doLogin() {
      const e = document.getElementById('liE').value.trim();
      const p = document.getElementById('liP').value;
      const errEl = document.getElementById('loginErr');
      if (errEl) errEl.classList.add('hidden');
      if (!e || !p) { showLoginErr('أدخل البريد الإلكتروني وكلمة المرور'); return; }
      if (!e.includes('@')) { showLoginErr('البريد الإلكتروني غير صحيح'); return; }
      if (p.length < 6) { showLoginErr('كلمة المرور قصيرة جداً (6 أحرف على الأقل)'); return; }
      const btn = document.getElementById('liBtn');
      btn.innerHTML = '<div class="spin spin-sm spin-wh"></div> جاري الدخول...'; btn.disabled = true;
      try {
        await auth.signInWithEmailAndPassword(e, p);
        closeM('loginMod');
        showT('مرحباً بعودتك! 👋', 'suc');
        go('dashboard');
      } catch (err) {
        const errMap = {
          'auth/wrong-password': 'كلمة المرور غير صحيحة',
          'auth/user-not-found': 'لا يوجد حساب بهذا البريد الإلكتروني',
          'auth/invalid-credential': 'البريد أو كلمة المرور غير صحيحة',
          'auth/invalid-email': 'صيغة البريد الإلكتروني غير صحيحة',
          'auth/too-many-requests': 'تم تجاوز عدد المحاولات. انتظر قليلاً ثم أعد المحاولة',
          'auth/network-request-failed': 'تحقق من اتصالك بالإنترنت',
          'auth/user-disabled': 'تم تعطيل هذا الحساب. تواصل مع الدعم',
        };
        showLoginErr(errMap[err.code] || 'حدث خطأ، حاول مرة أخرى');
      } finally {
        btn.innerHTML = 'تسجيل الدخول'; btn.disabled = false;
      }
    }

    function showLoginErr(msg) {
      const el = document.getElementById('loginErr');
      if (el) { el.textContent = '⚠️ ' + msg; el.classList.remove('hidden'); }
      else showT(msg, 'err');
    }

    async function doLogout() {
      if (chatL) { chatL(); chatL = null; }
      if (msgUnsubL) { msgUnsubL(); msgUnsubL = null; }
      if (bookingNotifL) { bookingNotifL(); bookingNotifL = null; }
      curChatUid = null; allContacts = {};
      await auth.signOut();
      CP = null; CU = null; walBal = 0;
      updNavG();
      showT('تم تسجيل الخروج بنجاح', 'suc');
      go('home');
    }

    async function doFgt() {
      const e = document.getElementById('liE').value.trim();
      if (!e || !e.includes('@')) { showT('أدخل بريدك الإلكتروني الصحيح أولاً', 'err'); return; }
      const fgtBtn = document.querySelector('[onclick="doFgt()"]');
      if (fgtBtn) { fgtBtn.style.pointerEvents = 'none'; fgtBtn.textContent = 'جاري الإرسال...'; }
      try {
        await auth.sendPasswordResetEmail(e, {
          url: window.location.href, // redirect back after reset
          handleCodeInApp: false
        });
        showT('✅ تم إرسال رابط إعادة التعيين إلى بريدك على Gmail — تحقق من Inbox أو Spam', 'suc');
        if (fgtBtn) { fgtBtn.textContent = '✅ تم الإرسال'; }
      } catch (err) {
        const errMap = {
          'auth/user-not-found': 'لا يوجد حساب بهذا البريد الإلكتروني',
          'auth/invalid-email': 'البريد الإلكتروني غير صحيح',
          'auth/too-many-requests': 'تجاوزت الحد المسموح — انتظر قليلاً'
        };
        showT(errMap[err.code] || 'خطأ: ' + err.message, 'err');
        if (fgtBtn) { fgtBtn.style.pointerEvents = ''; fgtBtn.textContent = 'نسيت كلمة المرور؟'; }
      }
    }

    function openRegAs(role) { pickRole(role); openM('regMod'); }

    /* ── ADMIN ── */
    async function adTab(tab, el) {
      document.querySelectorAll('.adminTab').forEach(t => t.className = 'btn btn-gh btn-sm adminTab');
      el.className = 'btn btn-p btn-sm adminTab';
      const con = document.getElementById('adCon');
      con.innerHTML = '<div style="text-align:center;padding:46px"><div class="spin" style="margin:0 auto"></div></div>';

      if (tab === 'users') {
        const snap = await db.collection('users').orderBy('createdAt', 'desc').get().catch(() => ({ docs: [] }));
        const users = snap.docs.map(d => d.data());
        const rMap = { learner: 'متعلم', tutor: 'معلم', both: 'الاثنان', admin: 'مدير' };
        con.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
            <strong>${users.length} مستخدم مسجّل</strong>
            <input type="text" placeholder="🔍 بحث بالاسم أو البريد..." oninput="filterAdmTbl(this.value,'usersTbl')"
              style="padding:8px 14px;border:1.5px solid var(--border);border-radius:var(--rsm);font-family:'Cairo',sans-serif;font-size:.82rem;min-width:200px"/>
          </div>
          <div class="dsec" style="overflow-x:auto">
            <table class="dtbl" id="usersTbl"><thead><tr>
              <th>الاسم</th><th>البريد</th><th>الهاتف</th><th>الدور</th><th>التقييم</th><th>الجلسات</th><th>الحالة</th><th>إجراء</th>
            </tr></thead><tbody>
            ${users.map(u => `<tr data-uid="${u.uid}" data-name="${(u.name || '—').replace(/"/g,'&quot;')}" data-photo="${(u.photo || '').replace(/"/g,'&quot;')}" data-color="${u.color || ''}" data-fg="${u.fgColor || ''}" data-emoji="${(u.emoji || (u.name?.[0] || '؟')).replace(/"/g,'&quot;')}">
              <td><strong>${u.name || '—'}</strong></td>
              <td style="font-size:.76rem;color:var(--muted)">${u.email || '—'}</td>
              <td style="font-size:.78rem">${u.phone || '—'}</td>
              <td><span class="tag ${u.role === 'tutor' ? 'tag-g' : u.role === 'admin' ? 'tag-r' : ''}">${rMap[u.role] || u.role}</span></td>
              <td>${u.rating ? parseFloat(u.rating).toFixed(1) + '⭐' : '—'}</td>
              <td>${u.totalSessions || 0}</td>
              <td><span class="pill ${u.isApproved ? 'pc' : 'pp'}">${u.isApproved ? 'معتمد' : 'قيد المراجعة'}</span></td>
              <td style="display:flex;gap:4px;flex-wrap:wrap">
                ${!u.isApproved ? `<button class="btn btn-s btn-xs" onclick="apprU('${u.uid}',this)">✓ موافقة</button>` : ''}
                <button class="btn btn-d btn-xs" onclick="delU('${u.uid}',this)">حذف</button>
              </td>
            </tr>`).join('')}
            </tbody></table>
          </div>`;

      } else if (tab === 'bookings') {
        const snap = await db.collection('bookings').orderBy('createdAt', 'desc').get().catch(() => ({ docs: [] }));
        const bks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const stL = { pending: '⏳ انتظار موافقة المعلم', confirmed: '✅ مؤكد', completed: '🏁 مكتمل', cancelled: '❌ ملغى', refunded: '↩️ مسترد' };
        const stCl = { pending: 'pp', confirmed: 'pc', completed: 'pco', cancelled: 'pca', refunded: 'pc' };
        const pending = bks.filter(b => b.status === 'pending').length;
        const confirmed = bks.filter(b => b.status === 'confirmed').length;
        const completed = bks.filter(b => b.status === 'completed').length;
        con.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:18px">
            <div class="sc"><div class="scic">⏳</div><div class="scval" style="font-size:1.5rem">${pending}</div><div class="sclbl">بانتظار الموافقة</div></div>
            <div class="sc"><div class="scic">✅</div><div class="scval" style="font-size:1.5rem">${confirmed}</div><div class="sclbl">مؤكدة</div></div>
            <div class="sc"><div class="scic">🏁</div><div class="scval" style="font-size:1.5rem">${completed}</div><div class="sclbl">مكتملة</div></div>
            <div class="sc"><div class="scic">📅</div><div class="scval" style="font-size:1.5rem">${bks.length}</div><div class="sclbl">إجمالي</div></div>
          </div>
          <div class="dsec" style="overflow-x:auto">
            <table class="dtbl"><thead><tr>
              <th>الطالب</th><th>المعلم</th><th>التاريخ والوقت</th><th>المبلغ</th><th>المدة</th><th>الحالة</th><th>التحكم</th>
            </tr></thead><tbody>
            ${bks.map(b => {
          const dt = b.createdAt?.toDate ? b.createdAt.toDate().toLocaleDateString('ar-SA') : '—';
          return `<tr>
                <td><strong>${b.studentName || '—'}</strong><div style="font-size:.7rem;color:var(--muted)">${b.studentPhone || ''}</div></td>
                <td><strong>${b.tutorName || '—'}</strong></td>
                <td style="white-space:nowrap;font-size:.8rem">${b.date || '—'}<br><span style="color:var(--muted);font-size:.72rem">${b.timeLbl || b.time || ''}</span></td>
                <td style="font-weight:800;color:var(--teal);white-space:nowrap">${(b.total || b.price || 0).toFixed(2)} ج.م</td>
                <td style="font-size:.78rem">${b.actualDuration ? b.actualDuration + ' د' : (b.duration || 60) + ' د'}</td>
                <td><span class="pill ${stCl[b.status] || 'pp'}" style="white-space:nowrap">${stL[b.status] || b.status}</span></td>
                <td>
                  <div style="display:flex;gap:4px;flex-wrap:wrap">
                    ${b.status === 'pending' ? `<span class="pill pp">⏳ بانتظار موافقة المعلم</span>` : ''}
                    ${b.status === 'confirmed' ? `<button class="btn btn-xs" style="background:var(--teal);color:#fff" onclick="adminCompleteBk('${b.id}','${b.tutorId}',${b.price || 0},${b.fee || 0})">🏁 تأكيد الانتهاء</button>` : ''}
                    ${b.status === 'completed' && !b.adminConfirmed ? `<button class="btn btn-s btn-xs" onclick="adminPayTutor('${b.id}','${b.tutorId}',${b.price || 0},${b.fee || 0})">💰 حوّل للمعلم</button><button class="btn btn-o btn-xs" onclick="adminRefundBk('${b.id}','${b.studentId}',${b.total || 0})">↩️ إرجاع للطالب</button>` : ''}
                    ${b.status === 'completed' && b.adminConfirmed ? '<span style="color:var(--green);font-size:.75rem;font-weight:700">✓ مُحوَّل</span>' : ''}
                    ${b.status === 'refunded' ? '<span style="color:var(--blue);font-size:.75rem;font-weight:700">↩️ مُسترد</span>' : ''}
                  </div>
                </td>
              </tr>`;
        }).join('')}
            </tbody></table>
          </div>`;

      } else if (tab === 'payments') {
        const snap = await db.collection('paymentRequests').orderBy('createdAt', 'desc').get().catch(() => ({ docs: [] }));
        const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const pending = reqs.filter(r => r.status === 'pending').length;
        con.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
            <div><strong>${reqs.length} طلب شحن</strong>${pending ? `<span style="background:var(--red2);color:var(--red);border-radius:100px;padding:2px 10px;font-size:.74rem;font-weight:700;margin-right:8px">⚠️ ${pending} معلق</span>` : ''}</div>
          </div>
          <div class="dsec" style="overflow-x:auto">
            <table class="dtbl"><thead><tr>
              <th>المستخدم</th><th>المبلغ</th><th>الطريقة</th><th>رقم العملية</th><th>التاريخ</th><th>الحالة</th><th>إجراء</th>
            </tr></thead><tbody>
            ${reqs.map(r => {
          const dt = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString('ar-SA') : '—';
          return `<tr>
                <td><strong>${r.userName || '—'}</strong><div style="font-size:.7rem;color:var(--muted)">${r.userPhone || r.userId?.slice(0, 8) || ''}</div></td>
                <td style="font-weight:800;color:var(--teal)">${r.amount} ج.م</td>
                <td style="font-size:.8rem">${r.methodName || r.method || '—'}</td>
                <td style="font-family:monospace;font-size:.78rem;max-width:120px;overflow:hidden;text-overflow:ellipsis">${r.refNumber || '—'}</td>
                <td style="font-size:.74rem;color:var(--muted)">${dt}</td>
                <td><span class="pill ${r.status === 'approved' ? 'pc' : r.status === 'rejected' ? 'pca' : 'pp'}">${r.status === 'approved' ? 'معتمد ✓' : r.status === 'rejected' ? 'مرفوض' : '⏳ معلق'}</span></td>
                <td style="display:flex;gap:4px;flex-wrap:wrap">
                  ${r.status === 'pending' ? `<button class="btn btn-s btn-xs" onclick="apprPay('${r.id}','${r.userId}',${r.amount},this)">✅ اعتماد</button><button class="btn btn-d btn-xs" onclick="rejPay('${r.id}','${r.userId}',${r.amount},this)">❌ رفض</button>` : '<span style="color:var(--muted);font-size:.76rem">—</span>'}
                </td>
              </tr>`;
        }).join('')}
            </tbody></table>
          </div>`;

      } else if (tab === 'withdrawals') {
        const snap = await db.collection('withdrawalRequests').orderBy('createdAt', 'desc').get().catch(() => ({ docs: [] }));
        const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const pending = reqs.filter(r => r.status === 'pending').length;
        con.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
            <div><strong>${reqs.length} طلب سحب</strong>${pending ? `<span style="background:var(--red2);color:var(--red);border-radius:100px;padding:2px 10px;font-size:.74rem;font-weight:700;margin-right:8px">⚠️ ${pending} معلق</span>` : ''}</div>
          </div>
          <div class="dsec" style="overflow-x:auto">
            <table class="dtbl"><thead><tr>
              <th>المعلم</th><th>المبلغ</th><th>البنك / الطريقة</th><th>رقم الحساب</th><th>الاسم البنكي</th><th>التاريخ</th><th>الحالة</th><th>إجراء</th>
            </tr></thead><tbody>
            ${reqs.map(r => {
          const dt = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString('ar-SA') : '—';
          return `<tr>
                <td><strong>${r.userName || '—'}</strong></td>
                <td style="font-weight:800;color:var(--teal);white-space:nowrap">${r.amount} ج.م</td>
                <td style="font-size:.8rem">${r.bankName || r.methodName || r.method || '—'}</td>
                <td style="font-family:monospace;font-size:.76rem;direction:ltr">${r.accountNumber || '—'}</td>
                <td style="font-size:.8rem">${r.accountName || r.holderName || '—'}</td>
                <td style="font-size:.74rem;color:var(--muted)">${dt}</td>
                <td><span class="pill ${r.status === 'approved' ? 'pc' : r.status === 'rejected' ? 'pca' : 'pp'}">${r.status === 'approved' ? 'معتمد ✓' : r.status === 'rejected' ? 'مرفوض' : '⏳ معلق'}</span></td>
                <td style="display:flex;gap:4px;flex-wrap:wrap">
                  ${r.status === 'pending' ? `<button class="btn btn-s btn-xs" onclick="apprWd('${r.id}','${r.userId}',${r.amount},this)">✅ اعتماد</button><button class="btn btn-d btn-xs" onclick="rejWd('${r.id}','${r.userId}',${r.amount},this)">❌ رفض</button>` : '<span style="color:var(--muted);font-size:.76rem">—</span>'}
                </td>
              </tr>`;
        }).join('')}
            </tbody></table>
          </div>`;

      } else if (tab === 'reviews') {
        const snap = await db.collection('reviews').orderBy('createdAt', 'desc').get().catch(() => ({ docs: [] }));
        const revs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        con.innerHTML = `<div style="margin-bottom:12px"><strong>${revs.length} تقييم</strong></div>
          <div class="dsec">${revs.map(r => `
            <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
              <div style="flex:1">
                <div style="font-weight:700;font-size:.85rem">${r.studentName || '—'}</div>
                <div style="font-size:.74rem;color:var(--muted);margin-bottom:5px">قيّم المعلم: ${r.tutorName || '—'}</div>
                <div style="font-size:.83rem;color:#374151;line-height:1.5">${r.comment || 'بدون تعليق'}</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                <span class="stars" style="font-size:1rem">${'★'.repeat(r.rating || 5)}${'☆'.repeat(5 - (r.rating || 5))}</span>
                <button class="btn btn-d btn-xs" onclick="delRev('${r.id}',this)">حذف</button>
              </div>
            </div>`).join('')}</div>`;

      } else if (tab === 'stats') {
        const [u, b, r, pay, wd] = await Promise.all([
          db.collection('users').get().catch(() => ({ size: 0, docs: [] })),
          db.collection('bookings').get().catch(() => ({ docs: [] })),
          db.collection('reviews').get().catch(() => ({ size: 0 })),
          db.collection('paymentRequests').where('status', '==', 'pending').get().catch(() => ({ size: 0 })),
          db.collection('withdrawalRequests').where('status', '==', 'pending').get().catch(() => ({ size: 0 }))
        ]);
        const allBks = b.docs || [];
        const revenue = allBks.filter(d => d.data().status === 'completed').reduce((s, d) => s + (d.data().fee || 0), 0);
        const tutors = (u.docs || []).filter(d => ['tutor', 'both'].includes(d.data().role)).length;
        const learners = (u.docs || []).filter(d => d.data().role === 'learner').length;
        con.innerHTML = `
          <div class="srow" style="margin-bottom:20px">
            <div class="sc acc"><div class="scic">👥</div><div class="scval">${u.size || 0}</div><div class="sclbl">المستخدمون</div></div>
            <div class="sc"><div class="scic">🎓</div><div class="scval">${tutors}</div><div class="sclbl">معلمون</div></div>
            <div class="sc"><div class="scic">📚</div><div class="scval">${learners}</div><div class="sclbl">متعلمون</div></div>
            <div class="sc"><div class="scic">📅</div><div class="scval">${allBks.length}</div><div class="sclbl">الحجوزات</div></div>
            <div class="sc"><div class="scic">🏁</div><div class="scval">${allBks.filter(d => d.data().status === 'completed').length}</div><div class="sclbl">جلسات مكتملة</div></div>
            <div class="sc"><div class="scic">⭐</div><div class="scval">${r.size || 0}</div><div class="sclbl">التقييمات</div></div>
            <div class="sc amb"><div class="scic">💰</div><div class="scval">${revenue.toFixed(0)}</div><div class="sclbl">عمولة (ج.م)</div></div>
          </div>
          ${pay.size || wd.size ? `<div style="background:var(--red2);border:1px solid var(--red);border-radius:var(--r);padding:14px 18px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:18px">
            <span style="font-size:1.2rem">⚠️</span>
            <div>
              <div style="font-weight:700;color:var(--red)">يتطلب انتباهاً فورياً</div>
              ${pay.size ? `<div style="font-size:.82rem;color:#b91c1c">${pay.size} طلب شحن معلق — يحتاج مراجعة وموافقة</div>` : ''}
              ${wd.size ? `<div style="font-size:.82rem;color:#b91c1c">${wd.size} طلب سحب معلق — يحتاج اعتماد ومعالجة</div>` : ''}
            </div>
            <div style="display:flex;gap:8px;margin-right:auto">
              ${pay.size ? `<button class="btn btn-sm" style="background:var(--red);color:#fff" onclick="adTab('payments',document.querySelector('.adminTab:nth-child(3)'))">💰 طلبات الشحن</button>` : ''}
              ${wd.size ? `<button class="btn btn-sm" style="background:var(--red);color:#fff" onclick="adTab('withdrawals',document.querySelector('.adminTab:nth-child(4)'))">💸 طلبات السحب</button>` : ''}
            </div>
          </div>`: ''}`;
      }
    }

    async function loadAdminBadges() {
      try {
        const [bk, pay, wd] = await Promise.all([
          db.collection('bookings').where('status', '==', 'pending').get().catch(() => ({ size: 0 })),
          db.collection('paymentRequests').where('status', '==', 'pending').get().catch(() => ({ size: 0 })),
          db.collection('withdrawalRequests').where('status', '==', 'pending').get().catch(() => ({ size: 0 }))
        ]);
        const showBadge = (id, n) => {
          const el = document.getElementById(id);
          if (!el) return;
          if (n > 0) { el.textContent = n > 9 ? '9+' : n; el.classList.remove('hidden'); }
          else el.classList.add('hidden');
        };
        showBadge('admBkBadge', bk.size || 0);
        showBadge('admPayBadge', pay.size || 0);
        showBadge('admWdBadge', wd.size || 0);
      } catch (e) { }
    }

    // Admin: booking approval is handled by the tutor first
    async function adminConfirmBk(bid) {
      showT('المعلم هو من يوافق على الجلسة أولاً', 'err');
    }

    // Admin: cancel booking and refund
    async function adminCancelBk(bid, studentId, refund) {
      if (!confirm(`إلغاء الحجز وإعادة ${refund.toFixed(2)} ج.م للطالب؟`)) return;
      await db.runTransaction(async tx => {
        const wr = db.collection('wallets').doc(studentId);
        const ws = await tx.get(wr);
        const wb = ws.exists ? (ws.data().balance || 0) : 0;
        tx.set(wr, { balance: wb + refund, userId: studentId }, { merge: true });
        tx.update(db.collection('bookings').doc(bid), { status: 'cancelled', cancelledBy: 'admin', cancelledAt: firebase.firestore.FieldValue.serverTimestamp() });
      });
      await db.collection('transactions').add({
        userId: studentId, type: 'credit', amount: refund, currency: 'EGP',
        description: 'استرداد — إلغاء الحجز من الإدارة',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      showT(`✅ تم الإلغاء وإعادة ${refund.toFixed(2)} ج.م`, 'suc');
      adTab('bookings', document.querySelector('.adminTab[onclick*="bookings"]'));
    }

    // Admin: mark session as completed + log duration
    async function adminCompleteBk(bid, tutorId, price, fee) {
      const dur = prompt('مدة الجلسة الفعلية بالدقائق (اضغط إلغاء للإلغاء):', '60');
      if (dur === null) return;
      const durNum = parseInt(dur) || 60;
      await db.collection('bookings').doc(bid).update({
        status: 'completed', actualDuration: durNum, completedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      showT('🏁 تم تسجيل انتهاء الجلسة. اضغط "حوّل للمعلم" لإرسال الأرباح.', 'suc');
      adTab('bookings', document.querySelector('.adminTab[onclick*="bookings"]'));
    }

    // Admin: transfer earnings to tutor wallet after session
    async function adminPayTutor(bid, tutorId, price, fee) {
      const net = price - fee;
      if (!confirm(`تحويل ${net.toFixed(2)} ج.م (صافي) لمحفظة المعلم بعد خصم العمولة (${fee.toFixed(2)} ج.م)؟`)) return;
      try {
        await db.runTransaction(async tx => {
          const wr = db.collection('wallets').doc(tutorId);
          const ws = await tx.get(wr);
          const wb = ws.exists ? (ws.data().balance || 0) : 0;
          tx.set(wr, { balance: wb + net, userId: tutorId }, { merge: true });
          tx.update(db.collection('bookings').doc(bid), { adminConfirmed: true, paidToTutorAt: firebase.firestore.FieldValue.serverTimestamp() });
        });
        await db.collection('transactions').add({
          userId: tutorId, type: 'credit', kind: 'booking', amount: net, currency: 'EGP',
          description: `أرباح جلسة — معتمدة من الإدارة (${price} - ${fee} عمولة = ${net.toFixed(2)} ج.م)`,
          bookingId: bid,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showT(`✅ تم تحويل ${net.toFixed(2)} ج.م لمحفظة المعلم`, 'suc');
        adTab('bookings', document.querySelector('.adminTab[onclick*="bookings"]'));
      } catch (e) { showT('خطأ: ' + e.message, 'err'); }
    }

    async function adminRefundBk(bid, studentId, refund) {
      if (!confirm(`إرجاع ${Number(refund || 0).toFixed(2)} ج.م للطالب؟`)) return;
      try {
        await db.runTransaction(async tx => {
          const wr = db.collection('wallets').doc(studentId);
          const ws = await tx.get(wr);
          const wb = ws.exists ? (ws.data().balance || 0) : 0;
          tx.set(wr, { balance: wb + Number(refund || 0), userId: studentId }, { merge: true });
          tx.update(db.collection('bookings').doc(bid), { status: 'refunded', refundedAt: firebase.firestore.FieldValue.serverTimestamp() });
        });
        await db.collection('transactions').add({
          userId: studentId,
          type: 'credit',
          kind: 'booking',
          amount: Number(refund || 0),
          currency: 'EGP',
          description: 'استرداد — قرار الإدارة بعد انتهاء الجلسة',
          bookingId: bid,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showT(`✅ تم إرجاع ${Number(refund || 0).toFixed(2)} ج.م للطالب`, 'suc');
        adTab('bookings', document.querySelector('.adminTab[onclick*="bookings"]'));
      } catch (e) { showT('خطأ: ' + e.message, 'err'); }
    }

    async function adminRefundBk(bid, studentId, refund) {
      if (!confirm(`إرجاع ${Number(refund || 0).toFixed(2)} ج.م للطالب؟`)) return;
      try {
        await db.runTransaction(async tx => {
          const wr = db.collection('wallets').doc(studentId);
          const ws = await tx.get(wr);
          const wb = ws.exists ? (ws.data().balance || 0) : 0;
          tx.set(wr, { balance: wb + Number(refund || 0), userId: studentId }, { merge: true });
          tx.update(db.collection('bookings').doc(bid), { status: 'refunded', refundedAt: firebase.firestore.FieldValue.serverTimestamp() });
        });
        await db.collection('transactions').add({
          userId: studentId,
          type: 'credit',
          kind: 'booking',
          amount: Number(refund || 0),
          currency: 'EGP',
          description: 'استرداد — قرار الإدارة بعد انتهاء الجلسة',
          bookingId: bid,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showT(`✅ تم إرجاع ${Number(refund || 0).toFixed(2)} ج.م للطالب`, 'suc');
        adTab('bookings', document.querySelector('.adminTab[onclick*="bookings"]'));
      } catch (e) { showT('خطأ: ' + e.message, 'err'); }
    }

    async function adminRefundBk(bid, studentId, refund) {
      if (!confirm(`إرجاع ${Number(refund || 0).toFixed(2)} ج.م للطالب؟`)) return;
      try {
        await db.runTransaction(async tx => {
          const wr = db.collection('wallets').doc(studentId);
          const ws = await tx.get(wr);
          const wb = ws.exists ? (ws.data().balance || 0) : 0;
          tx.set(wr, { balance: wb + Number(refund || 0), userId: studentId }, { merge: true });
          tx.update(db.collection('bookings').doc(bid), { status: 'refunded', refundedAt: firebase.firestore.FieldValue.serverTimestamp() });
        });
        await db.collection('transactions').add({
          userId: studentId,
          type: 'credit',
          kind: 'booking',
          amount: Number(refund || 0),
          currency: 'EGP',
          description: 'استرداد — قرار الإدارة بعد انتهاء الجلسة',
          bookingId: bid,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showT(`✅ تم إرجاع ${Number(refund || 0).toFixed(2)} ج.م للطالب`, 'suc');
        adTab('bookings', document.querySelector('.adminTab[onclick*="bookings"]'));
      } catch (e) { showT('خطأ: ' + e.message, 'err'); }
    }

    // Filter admin table
    function filterAdmTbl(q, tblId) {
      const tbl = document.getElementById(tblId);
      if (!tbl) return;
      tbl.querySelectorAll('tbody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
      });
    }

    async function apprU(uid, btn) {
      await db.collection('users').doc(uid).update({ isApproved: true });
      btn.textContent = '✅ معتمد'; btn.disabled = true;
      showT('تمت الموافقة', 'suc');
    }
    async function delU(uid, btn) {
      if (!confirm('حذف هذا المستخدم نهائياً؟')) return;
      await db.collection('users').doc(uid).delete();
      btn.closest('tr')?.remove();
      showT('تم الحذف', 'suc');
    }
    async function delRev(id, btn) {
      if (!confirm('حذف هذا التقييم؟')) return;
      await db.collection('reviews').doc(id).delete();
      btn.closest('div[style]')?.remove();
      showT('تم الحذف', 'suc');
    }

    // ── APPROVE PAYMENT REQUEST (Admin) ──
    async function apprPay(reqId, userId, amtEGP, btn) {
      if (!confirm(`الموافقة على شحن ${amtEGP} ج.م؟ سيضاف المبلغ مباشرة لمحفظة المستخدم.`)) return;
      btn.disabled = true; btn.textContent = '...';
      try {
        await db.runTransaction(async tx => {
          const r = db.collection('wallets').doc(userId);
          const s = await tx.get(r);
          const b = s.exists ? (s.data().balance || 0) : 0;
          tx.set(r, { balance: b + amtEGP, userId }, { merge: true });
          tx.set(db.collection('paymentRequests').doc(reqId), { status: 'approved', approvedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        });
        await db.collection('transactions').doc(reqId).set({
          userId,
          type: 'credit',
          kind: 'topup',
          amount: amtEGP,
          currency: 'EGP',
          status: 'approved',
          processedAt: firebase.firestore.FieldValue.serverTimestamp(),
          description: `شحن محفظة معتمد من الإدارة — ${amtEGP} ج.م`,
          requestId: reqId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        const row = btn.closest('tr');
        if (row) {
          const actionTd = btn.closest('td');
          if (actionTd) actionTd.innerHTML = '<span style="color:var(--green);font-weight:700">✓ تم</span>';
        }
        showT(`✅ تم شحن ${amtEGP} ج.م للمستخدم`, 'suc');
      } catch (e) { showT('خطأ: ' + e.message, 'err'); btn.disabled = false; btn.textContent = '✅ موافقة'; }
    }

    async function rejPay(reqId, userId, amtEGP, btn) {
      if (!confirm('رفض هذا الطلب؟ سيُبلَّغ المستخدم بالرفض.')) return;
      try {
        await db.collection('paymentRequests').doc(reqId).set({
          status: 'rejected',
          rejectedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        await db.collection('transactions').doc(reqId).set({
          userId,
          type: 'credit',
          kind: 'topup',
          amount: amtEGP,
          currency: 'EGP',
          status: 'rejected',
          processedAt: firebase.firestore.FieldValue.serverTimestamp(),
          description: `طلب شحن مرفوض — ${amtEGP} ج.م`,
          requestId: reqId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        const row = btn.closest('tr');
        if (row) {
          const actionTd = btn.closest('td');
          if (actionTd) actionTd.innerHTML = '<span style="color:var(--red);font-weight:700">✗ مرفوض</span>';
        }
        showT('تم رفض الطلب', 'suc');
      } catch (e) { showT('خطأ: ' + e.message, 'err'); }
    }

    // ── APPROVE WITHDRAWAL REQUEST (Admin) ──
    async function apprWd(reqId, userId, amtEGP, btn) {
      if (!confirm(`تأكيد سحب ${amtEGP} ج.م للمعلم؟`)) return;
      btn.disabled = true; btn.textContent = '...';
      try {
        await db.runTransaction(async tx => {
          tx.set(db.collection('withdrawalRequests').doc(reqId), { status: 'approved', approvedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        });
        await db.collection('transactions').doc(reqId).set({
          userId,
          type: 'debit',
          kind: 'withdrawal',
          amount: amtEGP,
          currency: 'EGP',
          status: 'approved',
          processedAt: firebase.firestore.FieldValue.serverTimestamp(),
          description: `سحب أرباح معتمد من الإدارة — ${amtEGP} ج.م`,
          requestId: reqId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        const row = btn.closest('tr');
        if (row) {
          const actionTd = btn.closest('td');
          if (actionTd) actionTd.innerHTML = '<span style="color:var(--green);font-weight:700">✓ تم</span>';
        }
        showT(`✅ تم اعتماد سحب ${amtEGP} ج.م`, 'suc');
      } catch (e) { showT('خطأ: ' + e.message, 'err'); btn.disabled = false; btn.textContent = '✅ موافقة'; }
    }

    async function rejWd(reqId, userId, amtEGP, btn) {
      if (!confirm('رفض طلب السحب؟ سيتم إعادة المبلغ للمحفظة.')) return;
      try {
        await db.runTransaction(async tx => {
          const r = db.collection('wallets').doc(userId);
          const s = await tx.get(r);
          const b = s.exists ? (s.data().balance || 0) : 0;
          tx.set(r, { balance: b + amtEGP, userId }, { merge: true });
          tx.set(db.collection('withdrawalRequests').doc(reqId), { status: 'rejected', rejectedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        });
        await db.collection('transactions').doc(reqId).set({
          userId,
          type: 'debit',
          kind: 'withdrawal',
          amount: amtEGP,
          currency: 'EGP',
          status: 'rejected',
          processedAt: firebase.firestore.FieldValue.serverTimestamp(),
          description: `طلب سحب مرفوض — تم إرجاع ${amtEGP} ج.م`,
          requestId: reqId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        const row = btn.closest('tr');
        if (row) {
          const actionTd = btn.closest('td');
          if (actionTd) actionTd.innerHTML = '<span style="color:var(--red);font-weight:700">✗ مرفوض</span>';
        }
        showT('تم رفض طلب السحب وإعادة المبلغ', 'suc');
      } catch (e) { showT('خطأ: ' + e.message, 'err'); }
    }

    /* ── PAGE NAVIGATION ── */
    const PAGES = ['home', 'explore', 'profile', 'dashboard', 'chat', 'session', 'wallet', 'editProfile', 'admin'];

    function go(name) {
      // Stop chat listener when leaving chat
      if (name !== 'chat' && chatL) { chatL(); chatL = null; }

      PAGES.forEach(p => {
        const el = document.getElementById(`page-${p}`);
        if (el) el.classList.add('hidden');
      });
      const tgt = document.getElementById(`page-${name}`);
      if (tgt) {
        tgt.classList.remove('hidden');
        if (name !== 'session' && name !== 'chat') window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      // Sync bottom nav active state
      const bnMap = { home: 'bnHome', explore: 'bnExplore', profile: 'bnExplore', chat: 'bnChat', dashboard: 'bnDash', wallet: 'bnDash', editProfile: 'bnDash', admin: null, session: null };
      document.querySelectorAll('.bn-item').forEach(el => el.classList.remove('active'));
      const bnTarget = bnMap[name];
      if (bnTarget) { const el = document.getElementById(bnTarget); if (el) el.classList.add('active'); }

      // Close mobile menu if open
      if (typeof closeMobMenu === 'function') closeMobMenu();

      // Page-specific init
      if (name === 'explore') {
        if (!allT.length) loadT().then(() => renderExplore());
        else renderExplore();
      }
      if (name === 'home') renderFeat();
      if (name === 'dashboard') {
        if (CU) { buildSb(); rdOverview(document.getElementById('dashCon')); }
        else openM('loginMod');
      }
      if (name === 'chat') {
        if (CU) loadChatPage();
        else openM('loginMod');
      }
      if (name === 'wallet') {
        if (CU) loadTxList();
        else openM('loginMod');
      }
      if (name === 'editProfile') {
        if (CU) loadEditProf();
        else openM('loginMod');
      }
      if (name === 'admin') {
        if (CP?.role === 'admin') {
          loadAdminBadges();
          adTab('stats', document.querySelector('.adminTab'));
        }
        else { showT('غير مصرح لك بالدخول', 'err'); go('home'); }
      }
    }

    function fGo(cat) { go('explore'); setTimeout(() => { const el = document.getElementById('exCat'); if (el) { el.value = cat; } renderExplore(); }, 60); }
    function doHeroSrch() { const q = document.getElementById('heroSrch').value; go('explore'); setTimeout(() => { const el = document.getElementById('exSrch'); if (el) { el.value = q; } renderExplore(); }, 60); }

    /* ── MODALS ── */
    function openM(id) {
      document.getElementById(id).classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
    function closeM(id) { document.getElementById(id).classList.add('hidden'); document.body.style.overflow = ''; }
    function closeBg(e, id) { if (e.target === e.currentTarget) closeM(id); }
    function switchM(from, to) { closeM(from); openM(to); }
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') ['regMod', 'loginMod', 'bkMod', 'revMod', 'payDoneMod', 'paymobCfgMod'].forEach(id => closeM(id));
    });

    /* ── TOAST ── */
    function showT(msg, type = '') {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.className = `toast ${type === 'suc' ? 'suc' : type === 'err' ? 'err' : type === 'inf' ? 'inf' : ''} show`;
      if (toastTmr) clearTimeout(toastTmr);
      toastTmr = setTimeout(() => t.classList.remove('show'), 3500);
    }

    /* ── MOBILE NAV ── */
    let mobMenuOpen = false;
    function toggleMobMenu() {
      mobMenuOpen = !mobMenuOpen;
      const menu = document.getElementById('mobMenu');
      const btn = document.getElementById('hamBtn');
      if (mobMenuOpen) {
        menu.classList.add('open');
        btn.classList.add('open');
        document.body.style.overflow = 'hidden';
      } else {
        menu.classList.remove('open');
        btn.classList.remove('open');
        document.body.style.overflow = '';
      }
    }
    function closeMobMenu() {
      mobMenuOpen = false;
      document.getElementById('mobMenu').classList.remove('open');
      document.getElementById('hamBtn').classList.remove('open');
      document.body.style.overflow = '';
    }
    // Close mobile menu on outside click
    document.addEventListener('click', e => {
      if (mobMenuOpen && !e.target.closest('#mobMenu') && !e.target.closest('#hamBtn')) {
        closeMobMenu();
      }
    });

    /* ── BOTTOM NAV HELPERS ── */
    function setBnActive(id) {
      document.querySelectorAll('.bn-item').forEach(el => el.classList.remove('active'));
      const el = document.getElementById(id);
      if (el) el.classList.add('active');
    }
    function bnChatClick() {
      if (CU) { go('chat'); setBnActive('bnChat'); }
      else openM('loginMod');
    }
    function bnDashClick() {
      if (CU) { go('dashboard'); setBnActive('bnDash'); }
      else openM('loginMod');
    }

    /* ── FILTER TOGGLE (mobile explore) ── */
    let filtersOpen = false;
    function toggleFilters() {
      filtersOpen = !filtersOpen;
      const bar = document.getElementById('filterBar');
      const label = document.getElementById('filterToggleLabel');
      if (filtersOpen) {
        bar.classList.remove('collapsed');
        if (label) label.textContent = 'إخفاء الفلاتر';
      } else {
        bar.classList.add('collapsed');
        if (label) label.textContent = 'إظهار الفلاتر';
      }
    }
    // Open filters on desktop automatically
    function checkFilterState() {
      if (window.innerWidth > 768) {
        const bar = document.getElementById('filterBar');
        if (bar) bar.classList.remove('collapsed');
      }
    }
    window.addEventListener('resize', checkFilterState);
    checkFilterState();

    /* ── MOBILE NAV STATE UPDATE ── */
    function updMobNav() {
      const isLoggedIn = !!CU;
      ['mobD', 'mobC', 'mobW', 'mobEP'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = isLoggedIn ? 'flex' : 'none';
      });
      const mobA = document.getElementById('mobA');
      if (mobA) mobA.style.display = (CP?.role === 'admin') ? 'flex' : 'none';
      const guest = document.getElementById('mobAuthGuest');
      const user = document.getElementById('mobAuthUser');
      if (guest) guest.style.display = isLoggedIn ? 'none' : 'flex';
      if (user) user.style.display = isLoggedIn ? 'block' : 'none';
    }

    /* ── SCROLL TO TOP BUTTON ── */
    const scrollTopBtn = document.getElementById('scrollTopBtn');
    window.addEventListener('scroll', () => {
      if (window.scrollY > 320) {
        scrollTopBtn.classList.add('show');
      } else {
        scrollTopBtn.classList.remove('show');
      }
      // Navbar shadow on scroll
      const nav = document.getElementById('mainNav');
      if (nav) nav.classList.toggle('scrolled', window.scrollY > 10);
    });

    /* ── SYNC BOTTOM NAV WITH PAGE ── */
    const _origGo = go;
    // Extend go() to update bottom nav active state
    const _pageNavMap = {
      home: 'bnHome', explore: 'bnExplore', chat: 'bnChat',
      dashboard: 'bnDash', wallet: 'bnDash', editProfile: 'bnDash',
      profile: 'bnExplore', session: null, admin: null
    };
  

/* ============================================================
   Skillak Pro enhancements
   ============================================================ */
var platformCommission = 10;
var supportAdminUid = null;
var regPhotoData = '';
var selectedEditPhoto = '';
var cropperInstance = null;
var cropMode = '';
var cropSource = '';
var cropLivePreviewTimer = null;
var currentAdminReportName = 'Skillak-Report';

async function resolveSupportAdminUid() {
  if (supportAdminUid) return supportAdminUid;
  try {
    const snap = await db.collection('users').where('role', '==', 'admin').limit(1).get();
    if (!snap.empty) {
      supportAdminUid = snap.docs[0].id;
    }
  } catch (e) { }
  return supportAdminUid;
}

try {
  db.collection('settings').doc('platform').onSnapshot(s => {
    const d = s.exists ? s.data() : null;
    const v = Number(d?.commissionRate ?? d?.commission ?? 10);
    platformCommission = Number.isFinite(v) ? v : 10;
    const el = document.getElementById('commissionRateView');
    if (el) el.textContent = `${platformCommission}%`;
    const inp = document.getElementById('commissionRateInput');
    if (inp && document.activeElement !== inp) inp.value = platformCommission;
    const feeLbl = document.getElementById('bkFeeLabel');
    if (feeLbl) feeLbl.textContent = `📊 رسوم الخدمة (${platformCommission}%)`;
  });
} catch (e) {}

function syncCropPreview(mode, dataUrl) {
  const img = dataUrl ? `<img src="${dataUrl}" alt="preview">` : '';
  if (mode === 'reg') {
    regPhotoData = dataUrl || '';
    const box = document.getElementById('r2PhotoPreview');
    if (box) {
      box.classList.toggle('hidden', !dataUrl);
      box.innerHTML = img || '';
    }
  } else if (mode === 'edit') {
    selectedEditPhoto = dataUrl || '';
    const box = document.getElementById('editPhotoPreview');
    if (box) {
      box.classList.toggle('hidden', !dataUrl);
      box.innerHTML = img || '';
    }
    prvEditAv();
  }
}

function setCropPreviewLoading(text = 'جاري إعداد المعاينة...') {
  const box = document.getElementById('cropLivePreview');
  if (!box) return;
  box.innerHTML = `<div class="crop-live-empty"><div class="spin spin-sm"></div><p>${text}</p></div>`;
}

function refreshCropLivePreview() {
  const box = document.getElementById('cropLivePreview');
  if (!box || !cropperInstance) return;
  clearTimeout(cropLivePreviewTimer);
  cropLivePreviewTimer = setTimeout(() => {
    try {
      const canvas = cropperInstance.getCroppedCanvas({
        width: 420,
        height: 420,
        imageSmoothingQuality: 'high'
      });
      if (!canvas) return;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      box.innerHTML = `
        <div class="crop-live-frame">
          <img src="${dataUrl}" alt="crop preview">
        </div>
        <div class="crop-live-caption">المعاينة النهائية قبل الحفظ</div>
      `;
    } catch (e) {
      setCropPreviewLoading('تعذر تحديث المعاينة');
    }
  }, 80);
}

function openCropModal(dataUrl, mode) {
  cropMode = mode;
  cropSource = dataUrl;
  const image = document.getElementById('cropImage');
  const zoom = document.getElementById('cropZoomRange');
  if (!image) return;
  image.src = dataUrl;
  if (zoom) zoom.value = 1;
  openM('cropMod');
  setCropPreviewLoading();
  setTimeout(() => {
    try {
      if (cropperInstance) cropperInstance.destroy();
      cropperInstance = new Cropper(image, {
        aspectRatio: 1,
        viewMode: 2,
        dragMode: 'move',
        autoCropArea: 1,
        responsive: true,
        background: false,
        scalable: true,
        zoomable: true,
        movable: true,
        cropBoxResizable: true,
        center: true,
        modal: true,
        highlight: false,
        guides: true,
        ready() {
          try { cropperInstance.zoomTo(1); } catch (e) {}
          refreshCropLivePreview();
        },
        crop() { refreshCropLivePreview(); },
        zoom() { refreshCropLivePreview(); },
        move() { refreshCropLivePreview(); },
        rotate() { refreshCropLivePreview(); }
      });
    } catch (e) {
      showT('تعذر فتح أداة قص الصورة', 'err');
    }
  }, 80);
}

function handleImageInput(input, mode) {
  const file = input?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => openCropModal(reader.result, mode);
  reader.readAsDataURL(file);
}

function rotateCrop(deg) {
  if (cropperInstance) cropperInstance.rotate(deg);
}
function resetCrop() {
  if (cropperInstance) cropperInstance.reset();
}
function setCropZoom(value) {
  if (!cropperInstance) return;
  const v = Number(value);
  if (!Number.isFinite(v)) return;
  const isStep = Math.abs(v) < 0.5;
  if (isStep) {
    cropperInstance.zoom(v);
    const range = document.getElementById('cropZoomRange');
    if (range) {
      const current = Number(range.value || 1);
      const next = Math.min(3, Math.max(0.8, current + v));
      range.value = next.toFixed(2);
    }
  } else {
    cropperInstance.zoomTo(v);
  }
}

function applyCrop() {
  if (!cropperInstance) return;
  const canvas = cropperInstance.getCroppedCanvas({ width: 900, height: 900, imageSmoothingQuality: 'high' });
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  syncCropPreview(cropMode, dataUrl);
  if (cropMode === 'edit') {
    const editPh = document.getElementById('editPh');
    if (editPh) editPh.value = dataUrl;
  } else if (cropMode === 'reg') {
    const r2 = document.getElementById('r2Img');
    if (r2) r2.dataset.cropped = dataUrl;
  }
  closeM('cropMod');
}

// Guards for signed-in users
const _skillakOpenM = window.openM;
window.openM = function(id) {
  if (id === 'regMod' && CU) {
    showT('لديك حساب بالفعل. استخدم لوحة التحكم أو عدّل ملفك الشخصي.', 'err');
    return;
  }
  return _skillakOpenM(id);
};

const _skillakOpenRegAs = window.openRegAs;
window.openRegAs = function(role) {
  if (CU) {
    showT('لديك حساب بالفعل. لا يمكن فتح التسجيل مرة أخرى.', 'err');
    return;
  }
  return _skillakOpenRegAs(role);
};

const _skillakGo = window.go;
window.go = function(name) {
  document.querySelectorAll('.page').forEach(el => el.classList.add('hidden'));
  return _skillakGo(name);
};

const _skillakPrvEditAv = window.prvEditAv;
window.prvEditAv = function() {
  const url = selectedEditPhoto || document.getElementById('editPh')?.value || '';
  const el = document.getElementById('editAvPr');
  if (!el) return;
  if (url) { el.innerHTML = `<img src="${url}">`; }
  else { el.textContent = CP?.name?.[0] || 'أ'; el.style.background = CP?.color || 'var(--amber)'; }
};

const _skillakLoadEditProf = window.loadEditProf;
window.loadEditProf = async function() {
  await _skillakLoadEditProf();
  selectedEditPhoto = document.getElementById('editPh')?.value || '';
  syncCropPreview('edit', selectedEditPhoto || '');
};

// Google login with profile completion
window.doGoogleLogin = async function() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const btns = Array.from(document.querySelectorAll('[onclick="doGoogleLogin()"]'));
  btns.forEach(b => { b.disabled = true; });
  try {
    const result = await auth.signInWithPopup(provider);
    const user = result.user;
    const ref = db.collection('users').doc(user.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      const name = user.displayName || (user.email ? user.email.split('@')[0] : 'مستخدم');
      const profile = {
        uid: user.uid,
        email: user.email || '',
        name,
        phone: '',
        role: 'learner',
        bio: '',
        photo: user.photoURL || '',
        skills: [],
        price: 0,
        lang: 'عربي',
        country: '',
        category: '',
        rating: 0,
        totalReviews: 0,
        totalSessions: 0,
        isApproved: true,
        provider: 'google',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await ref.set(profile, { merge: true });
      await db.collection('wallets').doc(user.uid).set({ balance: 0, userId: user.uid }, { merge: true });
      CP = profile;
      await loadWal();
      updNavU();
      showT('تم تسجيل الدخول بحساب Google. أكمل بياناتك من صفحة تعديل الملف الشخصي.', 'suc');
      closeM('loginMod');
      go('editProfile');
      return;
    }
    closeM('loginMod');
    showT('مرحباً بك مجدداً 👋', 'suc');
    go('dashboard');
  } catch (err) {
    showT('تعذر تسجيل الدخول عبر Google: ' + (err?.message || err), 'err');
  } finally {
    btns.forEach(b => { b.disabled = false; });
  }
};

// Support chat pin + admin thread
async function ensureSupportThreadPin() {
  await resolveSupportAdminUid();
  const list = document.getElementById('contactsList');
  if (!list || !supportAdminUid) return;
  const existing = document.getElementById(`ci-${supportAdminUid}`);
  if (existing) {
    existing.classList.add('support-pin');
    const nm = existing.querySelector('.ciname');
    const pr = existing.querySelector('.ciprev');
    if (nm) nm.textContent = 'خدمة العملاء';
    if (pr) pr.textContent = 'محادثة مفتوحة مع الدعم';
    return;
  }
  const item = document.createElement('div');
  item.id = `ci-${supportAdminUid}`;
  item.className = 'citem support-pin';
  item.style.cursor = 'pointer';
  const photo = CP?.supportPhoto || '';
  const name = 'خدمة العملاء';
  const emoji = '🛟';
  item.innerHTML = `
    <div class="ciav" style="background:linear-gradient(135deg,rgba(13,110,117,.22),rgba(245,158,11,.22))">${photo ? `<img src="${photo}" style="width:46px;height:46px;border-radius:50%;object-fit:cover">` : `<span style="font-weight:900;font-family:'Fraunces',serif">${emoji}</span>`}</div>
    <div class="ciinfo"><div class="ciname">${name}</div><div class="ciprev">تحدث مع فريق الدعم</div></div>
    <div class="citime">—</div>
  `;
  item.onclick = () => openConv(supportAdminUid);
  list.prepend(item);
}

const _skillakLoadContacts = window.loadContacts;
window.loadContacts = async function() {
  await _skillakLoadContacts();
  await ensureSupportThreadPin();
};

const _skillakRenderContacts = window.renderContacts;
window.renderContacts = function(list) {
  _skillakRenderContacts(list);
  ensureSupportThreadPin().catch(() => {});
};

const _skillakRefreshChatState = window.refreshChatState;
window.refreshChatState = async function(otherUid) {
  await resolveSupportAdminUid();
  if (CP?.role === 'admin' && otherUid && otherUid !== CU?.uid) {
    const rel = allContacts[otherUid] || { uid: otherUid };
    rel.latestBooking = null;
    rel.chatAllowed = true;
    rel.chatStatus = 'دردشة مفتوحة مع العملاء';
    rel.isSupportConversation = true;
    allContacts[otherUid] = rel;
    return rel;
  }
  if (otherUid && supportAdminUid && otherUid === supportAdminUid) {
    const rel = allContacts[otherUid] || { uid: otherUid };
    rel.latestBooking = null;
    rel.chatAllowed = true;
    rel.chatStatus = 'خدمة العملاء متاحة الآن';
    rel.name = 'خدمة العملاء';
    rel.emoji = '🛟';
    allContacts[otherUid] = rel;
    return rel;
  }
  return _skillakRefreshChatState(otherUid);
};

// Admin users rows => add direct chat button
function enhanceAdminUserRows() {
  document.querySelectorAll('#usersTbl tbody tr').forEach(row => {
    const uid = row.getAttribute('data-uid');
    if (!uid) return;
    const actionTd = row.querySelector('td:last-child');
    if (!actionTd || actionTd.querySelector('.adm-chat-btn')) return;
    const name = row.getAttribute('data-name') || '—';
    const photo = row.getAttribute('data-photo') || '';
    const color = row.getAttribute('data-color') || '';
    const fg = row.getAttribute('data-fg') || '';
    const emoji = row.getAttribute('data-emoji') || '؟';
    const btn = document.createElement('button');
    btn.className = 'btn btn-o btn-xs adm-chat-btn';
    btn.textContent = '💬 شات';
    btn.onclick = () => openChatWith(uid, name, photo, color, fg, emoji);
    actionTd.prepend(btn);
  });
}

const _skillakAdTab = window.adTab;
window.adTab = async function(tab, el) {
  const out = await _skillakAdTab(tab, el);
  if (tab === 'users') setTimeout(enhanceAdminUserRows, 30);
  if (tab === 'commission') {
    const con = document.getElementById('adCon');
    const current = Number.isFinite(platformCommission) ? platformCommission : 10;
    con.innerHTML = `
      <div class="ad-panel">
        <div class="ad-panel-hd">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
            <div>
              <span class="sl" style="margin-bottom:6px">العمولة</span>
              <h3 style="margin:0;font-family:'Fraunces',serif">التحكم في نسبة المنصة</h3>
            </div>
            <span class="pill pc">الحالية: <strong id="commissionRateView">${current}%</strong></span>
          </div>
        </div>
        <div class="cb">
          <div class="ad-grid" style="margin-bottom:14px">
            <div class="ad-card"><strong>نسبة الخصم</strong><div class="num">${current}%</div><div style="font-size:.8rem;color:var(--muted)">تُطبق على الحجوزات الجديدة فقط</div></div>
            <div class="ad-card"><strong>أرباح المنصة</strong><div class="num">تلقائي</div><div style="font-size:.8rem;color:var(--muted)">تتحدث حسب النسبة المحفوظة</div></div>
          </div>
          <div class="fr" style="align-items:end">
            <div class="fg" style="margin-bottom:0">
              <label>نسبة العمولة %</label>
              <input type="number" id="commissionRateInput" min="0" max="100" step="0.5" value="${current}" />
            </div>
            <button class="btn btn-p" onclick="saveCommissionRate()">💾 حفظ العمولة</button>
          </div>
          <div id="commissionMsg" class="fh" style="margin-top:10px">يمكنك رفع أو خفض النسبة في أي وقت.</div>
        </div>
      </div>`;
  }
  if (tab === 'reports') {
    const con = document.getElementById('adCon');
    const usersSnap = await db.collection('users').orderBy('createdAt', 'desc').get().catch(() => ({ docs: [] }));
    const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const firstId = users[0]?.id || '';
    con.innerHTML = `
      <div class="ad-panel">
        <div class="ad-panel-hd">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
            <div>
              <span class="sl" style="margin-bottom:6px">التقارير</span>
              <h3 style="margin:0;font-family:'Fraunces',serif">تقرير كامل للمستخدمين والمعاملات</h3>
            </div>
            <button class="btn btn-o btn-sm" onclick="downloadAdminReportPdf()">⬇️ تحميل PDF</button>
          </div>
        </div>
        <div class="cb">
          <div class="fg">
            <label>اختر المستخدم</label>
            <select id="reportUserSel" onchange="buildAdminReport(this.value)">
              ${users.map(u => `<option value="${u.id}" ${u.id === firstId ? 'selected' : ''}>${u.name || u.email || u.id}</option>`).join('')}
            </select>
          </div>
          <div id="adminReportCard" class="ad-report"></div>
        </div>
      </div>`;
    if (firstId) buildAdminReport(firstId);
  }
  return out;
};

window.saveCommissionRate = async function() {
  const inp = document.getElementById('commissionRateInput');
  const msg = document.getElementById('commissionMsg');
  const v = Number(inp?.value);
  if (!Number.isFinite(v) || v < 0 || v > 100) {
    if (msg) msg.textContent = 'أدخل نسبة صحيحة بين 0 و 100.';
    showT('أدخل نسبة صحيحة بين 0 و100', 'err');
    return;
  }
  try {
    await db.collection('settings').doc('platform').set({ commissionRate: v, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    platformCommission = v;
    if (msg) msg.textContent = `تم حفظ العمولة بنجاح: ${v}%`;
    showT(`تم تحديث العمولة إلى ${v}%`, 'suc');
    const rateEl = document.getElementById('commissionRateView');
    if (rateEl) rateEl.textContent = `${v}%`;
  } catch (e) {
    showT('تعذر حفظ العمولة: ' + e.message, 'err');
  }
};

async function buildAdminReport(uid) {
  const card = document.getElementById('adminReportCard');
  if (!card || !uid) return;
  card.innerHTML = '<div style="text-align:center;padding:24px"><div class="spin" style="margin:0 auto 10px"></div><div style="color:var(--muted)">جاري تجهيز التقرير...</div></div>';
  try {
    const [userSnap, b1, b2, txSnap, wdSnap, paySnap] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('bookings').where('studentId', '==', uid).get().catch(() => ({ docs: [] })),
      db.collection('bookings').where('tutorId', '==', uid).get().catch(() => ({ docs: [] })),
      db.collection('transactions').where('userId', '==', uid).get().catch(() => ({ docs: [] })),
      db.collection('withdrawalRequests').where('userId', '==', uid).get().catch(() => ({ docs: [] })),
      db.collection('paymentRequests').where('userId', '==', uid).get().catch(() => ({ docs: [] }))
    ]);
    const u = userSnap.exists ? userSnap.data() : {};
    currentAdminReportName = u.name || u.email || uid || 'Skillak-Report';
    const bookings = [...(b1.docs || []), ...(b2.docs || [])].map(d => ({ id: d.id, ...d.data() }));
    const txs = (txSnap.docs || []).map(d => ({ id: d.id, ...d.data() }));
    const withdrawals = (wdSnap.docs || []).map(d => ({ id: d.id, ...d.data() }));
    const payments = (paySnap.docs || []).map(d => ({ id: d.id, ...d.data() }));
    const completed = bookings.filter(b => b.status === 'completed').length;
    const pending = bookings.filter(b => b.status === 'pending').length;
    const cancelled = bookings.filter(b => ['cancelled', 'rejected'].includes(b.status)).length;
    const refunded = bookings.filter(b => b.status === 'refunded').length;
    const spent = txs.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount || 0), 0);
    const earned = txs.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount || 0), 0);
    const wBalSnap = await db.collection('wallets').doc(uid).get().catch(() => null);
    const balance = Number(wBalSnap?.data()?.balance || 0);
    const role = { learner: 'متعلم', tutor: 'معلم', both: 'متعلم ومعلم', admin: 'مدير' }[u.role] || (u.role || '—');
    const lastTx = txs[0]?.createdAt?.toDate ? txs[0].createdAt.toDate().toLocaleDateString('ar-EG') : '—';
    card.innerHTML = `
      <div class="report-hero">
        <div>
          <span class="sl" style="margin-bottom:6px">التقرير الشامل</span>
          <h3 class="report-title">${u.name || '—'}</h3>
          <div class="report-sub">ملف عربي منظم يوضح كل البيانات والمعاملات والجلسات والسحوبات والشحنات.</div>
        </div>
        <div class="report-badge">${role}</div>
      </div>
      <div class="report-meta" style="margin:16px 0 14px">
        <div class="rm"><span>الاسم</span><strong>${u.name || '—'}</strong></div>
        <div class="rm"><span>البريد</span><strong>${u.email || '—'}</strong></div>
        <div class="rm"><span>الدور</span><strong>${role}</strong></div>
        <div class="rm"><span>الرصيد الحالي</span><strong>${balance.toFixed(2)} ج.م</strong></div>
        <div class="rm"><span>آخر معاملة</span><strong>${lastTx}</strong></div>
        <div class="rm"><span>العمولة الحالية</span><strong>${platformCommission}%</strong></div>
      </div>
      <div class="ad-grid" style="margin-bottom:14px">
        <div class="ad-card"><strong>الجلسات</strong><div class="num">${bookings.length}</div><div style="font-size:.8rem;color:var(--muted)">مكتملة: ${completed}</div></div>
        <div class="ad-card"><strong>المعلقة</strong><div class="num">${pending}</div><div style="font-size:.8rem;color:var(--muted)">مرفوضة/ملغاة: ${cancelled}</div></div>
        <div class="ad-card"><strong>المستردة</strong><div class="num">${refunded}</div><div style="font-size:.8rem;color:var(--muted)">كل العمليات المرتبطة</div></div>
        <div class="ad-card"><strong>المعاملات</strong><div class="num">${txs.length}</div><div style="font-size:.8rem;color:var(--muted)">إجمالي الشحن/السحب/الحجز</div></div>
      </div>
      <div class="report-meta" style="margin-bottom:14px">
        <div class="rm"><span>إجمالي الشحن</span><strong>${payments.reduce((s, x) => s + Number(x.amount || 0), 0).toFixed(2)} ج.م</strong></div>
        <div class="rm"><span>إجمالي السحب</span><strong>${withdrawals.reduce((s, x) => s + Number(x.amount || 0), 0).toFixed(2)} ج.م</strong></div>
        <div class="rm"><span>إجمالي الإنفاق</span><strong>${spent.toFixed(2)} ج.م</strong></div>
        <div class="rm"><span>إجمالي الأرباح</span><strong>${earned.toFixed(2)} ج.م</strong></div>
      </div>
      <div class="card" style="border-radius:18px;overflow:hidden;margin-bottom:14px">
        <div class="ch"><div class="ct">سجل الجلسات</div><div class="pill pc">${bookings.length} سجل</div></div>
        <div class="cb" style="padding:0;overflow:auto;max-height:300px">
          <table class="dtbl" style="min-width:760px"><thead><tr><th>النوع</th><th>التاريخ</th><th>الحالة</th><th>المبلغ</th><th>المعلم/الطالب</th></tr></thead><tbody>
            ${bookings.map(b => `<tr><td>${b.studentId === uid ? 'حجز كطالب' : 'جلسة كمعلم'}</td><td>${b.date || '—'} ${b.timeLbl || b.time || ''}</td><td><span class="pill ${b.status === 'completed' ? 'pc' : b.status === 'refunded' ? 'pco' : b.status === 'cancelled' ? 'pca' : 'pp'}">${b.status || '—'}</span></td><td>${Number(b.total || b.price || 0).toFixed(2)} ج.م</td><td>${b.studentId === uid ? (b.tutorName || '—') : (b.studentName || '—')}</td></tr>`).join('')}
          </tbody></table>
        </div>
      </div>
      <div class="card" style="border-radius:18px;overflow:hidden">
        <div class="ch"><div class="ct">سجل المعاملات</div><div class="pill pp">${txs.length} حركة</div></div>
        <div class="cb" style="padding:0;overflow:auto;max-height:280px">
          <table class="dtbl" style="min-width:760px"><thead><tr><th>النوع</th><th>الوصف</th><th>المبلغ</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>
            ${txs.map(t => `<tr><td>${t.kind || t.type || '—'}</td><td>${t.description || '—'}</td><td>${Number(t.amount || 0).toFixed(2)} ج.م</td><td>${t.status || '—'}</td><td>${t.createdAt?.toDate ? t.createdAt.toDate().toLocaleString('ar-EG') : '—'}</td></tr>`).join('')}
          </tbody></table>
        </div>
      </div>`;
  } catch (e) {
    card.innerHTML = `<div style="padding:20px;color:var(--red)">تعذر تحميل التقرير: ${e.message}</div>`;
  }
}

window.downloadAdminReportPdf = async function() {
  const card = document.getElementById('adminReportCard');
  if (!card) return;
  try {
    const canvas = await html2canvas(card, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 10;
    const imgHeight = canvas.height * imgWidth / canvas.width;
    let heightLeft = imgHeight;
    let position = 5;
    pdf.addImage(imgData, 'PNG', 5, position, imgWidth, imgHeight);
    heightLeft -= (pageHeight - 10);
    while (heightLeft > 0) {
      pdf.addPage();
      position = heightLeft - imgHeight + 5;
      pdf.addImage(imgData, 'PNG', 5, position, imgWidth, imgHeight);
      heightLeft -= (pageHeight - 10);
    }
    const safeName = String(currentAdminReportName || 'Skillak-Report')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Skillak-Report';
    pdf.save(`Skillak-تقرير-${safeName}.pdf`);
  } catch (e) {
    showT('تعذر إنشاء ملف PDF: ' + e.message, 'err');
  }
};

// Improve load/save of profile photos through cropper
const _skillakDoReg = window.doReg;
window.doReg = async function() {
  regPhotoData = regPhotoData || document.getElementById('r2Img')?.dataset?.cropped || '';
  return _skillakDoReg();
};

const _skillakSavePrf = window.savePrf;
window.savePrf = async function() {
  selectedEditPhoto = selectedEditPhoto || document.getElementById('editPh')?.value || '';
  return _skillakSavePrf();
};

// Image picker listeners
window.addEventListener('DOMContentLoaded', () => {
  const r2 = document.getElementById('r2Img');
  if (r2) r2.addEventListener('change', () => handleImageInput(r2, 'reg'));
  const ed = document.getElementById('editImg');
  if (ed) ed.addEventListener('change', () => handleImageInput(ed, 'edit'));
  const saveEdit = document.getElementById('editPh');
  if (saveEdit) saveEdit.addEventListener('input', () => { selectedEditPhoto = saveEdit.value.trim(); prvEditAv(); });
  const feeLbl = document.getElementById('bkFeeLabel');
  if (feeLbl) feeLbl.textContent = `📊 رسوم الخدمة (${platformCommission}%)`;
});

