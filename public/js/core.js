/**
 * 브라우저와 서버가 함께 쓰는 순수 함수 모음.
 *  - neisBytes: 나이스 바이트 계산
 *  - sanitize: AI로 보내기 전에 학생 식별 정보를 가린다
 */

/** 나이스 바이트: 한글 등 비ASCII 3바이트, 영문·숫자·공백·기호 1바이트, 엔터 1바이트 (2026 기재요령 p.208) */
export function neisBytes(s) {
  const str = String(s ?? '').replace(/\r\n/g, '\n');
  let b = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c <= 0x7f) b += 1;
    else b += 3;
  }
  return b;
}

const PARTICLES = '(?:이가|이는|이를|이의|이와|이도|이에게|이랑|가|는|은|를|을|의|와|과|도|에게|한테|랑|야|아|이)?';

// "학생"은 받침으로 끝나므로 이름 뒤 조사를 그에 맞게 바꾼다. (지우가 → 학생이, 길동이는 → 학생은)
const PARTICLE_FIX = { 가: '이', 는: '은', 를: '을', 와: '과', 랑: '이랑', 야: '', 아: '' };
function fixParticle(p) {
  if (!p) return '';
  const core = p.length > 1 && p.startsWith('이') && p !== '이랑' && p !== '이에게' ? p.slice(1) : p;
  return core in PARTICLE_FIX ? PARTICLE_FIX[core] : core;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 학생 식별 정보를 가린다.
 * @param {string} text 원문
 * @param {string[]} names 가릴 학생 이름 목록 (명단 전체, 브라우저에만 있음)
 * @param {string[]} extraWords 학교명·교사명 등 추가로 가릴 단어
 * @returns {{text: string, counts: Record<string, number>}}
 */
export function sanitize(text, names = [], extraWords = []) {
  const counts = { 이름: 0, 연락처: 0, 주민번호: 0, 이메일: 0, 학년반번호: 0, 학번: 0, 지정단어: 0 };
  let t = String(text ?? '');

  const rep = (re, by, key) => {
    t = t.replace(re, () => { counts[key]++; return by; });
  };

  rep(/\d{6}\s*-\s*[1-8]\d{6}/g, '[가림]', '주민번호');
  rep(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[가림]', '이메일');
  rep(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g, '[가림]', '연락처');
  rep(/\d+\s*학년\s*\d+\s*반(\s*\d+\s*번)?/g, '', '학년반번호');
  rep(/\d+\s*반\s*\d+\s*번/g, '', '학년반번호');
  rep(/학번\s*[:：]?\s*\d{4,6}/g, '', '학번');

  // 긴 이름부터 처리해야 "김지우"가 "지우"보다 먼저 가려진다.
  let list = [];
  (names || []).forEach((raw) => {
    const n = String(raw || '').replace(/\s/g, '');
    if (n.length >= 2) list.push(n);
    // 3글자 이상 이름은 성을 뺀 이름(예: 지우)도 가린다. 단어 일부(지우개)는 경계를 확인해 건드리지 않는다.
    if (n.length >= 3) list.push(n.slice(1));
  });
  list = [...new Set(list)].sort((a, b) => b.length - a.length);
  list.forEach((n) => {
    const re = new RegExp('(^|[^가-힣])' + escapeRegex(n) + '(' + PARTICLES + ')(?=[^가-힣]|$)', 'g');
    t = t.replace(re, (m, pre, particle) => { counts['이름']++; return pre + '학생' + fixParticle(particle); });
    if (n.length >= 3) {
      t = t.replace(new RegExp(escapeRegex(n), 'g'), () => { counts['이름']++; return '학생'; });
    }
  });

  (extraWords || []).map((w) => String(w).trim()).filter(Boolean)
    .forEach((w) => rep(new RegExp(escapeRegex(w), 'g'), '[가림]', '지정단어'));

  return { text: t, counts };
}

export function maskedTotal(counts) {
  return Object.values(counts || {}).reduce((a, b) => a + b, 0);
}

// 기재요령 규칙 검사는 guide2026.js에 있다.
export { ruleCheck, AREAS, REF, GUIDE_SUMMARY } from './guide2026.js';
