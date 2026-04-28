const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const appJs = fs.readFileSync(path.join(root, "src", "js", "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles", "main.css"), "utf8");

const jsRequired = [
  "function getSettings()",
  "function isReducedMotion()",
  "function shakeScreen(intensity = \"light\")",
  "async function hitStop(ms = 70)",
  "function playSfx(name, options = {})",
  "function queueJuice(fn)",
  "async function runJuiceSequence(steps = [])",
  "function floatFeedback(text, target = \"enemy\", type = \"status\")"
];

const cssRequired = [
  ".anim-card-play",
  ".anim-player-attack",
  ".anim-enemy-hit",
  ".anim-player-hit",
  ".anim-block-gain",
  ".anim-heal",
  ".anim-status-apply",
  ".anim-burn-tick",
  ".anim-bleed-tick",
  ".anim-death",
  ".anim-boss-phase",
  ".screen-shake-light",
  ".screen-shake-medium",
  ".screen-shake-heavy",
  ".flash-hit",
  ".flash-heal",
  ".flash-block",
  ".flash-ward",
  ".reward-reveal",
  ".relic-reveal",
  ".node-unlock-pulse",
  ".button-press-pop",
  "@media (prefers-reduced-motion: reduce)"
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
