import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

const $ = selector => document.querySelector(selector);
const authScreen = $('#authScreen');
const protectedApp = $('#protectedApp');
const authMessage = $('#authMessage');
const configured = /^https:\/\/.+\.supabase\.co$/.test(SUPABASE_URL) && SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_') && !SUPABASE_PUBLISHABLE_KEY.includes('REPLACE_ME');
if (!configured) {
  authScreen.classList.remove('hidden');
  authMessage.textContent = 'supabase-config.js에 프로젝트 URL과 publishable key를 입력해 주세요.';
} else {
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const input = $('#memoInput');
  const list = $('#notesList');
  const trashIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let notes = [];
  let currentUser = null;
  let notesState = 'idle';
  function announce(message) { const live = $('#announcement'); live.textContent = ''; requestAnimationFrame(() => { live.textContent = message; }); }
  function escapeHTML(value) { const el = document.createElement('span'); el.textContent = value; return el.innerHTML; }
  function formatDate(iso) { const date = new Date(iso); if (Number.isNaN(date.getTime())) return ''; return new Intl.DateTimeFormat('ko-KR', { month:'long', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false }).format(date); }
  function render() {
    const query = $('#searchInput').value.trim().toLocaleLowerCase('ko-KR');
    const visible = notes.filter(note => note.text.toLocaleLowerCase('ko-KR').includes(query));
    $('#totalCount').textContent = `${notes.length}개`;
    if (notesState === 'loading' || notesState === 'error') {
      const title = notesState === 'loading' ? '메모를 불러오는 중이에요.' : '메모를 불러오지 못했어요.';
      const detail = notesState === 'loading' ? '잠시만 기다려 주세요.' : '연결과 로그인 권한을 확인한 뒤 다시 시도해 주세요.';
      list.innerHTML = `<div class="empty"><strong>${title}</strong><span>${detail}</span></div>`;
      return;
    }
    if (!visible.length) {
      const searching = Boolean(query);
      list.innerHTML = `<div class="empty"><span class="empty-icon">✎</span><strong>${searching ? '검색 결과가 없어요.' : '아직 메모가 없어요.'}</strong><span>${searching ? '다른 단어로 검색해 보세요.' : '위에 첫 번째 한 줄을 남겨보세요.'}</span></div>`;
      return;
    }
    list.innerHTML = visible.map(note => `<article class="note" data-id="${escapeHTML(note.id)}"><p class="note-text">${escapeHTML(note.text)}</p><div class="note-meta"><time datetime="${escapeHTML(note.createdAt)}">${escapeHTML(formatDate(note.createdAt))}</time><button class="delete" type="button" aria-label="메모 삭제: ${escapeHTML(note.text)}">${trashIcon}</button></div></article>`).join('');
  }
  async function loadNotes() {
    notesState = 'loading';
    notes = [];
    render();
    const { data, error } = await supabase.from('notes').select('id, text, created_at').order('created_at', { ascending: false });
    if (error) {
      notesState = 'error';
      render();
      announce(error.code === '42501' ? '메모를 볼 권한이 없어요. 계정 권한을 확인해 주세요.' : '메모를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      return;
    }
    notes = (data || []).map(note => ({ id: note.id, text: note.text, createdAt: note.created_at }));
    notesState = 'ready';
    render();
  }
  async function setSession(session) {
    const nextUser = session?.user || null;
    if (currentUser?.id !== nextUser?.id) {
      notes = [];
      notesState = 'idle';
    }
    currentUser = nextUser;
    const appRoute = location.hash === '#/app';
    authScreen.classList.toggle('hidden', Boolean(currentUser && appRoute));
    protectedApp.classList.toggle('hidden', !(currentUser && appRoute));
    if (currentUser && appRoute) await loadNotes();
    if (!currentUser && location.hash !== '#/login') location.hash = '/login';
    if (currentUser && location.hash !== '#/app') location.hash = '/app';
  }
  $('#authForm').addEventListener('submit', async event => {
    event.preventDefault(); authMessage.textContent = '로그인 중입니다…';
    const { error } = await supabase.auth.signInWithPassword({ email: $('#authEmail').value, password: $('#authPassword').value });
    authMessage.textContent = error ? error.message : '로그인되었습니다.';
  });
  $('#signUpButton').addEventListener('click', async () => {
    authMessage.textContent = '회원가입 중입니다…';
    const { data, error } = await supabase.auth.signUp({
      email: $('#authEmail').value.trim(),
      password: $('#authPassword').value,
      options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` }
    });
    authMessage.textContent = error ? error.message : data.session ? '가입되었습니다.' : '이메일 인증 링크를 확인한 뒤 로그인해 주세요.';
  });
  $('#signOutButton').addEventListener('click', async () => { const { error } = await supabase.auth.signOut(); if (error) announce(`로그아웃하지 못했어요: ${error.message}`); });
  $('#memoForm').addEventListener('submit', async event => {
    event.preventDefault(); const text = input.value.trim(); if (!text) { input.focus(); return; }
    const { data, error } = await supabase.from('notes').insert({ user_id: currentUser.id, text }).select('id, text, created_at').single();
    if (error) { announce(`저장하지 못했어요: ${error.message}`); return; }
    notes.unshift({ id: data.id, text: data.text, createdAt: data.created_at }); input.value = ''; $('#charCount').textContent = '0 / 140'; $('#searchInput').value = ''; render(); input.focus(); announce('메모를 추가했어요.');
  });
  input.addEventListener('input', () => { $('#charCount').textContent = `${input.value.length} / 140`; });
  $('#searchInput').addEventListener('input', render);
  list.addEventListener('click', async event => {
    const button = event.target.closest('.delete'); if (!button) return;
    const note = button.closest('[data-id]'); const { error } = await supabase.from('notes').delete().eq('id', note.dataset.id);
    if (error) { announce(`삭제하지 못했어요: ${error.message}`); return; }
    notes = notes.filter(item => item.id !== note.dataset.id); render(); announce('메모를 삭제했어요.');
  });
  $('#clearAll').addEventListener('click', async () => {
    if (!notes.length) return; const { error } = await supabase.from('notes').delete().eq('user_id', currentUser.id);
    if (error) { announce(`삭제하지 못했어요: ${error.message}`); return; }
    notes = []; render(); announce('모든 메모를 지웠어요.');
  });
  const now = new Date(); $('#todayDate').textContent = new Intl.DateTimeFormat('ko-KR', { year:'numeric', month:'long', day:'numeric', weekday:'long' }).format(now); $('#todayDate').dateTime = now.toISOString().slice(0, 10);
  window.addEventListener('hashchange', async () => { const { data } = await supabase.auth.getSession(); await setSession(data.session); });
  supabase.auth.onAuthStateChange((_event, session) => { void setSession(session); });
  supabase.auth.getSession().then(({ data }) => setSession(data.session));
}
