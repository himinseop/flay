const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../dist');
const data=JSON.parse(fs.readFileSync(path.join(root,'countries.json')));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'countries-manifest.json')));
const cityData=JSON.parse(fs.readFileSync(path.join(root,'capital-cities.json')));
const flush=()=>new Promise(resolve=>setImmediate(resolve));

async function harness({firstVisit=false,storedName='테스트 탐험가'}={}){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://localhost/',runScripts:'outside-only'}),w=dom.window;
 if(!firstVisit)w.localStorage.setItem('flag-play-explorer-name',storedName);
 let now=0,interval=null,advance=null;
 w.fetch=async url=>({ok:true,json:async()=>JSON.parse(JSON.stringify(url==='countries.json'?data:url==='capital-cities.json'?cityData:manifest))});
 Object.defineProperty(w.performance,'now',{value:()=>now});
 w.setInterval=fn=>{interval=fn;return 1;};w.clearInterval=()=>interval=null;
 w.setTimeout=fn=>{advance=fn;return 1;};w.clearTimeout=()=>advance=null;
 w.Image=function(width,height){
  const img=w.document.createElement('img');img.width=width;img.height=height;let loaded=false,failed=false;
  Object.defineProperty(img,'complete',{get:()=>loaded||failed});Object.defineProperty(img,'naturalWidth',{get:()=>loaded?640:0});
  img.decode=()=>new Promise(resolve=>img.decoded=resolve);
  img.load=()=>{loaded=true;img.dispatchEvent(new w.Event('load'));};img.fail=()=>{failed=true;img.dispatchEvent(new w.Event('error'));};return img;
 };
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+';window.qa=code=>eval(code);');
 await flush();
 const $=selector=>w.document.querySelector(selector),game=()=>w.qa('game');
 const click=selector=>{assert.ok($(selector),selector);$(selector).click();};
 const load=async img=>{if(game().images.get(game().question.id)?.ready&&img===game().images.get(game().question.id).image)return;img.load();img.decoded();await flush();};
 const ready=()=>load(game().images.get(game().question.id).image);
 const setInput=(selector,value)=>{$(selector).value=value;$(selector).dispatchEvent(new w.Event('input',{bubbles:true}));};
 return {w,$,game,click,load,ready,setInput,start:(kind='time',level='easy')=>w.qa(`mode='${kind}';difficulty='${level}';startGame()`),
  clock:value=>now=value,tick:()=>interval?.(),advance:()=>{assert.ok(advance);const fn=advance;advance=null;fn();},interval:()=>interval,close:()=>dom.window.close()};
}

test('195 complete local flags and consistent country coverage',()=>{
 assert.equal(data.length,195);assert.equal(new Set(data.map(p=>p.id)).size,195);
 assert.equal(data.filter(p=>p.familiar).length,30);assert.equal(manifest.countryCount,195);
 assert.equal(manifest.unMemberCount,193);assert.equal(new Set(data.map(p=>p.continent)).size,6);
 for(const p of data){assert.ok(p.aliases.includes(p.name));assert.deepEqual(fs.readFileSync(path.join(root,p.image)).subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));}
 assert.ok(data.find(p=>p.id==='kr').aliases.includes('한국'));
 assert.ok(data.find(p=>p.id==='tr').aliases.includes('터키'));
 assert.ok(fs.readFileSync(path.join(root,'COUNTRIES-LICENSE.txt'),'utf8').includes('Open Database'));
});

test('all time difficulties: loading, exact prefetch, persistent timer, scoring and deadline',async t=>{
 const h=await harness();t.after(h.close);
 for(const [level,count] of [['easy',30],['normal',195],['hard',165]]){
  h.clock(0);h.start('time',level);assert.ok(h.$('.quiz-spinner'));assert.equal(h.interval(),null);
  const g=h.game();assert.equal(g.pool.length,count);assert.equal(g.images.size,4);
  assert.equal(new Set(g.options.map(p=>p.id)).size,4);assert.ok(g.options.includes(g.question));
  assert.ok(g.options.every(p=>p.continent===g.question.continent));
  h.clock(20000);await h.ready();assert.equal(g.deadline,80000);assert.equal(g.status,'playing');assert.ok(h.interval());
  const next=g.images.get(g.deck.at(-1).id).image;await h.load(next);
  const bar=h.$('#timer-bar');h.clock(30000);h.tick();h.click(`[data-answer="${g.question.id}"]`);h.advance();
  assert.equal(g.score,100);assert.equal(g.deadline,80000);assert.equal(h.$('#timer-bar'),bar);assert.equal(h.$('#question-image'),next);
  assert.equal(h.$('#time').textContent,'50');assert.equal(g.imageReady,true);
  h.click(`[data-answer="${g.question.id}"]`);assert.equal(g.score,210);
  h.clock(80000);h.tick();assert.equal(g.status,'ended');assert.equal(g.record.mode,`time-${level}`);assert.ok(h.$('#high-score').open);h.$('#high-score').close();
 }
});

