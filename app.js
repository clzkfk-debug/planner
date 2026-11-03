'use strict';
/* =========================================================
   공통: 유틸 · 저장소 · 상태 · 문어 · 할일 · 내정보
   ========================================================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const TASK_COLORS = ['sage', 'sky', 'sand', 'rose', 'lavender'];
const HL_COLORS = ['yellow', 'rose', 'sky', 'sage', 'lav', 'sand'];
const TAG_COLORS = ['green', 'blue', 'yellow', 'orange', 'red', 'pink', 'purple', 'gray'];

const pad = n => String(n).padStart(2, '0');
const toKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addDaysKey = (k, n) => toKey(addDays(parseKey(k), n));
const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000); // b - a
const todayKey = () => toKey(new Date());
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtShort = k => { const d = parseKey(k); return `${d.getMonth() + 1}.${pad(d.getDate())}(${DOW[d.getDay()]})`; };
const startOfWeek = d => addDays(d, -((d.getDay() + 6) % 7)); // 월요일 시작
const lastDayOfMonth = d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CHECK_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/* ---------- 저장소 ---------- */
const store = {
  load(k, def) { try { const v = JSON.parse(localStorage.getItem('planner.' + k)); return v ?? def; } catch { return def; } },
  save(k, v) { try { localStorage.setItem('planner.' + k, JSON.stringify(v)); } catch { toast('저장 공간이 부족해요'); } },
};

const state = {
  tasks: store.load('tasks', []),
  habits: store.load('habits', null),
  groups: store.load('groups', []),
  tags: store.load('tags', []),
  records: store.load('records', {}), // { 'YYYY-MM-DD': { habitId: { s:'done'|'fail', t:'HH:MM'|null, stamps:[{t,k}] } } }
  ui: Object.assign({
    view: 'home', pane: 'habits', range: 'day', sort: 'group', tagFilter: null, collapsed: {},
    filter: 'all', showDone: false, theme: 'auto',
  }, store.load('ui', {})),
  selDate: todayKey(),
  statMonth: null,
};
const persist = (...keys) => keys.forEach(k => store.save(k, state[k]));

/* ---------- 이전 버전(루틴) 데이터 옮기기 ---------- */
function migrateV1(routines, checks) {
  const habits = [], groups = [], records = {};
  const byName = {};
  (routines || []).forEach(r => {
    const h = newHabit({ id: r.id, title: r.title, time: r.time || '', repeat: { type: 'weekly', interval: 1, days: r.days || [0, 1, 2, 3, 4, 5, 6], dates: [] } });
    h.start = '2000-01-01';
    habits.push(h);
    if (r.group) {
      if (!byName[r.group]) { byName[r.group] = newGroup({ name: r.group }); groups.push(byName[r.group]); }
      byName[r.group].habitIds.push(h.id);
    }
  });
  Object.entries(checks || {}).forEach(([k, ids]) => {
    records[k] = {};
    ids.forEach(id => { records[k][id] = { s: 'done', t: null, stamps: [] }; });
  });
  return { habits, groups, records };
}
if (state.habits === null) {
  const old = store.load('routines', null);
  if (old && old.length) {
    const m = migrateV1(old, store.load('checks', {}));
    Object.assign(state, m);
    persist('habits', 'groups', 'records');
  } else {
    state.habits = [];
    persist('habits');
  }
}

function newHabit(o = {}) {
  return Object.assign({
    id: uid(), title: '', emoji: '', time: '', cue: '', alarm: false,
    repeat: { type: 'daily', interval: 1, days: [0, 1, 2, 3, 4, 5, 6], dates: [] },
    timer: { on: false, minutes: 10 }, tags: [], memo: '', start: todayKey(), created: Date.now(),
  }, o);
}
function newGroup(o = {}) {
  return Object.assign({ id: uid(), name: '', emoji: '', time: '', cue: '', alarm: false, timer: false, hl: 'yellow', habitIds: [], created: Date.now() }, o);
}

