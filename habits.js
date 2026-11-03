'use strict';
/* =========================================================
   습관: 기록 계산 · 홈 표 · 상세 · 편집 · 그룹 · 태그 · 타이머 · 통계
   ========================================================= */
const habitById = id => state.habits.find(h => h.id === id);
const groupById = id => state.groups.find(g => g.id === id);
const tagById = id => state.tags.find(t => t.id === id);
const groupOf = hid => state.groups.find(g => g.habitIds.includes(hid));
const hEmoji = h => h.emoji || '✅';
const tagInner = t => `${t.emoji ? `<span class="te">${t.emoji}</span>` : '<i></i>'}${esc(t.name)}`;
const minTime = t => t || '99:99';
// 습관 색: 직접 고른 색 (없으면 기본 초록)
const habitColorVar = h => h.color ? `var(--t-${h.color})` : 'var(--accent)';

/* ---------- 반복 주기 ---------- */
function isDue(h, k) {
  if (k < h.start) return false;
  if (h.archived && k >= h.archived) return false;
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
  $('#todayBtn').classList.toggle('dim', state.selDate === todayKey());
  const st = dayStats(todayKey());
  const h = new Date().getHours();
  const kind = st.total && st.done === st.total ? 'cheer' : (h >= 22 || h < 5) ? 'sleep' : 'happy';
  $('#octHead').innerHTML = mascot(kind, 2);
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
    `<button class="f ${state.ui.tagFilter === t.id ? 'on' : ''}" data-tag="${t.id}" style="--tc:var(--t-${t.color})">${tagInner(t)}</button>`).join('');
}

// 보관한 습관은 보관한 날 이후로 보이지 않음 (그 전 날짜를 보면 기록이 남아 있음)
const activeOn = (h, k) => !h.archived || h.archived > k;
function visibleHabits(from = state.selDate) {
  const tf = state.ui.tagFilter;
  return state.habits.filter(h => activeOn(h, from) && (!tf || (h.tags || []).includes(tf)));
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
    el.innerHTML = `<div class="empty-state">${mascot('happy', 5)}<strong>첫 습관을 만들어 볼까요?</strong>오른쪽 아래 ＋ 버튼을 눌러 습관이나 그룹을 추가해요.</div>`;
    return;
  }
  if (!list.length) {
    el.innerHTML = `<div class="empty-state">${mascot('sleep', 5)}<strong>${state.ui.tagFilter ? '이 태그의 습관이 없는 날이에요' : k === todayKey() ? '오늘은 쉬는 날이에요' : '이 날은 할 습관이 없어요'}</strong>${k < todayKey() ? '습관은 만든 날부터 기록돼요.' : '해야 할 습관이 없어요.'}</div>`;
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
        <div class="cell m" data-act="edit-group" data-id="${g.id}"><span class="nm">${esc((g.emoji ? g.emoji + ' ' : '') + g.name)}</span>${doneAll ? mascot('cheer', 1.5) : ''}</div>
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
  const list = visibleHabits(days[0]);
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
  el.innerHTML = `<div class="cheer">${mascot(kind, 3.4)}<div class="bub">${msg}</div></div>`;
}

function renderHabits() {
  renderTagFilters();
  if (state.ui.range === 'week') renderHabitsWeek(); else renderHabitsDay();
  $('#cheer').innerHTML = '';
}

/* =========================================================
   습관 상세
   ========================================================= */
let detailId = null, detailMonth = null, trendSel = null;
function openDetail(id) {
  detailId = id;
  const d = parseKey(state.selDate);
  detailMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  trendSel = null;
  renderDetail();
  openDlg('detailDialog');
}
// 습관을 시작한 날 (예전 버전에서 옮겨 온 습관은 첫 기록 날짜)
function habitFirstDay(h) {
  if (h.start > '2000-01-01') return h.start;
  const ks = Object.keys(state.records).filter(k => state.records[k][h.id]).sort();
  return ks[0] || toKey(new Date(h.created || Date.now()));
}
const fmtLong = k => { const d = parseKey(k); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };

