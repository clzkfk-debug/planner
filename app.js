'use strict';

/* ================= 유틸 ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const COLORS = ['sage', 'sky', 'sand', 'rose', 'lavender'];
const DEFAULT_GROUP = '기본';

const pad = n => String(n).padStart(2, '0');
const toKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000); // b - a
const todayKey = () => toKey(new Date());
const fmtShort = k => { const d = parseKey(k); return `${d.getMonth() + 1}.${pad(d.getDate())}(${DOW[d.getDay()]})`; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const startOfWeek = d => addDays(d, -((d.getDay() + 6) % 7)); // 월요일 시작
const CHECK_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-text)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/* ================= 저장소 ================= */
const store = {
  load(k, def) { try { const v = JSON.parse(localStorage.getItem('planner.' + k)); return v ?? def; } catch { return def; } },
  save(k, v) { try { localStorage.setItem('planner.' + k, JSON.stringify(v)); } catch { toast('저장 공간이 부족합니다'); } },
};

const state = {
  tasks: store.load('tasks', []),
  routines: store.load('routines', []),
  checks: store.load('checks', {}), // { 'YYYY-MM-DD': [routineId, ...] }
  ui: Object.assign({ tab: 'tasks', filter: 'all', showDone: false, routineView: 'day', routineSort: 'group', theme: 'auto' }, store.load('ui', {})),
  selDate: todayKey(),
};
const persist = (...keys) => keys.forEach(k => store.save(k, state[k]));

/* ================= 공통 UI ================= */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

function applyTheme() {
  const t = state.ui.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

function setTab(tab) {
  state.ui.tab = tab;
  persist('ui');
  $('#tasksView').hidden = tab !== 'tasks';
  $('#routinesView').hidden = tab !== 'routines';
  $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('#pageTitle').textContent = tab === 'tasks' ? '할일' : '루틴';
  render();
}

function render() {
  const d = new Date();
  $('#todayLabel').textContent = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
  if (state.ui.tab === 'tasks') renderTasks(); else renderRoutines();
}

/* ================= 할일 ================= */
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

function renderTasks() {
  const { filter, showDone } = state.ui;
  $$('#taskFilters button').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
  $('#showDone').checked = showDone;

  let win = filterWindow(filter);
  let list = state.tasks.filter(task => showDone || !task.done);
  if (win) list = list.filter(task => task.start <= win[1] && task.end >= win[0]);

  // 정렬: 미완료 먼저 → 시작일 → 종료일
  list.sort((a, b) => (a.done - b.done) || a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

  // '전체'일 때는 보이는 할일 전체 기간을 하나의 타임라인 축으로 사용
  if (!win && list.length) {
    win = [list.reduce((m, x) => x.start < m ? x.start : m, list[0].start),
           list.reduce((m, x) => x.end > m ? x.end : m, list[0].end)];
  }

  const rangeEl = $('#taskRange');
  rangeEl.textContent = win ? `${fmtShort(win[0])} ~ ${fmtShort(win[1])} · ${list.length}개` : '';

  const el = $('#taskList');
  if (!list.length) {
    const hasAny = state.tasks.length > 0;
    el.innerHTML = `<div class="empty"><strong>${hasAny ? '이 기간에는 할일이 없어요' : '아직 할일이 없어요'}</strong>오른쪽 아래 + 버튼으로 기간이 있는 할일을 추가해 보세요.</div>`;
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
    // 경과 구간 (오늘까지 지난 부분)
    let elapsed = '';
    if (!task.done && t >= s) {
      const upto = t > e ? e : t;
      const w = (daysBetween(s, upto) + 1) / winLen * 100;
      elapsed = `<div class="elapsed" style="left:${left}%;width:${w}%"></div>`;
    }
    const nowLine = (t >= win[0] && t <= win[1] && winLen > 1)
      ? `<div class="now-line" style="left:calc(${(daysBetween(win[0], t) + .5) / winLen * 100}% - 1px)"></div>` : '';
    return `
      <article class="card ${task.done ? 'done' : ''}" style="--task-color:var(--c-${task.color || 'sage'})">
        <button class="check" data-act="toggle-task" data-id="${task.id}" aria-label="완료 표시" aria-pressed="${!!task.done}">${CHECK_SVG}</button>
        <div class="card-body" data-act="edit-task" data-id="${task.id}">
          <div class="title">${esc(task.title)}</div>
          <div class="meta">
            <span>${task.start === task.end ? fmtShort(task.start) : `${fmtShort(task.start)} ~ ${fmtShort(task.end)}`} · ${len}일</span>
            <span class="badge ${st.cls}">${st.text}</span>
          </div>
          ${task.memo ? `<div class="memo">${esc(task.memo)}</div>` : ''}
          <div class="track" aria-hidden="true">
            <div class="span ${task.start < win[0] ? 'cut-l' : ''} ${task.end > win[1] ? 'cut-r' : ''}" style="left:${left}%;width:${width}%"></div>
            ${elapsed}${nowLine}
          </div>
        </div>
      </article>`;
  }).join('');
  $$('.check', el).forEach(b => b.classList.toggle('on', b.getAttribute('aria-pressed') === 'true'));
}

/* ---- 할일 폼 ---- */
let editingTaskId = null;
let taskColor = 'sage';

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
  renderColorPicker();
  $('#taskFormTitle').textContent = task ? '할일 수정' : '할일 추가';
  $('#taskDelete').hidden = !task;
  $('#taskError').textContent = '';
  $('#taskDialog').showModal();
  if (!task) setTimeout(() => f.title.focus(), 50);
}

