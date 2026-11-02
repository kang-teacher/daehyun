import { neisBytes, sanitize, maskedTotal, ruleCheck, endingCheck } from './core.js';
import { GEN_TYPES, TYPE_LABEL, KEYWORDS, CHECK_AREAS, FAQ } from './data.js';

// ───────────────────────── 유틸 ─────────────────────────
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = $('#view');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
  toast('복사했어요');
}

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('saegim.' + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('saegim.' + key, JSON.stringify(value)); } catch { /* 저장 공간이 없으면 무시 */ }
  }
};

const settings = Object.assign({
  schoolLevel: '고등학교', students: [], extraWords: [], password: '', fast: false
}, store.get('settings', {}));
const saveSettings = () => store.set('settings', settings);

let records = store.get('records', []);
const saveRecords = () => store.set('records', records);

const styles = Object.assign({ enabled: true, examples: ['', '', ''] }, store.get('styles', {}));
const saveStyles = () => store.set('styles', styles);

let server = { hasKey: true, passwordRequired: false, model: '', fastModel: '' };

function bytesMeter(bytes, target) {
  const over = target && bytes > target;
  const pct = target ? Math.min(100, (bytes / target) * 100) : 0;
  return `<div class="meter ${over ? 'over' : ''}">
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="txt"><span>나이스 기준 <b>${bytes.toLocaleString()}</b>${target ? ' / ' + target.toLocaleString() : ''} 바이트</span>
    <span>${over ? (bytes - target).toLocaleString() + '바이트 초과' : '한글 약 ' + Math.round(bytes / 3).toLocaleString() + '자'}</span></div>
  </div>`;
}

function spinBtn(btn, on, label) {
  if (!btn) return;
  if (on) {
    btn.dataset.label = btn.innerHTML;
    btn.innerHTML = `<span class="spin"></span>${label || '처리 중'}`;
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.label || btn.innerHTML;
    btn.disabled = false;
  }
}

// ───────────────────────── 개인정보 가림 ─────────────────────────
/**
 * 요청 객체의 모든 문자열을 가린다. 명단의 이름은 브라우저에만 있고 서버로 가지 않는다.
 * @param {object} body
 * @param {string[]} extraNames 이번 요청에만 쓰는 이름 (기록 표시용 이름, 업로드한 명단 등)
 */
function maskPayload(body, extraNames = []) {
  const names = [...settings.students, ...extraNames].map((s) => String(s).trim()).filter((s) => s.length >= 2);
  const counts = {};
  const add = (c) => Object.entries(c).forEach(([k, v]) => { counts[k] = (counts[k] || 0) + v; });
  const walk = (v) => {
    if (typeof v === 'string') { const r = sanitize(v, names, settings.extraWords); add(r.counts); return r.text; }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { body: walk(body), counts };
}

function maskSummary(counts) {
  const n = maskedTotal(counts);
  if (!n) return '가린 개인정보 없음';
  return '가린 항목: ' + Object.entries(counts).filter(([, v]) => v).map(([k, v]) => `${k} ${v}건`).join(', ');
}

async function api(task, body) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-password': settings.password || '' },
    body: JSON.stringify({ task, schoolLevel: settings.schoolLevel, ...body })
  });
  let data = {};
  try { data = await res.json(); } catch { /* 빈 응답 */ }
  if (!res.ok) throw new Error(data.error || `서버 오류 (${res.status})`);
  return data;
}

// ───────────────────────── 라우터 ─────────────────────────
const routes = {
  home: renderHome, generate: renderGenerate, check: renderCheck, chat: renderChat,
  records: renderRecords, style: renderStyle, settings: renderSettings
};

function route() {
  const name = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'home';
  const fn = routes[name] || renderHome;
  $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.route === name));
  closeSidebar();
  fn();
  window.scrollTo(0, 0);
  const title = { home: '', generate: 'AI 생기부 생성', check: 'AI 생기부 검사기', chat: 'AI 채팅', records: '내 생기부 기록', style: '내 스타일', settings: '설정' }[name];
  document.title = (title ? title + ' · ' : '') + '새김 · AI 생기부 도우미';
}

function closeSidebar() { $('#sidebar').classList.remove('open'); $('#backdrop').classList.remove('show'); }
$('#menuBtn').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#backdrop').classList.add('show'); });
$('#backdrop').addEventListener('click', closeSidebar);
window.addEventListener('hashchange', route);

function pageHead(title, desc) {
  return `<div class="page-head"><h1>${title}</h1>${desc ? `<p>${desc}</p>` : ''}</div>`;
}

function serverBanner() {
  if (!server.hasKey) return '<div class="banner warn">서버에 Claude API 키가 아직 설정되지 않았습니다. README의 배포 안내에 따라 <b>ANTHROPIC_API_KEY</b> 환경변수를 추가해 주세요.</div>';
  if (server.passwordRequired && !settings.password) return '<div class="banner info">이 사이트는 접속 비밀번호가 필요합니다. <a href="#/settings"><b>설정</b></a>에서 비밀번호를 입력해 주세요.</div>';
  return '';
}

// ───────────────────────── 홈 ─────────────────────────
function renderHome() {
  view.innerHTML = `
  <section class="hero">
    <span class="eyebrow">선생님 전용 AI 생기부 도우미</span>
    <h1>관찰 기록만 넣으면<br>생기부 초안이 바로 나옵니다</h1>
    <p>키워드를 고르고 활동 내용을 적으면 나이스 바이트에 맞춘 문장을 만들어 드려요. 다 쓴 문장은 검사기로 기재요령 위반까지 점검하세요.</p>
    <div class="actions">
      <a class="btn primary lg" href="#/generate">생기부 만들기 시작</a>
      <a class="btn ghost lg" href="#/check">생기부 검사하기</a>
    </div>
    <div class="hero-stats">
      <div><b>6가지</b><span>행특 · 세특 · 자율 · 동아리 · 진로 · 비슷한 문장</span></div>
      <div><b>학급 단위</b><span>엑셀 한 번으로 다중 생성</span></div>
      <div><b>0건</b><span>AI로 보내는 학생 이름</span></div>
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>생기부 작업, 한곳에서 끝내세요</h2><p>작성부터 점검, 기록 관리까지 필요한 기능을 모았습니다.</p></div>
    <div class="grid3">
      ${[
        ['✎', 'AI 생기부 생성', '행동특성, 교과세특, 창체 영역을 키워드와 관찰 기록으로 바로 작성합니다.', '#/generate'],
        ['▦', '다중 생성', '학생별 기록이 담긴 엑셀을 올리면 학급 전체 문장을 한 번에 만들고 엑셀로 내려받습니다.', '#/generate?multi'],
        ['✓', 'AI 생기부 검사기', '대학명, 대회명, 상호명, 영문, 비교 표현 등 기재요령 위반을 찾아 수정안을 제시합니다.', '#/check'],
        ['↻', '비슷한 문장', '같은 의미를 다른 표현으로 바꿔 여러 학생의 문장이 겹치지 않게 합니다.', '#/generate?similar'],
        ['✦', '내 스타일', '선생님이 평소 쓰는 문장을 등록하면 그 문체를 따라 작성합니다.', '#/style'],
        ['✉', 'AI 채팅', '수업 설계, 평가 기준, 학급 운영까지 업무 고민을 물어보세요.', '#/chat']
      ].map(([i, t, d, href]) => `<a class="card feature" href="${href}"><div class="icon">${i}</div><h3>${t}</h3><p>${d}</p><span class="more">바로 가기 →</span></a>`).join('')}
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>이렇게 바뀝니다</h2><p>고른 키워드와 짧은 메모가 기재요령에 맞는 문장이 됩니다.</p></div>
    <div class="demo">
      <div class="card">
        <div class="label">입력 · 행동특성</div>
        <div class="chips">
          <span class="chip on good">배려심 깊음</span><span class="chip on good">경청을 잘함</span>
          <span class="chip on good">책임감 있음</span><span class="chip on improve">발표를 부담스러워함</span>
        </div>
        <p class="note" style="margin-top:12px">메모: 모둠 활동에서 친구 의견을 끝까지 듣고 정리함.</p>
      </div>
      <div class="arrow">→</div>
      <div class="card">
        <div class="label">결과 예시 <span class="byte-pill">402 / 1500</span></div>
        <p>모둠 활동에서 친구의 의견을 끝까지 경청하고 핵심을 정리하여 모둠의 결론을 이끌어 내는 등 배려심과 책임감이 돋보임. 발표에 대한 부담을 느끼면서도 짧은 발표를 차근차근 준비하며 자신감을 키워 가는 모습이 보임.</p>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>사용 방법</h2></div>
    <div class="how">
      <div class="card"><h4>종류 고르기</h4><p>행특, 세특, 창체 중 작성할 영역을 고릅니다.</p></div>
      <div class="card"><h4>재료 넣기</h4><p>키워드를 클릭하고 관찰·활동 내용을 적습니다.</p></div>
      <div class="card"><h4>생성·수정</h4><p>바이트를 확인하며 문장을 다듬습니다.</p></div>
      <div class="card"><h4>검사·저장</h4><p>검사기로 점검하고 복사하거나 엑셀로 받습니다.</p></div>
    </div>
  </section>

  <section class="section">
    <div class="privacy-box">
      <div>
        <h2>학생 개인정보는 AI로 보내지 않습니다</h2>
        <p>생기부 재료만 AI에 전송합니다. 이름과 번호는 선생님 브라우저 안에서만 쓰입니다.</p>
      </div>
      <ul>
        <li><b>이름 자동 가림</b> · 설정에 등록한 명단의 이름이 기록에 섞여 있으면 "학생"으로 바꿔 보냅니다.</li>
        <li><b>패턴 가림</b> · 연락처, 이메일, 주민번호, "2학년 3반 5번" 같은 표기도 가립니다.</li>
        <li><b>미리보기</b> · 실제로 전송되는 글을 생성 전에 확인할 수 있습니다.</li>
        <li><b>서버 저장 없음</b> · 기록은 선생님 브라우저에만 저장됩니다.</li>
      </ul>
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>자주 묻는 질문</h2></div>
    <div class="card faq">${FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>
  </section>

  <section class="section card cta-band">
    <h2>오늘 쓸 생기부, 지금 시작해 보세요</h2>
    <p>회원가입 없이 바로 쓸 수 있습니다.</p>
    <a class="btn primary lg" href="#/generate">생기부 만들기</a>
  </section>`;
}

