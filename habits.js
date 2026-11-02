'use strict';
/* =========================================================
   습관: 기록 계산 · 홈 표 · 상세 · 편집 · 그룹 · 태그 · 타이머 · 통계
   ========================================================= */
const habitById = id => state.habits.find(h => h.id === id);
const groupById = id => state.groups.find(g => g.id === id);
const tagById = id => state.tags.find(t => t.id === id);
const groupOf = hid => state.groups.find(g => g.habitIds.includes(hid));
const hEmoji = h => h.emoji || '✅';
const minTime = t => t || '99:99';

/* ---------- 반복 주기 ---------- */
function isDue(h, k) {
  if (k < h.start) return false;
  const r = h.repeat || {};
  const d = parseKey(k);
  if (r.type === 'weekly') return (r.days || []).includes(d.getDay());
  if (r.type === 'monthly') {
    const day = d.getDate(), last = lastDayOfMonth(d);
    const dates = r.dates || [];
    if (dates.includes(day)) return true;
    if (day === last && (r.last || dates.some(x => x > last))) return true;
    return false;
  }
  const iv = Math.max(1, r.interval || 1);
  return daysBetween(h.start, k) % iv === 0;
}
function repeatText(h) {
  const r = h.repeat || {};
  if (r.type === 'weekly') {
    const ds = [...(r.days || [])].sort();
    const s = ds.join(',');
    if (s === '0,1,2,3,4,5,6') return '매일';
    if (s === '1,2,3,4,5') return '평일';
    if (s === '0,6') return '주말';
    return '매주 ' + [1, 2, 3, 4, 5, 6, 0].filter(x => ds.includes(x)).map(x => DOW[x]).join('·');
  }
  if (r.type === 'monthly') {
    const ds = [...(r.dates || [])].sort((a, b) => a - b);
    const parts = ds.length ? [ds.join('·') + '일'] : [];
    if (r.last) parts.push('말일');
    return '매월 ' + parts.join('·');
  }
  const iv = r.interval || 1;
  return iv === 1 ? '매일' : `${iv}일마다`;
}

/* ---------- 기록 ---------- */
const getRec = (k, id) => state.records[k]?.[id];
function ensureRec(k, id) {
  if (!state.records[k]) state.records[k] = {};
  if (!state.records[k][id]) state.records[k][id] = { s: null, t: null, stamps: [] };
  return state.records[k][id];
}
function cleanRec(k, id) {
  const r = getRec(k, id);
  if (r && !r.s && !(r.stamps || []).length) delete state.records[k][id];
  if (state.records[k] && !Object.keys(state.records[k]).length) delete state.records[k];
}
function setStatus(k, id, s) {
  const r = ensureRec(k, id);
  r.s = s;
  if (s === 'done') {
    if (k === todayKey()) { r.t = nowHM(); r.stamps.push({ t: r.t, k: 'done' }); }
  } else { r.t = null; r.stamps = r.stamps.filter(x => x.k !== 'done' && x.k !== 'fail'); }
  if (s === 'fail' && k === todayKey()) r.stamps.push({ t: nowHM(), k: 'fail' });
  cleanRec(k, id);
  persist('records');
}
function addStamp(k, id, kind = 'stamp') {
  ensureRec(k, id).stamps.push({ t: nowHM(), k: kind });
  persist('records');
}
function cycleStatus(k, id) {
  const cur = getRec(k, id)?.s || null;
  const next = cur === null ? 'done' : cur === 'done' ? 'fail' : null;
  setStatus(k, id, next);
  if (navigator.vibrate) navigator.vibrate(8);
  return next;
}
const isDone = (k, id) => getRec(k, id)?.s === 'done';

/* ---------- 연속 달성 ---------- */
function earliestKey() {
  const keys = Object.keys(state.records);
  return keys.length ? keys.reduce((a, b) => a < b ? a : b) : null;
}
function habitStreak(h) {
  const t = todayKey();
  let k = t, n = 0;
  for (let i = 0; i < 2000 && k >= h.start; i++, k = addDaysKey(k, -1)) {
    if (!isDue(h, k)) continue;
    if (isDone(k, h.id)) n++;
    else if (k !== t || getRec(k, h.id)?.s === 'fail') break;
  }
  return n;
}
function habitBest(h, from) {
  const t = todayKey();
  let k = h.start > from ? h.start : from, best = 0, cur = 0;
  for (let i = 0; i < 4000 && k <= t; i++, k = addDaysKey(k, 1)) {
    if (!isDue(h, k)) continue;
    if (isDone(k, h.id)) { cur++; best = Math.max(best, cur); }
    else if (k !== t) cur = 0;
  }
  return best;
}
function dayStats(k, list = state.habits) {
  const due = list.filter(h => isDue(h, k));
  return { total: due.length, done: due.filter(h => isDone(k, h.id)).length, fail: due.filter(h => getRec(k, h.id)?.s === 'fail').length };
}
function overallStreak() {
  const first = earliestKey();
  if (!first) return 0;
  const t = todayKey();
  let k = t, n = 0;
  for (let i = 0; i < 2000 && k >= first; i++, k = addDaysKey(k, -1)) {
    const s = dayStats(k);
    if (!s.total) continue;
    if (s.done === s.total) n++;
    else if (k !== t) break;
  }
  return n;
}
function overallBest() {
  const first = earliestKey();
  if (!first) return 0;
  const t = todayKey();
  let k = first, best = 0, cur = 0;
  for (let i = 0; i < 4000 && k <= t; i++, k = addDaysKey(k, 1)) {
    const s = dayStats(k);
    if (!s.total) continue;
    if (s.done === s.total) { cur++; best = Math.max(best, cur); } else if (k !== t) cur = 0;
  }
  return best;
}
function rangeRate(list, from, to) {
  const t = todayKey();
  let due = 0, done = 0;
  for (let k = from; k <= to && k <= t; k = addDaysKey(k, 1)) {
    list.forEach(h => { if (isDue(h, k)) { due++; if (isDone(k, h.id)) done++; } });
  }
  return { due, done, rate: due ? done / due : 0 };
}

