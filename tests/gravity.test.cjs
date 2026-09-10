const {test} = require('node:test');
const assert = require('node:assert/strict');
const g = require('../assets/js/gravity.js');
const close = (a,b,tolerance,message) => assert.ok(Math.abs(a-b)<tolerance, message + ': ' + a + ' vs ' + b);
function run(state, duration, sample = () => {}, step = 0.04) {
  for(let t=0;t<duration && !state.outcome;t+=0.2) {
    g.advance(state, Math.min(0.2, duration-t), step);
    sample(state);
  }
  return state;
}
test('circular geodesic matches analytic coordinate period and proper clock', () => {
  const state = g.create('orbit');
  const period = 2*Math.PI*Math.sqrt(2*6**3);
  g.advance(state,period);
  close(state.r,6,1e-9,'constant radius');
  close(state.phi,2*Math.PI,1e-9,'one revolution');
  close(state.tau/state.t,Math.sqrt(1-1.5/6),1e-10,'clock dilation');
  close(state.localSpeed,Math.sqrt(1/(2*(6-1))),1e-10,'local circular speed');
});
test('all trajectories conserve E, retain L, and have subluminal local speed', () => {
  for(const mode of ['flyby','orbit','plunge']) {
    const state=g.create(mode), L=state.L;
    run(state,250,s => {
      assert.ok([s.r,s.u,s.phi,s.tau,...s.p,...s.v].every(Number.isFinite));
      assert.ok(Math.abs(s.energyError)<1e-8,mode+' energy error '+s.energyError);
      assert.equal(s.L,L);
      assert.ok(s.localSpeed<1 && s.localSpeed>=0,mode+' speed '+s.localSpeed);
      assert.ok(s.r>1,'coordinate-time integrator never crosses horizon');
    });
  }
});
test('flyby turns outside the horizon and returns unbound; infall fades outside it', () => {
  let minimum=Infinity;
  const flyby=run(g.create('flyby'),200,s => minimum=Math.min(minimum,s.r));
  assert.equal(flyby.outcome,'escaped');
  assert.ok(minimum>3 && minimum<12);
  assert.ok(flyby.E>1 && flyby.u>0 && flyby.r>=12);
  const infall=run(g.create('plunge'),200);
  assert.equal(infall.outcome,'faded');
  assert.ok(infall.r>1 && infall.r<1.000011);
  assert.ok(infall.clockRate<0.00002);
});
test('capture/scatter behavior follows constants, not a preset mode label', () => {
  const falling=g.fromConstants({r:12,E:1.05,L:0.7,mode:'flyby'});
  const scattering=g.fromConstants({r:12,E:1.05,L:3.1,mode:'plunge'});
  assert.equal(run(falling,200).outcome,'faded');
  assert.equal(run(scattering,200).outcome,'escaped');
});
test('radial fall matches analytic proper time and outward photon redshift', () => {
  const state=g.fromConstants({r:12,E:1,L:0});
  run(state,200);
  const analyticTau=2/3*(12**1.5-state.r**1.5);
  close(state.tau,analyticTau,1e-7,'proper fall time');
  const expected=(1-1/state.r)/(1+1/Math.sqrt(state.r));
  close(g.frequencyShift(state,state.normal),expected,1e-10,'receding radial redshift');
  assert.ok(g.frequencyShift(state,state.normal)**4<1e-18,'negligible near-horizon light');
});
test('ISCO boundary, stable perturbation outside and unstable perturbation inside', () => {
  assert.equal(g.ISCO,3);
  assert.equal(g.PHOTON_SPHERE,1.5);
  const isco=g.fromConstants({r:3,...g.circularConstants(3),u:0});
  close(isco.localSpeed,0.5,1e-12,'ISCO local velocity');
  assert.throws(()=>g.circularConstants(1.5),RangeError);
  const stableL=g.circularConstants(6).L, stableR=6.001;
  const stable=g.fromConstants({r:stableR,L:stableL,E:Math.sqrt(g.potential(stableR,stableL)),u:0});
  run(stable,500,s=>assert.ok(Math.abs(s.r-6)<0.0011));
  const unstableL=g.circularConstants(2.5).L, unstableR=2.499;
  const unstable=g.fromConstants({r:unstableR,L:unstableL,E:Math.sqrt(g.potential(unstableR,unstableL)),u:0});
  assert.equal(run(unstable,500).outcome,'faded');
});
test('step refinement converges for a noncircular trajectory', () => {
  const states=[0.04,0.02,0.01].map(step=>run(g.create('flyby'),32,()=>{},step));
  close(states[0].r,states[2].r,1e-8,'radial convergence');
  close(states[0].phi,states[2].phi,1e-8,'angular convergence');
});
test('invalid launches are rejected and elapsed time is not truncated', () => {
  assert.throws(()=>g.fromConstants({r:0.99,E:1,L:0}),RangeError);
  assert.throws(()=>g.fromConstants({r:6,E:0.1,L:3}),RangeError);
  const state=g.create('orbit');
  g.advance(state,2.3);
  close(state.t,2.3,1e-12,'whole simulation interval');
  const before=state.r;
  g.advance(state,NaN);
  assert.equal(state.r,before);
});
