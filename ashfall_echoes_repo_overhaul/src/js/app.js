
const DATA_PATHS = {
  cards: "./src/data/cards.json",
  relics: "./src/data/relics.json",
  weapons: "./src/data/weapons.json",
  enemies: "./src/data/enemies.json",
  events: "./src/data/events.json",
  loadouts: "./src/data/loadouts.json"
};

const G = document.getElementById("game");
let DB = {};
let S = null;
let pendingVictoryRewards = null;
const CARD_RARITIES = ["common", "uncommon", "rare"];
const BUILD_ARCHETYPES = ["bleed", "block", "curse", "tempo", "burn", "ward", "strength", "control"];
const RELIC_HOOKS = new Set([
  "combatStart","turnStart","turnEnd","cardPlayed","attackPlayed","skillPlayed","statusApplied","bleedApplied","burnApplied",
  "blockGained","debuffBlocked","damageDealt","damageTaken","lethalDamage","cardAddedDuringCombat","enemyKilled","combatEnd",
  "modifyCardCost","modifyAttackDamage","modifyEnemyIntentDamage","modifyWeakApplication"
]);
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
  Burn: "Burn deals damage at end of your turn, then decreases by 1.",
  Ward: "Negates the next incoming debuff.",
  Bound: "Restricts your options until removed.",
  Doom: "A lethal omen. Survive before it resolves."
};

const SAVE_VERSION = 3;
const SETTINGS_KEY = "ashfall_settings";
const RUN_SAVE_KEY = "ashfall_run_save";
const RUN_BACKUP_KEY = "ashfall_run_save_backup";
const RUN_LAST_GOOD_KEY = "ashfall_run_last_good";
const META_PROFILE_KEY = "ashfall_meta_profile";
const META_VERSION = 1;
const MAX_RUN_HISTORY = 20;
const MAX_HOLLOW_DEPTH = 5;
const SETTINGS_DEFAULTS = {
  reducedMotion: false,
  textSize: "normal",
  highContrast: false,
  autoSave: true,
  combatSpeed: "normal",
  sfxEnabled: true,
  sfxVolume: 0.65,
  screenShake: true,
  animationIntensity: "normal"
};
const KEYWORD_INFO = {
  Bleed: "Takes damage at end of turn, then decreases by 1.",
  Burn: "Fire damage over time that decays each turn.",
  Ward: "Negates the next incoming debuff.",
  Weak: "Reduces outgoing attack damage.",
  Frail: "Reduces block gained.",
  Strength: "Increases attack damage.",
  Block: "Prevents incoming damage.",
  Dissonance: "A harmful memory card that clogs your deck.",
  Echoes: "Currency used for shops and rewards.",
  Energy: "Resource spent to play cards."
};
let currentScreen = "title";
let lastSavedAt = null;
let M = null;

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
const JUICE_QUEUE = Promise.resolve();
const SFX_NAMES = ["card_play","attack_light","attack_heavy","block","heal","status","ward","burn_tick","bleed_tick","enemy_attack","enemy_death","boss_phase","reward_card","reward_relic","buy","error","button","map_node","rest","event_choice"];
const sfxState = { cache:new Map(), recent:new Map(), manifest:null };

function getSettings(){
  return S?.settings || loadSettings();
}

function isReducedMotion(){
  return Boolean(getSettings().reducedMotion) || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const animDelay = (ms) => isReducedMotion() ? 0 : Math.max(0, ms);

function animationScale(){
  const intensity = getSettings().animationIntensity || "normal";
  if(intensity === "low") return 0.75;
  if(intensity === "high") return 1.2;
  return 1;
}

function scaledDelay(ms){
  return Math.round(animDelay(ms) * animationScale());
}

function setSfxEnabled(enabled){
  toggleSetting("sfxEnabled", Boolean(enabled));
}

function setSfxVolume(value){
  const clamped = Math.min(1, Math.max(0, Number(value) || 0));
  toggleSetting("sfxVolume", clamped);
}

function preloadSfxManifest(manifest = null){
  sfxState.manifest = manifest;
}

function resolveElement(selectorOrEl){
  if(!selectorOrEl) return null;
  if(typeof selectorOrEl === "string") return document.querySelector(selectorOrEl);
  return selectorOrEl;
}

function flashElement(selectorOrEl, className, ms = 220){
  const el = resolveElement(selectorOrEl);
  if(!el || !className) return;
  el.classList.add(className);
  setTimeout(()=>el.classList.remove(className), scaledDelay(ms) || 1);
}

function pulseElement(selectorOrEl, className, ms = 260){
  flashElement(selectorOrEl, className, ms);
}

function shakeScreen(intensity = "light"){
  if(isReducedMotion() || !getSettings().screenShake) return;
  const stage = document.getElementById("stage") || document.getElementById("game");
  if(!stage) return;
  const map = { light:"screen-shake-light", medium:"screen-shake-medium", heavy:"screen-shake-heavy" };
  const cls = map[intensity] || map.light;
  stage.classList.add(cls);
  setTimeout(()=>stage.classList.remove(cls), scaledDelay(220));
}

async function hitStop(ms = 70){
  if(isReducedMotion()) return;
  const root = document.documentElement;
  root.classList.add("hit-stop");
  await sleep(scaledDelay(ms));
  root.classList.remove("hit-stop");
}

function queueJuice(fn){
  if(typeof fn !== "function") return Promise.resolve();
  sfxState.queue = (sfxState.queue || Promise.resolve()).then(()=>Promise.resolve(fn())).catch(()=>{});
  return sfxState.queue;
}

async function runJuiceSequence(steps = []){
  for(const step of steps){
    if(typeof step === "number") await sleep(scaledDelay(step));
    else if(typeof step === "function") await Promise.resolve(step());
  }
}

function playSfx(name, options = {}){
  if(!SFX_NAMES.includes(name)) return;
  const settings = getSettings();
  if(!settings.sfxEnabled) return;
  const now = Date.now();
  const throttleMs = options.throttleMs ?? 80;
  const last = sfxState.recent.get(name) || 0;
  if(now - last < throttleMs) return;
  sfxState.recent.set(name, now);
  const src = options.src || sfxState.manifest?.[name] || `./assets/audio/${name}.mp3`;
  let audio = sfxState.cache.get(src);
  if(!audio){
    audio = new Audio(src);
    audio.preload = "auto";
    audio.addEventListener("error", ()=>{}, { once:true });
    sfxState.cache.set(src, audio);
  }
  try {
    const clone = audio.cloneNode();
    clone.volume = Math.min(1, Math.max(0, (options.volume ?? settings.sfxVolume ?? 0.65)));
    const maybePromise = clone.play();
    if(maybePromise?.catch) maybePromise.catch(()=>{});
  } catch {}
}

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
function getRelicDef(relicId){
  return DB.relics?.[relicId] || null;
}
function hasRelic(relicId){
  return S?.relics?.includes(relicId);
}
function relicLog(text){
  if(!S?.combat) return;
  S.combat.log.push(`Relic: ${text}`);
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

function defaultMetaProfile(){
  return {
    profileVersion: META_VERSION,
    totalRuns: 0,
    wins: 0,
    losses: 0,
    bestAct: 0,
    bestFloor: 0,
    totalEnemiesDefeated: 0,
    totalElitesDefeated: 0,
    totalBossesDefeated: 0,
    totalCardsPicked: 0,
    totalRelicsFound: 0,
    discoveredCards: ["strike", "guard"],
    discoveredRelics: ["dull_whetstone"],
    encounteredEnemies: [],
    unlockedCards: [],
    unlockedRelics: [],
    unlockedLoadouts: ["ashblade"],
    difficultyUnlocked: 0,
    achievementCounters: {
      bleedAppliedTotal: 0,
      burnAppliedTotal: 0,
      blockGainedTotal: 0,
      wardBlockedTotal: 0,
      cursesAddedTotal: 0,
      cardsPlayedTotal: 0,
      attacksPlayedTotal: 0,
      skillsPlayedTotal: 0,
      perfectCombats: 0,
      lowHPVictories: 0
    },
    runHistory: [],
    latestRunResult: null
  };
}

function migrateMetaProfile(meta){
  if(!meta || typeof meta !== "object") return defaultMetaProfile();
  const merged = { ...defaultMetaProfile(), ...meta };
  merged.profileVersion = META_VERSION;
  merged.discoveredCards = [...new Set(Array.isArray(merged.discoveredCards) ? merged.discoveredCards : [])];
  merged.discoveredRelics = [...new Set(Array.isArray(merged.discoveredRelics) ? merged.discoveredRelics : [])];
  merged.encounteredEnemies = [...new Set(Array.isArray(merged.encounteredEnemies) ? merged.encounteredEnemies : [])];
  merged.unlockedCards = [...new Set(Array.isArray(merged.unlockedCards) ? merged.unlockedCards : [])];
  merged.unlockedRelics = [...new Set(Array.isArray(merged.unlockedRelics) ? merged.unlockedRelics : [])];
  merged.unlockedLoadouts = [...new Set(Array.isArray(merged.unlockedLoadouts) ? merged.unlockedLoadouts : ["ashblade"])];
  merged.difficultyUnlocked = Math.max(0, Math.min(MAX_HOLLOW_DEPTH, Number(merged.difficultyUnlocked) || 0));
  merged.runHistory = (Array.isArray(merged.runHistory) ? merged.runHistory : []).slice(0, MAX_RUN_HISTORY);
  merged.achievementCounters = { ...defaultMetaProfile().achievementCounters, ...(merged.achievementCounters || {}) };
  return merged;
}

function loadMetaProfile(){
  try {
    M = migrateMetaProfile(JSON.parse(localStorage.getItem(META_PROFILE_KEY) || "null"));
  } catch {
    M = defaultMetaProfile();
  }
  return M;
}

function persistMetaProfile(){
  if(!M) return;
  localStorage.setItem(META_PROFILE_KEY, JSON.stringify(M));
}

function markDiscovered(type, id){
  if(!M || !id) return;
  const key = type === "card" ? "discoveredCards" : type === "relic" ? "discoveredRelics" : "encounteredEnemies";
  if(!key || !Array.isArray(M[key])) return;
  if(!M[key].includes(id)) M[key].push(id);
}

function isUnlocked(type, id){
  if(!id) return false;
  if(type === "loadout") return (M?.unlockedLoadouts || []).includes(id);
  if(type === "card"){
    if(DB.cards?.[id]?.unlock === "default") return true;
    return !(DB.cards?.[id]?.unlock === "meta") || (M?.unlockedCards || []).includes(id);
  }
  if(type === "relic"){
    if(DB.relics?.[id]?.unlock === "default") return true;
    return !(DB.relics?.[id]?.unlock === "meta") || (M?.unlockedRelics || []).includes(id);
  }
  return false;
}

function grantUnlock(type, id){
  if(!id || !M) return false;
  const key = type === "card" ? "unlockedCards" : type === "relic" ? "unlockedRelics" : type === "loadout" ? "unlockedLoadouts" : null;
  if(!key) return false;
  if(!Array.isArray(M[key])) M[key] = [];
  if(M[key].includes(id)) return false;
  M[key].push(id);
  return true;
}

function getDifficultyLevel(){
  return Math.max(0, Math.min(MAX_HOLLOW_DEPTH, Number(S?.difficulty ?? 0)));
}

function getShopPriceMultiplier(){
  return getDifficultyLevel() >= 4 ? 1.15 : 1;
}

function getStartingMaxHPModifier(){
  return getDifficultyLevel() >= 3 ? -5 : 0;
}

function applyDifficultyToEnemy(enemyDef, nodeType = "combat"){
  const out = clone(enemyDef);
  if(getDifficultyLevel() >= 1){
    out.hp = Math.max(1, Math.round(out.hp * 1.1));
  }
  if(getDifficultyLevel() >= 2 && (nodeType === "elite" || out.tier === "elite")){
    (out.moves || []).forEach((move)=>{
      if(move.damage) move.damage = Math.max(1, Math.round(move.damage * 1.15));
    });
  }
  return out;
}

function applyBossDifficultyModifiers(){
  if(!S?.combat?.enemy) return;
  if(getDifficultyLevel() >= 5 && S.combat.enemy.tier === "boss"){
    S.combat.enemy.status.Strength = (S.combat.enemy.status.Strength || 0) + 1;
    S.combat.log.push("Hollow Depth pressure empowers the boss (+1 Strength).");
  }
}

function startRunStats(){
  S.runFinished = false;
  S.runStats = {
    startedAt: Date.now(),
    result: null,
    enemiesDefeated: 0,
    elitesDefeated: 0,
    bossesDefeated: 0,
    cardsPicked: 0,
    relicsFound: 0,
    bossDefeated: false,
    unlocksEarned: []
  };
}

function updateRunStats(eventName, payload = {}){
  if(!S?.runStats) return;
  const stats = S.runStats;
  if(eventName === "enemy_defeated"){
    stats.enemiesDefeated += 1;
    if(payload.tier === "elite") stats.elitesDefeated += 1;
    if(payload.tier === "boss"){
      stats.bossesDefeated += 1;
      stats.bossDefeated = true;
    }
  }
  if(eventName === "card_picked") stats.cardsPicked += 1;
  if(eventName === "relic_found") stats.relicsFound += 1;
}

function checkUnlocks(){
  const gained = [];
  if(M.wins >= 1 && grantUnlock("loadout", "lantern_guard")) gained.push("Lantern Guard loadout");
  if(M.totalElitesDefeated >= 3 && grantUnlock("loadout", "red_hymn")) gained.push("Red Hymn loadout");
  if((M.achievementCounters.bleedAppliedTotal || 0) >= 50 && grantUnlock("card", "blood_pact")) gained.push("Card: Blood Pact");
  if((M.achievementCounters.blockGainedTotal || 0) >= 200 && grantUnlock("relic", "bellplate_charm")) gained.push("Relic: Bellplate Charm");
  if((S.runStats?.bossDefeated) && M.difficultyUnlocked < 1) M.difficultyUnlocked = 1;
  if((S.runStats?.result === "win") && getDifficultyLevel() === M.difficultyUnlocked && M.difficultyUnlocked < MAX_HOLLOW_DEPTH){
    M.difficultyUnlocked += 1;
    gained.push(`Hollow Depth ${M.difficultyUnlocked} unlocked`);
  }
  return gained;
}

function finishRun(result = "loss"){
  if(!S?.runStats || S.runFinished) return;
  S.runFinished = true;
  S.runStats.result = result;
  const build = getBuildSummary();
  const run = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    result,
    difficulty: getDifficultyLevel(),
    act: S?.map?.act || 1,
    floor: S?.map?.floor || 1,
    bossDefeated: Boolean(S.runStats.bossDefeated),
    finalHp: S.hp,
    maxHp: S.maxHp,
    deckSize: S.deck.length,
    relicCount: S.relics.length,
    gold: S.gold,
    archetypes: build.top,
    enemiesDefeated: S.runStats.enemiesDefeated,
    elitesDefeated: S.runStats.elitesDefeated,
    bossesDefeated: S.runStats.bossesDefeated,
    cardsPicked: S.runStats.cardsPicked,
    relicsFound: S.runStats.relicsFound,
    durationSec: Math.round((Date.now() - S.runStats.startedAt) / 1000),
    timestamp: Date.now(),
    finalDeck: clone(S.deck),
    finalRelics: clone(S.relics),
    unlocksEarned: []
  };
  M.bestAct = Math.max(M.bestAct || 0, run.act);
  M.bestFloor = Math.max(M.bestFloor || 0, run.floor);
  M.totalEnemiesDefeated += run.enemiesDefeated;
  M.totalElitesDefeated += run.elitesDefeated;
  M.totalBossesDefeated += run.bossesDefeated;
  M.totalCardsPicked += run.cardsPicked;
  M.totalRelicsFound += run.relicsFound;
  if(result === "win") M.wins += 1;
  if(result === "loss" || result === "abandoned") M.losses += 1;
  M.latestRunResult = result;
  run.unlocksEarned = checkUnlocks();
  S.runStats.unlocksEarned = run.unlocksEarned;
  M.runHistory = [run, ...(M.runHistory || [])].slice(0, MAX_RUN_HISTORY);
  persistMetaProfile();
}

function showRunSummary(result = "loss"){
  const latest = M?.runHistory?.[0];
  if(!latest) return title();
  setScreen("run-end");
  G.innerHTML = `<div class="screen reward-screen"><div class="top"><div><div class="logo">${result.toUpperCase()}</div><div class="small">Hollow Depth ${latest.difficulty}</div></div><div><span class="pill">Act ${latest.act} · Floor ${latest.floor}</span></div></div>
    <div class="reward-wrap">
      <p class="small">Enemies ${latest.enemiesDefeated} · Elites ${latest.elitesDefeated} · Bosses ${latest.bossesDefeated}</p>
      <p class="small">Cards picked ${latest.cardsPicked} · Relics found ${latest.relicsFound} · Final deck ${latest.deckSize}</p>
      <p class="small">Archetypes: ${(latest.archetypes || []).join(" / ") || "Unfocused"}</p>
      <p class="small">Unlocks: ${(latest.unlocksEarned || []).join(", ") || "None this run"}</p>
      <div class="reward-actions">
        <button onclick="startNewRun()">New Run</button>
        <button onclick="openRunHistory()">Run History</button>
        <button onclick="openFinalDeckViewer()">View Final Deck</button>
        <button onclick="title()">Title</button>
      </div>
    </div>
  </div>`;
}

async function loadData(){
  const entries = await Promise.all(Object.entries(DATA_PATHS).map(async ([k,p]) => [k, await fetch(p).then(r=>r.json())]));
  DB = Object.fromEntries(entries);
  loadMetaProfile();
  fresh();
}

function loadSettings(){
  try {
    return { ...SETTINGS_DEFAULTS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}) };
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

function persistSettings(){
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(S?.settings || SETTINGS_DEFAULTS));
}

