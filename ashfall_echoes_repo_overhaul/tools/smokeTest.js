const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const load = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

function assert(cond, msg){ if(!cond) throw new Error(msg); }

const cards = load('src/data/cards.json');
const relics = load('src/data/relics.json');
const enemies = load('src/data/enemies.json');
const events = load('src/data/events.json');
const loadouts = load('src/data/loadouts.json');

assert(Object.keys(cards).length > 0, 'cards missing');
assert(Object.keys(relics).length > 0, 'relics missing');
assert(Object.keys(enemies).length > 0, 'enemies missing');
assert(Object.keys(events).length > 0, 'events missing');

for (const [id, c] of Object.entries(cards)) assert(c.name && c.type, `bad card ${id}`);
for (const [id, r] of Object.entries(relics)) assert(r.name && r.rarity, `bad relic ${id}`);
for (const [id, e] of Object.entries(enemies)) assert(e.name && Array.isArray(e.moves), `bad enemy ${id}`);
for (const [id, l] of Object.entries(loadouts)) {
  assert(Array.isArray(l.startingDeck), `bad loadout deck ${id}`);
  l.startingDeck.forEach((c)=>assert(Boolean(cards[c]), `loadout ${id} unknown card ${c}`));
}

const roll = (arr, n=1)=>arr.sort(()=>Math.random()-0.5).slice(0,n);
const cardReward = roll(Object.keys(cards).filter((id)=>cards[id].type !== 'Curse'), 3);
const relicReward = roll(Object.keys(relics), 2);
assert(cardReward.length > 0, 'no card reward');
assert(relicReward.length > 0, 'no relic reward');

const oldSave = { deck:['strike','guard'], relics:['dull_whetstone'], hp:60, maxHp:72, gold:20 };
const migratedDeck = oldSave.deck.map((id)=>typeof id === 'string' ? { id, upgraded:false } : id);
assert(migratedDeck.every((c)=>c.id), 'migration failed');

console.log('smoke test passed');