test('next time-attack question clears answer and pointer emphasis after correct or wrong choices',async t=>{
 const h=await harness();t.after(h.close);h.start();await h.ready();
 const move=(pointerType,movementX=1)=>{
  const e=new h.w.Event('pointermove',{bubbles:true});
  Object.defineProperties(e,{pointerType:{value:pointerType},movementX:{value:movementX},movementY:{value:0}});
  h.$('.choice span').dispatchEvent(e);
 };
 for(const correct of [true,false]){
  const g=h.game(),choices=h.$('.choices'),bar=h.$('#timer-bar'),deadline=g.deadline;
  move('touch');assert.ok(!choices.classList.contains('hover-ready'));
  move('mouse',0);assert.ok(!choices.classList.contains('hover-ready'));
  move('mouse');assert.ok(choices.classList.contains('hover-ready'));
  const selected=correct?g.question.id:g.options.find(p=>p.id!==g.question.id).id;
  h.click(`[data-answer="${selected}"]`);assert.equal(g.locked,true);
  assert.equal(h.w.document.querySelectorAll('.choice.correct').length,1);
  assert.equal(h.w.document.querySelectorAll('.choice.wrong').length,correct?0:1);
  h.advance();await h.ready();
  assert.notEqual(h.$('.choices'),choices);assert.ok(!h.$('.choices').classList.contains('hover-ready'));
  assert.equal(h.w.document.querySelectorAll('.choice.correct,.choice.wrong').length,0);
  assert.equal(h.w.document.querySelectorAll('.choice:disabled').length,0);
  assert.equal(h.$('#feedback').textContent,'');assert.equal(g.locked,false);
  assert.equal(h.$('#timer-bar'),bar);assert.equal(g.deadline,deadline);
 }
 // Keyboard answers use the same question transition and reset behavior.
 const g=h.game();move('mouse');
 h.w.document.body.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:String(g.options.findIndex(p=>p.id===g.question.id)+1),bubbles:true,cancelable:true}));
 assert.equal(g.total,3);h.advance();await h.ready();assert.ok(!h.$('.choices').classList.contains('hover-ready'));
});

test('cancelled loading cannot restart; repeated broken images cannot enter ranking',async t=>{
 const h=await harness();t.after(h.close);
 h.start();const first=h.game().images.get(h.game().question.id).image;h.click('#quit-game');await h.load(first);
 assert.equal(h.game().status,'ended');assert.equal(h.game().rank,0);assert.equal(h.interval(),null);
 h.start();for(let i=0;i<5;i++){h.game().images.get(h.game().question.id).image.fail();await flush();}
 assert.equal(h.game().status,'ended');assert.equal(h.game().imageError,true);assert.equal(h.game().rank,0);
 assert.ok(h.$('#game-body').textContent.includes('국기를 불러오지 못했어요'));
});

test('ranking saves safe custom names or random country names, and caps each board at twenty',async t=>{
 const h=await harness();t.after(h.close);
 h.w.localStorage.setItem('pokemon-play-records','unchanged');
 for(const name of ['<탐험가>','']){
  h.start();await h.ready();h.click(`[data-answer="${h.game().question.id}"]`);h.clock(h.game().deadline);h.tick();
  h.setInput('#trainer-name',name);h.$('#save-form').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(h.game().saved,true);assert.ok(h.$('#high-score .my-entry').textContent.includes(name||h.game().record.name));
  if(!name)assert.ok(data.some(p=>p.name===h.game().record.name));
  assert.equal(h.$('#high-score .my-entry').querySelector('탐험가'),null);h.$('#high-score').close();
 }
 assert.equal(JSON.parse(h.w.localStorage.getItem('flag-play-records')).length,2);assert.equal(h.w.localStorage.getItem('pokemon-play-records'),'unchanged');
 const rows=Array.from({length:25},(_,i)=>({id:`r${i}`,name:'탐험가',mode:'time-easy',score:1000-i,correct:10,total:10,date:new Date(i*1000).toISOString()}));
 h.w.localStorage.setItem('flag-play-records',JSON.stringify(rows));h.start();await h.ready();h.click(`[data-answer="${h.game().question.id}"]`);h.clock(h.game().deadline);h.tick();assert.equal(h.game().rank,0);
 assert.equal(h.w.qa("leaderboard('time-easy').length"),20);
});

