const GAMES = {
  '6/49': { pick:6, max:49, price:1.00, desc:'Джакпот 1 000 000 €', prizes:{3:5, 4:50, 5:1500, 6:1000000} },
  '6/42': { pick:6, max:42, price:0.80, desc:'Джакпот 200 000 €',   prizes:{3:3, 4:30, 5:800,  6:200000} },
  '5/35': { pick:5, max:35, price:0.60, desc:'Джакпот 75 000 €',    prizes:{2:1, 3:6, 4:120,  5:75000} }
};
const START_BALANCE = 100;
const MAX_TICKETS = 10;

const state = {
  game:'6/49', balance:START_BALANCE, selection:new Set(), tickets:[],
  drawn:[], busy:false, auto:false, finished:false, history:[]
};

const $ = id => document.getElementById(id);
const eur = n => n.toLocaleString('bg-BG',{style:'currency',currency:'EUR'});
const G = () => GAMES[state.game];

function load(){
  try{
    const s = JSON.parse(localStorage.getItem('lotoZabava') || 'null');
    if(s){ state.balance = typeof s.balance==='number' ? s.balance : START_BALANCE; state.history = s.history || []; }
  }catch(e){}
}
function save(){
  try{ localStorage.setItem('lotoZabava', JSON.stringify({balance:state.balance, history:state.history.slice(0,30)})); }catch(e){}
}
function rnd(n){ // 0..n-1, честен генератор
  if(window.crypto && crypto.getRandomValues){
    const a = new Uint32Array(1), lim = Math.floor(0xFFFFFFFF / n) * n;
    do{ crypto.getRandomValues(a); }while(a[0] >= lim);
    return a[0] % n;
  }
  return Math.floor(Math.random()*n);
}
function randomCombo(){
  const pool = Array.from({length:G().max},(_,i)=>i+1), out=[];
  for(let i=0;i<G().pick;i++) out.push(pool.splice(rnd(pool.length),1)[0]);
  return out.sort((a,b)=>a-b);
}
// Зелено = числото е на някой от моите фишове (познато), червено = непознато
function hitClass(n){ return state.tickets.some(t=>t.includes(n)) ? 'c-g' : 'c-r'; }
function toast(msg){
  const t=$('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),2200);
}
const drawStarted = () => state.drawn.length>0 && !state.finished;

/* ---------- RENDER ---------- */
function renderTabs(){
  $('tabs').innerHTML = Object.entries(GAMES).map(([k,g]) =>
    `<button class="tab ${k===state.game?'active':''}" data-g="${k}" ${drawStarted()||state.busy?'disabled':''}>
      <strong>${k}</strong><small>${eur(g.price)} фиш • ${g.desc}</small></button>`).join('');
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>switchGame(b.dataset.g));
}
function renderGrid(){
  const g=G(), locked = drawStarted() || state.busy || state.finished;
  let h='';
  for(let i=1;i<=g.max;i++){
    const sel=state.selection.has(i);
    h+=`<button class="num ${sel?'sel':''}" data-n="${i}" ${locked?'disabled':''}>${i}</button>`;
  }
  $('grid').innerHTML=h;
  $('grid').querySelectorAll('.num').forEach(b=>b.onclick=()=>toggle(+b.dataset.n));
  $('pickTitle').textContent=`Избери ${g.pick} от ${g.max}`;
  $('pickHint').textContent=`Цена на фиш: ${eur(g.price)}. Можеш да пуснеш до ${MAX_TICKETS} фиша в тираж.`;
  $('counter').textContent=`${state.selection.size} / ${g.pick}`;
  $('addBtn').disabled = locked || state.selection.size!==g.pick || state.tickets.length>=MAX_TICKETS;
  $('quickBtn').disabled = $('clearBtn').disabled = locked;
  $('randTicketBtn').disabled = locked || state.tickets.length>=MAX_TICKETS;
}
function renderTickets(){
  const g=G();
  $('ticketCount').textContent = state.tickets.length ? `(${state.tickets.length} × ${eur(g.price)})` : '';
  if(!state.tickets.length){ $('tickets').innerHTML='<div class="empty">Няма фишове. Избери числа и натисни „Добави фиш“.</div>'; return; }
  const canDel = !drawStarted() && !state.finished && !state.busy;
  $('tickets').innerHTML = state.tickets.map((t,i)=>{
    const hits = t.filter(n=>state.drawn.includes(n)).length;
    const prize = state.finished ? (g.prizes[hits]||0) : 0;
    let res='';
    if(state.drawn.length) res = `<span class="res" style="color:${prize?'var(--green)':'var(--muted)'}">${hits} позн.${state.finished?(prize?' • +'+eur(prize):''):''}</span>`;
    return `<div class="ticket ${prize?'win':''}">
      <span class="tn">#${i+1}</span>
      <div class="balls">${t.map(n=>`<span class="mini ${state.drawn.includes(n)?'hit':''}">${n}</span>`).join('')}</div>
      ${res}
      ${canDel?`<button class="del" data-i="${i}" title="Премахни (връща парите)">✕</button>`:''}
    </div>`;
  }).join('');
  $('tickets').querySelectorAll('.del').forEach(b=>b.onclick=()=>removeTicket(+b.dataset.i));
}
function renderDrawn(){
  const g=G(); let h='';
  for(let i=0;i<g.pick;i++){
    const n=state.drawn[i];
    h += n ? `<div class="slot ball ${hitClass(n)}"><span>${n}</span></div>` : `<div class="slot">${i+1}</div>`;
  }
  $('drawnRow').innerHTML=h;
  const done = state.drawn.length>=g.pick;
  $('drawBtn').textContent = state.finished ? '🔄 Нов тираж' : (state.drawn.length? `🎱 Изтегли ${state.drawn.length+1}-во число` : '🎱 Започни тиража');
  $('drawBtn').disabled = state.busy || state.auto || (!state.finished && !state.tickets.length && !state.drawn.length);
  $('autoBtn').textContent = state.auto ? '⏸ Пауза' : '▶ Автоматично';
  $('autoBtn').disabled = state.finished || done || (!state.tickets.length && !state.drawn.length);
}
function renderPrizes(){
  const p=G().prizes, max=G().pick;
  $('prizes').innerHTML = Object.keys(p).sort((a,b)=>b-a).map(k=>
    `<tr class="${+k===max?'jack':''}"><td>${k} от ${max}${+k===max?' 🏆':''}</td><td class="p">${eur(p[k])}</td></tr>`).join('');
}
function renderHistory(){
  if(!state.history.length){ $('history').innerHTML='<div class="empty">Още няма изиграни тиражи.</div>'; return; }
  $('history').innerHTML = state.history.map(h=>{
    const net=h.won-h.cost;
    return `<div class="h-item"><div><b>${h.game}</b> • ${h.date}<div class="nums">${h.drawn.join(', ')}</div></div>
      <div style="text-align:right">${h.tickets} фиша • ${eur(h.cost)}<div class="w ${net>=0?'pos':'neg'}">${net>=0?'+':''}${eur(net)}</div></div></div>`;
  }).join('');
}
function renderBalance(){ $('balance').textContent = eur(state.balance); }
function render(){ renderTabs(); renderGrid(); renderTickets(); renderDrawn(); renderPrizes(); renderHistory(); renderBalance(); }