function renderColorPicker() {
  $('#taskColors').innerHTML = COLORS.map(c =>
    `<button type="button" data-color="${c}" class="${c === taskColor ? 'sel' : ''}" style="background:var(--c-${c})" aria-label="${c}"></button>`).join('');
}

function saveTask(e) {
  e.preventDefault();
  const f = e.target;
  const data = { title: f.title.value.trim(), start: f.start.value, end: f.end.value, memo: f.memo.value.trim(), color: taskColor };
  if (!data.title) return ($('#taskError').textContent = '제목을 입력해 주세요');
  if (!data.start || !data.end) return ($('#taskError').textContent = '기간을 입력해 주세요');
  if (data.end < data.start) return ($('#taskError').textContent = '종료일이 시작일보다 빠를 수 없어요');
  if (editingTaskId) {
    Object.assign(state.tasks.find(x => x.id === editingTaskId), data);
  } else {
    state.tasks.push({ id: uid(), done: false, created: Date.now(), ...data });
  }
  persist('tasks');
  $('#taskDialog').close();
  renderTasks();
  toast(editingTaskId ? '수정했어요' : '할일을 추가했어요');
}

/* ================= 루틴 ================= */
function routinesForDate(key) {
  const dow = parseKey(key).getDay();
  return state.routines.filter(r => r.days.includes(dow));
}
const byTime = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.title.localeCompare(b.title, 'ko');

// 그룹으로 묶고, 그룹 안은 시간순, 그룹끼리는 가장 이른 시간순으로 정렬
function groupRoutines(list) {
  const map = new Map();
  [...list].sort(byTime).forEach(r => {
    const g = r.group || DEFAULT_GROUP;
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(r);
  });
  return [...map.entries()];
}

function renderRoutines() {
  const { routineView, routineSort } = state.ui;
  $$('#routineViewSeg button').forEach(b => b.classList.toggle('active', b.dataset.view === routineView));
  $$('#routineSortSeg button').forEach(b => b.classList.toggle('active', b.dataset.sort === routineSort));
  $('#routineDay').hidden = routineView !== 'day';
  $('#routineManage').hidden = routineView !== 'manage';
  if (routineView === 'day') renderRoutineDay(); else renderRoutineManage();
}

function dayCompletion(key) {
  const list = routinesForDate(key);
  const done = (state.checks[key] || []).filter(id => list.some(r => r.id === id)).length;
  return { total: list.length, done };
}

