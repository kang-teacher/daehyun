import { timingSafeEqual } from 'node:crypto';

/** 접속 비밀번호(APP_PASSWORD)가 설정돼 있으면 요청 헤더와 비교한다. */
export function checkPassword(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true;
  const given = String(req.headers['x-app-password'] || '');
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}
