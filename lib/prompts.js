/**
 * 서버에서 Claude에 보낼 프롬프트를 만든다.
 * 요청 본문에는 학생 식별 정보 필드가 아예 없다. (이름·번호·학년·반을 받는 필드가 없음)
 * 기재요령 내용은 public/js/guide2026.js 의 요약을 그대로 쓴다.
 */
import { GUIDE_SUMMARY, AREAS } from '../public/js/guide2026.js';

export const TYPES = {
  behavior: {
    label: '행동특성 및 종합의견',
    guide: '학년 동안 지속적으로 관찰한 학생의 학습, 행동, 인성 전반의 행동특성을 바탕으로 학생을 총체적으로 이해할 수 있게 쓴다. ' +
      '성장 정도, 특기사항, 발전 가능성을 고려해 성장을 지원하는 교육적 관점에서 쓴다. ' +
      '보완이 필요한 특성은 단정하거나 낙인찍지 말고, 구체적인 행동과 노력·변화의 모습, 성장 가능성 중심으로 서술한다.'
  },
  subject: {
    label: '과목별 세부능력 및 특기사항',
    guide: '학생참여형 수업과 수행평가에서 관찰한 내용을 바탕으로, 성취기준에 따른 성취수준의 특성, 학습활동 참여도, 자기주도적 학습에 의한 변화와 성장을 중심으로 쓴다. ' +
      '활동의 단순 나열이나 성취기준에 이미 적힌 지식의 단순 서술을 피하고, 학생이 무엇을 어떻게 탐구했고 그 과정에서 어떤 이해와 역량이 드러났는지 구체적으로 쓴다. ' +
      '흐름은 활동 계기·과제 → 탐구 과정과 방법 → 근거와 결과 → 드러난 역량·태도·성장 순서를 따른다. 성취수준에 맞게 서술의 깊이를 조절한다.'
  },
  autonomy: {
    label: '창의적 체험활동 자율·자치활동 특기사항',
    guide: '활동 결과에 대한 평가보다 활동 과정에서 드러난 개별적인 행동 특성, 참여도, 협력도, 실제 역할과 활동 위주로 쓴다. ' +
      '임원 활동이 있으면 전교·학년·학급 구분을 밝힌다. 개별 특성이 드러나지 않는 활동의 단순 나열은 피한다.'
  },
  club: {
    label: '창의적 체험활동 동아리활동 특기사항',
    guide: '참여도, 협력도, 열성도, 특별한 활동실적을 참고하여 실제적인 활동과 역할 위주로 쓴다. 개별 특성이 드러나지 않는 활동의 단순 나열은 피한다.'
  },
  career: {
    label: '창의적 체험활동 진로활동 특기사항',
    guide: '진로와 관련된 학생의 자질, 학생이 수행한 노력과 활동, 활동 참여도·의욕·태도의 변화, 상담·관찰 내용을 중심으로 실제적인 활동과 역할 위주로 쓴다.'
  }
};

export function systemPrompt(schoolLevel) {
  const level = ['초등학교', '중학교', '고등학교'].includes(schoolLevel) ? schoolLevel : '고등학교';
  return [
    `당신은 대한민국 ${level} 교사가 학교생활기록부 서술형 항목 초안을 쓰도록 돕습니다. 교사가 최종 확인하고 고쳐 쓸 초안입니다.`,
    '',
    GUIDE_SUMMARY,
    '',
    '[작성 규칙]',
    '- 위 기재요령을 반드시 지킨다. 기재 불가 항목이 입력 재료에 있으면 그 내용은 빼고 쓴다.',
    '- 교사가 관찰한 사실을 바탕으로 쓰는 관찰자 문체를 쓰고, 모든 문장을 "~함", "~임", "~보임", "~됨"처럼 명사형 어미로 끝낸다.',
    '- 주어(학생 이름, "이 학생은", "학생은")를 쓰지 않는다. 입력의 "학생", "[가림]"은 개인정보를 가린 표시이므로 옮기지 않는다.',
    '- 입력에 없는 활동, 수치, 성과, 결과를 지어내지 않는다. 다만 입력된 사실의 과정, 방법, 그때 보인 태도와 역량, 의미와 변화는 풀어서 자세히 쓸 수 있다.',
    '- 다른 학생과 비교하지 않고, "최고의", "탁월한 천재성" 같은 근거 없는 과장을 쓰지 않는다. 같은 표현을 반복하지 않는다.',
    '- 특수문자와 번호 목록을 쓰지 않고, 줄바꿈 없이 한 문단으로 쓴다.',
    '- 출력은 생기부 본문만 쓴다. 제목, 설명, 따옴표, 머리말, 분량 표시를 붙이지 않는다.'
  ].join('\n');
}

