const fs=require('fs');
function parse(t){const rows=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c=='"'){if(t[i+1]=='"'){f+='"';i++}else q=false}else f+=c}else if(c=='"')q=true;else if(c==','){row.push(f);f=''}else if(c=='\n'){row.push(f);rows.push(row);row=[];f=''}else if(c!='\r')f+=c}if(f||row.length){row.push(f);rows.push(row)}return rows}
// ---- 진도표 단원 목록 ----
const syl=parse(fs.readFileSync('sheet.csv','utf8')).slice(1);
const normU=u=>u.replace(/^\d+\.\s*/,'').replace(/\(개정[^)]*\)/,'').replace(/\s+/g,' ').trim();
const normT=t=>t.split('\n')[0].replace(/^\d+\.\s*/,'').replace(/\s*\(\d\/\d\)\s*$/,'').replace(/\s*\(\d?\/?\s*$/,'').trim();
const units={};
syl.forEach(r=>{const subj=r[1],u=(r[5]||'').trim();if(!subj||!u)return;const m=subj.match(/^(\d)(.+)$/);if(!m)return;
  const name=normU(u)==='안전하게 탐구하기'?'안전':normU(u);const key=m[2]+'|'+name;
  const U=units[key]=units[key]||{subj:m[2],name,grades:new Set(),topics:[]};U.grades.add(+m[1]);
  const tp=normT(r[6]||'');if(tp&&!U.topics.includes(tp))U.topics.push(tp)});
function gradeLabel(U){const g=[...U.grades].sort();if(g.length>=3&&g[g.length-1]-g[0]===g.length-1)return g[0]+'~'+g[g.length-1]+U.subj;return g.join('·')+U.subj}
function rel(subj,name,phrase){const U=units[subj+'|'+name];if(!U)throw new Error('no unit '+subj+' '+name);
  let t='';if(phrase){t=U.topics.find(x=>x.includes(phrase));if(!t)throw new Error('no topic '+phrase+' in '+name)}
  return{u:gradeLabel(U)+' '+(name==='안전'?'안전하게 탐구하기':name),t}}
// ---- 자료 ----
const res=parse(fs.readFileSync('tab2.csv','utf8')).slice(1);
let cat='',sub='';const items=[];
res.forEach((r,i)=>{const [a,b,c,d]=r.slice(0,4).map(s=>(s||'').trim());if(a){cat=a;sub=''}if(b)sub=b;if(!c&&!d)return;
  const links=[];d.split('\n').forEach(line=>{line.trim().split(/\s+\/\s+/).forEach(p=>{const m=p.match(/https?:\/\/\S+/);if(m)links.push({label:p.replace(m[0],'').trim(),url:m[0]})})});
  items.push({row:i+2,oldCat:cat,oldSub:sub,title:c,links,note:d.split('\n').filter(l=>!/https?:\/\//.test(l)).join(' ')})});
// ---- 대주제 5개로 재분류 ----
function remap(it){const c=it.oldCat,s=it.oldSub,t=it.title||'';
  if(c==='우주'){if(s==='태양, 항성'||s==='행성')return['지구와 우주','태양계와 행성'];if(s==='지구와 달'||s==='계절')return['지구와 우주','지구와 달'];
    if(s==='별자리')return /마션/.test(t)?['지구와 우주','우주 탐사']:['지구와 우주','별자리와 관측'];if(s==='우주탐사')return['지구와 우주','우주 탐사']}
  if(c==='날씨'||(c==='에너지효율'&&s==='기후변화'))return['지구와 우주','날씨와 기후'];
  if(c==='몸')return /심폐소생술|건강|질병|병원/.test(t)?['생물과 몸','건강과 안전']:['생물과 몸','우리 몸'];
  if(c==='공통'){if(s==='전담정보')return['수업 도구','수업 운영'];if(/카드뉴스/.test(t))return['수업 도구','카드뉴스'];return['생물과 몸','건강과 안전']}
  if(c==='식물'){if(s==='세포')return['생물과 몸','세포'];if(['뿌리','줄기','잎'].includes(s))return['생물과 몸','뿌리·줄기·잎'];if(s==='꽃'||s==='씨앗, 열매')return['생물과 몸','꽃과 씨앗'];return['생물과 몸','식물 이야기']}
  if(c==='동물'||c==='기타생물')return['생물과 몸','다양한 생물'];
  if(c==='물질'){if(s==='고체')return['물질과 에너지','열의 이동'];if(s==='기체')return['물질과 에너지','기체'];if(s==='물상태변화-물절약')return['물질과 에너지','물 얻기와 물 절약'];
    if(['액체','혼합물','연소'].includes(s))return['물질과 에너지','용해·혼합물·연소'];if(s==='속력'||s==='힘과 우리생활')return['물질과 에너지','힘과 에너지'];return['물질과 에너지','물질의 상태 변화']}
  if(c==='소리')return['물질과 에너지','소리'];if(c==='빛과렌즈')return['물질과 에너지','빛과 렌즈'];if(c==='전기')return['물질과 에너지','전기'];if(c==='에너지효율')return['물질과 에너지','힘과 에너지'];
  if(c==='놀이')return['놀이·활동',s==='교실놀이'?'교실 놀이':'체육'];
  if(c==='잡다한 것'){if(/글쓰기/.test(t))return['수업 도구','글쓰기'];if(/수업관리|폰트/.test(t))return['수업 도구','수업 운영'];return['놀이·활동','게임']}
  throw new Error('unmapped '+c+' '+s)}
// ---- 관련 단원 판단 (진도표 기준) ----
const S='과학';
function related(it){const t=(it.title||'')+' '+it.links.map(l=>l.label+' '+l.url).join(' ');const s=it.sub,o=it.oldSub;const R=(...a)=>a;
  switch(s){
  case '태양계와 행성': if(/크기|got balls|행성떼|모형/.test(t))return R(rel(S,'밤하늘 관찰','태양계 행성 모형'));return R(rel(S,'밤하늘 관찰','태양계 구성원'));
  case '지구와 달': if(/위상/.test(t))return R(rel(S,'밤하늘 관찰','달의 모양을 여러 날'));if(/공전/.test(t))return R(rel(S,'지구의 운동','지구의 공전'));if(/낮과밤|자전-/.test(t))return R(rel(S,'지구의 운동','낮과 밤이 생기는'));if(/홈쇼핑/.test(t))return R(rel(S,'계절의 변화','계절 변화의 원인'));if(/달/.test(t))return R(rel(S,'밤하늘 관찰','달의 생김새'));return[];
  case '별자리와 관측': if(/계절/.test(t))return R(rel(S,'지구의 운동','계절에 따라 달라지는 별자리'));if(/북극성|별자리/.test(t))return R(rel(S,'밤하늘 관찰','북극성 주변의 별자리'));if(/블루킷|운동/.test(t))return R(rel(S,'지구의 운동',''));return R(rel(S,'밤하늘 관찰',''));
  case '우주 탐사': if(/누리호|아르테미스/.test(t))return R(rel(S,'밤하늘 관찰','다누리'));return R(rel(S,'밤하늘 관찰','태양계 구성원'));
  case '날씨와 기후': if(/이슬/.test(t))return R(rel(S,'날씨와 우리 생활','이슬, 안개, 구름'));if(/기상청/.test(t))return R(rel(S,'기후 변화와 우리 생활','기후변화 현상의 예'));return R(rel(S,'기후 변화와 우리 생활','우리 생활과 환경에 어떤 영향'));
  case '세포': if(/공변|기공/.test(t))return R(rel(S,'식물의 구조와 기능','잎에 도달한 물'));if(/우리 몸|인간/.test(t))return R(rel(S,'식물의 구조와 기능','세포가 궁금해'),rel(S,'우리 몸의 구조와 기능',''));return R(rel(S,'식물의 구조와 기능','세포가 궁금해'));
  case '뿌리·줄기·잎': if(o==='뿌리')return R(rel(S,'식물의 구조와 기능','뿌리의 생김새'));if(o==='줄기')return R(rel(S,'식물의 구조와 기능','줄기의 생김새'));if(/도달|시든/.test(t))return R(rel(S,'식물의 구조와 기능','잎에 도달한 물'));if(/뿌리와 잎/.test(t))return R(rel(S,'식물의 구조와 기능','각 기관은 연결'));return R(rel(S,'식물의 구조와 기능','잎에서 양분'));
  case '꽃과 씨앗': if(/벨크로/.test(t))return R(rel(S,'식물의 생활','생활용품을 찾아라'));return R(rel(S,'식물의 구조와 기능','꽃의 생김새'));
  case '식물 이야기': if(/아이디어|생체모방/.test(t))return R(rel(S,'식물의 생활','생활용품을 찾아라'));if(/사막/.test(t))return R(rel(S,'식물의 생활','사막이나 높은 산'));if(/생태원|padlet/.test(t))return R(rel(S,'식물의 생활','우리 주변에는 어떤 식물'));return R(rel(S,'식물의 생활',''));
  case '다양한 생물': if(/AR|v-sam/.test(t))return R(rel(S,'동물의 생활','동물 사파리'));if(/플라스틱/.test(t))return R(rel(S,'다양한 생물과 우리 생활','우리 생활에 어떤 영향을 줄까'));if(/동충하초|좀비개미|곰팡이/.test(t))return R(rel(S,'다양한 생물과 우리 생활','버섯과 곰팡이의 정체'));if(/갯벌/.test(t))return R(rel(S,'지구와 바다','자연의 보물 창고'));return[];
  case '우리 몸': if(/소화|장내|음식/.test(t))return R(rel(S,'우리 몸의 구조와 기능','먹은 음식물'));if(/뼈|움직/.test(t))return R(rel(S,'우리 몸의 구조와 기능','어떻게 움직일까'));if(/세포/.test(t))return R(rel(S,'우리 몸의 구조와 기능',''),rel(S,'식물의 구조와 기능','세포가 궁금해'));return R(rel(S,'우리 몸의 구조와 기능',''));
  case '건강과 안전': if(/질병|병원/.test(t))return R(rel(S,'우리 몸의 구조와 기능','질병을 찾아'));if(/체크리스트/.test(t))return R(rel(S,'우리 몸의 구조와 기능','점검표'));if(/깨진|이승탈출/.test(t))return R(rel(S,'안전',''));return[];
  case '열의 이동': if(/전도/.test(t))return R(rel(S,'열과 우리 생활','고체에서는 열이'));if(/대류/.test(t))return R(rel(S,'열과 우리 생활','액체와 기체에서는 열이'));return R(rel(S,'열과 우리 생활',''));
  case '기체': if(/분자 운동/.test(t))return R(rel(S,'여러 가지 기체','온도가 변'));if(/과자봉지/.test(t))return R(rel(S,'여러 가지 기체','압력이 변하면'));return R(rel(S,'여러 가지 기체',''));
  case '물질의 상태 변화': if(/세가지 상태|세 가지/.test(t))return R(rel(S,'물체와 물질','물질의 세 가지 상태'));if(/플라즈마|고체액체기체|고,액,기/.test(t))return R(rel(S,'물체와 물질','고체, 액체, 기체는 어떻게'));if(/얼음/.test(t))return R(rel(S,'물의 상태 변화','물이 얼 때와'));if(/자바|분자/.test(t))return R(rel(S,'물의 상태 변화','물의 상태가 변할 수'));return R(rel(S,'물의 상태 변화',''));
  case '물 얻기와 물 절약': if(/빙하|극지/.test(t))return R(rel(S,'물의 상태 변화','극지연구소'));return R(rel(S,'물의 상태 변화','물을 얻는 방법'));
  case '용해·혼합물·연소': if(/알약|녹는/.test(t))return R(rel(S,'용해와 용액','물에 녹을까'));if(/혼합물/.test(t))return R(rel(S,'혼합물의 분리','혼합물을 왜 분리'));if(/양초/.test(t))return R(rel(S,'물질의 연소','물질이 탈 때'));if(/과산화수소/.test(t))return R(rel(S,'물질의 연소','서로 다른 물질을 섞으면'));return[];
  case '소리': if(/시각화/.test(t))return R(rel(S,'소리의 성질','소리는 어떻게 나는'));if(/높낮이/.test(t))return R(rel(S,'소리의 성질','높은 소리와 낮은 소리'));return R(rel(S,'소리의 성질',''));
  case '빛과 렌즈': if(/신호/.test(t))return R(rel(S,'빛의 성질','숫자 신호'));if(/암흑/.test(t))return R(rel(S,'빛의 성질','물체를 보려면'));if(/렌즈로 고기/.test(t))return R(rel(S,'빛의 성질','렌즈와 물에 비추어'),rel(S,'열과 우리 생활','빛에 의해 열이'));if(/거울/.test(t))return R(rel(S,'빛의 성질','거울에 비추어'));return R(rel(S,'빛의 성질','렌즈와 물에 비추어'));
  case '전기': if(/매키|오렌지|감자/.test(t))return R(rel(S,'전기의 이용','전구에 불을 켜려면'));if(/전자석의 극/.test(t))return R(rel(S,'전기의 이용','전자석의 성질'));if(/자석으로|모터/.test(t))return R(rel(S,'전기의 이용','전자석을 사용하는 예'));return R(rel(S,'전기의 이용',''));
  case '힘과 에너지': if(/저울|무게/.test(t))return R(rel(S,'힘과 우리 생활','용수철저울'));if(/설계|에너지 제로/.test(t))return R(rel(S,'자원과 에너지','효율적인 이용 방법'));return[];
  case '교실 놀이': return R(rel('놀이','교실놀이',''));
  case '체육': if(/후라이|음악줄넘기/.test(t)||o==='음악줄넘기')return R(rel('놀이','줄넘기',''));return[];
  case '카드뉴스': return R(rel(S,'다양한 생물과 우리 생활','카드 뉴스 만들기'));
  }return[]}
items.forEach(it=>{const[c,s]=remap(it);it.cat=c;it.sub=s;it.rel=related(it)});
items.forEach(it=>{if(it.oldSub==='계절')it.sub='계절의 변화'});
// ---- 6과학자료.xlsx 에서 새로 가져온 자료 (기존과 겹치는 링크·학생 응답 시트는 제외) ----
const U6=(name,t)=>({u:rel(S,name,'').u,t});
const X1='6과학자료.xlsx · 1학기진도표 ',X2='6과학자료.xlsx · 2학기진도표 ';
const NEW=[
 ['지구와 우주','지구와 달','지구의 운동 체험관 만들기 예시 (인디스쿨 이미지)','https://static.indischool.com/images/users/e1e1a5729bdff84c3d4eaf256aa2f15e/ec5d52af-cffd-4747-ac63-6279493afa8b.jpg',[U6('지구의 운동','창의가 팡팡_지구의 운동 체험관 만들기')],X1+'11행'],
 ['지구와 우주','지구와 달','지구의 운동 학습 정리 퀴즈 2 (블루킷)','https://dashboard.blooket.com/set/67f4d1ee91971e1551035470',[U6('지구의 운동','지구의 운동 학습 내용 정리')],X1+'14행'],
 ['지구와 우주','계절의 변화','태양 고도 측정기 만들기 자료 (사이언스온)','https://science-on.kosac.re.kr/body/archive/1046/contents.do',[U6('계절의 변화','태양 고도 측정기를 만들자!')],X2+'3행'],
 ['지구와 우주','계절의 변화','태양 고도·방위각 알아보기 (한국천문연구원 생활천문관)','https://astro.kasi.re.kr/life/pageView/10',[U6('계절의 변화','태양 고도 측정기를 만들자!')],X2+'3행'],
 ['지구와 우주','계절의 변화','과학 6-2 하루 동안 태양 고도, 그림자 길이 측정해보기','https://www.youtube.com/watch?v=3qiuARi7xuc',[U6('계절의 변화','하루 동안 태양 고도, 그림자 길이, 기온의 관계는?')],X2+'3행'],
 ['지구와 우주','계절의 변화','마인크래프트 천구 시뮬레이터 (태양전지판 실험)','https://0isback.github.io/',[U6('계절의 변화','계절별 태양의 남중 고도와 낮의 길이의 관계는?')],X2+'6행'],
 ['지구와 우주','계절의 변화','계절 변화의 원인 퀴즈 (블루킷)','https://dashboard.blooket.com/set/68b52b490772cbb6c0844c0e',[U6('계절의 변화','계절 변화의 원인을 찾아라!')],X2+'8행'],
 ['생물과 몸','세포','광학현미경(생물현미경) 구조와 사용법','https://www.youtube.com/watch?v=s4UvVJjGvxc',[U6('식물의 구조와 기능','세포가 궁금해!')],X1+'22행 · 현미경 알아보기'],
 ['생물과 몸','세포','[사용방법] 현미경 완전정복! - 동물세포 관찰','https://www.youtube.com/watch?v=zFZIsGerLto',[U6('식물의 구조와 기능','세포가 궁금해!')],X1+'22행'],
 ['생물과 몸','세포','세포 관찰 참고 영상','https://www.youtube.com/watch?v=CAWwmO3pYY4',[U6('식물의 구조와 기능','세포가 궁금해!')],X1+'22행 · 제목 확인 필요(퍼가기 막힌 영상)'],
 ['생물과 몸','뿌리·줄기·잎','다양한 줄기 살펴보기 (띵커벨 퀴즈)','https://www.tkbell.co.kr/user/library/quizUserLibraryDetail.do?quizIdx=2588976',[U6('식물의 구조와 기능','줄기의 생김새와 하는 일을 알아볼까?')],X1+'24행'],
 ['생물과 몸','꽃과 씨앗','신기한 스쿨버스 - Goes to Seed (씨앗)','https://www.youtube.com/watch?v=qhJaygnqY94',[U6('식물의 구조와 기능','창의가 팡팡_우리 반 식물도감 만들기')],X1+'29행'],
 ['생물과 몸','식물 이야기','식물 참고영상 모음 (패들릿)','https://padlet.com/dream_maker/4-2f89v41dq1xac5qu',[U6('식물의 구조와 기능','열려라 과학_식물을 맞혀 봐! 다섯 고개 놀이')],X1+'21행'],
 ['생물과 몸','우리 몸','우리 몸은 어떻게 움직일까? 영상 요약 (릴리스AI)','https://lilys.ai/digest/5108450/4513271',[U6('우리 몸의 구조와 기능','우리 몸은 어떻게 움직일까?')],X2+'19행'],
 ['생물과 몸','우리 몸','우리가 먹은 음식물은 어떻게 될까? 영상 요약 (릴리스AI)','https://lilys.ai/digest/5107984/4512532',[U6('우리 몸의 구조와 기능','우리가 먹은 음식물은 어떻게 될까?')],X2+'20행'],
 ['생물과 몸','우리 몸','혈액은 어떻게 온몸을 돌까? 영상 요약 (릴리스AI)','https://lilys.ai/digest/5108525/4513392',[U6('우리 몸의 구조와 기능','혈액은 어떻게 온몸을 돌까?')],X2+'21행'],
 ['물질과 에너지','전기','신기한 스쿨버스 - Gets Charged (전기 회로)','https://youtu.be/QmPqPc7cmDE',[U6('전기의 이용','전구에 불을 켜려면 어떻게 해야 할까?')],X2+'27행 · 단원 도입'],
 ['물질과 에너지','전기','코일 주변의 자기장 (자바실험실)','https://javalab.org/ko/magnetic_field_around_a_coil/',[U6('전기의 이용','전자석의 성질이 궁금해!')],X2+'30행'],
 ['물질과 에너지','전기','스피커의 원리 (자바실험실)','https://javalab.org/ko/speaker/',[U6('전기의 이용','전자석의 성질이 궁금해!')],X2+'30행'],
 ['물질과 에너지','전기','단극 모터 (자바실험실)','https://javalab.org/ko/homopolar_motor/',[U6('전기의 이용','전자석을 사용하는 예를 알아볼까?')],X2+'31행'],
 ['물질과 에너지','전기','직류 모터 (자바실험실)','https://javalab.org/ko/dc_motor_2/',[U6('전기의 이용','전자석을 사용하는 예를 알아볼까?')],X2+'31행'],
 ['물질과 에너지','전기','전기 안전 (유튜브 재생목록)','https://youtube.com/playlist?list=PL4kkbLFtGKKpol6Iu-Tv766or2tytYMi3',[U6('전기의 이용','전기, 어떻게 사용해야 할까?')],X2+'32행'],
 ['물질과 에너지','전기','창의가 팡팡·과학이 톡톡 수업 PPT','https://docs.google.com/presentation/d/e/2PACX-1vRye3qOvj6SBzHn135ihmOjR-p0D2sdk3SjSDuPlTLALbNHtYfT8_VUojSl1YYPrBXEBXaQiYkTMbZZ/pub?start=false&loop=false&delayms=3000',[U6('전기의 이용','창의가 팡팡_효율적이고 안전한 전기 사용 실천하기')],X2+'33행'],
 ['물질과 에너지','빛과 렌즈','위험한 레이저, 시력 손상에 화상까지 (MBC 뉴스)','https://www.youtube.com/watch?v=2zMAqDh_BeU',[U6('빛의 성질','빛을 렌즈와 물에 비추어 볼까?')],X2+'42행 · 레이저 안전'],
 ['물질과 에너지','빛과 렌즈','실제로 사람을 투명하게 만들어주는 필름 (긱블)','https://www.youtube.com/watch?v=-oyK9FJpNJc',[U6('빛의 성질','빛을 렌즈와 물에 비추어 볼까?')],X2+'43·45행'],
 ['물질과 에너지','빛과 렌즈','투명 망토, 현실에서 존재할 수 있을까? (YTN 사이언스)','https://www.youtube.com/watch?v=NdZgAeV2hEQ',[U6('빛의 성질','빛을 렌즈와 물에 비추어 볼까?')],X2+'43·45행'],
 ['수업 도구','교과서·지도서','6-1 과학 교과서 (PDF)','https://download.i-scream.co.kr/textbook/introduce/science_6-1_2022.pdf',[],X1+'1행'],
 ['수업 도구','교과서·지도서','6-1 실험관찰 (PDF)','https://download.i-scream.co.kr/textbook/introduce/science_silhum_6-1_2022.pdf',[],X1+'1행'],
 ['수업 도구','교과서·지도서','6-1 과학 지도서 (PDF)','https://download.i-scream.co.kr/textbook/introduce/science_jido_6-1_2022.pdf',[],X1+'1행'],
 ['수업 도구','교과서·지도서','6-2 과학 교과서 (PDF)','https://download.i-scream.co.kr/textbook/introduce/science_6-2_2022.pdf',[],X2+'1행'],
 ['수업 도구','교과서·지도서','6-2 실험관찰 (PDF)','https://download.i-scream.co.kr/textbook/introduce/science_silhum_6-2_2022.pdf',[],X2+'1행'],
 ['수업 도구','교과서·지도서','6-2 과학 지도서 (PDF)','https://download.i-scream.co.kr/textbook/introduce/science_jido_6-2_2022.pdf',[],X2+'1행'],
 ['수업 도구','교과서·지도서','2015개정 국정 5-2 과학 디지털 자료 (티셀파)','https://e.tsherpa.co.kr/webdata/multimedia/DVD/5-2/5-2/main.html',[],'6과학자료.xlsx · 진도표·교육과정 여러 행'],
 ['수업 도구','교과서·지도서','2015개정 국정 6-1 과학 디지털 자료 (티셀파)','https://e.tsherpa.co.kr/webdata/multimedia/DVD/6_1/main.html',[],'6과학자료.xlsx · 진도표·교육과정 여러 행'],
 ['수업 도구','교과서·지도서','2015개정 국정 6-2 과학 디지털 자료 (티셀파)','https://e.tsherpa.co.kr/webdata/multimedia/DVD/6-2/6-2/main.html',[],'6과학자료.xlsx · 진도표·교육과정 여러 행'],
 ['수업 도구','정리·평가','미니북 만들기 (단원 정리)','https://www.minibook.co.kr/service/',[],X1+'13·30행'],
 ['수업 도구','정리·평가','6-2 계절의 변화 단원평가 (구글 설문)','https://docs.google.com/forms/d/e/1FAIpQLSdUkVD6t6gNf869Be2RzurYi5Gx90MiPG6Vl2VqhG1-wUnZhA',[U6('계절의 변화','계절 변화의 원인을 찾아라!')],X2+'10행'],
];
const xl=require('./x6.json');const formRow=xl['2학기진도표'].find(r=>r.row===35);const formUrl=Object.values(formRow.links).concat(formRow.cells).find(u=>/forms\/d\//.test(u||''));
NEW.push(['수업 도구','정리·평가','6-2 전기의 이용 수행평가 (구글 설문)',formUrl,[U6('전기의 이용','')],X2+'35행']);
NEW.forEach(([c,s,title,url,rl,note])=>{if(!url)throw new Error('no url '+title);items.push({row:null,src:'6과학자료.xlsx',oldCat:'',oldSub:'',cat:c,sub:s,title,links:[{label:'',url}],note,rel:rl,isNew:true})});
// 기존과 링크가 겹치면 알리기
const key=u=>{const m=u.match(/(?:youtu\.be\/|[?&]v=|shorts\/)([\w-]{11})/);return m?'yt:'+m[1]:u.replace(/^https?:\/\/(www\.)?/,'').replace(/[?#].*$/,'').replace(/\/$/,'')};
const seen={};items.forEach(it=>it.links.forEach(l=>{const k=key(l.url);if(seen[k]&&it.isNew)console.log('DUP!',it.title,'<->',seen[k]);seen[k]=seen[k]||it.title}));
const ORDER={'지구와 우주':['태양계와 행성','지구와 달','계절의 변화','별자리와 관측','우주 탐사','날씨와 기후'],
 '생물과 몸':['세포','뿌리·줄기·잎','꽃과 씨앗','식물 이야기','다양한 생물','우리 몸','건강과 안전'],
 '물질과 에너지':['물질의 상태 변화','물 얻기와 물 절약','기체','열의 이동','용해·혼합물·연소','소리','빛과 렌즈','전기','힘과 에너지'],
 '놀이·활동':['체육','교실 놀이','게임'],'수업 도구':['교과서·지도서','정리·평가','카드뉴스','글쓰기','수업 운영']};
const cats=Object.keys(ORDER);items.sort((a,b)=>cats.indexOf(a.cat)-cats.indexOf(b.cat)||ORDER[a.cat].indexOf(a.sub)-ORDER[b.cat].indexOf(b.sub));
items.forEach(it=>{if(!ORDER[it.cat].includes(it.sub))throw new Error('order '+it.sub)});
fs.writeFileSync(process.argv[2],'window.SHEET_ITEMS='+JSON.stringify(items)+';\nwindow.TOPIC_ORDER='+JSON.stringify(ORDER)+';\n');
console.log('items',items.length,'with rel',items.filter(i=>i.rel.length).length,'with topic',items.filter(i=>i.rel.some(r=>r.t)).length);
cats.forEach(c=>console.log(c,items.filter(i=>i.cat===c).length,ORDER[c].map(s=>s+'('+items.filter(i=>i.cat===c&&i.sub===s).length+')').join(' ')));
items.filter((x,i)=>i%9==0).forEach(i=>console.log(' -',(i.title||'').split('\n')[0].slice(0,24),'=>',i.rel.map(r=>r.u+(r.t?' · '+r.t:'')).join(' | ')));
