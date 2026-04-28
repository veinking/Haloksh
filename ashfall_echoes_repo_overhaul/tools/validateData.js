const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dataDir = path.join(root, "src", "data");
const load = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"));

const cards = load("cards.json");
const relics = load("relics.json");
const weapons = load("weapons.json");
const enemies = load("enemies.json");

let errors = [];
const validCardRarity = new Set(["common", "uncommon", "rare"]);
const validArchetypes = new Set(["bleed", "block", "curse", "tempo", "burn", "ward", "strength", "control"]);
const validRelicRarity = new Set(["Common", "Uncommon", "Rare", "Cursed"]);
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

for (const [cid, c] of Object.entries(cards)) {
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

for (const [rid, r] of Object.entries(relics)) {
  if (!r.name || !r.text || !r.rarity) errors.push(`Relic ${rid} missing required fields`);
  if (!validRelicRarity.has(r.rarity)) errors.push(`Relic ${rid} has invalid rarity ${r.rarity}`);
  if (!Array.isArray(r.archetypes) || !r.archetypes.length) errors.push(`Relic ${rid} missing archetypes`);
  for (const a of r.archetypes || []) if (!validArchetypes.has(a)) errors.push(`Relic ${rid} has invalid archetype ${a}`);
  if (r.hook && !validRelicHooks.has(r.hook)) errors.push(`Relic ${rid} has unknown hook ${r.hook}`);
  if (r.curses) for (const cid of r.curses) if (!cards[cid]) errors.push(`Relic ${rid} references missing curse ${cid}`);
}

if (errors.length) {
  console.error("Validation failed:");
  errors.forEach(e => console.error(" - " + e));
  process.exit(1);
}
console.log("Data validation passed.");
