
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
let pendingVictoryRewards = null;
const CARD_RARITIES = ["common", "uncommon", "rare"];
const REWARD_FLAVOR = [
  "The ash settles. Something useful remains.",
  "A fragment of technique returns to memory.",
  "The hollow leaves behind a choice.",
  "Power always asks to be carried."
];

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
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const animDelay = (ms) => prefersReducedMotion() ? 0 : ms;

function safeCombatUIUpdate(){
  if(S?.combat) combatUI();
}

function cardIdOf(cardOrId){
  if(typeof cardOrId === "string") return cardOrId;
  return cardOrId?.id || null;
}

function createCardInstance(cardId, options = {}){
  return { id: cardId, upgraded: Boolean(options.upgraded) };
}

function normalizeCardInstance(card){
  if(typeof card === "string") return createCardInstance(card);
  if(card && typeof card === "object" && card.id) return createCardInstance(card.id, { upgraded: card.upgraded });
  return null;
}

function normalizeCardPile(pile){
  return (Array.isArray(pile) ? pile : []).map(normalizeCardInstance).filter(Boolean);
}

function normalizeDeckState(){
  S.deck = normalizeCardPile(S.deck);
  if(S.combat){
    ["draw", "hand", "discard", "exhaust"].forEach((pile)=>S.combat[pile] = normalizeCardPile(S.combat[pile]));
  }
}

function getCardDef(cardOrId){
  const cardId = cardIdOf(cardOrId);
  return DB.cards[cardId] || null;
}

function isCardUpgraded(cardInstance){
  return Boolean(cardInstance && typeof cardInstance === "object" && cardInstance.upgraded);
}

function getCardInstanceDef(cardInstance){
  const base = getCardDef(cardInstance);
  if(!base) return null;
  if(!isCardUpgraded(cardInstance) || !base.upgrade) return base;
  return {
    ...base,
    ...base.upgrade,
    name: base.upgradedName || `${base.name}+`,
    text: base.upgradedText || base.text
  };
}

function upgradeCardInstance(cardInstance){
  const normalized = normalizeCardInstance(cardInstance);
  if(!normalized) return null;
  const base = getCardDef(normalized);
  if(!base?.upgrade || normalized.upgraded) return normalized;
  return { ...normalized, upgraded: true };
}

function addCardToDeck(cardId, options = {}){
  const card = createCardInstance(cardId, options);
  S.deck.push(card);
  return card;
}

function removeCardFromDeck(index){
  if(index < 0 || index >= S.deck.length) return null;
  return S.deck.splice(index, 1)[0];
}

function transformCardInDeck(index, newCardId){
  if(index < 0 || index >= S.deck.length) return null;
  const prev = normalizeCardInstance(S.deck[index]);
  const transformed = createCardInstance(newCardId, { upgraded: prev?.upgraded });
  S.deck.splice(index, 1, transformed);
  return transformed;
}

function duplicateCardInDeck(index){
  if(index < 0 || index >= S.deck.length) return null;
  const copy = normalizeCardInstance(S.deck[index]);
  if(!copy) return null;
  S.deck.push({ ...copy });
  return copy;
}

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
    combat:null,
    selectedNodeId:null,
    mapEncounter:null,
    pendingNodeCompletion:null,
    map:null
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
  S.deck = normalizeCardPile(DB.weapons[weapon].starter);
  S.selectedNodeId = null;
  S.mapEncounter = null;
  S.pendingNodeCompletion = null;
  S.map = generateRunMap();
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
  hydrateSave();
  drawWorld();
}

const NODE_TYPES = ["combat","elite","event","rest","shop","treasure"];
const NODE_ICONS = {combat:"⚔", elite:"💀", event:"?", rest:"✦", shop:"⚖", treasure:"◆", boss:"👁"};
const NODE_RISK = {
  combat:"Reward: card choice + echoes.",
  elite:"High risk. Reward: relic + echoes.",
  event:"Uncertain omen. Risk and reward shift with your choice.",
  rest:"Recover or refine at a sanctuary.",
  shop:"Spend echoes on power.",
  treasure:"Reward: relic, gold, or a rare memory.",
  boss:"Act end. The watcher at the gate opens its eye."
};
const NODE_FLAVOR = {
  combat:[
    {title:"Ash Patrol", description:"A hollow patrol bars the ash road."},
    {title:"Broken Spearmen", description:"Jagged ranks gather beneath dead banners."},
    {title:"Lanternless Road", description:"Shapes move where no light should reach."},
    {title:"Bone Toll", description:"The road demands blood for passage."}
  ],
  elite:[
    {title:"The Marked Hunter", description:"A marked hunter waits between ruined stones."},
    {title:"Grave-Knight Remnant", description:"A plated revenant drags a bell-chain."},
    {title:"Bell-Ringer of the Hollow", description:"Each toll sharpens the dark around you."}
  ],
  event:[
    {title:"A Whisper Beneath Stone", description:"An old vow speaks through cracked slate."},
    {title:"The Crooked Shrine", description:"Incense burns with no fire to feed it."},
    {title:"A Door With No Wall", description:"The threshold waits where no room remains."}
  ],
  rest:[
    {title:"Quiet Lantern", description:"A quiet shrine hums beneath dead lanterns."},
    {title:"Ashen Sanctuary", description:"For one breath, the bells seem distant."},
    {title:"The Last Warmth", description:"Heat survives in a circle of soot."}
  ],
  treasure:[
    {title:"Sealed Reliquary", description:"A sealed reliquary pulses beneath old dust."},
    {title:"Buried Offering", description:"Coins and bone charms wait under cinders."},
    {title:"Blackened Casket", description:"A locked casket leaks dim gold light."}
  ],
  shop:[
    {title:"Veiled Merchant", description:"A veiled merchant offers forbidden tools."},
    {title:"Market of Teeth", description:"Price tags are carved into old enamel."},
    {title:"The Debt Keeper", description:"A ledger opens itself to your name."}
  ],
  boss:[
    {title:"The Gate That Watches", description:"The watcher at the gate opens its eye."},
    {title:"Saint of the Hollow Eye", description:"A saint-statue stirs and looks back."},
    {title:"Ashfall Warden", description:"The final bell tolls from inside armor."}
  ]
};

