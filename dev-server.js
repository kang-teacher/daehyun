/**
 * 로컬 확인용 서버. Vercel 없이 `npm run dev`로 화면과 /api를 함께 띄운다.
 * 실제 배포는 Vercel이 public/ 폴더와 api/ 폴더를 그대로 사용한다.
 *   ANTHROPIC_API_KEY=... npm run dev     실제 Claude 호출
 *   npm run dev:mock                      가짜 응답으로 화면만 확인
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const port = Number(process.env.PORT) || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.csv': 'text/csv; charset=utf-8', '.json': 'application/json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z]/g, '');
    try {
      const mod = await import(`./api/${name}.js`);
      return await mod.default(req, res);
    } catch (e) {
      console.error(e);
      res.statusCode = 500; return res.end('server error');
    }
  }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (!p || p.endsWith('/')) p += 'index.html';
  try {
    const data = await readFile(join(root, p));
    res.setHeader('Content-Type', TYPES[extname(p)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404; res.end('not found');
  }
}).listen(port, () => console.log(`새김 개발 서버: http://localhost:${port}${process.env.MOCK_AI === '1' ? ' (가짜 응답 모드)' : ''}`));
