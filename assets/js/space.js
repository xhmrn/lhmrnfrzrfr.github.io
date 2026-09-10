(() => {
  "use strict";
  const canvas = document.getElementById("space-canvas");
  const container = canvas?.parentElement;
  const button = document.querySelector(".motion-control");
  const resetButton = document.querySelector(".orbit-reset");
  const notice = document.querySelector(".space-notice");
  const simulationPanel = document.querySelector(".simulation-panel");
  const simulationStatus = document.querySelector(".simulation-status");
  const gravity = window.BlackHoleGravity;
  let body = null;
  let bodyState = "";
  if (!canvas || !container || !button) return;
  const fail = () => {
    container.classList.remove("space-ready");
    button.hidden = true;
    if (resetButton) resetButton.hidden = true;
    canvas.tabIndex = -1;
    if (simulationPanel) simulationPanel.hidden = true;
    if (notice) notice.hidden = false;
  };
  if (!window.THREE) { fail(); return; }
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let paused = preference.matches;
  let visible = true, lost = false, ready = false;
  let frame = 0, previous = 0, elapsed = 0, lastDraw = 0;
  let slowFrames = 0, quality = 1;
  const homeView = new THREE.Vector2(0, Math.atan2(2.5, 19));
  const target = homeView.clone();
  const orbit = homeView.clone();
  let drag = null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({canvas, antialias: false, powerPreference: "high-performance"});
  } catch { fail(); return; }
  renderer.setClearColor(0x0a0a0a, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  camera.position.z = 1;

  // Procedural radiating disk and numerical light-path integration.
  // R_s = 1; Schwarzschild null-ray spatial projection, numerically integrated.
  // Timelike particles share this metric and unit system (see gravity.js).
  // Gas emission is illustrative; this is not a Kerr/GRMHD solver.
  // Visual reference: https://svs.gsfc.nasa.gov/13326/
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: {value: 0}, aspect: {value: 1}, orbit: {value: orbit},
      bodyPosition: {value: new THREE.Vector3()}, bodyVelocity: {value: new THREE.Vector3()},
      bodyEnergy: {value: 1}, bodyActive: {value: 0}
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float time;
      uniform float aspect;
      uniform vec2 orbit;
      uniform vec3 bodyPosition;
      uniform vec3 bodyVelocity;
      uniform float bodyEnergy;
      uniform float bodyActive;
      varying vec2 vUv;
      const float PI = 3.14159265;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float turbulence(vec3 p) {
        return noise(p) * 0.57 + noise(p * 2.07) * 0.28 + noise(p * 4.13) * 0.15;
      }
      vec4 diskLight(vec3 hit, vec3 ray) {
        float r = length(hit.xz);
        // Schwarzschild thin-disk inner edge: ISCO = 3 R_s.
        float edge = smoothstep(3.0, 3.3, r) * (1.0 - smoothstep(7.2, 9.5, r));
        // Inner filaments orbit faster: differential rotation shears the gas.
        float phase = atan(hit.z, hit.x) - time * sqrt(0.5 / (r*r*r));
        vec3 flow = vec3(cos(phase) * 6.0, sin(phase) * 6.0, r * 2.8);
        float clouds = turbulence(flow);
        float filaments = noise(flow * vec3(1.7, 1.7, 5.0));
        float bands = 0.5 + 0.5 * sin(r * 49.0 + clouds * 8.0);
        float density = (0.28 + clouds * 1.4) * (0.48 + bands * 0.52)
                      + pow(filaments, 4.0) * 1.6;
        // Zero-torque thin-disk-inspired emissivity; not a GRMHD temperature solution.
        float flux = max(0.0, pow(3.0 / r, 3.0) * (1.0 - sqrt(3.0 / r))) / 0.05665;
        float heat = pow(clamp(flux, 0.0, 1.0), 0.25);
        vec3 ember = mix(vec3(1.0, 0.09, 0.006), vec3(1.0, 0.32, 0.028), heat);
        ember = mix(ember, vec3(1.0, 0.65, 0.19), pow(heat, 3.0) * 0.20);
        vec3 tangent = normalize(vec3(-hit.z, 0.0, hit.x));
        float f = 1.0 - 1.0 / r;
        vec3 radial = normalize(hit);
        vec3 localRay = ray + radial * dot(ray, radial) * (inversesqrt(f) - 1.0);
        float speed = sqrt(0.5 / (r - 1.0));
        float gamma = inversesqrt(1.0 - speed*speed);
        float g = sqrt(f / (1.0 - 1.0 / 19.16377)) /
                  (gamma * (1.0 - dot(tangent * speed, -normalize(localRay))));
        float energy = density * flux * pow(g, 4.0) * 3.6;
        // Reference palette: copper shadows, golden orange filaments, and
        // warm cream confined to the brightest gas (illustrative color).
        ember = mix(ember, vec3(1.0, 0.96, 0.67), smoothstep(2.0, 9.0, energy) * 0.96);
        return vec4(ember * energy, edge * 0.94);
      }

      void main() {
        vec2 screen = (vUv - 0.5) * 2.0;
        screen *= vec2(max(aspect, 1.0), max(1.0 / aspect, 1.0));
        // A near edge-on observer exposes the lensed back of the accretion disk.
        float azimuth = orbit.x;
        // Avoid a ray lying exactly inside the infinitesimally thin disk plane.
        float elevation = abs(orbit.y) < 0.003 ? (orbit.y < 0.0 ? -0.003 : 0.003) : orbit.y;
        vec3 origin = 19.16377 * vec3(
          sin(azimuth) * cos(elevation), sin(elevation),
          cos(azimuth) * cos(elevation)
        );
        vec3 forward = normalize(-origin);
        vec3 right = normalize(cross(forward, vec3(0,1,0)));
        vec3 up = cross(right, forward);
        // Gentle roll gives the orbit a more natural composition.
        float roll = -0.07;
        screen = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * screen;
        vec3 direction = normalize(forward + (right * screen.x + up * screen.y) * 0.53);
        // Map camera-local photon direction into Schwarzschild spatial coordinates.
        // E_infinity = 1; transverse affine speed includes the static lapse.
        vec3 radialOrigin = normalize(origin);
        vec3 radialDirection = radialOrigin * dot(direction, radialOrigin);
        direction = radialDirection + (direction - radialDirection) /
                    sqrt(1.0 - 1.0 / length(origin));
        vec3 position = origin;
        vec3 angularMomentum = cross(position, direction);
        float h2 = dot(angularMomentum, angularMomentum);
        vec3 radiance = vec3(0.0);
        float transmission = 1.0;
        bool captured = false;
        bool escaped = false;

        for (int i = 0; i < 180; i++) {
          float r = length(position);
          if (r <= 1.0001) { captured = true; break; }
          if (r > 23.0 && dot(position, direction) > 0.0) { escaped = true; break; }
          float stepSize = clamp(r * 0.055, 0.025, 1.1);
          vec3 acceleration = -1.5 * h2 * position / pow(r, 5.0);
          vec3 next = position + direction * stepSize + 0.5 * acceleration * stepSize * stepSize;
          float nextR = max(length(next), 0.8);
          vec3 nextAcceleration = -1.5 * h2 * next / pow(nextR, 5.0);
          direction += (acceleration + nextAcceleration) * 0.5 * stepSize;

          // Trace the luminous test object along the same bent light rays.
          if (bodyActive > 0.5) {
            vec3 segment = next - position;
            float along = clamp(dot(bodyPosition - position, segment) / max(dot(segment, segment), 0.00001), 0.0, 1.0);
            float distanceToBody = length(position + segment * along - bodyPosition);
            if (distanceToBody < 0.26) {
              float bodyRadius = length(bodyPosition);
              float f = max(0.000001, 1.0 - 1.0/bodyRadius);
              vec3 normal = normalize(bodyPosition);
              vec3 localRay = direction + normal * dot(direction, normal) * (inversesqrt(f) - 1.0);
              float g = f / (bodyEnergy * sqrt(1.0 - 1.0 / 19.16377) *
                        max(0.0001, 1.0 - dot(bodyVelocity, -normalize(localRay))));
              // Bolometric intensity follows g^4. Tint is illustrative, not spectroscopy.
              vec3 tint = mix(vec3(1.0, 0.1, 0.015), vec3(1.0, 1.0, 1.0), smoothstep(0.15, 1.0, g));
              float glow = 1.0 - smoothstep(0.08, 0.26, distanceToBody);
              radiance += transmission * tint * pow(g, 4.0) * glow * 5.0;
              // A display marker must not turn into an opaque dark marble when it fades.
              if (distanceToBody < 0.1 && g > 0.7) { transmission = 0.0; break; }
            }
          }
          if (position.y * next.y < 0.0) {
            float fraction = position.y / (position.y - next.y);
            vec3 hit = mix(position, next, fraction);
            float diskRadius = length(hit.xz);
            if (diskRadius >= 3.0 && diskRadius < 9.5) {
              vec4 emission = diskLight(hit, direction);
              radiance += transmission * emission.rgb * emission.a;
              transmission *= 1.0 - emission.a;
            }
          }
          // Low-density hot atmosphere creates a soft, ray-bent glow.
          float ringRadius = length(position.xz);
          float atmosphere = exp(-abs(position.y) * 5.0)
                           * smoothstep(3.0, 3.4, ringRadius)
                           * (1.0 - smoothstep(5.0, 9.5, ringRadius));
          radiance += transmission * vec3(1.0, 0.18, 0.018) * atmosphere * stepSize * 0.075;
          position = next;
          if (transmission < 0.015) break;
        }
        // Sparse distant stars, distorted by the traced outgoing direction.
        if (escaped && !captured) {
          vec3 sky = normalize(direction);
          vec2 starsUV = vec2(atan(sky.z, sky.x), asin(clamp(sky.y, -1.0, 1.0))) * 150.0;
          vec2 cell = floor(starsUV);
          float seed = hash(vec3(cell, 3.0));
          vec2 local = fract(starsUV) - 0.5;
          float star = (1.0 - smoothstep(0.0, 0.06, length(local))) * step(0.994, seed);
          radiance += transmission * vec3(0.5, 0.48, 0.43) * star;
        }
        // Hue-preserving exposure: compress brightness together so the orange
        // plasma does not wash out to white when relativistic beaming increases.
        float peak = max(radiance.r, max(radiance.g, radiance.b));
        vec3 color = radiance * ((1.0 - exp(-peak * 1.55)) / max(peak, 0.00001));
        color = pow(color, vec3(0.85));
        vec3 background = vec3(0.039215686);
        color = background + color * (1.0 - background);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    depthTest: false, depthWrite: false
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  scene.add(new THREE.Mesh(geometry, material));

  function resize() {
    const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
    material.uniforms.aspect.value = width / height;
    // Bound expensive ray integration to a predictable pixel budget.
    const cap = window.innerWidth <= 560 ? 380000 : 640000;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.25, Math.sqrt(cap / (width * height))) * quality;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    if (ready && !lost) renderer.render(scene, camera);
  }
  function draw(now) {
    frame = 0;
    if (!ready || lost || !visible || document.hidden) return;
    // Cap at 30 fps; orbital speed uses elapsed wall time, not frame counts.
    if (!paused && lastDraw && now - lastDraw < 30) {
      frame = requestAnimationFrame(draw);
      return;
    }
    const delta = previous ? Math.min((now - previous) / 1000, 0.15) : 0;
    previous = now; lastDraw = now;
    if (!paused) {
      elapsed += delta;
      if (body && !body.outcome) {
        gravity.advance(body, delta * gravity.PLAYBACK_RATE);
        material.uniforms.bodyPosition.value.set(...body.p);
        material.uniforms.bodyVelocity.value.set(...body.v);
        material.uniforms.bodyEnergy.value = body.E;
        if (body.outcome) {
          material.uniforms.bodyActive.value = 0;
          setBodyStatus(body.outcome);
        } else if (body.r < 1.6 && body.u < 0) setBodyStatus("redshifting");
        else if (body.mode === "orbit" && body.age > 4) setBodyStatus("orbiting");
        updateReadout(Boolean(body.outcome));
      }
    }
    // Camera interaction remains available while the gas animation is paused.
    if (preference.matches) orbit.copy(target);
    else orbit.lerp(target, 1 - Math.exp(-Math.max(delta, 1 / 60) * 12));
    const viewMoving = orbit.distanceToSquared(target) > 0.00000001;
    if (!viewMoving) orbit.copy(target);
    material.uniforms.time.value = elapsed * (gravity?.PLAYBACK_RATE || 12);
    renderer.render(scene, camera);
    if (delta > 0.08 && !paused) slowFrames++;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 24 && quality > 0.6) {
      quality = Math.max(0.6, quality - 0.15);
      slowFrames = 0;
      resize();
    }
    if (!paused || viewMoving) frame = requestAnimationFrame(draw);
  }
  function sync() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; previous = 0; lastDraw = 0;
    button.hidden = !ready || lost;
    if (resetButton) resetButton.hidden = !ready || lost;
    if (simulationPanel) simulationPanel.hidden = !ready || lost || !gravity;
    canvas.tabIndex = ready && !lost ? 0 : -1;
    button.setAttribute("aria-pressed", String(paused));
    button.setAttribute("aria-label", paused ? "Play black hole animation" : "Pause black hole animation");
    button.querySelector(".motion-label").textContent = paused ? "Play animation" : "Pause animation";
    button.querySelector(".motion-icon").textContent = paused ? "▷" : "Ⅱ";
    if (ready && !lost && visible && !document.hidden) frame = requestAnimationFrame(draw);
  }
  button.addEventListener("click", () => { paused = !paused; sync(); });
  preference.addEventListener("change", event => {
    paused = event.matches; orbit.copy(target); sync();
  });
  function requestView() {
    target.y = THREE.MathUtils.clamp(target.y, -1.4, 1.4);
    if (preference.matches) orbit.copy(target);
    if (!frame && ready && !lost && visible && !document.hidden) {
      previous = 0;
      lastDraw = 0;
      frame = requestAnimationFrame(draw);
    }
  }
  function resetView() {
    // Return along the shortest horizontal arc, even after several revolutions.
    const turn = Math.PI * 2;
    target.set(Math.round(orbit.x / turn) * turn, homeView.y);
    requestView();
  }
  function endDrag(event) {
    if (!drag || (event && event.pointerId !== undefined && event.pointerId !== drag.id)) return;
    const id = drag.id;
    drag = null;
    canvas.classList.remove("is-dragging");
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  canvas.addEventListener("pointerdown", event => {
    if (!ready || lost || drag || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    canvas.focus({preventScroll: true});
    drag = {id: event.pointerId, x: event.clientX, y: event.clientY};
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
    const bounds = canvas.getBoundingClientRect();
    target.x -= (event.clientX - drag.x) / Math.max(bounds.width, 1) * Math.PI * 2;
    target.y -= (event.clientY - drag.y) / Math.max(bounds.height, 1) * Math.PI;
    drag.x = event.clientX;
    drag.y = event.clientY;
    requestView();
  });
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("lostpointercapture", endDrag);
  window.addEventListener("blur", () => endDrag());
  canvas.addEventListener("keydown", event => {
    const step = event.shiftKey ? 0.3 : 0.12;
    switch (event.key) {
      case "ArrowLeft": target.x += step; break;
      case "ArrowRight": target.x -= step; break;
      case "ArrowUp": target.y += step; break;
      case "ArrowDown": target.y -= step; break;
      case "Home": event.preventDefault(); resetView(); return;
      default: return;
    }
    event.preventDefault();
    requestView();
  });
  if (resetButton) resetButton.addEventListener("click", resetView);
  function setBodyStatus(state) {
    if (!simulationStatus || state === bodyState) return;
    bodyState = state;
    const messages = {
      flyby: "Unbound approach — energy and angular momentum determine whether the particle turns back.",
      orbit: "Circular orbit at 6 horizon radii — safely outside the innermost stable circular orbit.",
      plunge: "Infall — following the particle in the distant observer's time coordinate.",
      redshifting: "Approaching the horizon — the marker slows and fades from gravitational and Doppler redshift.",
      faded: "Faded near the horizon. A distant observer does not see a finite-time crossing; the particle crosses in finite proper time.",
      escaped: "Scattered back outward on an unbound orbit — it did not cross the event horizon.",
      orbiting: "Stable relativistic orbit at 6 horizon radii. Drag to inspect it from another angle.",
      clear: "Choose a trajectory, then launch. You can drag the view while it moves."
    };
    simulationStatus.textContent = messages[state] || messages.clear;
  }
  let readoutAt = 0;
  function updateReadout(force = false) {
    const readout = document.querySelector(".simulation-readout");
    if (!readout) return;
    if (!body) { readout.textContent = ""; return; }
    if (!force && body.t - readoutAt < 1) return;
    readoutAt = body.t;
    const radius = body.r < 1.001 ? "1 + " + (body.r - 1).toExponential(1) : body.r.toFixed(3);
    const speed = body.localSpeed > 0.999 ? ">0.999" : body.localSpeed.toFixed(3);
    const clock = body.clockRate < 0.001 ? "<0.001" : body.clockRate.toFixed(3);
    readout.textContent = "Radius " + radius + " Rₛ · Local speed " +
      speed + " c · Particle clock " + clock + " × distant clock";
  }
  document.querySelector(".launch-object")?.addEventListener("click", () => {
    if (!ready || lost || !gravity) return;
    body = gravity.create(document.getElementById("trajectory").value);
    material.uniforms.bodyPosition.value.set(...body.p);
    material.uniforms.bodyVelocity.value.set(...body.v);
    material.uniforms.bodyEnergy.value = body.E;
    material.uniforms.bodyActive.value = 1;
    bodyState = "";
    setBodyStatus(body.mode);
    readoutAt = 0;
    updateReadout(true);
    paused = false; // Launch is an explicit request to play the simulation.
    sync();
  });
  document.querySelector(".clear-object")?.addEventListener("click", () => {
    body = null;
    material.uniforms.bodyActive.value = 0;
    setBodyStatus("clear");
    updateReadout(true);
    requestView();
  });
  document.addEventListener("visibilitychange", sync);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }).observe(container);
  }
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(container);
  else window.addEventListener("resize", resize);
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault(); endDrag(); lost = true; sync(); fail();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    lost = false; ready = true; resize();
    if (notice) notice.hidden = true;
    container.classList.add("space-ready"); sync();
  });
  resize();
  renderer.compile(scene, camera);
  const failedProgram = renderer.info.programs.some(program => program.diagnostics?.runnable === false);
  if (failedProgram) { fail(); renderer.dispose(); return; }
  ready = true;
  container.classList.add("space-ready");
  sync();
})();