function applySettings(){
  const settings = getSettings();
  document.documentElement.classList.toggle("text-large", settings.textSize === "large");
  document.documentElement.classList.toggle("high-contrast", Boolean(settings.highContrast));
  document.documentElement.dataset.animIntensity = settings.animationIntensity || "normal";
}

function autosave(reason = ""){
  if(!S?.settings?.autoSave) return;
  saveGame({ silent:true, reason });
}

function setScreen(screenName){
  currentScreen = screenName;
  G.dataset.screen = screenName;
}

function renderRunHud(){
  if(!S?.weapon) return "";
  return `<div class="run-hud">
    <span>HP ${S.hp}/${S.maxHp}</span>
    <span>Echoes ${S.gold}</span>
    <span>Act ${S?.map?.act || 1}</span>
    <span>Depth ${getDifficultyLevel()}</span>
    <span>Deck ${S.deck?.length || 0}</span>
    <span>Relics ${S.relics?.length || 0}</span>
    ${lastSavedAt ? `<span class="save-indicator">Saved ${lastSavedAt}</span>` : ""}
    ${currentScreen !== "map" ? `<button onclick="drawWorld()">Map</button>` : ""}
    <button onclick="openRunMenu()">Menu</button>
  </div>`;
}

function renderBottomNav(){
  if(!S?.weapon) return "";
  return `<div class="bottom-nav">
    <button onclick="drawWorld()">Map</button>
    <button onclick="showDeck()">Deck</button>
    <button onclick="showBuildPanel()">Relics</button>
    <button onclick="showCombatLog()">Log</button>
    <button onclick="openRunMenu()">Menu</button>
  </div>`;
}

function fresh(){
  if(!M) loadMetaProfile();
  S = {
    body:null, weapon:null,
    hp:BALANCE.playerBaseHP, maxHp:BALANCE.playerBaseHP, gold:20,
    deck:[], relics:["dull_whetstone"],
    x:70, y:350, zone:0,
    cleared:{}, falseEnding:false, truePilgrimage:false,
    memories:[], kills:0, deaths:0,
    alignment:{silence:0,memory:0,flame:0,root:0},
    combat:null,
    selectedNodeId:null,
    mapEncounter:null,
    pendingNodeCompletion:null,
    map:null,
    recentUnlockedNodes:[],
    flags:{},
    nextCombat:{ ward:0, strength:0, block:0, draw:0, energy:0 },
    nextCombatStatus:{},
    tempNextCombatCards:[],
    eventMeta:{},
    settings: loadSettings(),
    difficulty: 0,
    loadoutId: "ashblade",
    runStats: null,
    runFinished: false,
    saveVersion: SAVE_VERSION
  };
  applySettings();
  title();
}

function title(){
  setScreen("title");
  const hasSave = Boolean(localStorage.getItem(RUN_SAVE_KEY) || localStorage.getItem("ashfall_repo_save"));
  const unlockedLoadouts = (M?.unlockedLoadouts || []).length;
  const latest = M?.latestRunResult ? `Latest: ${M.latestRunResult}` : "Latest: —";
  G.innerHTML = `<div class="title app-title"><div class="panel title-panel">
    <p class="small">Version 0.7.0 · Mobile Build</p>
    <h1>Ashfall: Echoes of the Hollow</h1>
    <p class="tagline">“Carry fire through the things that remember you.”</p>
    <button ${hasSave ? "" : "disabled"} onclick="loadSave()">Continue</button>
    <button onclick="startNewRun()">New Run</button>
    <button onclick="openRunHistory()">Run History</button>
    <button onclick="openCompendium()">Codex</button>
    <button onclick="openSettings()">Settings</button>
    <button onclick="openResetMenu()">Resets</button>
    <div class="small">Runs ${M?.totalRuns || 0} · Wins ${M?.wins || 0} · Highest Hollow Depth ${M?.difficultyUnlocked || 0}</div>
    <div class="small">${latest} · Loadouts ${unlockedLoadouts}/${Object.keys(DB.loadouts || {}).length || 1}</div>
    <p class="small">Ashfall repo overhaul build</p>
  </div></div>`;
}

function startNewRun(){
  if((localStorage.getItem(RUN_SAVE_KEY) || localStorage.getItem("ashfall_repo_save")) && !confirm("Start a fresh run? Existing save will be replaced once you save.")) return;
  fresh();
  chars();
}

