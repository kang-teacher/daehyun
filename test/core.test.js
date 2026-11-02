import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neisBytes, sanitize, ruleCheck } from '../public/js/core.js';

test('나이스 바이트: 한글 3, 영문·공백 1, 줄바꿈 2', () => {
  assert.equal(neisBytes('가나 a'), 8);
  assert.equal(neisBytes('가\n나'), 8);
});

test('명단 이름과 조사를 자연스럽게 가린다', () => {
  const names = ['홍길동', '김지우'];
  assert.equal(sanitize('지우가 발표함', names).text, '학생이 발표함');
  assert.equal(sanitize('길동이는 성실함', names).text, '학생은 성실함');
  assert.equal(sanitize('홍길동의 보고서', names).text, '학생의 보고서');
  assert.equal(sanitize('지우개를 빌려줌', names).text, '지우개를 빌려줌');
});

test('연락처·주민번호·학년반번호를 가린다', () => {
  const r = sanitize('010-1234-5678, 050101-3123456, 2학년 3반 5번, a@b.com');
  assert.ok(!/\d{3}-\d{4}/.test(r.text));
  assert.equal(r.counts.연락처, 1);
  assert.equal(r.counts.주민번호, 1);
  assert.equal(r.counts.학년반번호, 1);
  assert.equal(r.counts.이메일, 1);
});

test('규칙 검사가 대표 위반을 찾는다', () => {
  const types = ruleCheck('서울대학교 탐방 후 유튜브에 올림. 또래보다 매우 매우 뛰어남. 경시대회에서 금상을 수상함.').map((i) => i.type);
  for (const t of ['대학·기관명', '상호·플랫폼명', '비교·과장 표현', '반복 강조', '대회·수상']) assert.ok(types.includes(t), t);
});
