/* ===== 수업자료용 GAS 서버 (이 아래는 gas_main.js, 위는 core.js) =====
   - 수업자료 탭을 읽고 씀. 쓸 때는 "버전"이 맞을 때만(그새 시트를 직접 고쳤으면 거절하고 새로 보냄)
   - 쓰기 직전 내용은 '수업자료_백업' 탭에 통째로 남김
   - 진도표 탭은 읽기만(관련 단원 찾기) */
var SHEET_ID = '15guvRV5h9kD1iTyoIjDbPaBDDe0OaiqNeV15ILx_3_E';
var DATA_GID = 1635305994;   // 수업자료
var SYL_GID = 2096007933;    // 진도표 (읽기만)
var USE_TAB = '수업자료_사용기록', SET_TAB = '수업자료_설정', BAK_TAB = '수업자료_백업';
var NCOL = 7;

function doGet(e) { return handle_((e && e.parameter) || {}); }
function doPost(e) {
  var p = {};
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { p = {}; }
  return handle_(p);
}
function handle_(p) {
  var out;
  try { out = route_(p); } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function route_(p) {
  switch (p.action || 'load') {
    case 'load': return payload_();
    case 'op': return withLock_(function () { return doOp_(p.ver, p.op); });
    case 'fillDur': return withLock_(function () { return fillDur_(p.ver, +p.max || 15); });
    case 'meta': return { ok: true, meta: meta_(p.url) };
    case 'rel': return { ok: true, rel: relFor_(p.item || {}) };
    case 'usage': return withLock_(function () { setUsage_(p.url, p.title, p.cls, !!p.on); return { ok: true, usage: readUsage_() }; });
    case 'settings': return withLock_(function () { saveSettings_(p.settings || {}); return { ok: true, settings: readSettings_() }; });
    default: throw new Error('알 수 없는 요청: ' + p.action);
  }
}
function withLock_(fn) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- 시트 읽기·쓰기 ---------- */
function book_() { return SpreadsheetApp.openById(SHEET_ID); }
function byGid_(gid) {
  var sh = book_().getSheets();
  for (var i = 0; i < sh.length; i++) if (sh[i].getSheetId() == gid) return sh[i];
  throw new Error('탭을 찾을 수 없어요 (gid ' + gid + ')');
}
function tab_(name, head) {
  var b = book_(), t = b.getSheetByName(name);
  if (!t) { t = b.insertSheet(name); if (head) t.getRange(1, 1, 1, head.length).setValues([head]); }
  return t;
}
function readValues_() {
  var sh = byGid_(DATA_GID), n = Math.max(sh.getLastRow(), 1);
  return sh.getRange(1, 1, n, NCOL).getDisplayValues();
}
function verOf_(values) {
  var trimmed = values.slice(); // 끝의 빈 줄은 버전에 넣지 않음
  while (trimmed.length > 1 && trimmed[trimmed.length - 1].every(function (v) { return !String(v).trim(); })) trimmed.pop();
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(trimmed), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(d);
}
function writeValues_(rows, old) {
  var bak = tab_(BAK_TAB); bak.clearContents();
  bak.getRange(1, 1, old.length, NCOL).setValues(old);
  bak.getRange(1, NCOL + 2).setValue('백업 시각: ' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'));
  var sh = byGid_(DATA_GID), n = Math.max(old.length, rows.length, sh.getLastRow());
  sh.getRange(1, 1, n, NCOL).clearContent();
  var w = sh.getRange(1, 1, rows.length, NCOL);
  w.setNumberFormat('@');   // "2:14" 같은 글자가 시간으로 바뀌지 않게
  w.setValues(rows);
  SpreadsheetApp.flush();
}
function payload_() {
  var v = readValues_();
  return { ok: true, api: 2, youtube: typeof YouTube !== 'undefined', ver: verOf_(v), data: SJ.normalize(SJ.parseTable(v)), usage: readUsage_(), settings: readSettings_() };
}
function doOp_(ver, op) {
  var v = readValues_();
  if (ver !== verOf_(v)) { var fresh = payload_(); fresh.ok = false; fresh.code = 'changed'; return fresh; }
  var st = SJ.normalize(SJ.parseTable(v));
  // 서버에서 채워 주는 것: 새 자료의 영상 길이·제목, 관련 단원
  if ((op.type === 'add' || op.type === 'update') && op.item) {
    if (op.type === 'add' && (!op.item.dur || !op.item.title)) {
      var first = SJ.links(op.item.url)[0], m = meta_(first ? first.url : op.item.url);
      if (!op.item.dur && m.dur) op.item.dur = m.dur;
      if (!op.item.title && m.title) op.item.title = m.title;
    }
    var base = op.type === 'update' ? Object.assign({}, st.items[op.id], op.item) : op.item;
    if (op.autoRel) op.item.rel = relFor_(base);
  }
  var oldUrl = op.type === 'update' && st.items[op.id] ? st.items[op.id].url : null;
  var st2 = SJ.applyOp(st, op);
  writeValues_(SJ.serialize(st2), v);
  if (oldUrl && op.item && op.item.url != null && op.item.url !== oldUrl) renameUsage_(oldUrl, op.item.url);
  return payload_();
}
function fillDur_(ver, max) {
  var v = readValues_();
  if (ver !== verOf_(v)) { var fresh = payload_(); fresh.ok = false; fresh.code = 'changed'; return fresh; }
  var st = SJ.normalize(SJ.parseTable(v)), todo = [], left = 0;
  st.items.forEach(function (it, i) {
    var id = SJ.ytId(it.url); if (it.dur || !id) return;
    if (todo.length >= max) { left++; return; }
    todo.push({ i: i, id: id });
  });
  if (!todo.length) { var o0 = payload_(); o0.left = 0; o0.filled = 0; return o0; }
  var durs = ytDurations_(todo.map(function (t) { return t.id; }));
  if (!durs) { var o1 = payload_(); o1.left = 0; o1.filled = 0; o1.noService = true; return o1; } // YouTube 서비스가 없으면 아무것도 안 씀
  var fields = {};
  todo.forEach(function (t) { fields[t.i] = { dur: durs[t.id] || '-' }; });   // 유튜브에 없는 영상(삭제·비공개)만 '-'
  writeValues_(SJ.serialize(SJ.applyOp(st, { type: 'setFields', fields: fields })), v);
  var out = payload_(); out.left = left; out.filled = todo.length; return out;
}
/* 영상 길이: Apps Script의 고급 서비스 "YouTube Data API"로 한 번에 50개까지. 서비스를 안 켰으면 null */
function ytDurations_(ids) {
  if (typeof YouTube === 'undefined') return null;
  var out = {};
  for (var k = 0; k < ids.length; k += 50) {
    var res = YouTube.Videos.list('contentDetails', { id: ids.slice(k, k + 50).join(','), maxResults: 50 });
    (res.items || []).forEach(function (v) {
      var m = String(v.contentDetails && v.contentDetails.duration || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (m) out[v.id] = SJ.fmtDur((+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0)) || '0:00';
    });
  }
  return out;
}

/* ---------- 링크 정보: 제목·영상 길이 ---------- */
function meta_(url) {
  url = String(url || '').trim(); var out = { title: '', dur: '' }; if (!url) return out;
  var id = SJ.ytId(url);
  try {
    if (id) {
      var r = UrlFetchApp.fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id), { muteHttpExceptions: true });
      if (r.getResponseCode() === 200) out.title = JSON.parse(r.getContentText()).title || '';
      var w = UrlFetchApp.fetch('https://www.youtube.com/watch?v=' + id + '&hl=ko', { muteHttpExceptions: true, headers: { 'Accept-Language': 'ko' } });
      var wt = w.getContentText(), m = wt.match(/"lengthSeconds":"(\d+)"/);
      if (m) out.dur = SJ.fmtDur(+m[1]);
      if (!out.dur) { try { var dd = ytDurations_([id]); if (dd && dd[id]) out.dur = dd[id]; } catch (e2) { } }
      if (!out.title) { var tt = wt.match(/<meta[^>]+(?:name="title"|property="og:title")[^>]+content="([^"]+)"/); if (tt) out.title = tt[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
    } else {
      var p = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
      var html = p.getContentText().slice(0, 200000);
      var t = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || html.match(/<title[^>]*>([^<]+)</i);
      if (t) out.title = t[1].replace(/\s+/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
    }
  } catch (err) { /* 못 가져오면 빈 값 */ }
  return out;
}

/* ---------- 관련 단원: 진도표의 단원·학습주제와 글자 겹침으로 찾기 ---------- */
var STOP_ = ['과학', '알아', '볼까', '어떻게', '무엇', '어떤', '까요', '하는', '일을', '우리', '생활', '찾아', '해볼', '대해', '있을', '일까', '마무', '무리', '하기', '만들', '들기'];
function bigrams_(s) {
  var t = String(s || '').replace(/[^가-힣a-zA-Z0-9]/g, ' ').toLowerCase(), out = {};
  t.split(/\s+/).forEach(function (w) { for (var i = 0; i + 1 < w.length; i++) { var g = w.substr(i, 2); if (STOP_.indexOf(g) < 0) out[g] = 1; } });
  return out;
}
function units_() {
  var sh = byGid_(SYL_GID), n = sh.getLastRow(); if (n < 2) return [];
  var v = sh.getRange(2, 1, n - 1, 10).getDisplayValues(), map = {}, list = [];
  v.forEach(function (r) {
    var subj = String(r[1]).trim(), unit = String(r[5]).trim(), topic = String(r[6]).split('\n')[0].trim();
    var m = subj.match(/^(\d)(.+)$/); if (!m || !unit) return;
    var name = unit.replace(/^\d+\.\s*/, '').replace(/\(개정[^)]*\)/, '').replace(/\s+/g, ' ').trim();
    if (/^안전/.test(name)) name = '안전하게 탐구하기';
    var key = m[2] + '|' + name; if (!map[key]) { map[key] = { subj: m[2], name: name, grades: [], topics: [] }; list.push(map[key]); }
    if (map[key].grades.indexOf(+m[1]) < 0) map[key].grades.push(+m[1]);
    topic = topic.replace(/^\d+\.\s*/, '').replace(/\s*\(\d\/\d\)\s*$/, '');
    if (topic && map[key].topics.indexOf(topic) < 0) map[key].topics.push(topic);
  });
  list.forEach(function (u) {
    var g = u.grades.sort(); u.label = (g.length >= 3 && g[g.length - 1] - g[0] === g.length - 1 ? g[0] + '~' + g[g.length - 1] : g.join('·')) + u.subj + ' ' + u.name;
  });
  return list;
}
function relFor_(item) {
  var text = [item.title, item.sub, item.memo].join(' '), mine = bigrams_(text);
  var best = null;
  units_().forEach(function (u) {
    var ub = bigrams_(u.name), us = 0; Object.keys(ub).forEach(function (g) { if (mine[g]) us++; });
    u.topics.forEach(function (tp) {
      var tb = bigrams_(tp), ts = 0; Object.keys(tb).forEach(function (g) { if (mine[g] && !ub[g]) ts++; });
      var sc = us * 2 + ts;
      if (!best || sc > best.sc) best = { sc: sc, u: u, t: tp, ts: ts, us: us };
    });
    if (!u.topics.length && us && (!best || us * 2 > best.sc)) best = { sc: us * 2, u: u, t: '', ts: 0, us: us };
  });
  if (!best || best.sc < 3) return '';
  return best.u.label + (best.ts >= 2 ? ' · ' + best.t : '');
}

/* ---------- 사용기록 탭: 날짜 · URL · 제목 · 반 ---------- */
var USE_HEAD = ['날짜', 'URL', '제목', '반'];
function readUsage_() {
  var t = book_().getSheetByName(USE_TAB); if (!t || t.getLastRow() < 2) return {};
  var v = t.getRange(2, 1, t.getLastRow() - 1, 4).getDisplayValues(), out = {};
  v.forEach(function (r) { var k = SJ.normUrl((SJ.links(r[1])[0] || {}).url || r[1]); if (!k || !r[3]) return; (out[k] = out[k] || {})[r[3]] = r[0]; });
  return out;
}
function setUsage_(url, title, cls, on) {
  var t = tab_(USE_TAB, USE_HEAD), key = SJ.normUrl((SJ.links(url)[0] || {}).url || url);
  var n = t.getLastRow();
  if (n >= 2) {
    var v = t.getRange(2, 1, n - 1, 4).getDisplayValues();
    for (var i = v.length - 1; i >= 0; i--) if (SJ.normUrl((SJ.links(v[i][1])[0] || {}).url || v[i][1]) === key && v[i][3] === cls) t.deleteRow(i + 2);
  }
  if (on) { var r = t.getLastRow() + 1; t.getRange(r, 1, 1, 4).setNumberFormat('@').setValues([[Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'), url, title || '', cls]]); }
}
function renameUsage_(oldUrl, newUrl) {
  var t = book_().getSheetByName(USE_TAB); if (!t || t.getLastRow() < 2) return;
  var rg = t.getRange(2, 2, t.getLastRow() - 1, 1), v = rg.getValues(), ch = false;
  v.forEach(function (r) { if (r[0] === oldUrl) { r[0] = newUrl; ch = true; } });
  if (ch) rg.setValues(v);
}

/* ---------- 설정 탭: 수업하는 반, 대주제 아이콘 ---------- */
function readSettings_() {
  var t = book_().getSheetByName(SET_TAB), out = { classes: [], icons: {} }; if (!t || t.getLastRow() < 2) return out;
  t.getRange(2, 1, t.getLastRow() - 1, 2).getDisplayValues().forEach(function (r) {
    if (r[0] === '수업하는 반') out.classes = String(r[1]).split(',').map(function (s) { return s.trim(); }).filter(String);
    if (r[0] === '대주제 아이콘') { try { out.icons = JSON.parse(r[1] || '{}'); } catch (e) { } }
  });
  return out;
}
function saveSettings_(s) {
  var cur = readSettings_();
  if (s.classes) cur.classes = s.classes;
  if (s.icons) Object.keys(s.icons).forEach(function (k) { cur.icons[k] = s.icons[k]; });
  var t = tab_(SET_TAB, ['항목', '값']);
  t.getRange(2, 1, 2, 2).setNumberFormat('@').setValues([['수업하는 반', cur.classes.join(', ')], ['대주제 아이콘', JSON.stringify(cur.icons)]]);
}

/* 편집기에서 한 번 실행하면 유튜브 읽기 권한을 허용하는 창이 뜸 */
function 권한허용() { Logger.log(JSON.stringify(ytDurations_(['4FJi_Pkgcdk']))); }
