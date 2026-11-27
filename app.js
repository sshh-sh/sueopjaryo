/* 수업자료용 앱 — 구글 시트(수업자료 탭)를 GAS로 읽고 씀. 공통 로직은 core.js(SJ) */
const APP_VERSION = 1;
// 배포한 GAS 웹앱 주소. 내 컴퓨터(localhost)에서 열면 개발 서버(/api)를 씀
const GAS_URL_DEPLOYED = '';
const IS_LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const GAS_URL = IS_LOCAL ? '/api' : GAS_URL_DEPLOYED;
const CACHE_KEY = 'sueopjaryo_cache_v1';
const INBOX = SJ.INBOX;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);
const X = '<button class="ghost x" data-close aria-label="닫기"><i class="ti ti-x" aria-hidden="true"></i></button>';

/* ---------- 상태 ---------- */
let S = { topics: [], items: [] }, ver = null, usage = {}, settings = { classes: [], icons: {} }, loaded = false;
let V = [];  // 화면용 자료 목록 (S.items + 링크·관련 단원 풀이)
let selCat = null, selSub = null, selInbox = false, query = '', editing = false, picked = new Set(), detailId = null, playing = false, confirmDel = false;

const ICON_POOL = ['ti-planet', 'ti-leaf', 'ti-flask', 'ti-ball-football', 'ti-tools', 'ti-books', 'ti-man', 'ti-paw', 'ti-volume', 'ti-virus', 'ti-bulb', 'ti-bolt', 'ti-plug', 'ti-cloud', 'ti-pencil', 'ti-math', 'ti-world', 'ti-music', 'ti-palette', 'ti-heart', 'ti-flag', 'ti-star', 'ti-folder', 'ti-device-tv', 'ti-language', 'ti-map', 'ti-run', 'ti-brush'];
const ICON_DEF = { '지구와 우주': 'ti-planet', '생물과 몸': 'ti-leaf', '물질과 에너지': 'ti-flask', '놀이·활동': 'ti-ball-football', '수업 도구': 'ti-tools' };
const HUES = [250, 130, 205, 20, 280, 340, 45, 170, 300, 90];
function hash(s) { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
function metaOf(c) {
  const i = S.topics.findIndex(t => t.name === c), m = settings.icons[c] || {};
  return { icon: m.icon || ICON_DEF[c] || 'ti-folder', h: m.h != null ? m.h : (i >= 0 && i < HUES.length ? HUES[i] : hash(c) % 360) };
}
const catOrder = () => S.topics.map(t => t.name);
const subsOf = c => (S.topics.find(t => t.name === c) || { subs: [] }).subs;
const cnt = (c, s) => V.filter(it => !it.inbox && it.cat === c && (s == null || it.sub === s)).length;
const lab = t => t.c + (t.s ? ' › ' + t.s : '');

/* ---------- 링크 종류·썸네일 ---------- */
const ytId = SJ.ytId;
function ytStart(u) { const m = String(u).match(/[?&]t=(\d+)s?(?:&|$)/); if (m) return +m[1]; const m2 = String(u).match(/[?&]t=(?:(\d+)m)?(\d+)s/); return m2 ? (+(m2[1] || 0)) * 60 + (+m2[2]) : 0; }
function host(u) { try { return new URL(u).hostname.replace(/^www\.|^m\./, ''); } catch (e) { return ''; } }
function kind(u) {
  u = String(u); if (/shorts\//.test(u)) return 'shorts'; if (ytId(u)) return 'yt'; if (/youtube\.com\/@/.test(u)) return 'channel';
  if (/playlist\?list=/.test(u)) return 'playlist'; if (/\.pdf(\?|$)/i.test(u)) return 'pdf'; if (/\.(jpe?g|png|gif)(\?|$)/i.test(u)) return 'img';
  if (/docs\.google\.com\/forms/.test(u)) return 'form'; if (/docs\.google\.com\/presentation/.test(u)) return 'slide';
  const h = host(u); if (/blooket|tkbell/.test(h)) return 'quiz'; if (h.includes('lilys')) return 'ai'; if (h.includes('tsherpa')) return 'book'; if (h.includes('javalab')) return 'sim';
  if (h.includes('instagram')) return 'insta'; if (h.includes('docs.google')) return 'doc'; if (h.includes('notion')) return 'notion'; if (h.includes('padlet')) return 'padlet'; if (h.includes('blog.naver')) return 'blog'; return 'site';
}
const KIND_ICON = { playlist: 'ti-playlist', pdf: 'ti-file-type-pdf', img: 'ti-photo', form: 'ti-forms', slide: 'ti-presentation', quiz: 'ti-device-gamepad-2', ai: 'ti-sparkles', book: 'ti-book', sim: 'ti-flask', insta: 'ti-brand-instagram', doc: 'ti-file-text', notion: 'ti-notebook', padlet: 'ti-layout-board', blog: 'ti-article', site: 'ti-world', channel: 'ti-brand-youtube' };
const KIND_NAME = { playlist: '재생목록', pdf: 'PDF', img: '이미지', form: '구글 설문', slide: '구글 슬라이드', quiz: '퀴즈', ai: 'AI 요약', book: '디지털 교과서', yt: '영상', shorts: '쇼츠', sim: '실험실', insta: '인스타그램', doc: '구글 문서', notion: '노션', padlet: '패들릿', blog: '블로그', site: '사이트', channel: '유튜브 채널' };
function titleOf(it) { if (it.title) return it.title.split('\n').join(' · '); const l = it.links[0]; if (l?.label) return l.label; if (!l) return '(링크 없음)'; return KIND_NAME[kind(l.url)] + ' · ' + host(l.url); }
const deadIds = new Set();
function thumbHtml(it, big) {
  const u = it.links[0]?.url || ''; const id = ytId(u); const k = kind(u); const d = it.dur && it.dur !== '-' ? it.dur : '';
  if (id && deadIds.has(id)) return '<div class="th dead"><span class="dead-lbl"><i class="ti ti-photo-off" aria-hidden="true"></i>썸네일 없음</span></div>';
  let h = '<div class="th">';
  if (id) h += `<img loading="lazy" src="https://i.ytimg.com/vi/${id}/mqdefault.jpg" alt="" data-yt="${id}" onerror="thumbFail(this)" onload="if(this.naturalWidth<=120)thumbFail(this)">`;
  else h += `<i class="ti ${KIND_ICON[k] || 'ti-world'}" aria-hidden="true"></i>`;
  if (d) h += `<span class="badge">${esc(d)}</span>`;
  if (k === 'shorts') h += '<span class="badge l">쇼츠</span>';
  if (big && id) h += '<div class="play"><span><i class="ti ti-player-play" aria-hidden="true"></i></span></div>';
  return h + '</div>';
}
function thumbFail(img) {
  const id = img.dataset.yt; if (!id) return; deadIds.add(id);
  document.querySelectorAll(`img[data-yt="${id}"]`).forEach(im => { const th = im.closest('.th'); if (!th) return; th.className = 'th dead'; th.innerHTML = '<span class="dead-lbl"><i class="ti ti-photo-off" aria-hidden="true"></i>썸네일 없음</span>'; });
}
function parseRel(s) { return String(s || '').split('\n').map(x => x.trim()).filter(Boolean).map(x => { const i = x.indexOf(' · '); return i > 0 ? { u: x.slice(0, i), t: x.slice(i + 3) } : { u: x, t: '' }; }); }
function relHtml(it) {
  if (!it.rels.length) return '';
  return '<div class="rel">' + it.rels.map(x => `<span><i class="ti ti-book-2" aria-hidden="true"></i><b>${esc(x.u)}</b>${x.t ? ` · ${esc(x.t)}` : ''}</span>`).join('') + '</div>';
}
function usedOf(it) { const l = it.links[0]; return (l && usage[SJ.normUrl(l.url)]) || {}; }
const shortDate = d => { const m = String(d).match(/\d{4}-(\d{2})-(\d{2})/); return m ? (+m[1]) + '/' + (+m[2]) : d; };

/* ---------- 서버(GAS) ---------- */
async function call(body) {
  if (!GAS_URL) throw new Error('GAS 주소가 아직 없어요');
  const r = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok && j.code !== 'changed') throw new Error(j.error || '서버 오류');
  return j;
}
function accept(j) {
  if (j.data) { S = j.data; ver = j.ver; }
  if (j.usage) usage = j.usage;
  if (j.settings) settings = Object.assign({ classes: [], icons: {} }, j.settings);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ S, ver, usage, settings })); } catch (e) { }
}
function setSync(state, msg) {
  const el = $('#sync'); el.className = 'sync ' + (state || '');
  el.innerHTML = state === 'busy' ? `<i class="ti ti-loader-2 spin" aria-hidden="true"></i><span class="txt">${esc(msg || '저장 중…')}</span>`
    : state === 'err' ? `<i class="ti ti-alert-triangle" aria-hidden="true"></i><span class="txt">${esc(msg || '저장 안 됨')}</span>`
    : state === 'ok' ? `<i class="ti ti-check" aria-hidden="true"></i><span class="txt">${esc(msg || '저장됨')}</span>` : '';
}
async function reload(quiet) {
  if (!quiet) setSync('busy', '불러오는 중…');
  try { const j = await call({ action: 'load' }); accept(j); loaded = true; setSync(''); render(); return true; }
  catch (e) { setSync('err', '불러오기 실패'); if (!loaded) showSetup(e.message); else toast('불러오지 못했어요: ' + e.message); return false; }
}

