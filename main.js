'use strict';
/* =========================================================
   화면 전환 · 이벤트 연결 · 시작
   ========================================================= */
function renderHome() {
  renderHeader();
  renderWeek();
  const p = state.ui.pane;
  $$('#homeTabs button').forEach(b => b.classList.toggle('on', b.dataset.pane === p));
  $('#habitsPane').hidden = p !== 'habits';
  $('#tasksPane').hidden = p !== 'tasks';
  if (p === 'habits') renderHabits(); else renderTasks();
}
function renderAll() {
  renderHome();
  if (state.ui.view === 'stats') renderStats();
  if (state.ui.view === 'me') renderMe();
}
function setView(v) {
  state.ui.view = v; persist('ui');
  $('#homeView').hidden = v !== 'home';
  $('#statsView').hidden = v !== 'stats';
  $('#meView').hidden = v !== 'me';
  $('#fab').hidden = v !== 'home';
  $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  closeFab();
  if (v === 'home') renderHome();
  if (v === 'stats') renderStats();
  if (v === 'me') renderMe();
  window.scrollTo(0, 0);
}
function openFab() { $('#fab').classList.add('open'); $('#fabMenu').hidden = false; $('#fabDim').hidden = false; }
function closeFab() { $('#fab').classList.remove('open'); $('#fabMenu').hidden = true; $('#fabDim').hidden = true; }
function selectDate(k) { state.selDate = k; renderHome(); }

function bindHome() {
  $$('.tabbar button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  $$('#homeTabs button').forEach(b => b.addEventListener('click', () => { state.ui.pane = b.dataset.pane; persist('ui'); renderHome(); }));

  // 날짜
  $('#weekStrip').addEventListener('click', e => { const b = e.target.closest('[data-date]'); if (b) selectDate(b.dataset.date); });
  let sx = null;
  $('#weekStrip').addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  $('#weekStrip').addEventListener('touchend', e => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 50) selectDate(addDaysKey(state.selDate, dx < 0 ? 7 : -7));
  });
  $('#datePick').addEventListener('change', e => { if (e.target.value) selectDate(e.target.value); });
  $('#todayBtn').addEventListener('click', () => selectDate(todayKey()));

  // 보기 옵션
  $('#sortBtn').addEventListener('click', () => {
    state.ui.sort = state.ui.sort === 'group' ? 'time' : 'group'; persist('ui');
    if (state.ui.pane !== 'habits') { state.ui.pane = 'habits'; }
    renderHome(); toast(state.ui.sort === 'group' ? '그룹별로 보기' : '시간순으로 보기');
  });
  $('#rangeBtn').addEventListener('click', () => { state.ui.range = state.ui.range === 'day' ? 'week' : 'day'; persist('ui'); renderHabits(); });
  $('#tagFilters').addEventListener('click', e => {
    const b = e.target.closest('[data-tag]'); if (!b) return;
    state.ui.tagFilter = state.ui.tagFilter === b.dataset.tag ? null : b.dataset.tag; persist('ui'); renderHabits();
  });

  // 습관 표
  $('#habitTable').addEventListener('click', e => {
    const wc = e.target.closest('.wc[data-date]');
    if (wc) { cycleStatus(wc.dataset.date, wc.dataset.id); renderHome(); return; }
    const el = e.target.closest('[data-act]'); if (!el) return;
    const id = el.dataset.id, k = state.selDate;
    switch (el.dataset.act) {
      case 'fold': state.ui.collapsed[id] = !state.ui.collapsed[id]; persist('ui'); renderHabits(); break;
      case 'edit-group': openGroupForm(id); break;
      case 'detail': openDetail(id); break;
      case 'group-run': {
        const g = groupById(id);
        const ids = g.habitIds.map(habitById).filter(h => h && isDue(h, k) && !isDone(k, h.id) && (!state.ui.tagFilter || (h.tags || []).includes(state.ui.tagFilter))).map(h => h.id);
        if (g.timer && ids.length) startTimer(ids, g.name);
        else { state.ui.collapsed[id] = !state.ui.collapsed[id]; persist('ui'); renderHabits(); }
        break;
      }
      case 'result': {
        const h = habitById(id);
        if (h.timer?.on && !getRec(k, id)?.s) { startTimer([id]); break; }
        const s = cycleStatus(k, id);
        renderHome();
        if (s === 'done') {
          const st = dayStats(k);
          if (k === todayKey() && st.done === st.total) toast('오늘 습관 다 했어요! 🎉');
        }
        break;
      }
    }
  });

  // ＋ 버튼
  $('#fab').addEventListener('click', () => {
    if (state.ui.pane === 'tasks') { openTaskForm(); return; }
    $('#fabMenu').hidden ? openFab() : closeFab();
  });
  $('#fabDim').addEventListener('click', closeFab);
  $('#addHabitBtn').addEventListener('click', () => { closeFab(); openHabitForm(); });
  $('#addGroupBtn').addEventListener('click', () => { closeFab(); openGroupForm(); });

  // 통계 / 내정보
  $('#statPrev').addEventListener('click', () => { const m = state.statMonth; state.statMonth = new Date(m.getFullYear(), m.getMonth() - 1, 1); renderStats(); });
  $('#statNext').addEventListener('click', () => { const m = state.statMonth; state.statMonth = new Date(m.getFullYear(), m.getMonth() + 1, 1); renderStats(); });
  $('#manageTagsBtn').addEventListener('click', () => openTagDialog('manage'));

  // 다이얼로그 공통: 닫기 버튼, 바깥(배경) 누르면 닫기
  $$('dialog').forEach(dlg => {
    dlg.addEventListener('click', e => {
      if (dlg.id === 'detailDialog') return;
      if (e.target.closest('[data-close]') || e.target === dlg) dlg.close();
    });
  });
  $('#detailDialog').addEventListener('click', onDetailClick);
  $('#detailDialog').addEventListener('close', () => { detailId = null; });
  $('#tagDialog').addEventListener('close', () => { if (state.ui.view === 'me') renderMe(); });

  // 다시 앱으로 돌아오면 날짜 갱신
  let lastDay = todayKey();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = todayKey();
    if (now !== lastDay) { if (state.selDate === lastDay) state.selDate = now; lastDay = now; }
    renderAll();
  });
}

/* ---------- PWA ---------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; $('#installBtn').hidden = false; });
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

/* ---------- 시작 ---------- */
applyTheme();
bindTasks();
bindMe();
bindHabitForm();
bindGroupForm();
bindImport();
bindTags();
bindTimer();
bindHome();
setView(state.ui.view || 'home');
