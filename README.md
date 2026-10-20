# Trellis design workspace

A local-first React application for preliminary hand calculations for freestanding solid-roof canopies. Calculations use tributary areas, independent cantilevers, and direct arithmetic; no FEA or stiffness solver is used. The starting project uses the supplied Davis ASCE 7-22 hazard report and the requested fixed-base cantilever-column system with **R = 1.5**. No account, backend, API key, or external runtime service is required. Fonts and PDF parsing are bundled locally.

## Run

Use Node 24 (the tested version is pinned in `.nvmrc`; Node 22.13+ is required).

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

Run commands from the repository root. `npm run build` produces a static site in `dist`. `npm run preview -- --port 4173 --strictPort` serves the production build. Projects persist in the current browser's local storage. Export a JSON project for a portable backup.

## Workflow

1. Set width, length, eave height, roof shape, and rise per 12. Choose 2–6 post positions in each direction, either as an evenly spaced count or explicit coordinates. Columns occur at the Cartesian grid intersections (4–36 posts). A centered gable ridge is added as a roof line when needed, without adding posts.
2. Enter dead and unreduced roof live loads on horizontal projected area. Include **all permanent weight**, including the framing and columns, in the equivalent dead-load input. Member self-weight is not added automatically.
3. Import an ASCE hazards PDF or enter hazard values. The supplied report contains Vult = 93 mph, SDS = 0.81 g, SD1 = 0.51 g, SS = 0.88 g, S1 = 0.29 g, TL = 8 s, risk II, SDC D, and Default soil class. Review site class and spectrum applicability. The PDF parser extracts recognized numeric data only; uploaded content does not execute instructions. Processing stays in the browser.
4. Supply wind exposure factors, reference areas, net MWFRS and C&C coefficients, and references. Coefficients are **illustrative until replaced and reviewed**. Kz is entered explicitly; choosing the exposure label does not compute it. Horizontal reference areas stay fixed when dimensions change and must be reviewed. Net coefficients include gust effects. No internal-pressure term for an enclosed building is inferred for this freestanding roof.
5. For the default Chapter 15 **structure-similar-to-buildings** branch, provide T, the **design spectrum ordinate Sa(T)** at that period, Ie, and other seismic factors. R remains 1.5. The app computes `Cs = max(Sa(T) Ie/R, 0.044 SDS Ie, 0.01, 0.5 S1 Ie/R when S1 >= 0.6)` and `V = Cs W`. Confirm the branch's applicability under Chapter 15. Sa(T) is not inferred from SDS/SD1 or digitized from the PDF chart. Its default is illustrative. For another Chapter 15 procedure, enter an engineer-established Cs including the applicable minima. Vertical Ev/D is a separate input and does not track changes in SDS automatically.
6. Review basic, unfactored study, ASD, and LRFD reactions. Independent component envelopes retain their governing cases; their extrema must not be combined into a simultaneous force set. Export all concurrent reactions to CSV, the complete calculation report to printable HTML, or the project inputs to JSON.

## Hand-calculation method and signs

Columns are independent fixed-base cantilevers. Their tops transmit **no moments**. There is no roof stiffness model or diaphragm redistribution. The roof drawing is a geometry sketch. The default method assigns loads using the tributary rectangles confirmed by the user; equal sharing of horizontal wind and seismic shear is an explicit alternative.

For each post:

- Tributary width and length extend halfway to adjacent posts and stop at the roof perimeter. `At = bt × lt`.
- `ND = D × At` and `NLr = Lr × At`, with pressure acting on horizontal projected area. Include all permanent framing/column weight in D. Gravity acts at the post centerline; eccentric roof transfer moments need a separate check.
- For horizontal reference wind, `H = qh GCf Aref`; post shear is `H × At/A` by default.
- Roof wind acts normal to each roof half. Integrate its components over the post's tributary rectangle: `Fz = sum(p At,half)` and `Fx,roof = -sum(p slope At,half)`. This is equivalent to multiplying normal pressure by actual roof area and the unit normal.
- Seismic base shear is `V = Cs W`; post shear is `V × At/A` by default. This is a single roof-level hand allocation without a height-exponent distribution.
- For every basic and combined case, `My = Vx × h`, `Mx = -Vy × h`, and `Mz = 0`, using the actual post height. No benefit is taken for top restraint.

