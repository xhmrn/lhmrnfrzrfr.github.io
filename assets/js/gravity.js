/* Schwarzschild timelike geodesics for a negligible-mass test particle.
 * Units: G = c = 1, Schwarzschild radius R_s = 1 (therefore M = 1/2).
 * E and L are conserved specific energy and angular momentum.
 * (dr/dtau)^2 = E^2 - (1 - 1/r)(1 + L^2/r^2).
 * We integrate in Schwarzschild coordinate time t (the clock at infinity).
 * References and display limitations: docs/black-hole-physics.md.
 */
((root) => {
  "use strict";
  const HORIZON = 1;
  const ISCO = 3;
  const PHOTON_SPHERE = 1.5;
  const PLAYBACK_RATE = 12; // R_s/c per real second; no particular mass assumed.
  const potential = (r, L) => (1 - 1 / r) * (1 + L * L / (r * r));
  const circularConstants = r => {
    if (!(r > PHOTON_SPHERE)) throw new RangeError("No timelike circular orbit at or below 1.5 R_s");
    return {L: r / Math.sqrt(2 * r - 3), E: (1 - 1 / r) / Math.sqrt(1 - 1.5 / r)};
  };
  function refresh(state) {
    const cos = Math.cos(state.phi), sin = Math.sin(state.phi);
    // One fixed inclined orbital plane, allowed by spherical symmetry.
    const inclination = 0.3;
    const a = [-Math.cos(inclination), Math.sin(inclination), 0];
    const b = [0, 0, 1];
    state.normal = a.map((v, i) => v * cos + b[i] * sin);
    state.tangent = a.map((v, i) => -v * sin + b[i] * cos);
    state.p = state.normal.map(v => v * state.r);
    const f = 1 - 1 / state.r;
    const vr = state.u / state.E;
    const vt = Math.sqrt(f) * state.L / (state.E * state.r);
    // Components in the local static observer's orthonormal frame.
    state.v = state.normal.map((n, i) => n * vr + state.tangent[i] * vt);
    state.localSpeed = Math.hypot(vr, vt);
    state.clockRate = f / state.E;
    state.energyError = state.u * state.u + potential(state.r, state.L) - state.E * state.E;
  }
  function fromConstants({r, E, L, u, phi = 0, mode = "custom"}) {
    if (![r,E,L,phi].every(Number.isFinite) || r <= 1 || E <= 0 || L < 0) throw new RangeError("Invalid geodesic constants");
    const radialSquared = E * E - potential(r, L);
    if (radialSquared < -1e-12) throw new RangeError("Energy cannot reach the requested radius");
    if (u === undefined) u = -Math.sqrt(Math.max(0, radialSquared));
    if (!Number.isFinite(u) || Math.abs(u * u - radialSquared) > 1e-9) throw new RangeError("Radial velocity violates the energy constraint");
    const state = {mode, r, E, L, u, phi, t: 0, tau: 0, age: 0, startRadius: r, outcome: null};
    refresh(state);
    return state;
  }
  function create(mode) {
    if (mode === "orbit") return fromConstants({r: 6, ...circularConstants(6), u: 0, mode});
    if (mode === "flyby") return fromConstants({r: 12, E: 1.05, L: 3.1, mode});
    if (mode === "plunge") return fromConstants({r: 12, E: 1, L: 0.7, mode});
    throw new Error("Unknown trajectory");
  }
  function derivative(y, E, L) {
    const r = Math.max(1 + 1e-12, y[0]), u = y[1];
    const factor = (1 - 1 / r) / E;
    const radialAcceleration = -0.5 / (r*r) + L*L / (r*r*r) - 1.5*L*L / (r*r*r*r);
    return [factor*u, factor*radialAcceleration, factor*L/(r*r), factor];
  }
  function advance(state, coordinateSeconds, maxStep = 0.04) {
    if (state.outcome || !Number.isFinite(coordinateSeconds) || coordinateSeconds <= 0) return state;
    if (!Number.isFinite(maxStep) || maxStep <= 0) throw new RangeError("Invalid integration step");
    // Never silently discard elapsed simulation time.
    const steps = Math.ceil(coordinateSeconds / Math.min(maxStep, 0.04));
    const dt = coordinateSeconds / steps;
    let y = [state.r, state.u, state.phi, state.tau];
    for (let i = 0; i < steps; i++) {
      const k1 = derivative(y, state.E, state.L);
      const k2 = derivative(y.map((v,j) => v + dt*k1[j]/2), state.E, state.L);
      const k3 = derivative(y.map((v,j) => v + dt*k2[j]/2), state.E, state.L);
      const k4 = derivative(y.map((v,j) => v + dt*k3[j]), state.E, state.L);
      y = y.map((v,j) => v + dt*(k1[j]+2*k2[j]+2*k3[j]+k4[j])/6);
      state.t += dt;
      // Numerical display cutoff OUTSIDE the horizon, not a claimed crossing.
      // In Schwarzschild t the falling particle approaches r=1 asymptotically.
      if (y[0] - HORIZON < 1e-5 && y[1] < 0) { state.outcome = "faded"; break; }
      if (y[0] >= state.startRadius && y[1] > 0 && state.E > 1) { state.outcome = "escaped"; break; }
    }
    [state.r, state.u, state.phi, state.tau] = y;
    state.age = state.t;
    refresh(state);
    return state;
  }
  // Frequency ratio for an emitted photon in a specified local direction,
  // received by a static observer at observerRadius. Infinity is supported.
  function frequencyShift(state, photonDirection, observerRadius = Infinity) {
    const length = Math.hypot(...photonDirection);
    if (!length || observerRadius <= 1) throw new RangeError("Invalid observer/direction");
    const f = 1 - 1/state.r;
    const observerF = 1 - 1/observerRadius;
    const dot = state.v.reduce((sum,v,i) => sum + v*photonDirection[i]/length, 0);
    const gamma = state.E / Math.sqrt(f);
    return Math.sqrt(f/observerF) / (gamma * (1-dot));
  }
  const api = {create, fromConstants, advance, potential, circularConstants, frequencyShift, HORIZON, ISCO, PHOTON_SPHERE, PLAYBACK_RATE};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BlackHoleGravity = api;
})(typeof globalThis === "undefined" ? this : globalThis);
