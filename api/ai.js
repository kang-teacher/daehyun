import { askClaude, describeError, pickModel } from '../lib/claude.js';
import { checkPassword, readJson, send } from '../lib/http.js';
import {
  TYPES, systemPrompt, generatePrompt, shortenPrompt, expandPrompt, lengthRule, similarPrompt, SIMILAR_SCHEMA,
  checkSystemPrompt, CHECK_SCHEMA, CHAT_SYSTEM
} from '../lib/prompts.js';
import { neisBytes, sanitize } from '../public/js/core.js';

/**
 * POST /api/ai  { task: 'generate' | 'similar' | 'check' | 'chat', ... }
 *
 * 개인정보 원칙
 *  - 이 API에는 학생 이름·번호·학년·반을 받는 필드가 없다.
 *  - 학생 이름은 브라우저에서 이미 "학생"으로 바뀌어 들어온다.
 *  - 서버도 한 번 더 연락처·이메일·주민번호·학년반번호 패턴을 가린다.
 *  - 요청 내용은 로그로 남기지 않는다.
 */

const MAX = 6000;
const clip = (v, n = MAX) => sanitize(String(v ?? '').slice(0, n)).text.trim();
const clipList = (arr, n = 60, len = 60) => (Array.isArray(arr) ? arr : []).slice(0, n).map((x) => clip(x, len)).filter(Boolean);
const SCHOOL_LEVELS = ['초등학교', '중학교', '고등학교'];

function cleanOutput(s) {
  return String(s).replace(/\r?\n+/g, ' ').replace(/^["“'\s]+|["”'\s]+$/g, '').replace(/\s{2,}/g, ' ').trim();
}

async function generate(b) {
  const target = Math.min(Math.max(parseInt(b.targetBytes, 10) || 1500, 100), 4000);
  const f = {
    type: TYPES[b.type] ? b.type : 'behavior',
    targetBytes: target,
    subject: clip(b.subject, 100),
    standard: clip(b.standard, 2000),
    level: ['상', '중', '하'].includes(b.level) ? b.level : '',
    career: clip(b.career, 200),
    activity: clip(b.activity, 300),
    role: clip(b.role, 200),
    good: clipList(b.good),
    improve: clipList(b.improve),
    strengths: clip(b.strengths, 500),
    weaknesses: clip(b.weaknesses, 500),
    notes: clip(b.notes),
    request: clip(b.request, 500),
    styles: clipList(b.styles, 3, 1500)
  };
  if (!f.notes && !f.good.length && !f.improve.length && !f.standard && !f.strengths) {
    const e = new Error('키워드나 관찰·활동 기록을 하나 이상 입력해 주세요.');
    e.status = 400;
    throw e;
  }
  const system = systemPrompt(b.schoolLevel);
  const user = generatePrompt(f);
  const fast = !!b.fast;
  const { min } = lengthRule(target);

  // 대화를 이어 가며 분량을 맞춘다: 짧으면 재료 안에서 보강, 길면 줄이기. 최대 2번 고쳐 쓴다.
  const messages = [{ role: 'user', content: user }];
  let { text, model } = await askClaude({ system, messages, fast });
  text = cleanOutput(text);
  let bytes = neisBytes(text);
  const passes = [];
  for (let i = 0; i < 2 && (bytes < min || bytes > target); i++) {
    const action = bytes > target ? 'shorten' : 'expand';
    messages.push({ role: 'assistant', content: text });
    messages.push({ role: 'user', content: action === 'shorten' ? shortenPrompt(bytes, target) : expandPrompt(bytes, target) });
    const r = await askClaude({ system, messages, fast, effort: 'low' });
    const next = cleanOutput(r.text);
    const nb = neisBytes(next);
    passes.push(action);
    // 보강하다 한도를 넘었으면 다음 차례에 줄이고, 그래도 넘으면 마지막 한도 안 결과를 쓴다.
    if (nb > target && bytes <= target && i === 1) break;
    text = next; bytes = nb;
  }
  return { text, bytes, target, min, overLimit: bytes > target, short: bytes < min, adjusted: passes, model, sent: user };
}

async function similar(b) {
  const text = clip(b.text, 3000);
  if (!text) { const e = new Error('바꿔 쓸 문장을 입력해 주세요.'); e.status = 400; throw e; }
  const count = Math.min(Math.max(parseInt(b.count, 10) || 3, 1), 5);
  const user = similarPrompt({ text, count, request: clip(b.request, 300) });
  const { json, model } = await askClaude({
    system: systemPrompt(b.schoolLevel), messages: [{ role: 'user', content: user }], fast: !!b.fast, schema: SIMILAR_SCHEMA
  });
  const variants = (json.variants || []).map(cleanOutput).filter(Boolean)
    .map((t) => ({ text: t, bytes: neisBytes(t) }));
  return { variants, model, sent: user };
}

async function check(b) {
  const text = clip(b.text, 5000);
  if (!text) { const e = new Error('검사할 문장을 입력해 주세요.'); e.status = 400; throw e; }
  const meta = {
    schoolLevel: SCHOOL_LEVELS.includes(b.schoolLevel) ? b.schoolLevel : '고등학교',
    grade: /^[1-6]$/.test(String(b.grade)) ? String(b.grade) : '',
    year: /^20\d\d$/.test(String(b.year)) ? String(b.year) : '',
    area: clip(b.area, 40)
  };
  const user = `[검사할 문장]\n${text}`;
  const { json, model } = await askClaude({
    system: checkSystemPrompt(meta), messages: [{ role: 'user', content: user }], fast: !!b.fast, schema: CHECK_SCHEMA
  });
  const issues = (json.issues || []).filter((i) => i && i.found);
  const revised = cleanOutput(json.revised || '');
  return { issues, revised, revisedBytes: neisBytes(revised), summary: String(json.summary || ''), model };
}

async function chat(b) {
  const history = (Array.isArray(b.messages) ? b.messages : []).slice(-20)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: clip(m.content, 8000) }))
    .filter((m) => m.content);
  if (!history.length || history[history.length - 1].role !== 'user') {
    const e = new Error('메시지를 입력해 주세요.'); e.status = 400; throw e;
  }
  while (history.length && history[0].role !== 'user') history.shift();
  const { text, model } = await askClaude({ system: CHAT_SYSTEM, messages: history, fast: !!b.fast });
  return { text, model };
}

const TASKS = { generate, similar, check, chat };

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST만 지원합니다.' });
  if (!checkPassword(req)) return send(res, 401, { error: '접속 비밀번호가 맞지 않습니다. 설정에서 비밀번호를 입력해 주세요.' });
  let body;
  try { body = await readJson(req); } catch { return send(res, 400, { error: '요청 형식이 올바르지 않습니다.' }); }
  const fn = TASKS[body.task];
  if (!fn) return send(res, 400, { error: '알 수 없는 작업입니다.' });
  try {
    return send(res, 200, await fn(body));
  } catch (err) {
    const { status, message } = describeError(err);
    return send(res, status, { error: message });
  }
}

