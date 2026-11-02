/**
 * 2026학년도 학교생활기록부 기재요령(고등학교) 기반 규칙.
 * 브라우저(즉시 검사)와 서버(AI 프롬프트)가 함께 쓴다.
 * 쪽수는 「2026학년도 학교생활기록부 기재요령 고등학교」(17개 시도교육청) 기준.
 */

const DOC = '2026 기재요령(고)';
export const REF = {
  ban: (item) => `${DOC} p.18–19 「작성 시 유의사항」 3-${item}`,
  school: `${DOC} p.19 「작성 시 유의사항」 4 (학교를 알 수 있는 내용)`,
  exaggerate: `${DOC} p.19 「작성 시 유의사항」 5-가 (과장·허위 기재 금지)`,
  ai: `${DOC} p.19 「작성 시 유의사항」 5-다 (AI 생성 자료 그대로 입력 금지)`,
  english: `${DOC} p.28 처리요령 ③ (한글 입력, 부득이한 경우 영문)`,
  writing: `${DOC} p.30 서술형 항목 입력 시 유의사항`,
  creative: `${DOC} p.82 창의적 체험활동 특기사항 가`,
  subject: `${DOC} p.95·117–118 세부능력 및 특기사항`,
  behavior: `${DOC} p.158–159 행동특성 및 종합의견`,
  limits: `${DOC} p.208 영역별 입력 가능 최대 글자수`
};

/** 영역별 최대 글자수(한글 기준)와 바이트. 나이스는 한글 3Byte, 영문·숫자 1Byte, 엔터 1Byte. */
export const AREAS = {
  behavior: { label: '행동특성 및 종합의견', chars: 300 },
  subject: { label: '과목별 세부능력 및 특기사항', chars: 500 },
  autonomy: { label: '자율·자치활동 특기사항', chars: 500 },
  club: { label: '동아리활동 특기사항', chars: 500 },
  career: { label: '진로활동 특기사항', chars: 500 },
  personal: { label: '개인별 세부능력 및 특기사항', chars: 500 },
  daily: { label: '일상생활 활동상황 특기사항', chars: 1000 }
};
Object.values(AREAS).forEach((a) => { a.bytes = a.chars * 3; });

/** 영문을 써도 되는 일반화된 명사·단위 (p.28 예시 + 흔한 단위) */
const ENGLISH_OK = new Set([
  'CEO', 'PD', 'UCC', 'IT', 'POP', 'CF', 'TV', 'PAPS', 'SNS', 'PPT', 'AI',
  'cm', 'mm', 'km', 'm', 'kg', 'g', 'mg', 'L', 'mL', 'ml', 'kWh', 'W', 'V', 'A', 'Hz', 'kHz', 'MHz', 'GB', 'MB', 'pH'
]);

const BRANDS = [
  '유튜브', '인스타그램', '인스타', '페이스북', '틱톡', '트위터', '네이버', '카카오톡', '카카오', '구글', '넷플릭스', '챗GPT', '챗지피티', '제미나이',
  '나이키', '아디다스', '삼성전자', '삼성', '엘지', '현대자동차', '애플', '아이폰', '갤럭시', '스타벅스', '맥도날드', '쿠팡', '디스코드', '노션',
  '패들렛', '캔바', '미리캔버스', '마인크래프트', '로블록스', '파워포인트', '한컴오피스', '에듀테크', '클래스팅', '하이클래스', '띵커벨', '카훗'
];

const UNIV_ABBR = ['서울대', '연세대', '고려대', '카이스트', '포스텍', '성균관대', '한양대', '서강대', '이화여대', '중앙대', '경희대', '한국외대',
  '서울시립대', '건국대', '동국대', '홍익대', '부산대', '경북대', '전남대', '충남대', '전북대', '충북대', '강원대', '제주대', '인하대', '아주대',
  '숙명여대', '국민대', '숭실대', '세종대', '광운대', '단국대', '가톨릭대', '한국교원대', '유니스트', '디지스트', '지스트'];
