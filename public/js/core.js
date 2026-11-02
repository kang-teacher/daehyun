/**
 * 브라우저와 서버가 함께 쓰는 순수 함수 모음.
 *  - neisBytes: 나이스 바이트 계산
 *  - sanitize: AI로 보내기 전에 학생 식별 정보를 가린다
 *  - ruleCheck: 기재요령 1차 규칙 검사 (AI 없이 즉시)
 */

/** 나이스 바이트: 한글 등 비ASCII 3바이트, 영문·숫자·공백·기호 1바이트, 줄바꿈 2바이트 */
export function neisBytes(s) {
  const str = String(s ?? '').replace(/\r\n/g, '\n');
  let b = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 10) b += 2;
    else if (c <= 0x7f) b += 1;
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

// ───────────────────────── 기재요령 1차 규칙 검사 ─────────────────────────

const BRANDS = [
  '유튜브', '인스타그램', '페이스북', '틱톡', '네이버', '카카오톡', '카카오', '구글', '넷플릭스', '챗GPT', '챗지피티',
  '나이키', '아디다스', '삼성', '애플', '아이폰', '갤럭시', '스타벅스', '맥도날드', '쿠팡', '디스코드', '줌', '노션',
  '패들렛', '캔바', '미리캔버스', '엔트리', '스크래치', '마인크래프트', '로블록스', '파워포인트', '엑셀', '한컴'
];

export const RULES = [
  {
    type: '대학·기관명',
    re: /[가-힣A-Za-z]+(?:대학교|대학원|대학)(?![가-힣]*(?:진학|입시|생활))/g,
    reason: '특정 대학명은 학교생활기록부에 기재할 수 없습니다.',
    basis: '기재요령 일반 원칙: 특정 대학·기관명 기재 금지',
    fix: '대학명을 빼고 학과·분야로 바꿔 쓰기 (예: "공학 계열")'
  },
  {
    type: '대회·수상',
    re: /[가-힣A-Za-z0-9]*(?:대회|경시|경진|올림피아드|공모전)(?:에서|에|을|를)?|(?:최우수상|우수상|장려상|금상|은상|동상|대상)(?:을|를)?\s*(?:수상|받)/g,
    reason: '교내외 대회명과 수상 실적은 수상경력 외 영역에 기재할 수 없습니다.',
    basis: '기재요령 일반 원칙: 대회 참여·수상 사실은 특기사항에 기재 불가',
    fix: '대회 대신 탐구 과정이나 활동 내용으로 서술'
  },
  {
    type: '상호·플랫폼명',
    re: new RegExp('(' + BRANDS.map(escapeRegex).join('|') + ')', 'g'),
    reason: '상호명, 브랜드, 플랫폼 이름은 기재하지 않습니다.',
    basis: '기재요령 일반 원칙: 특정 상호명·상표명 기재 금지',
    fix: '일반 명사로 바꾸기 (예: "동영상 공유 플랫폼", "협업 도구")'
  },
  {
    type: '영문 표기',
    re: /[A-Za-z][A-Za-z0-9.+#-]{1,}/g,
    reason: '영문 표기는 원칙적으로 한글로 바꿔 씁니다. 교과 특성상 필요한 경우만 허용됩니다.',
    basis: '기재요령 일반 원칙: 한글 사용, 영문은 제한적 허용',
    fix: '한글로 바꾸거나 우리말 풀이로 쓰기'
  },
  {
    type: '비교·과장 표현',
    re: /(?:또래|다른 학생|다른 친구|친구들|반 친구)(?:들)?(?:보다|에 비해)|(?:학급|반|학년|전교)에서\s*(?:가장|제일|최고)|(?:최고의|독보적|타의 추종|누구보다|단연)/g,
    reason: '다른 학생과 비교하거나 지나치게 과장하는 표현은 피합니다.',
    basis: '기재요령 작성 유의사항: 객관적 관찰 사실 중심 기재',
    fix: '비교 없이 학생이 한 행동과 변화를 구체적으로 서술'
  },
  {
    type: '반복 강조',
    re: /(매우|아주|정말|너무|굉장히)\s*\1/g,
    reason: '같은 부사를 겹쳐 쓰는 표현은 문장을 어색하게 만듭니다.',
    basis: '작성 유의사항: 간결하고 정확한 문장',
    fix: '하나만 남기거나 구체적인 근거로 바꾸기'
  },
  {
    type: '부모·가정 정보',
    re: /(?:아버지|어머니|부모님|부모|아빠|엄마)(?:의|께서|가|는|와)?\s*(?:직업|회사|직장|근무|운영)?/g,
    reason: '부모의 직업·사회경제적 지위 등 가정 정보는 기재할 수 없습니다.',
    basis: '기재요령 일반 원칙: 부모 직업 등 사회·경제적 지위 암시 금지',
    fix: '가정 관련 내용을 빼고 학생 본인의 활동만 서술'
  },
  {
    type: '교외 활동',
    re: /교외\s*(?:활동|봉사|체험)|해외\s*(?:연수|봉사|체험)|어학연수|사설\s*기관|학원/g,
    reason: '교외 활동, 해외 연수, 사교육 관련 내용은 기재할 수 없습니다.',
    basis: '기재요령 일반 원칙: 교외 기관 활동·사교육 유발 요소 기재 금지',
    fix: '교내 교육활동에서 관찰한 내용만 쓰기'
  },
  {
    type: '주어 사용',
    re: /(?:^|[.\s])(?:이 학생|학생은|본 학생|위 학생)/g,
    reason: '특기사항은 주어 없이 관찰 내용으로 시작하는 것이 일반적입니다.',
    basis: '작성 관행: 주어 생략, 명사형 종결',
    fix: '주어를 빼고 서술'
  }
];

/**
 * 규칙 기반 1차 검사. AI 없이 브라우저에서 바로 돌린다.
 * @returns {Array<{type, found, reason, basis, suggestion, source}>}
 */
export function ruleCheck(text) {
  const out = [];
  const seen = new Set();
  RULES.forEach((r) => {
    const re = new RegExp(r.re.source, r.re.flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      const found = m[0].trim().replace(/^[.\s]+/, '');
      if (!found) { re.lastIndex++; continue; }
      // 영문 규칙은 성취기준 코드처럼 대괄호 안에 있는 것은 넘긴다.
      if (r.type === '영문 표기' && /^\[?\d/.test(found)) continue;
      const key = r.type + '|' + found;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ type: r.type, found, reason: r.reason, basis: r.basis, suggestion: r.fix, source: '규칙' });
    }
  });
  return out;
}

/** 문장 끝이 명사형(~함, ~임, ~음 등)인지 대략 확인 */
export function endingCheck(text) {
  const sentences = String(text).split(/(?<=[.])\s+/).map((s) => s.trim()).filter(Boolean);
  const bad = sentences.filter((s) => /(?:다|요|니다)\.?$/.test(s));
  return bad.map((s) => ({
    type: '문체·종결',
    found: s.length > 30 ? s.slice(-30) : s,
    reason: '생기부 문장은 보통 "~함", "~임", "~보임"처럼 명사형으로 끝냅니다.',
    basis: '작성 관행: 명사형 종결',
    suggestion: '문장 끝을 명사형으로 바꾸기',
    source: '규칙'
  }));
}