function chars(){
  const depthOptions = Array.from({ length: (M?.difficultyUnlocked || 0) + 1 }, (_, idx)=>idx).map((depth)=>`<option value="${depth}">Hollow Depth ${depth}</option>`).join("");
  const loadouts = Object.values(DB.loadouts || {}).filter((loadout)=>isUnlocked("loadout", loadout.id));
  const loadoutButtons = loadouts.map((loadout)=>`
    <div class="choice">
      <h3>${loadout.name}</h3>
      <p>${loadout.description}</p>
      <p class="small">Deck: ${(loadout.startingDeck || []).join(", ")}</p>
      <button onclick="selectLoadout('${loadout.id}')">Use ${loadout.name}</button>
    </div>
  `).join("");
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
    <div style="padding:14px;overflow:auto">
      <label class="small">Hollow Depth <select onchange="setDifficulty(this.value)">${depthOptions}</select></label>
      <h3>Starter Styles</h3>
      <div class="choice-grid">${loadoutButtons || `<div class="small">No additional loadouts unlocked yet.</div>`}</div>
      <h3>Weapon</h3>
      <div class="choice-grid">${weaponCards}</div>
    </div>
  </div>`;
}

function startRun(weapon, body){
  const loadout = DB.loadouts?.[S.loadoutId] || DB.loadouts?.ashblade || null;
  S.weapon = weapon;
  S.body = body;
  S.deck = normalizeCardPile(loadout?.startingDeck || DB.weapons[weapon].starter);
  S.deck.forEach((card)=>markDiscovered("card", cardIdOf(card)));
  if(loadout?.startingRelic && !S.relics.includes(loadout.startingRelic)) S.relics.push(loadout.startingRelic);
  S.relics.forEach((rid)=>markDiscovered("relic", rid));
  if(Number.isFinite(loadout?.startingGold)) S.gold = loadout.startingGold;
  S.maxHp = Math.max(20, 72 + getStartingMaxHPModifier());
  S.hp = S.maxHp;
  S.selectedNodeId = null;
  S.mapEncounter = null;
  S.pendingNodeCompletion = null;
  S.map = generateRunMap();
  startRunStats();
  M.totalRuns += 1;
  persistMetaProfile();
  cutscene("The Dead Shrine", "You wake beneath a cracked shrine. The lantern in your chest burns like it recognizes the road ahead.", drawWorld);
}


function normalizeRunState(run){
  const out = migrateSave({ runState: clone(run || {}) }) || null;
  if(!out) return null;
  out.deck = normalizeCardPile(out.deck);
  out.relics = Array.isArray(out.relics) ? out.relics.filter((id)=>typeof id === "string") : [];
  out.gold = Math.max(0, Number(out.gold) || 0);
  out.hp = Math.max(0, Number(out.hp) || 1);
  out.maxHp = Math.max(1, Number(out.maxHp) || out.hp || 1);
  out.hp = Math.min(out.hp, out.maxHp);
  return out;
}

function validateRunState(run){
  const errors = [];
  if(!run || typeof run !== "object") errors.push("run missing");
  if(!Array.isArray(run?.deck)) errors.push("deck missing");
  if(!Array.isArray(run?.relics)) errors.push("relics missing");
  if(!run?.map || !Array.isArray(run.map.steps)) errors.push("map missing");
  if(!Number.isFinite(run?.hp) || !Number.isFinite(run?.maxHp)) errors.push("hp invalid");
  if(run?.combat){
    ["draw","hand","discard","exhaust"].forEach((pile)=>{ if(!Array.isArray(run.combat[pile])) errors.push(`combat.${pile} missing`); });
  }
  return { valid: errors.length === 0, errors };
}

function repairRunState(run){
  const repaired = normalizeRunState(run);
  if(!repaired) return null;
  if(!repaired.map || !Array.isArray(repaired.map.steps)) repaired.map = generateRunMap();
  if(!repaired.currentNodeId) repaired.currentNodeId = repaired.map?.startNodeId || null;
  repaired.nextCombat = { ward:0, strength:0, block:0, draw:0, energy:0, ...(repaired.nextCombat || {}) };
  return repaired;
}

function backupRunSave(){
  const primary = localStorage.getItem(RUN_SAVE_KEY);
  if(primary) localStorage.setItem(RUN_BACKUP_KEY, primary);
}

function clearCorruptSave(){
  localStorage.removeItem(RUN_SAVE_KEY);
  localStorage.removeItem(RUN_BACKUP_KEY);
  localStorage.removeItem(RUN_LAST_GOOD_KEY);
}

function exportDebugReport(){
  const combat = S?.combat;
  const report = {
    appVersion: "0.4.0",
    saveVersion: S?.saveVersion || SAVE_VERSION,
    currentScreen,
    hp: S?.hp,
    maxHp: S?.maxHp,
    piles: { deck:S?.deck?.length || 0, draw:combat?.draw?.length || 0, hand:combat?.hand?.length || 0, discard:combat?.discard?.length || 0 },
    relics: (S?.relics || []).slice(0, 50),
    currentNodeId: S?.currentNodeId || null,
    mapSteps: S?.map?.steps?.length || 0,
    enemy: combat?.enemy ? { id: combat.enemy.id, move: combat.enemy.currentMove?.name || null } : null,
    settings: S?.settings || loadSettings(),
    logTail: (combat?.log || []).slice(-20),
    lastError: S?.lastError || null
  };
  return JSON.stringify(report, null, 2);
}

function copyDebugReport(){
  const text = exportDebugReport();
  if(navigator.clipboard?.writeText){ navigator.clipboard.writeText(text).then(()=>toast("Debug report copied.")); return; }
  modal("Debug Report", `<pre style="white-space:pre-wrap">${text.replace(/</g,'&lt;')}</pre>`);
}

function showFatalError(error, source = "runtime"){
  const msg = (error && (error.message || String(error))) || "Unknown error";
  if(S) S.lastError = { source, msg, at: Date.now() };
  G.innerHTML = `<div class="screen error-screen"><div class="panel" style="margin:12px"><h2>Something broke in the Hollow.</h2><p class="small">${msg}</p><div class="menu-list"><button onclick="recoverFromBackup()">Try Recover</button><button onclick="title()">Return to Title</button><button onclick="clearCorruptSave(); title();">Clear Active Run</button><button onclick="copyDebugReport()">Copy Error Details</button></div></div></div>`;
}

function recoverFromBackup(){
  const raw = localStorage.getItem(RUN_BACKUP_KEY);
  if(!raw){ toast("No backup save found."); return title(); }
  try {
    const parsed = JSON.parse(raw);
    S = repairRunState(parsed?.runState ? parsed.runState : parsed);
    hydrateSave();
    drawWorld();
    toast("Recovered backup save.");
  } catch (e){
    showFatalError(e, "backup");
  }
}

function saveGame(options = {}){
  const normalized = repairRunState(S);
  if(!normalized) return;
  S = normalized;
  const payload = { saveVersion: SAVE_VERSION, savedAt: Date.now(), runState: S };
  backupRunSave();
  localStorage.setItem(RUN_SAVE_KEY, JSON.stringify(payload));
  localStorage.setItem(RUN_LAST_GOOD_KEY, String(payload.savedAt));
  lastSavedAt = new Date(payload.savedAt).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
  if(!options.silent) toast("Saved.");
}

function migrateSave(payload){
  const run = payload?.runState ? payload.runState : payload;
  if(!run || typeof run !== "object") return null;
  run.saveVersion = payload?.saveVersion || run.saveVersion || 1;
  run.settings = { ...loadSettings(), ...(run.settings || {}) };
  run.nextCombat = { ward:0, strength:0, block:0, draw:0, energy:0, ...(run.nextCombat || {}) };
  run.nextCombatStatus = run.nextCombatStatus || {};
  run.tempNextCombatCards = Array.isArray(run.tempNextCombatCards) ? run.tempNextCombatCards : [];
  run.deck = normalizeCardPile(run.deck || []);
  run.relics = Array.isArray(run.relics) ? run.relics : [];
  run.gold = Number.isFinite(run.gold) ? run.gold : 0;
  run.difficulty = Math.max(0, Math.min(MAX_HOLLOW_DEPTH, Number(run.difficulty) || 0));
  run.loadoutId = run.loadoutId || "ashblade";
  run.runStats = run.runStats || null;
  run.runFinished = Boolean(run.runFinished);
  return run;
}

function loadSave(){
  const raw = localStorage.getItem(RUN_SAVE_KEY) || localStorage.getItem("ashfall_repo_save");
  if(!raw) return toast("No save found.");
  try {
    const parsed = JSON.parse(raw);
    S = repairRunState(parsed?.runState ? parsed.runState : parsed);
    const check = validateRunState(S);
    if(!check.valid) throw new Error(`Invalid save: ${check.errors.join(", ")}`);
    hydrateSave();
    applySettings();
    drawWorld();
  } catch (error) {
    const backup = localStorage.getItem(RUN_BACKUP_KEY);
    if(backup){
      try { recoverFromBackup(); return; } catch {}
    }
    showFatalError(error, "loadSave");
  }
}

function openRunMenu(){
  modal("Run Menu", `<div class="menu-list">
    <button onclick="document.querySelector('.modal')?.remove()">Resume</button>
    <button onclick="saveGame()">Save Run</button>
    <button onclick="title()">Return to Title</button>
    <button onclick="abandonRun()">Abandon Run</button>
    <button onclick="openSettings()">Settings</button>
  </div>`);
}

function abandonRun(){
  if(!confirm("Abandon this run?")) return;
  finishRun("abandoned");
  localStorage.removeItem(RUN_SAVE_KEY);
  fresh();
  title();
}

function openSettings(){
  const settings = getSettings();
  modal("Settings", `<div class="menu-list">
    <label><span>Reduced Motion</span><input type="checkbox" ${settings.reducedMotion ? "checked" : ""} onchange="toggleSetting('reducedMotion', this.checked)"></label>
    <label><span>SFX Enabled</span><input type="checkbox" ${settings.sfxEnabled ? "checked" : ""} onchange="setSfxEnabled(this.checked)"></label>
    <label><span>SFX Volume</span><input type="range" min="0" max="1" step="0.05" value="${settings.sfxVolume}" onchange="setSfxVolume(this.value)"></label>
    <label><span>Screen Shake</span><input type="checkbox" ${settings.screenShake ? "checked" : ""} onchange="toggleSetting('screenShake', this.checked)"></label>
    <label><span>Animation Intensity</span><select onchange="toggleSetting('animationIntensity', this.value)"><option value="low" ${settings.animationIntensity === "low" ? "selected" : ""}>Low</option><option value="normal" ${settings.animationIntensity === "normal" ? "selected" : ""}>Normal</option><option value="high" ${settings.animationIntensity === "high" ? "selected" : ""}>High</option></select></label>
    <label><span>Large Text</span><input type="checkbox" ${settings.textSize === "large" ? "checked" : ""} onchange="toggleSetting('textSize', this.checked ? 'large' : 'normal')"></label>
    <label><span>High Contrast</span><input type="checkbox" ${settings.highContrast ? "checked" : ""} onchange="toggleSetting('highContrast', this.checked)"></label>
    <label><span>Auto Save</span><input type="checkbox" ${settings.autoSave ? "checked" : ""} onchange="toggleSetting('autoSave', this.checked)"></label>
    <label><span>Combat Speed</span><select onchange="toggleSetting('combatSpeed', this.value)"><option value="normal" ${settings.combatSpeed === "normal" ? "selected" : ""}>Normal</option><option value="fast" ${settings.combatSpeed === "fast" ? "selected" : ""}>Fast</option></select></label>
  </div>`);
}

function toggleSetting(key, value){
  S.settings = { ...(S.settings || loadSettings()), [key]: value };
  persistSettings();
  applySettings();
}

function setDifficulty(depth){
  const next = Math.max(0, Math.min(M?.difficultyUnlocked || 0, Number(depth) || 0));
  S.difficulty = next;
}

function selectLoadout(loadoutId){
  if(!isUnlocked("loadout", loadoutId)) return toast("Loadout locked.");
  S.loadoutId = loadoutId;
  toast(`${DB.loadouts[loadoutId]?.name || loadoutId} selected.`);
}

function openRunHistory(){
  const runs = (M?.runHistory || []).slice(0, MAX_RUN_HISTORY);
  const best = runs.find((run)=>run.result === "win") || runs[0];
  modal("Run History", `<div class="run-history">
    ${runs.length ? runs.map((run)=>`<div class="deck-row ${best?.id === run.id ? "best-run" : ""}">
      <div><b>${run.result.toUpperCase()}</b> · Depth ${run.difficulty} · Act ${run.act} / Floor ${run.floor}</div>
      <div class="small">${(run.archetypes || []).join(" / ") || "Unfocused"} · Deck ${run.deckSize} · Relics ${run.relicCount}</div>
      <div class="small">${new Date(run.timestamp).toLocaleString()}</div>
    </div>`).join("") : "<p>No runs yet. Start your first descent.</p>"}
  </div>`);
}

function openFinalDeckViewer(run = null){
  const source = run || M?.runHistory?.[0];
  if(!source) return toast("No completed run to inspect.");
  modal("Final Deck", `<div class="event-wrap">
    <p class="small">Result: ${source.result} · Hollow Depth ${source.difficulty}</p>
    <h3>Deck (${source.finalDeck?.length || source.deckSize || 0})</h3>
    ${(source.finalDeck || []).map((card)=>`<div class="deck-row">${renderCardSummary(card)}</div>`).join("") || "<p>No deck data.</p>"}
    <h3>Relics (${source.finalRelics?.length || source.relicCount || 0})</h3>
    ${(source.finalRelics || []).map((rid)=>`<div class="deck-row">${renderRelicSummary(rid)}</div>`).join("") || "<p>No relic data.</p>"}
  </div>`);
}

function openResetMenu(){
  modal("Reset Options", `<div class="menu-list">
    <button onclick="deleteActiveRun()">Delete Active Run</button>
    <button onclick="resetMetaProgression()">Reset Meta Progression</button>
    <button onclick="resetSettingsData()">Reset Settings</button>
  </div>`);
}

function deleteActiveRun(){
  if(!confirm("Delete active run save?")) return;
  localStorage.removeItem(RUN_SAVE_KEY);
  toast("Active run deleted.");
}

function resetMetaProgression(){
  if(!confirm("Reset all meta progression? This cannot be undone.")) return;
  M = defaultMetaProfile();
  persistMetaProfile();
  toast("Meta progression reset.");
  title();
}

function resetSettingsData(){
  if(!confirm("Reset settings to default?")) return;
  localStorage.removeItem(SETTINGS_KEY);
  S.settings = loadSettings();
  applySettings();
  toast("Settings reset.");
}

function openCompendium(){
  setScreen("codex");
  const cards = Object.entries(DB.cards || {}).map(([id, card])=>({ ...card, id }));
  const relics = Object.entries(DB.relics || {}).map(([id, relic])=>({ ...relic, id }));
  const enemies = Object.entries(DB.enemies || {}).map(([id, enemy])=>({ ...enemy, id }));
  const stateFor = (type, id)=>{
    if(type === "enemy"){
      if(!(M?.encounteredEnemies || []).includes(id)) return "Undiscovered";
      return "Discovered";
    }
    const discovered = (type === "card" ? M?.discoveredCards : M?.discoveredRelics) || [];
    if(!discovered.includes(id)) return "Undiscovered";
    return isUnlocked(type, id) ? "Unlocked" : "Discovered · Locked";
  };
  G.innerHTML = `<div class="screen codex-screen">
    <div class="top"><div class="logo">Codex / Compendium</div><button onclick="title()">Back</button></div>
    <div class="event-wrap">
      <h3>Cards discovered</h3>${cards.map((c)=>`<div class="deck-row"><b>${c.name}</b><div class="small">${c.text}</div><div class="small">${stateFor("card", c.id)}</div></div>`).join("")}
      <h3>Relics discovered</h3>${relics.map((r)=>`<div class="deck-row"><b>${r.name}</b><div class="small">${r.text}</div><div class="small">${stateFor("relic", r.id)}</div></div>`).join("")}
      <h3>Enemies encountered</h3>${enemies.map((e)=>`<div class="deck-row"><b>${e.name}</b><div class="small">${e.behaviorHint || ""}</div><div class="small">${stateFor("enemy", e.id)}</div></div>`).join("")}
      <h3>Keywords</h3>${Object.entries(KEYWORD_INFO).map(([k,v])=>`<p><b>${k}</b>: ${v}</p>`).join("")}
    </div>
  </div>`;
}


const BALANCE = {
  playerBaseHP: 72,
  normalRewardGoldMin: 15,
  normalRewardGoldMax: 25,
  eliteRewardGoldMin: 35,
  eliteRewardGoldMax: 55,
  shopPrices: { cardMin: 45, cardMax: 85, relicMin: 135, relicMax: 195, removalBase: 75, healBase: 50 },
  rarityWeights: {
    combat:BALANCE.rarityWeights.combat,
    elite:BALANCE.rarityWeights.elite,
    boss:{ common:0.2, uncommon:0.45, rare:0.35 }
  },
  mapGeneration: { stepsBeforeBoss: 12, minShopStep: 4, eliteStartStep: 3 },
  difficultyModifiers: { hpPerDepth: 2, damagePerDepth: 0.08 }
};
const NODE_TYPES = ["combat","elite","event","rest","shop","treasure"];
const NODE_ICONS = {combat:"⚔", elite:"💀", event:"?", rest:"✦", shop:"⚖", treasure:"◆", boss:"👁"};
const NODE_RISK = {
  combat:"Reward: card choice + echoes.",
  elite:"High risk. Reward: relic + echoes.",
  event:"Uncertain omen. Risk and reward shift with your choice.",
  rest:"Recover or refine at a sanctuary.",
  shop:"Spend echoes on power.",
  treasure:"Reward: relic, Echoes, or a rare memory.",
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
  S.flags = S.flags || {};
  S.gold = Number.isFinite(S.gold) ? Math.max(0, Math.floor(S.gold)) : 0;
  S.nextCombat = { ward:0, strength:0, block:0, draw:0, energy:0, ...(S.nextCombat || {}) };
  S.nextCombatStatus = S.nextCombatStatus || {};
  S.tempNextCombatCards = Array.isArray(S.tempNextCombatCards) ? S.tempNextCombatCards : [];
  S.eventMeta = S.eventMeta || {};
  S.relics = (Array.isArray(S.relics) ? S.relics : []).filter((id)=>DB.relics[id]);
  normalizeDeckState();
  if(S.combat?.enemy){
    S.combat.enemy.moves = normalizeEnemyMoves(S.combat.enemy);
    S.combat.enemyState = S.combat.enemyState || { turn:S.combat.turn || 1, moveUses:{}, moveCooldowns:{}, lastMoves:[], currentMoveId:null };
    if(!S.combat.enemyState.currentMoveId) S.combat.enemyState.currentMoveId = chooseEnemyMove();
    S.combat.enemy.phaseIndex = Number.isInteger(S.combat.enemy.phaseIndex) ? S.combat.enemy.phaseIndex : -1;
    S.combat.enemy.phaseName = S.combat.enemy.phaseName || "Phase 1";
  }
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
  const unlocked = (S.recentUnlockedNodes || []).includes(node.id);
  return ["map-node", `node-${node.type}`, reachable ? "reachable" : "locked", visited ? "visited" : "", current ? "current" : "", selected ? "selected" : "", unlocked ? "node-unlock-pulse" : ""].filter(Boolean).join(" ");
}

function mapVisionNote(){
  const notes = [];
  if(S.eventMeta?.revealNextNodes) notes.push('Nearby paths feel clearer.');
  if(S.eventMeta?.scoutElite) notes.push('Elite omens are easier to identify.');
  if(S.eventMeta?.gainMapVision) notes.push(`Map vision +${S.eventMeta.gainMapVision}.`);
  return notes.length ? `<p class="small">${notes.join(' ')}</p>` : '';
}

function drawWorld(){
  setScreen("map");
  S.combat = null;
  hydrateSave();
  const rows = mapRows();
  const selectedNode = nodeById(S.selectedNodeId);
  const selectedReachable = isNodeReachable(selectedNode);
  const pathTaken = S.map.pathHistory.length ? S.map.pathHistory.join(" → ") : "None yet";
  G.innerHTML = `<div class="screen map-screen">
    ${renderRunHud()}
    <div class="top">
      <div><div class="logo">ACT ${S.map.act || 1}: THE HOLLOW ROAD</div><div class="small">Choose connected routes through the ash.</div></div>
      <div><span class="pill">HP ${S.hp}/${S.maxHp}</span><span class="pill echoes-pill">Echoes ${S.gold}</span></div>
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
          ${encounterPreviewForNode(selectedNode)}
          ${selectedReachable ? `<button onclick="enterSelectedNode()">Enter</button>` : `<div class="locked-msg">Locked: follow connected routes from your current position.</div>`}
        ` : `<h3>Choose a node</h3><p>Select a reachable route node to preview risk and reward.</p>`}
        <hr>
        ${mapVisionNote()}
        <p class="small"><b>Path Taken:</b> ${pathTaken}</p>
      </div>
    </div>
    <div class="controls">
      <div class="actionbar">
        <button onclick="saveGame()">Save</button><button onclick="showDeck()">Deck</button><button onclick="showBuildPanel()">Build</button><button onclick="showCodex()">Codex</button><button onclick="quest()">Quest</button>
      </div>
    </div>
    ${renderBottomNav()}
  </div>`;
  autosave("enter-map");
  document.getElementById("mapScroll")?.scrollTo({top:99999, behavior:"smooth"});
  applyButtonFeedback(G);
}

function selectMapNode(nodeId){
  S.selectedNodeId = nodeId;
  drawWorld();
}

function normalizeEnemyMoves(enemy){
  const legacyIntents = (enemy.intents || []).map((intent, idx)=>({
    id: intent.id || `legacy_${idx}`,
    name: intent.name || `Intent ${idx + 1}`,
    intentIcon: intent.intentIcon || intent.icon || "?",
    intentText: intent.intentText || intentText(intent),
    weight: 1,
    damage: intent.damage || 0,
    hits: intent.hits || 1,
    block: intent.block,
    applyEnemy: intent.status,
    applyPlayer: intent.applyPlayer || intent.apply,
    addTemporaryCardToDiscard: intent.type === "add_card" && intent.to === "discard" ? intent.card : null,
    addCardToPlayerDeck: intent.type === "add_card" && intent.to === "draw" ? intent.card : null,
    drainEnergyNextTurn: intent.type === "drain_energy_next_turn" ? intent.amount : undefined,
    heal: intent.heal
  }));
  return (enemy.moves || legacyIntents).map((move, idx)=>({
    id: move.id || `move_${idx}`,
    name: move.name || `Move ${idx + 1}`,
    intentIcon: move.intentIcon || move.icon || "?",
    intentText: move.intentText || move.name || "Unknown move",
    weight: move.weight > 0 ? move.weight : 1,
    hits: move.hits || 1,
    avoidRepeat: Boolean(move.avoidRepeat),
    ...move
  }));
}