/* ---------- DRUM ---------- */
function buildDrum(){
  const d=$('drum'); d.innerHTML='';
  const colors=['#ffffff','#00966E','#D62612','#f5b700'];
  for(let i=0;i<16;i++){
    const b=document.createElement('div'); b.className='b';
    const r=()=>(Math.random()*120-60)+'px';
    b.style.cssText=`left:${20+Math.random()*130}px;top:${90+Math.random()*60}px;background:${colors[i%4]};
      --d:${.35+Math.random()*.4}s;--x1:${r()};--y1:${r()};--x2:${r()};--y2:${r()};--x3:${r()};--y3:${r()}`;
    d.appendChild(b);
  }
}

/* ---------- ACTIONS ---------- */
function switchGame(k){
  if(drawStarted()||state.busy) return;
  // върни парите за неизиграни фишове
  if(!state.finished && state.tickets.length){ state.balance += state.tickets.length*G().price; }
  state.game=k; state.selection.clear(); state.tickets=[]; state.drawn=[]; state.finished=false;
  resetCurrent(); $('result').className='result'; save(); render();
}
function toggle(n){
  if(state.selection.has(n)) state.selection.delete(n);
  else if(state.selection.size<G().pick) state.selection.add(n);
  else toast(`Можеш да избереш само ${G().pick} числа`);
  renderGrid();
}
function addTicket(combo){
  const g=G();
  if(state.tickets.length>=MAX_TICKETS) return toast('Максимум '+MAX_TICKETS+' фиша на тираж');
  if(state.balance<g.price) return toast('Нямаш достатъчно виртуални евро. Натисни „Нулирай“.');
  const key=combo.join(',');
  if(state.tickets.some(t=>t.join(',')===key)) return toast('Този фиш вече е добавен');
  state.balance=+(state.balance-g.price).toFixed(2);
  state.tickets.push(combo); save(); render();
}
function removeTicket(i){
  state.tickets.splice(i,1); state.balance=+(state.balance+G().price).toFixed(2); save(); render();
}
function resetCurrent(){ const c=$('current'); c.className='current'; c.innerHTML='<span class="q">?</span>'; }