/* ---------- 픽셀 말 (직접 그린 14×13 캐릭터) ---------- */
const HORSE_BASE = ['...o......o...', '..oo.mmm..oo..', '..oommmmmooo..', '..mmmmmoooo...', '.mmoooooooo...', '.mmoddooddo...', '.mmodwoodwo...', '..mpoooooop...', '...oooooooo...', '...ollllllo...', '...llnllnll...', '...lllddlll...', '....llllll....'];
const HORSE = {
  happy: HORSE_BASE,
  sleep: HORSE_BASE.map((r, i) => i === 5 ? '.mmoooooooo...' : i === 6 ? '.mmoddooddo...' : r),
  cheer: HORSE_BASE.map((r, i) => i === 0 ? 'y..o......o..y' : i === 11 ? '...llddddll...' : r),
};
const HORSE_COL = { o: '#c9a27e', m: '#7a5a44', l: '#efdcc6', d: '#4a3b38', w: '#fbeee9', p: '#e0a093', n: '#a07a5e', y: '#e8c46a' };
function mascot(kind = 'happy', px = 3) {
  const g = HORSE[kind] || HORSE.happy;
  let r = '';
  g.forEach((row, y) => [...row].forEach((c, x) => { if (HORSE_COL[c]) r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${HORSE_COL[c]}"/>`; }));
  let w = 14;
  if (kind === 'sleep') { r += '<rect x="12" y="1" width="1" height="1" fill="#8a857b"/><rect x="13" y="0" width="1" height="1" fill="#8a857b"/>'; }
  return `<svg class="oct" width="${w * px}" height="${13 * px}" viewBox="0 0 ${w} 13" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
}

/* ---------- 공통 UI ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
function applyTheme() {
  const t = state.ui.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}
// 시간 칸을 24시간 형식(시 · 분 선택)으로 바꾸기. 기존 코드처럼 input.value 로 읽고 쓸 수 있어요.
function make24h(input) {
  const wrap = document.createElement('div');
  wrap.className = 't24 ' + input.className;
  const hs = document.createElement('select'), ms = document.createElement('select');
  hs.setAttribute('aria-label', '시'); ms.setAttribute('aria-label', '분');
  hs.innerHTML = '<option value="">--</option>' + Array.from({ length: 24 }, (_, i) => `<option value="${pad(i)}">${pad(i)}</option>`).join('');
  ms.innerHTML = '<option value="">--</option>' + Array.from({ length: 60 }, (_, i) => `<option value="${pad(i)}">${pad(i)}</option>`).join('');
  const colon = document.createElement('span'); colon.textContent = ':';
  const clr = document.createElement('button'); clr.type = 'button'; clr.className = 't24-x'; clr.textContent = '✕'; clr.setAttribute('aria-label', '시간 지우기');
  wrap.append(hs, colon, ms, clr);
  input.type = 'hidden';
  input.after(wrap);
  const fire = () => input.dispatchEvent(new Event('change', { bubbles: true }));
  hs.addEventListener('change', () => { if (!hs.value) ms.value = ''; else if (!ms.value) ms.value = '00'; fire(); });
  ms.addEventListener('change', () => { if (ms.value && !hs.value) hs.value = pad(new Date().getHours()); fire(); });
  clr.addEventListener('click', () => { hs.value = ''; ms.value = ''; fire(); });
  Object.defineProperty(input, 'value', {
    get: () => hs.value ? `${hs.value}:${ms.value || '00'}` : '',
    set: v => { const [h, m] = String(v || '').split(':'); hs.value = h ? pad(Number(h)) : ''; ms.value = h ? pad(Number(m || 0)) : ''; },
  });
  Object.defineProperty(input, 'disabled', {
    get: () => hs.disabled,
    set: v => { hs.disabled = ms.disabled = clr.disabled = !!v; wrap.classList.toggle('off', !!v); },
  });
}
function openDlg(id) { const d = $('#' + id); if (!d.open) d.showModal(); return d; }
function closeDlg(id) { const d = $('#' + id); if (d.open) d.close(); }

/* =========================================================
   할일 (기간)
   ========================================================= */
function filterWindow(filter) {
  const now = new Date();
  const t = todayKey();
  switch (filter) {
    case 'today': return [t, t];
    case 'week': { const s = startOfWeek(now); return [toKey(s), toKey(addDays(s, 6))]; }
    case 'nextweek': { const s = addDays(startOfWeek(now), 7); return [toKey(s), toKey(addDays(s, 6))]; }
    case 'month': return [toKey(new Date(now.getFullYear(), now.getMonth(), 1)), toKey(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
    case 'nextmonth': return [toKey(new Date(now.getFullYear(), now.getMonth() + 1, 1)), toKey(new Date(now.getFullYear(), now.getMonth() + 2, 0))];
    default: return null;
  }
}
function taskStatus(task) {
  const t = todayKey();
  if (task.done) return { cls: '', text: '완료' };
  if (t < task.start) {
    const n = daysBetween(t, task.start);
    return { cls: n <= 3 ? 'soon' : '', text: n === 1 ? '내일 시작' : `${n}일 후 시작` };
  }
  if (t > task.end) return { cls: 'late', text: `${daysBetween(task.end, t)}일 지남` };
  const left = daysBetween(t, task.end);
  return { cls: left <= 1 ? 'soon' : 'now', text: left === 0 ? 'D-Day' : `진행 중 · D-${left}` };
}
function activeTaskCount() {
  const t = todayKey();
  return state.tasks.filter(x => !x.done && x.start <= t && x.end >= t).length;
}
function renderTasks() {
  const { filter, showDone } = state.ui;
  $$('#taskFilters button').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
  $('#showDone').checked = showDone;
  let win = filterWindow(filter);
  let list = state.tasks.filter(x => showDone || !x.done);
  if (win) list = list.filter(x => x.start <= win[1] && x.end >= win[0]);
  list.sort((a, b) => (a.done - b.done) || a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  if (!win && list.length) {
    win = [list.reduce((m, x) => x.start < m ? x.start : m, list[0].start), list.reduce((m, x) => x.end > m ? x.end : m, list[0].end)];
  }
  $('#taskRange').textContent = win ? `${fmtShort(win[0])} ~ ${fmtShort(win[1])} · ${list.length}개` : '';
  const el = $('#taskList');
  if (!list.length) {
    el.innerHTML = `<div class="empty-state">${mascot('happy', 4)}<strong>${state.tasks.length ? '이 기간에는 할일이 없어요' : '아직 할일이 없어요'}</strong>＋ 버튼으로 기간이 있는 할일을 추가해 보세요.</div>`;
    return;
  }
  const winLen = daysBetween(win[0], win[1]) + 1;
  const t = todayKey();
  el.innerHTML = list.map(task => {
    const st = taskStatus(task);
    const len = daysBetween(task.start, task.end) + 1;
    const s = task.start < win[0] ? win[0] : task.start;
    const e = task.end > win[1] ? win[1] : task.end;
    const left = daysBetween(win[0], s) / winLen * 100;
    const width = (daysBetween(s, e) + 1) / winLen * 100;
    let elapsed = '';
    if (!task.done && t >= s) {
      const upto = t > e ? e : t;
      elapsed = `<div class="elapsed" style="left:${left}%;width:${(daysBetween(s, upto) + 1) / winLen * 100}%"></div>`;
    }
    const nowLine = (t >= win[0] && t <= win[1] && winLen > 1) ? `<div class="now-line" style="left:calc(${(daysBetween(win[0], t) + .5) / winLen * 100}% - 1px)"></div>` : '';
    return `
      <article class="tcard ${task.done ? 'done' : ''}" style="--task-color:var(--c-${task.color || 'sage'})">
        <button class="check ${task.done ? 'on' : ''}" data-act="toggle-task" data-id="${task.id}" aria-label="완료 표시">${CHECK_SVG}</button>
        <div class="card-body" data-act="edit-task" data-id="${task.id}">
          <div class="title">${esc(task.title)}</div>
          <div class="meta"><span>${task.start === task.end ? fmtShort(task.start) : `${fmtShort(task.start)} ~ ${fmtShort(task.end)}`} · ${len}일</span><span class="badge ${st.cls}">${st.text}</span></div>
          ${task.memo ? `<div class="memo">${esc(task.memo)}</div>` : ''}
          <div class="track" aria-hidden="true">
            <div class="span ${task.start < win[0] ? 'cut-l' : ''} ${task.end > win[1] ? 'cut-r' : ''}" style="left:${left}%;width:${width}%"></div>${elapsed}${nowLine}
          </div>
        </div>
      </article>`;
  }).join('');
}

let editingTaskId = null, taskColor = 'sage';
function openTaskForm(id = null) {
  editingTaskId = id;
  const f = $('#taskForm');
  const task = id ? state.tasks.find(x => x.id === id) : null;
  const t = todayKey();
  f.title.value = task?.title || '';
  f.start.value = task?.start || t;
  f.end.value = task?.end || t;
  f.memo.value = task?.memo || '';
  taskColor = task?.color || 'sage';
  renderTaskColors();
  $('#taskFormTitle').textContent = task ? '할일 수정' : '할일 추가';
  $('#taskDelete').hidden = !task;
  $('#taskError').textContent = '';
  openDlg('taskDialog');
}
function renderTaskColors() {
  $('#taskColors').innerHTML = TASK_COLORS.map(c => `<button type="button" data-color="${c}" class="${c === taskColor ? 'sel' : ''}" style="background:var(--c-${c})" aria-label="${c}"></button>`).join('');
}
function saveTask(e) {
  e.preventDefault();
  const f = e.target;
  const data = { title: f.title.value.trim(), start: f.start.value, end: f.end.value, memo: f.memo.value.trim(), color: taskColor };
  if (!data.title) return ($('#taskError').textContent = '제목을 입력해 주세요');
  if (!data.start || !data.end) return ($('#taskError').textContent = '기간을 입력해 주세요');
  if (data.end < data.start) return ($('#taskError').textContent = '종료일이 시작일보다 빠를 수 없어요');
  if (editingTaskId) Object.assign(state.tasks.find(x => x.id === editingTaskId), data);
  else state.tasks.push({ id: uid(), done: false, created: Date.now(), ...data });
  persist('tasks');
  closeDlg('taskDialog');
  renderHome();
  toast(editingTaskId ? '수정했어요' : '할일을 추가했어요');
}
function bindTasks() {
  $('#taskFilters').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.ui.filter = b.dataset.filter; persist('ui'); renderTasks();
  });
  $('#showDone').addEventListener('change', e => { state.ui.showDone = e.target.checked; persist('ui'); renderTasks(); });
  $('#taskList').addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const task = state.tasks.find(x => x.id === el.dataset.id);
    if (el.dataset.act === 'toggle-task') {
      task.done = !task.done; persist('tasks'); renderHome();
      if (task.done) toast(state.ui.showDone ? '완료했어요' : '완료했어요 · "완료 보기"에서 확인할 수 있어요');
    } else openTaskForm(task.id);
  });
  $('#taskForm').addEventListener('submit', saveTask);
  $('#taskColors').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { taskColor = b.dataset.color; renderTaskColors(); } });
  $$('#taskQuick button').forEach(b => b.addEventListener('click', () => {
    const f = $('#taskForm');
    const s = f.start.value || todayKey();
    f.start.value = s;
    f.end.value = addDaysKey(s, Number(b.dataset.len) - 1);
  }));
  $('#taskForm').start.addEventListener('change', e => { const f = $('#taskForm'); if (f.end.value && f.end.value < e.target.value) f.end.value = e.target.value; });
  $('#taskDelete').addEventListener('click', () => {
    if (!confirm('이 할일을 삭제할까요?')) return;
    state.tasks = state.tasks.filter(x => x.id !== editingTaskId);
    persist('tasks'); closeDlg('taskDialog'); renderHome(); toast('삭제했어요');
  });
}

/* =========================================================
   내정보 (설정 · 백업)
   ========================================================= */
function renderMe() {
  const h = new Date().getHours();
  const kind = h >= 22 || h < 5 ? 'sleep' : 'happy';
  const msg = h < 12 ? '좋은 아침이에요!' : h < 18 ? '오늘도 천천히, 꾸준히.' : h < 22 ? '오늘 하루도 수고했어요.' : '이제 푹 쉬어요. 내일 또 봐요.';
  $('#meHello').innerHTML = `${mascot(kind, 4)}<div><b>${msg}</b><span class="muted small">습관 ${state.habits.length}개 · 그룹 ${state.groups.length}개 · 할일 ${state.tasks.length}개</span></div>`;
  $('#themeSelect').value = state.ui.theme;
  const n = state.habits.filter(h => h.archived).length;
  $('#archiveCount').textContent = n ? `${n}개 ›` : '›';
}
function exportData() {
  const data = { app: 'planner', version: 2, exported: new Date().toISOString(),
    tasks: state.tasks, habits: state.habits, groups: state.groups, tags: state.tags, records: state.records };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `planner-backup-${todayKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.tasks)) throw new Error();
    if (!confirm('현재 데이터를 백업 파일의 내용으로 바꿀까요?')) return;
    state.tasks = data.tasks;
    if (Array.isArray(data.habits)) {
      state.habits = data.habits; state.groups = data.groups || []; state.tags = data.tags || []; state.records = data.records || {};
    } else if (Array.isArray(data.routines)) {
      Object.assign(state, migrateV1(data.routines, data.checks), { tags: [] });
    } else throw new Error();
    persist('tasks', 'habits', 'groups', 'tags', 'records');
    renderAll();
    toast('백업을 불러왔어요');
  } catch {
    toast('올바른 백업 파일이 아니에요');
  }
}
function bindMe() {
  $('#themeSelect').addEventListener('change', e => { state.ui.theme = e.target.value; persist('ui'); applyTheme(); });
  $('#exportBtn').addEventListener('click', exportData);
  $('#importInput').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('모든 습관, 기록, 할일을 삭제할까요? 되돌릴 수 없어요.')) return;
    state.tasks = []; state.habits = []; state.groups = []; state.tags = []; state.records = {};
    persist('tasks', 'habits', 'groups', 'tags', 'records'); renderAll(); toast('모두 삭제했어요');
  });
}