test('atlas alias/ISO search, six continent filters, details and independent ranking tabs',async t=>{
 const h=await harness();t.after(h.close);h.click('[data-nav="atlas"]');assert.equal(h.w.document.querySelectorAll('#atlas-results .country-card').length,195);
 h.setInput('#search','한국');assert.equal(h.w.document.querySelectorAll('#atlas-results .country-card').length,1);h.click('[data-country="kr"]');
 assert.equal(h.$('#detail-title').textContent,'대한민국');assert.ok(h.$('#detail').textContent.includes('서울'));h.click('#close-detail');
 h.setInput('#search','JP');assert.equal(h.$('.country-card').dataset.country,'jp');h.setInput('#search','');
 for(const c of new Set(data.map(p=>p.continent))){h.$('#continent-filter').value=c;h.$('#continent-filter').dispatchEvent(new h.w.Event('change',{bubbles:true}));assert.equal(h.w.document.querySelectorAll('#atlas-results .country-card').length,data.filter(p=>p.continent===c).length);}
 h.setInput('#search','없는나라');assert.ok(h.$('.empty'));h.click('[data-nav="play"]');h.click('[data-nav="records"]');assert.equal(h.w.document.querySelectorAll('[data-ranking-mode]').length,2);assert.equal(h.w.document.querySelectorAll('[data-ranking-difficulty]').length,3);
 h.click('[data-ranking-mode="capital"]');h.click('[data-ranking-difficulty="hard"]');h.click('[data-play-record="capital-hard"]');assert.equal(h.w.qa('mode'),'capital');assert.equal(h.w.qa('difficulty'),'hard');
});

test('leaving an active game requires a choice and cleans up the timer',async t=>{
 const h=await harness();t.after(h.close);h.start();await h.ready();h.click('[data-nav="atlas"]');assert.ok(h.$('#detail').open);
 h.click('#keep-playing');assert.equal(h.game().status,'playing');assert.ok(h.interval());h.click('[data-nav="atlas"]');h.click('#leave-game');
 assert.equal(h.game(),null);assert.equal(h.interval(),null);assert.equal(h.w.document.querySelectorAll('#atlas-results .country-card').length,195);
});

test('country profiles have valid local map coordinates and dated population sources',()=>{
 assert.equal(data.filter(p=>p.population).length,manifest.populationCount);
 assert.ok(fs.readFileSync(path.join(root,'assets/world-map.svg'),'utf8').includes('viewBox="0 0 900 450"'));
 const codes=new Set(data.map(p=>p.iso3));
 for(const p of data){
  assert.equal(p.coordinates.length,2);assert.ok(p.coordinates.every(Number.isFinite));
  assert.ok(Math.abs(p.coordinates[0])<=90&&Math.abs(p.coordinates[1])<=180);
  assert.ok(p.area>0);assert.equal(p.languageCodes.length,p.languages.length);assert.ok(p.subregion);
  assert.ok(p.currencies.every(c=>/^[A-Z]{3}$/.test(c.code)));assert.equal(typeof p.landlocked,'boolean');
  // The source includes some non-atlas territories; only atlas neighbors are rendered.
  assert.ok(p.borders.every(code=>/^[A-Z]{3}$/.test(code)));
  if(p.population){assert.ok(p.population.value>0);assert.ok(p.population.year>=2020&&p.population.year<=2026);}
  if(p.mapPath)assert.match(p.mapPath,/^[MLZ\d.,-]+$/);
 }
 assert.ok(codes.has('KOR'));assert.ok(manifest.sources.population.includes('SP.POP.TOTL'));
 assert.equal(data.find(p=>p.id==='va').population,null);
});

test('atlas map, Korean facts, source links and border navigation',async t=>{
 const h=await harness();t.after(h.close);h.click('[data-nav="atlas"]');h.click('[data-country="kr"]');
 const kr=data.find(p=>p.id==='kr'),pin=h.$('.map-marker');
 assert.equal(Number(pin.getAttribute('cx')),(kr.coordinates[1]+180)*2.5);
 assert.equal(Number(pin.getAttribute('cy')),(90-kr.coordinates[0])*2.5);
 assert.ok(h.$('.map-country'));assert.ok(h.$('.country-facts').textContent.includes('한국어'));
 assert.ok(h.$('.country-facts').textContent.includes(`${kr.population.year}년`));
 const links=[...h.w.document.querySelectorAll('.country-resources a')];
 const wiki=links.find(a=>a.href.includes('ko.wikipedia.org'));
 assert.equal(new URL(wiki.href).searchParams.get('search'),'대한민국');
 assert.ok(links.some(a=>a.href.includes('locations=KR')));
 for(const a of [...links,h.$('.detail-section-heading a')]){assert.equal(a.target,'_blank');assert.ok(a.rel.includes('noopener'));}
 h.click('.border-link[data-country="kp"]');assert.equal(h.$('#detail-title').textContent,'북한');assert.ok(h.$('#detail').open);
});