/* =========================================================
   홈: 상단 · 주간 날짜 · 습관 표
   ========================================================= */
function renderHeader() {
  const d = parseKey(state.selDate);
  $('#monthLabel').textContent = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  $('#datePick').value = state.selDate;
  $('#todayBtn').hidden = state.selDate === todayKey();
  const st = dayStats(todayKey());
  const h = new Date().getHours();
  const kind = st.total && st.done === st.total ? 'cheer' : (h >= 22 || h < 5) ? 'sleep' : 'happy';
  $('#octHead').innerHTML = octSVG(kind, 2);
  $('#streakPill').textContent = `🔥 ${overallStreak()}`;
  $('#taskCount').textContent = `(${activeTaskCount()})`;
}

function renderWeek() {
  const t = todayKey();
  const ws = startOfWeek(parseKey(state.selDate));
  $('#weekStrip').innerHTML = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(ws, i), k = toKey(d);
    const s = dayStats(k);
    let cls = '', p = 0;
    if (s.total && s.done === s.total) cls = 'full';
    else if (s.total && k < t) { cls = 'miss'; p = s.done / s.total; }
    else if (s.total && k === t) { cls = 'part'; p = s.done / s.total; }
    const inner = cls === 'miss' || cls === 'part' ? `<span>${d.getDate()}</span>` : d.getDate();
    return `<button class="wd ${k === state.selDate ? 'sel' : ''}" data-date="${k}">${DOW[d.getDay()]}<div class="c ${cls} ${k === t ? 'today' : ''}" style="--p:${Math.round(p * 100)}%">${inner}</div></button>`;
  }).join('');
}

function renderTagFilters() {
  $('#rangeBtn').textContent = (state.ui.range === 'week' ? '일주일' : '하루') + ' ⌄';
  if (state.ui.tagFilter && !tagById(state.ui.tagFilter)) state.ui.tagFilter = null;
  $('#tagFilters').innerHTML = state.tags.map(t =>
    `<button class="f ${state.ui.tagFilter === t.id ? 'on' : ''}" data-tag="${t.id}" style="--tc:var(--t-${t.color})"><i></i>${esc(t.name)}</button>`).join('');
}

function visibleHabits() {
  const tf = state.ui.tagFilter;
  return state.habits.filter(h => !tf || (h.tags || []).includes(tf));
}

// 그룹별/시간순 정렬 결과: [{group|null, habits:[]}]
function arrangeHabits(list) {
  const byTime = (a, b) => minTime(a.time).localeCompare(minTime(b.time)) || a.created - b.created;
  if (state.ui.sort === 'time') return [{ group: null, habits: [...list].sort(byTime) }];
  const ids = new Set(list.map(h => h.id));
  const blocks = state.groups.map(g => ({ group: g, habits: g.habitIds.filter(id => ids.has(id)).map(habitById).filter(Boolean) }))
    .filter(b => b.habits.length);
  blocks.sort((a, b) => minTime(a.group.time || a.habits.map(h => h.time).filter(Boolean).sort()[0]).localeCompare(minTime(b.group.time || b.habits.map(h => h.time).filter(Boolean).sort()[0])) || a.group.created - b.group.created);
  const grouped = new Set(state.groups.flatMap(g => g.habitIds));
  const rest = list.filter(h => !grouped.has(h.id)).sort(byTime);
  if (rest.length) blocks.push({ group: null, habits: rest });
  return blocks;
}

function kCell(time, cue) {
  if (time && cue) return `${time}<br>${esc(cue)}`;
  return time || esc(cue || '');
}
function resultCell(h, k) {
  const r = getRec(k, h.id);
  if (r?.s === 'done') return `<span class="e">${hEmoji(h)}</span><span class="tm">${r.t || '완료'}</span>`;
  if (r?.s === 'fail') return `<span class="e">❌</span><span class="fail">못 함</span>`;
  if (h.timer?.on) return `<span class="play">▶ ${h.timer.minutes}분</span>`;
  return '<span class="empty"></span>';
}

function renderHabitsDay() {
  const k = state.selDate;
  const list = visibleHabits().filter(h => isDue(h, k));
  const el = $('#habitTable');
  if (!state.habits.length) {
    el.innerHTML = `<div class="empty-state">${octSVG('happy', 5)}<strong>첫 습관을 만들어 볼까요?</strong>오른쪽 아래 ＋ 버튼을 눌러 습관이나 그룹을 추가해요.</div>`;
    return;
  }
  if (!list.length) {
    el.innerHTML = `<div class="empty-state">${octSVG('sleep', 5)}<strong>${state.ui.tagFilter ? '이 태그의 습관이 없는 날이에요' : '오늘은 쉬는 날이에요'}</strong>해야 할 습관이 없어요.</div>`;
    return;
  }
  let n = 0;
  el.innerHTML = '<div class="tbl">' + arrangeHabits(list).map(({ group: g, habits }) => {
    const rows = [];
    const folded = g && state.ui.collapsed[g.id];
    if (g) {
      const d = habits.filter(h => isDone(k, h.id)).length;
      const doneAll = d === habits.length;
      const res = g.timer && !doneAll ? `<span class="play">▶</span><span>${d}/${habits.length}</span>` : `<span class="e">${g.emoji || (doneAll ? '🎉' : '📋')}</span><span>${d}/${habits.length}</span>`;
      rows.push(`<div class="row gh" style="--hlc:${g.hl ? `var(--hl-${g.hl})` : 'var(--surface-2)'}">
        <div class="x fold" data-act="fold" data-id="${g.id}">${folded ? '▶' : '▼'}</div>
        <div class="cell k">${kCell(g.time, g.cue)}</div>
        <div class="cell m" data-act="edit-group" data-id="${g.id}"><span class="nm">${esc((g.emoji ? g.emoji + ' ' : '') + g.name)}</span>${doneAll ? octSVG('cheer', 1.5) : ''}</div>
        <div class="cell r" data-act="group-run" data-id="${g.id}">${res}</div></div>`);
    }
    if (!folded) habits.forEach(h => {
      n++;
      const st = habitStreak(h);
      rows.push(`<div class="row ${isDone(k, h.id) ? 'done' : ''}">
        <div class="x">${h.alarm || g?.alarm ? '<span class="bell">🔔</span>' : ''}${n}</div>
        <div class="cell k">${kCell(h.time, h.cue)}</div>
        <div class="cell m" data-act="detail" data-id="${h.id}"><span class="nm">${esc(hEmoji(h) + ' ' + h.title)}</span>${st ? `<span class="fire">🔥${st}</span>` : ''}</div>
        <div class="cell r" data-act="result" data-id="${h.id}">${resultCell(h, k)}</div></div>`);
    });
    // 모서리 둥글게: 첫 줄 top, 마지막 줄 last
    if (rows.length) {
      rows[0] = rows[0].replace('class="row', 'class="row top');
      rows[rows.length - 1] = rows[rows.length - 1].replace('class="row', 'class="row last');
    }
    return `<div class="blk">${rows.join('')}</div>`;
  }).join('') + '</div>';
}