// 주간 달성률 추이 (최근 8주)
function weeklyTrend(h) {
  const first = habitFirstDay(h), t = todayKey();
  const thisWeek = toKey(startOfWeek(new Date()));
  const pts = [];
  for (let i = 7; i >= 0; i--) {
    const ws = addDaysKey(thisWeek, -7 * i), we = addDaysKey(ws, 6);
    if (we < first) continue;
    // 오늘은 아직 체크하지 않았으면 빼고 계산 (주 중간에 갑자기 떨어지지 않게)
    const end = we < t ? we : (getRec(t, h.id)?.s ? t : addDaysKey(t, -1));
    const r = end < (ws < first ? first : ws) ? { due: 0, done: 0, rate: 0 } : rangeRate([h], ws < first ? first : ws, end);
    pts.push({ ws, due: r.due, done: r.done, v: r.due ? r.rate : null });
  }
  return pts;
}
function trendSVG(pts) {
  const W = 320, Hh = 150, L = 34, R = 14, T = 14, B = 26;
  const iw = W - L - R, ih = Hh - T - B;
  const x = i => L + (pts.length === 1 ? iw / 2 : i * iw / (pts.length - 1));
  const y = v => T + ih * (1 - v);
  let g = '';
  [0, .5, 1].forEach(v => {
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="tg-grid"/><text x="${L - 6}" y="${y(v) + 3.5}" class="tg-ax" text-anchor="end">${v * 100}%</text>`;
  });
  // 선: 값이 없는 주는 끊어서 그림
  let path = '', pen = false;
  pts.forEach((p, i) => { if (p.v === null) { pen = false; return; } path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)} `; pen = true; });
  const lastI = pts.map(p => p.v !== null).lastIndexOf(true);
  const sel = trendSel ?? lastI;
  let dots = '', hits = '', labels = '';
  pts.forEach((p, i) => {
    const d = parseKey(p.ws);
    labels += `<text x="${x(i)}" y="${Hh - 8}" class="tg-ax" text-anchor="middle">${d.getMonth() + 1}/${d.getDate()}</text>`;
    if (p.v === null) return;
    dots += `<circle cx="${x(i)}" cy="${y(p.v)}" r="${i === sel ? 5 : 4}" class="tg-dot ${i === sel ? 'on' : ''}"/>`;
    hits += `<circle cx="${x(i)}" cy="${y(p.v)}" r="16" class="tg-hit" data-d="trend" data-i="${i}"/>`;
  });
  const lv = pts[lastI];
  const lastLabel = lv ? `<text x="${Math.min(x(lastI) + 2, W - R)}" y="${y(lv.v) - 10}" class="tg-val" text-anchor="end">${Math.round(lv.v * 100)}%</text>` : '';
  const selLine = pts[sel] ? `<line x1="${x(sel)}" x2="${x(sel)}" y1="${T}" y2="${T + ih}" class="tg-cross"/>` : '';
  return `<svg viewBox="0 0 ${W} ${Hh}" class="trend" role="img" aria-label="주간 달성률 추이">${g}${selLine}<path d="${path}" class="tg-line"/>${dots}${lastLabel}${labels}${hits}</svg>`;
}
function renderDetail() {
  const h = habitById(detailId);
  if (!h) { closeDlg('detailDialog'); return; }
  const k = state.selDate, t = todayKey();
  const rec = getRec(k, h.id);
  const first = habitFirstDay(h);
  // 달력
  const y = detailMonth.getFullYear(), mo = detailMonth.getMonth();
  const cal = monthCells(y, mo, (kk, d) => {
    const r = getRec(kk, h.id), due = isDue(h, kk);
    let inner = '', cls = due ? '' : 'off';
    if (r?.s === 'done') { cls = 'done'; inner = `<span class="ce">${hEmoji(h)}</span>${r.t ? `<span class="ct">${r.t}</span>` : ''}`; }
    else if (r?.s === 'fail') { cls = 'fail'; inner = '<span class="ce">❌</span>'; }
    return `<button class="dc ${cls} ${kk === t ? 'tdy' : ''}" data-d="day" data-k="${kk}"><span class="cn">${d}</span>${inner}</button>`;
  });
  const mr = rangeRate([h], toKey(new Date(y, mo, 1)), toKey(new Date(y, mo + 1, 0)));
  // 추이
  const pts = weeklyTrend(h);
  const valid = pts.filter(p => p.v !== null);
  const sel = pts[trendSel ?? pts.map(p => p.v !== null).lastIndexOf(true)];
  const selText = sel ? `${parseKey(sel.ws).getMonth() + 1}월 ${parseKey(sel.ws).getDate()}일 주 · ${sel.done}/${sel.due}번 · <b>${Math.round(sel.v * 100)}%</b>` : '';
  let btns;
  if (rec?.s === 'done') btns = `<button class="btn" data-d="undo">완료 취소</button>`;
  else if (h.timer?.on) btns = `<button class="btn" data-d="done">✓ 완료</button><button class="btn primary" data-d="timer">▶ 타이머 시작</button>`;
  else btns = `<button class="btn" data-d="fail">❌ 못 함</button><button class="btn primary" data-d="done">✓ 완료하고 시간 찍기</button>`;
  $('#detailBody').innerHTML = `
    <div class="nav"><button class="nav-btn" data-close>‹ 닫기</button><b>습관</b><button class="nav-btn primary-text" data-d="edit">편집</button></div>
    <div class="form-body d-body">
      <section class="d-top">
        <div class="d-title"><span class="d-emo">${hEmoji(h)}</span><h2>${esc(h.title)}</h2></div>
        <p class="d-since">${fmtLong(first)}부터 시작했어요</p>
      </section>
      <hr class="d-div" />
      <section>
        <div class="cal-hdr"><b>${y}년 ${mo + 1}월</b><span class="muted small">${mr.done}/${mr.due}번</span><span class="spacer"></span>
          <button class="icon-btn" data-d="mprev" aria-label="이전 달">◀</button><button class="icon-btn" data-d="mnext" aria-label="다음 달">▶</button></div>
        <div class="dcal">${cal}</div>
      </section>
      <hr class="d-div" />
      <section>
        <div class="cal-hdr"><b>주간 달성률 추이</b><span class="spacer"></span><span class="muted small">🔥 연속 ${habitStreak(h)}일 · 최고 ${habitBest(h, first)}일</span></div>
        ${valid.length >= 2 ? `${trendSVG(pts)}<p class="tg-read">${selText}</p>` : `<p class="muted small center" style="padding:18px 0">기록이 2주 이상 쌓이면 그래프가 그려져요.${sel ? `<br>이번 주 ${sel.done}/${sel.due}번` : ''}</p>`}
      </section>
    </div>
    <div class="d-btns">${btns}</div>`;
}
function onDetailClick(e) {
  if (e.target.closest('[data-close]')) { closeDlg('detailDialog'); return; }
  const b = e.target.closest('[data-d]'); if (!b) return;
  const h = habitById(detailId), k = state.selDate;
  switch (b.dataset.d) {
    case 'edit': closeDlg('detailDialog'); openHabitForm(h.id); return;
    case 'tags': openTagDialog('select', { get: () => h.tags || [], set: v => { h.tags = v; persist('habits'); renderDetail(); renderHome(); } }); return;
    case 'mprev': detailMonth = new Date(detailMonth.getFullYear(), detailMonth.getMonth() - 1, 1); renderDetail(); return;
    case 'mnext': detailMonth = new Date(detailMonth.getFullYear(), detailMonth.getMonth() + 1, 1); renderDetail(); return;
    case 'trend': trendSel = Number(b.dataset.i); renderDetail(); return;
    case 'day': if (getRec(b.dataset.k, h.id)?.s) openTimeEdit(h.id, b.dataset.k); return;
    case 'done': setStatus(k, h.id, 'done'); toast('완료! 잘했어요'); break;
    case 'fail': setStatus(k, h.id, 'fail'); break;
    case 'undo': setStatus(k, h.id, null); break;
    case 'timer': closeDlg('detailDialog'); startTimer([h.id]); return;
  }
  renderDetail(); renderHome();
}