function hydrateSave(){
  S.selectedNodeId = S.selectedNodeId || null;
  S.mapEncounter = S.mapEncounter || null;
  S.pendingNodeCompletion = S.pendingNodeCompletion || null;
  if(!S.map || !Array.isArray(S.map.nodes) || !S.map.nodes.length){
    S.map = generateRunMap();
  }
  S.map.visited = Array.isArray(S.map.visited) ? S.map.visited : [];
  S.map.step = Number.isFinite(S.map.step) ? S.map.step : 0;
  S.map.currentNodeId = S.map.currentNodeId || null;
  S.map.pathHistory = Array.isArray(S.map.pathHistory) ? S.map.pathHistory : [];
  normalizeDeckState();
  pendingVictoryRewards = null;
}

function createNode(id, step, lane, type){
  const flavor = pick(NODE_FLAVOR[type]);
  return {
    id, step, lane, type,
    title: flavor.title,
    description: flavor.description,
    links: [],
    completed: false
  };
}

function weightedNodeType(step, maxSteps){
  const roll = Math.random();
  if(step < 2) return roll < 0.7 ? "combat" : "event";
  if(step === maxSteps - 2) return roll < 0.5 ? "elite" : "rest";
  if(roll < 0.45) return "combat";
  if(roll < 0.58) return "event";
  if(roll < 0.71) return "shop";
  if(roll < 0.86) return "rest";
  if(roll < 0.95) return "treasure";
  return "elite";
}

function generateRunMap(){
  const stepsBeforeBoss = 12 + Math.floor(Math.random() * 3);
  const nodesByStep = [];
  let idCounter = 0;
  for(let step = 0; step < stepsBeforeBoss; step++){
    const count = step === 0 ? 2 : 1 + Math.floor(Math.random() * 4);
    const row = [];
    for(let lane = 0; lane < count; lane++){
      row.push(createNode(`n_${idCounter++}`, step, lane, weightedNodeType(step, stepsBeforeBoss)));
    }
    nodesByStep.push(row);
  }
  const bossStep = stepsBeforeBoss;
  nodesByStep.push([createNode(`n_${idCounter++}`, bossStep, 0, "boss")]);
  const allNodes = nodesByStep.flat();
  for(let step = 0; step < bossStep; step++){
    const current = allNodes.filter((node)=>node.step === step);
    const next = allNodes.filter((node)=>node.step === step + 1);
    current.forEach((node, i)=>{
      const direct = Math.min(next.length - 1, Math.round((i / Math.max(1, current.length - 1)) * (next.length - 1)));
      const neighbors = [direct, direct - 1, direct + 1].filter((n)=>n >= 0 && n < next.length);
      shuffle(neighbors).slice(0, Math.min(2, neighbors.length)).forEach((idx)=>node.links.push(next[idx].id));
      if(!node.links.length && next.length) node.links.push(next[direct].id);
      node.links = [...new Set(node.links)];
    });
  }
  return { nodes:allNodes, currentNodeId:null, visited:[], step:0, pathHistory:[], selectedNodeId:null, act:1 };
}

function nodeById(nodeId){
  return S.map.nodes.find((node)=>node.id === nodeId);
}

function reachableNodeIds(){
  if(!S.map.currentNodeId) return S.map.nodes.filter((n)=>n.step === 0).map((n)=>n.id);
  const current = nodeById(S.map.currentNodeId);
  return current?.links || [];
}

function isNodeReachable(node){
  if(!node || node.completed) return false;
  return reachableNodeIds().includes(node.id);
}