function renderHabitsWeek() {
  const ws = startOfWeek(parseKey(state.selDate));
  const days = Array.from({ length: 7 }, (_, i) => toKey(addDays(ws, i)));
  const t = todayKey();
  const list = visibleHabits();
  const el = $('#habitTable');
  if (!list.length) { renderHabitsDay(); return; }
  const cell = (h, k) => {
    if (!isDue(h, k)) return '<div class="wc x">–</div>';
    const r = getRec(k, h.id);
    if (r?.s === 'done') return `<div class="wc y" data-date="${k}" data-id="${h.id}">✓</div>`;
    if (r?.s === 'fail') return `<div class="wc n" data-date="${k}" data-id="${h.id}">❌</div>`;
    return `<div class="wc e" data-date="${k}" data-id="${h.id}"></div>`;
  };
  let html = `<div class="wtbl"><div class="wrow h"><span></span>${days.map(k => `<span class="${k === t ? 'tdy' : ''}">${DOW[parseKey(k).getDay()]}<br>${parseKey(k).getDate()}</span>`).join('')}</div>`;
  arrangeHabits(list).forEach(({ group: g, habits }) => {
    if (g) html += `<div class="wrow g" style="--hlc:${g.hl ? `var(--hl-${g.hl})` : 'var(--surface-2)'}">${esc((g.emoji ? g.emoji + ' ' : '') + g.name)}</div>`;
    else if (state.ui.sort === 'group' && state.groups.length) html += `<div class="wrow g">기타</div>`;
    habits.forEach(h => {
      const st = habitStreak(h);
      html += `<div class="wrow"><div class="nm" data-act="detail" data-id="${h.id}"><span>${esc(hEmoji(h) + ' ' + h.title)}</span><small>${st ? '🔥' + st : ''}</small></div>${days.map(k => cell(h, k)).join('')}</div>`;
    });
  });
  el.innerHTML = html + '</div>';
}

function renderCheer() {
  const el = $('#cheer');
  const k = state.selDate, t = todayKey();
  if (state.ui.range !== 'day' || !state.habits.length) { el.innerHTML = ''; return; }
  const s = dayStats(k, visibleHabits());
  if (!s.total) { el.innerHTML = ''; return; }
  let kind = 'happy', msg;
  if (k > t) msg = '아직 오지 않은 날이에요. 미리 체크할 수도 있어요.';
  else if (k < t) { msg = `이 날은 ${s.total}개 중 ${s.done}개 했어요.`; kind = s.done === s.total ? 'cheer' : 'happy'; }
  else {
    const left = s.total - s.done - s.fail;
    if (s.done === s.total) { msg = '오늘 습관 다 했어요! 정말 멋져요 🎉'; kind = 'cheer'; }
    else if (!left) msg = '오늘도 수고했어요. 내일 또 해봐요!';
    else if (left <= 3) msg = `${left}개만 더 하면 오늘 끝! 힘내요`;
    else msg = `오늘 습관 ${left}개 남았어요. 하나씩 해봐요!`;
    if (kind === 'happy' && new Date().getHours() >= 22) kind = 'sleep';
  }
  el.innerHTML = `<div class="cheer">${octSVG(kind, 3.4)}<div class="bub">${msg}</div></div>`;
}

function renderHabits() {
  renderTagFilters();
  if (state.ui.range === 'week') renderHabitsWeek(); else renderHabitsDay();
  renderCheer();
}

/* =========================================================
   습관 상세
   ========================================================= */
