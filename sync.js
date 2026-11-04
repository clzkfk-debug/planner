/* =========================================================
   Firebase 동기화
   - 데이터는 지금처럼 이 기기(localStorage)에 먼저 저장하고,
     로그인하면 Firebase(Firestore)에 자동으로 올리고 받아와요.
   - Firestore 구조: users/{uid}/data/{문서}
       core       : 습관 · 그룹 · 태그 · 할일
       rec-YYYY-MM: 그 달의 체크 기록
   ========================================================= */
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const firebaseConfig = {
  apiKey: 'AIzaSyDSLSnzo6Qdd3o__K-NuLxsC-zfeaCklUs',
  authDomain: 'planner-6d0f6.firebaseapp.com',
  projectId: 'planner-6d0f6',
  storageBucket: 'planner-6d0f6.firebasestorage.app',
  messagingSenderId: '1094693950265',
  appId: '1:1094693950265:web:58a66eafd586bdb2f38ee8',
};

const HKEY = 'planner.syncHash';
const sync = { ready: false, user: null, state: 'off', last: null, error: '', unsub: null, timer: null, busy: false };
let fb = null;
let hashes = (() => { try { return JSON.parse(localStorage.getItem(HKEY)) || {}; } catch { return {}; } })();
const saveHashes = () => { try { localStorage.setItem(HKEY, JSON.stringify(hashes)); } catch { /* 무시 */ } };

const hashOf = str => { let x = 5381; for (let i = 0; i < str.length; i++) x = ((x << 5) + x + str.charCodeAt(i)) | 0; return (x >>> 0).toString(36) + '.' + str.length; };

// 지금 상태를 Firestore 문서들로 나누기
function buildDocs() {
  const docs = { core: { habits: state.habits, groups: state.groups, tags: state.tags, tasks: state.tasks } };
  for (const [k, v] of Object.entries(state.records)) {
    const id = 'rec-' + k.slice(0, 7);
    (docs[id] ??= { days: {} }).days[k] = v;
  }
  return docs;
}
const docJSON = (docs, id) => JSON.stringify(docs[id] || (id === 'core' ? { habits: [], groups: [], tags: [], tasks: [] } : { days: {} }));

// 받은 문서를 상태에 넣기
function applyDoc(id, data) {
  if (id === 'core') {
    state.habits = data.habits || []; state.groups = data.groups || []; state.tags = data.tags || []; state.tasks = data.tasks || [];
    ['habits', 'groups', 'tags', 'tasks'].forEach(k => store.save(k, state[k]));
  } else if (id.startsWith('rec-')) {
    const m = id.slice(4);
    Object.keys(state.records).forEach(k => { if (k.startsWith(m)) delete state.records[k]; });
    Object.assign(state.records, data.days || {});
    store.save('records', state.records);
  }
}

const KO_ERR = {
  'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않아요.',
  'auth/wrong-password': '이메일 또는 비밀번호가 맞지 않아요.',
  'auth/user-not-found': '가입되지 않은 이메일이에요. "처음이에요"로 가입해 주세요.',
  'auth/email-already-in-use': '이미 가입된 이메일이에요. 로그인해 주세요.',
  'auth/weak-password': '비밀번호는 6자 이상으로 해 주세요.',
  'auth/invalid-email': '이메일 주소를 다시 확인해 주세요.',
  'auth/missing-password': '비밀번호를 입력해 주세요.',
  'auth/too-many-requests': '시도가 너무 많아요. 잠시 뒤에 다시 해 주세요.',
  'auth/network-request-failed': '인터넷 연결을 확인해 주세요.',
  'permission-denied': 'Firebase 보안 규칙을 먼저 설정해야 해요.',
  'unavailable': '인터넷이 연결되면 자동으로 동기화해요.',
};
const errText = e => KO_ERR[e?.code] || `문제가 생겼어요 (${e?.code || e?.message || e})`;