function getEnemyPoolForNode(node){
  const type = typeof node === "string" ? node : node?.type;
  const act = S?.map?.act || 1;
  const all = Object.entries(DB.enemies || {}).filter(([, enemy])=>(enemy.act || 1) === act);
  if(type === "boss") return all.filter(([, enemy])=>enemy.tier === "boss").map(([id])=>id);
  if(type === "elite") return all.filter(([, enemy])=>enemy.tier === "elite").map(([id])=>id);
  if(type === "event") return all.filter(([, enemy])=>enemy.tier === "normal").map(([id])=>id);
  return all.filter(([, enemy])=>enemy.tier === "normal").map(([id])=>id);
}

function pickEnemyForNode(node){
  const pool = getEnemyPoolForNode(node);
  const fallback = Object.keys(DB.enemies || {});
  return pick(pool.length ? pool : fallback);
}

function encounterPreviewForNode(node){
  const pool = getEnemyPoolForNode(node).map((id)=>DB.enemies[id]).filter(Boolean);
  if(node.type === "boss"){
    const boss = pool[0];
    if(!boss) return "<p class=\"small\">Unknown gate omen.</p>";
    return `<p><b>Boss:</b> ${boss.name}</p><p class="small">⚠ Ominous trial ahead. Expect phase shifts.</p>${renderArchetypeChips(boss.archetypes || [])}`;
  }
  if(node.type === "elite"){
    const names = pool.map((enemy)=>enemy.name).slice(0, 3).join(" · ");
    const arcs = [...new Set(pool.flatMap((enemy)=>enemy.archetypes || []))];
    const label = S.eventMeta?.scoutElite ? 'Scouted Elite' : 'Possible Elite';
    return `<p><b>${label}:</b> ${names || "Unknown predator"}</p><p class="small">High risk encounter.</p>${renderArchetypeChips(arcs)}`;
  }
  if(node.type === "combat"){
    const arcs = [...new Set(pool.flatMap((enemy)=>enemy.archetypes || []))];
    return `<p><b>Unknown hollow patrol</b></p><p class="small">Expected patterns vary by archetype.</p>${renderArchetypeChips(arcs.slice(0, 6))}`;
  }
  return "";
}

function enterSelectedNode(){
  const node = nodeById(S.selectedNodeId);
  if(!node || !isNodeReachable(node)) return toast("That route is not reachable yet.");
  S.mapEncounter = { nodeId:node.id, type:node.type };
  if(["combat","elite","boss"].includes(node.type)) return startCombat(pickEnemyForNode(node), node.id);
  if(node.type === "event"){
    const event = pickEventForNode(node);
    return showEvent(event?.id);
  }
  if(node.type === "rest"){
    return showRestSite(node.id);
  }
  if(node.type === "treasure"){
    gainGold(75);
    pendingVictoryRewards = { nodeId:node.id, source:"treasure", summary:`Claimed ${node.title}.`, showCardAfterRelic:true };
    toast("Treasure found: choose a relic.");
    return showRelicReward("treasure");
  }
  if(node.type === "shop"){
    return showShop(node);
  }
}