let detailId = null;
const STAMP_LABEL = { start: '▶ 타이머 시작', done: '✓ 완료', stamp: '⏱ 시간 기록', fail: '❌ 못 함' };
function openDetail(id) {
  detailId = id;
  renderDetail();
  openDlg('detailDialog');
}
function renderDetail() {
  const h = habitById(detailId);
  if (!h) { closeDlg('detailDialog'); return; }
  const k = state.selDate, t = todayKey();
  const g = groupOf(h.id);
  const rec = getRec(k, h.id);
  const ws = startOfWeek(parseKey(k));
  const week = Array.from({ length: 7 }, (_, i) => {
    const kk = toKey(addDays(ws, i)), r = getRec(kk, h.id);
    let cls = '', ic = '';
    if (!isDue(h, kk)) cls = 'x';
    else if (r?.s === 'done') { cls = 'y'; ic = '✓'; }
    else if (r?.s === 'fail') { cls = 'n'; ic = '❌'; }
    else if (kk === t) cls = 't';
    return `<div>${DOW[parseKey(kk).getDay()]}<i class="${cls}">${ic}</i><div class="tm">${r?.s === 'done' && r.t ? r.t : ''}</div></div>`;
  }).join('');
  const first = earliestKey() || t;
  const m = parseKey(t);
  const mr = rangeRate([h], toKey(new Date(m.getFullYear(), m.getMonth(), 1)), t);
  const chips = [`🔁 ${repeatText(h)}`, h.time && `⏰ ${h.time}`, h.cue && `📍 ${esc(h.cue)}`, h.timer?.on && `⏱ ${h.timer.minutes}분`, g && `📂 ${esc(g.name)}`].filter(Boolean);
  const tags = (h.tags || []).map(tagById).filter(Boolean);
  const stamps = rec?.stamps || [];
  const dayLabel = k === t ? '오늘' : fmtShort(k);
  let btns;
  if (rec?.s === 'done') btns = `<button class="btn" data-d="undo">완료 취소</button>`;
  else if (h.timer?.on) btns = `<button class="btn" data-d="done">✓ 완료</button><button class="btn primary" data-d="timer">▶ 타이머 시작</button>`;
  else btns = `<button class="btn" data-d="fail">❌ 못 함</button><button class="btn primary" data-d="done">✓ 완료하고 시간 찍기</button>`;
  $('#detailBody').innerHTML = `
    <div class="nav"><button class="nav-btn" data-close>‹ 닫기</button><b>습관</b><button class="nav-btn primary-text" data-d="edit">편집</button></div>
    <div class="form-body" style="padding:0">
      <div class="hero" style="--hlc:${g?.hl ? `var(--hl-${g.hl})` : 'var(--accent-soft)'}">
        <div class="top"><div class="big-emo">${hEmoji(h)}</div><div><h2>${esc(h.title)}</h2>
          ${tags.length ? `<div class="tagrow" style="margin-top:6px">${tags.map(x => `<span class="tag" style="--tc:var(--t-${x.color})"><i></i>${esc(x.name)}</span>`).join('')}</div>` : ''}</div></div>
        <div class="chips2">${chips.map(c => `<span>${c}</span>`).join('')}</div>
      </div>
      <div style="padding:0 16px">
        <div class="stat-cards" style="margin-top:14px">
          <div class="stat fire">연속 달성<b>🔥 ${habitStreak(h)}일</b></div>
          <div class="stat">최고 기록<b>${habitBest(h, first)}일</b></div>
          <div class="stat">이번 달<b>${mr.due ? Math.round(mr.rate * 100) : 0}%</b></div>
        </div>
        <div class="sec">이번 주</div>
        <div class="box"><div class="wk">${week}</div></div>
        <div class="sec">${dayLabel} 기록 · 타임스탬프</div>
        <div class="box">
          ${stamps.length ? stamps.map((s, i) => `<div class="log"><span class="tm">${s.t}</span><span class="lb">${STAMP_LABEL[s.k] || s.k}</span><button data-d="unstamp" data-i="${i}" aria-label="삭제">✕</button></div>`).join('') : '<div class="muted small">아직 기록이 없어요.</div>'}
          <button class="stampbtn" data-d="stamp">⏱ 지금 시간 찍기</button>
        </div>
        ${h.memo ? `<div class="sec">메모</div><div class="box small muted" style="white-space:pre-wrap">${esc(h.memo)}</div>` : ''}
      </div>
    </div>
    <div class="d-btns">${btns}</div>`;
}
function onDetailClick(e) {
  if (e.target.closest('[data-close]')) { closeDlg('detailDialog'); return; }
  const b = e.target.closest('[data-d]'); if (!b) return;
  const h = habitById(detailId), k = state.selDate;
  switch (b.dataset.d) {
    case 'edit': closeDlg('detailDialog'); openHabitForm(h.id); return;
    case 'done': setStatus(k, h.id, 'done'); toast('완료! 잘했어요'); break;
    case 'fail': setStatus(k, h.id, 'fail'); break;
    case 'undo': setStatus(k, h.id, null); break;
    case 'timer': closeDlg('detailDialog'); startTimer([h.id]); return;
    case 'stamp': addStamp(k, h.id, 'stamp'); toast(`${nowHM()} 기록했어요`); break;
    case 'unstamp': {
      const r = getRec(k, h.id);
      r.stamps.splice(Number(b.dataset.i), 1); cleanRec(k, h.id); persist('records'); break;
    }
  }
  renderDetail(); renderHome();
}

/* =========================================================
   습관 추가/편집
   ========================================================= */
