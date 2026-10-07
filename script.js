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

  // Each view: which way the reveal sweeps in, plus its caption copy.
  const VIEWS = {
    front:  { order: 0, from: "center", label: "Street Elevation",   desc: "Double-height glazing & sculpted balconies" },
    left:   { order: 1, from: "left",   label: "Side Perspective",   desc: "Timber fins, private wings & garden frontage" },
    aerial: { order: 2, from: "up",     label: "Aerial Overview",    desc: "Rooftop lounge & a gated motor court for five" },
    right:  { order: 3, from: "right",  label: "Corner Residence",   desc: "Wrap-around terraces & ambient cove lighting" },
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
  let cutTimer = null;

  // Preload every angle so cuts never flash
  Object.values(layers).forEach((el) => {
    const url = getComputedStyle(el).getPropertyValue("--img").match(/url\(["']?(.*?)["']?\)/);
    if (url) new Image().src = url[1];
  });
  layers.front.classList.add("settled");

  function zoneFor(nx, ny) {
    if (ny < -UP_THRESHOLD && -ny > Math.abs(nx)) return "aerial";
    if (nx < -SIDE_THRESHOLD) return "left";
    if (nx > SIDE_THRESHOLD) return "right";
    return "front";
  }

  function show(view, origin) {
    if (view === current || !layers[view]) return;

    const now = performance.now();
    const wait = MIN_GAP_MS - (now - lastCut);
    if (wait > 0) {
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => show(view, origin), wait);
      return;
    }
    lastCut = now;

    const prev = layers[current];
    const next = layers[view];
    const dir = VIEWS[view].from;

    // Clean up any layer still fading from a previous cut
    Object.values(layers).forEach((el) => {
      if (el !== prev && el !== next) el.classList.remove("is-leaving", "is-active", "settled");
    });

    // Outgoing frame recedes underneath
    prev.classList.remove("is-active", "settled");
    prev.classList.add("is-leaving");

    // Incoming frame: snap to its start pose, then animate in
    next.classList.remove("is-leaving", "settled", "is-active", "from-left", "from-right", "from-up", "from-center");
    if (origin) {
      next.style.setProperty("--cx", `${origin.x}%`);
      next.style.setProperty("--cy", `${origin.y}%`);
    }
    next.classList.add("no-anim", `from-${dir}`);
    void next.offsetWidth; // commit start pose
    next.classList.remove("no-anim");
    requestAnimationFrame(() => next.classList.add("is-active"));

    // Letterbox bars dip in for the cut
    if (!reduceMotion) {
      hero.classList.add("is-cutting");
      clearTimeout(cutTimer);
      cutTimer = setTimeout(() => hero.classList.remove("is-cutting"), 900);
    }

    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      next.classList.remove(`from-${dir}`);
      next.classList.add("settled");
      prev.classList.remove("is-leaving");
    }, reduceMotion ? 700 : 2000);

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

  function request(view, origin) {
    clearTimeout(pendingTimer);
    if (view === current) return;
    pendingTimer = setTimeout(() => show(view, origin), DWELL_MS);
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

    request(zoneFor(nx, ny), { x: (x / r.width) * 100, y: (y / r.height) * 100 });

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
