
const DATA_PATHS = {
  cards: "./src/data/cards.json",
  relics: "./src/data/relics.json",
  weapons: "./src/data/weapons.json",
  enemies: "./src/data/enemies.json",
  events: "./src/data/events.json"
};

const G = document.getElementById("game");
let DB = {};
let S = null;
let timer = null;
let currentSpot = null;

const STATUS_INFO = {
  Strength: "Adds damage to attacks.",
  Weak: "Player attacks deal less damage while active.",
  Frail: "Block gained is reduced while active.",
  Blight: "Reduces healing effects.",
  Bleed: "A lingering wound effect used by many cards and enemies.",
  Ward: "Negates the next incoming debuff.",
  Bound: "Restricts your options until removed.",
  Doom: "A lethal omen. Survive before it resolves."
};

const ANIMATION_PROFILE = {
  player: {
    attackMs: 260,
    skillMs: 240,
    hurtMs: 340
  },
  enemy: {
    attackMs: 330,
    castMs: 380,
    hurtMs: 230
  },
  camera: {
    lightShakeMs: 140,
    heavyShakeMs: 200
  }
};

const clone = (x) => JSON.parse(JSON.stringify(x));
const shuffle = (a) => a.sort(() => Math.random() - 0.5);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

async function loadData(){
  const entries = await Promise.all(Object.entries(DATA_PATHS).map(async ([k,p]) => [k, await fetch(p).then(r=>r.json())]));
  DB = Object.fromEntries(entries);
  fresh();
}

function fresh(){
  S = {
    body:null, weapon:null,
    hp:72, maxHp:72, gold:95,
    deck:[], relics:["dull_whetstone"],
    x:70, y:350, zone:0,
    cleared:{}, falseEnding:false, truePilgrimage:false,
    memories:[], kills:0, deaths:0,
    alignment:{silence:0,memory:0,flame:0,root:0},
    combat:null
  };
  title();
}

function title(){
  G.innerHTML = `<div class="title"><div class="panel">
    <h1>ASHFALL</h1>
    <p><b>Echoes of the Hollow — repo overhaul build</b></p>
    <p>Octopath-like atmosphere. Slay-the-Spire-like combat. Light traversal exists for immersion; deck combat and build decisions are the real game.</p>
    <button onclick="chars()">Begin Pilgrimage</button>
    <button onclick="loadSave()">Load</button>
  </div></div>`;
}

function chars(){
  const weaponCards = Object.entries(DB.weapons).filter(([id,w])=>w.unlock==="default" || S.falseEnding).map(([id,w]) => `
    <div class="choice">
      <h3>${w.name}</h3>
      <p>${w.desc}</p>
      <p class="small">${w.passive}</p>
      <button onclick="startRun('${id}','male')">Male</button>
      <button onclick="startRun('${id}','female')">Female</button>
    </div>`).join("");
  G.innerHTML = `<div class="screen">
    <div class="top"><div class="logo">Choose Hollowbound</div><span class="pill">Repo Build</span></div>
    <div style="padding:14px;overflow:auto"><div class="choice-grid">${weaponCards}</div></div>
  </div>`;
}

function startRun(weapon, body){
  S.weapon = weapon;
  S.body = body;
  S.deck = DB.weapons[weapon].starter.slice();
  cutscene("The Dead Shrine", "You wake beneath a cracked shrine. The lantern in your chest burns like it recognizes the road ahead.", drawWorld);
}

function saveGame(){
  localStorage.setItem("ashfall_repo_save", JSON.stringify(S));
  toast("Saved.");
}
function loadSave(){
  const raw = localStorage.getItem("ashfall_repo_save");
  if(!raw) return toast("No save found.");
  S = JSON.parse(raw);
  drawWorld();
}