const hf = { id: null, repeat: null, minutes: 10, tags: [], onSaved: null };
function openHabitForm(id = null, opts = {}) {
  const h = id ? habitById(id) : null;
  const f = $('#habitForm');
  hf.id = id;
  hf.onSaved = opts.onSaved || null;
  const rp = h?.repeat || { type: 'daily', interval: 1, days: [0, 1, 2, 3, 4, 5, 6], dates: [], last: false };
  hf.repeat = { type: rp.type, interval: rp.interval || 1, days: new Set(rp.days || []), dates: new Set(rp.dates || []), last: !!rp.last };
  if (!hf.repeat.days.size) [0, 1, 2, 3, 4, 5, 6].forEach(d => hf.repeat.days.add(d));
  if (!hf.repeat.dates.size && !hf.repeat.last) hf.repeat.dates.add(parseKey(todayKey()).getDate());
  hf.minutes = h?.timer?.minutes || 10;
  hf.tags = [...(h?.tags || [])];
  f.emoji.value = h?.emoji || '';
  f.title.value = h?.title || '';
  f.time.value = h?.time || '';
  f.cue.value = h?.cue || '';
  f.alarm.checked = !!h?.alarm;
  f.timerOn.checked = !!h?.timer?.on;
  f.memo.value = h?.memo || '';
  const g = h ? groupOf(h.id) : null;
  $('#groupSelect').innerHTML = '<option value="">없음</option>' + state.groups.map(x => `<option value="${x.id}">${esc((x.emoji ? x.emoji + ' ' : '') + x.name)}</option>`).join('');
  $('#groupSelect').value = opts.groupId || g?.id || '';
  $('#groupRow').hidden = !!opts.onSaved;
  $('#habitFormTitle').textContent = h ? '습관 편집' : '습관 추가하기';
  $('#habitDelete').hidden = !h;
  $('#habitError').textContent = '';
  renderHabitFormParts();
  openDlg('habitDialog');
  $('#habitDialog .form-body').scrollTop = 0;
}
function renderHabitFormParts() {
  const f = $('#habitForm'), r = hf.repeat;
  $$('#repeatSeg button').forEach(b => b.classList.toggle('on', b.dataset.type === r.type));
  $('#repDaily').hidden = r.type !== 'daily';
  $('#repWeekly').hidden = r.type !== 'weekly';
  $('#repMonthly').hidden = r.type !== 'monthly';
  $('#intervalVal').textContent = r.interval;
  $('#weekDays').innerHTML = [0, 1, 2, 3, 4, 5, 6].map(d => `<button type="button" data-day="${d}" class="${r.days.has(d) ? 'on' : ''}">${DOW[d]}</button>`).join('');
  $('#monthDates').innerHTML = Array.from({ length: 31 }, (_, i) => i + 1).map(d => `<button type="button" data-date="${d}" class="${r.dates.has(d) ? 'on' : ''}">${d}</button>`).join('') +
    `<button type="button" data-date="L" class="wide ${r.last ? 'on' : ''}">말일</button>`;
  $('#minVal').textContent = hf.minutes;
  $('#timerRow').hidden = !f.timerOn.checked;
  $('#alarmHint').hidden = !f.alarm.checked;
  $('#habitTags').innerHTML = hf.tags.map(tagById).filter(Boolean).map(t => `<span class="tag" style="--tc:var(--t-${t.color})"><i></i>${esc(t.name)}</span>`).join('') +
    '<button type="button" class="tag add" id="habitTagAdd">＋ 태그</button>';
}
function saveHabit(e) {
  e.preventDefault();
  const f = $('#habitForm'), r = hf.repeat;
  const title = f.title.value.trim();
  if (!title) { $('#habitError').textContent = '습관 이름을 입력해 주세요'; return; }
  if (r.type === 'weekly' && !r.days.size) { $('#habitError').textContent = '반복할 요일을 하나 이상 골라 주세요'; return; }
  if (r.type === 'monthly' && !r.dates.size && !r.last) { $('#habitError').textContent = '반복할 날짜를 하나 이상 골라 주세요'; return; }
  const data = {
    title, emoji: f.emoji.value.trim(), time: f.time.value, cue: f.cue.value.trim(), alarm: f.alarm.checked,
    repeat: { type: r.type, interval: r.interval, days: [...r.days].sort(), dates: [...r.dates].sort((a, b) => a - b), last: r.last },
    timer: { on: f.timerOn.checked, minutes: hf.minutes }, tags: hf.tags, memo: f.memo.value.trim(),
  };
  let h;
  if (hf.id) { h = habitById(hf.id); Object.assign(h, data); }
  else { h = newHabit(data); state.habits.push(h); }
  if (!hf.onSaved) {
    const gid = $('#groupSelect').value;
    const cur = groupOf(h.id);
    if ((cur?.id || '') !== gid) {
      state.groups.forEach(g => { g.habitIds = g.habitIds.filter(x => x !== h.id); });
      if (gid) groupById(gid).habitIds.push(h.id);
    }
  }
  persist('habits', 'groups');
  closeDlg('habitDialog');
  if (hf.onSaved) hf.onSaved(h.id);
  renderHome();
  toast(hf.id ? '수정했어요' : '습관을 추가했어요');
}
function deleteHabit() {
  if (!confirm('이 습관을 삭제할까요? 체크 기록도 함께 지워져요.')) return;
  const id = hf.id;
  state.habits = state.habits.filter(h => h.id !== id);
  state.groups.forEach(g => { g.habitIds = g.habitIds.filter(x => x !== id); });
  Object.keys(state.records).forEach(k => { delete state.records[k][id]; if (!Object.keys(state.records[k]).length) delete state.records[k]; });
  if (gf.draft) gf.draft.habitIds = gf.draft.habitIds.filter(x => x !== id);
  persist('habits', 'groups', 'records');
  closeDlg('habitDialog');
  if ($('#groupDialog').open) renderGroupHabits();
  renderHome();
  toast('삭제했어요');
}
function bindHabitForm() {
  const f = $('#habitForm');
  f.addEventListener('submit', saveHabit);
  $('#habitDelete').addEventListener('click', deleteHabit);
  $('#repeatSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { hf.repeat.type = b.dataset.type; renderHabitFormParts(); } });
  $('#repDaily').addEventListener('click', e => {
    const b = e.target.closest('[data-step]'); if (!b) return;
    hf.repeat.interval = Math.min(30, Math.max(1, hf.repeat.interval + Number(b.dataset.step))); renderHabitFormParts();
  });
  $('#weekDays').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = Number(b.dataset.day), s = hf.repeat.days;
    s.has(d) ? s.delete(d) : s.add(d); renderHabitFormParts();
  });
  $('#weekQuick').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    hf.repeat.days = new Set(b.dataset.days.split(',').map(Number)); renderHabitFormParts();
  });
  $('#monthDates').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.date === 'L') hf.repeat.last = !hf.repeat.last;
    else { const d = Number(b.dataset.date), s = hf.repeat.dates; s.has(d) ? s.delete(d) : s.add(d); }
    renderHabitFormParts();
  });
  $('#timerRow').addEventListener('click', e => {
    const b = e.target.closest('[data-min]'); if (!b) return;
    const v = hf.minutes + Number(b.dataset.min);
    hf.minutes = v < 5 && Number(b.dataset.min) < 0 ? Math.max(1, hf.minutes - 1) : Math.min(180, Math.max(1, v));
    renderHabitFormParts();
  });
  f.timerOn.addEventListener('change', renderHabitFormParts);
  f.alarm.addEventListener('change', renderHabitFormParts);
  $('#habitTags').addEventListener('click', e => { if (e.target.closest('#habitTagAdd')) openTagDialog('select'); });
}

/* =========================================================
   그룹 추가/편집
   ========================================================= */
