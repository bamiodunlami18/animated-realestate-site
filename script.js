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
  const compassBtns = [...document.querySelectorAll(".c-btn")];
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

  // Mouse zones (normalised -1..1 from the hero centre)
  const SIDE_THRESHOLD = 0.3;  // how far left/right before switching
  const UP_THRESHOLD = 0.35;   // how far up before switching to aerial
  const DWELL_MS = 160;        // cursor must rest in a zone this long (prevents flicker)
  const MIN_GAP_MS = 650;      // minimum spacing between cuts

  let current = "front";
  let pendingTimer = null;
  let lastCut = 0;
  let settleTimer = null;
  const FADE_MS = reduceMotion ? 700 : 1900;

  // Preload every angle so cuts never flash
  Object.values(layers).forEach((el) => {
    const url = getComputedStyle(el).getPropertyValue("--img").match(/url\(["']?(.*?)["']?\)/);
    if (url) new Image().src = url[1];
  });

  function zoneFor(nx, ny) {
    if (ny < -UP_THRESHOLD && -ny > Math.abs(nx)) return "aerial";
    if (nx < -SIDE_THRESHOLD) return "left";
    if (nx > SIDE_THRESHOLD) return "right";
    return "front";
  }

  function show(view) {
    if (view === current || !layers[view]) return;

    const now = performance.now();
    const wait = MIN_GAP_MS - (now - lastCut);
    if (wait > 0) {
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => show(view), wait);
      return;
    }
    lastCut = now;

    const prev = layers[current];
    const next = layers[view];

    // Drop any layer left over from an earlier, unfinished fade
    Object.values(layers).forEach((el) => {
      if (el !== prev && el !== next) el.classList.remove("is-leaving", "is-active");
    });

    // Previous view stays solid underneath while the next one fades in over it
    prev.classList.remove("is-active");
    prev.classList.add("is-leaving");
    next.classList.remove("is-leaving");
    next.classList.add("is-active");

    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => prev.classList.remove("is-leaving"), FADE_MS);

    current = view;
    updateUI(view);
  }

  function updateUI(view) {
    const v = VIEWS[view];
    compassBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.target === view));
    progressBar.style.transform = `translateX(${v.order * 100}%)`;

    caption.classList.remove("swap");
    void caption.offsetWidth;
    caption.classList.add("swap");
    viewIndex.textContent = String(v.order + 1).padStart(2, "0");
    viewLabel.textContent = v.label;
    viewDesc.textContent = v.desc;
  }

  function request(view) {
    clearTimeout(pendingTimer);
    if (view === current) return;
    pendingTimer = setTimeout(() => show(view), DWELL_MS);
  }

  // ---- Smoothed parallax + cursor glow ----
  const target = { x: 0, y: 0, gx: window.innerWidth / 2, gy: window.innerHeight / 2 };
  const pos = { ...target };

  function tick() {
    pos.x += (target.x - pos.x) * 0.06;
    pos.y += (target.y - pos.y) * 0.06;
    pos.gx += (target.gx - pos.gx) * 0.15;
    pos.gy += (target.gy - pos.gy) * 0.15;
    stage.style.setProperty("--px", `${(-pos.x * 26).toFixed(2)}px`);
    stage.style.setProperty("--py", `${(-pos.y * 18).toFixed(2)}px`);
    glow.style.setProperty("--gx", `${pos.gx.toFixed(1)}px`);
    glow.style.setProperty("--gy", `${pos.gy.toFixed(1)}px`);
    requestAnimationFrame(tick);
  }
  if (!reduceMotion) requestAnimationFrame(tick);

  // ---- Mouse tracking ----
  let hintHidden = false;
  // Tracked on window so the fixed nav bar doesn't count as "leaving" the hero
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const r = hero.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const nx = (x / r.width) * 2 - 1;
    const ny = (y / r.height) * 2 - 1;

    target.x = nx;
    target.y = ny;
    target.gx = x;
    target.gy = y;

    // Don't change the view while the cursor is on a control
    if (e.target.closest("a, button")) return;

    request(zoneFor(nx, ny));

    if (!hintHidden && Math.abs(nx) + Math.abs(ny) > 0.6) {
      hintHidden = true;
      hint.classList.add("hidden");
    }
  });

  document.documentElement.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "touch") return;
    target.x = 0;
    target.y = 0;
    request("front");
  });

  // ---- Compass buttons ----
  compassBtns.forEach((btn) =>
    btn.addEventListener("click", () => {
      clearTimeout(pendingTimer);
      show(btn.dataset.target);
    })
  );

  // ---- Keyboard: arrows mirror the mouse directions ----
  window.addEventListener("keydown", (e) => {
    const map = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "aerial", ArrowDown: "front" };
    if (map[e.key]) {
      e.preventDefault();
      clearTimeout(pendingTimer);
      show(map[e.key]);
    }
  });

  // ---- Touch: swipe in a direction to look that way ----
  let touchStart = null;
  hero.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });

  hero.addEventListener("touchend", (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return;
    let view;
    if (Math.abs(dy) > Math.abs(dx)) view = dy < 0 ? "aerial" : "front";
    else view = dx < 0 ? "left" : "right";
    clearTimeout(pendingTimer);
    show(view);
  }, { passive: true });
})();
