(() => {
"use strict";
const root = document.documentElement;
const query = new URLSearchParams(location.search);
const still = query.has("still") || window.__REDMIC_TEST === true;
const lessMotion = matchMedia("(prefers-reduced-motion: reduce)");
let printing = false; // on paper the page is the plain one
let cramped = false; // the opening's words don't fit above the phone (very large text): the plain page
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const span = (p, from, to) => clamp((p - from) / (to - from));
const mix = (from, to, t) => from + (to - from) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const part = (scope, name) => scope.querySelector(`[data-part="${name}"]`);
const WIDE = 900; // from this width the page has room for side-by-side scenes
const probe = document.createElement("div");
probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none";
document.body.append(probe);
const screenHeight = () => probe.offsetHeight || innerHeight;
function wantsScenes() {
if (printing || cramped || query.has("plain") || lessMotion.matches) return false;
if (!window.CSS || !CSS.supports("height", "100svh") || !CSS.supports("transform-style", "preserve-3d")) return false;
if (navigator.connection && navigator.connection.saveData) return false;
if (parseFloat(getComputedStyle(root).fontSize) > 20) return false;
return innerWidth >= 340 && screenHeight() >= 520;
}
const stores = [...document.querySelectorAll(".final .store")].map((link) => link.href);
const android = (navigator.userAgentData && navigator.userAgentData.platform === "Android") || /Android/i.test(navigator.userAgent);
const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || ""));
const store = android ? stores[1] : apple ? stores[0] : null;
if (store) for (const link of document.querySelectorAll("[data-get]")) link.href = store;
const deck = document.querySelector(".deck");
const cards = deck ? [...deck.children] : [];
const chips = [...document.querySelectorAll(".modes__tabs .chip")];
const rows = [deck, document.querySelector(".short__row")].filter(Boolean);
const scrolls = (row) => getComputedStyle(row).overflowX !== "visible";
let deckIsRow = false; // set when the layout is measured
let shownMode = -1;
function showMode(index) {
if (index === shownMode) return;
shownMode = index;
cards.forEach((card, each) => {
card.classList.toggle("is-gone", each < index);
card.style.setProperty("--d", Math.max(0, each - index));
});
chips.forEach((chip, each) => chip.setAttribute("aria-pressed", String(each === index)));
const tabs = chips[index] && chips[index].parentElement;
if (tabs && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = index === 0 ? 0 : Math.max(0, chips[index].offsetLeft + chips[index].offsetWidth + 20 - tabs.clientWidth);
}
const level = (time) => clamp(0.12 + 0.7 * Math.abs(Math.sin(time * 7.3)) * (0.55 + 0.45 * Math.sin(time * 1.3)), 0.06, 1);
function drawRings(rings, time, reach) {
rings.forEach((ring, index) => {
const heard = level(Math.max(0, time - index * 0.15));
const swell = Math.pow(heard, 0.6);
ring.style.setProperty("--spread", (((index + 1) / 3) * swell * reach).toFixed(2));
ring.style.setProperty("--o", (Math.min(1, heard / 0.08) * (0.35 + 0.65 * heard) * (1 - 0.28 * index)).toFixed(3));
});
}
const scenes = [...document.querySelectorAll("[data-scene]")].map((el) => ({
el, stage: el.querySelector(".stage"), name: el.dataset.scene,
lengths: el.dataset.len.split(",").map(Number), // screens of scroll: wide, narrow (0 = not pinned)
pinned: false, top: 0, height: 0, stageHeight: 0, p: -1, near: null,
}));
const views = [...document.querySelectorAll("[data-view]")].map((el) => ({ el, name: el.dataset.view, top: 0, height: 0, t: -1 }));
const tones = [...document.querySelectorAll("[data-tone]")].map((el) => ({ el, tone: el.dataset.tone, top: 0 }));
const themeColor = document.querySelector('meta[name="theme-color"]');
const getbar = document.querySelector(".getbar");
const final = document.querySelector(".final");
let scrub = false;
let heroTone = "dark";
let finalTop = Infinity;
let heroEnd = 0;
const hero = scenes.find((scene) => scene.name === "hero");
const h = hero && {
copy: part(hero.el, "copy"), badges: hero.el.querySelector(".hero__copy .stores"), say: part(hero.el, "say"), claim: part(hero.el, "claim"),
device: part(hero.el, "device"), tilt: part(hero.el, "tilt"), screen: part(hero.el, "screen"),
rings: [...part(hero.el, "rings").children], field: part(hero.el, "field"), mic: part(hero.el, "mic"),
curtain: part(hero.el, "curtain"), glare: part(hero.el, "glare"),
shadow: part(hero.el, "shadow"),
words: [...hero.el.querySelectorAll(".say__line .w")], fillers: [...hero.el.querySelectorAll(".w--filler")],
restY: 0, demoY: 0, claimY: 0, claimScale: 1, fieldBox: null, navHeight: 52, point: { x: 0, y: 0, tx: 0, ty: 0 },
fits: true,
};
if (h) {
for (const depth of [-0.375, -0.1875, 0, 0.1875, 0.375]) {
for (const corner of ["tl", "tr", "bl", "br"]) {
const piece = document.createElement("i");
piece.className = `phone__corner phone__corner--${corner}`;
piece.style.setProperty("--z", String(depth));
h.tilt.prepend(piece);
}
}
}
const phoneTransform = (y, tiltX, tiltY, scale) =>
`translate3d(0,${y.toFixed(1)}px,0) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
function measureHero() {
const stageBox = hero.stage.getBoundingClientRect();
const stageHeight = hero.stageHeight;
const phoneHeight = h.device.offsetHeight;
const wide = innerWidth >= WIDE;
h.navHeight = parseFloat(getComputedStyle(root).getPropertyValue("--nav-h")) || 52;
h.copy.style.transform = "";
const copyBottom = h.copy.offsetTop + h.copy.offsetHeight;
const lying = (phoneHeight * Math.cos((58 * Math.PI) / 180) * 0.92) / 2;
h.restY = Math.min(copyBottom + (wide ? 76 : 48) + lying, stageHeight - 120 + lying) - stageHeight / 2;
h.fits = copyBottom <= stageHeight - 120;
h.demoY = wide ? h.navHeight / 2 : Math.max(h.navHeight / 2, stageHeight / 2 - phoneHeight / 2 - 14);
const claimBottom = h.claim.offsetTop + h.claim.offsetHeight;
const gap = clamp(stageHeight * 0.03, 16, 36);
h.claimScale = wide ? 0.94 : clamp((stageHeight - claimBottom - gap - 14) / phoneHeight, 0.6, 1);
h.claimY = Math.max(h.demoY, claimBottom + gap + (phoneHeight * h.claimScale) / 2 - stageHeight / 2);
h.tilt.style.transform = phoneTransform(h.demoY, 0, 0, 1);
h.say.classList.remove("is-clean");
const mic = h.mic.getBoundingClientRect();
for (const filler of h.fillers) {
filler.style.transform = "none";
const box = filler.getBoundingClientRect();
filler.style.transform = "";
filler.style.setProperty("--dx", `${(mic.left + mic.width / 2 - (box.left + box.width / 2)).toFixed(1)}px`);
filler.style.setProperty("--dy", `${(mic.top + mic.height / 2 - (box.top + box.height / 2)).toFixed(1)}px`);
}
h.tilt.style.transform = phoneTransform(h.claimY, 0, 0, h.claimScale);
const field = h.field.getBoundingClientRect();
h.fieldBox = {
top: field.top - stageBox.top, left: field.left - stageBox.left,
right: stageBox.right - field.right, bottom: stageBox.bottom - field.bottom,
radius: Math.min(field.height / 2, field.width * 0.06),
};
}
let heroStep = -1;
let heroFrame = -1;
function heroActor(p) {
const stageHeight = hero.stageHeight;
const leave = easeInOut(span(p, 0.04, 0.16));
h.copy.style.opacity = (1 - leave).toFixed(3);
h.copy.style.transform = `translate3d(0,${(-stageHeight * 0.1 * leave).toFixed(1)}px,0)`;
h.badges.style.visibility = leave >= 1 ? "hidden" : "";
const rise = easeInOut(span(p, 0.04, 0.26));
const step = easeInOut(span(p, 0.72, 0.82));
const y = mix(mix(h.restY, h.demoY, rise), h.claimY, step);
const scale = mix(mix(0.92, 1, rise), h.claimScale, step);
const lean = 1 - rise; // the pointer tilts it less and less as it stands up
h.tilt.style.transform = phoneTransform(y, mix(58, 0, rise) + h.point.y * lean, mix(-12, 0, rise) + h.point.x * lean, scale);
h.glare.style.transform = `translate3d(${mix(-14, 14, rise).toFixed(2)}%,0,0)`;
h.shadow.style.opacity = (1 - rise * 0.55).toFixed(3);
const frame = p < 0.36 ? 0 : p < 0.68 ? 1 : 2;
if (frame !== heroFrame) {
heroFrame = frame;
h.screen.dataset.frame = String(frame);
if (frame !== 1 && still) drawRings(h.rings, 0, 0);
}
if (frame === 1) startRings(); // it returns at once while they run
const stepNow = p < 0.28 ? 0 : p < 0.36 ? 1 : p < 0.62 ? 2 : p < 0.72 ? 3 : 0;
if (stepNow !== heroStep) {
heroStep = stepNow;
hero.stage.dataset.step = String(stepNow);
}
h.say.style.opacity = (span(p, 0.36, 0.4) * (1 - span(p, 0.72, 0.78))).toFixed(3);
const spoken = Math.round(span(p, 0.38, 0.54) * h.words.length);
h.words.forEach((word, index) => word.classList.toggle("on", index < spoken));
h.say.classList.toggle("is-clean", p >= 0.57);
const claimed = easeOut(span(p, 0.78, 0.85));
h.claim.style.opacity = claimed.toFixed(3);
h.claim.style.transform = `translate3d(0,${((1 - claimed) * 14).toFixed(1)}px,0)`;
const turn = span(p, 0.86, 0.975);
if (turn <= 0 || !h.fieldBox) {
h.curtain.style.visibility = "hidden";
heroTone = "dark";
} else {
const grow = easeInOut(turn);
const box = h.fieldBox;
const inset = (edge) => `${(edge * (1 - grow)).toFixed(1)}px`;
const round = box.radius * (1 - grow) + 40 * Math.sin(Math.PI * grow);
const shape = `inset(${inset(box.top)} ${inset(box.right)} ${inset(box.bottom)} ${inset(box.left)} round ${round.toFixed(1)}px)`;
h.curtain.style.visibility = "visible";
h.curtain.style.clipPath = shape;
h.curtain.style.webkitClipPath = shape;
h.curtain.style.opacity = span(turn, 0, 0.16).toFixed(3);
heroTone = box.top * (1 - grow) < h.navHeight ? "light" : "dark";
}
hero.el.classList.toggle("is-white", turn > 0 && easeInOut(turn) > 0.995);
}
let ringsRunning = false;
function startRings() {
if (still) { drawRings(h.rings, 0.9, 7.2); return; }
if (ringsRunning) return;
ringsRunning = true;
const started = performance.now();
const tick = (now) => {
if (!scrub || heroFrame !== 1 || !hero.near || document.hidden) { ringsRunning = false; return; }
drawRings(h.rings, (now - started) / 1000, 7.2);
requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
}
let pointing = false;
function followPointer(event) {
if (!scrub || hero.p > 0.26) return;
const box = hero.stage.getBoundingClientRect();
h.point.tx = clamp(((event.clientX - box.left) / box.width - 0.5) * 2, -1, 1) * 5;
h.point.ty = clamp(((event.clientY - box.top) / box.height - 0.5) * 2, -1, 1) * -3;
if (pointing) return;
pointing = true;
const ease = () => {
h.point.x += (h.point.tx - h.point.x) * 0.12;
h.point.y += (h.point.ty - h.point.y) * 0.12;
if (scrub && hero.p >= 0 && hero.p <= 0.26) heroActor(hero.p);
if (Math.abs(h.point.tx - h.point.x) + Math.abs(h.point.ty - h.point.y) > 0.02) requestAnimationFrame(ease);
else pointing = false;
};
requestAnimationFrame(ease);
}
const modes = scenes.find((scene) => scene.name === "modes");
function modesActor(p) {
showMode(Math.min(cards.length - 1, Math.floor(span(p, 0.14, 0.94) * cards.length)));
}
const keyboard = scenes.find((scene) => scene.name === "keyboard");
const k = keyboard && {
tilt: part(keyboard.el, "exploded-tilt"), rows: part(keyboard.el, "layer-rows"), bar: part(keyboard.el, "layer-bar"),
mic: part(keyboard.el, "layer-mic"), rings: part(keyboard.el, "layer-rings"),
callouts: [...part(keyboard.el, "callouts").children], more: part(keyboard.el, "more"),
};
function keyboardActor(p) {
const lean = easeInOut(span(p, 0.04, 0.22));
const apart = easeOut(span(p, 0.2, 0.6));
const settle = easeInOut(span(p, 0.64, 0.86));
k.tilt.style.transform = `rotateX(${mix(mix(0, 54, lean), 26, settle).toFixed(2)}deg) rotateZ(${mix(mix(0, -24, lean), -10, settle).toFixed(2)}deg)`;
const unit = (k.tilt.offsetWidth || 520) / 520;
const lift = (layer, height) => { layer.style.transform = `translate3d(0,0,${(height * unit * apart).toFixed(1)}px)`; };
lift(k.rows, 0); lift(k.bar, 56); lift(k.mic, 120); lift(k.rings, 120);
const told = Math.ceil(span(p, 0.2, 0.8) * k.callouts.length);
k.callouts.forEach((line, index) => line.classList.toggle("on", index < told));
k.more.classList.toggle("on", p > 0.86);
}
let keyboardRings = false;
function runKeyboardRings() {
const rings = [...k.rings.children];
if (still) { drawRings(rings, 0.9, 9); return; }
if (keyboardRings) return;
keyboardRings = true;
const started = performance.now();
const tick = (now) => {
if (!keyboard.seen || document.hidden) { keyboardRings = false; return; }
drawRings(rings, (now - started) / 1000, 9);
requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
}
const actors = { hero: heroActor, modes: modesActor, keyboard: keyboardActor };
const statement = document.querySelector(".statement__text");
let statementWords = [];
const flip = document.querySelector(".flip");
const viewers = {
statement(t) {
const lit = Math.round(span(t, 0.24, 0.6) * statementWords.length);
statementWords.forEach((word, index) => word.classList.toggle("on", index < lit));
},
translate(t, view) {
if (flip) flip.classList.toggle("is-turned", t > 0.46);
view.el.style.setProperty("--lean", (1 - easeOut(span(t, 0.08, 0.5))).toFixed(3));
},
lean(t, view) {
view.el.style.setProperty("--lean", (1 - easeOut(span(t, 0.04, 0.42))).toFixed(3));
},
};
let measuredWidth = -1;
let measuredScreen = -1; // a screen's height as the stages have it (100svh)
let measuredPage = -1; // the whole page's height
function holds(stage) {
const style = getComputedStyle(stage);
const room = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
return stage.lastElementChild.getBoundingClientRect().bottom - stage.firstElementChild.getBoundingClientRect().top <= room + 1;
}
function measure() {
measuredWidth = innerWidth;
const wide = innerWidth >= WIDE;
for (const scene of scenes) {
const length = scrub ? scene.lengths[wide ? 0 : 1] : 0;
scene.pinned = length > 0;
if (scene.pinned && scene !== hero) scene.el.style.setProperty("--len", String(length)); else scene.el.style.removeProperty("--len");
scene.near = null;
scene.p = -1;
}
for (const scene of scenes) {
if (!scene.pinned || scene === hero || holds(scene.stage)) continue;
scene.pinned = false;
scene.el.style.removeProperty("--len");
}
const pageTop = scrollY;
for (const scene of scenes) {
scene.top = scene.el.getBoundingClientRect().top + pageTop;
scene.height = scene.el.offsetHeight - (parseFloat(getComputedStyle(scene.el).paddingBottom) || 0);
scene.stageHeight = scene.stage.offsetHeight;
}
measuredScreen = screenHeight();
if (scrub && hero.pinned) measureHero();
if (keyboard && !keyboard.pinned) for (const el of [k.tilt, k.rows, k.bar, k.mic, k.rings]) el.style.transform = "";
for (const view of views) {
view.top = view.el.getBoundingClientRect().top + pageTop;
view.height = view.el.offsetHeight;
view.t = -1;
}
for (const tone of tones) tone.top = tone.el.getBoundingClientRect().top + pageTop;
finalTop = final ? final.getBoundingClientRect().top + pageTop : Infinity;
heroEnd = hero ? hero.top + hero.height : 0;
for (const row of rows) if (scrolls(row)) row.setAttribute("tabindex", "0"); else row.removeAttribute("tabindex");
deckIsRow = !!deck && scrolls(deck);
measureSpots();
measuredPage = root.scrollHeight;
}
let queued = false;
let navTone = "";
function draw() {
queued = false;
const y = scrollY;
const screen = innerHeight;
shownY = y;
if (scrub) {
for (const scene of scenes) {
if (!scene.pinned) continue;
const near = y + screen * 1.5 > scene.top && y < scene.top + scene.height + screen * 0.5;
if (near !== scene.near) {
scene.near = near;
scene.p = -1; // back in reach: place its parts again, and start what runs on a clock
}
if (!near) continue;
const p = clamp((y - scene.top) / Math.max(1, scene.height - scene.stageHeight));
if (p === scene.p) continue;
scene.p = p;
actors[scene.name](p);
}
for (const view of views) {
const t = clamp((y + screen - view.top) / (screen + view.height));
if (t === view.t) continue;
view.t = t;
viewers[view.name](t, view);
}
}
let tone = "light";
const line = Math.max(0, y) + 26;
for (const each of tones) if (each.top <= line) tone = each.el === (hero && hero.el) && scrub && hero.pinned ? heroTone : each.tone;
if (tone !== navTone) {
navTone = tone;
root.dataset.nav = tone;
if (themeColor) themeColor.content = tone === "dark" ? "#000000" : "#ffffff";
}
if (getbar) getbar.classList.toggle("is-up", y > heroEnd - screen * 0.5 && y + screen < finalTop + 80);
}
const queue = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
const spots = [...document.querySelectorAll("main > section, main > div, footer")].map((el) => ({ el, top: 0, height: 0 }));
let shownY = 0; // the scroll position last drawn
function measureSpots() {
const pageTop = scrollY;
for (const spot of spots) {
const box = spot.el.getBoundingClientRect();
spot.top = box.top + pageTop;
spot.height = box.height;
}
}
function place() {
const y = shownY;
if (y <= 0) return null;
for (const scene of scenes) {
const range = scene.height - scene.stageHeight;
if (scene.pinned && y >= scene.top && y <= scene.top + range) return { scene, p: (y - scene.top) / Math.max(1, range) };
}
const line = y + (h ? h.navHeight : 52);
const spot = spots.find((each) => each.top <= line && each.top + each.height > line);
return spot ? { spot, share: (line - spot.top) / Math.max(1, spot.height) } : null;
}
function goBack(to) {
if (!to) return;
const y = to.scene ? to.scene.top + (to.scene.pinned ? to.p * (to.scene.height - to.scene.stageHeight) : 0)
: to.spot.top + to.share * to.spot.height - (h ? h.navHeight : 52);
if (Math.abs(y - scrollY) > 1) { scrollTo(0, y); draw(); }
}
const heroParts = () => [h.copy, h.badges, h.say, h.claim, h.tilt, h.glare, h.shadow, h.curtain];
const keyboardParts = () => [k.tilt, k.rows, k.bar, k.mic, k.rings]; // these keep the styles the build gave them
function turn(on) {
root.classList.toggle("scrub", on); // the page's head may have set it before this script arrived
if (on !== scrub) {
scrub = on;
if (!scrub) {
for (const el of heroParts()) el.removeAttribute("style");
for (const el of keyboardParts()) el.style.transform = "";
h.screen.dataset.frame = "0";
heroFrame = -1; heroStep = -1; shownMode = -1;
delete hero.stage.dataset.step;
hero.el.classList.remove("is-white");
showMode(0);
}
}
measure();
draw();
}
function setUp() {
if (measuredWidth < 0) { measureSpots(); shownY = scrollY; }
const was = place();
cramped = false;
turn(wantsScenes());
if (scrub && !h.fits) { cramped = true; turn(false); }
goBack(was);
root.classList.add("ready"); // the opening's phone has its place now (home.css shows it from here on)
}
if (still) root.classList.add("still");
if (statement) {
const words = statement.textContent.trim().split(/\s+/);
statement.textContent = "";
words.forEach((word, index) => {
const each = document.createElement("span");
each.className = "sw";
each.textContent = word;
statement.append(each, index < words.length - 1 ? " " : "");
statementWords.push(each);
});
}
showMode(0);
let chipScroll = 0; // while a button's own scroll of the row runs, the row's position doesn't choose
chips.forEach((chip, index) => chip.addEventListener("click", () => {
const behavior = still || lessMotion.matches ? "auto" : "smooth";
if (scrub && modes.pinned) {
const p = 0.14 + ((index + 0.5) / cards.length) * 0.8;
scrollTo({ top: modes.top + p * (modes.height - modes.stageHeight), behavior });
return;
}
showMode(index);
if (deckIsRow) {
chipScroll = performance.now() + 800;
deck.scrollTo({ left: cards[index].offsetLeft - cards[0].offsetLeft, behavior });
}
}));
if (deck) deck.addEventListener("scroll", () => {
if (!deckIsRow || (scrub && modes.pinned) || performance.now() < chipScroll) return;
const stride = cards[1].offsetLeft - cards[0].offsetLeft;
const end = deck.scrollWidth - deck.clientWidth;
showMode(deck.scrollLeft >= end - 2 ? cards.length - 1 : clamp(Math.round(deck.scrollLeft / stride), 0, cards.length - 1));
}, { passive: true });
for (const row of rows) {
row.addEventListener("focusin", (event) => {
const item = event.target.closest("li");
if (!item || !row.contains(item) || !scrolls(row)) return;
const box = item.getBoundingClientRect();
const frame = row.getBoundingClientRect();
if (box.left < frame.left || box.right > frame.right) item.scrollIntoView({ block: "nearest", inline: "start" });
});
}
if ("IntersectionObserver" in window && !lessMotion.matches && !query.has("plain")) {
root.classList.add("reveals");
const arrive = new IntersectionObserver((entries) => {
for (const entry of entries) {
if (!entry.isIntersecting) continue;
entry.target.classList.add("in");
arrive.unobserve(entry.target);
const row = entry.target.closest(".short__row");
if (row && scrolls(row)) for (const each of row.children) { each.classList.add("in"); arrive.unobserve(each); }
}
}, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
for (const el of document.querySelectorAll("[data-reveal]")) {
el.style.setProperty("--i", String([...el.parentElement.children].indexOf(el) % 4));
arrive.observe(el);
}
if (keyboard) new IntersectionObserver(([entry]) => {
keyboard.seen = entry.isIntersecting;
if (keyboard.seen) runKeyboardRings();
}, { threshold: 0.05 }).observe(keyboard.el);
}
if (getbar) getbar.hidden = false;
addEventListener("scroll", queue, { passive: true });
addEventListener("resize", () => {
if (innerWidth !== measuredWidth || screenHeight() !== measuredScreen) setUp(); else queue();
});
addEventListener("load", setUp);
lessMotion.addEventListener("change", setUp);
if ("ResizeObserver" in window) {
new ResizeObserver(() => {
if (Math.abs(root.scrollHeight - measuredPage) > 1) { measure(); draw(); }
}).observe(document.body);
}
document.addEventListener("visibilitychange", () => {
if (document.hidden) return;
if (scrub && heroFrame === 1) startRings();
if (keyboard && keyboard.seen) runKeyboardRings();
});
let placeBeforePrint = null;
addEventListener("beforeprint", () => { if (!printing) placeBeforePrint = place(); printing = true; setUp(); }); // (a second one in a row must not replace the place with the plain page's)
addEventListener("afterprint", () => { printing = false; setUp(); goBack(placeBeforePrint); placeBeforePrint = null; });
if (matchMedia("(hover: hover) and (pointer: fine)").matches && hero) hero.stage.addEventListener("pointermove", followPointer);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(setUp);
setUp();
if (/^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)$/.test(location.hostname)) {
const [where, share] = (query.get("at") || "").split(":");
const glide = Number(query.get("glide"));
addEventListener("load", () => {
const scene = scenes.find((each) => each.name === where);
const place = document.getElementById(where);
const at = scene ? scene.top + Number(share || 0) * (scene.height - scene.stageHeight)
: place ? place.getBoundingClientRect().top + scrollY + Number(share || 0) : Number(where);
if (at > 0) { scrollTo(0, at); draw(); }
if (glide > 0) {
let last = performance.now();
const step = (now) => { scrollBy(0, (glide * (now - last)) / 1000); last = now; requestAnimationFrame(step); };
requestAnimationFrame(step);
}
});
}
window.__redmic = {
scenes, views,
get scrub() { return scrub; },
seek(y) { scrollTo(0, y); draw(); },
remeasure: setUp,
};
})();