const gf = { id: null, draft: null, hl: 'yellow' };
function openGroupForm(id = null) {
  const g = id ? groupById(id) : null;
  const f = $('#groupForm');
  gf.id = id;
  gf.draft = { habitIds: [...(g?.habitIds || [])] };
  gf.hl = g?.hl || 'yellow';
  f.emoji.value = g?.emoji || '';
  f.name.value = g?.name || '';
  f.time.value = g?.time || '';
  f.cue.value = g?.cue || '';
  f.alarm.checked = !!g?.alarm;
  f.timer.checked = !!g?.timer;
  f.hlOn.checked = g ? !!g.hl : true;
  $('#groupFormTitle').textContent = g ? '그룹 편집' : '그룹 추가하기';
  $('#groupDelete').hidden = !g;
  $('#groupError').textContent = '';
  renderGroupHabits();
  renderHl();
  openDlg('groupDialog');
}
function renderGroupHabits() {
  const ids = gf.draft.habitIds.filter(id => habitById(id));
  gf.draft.habitIds = ids;
  const total = ids.map(habitById).reduce((s, h) => s + (h.timer?.on ? h.timer.minutes : 0), 0);
  $('#groupTotal').textContent = total ? `총 ${total}분` : `${ids.length}개`;
  $('#groupHabits').innerHTML = ids.map((id, i) => {
    const h = habitById(id);
    return `<div class="hitem"><span class="nm">${esc(hEmoji(h) + ' ' + h.title)}</span><span class="d">${h.timer?.on ? '⏱ ' + h.timer.minutes + '분' : ''}</span>
      <button type="button" data-mv="-1" data-i="${i}" aria-label="위로" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>▲</button>
      <button type="button" data-mv="1" data-i="${i}" aria-label="아래로" ${i === ids.length - 1 ? 'disabled style="opacity:.3"' : ''}>▼</button>
      <button type="button" data-rm="${i}" aria-label="그룹에서 빼기">✕</button></div>`;
  }).join('');
}
function renderHl() {
  const f = $('#groupForm');
  $('#hlBox').hidden = !f.hlOn.checked;
  $('#hlPal').innerHTML = HL_COLORS.map(c => `<button type="button" data-hl="${c}" class="${c === gf.hl ? 'sel' : ''}" style="--hlc:var(--hl-${c})" aria-label="${c}"></button>`).join('');
  const prev = $('#hlPrev');
  prev.style.setProperty('--hlc', `var(--hl-${gf.hl})`);
  prev.querySelector('b').textContent = `${f.emoji.value || '📋'} ${f.name.value || '그룹 이름'}`;
  prev.querySelector('span:last-child').textContent = `0/${gf.draft.habitIds.length}`;
}
function saveGroup(e) {
  e.preventDefault();
  const f = $('#groupForm');
  const name = f.name.value.trim();
  if (!name) { $('#groupError').textContent = '그룹 이름을 입력해 주세요'; return; }
  const data = { name, emoji: f.emoji.value.trim(), time: f.time.value, cue: f.cue.value.trim(), alarm: f.alarm.checked, timer: f.timer.checked, hl: f.hlOn.checked ? gf.hl : null, habitIds: gf.draft.habitIds };
  let g;
  if (gf.id) { g = groupById(gf.id); Object.assign(g, data); }
  else { g = newGroup(data); state.groups.push(g); }
  state.groups.forEach(o => { if (o !== g) o.habitIds = o.habitIds.filter(id => !g.habitIds.includes(id)); });
  persist('groups');
  closeDlg('groupDialog');
  gf.draft = null;
  renderHome();
  toast(gf.id ? '그룹을 수정했어요' : '그룹을 만들었어요');
}
function bindGroupForm() {
  const f = $('#groupForm');
  f.addEventListener('submit', saveGroup);
  f.hlOn.addEventListener('change', renderHl);
  f.name.addEventListener('input', renderHl);
  f.emoji.addEventListener('input', renderHl);
  $('#hlPal').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { gf.hl = b.dataset.hl; renderHl(); } });
  $('#groupHabits').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const ids = gf.draft.habitIds;
    if (b.dataset.rm !== undefined) ids.splice(Number(b.dataset.rm), 1);
    else if (b.dataset.mv) { const i = Number(b.dataset.i), j = i + Number(b.dataset.mv); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    renderGroupHabits(); renderHl();
  });
  $('#groupAddHabit').addEventListener('click', () => openDlg('pickDialog'));
  $('#pickNew').addEventListener('click', () => {
    closeDlg('pickDialog');
    openHabitForm(null, { onSaved: id => { gf.draft.habitIds.push(id); renderGroupHabits(); renderHl(); } });
  });
  $('#pickExisting').addEventListener('click', () => { closeDlg('pickDialog'); openImport(); });
  $('#groupDelete').addEventListener('click', () => {
    if (!confirm('이 그룹을 삭제할까요? 안에 있던 습관은 그대로 남아요.')) return;
    state.groups = state.groups.filter(g => g.id !== gf.id);
    persist('groups'); closeDlg('groupDialog'); renderHome(); toast('그룹을 삭제했어요');
  });
}
const importSel = new Set();
function openImport() {
  importSel.clear();
  const list = state.habits.filter(h => !gf.draft.habitIds.includes(h.id));
  $('#importList').innerHTML = list.length ? list.map(h => {
    const g = groupOf(h.id);
    return `<button class="pick" data-id="${h.id}"><span class="nm">${esc(hEmoji(h) + ' ' + h.title)}${g ? `<br><span class="sub">지금: ${esc(g.name)} 그룹</span>` : ''}</span><span class="ck">✓</span></button>`;
  }).join('') : '<p class="muted small">가져올 습관이 없어요. 새로 만들어 보세요.</p>';
  openDlg('importDialog');
}
function bindImport() {
  $('#importList').addEventListener('click', e => {
    const b = e.target.closest('.pick'); if (!b) return;
    const id = b.dataset.id;
    importSel.has(id) ? importSel.delete(id) : importSel.add(id);
    b.classList.toggle('on', importSel.has(id));
  });
  $('#importDone').addEventListener('click', () => {
    importSel.forEach(id => gf.draft.habitIds.push(id));
    closeDlg('importDialog'); renderGroupHabits(); renderHl();
  });
}

/* =========================================================
   태그 (색상 포함)
   ========================================================= */
