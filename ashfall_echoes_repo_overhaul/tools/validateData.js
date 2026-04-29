const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dataDir = path.join(root, "src", "data");
const load = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"));

const cards = load("cards.json");
const relics = load("relics.json");
const weapons = load("weapons.json");
const enemies = load("enemies.json");
const events = load("events.json");
const loadoutsPath = path.join(dataDir, "loadouts.json");
const loadouts = fs.existsSync(loadoutsPath) ? JSON.parse(fs.readFileSync(loadoutsPath, "utf8")) : null;

let errors = [];
const validCardRarity = new Set(["common", "uncommon", "rare"]);
const validArchetypes = new Set(["bleed", "block", "curse", "tempo", "burn", "ward", "strength", "control"]);
const validRelicRarity = new Set(["Common", "Uncommon", "Rare", "Cursed"]);
const validRelicTier = new Set(["common","uncommon","rare","boss"]);
const warnings = [];
const validRelicHooks = new Set([
  "modifyDamageFirstAttack","firstBlockBonus","firstCardFree","bleedThorn","thirdSkillBlock","firstTurnEnergy",
  "attackVsBurned","wardLethalSave","combatStartDebtBell","firstCurseFree","retainBlock","extraBleedTickBoss",
  "combatStartBleed","curseGainStrength","fourthCardDamage","burnPlusOne","furnaceTick","startWard","debuffBlockedBlock",
  "thirdAttackStrength","strengthGainBlock","weakPlusOne","firstEnemyAttackDown","noAttackDraw"
]);