/* 편집은 화면에 먼저 반영하고(바로 보이게) 차례로 시트에 저장. 저장 순서는 하나씩 */
const pend = []; let running = false;
function op(o) {
  try { S = SJ.applyOp(S, o); } catch (e) { toast(e.message); return; }
  pend.push({ op: o }); render(); pump();
}
function queueFill() { if (!pend.some(p => p.fill)) { pend.push({ fill: true }); pump(); } }
async function pump() {
  if (running) return; running = true;
  while (pend.length) {
    const p = pend[0];
    setSync('busy', p.fill ? '영상 길이 채우는 중…' : '저장 중…');
    try {
      const j = await call(p.fill ? { action: 'fillDur', ver, max: 8 } : { action: 'op', ver, op: p.op });
      if (j.ok === false) { // 그새 시트가 바뀜 → 시트 내용으로 다시 맞춤
        pend.length = 0; accept(j); render(); toast('시트가 바뀌어 있어서 새로 불러왔어요. 방금 한 것은 다시 해 주세요'); break;
      }
      pend.shift(); accept(j);
      pend.forEach(q => { if (q.op) try { S = SJ.applyOp(S, q.op); } catch (e) { } });
      if (p.fill && j.left > 0) pend.push({ fill: true });
      render();
    } catch (e) {
      pend.length = 0; setSync('err'); toast('저장하지 못했어요: ' + e.message); running = false; await reload(true); return;
    }
  }
  running = false; setSync('ok'); setTimeout(() => { if (!running && !pend.length) setSync(''); }, 2500);
}

