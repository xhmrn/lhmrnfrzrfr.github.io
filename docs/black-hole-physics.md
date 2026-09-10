# Black-hole visualization: model and limits

This is a numerical Schwarzschild test-particle demonstration, not a complete
astrophysical simulation or a photoreal prediction for a particular black hole.
The hole is non-rotating, uncharged, and isolated. The particle has negligible
mass and size; there is no back-reaction, gas drag, radiation reaction, or
extended-body tidal disruption. Its drawn marker is deliberately enlarged.

## Units and particle trajectory

Use G = c = R_s = 1, so M = 1/2. Radius is the Schwarzschild areal coordinate.
Specific energy E and angular momentum L are conserved.

    f(r) = 1 - 1/r
    (dr/dτ)^2 + f(r)(1 + L²/r²) = E²
    d²r/dτ² = -1/(2r²) + L²/r³ - 3L²/(2r⁴)
    dφ/dτ = L/r²
    dt/dτ = E/f(r)

The integrator uses RK4 with t as the independent variable, storing
[r, dr/dτ, φ, τ]. Multiply the proper-time derivatives by f/E.
Its maximum step is 0.04 R_s/c. Playback advances 12 R_s/c each wall-clock second;
this is a presentation speed, not a claim about a specific physical mass.

Circular-orbit constants are L² = r²/(2r - 3) and
E = (1 - 1/r)/sqrt(1 - 3/(2r)). Timelike circular orbits exist above 1.5 R_s;
they are stable only above 3 R_s, with marginal stability at 3 R_s.
The default stable orbit is 6 R_s. Default scattering and infall presets
start at 12 R_s, using (E,L) = (1.05,3.1) and (1,0.7), respectively.
Outcomes follow integration, not a path selected by the outcome label.

An unbound particle (E > 1) returning outward to its launch radius ends the
visible flyby. The renderer does not claim to observe a finite-time horizon
crossing. Infall is stopped at r - R_s < 0.00001 R_s, an explicit numerical
cutoff where its light has already become negligible. This is reported as
fading, not crossing an invented absorbing sphere. τ remains finite while
t grows near the horizon.

## Light and appearance

The shader integrates the null-geodesic spatial projection in Schwarzschild
coordinates using an affine parameter λ and E_infinity = 1:

    d²x/dλ² = -(3/2) L² x/r⁵

The static camera's local initial direction is mapped to this coordinate
system using its gravitational lapse. The velocity-Verlet ray integration has
finite steps and a maximum of 180 iterations: high-order images near the
critical photon orbit are not fully resolved. The horizon, photon sphere, and
thin-disk inner edge use 1, 1.5, and 3 R_s, respectively. The apparent shadow
is not a solid sphere at the event horizon.

For a local static observer the particle velocity components are
v_r = (dr/dτ)/E and v_t = sqrt(f)L/(Er). For photons emitted towards the
camera along local unit direction n, the frequency ratio is

    g = sqrt(f_em/f_obs) / [γ_em (1 - v_em · n)]

The camera is static at 19.16377 R_s. Bolometric specific intensity is weighted
by g^4 (from invariance of I_ν/ν³ and integration over frequency).
The gas uses the circular-orbit local speed sqrt[1/(2(r-1))] and coordinate
angular speed sqrt[1/(2r³)]. Orange hue, marker red tint, emissivity, soft glow,
and procedural turbulence are artistic choices. They are not a synthetic
observed spectrum or a fluid calculation.

Rendering uses the particle's position at a common coordinate-time snapshot.
It does **not** solve emission events at retarded times for every curved ray.
Light-travel delays and full observer light curves therefore remain outside
scope. Particle clock readouts show dτ/dt relative to infinity, not the slightly
different proper-time rate of the finite-radius camera.

## Verification

Run node tests/gravity.test.cjs. Tests check conserved energy, subluminal
local speed, analytic circular period, scattering/infall outcomes, stability
above the ISCO and instability below it, numerical convergence, and near-horizon
clock/redshift behavior.

## Primary references

- [UC Berkeley Physics 139, Hartle chapter 9 solutions](https://bohr.physics.berkeley.edu/classes/139/s14/solutions/PS8sol.pdf):
  circular constants, local velocity, ISCO, scattering.
- [University of Maryland, T. Jacobson, Physics 675](https://physics.umd.edu/grt/taj/675e/675bnotes.html):
  Schwarzschild timelike geodesics and effective potential.
- [NASA: Black hole anatomy](https://science.nasa.gov/universe/black-holes/anatomy/):
  horizon, photon sphere, accretion disk, redshift.

To model an actual star being torn apart, one must specify black-hole mass/spin,
stellar mass, radius and structure, then solve tidal/fluid dynamics. Adding
arbitrary stretching to this point-particle marker would not supply that physics.
