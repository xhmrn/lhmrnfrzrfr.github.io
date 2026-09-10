(() => {
  "use strict";
  const canvas = document.getElementById("hero-backdrop");
  const hero = document.querySelector(".hero-copy");
  const context = canvas?.getContext("2d", { alpha: true });
  if (!context || !hero) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let paused = reduced.matches;
  let visible = true;
  let frame = 0, last = 0, time = 0;
  let width = 1, height = 1;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  const lanes = 32;
  const segments = 72;

  // A flowing contour field, drawn directly in canvas; no images or video.
  function point(u, lane) {
    const spread = (lane - (lanes - 1) / 2) / lanes;
    return {
      x: width * (-0.12 + u * 1.25) + pointer.x * u * 16,
      y: height * (0.95 - u * 0.79 + spread * 0.43
        + Math.sin(u * 6.4 - time * 0.16 + spread * 0.7) * 0.115
        + Math.sin(u * 12 + time * 0.12 + spread * 1.4) * 0.025)
        + pointer.y * u * 20
    };
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    // Leave the left-hand text area quiet; let the light emerge on the right.
    const fade = context.createLinearGradient(0, height, width, 0);
    fade.addColorStop(0, "rgba(226,226,222,0)");
    fade.addColorStop(0.3, "rgba(226,226,222,0.035)");
    fade.addColorStop(0.72, "rgba(226,226,222,0.18)");
    fade.addColorStop(1, "rgba(226,226,222,0.02)");
    context.strokeStyle = fade;
    context.lineWidth = 0.7;
    for (let lane = 0; lane < lanes; lane++) {
      context.beginPath();
      for (let step = 0; step <= segments; step++) {
        const p = point(step / segments, lane);
        if (step === 0) context.moveTo(p.x, p.y);
        else context.lineTo(p.x, p.y);
      }
      context.stroke();
    }

    // Sparse pulses travel along the same field, with short tapered trails.
    for (let i = 0; i < 18; i++) {
      const lane = (i * 13) % lanes;
      const u = ((i * 0.6180339 + time * (0.017 + (i % 4) * 0.003)) % 1);
      const alpha = Math.sin(u * Math.PI) ** 2 * (0.16 + u * 0.38);
      const p = point(u, lane);
      for (let tail = 1; tail <= 9; tail++) {
        const a = point(u - tail * 0.0025, lane);
        const b = point(u - (tail - 1) * 0.0025, lane);
        context.strokeStyle = `rgba(235,235,230,${alpha * (1 - tail / 10) * 0.5})`;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
      context.fillStyle = `rgba(245,245,238,${alpha})`;
      context.beginPath();
      context.arc(p.x, p.y, i % 3 === 0 ? 1.3 : 0.8, 0, Math.PI * 2);
      context.fill();
    }
  }

  function tick(now) {
    frame = requestAnimationFrame(tick);
    if (last && now - last < 1000 / 30) return;
    const delta = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    time += delta;
    const ease = 1 - Math.exp(-delta * 4);
    pointer.x += (pointer.targetX - pointer.x) * ease;
    pointer.y += (pointer.targetY - pointer.y) * ease;
    draw();
  }

  function sync() {
    cancelAnimationFrame(frame);
    last = 0;
    if (!paused && visible && !document.hidden) frame = requestAnimationFrame(tick);
    else draw();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  // Listen on the section so its decorative layer never intercepts links,
  // text selection, page scrolling, or the black hole's drag controls.
  hero.closest(".hero").addEventListener("pointermove", event => {
    if (event.pointerType !== "mouse" || paused) return;
    const rect = hero.getBoundingClientRect();
    pointer.targetX = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
    pointer.targetY = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
  }, { passive: true });
  hero.closest(".hero").addEventListener("pointerleave", () => {
    pointer.targetX = pointer.targetY = 0;
  });
  reduced.addEventListener("change", () => { paused = reduced.matches; sync(); });
  document.addEventListener("visibilitychange", sync);
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    sync();
  }).observe(hero);
  new ResizeObserver(resize).observe(canvas);
  window.addEventListener("resize", resize, { passive: true });
  resize();
  sync();
})();