const tg = { mode: 'select', editId: null, color: 'green' };
function openTagDialog(mode) {
  tg.mode = mode; tg.editId = null; tg.color = TAG_COLORS[state.tags.length % TAG_COLORS.length];
  $('#tagName').value = '';
  renderTagDialog();
  openDlg('tagDialog');
}
function renderTagDialog() {
  $('#tagEditLabel').textContent = tg.editId ? '태그 수정' : '새 태그';
  $('#tagSave').textContent = tg.editId ? '수정' : '추가';
  $('#tagPal').innerHTML = TAG_COLORS.map(c => `<button type="button" data-c="${c}" class="${c === tg.color ? 'sel' : ''}" style="--hlc:var(--t-${c})" aria-label="${c}">${c === tg.color ? '✓' : ''}</button>`).join('');
  $('#tagListLabel').textContent = tg.mode === 'select' ? '눌러서 선택 · ✎ 로 이름/색 수정' : '✎ 로 이름/색 수정';
  $('#tagList').innerHTML = state.tags.length ? state.tags.map(t => {
    const used = state.habits.filter(h => (h.tags || []).includes(t.id)).length;
    const on = tg.mode === 'select' && hf.tags.includes(t.id);
    return `<div class="pick ${on ? 'on' : ''}" data-id="${t.id}"><span class="sw" style="--tc:var(--t-${t.color})"></span><span class="nm">${esc(t.name)} <span class="sub">${used}개</span></span>
      <button class="mini" data-edit="${t.id}" aria-label="수정">✎</button><button class="mini" data-del="${t.id}" aria-label="삭제">🗑</button>${tg.mode === 'select' ? '<span class="ck">✓</span>' : ''}</div>`;
  }).join('') : '<p class="muted small">아직 태그가 없어요. 위에서 만들어 보세요.</p>';
}
function bindTags() {
  $('#tagPal').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { tg.color = b.dataset.c; renderTagDialog(); } });
  $('#tagSave').addEventListener('click', () => {
    const name = $('#tagName').value.trim().replace(/^#/, '');
    if (!name) { toast('태그 이름을 입력해 주세요'); return; }
    if (tg.editId) Object.assign(tagById(tg.editId), { name, color: tg.color });
    else {
      if (state.tags.some(t => t.name === name)) { toast('이미 있는 태그예요'); return; }
      const t = { id: uid(), name, color: tg.color };
      state.tags.push(t);
      if (tg.mode === 'select') hf.tags.push(t.id);
    }
    persist('tags');
    tg.editId = null; $('#tagName').value = ''; tg.color = TAG_COLORS[state.tags.length % TAG_COLORS.length];
    renderTagDialog(); if ($('#habitDialog').open) renderHabitFormParts(); renderHome();
  });
  $('#tagList').addEventListener('click', e => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (ed) { const t = tagById(ed.dataset.edit); tg.editId = t.id; tg.color = t.color; $('#tagName').value = t.name; renderTagDialog(); $('#tagName').focus(); return; }
    if (del) {
      if (!confirm('이 태그를 삭제할까요? 습관에서도 빠져요.')) return;
      const id = del.dataset.del;
      state.tags = state.tags.filter(t => t.id !== id);
      state.habits.forEach(h => { h.tags = (h.tags || []).filter(x => x !== id); });
      hf.tags = hf.tags.filter(x => x !== id);
      persist('tags', 'habits'); renderTagDialog(); if ($('#habitDialog').open) renderHabitFormParts(); renderHome(); return;
    }
    const row = e.target.closest('.pick');
    if (row && tg.mode === 'select') {
      const id = row.dataset.id;
      hf.tags = hf.tags.includes(id) ? hf.tags.filter(x => x !== id) : [...hf.tags, id];
      renderTagDialog(); renderHabitFormParts();
    }
  });
}

/* =========================================================
   타이머 (습관 하나 또는 그룹 순서대로)
   ========================================================= */
const tm = { steps: [], idx: 0, running: false, endAt: 0, left: 0, total: 0, tick: null, date: null, audio: null };
function startTimer(ids, title = '') {
  tm.steps = ids.map(habitById).filter(Boolean).map(h => ({ id: h.id, sec: h.timer?.on ? h.timer.minutes * 60 : null }));
  if (!tm.steps.length) return;
  tm.idx = 0; tm.date = state.selDate; tm.title = title;
  loadStep(false);
  $('#timerView').hidden = false;
  clearInterval(tm.tick);
  tm.tick = setInterval(timerTick, 250);
}
function loadStep(autoPlay) {
  const s = tm.steps[tm.idx];
  tm.total = (s.sec || 0) * 1000; tm.left = tm.total; tm.running = false;
  if (autoPlay && s.sec) playTimer();
  renderTimer();
}
function playTimer() {
  const s = tm.steps[tm.idx];
  if (!s.sec) return;
  if (!tm.audio) { try { tm.audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* 소리 없이 */ } }
  if (tm.left === tm.total) addStamp(tm.date, s.id, 'start');
  tm.endAt = Date.now() + tm.left; tm.running = true;
  renderTimer();
}
function pauseTimer() { tm.left = Math.max(0, tm.endAt - Date.now()); tm.running = false; renderTimer(); }
function beep() {
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  const a = tm.audio; if (!a) return;
  [0, .35].forEach(d => {
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.value = 880; g.gain.value = .15;
    o.connect(g); g.connect(a.destination);
    o.start(a.currentTime + d); o.stop(a.currentTime + d + .2);
  });
}
function completeStep() {
  const s = tm.steps[tm.idx];
  const wasRunning = tm.running;
  if (!isDone(tm.date, s.id)) setStatus(tm.date, s.id, 'done');
  tm.idx++;
  if (tm.idx >= tm.steps.length) { closeTimer(); toast('다 했어요! 수고했어요 🐙'); renderHome(); return; }
  loadStep(wasRunning);
  renderHome();
}
function timerTick() {
  if (!tm.running) return;
  tm.left = Math.max(0, tm.endAt - Date.now());
  if (tm.left <= 0) { tm.running = false; beep(); completeStep(); return; }
  renderTimer(true);
}
function fmtMS(ms) { const s = Math.ceil(ms / 1000); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; }
function renderTimer(onlyTime) {
  const s = tm.steps[tm.idx], h = habitById(s.id);
  $('#tRing').style.setProperty('--p', s.sec ? `${(1 - tm.left / tm.total) * 100}%` : '0%');
  $('#tTime').textContent = s.sec ? fmtMS(tm.left) : '—';
  if (onlyTime) return;
  $('#tTitle').textContent = `${tm.title || h.title}${tm.steps.length > 1 ? ` · ${tm.idx + 1}/${tm.steps.length}` : ''}`;
  $('#tSteps').innerHTML = tm.steps.length > 1 ? tm.steps.map((_, i) => `<i class="${i <= tm.idx ? 'f' : ''}"></i>`).join('') : '';
  $('#tEmo').textContent = hEmoji(h);
  $('#tName').textContent = h.title;
  $('#tSub').textContent = s.sec ? `${s.sec / 60}분 중` : '타이머 없이 체크해요';
  $('#tPlay').textContent = tm.running ? '❚❚' : '▶';
  $('#tPlay').style.visibility = s.sec ? 'visible' : 'hidden';
  $('#tReset').style.visibility = s.sec ? 'visible' : 'hidden';
  const nx = tm.steps[tm.idx + 1] && habitById(tm.steps[tm.idx + 1].id);
  $('#tNext').innerHTML = nx ? `<span class="muted">다음</span><b>${esc(hEmoji(nx) + ' ' + nx.title)}${nx.timer?.on ? ' · ' + nx.timer.minutes + '분' : ''}</b>` : '';
}
function closeTimer() { clearInterval(tm.tick); tm.running = false; $('#timerView').hidden = true; }
function bindTimer() {
  $('#tPlay').addEventListener('click', () => tm.running ? pauseTimer() : playTimer());
  $('#tReset').addEventListener('click', () => { tm.left = tm.total; tm.running = false; renderTimer(); });
  $('#tDone').addEventListener('click', completeStep);
  $('#tClose').addEventListener('click', () => {
    if (tm.running && !confirm('타이머를 멈추고 닫을까요?')) return;
    closeTimer(); renderHome();
  });
}

