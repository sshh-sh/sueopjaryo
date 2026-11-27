// data.js(목업 데이터) → 구글시트 가져오기용 CSV (빈칸 = 위와 같음 형식 유지)
const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');const window={};eval(src);
const items=window.SHEET_ITEMS,ORDER=window.TOPIC_ORDER;
const q=v=>{v=String(v??'');return /[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
const rows=[['대주제','소주제','제목','URL','관련 단원','메모','영상길이']];
let lastCat=null,lastSub=null;
for(const cat of Object.keys(ORDER)){
  if(lastCat!==null)rows.push(['','','','','','','']);
  for(const sub of ORDER[cat]){
    items.filter(i=>i.cat===cat&&i.sub===sub).forEach(it=>{
      const url=it.links.map(l=>l.label?l.label+' '+l.url:l.url).join('\n');
      const rel=(it.rel||[]).map(r=>r.u+(r.t?' · '+r.t:'')).join('\n');
      const memo=it.isNew?('출처: '+it.note):(it.note||'');
      rows.push([cat!==lastCat?cat:'',(cat!==lastCat||sub!==lastSub)?sub:'',it.title||'',url,rel,memo,'']);
      lastCat=cat;lastSub=sub});
  }
}
fs.writeFileSync(process.argv[3],'﻿'+rows.map(r=>r.map(q).join(',')).join('\r\n')+'\r\n');
console.log('data rows',rows.length-1-(Object.keys(ORDER).length-1),'items',items.length,'links',items.reduce((a,i)=>a+i.links.length,0));
