(function (root) {
  'use strict';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function create({ width, height, values, nx, ny, xmax, ymax, maxValue, yaw = -.6, pitch = .65 }) {
    if (!(width > 0 && height > 0 && nx >= 2 && ny >= 2 && xmax > 0 && ymax > 0) || values.length !== nx * ny) {
      throw new Error('Invalid surface dimensions');
    }
    let largest = 0;
    for (const value of values) {
      if (!Number.isFinite(value) || value < 0) throw new Error('Surface values must be finite and nonnegative');
      largest = Math.max(largest, value);
    }
    const maximum = Math.max(maxValue || 0, largest), denominator = Math.log1p(maximum);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const unit = 2 / Math.max(xmax, ymax), zScale = .95;
    const elevation = value => denominator ? zScale * Math.log1p(value) / denominator : 0;
    function project(x, y, z) {
      const xx = (x - xmax / 2) * unit, yy = (y - ymax / 2) * unit;
      const horizontal = cy * xx - sy * yy, rear = sy * xx + cy * yy;
      return { x: horizontal, y: -sp * rear - cp * z, depth: -cp * rear + sp * z };
    }
    // Fit the whole fixed-height box, so value changes cannot rescale the scene.
    const box = [];
    for (const x of [0, xmax]) for (const y of [0, ymax]) for (const z of [0, maximum ? zScale : 0]) box.push(project(x, y, z));
    const minX = Math.min(...box.map(p => p.x)), maxX = Math.max(...box.map(p => p.x));
    const minY = Math.min(...box.map(p => p.y)), maxY = Math.max(...box.map(p => p.y));
    const marginX = 31, marginY = 27;
    const scale = Math.min(Math.max(1, width - 2 * marginX) / (maxX - minX), Math.max(1, height - 2 * marginY) / (maxY - minY));
    const offsetX = (width - scale * (minX + maxX)) / 2, offsetY = (height - scale * (minY + maxY)) / 2;
    function screen(x, y, z) {
      const p = project(x, y, z);
      return { x: offsetX + p.x * scale, y: offsetY + p.y * scale, depth: p.depth };
    }
    function sample(x, y) {
      const xx = clamp(x / xmax * (nx - 1), 0, nx - 1), yy = clamp(y / ymax * (ny - 1), 0, ny - 1);
      const i = Math.min(nx - 2, Math.floor(xx)), j = Math.min(ny - 2, Math.floor(yy)), a = xx - i, b = yy - j, n = j * nx + i;
      return (1 - b) * ((1 - a) * values[n] + a * values[n + 1]) + b * ((1 - a) * values[n + nx] + a * values[n + nx + 1]);
    }
    const vertices = Array.from(values, (value, n) => {
      const x = n % nx * xmax / (nx - 1), y = Math.floor(n / nx) * ymax / (ny - 1), z = elevation(value);
      return { ...screen(x, y, z), stateX: x, stateY: y, z, value };
    });
    const faces = [];
    function face(a, b, c) {
      const dx1 = (b.stateX - a.stateX) * unit, dy1 = (b.stateY - a.stateY) * unit, dz1 = b.z - a.z;
      const dx2 = (c.stateX - a.stateX) * unit, dy2 = (c.stateY - a.stateY) * unit, dz2 = c.z - a.z;
      const normal = [dy1 * dz2 - dz1 * dy2, dz1 * dx2 - dx1 * dz2, dx1 * dy2 - dy1 * dx2];
      const length = Math.hypot(...normal), light = (.25 * normal[0] - .35 * normal[1] + .9 * normal[2]) / length;
      faces.push({ a, b, c, depth: (a.depth + b.depth + c.depth) / 3, value: (a.value + b.value + c.value) / 3,
        shade: .76 + .24 * Math.max(0, light), minX: Math.min(a.x, b.x, c.x), maxX: Math.max(a.x, b.x, c.x), minY: Math.min(a.y, b.y, c.y), maxY: Math.max(a.y, b.y, c.y) });
    }
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const n = j * nx + i;
      face(vertices[n], vertices[n + 1], vertices[n + nx + 1]);
      face(vertices[n], vertices[n + nx + 1], vertices[n + nx]);
    }
    faces.sort((a, b) => a.depth - b.depth);

    function pick(px, py) {
      // Reverse painter order selects the visible triangle, not the ground below it.
      for (let i = faces.length - 1; i >= 0; i--) {
        const f = faces[i];
        if (px < f.minX - 1e-7 || px > f.maxX + 1e-7 || py < f.minY - 1e-7 || py > f.maxY + 1e-7) continue;
        const { a, b, c } = f, determinant = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
        if (Math.abs(determinant) < 1e-10) continue;
        const u = ((b.y - c.y) * (px - c.x) + (c.x - b.x) * (py - c.y)) / determinant;
        const v = ((c.y - a.y) * (px - c.x) + (a.x - c.x) * (py - c.y)) / determinant, w = 1 - u - v;
        if (u >= -1e-7 && v >= -1e-7 && w >= -1e-7) return { x: clamp(u * a.stateX + v * b.stateX + w * c.stateX, 0, xmax), y: clamp(u * a.stateY + v * b.stateY + w * c.stateY, 0, ymax) };
      }
      return null;
    }
    function strokeLine(ctx, points) {
      ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    }
    function draw(ctx, heat, heightLabel = 'h') {
      ctx.save();
      ctx.strokeStyle = '#a6c9d126'; ctx.lineWidth = .7;
      for (let i = 0; i <= 5; i++) {
        strokeLine(ctx, [screen(xmax * i / 5, 0, 0), screen(xmax * i / 5, ymax, 0)]);
        strokeLine(ctx, [screen(0, ymax * i / 5, 0), screen(xmax, ymax * i / 5, 0)]);
      }
      for (const f of faces) {
        const rgb = heat(f.value, maximum).map(v => Math.round(v * f.shade));
        ctx.fillStyle = `rgb(${rgb.join(',')})`;
        // Same-color fine strokes close antialiasing seams between triangles.
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = .45;
        ctx.beginPath(); ctx.moveTo(f.a.x, f.a.y); ctx.lineTo(f.b.x, f.b.y); ctx.lineTo(f.c.x, f.c.y); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      const origin = screen(0, 0, 0), endX = screen(xmax, 0, 0), endY = screen(0, ymax, 0), top = screen(0, 0, maximum ? zScale : .12);
      ctx.strokeStyle = '#a0b8caaa'; ctx.lineWidth = 1;
      strokeLine(ctx, [endX, origin, endY]); strokeLine(ctx, [origin, top]);
      ctx.font = '11px -apple-system, sans-serif'; ctx.fillStyle = '#bdcbd7'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      function axisLabel(text, p, dx, dy) { ctx.fillText(text, clamp(p.x + dx, 13, width - 13), clamp(p.y + dy, 11, height - 11)); }
      axisLabel('x₁', endX, 12, 13); axisLabel('x₂', endY, -12, 13); axisLabel(heightLabel, top, -11, -10);
      ctx.restore();
    }
    return { to: (x, y) => screen(clamp(x, 0, xmax), clamp(y, 0, ymax), elevation(sample(x, y))),
      floor: (x, y) => screen(clamp(x, 0, xmax), clamp(y, 0, ymax), 0), pick, draw, x: 4, y: 4, pw: width - 8, ph: height - 8 };
  }
  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.HJBSurface = api;
})(typeof window !== 'undefined' ? window : globalThis);