function completeCurrentNode(result = {}){
  const beforeReachable = new Set(reachableNodeIds());
  const nodeId = result.nodeId || S.mapEncounter?.nodeId || S.pendingNodeCompletion;
  const node = nodeById(nodeId);
  if(!node) return;
  node.completed = true;
  S.map.currentNodeId = node.id;
  if(!S.map.visited.includes(node.id)) S.map.visited.push(node.id);
  S.map.step = Math.max(S.map.step, node.step + 1);
  const routeLog = result.text ? `${node.title} (${mapTypeLabel(node.type)}): ${result.text}` : `${node.title} (${mapTypeLabel(node.type)})`;
  S.map.pathHistory.push(routeLog);
  S.pendingNodeCompletion = null;
  S.mapEncounter = null;
  const afterReachable = reachableNodeIds().filter((id)=>!beforeReachable.has(id));
  S.recentUnlockedNodes = afterReachable;
  if(node.type === "boss"){
    cutscene("Act Cleared", "The gate falls silent. You have survived Act 1.", ()=>{
      S.hp = Math.min(S.maxHp, S.hp + 18);
      finishRun("win");
      localStorage.removeItem(RUN_SAVE_KEY);
      showRunSummary("win");
    });
    return;
  }
  autosave("node-complete");
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

function applyButtonFeedback(scope = document){
  scope.querySelectorAll("button, .card, .event-choice, .map-node").forEach((el)=>{
    if(el.dataset.juiced) return;
    el.dataset.juiced = "1";
    el.addEventListener("pointerdown", ()=>{
      if(el.disabled || el.classList.contains("disabled") || el.classList.contains("locked")) return;
      pulseElement(el, "button-press-pop", 160);
      playSfx("button", { throttleMs: 25 });
    });
  });
}

function animateRewardReveal(kind = "card"){
  const cls = kind === "relic" ? "relic-reveal" : "reward-reveal";
  const items = [...document.querySelectorAll(".reward-grid > button")];
  const rareClass = kind === "card" ? ".card-rare" : "";
  items.forEach((item, idx)=>{
    setTimeout(()=>{
      item.classList.add(cls);
      if(rareClass && item.querySelector(rareClass)) item.classList.add("relic-reveal");
      playSfx(kind === "relic" ? "reward_relic" : "reward_card", { throttleMs: 90 });
    }, scaledDelay(70 * idx));
  });
}

function showPhaseOverlay(text){
  const stage = document.getElementById("stage");
  if(!stage || !text) return;
  const overlay = document.createElement("div");
  overlay.className = "phase-overlay";
  overlay.textContent = text;
  stage.appendChild(overlay);
  setTimeout(()=>overlay.remove(), scaledDelay(980) || 980);
}

function pulseStage(className, duration){
  const stage = document.getElementById("stage");
  if(!stage) return;
  pulseElement(stage, className, duration);
}

function animateActor(selector, className, duration){
  const el = document.querySelector(selector);
  if(!el) return;
  pulseElement(el, className, duration);
}

function animatePlayerAction(card){
  if(!card) return;
  if(card.type === "Attack"){
    animateActor(".player-combat", "attack anim-player-attack", ANIMATION_PROFILE.player.attackMs);
    shakeScreen("light");
    playSfx("attack_light");
    return;
  }
  animateActor(".player-combat", "cast", ANIMATION_PROFILE.player.skillMs);
  pulseElement(".player-combat", "anim-status-apply", ANIMATION_PROFILE.player.skillMs);
}

function animateEnemyIntent(intent){
  if(!intent) return;
  pulseElement(".intent", "anim-status-apply", 180);
  if(intent.damage){
    animateActor("#enemy", "attack", ANIMATION_PROFILE.enemy.attackMs);
    playSfx("enemy_attack", { throttleMs:120 });
    const total = (intent.damage || 0) * (intent.hits || 1);
    if(total >= 22) shakeScreen("heavy");
    else if(total >= 15) shakeScreen("medium");
    else shakeScreen("light");
    return;
  }
  animateActor("#enemy", "chant anim-status-apply", ANIMATION_PROFILE.enemy.castMs);
}
function modal(title, body){
  G.innerHTML += `<div class="modal"><div class="modalbox"><h2>${title}</h2>${body}<button onclick="document.querySelector('.modal').remove()">Close</button></div></div>`;
  applyButtonFeedback(document.querySelector(".modal") || document);
}
function cardClassNames(cardInstance){
  const card = getCardInstanceDef(cardInstance);
  if(!card) return "card";
  return ["card", `card-${card.rarity}`, isCardUpgraded(cardInstance) ? "card-upgraded" : ""].filter(Boolean).join(" ");
}
function renderArchetypeChips(archetypes = []){
  if(!archetypes?.length) return "";
  return `<div class="archetype-row">${archetypes.map((a)=>`<span class="archetype-chip archetype-${a}">${a}</span>`).join("")}</div>`;
}
function renderCardSummary(cardInstance){
  const card = getCardInstanceDef(cardInstance);
  if(!card) return "";
  const tags = (card.tags || []).join(", ");
  return `<div class="${cardClassNames(cardInstance)}"><span class="cost">${card.unplayable ? "–" : card.cost}</span><h4>${card.name}</h4><div class="art"></div><div class="type">${card.type} · ${card.rarity}</div>${renderArchetypeChips(card.archetypes)}<div class="txt">${card.text}${tags ? `<br><span class="small">Keywords: ${tags}</span>` : ""}</div></div>`;
}
function getBuildSummary(){
  const counts = Object.fromEntries(BUILD_ARCHETYPES.map((a)=>[a,0]));
  const statusSignals = new Set();
  normalizeCardPile(S.deck).forEach((card)=>{
    const def = getCardInstanceDef(card);
    (def?.archetypes || []).forEach((a)=>{ if(counts[a] !== undefined) counts[a] += 1; });
    if(def?.apply?.Bleed) statusSignals.add("Bleed");
    if(def?.apply?.Burn) statusSignals.add("Burn");
    if(def?.apply?.Weak) statusSignals.add("Weak");
    if(def?.playerStatus?.Ward) statusSignals.add("Ward");
  });
  (S.relics || []).forEach((id)=>{
    (DB.relics[id]?.archetypes || []).forEach((a)=>{ if(counts[a] !== undefined) counts[a] += 1; });
  });
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const top = sorted.filter(([,v])=>v>0).slice(0,2).map(([k])=>k);
  return { counts, top, statusSignals:[...statusSignals], relics:(S.relics || []).map((id)=>DB.relics[id]?.name || id) };
}
function showBuildPanel(){
  const summary = getBuildSummary();
  const signalRows = Object.entries(summary.counts).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(([k,v])=>`${v} ${k}`).join(", ");
  modal("Run Identity", `<p>Current build leans: <b>${summary.top.join(" / ") || "Unfocused"}</b></p>
    <p>Deck signals: ${signalRows || "No archetypes detected yet."}</p>
    <p>Key statuses: ${summary.statusSignals.join(", ") || "None"}</p>
    <p><b>Relics:</b> ${summary.relics.join(", ") || "None"}</p>`);
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
  const build = getBuildSummary();
  modal("Deck", `<p>${deck.length} cards</p><p class="small">Current build leans: ${build.top.join(" / ") || "Unfocused"}</p><div class="deck-list">${rows || "<p>Deck empty.</p>"}</div>`);
}
function showCodex(){
  modal("Codex", `<p><b>Relics:</b> ${S.relics.map(id=>DB.relics[id].name).join(", ")}</p><p><b>Kills:</b> ${S.kills}</p><p><b>Deaths:</b> ${S.deaths}</p><p><b>False Ending:</b> ${S.falseEnding ? "Unlocked" : "Not yet"}</p><p><b>Direction:</b> Route choice is now the spine of each run.</p><button onclick="showBuildPanel()">Show Build Identity</button>`);
}
function quest(){
  toast("Choose your path carefully. Boss waits at the final step.");
}
function gainGold(amount){
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  if(!value) return 0;
  S.gold = (Number(S.gold) || 0) + value;
  if(S.combat?.log) S.combat.log.push(`You gained ${value} Echoes.`);
  return value;
}
function spendGold(amount){
  const value = Math.max(0, Math.floor(Number(amount) || 0));
  if(!canAfford(value)) return false;
  S.gold -= value;
  return true;
}
function canAfford(amount){
  return (Number(S.gold) || 0) >= Math.max(0, Math.floor(Number(amount) || 0));
}
function weightedPick(items, getWeight){
  const total = items.reduce((sum, item)=>sum + Math.max(0, getWeight(item) || 0), 0);
  if(!total) return pick(items);
  let roll = Math.random() * total;
  for(const item of items){
    roll -= Math.max(0, getWeight(item) || 0);
    if(roll <= 0) return item;
  }
  return items[0];
}
function pickEventForNode(node){
  const act = node?.act || S.map?.act || 1;
  const events = (DB.events || []).filter((event)=>(event.act || act) === act);
  if(!events.length) return { id:'fallback_event', title:'Fading Omen', description:'Nothing answers.', choices:[{text:'Continue', effects:{}, resultText:'The road remains.'}] };
  return weightedPick(events, (event)=>event.weight || 1);
}
function showEvent(eventId){
  setScreen("event");
  const event = (DB.events || []).find((entry)=>entry.id === eventId);
  if(!event){ toast('The omen fades.'); completeEvent({ text:'Event lost.' }); drawWorld(); return; }
  S.activeEvent = { id:event.id, nodeId:S.mapEncounter?.nodeId || S.selectedNodeId };
  G.innerHTML = `<div class="screen event-screen"><div class="top"><div><div class="logo">${event.title}</div><div class="small">${event.tags?.join(' · ') || 'Omen'}</div></div><div><span class="pill echoes-pill">Echoes ${S.gold}</span><span class="pill">HP ${S.hp}/${S.maxHp}</span></div></div><div class="event-wrap"><div class="event-card"><p>${event.description}</p></div><div class="event-choices">${(event.choices || []).map((choice, idx)=>renderEventChoice(choice, idx)).join('')}</div><button onclick="completeEvent({ text:'You leave the omen unanswered.' })">Leave</button></div></div>`;
  applyButtonFeedback(G);
}
function requirementReason(requirements = {}){
  if(requirements.minGold && !canAfford(requirements.minGold)) return `Need ${requirements.minGold} Echoes`;
  if(requirements.minDeck && S.deck.length < requirements.minDeck) return `Need at least ${requirements.minDeck} cards`;
  if(requirements.minUpgradeable){
    const count = S.deck.filter((card)=>{ const base = getCardDef(card); return base?.upgrade && !isCardUpgraded(card); }).length;
    if(count < requirements.minUpgradeable) return 'No upgradable cards';
  }
  if(requirements.requireFlag && !S.flags?.[requirements.requireFlag]) return `Requires flag: ${requirements.requireFlag}`;
  return '';
}
function canTakeEventChoice(choice){
  const why = requirementReason(choice.requirements || {});
  return { ok: !why, why };
}
function renderEventChoice(choice, idx){
  const gate = canTakeEventChoice(choice);
  return `<button class="event-choice ${gate.ok ? '' : 'disabled-choice'}" ${gate.ok ? `onclick="applyEventChoice(${idx})"` : 'disabled'}><b>${choice.text || 'Unknown choice'}</b><div class="small">${choice.description || ''}</div>${gate.ok ? '' : `<div class="small">${gate.why}</div>`}</button>`;
}
function pickRandomCard(options = {}){
  const entries = Object.entries(DB.cards || {}).filter(([, card])=>card.type !== 'Curse');
  const filtered = options.rarity ? entries.filter(([, card])=>card.rarity === options.rarity) : entries;
  return pick((filtered.length ? filtered : entries).map(([id])=>id));
}
function applyEventChoice(choiceIndex){
  const event = (DB.events || []).find((entry)=>entry.id === S.activeEvent?.id);
  const choice = event?.choices?.[choiceIndex];
  if(!choice) return;
  const gate = canTakeEventChoice(choice);
  if(!gate.ok) return toast(gate.why);
  const effects = choice.effects || {};
  let delayedCombat = false;
  if(effects.loseGold) spendGold(effects.loseGold);
  if(effects.gainGold) gainGold(effects.gainGold);
  if(effects.loseHP) S.hp = Math.max(1, S.hp - Math.floor(effects.loseHP));
  if(effects.gainHP){
    const amount = typeof effects.gainHP === 'string' && effects.gainHP.includes('%') ? Math.floor(S.maxHp * (parseInt(effects.gainHP, 10) / 100)) : Math.floor(effects.gainHP);
    S.hp = Math.min(S.maxHp, S.hp + Math.max(0, amount));
  }
  if(effects.maxHP) S.maxHp = Math.max(1, S.maxHp + Math.floor(effects.maxHP));
  if(effects.gainRelic && DB.relics[effects.gainRelic]){ S.relics.push(effects.gainRelic); markDiscovered("relic", effects.gainRelic); updateRunStats("relic_found"); }
  if(effects.gainRandomRelic){ const relic = pickRelicCandidates(1)[0]; if(relic){ S.relics.push(relic); markDiscovered("relic", relic); updateRunStats("relic_found"); } }
  if(effects.gainCard && DB.cards[effects.gainCard]){ addCardToDeck(effects.gainCard); markDiscovered("card", effects.gainCard); updateRunStats("card_picked"); }
  if(effects.gainRandomCard){
    const options = typeof effects.gainRandomCard === 'object' ? effects.gainRandomCard : {};
    const id = pickRandomCard(options);
    if(id){ addCardToDeck(id, { upgraded: Boolean(options.upgraded) }); markDiscovered("card", id); updateRunStats("card_picked"); }
  }
  if(effects.addCurse && DB.cards[effects.addCurse]){ addCardToDeck(effects.addCurse); M.achievementCounters.cursesAddedTotal += 1; }
  if(effects.addTemporaryCurse && DB.cards[effects.addTemporaryCurse]) S.tempNextCombatCards.push(effects.addTemporaryCurse);
  if(effects.gainWard) S.nextCombat.ward = (S.nextCombat.ward || 0) + Number(effects.gainWard || 0);
  if(effects.gainStatus?.nextCombatBuff) Object.entries(effects.gainStatus.nextCombatBuff).forEach(([k,v])=>S.nextCombat[k] = (S.nextCombat[k] || 0) + Number(v || 0));
  if(effects.gainStatus?.nextCombat) Object.entries(effects.gainStatus.nextCombat).forEach(([k,v])=>S.nextCombatStatus[k] = (S.nextCombatStatus[k] || 0) + Number(v || 0));
  if(effects.gainStatusSelf?.Bleed) S.hp = Math.max(1, S.hp - Number(effects.gainStatusSelf.Bleed));
  if(effects.setFlag) S.flags[effects.setFlag] = true;
  if(effects.removeCard) return showDeckPicker('Remove a card', (index)=>{ removeCardFromDeck(index); finishEventChoice(choice, effects); });
  if(effects.transformCard) return showDeckPicker('Transform a card', (index)=>{ const next = pickRandomCard({}); transformCardInDeck(index, next); finishEventChoice(choice, effects); });
  if(effects.upgradeChosenCard) return showDeckPicker('Upgrade a card', (index)=>{ S.deck.splice(index, 1, upgradeCardInstance(S.deck[index])); finishEventChoice(choice, effects); }, { onlyUpgradeable:true });
  if(effects.upgradeRandomCard){
    const up = S.deck.map((c,i)=>({c,i})).filter(({c})=>{const base=getCardDef(c); return base?.upgrade && !isCardUpgraded(c);});
    if(up.length){ const pickUp = pick(up); S.deck.splice(pickUp.i, 1, upgradeCardInstance(S.deck[pickUp.i])); }
  }
  if(effects.duplicateCard){
    if(typeof effects.duplicateCard === 'string' && DB.cards[effects.duplicateCard]) addCardToDeck(effects.duplicateCard);
    else if(S.deck.length) duplicateCardInDeck(Math.floor(Math.random()*S.deck.length));
  }
  finishEventChoice(choice, effects);
}
function finishEventChoice(choice, effects){
  if(effects.revealNextNodes) S.eventMeta.revealNextNodes = true;
  if(effects.scoutElite) S.eventMeta.scoutElite = true;
  if(effects.gainMapVision) S.eventMeta.gainMapVision = (S.eventMeta.gainMapVision || 0) + Number(effects.gainMapVision || 0);
  const result = choice.resultText || 'The omen passes.';
  if(effects.startCombat){
    S.eventPendingRewards = effects;
    completeEvent({ text: result, startCombat:true });
    return;
  }
  completeEvent({ text: result });
}
function completeEvent(result){
  const nodeId = S.activeEvent?.nodeId || S.mapEncounter?.nodeId || S.selectedNodeId;
  const text = result?.text || 'Event resolved.';
  if(result?.startCombat){
    toast(text);
    const enemyId = pickEnemyForNode({ type:'combat' });
    S.pendingEventResultText = text;
    S.pendingNodeCompletion = nodeId;
    S.activeEvent = null;
    return startCombat(enemyId, nodeId);
  }
  S.activeEvent = null;
  completeCurrentNode({ nodeId, text });
  drawWorld();
}
function showDeckPicker(title, onPick, options = {}){
  const cards = normalizeCardPile(S.deck).map((card, index)=>({ card, index })).filter(({ card })=>{
    if(!options.onlyUpgradeable) return true;
    const base = getCardDef(card);
    return base?.upgrade && !isCardUpgraded(card);
  });
  const body = cards.map(({ card, index })=>`<button class="deck-picker-btn" onclick="window.__deckPick(${index})">${renderCardSummary(card)}</button>`).join('');
  window.__deckPick = (index)=>{ document.querySelector('.modal')?.remove(); onPick(index); drawWorld(); };
  modal(title, `<div class="deck-picker">${body || '<p>No valid cards.</p>'}</div>`);
}
function generateShopInventory(){
  const priceMult = getShopPriceMultiplier();
  const cards = generateCardRewardChoices('combat').map((id)=>{
    const rarity = DB.cards[id]?.rarity || 'common';
    const priceByRarity = { common:45, uncommon:70, rare:110 };
    return { id, price: Math.round((priceByRarity[rarity] || 60) * priceMult), sold:false };
  });
  const relicIds = pickRelicCandidates(2);
  const relics = relicIds.map((id)=>({ id, price: Math.round((140 + Math.floor(Math.random() * 81)) * priceMult), sold:false }));
  return { cards, relics, removalCost: Math.round((75 + ((S.shopRemovalCount || 0) * 25)) * priceMult), healCost:Math.round(50 * priceMult) };
}
function showShop(node){
  setScreen("shop");
  const nodeId = typeof node === 'string' ? node : node.id;
  const target = nodeById(nodeId);
  if(!target.shopInventory) target.shopInventory = generateShopInventory();
  S.currentShop = { nodeId };
  const inv = target.shopInventory;
  G.innerHTML = `<div class="screen shop-screen"><div class="top"><div><div class="logo">Veiled Merchant</div><div class="small">Everything costs Echoes.</div></div><div><span class="pill echoes-pill">Echoes ${S.gold}</span></div></div><div class="shop-wrap"><div class="shop-grid">${inv.cards.map((entry, i)=>`<div class="shop-item ${entry.sold ? 'sold-out' : ''}"><b>${DB.cards[entry.id]?.name || entry.id}</b><div class="small">Card</div><div class="price-tag">${entry.price}</div><button ${entry.sold ? 'disabled' : `onclick="buyShopCard(${i})"`}>${entry.sold ? 'Sold' : 'Buy'}</button></div>`).join('')}${inv.relics.map((entry, i)=>`<div class="shop-item ${entry.sold ? 'sold-out' : ''}"><b>${DB.relics[entry.id]?.name || entry.id}</b><div class="small">Relic</div><div class="price-tag">${entry.price}</div><button ${entry.sold ? 'disabled' : `onclick="buyShopRelic(${i})"`}>${entry.sold ? 'Sold' : 'Buy'}</button></div>`).join('')}</div><div class="shop-services"><button onclick="buyCardRemoval()">Purge a card (${inv.removalCost})</button><button onclick="buyHeal()">Heal (${inv.healCost})</button><button onclick="leaveShop()">Leave Shop</button></div></div></div>`;
}
function activeShopNode(){ return nodeById(S.currentShop?.nodeId || S.mapEncounter?.nodeId || S.selectedNodeId); }
function buyShopCard(index){
  const node = activeShopNode(); const entry = node?.shopInventory?.cards?.[index];
  if(!entry || entry.sold) return;
  if(!spendGold(entry.price)) return toast('Not enough Echoes.');
  addCardToDeck(entry.id); entry.sold = true;
  markDiscovered("card", entry.id);
  updateRunStats("card_picked");
  autosave("shop-purchase");
  showShop(node);
}
function buyShopRelic(index){
  const node = activeShopNode(); const entry = node?.shopInventory?.relics?.[index];
  if(!entry || entry.sold) return;
  if(!spendGold(entry.price)) return toast('Not enough Echoes.');
  S.relics.push(entry.id); entry.sold = true;
  markDiscovered("relic", entry.id);
  updateRunStats("relic_found");
  autosave("shop-purchase");
  showShop(node);
}
function buyCardRemoval(){
  const node = activeShopNode(); if(!node) return;
  const cost = node.shopInventory.removalCost;
  if(!spendGold(cost)) return toast('Not enough Echoes.');
  node.shopInventory.removalCost += 25;
  S.shopRemovalCount = (S.shopRemovalCount || 0) + 1;
  showDeckPicker('Choose a card to purge', (index)=>{ const removed = removeCardFromDeck(index); toast(`Removed ${getCardInstanceDef(removed)?.name || 'card'}.`); showShop(node); });
}
function buyHeal(){
  const node = activeShopNode(); if(!node) return;
  if(!spendGold(node.shopInventory.healCost)) return toast('Not enough Echoes.');
  const heal = Math.max(15, Math.floor(S.maxHp * 0.25));
  S.hp = Math.min(S.maxHp, S.hp + heal);
  toast(`Recovered ${heal} HP.`);
  showShop(node);
}
function leaveShop(){
  const nodeId = S.currentShop?.nodeId || S.mapEncounter?.nodeId || S.selectedNodeId;
  S.currentShop = null;
  completeCurrentNode({ nodeId, text:'You leave the merchant with lighter pockets.' });
  drawWorld();
}
function restHealAmount(){
  return Math.max(10, Math.floor(S.maxHp * 0.3));
}
function showRestSite(nodeId){
  setScreen("rest");
  const purgeCost = 60 + ((S.restPurgeCount || 0) * 20);
  G.innerHTML = `<div class="screen rest-screen"><div class="top"><div><div class="logo">Quiet Lantern</div><div class="small">A sanctuary between bells.</div></div><div><span class="pill">HP ${S.hp}/${S.maxHp}</span><span class="pill echoes-pill">Echoes ${S.gold}</span></div></div><div class="rest-wrap"><p>Choose one rite.</p><div class="rest-actions"><button onclick="restAtSite('${nodeId}')">Rest (+${restHealAmount()} HP)</button><button onclick="showRestUpgradePicker('${nodeId}')">Upgrade</button><button onclick="restPurge('${nodeId}', ${purgeCost})">Purge (${purgeCost})</button><button onclick="restMeditate('${nodeId}')">Meditate (+1 Ward next combat)</button></div></div></div>`;
}
function restAtSite(nodeId){
  S.hp = Math.min(S.maxHp, S.hp + restHealAmount());
  autosave("rest-action");
  completeCurrentNode({ nodeId, text:'You rested at the Quiet Lantern.' });
  drawWorld();
}
function showRestUpgradePicker(nodeId){
  showDeckPicker('Upgrade one card', (index)=>{ S.deck.splice(index, 1, upgradeCardInstance(S.deck[index])); completeCurrentNode({ nodeId, text:'You refined a memory at the sanctuary.' }); drawWorld(); }, { onlyUpgradeable:true });
}
function restPurge(nodeId, cost){
  if(!spendGold(cost)) return toast('Not enough Echoes.');
  S.restPurgeCount = (S.restPurgeCount || 0) + 1;
  autosave("rest-action");
  showDeckPicker('Purge one card', (index)=>{ removeCardFromDeck(index); completeCurrentNode({ nodeId, text:'You offered a memory to the ash.' }); drawWorld(); });
}
function restMeditate(nodeId){
  S.nextCombat.ward = (S.nextCombat.ward || 0) + 1;
  S.nextCombat.draw = (S.nextCombat.draw || 0) + 1;
  autosave("rest-action");
  completeCurrentNode({ nodeId, text:'You meditated beneath dead lanterns.' });
  drawWorld();
}
function triggerRelics(hook, payload = {}){
  if(!RELIC_HOOKS.has(hook) || !Array.isArray(S?.relics)) return;
  for(const relicId of S.relics){
    switch(relicId){
      case "pilgrims_nail":
        if(hook === "blockGained" && !S.combat.flags?.firstBlockTriggered){
          S.combat.flags.firstBlockTriggered = true;
          gainBlock(DB.relics.pilgrims_nail.value, { fromRelic:true });
          relicLog("Saint's Buckler grants +3 Block.");
        }
        break;
      case "bellplate_charm":
        if(hook === "skillPlayed" && S.combat.skillsPlayed % 3 === 0){
          gainBlock(DB.relics.bellplate_charm.value, { fromRelic:true });
          relicLog("Iron Psalm grants +5 Block.");
        }
        break;
      case "bone_prayer_beads":
        if(hook === "turnStart" && S.combat.turn === 1){
          S.combat.energy += DB.relics.bone_prayer_beads.value;
          relicLog("Ashen Spur grants +1 energy.");
        }
        break;
      case "rusted_fang":
        if(hook === "bleedApplied" && payload.enemy){
          payload.enemy.hp -= DB.relics.rusted_fang.value;
          enemyHitFx(DB.relics.rusted_fang.value); floatFeedback(`-${DB.relics.rusted_fang.value}`, "enemy", "damage");
          relicLog("Bloodglass Thorn spikes extra damage.");
        }
        break;
      case "hollow_crown":
        if(hook === "combatStart"){
          S.combat.hand.push(createCardInstance("dissonance", { temporary:true }));
          drawCards(1);
          relicLog("Debt Bell tolls: Dissonance added, then draw 1.");
        }
        break;
      case "red_thread_spool":
        if(hook === "turnEnd" && ["elite","boss"].includes(S.combat.enemy.tier) && (S.combat.enemy.status.Bleed || 0) > 0){
          const bleed = S.combat.enemy.status.Bleed;
          S.combat.enemy.hp -= bleed;
          S.combat.enemy.status.Bleed = Math.max(0, S.combat.enemy.status.Bleed - 1);
          floatFeedback(`Bleed ${bleed}`, "enemy", "bleed");
          playSfx("bleed_tick");
          relicLog("Red Thread Spool triggers an extra Bleed tick.");
        }
        break;
      case "butchers_prayer":
        if(hook === "combatStart") applyEnemyStatus({ Bleed: DB.relics.butchers_prayer.value });
        break;
      case "hollow_ink":
        if(hook === "cardAddedDuringCombat" && payload.cardType === "Curse"){
          applyPlayerStatus({ Strength: DB.relics.hollow_ink.value }, "self");
          relicLog("Hollow Ink converts Curse into Strength.");
        }
        break;
      case "broken_metronome":
        if(hook === "cardPlayed" && S.combat.cardsPlayedThisTurn % 4 === 0){
          S.combat.enemy.hp -= DB.relics.broken_metronome.value;
          enemyHitFx(DB.relics.broken_metronome.value); floatFeedback(`-${DB.relics.broken_metronome.value}`, "enemy", "damage");
          relicLog("Broken Metronome strikes on the 4th card.");
        }
        break;
      case "ember_nail":
        if(hook === "burnApplied" && payload.enemy){
          payload.enemy.status.Burn = (payload.enemy.status.Burn || 0) + DB.relics.ember_nail.value;
          relicLog("Ember Nail adds +1 Burn.");
        }
        break;
      case "furnace_saint":
        if(hook === "turnEnd"){
          const burn = S.combat.enemy.status.Burn || 0;
          if(burn > 0){
            S.combat.enemy.hp -= burn;
            S.combat.enemy.status.Burn = Math.max(0, burn - 1);
            floatFeedback(`Burn ${burn}`, "enemy", "burn");
            playSfx("burn_tick");
            relicLog("Furnace Saint ignites stored Burn.");
          }
        }
        break;
      case "wax_lantern":
        if(hook === "combatStart") applyPlayerStatus({ Ward: DB.relics.wax_lantern.value }, "self");
        break;
      case "pale_seal":
        if(hook === "debuffBlocked") gainBlock(DB.relics.pale_seal.value, { fromRelic:true });
        break;
      case "beast_crown_splinter":
        if(hook === "attackPlayed" && S.combat.attacksPlayed % 3 === 0) applyPlayerStatus({ Strength: DB.relics.beast_crown_splinter.value }, "self");
        break;
      case "red_muscle_idol":
        if(hook === "statusApplied" && payload.target === "player" && payload.status === "Strength"){
          gainBlock(DB.relics.red_muscle_idol.value, { fromRelic:true });
        }
        break;
      case "mercy_root":
        if(hook === "turnEnd" && S.combat.block > 0){
          S.combat.retainBlockNextTurn = Math.max(S.combat.retainBlockNextTurn || 0, DB.relics.mercy_root.value);
          relicLog("Stone-Vow Rosary stores Block for next turn.");
        }
        break;
      case "still_hand":
        if(hook === "turnEnd" && S.combat.attacksPlayed === 0){
          S.combat.drawBonusNextTurn = (S.combat.drawBonusNextTurn || 0) + DB.relics.still_hand.value;
          relicLog("Still Hand grants +1 draw next turn.");
        }
        break;
    }
  }
}
function modifyByRelics(hook, value, payload = {}){
  let out = value;
  if(!RELIC_HOOKS.has(hook)) return out;
  for(const relicId of S.relics || []){
    if(relicId === "dull_whetstone" && hook === "modifyAttackDamage" && payload.firstAttack) out += DB.relics.dull_whetstone.value;
    if(relicId === "vein_drinker" && hook === "modifyAttackDamage" && (S.combat.enemy.status.Burn || 0) > 0) out += DB.relics.vein_drinker.value;
    if(relicId === "blindfold_charm" && hook === "modifyEnemyIntentDamage" && payload.firstEnemyAttack) out = Math.max(0, out - DB.relics.blindfold_charm.value);
    if(relicId === "infant_bell" && hook === "modifyCardCost" && payload.card?.type === "Curse" && !S.combat.flags?.firstCursePlayed){
      S.combat.flags.firstCursePlayed = true;
      out = 0;
    }
    if(relicId === "cracked_charm" && hook === "modifyCardCost" && !S.combat.flags?.firstCardPlayed) out = 0;
    if(relicId === "quiet_needle" && hook === "modifyWeakApplication") out += 1;
  }
  return out;
}

function startCombat(enemyId, nodeId = null){
  const node = nodeId ? nodeById(nodeId) : null;
  const e = applyDifficultyToEnemy(DB.enemies[enemyId], node?.type || "combat");
  if(!e){
    toast("Combat failed: missing enemy data.");
    drawWorld();
    return;
  }
  if(S.truePilgrimage) e.hp = Math.floor(e.hp * 1.3);
  e.maxHp = e.hp; e.turn = 0; e.block = 0; e.status = {};
  e.moves = normalizeEnemyMoves(e);
  e.phaseIndex = -1;
  e.phaseName = e.phaseName || "Phase 1";
  S.pendingNodeCompletion = nodeId;
  const deck = S.deck.slice();
  S.combat = {
    enemy:e, draw:shuffle(deck), hand:[], discard:[], exhaust:[],
    energy:3,
    block:0,
    fortify:0, str:0, weak:0, frail:0, blight:0, bleed:0, bonus:0, bled:false,
    counter:0, turn:1, firstAtk:true, firstSkill:true, skillsPlayed:0, blockMeter:0,
    powers:{}, log:[`${e.name} appears.`], nextTurnDrain:0, locked:false, cardsPlayedThisTurn:0, attacksPlayed:0,
    drawBonusNextTurn:0, retainBlockNextTurn:0, flags:{},
    enemyState:{ turn:1, moveUses:{}, moveCooldowns:{}, lastMoves:[], currentMoveId:null }
  };
  S.combat.enemyState.currentMoveId = chooseEnemyMove();
  triggerRelics("combatStart", { enemy:e });
  markDiscovered("enemy", enemyId);
  applyBossDifficultyModifiers();
  applyNextCombatBuffs();
  drawCards(5 + (S.combat.drawBonusNextTurn || 0));
  S.combat.drawBonusNextTurn = 0;
  combatUI();
}
function applyNextCombatBuffs(){
  const buffs = S.nextCombat || {};
  const statuses = S.nextCombatStatus || {};
  const tempCards = Array.isArray(S.tempNextCombatCards) ? [...S.tempNextCombatCards] : [];
  if(!S.combat) return;
  if(buffs.ward) S.combat.ward = (S.combat.ward || 0) + buffs.ward;
  if(buffs.strength) S.combat.str = (S.combat.str || 0) + buffs.strength;
  if(buffs.block) S.combat.block = (S.combat.block || 0) + buffs.block;
  if(buffs.energy) S.combat.energy += buffs.energy;
  if(buffs.draw) S.combat.drawBonusNextTurn = (S.combat.drawBonusNextTurn || 0) + buffs.draw;
  Object.entries(statuses).forEach(([key, value])=>{ S.combat[key.toLowerCase()] = (S.combat[key.toLowerCase()] || 0) + Number(value || 0); });
  tempCards.forEach((cardId)=>{ if(DB.cards[cardId]) S.combat.discard.push(createCardInstance(cardId, { temporary:true })); });
  const summary = [];
  if(buffs.ward) summary.push(`Ward ${buffs.ward}`);
  if(buffs.strength) summary.push(`Strength ${buffs.strength}`);
  if(buffs.block) summary.push(`Block ${buffs.block}`);
  if(buffs.draw) summary.push(`Draw +${buffs.draw}`);
  if(buffs.energy) summary.push(`Energy +${buffs.energy}`);
  if(Object.keys(statuses).length) summary.push(`Statuses ${Object.keys(statuses).join(', ')}`);
  if(tempCards.length) summary.push(`Temporary curse ${tempCards.length}`);
  if(summary.length) S.combat.log.push(`Next-combat buffs applied: ${summary.join(' · ')}`);
  S.nextCombat = { ward:0, strength:0, block:0, draw:0, energy:0 };
  S.nextCombatStatus = {};
  S.tempNextCombatCards = [];
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
  }
}
function activeEnemyMoves(){
  const E = S.combat.enemy;
  const phaseMoves = E.phases?.[E.phaseIndex]?.moves;
  return normalizeEnemyMoves({ moves: phaseMoves?.length ? phaseMoves : E.moves });
}
function currentIntent(){
  const state = S.combat.enemyState;
  return activeEnemyMoves().find((move)=>move.id === state.currentMoveId) || activeEnemyMoves()[0];
}
function canEnemyUseMove(move, enemyState){
  const turn = enemyState.turn;
  if((move.minTurn || 1) > turn) return false;
  if(move.maxUses && (enemyState.moveUses[move.id] || 0) >= move.maxUses) return false;
  if((enemyState.moveCooldowns[move.id] || 0) > 0) return false;
  if(move.avoidRepeat && enemyState.lastMoves[0] === move.id) return false;
  return true;
}
function rememberEnemyMove(moveId){
  const state = S.combat.enemyState;
  state.lastMoves.unshift(moveId);
  state.lastMoves = state.lastMoves.slice(0, 3);
}
function chooseEnemyMove(){
  const state = S.combat.enemyState;
  const moves = activeEnemyMoves();
  const valid = moves.filter((move)=>canEnemyUseMove(move, state));
  const pickable = valid.length ? valid : moves;
  let total = pickable.reduce((sum, move)=>sum + (move.weight || 1), 0);
  let roll = Math.random() * total;
  for(const move of pickable){
    roll -= (move.weight || 1);
    if(roll <= 0) return move.id;
  }
  return pickable[0]?.id;
}
function getEnemyIntentDescription(move){
  if(!move) return "? Unknown";
  const parts = [];
  if(move.damage){
    const hits = move.hits || 1;
    parts.push(hits > 1 ? `${move.damage}x${hits} damage` : `${move.damage} damage`);
  }
  if(move.block) parts.push(`${move.block} Block`);
  if(move.heal) parts.push(`Heal ${move.heal}`);
  if(move.applyEnemy) parts.push(...Object.entries(move.applyEnemy).map(([k,v])=>`${k} ${v} (self)`));
  if(move.selfStatus) parts.push(...Object.entries(move.selfStatus).map(([k,v])=>`${k} ${v} (self)`));
  if(move.applyPlayer) parts.push(...Object.entries(move.applyPlayer).map(([k,v])=>`${k} ${v}`));
  if(move.playerStatus) parts.push(...Object.entries(move.playerStatus).map(([k,v])=>`${k} ${v}`));
  if(move.addTemporaryCardToDiscard || move.addCardToPlayerDeck || move.addTemporaryCardToHand){
    const card = move.addTemporaryCardToDiscard || move.addCardToPlayerDeck || move.addTemporaryCardToHand;
    parts.push(`Adds ${DB.cards[card]?.name || card}`);
  }
  if(move.drainEnergyNextTurn) parts.push(`-${move.drainEnergyNextTurn} Energy next turn`);
  return `${move.intentIcon || "?"} ${move.name} · ${parts.join(" + ") || move.intentText || "Special"}`;
}
function intentText(it){
  return getEnemyIntentDescription(it);
}