function newRound(){
  state.drawn=[]; state.finished=false; state.tickets=[]; state.selection.clear();
  resetCurrent(); $('result').className='result'; render();
}
function drawNext(){
  const g=G();
  if(state.finished){ newRound(); return; }
  if(state.busy || state.drawn.length>=g.pick) return;
  if(!state.tickets.length && !state.drawn.length) return toast('Добави поне един фиш');
  state.busy=true; render();
  const drum=$('drum'), cur=$('current');
  drum.classList.add('spin'); cur.className='current'; cur.innerHTML='<span class="q">…</span>';
  const spinTime=Math.max(350, +$('speed').value*0.7);
  setTimeout(()=>{
    const pool=[]; for(let i=1;i<=g.max;i++) if(!state.drawn.includes(i)) pool.push(i);
    const n=pool[rnd(pool.length)];
    state.drawn.push(n);
    drum.classList.remove('spin');
    cur.className='current show ball '+hitClass(n);
    cur.innerHTML=`<div class="inner ${n>9?'small':''}">${n}</div>`;
    state.busy=false;
    if(state.drawn.length>=g.pick) finish();
    render();
    if(state.auto && !state.finished) setTimeout(()=>{ if(state.auto) drawNext(); }, +$('speed').value*0.5);
  }, spinTime);
}
function finish(){
  const g=G(); state.finished=true; state.auto=false;
  let won=0, best=0;
  state.tickets.forEach(t=>{ const h=t.filter(n=>state.drawn.includes(n)).length; best=Math.max(best,h); won+=g.prizes[h]||0; });
  const cost=+(state.tickets.length*g.price).toFixed(2);
  state.balance=+(state.balance+won).toFixed(2);
  const d=new Date();
  state.history.unshift({game:state.game, date:d.toLocaleDateString('bg-BG')+' '+d.toLocaleTimeString('bg-BG',{hour:'2-digit',minute:'2-digit'}),
    drawn:[...state.drawn].sort((a,b)=>a-b), tickets:state.tickets.length, cost, won});
  save();
  const r=$('result');
  if(best===g.pick){ r.innerHTML=`<h3>🏆 ДЖАКПОТ! 🏆</h3><p>Позна всички ${g.pick} числа и спечели ${eur(won)} виртуални евро!</p>`; confetti(160); }
  else if(won>0){ r.innerHTML=`<h3>🎉 Честито!</h3><p>Най-добър фиш: ${best} познати. Печалба: <b>${eur(won)}</b></p>`; confetti(60); }
  else r.innerHTML=`<h3>Без печалба този път</h3><p>Най-добър фиш: ${best} познати. Пробвай пак!</p>`;
  r.className='result show';
}
function confetti(n){
  const cols=['#ffffff','#00966E','#D62612','#f5b700'];
  for(let i=0;i<n;i++){
    const c=document.createElement('div'); c.className='confetti';
    c.style.left=Math.random()*100+'vw'; c.style.background=cols[i%4];
    c.style.animationDuration=(2+Math.random()*2.5)+'s'; c.style.animationDelay=Math.random()*.6+'s';
    if(cols[i%4]==='#ffffff') c.style.boxShadow='0 0 0 1px #ccc';
    document.body.appendChild(c); setTimeout(()=>c.remove(),5500);
  }
}

/* ---------- EVENTS ---------- */
$('quickBtn').onclick=()=>{ state.selection=new Set(randomCombo()); renderGrid(); };
$('clearBtn').onclick=()=>{ state.selection.clear(); renderGrid(); };
$('addBtn').onclick=()=>{ addTicket([...state.selection].sort((a,b)=>a-b)); state.selection.clear(); render(); };
$('randTicketBtn').onclick=()=>addTicket(randomCombo());
$('drawBtn').onclick=drawNext;
$('autoBtn').onclick=()=>{ state.auto=!state.auto; renderDrawn(); if(state.auto && !state.busy) drawNext(); };
$('speed').oninput=()=>$('speedLbl').textContent=(+$('speed').value/1000).toFixed(1)+' с';
$('resetBtn').onclick=()=>{
  if(!confirm('Да върна баланса на '+eur(START_BALANCE)+' и да изчистя историята?')) return;
  state.balance=START_BALANCE; state.history=[]; state.auto=false;
  if(!drawStarted()) { state.tickets=[]; state.drawn=[]; state.finished=false; resetCurrent(); $('result').className='result'; }
  save(); render(); toast('Балансът е върнат на '+eur(START_BALANCE));
};

load(); buildDrum(); $('speed').oninput(); render();