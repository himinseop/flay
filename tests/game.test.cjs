const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../dist');
const data=JSON.parse(fs.readFileSync(path.join(root,'countries.json')));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'countries-manifest.json')));
const flush=()=>new Promise(resolve=>setImmediate(resolve));

async function harness(){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://localhost/',runScripts:'outside-only'}),w=dom.window;
 let now=0,interval=null,advance=null;
 w.fetch=async url=>({ok:true,json:async()=>JSON.parse(JSON.stringify(url==='countries.json'?data:manifest))});
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
 const submit=value=>{$('#answer-input').value=value;$('#answer-input').dispatchEvent(new w.Event('input',{bubbles:true}));$('#answer-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
 const setInput=(selector,value)=>{$(selector).value=value;$(selector).dispatchEvent(new w.Event('input',{bubbles:true}));};
 return {w,$,game,click,load,ready,submit,setInput,start:(kind='time',level='easy')=>w.qa(`mode='${kind}';difficulty='${level}';startGame()`),
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
  if(level==='hard')assert.ok(g.options.every(p=>p.continent===g.question.continent));
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

test('all master difficulties: untimed retries, alias answers, skip disclosure and completion',async t=>{
 const h=await harness();t.after(h.close);
 for(const [level,multiplier] of [['easy',1],['normal',2],['hard',3]]){
  h.start('write',level);await h.ready();const g=h.game(),original=g.question;
  assert.equal(g.deadline,null);assert.ok(h.interval());assert.equal(h.$('.progress'),null);
  h.clock(g.questionStartedAt+3600000);h.w.qa('tick()');assert.equal(g.question,original);
  h.submit('없는나라');assert.equal(g.total,0);assert.equal(g.score,0);assert.equal(g.locked,false);
  assert.ok(h.$('#feedback').textContent.includes('괜찮아요!'));assert.ok(!h.$('#feedback').textContent.includes(original.name));
  h.submit(original.englishName.toUpperCase().split('').join(' '));assert.equal(g.score,100*multiplier);
  h.click('#answer-submit');await h.ready();const skipped=g.question.name;h.click('#skip-question');assert.equal(h.$('#answer-slots').textContent,skipped.replace(/\s/g,''));assert.equal(h.$('#feedback').textContent,'');assert.equal(g.correct,1);assert.equal(g.total,2);
  h.click('#answer-submit');await h.ready();
  for(let i=2;i<10;i++){h.clock(g.questionStartedAt+20000);h.submit(g.question.name);h.click('#answer-submit');if(g.status==='playing')await h.ready();}
  assert.equal(g.status,'ended');assert.equal(g.score,900*multiplier);assert.equal(g.total,10);assert.equal(g.record.mode,`write-${level}`);
  assert.ok(h.$('#high-score .my-entry'));h.$('#high-score').close();
 }
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
 assert.equal(h.$('#detail-title').textContent,'대한민국');assert.ok(h.$('#detail').textContent.includes('Seoul'));h.click('#close-detail');
 h.setInput('#search','JP');assert.equal(h.$('.country-card').dataset.country,'jp');h.setInput('#search','');
 for(const c of new Set(data.map(p=>p.continent))){h.$('#continent-filter').value=c;h.$('#continent-filter').dispatchEvent(new h.w.Event('change',{bubbles:true}));assert.equal(h.w.document.querySelectorAll('#atlas-results .country-card').length,data.filter(p=>p.continent===c).length);}
 h.setInput('#search','없는나라');assert.ok(h.$('.empty'));h.click('[data-nav="play"]');h.click('[data-nav="records"]');assert.equal(h.w.document.querySelectorAll('[data-ranking-mode]').length,2);assert.equal(h.w.document.querySelectorAll('[data-ranking-difficulty]').length,3);
 h.click('[data-ranking-mode="write"]');h.click('[data-ranking-difficulty="hard"]');h.click('[data-play-record="write-hard"]');assert.equal(h.w.qa('mode'),'write');assert.equal(h.w.qa('difficulty'),'hard');
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

test('master bonus starts at image readiness, drops in ten-point steps, and never ends the game',async t=>{
 const h=await harness();t.after(h.close);
 for(const [level,multiplier] of [['easy',1],['normal',2],['hard',3]]){
  h.clock(1000);h.start('write',level);const g=h.game();assert.equal(g.questionStartedAt,null);
  h.clock(21000);await h.ready();assert.equal(g.questionStartedAt,21000);
  const maximum=50*multiplier;assert.equal(h.w.qa('masterBonus(game)'),maximum);
  h.clock(31000);h.tick();assert.equal(h.w.qa('masterBonus(game)'),maximum-Math.floor(maximum/20)*10);
  assert.equal(Number(h.$('.bonus-track').getAttribute('aria-valuenow')),h.w.qa('masterBonus(game)'));
  h.clock(41000);h.tick();assert.equal(h.w.qa('masterBonus(game)'),0);assert.equal(g.status,'playing');
  assert.equal(g.deadline,null);assert.ok(h.$('#hint-question').classList.contains('hint-ready'));assert.equal(h.$('.hint-nudge').hidden,false);
  h.submit(g.question.name);assert.equal(g.score,100*multiplier);assert.equal(g.bonusAwarded,0);assert.equal(g.history[0].elapsedMs,20000);
  assert.equal(g.awaitingNext,true);assert.equal(h.$('#answer-submit').textContent,'다음문제');
 }
});

test('master correct answers award the speed bonus once and preserve the focused input across questions',async t=>{
 const h=await harness();t.after(h.close);h.start('write','hard');await h.ready();
 const g=h.game(),input=h.$('#answer-input'),question=g.question;
 h.submit(question.name);assert.equal(g.score,450);assert.equal(g.bonusAwarded,150);assert.equal(g.question,question);
 assert.equal(input.readOnly,true);assert.equal(g.history.length,1);assert.equal(g.total,1);
 h.w.qa('submitAnswer(game.question.name)');h.click('#skip-question');assert.equal(g.score,450);assert.equal(g.total,1);
 h.click('#answer-submit');await h.ready();assert.equal(h.$('#answer-input'),input);assert.equal(input.value,'');assert.equal(input.readOnly,false);
 assert.equal(h.w.document.activeElement,input);assert.equal(g.judgement,null);assert.equal(g.awaitingNext,false);assert.equal(g.questionNumber,2);
 assert.equal(h.$('#answer-submit').textContent,'확인');assert.equal(h.w.qa('masterBonus(game)'),150);
});

async function forceCountry(h,id){h.w.qa(`game.deck=[countries.find(p=>p.id==='${id}')];nextQuestion()`);await h.ready();}

test('wrong master letters can be edited or advanced without revealing the answer',async t=>{
 const h=await harness();t.after(h.close);h.start('write');await h.ready();await forceCountry(h,'kr');
 const g=h.game(),original=g.question;
 h.submit('대한미국');assert.equal(g.question,original);assert.equal(g.total,0);assert.equal(g.score,0);
 assert.equal(h.w.document.querySelectorAll('.checked-correct').length,3);assert.equal(h.w.document.querySelectorAll('.checked-wrong').length,1);
 assert.equal(g.answerRevealed,false);assert.equal(h.$('#answer-submit').textContent,'다음문제');
 h.setInput('#answer-input','대한민국');assert.equal(g.awaitingNext,false);assert.equal(g.checkedLetters,null);assert.equal(h.$('#answer-submit').textContent,'확인');
 h.submit('대한민국');assert.equal(g.score,150);assert.equal(g.correct,1);assert.equal(g.total,1);
 h.click('#answer-submit');await h.ready();h.submit('없는나라');h.click('#answer-submit');await h.ready();
 assert.equal(g.total,2);assert.equal(g.correct,1);assert.equal(g.history[1].answerRevealed,false);assert.equal(g.questionNumber,3);
});

test('one-letter hints fill only their slot, remove the bonus, halve base points, and reset next question',async t=>{
 const h=await harness();t.after(h.close);
 for(const [level,id,index,rest,points] of [['easy','kr',0,'한민국',50],['normal','kr',0,'한민국',100],['hard','ad',2,'안도',150]]){
  h.start('write',level);await h.ready();await forceCountry(h,id);h.w.Math.random=()=>.99;
  const g=h.game();h.click('#hint-question');assert.equal(g.hint.index,index);assert.equal(g.hintUsed,true);
  assert.equal(h.w.document.querySelectorAll('.hint-target').length,1);assert.equal(h.$('#master-bonus').hidden,true);
  const hint=g.hint;h.click('#hint-question');assert.equal(g.hint,hint);
  h.submit(rest);assert.equal(g.score,points);assert.equal(g.bonusAwarded,0);assert.equal(g.history[0].hintUsed,true);
  h.click('#answer-submit');await h.ready();assert.equal(g.hintUsed,false);assert.equal(g.hint,null);assert.equal(h.$('#hint-question').disabled,false);
  assert.equal(h.w.document.querySelectorAll('.hint-target').length,0);assert.equal(h.$('#master-bonus').hidden,false);
 }
});

test('pass fills the answer without an answer sentence and waits for the next button',async t=>{
 const h=await harness();t.after(h.close);h.start('write');await h.ready();const g=h.game(),original=g.question,input=h.$('#answer-input');
 h.click('#skip-question');assert.equal(g.question,original);assert.equal(g.score,0);assert.equal(g.total,1);assert.equal(g.judgement,'skipped');
 assert.equal(h.$('#feedback').textContent,'');assert.equal(h.$('#answer-slots').textContent,h.w.qa('normalize(game.question.name)'));
 assert.equal(input.readOnly,true);assert.equal(h.$('#master-bonus').hidden,true);assert.equal(h.$('#hint-question').disabled,true);
 h.clock(999999);h.tick();assert.equal(g.question,original);assert.equal(g.total,1);
 h.click('#answer-submit');await h.ready();assert.equal(h.$('#answer-input'),input);assert.equal(input.value,'');assert.equal(g.questionNumber,2);
});

test('Korean composition cannot submit or advance until committed',async t=>{
 const h=await harness();t.after(h.close);h.start('write');await h.ready();await forceCountry(h,'kr');
 const g=h.game(),input=h.$('#answer-input');
 input.dispatchEvent(new h.w.CompositionEvent('compositionstart',{bubbles:true}));input.value='대한민국';
 input.dispatchEvent(new h.w.InputEvent('input',{bubbles:true,isComposing:true}));
 h.$('#answer-form').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(g.total,0);assert.equal(g.answerComposing,true);
 input.dispatchEvent(new h.w.CompositionEvent('compositionend',{bubbles:true}));assert.equal(g.answerComposing,false);
 h.$('#answer-form').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(g.total,1);assert.equal(g.score,150);
});

test('aliases and English answers remain accepted, including after hints, and long names retain all slots',async t=>{
 const h=await harness();t.after(h.close);h.start('write');await h.ready();await forceCountry(h,'kr');
 h.submit('한국');assert.equal(h.game().correct,1);assert.equal(h.$('#answer-slots').textContent,'대한민국');assert.equal(h.w.document.querySelectorAll('.checked-wrong').length,0);
 h.click('#answer-submit');await h.ready();await forceCountry(h,'tr');h.setInput('#answer-input',h.game().question.englishName.toUpperCase());
 assert.ok(h.$('.letter-entry').classList.contains('free-input'));h.click('#hint-question');h.submit(h.game().question.englishName);assert.equal(h.game().score,200);
 h.click('#answer-submit');await h.ready();await forceCountry(h,'vc');
 assert.equal(h.w.document.querySelectorAll('.answer-slot').length,h.game().answerLength);
 h.submit(h.game().question.englishName);assert.equal(h.game().correct,3);assert.equal(h.w.document.querySelectorAll('.checked-wrong').length,0);
});

test('quit scores can register and replay saves the typed name before returning to the same lobby',async t=>{
 const h=await harness();t.after(h.close);h.start('time','normal');await h.ready();h.click(`[data-answer="${h.game().question.id}"]`);h.click('#quit-game');
 assert.ok(h.$('#high-score').open);assert.equal(h.game().completed,true);assert.equal(h.game().rank,1);
 h.setInput('#trainer-name','새 탐험가');h.click('#ranking-replay');assert.equal(h.game(),null);assert.equal(h.$('#high-score').open,false);
 assert.equal(h.w.qa('mode'),'time');assert.equal(h.w.qa('difficulty'),'normal');assert.equal(h.$('#start-game').textContent,'시작');
 assert.equal(JSON.parse(h.w.localStorage.getItem('flag-play-records'))[0].name,'새 탐험가');assert.equal(h.w.localStorage.getItem('flag-play-explorer-name'),'새 탐험가');
 h.start('write','hard');await h.ready();h.submit(h.game().question.name);h.click('#quit-game');assert.equal(h.$('#trainer-name').value,'새 탐험가');
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

test('public play does not require a profile, and optional profile and score help use no access tracking',async t=>{
 const h=await harness();t.after(h.close);h.click('#game-help');assert.ok(h.$('#detail').textContent.includes('20초'));assert.ok(h.$('#detail').textContent.includes('절반'));h.click('#close-detail');
 h.click('#edit-explorer');h.setInput('#explorer-name','우리 탐험가');h.$('#explorer-form').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));assert.ok(h.$('#edit-explorer').textContent.includes('우리 탐험가'));
 h.start('write');await h.ready();assert.equal(h.game().status,'playing');assert.ok(h.w.document.body.classList.contains('game-focused'));
 h.click('#quit-game');assert.equal(h.w.document.body.classList.contains('game-focused'),false);assert.equal(h.game().rank,0);assert.ok(h.$('#high-score').open);
 assert.equal(h.w.localStorage.getItem('pokemon-play-trainer-name'),null);
});

test('hinted empty submissions do nothing and switching input mode keeps the hint readable',async t=>{
 const h=await harness();t.after(h.close);h.start('write');await h.ready();await forceCountry(h,'kr');
 h.click('#hint-question');h.submit('');assert.equal(h.game().judgement,null);assert.equal(h.game().awaitingNext,false);assert.equal(h.game().total,0);
 h.click('#toggle-answer-mode');assert.ok(h.$('#hint-message').textContent.includes('“대”'));
 h.submit('South Korea');assert.equal(h.game().score,50);assert.equal(h.game().correct,1);
});