const parishSpots = [
  {id:"grave",type:"event",kind:"eventSpot",x:150,y:410,label:"Dead Shrine",title:"Dead Shrine",desc:"A memory is buried beneath ash."},
  {id:"hound",type:"combat",kind:"combatSpot",x:315,y:350,label:"Ash Hound",enemy:"ash_hound",title:"Ash Hound",desc:"A fast enemy. Low HP, painful bites."},
  {id:"shop",type:"shop",kind:"shopSpot",x:500,y:430,label:"Marl",title:"Marl's Pack",desc:"Buy cards or remove dead weight."},
  {id:"rats",type:"combat",kind:"combatSpot",x:640,y:370,label:"Bell-Rats",enemy:"bell_rat_swarm",title:"Bell-Rat Swarm",desc:"Small bodies, many teeth."},
  {id:"pilgrim",type:"combat",kind:"combatSpot",x:790,y:325,label:"Pilgrim",enemy:"hollow_pilgrim",title:"Hollow Pilgrim",desc:"A curse-user. Letting the fight drag will poison your deck."},
  {id:"camp",type:"camp",kind:"campSpot",x:930,y:455,label:"Campfire",title:"Campfire",desc:"Rest or refine your deck."},
  {id:"thief",type:"combat",kind:"eliteSpot",x:1085,y:345,label:"Candle Thief",enemy:"candle_thief",title:"Elite: Candle Thief",desc:"A tempo thief. It drains energy and punishes slow hands."},
  {id:"knight",type:"combat",kind:"eliteSpot",x:1225,y:420,label:"Bell Knight",enemy:"bell_knight",title:"Elite: Bell Knight",desc:"Armor, Frail, and delayed punishment."},
  {id:"boss",type:"combat",kind:"bossSpot",x:1400,y:395,label:"Belfry Gate",enemy:"bell_mother",title:"Boss: The Bell Mother",desc:"The parish ends where the bells begin."}
];

const pilgrimageSpots = [
  {id:"well",type:"event",kind:"eventSpot",x:150,y:395,label:"Weeping Well",title:"The Weeping Well",desc:"The water whispers your name, then says it wrong."},
  {id:"pilgrim_hunt",type:"combat",kind:"combatSpot",x:320,y:350,label:"Ash Hound",enemy:"ash_hound",title:"Ash Hound",desc:"The old roads are less forgiving now."},
  {id:"memory_shop",type:"shop",kind:"shopSpot",x:520,y:430,label:"Marl",title:"Marl's Pack",desc:"He remembers your first lie and charges extra for it."},
  {id:"candle_girl",type:"event",kind:"eventSpot",x:690,y:390,label:"Candle Girl",title:"The Candle Girl",desc:"A faceless child offers flame and asks for blood."},
  {id:"knight_echo",type:"combat",kind:"eliteSpot",x:850,y:340,label:"Bell Knight",enemy:"bell_knight",title:"Echo Knight",desc:"An armored memory with no mercy."},
  {id:"rest",type:"camp",kind:"campSpot",x:1040,y:450,label:"Campfire",title:"Campfire",desc:"Rest while the bells stay quiet."},
  {id:"thief_echo",type:"combat",kind:"eliteSpot",x:1220,y:345,label:"Candle Thief",enemy:"candle_thief",title:"Echo Thief",desc:"Still stealing tempo after death."},
  {id:"boss_true",type:"combat",kind:"bossSpot",x:1420,y:390,label:"Bell Mother",enemy:"bell_mother",title:"Boss: The Bell Mother",desc:"This time, the Hollow is awake."}
];

function activeSpots(){
  return S.truePilgrimage ? pilgrimageSpots : parishSpots;
}

function drawWorld(){
  currentSpot = null;
  S.combat = null;
  const spots = activeSpots();
  G.innerHTML = `<div class="screen">
    <div class="top">
      <div><div class="logo">${S.truePilgrimage ? "THE HOLLOW ROAD" : "BELLGRAVE PARISH"}</div><div class="small">Move near a location, then Interact.</div></div>
      <div><span class="pill">HP ${S.hp}/${S.maxHp}</span><span class="pill">${S.gold}g</span></div>
    </div>
    <div class="world">
      <div class="parallax"></div><div class="skyline"></div><div class="ground"></div>
      <div class="zone-label">${S.truePilgrimage ? "The bells remember your first victory." : "The bells toll for the lost."}</div>
      ${spots.map(s=>`<div class="hotspot ${s.kind} ${S.cleared[s.id] && s.type !== "shop" && s.type !== "camp" ? "cleared":""}" id="spot-${s.id}" style="left:${s.x-S.zone}px;top:${s.y}px">${s.label}</div>`).join("")}
      <div class="player" id="player" style="left:${S.x}px;top:${S.y}px">
        <div class="cloak"></div><div class="head"></div><div class="body"></div><div class="lamp"></div><div class="blade"></div>
      </div>
    </div>
    <div id="prompt"></div>
    <div class="controls">
      <div class="actionbar">
        <button onclick="saveGame()">Save</button><button onclick="showDeck()">Deck</button><button onclick="showCodex()">Codex</button><button onclick="quest()">Quest</button><button id="interactBtn" onclick="doInteract()" disabled>Interact</button>
      </div>
      <div class="joy">
        <button class="up" ontouchstart="hold(0,-1)" onmousedown="hold(0,-1)" ontouchend="stop()" onmouseup="stop()">▲</button>
        <button class="left" ontouchstart="hold(-1,0)" onmousedown="hold(-1,0)" ontouchend="stop()" onmouseup="stop()">◀</button>
        <button class="right" ontouchstart="hold(1,0)" onmousedown="hold(1,0)" ontouchend="stop()" onmouseup="stop()">▶</button>
        <button class="down" ontouchstart="hold(0,1)" onmousedown="hold(0,1)" ontouchend="stop()" onmouseup="stop()">▼</button>
      </div>
    </div>
  </div>`;
  checkNear();
}