const UNIV_GENERIC = /^(?:의과|공과|교육|사범|간호|약학|법과|예술|경영|자연과학|인문|사회과학|농업생명과학|수의과|치과|한의과|음악|미술|체육|해당|희망|목표|지방|국립|사립|명문|일반|전문|해외|외국)/;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * severity
 *  - 위반: 기재요령이 명시적으로 금지하는 내용 (반드시 수정)
 *  - 수정 권장: 기재요령의 작성 방법에 맞지 않음
 *  - 확인 필요: 맥락에 따라 허용될 수 있어 교사 확인이 필요함
 */
export const RULES = [
  {
    type: '공인어학시험', severity: '위반',
    re: /TOEIC|TOEFL|TEPS|HSK|JPT|JLPT|DELF|DALF|TORFL|DELE|토익|토플|텝스|한자능력검정|한자급수|실용한자|상공회의소\s*한자/g,
    reason: '공인어학시험 참여 사실과 성적, 수상 실적은 어떤 항목에도 쓸 수 없습니다.',
    ref: REF.ban('가'), fix: '시험 관련 내용을 삭제하고 수업 중 관찰한 언어 활동으로 서술'
  },
  {
    type: '대회 참여·수상', severity: '위반',
    re: /[가-힣A-Za-z0-9]*(?:경시대회|경진대회|올림피아드|공모전|백일장|콘테스트|대회)(?:에서|에|을|를|의)?|(?:최우수상|우수상|장려상|금상|은상|동상|대상|입상|수상)(?:을|를|함|하여|하고|한)?/g,
    filter: (f) => !/^(?:체육대회|학급대회|학년대회)/.test(f),
    reason: '교내·외 대회 참여 사실과 성적, 수상 실적은 ‘수상경력’ 외 항목에 쓸 수 없습니다. 대회 이름을 단순 행사로 바꿔 쓰는 것도 안 됩니다.',
    ref: `${REF.ban('나')}, ${DOC} p.118`, fix: '대회 대신 수업·활동에서 보인 탐구 과정과 역량으로 서술'
  },
  {
    type: '체육대회 등 행사', severity: '확인 필요',
    re: /(?:체육대회|학급대회|학년대회)/g,
    reason: '학교 행사로서의 체육대회는 기재할 수 있지만, 순위·우승 같은 대회 성적은 쓸 수 없습니다.',
    ref: REF.ban('나'), fix: '성적·순위 없이 행사에서의 역할과 태도만 서술'
  },
  {
    type: '교외상', severity: '위반',
    re: /(?:표창장|감사장|공로상)/g,
    reason: '교외 기관·단체에서 받은 상(표창장, 감사장, 공로상 포함)은 기재할 수 없습니다.',
    ref: REF.ban('다'), fix: '삭제'
  },
  {
    type: '인증시험', severity: '위반',
    re: /[가-힣A-Za-z]*(?:인증시험|검정시험|능력시험|자격시험)/g,
    reason: '교내·외 인증시험 참여 사실이나 성적은 기재할 수 없습니다.',
    ref: REF.ban('라'), fix: '삭제'
  },
  {
    type: '모의고사·학력평가 성적', severity: '위반',
    re: /모의고사|모의평가|전국연합학력평가|학력평가|백분위|원점수|석차등급|\d\s*등급(?:을|을 받|으로)/g,
    filter: (f, text, i) => !/PAPS|건강체력/.test(text.slice(Math.max(0, i - 20), i)),
    reason: '모의고사·전국연합학력평가 성적(원점수, 석차, 등급, 백분위 등)과 관련 수상 실적은 기재할 수 없습니다.',
    ref: REF.ban('마'), fix: '성적 관련 내용 삭제'
  },
  {
    type: '논문·학회 발표', severity: '위반',
    re: /(?:학회|학술지|학회지)(?:에서|에|지에)?\s*(?:발표|투고|등재|게재)|논문을?\s*(?:투고|게재|발표|등재)/g,
    reason: '논문을 학회지 등에 투고·등재하거나 학회에서 발표한 사실은 기재할 수 없습니다.',
    ref: REF.ban('바'), fix: '삭제'
  },
  {
    type: '소논문·연구보고서', severity: '확인 필요',
    re: /소논문|연구\s*보고서/g,
    reason: '세특에는 연구보고서(소논문) 관련 사항을 쓸 수 없습니다. 성취기준상 작성이 가능한 과목(수학과제 탐구, 사회문제 탐구, 융합과학 탐구, 과학과제 연구, 사회과제 연구, 윤리문제 탐구)만 제목·주제·참여인원·소요시간을 빼고 쓸 수 있습니다.',
    ref: `${DOC} p.118 세특 바-5)`, fix: '해당 과목이 아니면 삭제, 해당 과목이면 제목·주제·인원·시간을 빼고 과정 중심으로 서술'
  },
  {
    type: '도서 출간', severity: '위반',
    re: /(?:책|도서|저서)(?:을|를)?\s*(?:출간|출판|발간)|출간함|출판함/g,
    reason: '도서를 출간한 사실은 기재할 수 없습니다.',
    ref: REF.ban('사'), fix: '삭제'
  },
  {
    type: '지식재산권', severity: '위반',
    re: /특허|실용신안|상표\s*(?:출원|등록)|디자인\s*(?:출원|등록)|지식재산권/g,
    reason: '특허·실용신안·상표·디자인 등 지식재산권 출원·등록 사실은 기재할 수 없습니다.',
    ref: REF.ban('아'), fix: '삭제'
  },
  {
    type: '해외 활동', severity: '위반',
    re: /어학\s*연수|해외\s*(?:봉사|연수|캠프|체험|탐방|활동|여행)|유학/g,
    reason: '어학연수, 해외 봉사 등 해외 활동 실적은 기재할 수 없습니다.',
    ref: REF.ban('자'), fix: '삭제'
  },
  {
    type: '부모의 사회·경제적 지위', severity: '위반',
    re: /(?:아버지|어머니|부모님?|아빠|엄마|삼촌|이모|고모|외삼촌|친척)(?:의|께서|가|는|와|이)?\s*(?:직업|직장|회사|근무하는|운영하는|일하는)?\s*(?:의사|변호사|판사|검사|교수|교사|사장|대표|임원|공무원|약사|회계사|간호사|기자|경찰|군인|목사|사업)/g,
    reason: '부모(친인척 포함)의 직종, 직업, 직장, 직위 등 사회·경제적 지위를 암시하는 내용은 기재할 수 없습니다.',
    ref: REF.ban('차'), fix: '가족 관련 내용을 빼고 학생 본인의 활동만 서술'
  },
  {
    type: '가족 언급', severity: '확인 필요',
    re: /(?:아버지|어머니|부모님|아빠|엄마|친척)/g,
    reason: '가족을 언급한 부분이 사회·경제적 지위를 암시하지 않는지 확인하세요.',
    ref: REF.ban('차'), fix: '꼭 필요하지 않으면 삭제'
  },
  {
    type: '장학금', severity: '위반',
    re: /장학생|장학금/g,
    reason: '장학생·장학금 관련 내용은 기재할 수 없습니다.',
    ref: REF.ban('카'), fix: '삭제'
  },
  {
    type: '대학명', severity: '위반',
    re: new RegExp('[가-힣A-Za-z]{2,}(?:대학교|대학원)|(?:' + UNIV_ABBR.map(esc).join('|') + ')(?=[^가-힣]|에|의|를|을|와|과|에서|학|생|$)|KAIST|POSTECH|UNIST|DGIST|GIST', 'g'),
    filter: (f) => !UNIV_GENERIC.test(f),
    reason: '구체적인 특정 대학명은 기재할 수 없습니다.',
    ref: REF.ban('타'), fix: '대학명을 빼고 "대학 탐방", "관심 학과" 등으로 서술'
  },
  {
    type: '상호명·플랫폼명', severity: '위반',
    re: new RegExp('(?:' + BRANDS.sort((a, b) => b.length - a.length).map(esc).join('|') + ')', 'g'),
    reason: '상호명(기업·브랜드·서비스 이름)은 기재할 수 없습니다.',
    ref: REF.ban('타'), fix: '일반 명사로 바꾸기 (예: 동영상 공유 플랫폼, 온라인 협업 도구, 생성형 AI)'
  },
  {
    type: '기관명', severity: '확인 필요',
    re: /[가-힣A-Za-z]{2,}(?:연구소|연구원|재단|협회|학회|공사|공단|병원|은행|박물관|미술관|과학관|센터|복지관|주식회사)|\(주\)/g,
    filter: (f) => !/^(?:교육청|교육지원청|교육연수원|교육과학연구원|교육정보원|진로진학지원센터|학생교육원)/.test(f) && !/교육청|교육지원청/.test(f),
    reason: '구체적인 기관명(기구, 단체, 조직 포함)은 기재할 수 없습니다. 교육부·시도교육청·교육지원청과 그 소속(직속)기관만 예외입니다.',
    ref: REF.ban('타'), fix: '교육관련기관이 아니면 "지역 과학관", "공공기관" 등으로 일반화'
  },
  {
    type: '강사명', severity: '위반',
    re: /[가-힣]{2,4}\s*(?:강사|교수|박사|작가|선생님)(?:님)?(?:의|을|를|과|와|이|가)?\s*(?:강연|강의|특강|초청|수업)/g,
    reason: '학생이 참여한 강의의 강사 이름은 기재할 수 없습니다.',
    ref: REF.ban('타'), fix: '이름을 빼고 "진로 특강", "전문가 초청 강연"처럼 서술'
  },
  {
    type: '자격증', severity: '위반',
    re: /[가-힣A-Za-z0-9]*자격증|컴퓨터활용능력|워드프로세서|정보처리기능사|[가-힣]+기능사\s*(?:자격|취득|합격)|(?:자격|급수)\s*(?:을|를)?\s*취득/g,
    reason: '자격증 명칭과 취득 사실은 ‘자격증 취득 및 국가직무능력표준 이수상황’ 외 항목에 쓸 수 없습니다.',
    ref: REF.ban('파'), fix: '삭제'
  },
  {
    type: '학교명·학교 별칭', severity: '위반',
    re: /[가-힣]{2,}(?:고등학교|여자고등학교|중학교|초등학교)|[가-힣]{2,}(?:고|여고|중)(?=\s*(?:축제|학생|학생회|체육대회|동아리|전통|교정))/g,
    filter: (f) => !/^(?:해당|우리|본|다른|상급|하급|인근|지역)/.test(f),
    reason: '재학 중인 학교를 알 수 있는 내용(학교명, 재단명, 학교 축제명, 학교 별칭 등)은 기재할 수 없습니다.',
    ref: REF.school, fix: '"학교 축제", "교내" 등으로 바꾸기'
  },
  {
    type: '방과후학교·온라인 강좌', severity: '위반',
    re: /방과\s*후\s*학교(?!\s*스포츠\s*클럽)|방과후\s*수업|K-?MOOC|KOCW|MOOC|무크/g,
    reason: '방과후학교 활동과 K-MOOC 등 온라인 공개강좌 관련 사항은 세특을 포함해 기재할 수 없습니다.',
    ref: `${DOC} p.118 세특 바, p.159 행특 나`, fix: '삭제'
  },
  {
    type: '교외 활동·사교육', severity: '확인 필요',
    re: /교외\s*(?:활동|봉사|체험|기관|캠프)|학원|과외|사설\s*기관|인강/g,
    reason: '학교교육계획 밖의 체험활동은 교육관련기관이 주최·주관하고 학교장이 승인한 경우에만 기재할 수 있고, 사교육 관련 내용은 기재할 수 없습니다.',
    ref: `${DOC} p.18 「작성 시 유의사항」 2`, fix: '교내 교육활동에서 관찰한 내용으로 바꾸기'
  },
  {
    type: '비교·과장 표현', severity: '확인 필요',
    re: /(?:또래|다른 학생|다른 친구|반 친구|친구)(?:들)?(?:보다|에 비해|과 달리)|(?:학급|반|학년|전교)에서\s*(?:가장|제일|최고|유일)|최고의|독보적|타의 추종|누구보다|단연코?|천재적|완벽(?:한|하게|히)|압도적/g,
    reason: '다른 학생과의 비교나 근거 없는 최상급 표현은 사실을 부풀린 기재로 보일 수 있습니다.',
    ref: REF.exaggerate, fix: '비교 대신 관찰한 구체적 행동과 근거로 서술'
  },
  {
    type: '반복 강조', severity: '수정 권장',
    re: /(매우|아주|정말|너무|굉장히|특히)\s*\1/g,
    reason: '같은 부사를 겹쳐 쓰면 과장된 인상을 주고 문장이 어색해집니다.',
    ref: REF.exaggerate, fix: '하나만 남기거나 구체적인 근거로 바꾸기'
  },
  {
    type: '특수문자·번호', severity: '수정 권장',
    re: /[①-⑳■□◆◇●○★☆※▶▷►⇒•]|(?:^|\n)\s*(?:\d+[.)]|[-*])\s/g,
    reason: '서술형 항목에는 특수문자와 문단 구분 기호(번호) 입력을 지양합니다.',
    ref: REF.writing, fix: '기호를 빼고 문장으로 이어 쓰기'
  }
];

