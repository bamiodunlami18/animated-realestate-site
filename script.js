(() => {
  const hero = document.getElementById("hero");
  const stage = document.getElementById("stage");
  const glow = document.getElementById("cursorGlow");
  const hint = document.getElementById("hint");
  const progressBar = document.getElementById("progressBar");
  const caption = document.querySelector(".view-caption");
  const viewIndex = document.getElementById("viewIndex");
  const viewLabel = document.getElementById("viewLabel");
  const viewDesc = document.getElementById("viewDesc");
  const journey = document.getElementById("journey");
  const zoom = document.getElementById("zoom");
  const shade = document.getElementById("shade");
  const heroUi = document.getElementById("heroUi");
  const living = document.getElementById("living");
  const livingMedia = document.getElementById("livingMedia");
  const doorGlow = document.getElementById("doorGlow");
  const layers = Object.fromEntries(
    [...stage.querySelectorAll(".layer")].map((el) => [el.dataset.view, el])
  );

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Caption copy for each view.
  const VIEWS = {
    front:  { order: 0, label: "Street Elevation",   desc: "Double-height glazing & sculpted balconies" },
    left:   { order: 1, label: "Side Perspective",   desc: "Timber fins, private wings & garden frontage" },
    aerial: { order: 2, label: "Aerial Overview",    desc: "Rooftop lounge & a gated motor court for five" },
    right:  { order: 3, label: "Corner Residence",   desc: "Wrap-around terraces & ambient cove lighting" },
  };

  // Blend ramps, in normalised cursor units (-1..1 from the hero centre).
  // Inside DEAD_ZONE only the front view shows; by FULL the other view is fully in.
  const DEAD_ZONE = 0.12;
  const FULL = 0.75;
  const FOLLOW = 0.07; // how quickly the blend catches up with the cursor (per frame)

  // Preload every angle so blending never shows a blank frame
  Object.values(layers).forEach((el) => {
    const url = getComputedStyle(el).getPropertyValue("--img").match(/url\(["']?(.*?)["']?\)/);
    if (url) new Image().src = url[1];
  });

  const ramp = (v) => {
    const t = Math.min(Math.max((v - DEAD_ZONE) / (FULL - DEAD_ZONE), 0), 1);
    return t * t * (3 - 2 * t); // smoothstep
  };

  // How much of each view should be visible for a cursor position. Sums to 1.
  function mix(nx, ny) {
    let left = ramp(-nx);
    let right = ramp(nx);
    let aerial = ramp(-ny);
    const total = left + right + aerial;
    if (total > 1) {
      left /= total;
      right /= total;
      aerial /= total;
    }
    return { front: 1 - (left + right + aerial), left, right, aerial };
  }

  // Layers stack front < left < right < aerial, so convert the mix into
  // per-layer opacities that composite to exactly those proportions.
  function applyMix(m) {
    const restBelowAerial = 1 - m.aerial;
    const right = restBelowAerial > 0.001 ? m.right / restBelowAerial : 0;
    const restBelowRight = restBelowAerial - m.right;
    const left = restBelowRight > 0.001 ? m.left / restBelowRight : 0;
    layers.aerial.style.opacity = m.aerial.toFixed(3);
    layers.right.style.opacity = right.toFixed(3);
    layers.left.style.opacity = left.toFixed(3);
  }

  let shown = "front";
  function updateCaption(m) {
    const view = Object.keys(m).reduce((a, b) => (m[b] > m[a] ? b : a));
    if (view === shown) return;
    shown = view;
    const v = VIEWS[view];
    progressBar.style.transform = `translateX(${v.order * 100}%)`;
    caption.classList.remove("swap");
    void caption.offsetWidth;
    caption.classList.add("swap");
    viewIndex.textContent = String(v.order + 1).padStart(2, "0");
    viewLabel.textContent = v.label;
    viewDesc.textContent = v.desc;
  }

  // ---- Scroll journey: street -> front door -> living room ----
  // Front door position in front.jpg (2000 x 1116), in image pixels.
  const IMG = { w: 2000, h: 1116 };
  const DOOR = { x: 1072, y: 707, w: 66, h: 120 };
  const STAGE_BLEED = 1.08; // .stage is inset -4% on each side
  const LAYER_SCALE = 1.04; // .layer transform

  const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
  const smooth = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
  const range = (v, a, b) => clamp01((v - a) / (b - a));
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  let geo = null;
  function measure() {
    const W = hero.clientWidth;
    const H = hero.clientHeight;
    // Same maths as background-size: cover on the oversized stage
    const s = Math.max((W * STAGE_BLEED) / IMG.w, (H * STAGE_BLEED) / IMG.h) * LAYER_SCALE;
    const ox = W / 2 + (DOOR.x - IMG.w / 2) * s;
    const oy = H / 2 + (DOOR.y - IMG.h / 2) * s;
    const hw = (DOOR.w * s) / 2;
    const hh = (DOOR.h * s) / 2;
    // Zoom needed for the doorway to cover the whole screen
    const maxZ = Math.max(ox / hw, (W - ox) / hw, oy / hh, (H - oy) / hh) * 1.04;
    geo = { W, H, ox, oy, hw, hh, maxZ };
    zoom.style.setProperty("--ox", `${ox}px`);
    zoom.style.setProperty("--oy", `${oy}px`);
    doorGlow.style.setProperty("--ox", `${ox}px`);
    doorGlow.style.setProperty("--oy", `${oy}px`);
  }
  measure();
  window.addEventListener("resize", measure);

  function scrollProgress() {
    const travel = journey.offsetHeight - window.innerHeight;
    return travel > 0 ? clamp01(-journey.getBoundingClientRect().top / travel) : 0;
  }

  let sp = scrollProgress();
  let inside = false;

  function renderJourney() {
    const { W, H, ox, oy, hw, hh, maxZ } = geo;

    // Hero copy lifts away first
    const ui = 1 - smooth(sp / 0.12);
    heroUi.style.setProperty("--ui", ui.toFixed(3));
    shade.style.setProperty("--shade", (1 - smooth((sp - 0.02) / 0.2)).toFixed(3));
    hero.classList.toggle("is-scrolled", sp > 0.01);

    // Walk towards the door: exponential zoom feels like constant forward speed
    const t = reduceMotion ? 0 : easeInOut(range(sp, 0.04, 0.62));
    const z = Math.exp(Math.log(maxZ) * t);
    zoom.style.setProperty("--z", z.toFixed(4));

    // The living room shows through the doorway, which grows with the zoom
    const top = Math.max(oy - hh * z, 0);
    const bottom = Math.max(H - (oy + hh * z), 0);
    const left = Math.max(ox - hw * z, 0);
    const right = Math.max(W - (ox + hw * z), 0);
    if (reduceMotion) {
      living.style.setProperty("--ct", "0px");
      living.style.setProperty("--cr", "0px");
      living.style.setProperty("--cb", "0px");
      living.style.setProperty("--cl", "0px");
    } else {
      living.style.setProperty("--ct", `${top.toFixed(1)}px`);
      living.style.setProperty("--cr", `${right.toFixed(1)}px`);
      living.style.setProperty("--cb", `${bottom.toFixed(1)}px`);
      living.style.setProperty("--cl", `${left.toFixed(1)}px`);
    }
    const lo = reduceMotion ? smooth((sp - 0.2) / 0.4) : smooth((sp - 0.06) / 0.14);
    living.style.setProperty("--lo", lo.toFixed(3));

    // Inside: the room settles from a bright, wide glimpse to its true exposure
    const settle = reduceMotion ? 1 : 1 - Math.pow(1 - range(sp, 0.25, 0.85), 3);
    livingMedia.style.setProperty("--ls", (1.35 - 0.35 * settle).toFixed(4));
    livingMedia.style.setProperty("--lb", (1.6 - 0.6 * settle).toFixed(3));
    livingMedia.style.setProperty("--lsat", (0.8 + 0.2 * settle).toFixed(3));

    // Warm bloom as you cross the threshold
    const glow = reduceMotion ? 0 : 0.5 * Math.sin(Math.PI * range(sp, 0.32, 0.72));
    doorGlow.style.setProperty("--glow", glow.toFixed(3));

    // Hero is fully hidden once the doorway covers the screen
    hero.style.visibility = top + bottom + left + right === 0 && lo === 1 ? "hidden" : "";

    if (!inside && sp > 0.8) { inside = true; living.classList.add("is-inside"); }
    else if (inside && sp < 0.7) { inside = false; living.classList.remove("is-inside"); }
  }

  // ---- Render loop: ease toward the cursor, then blend + parallax ----
  const target = { x: 0, y: 0, gx: window.innerWidth / 2, gy: window.innerHeight / 2 };
  const pos = { ...target };

  function tick() {
    const k = reduceMotion ? 1 : FOLLOW;
    pos.x += (target.x - pos.x) * k;
    pos.y += (target.y - pos.y) * k;
    pos.gx += (target.gx - pos.gx) * 0.15;
    pos.gy += (target.gy - pos.gy) * 0.15;

    const p = scrollProgress();
    sp = reduceMotion ? p : sp + (p - sp) * 0.1;
    if (Math.abs(p - sp) < 0.0005) sp = p;
    renderJourney();

    // Mouse influence fades out as the walk begins, so the zoom lands on the front door
    const heroWeight = 1 - smooth(sp / 0.1);
    const m = mix(pos.x * heroWeight, pos.y * heroWeight);
    applyMix(m);
    updateCaption(m);

    if (!reduceMotion) {
      stage.style.setProperty("--px", `${(-pos.x * 26 * heroWeight).toFixed(2)}px`);
      stage.style.setProperty("--py", `${(-pos.y * 18 * heroWeight).toFixed(2)}px`);
    }
    glow.style.setProperty("--gx", `${pos.gx.toFixed(1)}px`);
    glow.style.setProperty("--gy", `${pos.gy.toFixed(1)}px`);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function aim(nx, ny) {
    target.x = Math.min(Math.max(nx, -1), 1);
    target.y = Math.min(Math.max(ny, -1), 1);
  }

  // ---- Mouse tracking ----
  // Tracked on window so the fixed nav bar doesn't count as "leaving" the hero
  let hintHidden = false;
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const r = hero.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const nx = (x / r.width) * 2 - 1;
    const ny = (y / r.height) * 2 - 1;

    aim(nx, ny);
    target.gx = x;
    target.gy = y;

    if (!hintHidden && Math.abs(nx) + Math.abs(ny) > 0.6) {
      hintHidden = true;
      hint.classList.add("hidden");
    }
  });

  document.documentElement.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "touch") return;
    aim(0, 0);
  });

  // ---- Keyboard: left/right look around (up/down keep scrolling the page) ----
  window.addEventListener("keydown", (e) => {
    const map = { ArrowLeft: -1, ArrowRight: 1 };
    if (map[e.key] && scrollProgress() < 0.02) {
      e.preventDefault();
      aim(target.x === map[e.key] ? 0 : map[e.key], 0);
    }
  });

  // ---- Touch: drag sideways across the hero to look around (vertical swipes scroll) ----
  let touchStart = null;
  hero.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY, nx: target.x, ny: target.y };
  }, { passive: true });

  hero.addEventListener("touchmove", (e) => {
    if (!touchStart) return;
    const t = e.touches[0];
    const r = hero.getBoundingClientRect();
    // Dragging left reveals the side view, dragging right the corner view
    aim(touchStart.nx + ((t.clientX - touchStart.x) / r.width) * 2.5, 0);
  }, { passive: true });

  hero.addEventListener("touchend", () => { touchStart = null; }, { passive: true });
})();
