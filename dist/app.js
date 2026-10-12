'use strict';
const app=document.querySelector('#app');
const difficulties={easy:{label:'쉬움',multiplier:1},normal:{label:'보통',multiplier:2},hard:{label:'어려움',multiplier:3}};
const CAPITAL_BONUS_DURATION=20000;
let countries=[],cityProfiles={},cityCollectedAt='',allCities=[],dataCollectedAt='',view='play',mode='time',difficulty='easy',game=null,ticker=null,advance=null,recordTab='time-easy',search='',continentFilter='',sort='name';
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shuffle=xs=>{const a=[...xs];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const normalize=s=>String(s).normalize('NFKC').toLocaleLowerCase('ko').replace(/[^\p{L}\p{N}]/gu,'');
const RANKING_LIMIT=20;
const rankingModes=['time-easy','time-normal','time-hard','capital-easy','capital-normal','capital-hard'];
const legacyRankingModes=['write-easy','write-normal','write-hard'];
let records=[],lastSavedId=null;
let explorerName='';
try{const stored=(localStorage.getItem('flag-play-explorer-name')||'').normalize('NFKC').trim();if(stored&&stored.length<=12)explorerName=stored;}catch{}
function readRecords(){const stored=JSON.parse(localStorage.getItem('flag-play-records')||'[]');return Array.isArray(stored)?stored.filter(r=>r&&typeof r.name==='string'&&Number.isFinite(r.score)&&Number.isFinite(r.correct)&&Number.isFinite(r.total)&&typeof r.date==='string'&&Number.isFinite(Date.parse(r.date))&&[...rankingModes,...legacyRankingModes].includes(r.mode)):[];}
function compareRecords(a,b){return b.score-a.score||Date.parse(b.date)-Date.parse(a.date)||String(a.id||'').localeCompare(String(b.id||''));}
function leaderboard(key,items=records){return items.filter(r=>r.mode===key).sort(compareRecords).slice(0,RANKING_LIMIT);}
function rankOf(record,items=records){return leaderboard(record.mode,[...items,record]).indexOf(record)+1;}
function rankingLabel(key){const [kind,level]=key.split('-');return `${kind==='time'?'타임어택':'수도퀴즈'} · ${difficulties[level].label}`;}
function rankingKey(g){return g.mode+'-'+g.difficulty;}
try{records=readRecords();}catch{}
const activeGame=()=>game&&['loading','playing'].includes(game.status);
let previewCountry=null,previewChoices=null;

function cleanup(){clearInterval(ticker);clearTimeout(advance);ticker=null;advance=null;}
let leaveAction=null;
function confirmLeave(action){const dialog=document.querySelector('#detail');leaveAction=action;dialog.setAttribute('aria-labelledby','leave-title');dialog.innerHTML='<div class="detail-inner"><h2 id="leave-title" style="font-size:22px">진행 중인 게임을 끝낼까요?</h2><p>이동하면 이번 게임의 기록은 저장되지 않아요.</p><div class="result-actions"><button class="secondary" id="keep-playing">계속 플레이</button><button class="primary" id="leave-game">게임 끝내고 이동</button></div></div>';dialog.showModal();}
function navigate(next){if(activeGame()){confirmLeave(()=>{cleanup();game=null;view=next;render();});return;}cleanup();game=null;view=next;render();}
function fitGameViewport(){
 const viewport=window.visualViewport,root=document.documentElement;
 root.style.setProperty('--game-visible-height',`${viewport?.height||window.innerHeight}px`);
 root.style.setProperty('--game-viewport-top',`${viewport?.offsetTop||0}px`);
 root.style.setProperty('--layer-visible-width',`${Math.min(window.innerWidth,viewport?.width||window.innerWidth)}px`);
 root.style.setProperty('--layer-left',`${viewport?.offsetLeft||0}px`);
  const dialog=document.querySelector('#high-score');
 if(dialog?.open&&document.activeElement?.id==='trainer-name')dialog.querySelector('.my-entry')?.scrollIntoView({block:'nearest'});
}
window.addEventListener('resize',fitGameViewport);
window.visualViewport?.addEventListener('resize',fitGameViewport);
window.visualViewport?.addEventListener('scroll',fitGameViewport);
function updateGameFocus(){
 const focused=view==='play'&&!!activeGame(),entering=focused&&!document.body.classList.contains('game-focused');
 document.body.classList.toggle('game-focused',focused);
 if(focused)document.body.dataset.gameMode=game.mode;else delete document.body.dataset.gameMode;
 fitGameViewport();if(entering)app.scrollIntoView({block:'start'});
}
function render(){if(!explorerName){renderExplorerEntry();return;}document.body.classList.remove('explorer-entry');updateGameFocus();if(view==='play')renderPlay();else if(view==='atlas')renderAtlas();else renderRecords();}
function renderPlay(){
if(!explorerName){renderExplorerEntry();return;}
previewChoices={easy:shuffle(countries.filter(p=>p.familiar))[0],normal:shuffle(countries)[0],hard:shuffle(countries.filter(p=>!p.familiar))[0]};previewCountry=previewChoices[difficulty];
app.innerHTML=`<section class="intro"><div><p class="eyebrow">FLAY · 세계 국기 여행</p><h1>${mode==='capital'?'이 나라의 수도는 어디일까요?':'이 국기, 어느 나라일까요?'}</h1><p>${mode==='capital'?'국기를 보고 그 나라의 수도를 골라 보세요!':'국기를 보고 나라 이름을 맞혀 보세요!'}</p><button class="explorer-profile" id="edit-explorer">${explorerName?'🧭 '+escapeHTML(explorerName)+' · 이름 변경':'🧭 탐험가 이름 등록'}</button></div></section>
<div class="play-grid"><section class="game-card" aria-label="나라 퀴즈"><div class="game-tabs"><button class="game-tab ${mode==='time'?'active':''}" data-mode="time">⚡ 타임어택</button><button class="game-tab ${mode==='capital'?'active':''}" data-mode="capital">🏛 수도퀴즈</button></div><div id="game-body" class="game-body"></div></section></div>
<div class="quick-links"><button class="shortcut shortcut-dex" data-nav="atlas"><span class="shortcut-icon" aria-hidden="true">📖</span><span>나라 도감</span></button><button class="shortcut shortcut-ranking" data-nav="records"><span class="shortcut-icon" aria-hidden="true">🏆</span><span>랭킹</span></button></div>`;
renderGameBody();
}
const gameExit=()=>'<button class="game-exit" id="quit-game" aria-label="게임 그만하기" title="그만하기"><span aria-hidden="true">×</span></button>';
function renderGameBody(){updateGameFocus();const body=document.querySelector('#game-body');if(!body)return;
if(game?.status==='ended'){renderResult(body);return;}
if(game?.status==='playing'){renderQuestion(body);return;}
if(game?.status==='loading'){body.innerHTML=`<div class="focus-loading">${gameExit()}<div class="quiz-start-loading" role="status" aria-live="polite"><span class="quiz-spinner" aria-hidden="true"></span><p>첫 국기를 준비하고 있어요…</p></div></div>`;return;}
body.innerHTML=`<div class="game-setup"><h2>${mode==='time'?'60초 타임어택':'수도퀴즈'}</h2>
${mode==='capital'?`<div class="difficulty difficulty-cards" aria-label="난이도 선택">${Object.entries(difficulties).map(([key,d])=>`<button data-difficulty="${key}" class="difficulty-choice ${difficulty===key?'active':''}" aria-pressed="${difficulty===key}"><span class="difficulty-preview "><img src="${previewChoices[key].image}" alt="국기 미리보기" width="100" height="100"></span><strong>${d.label}</strong><small>${d.multiplier}배 점수</small></button>`).join('')}</div>`:`<div class="difficulty difficulty-time" aria-label="타임어택 난이도 선택">${Object.entries(difficulties).map(([key,d])=>`<button data-difficulty="${key}" class="difficulty-choice ${difficulty===key?'active':''}" aria-pressed="${difficulty===key}"><strong>${d.label}</strong><small>${key==='easy'?'친숙한 30개 나라':key==='normal'?'세계 195개 나라':'낯선 나라 · 같은 대륙 보기'}</small></button>`).join('')}</div>`}
${mode==='time'?`<div class="flag-stage setup-stage "><img src="${previewCountry.image}" alt="랜덤 국기 미리보기" width="230" height="230"></div>`:''}
<button class="primary setup-start" id="start-game">시작</button><p class="setup-note">${mode==='time'?'60초 동안 최대한 많이 맞추기 · 정답 100점 · 연속 정답 보너스':'10문제 · 4개의 도시 중 수도를 골라요<br>빨리 맞추면 보너스! 힌트는 보기 2개를 지워요.'}</p><button class="text-button" id="game-help">게임 방법과 점수 안내</button></div>`;
}
function prepareQuestionImages(g){
 // Keep the exact next questions warm, including the next shuffled deck.
 if(!g.deck.length)g.deck=shuffle(g.pool.filter(p=>p.id!==g.question.id));
 const ahead=g.mode==='capital'?Math.min(3,10-g.total-1):3;
 const upcoming=[g.question,...g.deck.slice(-ahead).reverse().slice(0,ahead)];
 const keep=new Set(upcoming.map(p=>p.id));
 for(const id of g.images.keys())if(!keep.has(id))g.images.delete(id);
 upcoming.forEach((p,i)=>prepareQuestionImage(g,p,i===0?'high':'low'));
}
function prepareQuestionImage(g,p,priority){
 const existing=g.images.get(p.id);if(existing){existing.image.fetchPriority=priority;return existing;}
 const image=new Image(190,190),entry={image,ready:false,failed:false};
 image.alt=g.mode==='capital'?'수도를 맞혀야 하는 나라의 국기':'나라 이름을 맞혀야 하는 국기';image.fetchPriority=priority;
 g.images.set(p.id,entry);
 entry.loaded=new Promise(resolve=>{
  let settled=false;
  const finish=ok=>{if(settled)return;settled=true;entry.ready=ok;entry.failed=!ok;resolve(ok);};
  const loaded=()=>{if(typeof image.decode==='function')image.decode().then(()=>finish(true),()=>finish(image.naturalWidth>0));else finish(true);};
  image.onload=loaded;image.onerror=()=>finish(false);image.src=p.image;
  if(image.complete){if(image.naturalWidth)loaded();else finish(false);}
 });
 return entry;
}
function selectQuestion(g){
 if(!g.deck.length)g.deck=shuffle(g.pool.filter(p=>p.id!==g.question?.id));
 g.question=g.deck.pop();g.questionNumber=g.total+1;g.locked=false;g.imageReady=false;
 g.questionStartedAt=null;g.elapsedAtAnswer=null;g.bonusAwarded=0;g.judgement=null;
 g.hintUsed=false;g.hiddenOptions=new Set();g.selectedAnswer=null;
 if(g.mode==='capital'){g.cityProfile=cityProfiles[g.question.id];g.answerKey=g.cityProfile.capitalId;g.options=capitalOptions(g.question);prepareQuestionImages(g);return;}
 prepareQuestionImages(g);
 const candidates=g.pool.filter(p=>p.id!==g.question.id&&p.continent===g.question.continent);
 const neighbors=shuffle(candidates.filter(p=>g.question.borders.includes(p.iso3)));
 const sameContinent=shuffle(candidates.filter(p=>!neighbors.includes(p)));
 const extra=shuffle(countries.filter(p=>p.id!==g.question.id&&p.continent===g.question.continent&&!candidates.includes(p)));
 g.options=shuffle([g.question,...[...neighbors,...sameContinent,...extra].slice(0,3)]);
}
function questionPool(level){return level==='easy'?countries.filter(p=>p.familiar):level==='hard'?countries.filter(p=>!p.familiar):countries;}
const cityStates=new Set(['mc','sg','va']);
function citySimilarity(a,b){
 const x=Array.from(normalize(a).normalize('NFKD')),y=Array.from(normalize(b).normalize('NFKD'));
 const grams=letters=>new Set(letters.slice(1).map((v,i)=>letters[i]+v)),gx=grams(x),gy=grams(y);
 const common=[...gx].filter(v=>gy.has(v)).length;let prefix=0;while(prefix<Math.min(x.length,y.length)&&x[prefix]===y[prefix])prefix++;
 return common*2/Math.max(1,gx.size+gy.size)+prefix/Math.max(1,x.length,y.length);
}
function capitalOptions(country){
 const profile=cityProfiles[country.id],capital=profile.cities.find(c=>c.id===profile.capitalId);
 const forbidden=new Set(profile.cities.filter(c=>c.id===capital.id||profile.excludedIds.includes(c.id)).map(c=>normalize(c.name)));
 const own=shuffle(profile.cities.filter(c=>c.id!==capital.id&&!profile.excludedIds.includes(c.id)&&!forbidden.has(normalize(c.name))));
 const selected=[capital],names=new Set([normalize(capital.name)]);
 const add=city=>{const name=normalize(city.name);if(!names.has(name)&&!forbidden.has(name)){selected.push(city);names.add(name);}};
 own.forEach(c=>{if(selected.length<4)add(c);});
 if(selected.length<4){
  const eligible=shuffle(allCities.filter(c=>c.countryId!==country.id&&(countries.find(p=>p.id===c.countryId)?.continent===country.continent||cityStates.has(c.countryId))&&!forbidden.has(normalize(c.name))));
  eligible.sort((a,b)=>citySimilarity(capital.name,b.name)-citySimilarity(capital.name,a.name)||citySimilarity(capital.englishName,b.englishName)-citySimilarity(capital.englishName,a.englishName));
  for(const city of shuffle(eligible.slice(0,12)))if(selected.length<4)add(city);
  for(const city of eligible)if(selected.length<4)add(city);
 }
 if(selected.length!==4)throw Error('incomplete capital options');return shuffle(selected);
}
function startGame(){if(!explorerName){renderExplorerEntry();return;}cleanup();const pool=questionPool(difficulty);
 game={status:'loading',mode,difficulty,pool,deck:shuffle(pool),images:new Map(),question:null,score:0,correct:0,total:0,streak:0,maxStreak:0,history:[],locked:false,saved:false,deadline:0,imageReady:false,imageFailures:0};
 prepareFirstQuestion(game);
}
function prepareFirstQuestion(g){
 if(game!==g||g.status!=='loading')return;selectQuestion(g);renderGameBody();
 const entry=g.images.get(g.question.id);
 const begin=()=>{if(game!==g||g.status!=='loading')return;g.status='playing';g.deadline=g.mode==='time'?performance.now()+60000:null;renderGameBody();ticker=setInterval(tick,100);};
 const failed=()=>{if(game!==g||g.status!=='loading')return;g.imageFailures++;if(g.imageFailures>=5){g.imageError=true;endGame('error');}else prepareFirstQuestion(g);};
 if(entry.ready)begin();else entry.loaded.then(ok=>ok?begin():failed());
}
function nextQuestion(){if(!game||game.status!=='playing')return;if(game.mode==='capital'&&game.total>=10){endGame();return;}if(game.mode==='time'&&performance.now()>=game.deadline){endGame();return;}
 selectQuestion(game);renderGameBody();}
function timerState(g){const duration=60000;const remaining=Math.max(0,g.deadline-performance.now());return {seconds:Math.ceil(remaining/1000),percent:Math.min(100,remaining/duration*100)};}
function capitalElapsed(g){return Math.min(CAPITAL_BONUS_DURATION,Math.max(0,Math.floor(performance.now()-(g.questionStartedAt??performance.now()))));}
const capitalPoints=(g,hinted=g.hintUsed)=>100*difficulties[g.difficulty].multiplier/(hinted?2:1);
const capitalBonusMax=g=>50*difficulties[g.difficulty].multiplier;
function capitalBonus(g,elapsed=capitalElapsed(g)){
 const maximum=capitalBonusMax(g);
 return g.hintUsed?0:maximum-Math.floor(Math.min(CAPITAL_BONUS_DURATION,Math.max(0,elapsed))*maximum/(CAPITAL_BONUS_DURATION*10))*10;
}
function updateCapitalBonus(g){
 const gauge=document.querySelector('#capital-bonus');if(!gauge)return;
 gauge.hidden=g.hintUsed||g.judgement==='skipped';
 const elapsed=g.elapsedAtAnswer??capitalElapsed(g),points=g.locked?g.bonusAwarded:capitalBonus(g,elapsed);
 gauge.querySelector('.bonus-fill').style.width=(g.hintUsed?0:(CAPITAL_BONUS_DURATION-elapsed)/CAPITAL_BONUS_DURATION*100)+'%';
 gauge.querySelector('[role="progressbar"]').setAttribute('aria-valuenow',points);
 gauge.querySelector('.bonus-current').textContent=points+'점';
 gauge.classList.toggle('bonus-earned',g.locked&&points>0);gauge.classList.toggle('bonus-expired',elapsed>=CAPITAL_BONUS_DURATION);
 const hint=document.querySelector('#hint-question'),available=g.imageReady&&!g.locked&&!g.hintUsed&&points===0;
 if(hint){hint.classList.toggle('hint-ready',available);hint.querySelector('.hint-nudge').hidden=!available;}
}
function showQuestionHint(){
 const g=game;if(g?.mode!=='capital'||g.status!=='playing'||g.locked||!g.imageReady||g.hintUsed)return;
 g.hintUsed=true;
 shuffle(g.options.filter(c=>c.id!==g.answerKey)).slice(0,2).forEach(c=>g.hiddenOptions.add(c.id));
 document.querySelectorAll('[data-answer]').forEach(button=>{if(g.hiddenOptions.has(button.dataset.answer)){button.disabled=true;button.classList.add('eliminated');button.setAttribute('aria-label',button.textContent+' · 힌트로 제외된 보기');}});
 const button=document.querySelector('#hint-question');button.disabled=true;button.classList.add('used');button.setAttribute('aria-label','힌트 사용 완료');
 const feedback=document.querySelector('#feedback');feedback.className='feedback attack-feedback';feedback.textContent='보기 2개를 지웠어요. 정답은 '+capitalPoints(g)+'점이에요.';updateCapitalBonus(g);
}
function capitalHint(g){return `<button class="stage-hint" id="hint-question" aria-label="보기 2개 지우기 · 보너스 없이 ${capitalPoints(g,true)}점" title="보기 2개 지우기" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 15c0-2-3-2-3-6a6 6 0 0 1 12 0c0 4-3 4-3 6ZM9 18h6m-5 3h4"/></svg><span class="hint-nudge" hidden aria-hidden="true">힌트보기</span></button>`;}
function capitalScore(g){
 const maximum=capitalBonusMax(g);
 return `<div class="capital-bonus" id="capital-bonus"><div class="bonus-heading"><span>빨리 맞추기 보너스</span><strong class="bonus-current">${maximum}점</strong></div><div class="bonus-track" role="progressbar" aria-label="빨리 맞추기 보너스" aria-valuemin="0" aria-valuemax="${maximum}" aria-valuenow="${maximum}"><div class="bonus-fill" style="width:100%"></div></div><div class="bonus-scale" aria-hidden="true">${Array.from({length:maximum/10+1},(_,index)=>`<span style="left:${index*10/maximum*100}%">${index*10}</span>`).join('')}</div></div><div class="game-stats"><span class="question-count">${g.questionNumber} / 10 문제</span><button class="pass-button" id="skip-question" aria-label="패스 · 정답 보기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0"/></svg><span>패스</span></button><span class="capital-score"><strong id="score">${g.score.toLocaleString()}</strong> 점</span></div>`;
}
function showJudgement(correct){
 const effect=document.querySelector('#judgement-effect');if(!effect)return;
 effect.hidden=false;effect.className='judgement-effect '+(correct?'good':'bad');
 effect.textContent=correct?(game.streak>=3?`${game.streak}연속 정답!`:'정답이에요!'):'다음 문제에 도전!';
}
function renderQuestion(body){
 const g=game,timeState=g.mode==='time'?timerState(g):null,previousProgress=g.mode==='time'?body.querySelector('.progress'):null;
 body.innerHTML=`<div class="flag-stage">${gameExit()}${g.mode==='capital'?capitalHint(g):''}<div class="flag-image-frame"><span id="question-image-slot"></span></div><span id="judgement-effect" class="judgement-effect" aria-hidden="true" hidden></span></div>
 ${g.mode==='capital'?`<p class="capital-prompt">이 나라의 <strong>${escapeHTML(g.cityProfile.questionLabel)}</strong>는 어디일까요?</p>`:''}
 <div class="question-score">${g.mode==='capital'?capitalScore(g):`<div class="game-stats"><span class="time">⏱ <strong id="time">${timeState.seconds}</strong> 초</span><span>연속 <b id="streak">${g.streak}</b> 정답</span><span class="attack-score"><strong id="score">${g.score.toLocaleString()}</strong> 점</span></div><div class="progress" role="progressbar" aria-label="남은 시간" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${timeState.percent}"><div id="timer-bar" style="width:${timeState.percent}%"></div></div>`}</div>
 <div class="choices">${g.options.map((p,i)=>`<button class="choice" data-answer="${p.id}" data-question="${g.question.id}" aria-pressed="false" disabled><span>${i+1}</span>${escapeHTML(p.name)}</button>`).join('')}</div>
 <div id="feedback" class="feedback attack-feedback" role="status" aria-live="polite">국기를 불러오는 중…</div>`;
 if(previousProgress){body.querySelector('.progress').replaceWith(previousProgress);previousProgress.querySelector('#timer-bar').style.width=timeState.percent+'%';previousProgress.setAttribute('aria-valuenow',timeState.percent);}
 const current=g.question.id,entry=g.images.get(current),img=entry.image;img.id='question-image';body.querySelector('#question-image-slot').replaceWith(img);
 const active=()=>game===g&&g.status==='playing'&&g.question.id===current&&!g.locked&&body.querySelector('#question-image')===img;
 const ready=()=>{if(!active())return;g.imageReady=true;body.querySelectorAll('.choice,#hint-question,#skip-question').forEach(button=>button.disabled=false);body.querySelector('#feedback').textContent='';if(g.mode==='capital'){if(g.questionStartedAt===null)g.questionStartedAt=performance.now();updateCapitalBonus(g);}fitGameViewport();};
 const failed=()=>{if(!active())return;g.imageFailures++;if(g.imageFailures>=5){g.imageError=true;endGame('error');}else nextQuestion();};
 if(entry.ready)ready();else entry.loaded.then(ok=>ok?ready():failed());
}
function tick(){
 if(!game||game.status!=='playing')return;
 if(game.mode==='capital'){if(game.imageReady)updateCapitalBonus(game);return;}
 const state=timerState(game),time=document.querySelector('#time'),bar=document.querySelector('#timer-bar');
 if(time)time.textContent=state.seconds;
 if(bar){bar.style.width=state.percent+'%';bar.parentElement.setAttribute('aria-valuenow',state.percent);}
 if(state.seconds<=0)endGame();
}
function submitCapitalAnswer(value,skipped){
 const g=game;if(g.hiddenOptions.has(value)||(!skipped&&!g.options.some(c=>c.id===value)))return;
 const correct=!skipped&&value===g.answerKey,capital=g.cityProfile.cities.find(c=>c.id===g.answerKey),feedback=document.querySelector('#feedback');
 g.locked=true;g.selectedAnswer=value;g.total++;g.elapsedAtAnswer=capitalElapsed(g);g.bonusAwarded=correct?capitalBonus(g,g.elapsedAtAnswer):0;g.judgement=skipped?'skipped':correct?'correct':'wrong';
 const points=correct?capitalPoints(g)+g.bonusAwarded:0;
 if(correct){g.correct++;g.streak++;g.maxStreak=Math.max(g.maxStreak,g.streak);g.score+=points;}else g.streak=0;
 g.history.push({country:g.question,correct,answer:String(value),capitalName:capital.name,answerRevealed:true,hintUsed:g.hintUsed,elapsedMs:g.elapsedAtAnswer});
 showJudgement(correct);feedback.className='feedback attack-feedback '+(correct?'good':'bad');
 feedback.textContent=correct?`${g.question.name} · ${capital.name} 정답! +${points}점`:`${g.question.name}의 ${g.cityProfile.questionLabel}는 ${capital.name}예요.`;
 document.querySelectorAll('[data-answer]').forEach(button=>{button.disabled=true;button.setAttribute('aria-pressed',String(button.dataset.answer===value));if(button.dataset.answer===g.answerKey)button.classList.add('correct');else if(button.dataset.answer===value)button.classList.add('wrong');});
 document.querySelectorAll('#hint-question,#skip-question').forEach(button=>button.disabled=true);
 document.querySelector('#score').textContent=g.score.toLocaleString();updateCapitalBonus(g);advance=setTimeout(nextQuestion,correct?550:1600);
}
function submitAnswer(value,skipped=false){
 const g=game;if(!g||g.status!=='playing'||g.locked||!g.imageReady)return;
 if(g.mode==='time'&&performance.now()>=g.deadline){endGame();return;}
 if(g.mode==='capital'){submitCapitalAnswer(value,skipped);return;}
 const correct=value===g.question.id,feedback=document.querySelector('#feedback');
 g.locked=true;g.selectedAnswer=value;g.total++;
 const points=correct?100+Math.min(g.streak,10)*10:0;
 if(correct){g.correct++;g.streak++;g.maxStreak=Math.max(g.maxStreak,g.streak);g.score+=points;}else g.streak=0;
 g.history.push({country:g.question,correct,answer:String(value),answerRevealed:true,hintUsed:false});
 showJudgement(correct);feedback.className='feedback attack-feedback '+(correct?'good':'bad');feedback.textContent=correct?`정답! ${g.question.name} · +${points}점`:`정답은 ${g.question.name}예요. 다음 문제에 도전해요!`;
 document.querySelectorAll('[data-answer]').forEach(button=>{button.disabled=true;button.setAttribute('aria-pressed',String(button.dataset.answer===value));if(button.dataset.answer===g.question.id)button.classList.add('correct');else if(button.dataset.answer===value)button.classList.add('wrong');});
 document.querySelector('#score').textContent=g.score.toLocaleString();document.querySelector('#streak').textContent=g.streak;
 advance=setTimeout(nextQuestion,correct?550:1300);
}
function endGame(reason='complete'){
 if(!game||game.status==='ended')return;
 cleanup();game.status='ended';game.quit=reason==='quit';game.completed=reason==='complete'||game.quit;
 game.record={id:typeof crypto.randomUUID==='function'?crypto.randomUUID():`${Date.now()}-${Math.random()}`,score:game.score,correct:game.correct,total:game.total,mode:rankingKey(game),date:new Date().toISOString()};
 try{records=readRecords();}catch{}
 game.rank=game.completed&&!game.imageError&&game.score>0?rankOf(game.record):0;
 // Replace an open details/navigation panel with the end-of-game registration.
 leaveAction=null;document.querySelector('#detail').close();
 renderGameBody();if(game.rank||game.quit)showRankingEntry();
}
function resultRanking(g){
 if(g.imageError)return '<p class="result-note">국기를 불러오지 못했어요. 다시 도전해 주세요.</p>';
 if(!g.completed)return '<p class="result-note">끝까지 플레이하면 랭킹에 도전할 수 있어요.</p>';
 if(g.saved)return `<div class="rank-banner saved"><span>🏆</span><div><strong>랭킹 ${g.savedRank}위에 이름을 남겼어요!</strong><p>${escapeHTML(g.record.name)} · ${rankingLabel(g.record.mode)}</p></div></div>`;
 if(g.rank)return `<div class="rank-banner"><span>🏆</span><div><strong>축하해요! 랭킹 ${g.rank}위!</strong><p>${rankingLabel(g.record.mode)} TOP ${RANKING_LIMIT}에 이름을 남겨 보세요.</p></div><button class="secondary" id="enter-ranking">이름 남기기</button></div>`;
 const cutoff=leaderboard(g.record.mode).at(-1);
 return `<p class="result-note">${g.score===0?'다음에는 정답을 맞히고 랭킹에 도전해 보세요!':`이번에는 TOP ${RANKING_LIMIT}에 조금 못 미쳤어요. ${cutoff?`현재 ${RANKING_LIMIT}위는 ${cutoff.score.toLocaleString()}점이에요.`:''}`}</p>`;
}
function renderResult(body){const g=game;const mistakes=g.history.filter(x=>!x.correct&&(g.mode==='time'||x.answerRevealed));body.innerHTML=`<div class="result"><div class="result-icon">${g.imageError?'☁️':g.correct>0?'🏆':'🌱'}</div><h2>${g.imageError?'국기를 불러오지 못했어요':g.correct>=8?'멋진 세계 탐험가!':'즐거운 도전이었어요!'}</h2><div class="big-score">${g.score.toLocaleString()}<small>점</small></div><p class="summary">${g.mode==='time'?'60초 타임어택 · '+difficulties[g.difficulty].label:'수도퀴즈 · '+difficulties[g.difficulty].label} · ${g.total}문제 중 ${g.correct}개 정답 · 최고 ${g.maxStreak}연속</p>${resultRanking(g)}
${mistakes.length?`<div class="review-list"><strong style="font-size:13px">다음에는 기억할 수 있어요!</strong>${mistakes.map(m=>`<div class="review-row"><img src="${m.country.image}" alt="" width="38" height="38"><strong>${escapeHTML(m.country.name)}${g.mode==='capital'?' · '+escapeHTML(m.capitalName):''}</strong><span>다시 만나기</span><button data-country="${m.country.id}">도감 보기</button></div>`).join('')}</div>`:''}<div class="result-actions"><button class="primary" id="result-replay">다시 도전!</button><button class="secondary" data-nav="records">랭킹 보기</button></div></div>`;}
function returnToLobby(){
 if(game){mode=game.mode;difficulty=game.difficulty;}
 cleanup();document.querySelector('#high-score').close();game=null;view='play';render();app.focus({preventScroll:true});
}
function saveRankingAndReturnHome(){
 if(game?.rank&&!game.saved&&!saveRecord())return;
 returnToLobby();
}
const rankBadge=rank=>rank<=3?`<span class="rank-medal" role="img" aria-label="${rank}위">${['🥇','🥈','🥉'][rank-1]}</span>`:String(rank);
const recordDate=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
const recordTime=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function rankingDate(date,now=new Date()){
 const then=new Date(date),parts=value=>Object.fromEntries(recordDate.formatToParts(value).filter(part=>['year','month','day'].includes(part.type)).map(part=>[part.type,Number(part.value)])),a=parts(then),b=parts(now);
 const days=Math.max(0,Math.round((Date.UTC(b.year,b.month-1,b.day)-Date.UTC(a.year,a.month-1,a.day))/86400000));
 if(!days)return recordTime.format(then);if(days<7)return `${days}일 전`;
 const anniversary=Math.min(a.day,new Date(Date.UTC(b.year,b.month,0)).getUTCDate()),months=Math.max(0,(b.year-a.year)*12+b.month-a.month-(b.day<anniversary?1:0));
 if(months>=12)return `${Math.floor(months/12)}년 전`;if(months)return `${months}개월 전`;return `${Math.floor(days/7)}주 전`;
}
const rankingDateCell=r=>`<time datetime="${escapeHTML(r.date)}" title="${escapeHTML(recordDate.format(new Date(r.date)))}">${rankingDate(r.date)}</time>`;
function showRankingEntry(){
 if(!game||game.status!=='ended'||(!game.rank&&!game.quit))return;
 const g=game,dialog=document.querySelector('#high-score');
 const list=g.saved||!g.rank?leaderboard(g.record.mode):leaderboard(g.record.mode,[...records,g.record]);
 dialog.innerHTML=`<div class="arcade-entry leaderboard-entry"><button class="close" id="close-ranking" aria-label="랭킹 닫기">×</button><h2 id="high-score-title">${g.saved||g.quit?'우리들의 랭킹':'랭킹에 이름을 남겨요!'}</h2><p class="entry-mode">${rankingLabel(g.record.mode)} · TOP ${RANKING_LIMIT}</p><form id="save-form"></form><div class="entry-list"><table class="entry-ranking"><thead><tr><th scope="col">순위</th><th scope="col">탐험가</th><th scope="col">점수</th><th scope="col">날짜</th></tr></thead><tbody>${list.map((r,i)=>{const me=r.id===g.record.id;return `<tr class="${me?'my-entry':''}" ${me?'aria-label="내 기록"':''}><td>${rankBadge(i+1)}</td><td>${me&&!g.saved?`<div class="entry-input"><input id="trainer-name" form="save-form" aria-label="탐험가 이름" placeholder="탐험가 이름" value="${escapeHTML(g.rankingName??explorerName)}" maxlength="12" autocomplete="nickname"><span class="my-tag">나</span><button type="submit" form="save-form" class="save-name" aria-label="탐험가 이름 저장" title="저장">✓</button></div>`:`<span class="record-name">${escapeHTML(r.name)}${me?'<span class="my-tag">나</span>':''}</span>`}</td><td class="entry-points">${r.score.toLocaleString()}</td><td class="entry-date">${rankingDateCell(r)}</td></tr>`;}).join('')}</tbody></table>${list.length?'':'<p class="empty">아직 기록이 없어요. 첫 번째 탐험가가 되어 보세요!</p>'}</div><p id="save-message" class="result-note" role="status">${g.saved?'이름을 저장했어요.':g.quit?'즐거운 도전이었어요!':''}</p><button class="primary" id="ranking-replay">다시 도전!</button></div>`;
 if(!dialog.open)dialog.showModal();
 const input=dialog.querySelector('#trainer-name');if(input){input.focus({preventScroll:true});input.select();}
 dialog.querySelector('.my-entry')?.scrollIntoView({block:'nearest'});fitGameViewport();
}
function rememberExplorer(name){explorerName=name;try{localStorage.setItem('flag-play-explorer-name',name);}catch{}}
function saveRecord(){
 if(!game||game.status!=='ended'||game.saved||!game.rank)return !!game?.saved;
 const input=document.querySelector('#trainer-name');if(!input)return false;
 const name=input.value.normalize('NFKC').trim()||shuffle(countries.filter(p=>p.name.length<=12))[0].name;
 if(name.length>12){input.setCustomValidity('이름은 12자까지 적어 주세요.');input.reportValidity();return false;}
 input.setCustomValidity('');input.value=name;game.rankingName=name;
 const record={...game.record,name};
 try{
  const latest=readRecords(),rank=rankOf(record,latest);
  if(!rank){records=latest;game.rank=0;document.querySelector('#high-score').close();renderGameBody();return true;}
  const updated=[...latest.filter(r=>legacyRankingModes.includes(r.mode)),...rankingModes.flatMap(key=>leaderboard(key,[...latest,record]))];
  localStorage.setItem('flag-play-records',JSON.stringify(updated));records=updated;game.record=record;game.saved=true;game.savedRank=rank;lastSavedId=record.id;recordTab=record.mode;
  rememberExplorer(name);renderGameBody();showRankingEntry();return true;
 }catch{document.querySelector('#save-message').textContent='랭킹을 저장하지 못했어요. 다시 저장해 주세요.';return false;}
}
function renderExplorerEntry(){
 cleanup();document.body.classList.remove('game-focused');delete document.body.dataset.gameMode;document.body.classList.add('explorer-entry');
 app.innerHTML='<section class="explorer-welcome"><div class="welcome-compass" aria-hidden="true">🧭</div><h1>탐험가 이름을 알려 주세요.</h1><form id="explorer-entry-form"><input id="entry-explorer-name" aria-label="탐험가 이름" placeholder="탐험가 이름" maxlength="12" autocomplete="nickname" required><button class="primary" type="submit">세계 탐험 시작!</button></form><p id="explorer-entry-message" class="result-note" role="status">이름은 이 브라우저에 기억해요.</p></section>';
 fitGameViewport();
}
function enterExplorer(){
 const input=document.querySelector('#entry-explorer-name'),name=input?.value.normalize('NFKC').trim();if(!input)return;
 if(!name||name.length>12){input.setCustomValidity('탐험가 이름을 1~12자로 적어 주세요.');input.reportValidity();return;}
 if(!countries.length){document.querySelector('#explorer-entry-message').textContent='나라 도감을 준비하고 있어요. 잠시 뒤 다시 눌러 주세요.';return;}
 input.setCustomValidity('');rememberExplorer(name);document.body.classList.remove('explorer-entry');render();
}
function showExplorerProfile(){
 const dialog=document.querySelector('#detail');dialog.setAttribute('aria-labelledby','profile-title');
 dialog.innerHTML=`<div class="detail-inner"><button class="close" id="close-detail" aria-label="이름 설정 닫기">×</button><h2 id="profile-title">탐험가 이름</h2><p>이름을 기억하고 다음 랭킹에 미리 채워 드려요. 등록한 이름은 이 브라우저에 기억해요.</p><form id="explorer-form" class="profile-form"><input id="explorer-name" aria-label="탐험가 이름" maxlength="12" autocomplete="nickname" placeholder="12자까지" value="${escapeHTML(explorerName)}"><button class="primary" type="submit">저장</button></form></div>`;
 dialog.showModal();dialog.querySelector('input').focus({preventScroll:true});
}
function showGameHelp(){
 const dialog=document.querySelector('#detail');dialog.setAttribute('aria-labelledby','help-title');
 dialog.innerHTML='<div class="detail-inner game-help"><button class="close" id="close-detail" aria-label="게임 방법 닫기">×</button><h2 id="help-title">세계 탐험 안내</h2><h3>60초 타임어택</h3><p>4개의 나라 중 정답을 골라요. 정답은 100점, 연속 정답마다 10점씩 보너스가 늘어나 최대 100점이 더해져요.</p><h3>수도퀴즈</h3><p>국기를 보고 4개의 도시 중 수도를 골라요. 시간 제한 없이 10문제를 풀며 정답과 오답 확인 후 자동으로 다음 문제로 넘어가요. 쉬움·보통·어려움의 기본 점수는 100·200·300점이에요.</p><p>국기가 준비된 뒤 20초 동안 최대 50·100·150점의 보너스가 10점씩 줄어들어요. 보너스가 끝나도 계속 풀 수 있어요. 힌트는 문제마다 한 번, 오답 보기 2개를 지워 줘요. 힌트를 쓰면 보너스는 사라지고 기본 점수는 절반이 돼요.</p><p>보기는 해당 나라의 주요 도시를 우선 사용해요. 도시가 부족하면 같은 대륙이나 다른 도시국가의 도시를 보충해요. 수도가 여러 개인 나라에서는 묻는 수도의 역할을 표시하고 다른 수도를 오답으로 넣지 않아요.</p><p>두 게임 모두 키보드 1–4로 선택할 수 있어요. 패스는 정답을 알려 주고 다음 문제로 넘어가요.</p><p class="result-note">랭킹은 이 브라우저에 저장돼요. 수도퀴즈는 새로운 랭킹으로 시작하며 이전 마스터 기록은 보존해요.</p></div>';
 dialog.showModal();
}

const continents={'아시아':'#eaa743','유럽':'#558ee8','아프리카':'#59a675','북아메리카':'#9670c7','남아메리카':'#dd7d61','오세아니아':'#4da9af'};
const continentBadge=p=>`<span class="continent-badge" style="--continent-color:${continents[p.continent]}">${escapeHTML(p.continent)}</span>`;
const countryCard=p=>`<button class="country-card" data-country="${p.id}" aria-label="${escapeHTML(p.name)} 나라 도감 보기"><img src="${p.image}" alt="${escapeHTML(p.name)} 국기" loading="lazy" width="200" height="130"><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.englishName)}</small>${continentBadge(p)}</button>`;
const backButton=()=>'<button class="text-button back-to-game" data-nav="play"><span aria-hidden="true">&lt;</span> 퀴즈도전</button>';
function renderAtlas(){
 app.innerHTML=`${backButton()}<section class="intro"><div><p class="eyebrow">WORLD FLAGS · 나라 도감</p><h1>국기로 떠나는 세계 여행</h1><p>195개 나라의 국기, 지도와 다양한 나라 정보를 만나 보세요.</p></div></section><div class="filters"><input id="search" aria-label="나라 검색" value="${escapeHTML(search)}" placeholder="나라 이름 또는 영문 이름 검색"><select id="continent-filter" aria-label="대륙 선택"><option value="">모든 대륙</option>${Object.keys(continents).map(c=>`<option ${continentFilter===c?'selected':''}>${c}</option>`).join('')}</select><select id="sort" aria-label="정렬"><option value="name" ${sort==='name'?'selected':''}>이름순</option><option value="continent" ${sort==='continent'?'selected':''}>대륙순</option></select></div><div id="atlas-results"></div>`;
 renderAtlasResults();
}
function renderAtlasResults(){
 const q=normalize(search);const list=countries.filter(p=>(!q||p.aliases.some(name=>normalize(name).includes(q))||normalize(p.isoCode)===q)&&(!continentFilter||p.continent===continentFilter));
 list.sort((a,b)=>sort==='continent'?Object.keys(continents).indexOf(a.continent)-Object.keys(continents).indexOf(b.continent)||a.name.localeCompare(b.name,'ko'):a.name.localeCompare(b.name,'ko'));
 document.querySelector('#atlas-results').innerHTML=`<p class="result-count">${list.length}개의 나라</p>${list.length?`<div class="country-grid">${list.map(countryCard).join('')}</div>`:'<div class="empty">찾는 나라가 없어요. 다른 이름이나 대륙으로 찾아보세요.</div>'}`;
}
const externalLink=(url,label,description='')=>`<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label)}<span aria-hidden="true"> ↗</span>${description?`<small>${escapeHTML(description)}</small>`:''}<span class="sr-only"> (새 탭에서 열림)</span></a>`;
function localizedName(code,type,fallback){
 try{return new Intl.DisplayNames(['ko'],{type}).of(code)||fallback;}catch{return fallback;}
}
function countryMap(p){
 const [lat,lon]=p.coordinates,x=(lon+180)*2.5,y=(90-lat)*2.5;
 const zoom=Math.max(2,Math.min(10,Math.round(9-Math.log2(Math.sqrt(Math.max(p.area,1)))/2)));
 const mapURL=`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;
 return `<section class="country-location" aria-labelledby="location-title"><div class="detail-section-heading"><h3 id="location-title">어디에 있는 나라일까요?</h3>${externalLink(mapURL,'지도 크게 보기')}</div><p class="location-summary">${escapeHTML(p.continent)} · ${escapeHTML(p.subregion)}</p><figure class="location-map"><svg viewBox="0 0 900 450" role="img" aria-labelledby="map-title map-description"><title id="map-title">세계지도에서 ${escapeHTML(p.name)}의 위치</title><desc id="map-description">${escapeHTML(p.subregion)}에 있는 ${escapeHTML(p.name)}의 대표 위치를 파란 점으로 표시합니다.</desc><image href="assets/world-map.svg" width="900" height="450"/>${p.mapPath?`<path class="map-country" d="${escapeHTML(p.mapPath)}"/>`:''}<circle class="map-marker-halo" cx="${x}" cy="${y}" r="13"/><circle class="map-marker" cx="${x}" cy="${y}" r="5"/></svg><figcaption><span class="map-key" aria-hidden="true"></span>${escapeHTML(p.name)}의 대표 위치 · 작은 나라와 섬은 점으로 확인해요.</figcaption></figure><p class="map-attribution">지도: ${externalLink('https://www.naturalearthdata.com/','Natural Earth')} · 간략한 세계지도이며 위치 표시는 수도와 다를 수 있어요.</p></section>`;
}
function showCountry(id){
 const p=countries.find(p=>p.id===id);if(!p)return;const dialog=document.querySelector('#detail');dialog.setAttribute('aria-labelledby','detail-title');dialog.style.setProperty('--continent-color',continents[p.continent]);
 const nearby=shuffle(countries.filter(c=>c.continent===p.continent&&c.id!==id)).slice(0,4);
 const borders=p.borders.map(code=>countries.find(c=>c.iso3===code)).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
 const languages=p.languages.map((name,i)=>localizedName(p.languageCodes[i],'language',name));
 const currencies=p.currencies.map(c=>`${localizedName(c.code,'currency',c.name)} (${c.code}${c.symbol?' · '+c.symbol:''})`).join(' · ');
 const cityProfile=cityProfiles[p.id],capitalCity=cityProfile.cities.find(c=>c.id===cityProfile.capitalId);
 const fact=(title,value,wide=false)=>`<div${wide?' class="fact-wide"':''}><dt>${title}</dt><dd>${escapeHTML(value||'정보 없음')}</dd></div>`;
 const wiki=(language,name)=>`https://${language}.wikipedia.org/wiki/${language==='ko'?'특수:검색':'Special:Search'}?search=${encodeURIComponent(name)}&go=Go`;
 dialog.innerHTML=`<div class="detail-inner country-detail"><button class="close" id="close-detail" aria-label="나라 도감 닫기">×</button><p class="eyebrow">${escapeHTML(p.continent)} · ${p.isoCode}</p><h2 id="detail-title">${escapeHTML(p.name)}</h2><p class="english-name">${escapeHTML(p.englishName)}</p><div class="detail-flag"><img src="${p.image}" alt="${escapeHTML(p.name)} 국기"></div>${countryMap(p)}<section aria-labelledby="facts-title"><h3 id="facts-title">나라를 알아봐요</h3><dl class="country-facts">${fact('정식 이름',p.officialName,true)}${fact('현지 이름',p.nativeNames.join(' · '),true)}${fact(cityProfile.questionLabel,capitalCity.name,true)}${fact('주요 도시',cityProfile.cities.map(c=>c.name).join(' · '),true)}${cityProfile.note?fact('수도 참고',cityProfile.note,true):''}${fact('언어',languages.join(' · '),true)}${fact('면적',`${p.area.toLocaleString('ko-KR')} km²`)}<div><dt>인구</dt><dd>${p.population?`${p.population.value.toLocaleString('ko-KR')}명<small class="fact-reference">${p.population.year}년 기준</small>`:'자료 없음'}</dd></div>${fact('통화',currencies,true)}${fact('지리적 특징',p.landlocked?'바다와 맞닿지 않은 내륙국':'바다와 맞닿은 나라')}${fact('나라 코드',`${p.isoCode} / ${p.iso3}`)}${fact('국제 전화',p.callingCodes.join(' · '))}${fact('인터넷 도메인',p.domains.join(' · '))}</dl></section><section class="border-countries" aria-labelledby="borders-title"><h3 id="borders-title">국경을 맞댄 이웃 나라</h3>${borders.length?`<div class="border-links">${borders.map(c=>`<button class="border-link" data-country="${c.id}"><img src="${c.image}" alt="" width="28" height="19">${escapeHTML(c.name)}</button>`).join('')}</div>`:'<p class="section-note">도감에 포함된 나라 중 육지 국경을 맞댄 이웃이 없어요.</p>'}</section><section class="country-resources" aria-labelledby="resources-title"><h3 id="resources-title">더 알아보기</h3><div class="resource-links">${externalLink(cityProfile.capitalSource,'수도 자료','수도와 행정 중심지의 근거를 확인해요')}${externalLink('https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/','Natural Earth · 도시 자료','세계 주요 도시를 살펴봐요')}${externalLink('https://www.geonames.org/','GeoNames · 도시 자료','도시와 지명을 찾아봐요')}${externalLink(wiki('ko',p.name),'위키백과 · 한국어','역사와 문화, 지리를 읽어봐요')}${externalLink(wiki('en',p.englishName),'위키백과 · English','영문 자료를 더 찾아봐요')}${p.population?externalLink(`https://data.worldbank.org/indicator/SP.POP.TOTL?locations=${p.isoCode}`,'세계은행 · 인구 통계','인구 변화와 기준 연도를 확인해요'):externalLink('https://data.un.org/','UN Data · 통계 자료','유엔의 통계 자료를 찾아봐요')}</div><p class="data-note">자료 수집: ${escapeHTML(dataCollectedAt)} · 나라 정보: ${externalLink('https://github.com/mledoze/countries','mledoze/countries')} (ODbL) · 인구: ${externalLink('https://data.worldbank.org/indicator/SP.POP.TOTL','세계은행')} (${externalLink('https://creativecommons.org/licenses/by/4.0/','CC BY 4.0')}). 인구는 표시된 연도의 자료이며, 도시 자료 수집: ${escapeHTML(cityCollectedAt)} · 주요 도시: Natural Earth (퍼블릭 도메인), GeoNames (CC BY 4.0). 한글 이름이 없는 도시는 원문으로 표시해요.</p></section><section class="nearby-countries"><h3>같은 대륙의 다른 나라</h3><div class="nearby-grid">${nearby.map(countryCard).join('')}</div></section></div>`;
 dialog.scrollTop=0;
 if(!dialog.open)dialog.showModal();
}
function renderRecords(){
 const [kind,level]=recordTab.split('-'),list=leaderboard(recordTab);
 app.innerHTML=`${backButton()}<section class="intro"><p class="eyebrow">HALL OF EXPLORERS</p><h1>우리들의 랭킹</h1><p>멋진 세계 탐험가들의 기록을 만나 보세요!</p></section><div class="ranking-controls"><div class="ranking-mode-tabs game-tabs">${['time','capital'].map(key=>`<button class="game-tab ${key===kind?'active':''}" data-ranking-mode="${key}" aria-pressed="${key===kind}">${key==='time'?'⏱ 타임어택':'🏛 수도퀴즈'}</button>`).join('')}</div><div class="ranking-difficulties">${Object.entries(difficulties).map(([key,value])=>`<button class="difficulty-choice ${key===level?'active':''}" data-ranking-difficulty="${key}" aria-pressed="${key===level}">${value.label}</button>`).join('')}</div></div>${list.length?`<div class="ranking-scroll"><table class="ranking"><thead><tr><th scope="col">순위</th><th scope="col">탐험가</th><th scope="col">점수</th><th scope="col">정답</th><th scope="col">날짜</th></tr></thead><tbody>${list.map((r,i)=>`<tr class="${r.id===lastSavedId?'new-record':''}"><td>${rankBadge(i+1)}</td><td>${escapeHTML(r.name)}</td><td class="score">${r.score.toLocaleString()}</td><td>${r.correct} / ${r.total}</td><td class="record-date">${rankingDateCell(r)}</td></tr>`).join('')}</tbody></table></div><p class="result-note">${rankingLabel(recordTab)} TOP 20 · 같은 점수라면 최근 기록이 먼저 보여요. 이 브라우저에 저장돼요.</p>`:`<div class="empty"><span class="empty-icon">🏆</span><p>첫 번째 기록의 주인공이 되어 보세요!</p><button class="primary" data-play-record="${recordTab}">도전 시작하기</button></div>`}`;
}
// A new question starts without hover emphasis, even under a stationary cursor.
document.addEventListener('pointermove',e=>{
 if(e.pointerType!=='mouse'||(!e.movementX&&!e.movementY))return;
 e.target.closest('.choices')?.classList.add('hover-ready');
});
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;b.blur();
 if(b.dataset.nav){navigate(b.dataset.nav);return;}
 if(b.dataset.mode){const switchMode=()=>{cleanup();game=null;mode=b.dataset.mode;renderPlay();};if(activeGame())confirmLeave(switchMode);else switchMode();return;}
 if(b.dataset.difficulty){difficulty=b.dataset.difficulty;renderPlay();return;}
 if(b.id==='start-game'){startGame();return;}
 if(b.id==='edit-explorer'){showExplorerProfile();return;}
 if(b.id==='game-help'){showGameHelp();return;}
 if(b.dataset.answer){if(b.dataset.question===game?.question.id)submitAnswer(b.dataset.answer);return;}
 if(b.id==='hint-question'){showQuestionHint();return;}
 if(b.id==='skip-question'){submitAnswer('',true);return;}
 if(b.id==='quit-game'){endGame('quit');return;}
 if(b.id==='enter-ranking'){showRankingEntry();return;}
 if(b.id==='close-ranking'){document.querySelector('#high-score').close();return;}
 if(b.id==='ranking-replay'){saveRankingAndReturnHome();return;}
 if(b.id==='result-replay'){returnToLobby();return;}
 if(b.id==='keep-playing'){leaveAction=null;document.querySelector('#detail').close();return;}
 if(b.id==='leave-game'){const action=leaveAction;leaveAction=null;document.querySelector('#detail').close();if(action)action();return;}
 if(b.dataset.country){showCountry(b.dataset.country);return;}
 if(b.id==='close-detail'){document.querySelector('#detail').close();return;}
 if(b.dataset.recordTab){recordTab=b.dataset.recordTab;renderRecords();return;}
 if(b.dataset.rankingMode){recordTab=b.dataset.rankingMode+'-'+recordTab.split('-')[1];renderRecords();return;}
 if(b.dataset.rankingDifficulty){recordTab=recordTab.split('-')[0]+'-'+b.dataset.rankingDifficulty;renderRecords();return;}
 if(b.dataset.playRecord){[mode,difficulty]=b.dataset.playRecord.split('-');view='play';game=null;render();}
});
document.addEventListener('submit',e=>{
 if(e.target.id==='explorer-entry-form'){e.preventDefault();enterExplorer();return;}
 if(e.target.id==='save-form'){e.preventDefault();saveRecord();}
 if(e.target.id==='explorer-form'){e.preventDefault();const input=document.querySelector('#explorer-name'),name=input.value.normalize('NFKC').trim();if(!name||name.length>12){input.setCustomValidity('이름은 1~12자로 적어 주세요.');input.reportValidity();return;}rememberExplorer(name);document.querySelector('#detail').close();renderPlay();}
});
document.addEventListener('input',e=>{
 if(e.target.id==='search'){search=e.target.value;renderAtlasResults();}
 if(e.target.id==='trainer-name'){e.target.setCustomValidity('');if(game)game.rankingName=e.target.value;}
 if(e.target.id==='explorer-name')e.target.setCustomValidity('');
 if(e.target.id==='entry-explorer-name')e.target.setCustomValidity('');
});
document.addEventListener('focusin',e=>{if(!e.target.matches('input,textarea,select'))e.target.blur?.();});
document.addEventListener('change',e=>{if(e.target.id==='continent-filter'){continentFilter=e.target.value;renderAtlasResults();}if(e.target.id==='sort'){sort=e.target.value;renderAtlasResults();}});
document.addEventListener('keydown',e=>{if(document.querySelector('#detail').open||document.querySelector('#high-score').open||e.target.matches('input,select,textarea')||e.isComposing)return;if(game?.status==='playing'&&!game.locked&&/^[1-4]$/.test(e.key)){e.preventDefault();submitAnswer(game.options[Number(e.key)-1].id);}});
for(const id of ['detail','high-score'])document.querySelector('#'+id).addEventListener('click',e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close();}});
async function init(){
 try{
  const [dataResponse,manifestResponse,cityResponse]=await Promise.all([fetch('countries.json'),fetch('countries-manifest.json'),fetch('capital-cities.json')]);if(!dataResponse.ok||!manifestResponse.ok||!cityResponse.ok)throw Error('data');
  const [data,manifest,cityData]=await Promise.all([dataResponse.json(),manifestResponse.json(),cityResponse.json()]);
  if(!Array.isArray(data)||data.length!==manifest.countryCount||data.length!==195||new Set(data.map(p=>p.id)).size!==195||data.filter(p=>p.familiar).length!==30||!data.every(p=>/^[a-z]{2}$/.test(p.id)&&p.name&&p.image&&continents[p.continent]&&Array.isArray(p.aliases)&&p.aliases.includes(p.name)))throw Error('incomplete');
  // Reject ambiguous alternative names shared by distinct countries.
  const owners=new Map();data.forEach(p=>p.aliases.forEach(name=>{const key=normalize(name);if(!owners.has(key))owners.set(key,new Set());owners.get(key).add(p.id);}));
  data.forEach(p=>p.aliases=p.aliases.filter(name=>owners.get(normalize(name)).size===1));
  if(cityData.countryCount!==195||!data.every(p=>{const profile=cityData.countries?.[p.id];return profile&&Array.isArray(profile.cities)&&profile.cities.some(c=>c.id===profile.capitalId)&&profile.cities.every(c=>c.countryId===p.id&&c.id&&c.name&&c.englishName)&&Array.isArray(profile.excludedIds);}))throw Error('cities');
  countries=data;cityProfiles=cityData.countries;cityCollectedAt=cityData.collectedAt;allCities=Object.values(cityProfiles).flatMap(p=>p.cities);dataCollectedAt=manifest.collectedAt;render();
 }catch{app.innerHTML='<div class="empty"><p>나라 도감을 불러오지 못했어요.</p><button id="retry-load" class="primary">다시 불러오기</button></div>';document.querySelector('#retry-load').onclick=init;}
}
init();