function hold(dx,dy){
  stop();
  document.getElementById("player")?.classList.add("walk");
  timer = setInterval(()=>move(dx,dy), 35);
}
function stop(){
  if(timer) clearInterval(timer);
  timer = null;
  document.getElementById("player")?.classList.remove("walk");
}
function move(dx,dy){
  const maxZone = Math.max(...activeSpots().map((s)=>s.x)) - 380;
  S.x += dx * 8; S.y += dy * 6;
  if(S.x > innerWidth - 90 && S.zone < maxZone){ S.zone += 12; S.x -= 12; }
  if(S.x < 42 && S.zone > 0){ S.zone -= 12; S.x += 12; }
  S.x = Math.min(Math.max(S.x, 10), innerWidth - 58);
  S.y = Math.min(Math.max(S.y, 92), innerHeight - 220);
  const p = document.getElementById("player");
  if(p){ p.style.left = S.x + "px"; p.style.top = S.y + "px"; }
  activeSpots().forEach(s=>{ const el = document.getElementById("spot-"+s.id); if(el) el.style.left = (s.x-S.zone)+"px"; });
  checkNear();
}
function checkNear(){
  currentSpot = null;
  const p = {x:S.x+22, y:S.y+34};
  for(const s of activeSpots()){
    if(S.cleared[s.id] && s.type !== "shop" && s.type !== "camp") continue;
    const sx = s.x - S.zone + 35, sy = s.y + 22;
    if(Math.abs(p.x-sx)<64 && Math.abs(p.y-sy)<58){ currentSpot=s; break; }
  }
  const box = document.getElementById("prompt"), btn = document.getElementById("interactBtn");
  if(!box || !btn) return;
  if(currentSpot){
    box.innerHTML = `<div class="prompt"><h3>${currentSpot.title}</h3><p>${currentSpot.desc}</p></div>`;
    btn.disabled = false;
  } else {
    box.innerHTML = ""; btn.disabled = true;
  }
}
function doInteract(){
  if(!currentSpot) return;
  const s = currentSpot; stop();
  if(s.type==="combat"){ S.cleared[s.id]=true; return startCombat(s.enemy); }
  if(s.type==="event"){ S.cleared[s.id]=true; return runEvent(s.id); }
  if(s.type==="shop") return shop();
  if(s.type==="camp") return camp();
}
function cutscene(title, body, cb){
  G.innerHTML = `<div class="cutscene"><div class="cutbox"><h2>${title}</h2><p>${body}</p><button id="nxt">Continue</button></div></div>`;
  document.getElementById("nxt").onclick = cb;
}
function toast(msg){
  const d = document.createElement("div");
  d.className = "toast"; d.innerHTML = msg;
  G.appendChild(d);
  setTimeout(()=>d.remove(), 2200);
}

function pulseStage(className, duration){
  const stage = document.getElementById("stage");
  if(!stage) return;
  stage.classList.add(className);
  setTimeout(()=>stage.classList.remove(className), duration);
}

function animateActor(selector, className, duration){
  const el = document.querySelector(selector);
  if(!el) return;
  el.classList.add(className);
  setTimeout(()=>el.classList.remove(className), duration);
}

function animatePlayerAction(card){
  if(!card) return;
  if(card.type === "Attack"){
    animateActor(".player-combat", "attack", ANIMATION_PROFILE.player.attackMs);
    pulseStage("shake-light", ANIMATION_PROFILE.camera.lightShakeMs);
    return;
  }
  animateActor(".player-combat", "cast", ANIMATION_PROFILE.player.skillMs);
}