test('small island marker and missing population remain useful without external requests',async t=>{
 const h=await harness();t.after(h.close);h.click('[data-nav="atlas"]');
 h.w.qa("showCountry('tv')");assert.ok(h.$('.map-marker'));assert.equal(h.$('.map-country'),null);
 assert.equal(h.w.document.querySelectorAll('.border-link').length,0);assert.ok(h.$('.section-note'));
 h.w.qa("showCountry('va')");assert.ok(h.$('.country-facts').textContent.includes('자료 없음'));
 assert.ok(h.w.document.querySelector('.country-resources a[href="https://data.un.org/"]'));
 h.w.qa("showCountry('ps')");assert.ok(h.$('.map-country'));
 h.w.qa("showCountry('ss')");assert.ok(h.$('.map-country'));
 assert.equal(h.w.document.querySelectorAll('iframe').length,0);
});

// The upstream Korean translation previously conflated Dominica with Dominican Republic.
test('every canonical Korean country name remains answerable after ambiguous aliases are removed',async t=>{
 const h=await harness();t.after(h.close);
 assert.equal(h.w.qa("countries.find(p=>p.id==='dm').name"),'도미니카연방');
 assert.equal(h.w.qa("countries.find(p=>p.id==='do').name"),'도미니카 공화국');
 assert.equal(h.w.qa("countries.find(p=>p.id==='dm').aliases.some(name=>normalize(name)===normalize('도미니카 공화국'))"),false);
 assert.ok(h.w.qa("countries.every(p=>p.aliases.some(name=>normalize(name)===normalize(p.name)))"));
});

test('quit scores can register and replay saves the typed name before returning to the same lobby',async t=>{
 const h=await harness();t.after(h.close);h.start('time','normal');await h.ready();h.click(`[data-answer="${h.game().question.id}"]`);h.click('#quit-game');
 assert.ok(h.$('#high-score').open);assert.equal(h.game().completed,true);assert.equal(h.game().rank,1);
 h.setInput('#trainer-name','새 탐험가');h.click('#ranking-replay');assert.equal(h.game(),null);assert.equal(h.$('#high-score').open,false);
 assert.equal(h.w.qa('mode'),'time');assert.equal(h.w.qa('difficulty'),'normal');assert.equal(h.$('#start-game').textContent,'시작');
 assert.equal(JSON.parse(h.w.localStorage.getItem('flag-play-records'))[0].name,'새 탐험가');assert.equal(h.w.localStorage.getItem('flag-play-explorer-name'),'새 탐험가');
 h.start('capital','hard');await h.ready();h.click(`[data-answer="${h.game().answerKey}"]`);h.click('#quit-game');assert.equal(h.$('#trainer-name').value,'새 탐험가');
});

test('a failed ranking save keeps the typed name and replay screen available for retry',async t=>{
 const h=await harness();t.after(h.close);h.start();await h.ready();h.click(`[data-answer="${h.game().question.id}"]`);h.click('#quit-game');
 h.setInput('#trainer-name','기억해줘');const prototype=h.w.Storage.prototype,original=prototype.setItem;
 prototype.setItem=function(key,value){if(key==='flag-play-records')throw new Error('quota');return original.call(this,key,value);};
 h.click('#ranking-replay');assert.equal(h.game().saved,false);assert.ok(h.$('#high-score').open);assert.equal(h.$('#trainer-name').value,'기억해줘');assert.ok(h.$('#save-message').textContent.includes('저장하지 못했어요'));
 prototype.setItem=original;h.click('#ranking-replay');assert.equal(h.game(),null);assert.equal(JSON.parse(h.w.localStorage.getItem('flag-play-records'))[0].name,'기억해줘');
});

test('ranking ties show recent scores first and dates use Korean calendar boundaries',async t=>{
 const h=await harness();t.after(h.close);
 const rows=[{id:'old',name:'이전',mode:'time-easy',score:100,correct:2,total:5,date:'2026-10-07T00:00:00Z'},{id:'new',name:'새 기록',mode:'time-easy',score:100,correct:1,total:5,date:'2026-10-08T00:00:00Z'}];
 h.w.localStorage.setItem('flag-play-records',JSON.stringify(rows));h.w.qa('records=readRecords()');assert.equal(h.w.qa("leaderboard('time-easy')[0].id"),'new');
 assert.equal(h.w.qa("rankingDate('2026-10-07T15:01:00Z',new Date('2026-10-08T14:00:00Z'))"),'00:01');
 assert.equal(h.w.qa("rankingDate('2026-10-07T14:59:00Z',new Date('2026-10-08T14:00:00Z'))"),'1일 전');
});