const line = (label, v) => (v ? `[${label}] ${v}` : null);

/** 나이스 바이트를 한글 글자 수로 대략 바꾼다. 띄어쓰기를 고려해 약 2.75바이트를 한 글자로 본다. */
export const toChars = (bytes) => Math.round(bytes / 2.75);

export function lengthRule(target) {
  const min = Math.round(target * 0.88);
  return { min, text: `나이스 기준 ${min}~${target}바이트, 띄어쓰기 포함 한글 약 ${toChars(min)}~${toChars(target)}자. 이 분량을 반드시 채운다. 이보다 짧으면 안 된다.` };
}

/** 생성 요청 본문. f는 이미 서버에서 정리(clip·sanitize)된 필드다. */
export function generatePrompt(f) {
  const type = TYPES[f.type] || TYPES.behavior;
  const area = AREAS[f.type];
  const lr = lengthRule(f.targetBytes);
  const lines = [
    `[작성 항목] ${type.label}. ${type.guide}`,
    `[분량] ${lr.text}${area ? ` (이 영역의 최대 입력 한도는 한글 ${area.chars}자, ${area.bytes}바이트)` : ''}`,
    '[분량을 채우는 방법] 재료가 짧으면 입력된 사실 하나하나를 장면, 방법, 태도, 드러난 역량, 변화와 성장 순서로 풀어 쓴다. 없는 사실을 새로 만들지는 않는다.',
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

export function expandPrompt(bytes, target) {
  const lr = lengthRule(target);
  return `방금 쓴 글은 ${bytes}바이트(한글 약 ${toChars(bytes)}자)로 목표보다 짧다. 처음 준 재료를 다시 살펴, 입력된 사실 안에서 활동의 구체적인 장면과 방법, 그 과정에서 보인 태도와 역량, 변화와 성장, 앞으로의 발전 가능성을 더 자세히 풀어 써서 ${lr.text} 새로운 활동, 수치, 성과는 지어내지 않는다. 고쳐 쓴 본문만 출력한다.`;
}

export function shortenPrompt(bytes, target) {
  const lr = lengthRule(target);
  return `방금 쓴 글은 ${bytes}바이트로 한도를 넘는다. 의미와 문체를 유지하면서 덜 중요한 수식어와 중복을 줄여 ${lr.text.replace('이 분량을 반드시 채운다. 이보다 짧으면 안 된다.', '한도를 넘지 않는다.')} 고쳐 쓴 본문만 출력한다.`;
}

export function similarPrompt(f) {
  return [
    `다음 생기부 문장과 의미는 같지만 표현과 문장 구조가 다른 문장을 ${f.count}개 만들어라.`,
    '각 문장은 원문과 비슷한 분량으로 쓰고, 원문에 없는 사실을 더하지 않는다. 기재요령에 어긋나는 표현이 원문에 있으면 고쳐 쓴다.',
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
    '당신은 학교생활기록부 기재요령에 밝은 고등학교 학생부 점검 담당 교사입니다. 동료 교사가 쓴 문장을 실제 학생부 점검처럼 현실적으로 검토합니다.',
    `검토 대상: ${meta.schoolLevel} ${meta.grade ? meta.grade + '학년 ' : ''}${meta.year ? meta.year + '학년도 ' : ''}「${meta.area || '학교생활기록부'}」 문장`,
    '',
    GUIDE_SUMMARY,
    '',
    '[검토 방법]',
    '- 위 기재요령 기준으로 문장을 점검한다. 기준에 없는 개인 취향의 문체 지적은 하지 않는다.',
    '- severity는 다음 중 하나로 정한다.',
    '  · 위반: 기재요령이 명시적으로 금지하는 내용(기재 불가 항목, 학교명, 글자수 초과 등). 반드시 고쳐야 함.',
    '  · 수정 권장: 기재요령의 작성 방법(명사형 종결, 단순 나열 지양, 과장 표현 등)에 맞지 않음.',
    '  · 확인 필요: 맥락에 따라 허용될 수 있어 교사가 사실 여부나 허용 여부를 확인해야 함(교육관련기관인지, 실제 관찰한 사실인지 등).',
    '- 다음은 지적하지 않는다: 허용된 영문(CEO, PD, UCC, IT, POP, CF, TV, PAPS, SNS, PPT, AI, 단위, 도서명·저자명), 날짜·기간 표기, 횟수·시간 같은 정량 기록, 교육부·교육청·교육지원청 기관명, 학교 행사 자체, "학생"·"[가림]" 표시.',
    '- 맞춤법과 띄어쓰기 오류, 어색한 문장, 의미가 모호한 표현, 영역에 맞지 않는 내용(예: 행특에 세특 내용)도 찾는다. 이때 type은 "맞춤법·띄어쓰기", "문장 다듬기", "영역 부적합" 등으로 쓴다.',
    '- 근거 없이 학생을 높이는 평가(예: "뛰어난 리더십을 지님")만 있고 관찰 사실이 없으면 "근거 부족"으로 확인 필요를 준다.',
    '- found에는 원문에 실제로 있는 표현을 글자 그대로, 되도록 짧게 옮긴다.',
    '- basis에는 위 요약에 적힌 기재요령 항목과 쪽수만 쓴다(예: "2026 기재요령(고) p.19 유의사항 3-타"). 맞춤법은 "한글 맞춤법"으로 쓴다. 쪽수를 지어내지 않는다.',
    '- suggestion에는 그대로 바꿔 넣을 수 있는 구체적인 수정 문구를 쓴다.',
    '- 같은 문제를 중복해서 쓰지 않는다. 문제가 없으면 issues를 빈 배열로 둔다.',
    '- revised에는 지적 사항을 모두 반영한 전체 수정본을 쓴다. 기재 불가 내용은 빼고, 원문 분량을 크게 늘리거나 줄이지 않으며, 원문에 없는 사실을 더하지 않는다.',
    '- summary에는 전체 총평을 한두 문장으로 쓴다.'
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
          severity: { type: 'string', enum: ['위반', '수정 권장', '확인 필요'] },
          type: { type: 'string' },
          found: { type: 'string' },
          reason: { type: 'string' },
          basis: { type: 'string' },
          suggestion: { type: 'string' }
        },
        required: ['severity', 'type', 'found', 'reason', 'basis', 'suggestion'],
        additionalProperties: false
      }
    },
    revised: { type: 'string' },
    summary: { type: 'string' }
  },
  required: ['issues', 'revised', 'summary'],
  additionalProperties: false
};

export const CHAT_SYSTEM = [
  '당신은 대한민국 교사의 업무를 돕는 도우미입니다. 학교생활기록부 작성, 수업 설계, 평가, 학급 운영 질문에 한국어로 친절하고 간결하게 답합니다.',
  '학생의 이름, 번호, 연락처 같은 개인정보를 묻거나 요구하지 않습니다. 입력에 "학생", "[가림]"이 있으면 개인정보를 가린 표시입니다.',
  '학교생활기록부 관련 질문은 아래 2026학년도 기재요령(고등학교) 요약을 근거로 답하고, 요약에 없는 세부 사항은 기재요령 원문이나 교육지원청에 확인하라고 안내합니다.',
  '',
  GUIDE_SUMMARY
].join('\n');