function statusInfo(key){
  return STATUS_INFO[key] || "Status effect";
}

function statusChips(statusPairs){
  if(!statusPairs.length) return '<div class="status-row empty">No status effects</div>';
  return `<div class="status-row">${statusPairs.map(([k,v]) => `<span class="status-chip" title="${statusInfo(k)}">${k.toUpperCase()} ${v}</span>`).join("")}</div>`;
}
function combatUI(){
  setScreen("combat");
  const C = S.combat, E = C.enemy, it = currentIntent();
  const enemyStatuses = Object.entries(E.status || {}).filter(([,v])=>v>0);
  const playerStatuses = [["Strength", C.str||0], ["Weak", C.weak||0], ["Frail", C.frail||0], ["Blight", C.blight||0], ["Bleed", C.bleed||0], ["Ward", C.ward||0], ["Fortify", C.fortify||0]].filter(([,v])=>v>0);
  const hp = Math.max(0, E.hp/E.maxHp*100), php = Math.max(0, S.hp/S.maxHp*100);
  const intentDanger = (it?.damage || 0) * (it?.hits || 1) >= 15;
  G.innerHTML = `<div class="combat">
    ${renderRunHud()}
    <div class="top"><div><div class="logo">${E.name}</div><div class="small">Turn ${C.turn}</div><div class="enemy-meta"><span class="tier tier-${E.tier || "normal"}">${(E.tier || "normal").toUpperCase()}</span>${E.phaseName ? `<span class="phase-pill">${E.phaseName}</span>` : ""}</div>${renderArchetypeChips(E.archetypes || [])}<div class="small">${E.behaviorHint || ""}</div></div><div><span class="pill">HP ${S.hp}/${S.maxHp}</span><span class="pill energy">${C.energy}⚡</span></div></div>
    <div class="stage" id="stage">
      <div class="embers"></div>
      <div class="fog"></div>
      <div class="bars"><div class="bar"><div class="fill" style="width:${hp}%"></div></div><div class="bar"><div class="fill" style="width:${php}%"></div></div></div>
      <div class="intent ${intentDanger ? "intent-danger" : ""}">${intentText(it)}</div>
      <div class="enemy ${E.class || ""} tier-${E.tier || "normal"}" id="enemy"><div class="core"></div><div class="head"></div><div class="eye"></div><div class="robe"></div><div class="bells"></div><div class="face"></div></div>
      <div class="player player-combat"><div class="cloak"></div><div class="head"></div><div class="body"></div><div class="lamp"></div><div class="blade"></div></div>
    </div>
    <div class="combat-actions"><div>Block ${C.block} · <button onclick="showPile('draw')">Draw ${C.draw.length}</button> · <button onclick="showPile('discard')">Discard ${C.discard.length}</button> · <button onclick="showPile('exhaust')">Exhaust ${C.exhaust.length}</button> · <button onclick="showDeck()">Deck</button> · <button onclick="showCombatLog()">Combat Log</button>${statusChips(enemyStatuses)}${statusChips(playerStatuses)}<div class="log">${C.log.slice(-3).join(" / ")}</div></div><button onclick="endTurn()" ${C.locked ? "disabled" : ""}>End Turn</button></div>
    <div class="hand">${C.hand.map((card,i)=>cardHTML(card,i)).join("")}</div>
    ${renderBottomNav()}
  </div>`;
  applyButtonFeedback(G);
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
  cost = modifyByRelics("modifyCardCost", cost, { card:ca });
  const dis = C.locked || ca.unplayable || cost > C.energy;
  const classes = [cardClassNames(cardInstance), dis ? "disabled" : "playable"].join(" ");
  return `<div class="${classes}" data-index="${i}" onclick="${dis ? "" : `playCard(${i})`}"><span class="cost">${ca.unplayable ? "–" : cost}</span><h4>${ca.name}</h4><div class="art"></div><div class="type">${ca.type} · ${ca.rarity}</div>${renderArchetypeChips(ca.archetypes)}<div class="txt">${ca.text}</div></div>`;
}
const feedbackStacks = { enemy:0, player:0, center:0 };