/** 영문 표기: 허용 목록 밖의 영문 단어만 표시 */
function englishIssues(text) {
  const out = [];
  const seen = new Set();
  const re = /[A-Za-z][A-Za-z0-9+#-]*/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const w = m[0];
    if (seen.has(w)) continue;
    seen.add(w);
    if (ENGLISH_OK.has(w) || ENGLISH_OK.has(w.toUpperCase())) continue;
    const before = text.slice(Math.max(0, m.index - 1), m.index);
    if (/\d/.test(before) && w.length <= 3) continue; // 10cm, 5kg 같은 단위
    if (/^(?:TOEIC|TOEFL|TEPS|HSK|JPT|JLPT|DELF|DALF|TORFL|DELE|MOOC|KMOOC|KOCW|KAIST|POSTECH|UNIST|DGIST|GIST)$/i.test(w)) continue; // 다른 규칙에서 처리
    out.push({
      type: '영문 표기', severity: '확인 필요', found: w,
      reason: '학교생활기록부는 한글로 입력하고, 일반화된 명사(CEO, PD, UCC, IT, TV, SNS, PPT, AI 등)·고유명사(도서명·저자명)·단위 등 부득이한 경우에만 영문을 씁니다.',
      basis: REF.english, suggestion: '한글로 바꿔 쓰거나 꼭 필요한 고유명사인지 확인', source: '규칙'
    });
  }
  return out;
}

