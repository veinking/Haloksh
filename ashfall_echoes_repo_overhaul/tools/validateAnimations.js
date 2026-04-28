const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const appJs = fs.readFileSync(path.join(root, "src", "js", "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles", "main.css"), "utf8");

const jsRequired = [
  "const ANIMATION_PROFILE",
  "function animatePlayerAction",
  "function animateEnemyIntent",
  "function pulseStage"
];

const cssRequired = [
  ".player-combat.attack",
  ".player-combat.cast",
  ".player-combat.hurt",
  ".enemy.attack",
  ".enemy.chant",
  ".embers",
  ".fog",
  "@media (prefers-reduced-motion:reduce)"
];

const missing = [];
for (const token of jsRequired) {
  if (!appJs.includes(token)) missing.push(`JS token missing: ${token}`);
}
for (const token of cssRequired) {
  if (!css.includes(token)) missing.push(`CSS token missing: ${token}`);
}

if (missing.length) {
  console.error("Animation validation failed:");
  for (const msg of missing) console.error(" - " + msg);
  process.exit(1);
}

console.log("Animation validation passed.");