function mapTypeLabel(type){
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function mapRows(){
  const steps = Math.max(...S.map.nodes.map((n)=>n.step));
  const rows = [];
  for(let step=0; step<=steps; step++){
    rows.push(S.map.nodes.filter((n)=>n.step===step).sort((a,b)=>a.lane-b.lane));
  }
  return rows;
}

function nodeClass(node){
  const reachable = isNodeReachable(node);
  const selected = S.selectedNodeId === node.id;
  const visited = S.map.visited.includes(node.id);
  const current = S.map.currentNodeId === node.id;
  return ["map-node", `node-${node.type}`, reachable ? "reachable" : "locked", visited ? "visited" : "", current ? "current" : "", selected ? "selected" : ""].filter(Boolean).join(" ");
}

function drawWorld(){
  S.combat = null;
  hydrateSave();
  const rows = mapRows();
  const selectedNode = nodeById(S.selectedNodeId);
  const selectedReachable = isNodeReachable(selectedNode);
  const pathTaken = S.map.pathHistory.length ? S.map.pathHistory.join(" → ") : "None yet";
  G.innerHTML = `<div class="screen map-screen">
    <div class="top">
      <div><div class="logo">ACT ${S.map.act || 1}: THE HOLLOW ROAD</div><div class="small">Choose connected routes through the ash.</div></div>
      <div><span class="pill">HP ${S.hp}/${S.maxHp}</span><span class="pill">${S.gold}g</span></div>
    </div>
    <div class="map-layout">
      <div class="map-scroll" id="mapScroll">
        <div class="map-grid">
          ${rows.map((row, idx)=>`<div class="map-step-row"><div class="map-step-label">Step ${idx + 1}</div><div class="map-step-nodes">
            ${row.map((node)=>`<button id="map-${node.id}" class="${nodeClass(node)}" onclick="selectMapNode('${node.id}')"><span class="icon">${NODE_ICONS[node.type]}</span><span>${node.title}</span></button>`).join("")}
          </div></div>`).join("")}
        </div>
      </div>
      <div class="map-preview panel">
        ${selectedNode ? `
          <h3>${NODE_ICONS[selectedNode.type]} ${selectedNode.title}</h3>
          <p><b>${mapTypeLabel(selectedNode.type)}</b> · ${selectedNode.description}</p>
          <p class="small">${NODE_RISK[selectedNode.type]}</p>
          ${selectedReachable ? `<button onclick="enterSelectedNode()">Enter</button>` : `<div class="locked-msg">Locked: follow connected routes from your current position.</div>`}
        ` : `<h3>Choose a node</h3><p>Select a reachable route node to preview risk and reward.</p>`}
        <hr>
        <p class="small"><b>Path Taken:</b> ${pathTaken}</p>
      </div>
    </div>
    <div class="controls">
      <div class="actionbar">
        <button onclick="saveGame()">Save</button><button onclick="showDeck()">Deck</button><button onclick="showCodex()">Codex</button><button onclick="quest()">Quest</button>
      </div>
    </div>
  </div>`;
  document.getElementById("mapScroll")?.scrollTo({top:99999, behavior:"smooth"});
}

function selectMapNode(nodeId){
  S.selectedNodeId = nodeId;
  drawWorld();
}

function pickEnemyForNode(type){
  const enemies = Object.entries(DB.enemies);
  const bosses = enemies.filter(([, enemy])=>enemy.boss).map(([id])=>id);
  const elites = enemies.filter(([, enemy])=>enemy.elite).map(([id])=>id);
  const regular = enemies.filter(([, enemy])=>!enemy.elite && !enemy.boss).map(([id])=>id);
  if(type === "boss") return pick(bosses);
  if(type === "elite") return pick(elites.length ? elites : regular);
  return pick(regular.length ? regular : enemies.map(([id])=>id));
}

function enterSelectedNode(){
  const node = nodeById(S.selectedNodeId);
  if(!node || !isNodeReachable(node)) return toast("That route is not reachable yet.");
  S.mapEncounter = { nodeId:node.id, type:node.type };
  if(["combat","elite","boss"].includes(node.type)) return startCombat(pickEnemyForNode(node.type), node.id);
  if(node.type === "event"){
    runEvent(pick(["grave","well","candle_girl"]));
    return completeCurrentNode({ nodeId:node.id, text:"Omen answered." });
  }
  if(node.type === "rest"){
    return showRestSite(node.id);
  }
  if(node.type === "treasure"){
    S.gold += 75;
    const relic = pick(Object.keys(DB.relics));
    if(!S.relics.includes(relic)) S.relics.push(relic);
    toast(`Treasure found: +75g and ${DB.relics[relic].name}.`);
    pendingVictoryRewards = { nodeId:node.id, source:"treasure" };
    return showCardReward("treasure", { summary:`Claimed ${node.title}.`, nodeId:node.id });
  }
  if(node.type === "shop"){
    return mapShop(node.id);
  }
}

function completeCurrentNode(result = {}){
  const nodeId = result.nodeId || S.mapEncounter?.nodeId || S.pendingNodeCompletion;
  const node = nodeById(nodeId);
  if(!node) return;
  node.completed = true;
  S.map.currentNodeId = node.id;
  if(!S.map.visited.includes(node.id)) S.map.visited.push(node.id);
  S.map.step = Math.max(S.map.step, node.step + 1);
  S.map.pathHistory.push(`${node.title} (${mapTypeLabel(node.type)})`);
  S.pendingNodeCompletion = null;
  S.mapEncounter = null;
  if(node.type === "boss"){
    cutscene("Act Cleared", "The gate falls silent. You have survived Act 1.", ()=>{
      S.hp = Math.min(S.maxHp, S.hp + 18);
      drawWorld();
      toast("Act Cleared.");
    });
    return;
  }
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
function cardClassNames(cardInstance){
  const card = getCardInstanceDef(cardInstance);
  if(!card) return "card";
  return ["card", `card-${card.rarity}`, isCardUpgraded(cardInstance) ? "card-upgraded" : ""].filter(Boolean).join(" ");
}
function renderCardSummary(cardInstance){
  const card = getCardInstanceDef(cardInstance);
  if(!card) return "";
  const tags = (card.tags || []).join(", ");
  return `<div class="${cardClassNames(cardInstance)}"><span class="cost">${card.unplayable ? "–" : card.cost}</span><h4>${card.name}</h4><div class="art"></div><div class="type">${card.type} · ${card.rarity}</div><div class="txt">${card.text}${tags ? `<br><span class="small">Keywords: ${tags}</span>` : ""}</div></div>`;
}
function showDeck(){
  const deck = normalizeCardPile(S.deck);
  const grouped = {};
  deck.forEach((card)=>{
    const key = `${card.id}:${isCardUpgraded(card) ? "up" : "base"}`;
    grouped[key] = grouped[key] || { card, count:0 };
    grouped[key].count += 1;
  });
  const rows = Object.values(grouped).map(({ card, count })=>{
    const def = getCardInstanceDef(card);
    return `<div class="deck-row"><div><b>${def?.name || card.id}</b> x${count}</div><div class="small">${def?.type || "Unknown"} · ${def?.rarity || "?"} · Cost ${def?.cost ?? "?"}</div><div class="small">${def?.text || "Missing card definition."}</div></div>`;
  }).join("");
  modal("Deck", `<p>${deck.length} cards</p><div class="deck-list">${rows || "<p>Deck empty.</p>"}</div>`);
}
function showCodex(){
  modal("Codex", `<p><b>Relics:</b> ${S.relics.map(id=>DB.relics[id].name).join(", ")}</p><p><b>Kills:</b> ${S.kills}</p><p><b>Deaths:</b> ${S.deaths}</p><p><b>False Ending:</b> ${S.falseEnding ? "Unlocked" : "Not yet"}</p><p><b>Direction:</b> Route choice is now the spine of each run.</p>`);
}
function quest(){
  toast("Choose your path carefully. Boss waits at the final step.");
}
function restHealAmount(){
  return Math.max(8, Math.floor(S.maxHp * 0.28));
}
function showRestSite(nodeId){
  document.querySelector(".modal")?.remove();
  modal("Quiet Lantern", `<p>Current HP: <b>${S.hp}/${S.maxHp}</b></p><p>Recover body or sharpen one memory.</p>
    <button onclick="restAtSite('${nodeId}')">Rest (+${restHealAmount()} HP)</button>
    <button onclick="showRestUpgradePicker('${nodeId}')">Upgrade Card</button>
    <button onclick="showDeck()">View Deck</button>`);
}
function restAtSite(nodeId){
  S.hp = Math.min(S.maxHp, S.hp + restHealAmount());
  document.querySelector(".modal")?.remove();
  completeCurrentNode({ nodeId, text:"Rested at sanctuary." });
  drawWorld();
}
function showRestUpgradePicker(nodeId){
  document.querySelector(".modal")?.remove();
  const choices = normalizeCardPile(S.deck).map((card, index)=>{
    const base = getCardDef(card);
    const def = getCardInstanceDef(card);
    const canUpgrade = Boolean(base?.upgrade) && !isCardUpgraded(card);
    return `<button ${canUpgrade ? `onclick=\"upgradeDeckCardAtRest(${index}, '${nodeId}')\"` : "disabled"}><b>${def?.name || card.id}</b><br><span class="small">${def?.text || ""}</span><br><span class="small">${canUpgrade ? "Upgradable" : "Already upgraded or no upgrade"}</span></button>`;
  }).join("");
  modal("Refine Memory", `<p>Select one card to upgrade.</p><div class="reward-grid">${choices || "<p>No cards available.</p>"}</div>`);
}
function upgradeDeckCardAtRest(index, nodeId){
  const upgraded = upgradeCardInstance(S.deck[index]);
  S.deck.splice(index, 1, upgraded);
  document.querySelector(".modal")?.remove();
  toast(`${getCardInstanceDef(upgraded)?.name || "Card"} refined.`);
  completeCurrentNode({ nodeId, text:"Refined at sanctuary." });
  drawWorld();
}
function runEvent(eventId){
  if(eventId === "grave"){
    modal("Grave of Yourself", `<p>The ash remembers your name.</p><button onclick="S.gold+=35;document.querySelector('.modal').remove();drawWorld();">Take Gold</button>`);
    return;
  }
  if(eventId === "well"){
    modal("The Weeping Well", `<p>The water reflects a face you almost remember.</p><button onclick="S.hp=Math.min(S.maxHp,S.hp+18);document.querySelector('.modal').remove();drawWorld();toast('You drink. +18 HP.')">Drink</button>`);
    return;
  }
  if(eventId === "candle_girl"){
    modal("The Candle Girl", `<p>A faceless child offers flame and asks for blood.</p><button onclick="S.hp=Math.max(1,S.hp-6);addCardToDeck('blood_pact');document.querySelector('.modal').remove();drawWorld();">Accept Bargain</button>`);
    return;
  }
  const ev = (DB.events || []).find((e)=>e.id===eventId);
  return cutscene(ev?.title || "Strange Memory", ev?.desc || "The Hollow shifts around you.", drawWorld);
}
function shop(){
  return mapShop(S.mapEncounter?.nodeId);
}
function mapShop(nodeId){
  const opts = ["heavy_cut","blood_pact","hollow_bind","counter_bell","twin_strike","serrated_cut","lantern_step"];
  modal("Veiled Merchant", `<p>"Buy now. Regret later."</p><p>Gold: ${S.gold}</p>
    <div class="reward-grid">${opts.map(id=>`<button onclick="buyCard('${id}',60)"><b>${DB.cards[id].name}</b> — 60g</button>`).join("")}</div>
    <button onclick="removeBasic()">Remove Strike/Guard — 75g</button>
    <button onclick="document.querySelector('.modal').remove();completeCurrentNode({nodeId:'${nodeId}',text:'Left the merchant.'});drawWorld();">Leave Shop</button>`);
}
function buyCard(id,cost){ if(S.gold<cost) return toast("Not enough gold."); S.gold-=cost; addCardToDeck(id); document.querySelector(".modal").remove(); mapShop(S.mapEncounter?.nodeId || S.selectedNodeId); }
function removeBasic(){
  if(S.gold<75) return toast("Not enough gold.");
  const i = S.deck.findIndex((card)=>["strike","guard"].includes(cardIdOf(card)));
  if(i>=0){ S.gold-=75; removeCardFromDeck(i); toast("A basic memory is removed."); document.querySelector(".modal").remove(); mapShop(S.mapEncounter?.nodeId || S.selectedNodeId); }
  else toast("No Strike/Guard found.");
}
function camp(){
  showRestSite(S.mapEncounter?.nodeId || S.selectedNodeId);
}
function upgradeAtCamp(){
  const i = S.deck.findIndex((card)=>["strike","guard"].includes(cardIdOf(card)) && !isCardUpgraded(card));
  if(i>=0){ const upgraded = upgradeCardInstance(S.deck[i]); S.deck.splice(i,1, upgraded); document.querySelector(".modal")?.remove(); toast("You refine your deck."); drawWorld(); }
  else toast("Nothing basic to refine.");
}

function startCombat(enemyId, nodeId = null){
  const e = clone(DB.enemies[enemyId]);
  if(!e) throw new Error(`Unknown enemy: ${enemyId}`);
  if(S.truePilgrimage) e.hp = Math.floor(e.hp * 1.3);
  e.maxHp = e.hp; e.turn = 0; e.block = 0; e.status = {};
  S.pendingNodeCompletion = nodeId;
  const deck = S.deck.slice();
  if(S.relics.includes("hollow_crown")) deck.push(...DB.relics.hollow_crown.curses.map((id)=>createCardInstance(id)));
  S.combat = {
    enemy:e, draw:shuffle(deck), hand:[], discard:[], exhaust:[],
    energy:3 + (S.relics.includes("hollow_crown") ? 1 : 0),
    block:S.relics.includes("pilgrims_nail") ? DB.relics.pilgrims_nail.value : 0,
    fortify:0, str:0, weak:0, frail:0, blight:0, bleed:0, bonus:0, bled:false,
    counter:0, turn:1, firstAtk:true, firstSkill:true, skillsPlayed:0, blockMeter:0,
    powers:{}, log:[`${e.name} appears.`], nextTurnDrain:0, locked:false
  };
  drawCards(5);
  combatUI();
}
function drawCards(n){
  const C = S.combat;
  for(let i=0;i<n;i++){
    if(!C.draw.length){ C.draw = shuffle(C.discard); C.discard = []; }
    if(!C.draw.length) return;
    const cardInstance = normalizeCardInstance(C.draw.pop());
    C.hand.push(cardInstance);
    const card = getCardInstanceDef(cardInstance);
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
  if(!it) return "? Unknown";
  const icon = it.icon || "?";
  if(it.type === "attack"){
    const parts = [`${it.damage || 0} damage`];
    if(it.apply) parts.push(...Object.entries(it.apply).map(([k,v]) => `${k} ${v}`));
    if(it.applyPlayer) parts.push(...Object.entries(it.applyPlayer).map(([k,v]) => `${k} ${v}`));
    return `${icon} ${it.name} · ${parts.join(" + ")}`;
  }
  if(it.type === "debuff"){
    const text = Object.entries(it.applyPlayer || {}).map(([k,v]) => `${k} ${v}`).join(", ");
    return `${icon} ${it.name} · ${text || "Debuff"}`;
  }
  if(it.type === "buff"){
    const text = Object.entries(it.status || {}).map(([k,v]) => `${k} ${v}`).join(", ");
    return `${icon} ${it.name} · ${text || "Buff"}`;
  }
  if(it.type === "block") return `${icon} ${it.name} · ${it.block} block`;
  if(it.type === "add_card") return `${icon} ${it.name} · Adds ${DB.cards[it.card]?.name || it.card}`;
  if(it.type === "drain_energy_next_turn") return `${icon} ${it.name} · -${it.amount} energy next turn`;
  return `${icon} ${it.name}`;
}

function statusInfo(key){
  return STATUS_INFO[key] || "Status effect";
}

function statusChips(statusPairs){
  if(!statusPairs.length) return '<div class="status-row empty">No status effects</div>';
  return `<div class="status-row">${statusPairs.map(([k,v]) => `<span class="status-chip" title="${statusInfo(k)}">${k.toUpperCase()} ${v}</span>`).join("")}</div>`;
}
function combatUI(){
  const C = S.combat, E = C.enemy, it = currentIntent();
  const enemyStatuses = Object.entries(E.status || {}).filter(([,v])=>v>0);
  const playerStatuses = [["Strength", C.str||0], ["Weak", C.weak||0], ["Frail", C.frail||0], ["Blight", C.blight||0], ["Bleed", C.bleed||0], ["Ward", C.ward||0], ["Fortify", C.fortify||0]].filter(([,v])=>v>0);
  const hp = Math.max(0, E.hp/E.maxHp*100), php = Math.max(0, S.hp/S.maxHp*100);
  const intentDanger = it?.type === "attack" && (it.damage || 0) >= 15;
  G.innerHTML = `<div class="combat">
    <div class="top"><div><div class="logo">${E.name}</div><div class="small">Turn ${C.turn}</div></div><div><span class="pill">HP ${S.hp}/${S.maxHp}</span><span class="pill energy">${C.energy}⚡</span></div></div>
    <div class="stage" id="stage">
      <div class="embers"></div>
      <div class="fog"></div>
      <div class="bars"><div class="bar"><div class="fill" style="width:${hp}%"></div></div><div class="bar"><div class="fill" style="width:${php}%"></div></div></div>
      <div class="intent ${intentDanger ? "intent-danger" : ""}">${intentText(it)}</div>
      <div class="enemy ${E.class || ""}" id="enemy"><div class="core"></div><div class="head"></div><div class="eye"></div><div class="robe"></div><div class="bells"></div><div class="face"></div></div>
      <div class="player player-combat"><div class="cloak"></div><div class="head"></div><div class="body"></div><div class="lamp"></div><div class="blade"></div></div>
    </div>
    <div class="combat-actions"><div>Block ${C.block} · <button onclick="showPile('draw')">Draw ${C.draw.length}</button> · <button onclick="showPile('discard')">Discard ${C.discard.length}</button> · <button onclick="showPile('exhaust')">Exhaust ${C.exhaust.length}</button> · <button onclick="showDeck()">Deck</button> · <button onclick="showCombatLog()">Combat Log</button>${statusChips(enemyStatuses)}${statusChips(playerStatuses)}<div class="log">${C.log.slice(-3).join(" / ")}</div></div><button onclick="endTurn()" ${C.locked ? "disabled" : ""}>End Turn</button></div>
    <div class="hand">${C.hand.map((card,i)=>cardHTML(card,i)).join("")}</div>
  </div>`;
}
function showPile(kind){
  const C = S.combat;
  if(!C) return;
  const cards = C[kind] || [];
  const list = cards.length ? cards.map((card)=>`<p><b>${getCardInstanceDef(card)?.name || cardIdOf(card)}</b><br><span class="small">${getCardInstanceDef(card)?.text || ""}</span></p>`).join("") : "<p>Empty.</p>";
  modal(`${kind[0].toUpperCase()+kind.slice(1)} Pile`, list);
}
function cardHTML(cardInstance,i){
  const ca = getCardInstanceDef(cardInstance), C = S.combat;
  if(!ca) return "";
  let cost = ca.cost;
  if(C.firstSkill && ca.type==="Skill" && S.relics.includes("cracked_charm")) cost = 0;
  const dis = C.locked || ca.unplayable || cost > C.energy;
  const classes = [cardClassNames(cardInstance), dis ? "disabled" : "playable"].join(" ");
  return `<div class="${classes}" data-index="${i}" onclick="${dis ? "" : `playCard(${i})`}"><span class="cost">${ca.unplayable ? "–" : cost}</span><h4>${ca.name}</h4><div class="art"></div><div class="type">${ca.type} · ${ca.rarity}</div><div class="txt">${ca.text}</div></div>`;
}
function floatFeedback(text, target = "enemy"){
  const stage = document.getElementById("stage");
  if(!stage) return;
  const f = document.createElement("div");
  f.className = `float-feedback target-${target}`;
  f.textContent = text;
  stage.appendChild(f);
  setTimeout(()=>f.remove(), animDelay(560) || 560);
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
  enemyHitFx(); floatFeedback(`-${total}`, "enemy");
}
function gainBlock(amount){
  const C = S.combat;
  if(C.frail>0) amount = Math.floor(amount*.75);
  C.block += amount;
  C.blockMeter += amount;
  C.log.push(`Gained ${amount} Block.`);
  floatFeedback(`+${amount} Block`, "player");
  if(S.relics.includes("bellplate_charm") && C.blockMeter >= DB.relics.bellplate_charm.threshold){
    C.blockMeter -= DB.relics.bellplate_charm.threshold;
    S.combat.enemy.hp -= DB.relics.bellplate_charm.value;
    C.log.push("Bellplate Charm tolls.");
    enemyHitFx(); floatFeedback(`-${DB.relics.bellplate_charm.value}`, "enemy");
  }
}
function applyEnemyStatus(obj){
  const E = S.combat.enemy;
  Object.entries(obj||{}).forEach(([k,v])=>{ E.status[k]=(E.status[k]||0)+v; S.combat.log.push(`${E.name} gains ${k}.`); });
}
function isNegativePlayerStatus(k){
  return ["Weak", "Frail", "Blight", "Bleed", "Bound", "Doom"].includes(k);
}

function applyPlayerStatus(obj, source = "self"){
  const C = S.combat;
  Object.entries(obj||{}).forEach(([k,v])=>{
    if(source === "enemy" && isNegativePlayerStatus(k) && (C.ward || 0) > 0){
      C.ward -= 1;
      C.log.push(`Ward negated ${k}.`);
      floatFeedback("Ward!", "player");
      return;
    }
    if(k==="Strength") C.str += v;
    else C[k.toLowerCase()] = (C[k.toLowerCase()]||0)+v;
    C.log.push(`You gain ${k}.`);
    floatFeedback(`${k} +${v}`, "player");
  });
}
async function playCard(i){
  const C = S.combat, cardInstance = C.hand[i], ca = getCardInstanceDef(cardInstance), id = cardIdOf(cardInstance);
  if(!ca || ca.unplayable || C.locked) return;
  let cost = ca.cost;
  if(C.firstSkill && ca.type==="Skill" && S.relics.includes("cracked_charm")) cost = 0;
  if(cost > C.energy) return;
  C.locked = true;
  C.energy -= cost; C.hand.splice(i,1);
  C.log.push(`Played ${ca.name}.`);
  safeCombatUIUpdate();
  document.querySelector(`.card[data-index="${i}"]`)?.classList.add("activating");
  await sleep(animDelay(80));
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
    floatFeedback(`-${ca.selfDamage}`, "player");
    if(S.weapon==="vein_knife") damageEnemy(2);
  }
  if(ca.gainEnergy) C.energy += ca.gainEnergy;
  if(ca.block) gainBlock(ca.block);
  if(ca.bonusBlockIfCurse && C.hand.some((card)=>getCardInstanceDef(card)?.type === "Curse")) gainBlock(ca.bonusBlockIfCurse);
  if(ca.fortify){ C.fortify += ca.fortify; gainBlock(ca.fortify); }
  if(ca.heal){ const heal = Math.max(0, ca.heal - (C.blight||0)); S.hp = Math.min(S.maxHp, S.hp + heal); floatFeedback(`+${heal} HP`, "player"); }
  if(ca.playerStatus) applyPlayerStatus(ca.playerStatus, "self");
  if(ca.nextAttackBonus) C.bonus += ca.nextAttackBonus;
  if(ca.counter) C.counter += ca.counter;
  if(ca.apply){
    applyEnemyStatus(ca.apply);
    Object.entries(ca.apply).forEach(([k,v])=>floatFeedback(`${k} +${v}`, "enemy"));
  }
  if(ca.addDiscard) C.discard.push(createCardInstance(ca.addDiscard));
  if(ca.addDraw) C.draw.push(...ca.addDraw.map((id)=>createCardInstance(id)));
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

  if(ca.exhaust) { C.exhaust.push(cardInstance); if(C.powers.exhaust_damage) damageEnemy(3); }
  else if(ca.type !== "Power") C.discard.push(cardInstance);

  await sleep(animDelay(220));
  if(S.hp<=0){ C.locked = false; return death(); }
  if(C.enemy.hp<=0){ C.locked = false; return victory(); }
  C.locked = false;
  safeCombatUIUpdate();
}
async function endTurn(){
  const C = S.combat, E = C.enemy, it = currentIntent();
  if(C.locked) return;
  C.locked = true;
  C.hand.forEach((cardInstance)=>{
    const ca = getCardInstanceDef(cardInstance);
    if(ca.endTurnDamage){ S.hp -= ca.endTurnDamage; C.log.push(`${ca.name} hurts you for ${ca.endTurnDamage}.`); }
  });
  C.discard.push(...C.hand); C.hand = [];

  if((E.status.Bleed || 0) > 0){
    const bleedDamage = E.status.Bleed;
    E.hp -= bleedDamage;
    C.log.push(`${E.name} bleeds for ${bleedDamage}.`);
    floatFeedback(`-${bleedDamage}`, "enemy");
    E.status.Bleed = Math.max(0, E.status.Bleed - 1);
  }

  if(E.hp<=0){ C.locked = false; return victory(); }
  await sleep(animDelay(120));

  if(it.type==="attack"){
    animateEnemyIntent(it);
    let dmg = it.damage + (E.status.Strength||0);
    if(E.status.Weak>0) dmg = Math.floor(dmg*.75);
    const blocked = Math.min(C.block, dmg);
    const taken = dmg - blocked;
    C.block -= blocked; S.hp -= taken;
    if(taken > 0){
      animateActor(".player-combat", "hurt", ANIMATION_PROFILE.player.hurtMs);
      floatFeedback(`-${taken}`, "player");
    }
    C.log.push(`${E.name} hits for ${taken}.`);
    if(C.counter){ E.hp -= C.counter; C.log.push(`Counter reflects ${C.counter}.`); }
    if(it.apply) applyPlayerStatus(it.apply, "enemy");
    if(it.applyPlayer) applyPlayerStatus(it.applyPlayer, "enemy");
  }
  if(it.type==="buff") applyEnemyStatus(it.status);
  if(it.type==="debuff"){
    animateEnemyIntent(it);
    applyPlayerStatus(it.applyPlayer, "enemy");
  }
  if(it.type==="block"){ E.block = (E.block||0) + it.block; C.log.push(`${E.name} gains ${it.block} Block.`); floatFeedback(`+${it.block} Block`, "enemy"); }
  if(it.type==="add_card"){
    const generated = createCardInstance(it.card);
    if(it.to==="discard") C.discard.push(generated); else C.draw.push(generated);
    C.log.push(`${DB.cards[it.card].name} enters your ${it.to}.`);
  }
  if(it.type==="drain_energy_next_turn"){
    C.nextTurnDrain = it.amount;
    C.log.push("Your tempo is stolen.");
    floatFeedback(`-${it.amount} Energy`, "center");
  }

  if(S.hp<=0){ C.locked = false; return death(); }
  if(E.hp<=0){ C.locked = false; return victory(); }

  E.turn++;
  C.turn++;
  C.energy = 3 + (S.relics.includes("hollow_crown") ? 1 : 0) - (C.nextTurnDrain||0);
  C.nextTurnDrain = 0;
  C.block = C.fortify || 0;
  C.fortify = 0;
  C.bled = false; C.counter = 0; C.firstAtk = true; C.firstSkill = true;
  ["weak","frail","blight"].forEach(k=>{ if(C[k]>0) C[k]--; });
  Object.keys(E.status).forEach(k=>{
    if(k === "Bleed") return;
    if(E.status[k]>0) E.status[k]--;
  });
  if((C.bleed || 0) > 0){
    const selfBleed = C.bleed;
    S.hp -= selfBleed;
    C.log.push(`You bleed for ${selfBleed}.`);
    floatFeedback(`-${selfBleed}`, "player");
    C.bleed = Math.max(0, C.bleed - 1);
    if(S.hp<=0){ C.locked = false; return death(); }
  }
  if(S.relics.includes("mercy_root")){
    const heal = DB.relics.mercy_root.value;
    S.hp = Math.min(S.maxHp, S.hp + heal);
    floatFeedback(`+${heal} HP`, "player");
  }
  drawCards(5);
  C.locked = false;
  safeCombatUIUpdate();
}
function victory(){
  const E = S.combat.enemy, boss = E.boss;
  const completionNode = S.pendingNodeCompletion;
  S.kills++; S.gold += E.elite ? 65 : boss ? 100 : 30;
  S.combat = null;
  if(completionNode){
    pendingVictoryRewards = { nodeId:completionNode, source: boss ? "boss" : E.elite ? "elite" : "combat" };
    showCardReward(pendingVictoryRewards.source, { nodeId: completionNode, summary: boss ? "Boss defeated." : "Won battle." });
    return;
  }
  drawWorld();
}
function generateCardRewardChoices(source = "combat"){
  const pool = Object.entries(DB.cards).filter(([, card])=>card.type !== "Curse");
  const weightsBySource = {
    combat:{ common:0.7, uncommon:0.25, rare:0.05 },
    elite:{ common:0.45, uncommon:0.4, rare:0.15 },
    boss:{ common:0.2, uncommon:0.45, rare:0.35 },
    treasure:{ common:0.15, uncommon:0.5, rare:0.35 },
    event:{ common:0.4, uncommon:0.4, rare:0.2 }
  };
  const weights = weightsBySource[source] || weightsBySource.combat;
  const byRarity = Object.fromEntries(CARD_RARITIES.map((rarity)=>[rarity, []]));
  pool.forEach(([id, card])=>{ if(byRarity[card.rarity]) byRarity[card.rarity].push(id); });
  const picks = [];
  while(picks.length < 3){
    const roll = Math.random();
    const rarity = roll < weights.common ? "common" : roll < weights.common + weights.uncommon ? "uncommon" : "rare";
    const rarityPool = byRarity[rarity].filter((id)=>!picks.includes(id));
    if(rarityPool.length){
      picks.push(pick(rarityPool));
      continue;
    }
    const backup = pool.map(([id])=>id).filter((id)=>!picks.includes(id));
    if(!backup.length) break;
    picks.push(pick(backup));
  }
  return picks;
}
function showCardReward(source = "combat", options = {}){
  const choices = generateCardRewardChoices(source);
  pendingVictoryRewards = { ...(pendingVictoryRewards || {}), source, nodeId: options.nodeId || pendingVictoryRewards?.nodeId, summary: options.summary || "Won battle." };
  const sourceLabel = source.charAt(0).toUpperCase() + source.slice(1);
  G.innerHTML = `<div class="screen reward-screen"><div class="top"><div><div class="logo">${sourceLabel} Reward</div><div class="small">${pick(REWARD_FLAVOR)}</div></div><div><span class="pill">Deck ${S.deck.length}</span><span class="pill">${S.gold}g</span></div></div>
    <div class="reward-wrap"><p class="small">${pendingVictoryRewards.summary} Choose one memory or pass.</p><div class="reward-grid">${choices.map((id)=>`<button class="reward-choice" onclick="pickRewardCard('${id}')">${renderCardSummary(createCardInstance(id))}</button>`).join("")}</div>
    <div class="reward-actions"><button onclick="showDeck()">View Deck</button><button onclick="skipCardReward()">Skip</button></div></div></div>`;
}
function pickRewardCard(cardId){
  addCardToDeck(cardId);
  toast(`${DB.cards[cardId].name} added.`);
  skipCardReward(false);
}
function skipCardReward(notify = true){
  const nodeId = pendingVictoryRewards?.nodeId;
  const summary = pendingVictoryRewards?.summary || "Won battle.";
  pendingVictoryRewards = null;
  if(notify) toast("You leave the memory behind.");
  completeCurrentNode({ nodeId, text:summary });
  drawWorld();
}
function death(){
  const mem = pick(S.deck);
  const memId = cardIdOf(mem);
  S.memories.push(mem); S.deaths++; S.hp = S.maxHp; S.combat = null;
  S.pendingNodeCompletion = null;
  S.mapEncounter = null;
  cutscene("You Died", `The lantern drops. The Hollow preserves one memory: ${DB.cards[memId].name}.`, drawWorld);
}
function showCombatLog(){
  const C = S.combat;
  if(!C) return;
  const body = C.log.length ? C.log.slice(-40).map((line)=>`<p>${line}</p>`).join("") : "<p>No entries yet.</p>";
  modal("Combat Log", `<div class="combat-log">${body}</div>`);
}
window.showPile = showPile;
window.showCombatLog = showCombatLog;
loadData();