/* ---------- 화면 ---------- */
function buildView() {
  V = S.items.map((it, i) => Object.assign({}, it, { id: i, links: SJ.links(it.url), inbox: it.cat === INBOX, rels: parseRel(it.rel) }));
  if (selCat && !catOrder().includes(selCat)) { selCat = null; selSub = null; }
  if (selSub && !subsOf(selCat).includes(selSub)) selSub = null;
  if (!selCat && !selInbox && S.topics.length) selCat = S.topics[0].name;
}
function visible() {
  if (query) { const q = query.toLowerCase(); return V.filter(it => [it.title, it.cat, it.sub, it.memo, it.rel, ...it.links.map(l => l.label)].join(' ').toLowerCase().includes(q)); }
  if (selInbox) return V.filter(it => it.inbox);
  return V.filter(it => !it.inbox && (!selCat || it.cat === selCat) && (!selSub || it.sub === selSub));
}
function renderTopics() {
  let h = '';
  catOrder().forEach(c => {
    const m = metaOf(c);
    h += `<div class="tp ed ${selCat === c && !selInbox && !query ? 'sel' : ''}" style="--h:${m.h}" data-tp="${esc(c)}" tabindex="0" ${editing ? 'draggable="true"' : ''}>${editing ? `<button class="minus" data-del-c="${esc(c)}" aria-label="${esc(c)} 삭제"><i class="ti ti-minus" aria-hidden="true"></i></button>` : ''}<div class="ico"><i class="ti ${m.icon}" aria-hidden="true"></i></div><div class="nm">${esc(c)}</div></div>`;
  });
  if (editing) h += `<div class="tp add" data-act="addcat" tabindex="0"><div class="ico"><i class="ti ti-plus" aria-hidden="true"></i></div><div class="nm">주제 추가</div></div>`;
  const inN = V.filter(i => i.inbox).length;
  h += `<div class="tp ${selInbox ? 'sel' : ''}" style="--h:40" data-act="inbox" tabindex="0">${inN ? `<span class="cnt">${inN}</span>` : ''}<div class="ico" style="filter:saturate(.3)"><i class="ti ti-inbox" aria-hidden="true"></i></div><div class="nm">미분류</div></div>`;
  h += `<button class="sb edit-tg ${editing ? 'on' : ''}" style="align-self:center;margin-left:auto" data-act="edit">${editing ? '<i class="ti ti-check" aria-hidden="true"></i>완료' : '<i class="ti ti-pencil" aria-hidden="true"></i>편집'}</button>`;
  $('#topics').innerHTML = h;
}
function renderLeft() {
  if (query || selInbox || !selCat) { $('#left').innerHTML = `<div class="hint" style="padding:8px">${query ? '검색 중이에요' : selInbox ? '휴대폰 공유 버튼으로 보낸 자료가 미분류에 쌓여요. 자료를 눌러 주제를 정해 주세요.' : '위에서 주제를 고르면 소주제가 여기에 나와요.'}</div>`; return; }
  const m = metaOf(selCat);
  let h = `<div class="left-head" style="--h:${m.h}"><span class="ico"><i class="ti ${m.icon}" aria-hidden="true"></i></span>${esc(selCat)}</div>`;
  h += `<div class="sub-row ${!selSub ? 'sel' : ''}" data-sub-all tabindex="0">전체<span class="n">${cnt(selCat)}</span></div>`;
  subsOf(selCat).forEach(s => { h += `<div class="sub-row ed ${selSub === s ? 'sel' : ''}" data-sub="${esc(s)}" tabindex="0" ${editing ? 'draggable="true"' : ''}>${editing ? `<button class="minus" data-del-s="${esc(s)}" aria-label="${esc(s)} 삭제"><i class="ti ti-minus" aria-hidden="true"></i></button>` : ''}${esc(s)}<span class="n">${cnt(selCat, s)}</span></div>`; });
  const none = V.filter(i => !i.inbox && i.cat === selCat && !i.sub).length;
  if (none) h += `<div class="hint" style="padding:6px 10px">소주제 없는 자료 ${none}개</div>`;
  if (editing) h += `<div class="sub-row add" data-act="addsub" tabindex="0"><i class="ti ti-plus" aria-hidden="true"></i> 소주제 추가</div>`;
  $('#left').innerHTML = h;
  if (innerWidth <= 640) { const s = $('#left .sub-row.sel'); if (s) $('#left').scrollLeft = s.offsetLeft - 12; } // 휴대폰: 고른 칩이 보이게
}
function renderCenter() {
  const list = visible();
  const title = query ? `"${esc(query)}" 검색 결과` : selInbox ? '미분류' : selCat ? (esc(selCat) + (selSub ? ' <span style="color:var(--fg-3)">›</span> ' + esc(selSub) : '')) : '전체';
  let h = `<div class="c-head"><h2>${title}</h2><span class="cnt">${list.length}개</span></div>`;
  if (editing) h += `<div class="editbar"><i class="ti ti-arrows-move" aria-hidden="true"></i><span><b style="font-weight:500">편집 중</b> · 아이콘과 소주제는 끌어서 순서 바꾸기, 한 번 더 눌러서 이름·아이콘·합치기, ⊖로 삭제 · 자료는 눌러 고른 뒤 주제/소주제 위로 끌어 옮기기</span>${picked.size ? `<b style="font-weight:500;margin-left:auto">${picked.size}개 선택</b>` : ''}</div>`;
  if (!list.length) h += `<div class="empty">${S.items.length ? '자료가 없어요' : '아직 자료가 없어요. [자료 추가]로 시작하세요'}</div>`;
  else h += '<div class="list">' + list.map(it => {
    const u = Object.keys(usedOf(it)); const pk = picked.has(it.id);
    const where = (query || !selCat || selInbox) ? (it.inbox ? '' : lab({ c: it.cat, s: it.sub })) : (!selSub && it.sub ? it.sub : '');
    return `<div class="item ${pk ? 'picked' : ''}" data-id="${it.id}" ${editing ? 'draggable="true"' : ''}><span class="ck">${pk ? '<i class="ti ti-check" aria-hidden="true"></i>' : ''}</span><div data-open="play">${thumbHtml(it)}</div><div class="body"><div class="t" data-open="info" tabindex="0" role="button">${esc(titleOf(it))}</div>${relHtml(it)}<div class="m">${where ? `<span>${esc(where)}</span>` : ''}${it.links.length > 1 ? `<span><i class="ti ti-link" aria-hidden="true"></i> ${it.links.length}</span>` : ''}${u.length ? `<span class="used"><i class="ti ti-check" aria-hidden="true"></i> ${u.length}개 반</span>` : ''}${it.memo ? '<span><i class="ti ti-note" aria-hidden="true"></i> 메모</span>' : ''}</div></div></div>`;
  }).join('') + '</div>';
  $('#center').innerHTML = h;
}
function render() {
  if (!loaded) return;
  buildView(); $('#app').classList.toggle('editing', editing);
  renderTopics(); renderLeft(); renderCenter();
  if (detailId != null && $('#layer .modal.detail')) drawDetail(true);
}
function showSetup(msg) {
  $('#topics').innerHTML = ''; $('#left').innerHTML = '';
  $('#center').innerHTML = `<div class="setup"><h2>시트에 연결하지 못했어요</h2><p>${esc(msg)}</p><p class="hint">GAS를 배포한 뒤 <code>app.js</code>의 <code>GAS_URL_DEPLOYED</code>에 웹앱 주소를 넣어 주세요. 자세한 방법은 <code>배포안내.md</code>에 있어요.</p><button id="retry">다시 시도</button></div>`;
  $('#retry').onclick = () => reload();
}

