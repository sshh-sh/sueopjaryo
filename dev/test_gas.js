// GAS 시험: 개발 서버(/api)에 실제 요청을 보내 확인. 먼저 node dev/devserver.js 3099 를 켜 둘 것
const assert = require('assert'), fs = require('fs'), path = require('path');
const BASE = 'http://localhost:' + (process.argv[2] || 3099);
const api = async body => (await fetch(BASE + '/api', { method: 'POST', body: JSON.stringify(body) })).json();
let n = 0; const ok = m => { n++; console.log('✓', m); };
(async () => {
  await fetch(BASE + '/dev/reset');
  let d = await (await fetch(BASE + '/api?action=load')).json();
  assert.ok(d.ok && d.data.items.length === 228 && d.data.topics.length === 5); ok('불러오기: 자료 228개, 대주제 5개');
  const v0 = d.ver;

  // 추가 (서버가 유튜브 제목·길이·관련 단원을 채움)
  let r = await api({ action: 'op', ver: v0, op: { type: 'add', autoRel: true, item: { cat: '물질과 에너지', sub: '전기', title: '', url: 'https://www.youtube.com/watch?v=4FJi_Pkgcdk' } } });
  assert.ok(r.ok, JSON.stringify(r).slice(0, 300));
  const added = r.data.items.filter(i => i.url.includes('4FJi_Pkgcdk')).pop();
  console.log('   추가된 자료:', JSON.stringify(added));
  assert.ok(added.title, '제목'); assert.ok(/\d+:\d\d/.test(added.dur), '영상 길이'); ok('추가 → 제목·영상 길이 자동');
  assert.ok(r.ver !== v0); ok('쓰고 나면 버전이 바뀜');

  // 옛 버전으로 쓰기 → 거절 + 새 내용
  const bad = await api({ action: 'op', ver: v0, op: { type: 'del', id: 0 } });
  assert.ok(!bad.ok && bad.code === 'changed' && bad.data.items.length === 229); ok('시트가 바뀐 뒤 옛 버전으로 쓰면 거절(자료 안 지워짐)');

  // 백업 탭
  const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'state.json'), 'utf8'));
  const bak = st.sheets.find(s => s.name === '수업자료_백업'); assert.ok(bak && bak.values.length >= 233 && bak.values.filter(x => x.some(Boolean)).length >= 229); ok('쓰기 전 내용이 수업자료_백업 탭에 남음');
  const dataSheet = st.sheets.find(s => s.gid === 1635305994);
  assert.ok(dataSheet.values.every(row => row.length <= 7 || row.slice(7).every(v => !v))); ok('A~G열 밖은 안 건드림');

  // 관련 단원 찾기
  const rel = await api({ action: 'rel', item: { title: '전자석의 성질 실험', sub: '전기' } });
  console.log('   관련 단원:', rel.rel); assert.ok(/전기의 이용/.test(rel.rel)); ok('관련 단원 자동 판단');
  const rel2 = await api({ action: 'rel', item: { title: '밸런스게임 귀여운개', sub: '게임' } });
  assert.strictEqual(rel2.rel, ''); ok('맞는 단원이 없으면 비워 둠');

  // 링크 정보
  const m = await api({ action: 'meta', url: 'https://javalab.org/ko/speaker/' }); console.log('   사이트 제목:', m.meta.title); assert.ok(m.meta.title); ok('사이트 제목 가져오기');

  // 사용기록
  let u = await api({ action: 'usage', url: added.url, title: added.title, cls: '6-1', on: true });
  const key = Object.keys(u.usage).find(k => k.includes('4FJi_Pkgcdk')); assert.ok(u.usage[key]['6-1']); ok('반 체크 기록');
  u = await api({ action: 'usage', url: added.url, title: added.title, cls: '6-1', on: false });
  assert.ok(!u.usage[key] || !u.usage[key]['6-1']); ok('반 체크 취소');

  // 설정
  let s = await api({ action: 'settings', settings: { classes: ['5-3'], icons: { '지구와 우주': { icon: 'ti-planet', h: 250 } } } });
  assert.deepStrictEqual(s.settings.classes, ['5-3']); assert.strictEqual(s.settings.icons['지구와 우주'].icon, 'ti-planet'); ok('설정 저장');

  // 영상 길이 채우기 (3개만)
  d = await (await fetch(BASE + '/api?action=load')).json();
  const f = await api({ action: 'fillDur', ver: d.ver, max: 3 });
  assert.ok(f.ok && f.filled === 3 && f.left > 0); console.log('   채운 길이:', f.data.items.filter(i => i.dur).slice(0, 4).map(i => i.dur).join(', '), '/ 남은 것', f.left); ok('영상 길이 채우기');

  // 대주제 이름 바꾸기 → 자료 수 그대로
  r = await api({ action: 'op', ver: f.ver, op: { type: 'rename', cat: '수업 도구', sub: null, to: '교사 도구' } });
  assert.ok(r.ok && r.data.items.length === 229 && r.data.topics.some(t => t.name === '교사 도구')); ok('대주제 이름 바꾸기');
  await fetch(BASE + '/dev/reset');
  console.log('\n모두 통과: ' + n + '개 (가짜 시트는 처음 상태로 되돌림)');
})().catch(e => { console.error('✗ 실패:', e.message); process.exit(1); });
