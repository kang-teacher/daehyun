import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neisBytes, sanitize, ruleCheck, AREAS } from '../public/js/core.js';

test('나이스 바이트: 한글 3, 영문·숫자·공백 1, 엔터 1 (2026 기재요령 p.208)', () => {
  assert.equal(neisBytes('가나 a'), 8);
  assert.equal(neisBytes('가\n나'), 7);
});

test('영역별 최대 글자수 (2026 기재요령 p.208)', () => {
  assert.equal(AREAS.behavior.bytes, 900);
  assert.equal(AREAS.career.bytes, 1500);
  assert.equal(AREAS.subject.bytes, 1500);
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
  assert.equal(r.counts.연락처, 1);
  assert.equal(r.counts.주민번호, 1);
  assert.equal(r.counts.학년반번호, 1);
  assert.equal(r.counts.이메일, 1);
});

const find = (text, area) => ruleCheck(text, area, neisBytes);
const types = (text, area) => find(text, area).map((i) => i.type);

test('작성 시 유의사항 3의 기재 불가 항목을 위반으로 잡는다', () => {
  const t = types('서울대학교 탐방 후 유튜브에 올림. 경시대회에서 금상을 수상함. TOEIC 900점을 받음. 아버지가 의사인 영향을 받음. 장학금을 받음. 정보처리기능사 자격증을 취득함. 새김고등학교 축제에 참여함. 방과후학교 수업에 참여함.');
  for (const x of ['대학명', '상호명·플랫폼명', '대회 참여·수상', '공인어학시험', '부모의 사회·경제적 지위', '장학금', '자격증', '학교명·학교 별칭', '방과후학교·온라인 강좌']) {
    assert.ok(t.includes(x), x);
  }
});

test('허용되는 표현은 잡지 않는다', () => {
  const issues = find('PPT와 SNS를 활용해 10cm 모형을 만들어 발표함. PAPS 1등급을 받음. 학급 회장(2026.03.01.-2027.02.28.)으로 회의를 진행함. 교육청 주관 진로 박람회에 참여함.', 'autonomy');
  assert.deepEqual(issues.map((i) => `${i.type}:${i.found}`), []);
});

test('명사형 종결이 아닌 문장과 글자수 초과를 잡는다', () => {
  assert.ok(types('수업에 성실하게 참여하였다.', 'subject').includes('명사형 종결'));
  assert.ok(!types('수업에 성실하게 참여함.', 'subject').includes('명사형 종결'));
  assert.ok(types('가'.repeat(301), 'behavior').includes('글자수 초과'));
});
