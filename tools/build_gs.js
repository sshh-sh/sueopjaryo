// core.js + gas_main.js → apps_script.gs (GAS 편집기에 통째로 붙여넣는 파일)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'core.js'), 'utf8').replace(/\nif \(typeof module[^\n]*\n?/, '\n');
const main = fs.readFileSync(path.join(root, 'gas_main.js'), 'utf8');
const out = '/* 수업자료용 GAS — 자동으로 만든 파일입니다. 고칠 때는 core.js / gas_main.js를 고치고 tools/build_gs.js를 실행하세요. */\n\n' + core + '\n' + main;
fs.writeFileSync(path.join(root, 'apps_script.gs'), out);
console.log('apps_script.gs', out.length, 'bytes');
