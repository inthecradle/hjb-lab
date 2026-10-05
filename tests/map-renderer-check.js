"use strict";
const assert = require("node:assert/strict");
const solver = require("../solver.js");
const surfaceAPI = require("../surface3d.js");
const { create } = require("../map-renderer.js");

// Exercise the real renderer without a browser. Canvas methods validate every
// coordinate, while the counters distinguish cached backgrounds from overlays.
function canvasFixture(width, height, dpr = 1) {
  let backgroundPaints = 0;
  const backgrounds = [];
  function context(isBackground) {
    const finite = (...values) =>
      values.forEach((value) => assert.ok(Number.isFinite(value)));
    return {
      setTransform: finite,
      clearRect: finite,
      strokeRect: finite,
      rect: finite,
      moveTo: finite,
      lineTo: finite,
      arc: finite,
      save() {},
      restore() {},
      beginPath() {},
      closePath() {},
      clip() {},
      fill() {},
      stroke() {},
      setLineDash() {},
      fillRect(...values) {
        finite(...values);
        if (isBackground) backgroundPaints++;
      },
      fillText(_text, x, y) {
        finite(x, y);
      },
      measureText(text) {
        return { width: text.length * 6 };
      },
      createImageData(w, h) {
        return { data: new Uint8ClampedArray(w * h * 4) };
      },
      putImageData() {},
      drawImage() {},
    };
  }
  const ownerDocument = {
    defaultView: { devicePixelRatio: dpr },
    createElement() {
      const ctx = context(backgrounds.length === 0);
      const canvas = { getContext: () => ctx };
      backgrounds.push(canvas);
      return canvas;
    },
  };
  const ctx = context(false);
  const canvas = {
    width: 0,
    height: 0,
    ownerDocument,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width, height, left: 12, top: 23 }),
  };
  return { canvas, paints: () => backgroundPaints };
}

const colors = { mint: "#65e6d0", gold: "#ffcc66", text: "#e8eef5" };
function stateFor(model, overrides = {}) {
  return {
    model,
    k: model.N,
    mode: "terminal",
    layer: "value",
    view: "2d",
    yaw: -0.6,
    pitch: 0.65,
    focus: "",
    path: [],
    running: false,
    progress: 0,
    active: null,
    candidates: [],
    showField: false,
    point: { x: model.p.sx, y: model.p.sy },
    ...overrides,
  };
}

for (const [width, height, dpr] of [
  [750, 425, 1],
  [280, 240, 2],
]) {
  const fixture = canvasFixture(width, height, dpr);
  const renderer = create(fixture.canvas, { solver, surfaceAPI, colors });
  let model = new solver.Model();
  const initial = stateFor(model);
  assert.equal(
    renderer.pick(50, 50, "2d"),
    null,
    "No picking before first draw",
  );
  renderer.draw(initial);
  assert.equal(fixture.canvas.width, width * dpr);
  assert.equal(fixture.canvas.height, height * dpr);
  assert.equal(fixture.paints(), 1);
  renderer.draw({ ...initial, focus: "goal" });
  assert.equal(
    fixture.paints(),
    1,
    "Changing an overlay must reuse the background",
  );
  assert.equal(renderer.pick(-10, -10, "2d"), null);
  const scale = Math.min(
    (width - 64) / solver.XMAX,
    (height - 46) / solver.YMAX,
  );
  const x0 = 43 + (width - 64 - scale * solver.XMAX) / 2;
  const hit = renderer.pick(
    12 + x0 + 3 * scale,
    23 + 13 + (solver.YMAX - 2) * scale,
    "2d",
  );
  assert.ok(Math.abs(hit.x - 3) < 1e-9 && Math.abs(hit.y - 2) < 1e-9);

  model = new solver.Model();
  renderer.draw(stateFor(model));
  assert.equal(
    fixture.paints(),
    2,
    "A new model must invalidate an identical background key",
  );
  let costCalls = 0;
  const originalCost = model.cost.bind(model);
  model.cost = (x, y) => {
    costCalls++;
    return originalCost(x, y);
  };
  const costState = stateFor(model, { layer: "cost" });
  renderer.draw(costState);
  assert.equal(costCalls, solver.NX * solver.NY);
  renderer.draw({ ...costState, view: "3d" });
  renderer.draw({ ...costState, view: "3d", yaw: 1.3 });
  assert.equal(
    costCalls,
    solver.NX * solver.NY,
    "Camera changes must reuse the cost grid",
  );
  assert.equal(renderer.pick(-10, -10, "3d"), null);
  renderer.invalidate();
  const beforeInvalidate = fixture.paints();
  renderer.draw(costState);
  assert.equal(fixture.paints(), beforeInvalidate + 1);

  model.solve();
  const path = model.rollout();
  const k = 2,
    candidates = model.candidates(path[k].x, path[k].y, k);
  for (const view of ["2d", "3d"]) {
    renderer.draw(
      stateFor(model, {
        view,
        mode: "forward",
        k,
        path,
        candidates,
        active: candidates[1],
        point: path[k],
        running: true,
        progress: 0.4,
        showField: true,
      }),
    );
  }
}
console.log(
  "HJB map renderer: desktop/mobile drawing, picking, playback overlays and cache lifecycle passed.",
);