function renderRoutineDay() {
  const sel = state.selDate;
  const t = todayKey();
  const ws = startOfWeek(parseKey(sel));
  $('#weekStrip').innerHTML = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(ws, i);
    const k = toKey(d);
    const c = dayCompletion(k);
    const dot = c.total ? (c.done === c.total ? 'full' : c.done ? 'part' : '') : '';
    return `<button data-date="${k}" class="${k === sel ? 'sel' : ''} ${k === t ? 'is-today' : ''}">
      <span class="dow">${DOW[d.getDay()]}</span><span class="dnum">${d.getDate()}</span><span class="dot ${dot}"></span></button>`;
  }).join('');

  const list = routinesForDate(sel);
  const checked = new Set(state.checks[sel] || []);
  const c = dayCompletion(sel);
  const label = sel === t ? '오늘' : fmtShort(sel);
  $('#dayProgress').textContent = c.total ? `${label} ${c.done}/${c.total} 완료${c.done === c.total ? ' 🌿' : ''}` : `${label}`;
  $('#dayProgressBar').style.width = c.total ? `${c.done / c.total * 100}%` : '0';

  const el = $('#routineDayList');
  if (!list.length) {
    el.innerHTML = state.routines.length
      ? `<div class="empty"><strong>${DOW[parseKey(sel).getDay()]}요일에는 루틴이 없어요</strong>쉬어가는 날이에요.</div>`
      : `<div class="empty"><strong>아직 루틴이 없어요</strong>+ 버튼으로 반복할 요일을 정해 루틴을 만들어 보세요.</div>`;
    return;
  }

  const item = r => `
    <div class="card r-item ${checked.has(r.id) ? 'done' : ''}" data-act="toggle-routine" data-id="${r.id}">
      <span class="check round ${checked.has(r.id) ? 'on' : ''}" role="checkbox" aria-checked="${checked.has(r.id)}">${CHECK_SVG}</span>
      <span class="time">${r.time || '—'}</span>
      <span class="title" style="flex:1">${esc(r.title)}</span>
      ${state.ui.routineSort === 'time' && r.group ? `<span class="badge">${esc(r.group)}</span>` : ''}
      <button class="edit" data-act="edit-routine" data-id="${r.id}" aria-label="수정">⋯</button>
    </div>`;

  if (state.ui.routineSort === 'time') {
    el.innerHTML = `<div class="group">${[...list].sort(byTime).map(item).join('')}</div>`;
  } else {
    el.innerHTML = groupRoutines(list).map(([g, rs]) => `
      <div class="group">
        <div class="group-head">${esc(g)} <span>${rs.filter(r => checked.has(r.id)).length}/${rs.length}</span></div>
        ${rs.map(item).join('')}
      </div>`).join('');
  }
}

function renderRoutineManage() {
  const el = $('#routineManageList');
  if (!state.routines.length) {
    el.innerHTML = `<div class="empty"><strong>아직 루틴이 없어요</strong>+ 버튼으로 루틴을 추가해 보세요.</div>`;
    return;
  }
  const dayChips = r => `<div class="daychips">${[1, 2, 3, 4, 5, 6, 0].map(d => `<i class="${r.days.includes(d) ? 'on' : ''}">${DOW[d]}</i>`).join('')}</div>`;
  el.innerHTML = groupRoutines(state.routines).map(([g, rs]) => `
    <div class="group">
      <div class="group-head">${esc(g)} <span>${rs.length}개</span></div>
      ${rs.map(r => `
        <div class="card r-item" data-act="edit-routine" data-id="${r.id}">
          <span class="time">${r.time || '—'}</span>
          <div style="flex:1;min-width:0"><div class="title">${esc(r.title)}</div>${dayChips(r)}</div>
          <span class="edit" aria-hidden="true">›</span>
        </div>`).join('')}
    </div>`).join('');
}

function toggleRoutine(id) {
  const k = state.selDate;
  const arr = state.checks[k] || [];
  const i = arr.indexOf(id);
  if (i >= 0) arr.splice(i, 1); else arr.push(id);
  if (arr.length) state.checks[k] = arr; else delete state.checks[k];
  persist('checks');
  if (navigator.vibrate) navigator.vibrate(8);
  renderRoutineDay();
}