test('remembered explorers can edit their name and open score help without access tracking',async t=>{
 const h=await harness();t.after(h.close);h.click('#game-help');assert.ok(h.$('#detail').textContent.includes('20초'));assert.ok(h.$('#detail').textContent.includes('절반'));h.click('#close-detail');
 h.click('#edit-explorer');h.setInput('#explorer-name','우리 탐험가');h.$('#explorer-form').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));assert.ok(h.$('#edit-explorer').textContent.includes('우리 탐험가'));
 h.start('capital');await h.ready();assert.equal(h.game().status,'playing');assert.ok(h.w.document.body.classList.contains('game-focused'));
 h.click('#quit-game');assert.equal(h.w.document.body.classList.contains('game-focused'),false);assert.equal(h.game().rank,0);assert.ok(h.$('#high-score').open);
 assert.equal(h.w.localStorage.getItem('pokemon-play-trainer-name'),null);
});

test('first visit requires a valid explorer name and a remembered visit goes straight to play',async t=>{
 const h=await harness({firstVisit:true});t.after(h.close);assert.ok(h.$('#explorer-entry-form'));assert.equal(h.$('#start-game'),null);
 const form=h.$('#explorer-entry-form');form.dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));assert.ok(h.$('#entry-explorer-name').validationMessage);
 h.setInput('#entry-explorer-name',' 새 탐험가 ');form.dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(h.w.localStorage.getItem('flag-play-explorer-name'),'새 탐험가');assert.ok(h.$('#start-game'));assert.equal(h.$('#explorer-entry-form'),null);
 const remembered=await harness({storedName:'다시 온 탐험가'});t.after(remembered.close);assert.ok(remembered.$('#start-game'));assert.equal(remembered.$('#explorer-entry-form'),null);
});

test('easy oceanian questions still get four unique choices from the same continent',async t=>{
 const h=await harness();t.after(h.close);h.start('time','easy');await h.ready();await forceCountry(h,'au');
 const g=h.game();assert.equal(g.question.continent,'오세아니아');assert.equal(g.options.length,4);assert.equal(new Set(g.options.map(p=>p.id)).size,4);
 assert.ok(g.options.every(p=>p.continent==='오세아니아'));assert.ok(g.options.some(p=>!p.familiar));assert.ok(g.options.includes(g.question));
});

test('button and area focus is blurred while profile inputs remain usable',async t=>{
 const h=await harness();t.after(h.close);h.$('#app').focus();assert.notEqual(h.w.document.activeElement,h.$('#app'));
 h.$('#start-game').focus();assert.notEqual(h.w.document.activeElement,h.$('#start-game'));
 h.click('#edit-explorer');const input=h.$('#explorer-name');input.focus();assert.equal(h.w.document.activeElement,input);
 h.click('#close-detail');h.start('capital');await h.ready();h.$('.choice').focus();assert.notEqual(h.w.document.activeElement,h.$('.choice'));
});

async function forceCountry(h,id){h.w.qa(`game.deck=[countries.find(p=>p.id==='${id}')];nextQuestion()`);await h.ready();}

test('city dataset covers all countries with traceable real cities and reviewed capitals',()=>{
 assert.equal(cityData.countryCount,195);assert.equal(Object.keys(cityData.countries).length,195);
 const ids=new Set();let count=0;
 for(const country of data){
  const p=cityData.countries[country.id];assert.ok(p);assert.ok(p.cities.some(c=>c.id===p.capitalId));
  assert.ok(p.excludedIds.every(id=>p.cities.some(c=>c.id===id)));assert.ok(!p.excludedIds.includes(p.capitalId));
  if(!['mc','sg','va'].includes(country.id))assert.ok(p.cities.filter(c=>!p.excludedIds.includes(c.id)).length>=4,country.id);
  for(const c of p.cities){assert.equal(c.countryId,country.id);assert.ok(c.name&&c.englishName&&c.source&&c.sourceId);assert.ok(!ids.has(c.id));ids.add(c.id);count++;}
 }
 assert.equal(count,cityData.cityCount);assert.ok(count>=30000);assert.ok(cityData.countries.kr.cities.length>=100);assert.ok(cityData.countries.us.cities.length>=2000);assert.ok(cityData.sources.every(s=>s.url&&s.license&&/^[a-f0-9]{64}$/.test(s.sha256)));
 const cap=id=>{const p=cityData.countries[id];return p.cities.find(c=>c.id===p.capitalId).name;};
 assert.equal(cap('kr'),'서울');assert.equal(cap('sz'),'음바바네');assert.equal(cap('lk'),'스리자야와르데네푸라코테');assert.equal(cap('bi'),'기테가');assert.equal(cap('gq'),'시우다드데라파스');assert.equal(cap('kz'),'아스타나');assert.equal(cap('pw'),'응게룰무드');
});