// ───────────────────────── 생성 ─────────────────────────
const gen = {
  mode: 'single',
  type: 'behavior',
  targets: Object.fromEntries(GEN_TYPES.map((t) => [t.id, t.bytes])),
  fields: { count: 3 },
  label: '',
  picked: {},            // word -> 'good' | 'improve'
  custom: { good: [], improve: [] },
  catTab: Object.keys(KEYWORDS)[0],
  result: null,
  variants: null,
  error: ''
};

const multi = {
  type: 'subject', target: 1500, common: { subject: '', standard: '', request: '' },
  headers: [], rows: [], nameCol: -1, fileName: '', running: false, stop: false
};

function renderGenerate() {
  const q = location.hash.split('?')[1];
  if (q === 'multi') gen.mode = 'multi';
  if (q === 'similar') { gen.mode = 'single'; gen.type = 'similar'; }
  if (q) history.replaceState(null, '', '#/generate');

  view.innerHTML = `
    ${pageHead('AI 생기부 생성', '키워드와 관찰 기록을 넣으면 나이스 바이트에 맞춘 생기부 문장을 만들어 드려요.')}
    ${serverBanner()}
    <div class="toolbar">
      <div class="seg" id="modeSeg">
        <button data-mode="single" class="${gen.mode === 'single' ? 'on' : ''}">단일 생성</button>
        <button data-mode="multi" class="${gen.mode === 'multi' ? 'on' : ''}">다중 생성</button>
      </div>
      <label class="switch" title="빠른 모델로 생성합니다">
        <input type="checkbox" id="fastToggle" ${settings.fast ? 'checked' : ''}><span class="track"></span>빠른 모드
      </label>
    </div>
    <div id="genBody"></div>`;

  $$('#modeSeg button').forEach((b) => b.addEventListener('click', () => {
    gen.mode = b.dataset.mode;
    $$('#modeSeg button').forEach((x) => x.classList.toggle('on', x === b));
    renderGenBody();
  }));
  $('#fastToggle').addEventListener('change', (e) => { settings.fast = e.target.checked; saveSettings(); });
  renderGenBody();
}

function renderGenBody() {
  if (gen.mode === 'multi') return renderMulti();
  const body = $('#genBody');
  body.innerHTML = `
    <div class="tabs" id="typeTabs">
      ${GEN_TYPES.map((t) => `<button data-type="${t.id}" class="${gen.type === t.id ? 'on' : ''}">${t.label}</button>`).join('')}
    </div>
    <div class="grid2">
      <div class="card" id="formCard"></div>
      <div class="card sticky" id="resultCard"></div>
    </div>`;
  $$('#typeTabs button').forEach((b) => b.addEventListener('click', () => {
    gen.type = b.dataset.type;
    gen.result = null; gen.variants = null; gen.error = '';
    $$('#typeTabs button').forEach((x) => x.classList.toggle('on', x === b));
    renderForm(); renderResult();
  }));
  renderForm();
  renderResult();
}

function fieldHtml(name, label, ph, opts = {}) {
  const v = gen.fields[name] ?? '';
  const hint = opts.hint ? `<span class="hint">${opts.hint}</span>` : '';
  const input = opts.area
    ? `<textarea data-f="${name}" rows="${opts.rows || 4}" placeholder="${esc(ph)}">${esc(v)}</textarea>`
    : `<input type="text" data-f="${name}" value="${esc(v)}" placeholder="${esc(ph)}">`;
  return `<div class="field"><label>${label}${hint}</label>${input}</div>`;
}

function levelSeg() {
  const v = gen.fields.level || '';
  return `<div class="field"><label>성취수준 <span class="hint">수준에 따라 서술 깊이가 달라져요</span></label>
    <div class="seg sm" id="levelSeg">${['', '상', '중', '하'].map((l) => `<button data-v="${l}" class="${v === l ? 'on' : ''}">${l || '선택 안 함'}</button>`).join('')}</div></div>`;
}

function keywordBlock() {
  const cats = Object.keys(KEYWORDS);
  const countIn = (cat) => Object.keys(gen.picked).filter((w) => KEYWORDS[cat].good.includes(w) || KEYWORDS[cat].improve.includes(w)).length;
  const c = KEYWORDS[gen.catTab];
  const chip = (w, kind) => `<button class="chip ${kind} ${gen.picked[w] ? 'on' : ''}" data-kw="${esc(w)}" data-kind="${kind}">${esc(w)}</button>`;
  return `<div class="field"><label>특성 키워드 <span class="hint">클릭해서 고르세요. 파란색은 강점, 주황색은 보완점</span></label>
    <div class="cat-tabs">${cats.map((k) => { const n = countIn(k); return `<button data-cat="${k}" class="${gen.catTab === k ? 'on' : ''}">${k}${n ? `<span class="cnt">${n}</span>` : ''}</button>`; }).join('')}</div>
    <div class="chip-sub">강점</div><div class="chips">${c.good.map((w) => chip(w, 'good')).join('')}</div>
    <div class="chip-sub">보완점</div><div class="chips">${c.improve.map((w) => chip(w, 'improve')).join('')}</div>
    <div class="add-kw">
      <input type="text" id="kwInput" placeholder="직접 키워드 추가 (예: 식물 기르기를 좋아함)">
      <select id="kwKind"><option value="good">강점</option><option value="improve">보완</option></select>
      <button class="btn sm" id="kwAdd">추가</button>
    </div>
    <div class="picked" id="picked">${Object.entries(gen.picked).map(([w, k]) => `<button class="chip on ${k}" data-unpick="${esc(w)}">${esc(w)}<span class="x">✕</span></button>`).join('')}</div>
  </div>`;
}