function floatFeedback(text, target = "enemy", type = "status"){
  const stage = document.getElementById("stage");
  if(!stage) return;
  const f = document.createElement("div");
  const stack = feedbackStacks[target] || 0;
  feedbackStacks[target] = (stack + 1) % 6;
  f.className = `float-feedback target-${target} feedback-${type}`;
  f.style.setProperty("--float-offset", `${stack * 14}px`);
  f.textContent = text;
  stage.appendChild(f);
  const ttl = scaledDelay(640) || 640;
  setTimeout(()=>{
    f.remove();
    feedbackStacks[target] = Math.max(0, (feedbackStacks[target] || 1) - 1);
  }, ttl);
}

function enemyHitFx(damage = 0){
  const en = document.getElementById("enemy");
  pulseElement(en, "hit anim-enemy-hit flash-hit", ANIMATION_PROFILE.enemy.hurtMs);
  if(damage >= 20) shakeScreen("heavy");
  else if(damage >= 15) shakeScreen("medium");
  else shakeScreen("light");
}
function damageEnemy(amount, hits=1){
  const C = S.combat, E = C.enemy;
  let total=0;
  for(let h=0;h<hits;h++){
    let dmg = amount + C.str;
    if(C.bonus){ dmg += C.bonus; C.bonus = 0; }
    if(E.status.Weak>0) dmg = Math.floor(dmg * 1.1);
    const blocked = Math.min(E.block || 0, dmg);
    E.block = (E.block || 0) - blocked;
    dmg -= blocked;
    E.hp -= dmg; total += dmg;
  }
  C.log.push(`Dealt ${total}.`);
  triggerRelics("damageDealt", { amount:total });
  enemyHitFx(total); floatFeedback(`-${total}`, "enemy", "damage");
}
function gainBlock(amount, options = {}){
  const C = S.combat;
  if(C.frail>0) amount = Math.floor(amount*.75);
  C.block += amount;
  M.achievementCounters.blockGainedTotal += Math.max(0, amount);
  C.log.push(`Gained ${amount} Block.`);
  pulseElement(".combat-actions", "anim-block-gain", 260);
  playSfx("block");
  floatFeedback(`+${amount} Block`, "player", "block");
  if(!options.fromRelic) triggerRelics("blockGained", { amount });
}
function applyEnemyStatus(obj){
  const E = S.combat.enemy;
  Object.entries(obj||{}).forEach(([k,v])=>{
    let amount = v;
    if(k === "Weak") amount = modifyByRelics("modifyWeakApplication", v, { source:"card" });
    E.status[k]=(E.status[k]||0)+amount;
    if(k === "Bleed"){ triggerRelics("bleedApplied", { enemy:E, amount }); M.achievementCounters.bleedAppliedTotal += Math.max(0, amount); }
    if(k === "Burn"){ triggerRelics("burnApplied", { enemy:E, amount }); M.achievementCounters.burnAppliedTotal += Math.max(0, amount); }
    triggerRelics("statusApplied", { target:"enemy", status:k, amount });
    S.combat.log.push(`${E.name} gains ${k}.`);
  });
}
function isNegativePlayerStatus(k){
  return ["Weak", "Frail", "Blight", "Bleed", "Bound", "Doom"].includes(k);
}

function applyPlayerStatus(obj, source = "self"){
  const C = S.combat;
  Object.entries(obj||{}).forEach(([k,v])=>{
    if(source === "enemy" && isNegativePlayerStatus(k) && (C.ward || 0) > 0){
      C.ward -= 1;
      M.achievementCounters.wardBlockedTotal += 1;
      C.log.push(`Ward negated ${k}.`);
      flashElement(".combat-actions", "flash-ward", 220);
      playSfx("ward");
      floatFeedback("Ward!", "player", "ward");
      triggerRelics("debuffBlocked", { status:k });
      return;
    }
    if(k==="Strength") C.str += v;
    else C[k.toLowerCase()] = (C[k.toLowerCase()]||0)+v;
    triggerRelics("statusApplied", { target:"player", status:k, amount:v });
    C.log.push(`You gain ${k}.`);
    pulseElement(".status-row", "anim-status-apply", 280);
    playSfx("status", { throttleMs:120 });
    floatFeedback(`${k} +${v}`, "player", "status");
  });
}

function maybeTriggerBossPhase(){
  const C = S.combat;
  const E = C.enemy;
  if(E.tier !== "boss" || !Array.isArray(E.phases)) return false;
  const hpRatio = E.hp / E.maxHp;
  for(let i = 0; i < E.phases.length; i++){
    const phase = E.phases[i];
    if(E.phaseIndex < i && hpRatio <= phase.threshold){
      E.phaseIndex = i;
      E.phaseName = phase.name;
      C.log.push(`${E.name} enters phase: ${phase.name}.`);
      pulseElement("#enemy", "anim-boss-phase", 420);
      pulseElement(".intent", "flash-hit", 260);
      shakeScreen("heavy");
      playSfx("boss_phase", { throttleMs: 260 });
      floatFeedback(phase.name, "center", "status");
      showPhaseOverlay(phase.name);
      if(phase.onEnter?.applyEnemy) applyEnemyStatus(phase.onEnter.applyEnemy);
      if(phase.onEnter?.applyPlayer) applyPlayerStatus(phase.onEnter.applyPlayer, "enemy");
      if(phase.onEnter?.block){
        E.block = (E.block || 0) + phase.onEnter.block;
        floatFeedback(`+${phase.onEnter.block} Block`, "enemy", "block");
      }
      if(phase.onEnter?.special?.id === "burnPunish"){
        if((C.burn || 0) > 0){
          applyEnemyStatus({ Burn: phase.onEnter.special.enemyBurnIfPlayerAlreadyBurning || 1 });
        } else {
          applyPlayerStatus({ Burn: phase.onEnter.special.playerBurn || 1 }, "enemy");
        }
      }
      C.enemyState.currentMoveId = chooseEnemyMove();
      return true;
    }
  }
  return false;
}