function duplicateTopLevelKeys(fileName) {
  const raw = fs.readFileSync(path.join(dataDir, fileName), "utf8");
  const matches = [...raw.matchAll(/^  \"([^\"]+)\":\s*\{/gm)].map((m) => m[1]);
  const seen = new Set();
  const dupes = new Set();
  matches.forEach((key) => {
    if (seen.has(key)) dupes.add(key);
    seen.add(key);
  });
  return [...dupes];
}

for (const id of duplicateTopLevelKeys("cards.json")) errors.push(`Duplicate card id ${id}`);
for (const id of duplicateTopLevelKeys("relics.json")) errors.push(`Duplicate relic id ${id}`);
for (const id of duplicateTopLevelKeys("enemies.json")) errors.push(`Duplicate enemy id ${id}`);

for (const [wid, w] of Object.entries(weapons)) {
  if (!w.starter || !Array.isArray(w.starter)) errors.push(`Weapon ${wid} missing starter deck`);
  for (const cid of w.starter || []) {
    if (!cards[cid]) errors.push(`Weapon ${wid} references missing card ${cid}`);
  }
}

if (loadouts) {
  const loadoutIds = new Set();
  for (const [lid, loadout] of Object.entries(loadouts)) {
    if (loadoutIds.has(lid)) errors.push(`Duplicate loadout id ${lid}`);
    loadoutIds.add(lid);
    if (loadout.id && loadout.id !== lid) errors.push(`Loadout ${lid} has mismatched id field ${loadout.id}`);
    if (!Array.isArray(loadout.startingDeck) || !loadout.startingDeck.length) errors.push(`Loadout ${lid} missing startingDeck`);
    for (const cid of loadout.startingDeck || []) {
      if (!cards[cid]) errors.push(`Loadout ${lid} references missing starter card ${cid}`);
    }
    if (loadout.startingRelic && !relics[loadout.startingRelic]) errors.push(`Loadout ${lid} references missing starter relic ${loadout.startingRelic}`);
    if (loadout.unlockReward) {
      if (loadout.unlockReward.type === "card" && !cards[loadout.unlockReward.id]) errors.push(`Loadout ${lid} unlockReward missing card ${loadout.unlockReward.id}`);
      if (loadout.unlockReward.type === "relic" && !relics[loadout.unlockReward.id]) errors.push(`Loadout ${lid} unlockReward missing relic ${loadout.unlockReward.id}`);
      if (loadout.unlockReward.type === "loadout" && !loadouts[loadout.unlockReward.id]) errors.push(`Loadout ${lid} unlockReward missing loadout ${loadout.unlockReward.id}`);
    }
    if (loadout.requiredDifficulty !== undefined) {
      if (!Number.isInteger(loadout.requiredDifficulty) || loadout.requiredDifficulty < 0 || loadout.requiredDifficulty > 5) {
        errors.push(`Loadout ${lid} has invalid requiredDifficulty ${loadout.requiredDifficulty}`);
      }
    }
  }
}

const cardEntries = Object.entries(cards);
for (const [cid, c] of cardEntries) {
  if (!c.name || !c.type || c.cost === undefined || !c.text) errors.push(`Card ${cid} missing required fields`);
  if (!validCardRarity.has(c.rarity)) errors.push(`Card ${cid} has invalid rarity ${c.rarity}`);
  if (!Array.isArray(c.archetypes) || !c.archetypes.length) errors.push(`Card ${cid} missing archetypes`);
  for (const a of c.archetypes || []) if (!validArchetypes.has(a)) errors.push(`Card ${cid} has invalid archetype ${a}`);
  for (const refField of ["addDiscard"]) {
    if (c[refField] && !cards[c[refField]]) errors.push(`Card ${cid} references missing ${refField} card ${c[refField]}`);
  }
  if (c.addDraw) {
    for (const ref of c.addDraw) if (!cards[ref]) errors.push(`Card ${cid} addDraw missing card ${ref}`);
  }
}

const validEnemyTiers = new Set(["normal", "elite", "boss"]);
const validMoveKeys = new Set([
  "id","name","intentIcon","intentText","weight","cooldown","minTurn","maxUses","avoidRepeat",
  "damage","hits","block","selfStatus","playerStatus","applyEnemy","applyPlayer","addCardToPlayerDeck",
  "addTemporaryCardToDiscard","addTemporaryCardToHand","drainEnergyNextTurn","heal","cleanse","summon","phaseTrigger","special"
]);
for (const [eid, e] of Object.entries(enemies)) {
  if (!e.name || !e.hp) errors.push(`Enemy ${eid} missing required fields`);
  if (!validEnemyTiers.has(e.tier)) errors.push(`Enemy ${eid} has invalid tier ${e.tier}`);
  if (!Array.isArray(e.archetypes) || !e.archetypes.length) errors.push(`Enemy ${eid} missing archetypes`);
  for (const a of e.archetypes || []) if (!validArchetypes.has(a)) errors.push(`Enemy ${eid} has invalid archetype ${a}`);
  if (!Array.isArray(e.moves)) errors.push(`Enemy ${eid} moves must be an array`);
  const moveIds = new Set();
  for (const move of e.moves || []) {
    if (!move.id || !move.name) errors.push(`Enemy ${eid} has move missing id or name`);
    if (move.id) {
      if (moveIds.has(move.id)) errors.push(`Enemy ${eid} has duplicate move id ${move.id}`);
      moveIds.add(move.id);
    }
    if (move.weight !== undefined && (!(typeof move.weight === "number") || move.weight <= 0)) {
      errors.push(`Enemy ${eid} move ${move.id || move.name} has invalid weight`);
    }
    for (const key of Object.keys(move)) {
      if (!validMoveKeys.has(key)) errors.push(`Enemy ${eid} move ${move.id || move.name} has unknown field ${key}`);
    }
    for (const cardField of ["addCardToPlayerDeck", "addTemporaryCardToDiscard", "addTemporaryCardToHand"]) {
      if (move[cardField] && !cards[move[cardField]]) errors.push(`Enemy ${eid} move ${move.id || move.name} references missing card ${move[cardField]}`);
    }
  }
  if (e.tier === "boss" && e.phases) {
    e.phases.forEach((phase, idx) => {
      if (!(phase.threshold > 0 && phase.threshold < 1)) errors.push(`Enemy ${eid} phase ${idx} has invalid threshold`);
      if (!phase.name) errors.push(`Enemy ${eid} phase ${idx} missing name`);
      if (!Array.isArray(phase.moves)) errors.push(`Enemy ${eid} phase ${idx} moves must be an array`);
      const phaseMoveIds = new Set();
      for (const move of phase.moves || []) {
        if (!move.id || !move.name) errors.push(`Enemy ${eid} phase ${idx} has move missing id or name`);
        if (move.id) {
          if (phaseMoveIds.has(move.id)) errors.push(`Enemy ${eid} phase ${idx} duplicate move id ${move.id}`);
          phaseMoveIds.add(move.id);
        }
      }
    });
  }
}

const relicEntries = Object.entries(relics);
for (const [rid, r] of relicEntries) {
  if (!r.name || !r.text || !r.rarity) errors.push(`Relic ${rid} missing required fields`);
  if (!validRelicRarity.has(r.rarity)) errors.push(`Relic ${rid} has invalid rarity ${r.rarity}`);
  if (!Array.isArray(r.archetypes) || !r.archetypes.length) errors.push(`Relic ${rid} missing archetypes`);
  for (const a of r.archetypes || []) if (!validArchetypes.has(a)) errors.push(`Relic ${rid} has invalid archetype ${a}`);
  if (r.hook && !validRelicHooks.has(r.hook)) errors.push(`Relic ${rid} has unknown hook ${r.hook}`);
  if (!r.tier || !validRelicTier.has(String(r.tier).toLowerCase())) errors.push(`Relic ${rid} has invalid tier ${r.tier}`);
  if (r.curses) for (const cid of r.curses) if (!cards[cid]) errors.push(`Relic ${rid} references missing curse ${cid}`);
}


const validEventEffectKeys = new Set([
  "gainGold","loseGold","gainHP","loseHP","maxHP","gainRelic","gainRandomRelic","gainCard","gainRandomCard",
  "upgradeRandomCard","upgradeChosenCard","removeCard","transformCard","duplicateCard","addCurse","addTemporaryCurse",
  "gainWard","startCombat","gainStatus","loseStatus","setFlag","requireFlag","gainKeyItem","revealNextNodes","scoutElite",
  "gainMapVision","gainStatusSelf"
]);

const eventIds = new Set();
for (const event of Array.isArray(events) ? events : []) {
  if (!event.id) errors.push("Event missing id");
  if (event.id) {
    if (eventIds.has(event.id)) errors.push(`Duplicate event id ${event.id}`);
    eventIds.add(event.id);
  }
  if (!event.title || !event.description) errors.push(`Event ${event.id || "unknown"} missing title/description`);
  if (event.act !== undefined && (!Number.isInteger(event.act) || event.act < 1)) errors.push(`Event ${event.id} has invalid act`);
  if (event.weight !== undefined && (!(typeof event.weight === "number") || event.weight <= 0)) errors.push(`Event ${event.id} has invalid weight`);
  if (event.rarity !== undefined && !["common","uncommon","rare"].includes(event.rarity)) errors.push(`Event ${event.id} has invalid rarity ${event.rarity}`);
  if (!Array.isArray(event.choices) || !event.choices.length) errors.push(`Event ${event.id} must include choices`);
  for (const choice of event.choices || []) {
    if (!choice.text) errors.push(`Event ${event.id} has choice missing text`);
    if (choice.effects !== undefined && (typeof choice.effects !== "object" || Array.isArray(choice.effects))) errors.push(`Event ${event.id} choice ${choice.text || "?"} has invalid effects object`);
    for (const key of Object.keys(choice.effects || {})) {
      if (!validEventEffectKeys.has(key)) {
        errors.push(`Event ${event.id} choice ${choice.text || "?"} has unknown effect ${key}`);
      }
    }
    const loseGold = choice.effects?.loseGold;
    if (loseGold !== undefined && (!(typeof loseGold === "number") || loseGold < 0)) errors.push(`Event ${event.id} choice ${choice.text || "?"} has invalid loseGold`);
    if (choice.requirements?.minGold !== undefined && choice.requirements.minGold < 0) errors.push(`Event ${event.id} choice ${choice.text || "?"} has impossible minGold`);
  }
}

const rarityCounts = { common:0, uncommon:0, rare:0 };
for (const [, c] of cardEntries) {
  const r = String(c.rarity || "").toLowerCase();
  if (rarityCounts[r] !== undefined) rarityCounts[r] += 1;
  if (c.cost < -1 || c.cost > 5) warnings.push(`Card ${c.name || "unknown"} has unusual cost ${c.cost}`);
  if (!c.upgrade || (!c.upgradedName && !c.upgradedText)) errors.push(`Card ${c.name || "unknown"} missing upgrade data`);
}
if (cardEntries.length < 45) warnings.push(`Card pool low: ${cardEntries.length} < 45`);
if (Object.keys(relics).length < 35) warnings.push(`Relic pool low: ${Object.keys(relics).length} < 35`);
const enemyEntries = Object.entries(enemies);
const act1Normals = enemyEntries.filter(([,e])=>e.act===1 && e.tier==="normal");
const act1Elites = enemyEntries.filter(([,e])=>e.act===1 && e.tier==="elite");
const act1Bosses = enemyEntries.filter(([,e])=>e.act===1 && e.tier==="boss");
if (act1Normals.length < 12) warnings.push(`Act 1 normal enemies low: ${act1Normals.length} < 12`);
if (act1Elites.length < 5) warnings.push(`Act 1 elites low: ${act1Elites.length} < 5`);
if (act1Bosses.length < 2) warnings.push(`Act 1 bosses low: ${act1Bosses.length} < 2`);
for (const [eid,e] of enemyEntries) if (!(Number(e.hp) > 0)) errors.push(`Enemy ${eid} has non-positive hp`);
if ((Array.isArray(events)?events.length:0) < 15) warnings.push(`Event pool low: ${(Array.isArray(events)?events.length:0)} < 15`);

if (warnings.length) {
  console.warn("Validation warnings:");
  warnings.forEach(w => console.warn(" - " + w));
}

if (errors.length) {
  console.error("Validation failed:");
  errors.forEach(e => console.error(" - " + e));
  process.exit(1);
}
console.log("Data validation passed.");