/** 문장이 명사형 어미(~함, ~임, ~음, ~됨 등, 받침 ㅁ)로 끝나는지 확인 */
function endsWithNounForm(sentence) {
  const s = sentence.replace(/[\s.)"'”’\]]+$/, '');
  const ch = s.charCodeAt(s.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return true; // 숫자·영문·괄호로 끝나면 판단하지 않음
  return (ch - 0xac00) % 28 === 16; // 종성 ㅁ
}

export function endingIssues(text) {
  // 날짜(2026.03.04.)를 문장 끝으로 오인하지 않도록 한글 뒤 마침표에서만 나눈다.
  const parts = String(text).split(/(?<=[가-힣]\.)\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  return parts.filter((s) => /[가-힣]/.test(s) && !endsWithNounForm(s)).map((s) => ({
    type: '명사형 종결', severity: '수정 권장', found: s.split(/\s+/).slice(-1)[0],
    reason: '특기사항 등 서술형 문장은 명사형 어미(~함, ~임, ~음, ~됨)로 끝냅니다.',
    basis: REF.writing, suggestion: '문장 끝을 명사형으로 바꾸기 (예: 뛰어나다 → 뛰어남)', source: '규칙'
  }));
}

/** 영역 최대 글자수 초과 */
export function lengthIssue(text, areaKey, bytesFn) {
  const area = AREAS[areaKey];
  if (!area) return [];
  const b = bytesFn(text);
  if (b <= area.bytes) return [];
  return [{
    type: '글자수 초과', severity: '위반', found: `${b.toLocaleString()} / ${area.bytes.toLocaleString()} 바이트`,
    reason: `${area.label}은(는) 한글 기준 ${area.chars}자(${area.bytes}바이트)까지 입력할 수 있습니다. 초과분을 다른 영역에 옮겨 적는 것도 안 됩니다.`,
    basis: `${REF.limits}, ${DOC} p.28`, suggestion: `${(b - area.bytes).toLocaleString()}바이트 이상 줄이기`, source: '규칙', noHighlight: true
  }];
}

/** 규칙 기반 1차 검사 (AI 없이 즉시) */
export function ruleCheck(text, areaKey, bytesFn) {
  const hits = [];
  RULES.forEach((r) => {
    const re = new RegExp(r.re.source, r.re.flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      const raw = m[0];
      if (!raw.trim()) { re.lastIndex++; continue; }
      const found = raw.trim();
      if (r.filter && !r.filter(found, text, m.index)) continue;
      const start = m.index + raw.indexOf(found);
      const end = start + found.length;
      // 같은 위치를 여러 규칙이 잡지 않게 (규칙 순서가 우선순위)
      if (hits.some((h) => start < h.end && end > h.start)) continue;
      hits.push({ rule: r, start, end });
    }
  });
  // 같은 규칙이 바로 이어서 잡은 곳은 하나로 합친다. (경시대회에서 금상을 수상함 → 1건)
  hits.sort((a, b) => a.start - b.start);
  const merged = [];
  hits.forEach((h) => {
    const last = merged[merged.length - 1];
    if (last && last.rule === h.rule && h.start - last.end <= 6 && !/[.\n]/.test(text.slice(last.end, h.start))) last.end = h.end;
    else merged.push({ ...h });
  });
  const seen = new Set();
  const out = [];
  merged.forEach(({ rule: r, start, end }) => {
    const found = text.slice(start, end);
    const key = r.type + '|' + found;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ type: r.type, severity: r.severity, found, reason: r.reason, basis: r.ref, suggestion: r.fix, source: '규칙' });
  });
  const all = [...out, ...englishIssues(text), ...endingIssues(text)];
  if (areaKey && bytesFn) all.unshift(...lengthIssue(text, areaKey, bytesFn));
  const order = { 위반: 0, '수정 권장': 1, '확인 필요': 2 };
  return all.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** AI 프롬프트에 넣을 기재요령 요약 (교사가 읽기 쉬운 우리말 요약) */
export const GUIDE_SUMMARY = `[2026학년도 학교생활기록부 기재요령(고등학교) 핵심]
1. 기재 불가 (어떤 항목에도 쓸 수 없음, p.18–19 작성 시 유의사항 3)
 가. 공인어학시험(TOEIC, TOEFL, TEPS, HSK, JPT, JLPT, 한자능력검정 등) 참여 사실, 성적, 수상
 나. 교내·외 대회 참여 사실과 성적, 수상 실적 (교내대회는 '수상경력'에만, 대회명을 단순 행사로 바꿔 쓰는 것도 불가)
 다. 교외 기관·단체에서 받은 상 (표창장, 감사장, 공로상 포함)
 라. 교내·외 인증시험 참여 사실이나 성적
 마. 모의고사·전국연합학력평가 성적(원점수, 석차, 등급, 백분위 등)과 관련 수상
 바. 논문의 학회지 투고·등재, 학회 발표 사실
 사. 도서 출간 사실
 아. 특허, 실용신안, 상표, 디자인 등 지식재산권 출원·등록 사실
 자. 어학연수, 해외 봉사 등 해외 활동 실적
 차. 부모(친인척 포함)의 사회·경제적 지위(직종, 직업, 직장, 직위) 암시
 카. 장학생·장학금 관련 내용
 타. 구체적인 특정 대학명, 기관명(기구·단체·조직 포함, 교육부·교육청·교육지원청과 소속기관은 예외), 상호명, 강사명
 파. 자격증 명칭과 취득 사실
2. 재학 중인 학교를 알 수 있는 내용(학교명, 재단명, 학교 축제명, 학교 별칭) 기재 불가 (p.19 유의사항 4)
3. 항목과 관련 없는 내용, 단순 사실을 과장하거나 부풀린 내용, 사실과 다른 내용 기재 금지 (p.19 유의사항 5-가)
4. AI로 생성한 자료를 그대로 입력하는 것 금지. 교사가 허위·과장 여부와 유의사항 준수를 확인해야 함 (p.19 유의사항 5-다)
5. 문자는 한글로 입력. 영문은 부득이한 경우만: 일반화된 명사(CEO, PD, UCC, IT, POP, CF, TV, PAPS, SNS, PPT, AI 등), 고유명사(도서명과 저자명 등), 단위 (p.28)
6. 서술형 문장은 명사형 어미로 종결, 특수문자·문단 구분 기호(번호) 입력 지양, 문단 단위 줄 바꿈은 가능 (p.30)
7. 창체 특기사항: 활동실적, 진보의 정도, 행동의 변화를 종합해 개별적 특성이 드러나게. 개별 특성이 드러나지 않는 활동의 단순 나열 지양. 횟수·시간 등 정량 기록 가능 (p.82)
 - 자율·자치: 결과 평가보다 활동 과정에서 드러난 행동 특성, 참여도, 협력도, 실제 역할 위주. 임원은 '전교/학년/학급'과 재임기간 병기 (p.83)
 - 동아리: 참여도, 협력도, 열성도, 활동실적을 참고해 실제 활동과 역할 위주 (p.83)
 - 진로: 진로 관련 자질, 학생의 노력과 활동, 참여도·의욕·태도의 변화, 상담·관찰 내용 위주 (p.85)
8. 세특: 학생참여형 수업과 수행평가에서 관찰한 내용을 바탕으로 성취기준에 따른 성취수준의 특성, 학습활동 참여도, 자기주도적 학습에 의한 변화와 성장 중심. 활동의 단순 나열이나 성취기준 지식의 단순 서술 지양. 방과후학교, K-MOOC 등, 연구보고서(소논문, 일부 과목 예외) 관련 기재 불가 (p.95, 117–118)
9. 행특: 학년 동안 지속적으로 관찰한 행동특성을 바탕으로 학생을 총체적으로 이해할 수 있게, 성장 정도·특기사항·발전 가능성을 고려해 성장을 지원하는 교육적 관점에서 작성. 다른 항목에 쓸 수 없는 내용은 행특에도 불가 (p.158–159)
10. 최대 글자수(한글 기준, 나이스 1자=3Byte, 영문·숫자 1Byte, 엔터 1Byte): 행특 300자, 과목별 세특 500자, 자율·자치 500자, 동아리 500자, 진로 500자 (p.208)`;
