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

  // ---- Render loop: ease toward the cursor, then blend + parallax ----
  const target = { x: 0, y: 0, gx: window.innerWidth / 2, gy: window.innerHeight / 2 };
  const pos = { ...target };

  function tick() {
    const k = reduceMotion ? 1 : FOLLOW;
    pos.x += (target.x - pos.x) * k;
    pos.y += (target.y - pos.y) * k;
    pos.gx += (target.gx - pos.gx) * 0.15;
    pos.gy += (target.gy - pos.gy) * 0.15;

    const m = mix(pos.x, pos.y);
    applyMix(m);
    updateCaption(m);

    if (!reduceMotion) {
      stage.style.setProperty("--px", `${(-pos.x * 26).toFixed(2)}px`);
      stage.style.setProperty("--py", `${(-pos.y * 18).toFixed(2)}px`);
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

  // ---- Keyboard: arrows look in that direction ----
  window.addEventListener("keydown", (e) => {
    const map = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 0] };
    if (map[e.key]) {
      e.preventDefault();
      aim(...map[e.key]);
    }
  });

  // ---- Touch: drag across the hero to look around ----
  let touchStart = null;
  hero.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY, nx: target.x, ny: target.y };
  }, { passive: true });

  hero.addEventListener("touchmove", (e) => {
    if (!touchStart) return;
    const t = e.touches[0];
    const r = hero.getBoundingClientRect();
    // Dragging left reveals the side view, dragging up reveals the aerial view
    aim(
      touchStart.nx + ((t.clientX - touchStart.x) / r.width) * 2.5,
      touchStart.ny + ((t.clientY - touchStart.y) / r.height) * 2.5
    );
  }, { passive: true });

  hero.addEventListener("touchend", () => { touchStart = null; }, { passive: true });
})();