/* ---------- 올리기 ---------- */
async function push() {
  if (!sync.user || !fb || sync.busy) return;
  const { doc, setDoc, serverTimestamp } = fb.fs;
  const uid = sync.user.uid;
  const docs = buildDocs();
  const ids = new Set([...Object.keys(docs), ...Object.keys(hashes.docs || {})]);
  const jobs = [];
  for (const id of ids) {
    const s = docJSON(docs, id), hv = hashOf(s);
    if (hashes.docs[id] === hv) continue;
    jobs.push(setDoc(doc(fb.db, 'users', uid, 'data', id), { json: s, updatedAt: serverTimestamp() }).then(() => { hashes.docs[id] = hv; }));
  }
  if (!jobs.length) return;
  sync.state = 'syncing'; renderSyncCard();
  try {
    await Promise.all(jobs);
    saveHashes();
    sync.state = 'on'; sync.last = new Date(); sync.error = '';
  } catch (e) {
    sync.state = 'error'; sync.error = errText(e);
  }
  renderSyncCard();
}
function schedulePush() { clearTimeout(sync.timer); sync.timer = setTimeout(push, 800); }

/* ---------- 받기 (다른 기기에서 바뀐 것) ---------- */
function listen() {
  const { collection, onSnapshot } = fb.fs;
  sync.unsub?.();
  sync.unsub = onSnapshot(collection(fb.db, 'users', sync.user.uid, 'data'), snap => {
    let changed = false;
    const docs = buildDocs();
    snap.docChanges().forEach(ch => {
      if (ch.type === 'removed' || ch.doc.metadata.hasPendingWrites) return;
      const id = ch.doc.id, s = ch.doc.data().json;
      if (typeof s !== 'string') return;
      const hv = hashOf(s);
      if (hashes.docs[id] === hv) return;
      const localHv = hashOf(docJSON(docs, id));
      // 이 기기에서 아직 못 올린 변경이 있으면 이 기기 것을 우선 (곧 올라감)
      if (hashes.docs[id] && localHv !== hashes.docs[id]) return;
      try { applyDoc(id, JSON.parse(s)); hashes.docs[id] = hv; changed = true; } catch { /* 깨진 문서 무시 */ }
    });
    if (changed) { saveHashes(); renderAll(); }
    sync.state = 'on'; sync.last = new Date(); sync.error = '';
    renderSyncCard();
    schedulePush();
  }, e => { sync.state = 'error'; sync.error = errText(e); renderSyncCard(); });
}

/* ---------- 처음 로그인: 이 기기 데이터와 클라우드 데이터 합치기 ---------- */
function mergeById(remote = [], local = []) {
  const ids = new Set(remote.map(x => x.id));
  return [...remote, ...local.filter(x => !ids.has(x.id))];
}
async function firstSync() {
  const { collection, getDocs } = fb.fs;
  const snap = await getDocs(collection(fb.db, 'users', sync.user.uid, 'data'));
  hashes = { uid: sync.user.uid, docs: {} };
  if (!snap.empty) {
    const remote = {};
    snap.forEach(d => { try { remote[d.id] = JSON.parse(d.data().json); } catch { /* 무시 */ } });
    const c = remote.core || {};
    const localRecords = state.records;
    state.habits = mergeById(c.habits, state.habits);
    state.groups = mergeById(c.groups, state.groups);
    state.tags = mergeById(c.tags, state.tags);
    state.tasks = mergeById(c.tasks, state.tasks);
    const rec = {};
    Object.entries(remote).forEach(([id, d]) => { if (id.startsWith('rec-')) Object.assign(rec, d.days || {}); });
    Object.entries(localRecords).forEach(([k, day]) => { rec[k] = Object.assign({}, day, rec[k] || {}); });
    state.records = rec;
    ['habits', 'groups', 'tags', 'tasks', 'records'].forEach(k => store.save(k, state[k]));
    renderAll();
  }
  saveHashes();
  await push();
}

/* ---------- 로그인 상태 ---------- */
async function onUser(user) {
  sync.user = user;
  sync.unsub?.(); sync.unsub = null;
  if (!user) { sync.state = 'off'; renderSyncCard(); return; }
  sync.state = 'syncing'; renderSyncCard();
  try {
    if (hashes.uid !== user.uid) await firstSync();
    listen();
  } catch (e) {
    sync.state = 'error'; sync.error = errText(e); renderSyncCard();
  }
}