/* ---- 루틴 폼 ---- */
let editingRoutineId = null;
let routineDays = new Set();

function openRoutineForm(id = null) {
  editingRoutineId = id;
  const f = $('#routineForm');
  const r = id ? state.routines.find(x => x.id === id) : null;
  f.title.value = r?.title || '';
  f.time.value = r?.time || '';
  f.group.value = r?.group || '';
  routineDays = new Set(r?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  renderDayPicker();
  const groups = [...new Set(state.routines.map(x => x.group).filter(Boolean))];
  $('#groupList').innerHTML = groups.map(g => `<option value="${esc(g)}">`).join('');
  $('#routineFormTitle').textContent = r ? '루틴 수정' : '루틴 추가';
  $('#routineDelete').hidden = !r;
  $('#routineError').textContent = '';
  $('#routineDialog').showModal();
  if (!r) setTimeout(() => f.title.focus(), 50);
}

function renderDayPicker() {
  $('#routineDays').innerHTML = [0, 1, 2, 3, 4, 5, 6].map(d =>
    `<button type="button" data-day="${d}" class="${routineDays.has(d) ? 'on' : ''}" aria-pressed="${routineDays.has(d)}">${DOW[d]}</button>`).join('');
}

function saveRoutine(e) {
  e.preventDefault();
  const f = e.target;
  const data = { title: f.title.value.trim(), time: f.time.value, group: f.group.value.trim(), days: [...routineDays].sort() };
  if (!data.title) return ($('#routineError').textContent = '이름을 입력해 주세요');
  if (!data.days.length) return ($('#routineError').textContent = '반복할 요일을 하나 이상 선택해 주세요');
  if (editingRoutineId) Object.assign(state.routines.find(x => x.id === editingRoutineId), data);
  else state.routines.push({ id: uid(), created: Date.now(), ...data });
  persist('routines');
  $('#routineDialog').close();
  renderRoutines();
  toast(editingRoutineId ? '수정했어요' : '루틴을 추가했어요');
}

/* ================= 백업 ================= */
function exportData() {
  const blob = new Blob([JSON.stringify({ app: 'planner', version: 1, exported: new Date().toISOString(),
    tasks: state.tasks, routines: state.routines, checks: state.checks }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `planner-backup-${todayKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.tasks) || !Array.isArray(data.routines)) throw new Error();
    if (!confirm('현재 데이터를 백업 파일의 내용으로 바꿀까요?')) return;
    state.tasks = data.tasks;
    state.routines = data.routines;
    state.checks = data.checks && typeof data.checks === 'object' ? data.checks : {};
    persist('tasks', 'routines', 'checks');
    $('#settingsDialog').close();
    render();
    toast('백업을 불러왔어요');
  } catch {
    toast('올바른 백업 파일이 아니에요');
  }
}

/* ================= 이벤트 ================= */
function bind() {
  $$('.tabbar button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('#fab').addEventListener('click', () => state.ui.tab === 'tasks' ? openTaskForm() : openRoutineForm());

  // 할일
  $('#taskFilters').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.ui.filter = b.dataset.filter; persist('ui'); renderTasks();
  });
  $('#showDone').addEventListener('change', e => { state.ui.showDone = e.target.checked; persist('ui'); renderTasks(); });
  $('#taskList').addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const task = state.tasks.find(x => x.id === el.dataset.id);
    if (el.dataset.act === 'toggle-task') {
      task.done = !task.done; persist('tasks'); renderTasks();
      if (task.done) toast(state.ui.showDone ? '완료했어요' : '완료했어요 · "완료 보기"에서 확인할 수 있어요');
    } else openTaskForm(task.id);
  });
  $('#taskForm').addEventListener('submit', saveTask);
  $('#taskColors').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    taskColor = b.dataset.color; renderColorPicker();
  });
  $$('#taskForm .quick-range button').forEach(b => b.addEventListener('click', () => {
    const f = $('#taskForm');
    const s = f.start.value || todayKey();
    f.start.value = s;
    f.end.value = toKey(addDays(parseKey(s), Number(b.dataset.len) - 1));
  }));
  $('#taskForm').start.addEventListener('change', e => {
    const f = $('#taskForm');
    if (f.end.value && f.end.value < e.target.value) f.end.value = e.target.value;
  });
  $('#taskDelete').addEventListener('click', () => {
    if (!confirm('이 할일을 삭제할까요?')) return;
    state.tasks = state.tasks.filter(x => x.id !== editingTaskId);
    persist('tasks'); $('#taskDialog').close(); renderTasks(); toast('삭제했어요');
  });

  // 루틴
  $('#routineViewSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.ui.routineView = b.dataset.view; persist('ui'); renderRoutines();
  });
  $('#routineSortSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.ui.routineSort = b.dataset.sort; persist('ui'); renderRoutineDay();
  });
  $('#weekStrip').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.selDate = b.dataset.date; renderRoutineDay();
  });
  $('#prevWeek').addEventListener('click', () => { state.selDate = toKey(addDays(parseKey(state.selDate), -7)); renderRoutineDay(); });
  $('#nextWeek').addEventListener('click', () => { state.selDate = toKey(addDays(parseKey(state.selDate), 7)); renderRoutineDay(); });
  $('#routineDayList').addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    if (el.dataset.act === 'edit-routine') openRoutineForm(el.dataset.id);
    else toggleRoutine(el.dataset.id);
  });
  $('#routineManageList').addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (el) openRoutineForm(el.dataset.id);
  });
  $('#routineForm').addEventListener('submit', saveRoutine);
  $('#routineDays').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = Number(b.dataset.day);
    routineDays.has(d) ? routineDays.delete(d) : routineDays.add(d);
    renderDayPicker();
  });
  $$('#routineForm .quick-range button').forEach(b => b.addEventListener('click', () => {
    routineDays = new Set(b.dataset.days.split(',').map(Number)); renderDayPicker();
  }));
  $('#routineDelete').addEventListener('click', () => {
    if (!confirm('이 루틴을 삭제할까요? 체크 기록도 함께 지워집니다.')) return;
    const id = editingRoutineId;
    state.routines = state.routines.filter(x => x.id !== id);
    for (const k of Object.keys(state.checks)) {
      state.checks[k] = state.checks[k].filter(x => x !== id);
      if (!state.checks[k].length) delete state.checks[k];
    }
    persist('routines', 'checks'); $('#routineDialog').close(); renderRoutines(); toast('삭제했어요');
  });

  // 다이얼로그 공통: 닫기 버튼, 바깥 클릭
  $$('dialog').forEach(dlg => {
    dlg.addEventListener('click', e => {
      if (e.target.closest('[data-close]') || e.target === dlg) dlg.close();
    });
  });

  // 설정
  $('#settingsBtn').addEventListener('click', () => { $('#themeSelect').value = state.ui.theme; $('#settingsDialog').showModal(); });
  $('#themeSelect').addEventListener('change', e => { state.ui.theme = e.target.value; persist('ui'); applyTheme(); });
  $('#exportBtn').addEventListener('click', exportData);
  $('#importInput').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('모든 할일, 루틴, 체크 기록을 삭제할까요? 되돌릴 수 없어요.')) return;
    state.tasks = []; state.routines = []; state.checks = {};
    persist('tasks', 'routines', 'checks'); $('#settingsDialog').close(); render(); toast('모두 삭제했어요');
  });

  // 자정이 지나거나 앱으로 돌아오면 날짜 갱신
  let lastDay = todayKey();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = todayKey();
    if (now !== lastDay) { if (state.selDate === lastDay) state.selDate = now; lastDay = now; }
    render();
  });
}

/* ================= PWA ================= */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  $('#installBtn').hidden = false;
});
$('#installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('#installBtn').hidden = true;
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'activated' && navigator.serviceWorker.controller) toast('새 버전으로 업데이트되었어요');
        });
      });
    }).catch(() => {});
  });
}

/* ================= 시작 ================= */
applyTheme();
bind();
setTab(state.ui.tab);
