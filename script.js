(() => {
  const journey = document.getElementById("journey");
  const sticky = document.getElementById("sticky");
  const intro = document.getElementById("intro");
  const video = document.getElementById("tourVideo");
  const tourBar = document.getElementById("tourBar");
  const tourRail = document.getElementById("tourRail");
  const tourLoading = document.getElementById("tourLoading");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The first INTRO of the scroll fades out the opening copy while the video
  // holds on its first (street) frame; the rest maps onto the video's timeline.
  const INTRO = 0.04;
  const EASE = 0.12; // how quickly the playhead catches up with the scroll (per frame)

  const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
  const smooth = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };

  function scrollProgress() {
    const travel = journey.offsetHeight - window.innerHeight;
    return travel > 0 ? clamp01(-journey.getBoundingClientRect().top / travel) : 0;
  }

  // ---- Video: load the whole file first; seeking within a fully buffered
  // file is what makes frame-by-frame scrubbing smooth ----
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

  // ---- Room captions come from the HTML (data-start / data-end in seconds) ----
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

  // ---- Render loop ----
  let sp = scrollProgress();
  let activeCap = -1;

  function render() {
    const p = scrollProgress();
    sp = reduceMotion ? p : sp + (p - sp) * EASE;
    if (Math.abs(p - sp) < 0.00005) sp = p;

    // Opening copy lifts away as soon as scrolling starts
    const ui = 1 - smooth(sp / 0.025);
    sticky.style.setProperty("--ui", ui.toFixed(3));
    intro.classList.toggle("is-gone", ui === 0);
    tourRail.style.setProperty("--rail", (1 - ui).toFixed(3));

    // Scroll position -> playhead
    const t = clamp01((sp - INTRO) / (1 - INTRO)) * duration;
    if (ready && !video.seeking && Math.abs(video.currentTime - t) > 1 / 60) {
      video.currentTime = t;
    }
    tourBar.style.setProperty("--t", (t / duration).toFixed(4));

    const idx = caps.findIndex((c) => t >= c.start && t < c.end);
    if (idx !== activeCap) {
      caps.forEach((c, i) => c.el.classList.toggle("is-on", i === idx));
      railBtns.forEach((b, i) => b.classList.toggle("is-active", i === idx));
      activeCap = idx;
    }

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
})();
