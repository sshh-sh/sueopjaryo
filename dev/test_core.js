// core.js 시험: 시트 → 목록 → 시트가 똑같은지, 편집 동작이 자료를 잃지 않는지
const fs = require('fs'), path = require('path'), assert = require('assert');
const SJ = require('../core.js'), CSV = require('./csv.js');
const raw = CSV.parse(fs.readFileSync(path.join(__dirname, '..', '수업자료_정리본.csv'), 'utf8')).map(r => { while (r.length < 7) r.push(''); return r.slice(0, 7); });
const trimRows = rows => rows.filter((r, i) => i === 0 || r.some(v => String(v).trim()));
let st = SJ.parseTable(raw);
let n = 0; const ok = m => { n++; console.log('✓', m); };

// 1. 왕복: 정리본은 이미 정리된 모양이라 그대로 나와야 함
assert.deepStrictEqual(SJ.serialize(st), raw); ok('정리본 → 목록 → 시트 그대로 (' + raw.length + '줄, 자료 ' + st.items.length + '개)');
const urls = st => st.items.map(i => i.url).sort().join('\n');
const all = urls(st);

// 2. 추가: 새 자료는 그 소주제 끝에
let s2 = SJ.applyOp(st, { type: 'add', item: { cat: '물질과 에너지', sub: '전기', title: '테스트 전기', url: 'https://youtu.be/AAAAAAAAAAA' } });
const idx = s2.items.findIndex(i => i.title === '테스트 전기');
assert.strictEqual(s2.items[idx - 1].sub, '전기'); assert.notStrictEqual(s2.items[idx + 1].sub, '전기'); ok('추가 → 전기 소주제 끝에 들어감');
// 새 대주제·소주제
s2 = SJ.applyOp(s2, { type: 'add', item: { cat: '국어', sub: '글쓰기', title: '새 대주제 자료', url: 'https://x.y/1' } });
assert.ok(s2.topics.find(t => t.name === '국어')); ok('없는 대주제로 추가하면 대주제가 생김');
// 미분류
s2 = SJ.applyOp(s2, { type: 'add', item: { cat: '미분류', title: '', url: 'https://youtu.be/BBBBBBBBBBB' } });
const rows2 = SJ.serialize(s2); assert.strictEqual(rows2.filter(r => r[0] === '미분류').length, 1); ok('미분류는 맨 끝 묶음');

// 3. 이름 바꾸기 / 합치기 / 삭제 → 링크 개수 그대로
let s3 = SJ.applyOp(st, { type: 'rename', cat: '수업 도구', sub: null, to: '교사 도구' });
assert.ok(!s3.topics.find(t => t.name === '수업 도구') && s3.items.some(i => i.cat === '교사 도구')); assert.strictEqual(urls(s3), all); ok('대주제 이름 바꾸기, 자료 유지');
s3 = SJ.applyOp(s3, { type: 'rename', cat: '물질과 에너지', sub: '소리', to: '빛과 렌즈' });
assert.ok(!s3.topics.find(t => t.name === '물질과 에너지').subs.includes('소리')); assert.strictEqual(urls(s3), all); ok('이미 있는 이름으로 바꾸면 합쳐짐');
s3 = SJ.applyOp(s3, { type: 'merge', cat: '놀이·활동', sub: null, toCat: '교사 도구', toSub: null });
assert.ok(!s3.topics.find(t => t.name === '놀이·활동')); assert.strictEqual(urls(s3), all); ok('대주제 합치기, 자료 유지');
s3 = SJ.applyOp(s3, { type: 'delTopic', cat: '지구와 우주', sub: '우주 탐사' });
assert.strictEqual(urls(s3), all); assert.ok(s3.items.filter(i => i.cat === '미분류').length >= 4); ok('소주제 삭제 → 자료는 미분류로');
s3 = SJ.applyOp(s3, { type: 'delTopic', cat: '지구와 우주', sub: null });
assert.strictEqual(urls(s3), all); ok('대주제 삭제 → 자료는 미분류로');

// 4. 순서·옮기기
let s4 = SJ.applyOp(st, { type: 'orderTopics', order: ['수업 도구', '지구와 우주'] });
assert.strictEqual(s4.topics[0].name, '수업 도구'); assert.strictEqual(urls(s4), all); ok('대주제 순서 바꾸기');
s4 = SJ.applyOp(s4, { type: 'moveSub', cat: '물질과 에너지', sub: '전기', toCat: '수업 도구' });
assert.ok(s4.topics.find(t => t.name === '수업 도구').subs.includes('전기')); assert.strictEqual(urls(s4), all); ok('소주제를 다른 대주제로');
const ids = s4.items.map((it, i) => it.sub === '세포' ? i : -1).filter(i => i >= 0);
s4 = SJ.applyOp(s4, { type: 'move', ids, cat: '수업 도구', sub: '세포 모음' });
assert.strictEqual(s4.items.filter(i => i.sub === '세포 모음').length, ids.length); assert.strictEqual(urls(s4), all); ok('자료 여러 개 옮기기');
s4 = SJ.applyOp(s4, { type: 'addTopic', cat: '수학', sub: '도형' });
const back = SJ.parseTable(SJ.serialize(s4)); assert.ok(back.topics.find(t => t.name === '수학').subs.includes('도형')); ok('빈 대주제·소주제도 시트에 남음');

// 5. 수정·삭제
let s5 = SJ.applyOp(st, { type: 'update', id: 0, item: { memo: '앞 2분만', dur: '7:25' } });
assert.strictEqual(s5.items[0].memo, '앞 2분만'); ok('수정');
s5 = SJ.applyOp(s5, { type: 'del', id: 0 }); assert.strictEqual(s5.items.length, st.items.length - 1); ok('삭제');

// 6. 멱등: 정리를 두 번 해도 같음
assert.deepStrictEqual(SJ.normalize(SJ.normalize(s4)), SJ.normalize(s4)); ok('정리 결과가 안정적');
// 7. 링크 칸 해석
assert.deepStrictEqual(SJ.links('스트레칭 https://a.b/1\n이머시브웜업 https://c.d/2'), [{ label: '스트레칭', url: 'https://a.b/1' }, { label: '이머시브웜업', url: 'https://c.d/2' }]); ok('한 칸 여러 링크');
assert.strictEqual(SJ.fmtDur(3725), '1:02:05'); assert.strictEqual(SJ.fmtDur(75), '1:15'); ok('영상 길이 표기');
console.log('\n모두 통과: ' + n + '개');