function renderForm() {
  const card = $('#formCard');
  const t = gen.type;
  const typeInfo = GEN_TYPES.find((x) => x.id === t);
  let html = `<div class="card-title">${typeInfo.full}</div>`;

  if (t !== 'similar') {
    const target = gen.targets[t];
    html += `<div class="row">
      <div class="field"><label>학생 표시 <span class="hint">기록 저장용 · AI로 보내지 않아요</span></label>
        <input type="text" id="genLabel" value="${esc(gen.label)}" placeholder="예: 3번 또는 이름"></div>
    </div>
    <div class="field"><label>목표 바이트 <span class="hint">나이스 기준</span></label>
      <div class="range-row"><input type="range" id="targetRange" min="100" max="3000" step="50" value="${target}">
      <input type="number" id="targetNum" min="100" max="4000" step="50" value="${target}"></div></div>`;
  }

  if (t === 'behavior') {
    html += keywordBlock();
    html += fieldHtml('notes', '관찰 기록·누가기록', '예: 모둠 활동에서 친구의 의견을 끝까지 듣고 정리함. 발표는 부담스러워하지만 준비를 꼼꼼히 함.', { area: true, rows: 5, hint: '구체적일수록 좋아요' });
  } else if (t === 'subject') {
    html += `<div class="row">${fieldHtml('subject', '과목', '예: 통합과학')}<div style="flex:1"></div></div>`;
    html += fieldHtml('standard', '성취기준·평가요소', '예: [10통과01-02] 자연의 기본량을 이해하고 측정 표준의 중요성을 설명할 수 있다.', { area: true, rows: 3, hint: '평가계획서에서 복사해 붙여 넣으세요' });
    html += levelSeg();
    html += fieldHtml('notes', '학생 활동 내용', '예: 측정 단위의 역사를 조사해 발표함. 질문에 근거를 들어 답변함. 보고서에 실험 오차 원인을 분석함.', { area: true, rows: 5 });
    html += `<div class="row">${fieldHtml('career', '희망 진로·학과', '예: 기계공학')}${fieldHtml('strengths', '강점', '예: 논리적 설명')}</div>`;
    html += fieldHtml('weaknesses', '보완점', '예: 실험 기록이 간략함');
  } else if (t === 'autonomy' || t === 'club') {
    html += `<div class="row">${fieldHtml('activity', t === 'club' ? '동아리 성격·주제' : '활동명', t === 'club' ? '예: 환경 탐구 동아리' : '예: 학급 자치 회의')}${fieldHtml('role', '맡은 역할', '예: 회의 진행자')}</div>`;
    html += fieldHtml('notes', '활동 내용', '예: 학급 규칙 개정 회의를 진행하며 친구들의 의견을 모아 정리함.', { area: true, rows: 5 });
    if (t === 'club') html += fieldHtml('career', '희망 진로 (선택)', '예: 환경공학');
  } else if (t === 'career') {
    html += fieldHtml('career', '희망 진로·학과', '예: 간호사');
    html += fieldHtml('notes', '진로 활동 내용', '예: 직업인 인터뷰 활동에서 질문지를 만들어 발표함. 진로 포트폴리오를 정리함.', { area: true, rows: 5 });
    html += fieldHtml('strengths', '드러난 역량·변화', '예: 진로에 대한 이해가 구체화됨');
  } else if (t === 'similar') {
    html += fieldHtml('text', '바꿔 쓸 문장', '이미 쓴 생기부 문장을 붙여 넣으세요.', { area: true, rows: 6 });
    html += `<div class="field"><label>만들 개수</label><div class="seg sm" id="countSeg">${[2, 3, 4, 5].map((n) => `<button data-v="${n}" class="${Number(gen.fields.count) === n ? 'on' : ''}">${n}개</button>`).join('')}</div></div>`;
  }

  html += fieldHtml('request', 'AI에게 원하는 방향 (선택)', '예: 담백하게, 탐구 과정 → 근거 → 역량 흐름으로');
  if (t !== 'similar' && styles.enabled && styles.examples.some((s) => s.trim())) {
    html += '<p class="note">✦ 내 스타일이 적용됩니다. <a href="#/style" style="text-decoration:underline">바꾸기</a></p>';
  }
  html += `<div class="actions">
      <button class="btn ghost" id="btnPreview">보낼 내용 미리보기</button>
      <button class="btn primary" id="btnGen" style="flex:1">${t === 'similar' ? '비슷한 문장 만들기' : '생성하기'}</button>
    </div>
    <details class="sent hidden" id="previewBox"><summary>AI로 보낼 내용</summary><div class="mask-info" id="previewMask"></div><pre id="previewText"></pre></details>`;
  card.innerHTML = html;

  $$('[data-f]', card).forEach((el) => el.addEventListener('input', () => { gen.fields[el.dataset.f] = el.value; }));
  $('#genLabel')?.addEventListener('input', (e) => { gen.label = e.target.value; });
  const syncTarget = (v) => {
    const n = Math.min(Math.max(parseInt(v, 10) || 100, 100), 4000);
    gen.targets[t] = n;
    $('#targetRange').value = n; $('#targetNum').value = n;
    if (gen.result) updateResultMeter();
  };
  $('#targetRange')?.addEventListener('input', (e) => syncTarget(e.target.value));
  $('#targetNum')?.addEventListener('change', (e) => syncTarget(e.target.value));
  $$('#levelSeg button').forEach((b) => b.addEventListener('click', () => { gen.fields.level = b.dataset.v; renderForm(); }));
  $$('#countSeg button').forEach((b) => b.addEventListener('click', () => { gen.fields.count = Number(b.dataset.v); renderForm(); }));
  $$('.cat-tabs button', card).forEach((b) => b.addEventListener('click', () => { gen.catTab = b.dataset.cat; renderForm(); }));
  $$('[data-kw]', card).forEach((b) => b.addEventListener('click', () => {
    const w = b.dataset.kw;
    if (gen.picked[w]) delete gen.picked[w]; else gen.picked[w] = b.dataset.kind;
    renderForm();
  }));
  $$('[data-unpick]', card).forEach((b) => b.addEventListener('click', () => { delete gen.picked[b.dataset.unpick]; renderForm(); }));
  $('#kwAdd')?.addEventListener('click', () => {
    const w = $('#kwInput').value.trim();
    if (!w) return;
    gen.picked[w] = $('#kwKind').value;
    renderForm();
  });
  $('#kwInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#kwAdd').click(); } });
  $('#btnPreview').addEventListener('click', showPreview);
  $('#btnGen').addEventListener('click', runGenerate);
}

function buildGenBody() {
  const f = gen.fields;
  const t = gen.type;
  if (t === 'similar') return { text: f.text || '', count: f.count || 3, request: f.request || '', fast: settings.fast };
  const good = Object.entries(gen.picked).filter(([, k]) => k === 'good').map(([w]) => w);
  const improve = Object.entries(gen.picked).filter(([, k]) => k === 'improve').map(([w]) => w);
  const body = { type: t, targetBytes: gen.targets[t], fast: settings.fast, notes: f.notes || '', request: f.request || '' };
  if (t === 'behavior') Object.assign(body, { good, improve });
  if (t === 'subject') Object.assign(body, { subject: f.subject, standard: f.standard, level: f.level, career: f.career, strengths: f.strengths, weaknesses: f.weaknesses });
  if (t === 'autonomy' || t === 'club') Object.assign(body, { activity: f.activity, role: f.role, career: t === 'club' ? f.career : '' });
  if (t === 'career') Object.assign(body, { career: f.career, strengths: f.strengths });
  if (styles.enabled) body.styles = styles.examples.map((s) => s.trim()).filter(Boolean);
  return body;
}

const PREVIEW_LABELS = {
  type: '작성 항목', targetBytes: '목표 바이트', subject: '과목', standard: '성취기준·평가요소', level: '성취수준', career: '희망 진로',
  activity: '활동명', role: '역할', good: '강점 키워드', improve: '보완 키워드', strengths: '강점', weaknesses: '보완점',
  notes: '관찰·활동 기록', request: '요청사항', styles: '문체 참고 예시', text: '원문', count: '개수'
};

function previewText(body) {
  return Object.entries(body)
    .filter(([k, v]) => k !== 'fast' && (Array.isArray(v) ? v.length : v !== '' && v != null))
    .map(([k, v]) => `[${PREVIEW_LABELS[k] || k}] ${k === 'type' ? TYPE_LABEL[v] : Array.isArray(v) ? v.join(k === 'styles' ? '\n' : ', ') : v}`)
    .join('\n');
}

function showPreview() {
  const { body, counts } = maskPayload(buildGenBody(), [gen.label]);
  $('#previewBox').classList.remove('hidden');
  $('#previewBox').open = true;
  $('#previewMask').textContent = '🔒 ' + maskSummary(counts) + ' · 학생 표시와 이름은 전송하지 않습니다.';
  $('#previewText').textContent = previewText(body);
}

