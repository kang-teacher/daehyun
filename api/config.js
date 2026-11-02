import { pickModel } from '../lib/claude.js';
import { send } from '../lib/http.js';

/** GET /api/config  화면에 필요한 서버 설정 (키 값은 절대 내보내지 않음) */
export default function handler(req, res) {
  send(res, 200, {
    passwordRequired: !!process.env.APP_PASSWORD,
    hasKey: !!process.env.ANTHROPIC_API_KEY || process.env.MOCK_AI === '1',
    model: pickModel(false),
    fastModel: pickModel(true),
    mock: process.env.MOCK_AI === '1'
  });
}