test('all capitals combine two major domestic cities and foreign capitals with sparse-country fallback',async t=>{
 const h=await harness();t.after(h.close);
 for(const country of data){
  for(let iteration=0;iteration<5;iteration++){
   const options=h.w.qa(`capitalOptions(countries.find(p=>p.id==='${country.id}'))`),profile=cityData.countries[country.id];
   assert.equal(options.length,4);assert.equal(new Set(options.map(c=>c.id)).size,4);assert.equal(new Set(options.map(c=>h.w.qa(`normalize(${JSON.stringify(c.name)})`))).size,4);
   assert.equal(options.filter(c=>c.id===profile.capitalId).length,1);assert.ok(options.every(c=>!profile.excludedIds.includes(c.id)));
   const pool=h.w.qa(`capitalPool(countries.find(p=>p.id==='${country.id}'))`),own=options.filter(c=>c.id!==profile.capitalId&&c.countryId===country.id),foreign=options.filter(c=>c.countryId!==country.id);
   assert.ok(pool.own.length<=6);assert.equal(own.length,Math.min(2,pool.own.length),country.id);
   assert.ok(own.every(c=>pool.own.some(candidate=>candidate.id===c.id)),country.id);
   assert.equal(foreign.length,3-own.length,country.id);
   assert.ok(foreign.every(c=>cityData.countries[c.countryId].capitalId===c.id),country.id);
  }
 }
});

test('capital tab replaces master, all difficulty levels complete ten untimed multiple-choice questions',async t=>{
 const h=await harness();t.after(h.close);h.click('[data-mode="capital"]');assert.ok(h.$('#app').textContent.includes('수도이름'));assert.equal(h.$('[data-mode="write"]'),null);
 for(const [level,multiplier] of [['easy',1],['normal',2],['hard',3]]){
  h.clock(0);h.start('capital',level);const g=h.game();assert.equal(g.questionStartedAt,null);await h.ready();assert.equal(g.deadline,null);assert.equal(h.w.document.querySelectorAll('.choice').length,4);assert.equal(h.$('#answer-input'),null);assert.equal(h.$('#timer-bar'),null);
  for(let i=0;i<10;i++){
   h.clock(g.questionStartedAt+20000);h.tick();assert.equal(g.status,'playing');
   const answer=g.answerKey;h.click(`[data-answer="${answer}"]`);assert.equal(g.total,i+1);assert.equal(g.score,(i+1)*100*multiplier);
   h.w.qa(`submitAnswer('${answer}')`);assert.equal(g.total,i+1);h.advance();if(g.status==='playing')await h.ready();
  }
  assert.equal(g.status,'ended');assert.equal(g.correct,10);assert.equal(g.record.mode,`capital-${level}`);assert.ok(h.$('#high-score').open);h.$('#high-score').close();
 }
});

test('capital bonus begins at image readiness, uses ten-point steps, and never imposes a deadline',async t=>{
 const h=await harness();t.after(h.close);h.clock(1000);h.start('capital','hard');const g=h.game();h.clock(21000);await h.ready();assert.equal(g.questionStartedAt,21000);
 assert.equal(h.w.qa('capitalBonus(game)'),150);h.clock(31000);h.tick();assert.equal(h.w.qa('capitalBonus(game)'),80);
 h.clock(41000);h.tick();assert.equal(h.w.qa('capitalBonus(game)'),0);assert.equal(g.status,'playing');assert.equal(g.deadline,null);
 h.click(`[data-answer="${g.answerKey}"]`);assert.equal(g.score,300);h.advance();await h.ready();h.click(`[data-answer="${g.answerKey}"]`);assert.equal(g.score,750);
});

test('capital wrong answers and passes reveal the capital and advance with clean selection state',async t=>{
 const h=await harness();t.after(h.close);h.start('capital');await h.ready();await forceCountry(h,'kr');const g=h.game();
 const wrong=g.options.find(c=>c.id!==g.answerKey);h.click(`[data-answer="${wrong.id}"]`);assert.equal(g.total,1);assert.equal(g.score,0);assert.equal(g.correct,0);
 assert.ok(h.$('#feedback').textContent.includes('서울'));assert.equal(h.w.document.querySelectorAll('.correct').length,1);assert.equal(h.w.document.querySelectorAll('.wrong').length,1);
 h.advance();await h.ready();assert.equal(g.selectedAnswer,null);assert.equal(g.locked,false);assert.equal(h.w.document.querySelectorAll('.choice.correct,.choice.wrong,.choice.eliminated').length,0);assert.equal(h.$('#feedback').textContent,'');
 h.click('#skip-question');assert.equal(g.total,2);assert.equal(g.score,0);assert.ok(h.$('#feedback').textContent.includes(g.options.find(c=>c.id===g.answerKey).displayName));h.advance();await h.ready();assert.equal(g.questionNumber,3);
});

