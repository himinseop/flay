'use strict';
const app=document.querySelector('#app');
const difficulties={easy:{label:'쉬움',multiplier:1},normal:{label:'보통',multiplier:2},hard:{label:'어려움',multiplier:3}};
let countries=[],dataCollectedAt='',view='play',mode='time',difficulty='easy',game=null,ticker=null,advance=null,recordTab='time-easy',search='',continentFilter='',sort='name';
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shuffle=xs=>{const a=[...xs];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const normalize=s=>String(s).normalize('NFKC').toLocaleLowerCase('ko').replace(/[^\p{L}\p{N}]/gu,'');
const RANKING_LIMIT=20;
const rankingModes=['time-easy','time-normal','time-hard','write-easy','write-normal','write-hard'];
let records=[],lastSavedId=null;
function readRecords(){const stored=JSON.parse(localStorage.getItem('flag-play-records')||'[]');return Array.isArray(stored)?stored.filter(r=>r&&typeof r.name==='string'&&Number.isFinite(r.score)&&Number.isFinite(r.correct)&&Number.isFinite(r.total)&&typeof r.date==='string'&&Number.isFinite(Date.parse(r.date))&&rankingModes.includes(r.mode)):[];}
function compareRecords(a,b){return b.score-a.score||b.correct-a.correct||a.date.localeCompare(b.date);}
function leaderboard(key,items=records){return items.filter(r=>r.mode===key).sort(compareRecords).slice(0,RANKING_LIMIT);}
function rankOf(record,items=records){return leaderboard(record.mode,[...items,record]).indexOf(record)+1;}
function rankingLabel(key){const [kind,level]=key.split('-');return `${kind==='time'?'타임어택':'마스터'} · ${difficulties[level].label}`;}
function rankingKey(g){return g.mode+'-'+g.difficulty;}
try{records=readRecords();}catch{}
const activeGame=()=>game&&['loading','playing'].includes(game.status);
let previewCountry=null,previewChoices=null;

function cleanup(){clearInterval(ticker);clearTimeout(advance);ticker=null;advance=null;}
let leaveAction=null;
function confirmLeave(action){const dialog=document.querySelector('#detail');leaveAction=action;dialog.setAttribute('aria-labelledby','leave-title');dialog.innerHTML='<div class="detail-inner"><h2 id="leave-title" style="font-size:22px">진행 중인 게임을 끝낼까요?</h2><p>이동하면 이번 게임의 기록은 저장되지 않아요.</p><div class="result-actions"><button class="secondary" id="keep-playing">계속 플레이</button><button class="primary" id="leave-game">게임 끝내고 이동</button></div></div>';dialog.showModal();}
function navigate(next){if(activeGame()){confirmLeave(()=>{cleanup();game=null;view=next;render();});return;}cleanup();game=null;view=next;render();}
function render(){if(view==='play')renderPlay();else if(view==='atlas')renderAtlas();else renderRecords();}
function renderPlay(){
previewChoices={easy:shuffle(countries.filter(p=>p.familiar))[0],normal:shuffle(countries)[0],hard:shuffle(countries.filter(p=>!p.familiar))[0]};previewCountry=previewChoices[difficulty];
app.innerHTML=`<section class="intro"><div><p class="eyebrow">FLAY · 세계 국기 여행</p><h1>이 국기, 어느 나라일까요?</h1><p>국기를 보고 나라 이름을 맞혀 보세요!</p></div></section>
<div class="play-grid"><section class="game-card" aria-label="나라 퀴즈"><div class="game-tabs"><button class="game-tab ${mode==='time'?'active':''}" data-mode="time">⚡ 타임어택</button><button class="game-tab ${mode==='write'?'active':''}" data-mode="write">✎ 마스터 도전</button></div><div id="game-body" class="game-body"></div></section></div>
<div class="quick-links"><button class="shortcut shortcut-dex" data-nav="atlas"><span class="shortcut-icon" aria-hidden="true">📖</span><span>나라 도감</span></button><button class="shortcut shortcut-ranking" data-nav="records"><span class="shortcut-icon" aria-hidden="true">🏆</span><span>랭킹</span></button></div>`;
renderGameBody();
}
function renderGameBody(){const body=document.querySelector('#game-body');if(!body)return;
if(game?.status==='ended'){renderResult(body);return;}
if(game?.status==='playing'){renderQuestion(body);return;}
if(game?.status==='loading'){body.innerHTML='<div class="quiz-start-loading" role="status" aria-live="polite"><span class="quiz-spinner" aria-hidden="true"></span><p>첫 문제를 불러오는 중이에요…</p></div><div class="loading-actions"><button class="game-control quit-control" id="quit-game"><span aria-hidden="true">■</span>그만하기</button></div>';return;}
body.innerHTML=`<div class="game-setup"><h2>${mode==='time'?'60초 타임어택':'국기 마스터 도전'}</h2>
${mode==='write'?`<div class="difficulty difficulty-cards" aria-label="난이도 선택">${Object.entries(difficulties).map(([key,d])=>`<button data-difficulty="${key}" class="difficulty-choice ${difficulty===key?'active':''}" aria-pressed="${difficulty===key}"><span class="difficulty-preview "><img src="${previewChoices[key].image}" alt="국기 미리보기" width="100" height="100"></span><strong>${d.label}</strong><small>${d.multiplier}배 점수</small></button>`).join('')}</div>`:`<div class="difficulty difficulty-time" aria-label="타임어택 난이도 선택">${Object.entries(difficulties).map(([key,d])=>`<button data-difficulty="${key}" class="difficulty-choice ${difficulty===key?'active':''}" aria-pressed="${difficulty===key}"><strong>${d.label}</strong><small>${key==='easy'?'친숙한 30개 나라':key==='normal'?'세계 195개 나라':'낯선 나라 · 같은 대륙 보기'}</small></button>`).join('')}</div>`}
${mode==='time'?`<div class="flag-stage setup-stage "><img src="${previewCountry.image}" alt="랜덤 국기 미리보기" width="230" height="230"></div>`:''}
<button class="primary setup-start" id="start-game">시작</button><p class="setup-note">${mode==='time'?'60초 동안 최대한 많이 맞추기 · 정답 100점 · 연속 정답 보너스':'10문제 · 시간 제한 없이 도전해요'}</p></div>`;
}
function prepareQuestionImages(g){
 // Keep the exact next questions warm, including the next shuffled deck.
 if(!g.deck.length)g.deck=shuffle(g.pool.filter(p=>p.id!==g.question.id));
 const ahead=g.mode==='write'?Math.min(3,10-g.total-1):3;
 const upcoming=[g.question,...g.deck.slice(-ahead).reverse().slice(0,ahead)];
 const keep=new Set(upcoming.map(p=>p.id));
 for(const id of g.images.keys())if(!keep.has(id))g.images.delete(id);
 upcoming.forEach((p,i)=>prepareQuestionImage(g,p,i===0?'high':'low'));
}
function prepareQuestionImage(g,p,priority){
 const existing=g.images.get(p.id);if(existing){existing.image.fetchPriority=priority;return existing;}
 const image=new Image(190,190),entry={image,ready:false,failed:false};
 image.alt='나라 이름을 맞혀야 하는 국기';image.fetchPriority=priority;
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
 g.question=g.deck.pop();g.locked=false;g.imageReady=false;prepareQuestionImages(g);
 const candidates=g.pool.filter(p=>p.id!==g.question.id),nearby=shuffle(candidates.filter(p=>p.continent===g.question.continent));const distractors=g.difficulty==='hard'?[...nearby,...shuffle(candidates.filter(p=>p.continent!==g.question.continent))].slice(0,3):shuffle(candidates).slice(0,3);g.options=shuffle([g.question,...distractors]);
}
function questionPool(level){return level==='easy'?countries.filter(p=>p.familiar):level==='hard'?countries.filter(p=>!p.familiar):countries;}
function startGame(){cleanup();const pool=questionPool(difficulty);
 game={status:'loading',mode,difficulty,pool,deck:shuffle(pool),images:new Map(),question:null,score:0,correct:0,total:0,streak:0,maxStreak:0,history:[],locked:false,saved:false,deadline:0,imageReady:false,imageFailures:0};
 prepareFirstQuestion(game);
}
function prepareFirstQuestion(g){
 if(game!==g||g.status!=='loading')return;selectQuestion(g);renderGameBody();
 const entry=g.images.get(g.question.id);
 const begin=()=>{if(game!==g||g.status!=='loading')return;g.status='playing';g.deadline=g.mode==='time'?performance.now()+60000:null;renderGameBody();if(g.mode==='time')ticker=setInterval(tick,100);};
 const failed=()=>{if(game!==g||g.status!=='loading')return;g.imageFailures++;if(g.imageFailures>=5){g.imageError=true;endGame('error');}else prepareFirstQuestion(g);};
 if(entry.ready)begin();else entry.loaded.then(ok=>ok?begin():failed());
}
function nextQuestion(){if(!game||game.status!=='playing')return;if(game.mode==='write'&&game.total>=10){endGame();return;}if(game.mode==='time'&&performance.now()>=game.deadline){endGame();return;}
 selectQuestion(game);renderGameBody();}
function timerState(g){const duration=60000;const remaining=Math.max(0,g.deadline-performance.now());return {seconds:Math.ceil(remaining/1000),percent:Math.min(100,remaining/duration*100)};}
function renderQuestion(body){const g=game;const timeState=g.mode==='time'?timerState(g):null;const previousProgress=g.mode==='time'?body.querySelector('.progress'):null;
body.innerHTML=`<div class="game-heading"><div><h2>${g.mode==='time'?'이 국기는 어느 나라일까요?':'나라 이름을 적어 주세요'}</h2><small>${g.mode==='time'?difficulties[g.difficulty].label+' · 네 개의 이름 중 정답을 골라요':difficulties[g.difficulty].label+' · 나라 이름으로 답해요'}</small></div><button class="game-control quit-control" id="quit-game"><span aria-hidden="true">■</span>그만하기</button></div>
<div class="flag-stage "><span class="stage-tag">WORLD FLAG CHALLENGE</span><span id="question-image-slot"></span></div>
<div class="question-score"><div class="game-stats"><span><strong id="score">${g.score.toLocaleString()}</strong> 점</span><span>${g.mode==='time'?`연속 <b id="streak">${g.streak}</b> 정답`:`${g.total+1} / 10 문제`}</span>${timeState?`<span class="time">⏱ <strong id="time">${timeState.seconds}</strong> 초</span>`:''}</div>${timeState?`<div class="progress" role="progressbar" aria-label="남은 시간" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${timeState.percent}"><div id="timer-bar" style="width:${timeState.percent}%"></div></div>`:''}</div>
${g.mode==='time'?`<div class="choices">${g.options.map((p,i)=>`<button class="choice" data-answer="${p.id}" disabled><span>${i+1}</span>${escapeHTML(p.name)}</button>`).join('')}</div>`:`<form class="text-form" id="answer-form"><input id="answer-input" autocomplete="off" maxlength="30" placeholder="나라 이름" aria-label="나라 이름" disabled><button class="primary" type="submit" disabled>확인</button></form>`}
<div id="feedback" class="feedback" role="status" aria-live="polite">국기를 불러오는 중…</div><div class="play-actions">${g.mode==='time'?'<span class="result-note">키보드 1–4로도 선택할 수 있어요</span>':'<button class="game-control skip-control" id="skip-question"><span aria-hidden="true">?</span>모르겠어요</button>'}</div>`;
// Keep the time-attack bar itself alive when replacing the question.
if(previousProgress){body.querySelector('.progress').replaceWith(previousProgress);previousProgress.querySelector('#timer-bar').style.width=timeState.percent+'%';previousProgress.setAttribute('aria-valuenow',timeState.percent);}
const current=g.question.id,entry=g.images.get(current),img=entry.image;
img.id='question-image';body.querySelector('#question-image-slot').replaceWith(img);
const active=()=>game===g&&g.status==='playing'&&g.question.id===current&&!g.locked&&body.querySelector('#question-image')===img;
const ready=()=>{if(!active())return;g.imageReady=true;body.querySelectorAll('.choice,.text-form input,.text-form button').forEach(b=>b.disabled=false);body.querySelector('#feedback').textContent='';if(g.mode==='write')body.querySelector('#answer-input').focus({preventScroll:true});};
const failed=()=>{if(!active())return;g.imageFailures++;if(g.imageFailures>=5){g.imageError=true;endGame();}else nextQuestion();};
if(entry.ready)ready();else entry.loaded.then(ok=>ok?ready():failed());}
function tick(){if(!game||game.status!=='playing'||game.mode!=='time')return;const state=timerState(game);const time=document.querySelector('#time');if(time)time.textContent=state.seconds;const bar=document.querySelector('#timer-bar');if(bar){bar.style.width=state.percent+'%';bar.parentElement.setAttribute('aria-valuenow',state.percent);}if(state.seconds<=0)endGame();}
function submitAnswer(value,skipped=false){const g=game;if(!g||g.status!=='playing'||g.locked||!g.imageReady)return;if(g.mode==='time'&&performance.now()>=g.deadline){endGame();return;}
const correct=!skipped&&(g.mode==='time'?value===g.question.id:g.question.aliases.some(name=>normalize(value)===normalize(name)));const feedback=document.querySelector('#feedback');
// A wrong typed guess leaves the same question open for another try.
if(g.mode==='write'&&!correct&&!skipped){feedback.className='feedback bad';feedback.textContent='다시 도전해 보세요!';const input=document.querySelector('#answer-input');input.focus({preventScroll:true});input.select();return;}
g.locked=true;g.total++;if(correct){g.correct++;g.streak++;g.maxStreak=Math.max(g.maxStreak,g.streak);g.score+=g.mode==='time'?100+Math.min(g.streak-1,10)*10:100*difficulties[g.difficulty].multiplier;}else g.streak=0;
const answerRevealed=g.mode==='time'||correct||skipped;g.history.push({country:g.question,correct,answer:String(value),answerRevealed});feedback.className='feedback '+(correct?'good':'bad');feedback.textContent=g.mode==='write'?(correct?'정답이에요! 잘 알고 있네요!':`정답은 ${g.question.name}! 다음 문제에 도전해 보세요!`):(correct?`정답! ${g.question.name}, 잘 알고 있네요!`:`괜찮아요! 정답은 ${g.question.name}`);
if(answerRevealed)document.querySelector('.flag-stage')?.classList.add('reveal');document.querySelectorAll('[data-answer]').forEach(b=>{b.disabled=true;if(b.dataset.answer===g.question.id)b.classList.add('correct');else if(b.dataset.answer===value)b.classList.add('wrong');});document.querySelectorAll('.text-form input,.text-form button,#skip-question').forEach(b=>b.disabled=true);document.querySelector('#score').textContent=g.score.toLocaleString();const streak=document.querySelector('#streak');if(streak)streak.textContent=g.streak;
advance=setTimeout(nextQuestion,correct?550:1300);}
function endGame(reason='complete'){
 if(!game||game.status==='ended')return;
 cleanup();game.status='ended';game.completed=reason==='complete';
 game.record={id:typeof crypto.randomUUID==='function'?crypto.randomUUID():`${Date.now()}-${Math.random()}`,score:game.score,correct:game.correct,total:game.total,mode:rankingKey(game),date:new Date().toISOString()};
 try{records=readRecords();}catch{}
 game.rank=game.completed&&!game.imageError&&game.score>0?rankOf(game.record):0;
 // Replace an open details/navigation panel with the end-of-game registration.
 leaveAction=null;document.querySelector('#detail').close();
 renderGameBody();if(game.rank)showRankingEntry();
}
function resultRanking(g){
 if(g.imageError)return '<p class="result-note">국기를 불러오지 못했어요. 다시 도전해 주세요.</p>';
 if(!g.completed)return '<p class="result-note">끝까지 플레이하면 랭킹에 도전할 수 있어요.</p>';
 if(g.saved)return `<div class="rank-banner saved"><span>🏆</span><div><strong>랭킹 ${g.savedRank}위에 이름을 남겼어요!</strong><p>${escapeHTML(g.record.name)} · ${rankingLabel(g.record.mode)}</p></div></div>`;
 if(g.rank)return `<div class="rank-banner"><span>🏆</span><div><strong>축하해요! 랭킹 ${g.rank}위!</strong><p>${rankingLabel(g.record.mode)} TOP ${RANKING_LIMIT}에 이름을 남겨 보세요.</p></div><button class="secondary" id="enter-ranking">이름 남기기</button></div>`;
 const cutoff=leaderboard(g.record.mode).at(-1);
 return `<p class="result-note">${g.score===0?'다음에는 정답을 맞히고 랭킹에 도전해 보세요!':`이번에는 TOP ${RANKING_LIMIT}에 조금 못 미쳤어요. ${cutoff?`현재 ${RANKING_LIMIT}위는 ${cutoff.score.toLocaleString()}점이에요.`:''}`}</p>`;
}
function renderResult(body){const g=game;const mistakes=g.history.filter(x=>!x.correct&&(g.mode==='time'||x.answerRevealed));body.innerHTML=`<div class="result"><div class="result-icon">${g.imageError?'☁️':g.correct>0?'🏆':'🌱'}</div><h2>${g.imageError?'국기를 불러오지 못했어요':g.correct>=8?'멋진 세계 탐험가!':'즐거운 도전이었어요!'}</h2><div class="big-score">${g.score.toLocaleString()}<small>점</small></div><p class="summary">${g.mode==='time'?'60초 타임어택 · '+difficulties[g.difficulty].label:difficulties[g.difficulty].label+' 마스터 도전'} · ${g.total}문제 중 ${g.correct}개 정답 · 최고 ${g.maxStreak}연속</p>${resultRanking(g)}
${mistakes.length?`<div class="review-list"><strong style="font-size:13px">다음에는 기억할 수 있어요!</strong>${mistakes.map(m=>`<div class="review-row"><img src="${m.country.image}" alt="" width="38" height="38"><strong>${escapeHTML(m.country.name)}</strong><span>다시 만나기</span><button data-country="${m.country.id}">도감 보기</button></div>`).join('')}</div>`:''}<div class="result-actions"><button class="primary" id="start-game">다시 도전!</button><button class="secondary" data-nav="records">랭킹 보기</button></div></div>`;}
function showRankingEntry(){
 if(!game||game.status!=='ended'||!game.rank)return;
 const g=game,dialog=document.querySelector('#high-score');
 const list=g.saved?leaderboard(g.record.mode):leaderboard(g.record.mode,[...records,g.record]);
 const rank=g.saved?g.savedRank:g.rank;
 dialog.innerHTML=`<div class="arcade-entry leaderboard-entry"><button class="close" id="close-ranking" aria-label="랭킹 닫기">×</button><h2 id="high-score-title">${g.saved?'우리들의 랭킹':'랭킹에 이름을 남겨요!'}</h2><div class="entry-summary"><span>${rankingLabel(g.record.mode)} · TOP ${RANKING_LIMIT}</span><strong>내 순위 ${rank}위 <span>· ${g.score.toLocaleString()}점</span></strong></div><form id="save-form"></form><div class="entry-list"><table class="entry-ranking"><thead><tr><th scope="col">순위</th><th scope="col">탐험가</th><th scope="col">점수</th></tr></thead><tbody>${list.map((r,i)=>{const me=r.id===g.record.id;return `<tr class="${me?'my-entry':''}" ${me?'aria-label="내 기록"':''}><td>${i+1}${me?'<span class="my-tag">나</span>':''}</td><td>${me&&!g.saved?'<div class="entry-input"><input id="trainer-name" form="save-form" aria-label="탐험가 이름" placeholder="탐험가 이름" maxlength="12" autocomplete="off"><button type="submit" form="save-form" class="save-name" aria-label="탐험가 이름 저장" title="저장">✓</button></div>':escapeHTML(r.name)}</td><td class="entry-points">${r.score.toLocaleString()}</td></tr>`;}).join('')}</tbody></table></div><p id="save-message" class="result-note" role="status">${g.saved?'이름을 저장했어요.':''}</p>${g.saved?'<button class="primary" id="ranking-replay">다시 도전!</button>':''}</div>`;
 if(!dialog.open)dialog.showModal();
 const input=dialog.querySelector('#trainer-name');if(input)input.focus({preventScroll:true});
 const ownRow=dialog.querySelector('.my-entry');if(ownRow)ownRow.scrollIntoView({block:'nearest'});
}
function saveRecord(){
 if(!game||game.status!=='ended'||game.saved||!game.rank)return;
 const input=document.querySelector('#trainer-name');if(!input)return;
 const name=input.value.trim()||shuffle(countries.filter(p=>p.name.length<=12))[0].name;if(name.length>12){input.setCustomValidity('이름은 12자까지 적어 주세요.');input.reportValidity();return;}input.setCustomValidity('');input.value=name;
 const record={...game.record,name};
 try{
  // Recheck the current board, including scores saved in another tab.
  const latest=readRecords();const rank=rankOf(record,latest);
  if(!rank){records=latest;game.rank=0;document.querySelector('#high-score').close();renderGameBody();return;}
  const updated=rankingModes.flatMap(key=>leaderboard(key,[...latest,record]));
  localStorage.setItem('flag-play-records',JSON.stringify(updated));records=updated;game.record=record;game.saved=true;game.savedRank=rank;lastSavedId=record.id;recordTab=record.mode;
  renderGameBody();showRankingEntry();
 }catch{document.querySelector('#save-message').textContent='랭킹을 저장하지 못했어요. 브라우저의 저장 설정을 확인한 뒤 다시 눌러 주세요.';}
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
 const fact=(title,value,wide=false)=>`<div${wide?' class="fact-wide"':''}><dt>${title}</dt><dd>${escapeHTML(value||'정보 없음')}</dd></div>`;
 const wiki=(language,name)=>`https://${language}.wikipedia.org/wiki/${language==='ko'?'특수:검색':'Special:Search'}?search=${encodeURIComponent(name)}&go=Go`;
 dialog.innerHTML=`<div class="detail-inner country-detail"><button class="close" id="close-detail" aria-label="나라 도감 닫기">×</button><p class="eyebrow">${escapeHTML(p.continent)} · ${p.isoCode}</p><h2 id="detail-title">${escapeHTML(p.name)}</h2><p class="english-name">${escapeHTML(p.englishName)}</p><div class="detail-flag"><img src="${p.image}" alt="${escapeHTML(p.name)} 국기"></div>${countryMap(p)}<section aria-labelledby="facts-title"><h3 id="facts-title">나라를 알아봐요</h3><dl class="country-facts">${fact('정식 이름',p.officialName,true)}${fact('현지 이름',p.nativeNames.join(' · '),true)}${fact('수도·행정 중심지',p.capital.join(' · '),true)}${fact('언어',languages.join(' · '),true)}${fact('면적',`${p.area.toLocaleString('ko-KR')} km²`)}<div><dt>인구</dt><dd>${p.population?`${p.population.value.toLocaleString('ko-KR')}명<small class="fact-reference">${p.population.year}년 기준</small>`:'자료 없음'}</dd></div>${fact('통화',currencies,true)}${fact('지리적 특징',p.landlocked?'바다와 맞닿지 않은 내륙국':'바다와 맞닿은 나라')}${fact('나라 코드',`${p.isoCode} / ${p.iso3}`)}${fact('국제 전화',p.callingCodes.join(' · '))}${fact('인터넷 도메인',p.domains.join(' · '))}</dl></section><section class="border-countries" aria-labelledby="borders-title"><h3 id="borders-title">국경을 맞댄 이웃 나라</h3>${borders.length?`<div class="border-links">${borders.map(c=>`<button class="border-link" data-country="${c.id}"><img src="${c.image}" alt="" width="28" height="19">${escapeHTML(c.name)}</button>`).join('')}</div>`:'<p class="section-note">도감에 포함된 나라 중 육지 국경을 맞댄 이웃이 없어요.</p>'}</section><section class="country-resources" aria-labelledby="resources-title"><h3 id="resources-title">더 알아보기</h3><div class="resource-links">${externalLink(wiki('ko',p.name),'위키백과 · 한국어','역사와 문화, 지리를 읽어봐요')}${externalLink(wiki('en',p.englishName),'위키백과 · English','영문 자료를 더 찾아봐요')}${p.population?externalLink(`https://data.worldbank.org/indicator/SP.POP.TOTL?locations=${p.isoCode}`,'세계은행 · 인구 통계','인구 변화와 기준 연도를 확인해요'):externalLink('https://data.un.org/','UN Data · 통계 자료','유엔의 통계 자료를 찾아봐요')}</div><p class="data-note">자료 수집: ${escapeHTML(dataCollectedAt)} · 나라 정보: ${externalLink('https://github.com/mledoze/countries','mledoze/countries')} (ODbL) · 인구: ${externalLink('https://data.worldbank.org/indicator/SP.POP.TOTL','세계은행')} (${externalLink('https://creativecommons.org/licenses/by/4.0/','CC BY 4.0')}). 인구는 표시된 연도의 자료이며, 수도·언어의 원문과 현지 이름은 원본 표기를 사용해요.</p></section><section class="nearby-countries"><h3>같은 대륙의 다른 나라</h3><div class="nearby-grid">${nearby.map(countryCard).join('')}</div></section></div>`;
 dialog.scrollTop=0;
 if(!dialog.open)dialog.showModal();
}
function renderRecords(){
 const list=leaderboard(recordTab);
 app.innerHTML=`${backButton()}<section class="intro"><div><p class="eyebrow">HALL OF EXPLORERS</p><h1>우리들의 랭킹</h1><p>멋진 세계 탐험가들의 기록을 만나 보세요!</p></div></section><div class="records-tabs">${rankingModes.map(key=>`<button data-record-tab="${key}" class="${key===recordTab?'active':''}" aria-pressed="${key===recordTab}">${rankingLabel(key)}</button>`).join('')}</div>${list.length?`<div class="ranking-scroll"><table class="ranking"><thead><tr><th scope="col">순위</th><th scope="col">탐험가</th><th scope="col">점수</th><th scope="col">정답</th><th scope="col">날짜</th></tr></thead><tbody>${list.map((r,i)=>`<tr class="${r.id===lastSavedId?'new-record':''}"><td>${i<3?['🥇','🥈','🥉'][i]:i+1}</td><td>${escapeHTML(r.name)}</td><td class="score">${r.score.toLocaleString()}</td><td>${r.correct} / ${r.total}</td><td>${new Date(r.date).toLocaleDateString('ko-KR')}</td></tr>`).join('')}</tbody></table></div><p class="result-note">모드와 난이도별 TOP 20 · 이 브라우저에 기록이 저장돼요.</p>`:`<div class="empty"><span class="empty-icon">🏆</span><p>첫 번째 기록의 주인공이 되어 보세요!</p><button class="primary" data-play-record="${recordTab}">도전 시작하기</button></div>`}`;
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.nav){navigate(b.dataset.nav);return;}
 if(b.dataset.mode){const switchMode=()=>{cleanup();game=null;mode=b.dataset.mode;renderPlay();};if(activeGame())confirmLeave(switchMode);else switchMode();return;}
 if(b.dataset.difficulty){difficulty=b.dataset.difficulty;renderPlay();return;}
 if(b.id==='start-game'){startGame();return;}
 if(b.dataset.answer){submitAnswer(b.dataset.answer);return;}
 if(b.id==='skip-question'){submitAnswer('',true);return;}
 if(b.id==='quit-game'){endGame('quit');return;}
 if(b.id==='enter-ranking'){showRankingEntry();return;}
 if(b.id==='close-ranking'){document.querySelector('#high-score').close();return;}
 if(b.id==='ranking-replay'){document.querySelector('#high-score').close();startGame();return;}
 if(b.id==='keep-playing'){leaveAction=null;document.querySelector('#detail').close();return;}
 if(b.id==='leave-game'){const action=leaveAction;leaveAction=null;document.querySelector('#detail').close();if(action)action();return;}
 if(b.dataset.country){showCountry(b.dataset.country);return;}
 if(b.id==='close-detail'){document.querySelector('#detail').close();return;}
 if(b.dataset.recordTab){recordTab=b.dataset.recordTab;renderRecords();return;}
 if(b.dataset.playRecord){[mode,difficulty]=b.dataset.playRecord.split('-');view='play';game=null;render();}
});
document.addEventListener('submit',e=>{if(e.target.id==='answer-form'){e.preventDefault();const value=document.querySelector('#answer-input').value.trim();if(value)submitAnswer(value);}if(e.target.id==='save-form'){e.preventDefault();saveRecord();}});
document.addEventListener('input',e=>{if(e.target.id==='search'){search=e.target.value;renderAtlasResults();}if(e.target.id==='trainer-name')e.target.setCustomValidity('');});
document.addEventListener('change',e=>{if(e.target.id==='continent-filter'){continentFilter=e.target.value;renderAtlasResults();}if(e.target.id==='sort'){sort=e.target.value;renderAtlasResults();}});
document.addEventListener('keydown',e=>{if(document.querySelector('#detail').open||document.querySelector('#high-score').open||e.target.matches('input,select,textarea')||e.isComposing)return;if(game?.status==='playing'&&game.mode==='time'&&!game.locked&&/^[1-4]$/.test(e.key)){e.preventDefault();submitAnswer(game.options[Number(e.key)-1].id);}});
for(const id of ['detail','high-score'])document.querySelector('#'+id).addEventListener('click',e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close();}});
async function init(){
 try{
  const [dataResponse,manifestResponse]=await Promise.all([fetch('countries.json'),fetch('countries-manifest.json')]);if(!dataResponse.ok||!manifestResponse.ok)throw Error('data');
  const [data,manifest]=await Promise.all([dataResponse.json(),manifestResponse.json()]);
  if(!Array.isArray(data)||data.length!==manifest.countryCount||data.length!==195||new Set(data.map(p=>p.id)).size!==195||data.filter(p=>p.familiar).length!==30||!data.every(p=>/^[a-z]{2}$/.test(p.id)&&p.name&&p.image&&continents[p.continent]&&Array.isArray(p.aliases)&&p.aliases.includes(p.name)))throw Error('incomplete');
  // Reject ambiguous alternative names shared by distinct countries.
  const owners=new Map();data.forEach(p=>p.aliases.forEach(name=>{const key=normalize(name);if(!owners.has(key))owners.set(key,new Set());owners.get(key).add(p.id);}));
  data.forEach(p=>p.aliases=p.aliases.filter(name=>owners.get(normalize(name)).size===1));
  countries=data;dataCollectedAt=manifest.collectedAt;render();
 }catch{app.innerHTML='<div class="empty"><p>나라 도감을 불러오지 못했어요.</p><button id="retry-load" class="primary">다시 불러오기</button></div>';document.querySelector('#retry-load').onclick=init;}
}
init();