async function runGenerate() {
  const btn = $('#btnGen');
  const { body, counts } = maskPayload(buildGenBody(), [gen.label]);
  gen.error = '';
  spinBtn(btn, true, '작성 중…');
  $('#resultCard').innerHTML = `<div class="card-title">결과</div><div class="empty"><div class="big"><span class="spin" style="display:inline-block;width:28px;height:28px;border-width:3px;color:var(--primary)"></span></div>AI가 문장을 쓰고 있어요. 보통 10~40초 걸립니다.</div>`;
  try {
    if (gen.type === 'similar') {
      const r = await api('similar', body);
      gen.variants = r.variants; gen.result = null;
    } else {
      const r = await api('generate', body);
      gen.result = { ...r, masked: counts, type: gen.type, label: gen.label };
      gen.variants = null;
    }
  } catch (e) {
    gen.error = e.message;
  }
  spinBtn(btn, false);
  renderResult();
}

function renderResult() {
  const card = $('#resultCard');
  if (!card) return;
  if (gen.error) {
    card.innerHTML = `<div class="card-title">결과</div><div class="empty"><div class="big">⚠️</div>${esc(gen.error)}</div>`;
    return;
  }
  if (gen.type === 'similar') {
    if (!gen.variants) {
      card.innerHTML = '<div class="card-title">결과</div><div class="empty"><div class="big">↻</div>같은 의미, 다른 표현의 문장이 여기에 나와요.</div>';
      return;
    }
    card.innerHTML = `<div class="card-title">비슷한 문장 ${gen.variants.length}개</div>
      ${gen.variants.map((v, i) => `<div class="variant"><p>${esc(v.text)}</p><div class="meta"><span class="byte-pill">${v.bytes} 바이트</span>
        <button class="btn sm" data-save="${i}">기록에 저장</button><button class="btn sm" data-copy="${i}">복사</button></div></div>`).join('')}`;
    $$('[data-copy]', card).forEach((b) => b.addEventListener('click', () => copyText(gen.variants[b.dataset.copy].text)));
    $$('[data-save]', card).forEach((b) => b.addEventListener('click', () => {
      addRecord({ type: 'similar', label: '', text: gen.variants[b.dataset.save].text });
    }));
    return;
  }
  if (!gen.result) {
    card.innerHTML = `<div class="card-title">결과</div><div class="empty"><div class="big">✎</div>왼쪽에 재료를 넣고 <b>생성하기</b>를 누르세요.<br>결과를 직접 고치면 바이트가 다시 계산돼요.</div>`;
    return;
  }
  const r = gen.result;
  card.innerHTML = `
    <div class="card-title">결과 <span class="badge blue">${TYPE_LABEL[r.type]}</span>${r.shortened ? '<span class="badge orange">분량에 맞춰 줄임</span>' : ''}</div>
    <textarea class="result-box" id="resultText">${esc(r.text)}</textarea>
    <div id="resultMeter"></div>
    <div class="actions">
      <button class="btn primary" id="btnCopy">복사</button>
      <button class="btn" id="btnRegen">다시 생성</button>
      <button class="btn" id="btnSave">기록에 저장</button>
      <button class="btn ghost" id="btnToCheck">검사기로 점검</button>
    </div>
    <details class="sent"><summary>AI로 보낸 내용 보기</summary>
      <div class="mask-info">🔒 ${esc(maskSummary(r.masked))} · 학생 이름·번호는 전송하지 않았습니다.</div>
      <pre>${esc(r.sent)}</pre></details>`;
  updateResultMeter();
  $('#resultText').addEventListener('input', (e) => { gen.result.text = e.target.value; updateResultMeter(); });
  $('#btnCopy').addEventListener('click', () => copyText(gen.result.text));
  $('#btnRegen').addEventListener('click', runGenerate);
  $('#btnSave').addEventListener('click', () => addRecord({ type: r.type, label: gen.label, text: gen.result.text }));
  $('#btnToCheck').addEventListener('click', () => {
    chk.text = gen.result.text; chk.mode = 'single'; chk.result = null;
    chk.area = CHECK_AREAS[['behavior', 'subject', 'autonomy', 'club', 'career'].indexOf(r.type)] || chk.area;
    location.hash = '#/check';
  });
}

function updateResultMeter() {
  const el = $('#resultMeter');
  if (!el || !gen.result) return;
  el.innerHTML = bytesMeter(neisBytes(gen.result.text), gen.targets[gen.result.type]);
}

function addRecord({ type, label, text }) {
  records.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: new Date().toISOString(), type, label: label || '', text });
  saveRecords();
  toast('내 생기부 기록에 저장했어요');
}

// ───────── 다중 생성 ─────────
const SKIP_COL = /번호|학번|학년|^반$|반\s*$|연락|전화|휴대|주소|생년|생일|이메일|메일|성별|보호자/;
const NAME_COL = /이름|성명|학생\s*명|^학생$/;

function renderMulti() {
  const body = $('#genBody');
  const types = GEN_TYPES.filter((t) => t.id !== 'similar');
  body.innerHTML = `
    <div class="grid2">
      <div class="card">
        <div class="steps-label"><span class="n">1</span>생성 설정</div>
        <div class="field"><label>종류</label>
          <div class="seg sm" id="mType">${types.map((t) => `<button data-v="${t.id}" class="${multi.type === t.id ? 'on' : ''}">${t.label}</button>`).join('')}</div></div>
        <div class="field"><label>목표 바이트 <span class="hint">나이스 기준</span></label>
          <div class="range-row"><input type="range" id="mRange" min="100" max="3000" step="50" value="${multi.target}">
          <input type="number" id="mNum" min="100" max="4000" step="50" value="${multi.target}"></div></div>
        <div id="mSubject" class="${multi.type === 'subject' ? '' : 'hidden'}">
          <div class="field"><label>과목 <span class="hint">공통</span></label><input type="text" data-c="subject" value="${esc(multi.common.subject)}" placeholder="예: 국어"></div>
          <div class="field"><label>공통 성취기준·평가요소</label><textarea data-c="standard" rows="3" placeholder="학급 전체에 공통으로 적용할 성취기준">${esc(multi.common.standard)}</textarea></div>
        </div>
        <div class="field"><label>AI에게 원하는 방향 <span class="hint">문체, 흐름, 예시 문장</span></label>
          <textarea data-c="request" rows="3" placeholder="예: 활동 → 탐구 과정 → 역량 순서로, 담백한 문체로">${esc(multi.common.request)}</textarea></div>
      </div>
      <div class="card">
        <div class="steps-label"><span class="n">2</span>학생별 기록 올리기</div>
        <label class="drop" id="drop">
          <input type="file" id="mFile" accept=".xlsx,.xls,.csv" hidden>
          <b>${multi.fileName ? esc(multi.fileName) : '엑셀(.xlsx) 또는 CSV 파일을 끌어다 놓거나 클릭하세요'}</b>
          ${multi.rows.length ? `${multi.rows.length}명 불러옴` : '첫 줄은 열 제목. 이름 열 + 관찰·활동 내용 열 (형식 자유)'}
        </label>
        <div class="actions"><button class="btn sm ghost" id="mTemplate">양식 내려받기</button></div>
        <div id="mCols"></div>
        <p class="note">🔒 이름 열은 결과를 맞추는 데만 쓰고 AI로 보내지 않습니다. 번호·학년·반·연락처 열도 자동으로 빠집니다. 나머지 열 내용에 적힌 학생 이름은 "학생"으로 가려집니다.</p>
      </div>
    </div>
    <div class="card" style="margin-top:18px">
      <div class="card-title"><span class="steps-label" style="margin:0"><span class="n">3</span>생성과 결과</span>
        <span class="right actions" style="margin:0">
          <button class="btn primary" id="mRun" ${multi.rows.length && !multi.running ? '' : 'disabled'}>일괄 생성 시작</button>
          <button class="btn" id="mStop" ${multi.running ? '' : 'disabled'}>중지</button>
          <button class="btn ghost" id="mDown" ${multi.rows.some((r) => r.result) ? '' : 'disabled'}>엑셀로 받기</button>
        </span></div>
      <progress id="mProg" value="${multi.rows.filter((r) => r.status === '완료' || r.status === '초과').length}" max="${multi.rows.length || 1}"></progress>
      <div class="note" id="mMsg"></div>
      <div id="mTable" style="margin-top:12px"></div>
    </div>`;

  $$('#mType button').forEach((b) => b.addEventListener('click', () => {
    multi.type = b.dataset.v;
    multi.target = GEN_TYPES.find((t) => t.id === multi.type).bytes;
    renderMulti();
  }));
  const syncT = (v) => { multi.target = Math.min(Math.max(parseInt(v, 10) || 100, 100), 4000); $('#mRange').value = multi.target; $('#mNum').value = multi.target; renderMultiTable(); };
  $('#mRange').addEventListener('input', (e) => syncT(e.target.value));
  $('#mNum').addEventListener('change', (e) => syncT(e.target.value));
  $$('[data-c]', body).forEach((el) => el.addEventListener('input', () => { multi.common[el.dataset.c] = el.value; }));
  $('#mFile').addEventListener('change', (e) => e.target.files[0] && loadMultiFile(e.target.files[0]));
  const drop = $('#drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drag'); if (e.dataTransfer.files[0]) loadMultiFile(e.dataTransfer.files[0]); });
  $('#mTemplate').addEventListener('click', downloadTemplate);
  $('#mRun').addEventListener('click', runMulti);
  $('#mStop').addEventListener('click', () => { multi.stop = true; $('#mMsg').textContent = '지금 처리 중인 학생까지만 마치고 멈춥니다.'; });
  $('#mDown').addEventListener('click', downloadMulti);
  renderMultiCols();
  renderMultiTable();
}

