/* 수업자료용 공통 로직 — 앱(app.js)과 GAS(apps_script.gs)가 똑같은 코드를 씀.
   시트 표 ⇄ 자료 목록 변환, 편집 동작(applyOp). 바꾸면 tools/build_gs.js로 apps_script.gs를 다시 만들 것. */
var SJ = (function () {
  var HEAD = ['대주제', '소주제', '제목', 'URL', '관련 단원', '메모', '영상길이'];
  var INBOX = '미분류';
  function str(v) { return v == null ? '' : String(v); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* 시트 값(머리글 포함 2차원 배열) → {topics:[{name,subs:[]}], items:[]}
     빈칸은 위의 값을 따름. 소주제는 같은 대주제 안에서만 이어받음. 미분류 묶음은 topics에 넣지 않음 */
  function parseTable(values) {
    var topics = [], items = [], cat = '', sub = '';
    function topic(c) {
      for (var i = 0; i < topics.length; i++) if (topics[i].name === c) return topics[i];
      var t = { name: c, subs: [] }; topics.push(t); return t;
    }
    for (var r = 1; r < values.length; r++) {
      var row = values[r] || [];
      var a = str(row[0]).trim(), b = str(row[1]).trim();
      var c = str(row[2]).trim(), d = str(row[3]).trim(), e = str(row[4]).trim(), f = str(row[5]).trim(), g = str(row[6]).trim();
      if (!a && !b && !c && !d && !e && !f && !g) continue;
      if (a) { cat = a; sub = ''; }
      if (b) sub = b;
      if (!cat) cat = INBOX;
      if (cat === INBOX) sub = '';
      else { var t = topic(cat); if (sub && t.subs.indexOf(sub) < 0) t.subs.push(sub); }
      if (!c && !d && !e && !f && !g) continue; // 대주제·소주제만 적힌 줄 = 빈 주제
      items.push({ cat: cat, sub: sub, title: c, url: d, rel: e, memo: f, dur: g });
    }
    return { topics: topics, items: items };
  }

  /* 자료 목록 → 시트 값(머리글 포함). 대주제·소주제는 묶음 첫 줄에만, 대주제 사이 빈 줄, 미분류는 맨 끝 */
  function serialize(st) {
    var rows = [HEAD.slice()];
    function row(cat, sub, it) { rows.push([cat, sub, it ? it.title : '', it ? it.url : '', it ? it.rel : '', it ? it.memo : '', it ? it.dur : '']); }
    function blank() { rows.push(['', '', '', '', '', '', '']); }
    st.topics.forEach(function (t, ti) {
      if (ti > 0) blank();
      var catW = t.name;
      st.items.forEach(function (it) {
        if (it.cat === t.name && (!it.sub || t.subs.indexOf(it.sub) < 0)) { row(catW, '', it); catW = ''; }
      });
      t.subs.forEach(function (s) {
        var subW = s, any = false;
        st.items.forEach(function (it) {
          if (it.cat === t.name && it.sub === s) { row(catW, subW, it); catW = ''; subW = ''; any = true; }
        });
        if (!any) { row(catW, s, null); catW = ''; }
      });
      if (catW) row(catW, '', null);
    });
    var inbox = st.items.filter(function (it) { return it.cat === INBOX; });
    if (inbox.length) {
      if (st.topics.length) blank();
      inbox.forEach(function (it, i) { row(i === 0 ? INBOX : '', '', it); });
    }
    return rows;
  }

  function normalize(st) { return parseTable(serialize(st)); }

  function findTopic(st, c) { for (var i = 0; i < st.topics.length; i++) if (st.topics[i].name === c) return st.topics[i]; return null; }
  function ensure(st, c, s) {
    if (!c || c === INBOX) return;
    var t = findTopic(st, c); if (!t) { t = { name: c, subs: [] }; st.topics.push(t); }
    if (s && t.subs.indexOf(s) < 0) t.subs.push(s);
  }
  function cleanItem(x) {
    var it = { cat: str(x.cat).trim() || INBOX, sub: str(x.sub).trim(), title: str(x.title).trim(), url: str(x.url).trim(), rel: str(x.rel).trim(), memo: str(x.memo).trim(), dur: str(x.dur).trim() };
    if (it.cat === INBOX) it.sub = '';
    return it;
  }
  function moveGroup(st, c, s, toC, toS) { // c(›s) 안의 자료를 toC(›toS)로
    st.items.forEach(function (it) {
      if (it.cat === c && (s == null || it.sub === s)) { it.cat = toC; it.sub = toC === INBOX ? '' : (s == null ? it.sub : (toS || '')); }
    });
  }

  /* 편집 동작. 항상 새 상태를 돌려줌(정리된 순서로). id = 정리된 목록에서의 순번 */
  function applyOp(st0, op) {
    var st = clone(st0), t, i;
    switch (op.type) {
      case 'add': { var it = cleanItem(op.item); ensure(st, it.cat, it.sub); st.items.push(it); break; }
      case 'update': {
        if (!st.items[op.id]) throw new Error('자료를 찾을 수 없어요');
        var nu = cleanItem(Object.assign({}, st.items[op.id], op.item)); ensure(st, nu.cat, nu.sub); st.items[op.id] = nu; break;
      }
      case 'del': {
        var ids = (op.ids || [op.id]).slice().sort(function (a, b) { return b - a; });
        ids.forEach(function (k) { if (st.items[k]) st.items.splice(k, 1); }); break;
      }
      case 'move': {
        ensure(st, op.cat, op.sub);
        (op.ids || []).forEach(function (k) { var x = st.items[k]; if (x) { x.cat = op.cat || INBOX; x.sub = x.cat === INBOX ? '' : (op.sub || ''); } });
        break;
      }
      case 'addTopic': ensure(st, op.cat, op.sub || ''); break;
      case 'rename': { // {cat, sub(null=대주제), to}
        var to = str(op.to).trim(); if (!to) break;
        if (op.sub == null) {
          if (to === op.cat) break;
          if (findTopic(st, to)) return applyOp(st, { type: 'merge', cat: op.cat, sub: null, toCat: to, toSub: null });
          t = findTopic(st, op.cat); if (!t) break; t.name = to;
          st.items.forEach(function (it) { if (it.cat === op.cat) it.cat = to; });
        } else {
          t = findTopic(st, op.cat); if (!t || to === op.sub) break;
          if (t.subs.indexOf(to) >= 0) return applyOp(st, { type: 'merge', cat: op.cat, sub: op.sub, toCat: op.cat, toSub: to });
          i = t.subs.indexOf(op.sub); if (i >= 0) t.subs[i] = to;
          st.items.forEach(function (it) { if (it.cat === op.cat && it.sub === op.sub) it.sub = to; });
        }
        break;
      }
      case 'merge': { // c(›s) → toCat(›toSub)
        if (op.sub == null) {
          moveGroup(st, op.cat, null, op.toCat, null);
          var src = findTopic(st, op.cat), dst = findTopic(st, op.toCat);
          if (src && dst) src.subs.forEach(function (s) { if (dst.subs.indexOf(s) < 0) dst.subs.push(s); });
          st.topics = st.topics.filter(function (x) { return x.name !== op.cat; });
        } else {
          ensure(st, op.toCat, op.toSub);
          moveGroup(st, op.cat, op.sub, op.toCat, op.toSub);
          t = findTopic(st, op.cat); if (t && !(op.toCat === op.cat && op.toSub === op.sub)) t.subs = t.subs.filter(function (s) { return s !== op.sub; });
        }
        break;
      }
      case 'delTopic': { // 안의 자료는 미분류로
        moveGroup(st, op.cat, op.sub == null ? null : op.sub, INBOX, '');
        if (op.sub == null) st.topics = st.topics.filter(function (x) { return x.name !== op.cat; });
        else { t = findTopic(st, op.cat); if (t) t.subs = t.subs.filter(function (s) { return s !== op.sub; }); }
        break;
      }
      case 'orderTopics': {
        var ord = op.order || [];
        st.topics.sort(function (a, b) { var x = ord.indexOf(a.name), y = ord.indexOf(b.name); return (x < 0 ? 1e9 : x) - (y < 0 ? 1e9 : y); });
        break;
      }
      case 'orderSubs': {
        t = findTopic(st, op.cat); if (!t) break; var o2 = op.order || [];
        t.subs.sort(function (a, b) { var x = o2.indexOf(a), y = o2.indexOf(b); return (x < 0 ? 1e9 : x) - (y < 0 ? 1e9 : y); });
        break;
      }
      case 'moveSub': { // 소주제를 다른 대주제 밑으로
        if (op.cat === op.toCat) break;
        ensure(st, op.toCat, op.sub);
        moveGroup(st, op.cat, op.sub, op.toCat, op.sub);
        t = findTopic(st, op.cat); if (t) t.subs = t.subs.filter(function (s) { return s !== op.sub; });
        break;
      }
      case 'setFields': { // {fields:{id:{dur:'3:12', rel:'…'}}} — 서버가 영상 길이·관련 단원 채울 때
        Object.keys(op.fields || {}).forEach(function (k) {
          var x = st.items[+k]; if (!x) return; var f = op.fields[k];
          ['title', 'rel', 'memo', 'dur'].forEach(function (key) { if (f[key] != null) x[key] = str(f[key]).trim(); });
        });
        break;
      }
      default: throw new Error('알 수 없는 동작: ' + op.type);
    }
    return normalize(st);
  }

  /* ---------- 링크·유튜브 도우미 ---------- */
  function links(urlCell) { // "이름 https://…" 여러 줄 → [{label,url}]
    var out = [];
    str(urlCell).split(/\n/).forEach(function (line) {
      line.trim().split(/\s+\/\s+/).forEach(function (p) {
        var m = p.match(/https?:\/\/\S+/); if (m) out.push({ label: p.replace(m[0], '').trim(), url: m[0] });
      });
    });
    return out;
  }
  function ytId(u) { var m = str(u).match(/(?:youtu\.be\/|[?&]v=|shorts\/|embed\/|live\/)([\w-]{11})/); return m ? m[1] : null; }
  function normUrl(u) {
    var id = ytId(u); if (id) return 'yt:' + id;
    return str(u).trim().replace(/^https?:\/\/(www\.|m\.)?/, '').replace(/[?#].*$/, '').replace(/\/$/, '');
  }
  function fmtDur(sec) {
    sec = Math.round(+sec || 0); if (!sec) return '';
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  return { HEAD: HEAD, INBOX: INBOX, parseTable: parseTable, serialize: serialize, normalize: normalize, applyOp: applyOp,
    links: links, ytId: ytId, normUrl: normUrl, fmtDur: fmtDur, clone: clone };
})();
if (typeof module !== 'undefined') module.exports = SJ;
