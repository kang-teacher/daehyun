/**
 * 서버에서 Claude에 보낼 프롬프트를 만든다.
 * 요청 본문에는 학생 식별 정보 필드가 아예 없다. (이름·번호·학년·반을 받는 필드가 없음)
 */

export const TYPES = {
  behavior: {
    label: '행동특성 및 종합의견',
    guide: '학교생활 전반에서 관찰된 태도, 인성, 교우관계, 성장 모습을 종합적으로 서술한다. ' +
      '보완이 필요한 특성은 단정하거나 부정적으로 쓰지 말고, 노력하는 모습이나 성장 가능성 중심으로 순화해 서술한다.'
  },
  subject: {
    label: '교과학습발달상황 세부능력 및 특기사항',
    guide: '성취기준과 관련된 수업 활동에서 학생이 실제로 한 활동, 탐구 과정, 근거, 그 과정에서 드러난 역량과 태도를 구체적으로 서술한다. ' +
      '흐름은 활동 계기 → 탐구 과정 → 근거 → 드러난 역량 순서를 따른다. 성취수준에 맞게 서술의 깊이를 조절한다.'
  },
  autonomy: {
    label: '창의적 체험활동 자율·자치활동 특기사항',
    guide: '활동에서 맡은 역할, 참여 과정, 그로 인한 변화와 성장을 서술한다.'
  },
  club: {
    label: '창의적 체험활동 동아리활동 특기사항',
    guide: '동아리에서 한 활동 내용, 맡은 역할, 협업 과정, 드러난 역량을 서술한다.'
  },
  career: {
    label: '창의적 체험활동 진로활동 특기사항',
    guide: '진로 탐색 활동의 내용, 계기, 탐색 과정, 진로 인식의 변화를 서술한다.'
  }
};

export function systemPrompt(schoolLevel) {
  const level = ['초등학교', '중학교', '고등학교'].includes(schoolLevel) ? schoolLevel : '고등학교';
  return [
    `당신은 대한민국 ${level} 교사로서 학교생활기록부 문장을 작성합니다.`,
    '',
    '작성 규칙:',
    '- 교사가 관찰한 사실을 바탕으로 쓰는 관찰자 문체를 사용하고, 문장은 "~함", "~임", "~보임"처럼 명사형으로 끝낸다.',
    '- 주어(학생 이름, "이 학생은")를 쓰지 않는다. 입력에 "학생"이나 "[가림]"이 있으면 개인정보를 가린 표시이므로 그대로 옮기지 않는다.',
    '- 입력에 없는 활동, 수치, 성과를 지어내지 않는다. 재료가 부족하면 있는 내용만으로 짧게 쓴다.',
    '- 대학명, 기관명, 대회명, 수상 실적, 교외 활동, 상호·브랜드·플랫폼명, 부모 관련 정보를 쓰지 않는다.',
    '- 다른 학생과의 비교, 과장된 수식어, 같은 표현의 반복을 피한다.',
    '- 영어 단어는 꼭 필요한 경우가 아니면 한글로 바꿔 쓴다.',
    '- 줄바꿈 없이 한 문단으로 쓴다.',
    '- 출력은 생기부 본문만 쓴다. 제목, 설명, 따옴표, 머리말을 붙이지 않는다.'
  ].join('\n');
}

const line = (label, v) => (v ? `[${label}] ${v}` : null);

/** 생성 요청 본문. f는 이미 서버에서 정리(clip·sanitize)된 필드다. */
export function generatePrompt(f) {
  const type = TYPES[f.type] || TYPES.behavior;
  const target = f.targetBytes;
  const lines = [
    `[작성 항목] ${type.label}. ${type.guide}`,
    `[분량] 나이스 기준 ${target}바이트 이하 (한글 약 ${Math.floor(target / 3)}자 이하). 분량의 85~95%를 목표로 한다.`,
    line('과목', f.subject),
    line('성취기준·평가요소', f.standard),
    line('성취수준', f.level),
    line('희망 진로·학과', f.career),
    line('활동명·동아리 성격', f.activity),
    line('맡은 역할', f.role),
    f.good.length ? `[강점 키워드] ${f.good.join(', ')}` : null,
    f.improve.length ? `[보완 키워드] ${f.improve.join(', ')}` : null,
    line('강점', f.strengths),
    line('보완점', f.weaknesses),
    f.notes ? `[관찰·활동 기록]\n${f.notes}` : null,
    line('교사 요청사항', f.request)
  ];
  if (f.styles.length) {
    lines.push('[문체 참고 예시] 아래 문장의 문체와 흐름만 참고하고 내용은 가져오지 않는다.');
    f.styles.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }
  return lines.filter(Boolean).join('\n');
}

