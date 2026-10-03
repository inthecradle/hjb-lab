'use strict';
const assert = require('node:assert/strict');
const { create } = require('../surface3d.js');
const nx = 65, ny = 49, xmax = 10, ymax = 7.5;
const field = fn => Float64Array.from({ length: nx * ny }, (_, n) => fn(n % nx * xmax / (nx - 1), Math.floor(n / nx) * ymax / (ny - 1)));
const options = { width: 750, height: 425, nx, ny, xmax, ymax, maxValue: 100, yaw: -.6, pitch: .65 };
function near(actual, expected, tolerance = 1e-7) { assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`); }
function roundTrip(surface, x, y, tolerance = 1e-7) {
  const screen = surface.to(x, y), hit = surface.pick(screen.x, screen.y);
  assert.ok(hit, 'A visible surface point must be pickable'); near(hit.x, x, tolerance); near(hit.y, y, tolerance);
}
function checkedCanvas(width, height) {
  let points = 0, triangles = 0;
  const point = (x, y) => { assert.ok(Number.isFinite(x) && Number.isFinite(y)); assert.ok(x >= 0 && x <= width && y >= 0 && y <= height, `Drawing outside ${width}×${height}: ${x}, ${y}`); points++; };
  return { save() {}, restore() {}, beginPath() {}, moveTo: point, lineTo: point, closePath() { triangles++; }, fill() {}, stroke() {}, fillText(_text, x, y) { point(x, y); }, result() { assert.ok(points > nx * ny); assert.equal(triangles, (nx - 1) * (ny - 1) * 2); } };
}

for (const constant of [0, 17, 100]) {
  const surface = create({ ...options, values: field(() => constant) });
  for (const [x, y] of [[1.5, 2.1], [5, 3.75], [8, 5.5]]) roundTrip(surface, x, y);
  assert.equal(surface.pick(-1, -1), null);
  if (!constant) { const p = surface.to(3, 4), q = surface.floor(3, 4); near(p.x, q.x); near(p.y, q.y); }
}
console.log('PASS zero and constant surfaces: projection and exact picking');

const low = create({ ...options, values: field(() => 2) }), high = create({ ...options, values: field(() => 70) });
assert.ok(high.to(5, 3).y < low.to(5, 3).y, 'Larger values must be visibly higher at a fixed camera and scale');
near(high.to(5, 3).x, low.to(5, 3).x);
near(high.floor(5, 3).y, low.floor(5, 3).y);
console.log('PASS fixed scale and height ordering');

// A gently sloping heightfield stays visible from every camera direction.
const ramp = field((x, y) => Math.expm1(.8 + .035 * x + .025 * y));
for (const [width, height] of [[280, 240], [750, 425]]) for (const pitch of [.35, .65, 1.15]) for (const yaw of [-Math.PI, -1.8, -.6, 0, 1.3, Math.PI]) {
  const surface = create({ ...options, width, height, pitch, yaw, values: ramp });
  for (const [x, y] of [[1.5, 2.1], [5, 3.75], [8, 5.5]]) roundTrip(surface, x, y, .002);
  const ctx = checkedCanvas(width, height); surface.draw(ctx, () => [50, 100, 120]); ctx.result();
  assert.equal(surface.pick(0, 0), null);
  for (const p of [surface.to(-1, -1), surface.to(15, 9)]) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
}
console.log('PASS mobile / desktop bounds, camera extrema and sloped-surface picking');

// With a deep target basin, a screen click may hit a near slope before the far
// slope. Whichever visible triangle wins must still map back to that screen ray.
const basin = field((x, y) => 12 * Math.max(0, Math.hypot(x - 8, y - 5.6) - .65) ** 2);
for (const pitch of [.35, .65, 1.15]) {
  const surface = create({ ...options, values: basin, maxValue: 1000, pitch });
  let hits = 0;
  for (let x = 30; x < 720; x += 19) for (let y = 27; y < 400; y += 19) {
    const hit = surface.pick(x, y);
    if (!hit) continue;
    const projected = surface.to(hit.x, hit.y);
    // The mesh is piecewise linear; to() samples the underlying bilinear field.
    assert.ok(Math.hypot(projected.x - x, projected.y - y) < 1.2);
    hits++;
  }
  assert.ok(hits > 100);
}
console.log('PASS steep target basin: visible mesh picking follows the screen ray');

// Picking must invert a raised mesh, rather than the flat ground projection.
const raised = create({ ...options, values: field(() => 80) }), world = { x: 4, y: 3 }, screen = raised.to(world.x, world.y);
roundTrip(raised, world.x, world.y);
assert.ok(Math.abs(screen.y - raised.floor(world.x, world.y).y) > 40);
assert.throws(() => create({ ...options, values: field(() => Infinity) }), /finite/);
console.log('PASS elevated picking and invalid-value rejection');