/* =========================================================
   통계 (태그별 · 습관별 집계)
   ========================================================= */
function renderStats() {
  if (!state.statMonth) { const n = new Date(); state.statMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
  const m = state.statMonth, y = m.getFullYear(), mo = m.getMonth();
  const from = toKey(new Date(y, mo, 1)), to = toKey(new Date(y, mo + 1, 0));
  const t = todayKey();
  $('#statMonth').textContent = `${y}년 ${mo + 1}월`;
  const all = rangeRate(state.habits, from, to);
  const pct = x => Math.round(x * 100);
  const body = $('#statsBody');
  if (!state.habits.length) {
    body.innerHTML = `<div class="empty-state">${octSVG('happy', 5)}<strong>아직 습관이 없어요</strong>습관을 만들고 체크하면 여기에서 모아 볼 수 있어요.</div>`;
    return;
  }
  // 달력
  const lead = (new Date(y, mo, 1).getDay() + 6) % 7;
  let cal = ['월', '화', '수', '목', '금', '토', '일'].map(d => `<div>${d}</div>`).join('') + '<div></div>'.repeat(lead);
  for (let d = 1, k = from; k <= to; d++, k = addDaysKey(k, 1)) {
    const s = dayStats(k);
    let lv = '';
    if (k <= t && s.total) { const r = s.done / s.total; lv = r === 1 ? 'l4' : r >= .66 ? 'l3' : r >= .33 ? 'l2' : r > 0 ? 'l1' : 'l0'; }
    cal += `<div class="d ${lv} ${k === t ? 'tdy' : ''}">${d}</div>`;
  }
  // 태그별
  const tagRows = state.tags.map(tag => {
    const list = state.habits.filter(h => (h.tags || []).includes(tag.id));
    const r = rangeRate(list, from, to);
    return `<div class="prow"><span class="pn" style="--tc:var(--t-${tag.color})"><i></i>${esc(tag.name)}</span><div class="bar" style="--bc:var(--t-${tag.color})"><div style="width:${pct(r.rate)}%"></div></div><span class="pv">${r.done}/${r.due} · ${pct(r.rate)}%</span></div>`;
  }).join('');
  const habitRows = [...state.habits].map(h => ({ h, r: rangeRate([h], from, to), st: habitStreak(h) }))
    .sort((a, b) => b.r.rate - a.r.rate || b.st - a.st)
    .map(({ h, r, st }) => `<div class="prow"><span class="pn">${esc(hEmoji(h) + ' ' + h.title)}</span><div class="bar"><div style="width:${pct(r.rate)}%"></div></div><span class="pv">${st ? '🔥' + st + ' ' : ''}${pct(r.rate)}%</span></div>`).join('');
  const msg = !all.due ? '이 달에는 기록이 없어요.' : all.rate >= .8 ? `이번 달 ${pct(all.rate)}% 달성! 최고예요` : all.rate >= .5 ? `${pct(all.rate)}% 달성 중이에요. 잘하고 있어요!` : `${pct(all.rate)}% 달성. 작은 것부터 다시 시작해 봐요!`;
  body.innerHTML = `
    <div class="cheer" style="margin:0 0 12px">${octSVG(all.rate >= .8 ? 'cheer' : 'happy', 3.4)}<div class="bub">${msg}</div></div>
    <div class="stat-cards">
      <div class="stat fire">연속 달성<b>🔥 ${overallStreak()}일</b></div>
      <div class="stat">최고 기록<b>${overallBest()}일</b></div>
      <div class="stat">이 달 달성률<b>${pct(all.rate)}%</b></div>
    </div>
    <div class="box"><div class="cal">${cal}</div>
      <div class="legend">못 함 <i style="background:var(--miss-soft)"></i> 조금 <i style="background:color-mix(in srgb,var(--accent) 25%,var(--bg))"></i><i style="background:color-mix(in srgb,var(--accent) 50%,var(--bg))"></i><i style="background:color-mix(in srgb,var(--accent) 75%,var(--bg))"></i><i style="background:var(--accent)"></i> 다 함</div></div>
    <div class="box"><div class="box-title">🏷️ 태그별 달성률</div>${tagRows || '<p class="muted small" style="margin:0">습관에 태그를 달면 여기에서 한 번에 모아 볼 수 있어요.</p>'}</div>
    <div class="box"><div class="box-title">✅ 습관별 달성률</div>${habitRows}</div>`;
}