function animateEnemyIntent(intent){
  if(!intent) return;
  if(intent.type === "attack"){
    animateActor("#enemy", "attack", ANIMATION_PROFILE.enemy.attackMs);
    if((intent.damage || 0) >= 18) pulseStage("shake-heavy", ANIMATION_PROFILE.camera.heavyShakeMs);
    return;
  }
  animateActor("#enemy", "chant", ANIMATION_PROFILE.enemy.castMs);
}
function modal(title, body){
  G.innerHTML += `<div class="modal"><div class="modalbox"><h2>${title}</h2>${body}<button onclick="document.querySelector('.modal').remove()">Close</button></div></div>`;
}
function showDeck(){
  const counts = {};
  S.deck.forEach(id => counts[id]=(counts[id]||0)+1);
  modal("Deck", `<p>${S.deck.length} cards</p>${Object.entries(counts).map(([id,n])=>`<p><b>${DB.cards[id].name}</b> x${n}<br><span class="small">${DB.cards[id].text}</span></p>`).join("")}`);
}
function showCodex(){
  modal("Codex", `<p><b>Relics:</b> ${S.relics.map(id=>DB.relics[id].name).join(", ")}</p><p><b>Kills:</b> ${S.kills}</p><p><b>Deaths:</b> ${S.deaths}</p><p><b>False Ending:</b> ${S.falseEnding ? "Unlocked" : "Not yet"}</p><p><b>Direction:</b> World traversal is flavor. Combat is the real game.</p>`);
}
function quest(){
  toast(S.falseEnding ? "The Hollow remembers. Future branches unlock true endings." : "Reach the Belfry Gate. The first victory is a lie.");
}
function eventGrave(){
  const has = S.memories.length;
  const body = has ? `<p>A grave waits with one of your lost memories: <b>${DB.cards[S.memories[has-1]].name}</b>.</p><button onclick="takeMemory()">Take it back</button> <button onclick="buryMemory()">Bury it for healing</button>` : `<p>A grave waits with your name scratched out. You find 35 gold and a bad feeling.</p><button onclick="S.gold+=35;drawWorld()">Take Gold</button>`;
  G.innerHTML = `<div class="modal"><div class="modalbox"><h2>Grave of Yourself</h2>${body}</div></div>`;
}
function runEvent(eventId){
  if(eventId === "grave") return eventGrave();
  if(eventId === "well"){
    return G.innerHTML = `<div class="modal"><div class="modalbox"><h2>The Weeping Well</h2><p>The water reflects a face you almost remember.</p><button onclick="S.hp=Math.min(S.maxHp,S.hp+18);drawWorld();toast('You drink. +18 HP.')">Drink</button> <button onclick="S.deck.push('lantern_step');drawWorld();toast('You recover a Lantern Step memory.')">Listen</button> <button onclick="drawWorld()">Leave</button></div></div>`;
  }
  if(eventId === "candle_girl"){
    return G.innerHTML = `<div class="modal"><div class="modalbox"><h2>The Candle Girl</h2><p>She tilts the candle toward your chest-lantern and waits.</p><button onclick="S.hp=Math.max(1,S.hp-6);S.deck.push('blood_pact');drawWorld();toast('Paid blood for power.')">Accept Bargain</button> <button onclick="S.gold+=40;drawWorld();toast('You walk away richer, and colder.')">Refuse</button></div></div>`;
  }
  const ev = (DB.events || []).find((e)=>e.id===eventId);
  return cutscene(ev?.title || "Strange Memory", ev?.desc || "The Hollow shifts around you.", drawWorld);
}
function takeMemory(){ S.deck.push(S.memories.pop()); drawWorld(); toast("Memory returned to deck."); }
function buryMemory(){ S.memories.pop(); S.hp=Math.min(S.maxHp,S.hp+20); drawWorld(); toast("You bury the memory. +20 HP."); }
function shop(){
  const opts = ["heavy_cut","blood_pact","hollow_bind","counter_bell","twin_strike","serrated_cut","lantern_step"];
  modal("Marl, Keeper of Things Not Yet Lost", `<p>"Buy now. Regret later. That is the honest order."</p><p>Gold: ${S.gold}</p><div class="reward-grid">${opts.map(id=>`<button onclick="buyCard('${id}',60)"><b>${DB.cards[id].name}</b> — 60g<br><span class="small">${DB.cards[id].text}</span></button>`).join("")}<button onclick="removeBasic()">Remove Strike/Guard — 75g</button></div>`);
}
function buyCard(id,cost){ if(S.gold<cost) return toast("Not enough gold."); S.gold-=cost; S.deck.push(id); document.querySelector(".modal").remove(); shop(); }
function removeBasic(){
  if(S.gold<75) return toast("Not enough gold.");
  const i = S.deck.findIndex(id=>id==="strike"||id==="guard");
  if(i>=0){ S.gold-=75; S.deck.splice(i,1); toast("A basic memory is removed."); document.querySelector(".modal").remove(); shop(); }
  else toast("No Strike/Guard found.");
}
function camp(){
  modal("Campfire", `<p>A small flame survives inside a ring of dead bells.</p><button onclick="S.hp=Math.min(S.maxHp,S.hp+24);document.querySelector('.modal').remove();drawWorld();toast('Rested +24 HP.')">Rest</button><button onclick="upgradeAtCamp()">Refine: remove Strike/Guard</button>`);
}
function upgradeAtCamp(){
  const i = S.deck.findIndex(id=>id==="strike"||id==="guard");
  if(i>=0){ S.deck.splice(i,1); document.querySelector(".modal").remove(); drawWorld(); toast("You refine your deck."); }
  else toast("Nothing basic to refine.");
}