/* ---------- 자세히 (제목 누르면) ---------- */
function openDetail(id, play) { detailId = id; playing = !!play; confirmDel = false; drawDetail(); }
function drawDetail(keep) {
  const it = V[detailId]; if (!it) return closeModal();
  if (keep && (playing || (document.activeElement && document.activeElement.id === 'memo'))) return; // 메모 쓰는 중엔 다시 그리지 않음
  const u = it.links[0]?.url || ''; const id = ytId(u); const used = usedOf(it);
  let h = `<h3>${it.inbox ? '<span class="path" style="background:var(--warn-bg);color:var(--warn-fg)">미분류</span>' : `<span class="path">${esc(lab({ c: it.cat, s: it.sub }))}</span>`}${X}</h3>`;
  h += '<div class="d-media">' + (id && playing ? `<iframe src="https://www.youtube.com/embed/${id}?autoplay=1&start=${ytStart(u)}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen title="영상 재생"></iframe>` : `<div ${id ? 'data-d="play" style="cursor:pointer"' : ''}>${thumbHtml(it, true)}</div>`) + '</div>';
  h += `<div class="d-title">${esc(titleOf(it))}</div>`;
  h += `<div style="display:flex;gap:6px;flex-wrap:wrap">${it.inbox ? '<button class="sb" data-d="edit" style="color:var(--accent);border-color:var(--accent)"><i class="ti ti-folder-plus" aria-hidden="true"></i>주제 정하기</button>' : ''}<button class="sb" data-d="qr"><i class="ti ti-qrcode" aria-hidden="true"></i>QR</button><button class="sb" data-d="edit"><i class="ti ti-pencil" aria-hidden="true"></i>수정</button><button class="sb danger" data-d="askdel"><i class="ti ti-trash" aria-hidden="true"></i>삭제</button></div>`;
  if (confirmDel) h += `<div class="confirm">이 자료를 삭제할까요? 시트에서도 지워져요.<button class="sb" data-d="del" style="margin-left:auto">삭제</button><button class="sb" data-d="nodel">취소</button></div>`;
  h += `<div><span class="lb">관련 단원 <span class="hint">· 진도표를 보고 자동으로 찾았어요. 틀리면 [수정]에서 고칠 수 있어요</span></span>${relHtml(it) || '<span class="hint">맞는 단원을 찾지 못했어요</span>'}</div>`;
  h += '<div><span class="lb">링크</span><div class="links">' + (it.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${l.label ? `<span class="lab">${esc(l.label)}</span>` : ''}<span class="u">${esc(l.url)}</span><i class="ti ti-external-link" style="margin-left:auto" aria-hidden="true"></i></a>`).join('') || '<span class="hint">링크가 없어요</span>') + '</div></div>';
  h += `<div><label class="lb" for="memo">메모 <span class="hint">· 칸을 벗어나면 저장돼요</span></label><textarea id="memo" placeholder="예: 앞 2분만 보여주기, 도입용으로 반응 좋음">${esc(it.memo)}</textarea></div>`;
  h += '<div><span class="lb">사용한 반 <span class="hint">· 누르면 오늘 날짜로 체크</span></span>';
  if (!settings.classes.length) h += '<span class="hint">설정(⚙)에서 수업하는 반을 먼저 적어 주세요</span>';
  else if (settings.classes.length === 1) { const c = settings.classes[0], on = used[c]; h += `<button class="${on ? 'primary' : ''}" data-cls="${esc(c)}"><i class="ti ti-check" aria-hidden="true"></i> ${on ? '사용함 · ' + shortDate(on) : '사용함'}</button>`; }
  else h += '<div class="chips">' + settings.classes.map(c => `<span class="chip ${used[c] ? 'on' : ''}" role="button" tabindex="0" data-cls="${esc(c)}">${esc(c)}${used[c] ? `<small>${shortDate(used[c])}</small>` : ''}</span>`).join('') + '</div>';
  h += '</div>';
  const sc = $('#layer .modal')?.scrollTop || 0;
  openModal(h, 'lg detail'); if (keep) $('#layer .modal').scrollTop = sc;
}
function saveMemo() {
  const el = $('#memo'); const it = V[detailId]; if (!el || !it) return;
  const v = el.value.trim(); if (v !== it.memo) op({ type: 'update', id: it.id, item: { memo: v } });
}
async function toggleUsage(it, c) {
  const l = it.links[0]; if (!l) return toast('링크가 없는 자료예요');
  const k = SJ.normUrl(l.url), on = !(usage[k] && usage[k][c]);
  usage[k] = Object.assign({}, usage[k]); if (on) usage[k][c] = new Date().toISOString().slice(0, 10); else delete usage[k][c];
  drawDetail(true); renderCenter();
  try { const j = await call({ action: 'usage', url: l.url, title: titleOf(it), cls: c, on }); usage = j.usage; } catch (e) { toast('사용 기록을 저장하지 못했어요'); }
  renderCenter();
}

/* ---------- 편집: 이름·아이콘·합치기 / 삭제 / 추가 ---------- */
function topicSheet(c, s) {
  const isSub = s != null; const name = isSub ? s : c; const m = metaOf(c);
  const targets = isSub ? subsOf(c).filter(x => x !== s).map(x => ({ c, s: x })) : catOrder().filter(k => k !== c).map(k => ({ c: k, s: null }));
  let h = `<h3>${isSub ? '소주제' : '주제'} 편집${X}</h3><div><label class="lb" for="mIn">이름</label><input id="mIn" value="${esc(name)}"></div>`;
  if (!isSub) h += `<div><span class="lb">아이콘</span><div class="icopick">${ICON_POOL.map(ic => `<button class="${ic === m.icon ? 'on' : ''}" data-ic="${ic}" aria-label="${ic}"><i class="ti ${ic}" aria-hidden="true"></i></button>`).join('')}</div></div>`;
  h += `<div><label class="lb" for="mMerge">다른 ${isSub ? '소주제' : '주제'}와 합치기 <span class="hint">(자료 ${cnt(c, isSub ? s : null)}개가 옮겨지고 "${esc(name)}"은 사라져요)</span></label><div class="row"><select id="mMerge" class="grow"><option value="">합치지 않음</option>${targets.map((t, i) => `<option value="${i}">${esc(isSub ? t.s : t.c)}</option>`).join('')}</select></div></div>`;
  h += `<div class="foot"><button data-close>취소</button><button class="primary" id="mOk">저장</button></div>`;
  openModal(h, 'sm'); let icon = m.icon;
  $('#layer .icopick')?.addEventListener('click', e => { const b = e.target.closest('[data-ic]'); if (!b) return; icon = b.dataset.ic; document.querySelectorAll('[data-ic]').forEach(x => x.classList.toggle('on', x === b)); });
  $('#mOk').onclick = () => {
    const v = $('#mIn').value.trim(); const mg = $('#mMerge').value;
    if (mg !== '') { const t = targets[+mg]; closeModal(); op({ type: 'merge', cat: c, sub: isSub ? s : null, toCat: t.c, toSub: isSub ? t.s : null }); if (isSub) selSub = t.s; else selCat = t.c; render(); return toast('합쳤어요'); }
    const newName = v && v !== name ? v : name;
    if (!isSub && icon !== m.icon) saveIcon(newName, icon, m.h);
    if (v && v !== name) { op({ type: 'rename', cat: c, sub: isSub ? s : null, to: v }); if (isSub) { if (selSub === s) selSub = v; } else { if (selCat === c) selCat = v; if (settings.icons[c]) saveIcon(v, metaOf(c).icon, metaOf(c).h); } }
    closeModal(); render();
  };
}
async function saveIcon(c, icon, h) {
  settings.icons[c] = { icon, h }; render();
  try { const j = await call({ action: 'settings', settings: { icons: { [c]: { icon, h } } } }); settings = j.settings; } catch (e) { toast('아이콘을 저장하지 못했어요'); }
}
function askDelete(c, s) {
  const isSub = s != null; const name = isSub ? s : c;
  openModal(`<h3>"${esc(name)}" 삭제${X}</h3><div class="hint">${isSub ? '소주제' : '주제'}만 지워지고, 안에 있던 자료 ${cnt(c, isSub ? s : null)}개는 미분류로 옮겨져요.</div><div class="foot"><button data-close>취소</button><button class="primary" id="mOk" style="background:var(--danger);border-color:var(--danger)">삭제</button></div>`, 'sm');
  $('#mOk').onclick = () => { closeModal(); op({ type: 'delTopic', cat: c, sub: isSub ? s : null }); toast('삭제했어요. 자료는 미분류로 갔어요'); };
}
function askAdd(isSub) {
  openModal(`<h3>${isSub ? `"${esc(selCat)}"에 소주제` : '주제'} 추가${X}</h3><input id="mIn" placeholder="${isSub ? '예: 갯벌' : '예: 글쓰기'}"><div class="foot"><button data-close>취소</button><button class="primary" id="mOk">추가</button></div>`, 'sm');
  $('#mOk').onclick = () => {
    const v = $('#mIn').value.trim(); if (!v) return; closeModal();
    if (v === INBOX) return toast('"미분류"는 쓸 수 없는 이름이에요');
    if (isSub) { op({ type: 'addTopic', cat: selCat, sub: v }); selSub = v; } else { op({ type: 'addTopic', cat: v }); selCat = v; selSub = null; selInbox = false; }
    render(); toast('추가했어요');
  };
}
function moveItems(ids, c, s) { picked.clear(); op({ type: 'move', ids, cat: c, sub: s || '' }); toast(ids.length + '개를 ' + lab({ c, s }) + '(으)로 옮겼어요'); }

/* ---------- 끌어 놓기 (편집 모드) ---------- */
let drag = null;
const clearDnD = () => document.querySelectorAll('.over,.drop').forEach(x => x.classList.remove('over', 'drop'));
document.addEventListener('dragstart', e => {
  if (!editing) return; const tp = e.target.closest?.('.tp[data-tp]'), sr = e.target.closest?.('.sub-row[data-sub]'), it = e.target.closest?.('.item[data-id]');
  if (tp) drag = { t: 'cat', c: tp.dataset.tp }; else if (sr) drag = { t: 'sub', s: sr.dataset.sub }; else if (it) { const id = +it.dataset.id; if (!picked.has(id)) { picked.clear(); picked.add(id); } drag = { t: 'item', ids: [...picked] }; } else return;
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'x');
});
document.addEventListener('dragend', () => { drag = null; clearDnD(); });
document.addEventListener('dragover', e => {
  if (!drag) return; const tp = e.target.closest?.('.tp[data-tp]'), sr = e.target.closest?.('.sub-row[data-sub]'); const el = tp || sr; if (!el) return;
  if (drag.t === 'cat' && !tp) return; e.preventDefault(); clearDnD();
  el.classList.add((drag.t === 'item' || (drag.t === 'sub' && tp)) ? 'drop' : 'over');
});
document.addEventListener('drop', e => {
  if (!drag) return; const tp = e.target.closest?.('.tp[data-tp]'), sr = e.target.closest?.('.sub-row[data-sub]'); if (!tp && !sr) return; e.preventDefault();
  const d = drag; drag = null; clearDnD();
  if (d.t === 'item') { tp ? moveItems(d.ids, tp.dataset.tp, null) : moveItems(d.ids, selCat, sr.dataset.sub); }
  else if (d.t === 'cat' && tp && tp.dataset.tp !== d.c) { const o = catOrder(); o.splice(o.indexOf(d.c), 1); o.splice(o.indexOf(tp.dataset.tp), 0, d.c); op({ type: 'orderTopics', order: o }); }
  else if (d.t === 'sub' && sr && sr.dataset.sub !== d.s) { const a = subsOf(selCat).slice(); a.splice(a.indexOf(d.s), 1); a.splice(a.indexOf(sr.dataset.sub), 0, d.s); op({ type: 'orderSubs', cat: selCat, order: a }); }
  else if (d.t === 'sub' && tp && tp.dataset.tp !== selCat) { const to = tp.dataset.tp; op({ type: 'moveSub', cat: selCat, sub: d.s, toCat: to }); toast(`"${d.s}"을(를) ${to}(으)로 옮겼어요`); selSub = null; render(); }
});

/* ---------- 창(모달) ---------- */
function openModal(html, size) { $('#layer').innerHTML = `<div class="overlay" data-close-bg><div class="modal ${size || ''}" role="dialog" aria-modal="true">${html}</div></div>`; if ((size || '').includes('sm')) setTimeout(() => $('#layer input')?.focus(), 0); }
function closeModal() { if ($('#memo')) saveMemo(); $('#layer').innerHTML = ''; detailId = null; playing = false; }
$('#layer').addEventListener('click', e => {
  if (e.target.matches('[data-close-bg]') || e.target.closest('[data-close]')) return closeModal();
  const d = e.target.closest('[data-d]'); const it = V[detailId];
  if (d && it) {
    const a = d.dataset.d;
    if (a === 'play') { playing = true; drawDetail(); }
    else if (a === 'edit') { const id = detailId; closeModal(); openEditor(id); }
    else if (a === 'qr') { const u = it.links[0]?.url || ''; closeModal(); openQR(u); }
    else if (a === 'askdel') { confirmDel = true; drawDetail(true); }
    else if (a === 'nodel') { confirmDel = false; drawDetail(true); }
    else if (a === 'del') { const id = it.id; $('#layer').innerHTML = ''; detailId = null; op({ type: 'del', id }); toast('삭제했어요'); }
    return;
  }
  const cl = e.target.closest('[data-cls]'); if (cl && it) toggleUsage(it, cl.dataset.cls);
});
$('#layer').addEventListener('focusout', e => { if (e.target.id === 'memo') saveMemo(); });
$('#layer').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'mIn') $('#mOk')?.click(); });
let toastT; function toast(m) { document.querySelector('.toast')?.remove(); const d = document.createElement('div'); d.className = 'toast'; d.textContent = m; document.body.appendChild(d); clearTimeout(toastT); toastT = setTimeout(() => d.remove(), 2800); }

/* ---------- 자료 추가/수정 ---------- */
function suggest(text) {
  const toks = String(text).toLowerCase().split(/[^0-9a-z가-힣]+/).filter(w => w.length >= 2); if (!toks.length) return [];
  const sc = {}; V.forEach(it => { if (it.inbox) return; const hay = (it.title + ' ' + it.sub + ' ' + it.cat).toLowerCase(); let s = 0; toks.forEach(w => { if (hay.includes(w)) s += 1 + (it.sub.toLowerCase().includes(w) ? 2 : 0); }); if (s) { const k = it.cat + '\u0000' + it.sub; sc[k] = (sc[k] || 0) + s; } });
  return Object.entries(sc).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => { const [c, s] = k.split('\u0000'); return { c, s }; });
}
function openEditor(editId, preset) {
  const it = editId != null ? V[editId] : null; preset = preset || {};
  const curCat = it ? (it.inbox ? '' : it.cat) : (preset.cat ?? (!selInbox ? selCat : ''));
  openModal(`<h3>${it ? (it.inbox ? '주제 정하기' : '자료 수정') : '자료 추가'}${X}</h3>
  <div><label class="lb" for="fUrl">링크 <span class="hint">· 여러 개면 한 줄에 하나씩, 앞에 이름을 붙여도 돼요</span></label><textarea id="fUrl" rows="2" placeholder="https://youtu.be/... 붙여넣기">${esc(it ? it.url : (preset.url || ''))}</textarea></div>
  <div class="row"><div id="fThumb" style="width:150px;flex:none"></div><div class="grow"><label class="lb" for="fTitle">제목 <span class="hint" id="fTitleHint">· 비워 두면 링크에서 가져와요</span></label><input id="fTitle" value="${esc(it ? it.title : (preset.title || ''))}" placeholder="예: 7년의 기다림, 타이탄 아룸"></div></div>
  <div id="fDup"></div>
  <div><span class="lb">주제 <span class="hint">· 추천을 누르거나 직접 고르세요. 새 이름을 적으면 새 주제가 생겨요</span></span><div class="chips" id="fAi" style="margin:6px 0 8px"></div>
   <div class="row"><input id="fCat" class="grow" list="catList" placeholder="대주제" value="${esc(curCat)}" aria-label="대주제"><datalist id="catList">${catOrder().map(x => `<option value="${esc(x)}">`).join('')}</datalist><input id="fSub" class="grow" list="subList" placeholder="소주제 (선택)" value="${esc(it ? it.sub : (preset.sub ?? (!selInbox && selSub ? selSub : '')))}" aria-label="소주제"><datalist id="subList"></datalist></div></div>
  <div><label class="lb" for="fMemo">메모 (선택)</label><textarea id="fMemo" placeholder="예: 도입용, 앞 2분만">${esc(it ? it.memo : '')}</textarea></div>
  ${it ? `<div><label class="lb" for="fRel">관련 단원 <span class="hint">· 한 줄에 하나 (예: 6과학 전기의 이용 · 전자석의 성질이 궁금해!)</span></label><textarea id="fRel" class="rel-edit">${esc(it.rel)}</textarea><button class="sb" id="fRelBtn" style="margin-top:6px"><i class="ti ti-refresh" aria-hidden="true"></i>진도표에서 다시 찾기</button></div>`
      : '<div class="hint"><i class="ti ti-book-2" aria-hidden="true"></i> 관련 단원은 저장하면 진도표를 보고 자동으로 찾아요</div>'}
  <div class="foot">${it ? '' : '<button id="fInbox">미분류로 저장</button>'}<button class="primary" id="fSave">저장</button></div>`);
  let metaT, lastMetaUrl = '';
  const firstUrl = () => (SJ.links($('#fUrl').value)[0] || {}).url || '';
  const upd = () => {
    const u = firstUrl();
    $('#fThumb').innerHTML = u ? thumbHtml({ links: [{ url: u }], title: '', dur: '' }) : '<div class="th"><i class="ti ti-link" aria-hidden="true"></i></div>';
    const n = u && SJ.normUrl(u); const dup = n && V.find(x => x.id !== editId && x.links.some(l => SJ.normUrl(l.url) === n));
    $('#fDup').innerHTML = dup ? `<div class="warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> 이미 있는 자료예요: <b>${esc(dup.inbox ? '미분류' : lab({ c: dup.cat, s: dup.sub }))}</b> "${esc(titleOf(dup))}"</div>` : '';
    const sg = suggest($('#fTitle').value + ' ' + $('#fMemo').value);
    $('#fAi').innerHTML = sg.length ? sg.map((t, i) => `<span class="chip ${i === 0 ? 'ai' : ''}" role="button" tabindex="0" data-pick="${esc(t.c)}" data-picks="${esc(t.s)}">${i === 0 ? '<i class="ti ti-sparkles" aria-hidden="true"></i> ' : ''}${esc(lab(t))}</span>`).join('') : '<span class="hint">제목을 입력하면 알맞은 주제를 추천해요</span>';
    $('#subList').innerHTML = subsOf($('#fCat').value.trim()).map(s => `<option value="${esc(s)}">`).join('');
    // 링크가 바뀌고 제목이 비어 있으면 제목 가져오기
    clearTimeout(metaT);
    if (u && u !== lastMetaUrl && !$('#fTitle').value.trim()) metaT = setTimeout(async () => {
      lastMetaUrl = u; $('#fTitleHint').textContent = '· 제목 가져오는 중…';
      try { const j = await call({ action: 'meta', url: u }); if (firstUrl() === u && !$('#fTitle').value.trim() && j.meta.title) { $('#fTitle').value = j.meta.title; upd(); } } catch (e) { }
      $('#fTitleHint').textContent = '· 비워 두면 링크에서 가져와요';
    }, 500);
  };
  ['fUrl', 'fTitle', 'fMemo', 'fCat'].forEach(i => $('#' + i).addEventListener('input', upd)); upd();
  $('#fAi').addEventListener('click', e => { const p = e.target.closest('[data-pick]'); if (!p) return; $('#fCat').value = p.dataset.pick; $('#fSub').value = p.dataset.picks; upd(); });
  if ($('#fRelBtn')) $('#fRelBtn').onclick = async () => {
    $('#fRelBtn').disabled = true;
    try { const j = await call({ action: 'rel', item: { title: $('#fTitle').value, sub: $('#fSub').value, memo: $('#fMemo').value } }); $('#fRel').value = j.rel || ''; if (!j.rel) toast('맞는 단원을 찾지 못했어요'); } catch (e) { toast(e.message); }
    $('#fRelBtn').disabled = false;
  };
  const save = toInbox => {
    const url = $('#fUrl').value.trim(); if (!url) return toast('링크를 넣어 주세요');
    const c = $('#fCat').value.trim();
    if (!toInbox && !c) return toast('대주제를 골라 주세요');
    if (c === INBOX && !toInbox) return toast('"미분류"는 대주제 이름으로 쓸 수 없어요');
    const item = { title: $('#fTitle').value.trim(), url, memo: $('#fMemo').value.trim(), cat: toInbox ? INBOX : c, sub: toInbox ? '' : $('#fSub').value.trim() };
    if (it) { item.rel = $('#fRel').value.trim(); if (url !== it.url) item.dur = ''; op({ type: 'update', id: it.id, item }); }
    else op({ type: 'add', autoRel: !toInbox, item });
    if (toInbox) { selInbox = true; } else { selInbox = false; selCat = item.cat; selSub = item.sub || null; }
    closeModal(); render(); toast(it ? '고쳤어요' : (toInbox ? '미분류에 넣었어요' : '추가했어요. 제목·영상 길이·관련 단원은 저장하면서 채워져요'));
  };
  $('#fSave').onclick = () => save(false); if ($('#fInbox')) $('#fInbox').onclick = () => save(true);
}
function openQR(url) {
  openModal(`<h3>QR 만들기${X}</h3><div><label class="lb" for="qrUrl">링크 <span class="hint">(다른 링크로 바꿔도 돼요)</span></label><input id="qrUrl" value="${esc(url)}"></div><div id="qrbox"></div><div class="foot"><button id="qrSave"><i class="ti ti-download" aria-hidden="true"></i> 이미지 저장</button></div>`);
  const draw = () => { const b = $('#qrbox'); b.innerHTML = ''; const v = $('#qrUrl').value.trim(); if (!v) return; if (window.QRCode) new QRCode(b, { text: v, width: 240, height: 240, correctLevel: QRCode.CorrectLevel.M }); else b.textContent = 'QR 라이브러리를 불러오지 못했어요'; };
  $('#qrUrl').addEventListener('input', draw); draw();
  $('#qrSave').onclick = () => { const c = $('#qrbox canvas'); if (!c) return; const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'QR.png'; a.click(); };
}
function openSettings() {
  openModal(`<h3>설정${X}</h3><div><label class="lb" for="sCls">수업하는 반 <span class="hint">(쉼표로 구분 · 반이 하나면 [사용함] 버튼 하나로 바뀌어요)</span></label><input id="sCls" value="${esc(settings.classes.join(', '))}" placeholder="3-1, 3-2, 4-1"></div><div class="hint">예시: 올해 3-1, 3-2, 4-1 … / 내년 담임 5-3 · 구글 시트 '수업자료_설정' 탭에 저장돼요</div><div class="foot"><button data-close>취소</button><button class="primary" id="sOk">저장</button></div>`, 'sm');
  $('#sOk').onclick = async () => {
    const classes = $('#sCls').value.split(',').map(s => s.trim()).filter(Boolean); settings.classes = classes; closeModal(); render();
    try { const j = await call({ action: 'settings', settings: { classes } }); settings = j.settings; toast('저장했어요'); } catch (e) { toast('설정을 저장하지 못했어요'); }
  };
}