function performEnemyMove(move){
  const C = S.combat;
  const E = C.enemy;
  animateEnemyIntent(move);
  if(move.damage){
    const hits = move.hits || 1;
    let totalTaken = 0;
    for(let i=0;i<hits;i++){
      let dmg = move.damage + (E.status.Strength || 0);
      if(E.status.Weak > 0) dmg = Math.floor(dmg * 0.75);
      if(move.special?.id === "bonusIfPlayerStatus" && (C[move.special.status?.toLowerCase()] || 0) > 0){
        dmg += move.special.bonusDamage || 0;
      }
      dmg = modifyByRelics("modifyEnemyIntentDamage", dmg, { firstEnemyAttack:E.turn === 0 && i === 0 });
      const blocked = Math.min(C.block, dmg);
      const taken = dmg - blocked;
      C.block -= blocked;
      S.hp -= taken;
      totalTaken += taken;
      if(taken > 0){
        animateActor(".player-combat", "hurt", ANIMATION_PROFILE.player.hurtMs);
        if(hits <= 2 || i === hits - 1) floatFeedback(`-${taken}`, "player", "damage");
        if(blocked > 0) floatFeedback(`+${blocked} Block`, "player", "block");
        pulseElement(".player-combat", "anim-player-hit", 260);
      }
      if(C.counter){
        E.hp -= C.counter;
        C.log.push(`Counter reflects ${C.counter}.`);
      }
    }
    C.log.push(`${E.name} uses ${move.name} for ${totalTaken} total.`);
  }
  if(move.block){
    E.block = (E.block || 0) + move.block;
    C.log.push(`${E.name} gains ${move.block} Block.`);
    floatFeedback(`+${move.block} Block`, "enemy", "block");
  }
  if(move.heal){
    E.hp = Math.min(E.maxHp, E.hp + move.heal);
    C.log.push(`${E.name} heals ${move.heal}.`);
    flashElement("#enemy", "flash-heal", 260);
    playSfx("heal");
    floatFeedback(`+${move.heal} HP`, "enemy", "heal");
  }
  if(move.applyEnemy || move.selfStatus) applyEnemyStatus({ ...(move.applyEnemy || {}), ...(move.selfStatus || {}) });
  if(move.applyPlayer || move.playerStatus) applyPlayerStatus({ ...(move.applyPlayer || {}), ...(move.playerStatus || {}) }, "enemy");
  if(move.addCardToPlayerDeck){
    C.draw.push(createCardInstance(move.addCardToPlayerDeck, { temporary:true }));
    C.log.push(`${DB.cards[move.addCardToPlayerDeck]?.name || move.addCardToPlayerDeck} enters your draw pile.`);
  }
  if(move.addTemporaryCardToDiscard){
    C.discard.push(createCardInstance(move.addTemporaryCardToDiscard, { temporary:true }));
    C.log.push(`${DB.cards[move.addTemporaryCardToDiscard]?.name || move.addTemporaryCardToDiscard} enters your discard.`);
  }
  if(move.addTemporaryCardToHand){
    C.hand.push(createCardInstance(move.addTemporaryCardToHand, { temporary:true }));
    C.log.push(`${DB.cards[move.addTemporaryCardToHand]?.name || move.addTemporaryCardToHand} enters your hand.`);
  }
  if(move.drainEnergyNextTurn){
    C.nextTurnDrain = Math.max(C.nextTurnDrain || 0, move.drainEnergyNextTurn);
    floatFeedback(`-${move.drainEnergyNextTurn} Energy`, "center", "status");
  }
}
function resolvePotentialLethalDamage(){
  if(S.hp > 0) return false;
  if(hasRelic("lantern_heart") && !S.flags?.mercyThreadUsed && (S.combat?.ward || 0) > 0){
    S.flags = S.flags || {};
    S.flags.mercyThreadUsed = true;
    S.combat.ward = 0;
    S.hp = 1;
    relicLog("Mercy Thread saves you from lethal damage.");
    floatFeedback("Mercy Thread!", "player", "ward");
    triggerRelics("lethalDamage", {});
    return true;
  }
  return false;
}
async function playCard(i){
  const C = S.combat, cardInstance = C.hand[i], ca = getCardInstanceDef(cardInstance), id = cardIdOf(cardInstance);
  if(!ca || ca.unplayable || C.locked) return;
  let cost = modifyByRelics("modifyCardCost", ca.cost, { card:ca });
  if(cost > C.energy) return;
  C.locked = true;
  const cardEl = document.querySelector(`.card[data-index="${i}"]`);
  pulseElement(cardEl, "anim-card-play button-press-pop", 240);
  playSfx("card_play", { throttleMs: 40 });
  C.energy -= cost; C.hand.splice(i,1);
  C.flags.firstCardPlayed = true;
  C.cardsPlayedThisTurn += 1;
  M.achievementCounters.cardsPlayedTotal += 1;
  C.log.push(`Played ${ca.name}.`);
  triggerRelics("cardPlayed", { card:ca, cardId:id });
  await sleep(scaledDelay(90));
  animatePlayerAction(ca);

  if(ca.type==="Skill"){
    C.skillsPlayed++;
    M.achievementCounters.skillsPlayedTotal += 1;
    pulseElement(".combat-actions", "anim-block-gain", 240);
    triggerRelics("skillPlayed", { card:ca });
    C.firstSkill = false;
  }
  if(ca.type==="Attack"){
    C.attacksPlayed += 1;
    M.achievementCounters.attacksPlayedTotal += 1;
    pulseElement(".player-combat", "anim-player-attack", 220);
    triggerRelics("attackPlayed", { card:ca });
  }
  if(ca.selfDamage){
    S.hp -= ca.selfDamage; C.bled = true;
    floatFeedback(`-${ca.selfDamage}`, "player", "damage");
    if(S.weapon==="vein_knife") damageEnemy(2);
  }
  if(ca.gainEnergy) C.energy += ca.gainEnergy;
  if(ca.block) gainBlock(ca.block);
  if(ca.bonusBlockIfCurse && C.hand.some((card)=>getCardInstanceDef(card)?.type === "Curse")) gainBlock(ca.bonusBlockIfCurse);
  if(ca.fortify){ C.fortify += ca.fortify; gainBlock(ca.fortify); }
  if(ca.heal){ const heal = Math.max(0, ca.heal - (C.blight||0)); S.hp = Math.min(S.maxHp, S.hp + heal); flashElement(".player-combat", "flash-heal", 260); playSfx("heal"); floatFeedback(`+${heal} HP`, "player", "heal"); }
  if(ca.playerStatus) applyPlayerStatus(ca.playerStatus, "self");
  if(ca.nextAttackBonus) C.bonus += ca.nextAttackBonus;
  if(ca.counter) C.counter += ca.counter;
  if(ca.apply){
    applyEnemyStatus(ca.apply);
    Object.entries(ca.apply).forEach(([k,v])=>floatFeedback(`${k} +${v}`, "enemy", "status"));
  }
  if(ca.addDiscard){
    C.discard.push(createCardInstance(ca.addDiscard));
    triggerRelics("cardAddedDuringCombat", { cardId:ca.addDiscard, cardType: DB.cards[ca.addDiscard]?.type });
  }
  if(ca.addDraw){
    C.draw.push(...ca.addDraw.map((id)=>createCardInstance(id)));
    ca.addDraw.forEach((newId)=>triggerRelics("cardAddedDuringCombat", { cardId:newId, cardType: DB.cards[newId]?.type }));
  }
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
      if(S.weapon==="chipped_blade") dmg += 2;
    }
    dmg = modifyByRelics("modifyAttackDamage", dmg, { firstAttack:C.firstAtk, card:ca });
    C.firstAtk = false;
    damageEnemy(dmg, ca.hits || 1);
  }

  if(ca.exhaust) { C.exhaust.push(cardInstance); if(C.powers.exhaust_damage) damageEnemy(3); }
  else if(ca.type !== "Power") C.discard.push(cardInstance);

  await sleep(scaledDelay(240));
  if(S.hp<=0 && !resolvePotentialLethalDamage()){ C.locked = false; return death(); }
  if(C.enemy.hp > 0) maybeTriggerBossPhase();
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
    pulseElement("#enemy", "anim-bleed-tick", 260);
    playSfx("bleed_tick");
    floatFeedback(`Bleed ${bleedDamage}`, "enemy", "bleed");
    E.status.Bleed = Math.max(0, E.status.Bleed - 1);
  }
  if((E.status.Burn || 0) > 0){
    const burnDamage = E.status.Burn;
    E.hp -= burnDamage;
    C.log.push(`${E.name} burns for ${burnDamage}.`);
    pulseElement("#enemy", "anim-burn-tick", 260);
    playSfx("burn_tick");
    floatFeedback(`Burn ${burnDamage}`, "enemy", "burn");
    E.status.Burn = Math.max(0, E.status.Burn - 1);
  }
  triggerRelics("turnEnd", { enemy:E });

  if(E.hp<=0){ C.locked = false; return victory(); }
  await sleep(animDelay(120));

  performEnemyMove(it);
  if(E.specialRules?.includes("gainStrengthIfBlocked") && (E.block || 0) > 0){
    applyEnemyStatus({ Strength: 1 });
    C.log.push(`${E.name}'s oath hardens: +1 Strength.`);
  }

  if(S.hp<=0 && !resolvePotentialLethalDamage()){ C.locked = false; return death(); }
  maybeTriggerBossPhase();
  if(E.hp<=0){ C.locked = false; return victory(); }

  const state = C.enemyState;
  state.moveUses[it.id] = (state.moveUses[it.id] || 0) + 1;
  if(it.cooldown) state.moveCooldowns[it.id] = it.cooldown;
  Object.keys(state.moveCooldowns).forEach((id)=>state.moveCooldowns[id] = Math.max(0, state.moveCooldowns[id] - 1));
  rememberEnemyMove(it.id);

  E.turn++;
  C.turn++;
  state.turn = C.turn;
  C.energy = 3 - (C.nextTurnDrain||0);
  C.nextTurnDrain = 0;
  C.block = Math.max(C.fortify || 0, C.retainBlockNextTurn || 0);
  C.retainBlockNextTurn = 0;
  C.fortify = 0;
  C.bled = false; C.counter = 0; C.firstAtk = true; C.firstSkill = true; C.cardsPlayedThisTurn = 0; C.attacksPlayed = 0;
  ["weak","frail","blight"].forEach(k=>{ if(C[k]>0) C[k]--; });
  Object.keys(E.status).forEach(k=>{
    if(k === "Bleed" || k === "Burn") return;
    if(E.status[k]>0) E.status[k]--;
  });
  if((C.bleed || 0) > 0){
    const selfBleed = C.bleed;
    S.hp -= selfBleed;
    C.log.push(`You bleed for ${selfBleed}.`);
    pulseElement(".player-combat", "anim-bleed-tick", 220);
    floatFeedback(`Bleed ${selfBleed}`, "player", "bleed");
    C.bleed = Math.max(0, C.bleed - 1);
    if(S.hp<=0 && !resolvePotentialLethalDamage()){ C.locked = false; return death(); }
  }
  triggerRelics("turnStart", { turn:C.turn });
  drawCards(5 + (C.drawBonusNextTurn || 0));
  C.drawBonusNextTurn = 0;
  state.currentMoveId = chooseEnemyMove();
  C.locked = false;
  safeCombatUIUpdate();
}
async function victory(){
  const C = S.combat;
  const E = C.enemy, boss = E.tier === "boss";
  const elite = E.tier === "elite";
  updateRunStats("enemy_defeated", { tier: E.tier });
  const completionNode = S.pendingNodeCompletion;
  C.locked = true;
  pulseElement("#enemy", "anim-death", 420);
  playSfx("enemy_death");
  await sleep(scaledDelay(340));
  S.kills++;
  const rewardGold = boss ? 90 : elite ? randInt(BALANCE.eliteRewardGoldMin, BALANCE.eliteRewardGoldMax) : randInt(BALANCE.normalRewardGoldMin, BALANCE.normalRewardGoldMax);
  gainGold(rewardGold);
  S.combat = null;
  if(completionNode){
    const source = boss ? "boss" : elite ? "elite" : "combat";
    pendingVictoryRewards = { nodeId:completionNode, source, summary: boss ? "Boss defeated." : "Won battle.", showCardAfterRelic: source !== "combat" };
    await sleep(scaledDelay(120));
    if(source === "combat") showCardReward(source, { nodeId: completionNode, summary: pendingVictoryRewards.summary });
    else showRelicReward(source);
    return;
  }
  autosave("combat-victory");
  drawWorld();
}
function pickRelicCandidates(count = 1){
  const unlocked = Object.entries(DB.relics).filter(([id, relic])=>(relic.stackable || !S.relics.includes(id)) && isUnlocked("relic", id)).map(([id])=>id);
  const fallback = Object.entries(DB.relics).filter(([id, relic])=>(relic.stackable || !S.relics.includes(id)) && relic.rarity === "Common").map(([id])=>id);
  const pool = unlocked.length >= count ? unlocked : [...new Set([...unlocked, ...fallback])];
  const out = [];
  const copy = [...pool];
  while(out.length < count && copy.length){
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}
function renderRelicSummary(relicId){
  const relic = getRelicDef(relicId);
  if(!relic) return "";
  return `<div class="deck-row"><div><b>${relic.name}</b> <span class="small">${relic.rarity}</span></div><div class="small">${relic.text}</div>${renderArchetypeChips(relic.archetypes)}</div>`;
}
function showRelicReward(source = "elite"){
  setScreen("reward");
  const choiceCount = source === "boss" ? 3 : 1;
  const choices = pickRelicCandidates(choiceCount);
  choices.forEach((id)=>markDiscovered("relic", id));
  if(!choices.length){
    toast("No relics available.");
    return skipRelicReward(false);
  }
  const build = getBuildSummary();
  G.innerHTML = `<div class="screen reward-screen"><div class="top"><div><div class="logo">${source.toUpperCase()} Relic Reward</div><div class="small">Choose a relic to shape your run.</div></div><div><span class="pill">Relics ${S.relics.length}</span></div></div>
    <div class="reward-wrap"><p class="small">${pendingVictoryRewards?.summary || "Victory."}</p><p class="small">Current build leans: ${build.top.join(" / ") || "Unfocused"}</p>
    <div class="reward-grid">${choices.map((id)=>`<button class="reward-choice" onclick="pickRelicReward('${id}')">${renderRelicSummary(id)}</button>`).join("")}</div>
    <div class="reward-actions"><button onclick="showBuildPanel()">View Build</button><button onclick="skipRelicReward()">Skip</button></div></div></div>`;
  applyButtonFeedback(G);
  animateRewardReveal("relic");
}
function pickRelicReward(relicId){
  if(!DB.relics[relicId]) return;
  if(!DB.relics[relicId].stackable && S.relics.includes(relicId)) return toast("Already owned.");
  S.relics.push(relicId);
  markDiscovered("relic", relicId);
  updateRunStats("relic_found");
  toast(`${DB.relics[relicId].name} acquired.`);
  autosave("relic-reward");
  skipRelicReward(false);
}
function skipRelicReward(notify = true){
  if(notify) toast("You leave the relic behind.");
  if(pendingVictoryRewards?.showCardAfterRelic){
    return showCardReward(pendingVictoryRewards.source, { nodeId:pendingVictoryRewards.nodeId, summary:pendingVictoryRewards.summary });
  }
  const nodeId = pendingVictoryRewards?.nodeId;
  const summary = pendingVictoryRewards?.summary || "Victory.";
  pendingVictoryRewards = null;
  completeCurrentNode({ nodeId, text:summary });
  drawWorld();
}
function generateCardRewardChoices(source = "combat"){
  const unlocked = Object.entries(DB.cards).filter(([id, card])=>card.type !== "Curse" && isUnlocked("card", id));
  const fallback = Object.entries(DB.cards).filter(([, card])=>card.type !== "Curse" && card.rarity === "common");
  const pool = unlocked.length >= 6 ? unlocked : [...new Map([...unlocked, ...fallback].map((entry)=>[entry[0], entry])).values()];
  const weightsBySource = {
    combat:{ common:0.7, uncommon:0.25, rare:0.05 },
    elite:{ common:0.45, uncommon:0.4, rare:0.15 },
    boss:BALANCE.rarityWeights.boss,
    treasure:{ common:0.15, uncommon:0.5, rare:0.35 },
    event:{ common:0.4, uncommon:0.4, rare:0.2 }
  };
  const weights = weightsBySource[source] || weightsBySource.combat;
  const byRarity = Object.fromEntries(CARD_RARITIES.map((rarity)=>[rarity, []]));
  pool.forEach(([id, card])=>{ if(byRarity[card.rarity]) byRarity[card.rarity].push(id); });
  const focus = getBuildSummary().top;
  const scoreCard = (id)=>{
    const card = DB.cards[id];
    const base = 1 + (focus.some((a)=>(card.archetypes || []).includes(a)) ? 0.55 : 0);
    return base;
  };
  const weightedPick = (ids)=>{
    const total = ids.reduce((sum,id)=>sum + scoreCard(id), 0);
    let roll = Math.random() * total;
    for(const id of ids){
      roll -= scoreCard(id);
      if(roll <= 0) return id;
    }
    return ids[0];
  };
  const picks = [];
  while(picks.length < 3){
    const roll = Math.random();
    const rarity = roll < weights.common ? "common" : roll < weights.common + weights.uncommon ? "uncommon" : "rare";
    const rarityPool = byRarity[rarity].filter((id)=>!picks.includes(id));
    if(rarityPool.length){
      picks.push(weightedPick(rarityPool));
      continue;
    }
    const backup = pool.map(([id])=>id).filter((id)=>!picks.includes(id));
    if(!backup.length) break;
    picks.push(weightedPick(backup));
  }
  return picks;
}
function showCardReward(source = "combat", options = {}){
  setScreen("reward");
  const choices = generateCardRewardChoices(source);
  choices.forEach((id)=>markDiscovered("card", id));
  if(!choices.length){
    toast("No cards available for reward.");
    return skipCardReward(false);
  }
  pendingVictoryRewards = { ...(pendingVictoryRewards || {}), source, nodeId: options.nodeId || pendingVictoryRewards?.nodeId, summary: options.summary || "Won battle." };
  const sourceLabel = source.charAt(0).toUpperCase() + source.slice(1);
  const build = getBuildSummary();
  G.innerHTML = `<div class="screen reward-screen"><div class="top"><div><div class="logo">${sourceLabel} Reward</div><div class="small">${pick(REWARD_FLAVOR)}</div></div><div><span class="pill">Deck ${S.deck.length}</span><span class="pill echoes-pill">Echoes ${S.gold}</span></div></div>
    <div class="reward-wrap"><p class="small">${pendingVictoryRewards.summary} Choose one memory or pass.</p><p class="small">Current build leans: ${build.top.join(" / ") || "Unfocused"}</p><div class="reward-grid">${choices.map((id)=>`<button class="reward-choice" onclick="pickRewardCard('${id}')">${renderCardSummary(createCardInstance(id))}</button>`).join("")}</div>
    <div class="reward-actions"><button onclick="showDeck()">View Deck</button><button onclick="showBuildPanel()">Build</button><button onclick="skipCardReward()">Skip</button></div></div></div>`;
  applyButtonFeedback(G);
  animateRewardReveal("card");
}
function pickRewardCard(cardId){
  if(!DB.cards[cardId]) return toast("No cards available.");
  addCardToDeck(cardId);
  markDiscovered("card", cardId);
  updateRunStats("card_picked");
  toast(`${DB.cards[cardId].name} added.`);
  autosave("card-reward");
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
async function death(){
  const mem = pick(S.deck);
  const memId = cardIdOf(mem);
  pulseElement(".player-combat", "anim-death", 520);
  await sleep(scaledDelay(420));
  S.memories.push(mem); S.deaths++; S.hp = S.maxHp; S.combat = null;
  S.pendingNodeCompletion = null;
  S.mapEncounter = null;
  finishRun("loss");
  localStorage.removeItem(RUN_SAVE_KEY);
  cutscene("You Died", `The lantern drops. The Hollow preserves one memory: ${DB.cards[memId].name}.`, ()=>showRunSummary("loss"));
}
function showCombatLog(){
  const C = S.combat;
  if(!C) return;
  const body = C.log.length ? C.log.slice(-40).map((line)=>`<p>${line}</p>`).join("") : "<p>No entries yet.</p>";
  modal("Combat Log", `<div class="combat-log">${body}</div>`);
}
window.showPile = showPile;
window.showCombatLog = showCombatLog;
window.applyEventChoice = applyEventChoice;
window.buyShopCard = buyShopCard;
window.buyShopRelic = buyShopRelic;
window.buyCardRemoval = buyCardRemoval;
window.buyHeal = buyHeal;
window.leaveShop = leaveShop;
window.restAtSite = restAtSite;
window.showRestUpgradePicker = showRestUpgradePicker;
window.restPurge = restPurge;
window.restMeditate = restMeditate;
window.openSettings = openSettings;
window.openCompendium = openCompendium;
window.openRunMenu = openRunMenu;
window.startNewRun = startNewRun;
window.toggleSetting = toggleSetting;
window.setSfxEnabled = setSfxEnabled;
window.setSfxVolume = setSfxVolume;
window.preloadSfxManifest = preloadSfxManifest;
window.playSfx = playSfx;
window.abandonRun = abandonRun;
window.openRunHistory = openRunHistory;
window.openFinalDeckViewer = openFinalDeckViewer;
window.openResetMenu = openResetMenu;
window.resetMetaProgression = resetMetaProgression;
window.resetSettingsData = resetSettingsData;
window.deleteActiveRun = deleteActiveRun;
window.selectLoadout = selectLoadout;
window.setDifficulty = setDifficulty;
loadData();


if (location.search.includes("debug=1") || localStorage.getItem("ashfallDebug") === "1") {
  window.AshfallDebug = {
    grantGold:(amount)=>{ gainGold(Number(amount)||0); drawWorld(); },
    grantRelic:(id)=>{ addRelic(id); drawWorld(); },
    addCard:(id)=>{ S.deck.push(createCardInstance(id)); drawWorld(); },
    startCombat:(enemyId)=> startCombat(enemyId, "debug"),
    winCombat:()=> finishCombat(true),
    showMap:()=>{ setScreen("map"); drawWorld(); },
    resetRun:()=>{ localStorage.removeItem(RUN_SAVE_KEY); location.reload(); },
    printBuildSummary:()=>console.log(computeBuildSummary()),
    simulateRewards:(count=5)=>{ for(let i=0;i<count;i++) console.log(rollCardRewardPool("combat")); }
  };
}

window.exportDebugReport = exportDebugReport;
window.copyDebugReport = copyDebugReport;
window.recoverFromBackup = recoverFromBackup;
window.clearCorruptSave = clearCorruptSave;
window.showFatalError = showFatalError;
window.addEventListener("error", (evt)=>showFatalError(evt.error || new Error(evt.message), "window"));