let xlsxPromise;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  xlsxPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => { xlsxPromise = null; reject(new Error('엑셀 처리 도구를 불러오지 못했습니다. CSV 파일로 올려 주세요.')); };
    document.head.appendChild(s);
  });
  return xlsxPromise;
}

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim()));
}

async function loadMultiFile(file) {
  try {
    let table;
    if (/\.csv$/i.test(file.name)) {
      table = parseCsv(await file.text());
    } else {
      const XLSX = await loadXlsx();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      table = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
        .filter((r) => r.some((c) => String(c).trim()));
    }
    if (table.length < 2) throw new Error('첫 줄 제목 아래에 학생 행이 없습니다.');
    multi.headers = table[0].map((h, i) => String(h).trim() || `열${i + 1}`);
    multi.nameCol = multi.headers.findIndex((h) => NAME_COL.test(h));
    multi.include = multi.headers.map((h, i) => i !== multi.nameCol && !SKIP_COL.test(h));
    multi.rows = table.slice(1).map((r) => ({ cells: multi.headers.map((_, i) => String(r[i] ?? '').trim()), result: '', status: '대기', error: '' }));
    multi.fileName = file.name;
    renderMulti();
    toast(`${multi.rows.length}명의 기록을 불러왔어요`);
  } catch (e) {
    toast(e.message);
  }
}