export function shortenPrompt(text, target) {
  return `다음 생기부 문장을 의미와 문체를 유지하면서 나이스 기준 ${target}바이트(한글 약 ${Math.floor(target / 3)}자) 이하로 줄여라. 본문만 출력한다.\n\n${text}`;
}

export function similarPrompt(f) {
  return [
    `다음 생기부 문장과 의미는 같지만 표현과 문장 구조가 다른 문장을 ${f.count}개 만들어라.`,
    '각 문장은 원문과 비슷한 분량으로 쓰고, 원문에 없는 사실을 더하지 않는다.',
    f.request ? `[교사 요청사항] ${f.request}` : null,
    '',
    '[원문]',
    f.text
  ].filter((x) => x !== null).join('\n');
}

export const SIMILAR_SCHEMA = {
  type: 'object',
  properties: {
    variants: { type: 'array', items: { type: 'string' } }
  },
  required: ['variants'],
  additionalProperties: false
};

export function checkSystemPrompt(meta) {
  return [
    '당신은 학교생활기록부 기재요령을 잘 아는 검토 교사입니다.',
    `검토 대상: ${meta.schoolLevel} ${meta.grade ? meta.grade + '학년 ' : ''}${meta.year ? meta.year + '학년도 ' : ''}${meta.area || '학교생활기록부'} 문장`,
    '',
    '다음 항목을 중심으로 기재요령 위반이나 개선이 필요한 부분을 찾는다.',
    '- 대학·기관명, 대회·수상, 상호·플랫폼명, 영문 표기, 비교·과장 표현, 부모·가정 정보, 교외 활동',
    '- 맞춤법·띄어쓰기, 같은 표현의 반복, 명사형 종결이 아닌 문장, 근거 없는 평가',
    '',
    '규칙:',
    '- found에는 원문에 실제로 있는 표현을 글자 그대로 옮긴다.',
    '- basis에는 어떤 원칙에 근거했는지 짧게 쓴다. 기재요령의 쪽수나 원문을 지어내지 않는다.',
    '- 문제가 없으면 issues를 빈 배열로 둔다.',
    '- revised에는 지적 사항을 모두 반영한 전체 수정본을 쓴다. 원문 분량을 크게 늘리지 않는다.',
    '- "학생", "[가림]"은 개인정보를 가린 표시이므로 지적하지 않는다.'
  ].join('\n');
}

export const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          found: { type: 'string' },
          reason: { type: 'string' },
          basis: { type: 'string' },
          suggestion: { type: 'string' }
        },
        required: ['type', 'found', 'reason', 'basis', 'suggestion'],
        additionalProperties: false
      }
    },
    revised: { type: 'string' }
  },
  required: ['issues', 'revised'],
  additionalProperties: false
};

export const CHAT_SYSTEM = [
  '당신은 대한민국 교사의 업무를 돕는 도우미입니다. 학교생활기록부 작성, 수업 설계, 평가, 학급 운영 질문에 한국어로 친절하고 간결하게 답합니다.',
  '학생의 이름, 번호, 연락처 같은 개인정보를 묻거나 요구하지 않습니다. 입력에 "학생", "[가림]"이 있으면 개인정보를 가린 표시입니다.',
  '기재요령처럼 해마다 바뀌는 규정은 확실하지 않으면 그해 교육부 기재요령을 확인하라고 안내합니다.'
].join('\n');