/* ---------- 클릭·키보드 ---------- */
document.addEventListener('click', e => {
  if (e.target.closest('#layer')) return;
  const dc = e.target.closest('[data-del-c]'), ds = e.target.closest('[data-del-s]');
  if (dc) { e.stopPropagation(); return askDelete(dc.dataset.delC, null); }
  if (ds) { e.stopPropagation(); return askDelete(selCat, ds.dataset.delS); }
  const t = e.target.closest('[data-act],[data-tp],[data-sub],[data-sub-all],[data-id]'); if (!t || !loaded) return;
  const a = t.dataset.act; const go = () => { query = ''; $('#q').value = ''; picked.clear(); };
  if (a === 'edit') { editing = !editing; picked.clear(); render(); }
  else if (a === 'addcat') askAdd(false);
  else if (a === 'addsub') askAdd(true);
  else if (a === 'inbox') { go(); selInbox = true; selCat = selSub = null; render(); }
  else if (t.dataset.tp != null) { const c = t.dataset.tp; if (editing && selCat === c && !selInbox) return topicSheet(c, null); go(); selInbox = false; selCat = c; selSub = null; render(); }
  else if (t.dataset.subAll != null) { selSub = null; renderLeft(); renderCenter(); }
  else if (t.dataset.sub != null) { const s = t.dataset.sub; if (editing && selSub === s) return topicSheet(selCat, s); selSub = s; renderLeft(); renderCenter(); }
  else if (t.dataset.id != null) {
    const id = +t.dataset.id;
    if (editing) { picked.has(id) ? picked.delete(id) : picked.add(id); renderCenter(); return; }
    const o = e.target.closest('[data-open]'); if (o) openDetail(id, o.dataset.open === 'play');
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#layer .overlay')) closeModal();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.tp,.sub-row,.t,.chip')) { e.preventDefault(); e.target.click(); }
});
$('#q').addEventListener('input', e => { query = e.target.value.trim(); render(); });
$('#btnSearch').onclick = () => { const b = $('#searchBox'), q = $('#q'); if (b.classList.contains('open') && !q.value) { b.classList.remove('open'); q.tabIndex = -1; } else { b.classList.add('open'); q.tabIndex = 0; q.focus(); } };
$('#q').addEventListener('blur', e => { if (!e.target.value) setTimeout(() => { if (document.activeElement !== $('#btnSearch')) { $('#searchBox').classList.remove('open'); e.target.tabIndex = -1; } }, 150); });
$('#q').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; query = ''; render(); e.target.blur(); } });
$('#btnAdd').onclick = () => loaded && openEditor(null);
$('#btnSet').onclick = () => loaded && openSettings();
window.addEventListener('beforeunload', e => { if (pend.some(p => p.op)) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- 휴대폰 공유 버튼으로 들어온 링크 → 미분류 ---------- */
function sharedLink() {
  const p = new URLSearchParams(location.search); if (!p.has('share')) return null;
  const text = [p.get('url'), p.get('text'), p.get('title')].filter(Boolean).join(' ');
  const m = text.match(/https?:\/\/\S+/); history.replaceState(null, '', location.pathname);
  return m ? { url: m[0], title: (p.get('title') && !/https?:\/\//.test(p.get('title'))) ? p.get('title') : '' } : null;
}

/* ---------- 시작 ---------- */
(async function start() {
  $('#app-version').textContent = 'v.' + APP_VERSION;
  if ('serviceWorker' in navigator && !IS_LOCAL) navigator.serviceWorker.register('sw.js').catch(() => { });
  const shared = sharedLink();
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c && c.S) { accept(c); loaded = true; render(); } } catch (e) { }
  const okLoad = await reload(loaded);
  if (!okLoad) return;
  if (shared) {
    const n = SJ.normUrl(shared.url), dup = V.find(x => x.links.some(l => SJ.normUrl(l.url) === n));
    if (dup) { toast('이미 있는 자료예요: ' + titleOf(dup)); openDetail(dup.id); }
    else { op({ type: 'add', item: { cat: INBOX, url: shared.url, title: shared.title } }); selInbox = true; selCat = null; render(); toast('미분류에 넣었어요'); }
  }
  if (S.items.some(i => !i.dur && ytId(i.url))) queueFill();
})();