function renderMultiCols() {
  const el = $('#mCols');
  if (!el || !multi.headers.length) return;
  el.innerHTML = `<div class="field"><label>이름 열 <span class="hint">AI로 보내지 않음</span></label>
      <select id="mNameCol"><option value="-1">없음</option>${multi.headers.map((h, i) => `<option value="${i}" ${i === multi.nameCol ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></div>
    <div class="field"><label>AI에 보낼 재료 열</label><div class="chips">${multi.headers.map((h, i) => i === multi.nameCol ? '' :
      `<button class="chip good ${multi.include[i] ? 'on' : ''}" data-col="${i}">${esc(h)}</button>`).join('')}</div></div>`;
  $('#mNameCol').addEventListener('change', (e) => {
    multi.nameCol = Number(e.target.value);
    if (multi.nameCol >= 0) multi.include[multi.nameCol] = false;
    renderMultiCols(); renderMultiTable();
  });
  $$('[data-col]', el).forEach((b) => b.addEventListener('click', () => { const i = Number(b.dataset.col); multi.include[i] = !multi.include[i]; renderMultiCols(); }));
}

function rowName(r, i) { return multi.nameCol >= 0 ? r.cells[multi.nameCol] || `${i + 1}번째` : `${i + 1}번째`; }
function rowMaterial(r) {
  return multi.headers.map((h, i) => (multi.include[i] && r.cells[i] ? `${h}: ${r.cells[i]}` : null)).filter(Boolean).join('\n');
}

function renderMultiTable() {
  const el = $('#mTable');
  if (!el) return;
  if (!multi.rows.length) { el.innerHTML = '<div class="empty">파일을 올리면 학생 목록이 여기에 나와요.</div>'; return; }
  const badge = (s) => ({ 완료: 'green', 초과: 'red', 오류: 'red', '생성 중': 'blue' }[s] || '');
  el.innerHTML = `<div class="table-wrap"><table><thead><tr><th style="width:110px">학생</th><th>생성 결과</th><th style="width:120px">바이트</th><th style="width:90px">상태</th></tr></thead><tbody>
    ${multi.rows.map((r, i) => {
      const b = neisBytes(r.result);
      return `<tr><td><b>${esc(rowName(r, i))}</b><div class="note">${esc(rowMaterial(r).slice(0, 40))}${rowMaterial(r).length > 40 ? '…' : ''}</div></td>
      <td>${r.result || r.status === '완료' ? `<textarea data-row="${i}">${esc(r.result)}</textarea>` : `<span class="note">${esc(r.error || '')}</span>`}</td>
      <td>${r.result ? `<span class="byte-pill ${b > multi.target ? 'over' : ''}" id="mb${i}">${b} / ${multi.target}</span><div class="actions" style="margin-top:8px"><button class="btn sm" data-mcopy="${i}">복사</button></div>` : ''}</td>
      <td><span class="badge ${badge(r.status)}">${esc(r.status)}</span>${r.status === '오류' || r.status === '완료' || r.status === '초과' ? `<div style="margin-top:6px"><button class="btn sm" data-redo="${i}">다시</button></div>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  $$('[data-row]', el).forEach((ta) => ta.addEventListener('input', () => {
    const i = Number(ta.dataset.row); multi.rows[i].result = ta.value;
    const b = neisBytes(ta.value); const pill = $('#mb' + i);
    if (pill) { pill.textContent = `${b} / ${multi.target}`; pill.classList.toggle('over', b > multi.target); }
  }));
  $$('[data-mcopy]', el).forEach((b) => b.addEventListener('click', () => copyText(multi.rows[b.dataset.mcopy].result)));
  $$('[data-redo]', el).forEach((b) => b.addEventListener('click', async () => {
    const i = Number(b.dataset.redo);
    await generateRow(i); renderMultiTable();
  }));
}

async function generateRow(i) {
  const r = multi.rows[i];
  const material = rowMaterial(r);
  if (!material) { r.status = '오류'; r.error = '재료 열이 비어 있습니다.'; return; }
  r.status = '생성 중'; r.error = '';
  renderMultiTable();
  const allNames = multi.nameCol >= 0 ? multi.rows.map((x) => x.cells[multi.nameCol]) : [];
  const raw = {
    type: multi.type, targetBytes: multi.target, fast: settings.fast, notes: material, request: multi.common.request,
    subject: multi.type === 'subject' ? multi.common.subject : '', standard: multi.type === 'subject' ? multi.common.standard : '',
    styles: styles.enabled ? styles.examples.map((s) => s.trim()).filter(Boolean) : []
  };
  const { body } = maskPayload(raw, allNames);
  try {
    const res = await api('generate', body);
    r.result = res.text; r.status = res.overLimit ? '초과' : '완료';
  } catch (e) {
    r.status = '오류'; r.error = e.message;
  }
}

async function runMulti() {
  if (multi.running) return;
  multi.running = true; multi.stop = false;
  renderMulti();
  const queue = multi.rows.map((r, i) => i).filter((i) => multi.rows[i].status !== '완료');
  let done = multi.rows.length - queue.length;
  const update = () => {
    const p = $('#mProg'); if (p) { p.value = done; p.max = multi.rows.length; }
    const m = $('#mMsg'); if (m && !multi.stop) m.textContent = `${done} / ${multi.rows.length}명 처리`;
  };
  update();
  const worker = async () => {
    while (queue.length && !multi.stop) {
      const i = queue.shift();
      await generateRow(i);
      done++; update(); renderMultiTable();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  multi.running = false;
  renderMulti();
  const fail = multi.rows.filter((r) => r.status === '오류').length;
  $('#mMsg').textContent = multi.stop ? '중지했습니다.' : `완료했습니다.${fail ? ` 오류 ${fail}건은 "다시"를 눌러 주세요.` : ''}`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function downloadTable(filename, rows) {
  try {
    const XLSX = await loadXlsx();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = rows[0].map((h) => ({ wch: /결과|내용|문장/.test(h) ? 80 : 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '생기부');
    XLSX.writeFile(wb, filename + '.xlsx');
  } catch {
    downloadCsv(filename + '.csv', rows);
  }
}

function downloadMulti() {
  const rows = [['학생', '종류', '생성 결과', '바이트', '상태']];
  multi.rows.forEach((r, i) => rows.push([rowName(r, i), TYPE_LABEL[multi.type], r.result, neisBytes(r.result), r.status]));
  downloadTable(`생기부_${TYPE_LABEL[multi.type]}_${new Date().toISOString().slice(0, 10)}`, rows);
}

function downloadTemplate() {
  downloadCsv('새김_다중생성_양식.csv', [
    ['이름', '관찰·활동 내용', '강점', '보완점', '희망 진로'],
    ['학생1', '모둠 활동에서 자료 조사를 맡아 근거 자료를 꼼꼼히 정리함', '성실함, 책임감', '발표를 부담스러워함', '간호사'],
    ['학생2', '토론 수업에서 반대 측 논리를 분석해 질문함', '논리적 사고', '과제 제출이 늦음', '법조인']
  ]);
}

// ───────────────────────── 검사기 ─────────────────────────
const thisYear = new Date().getFullYear();
const chk = {
  mode: 'single', schoolLevel: settings.schoolLevel, year: String(Math.min(thisYear, 2027)), grade: '', area: CHECK_AREAS[0],
  text: '', result: null, multiText: '', multiResults: null, running: false
};

function renderCheck() {
  const years = []; for (let y = 2021; y <= Math.max(thisYear + 1, 2026); y++) years.push(y);
  view.innerHTML = `
    ${pageHead('AI 생기부 검사기', '기재요령에 어긋나는 표현을 찾아 이유와 수정안을 알려 드려요. 규칙 검사는 즉시, AI 검토는 이어서 진행됩니다.')}
    ${serverBanner()}
    <div class="toolbar">
      <div class="seg" id="chkMode">
        <button data-m="single" class="${chk.mode === 'single' ? 'on' : ''}">단일 검사</button>
        <button data-m="multi" class="${chk.mode === 'multi' ? 'on' : ''}">다중 검사</button>
      </div>
    </div>
    <div class="grid2">
      <div class="card">
        <div class="row">
          <div class="field"><label>학교급</label><select id="cLevel">${['초등학교', '중학교', '고등학교'].map((l) => `<option ${chk.schoolLevel === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>작성 학년도</label><select id="cYear">${years.map((y) => `<option ${String(y) === chk.year ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
          <div class="field"><label>학년</label><select id="cGrade"><option value="">선택</option>${[1, 2, 3, 4, 5, 6].map((g) => `<option value="${g}" ${String(g) === chk.grade ? 'selected' : ''}>${g}학년</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>영역</label><select id="cArea">${CHECK_AREAS.map((a) => `<option ${a === chk.area ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
        ${chk.mode === 'single' ? `
          <div class="field"><label>검사할 문장 <span class="right byte-pill" id="cBytes">0 바이트</span></label>
            <textarea id="cText" rows="10" placeholder="검사할 생기부 문장을 붙여 넣으세요.">${esc(chk.text)}</textarea></div>` : `
          <div class="field"><label>검사할 문장들 <span class="hint">학생별 문장 사이에 빈 줄을 하나 넣어 주세요</span></label>
            <textarea id="cMulti" rows="14" placeholder="첫 번째 학생 문장...&#10;&#10;두 번째 학생 문장...">${esc(chk.multiText)}</textarea></div>`}
        <div class="actions"><button class="btn primary block" id="cRun">검사하기</button></div>
        <p class="note">🔒 설정에 등록한 학생 이름은 "학생"으로 가린 뒤 AI에 보냅니다.</p>
      </div>
      <div class="card sticky" id="cResult"></div>
    </div>`;

  $$('#chkMode button').forEach((b) => b.addEventListener('click', () => { chk.mode = b.dataset.m; renderCheck(); }));
  $('#cLevel').addEventListener('change', (e) => { chk.schoolLevel = e.target.value; });
  $('#cYear').addEventListener('change', (e) => { chk.year = e.target.value; });
  $('#cGrade').addEventListener('change', (e) => { chk.grade = e.target.value; });
  $('#cArea').addEventListener('change', (e) => { chk.area = e.target.value; });
  const ct = $('#cText');
  if (ct) {
    const upd = () => { $('#cBytes').textContent = neisBytes(ct.value).toLocaleString() + ' 바이트'; };
    ct.addEventListener('input', () => { chk.text = ct.value; upd(); }); upd();
  }
  $('#cMulti')?.addEventListener('input', (e) => { chk.multiText = e.target.value; });
  $('#cRun').addEventListener('click', runCheck);
  renderCheckResult();
}

function localIssues(text) { return [...ruleCheck(text), ...endingCheck(text)]; }

async function checkOne(text) {
  const rules = localIssues(text);
  let ai = { issues: [], revised: '', revisedBytes: 0 };
  let aiError = '';
  try {
    const { body } = maskPayload({ text, grade: chk.grade, year: chk.year, area: chk.area, fast: settings.fast });
    ai = await api('check', { ...body, schoolLevel: chk.schoolLevel });
  } catch (e) { aiError = e.message; }
  const seen = new Set(rules.map((r) => r.found));
  const merged = [...rules, ...ai.issues.filter((i) => !seen.has(i.found)).map((i) => ({ ...i, suggestion: i.suggestion, source: 'AI' }))];
  return { text, issues: merged, revised: ai.revised, revisedBytes: ai.revisedBytes, aiError, bytes: neisBytes(text) };
}

async function runCheck() {
  const btn = $('#cRun');
  if (chk.mode === 'single') {
    if (!chk.text.trim()) return toast('검사할 문장을 입력해 주세요');
    chk.result = { text: chk.text, issues: localIssues(chk.text), revised: '', bytes: neisBytes(chk.text), pending: true };
    renderCheckResult();
    spinBtn(btn, true, 'AI 검토 중…');
    chk.result = await checkOne(chk.text);
    spinBtn(btn, false);
    renderCheckResult();
  } else {
    const items = chk.multiText.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    if (!items.length) return toast('검사할 문장을 입력해 주세요');
    chk.multiResults = items.map((t) => ({ text: t, issues: localIssues(t), pending: true, bytes: neisBytes(t) }));
    renderCheckResult();
    spinBtn(btn, true, `검사 중… 0/${items.length}`);
    let done = 0;
    const queue = items.map((_, i) => i);
    const worker = async () => {
      while (queue.length) {
        const i = queue.shift();
        chk.multiResults[i] = await checkOne(items[i]);
        done++;
        btn.innerHTML = `<span class="spin"></span>검사 중… ${done}/${items.length}`;
        renderCheckResult();
      }
    };
    await Promise.all([worker(), worker()]);
    spinBtn(btn, false);
    renderCheckResult();
  }
}

function highlight(text, issues) {
  const ranges = [];
  issues.forEach((i) => {
    const f = i.found; if (!f || f.length < 1) return;
    let idx = text.indexOf(f);
    while (idx !== -1) { ranges.push([idx, idx + f.length]); idx = text.indexOf(f, idx + f.length); }
  });
  ranges.sort((a, b) => a[0] - b[0]);
  let out = ''; let pos = 0;
  ranges.forEach(([s, e]) => {
    if (s < pos) return;
    out += esc(text.slice(pos, s)) + '<mark>' + esc(text.slice(s, e)) + '</mark>';
    pos = e;
  });
  return out + esc(text.slice(pos));
}

function issueCards(issues) {
  if (!issues.length) return '<div class="empty" style="padding:24px"><div class="big">👍</div>발견된 문제가 없어요.</div>';
  return issues.map((i) => `<div class="issue">
    <div class="issue-head"><span class="badge red">${esc(i.type)}</span><span class="found">"${esc(i.found)}"</span>
      <span class="badge ${i.source === 'AI' ? 'blue' : ''}" style="margin-left:auto">${i.source === 'AI' ? 'AI 검토' : '규칙 검사'}</span></div>
    <dl><dt>이유</dt><dd>${esc(i.reason)}</dd><dt>근거</dt><dd>${esc(i.basis)}</dd><dt>수정 제안</dt><dd class="fix">${esc(i.suggestion)}</dd></dl>
  </div>`).join('');
}

function resultBlock(r, idx) {
  const n = r.issues.length;
  return `
    <div class="summary">
      <div class="stat"><div class="k">개선 권장</div><div class="v ${n ? 'red' : 'green'}">${n}건</div></div>
      <div class="stat"><div class="k">나이스 바이트</div><div class="v">${r.bytes.toLocaleString()}</div></div>
    </div>
    <div class="label">문제 구간</div>
    <div class="hl">${highlight(r.text, r.issues)}</div>
    <div class="label" style="margin-top:18px">항목별 검토</div>
    ${issueCards(r.issues)}
    ${r.pending ? '<p class="note" style="margin-top:12px"><span class="spin" style="display:inline-block;width:12px;height:12px;border:2px solid var(--primary);border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite"></span> AI가 맞춤법과 문맥까지 검토하고 있어요…</p>' : ''}
    ${r.aiError ? `<p class="err-text">AI 검토를 하지 못했습니다: ${esc(r.aiError)} (규칙 검사 결과만 표시)</p>` : ''}
    ${r.revised ? `<div class="label" style="margin-top:18px">AI 수정본 <span class="right byte-pill">${r.revisedBytes} 바이트</span></div>
      <div class="hl" style="background:#f3f8ff;border-color:#dbe7ff">${esc(r.revised)}</div>
      <div class="actions"><button class="btn sm primary" data-rcopy="${idx}">수정본 복사</button><button class="btn sm" data-rsave="${idx}">기록에 저장</button></div>` : ''}`;
}

function renderCheckResult() {
  const el = $('#cResult');
  if (!el) return;
  const bind = (getter) => {
    $$('[data-rcopy]', el).forEach((b) => b.addEventListener('click', () => copyText(getter(b.dataset.rcopy).revised)));
    $$('[data-rsave]', el).forEach((b) => b.addEventListener('click', () => addRecord({ type: 'checked', label: '', text: getter(b.dataset.rsave).revised })));
  };
  if (chk.mode === 'single') {
    if (!chk.result) { el.innerHTML = '<div class="card-title">검사 결과</div><div class="empty"><div class="big">✓</div>문장을 넣고 <b>검사하기</b>를 누르세요.</div>'; return; }
    el.innerHTML = `<div class="card-title">검사 결과</div>${resultBlock(chk.result, 0)}`;
    bind(() => chk.result);
  } else {
    if (!chk.multiResults) { el.innerHTML = '<div class="card-title">검사 결과</div><div class="empty"><div class="big">✓</div>여러 학생의 문장을 빈 줄로 나눠 넣고 검사하세요.</div>'; return; }
    const total = chk.multiResults.reduce((a, r) => a + r.issues.length, 0);
    el.innerHTML = `<div class="card-title">검사 결과 <span class="badge ${total ? 'red' : 'green'}">총 ${total}건</span></div>
      ${chk.multiResults.map((r, i) => `<details class="multi-item" ${i === 0 ? 'open' : ''}><summary><b>${i + 1}</b><span class="t">${esc(r.text)}</span>
        <span class="badge ${r.issues.length ? 'red' : 'green'}">${r.pending ? '검사 중' : r.issues.length + '건'}</span></summary><div>${resultBlock(r, i)}</div></details>`).join('')}`;
    bind((i) => chk.multiResults[i]);
  }
}

// ───────────────────────── 채팅 ─────────────────────────
let chatLog = store.get('chat', []);
let chatBusy = false;

function renderChat() {
  view.innerHTML = `
    ${pageHead('AI 채팅', '생기부, 수업, 평가, 학급 운영까지 무엇이든 물어보세요. 학생 이름은 가린 뒤 전송됩니다.')}
    ${serverBanner()}
    <div class="card chat">
      <div class="chat-log" id="chatLog"></div>
      <div class="chat-input">
        <textarea id="chatIn" placeholder="메시지를 입력하세요 (Shift+Enter 줄바꿈)"></textarea>
        <button class="btn primary" id="chatSend">보내기</button>
        <button class="btn ghost" id="chatNew" title="새 대화">새 대화</button>
      </div>
    </div>`;
  drawChat();
  const input = $('#chatIn');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat(); } });
  $('#chatSend').addEventListener('click', sendChat);
  $('#chatNew').addEventListener('click', () => { chatLog = []; store.set('chat', chatLog); drawChat(); });
}

function drawChat() {
  const log = $('#chatLog');
  if (!log) return;
  if (!chatLog.length) {
    log.innerHTML = `<div class="empty" style="border:0;margin:auto"><div class="big">✉</div>무엇을 도와드릴까요?
      <div class="suggest">${['행동특성 종합의견에서 피해야 할 표현 알려줘', '수행평가 채점 기준표 예시 만들어 줘', '학부모 상담 안내문 초안 써 줘', '동아리 활동 기록을 풍성하게 쓰는 팁'].map((s) => `<button data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
    $$('[data-s]', log).forEach((b) => b.addEventListener('click', () => { $('#chatIn').value = b.dataset.s; sendChat(); }));
    return;
  }
  log.innerHTML = chatLog.map((m) => `<div class="msg ${m.role}">${esc(m.content)}</div>`).join('') + (chatBusy ? '<div class="msg assistant typing">답변을 쓰고 있어요…</div>' : '');
  log.scrollTop = log.scrollHeight;
}

async function sendChat() {
  const input = $('#chatIn');
  const text = input.value.trim();
  if (!text || chatBusy) return;
  input.value = '';
  chatLog.push({ role: 'user', content: text });
  chatBusy = true; drawChat();
  try {
    const { body } = maskPayload({ messages: chatLog.slice(-20) });
    const r = await api('chat', { messages: body.messages, fast: settings.fast });
    chatLog.push({ role: 'assistant', content: r.text });
  } catch (e) {
    chatLog.push({ role: 'assistant', content: '⚠️ ' + e.message });
  }
  chatBusy = false;
  store.set('chat', chatLog.filter((m) => !m.content.startsWith('⚠️')).slice(-40));
  drawChat();
}

// ───────────────────────── 기록 ─────────────────────────
const recFilter = { type: '', q: '' };

function renderRecords() {
  const typeOpts = [['', '전체'], ...GEN_TYPES.map((t) => [t.id, t.label]), ['checked', '검사 수정본']];
  view.innerHTML = `
    ${pageHead('내 생기부 기록', '저장한 문장을 모아 봅니다. 기록은 이 브라우저에만 저장됩니다.')}
    <div class="toolbar">
      <select id="rType" style="width:auto">${typeOpts.map(([v, l]) => `<option value="${v}" ${recFilter.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input type="search" id="rQ" placeholder="학생 표시나 내용으로 검색" value="${esc(recFilter.q)}" style="max-width:320px">
      <span style="margin-left:auto" class="actions">
        <button class="btn ghost sm" id="rDown">엑셀로 받기</button>
        <button class="btn ghost sm danger" id="rClear">전체 삭제</button>
      </span>
    </div>
    <div id="rList"></div>`;
  $('#rType').addEventListener('change', (e) => { recFilter.type = e.target.value; drawRecords(); });
  $('#rQ').addEventListener('input', (e) => { recFilter.q = e.target.value; drawRecords(); });
  $('#rDown').addEventListener('click', () => {
    const rows = [['저장 시각', '종류', '학생 표시', '내용', '바이트']];
    filteredRecords().forEach((r) => rows.push([new Date(r.at).toLocaleString('ko-KR'), recTypeLabel(r.type), r.label, r.text, neisBytes(r.text)]));
    downloadTable(`내_생기부_기록_${new Date().toISOString().slice(0, 10)}`, rows);
  });
  $('#rClear').addEventListener('click', () => {
    if (!records.length || !confirm('저장한 기록을 모두 삭제할까요? 되돌릴 수 없습니다.')) return;
    records = []; saveRecords(); drawRecords();
  });
  drawRecords();
}

const recTypeLabel = (t) => (t === 'checked' ? '검사 수정본' : TYPE_LABEL[t] || t);
function filteredRecords() {
  const q = recFilter.q.trim();
  return records.filter((r) => (!recFilter.type || r.type === recFilter.type) && (!q || r.text.includes(q) || (r.label || '').includes(q)));
}

function drawRecords() {
  const list = filteredRecords();
  const el = $('#rList');
  if (!list.length) {
    el.innerHTML = `<div class="card"><div class="empty"><div class="big">🗂</div>${records.length ? '조건에 맞는 기록이 없어요.' : '아직 저장한 기록이 없어요. 생성 화면에서 <b>기록에 저장</b>을 눌러 보세요.'}</div></div>`;
    return;
  }
  el.innerHTML = list.map((r) => `<div class="record">
    <div class="record-head"><span class="badge blue">${esc(recTypeLabel(r.type))}</span><span class="who">${esc(r.label || '')}</span>
      <span class="byte-pill">${neisBytes(r.text)} 바이트</span><span class="when">${new Date(r.at).toLocaleString('ko-KR')}</span></div>
    <p>${esc(r.text)}</p>
    <div class="actions"><button class="btn sm" data-c="${r.id}">복사</button><button class="btn sm" data-k="${r.id}">검사기로</button><button class="btn sm danger" data-d="${r.id}">삭제</button></div>
  </div>`).join('');
  $$('[data-c]', el).forEach((b) => b.addEventListener('click', () => copyText(records.find((r) => r.id === b.dataset.c).text)));
  $$('[data-k]', el).forEach((b) => b.addEventListener('click', () => { chk.text = records.find((r) => r.id === b.dataset.k).text; chk.mode = 'single'; chk.result = null; location.hash = '#/check'; }));
  $$('[data-d]', el).forEach((b) => b.addEventListener('click', () => { records = records.filter((r) => r.id !== b.dataset.d); saveRecords(); drawRecords(); }));
}

// ───────────────────────── 내 스타일 ─────────────────────────
function renderStyle() {
  view.innerHTML = `
    ${pageHead('내 스타일', '평소 쓰시는 생기부 문장을 등록하면 AI가 그 문체와 흐름을 따라 씁니다. 내용은 가져오지 않아요.')}
    <div class="card" style="max-width:860px">
      <div class="toolbar" style="margin-bottom:6px">
        <label class="switch"><input type="checkbox" id="sOn" ${styles.enabled ? 'checked' : ''}><span class="track"></span>생성할 때 내 스타일 적용</label>
      </div>
      ${styles.examples.map((s, i) => `<div class="field"><label>예시 문장 ${i + 1} <span class="right byte-pill" id="sb${i}">${neisBytes(s)} 바이트</span></label>
        <textarea data-s="${i}" rows="4" placeholder="예: 수업 시간에 배운 개념을 일상의 현상과 연결하여 질문하는 태도가 돋보이며…">${esc(s)}</textarea></div>`).join('')}
      <div class="banner warn" style="margin-top:16px">예시 문장도 AI로 전송됩니다. 학생 이름이나 개인을 알아볼 수 있는 내용은 지우고 넣어 주세요. 명단에 있는 이름은 자동으로 가려집니다.</div>
      <div class="actions"><button class="btn primary" id="sSave">저장</button></div>
    </div>`;
  $$('[data-s]').forEach((ta) => ta.addEventListener('input', () => { $('#sb' + ta.dataset.s).textContent = neisBytes(ta.value) + ' 바이트'; }));
  $('#sSave').addEventListener('click', () => {
    styles.enabled = $('#sOn').checked;
    styles.examples = $$('[data-s]').map((t) => t.value);
    saveStyles();
    toast('내 스타일을 저장했어요');
  });
}

// ───────────────────────── 설정 ─────────────────────────
function renderSettings() {
  view.innerHTML = `
    ${pageHead('설정', '이 화면의 설정은 모두 지금 쓰는 브라우저에만 저장됩니다.')}
    <div class="grid2">
      <div class="card">
        <div class="card-title">기본 설정</div>
        <div class="field"><label>학교급</label><select id="stLevel">${['초등학교', '중학교', '고등학교'].map((l) => `<option ${settings.schoolLevel === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label class="switch"><input type="checkbox" id="stFast" ${settings.fast ? 'checked' : ''}><span class="track"></span>기본으로 빠른 모드 사용</label>
          <p class="note">빠른 모드는 더 가볍고 저렴한 모델(${esc(server.fastModel || '')})을 씁니다. 기본 모델: ${esc(server.model || '')}</p></div>
        <div class="field"><label>접속 비밀번호 <span class="hint">${server.passwordRequired ? '이 사이트는 비밀번호가 필요합니다' : '서버에 비밀번호가 설정되지 않았습니다'}</span></label>
          <input type="password" id="stPw" value="${esc(settings.password)}" placeholder="관리자가 알려 준 비밀번호"></div>
        <div class="actions"><button class="btn primary" id="stSave">저장</button><button class="btn ghost" id="stTest">연결 확인</button></div>
        <div class="note" id="stMsg"></div>
      </div>
      <div class="card">
        <div class="card-title">개인정보 가림</div>
        <div class="field"><label>학생 명단 <span class="hint">한 줄에 한 명 · 이 브라우저에만 저장</span></label>
          <textarea id="stNames" rows="8" placeholder="홍길동&#10;김철수">${esc(settings.students.join('\n'))}</textarea>
          <p class="note">명단의 이름(성을 뺀 이름 포함)이 입력란에 적혀 있으면 AI로 보내기 전에 "학생"으로 바꿉니다. 명단은 서버로 보내지 않습니다.</p></div>
        <div class="field"><label>추가로 가릴 단어 <span class="hint">쉼표로 구분</span></label>
          <input type="text" id="stWords" value="${esc(settings.extraWords.join(', '))}" placeholder="예: 새김고등학교, 김선생"></div>
        <div class="field"><label>가림 테스트</label>
          <input type="text" id="stTry" placeholder="예: 길동이가 2학년 3반 5번이고 010-1234-5678로 연락함">
          <p class="note" id="stTryOut"></p></div>
      </div>
    </div>
    <div class="card" style="margin-top:18px">
      <div class="card-title">데이터 관리</div>
      <p class="note" style="margin:0 0 12px">기록 ${records.length}건, 채팅 ${chatLog.length}개 메시지가 이 브라우저에 저장되어 있습니다.</p>
      <button class="btn ghost danger" id="stReset">이 브라우저의 모든 데이터 삭제</button>
    </div>`;

  const readNames = () => $('#stNames').value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const readWords = () => $('#stWords').value.split(',').map((s) => s.trim()).filter(Boolean);
  const tryMask = () => {
    const r = sanitize($('#stTry').value, readNames(), readWords());
    $('#stTryOut').textContent = $('#stTry').value ? `→ ${r.text}  (${maskSummary(r.counts)})` : '';
  };
  $('#stTry').addEventListener('input', tryMask);
  $('#stSave').addEventListener('click', () => {
    settings.schoolLevel = $('#stLevel').value;
    settings.fast = $('#stFast').checked;
    settings.password = $('#stPw').value;
    settings.students = readNames();
    settings.extraWords = readWords();
    saveSettings();
    chk.schoolLevel = settings.schoolLevel;
    toast('설정을 저장했어요');
  });
  $('#stTest').addEventListener('click', async () => {
    const btn = $('#stTest');
    spinBtn(btn, true, '확인 중');
    settings.password = $('#stPw').value;
    try {
      await api('chat', { messages: [{ role: 'user', content: '연결 확인입니다. "연결되었습니다"라고만 답하세요.' }], fast: true });
      $('#stMsg').textContent = '✅ 서버와 AI 연결이 정상입니다.';
    } catch (e) {
      $('#stMsg').textContent = '⚠️ ' + e.message;
    }
    spinBtn(btn, false);
  });
  $('#stReset').addEventListener('click', () => {
    if (!confirm('기록, 스타일, 명단, 채팅을 모두 지웁니다. 계속할까요?')) return;
    try { Object.keys(localStorage).filter((k) => k.startsWith('saegim.')).forEach((k) => localStorage.removeItem(k)); } catch { /* 무시 */ }
    location.reload();
  });
}

// ───────────────────────── 시작 ─────────────────────────
async function loadServer() {
  const el = $('#serverStatus');
  try {
    const r = await fetch('/api/config');
    server = await r.json();
    el.textContent = server.mock ? '● 개발용 가짜 응답 모드' : server.hasKey ? '● AI 연결 준비됨' : '● 서버 API 키 없음';
    el.classList.toggle('err', !server.hasKey);
  } catch {
    el.textContent = '● 서버에 연결할 수 없음';
    el.classList.add('err');
  }
}

loadServer().then(() => { if (['generate', 'check', 'chat'].some((r) => location.hash.includes(r))) route(); });
route();