test('capital hint removes two wrong choices once, cannot be bypassed by keys, and resets next question',async t=>{
 const h=await harness();t.after(h.close);h.start('capital');await h.ready();const g=h.game();h.click('#hint-question');
 assert.equal(g.hiddenOptions.size,2);assert.ok(!g.hiddenOptions.has(g.answerKey));assert.equal(h.w.document.querySelectorAll('.choice.eliminated:disabled').length,2);assert.ok(h.$('#hint-question').disabled);assert.ok(h.$('#capital-bonus').hidden);
 const eliminated=g.options.findIndex(c=>g.hiddenOptions.has(c.id));h.w.document.body.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:String(eliminated+1),bubbles:true,cancelable:true}));assert.equal(g.total,0);
 const correct=g.options.findIndex(c=>c.id===g.answerKey);h.w.document.body.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:String(correct+1),bubbles:true,cancelable:true}));assert.equal(g.score,50);assert.equal(g.bonusAwarded,0);
 h.advance();await h.ready();assert.equal(g.hintUsed,false);assert.equal(g.hiddenOptions.size,0);assert.equal(h.w.document.querySelectorAll('.choice.eliminated').length,0);assert.equal(h.$('#hint-question').disabled,false);
});

test('multiple capitals have explicit roles and city facts expose source links',async t=>{
 const h=await harness();t.after(h.close);h.start('capital');await h.ready();await forceCountry(h,'za');assert.ok(h.$('.capital-prompt').textContent.includes('행정 수도'));
 const g=h.game();assert.ok(!g.options.some(c=>['Cape Town','Bloemfontein'].includes(c.englishName)));assert.ok(g.options.some(c=>c.name==='프리토리아'));
 for(const [id,role,other] of [['sz','행정 수도','Lobamba'],['me','헌법상 수도','Cetinje'],['bj','정치 수도','Cotonou'],['ci','정치 수도','Abidjan']]){await forceCountry(h,id);assert.ok(h.$('.capital-prompt').textContent.includes(role));assert.ok(!h.game().options.some(c=>c.englishName===other));}
 h.w.qa("showCountry('gq')");assert.ok(h.$('.country-facts').textContent.includes('시우다드데라파스'));assert.ok(h.$('.country-facts').textContent.includes('주요 도시'));assert.ok(h.$('.country-facts').textContent.includes('2026년 1월 2일'));
 assert.ok(h.w.document.querySelector('a[href="https://www.geonames.org/"]'));assert.ok(h.$('#detail').textContent.includes(cityData.collectedAt));
});

test('new capital ranking saves never remove or reuse legacy master and time records',async t=>{
 const h=await harness();t.after(h.close);const old=[{id:'legacy',name:'마스터',mode:'write-easy',score:9999,correct:10,total:10,date:'2026-10-01T00:00:00Z'},{id:'time',name:'타임',mode:'time-easy',score:9999,correct:10,total:10,date:'2026-10-01T00:00:00Z'}];
 h.w.localStorage.setItem('flag-play-records',JSON.stringify(old));h.w.qa('records=readRecords()');assert.equal(h.w.qa("leaderboard('capital-easy').length"),0);
 h.start('capital');await h.ready();h.click(`[data-answer="${h.game().answerKey}"]`);h.click('#quit-game');assert.equal(h.game().rank,1);h.setInput('#trainer-name','수도 탐험가');h.click('#ranking-replay');
 const saved=JSON.parse(h.w.localStorage.getItem('flag-play-records'));assert.ok(saved.some(r=>r.id==='legacy'&&r.mode==='write-easy'));assert.ok(saved.some(r=>r.id==='time'));assert.ok(saved.some(r=>r.mode==='capital-easy'));assert.equal(h.w.qa('mode'),'capital');
});


test('major-city and foreign-capital choices rotate and retain variety across game replays',async t=>{
 const h=await harness();t.after(h.close);const poolSize=h.w.qa("capitalPool(countries.find(p=>p.id==='kr')).own.length"),seen=new Set();let previous='';
 const capitals=new Set();assert.equal(poolSize,6);
 for(let i=0;i<poolSize/2;i++){
  const options=h.w.qa("capitalOptions(countries.find(p=>p.id==='kr'))"),wrong=options.filter(c=>c.id!==cityData.countries.kr.capitalId),signature=wrong.map(c=>c.id).sort().join('|');
  assert.notEqual(signature,previous);previous=signature;
  const domestic=wrong.filter(c=>c.countryId==='kr'),foreign=wrong.filter(c=>c.countryId!=='kr');assert.equal(domestic.length,2);assert.equal(foreign.length,1);
  for(const c of domestic){assert.ok(!seen.has(c.id),'a new major city should appear before reuse');seen.add(c.id);}
  assert.ok(!capitals.has(foreign[0].id),'a new foreign capital should appear before reuse');capitals.add(foreign[0].id);
 }
 assert.equal(seen.size,6);
 h.start('capital');await h.ready();if(h.game().question.id!=='kr')await forceCountry(h,'kr');const signature=()=>h.game().options.filter(c=>c.id!==h.game().answerKey).map(c=>c.id).sort().join('|');
 const before=signature();h.w.qa('endGame("quit");returnToLobby()');h.start('capital');await h.ready();if(h.game().question.id!=='kr')await forceCountry(h,'kr');assert.notEqual(signature(),before);
});