/* ---------- 화면 ---------- */
function renderSyncCard() {
  const el = document.getElementById('syncCard'); if (!el) return;
  if (!sync.ready) { el.innerHTML = `<div class="li">☁️ 동기화<span class="rt">${sync.error || '불러오는 중…'}</span></div>`; return; }
  if (!sync.user) {
    el.innerHTML = `<button class="li" id="syncOpen">☁️ 동기화 <span class="rt">로그인하면 여러 기기에서 같이 써요 ›</span></button>`;
    return;
  }
  const t = sync.last ? `${pad(sync.last.getHours())}:${pad(sync.last.getMinutes())}` : '';
  const st = sync.state === 'syncing' ? '동기화 중…' : sync.state === 'error' ? `⚠️ ${sync.error}` : `✓ 동기화됨${t ? ' · ' + t : ''}`;
  el.innerHTML = `<div class="li col"><span>☁️ 동기화 <small class="muted" style="font-weight:400">${esc(sync.user.email || '')}</small></span>
    <span class="small ${sync.state === 'error' ? 'sync-err' : 'muted'}" style="font-weight:400">${st}</span></div>
    <button class="li" id="syncNow">🔄 지금 동기화</button>
    <button class="li danger" id="syncLogout">로그아웃 <span class="rt">이 기기 데이터는 남아요</span></button>`;
}
window.renderSyncCard = renderSyncCard;
// 테스트·점검용 (앱 동작에는 영향 없음)
window.__plannerSync = { get fb() { return fb; }, sync, push };

function loginMsg(t) { document.getElementById('loginError').textContent = t || ''; }
function bindUI() {
  document.getElementById('meView').addEventListener('click', async e => {
    if (e.target.closest('#syncOpen')) { loginMsg(''); openDlg('loginDialog'); }
    if (e.target.closest('#syncNow')) { hashes.docs = {}; saveHashes(); await push(); toast(sync.state === 'error' ? sync.error : '동기화했어요'); }
    if (e.target.closest('#syncLogout')) {
      if (!confirm('로그아웃할까요? 이 기기에 있는 데이터는 그대로 남아요.')) return;
      await fb.auth.signOut(fb.authObj); toast('로그아웃했어요');
    }
  });
  const em = () => document.getElementById('loginEmail').value.trim();
  const pw = () => document.getElementById('loginPw').value;
  const run = async (fn, ok) => {
    loginMsg('');
    document.querySelectorAll('#loginDialog .btn').forEach(b => b.disabled = true);
    try { await fn(); closeDlg('loginDialog'); toast(ok); }
    catch (e) { loginMsg(errText(e)); }
    document.querySelectorAll('#loginDialog .btn').forEach(b => b.disabled = false);
  };
  document.getElementById('loginBtn').addEventListener('click', () => run(() => fb.auth.signInWithEmailAndPassword(fb.authObj, em(), pw()), '로그인했어요 · 동기화를 시작해요'));
  document.getElementById('signupBtn').addEventListener('click', () => run(() => fb.auth.createUserWithEmailAndPassword(fb.authObj, em(), pw()), '가입했어요 · 이 기기 데이터를 올리고 있어요'));
  document.getElementById('resetBtnPw').addEventListener('click', async () => {
    if (!em()) { loginMsg('이메일을 먼저 입력해 주세요.'); return; }
    try { await fb.auth.sendPasswordResetEmail(fb.authObj, em()); loginMsg('비밀번호를 다시 정하는 메일을 보냈어요.'); }
    catch (e) { loginMsg(errText(e)); }
  });
}

/* ---------- 시작 ---------- */
(async () => {
  bindUI();
  renderSyncCard();
  try {
    const [appM, authM, fsM] = await Promise.all([
      import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js'),
    ]);
    const app = appM.initializeApp(firebaseConfig);
    fb = { auth: authM, authObj: authM.getAuth(app), fs: fsM, db: fsM.getFirestore(app) };
    if (!hashes.docs) hashes.docs = {};
    sync.ready = true;
    renderSyncCard();
    window.onPersist = () => { if (sync.user) schedulePush(); };
    window.addEventListener('online', schedulePush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedulePush(); });
    authM.onAuthStateChanged(fb.authObj, onUser);
  } catch (e) {
    sync.error = '인터넷이 연결되면 동기화할 수 있어요';
    renderSyncCard();
  }
})();
