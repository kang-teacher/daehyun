import Anthropic from '@anthropic-ai/sdk';

/**
 * Claude 호출 래퍼. API 키는 서버 환경변수 ANTHROPIC_API_KEY에서만 읽는다.
 * 브라우저는 키를 볼 수 없다.
 */

let client;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    const e = new Error('서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다. Vercel 프로젝트 설정 > Environment Variables에서 추가하세요.');
    e.status = 500;
    throw e;
  }
  if (!client) client = new Anthropic();
  return client;
}

export function pickModel(fast) {
  return fast
    ? (process.env.FAST_MODEL || 'claude-haiku-5-5').trim()
    : (process.env.MODEL || 'claude-opus-5-5').trim();
}

/**
 * @param {object} o
 * @param {string} o.system
 * @param {Array} o.messages
 * @param {boolean} [o.fast] 빠른 모드
 * @param {object} [o.schema] JSON 스키마를 주면 구조화 출력으로 받아 파싱해 돌려준다
 * @returns {Promise<{text?: string, json?: any, model: string}>}
 */
export async function askClaude({ system, messages, fast = false, schema = null }) {
  if (process.env.MOCK_AI === '1') return mock({ messages, schema });

  const c = getClient();
  const model = pickModel(fast);
  const effort = (fast ? process.env.FAST_EFFORT || 'low' : process.env.EFFORT || 'medium').trim();
  const params = {
    model,
    max_tokens: 16000,
    system,
    messages,
    output_config: { effort }
  };
  if (schema) params.output_config.format = { type: 'json_schema', schema };

  let res;
  // 안전 분류기가 거절하면 서버에서 다른 모델로 자동 재시도한다(지원 모델만).
  if (/^claude-(opus-5|fable-5|sonnet-5-5)/.test(model)) {
    res = await c.beta.messages.create({
      ...params,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default'
    });
  } else {
    res = await c.messages.create(params);
  }

  if (res.stop_reason === 'refusal') {
    const e = new Error('AI가 이 요청에 응답하지 않았습니다. 입력 내용을 바꿔 다시 시도해 주세요.');
    e.status = 422;
    throw e;
  }
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!text) {
    const e = new Error('빈 응답을 받았습니다. 다시 시도해 주세요.');
    e.status = 502;
    throw e;
  }
  if (schema) {
    try {
      return { json: JSON.parse(text), model: res.model };
    } catch {
      const e = new Error('AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.');
      e.status = 502;
      throw e;
    }
  }
  return { text, model: res.model };
}

/** Anthropic SDK 오류를 사용자에게 보여 줄 한국어 메시지로 바꾼다. */
export function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return { status: 500, message: '서버의 Claude API 키가 올바르지 않습니다.' };
  if (err instanceof Anthropic.PermissionDeniedError) return { status: 500, message: 'API 키에 이 모델을 쓸 권한이 없습니다.' };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, message: '요청이 많아 잠시 막혔습니다. 잠시 후 다시 시도해 주세요.' };
  if (err instanceof Anthropic.BadRequestError) return { status: 400, message: 'AI 요청 형식 오류: ' + err.message };
  if (err instanceof Anthropic.APIError) return { status: 502, message: `Claude API 오류 (${err.status ?? '연결'}): 잠시 후 다시 시도해 주세요.` };
  return { status: err.status || 500, message: err.message || '알 수 없는 오류가 발생했습니다.' };
}

// ───────── 개발용 가짜 응답 (MOCK_AI=1) ─────────
function mock({ messages, schema }) {
  const last = String(messages[messages.length - 1].content);
  if (schema && schema.properties.variants) {
    return { model: 'mock', json: { variants: ['수업 시간마다 주어진 과제를 꼼꼼하게 마무리하며 성실한 태도를 꾸준히 보임.', '맡은 과제를 끝까지 책임지고 해내는 모습이 돋보임.', '과제 수행 과정에서 성실함과 끈기를 보여 줌.'] } };
  }
  if (schema && schema.properties.issues) {
    return {
      model: 'mock',
      json: {
        issues: [{ type: '맞춤법·띄어쓰기', found: '할수', reason: '의존 명사 "수"는 띄어 씁니다.', basis: '한글 맞춤법 띄어쓰기 원칙', suggestion: '할 수' }],
        revised: last.split('[검사할 문장]').pop().trim().replace('할수', '할 수')
      }
    };
  }
  if (last.startsWith('다음 생기부 문장을')) return { model: 'mock', text: '모둠 활동에서 친구의 의견을 끝까지 경청하고 정리하여 협업을 이끎.' };
  if (last.includes('[작성 항목]')) {
    return { model: 'mock', text: '모둠 활동에서 친구의 의견을 끝까지 경청하고 핵심을 정리하여 모둠의 결론을 이끌어 내는 등 배려심과 책임감이 돋보임. 발표에 대한 부담을 느끼면서도 짧은 발표를 차근차근 준비하며 자신감을 키워 가는 모습이 보임.' };
  }
  return { model: 'mock', text: '(개발용 가짜 응답) 질문을 잘 받았습니다.' };
}