test('every country gets different consecutive distractor combinations, including city states',async t=>{
 const h=await harness();t.after(h.close);
 for(const country of data){let previous='';
  for(let i=0;i<8;i++){
   const options=h.w.qa(`capitalOptions(countries.find(p=>p.id==='${country.id}'))`),signature=options.filter(c=>c.id!==cityData.countries[country.id].capitalId).map(c=>c.id).sort().join('|');
   assert.notEqual(signature,previous,country.id);previous=signature;
  }
 }
});

test('small major-city pools and exact bag-boundary cases vary without changing option roles',async t=>{
 const h=await harness();t.after(h.close);
 for(const count of [4,7]){
  h.w.qa(`cityProfiles.kr.cities=${JSON.stringify(cityData.countries.kr.cities.slice(0,count))};cityProfiles.kr.excludedIds=[];capitalOptionPools.clear();capitalChoiceHistory.clear()`);
  let previous='';
  for(let i=0;i<30;i++){
   const options=h.w.qa("capitalOptions(countries.find(p=>p.id==='kr'))"),signature=options.filter(c=>c.id!==cityData.countries.kr.capitalId).map(c=>c.id).sort().join('|');
   assert.equal(options.length,4);assert.equal(new Set(options.map(c=>c.name)).size,4);assert.notEqual(signature,previous);previous=signature;
   assert.equal(options.filter(c=>c.countryId==='kr'&&c.id!==cityData.countries.kr.capitalId).length,2);assert.equal(options.filter(c=>c.countryId!=='kr').length,1);
  }
 }
});

test('US choices use familiar major cities and countries with too few cities receive extra foreign capitals',async t=>{
 const h=await harness();t.after(h.close);
 const us=h.w.qa("capitalPool(countries.find(p=>p.id==='us'))");
 assert.deepEqual(Array.from(us.own,c=>c.name),['뉴욕','로스앤젤레스','시카고','마이애미','필라델피아','댈러스']);
 for(const count of [1,2,3]){
  h.w.qa(`cityProfiles.kr.cities=${JSON.stringify(cityData.countries.kr.cities.slice(0,count))};cityProfiles.kr.excludedIds=[];capitalOptionPools.clear();capitalChoiceHistory.clear()`);
  for(let i=0;i<10;i++){
   const options=h.w.qa("capitalOptions(countries.find(p=>p.id==='kr'))"),foreign=options.filter(c=>c.countryId!=='kr');
   assert.equal(options.length,4);assert.equal(options.filter(c=>c.countryId==='kr').length,count);
   assert.equal(foreign.length,4-count);assert.ok(foreign.every(c=>cityData.countries[c.countryId].capitalId===c.id));
   assert.equal(new Set(options.map(c=>c.displayName)).size,4);
  }
 }
});


test('all capital choices use readable Korean names and retain unique labels',async t=>{
 const h=await harness();t.after(h.close);
 for(const {id} of data){
  for(let i=0;i<6;i++){
   const options=h.w.qa(`capitalOptions(countries.find(p=>p.id==='${id}'))`);
   assert.ok(options.every(c=>/[가-힣]/.test(c.displayName)&&/^[가-힣\s·().,\-/\d]+$/.test(c.displayName)),id);assert.equal(new Set(options.map(c=>h.w.qa(`normalize(${JSON.stringify(c.displayName)})`))).size,4);
  }
 }
 h.start('capital');await h.ready();await forceCountry(h,'ad');
 const labels=[...h.w.document.querySelectorAll('.choice')].map(button=>button.textContent.slice(1));
 assert.deepEqual(labels,Array.from(h.game().options,c=>c.displayName));
 await forceCountry(h,'us');assert.equal(h.game().options.find(c=>c.id===cityData.countries.us.capitalId).displayName,'워싱턴 디시');
 h.click('#skip-question');assert.ok(h.$('#feedback').textContent.includes('워싱턴 디시'));assert.equal(h.game().history.at(-1).capitalName,'워싱턴 디시');
});
