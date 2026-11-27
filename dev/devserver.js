// 개발용 서버: 앱 파일을 보여주고, /api 는 진짜 apps_script.gs 를 "가짜 구글 시트" 위에서 실행한다.
// 가짜 시트 내용은 dev/state.json 에 저장 (처음엔 수업자료_정리본.csv + tools/sheet.csv 로 시작)
//   node dev/devserver.js [port]        /dev/reset 으로 처음 상태로 되돌림
const http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), cp = require('child_process'), os = require('os');
const CSV = require('./csv.js');
const ROOT = path.join(__dirname, '..'), STATE = path.join(__dirname, 'state.json'), PORT = +process.argv[2] || 3002;

/* ---------- 가짜 구글 시트 ---------- */
let book;
function freshBook() {
  const pad = rows => rows.map(r => r.map(v => String(v)));
  return { sheets: [
    { name: '수업자료', gid: 1635305994, values: pad(CSV.parse(fs.readFileSync(path.join(ROOT, '수업자료_정리본.csv'), 'utf8'))) },
    { name: '진도표', gid: 2096007933, values: pad(CSV.parse(fs.readFileSync(path.join(ROOT, 'tools', 'sheet.csv'), 'utf8'))) },
  ] };
}
function loadBook() { book = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : freshBook(); }
function saveBook() { fs.writeFileSync(STATE, JSON.stringify(book)); }
function Sheet(s) {
  const lastRow = () => { for (let r = s.values.length - 1; r >= 0; r--) if ((s.values[r] || []).some(v => String(v ?? '').trim())) return r + 1; return 0; };
  const cell = (r, c) => { const row = s.values[r]; return row && row[c] != null ? String(row[c]) : ''; };
  const put = (r, c, v) => { while (s.values.length <= r) s.values.push([]); const row = s.values[r]; while (row.length <= c) row.push(''); row[c] = v == null ? '' : String(v); };
  function Range(r0, c0, nr, nc) {
    nr = nr || 1; nc = nc || 1;
    const get = () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(r0 - 1 + i, c0 - 1 + j)));
    return {
      getDisplayValues: get, getValues: get,
      setValues(v) { if (v.length !== nr || v[0].length !== nc) throw new Error('범위 크기가 맞지 않아요 ' + nr + 'x' + nc + ' vs ' + v.length + 'x' + v[0].length); v.forEach((row, i) => row.forEach((x, j) => put(r0 - 1 + i, c0 - 1 + j, x))); return this; },
      setValue(x) { put(r0 - 1, c0 - 1, x); return this; },
      clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (s.values[r0 - 1 + i]) put(r0 - 1 + i, c0 - 1 + j, ''); return this; },
      setNumberFormat() { return this; },
    };
  }
  return {
    getName: () => s.name, getSheetId: () => s.gid, getLastRow: lastRow,
    getRange: (r, c, nr, nc) => Range(r, c, nr, nc),
    clearContents() { s.values = []; return this; },
    deleteRow(r) { s.values.splice(r - 1, 1); },
  };
}
const SpreadsheetApp = {
  openById: () => ({
    getSheets: () => book.sheets.map(Sheet),
    getSheetByName: n => { const s = book.sheets.find(x => x.name === n); return s ? Sheet(s) : null; },
    insertSheet: n => { const s = { name: n, gid: Math.floor(Math.random() * 1e9), values: [] }; book.sheets.push(s); return Sheet(s); },
  }),
  flush: () => {},
};
const Utilities = {
  DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
  computeDigest: (alg, s) => [...crypto.createHash(alg).update(s, 'utf8').digest()],
  base64Encode: b => Buffer.from(b).toString('base64'),
  formatDate: (d, tz, f) => { const k = new Date(d.getTime() + 9 * 3600e3), p = n => String(n).padStart(2, '0');
    return f.replace('yyyy', k.getUTCFullYear()).replace('MM', p(k.getUTCMonth() + 1)).replace('dd', p(k.getUTCDate())).replace('HH', p(k.getUTCHours())).replace('mm', p(k.getUTCMinutes())).replace('ss', p(k.getUTCSeconds())); },
};
const UrlFetchApp = {  // 진짜 인터넷으로 가져옴 (curl)
  fetch(url, opt) {
    const tmp = path.join(os.tmpdir(), 'sj_fetch_' + process.pid + '.txt');
    const args = ['-s', '-L', '-m', '15', '-A', 'Mozilla/5.0', '-o', tmp, '-w', '%{http_code}'];
    Object.entries((opt && opt.headers) || {}).forEach(([k, v]) => args.push('-H', k + ': ' + v));
    let code = 0; try { code = +cp.execFileSync('curl', [...args, url], { encoding: 'utf8' }); } catch (e) { code = 0; }
    const body = fs.existsSync(tmp) ? fs.readFileSync(tmp, 'utf8') : '';
    return { getResponseCode: () => code, getContentText: () => body };
  },
};
const YouTube = {  // Apps Script 고급 서비스 흉내: 유튜브 페이지에서 길이를 읽어 같은 모양으로 돌려줌
  Videos: { list(part, opt) {
    return { items: String(opt.id).split(',').map(id => {
      const t = UrlFetchApp.fetch('https://www.youtube.com/watch?v=' + id).getContentText().match(/"lengthSeconds":"(\d+)"/);
      return t ? { id, contentDetails: { duration: 'PT' + Math.floor(t[1] / 60) + 'M' + (t[1] % 60) + 'S' } } : null;
    }).filter(Boolean) };
  } },
};
const ContentService ={ MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) };
const LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };

function gas() {  // 매번 apps_script.gs 를 새로 읽어서 실행 (고치면 바로 반영)
  const ctx = vm.createContext({ SpreadsheetApp, Utilities, UrlFetchApp, YouTube, ContentService, LockService, console, JSON, Object, Math, Date, String });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps_script.gs'), 'utf8'), ctx, { filename: 'apps_script.gs' });
  return ctx;
}

/* ---------- HTTP ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.csv': 'text/csv; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
loadBook();
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (code, type, body) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); res.end(body); };
  if (u.pathname === '/dev/reset') { book = freshBook(); saveBook(); return send(200, 'text/plain; charset=utf-8', '처음 상태로 되돌렸어요'); }
  if (u.pathname === '/api') {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      setTimeout(() => {  // GAS처럼 조금 느리게
        try {
          const g = gas();
          const out = req.method === 'POST' ? g.doPost({ postData: { contents: body } }) : g.doGet({ parameter: Object.fromEntries(u.searchParams) });
          saveBook(); send(200, 'application/json; charset=utf-8', out.s);
        } catch (e) { send(500, 'application/json; charset=utf-8', JSON.stringify({ ok: false, error: String(e.stack || e) })); }
      }, 300);
    });
    return;
  }
  let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(404, 'text/plain', 'not found');
  send(200, TYPES[path.extname(f)] || 'application/octet-stream', fs.readFileSync(f));
}).listen(PORT, () => console.log('수업자료용 개발 서버 http://localhost:' + PORT));