/* =========================================================
   습관 추가/편집
   ========================================================= */
const hf = { id: null, repeat: null, minutes: 10, tags: [], color: null, onSaved: null };
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
  hf.color = h?.color || null;
  f.emoji.value = h?.emoji || '';
  f.title.value = h?.title || '';
  f.time.value = h?.time || '';
  f.cue.value = h?.cue || '';
  f.alarm.checked = !!h?.alarm;
  f.timerOn.checked = !!h?.timer?.on;
  f.memo.value = h?.memo || '';
  $('#habitFormTitle').textContent = h ? '습관 편집' : '습관 추가하기';
  $('#habitDelete').hidden = !h;
  $('#habitArchive').hidden = !h;
  $('#archiveHint').hidden = !h;
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
  $('#habitTags').innerHTML = hf.tags.map(tagById).filter(Boolean).map(t => `<span class="tag" style="--tc:var(--t-${t.color})">${tagInner(t)}</span>`).join('') +
    '<button type="button" class="tag add" id="habitTagAdd">＋ 태그 달기</button>';
  $('#colorOn').checked = !!hf.color;
  $('#colorBox').hidden = !hf.color;
  $('#habitColorPal').innerHTML = TAG_COLORS.map(c => `<button type="button" data-hc="${c}" class="${c === hf.color ? 'sel' : ''}" style="--hlc:var(--t-${c})" aria-label="${c}"></button>`).join('');
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
    timer: { on: f.timerOn.checked, minutes: hf.minutes }, tags: hf.tags, color: hf.color, memo: f.memo.value.trim(),
  };
  let h;
  if (hf.id) { h = habitById(hf.id); Object.assign(h, data); }
  else { h = newHabit(data); state.habits.push(h); }
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
  $('#habitArchive').addEventListener('click', () => {
    const h = habitById(hf.id); if (!h) return;
    if (!confirm('이 습관을 보관할까요? 오늘부터 목록에서 사라지고, 기록은 남아요.')) return;
    h.archived = todayKey();
    persist('habits'); closeDlg('habitDialog'); renderHome(); toast('보관했어요 · 내정보에서 다시 꺼낼 수 있어요');
  });
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
  $('#habitTags').addEventListener('click', () => openTagDialog('select', { get: () => hf.tags, set: v => { hf.tags = v; renderHabitFormParts(); } }));
  $('#habitColorPal').addEventListener('click', e => { const b = e.target.closest('[data-hc]'); if (b) { hf.color = b.dataset.hc; renderHabitFormParts(); } });
  $('#colorOn').addEventListener('change', e => { hf.color = e.target.checked ? (hf.color || TAG_COLORS[0]) : null; renderHabitFormParts(); });
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
  const list = state.habits.filter(h => !h.archived && !gf.draft.habitIds.includes(h.id));
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
const tg = { mode: 'select', editId: null, color: 'green', get: () => [], set: () => {} };
function openTagDialog(mode, target) {
  tg.mode = mode; tg.editId = null;
  if (target) { tg.get = target.get; tg.set = target.set; } tg.color = TAG_COLORS[state.tags.length % TAG_COLORS.length];
  $('#tagName').value = ''; $('#tagEmoji').value = '';
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
    const on = tg.mode === 'select' && tg.get().includes(t.id);
    return `<div class="pick ${on ? 'on' : ''}" data-id="${t.id}"><span class="sw" style="--tc:var(--t-${t.color})">${t.emoji || ''}</span><span class="nm">${esc(t.name)} <span class="sub">${used}개</span></span>
      <button class="mini" data-edit="${t.id}" aria-label="수정">✎</button><button class="mini" data-del="${t.id}" aria-label="삭제">🗑</button>${tg.mode === 'select' ? '<span class="ck">✓</span>' : ''}</div>`;
  }).join('') : '<p class="muted small">아직 태그가 없어요. 위에서 만들어 보세요.</p>';
}
function bindTags() {
  $('#tagPal').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { tg.color = b.dataset.c; renderTagDialog(); } });
  $('#tagSave').addEventListener('click', () => {
    const name = $('#tagName').value.trim().replace(/^#/, '');
    const emoji = $('#tagEmoji').value.trim();
    if (!name) { toast('태그 이름을 입력해 주세요'); return; }
    if (tg.editId) Object.assign(tagById(tg.editId), { name, emoji, color: tg.color });
    else {
      if (state.tags.some(t => t.name === name)) { toast('이미 있는 태그예요'); return; }
      const t = { id: uid(), name, emoji, color: tg.color };
      state.tags.push(t);
      if (tg.mode === 'select') tg.set([...tg.get(), t.id]);
    }
    persist('tags');
    tg.editId = null; $('#tagName').value = ''; $('#tagEmoji').value = ''; tg.color = TAG_COLORS[state.tags.length % TAG_COLORS.length];
    renderTagDialog(); if ($('#habitDialog').open) renderHabitFormParts(); renderHome();
  });
  $('#tagList').addEventListener('click', e => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (ed) { const t = tagById(ed.dataset.edit); tg.editId = t.id; tg.color = t.color; $('#tagName').value = t.name; $('#tagEmoji').value = t.emoji || ''; renderTagDialog(); $('#tagName').focus(); return; }
    if (del) {
      if (!confirm('이 태그를 삭제할까요? 습관에서도 빠져요.')) return;
      const id = del.dataset.del;
      state.tags = state.tags.filter(t => t.id !== id);
      state.habits.forEach(h => { h.tags = (h.tags || []).filter(x => x !== id); });
      hf.tags = hf.tags.filter(x => x !== id);
      if (tg.mode === 'select') tg.set(tg.get().filter(x => x !== id));
      persist('tags', 'habits'); renderTagDialog(); if ($('#habitDialog').open) renderHabitFormParts(); renderHome(); return;
    }
    const row = e.target.closest('.pick');
    if (row && tg.mode === 'select') {
      const id = row.dataset.id;
      const cur = tg.get();
      tg.set(cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
      renderTagDialog(); renderHome();
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
  if (tm.idx >= tm.steps.length) { closeTimer(); toast('다 했어요! 수고했어요 🐴'); renderHome(); return; }
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
   신호등 (하루 결과 색) · 지난 기간 달력
   ========================================================= */
function lightOf(k) {
  const s = dayStats(k);
  if (!s.total || k > todayKey()) return '';
  if (s.done === s.total) return 'g';
  if (s.done > 0) return 'y';
  return k < todayKey() || s.fail ? 'r' : '';
}
function monthCells(y, mo, fn) {
  const lead = (new Date(y, mo, 1).getDay() + 6) % 7;
  let html = ['월', '화', '수', '목', '금', '토', '일'].map(d => `<div class="dh">${d}</div>`).join('') + '<div></div>'.repeat(lead);
  const last = new Date(y, mo + 1, 0).getDate();
  for (let d = 1; d <= last; d++) html += fn(toKey(new Date(y, mo, d)), d);
  return html;
}
let calMonth = null;
function openCal() {
  const d = parseKey(state.selDate);
  calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  renderCal();
  openDlg('calDialog');
}
function moveCal(dir) { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + dir, 1); renderCal(); }
function renderCal() {
  const y = calMonth.getFullYear(), mo = calMonth.getMonth(), t = todayKey();
  $('#calLabel').textContent = `${y}년 ${mo + 1}월`;
  $('#calGrid').innerHTML = monthCells(y, mo, (k, d) => {
    const dow = parseKey(k).getDay();
    return `<button class="${k === state.selDate ? 'sel' : ''} ${k === t ? 'now' : ''} ${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''}" data-date="${k}">${d}</button>`;
  });
}

/* =========================================================
   통계: 월간 · 주간 · 초록불
   ========================================================= */
const st = { tab: 'month', month: null, week: null, tag: null };
function statHabits(from) { return state.habits.filter(h => (!h.archived || h.archived > from) && (!st.tag || (h.tags || []).includes(st.tag))); }
function statMove(dir) {
  if (st.tab === 'week') st.week = addDaysKey(st.week, 7 * dir);
  else st.month = new Date(st.month.getFullYear(), st.month.getMonth() + dir, 1);
  renderStats();
}
function renderStats() {
  if (!st.month) { const n = new Date(); st.month = new Date(n.getFullYear(), n.getMonth(), 1); }
  if (!st.week) st.week = toKey(startOfWeek(new Date()));
  if (st.tag && !tagById(st.tag)) st.tag = null;
  $$('#statTabs button').forEach(b => b.classList.toggle('on', b.dataset.st === st.tab));
  const y = st.month.getFullYear(), mo = st.month.getMonth();
  if (st.tab === 'week') {
    const we = addDaysKey(st.week, 6), a = parseKey(st.week), b = parseKey(we);
    $('#statLabel').textContent = `${a.getMonth() + 1}월 ${a.getDate()}일 - ${b.getMonth() + 1}월 ${b.getDate()}일`;
  } else $('#statLabel').textContent = `${y}년 ${mo + 1}월`;
  $('#statTags').hidden = st.tab === 'light' || !state.tags.length;
  $('#statTags').innerHTML = state.tags.map(t => `<button class="f ${st.tag === t.id ? 'on' : ''}" data-tag="${t.id}" style="--tc:var(--t-${t.color})">${tagInner(t)}</button>`).join('');
  const body = $('#statsBody');
  if (!state.habits.length) {
    body.innerHTML = `<div class="empty-state">${mascot('happy', 5)}<strong>아직 습관이 없어요</strong>습관을 만들고 체크하면 여기에서 모아 볼 수 있어요.</div>`;
    return;
  }
  if (st.tab === 'month') body.innerHTML = statMonthHTML(y, mo);
  else if (st.tab === 'week') body.innerHTML = statWeekHTML();
  else body.innerHTML = statLightHTML(y, mo);
}
const pct = x => Math.round(x * 100);
function statMonthHTML(y, mo) {
  const from = toKey(new Date(y, mo, 1)), to = toKey(new Date(y, mo + 1, 0)), t = todayKey();
  const list = statHabits(from);
  if (!list.length) return '<p class="muted small center">이 태그가 달린 습관이 없어요.</p>';
  return '<div class="hgrid">' + list.map(h => {
    const r = rangeRate([h], from, to);
    const cells = monthCells(y, mo, (k, d) => {
      const rec = getRec(k, h.id);
      let cls = isDue(h, k) ? '' : 'off';
      if (rec?.s === 'done') cls = 'on'; else if (rec?.s === 'fail') cls = 'no';
      return `<div class="mc ${cls} ${k === t ? 'tdy' : ''}">${d}</div>`;
    });
    return `<div class="hcard" style="--hc:${habitColorVar(h)}"><div class="ht">${esc(hEmoji(h) + ' ' + h.title)}</div>
      <div class="mcal">${cells}</div>
      <div class="hf"><span><small>달성</small> ${pct(r.rate)}%</span><i></i><span><small>✓</small> ${r.done}회</span></div></div>`;
  }).join('') + '</div>';
}
function statWeekHTML() {
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(st.week, i)), t = todayKey();
  const list = statHabits(days[0]);
  let done = 0, fail = 0, green = 0;
  days.forEach(k => { if (lightOf(k) === 'g') green++; });
  const rows = list.map(h => {
    const cells = days.map(k => {
      const rec = getRec(k, h.id);
      if (rec?.s === 'done') { done++; return '<i class="on"></i>'; }
      if (rec?.s === 'fail') { fail++; return '<i class="no"></i>'; }
      return `<i class="${isDue(h, k) ? '' : 'off'} ${k === t ? 'tdy' : ''}"></i>`;
    }).join('');
    return `<div class="wr" style="--hc:${habitColorVar(h)}"><span class="wn">${esc(hEmoji(h) + ' ' + h.title)}</span><span class="wcs">${cells}</span></div>`;
  }).join('');
  return `<div class="box wbox"><div class="wr wh"><span class="wn"></span><span class="wcs">${days.map(k => `<b class="${k === t ? 'tdy' : ''}">${DOW[parseKey(k).getDay()]}</b>`).join('')}</span></div>${rows || '<p class="muted small">이 태그가 달린 습관이 없어요.</p>'}</div>
    <div class="box trio"><div><b>${done}</b>달성</div><div><b>${fail}</b>못 함</div><div><b>${green}</b>초록불</div></div>`;
}
function statLightHTML(y, mo) {
  const from = toKey(new Date(y, mo, 1)), to = toKey(new Date(y, mo + 1, 0)), t = todayKey();
  let any = 0, green = 0, dueDays = 0;
  for (let k = from; k <= to && k <= t; k = addDaysKey(k, 1)) {
    const s = dayStats(k);
    if (s.total) dueDays++;
    if (s.done) any++;
    if (s.total && s.done === s.total) green++;
  }
  const rate = dueDays ? green / dueDays : 0;
  const tagRows = state.tags.map(tag => {
    const r = rangeRate(state.habits.filter(h => (h.tags || []).includes(tag.id)), from, to);
    return `<div class="prow"><span class="pn" style="--tc:var(--t-${tag.color})">${tagInner(tag)}</span><div class="bar" style="--bc:var(--t-${tag.color})"><div style="width:${pct(r.rate)}%"></div></div><span class="pv">${pct(r.rate)}%</span></div>`;
  }).join('');
  const msg = green ? `이번 달 초록불 ${green}번! 잘하고 있어요` : '하루 습관을 다 하면 초록불이 켜져요';
  return `
    <div class="cheer" style="margin:0 0 12px">${mascot(rate >= .6 ? 'cheer' : 'happy', 3.4)}<div class="bub">${msg}</div></div>
    <div class="box trio"><div><span class="muted small">✓ 습관 한 날</span><b>${any}<small>일</small></b></div><div><span class="muted small">🟢 초록불</span><b>${green}<small>회</small></b></div><div><span class="muted small">🔥 연속</span><b>${overallStreak()}<small>일</small></b></div></div>
    <div class="box"><div class="box-title">월간 신호등 캘린더<span class="muted small">${y}년 ${mo + 1}월</span></div>
      <div class="lights">${monthCells(y, mo, (k, d) => `<div class="lt ${lightOf(k)} ${k === t ? 'tdy' : ''}">${d}</div>`)}</div>
      <div class="legend2"><span><i class="g"></i>다 함</span><span><i class="y"></i>조금</span><span><i class="r"></i>못 함</span></div></div>
    <div class="box"><div class="box-title">이번 달 초록불 달성률<b>${pct(rate)}%</b></div>
      <div class="gbar"><div style="width:${pct(rate)}%"></div><i style="left:20%"></i><i style="left:40%"></i><i style="left:60%"></i><i style="left:80%"></i></div>
      <div class="gticks"><span style="left:20%">20</span><span style="left:40%">40</span><span style="left:60%">60</span><span style="left:80%">80</span></div></div>
    <div class="box"><div class="box-title">🏷️ 태그별 달성률</div>${tagRows || '<p class="muted small" style="margin:0">습관에 태그를 달면 여기에서 한 번에 모아 볼 수 있어요.</p>'}</div>`;
}

/* =========================================================
   보관한 습관
   ========================================================= */
function renderArchive() {
  const list = state.habits.filter(h => h.archived);
  $('#archiveList').innerHTML = list.length ? list.map(h => `<div class="pick"><span class="nm">${esc(hEmoji(h) + ' ' + h.title)}<br><span class="sub">${fmtShort(h.archived)} 보관 · 🔥최고 ${habitBest(h, earliestKey() || h.start)}일</span></span>
    <button class="btn sm-btn" data-unarchive="${h.id}">꺼내기</button><button class="mini" data-del="${h.id}" aria-label="삭제">🗑</button></div>`).join('')
    : '<p class="muted small">보관한 습관이 없어요.</p>';
}
function bindArchive() {
  $('#archiveBtn').addEventListener('click', () => { renderArchive(); openDlg('archiveDialog'); });
  $('#archiveList').addEventListener('click', e => {
    const un = e.target.closest('[data-unarchive]'), del = e.target.closest('[data-del]');
    if (un) { delete habitById(un.dataset.unarchive).archived; persist('habits'); toast('다시 꺼냈어요'); }
    else if (del) { hf.id = del.dataset.del; deleteHabit(); }
    else return;
    renderArchive(); renderMe(); renderHome();
  });
}

/* =========================================================
   완료 시간 수정 (결과 칸 길게 누르기)
   ========================================================= */
const te = { id: null, k: null, s: 'done' };
function openTimeEdit(id, k) {
  const h = habitById(id), r = getRec(k, id);
  if (!r?.s) { toast('먼저 눌러서 체크한 다음, 길게 누르면 수정할 수 있어요'); return; }
  te.id = id; te.k = k; te.s = r.s;
  $('#timeTitle').textContent = `${hEmoji(h)} ${h.title}`;
  $('#timeSub').textContent = k === todayKey() ? '오늘 기록' : `${fmtShort(k)} 기록`;
  $('#timeInput').value = r.t || '';
  renderTimeEdit();
  openDlg('timeDialog');
  if (navigator.vibrate) navigator.vibrate(15);
}
function renderTimeEdit() {
  $$('#timeSeg button').forEach(b => b.classList.toggle('on', b.dataset.s === te.s));
  $('#timeInput').disabled = te.s !== 'done';
  $('label[for=timeInput]').style.opacity = te.s === 'done' ? 1 : .4;
}
function bindTimeEdit() {
  $('#timeSeg').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) { te.s = b.dataset.s; renderTimeEdit(); } });
  $('#timeSave').addEventListener('click', () => {
    const r = ensureRec(te.k, te.id);
    r.s = te.s;
    r.t = te.s === 'done' ? ($('#timeInput').value || null) : null;
    r.stamps = (r.stamps || []).filter(x => x.k !== 'done' && x.k !== 'fail');
    if (r.t) r.stamps.push({ t: r.t, k: 'done' });
    r.stamps.sort((a, b) => a.t.localeCompare(b.t));
    persist('records'); closeDlg('timeDialog'); renderHome(); if ($('#detailDialog').open) renderDetail(); toast('수정했어요');
  });
  $('#timeClear').addEventListener('click', () => { setStatus(te.k, te.id, null); closeDlg('timeDialog'); renderHome(); if ($('#detailDialog').open) renderDetail(); toast('기록을 지웠어요'); });
}