function startCombat(enemyId){
  const e = clone(DB.enemies[enemyId]);
  if(S.truePilgrimage) e.hp = Math.floor(e.hp * 1.3);
  e.maxHp = e.hp; e.turn = 0; e.block = 0; e.status = {};
  const deck = S.deck.slice();
  if(S.relics.includes("hollow_crown")) deck.push(...DB.relics.hollow_crown.curses);
  S.combat = {
    enemy:e, draw:shuffle(deck), hand:[], discard:[], exhaust:[],
    energy:3 + (S.relics.includes("hollow_crown") ? 1 : 0),
    block:S.relics.includes("pilgrims_nail") ? DB.relics.pilgrims_nail.value : 0,
    fortify:0, str:0, weak:0, frail:0, blight:0, bonus:0, bled:false,
    counter:0, turn:1, firstAtk:true, firstSkill:true, skillsPlayed:0, blockMeter:0,
    powers:{}, log:[`${e.name} appears.`], nextTurnDrain:0
  };
  drawCards(5);
  combatUI();
}
function drawCards(n){
  const C = S.combat;
  for(let i=0;i<n;i++){
    if(!C.draw.length){ C.draw = shuffle(C.discard); C.discard = []; }
    if(!C.draw.length) return;
    const id = C.draw.pop();
    C.hand.push(id);
    const card = DB.cards[id];
    if(card.onDrawStatus){
      Object.entries(card.onDrawStatus).forEach(([k,v])=>C[k.toLowerCase()] = (C[k.toLowerCase()]||0)+v);
    }
    if(card.type==="Curse" && S.relics.includes("infant_bell")){
      C.energy += DB.relics.infant_bell.value;
      C.log.push("Infant Bell grants 1 Energy.");
    }
  }
}
function currentIntent(){
  const E = S.combat.enemy;
  return E.intents[E.turn % E.intents.length];
}
function intentText(it){
  if(it.type==="attack") return `${it.icon} ${it.name} · ${it.damage} dmg`;
  if(it.type==="block") return `${it.icon} ${it.name} · ${it.block} block`;
  return `${it.icon || "?"} ${it.name}`;
}
function combatUI(){
  const C = S.combat, E = C.enemy, it = currentIntent();
  const enemyStatuses = Object.entries(E.status || {}).filter(([,v])=>v>0).map(([k,v])=>`${k} ${v}`).join(" · ") || "None";
  const playerStatuses = ["str","weak","frail","blight","ward","fortify"].map((k)=>[k,C[k]||0]).filter(([,v])=>v>0).map(([k,v])=>`${k.toUpperCase()} ${v}`).join(" · ") || "None";
  const hp = Math.max(0, E.hp/E.maxHp*100), php = Math.max(0, S.hp/S.maxHp*100);
  G.innerHTML = `<div class="combat">
    <div class="top"><div><div class="logo">${E.name}</div><div class="small">Turn ${C.turn} · ${intentText(it)}</div></div><div><span class="pill">HP ${S.hp}/${S.maxHp}</span><span class="pill energy">${C.energy}⚡</span></div></div>
    <div class="stage" id="stage">
      <div class="embers"></div>
      <div class="fog"></div>
      <div class="bars"><div class="bar"><div class="fill" style="width:${hp}%"></div></div><div class="bar"><div class="fill" style="width:${php}%"></div></div></div>
      <div class="intent">${intentText(it)}</div>
      <div class="enemy ${E.class || ""}" id="enemy"><div class="core"></div><div class="head"></div><div class="eye"></div><div class="robe"></div><div class="bells"></div><div class="face"></div></div>
      <div class="player player-combat"><div class="cloak"></div><div class="head"></div><div class="body"></div><div class="lamp"></div><div class="blade"></div></div>
    </div>
    <div class="combat-actions"><div>Block ${C.block} · <button onclick="showPile('draw')">Draw ${C.draw.length}</button> · <button onclick="showPile('discard')">Discard ${C.discard.length}</button> · <button onclick="showPile('exhaust')">Exhaust ${C.exhaust.length}</button><div class="small" title="${enemyStatuses}">Enemy: ${enemyStatuses}</div><div class="small" title="${playerStatuses}">You: ${playerStatuses}</div><div class="log">${C.log.slice(-2).join(" / ")}</div></div><button onclick="endTurn()">End Turn</button></div>
    <div class="hand">${C.hand.map((id,i)=>cardHTML(id,i)).join("")}</div>
  </div>`;
}
function showPile(kind){
  const C = S.combat;
  if(!C) return;
  const cards = C[kind] || [];
  const list = cards.length ? cards.map((id)=>`<p><b>${DB.cards[id].name}</b><br><span class="small">${DB.cards[id].text}</span></p>`).join("") : "<p>Empty.</p>";
  modal(`${kind[0].toUpperCase()+kind.slice(1)} Pile`, list);
}
function cardHTML(id,i){
  const ca = DB.cards[id], C = S.combat;
  let cost = ca.cost;
  if(C.firstSkill && ca.type==="Skill" && S.relics.includes("cracked_charm")) cost = 0;
  const dis = ca.unplayable || cost > C.energy;
  return `<div class="card ${dis ? "disabled" : "playable"}" onclick="${dis ? "" : `playCard(${i})`}"><span class="cost">${ca.unplayable ? "–" : cost}</span><h4>${ca.name}</h4><div class="art"></div><div class="type">${ca.type} · ${ca.rarity}</div><div class="txt">${ca.text}</div></div>`;
}
function floatDamage(value){
  const stage = document.getElementById("stage");
  if(!stage) return;
  const f = document.createElement("div");
  f.className = "floatdmg"; f.textContent = value;
  stage.appendChild(f); setTimeout(()=>f.remove(),560);
}
function enemyHitFx(){
  const en = document.getElementById("enemy"), st = document.getElementById("stage");
  if(en) en.classList.add("hit");
  if(st) st.classList.add("shake");
  setTimeout(()=>{
    en?.classList.remove("hit");
    st?.classList.remove("shake");
  }, ANIMATION_PROFILE.enemy.hurtMs);
}
function damageEnemy(amount, hits=1){
  const C = S.combat, E = C.enemy;
  let total=0;
  for(let h=0;h<hits;h++){
    let dmg = amount + C.str;
    if(S.relics.includes("rusted_fang") && hits>1) dmg += DB.relics.rusted_fang.value;
    if(C.bonus){ dmg += C.bonus; C.bonus = 0; }
    if(E.status.Weak>0) dmg = Math.floor(dmg * 1.1);
    const blocked = Math.min(E.block || 0, dmg);
    E.block = (E.block || 0) - blocked;
    dmg -= blocked;
    E.hp -= dmg; total += dmg;
  }
  C.log.push(`Dealt ${total}.`);
  enemyHitFx(); floatDamage(total);
}
function gainBlock(amount){
  const C = S.combat;
  if(C.frail>0) amount = Math.floor(amount*.75);
  C.block += amount;
  C.blockMeter += amount;
  C.log.push(`Gained ${amount} Block.`);
  if(S.relics.includes("bellplate_charm") && C.blockMeter >= DB.relics.bellplate_charm.threshold){
    C.blockMeter -= DB.relics.bellplate_charm.threshold;
    S.combat.enemy.hp -= DB.relics.bellplate_charm.value;
    C.log.push("Bellplate Charm tolls.");
    enemyHitFx(); floatDamage(DB.relics.bellplate_charm.value);
  }
}
function applyEnemyStatus(obj){
  const E = S.combat.enemy;
  Object.entries(obj||{}).forEach(([k,v])=>{ E.status[k]=(E.status[k]||0)+v; S.combat.log.push(`${E.name} gains ${k}.`); });
}
function applyPlayerStatus(obj){
  const C = S.combat;
  Object.entries(obj||{}).forEach(([k,v])=>{
    if(k==="Strength") C.str += v;
    else C[k.toLowerCase()] = (C[k.toLowerCase()]||0)+v;
    C.log.push(`You gain ${k}.`);
  });
}
function playCard(i){
  const C = S.combat, id = C.hand[i], ca = DB.cards[id];
  if(!ca || ca.unplayable) return;
  let cost = ca.cost;
  if(C.firstSkill && ca.type==="Skill" && S.relics.includes("cracked_charm")) cost = 0;
  if(cost > C.energy) return;
  C.energy -= cost; C.hand.splice(i,1);
  C.log.push(`Played ${ca.name}.`);
  animatePlayerAction(ca);

  if(ca.type==="Skill"){
    C.skillsPlayed++;
    if(S.relics.includes("bone_prayer_beads") && C.skillsPlayed % 3 === 0){
      C.energy += DB.relics.bone_prayer_beads.value;
      C.log.push("Bone Prayer Beads grant energy.");
    }
    if(S.weapon==="wax_lantern" && C.firstSkill){ C.ward = (C.ward||0)+1; C.log.push("Wax Lantern grants Ward."); }
    C.firstSkill = false;
  }
  if(ca.type==="Attack"){
    if(S.relics.includes("vein_drinker")) S.hp = Math.min(S.maxHp, S.hp + DB.relics.vein_drinker.value);
  }
  if(ca.selfDamage){
    S.hp -= ca.selfDamage; C.bled = true;
    if(S.weapon==="vein_knife") damageEnemy(2);
  }
  if(ca.gainEnergy) C.energy += ca.gainEnergy;
  if(ca.block) gainBlock(ca.block);
  if(ca.bonusBlockIfCurse && C.hand.some((cardId)=>DB.cards[cardId]?.type === "Curse")) gainBlock(ca.bonusBlockIfCurse);
  if(ca.fortify){ C.fortify += ca.fortify; gainBlock(ca.fortify); }
  if(ca.heal){ const heal = Math.max(0, ca.heal - (C.blight||0)); S.hp = Math.min(S.maxHp, S.hp + heal); }
  if(ca.playerStatus) applyPlayerStatus(ca.playerStatus);
  if(ca.nextAttackBonus) C.bonus += ca.nextAttackBonus;
  if(ca.counter) C.counter += ca.counter;
  if(ca.apply) applyEnemyStatus(ca.apply);
  if(ca.addDiscard) C.discard.push(ca.addDiscard);
  if(ca.addDraw) C.draw.push(...ca.addDraw);
  if(ca.exhaustRandomHand && C.hand.length){
    const idx = Math.floor(Math.random()*C.hand.length);
    const removed = C.hand.splice(idx,1)[0];
    C.exhaust.push(removed);
    if(C.powers.exhaust_damage) damageEnemy(3);
  }
  if(ca.draw) drawCards(ca.draw);
  if(ca.power) C.powers[ca.power] = true;
  if(ca.damage){
    let dmg = ca.damage;
    if(ca.bonusIfSelfDamaged && C.bled) dmg += ca.bonusIfSelfDamaged;
    if(ca.bonusIfLowHp && S.hp < S.maxHp/2) dmg += ca.bonusIfLowHp;
    if(ca.energyIfEnemyStatus && C.enemy.status[ca.energyIfEnemyStatus] > 0){
      C.energy += 1; C.log.push("Status synergy grants energy.");
    }
    if(C.firstAtk){
      if(S.relics.includes("dull_whetstone")) dmg += DB.relics.dull_whetstone.value;
      if(S.weapon==="chipped_blade") dmg += 2;
      C.firstAtk = false;
    }
    damageEnemy(dmg, ca.hits || 1);
  }

  if(ca.exhaust) { C.exhaust.push(id); if(C.powers.exhaust_damage) damageEnemy(3); }
  else if(ca.type !== "Power") C.discard.push(id);

  if(S.hp<=0) return death();
  if(C.enemy.hp<=0) return victory();
  setTimeout(combatUI,130);
}
function endTurn(){
  const C = S.combat, E = C.enemy, it = currentIntent();
  C.hand.forEach(id=>{
    const ca = DB.cards[id];
    if(ca.endTurnDamage){ S.hp -= ca.endTurnDamage; C.log.push(`${ca.name} hurts you for ${ca.endTurnDamage}.`); }
  });
  C.discard.push(...C.hand); C.hand = [];

  if(it.type==="attack"){
    animateEnemyIntent(it);
    let dmg = it.damage + (E.status.Strength||0);
    if(E.status.Weak>0) dmg = Math.floor(dmg*.75);
    const blocked = Math.min(C.block, dmg);
    const taken = dmg - blocked;
    C.block -= blocked; S.hp -= taken;
    if(taken > 0) animateActor(".player-combat", "hurt", ANIMATION_PROFILE.player.hurtMs);
    C.log.push(`${E.name} hits for ${taken}.`);
    if(C.counter){ E.hp -= C.counter; C.log.push(`Counter reflects ${C.counter}.`); }
    if(it.apply) applyPlayerStatus(it.apply);
    if(it.applyPlayer) applyPlayerStatus(it.applyPlayer);
  }
  if(it.type==="buff") applyEnemyStatus(it.status);
  if(it.type==="debuff"){
    animateEnemyIntent(it);
    applyPlayerStatus(it.applyPlayer);
  }
  if(it.type==="block"){ E.block = (E.block||0) + it.block; C.log.push(`${E.name} gains ${it.block} Block.`); }
  if(it.type==="add_card"){
    if(it.to==="discard") C.discard.push(it.card); else C.draw.push(it.card);
    C.log.push(`${DB.cards[it.card].name} enters your ${it.to}.`);
  }
  if(it.type==="drain_energy_next_turn"){
    C.nextTurnDrain = it.amount;
    C.log.push("Your tempo is stolen.");
  }

  if(S.hp<=0) return death();
  if(E.hp<=0) return victory();

  E.turn++;
  C.turn++;
  C.energy = 3 + (S.relics.includes("hollow_crown") ? 1 : 0) - (C.nextTurnDrain||0);
  C.nextTurnDrain = 0;
  C.block = C.fortify || 0;
  C.fortify = 0;
  C.bled = false; C.counter = 0; C.firstAtk = true; C.firstSkill = true;
  ["weak","frail","blight"].forEach(k=>{ if(C[k]>0) C[k]--; });
  Object.keys(E.status).forEach(k=>{ if(E.status[k]>0) E.status[k]--; });
  if(S.relics.includes("mercy_root")) S.hp = Math.min(S.maxHp, S.hp + DB.relics.mercy_root.value);
  drawCards(5);
  combatUI();
}
function victory(){
  const E = S.combat.enemy, boss = E.boss;
  S.kills++; S.gold += E.elite ? 65 : boss ? 100 : 30;
  S.combat = null;
  if(boss){
    if(S.falseEnding){
      return cutscene("True Ending: The Bell That Remembers", "The Bell Mother falls twice. A final bell answers from below the world. The Hollow opens, and your pilgrimage begins for real.", ()=>{
        S.truePilgrimage = false;
        S.hp = S.maxHp;
        S.gold += 250;
        S.deck.push("bone_splitter");
        drawWorld();
        toast("True ending unlocked. New run boon: Bone Splitter.");
      });
    }
    return cutscene("Ending Achieved: The Ash Lie", "The Bell Mother falls. Every bell drops at once. None make a sound. The ash stops. You think the world is saved. Then one tiny bell moves.", ()=>{
      S.falseEnding = true; S.truePilgrimage = true; S.hp = S.maxHp;
      S.deck.push("hollow_bind","lantern_light","blood_pact");
      drawWorld(); toast("True Pilgrimage flag unlocked.");
    });
  }
  const pool = Object.keys(DB.cards).filter(id=>!["Basic","Curse"].includes(DB.cards[id].rarity));
  const picks = shuffle(pool).slice(0,3);
  G.innerHTML = `<div class="modal"><div class="modalbox"><h2>Victory</h2><p>You gain gold. Choose one memory.</p><div class="reward-grid">${picks.map(id=>`<button onclick="takeReward('${id}')"><b>${DB.cards[id].name}</b><br><span class="small">${DB.cards[id].text}</span></button>`).join("")}<button onclick="drawWorld()">Skip Card</button></div></div></div>`;
}
function takeReward(id){ S.deck.push(id); drawWorld(); toast(`${DB.cards[id].name} added.`); }
function death(){
  const mem = pick(S.deck);
  S.memories.push(mem); S.deaths++; S.hp = S.maxHp; S.combat = null;
  cutscene("You Died", `The lantern drops. The Hollow preserves one memory: ${DB.cards[mem].name}.`, drawWorld);
}
window.showPile = showPile;
loadData();