Global X is across the width, Y along the length, Z upward. Base actions are **loads delivered by the structure to the foundation**. Positive Fz means uplift; the displayed compression is `N = -Fz`. Moments follow the right-hand rule. Every row is one concurrent set.

Wind uses `qh = 0.00256 Kz Kzt Kd Ke Vult^2` (ASCE 7 §26.10). Coefficients must be selected from the applicable free-roof procedure; they include gust effects. Both uplift and downward roof patterns are evaluated with ±X/±Y reference force. A downward pattern has a ↓ suffix. By default, the governing entered coefficient for each sign/direction is applied uniformly across the roof; an option retains separate half-roof coefficients. Negative X mirrors roof halves, while ±Y use the same roof pattern. This envelopes the **entered local pressures** but does not guarantee an upper bound for every global action or replace checking all code-required patterns, including mixed-sign patterns. C&C effective wind area is used for manual coefficient selection; component force uses a separately entered tributary area. C&C loads are not added to MWFRS reactions.

The **Hand calculations** tab is the primary result: numbered calculation sections, code section references, equations, substituted numbers, answers with units, and a worked concurrent combination for the selected post. The common-base section identifies maximum compression, uplift, resultant shear, and resultant moment across all posts. It retains each governing post/case's full force set. Those four extrema are not one simultaneous set; a base interaction check may govern in another case. A common connection detail should be checked against all concurrent cases.

The printable HTML export includes project assumptions, every post's tributary dimensions, worked wind/seismic arithmetic, C&C pressures, common-base envelopes, all concurrent reactions, and complete source inputs. JSON and CSV exports are also available.

## Scope

This is an engineering review tool, not automatic CBC/ASCE compliance certification. The user-specified R is recorded rather than verified against a material/system table. Code selection does not automatically supply aerodynamic tables, spectrum ordinates, period limits, system eligibility, or jurisdictional amendments.

The Chapter 2 combination set is reduced to D, Lr, W, and E. Service cases are explicitly unfactored diagnostic studies; ASD applies 0.6 to ultimate wind. Snow, rain/ponding, ice, floor live load, thermal actions, equipment, and other applicable loads need separate treatment. This version does not implement orthogonal seismic effects, accidental torsion, overstrength/anchorage combinations, capacity design, uplift-dependent support behavior, roof-load eccentric transfer moments, P–Delta, member strength, connection/anchor design, foundations, soil flexibility, or roof diaphragm design. Automatic Kz/coefficient lookup, automatic period estimation, and numeric multi-period spectrum retrieval are not implemented.

## Validation

```sh
npm test                 # deterministic calculation, parser, and export tests
npm run build           # production bundle
npm run test:e2e         # Chromium UI tests; requires local Chromium
```

The browser configuration defaults to `/usr/bin/chromium`; set `CHROMIUM_PATH` for another installation. To exercise the actual hazard PDF rather than skip the optional real-file test:

```sh
HAZARD_REPORT_PATH='/absolute/path/to/ASCE-report.pdf' npm run test:e2e
```

Calculation tests compare direct post shear and moment arithmetic with hand solutions; check corner/edge/interior tributary dimensions, nonuniform grids, roof pressure resolution, both wind signs, uplift, superposition, spectrum minima, C&C separation, common-base governing sets, malformed inputs, and export escaping. Browser tests cover actual recalculation, geometry errors, local persistence, import, reaction selection, mobile navigation, downloads, and the supplied PDF.

## Cloud development

Use the existing checkout. Each cloud task is already isolated; do not create a Git worktree unless explicitly requested. Dependencies and `dist` may be retained in a published filesystem snapshot, but live development servers must be restarted in subsequent tasks. No publication or deployment is performed by the application.
