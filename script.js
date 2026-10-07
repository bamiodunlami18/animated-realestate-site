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
  const shade = document.getElementById("shade");
  const heroUi = document.getElementById("heroUi");
  const tour = document.getElementById("tour");
  const video = document.getElementById("tourVideo");
  const tourBar = document.getElementById("tourBar");
  const tourRail = document.getElementById("tourRail");
  const tourLoading = document.getElementById("tourLoading");
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

  // ---- Scroll journey: hero -> video tour scrubbed by scroll ----
  // The first INTRO of the scroll fades the hero into the video's opening frame
  // (the same street view); the rest maps linearly onto the video's timeline.
  const INTRO = 0.04;

  const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
  const smooth = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };

  function scrollProgress() {
    const travel = journey.offsetHeight - window.innerHeight;
    return travel > 0 ? clamp01(-journey.getBoundingClientRect().top / travel) : 0;
  }

  let sp = scrollProgress();

  // Load the whole video into memory first: seeking within a fully buffered
  // file is what makes frame-by-frame scrubbing smooth.
  let ready = false;
  let duration = 44;
  const small = window.matchMedia("(max-width: 820px)").matches;
  const src = small ? video.dataset.srcSmall : video.dataset.srcLarge;

  video.addEventListener("loadedmetadata", () => {
    duration = video.duration || duration;
    ready = true;
  });
  video.addEventListener("canplaythrough", () => tourLoading.classList.add("is-done"));

  (async () => {
    try {
      const res = await fetch(src);
      if (!res.ok || !res.body) throw new Error(res.status);
      const total = Number(res.headers.get("content-length")) || 0;
      const reader = res.body.getReader();
      const chunks = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (total) tourLoading.textContent = `Loading tour… ${Math.round((loaded / total) * 100)}%`;
      }
      const type = res.headers.get("content-type") || "video/mp4";
      video.src = URL.createObjectURL(new Blob(chunks, { type }));
    } catch {
      // e.g. opened straight from disk, where fetch() isn't allowed: stream it instead
      video.src = src;
    }
    video.load();
  })();

  // Room captions come from the HTML (data-start / data-end in seconds)
  const caps = [...document.querySelectorAll(".cap")].map((el) => ({
    el,
    start: Number(el.dataset.start),
    end: Number(el.dataset.end),
    name: el.dataset.name,
  }));

  const railBtns = caps.map((cap) => {
    const btn = document.createElement("button");
    btn.className = "rail-btn";
    btn.type = "button";
    btn.textContent = cap.name;
    btn.addEventListener("click", () => {
      // Jump the page to just inside this room; the eased playhead glides there
      const travel = journey.offsetHeight - window.innerHeight;
      const p = INTRO + ((cap.start + 0.6) / duration) * (1 - INTRO);
      window.scrollTo({ top: journey.offsetTop + p * travel });
    });
    tourRail.appendChild(btn);
    return btn;
  });

  let activeCap = -1;
  function renderJourney() {
    // Hero copy lifts away and the mouse-driven views settle back on the front view
    const ui = 1 - smooth(sp / 0.025);
    heroUi.style.setProperty("--ui", ui.toFixed(3));
    shade.style.setProperty("--shade", (1 - smooth(sp / 0.03)).toFixed(3));
    hero.classList.toggle("is-scrolled", sp > 0.002);

    // Video fades in over the hero on its opening (street) frame
    const fade = smooth((sp - 0.012) / (INTRO - 0.012));
    tour.style.setProperty("--tour", fade.toFixed(3));
    tour.classList.toggle("is-visible", fade > 0);
    hero.style.visibility = fade >= 1 ? "hidden" : "";

    // Scroll position -> playhead
    const t = clamp01((sp - INTRO) / (1 - INTRO)) * duration;
    if (ready && !video.seeking && Math.abs(video.currentTime - t) > 1 / 60) {
      video.currentTime = t;
    }
    tourBar.style.setProperty("--t", (t / duration).toFixed(4));

    const idx = fade >= 1 ? caps.findIndex((c) => t >= c.start && t < c.end) : -1;
    if (idx !== activeCap) {
      caps.forEach((c, i) => c.el.classList.toggle("is-on", i === idx));
      railBtns.forEach((b, i) => b.classList.toggle("is-active", i === idx));
      activeCap = idx;
    }
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
    sp = reduceMotion ? p : sp + (p - sp) * 0.12;
    if (Math.abs(p - sp) < 0.00005) sp = p;
    renderJourney();

    // Mouse influence fades out as the tour begins, so the hero meets the video's front view
    const heroWeight = 1 - smooth(sp / 0.015);
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
