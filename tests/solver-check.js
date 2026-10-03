'use strict';
const assert = require('node:assert/strict');
const { Model, NX, NY, XMAX, YMAX, DT } = require('../solver.js');

function examine(config, label) {
  const model = new Model(config).solve();
  assert.equal(model.front, 0, `${label}: all layers should be solved`);
  for (const layer of model.W) {
    assert(layer.every(Number.isFinite), `${label}: value field should remain finite`);
  }

  const sampleSites = [[0, 0], [NX - 1, NY - 1], [32, 24], [11, 13]];
  for (const k of [0, Math.floor(model.N / 2), model.N - 1]) {
    for (const [i, j] of sampleSites) {
      const x = i * XMAX / (NX - 1);
      const y = j * YMAX / (NY - 1);
      const best = model.candidates(x, y, k)[0];
      assert(Math.abs(best.q - model.W[k][j * NX + i]) < 1e-9,
        `${label}: displayed best candidate should equal stored value at grid point`);
    }
  }

  const trajectory = model.rollout();
  assert.equal(trajectory.length, model.N + 1);
  for (let k = 0; k < model.N; k++) {
    const a = trajectory[k], b = trajectory[k + 1];
    assert(Math.abs(a.x + DT * a.f.x - b.x) < 1e-9, `${label}: x update`);
    assert(Math.abs(a.y + DT * a.f.y - b.y) < 1e-9, `${label}: y update`);
  }
  for (const p of trajectory) {
    assert(p.x >= -1e-8 && p.x <= XMAX + 1e-8 && p.y >= -1e-8 && p.y <= YMAX + 1e-8,
      `${label}: trajectory stays in state space`);
  }
  return { model, terminal: trajectory.at(-1) };
}

const normal = examine({}, 'default');
assert(normal.model.distance(normal.terminal.x, normal.terminal.y) < 1e-8,
  'default settings should enter the target region');

const short = examine({ T: 2 }, 'short horizon');
assert(short.model.distance(short.terminal.x, short.terminal.y) > 0,
  'a short horizon should show that finite terminal cost does not guarantee arrival');

const newGoal = examine({ gx: 8, gy: 1.2 }, 'moved goal');
let differences = 0;
for (let i = 0; i < normal.model.P[0].length; i++) {
  differences += normal.model.P[0][i] !== newGoal.model.P[0][i] ? 1 : 0;
}
assert(differences > 0, 'changing the future goal should change the present policy somewhere');

examine({ target: 'point', lambda: 0.5 }, 'point target / low penalty');
examine({ beta: -0.6, T: 9 }, 'reverse flow / long horizon');
console.log('HJB LAB: 5 scenarios passed; Bellman values, trajectories and changed-goal policy verified.');
