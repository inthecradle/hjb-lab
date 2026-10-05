(function (root) {
  "use strict";

  // Keep map drawing independent of playback and DOM controls. The caller passes
  // the current experiment as a snapshot; only drawing caches live here.
  function create(
    canvas,
    { solver = root.HJBSolver, surfaceAPI = root.HJBSurface, colors } = {},
  ) {
    const { NX, NY, XMAX, YMAX, DT } = solver;
    const document = canvas.ownerDocument;
    const ctx = canvas.getContext("2d"),
      base = document.createElement("canvas"),
      bctx = base.getContext("2d");
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const fmt = (v, n = 2) => (Number.isFinite(v) ? v.toFixed(n) : "不可");
    let backgroundKey = "",
      backgroundModel = null,
      geom = null,
      surface = null,
      surfaceKey = "",
      surfaceModel = null;
    let fieldModel = null,
      fieldCache = null;
    function fields(model) {
      if (fieldModel !== model) {
        const costValues = Float64Array.from({ length: NX * NY }, (_, n) =>
          model.cost(
            ((n % NX) * XMAX) / (NX - 1),
            (Math.floor(n / NX) * YMAX) / (NY - 1),
          ),
        );
        fieldCache = {
          costValues,
          maxCost: Math.max(...costValues),
          terminalMax: Math.max(...model.W[model.N]),
        };
        fieldModel = model;
      }
      return fieldCache;
    }
    function invalidate() {
      backgroundKey = "";
      surfaceKey = "";
    }
    function geometry(state) {
      const { model, k, layer, view, yaw, pitch } = state;
      const rect = canvas.getBoundingClientRect(),
        w = rect.width,
        h = rect.height,
        dpr = document.defaultView.devicePixelRatio || 1;
      if (
        canvas.width !== Math.round(w * dpr) ||
        canvas.height !== Math.round(h * dpr)
      ) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        backgroundKey = "";
      }
      if (view === "3d") {
        const key = [k, layer, w, h, yaw, pitch].join("|");
        if (surfaceModel !== model || surfaceKey !== key) {
          const { costValues, maxCost, terminalMax } = fields(model);
          const maxValue =
            layer === "value" ? terminalMax + model.p.T * maxCost : maxCost;
          surface = surfaceAPI.create({
            width: w,
            height: h,
            values: layer === "value" ? model.W[k] : costValues,
            nx: NX,
            ny: NY,
            xmax: XMAX,
            ymax: YMAX,
            maxValue,
            yaw,
            pitch,
          });
          surfaceKey = key;
          surfaceModel = model;
          backgroundKey = "";
        }
        return { ...surface, w, h, dpr };
      }
      const scale = Math.min((w - 64) / XMAX, (h - 46) / YMAX),
        pw = scale * XMAX,
        ph = scale * YMAX;
      const g = { w, h, dpr, scale, x: 43 + (w - 64 - pw) / 2, y: 13, pw, ph };
      g.to = (x, y) => ({ x: g.x + x * scale, y: g.y + (YMAX - y) * scale });
      return g;
    }
    function heat(v, max) {
      const z = clamp(Math.log1p(v) / Math.log1p(Math.max(0.001, max)), 0, 1),
        stops = [
          [15, 47, 59],
          [29, 88, 98],
          [78, 125, 122],
          [151, 151, 104],
          [205, 159, 95],
        ],
        at = z * (stops.length - 1),
        i = Math.min(stops.length - 2, Math.floor(at)),
        t = at - i;
      return stops[i].map((c, j) => Math.round(c + (stops[i + 1][j] - c) * t));
    }
    function buildBackground(g, state) {
      const { model, k, layer, view, yaw, pitch } = state;
      const key = [
        view,
        yaw,
        pitch,
        k,
        layer,
        g.w,
        g.h,
        model.p.T,
        model.p.lambda,
        model.p.gx,
        model.p.gy,
        model.p.radius,
        model.p.target,
        model.p.beta,
        model.p.barrier,
      ].join("|");
      if (backgroundModel === model && backgroundKey === key) return;
      backgroundModel = model;
      backgroundKey = key;
      base.width = canvas.width;
      base.height = canvas.height;
      bctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
      bctx.fillStyle = "#0c141e";
      bctx.fillRect(0, 0, g.w, g.h);
      if (view === "3d") {
        g.draw(bctx, heat, layer === "value" ? "W" : "V₀");
        return;
      }
      const values = layer === "value" ? model.W[k] : fields(model).costValues;
      const max = Math.max(...values),
        imgCanvas = document.createElement("canvas");
      imgCanvas.width = NX;
      imgCanvas.height = NY;
      const ic = imgCanvas.getContext("2d"),
        img = ic.createImageData(NX, NY);
      for (let j = 0; j < NY; j++)
        for (let i = 0; i < NX; i++) {
          const col = heat(values[j * NX + i], max),
            at = ((NY - 1 - j) * NX + i) * 4;
          img.data[at] = col[0];
          img.data[at + 1] = col[1];
          img.data[at + 2] = col[2];
          img.data[at + 3] = 220;
        }
      ic.putImageData(img, 0, 0);
      bctx.imageSmoothingEnabled = true;
      bctx.drawImage(imgCanvas, g.x, g.y, g.pw, g.ph);
      bctx.save();
      bctx.beginPath();
      bctx.rect(g.x, g.y, g.pw, g.ph);
      bctx.clip();
      const levels = [0.035, 0.075, 0.14, 0.25, 0.42, 0.65, 0.85].map((z) =>
        Math.expm1(z * Math.log1p(max)),
      );
      bctx.strokeStyle = "#d5ede929";
      bctx.lineWidth = 0.7;
      for (const threshold of levels) {
        bctx.beginPath();
        for (let j = 0; j < NY - 1; j++)
          for (let i = 0; i < NX - 1; i++) {
            const pts = [
                [i, j],
                [i + 1, j],
                [i + 1, j + 1],
                [i, j + 1],
              ],
              vs = pts.map(([xx, yy]) => values[yy * NX + xx]),
              cuts = [];
            for (let e = 0; e < 4; e++) {
              const n = (e + 1) % 4;
              if (vs[e] < threshold !== vs[n] < threshold) {
                const a = (threshold - vs[e]) / (vs[n] - vs[e]);
                cuts.push(
                  g.to(
                    ((pts[e][0] + a * (pts[n][0] - pts[e][0])) * XMAX) /
                      (NX - 1),
                    ((pts[e][1] + a * (pts[n][1] - pts[e][1])) * YMAX) /
                      (NY - 1),
                  ),
                );
              }
            }
            for (let e = 0; e + 1 < cuts.length; e += 2) {
              bctx.moveTo(cuts[e].x, cuts[e].y);
              bctx.lineTo(cuts[e + 1].x, cuts[e + 1].y);
            }
          }
        bctx.stroke();
      }
      bctx.strokeStyle = "#c7dfec13";
      bctx.lineWidth = 1;
      for (let x = 0; x <= XMAX; x++) {
        const a = g.to(x, 0),
          b = g.to(x, YMAX);
        bctx.beginPath();
        bctx.moveTo(a.x, a.y);
        bctx.lineTo(b.x, b.y);
        bctx.stroke();
      }
      for (let y = 0; y <= YMAX; y++) {
        const a = g.to(0, y),
          b = g.to(XMAX, y);
        bctx.beginPath();
        bctx.moveTo(a.x, a.y);
        bctx.lineTo(b.x, b.y);
        bctx.stroke();
      }
      bctx.restore();
      bctx.strokeStyle = "#526876";
      bctx.strokeRect(g.x, g.y, g.pw, g.ph);
      bctx.font = "11px -apple-system,sans-serif";
      bctx.fillStyle = "#a0adbb";
      bctx.textAlign = "center";
      for (let x = 0; x <= 10; x += 2) {
        const p = g.to(x, 0);
        bctx.fillText(String(x), p.x, p.y + 17);
      }
      bctx.textAlign = "right";
      for (let y = 0; y <= 7; y += 2) {
        const p = g.to(0, y);
        bctx.fillText(String(y), p.x - 10, p.y + 4);
      }
      bctx.fillText("x₁", g.x + g.pw + 20, g.y + g.ph + 16);
      bctx.fillText("x₂", g.x - 15, g.y + 9);
    }
    function arrow(c, a, b, color, width = 1, head = 4) {
      const dx = b.x - a.x,
        dy = b.y - a.y,
        len = Math.hypot(dx, dy);
      if (len < 1.2) return;
      const angle = Math.atan2(dy, dx),
        h = Math.min(head, len * 0.45);
      c.strokeStyle = color;
      c.fillStyle = color;
      c.lineWidth = width;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
      c.beginPath();
      c.moveTo(b.x, b.y);
      c.lineTo(
        b.x - h * Math.cos(angle - 0.5),
        b.y - h * Math.sin(angle - 0.5),
      );
      c.lineTo(
        b.x - h * Math.cos(angle + 0.5),
        b.y - h * Math.sin(angle + 0.5),
      );
      c.closePath();
      c.fill();
    }
    function label(text, x, y, color = colors.text) {
      ctx.font = "12px -apple-system,sans-serif";
      ctx.textAlign = "left";
      const width = ctx.measureText(text).width + 13;
      x = clamp(x, geom.x + 3, geom.x + geom.pw - width - 2);
      y = clamp(y, geom.y + 17, geom.y + geom.ph - 5);
      ctx.fillStyle = "#0b121ce8";
      ctx.fillRect(x - 4, y - 13, width, 19);
      ctx.fillStyle = color;
      ctx.fillText(text, x + 2, y);
    }
    function draw(state) {
      const {
        model,
        k,
        mode,
        view,
        focus,
        path,
        running,
        progress,
        active,
        candidates,
        showField,
        point: p,
      } = state;
      geom = geometry(state);
      const g = geom;
      if (g.w < 1) return;
      buildBackground(g, state);
      ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
      ctx.clearRect(0, 0, g.w, g.h);
      ctx.drawImage(base, 0, 0, g.w, g.h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(g.x, g.y, g.pw, g.ph);
      ctx.clip();
      if (showField && k < model.N && model.P[k]) {
        for (let j = 2; j < NY - 2; j += 4)
          for (let i = 2; i < NX - 2; i += 4) {
            const x = (i * XMAX) / (NX - 1),
              y = (j * YMAX) / (NY - 1),
              a = model.P[k][j * NX + i],
              f = model.dynamics(x, y, a, k * DT),
              pos = g.to(x, y),
              end = g.to(x + f.x * 0.16, y + f.y * 0.16);
            arrow(ctx, pos, end, "#9beddd7c", 0.9, 3);
          }
      }
      const goal = g.to(model.p.gx, model.p.gy),
        radius =
          model.p.target === "region" && view === "2d"
            ? model.p.radius * g.scale
            : 5;
      ctx.fillStyle = "#65e6d021";
      ctx.strokeStyle = colors.mint;
      ctx.lineWidth = focus === "goal" ? 3 : 1.6;
      ctx.beginPath();
      if (view === "3d" && model.p.target === "region") {
        for (let i = 0; i <= 64; i++) {
          const a = (i * Math.PI) / 32,
            q = g.to(
              model.p.gx + model.p.radius * Math.cos(a),
              model.p.gy + model.p.radius * Math.sin(a),
            );
          if (i === 0) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
        }
        ctx.closePath();
      } else ctx.arc(goal.x, goal.y, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = colors.mint;
      ctx.beginPath();
      ctx.arc(goal.x, goal.y, 3, 0, 2 * Math.PI);
      ctx.fill();
      label(
        model.p.target === "region" ? "TCZ(G)" : "G",
        goal.x + 8,
        goal.y - radius - 10,
        colors.mint,
      );
      const start = g.to(model.p.sx, model.p.sy);
      ctx.strokeStyle = "#e8eef5";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(start.x, start.y, 5, 0, 2 * Math.PI);
      ctx.stroke();
      label("x₀", start.x - 19, start.y + 23);
      if (mode === "forward" && path.length) {
        ctx.beginPath();
        path.forEach((p, i) => {
          const q = g.to(p.x, p.y);
          if (i === 0) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
        });
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = "#ccefe277";
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        for (let i = 0; i <= k; i++) {
          const q = g.to(path[i].x, path[i].y);
          if (i === 0) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
        }
        if (running && k < model.N) {
          const now = path[k],
            next = path[k + 1],
            q = g.to(
              now.x + (next.x - now.x) * progress,
              now.y + (next.y - now.y) * progress,
            );
          ctx.lineTo(q.x, q.y);
        }
        ctx.strokeStyle = colors.mint;
        ctx.lineWidth = 2.6;
        ctx.stroke();
      }
      const location =
          mode === "forward" && running && k < model.N
            ? {
                x: p.x + (path[k + 1].x - p.x) * progress,
                y: p.y + (path[k + 1].y - p.y) * progress,
              }
            : p,
        cp = g.to(location.x, location.y);
      if (active && k < model.N) {
        const origin = g.to(p.x, p.y);
        candidates
          .filter((c) => Number.isFinite(c.q))
          .forEach((c) => {
            const end = g.to(c.next.x, c.next.y);
            arrow(
              ctx,
              origin,
              end,
              c.a === candidates[0].a ? "#65e6d0" : "#d9e7f346",
              c.a === candidates[0].a ? 2 : 1,
              4,
            );
          });
        const end = g.to(active.next.x, active.next.y);
        arrow(
          ctx,
          origin,
          end,
          active.a === candidates[0].a ? colors.mint : colors.gold,
          2.4,
          5,
        );
        ctx.strokeStyle =
          active.a === candidates[0].a ? colors.mint : colors.gold;
        ctx.beginPath();
        ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
        ctx.stroke();
        label("x + Δt f", end.x + 7, end.y - 11, colors.mint);
      }
      ctx.strokeStyle = focus === "x" ? colors.gold : "#f3f8ff";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, 8, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = "#f5faff";
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, 3, 0, 2 * Math.PI);
      ctx.fill();
      if (mode === "forward") label(`x(${fmt(k * DT)})`, cp.x - 32, cp.y + 31);
      ctx.restore();
    }

    function pick(clientX, clientY, view) {
      if (!geom) return null;
      const r = canvas.getBoundingClientRect();
      const hit =
        view === "3d"
          ? geom.pick(clientX - r.left, clientY - r.top)
          : {
              x: (clientX - r.left - geom.x) / geom.scale,
              y: YMAX - (clientY - r.top - geom.y) / geom.scale,
            };
      return hit && hit.x >= 0 && hit.x <= XMAX && hit.y >= 0 && hit.y <= YMAX
        ? hit
        : null;
    }
    return { draw, pick, invalidate };
  }
  const api = { create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HJBMapRenderer = api;
})(typeof window !== "undefined" ? window : globalThis);
