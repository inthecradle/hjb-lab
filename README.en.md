# HJB LAB

**Cognitive Dynamics Series · THEOREM 08**

[日本語](README.md) | English

An educational web app for setting a future goal as a terminal condition, then computing a value function and control policy backward in time from `T → 0`. You can use that policy to simulate the state forward from `0 → T`. Select a point on the map to compare candidate controls, environmental drift, the resulting motion, and present and future costs.

HJB LAB explores the relationship between the Hamilton–Jacobi–Bellman equation and dynamic programming discussed in Theorem 8. It shares its header and footer with LYAPUNOV LAB and EVOLUTION LAB. The app's interface and explanations are in Japanese.

## Contents

- [Run locally](#run-locally)
- [Using the simulator](#using-the-simulator)
- [Mathematical model and its scope](#mathematical-model-and-its-scope)
- [Verification](#verification)
- [Files](#files)
- [Cognitive Dynamics Series](#cognitive-dynamics-series)

## Run locally

Use Python 3 and a web browser. Run this command from the `HJB-Lab` directory containing `index.html`. No build step or package installation is required.

```bash
python3 -m http.server 5175 --bind 127.0.0.1
```

Open [http://127.0.0.1:5175/](http://127.0.0.1:5175/) in your browser. Press `Ctrl+C` to stop the server.

## Using the simulator

1. **Set the future target:** Choose a target region, `TCZ(G)`, or a point, `G`. Select “ゴール G を移す” to move the goal on the map.
2. **Compute backward:** Use “最後の一手を考える” (consider the final step), “1手戻す” (step backward), or “逆算を再生” (play backward computation). Each step computes the value `Wₖ(x)` and best control `πₖ(x)` for a time layer. Select a point in the state space to compare the total costs of candidate controls.
3. **Run forward:** Once backward computation finishes, the app switches to this tab automatically. Press “方策を実行” (run the policy) to follow the computed policy from the initial state `x₀`. The app also shows the remaining distance to the target at the end.

Use **2D / 3D** in STATE SPACE to switch between contours and a height field while preserving the time, computed policy, and playback state. Height represents the selected value W or running cost V₀, compressed with `log(1 + value)` for readability. The height scale stays fixed across time within an experiment. Drag the diagram with a mouse or a finger to rotate the view and change its elevation. A click or tap selects a location. Camera buttons and camera reset are also available. Map clicks and arrow keys also work in 3D for inspection and for moving the goal or initial state.

Trajectories and arrows are overlaid on the displayed time slice. Their heights reflect that slice at each location, not historical values at each trajectory time or accumulated costs.

Switch between the value `W` and running cost `V₀`, move the initial state or goal, and adjust the time horizon, terminal weight, environmental drift, running cost, and target radius. Changes to the model parameters restart the backward computation from the terminal condition. Selecting a colored term in an equation highlights its corresponding diagram.

## Mathematical model and its scope

The referenced Theorem 8 uses a **point goal `G`**, a terminal cost `λ d(x(T),G)²`, and the HJB equation for the value function. The app's “点 G” mode uses that form of terminal cost. The “領域 TCZ(G)” mode is an **educational extension** that replaces it with the distance to a target set, `D = TCZ(G)`: `λ d(x(T),D)²`. The disk shown on the map is not a claim to construct a general TCZ.

```text
ẋ = f(x,u,t) = b(x,t) + u
W_N(x) = λ d(x,D)²
Wₖ(x) = min_{u∈U} [ V₀(x,tₖ) Δt + Wₖ₊₁(x + Δt f(x,u,tₖ)) ]
πₖ(x) = argmin_{u∈U} [ the same expression ]
```

The controls `u` consist of no input and 16 directions at speed 1.6. The environmental drift `b(x,t)` varies with position and time. Their sum, `f`, is a **velocity**; the displacement in one step is `Δt f`. The running cost `V₀` includes a central high-cost region and a term based on distance from a fixed location near the default initial state. These are artificial parameters used to illustrate the computation, not measurements of human cognition.

The solver uses a `65 × 49` grid and `Δt = 0.25`. It advances each candidate next state with an Euler step, interpolates the next value layer bilinearly, and compares 17 candidate controls. Controls that would leave the state space are excluded.

This is a discrete approximation in time, space, and controls. It does not provide an exact solution of the continuous-state, continuous-control HJB partial differential equation. A finite terminal penalty does not guarantee arrival at the target. The simulation also does not establish convergence or invariance after arrival.

Backward computation calculates values and policies; state trajectories run forward in time. Specifying the future goal influences the present policy through this optimization procedure.

Reference: [苫米地未来原点認知時間理論 — Theorem 8 and Appendix A.5 (Japanese)](https://tomabechi.jp/TomabechiTimeTheoryMin6JA.html). This app is an educational model for observing finite-horizon optimal control of the same form; it does not implement the paper itself or its proof.

## Verification

The numerical checks require Node.js, with no additional packages. Run this command from the `HJB-Lab` directory:

```bash
node tests/solver-check.js
node tests/surface3d-check.js
```

The checks cover five scenarios: default settings, a short horizon, a moved goal, a point target with a low terminal penalty, and reversed drift with a long horizon. They verify finite values, Bellman updates at grid points, trajectory updates and bounds, and policy changes when the goal moves.

For a browser check, select “最後の一手を考える” → “現在まで計算”. The app switches to “現在から実行” automatically; press “方策を実行” to start playback. A short horizon can leave a nonzero distance to the target, illustrating that arrival is not guaranteed.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure, explanations, and equations |
| `style.css` | Layout, dark theme, and responsive styles |
| `series-chrome.css` | Shared series header and footer styles |
| `series.js` | Shared series UI interactions |
| `solver.js` | Dynamics, costs, Bellman computation, policies, and forward simulation; also usable from Node.js |
| `surface3d.js` | 3D surface projection, rendering, and picking |
| `tests/surface3d-check.js` | Checks for 3D projection and picking |
| `app.js` | User interactions, visualization, time selection, and playback |
| `tests/solver-check.js` | Numerical checks for Bellman updates and boundary cases |

## Cognitive Dynamics Series

| Lab | Topic |
| --- | --- |
| [LYAPUNOV LAB](https://inthecradle.github.io/lyapunov-lab/) · THEOREM 01 | Lyapunov functions and state evolution |
| HJB LAB · THEOREM 08 | Backward computation of values and policies, followed by forward simulation |
| [EVOLUTION LAB](https://inthecradle.github.io/evolution-lab/) · THEOREM 12 | Fitness, gradient flow, and low-abstraction approximation |
| INVERSE LIMIT LAB · THEOREM 16 (fourth installment) | Consistency across levels and fixed points |

On mobile, playback controls and the timeline appear directly after the map. When served locally on port 5175, footer links point to LYAPUNOV LAB on port 5173, EVOLUTION LAB on port 5174, and INVERSE LIMIT LAB on port 5176; run their development servers to use those links. Other hosts use the published LYAPUNOV LAB and EVOLUTION LAB sites.

To enable the public INVERSE LIMIT LAB link, set `data-public-url` on the `data-lab="inverse"` card in `index.html`; without a URL, the card is marked as awaiting publication. Keep `series-chrome.css` identical across all four Labs. The three React apps also share identical copies of `SeriesChrome.tsx` and configure the public INVERSE LIMIT LAB link through the build-time variable `VITE_INVERSE_LIMIT_LAB_URL`.

Created by [CognitiveMind](https://note.com/dawn_of_coaching).
