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
3. Import an ASCE hazards PDF or enter hazard values. The supplied report contains Vult = 93 mph, SDS = 0.81 g, SD1 = 0.51 g, SS = 0.88 g, S1 = 0.29 g, TL = 8 s, risk II, SDC D, and Default soil class. Review site class and spectrum applicability. PDF import extracts recognized hazard values and the address from the first-page address column. A recognized address replaces the project site address; an absent/unreadable address preserves it. Extraction excludes adjacent code, risk-category, latitude, and longitude columns. The parser reads data only; uploaded content does not execute instructions. Processing stays in the browser.
4. Supply wind exposure factors, reference areas, and MWFRS coefficients/references. MWFRS coefficients are **illustrative until replaced and reviewed**. For C&C, select **ASCE figures 30.5-1 / 30.5-2 · auto CN** to derive the net coefficients from the supplied figures; existing projects stay in manual mode until explicitly switched. Kz is entered explicitly; choosing the exposure label does not compute it. Horizontal reference areas stay fixed when dimensions change and must be reviewed. Net coefficients include gust effects. No internal-pressure term for an enclosed building is inferred for this freestanding roof.
5. For the default Chapter 15 **structure-similar-to-buildings** branch, provide T, the **design spectrum ordinate Sa(T)** at that period, Ie, and other seismic factors. R remains 1.5. The app computes `Cs = max(Sa(T) Ie/R, 0.044 SDS Ie, 0.01, 0.5 S1 Ie/R when S1 >= 0.6)` and `V = Cs W`. Confirm the branch's applicability under Chapter 15. Sa(T) is not inferred from SDS/SD1 or digitized from the PDF chart. Its default is illustrative. For another Chapter 15 procedure, enter an engineer-established Cs including the applicable minima. Vertical Ev/D is a separate input and does not track changes in SDS automatically.
6. Review basic, unfactored study, ASD, and LRFD reactions. Seismic design cases automatically include the eight signed 100%/30% orthogonal patterns of ASCE 7-22 §12.5.1.2(a). Governing demand combinations are highlighted in gold, including ties; the governing-only filter hides other combinations. Clicking a governing demand opens its concurrent post/case reactions. Independent component envelopes retain their governing cases; their extrema must not be combined into a simultaneous force set. Export all concurrent reactions to CSV, the complete calculation report to printable HTML, or the project inputs to JSON.

## Hand-calculation method and signs

Columns are independent fixed-base cantilevers. Their tops transmit **no moments**. There is no roof stiffness model or diaphragm redistribution. The roof drawing is a geometry sketch. The default method assigns loads using the tributary rectangles confirmed by the user; equal sharing of horizontal wind and seismic shear is an explicit alternative.

For each post:

- Tributary width and length extend halfway to adjacent posts and stop at the roof perimeter. `At = bt × lt`.
- `ND = D × At` and `NLr = Lr × At`, with pressure acting on horizontal projected area. Include all permanent framing/column weight in D. Gravity acts at the post centerline; eccentric roof transfer moments need a separate check.
- For horizontal reference wind, `H = qh GCf Aref`; post shear is `H × At/A` by default.
- Roof wind acts normal to each roof half. Integrate its components over the post's tributary rectangle: `Fz = sum(p At,half)` and `Fx,roof = -sum(p slope At,half)`. This is equivalent to multiplying normal pressure by actual roof area and the unit normal.
- Seismic base shear is `V = Cs W`; post shear is `V × At/A` by default. This is a single roof-level hand allocation without a height-exponent distribution.
- For the manual wind and seismic cases, `My = Vx × h`, `Mx = -Vy × h`, and `Mz = 0`, using the actual post height. The optional §28.3.7 longitudinal wind uses the conservative lever arm described below; combinations superpose signed basic actions. No benefit is taken for top restraint.

Global X is across the width, Y along the length, Z upward. Base actions are **loads delivered by the structure to the foundation**. Positive Fz means uplift; the displayed compression is `N = -Fz`. Moments follow the right-hand rule. Every row is one concurrent set.

For ASCE 7-22, velocity pressure is `qh = 0.00256 Kz Kzt Ke Vult^2`; directionality Kd is applied outside qh, exactly once. Manual MWFRS pressure is `p = qh Kd GCn` and horizontal reference force is `H = qh Kd GCf Aref`. This corrects the prior display that included Kd inside the quantity labeled qh; existing manual MWFRS loads retain the same numerical values. The legacy ASCE 7-16 metadata selection retains Kd inside qh and does not apply it again. Manual MWFRS coefficients must be selected from the applicable procedure and include gust effects. Both uplift and downward roof patterns are evaluated with ±X/±Y reference force. A downward pattern has a ↓ suffix. By default, the governing entered coefficient for each sign/direction is applied uniformly across the roof; an option retains separate half-roof coefficients. Negative X mirrors roof halves, while ±Y use the same roof pattern. This envelopes the **entered local pressures** but does not guarantee an upper bound for every global action or replace checking all code-required patterns, including mixed-sign patterns. C&C effective wind area is used for coefficient selection; component force uses a separately entered tributary area. C&C loads are not added to MWFRS reactions.

The **Hand calculations** tab is the primary result: numbered calculation sections, code section references, equations, substituted numbers, answers with units, and a worked concurrent combination for the selected post. The common-base section identifies maximum compression, uplift, resultant shear, and resultant moment across all posts. It retains each governing post/case's full force set. Those four extrema are not one simultaneous set; a base interaction check may govern in another case. A common connection detail should be checked against all concurrent cases.

The printable HTML export includes project assumptions, every post's tributary dimensions, worked wind/seismic arithmetic, C&C pressures, common-base envelopes, all concurrent reactions, and complete source inputs. JSON and CSV exports are also available.

## Orthogonal seismic effects and governing combinations

ASCE 7-22 §12.5.1.2(a), as provided in the project reference excerpt, requires simultaneous directional effects with 100% along one direction plus 30% along the perpendicular direction. The app generates all eight sign/primary-axis patterns:

```text
+EX + 0.30EY    +EX - 0.30EY    -EX + 0.30EY    -EX - 0.30EY
+0.30EX + EY    +0.30EX - EY    -0.30EX + EY    -0.30EX - EY
```

Signed EX/EY basic cases provide the effects for each component. Linear addition gives simultaneous Vx, Vy, Mx, and My. Both horizontal terms receive rho in LRFD and 0.7 rho in ASD. Ev is added/subtracted as a factor of D **once** per full combination. The default model now has 123 cases: 22 basic/reference cases, 17 service studies, 42 ASD cases, and 42 LRFD cases. Single-axis cases remain basic references; seismic design combinations use the orthogonal patterns. Older version 1 project files automatically recalculate with this rule; no option disables it. For the ASCE 7-16 metadata selection, this is identified as a project directional assumption requiring edition-specific applicability review, rather than citing the 7-22 section as a 7-16 provision.

The hand sheet includes a new §12.5.1.2(a) arithmetic section with all eight directional effects at the selected post. The software calculates demands; member/foundation strength, interaction, and drift acceptance checks are not established by this feature.

Gold labels identify maximum compression, uplift, resultant shear, and resultant bending across all posts **within each load basis**. Ties use unrounded demand values with tolerance `1e-7 + 1e-9 × |maximum|` in lb or lb-ft. Zero-demand criteria are not labeled governing. Summary cards open a representative concurrent set, and all tied cases are highlighted in the combination list and selection controls. The reaction table highlights only the matching governing post(s); other posts are not labeled just because the case governs somewhere. HTML exports retain text labels/highlights, and CSV adds a `Governing_demand_criteria` column for each post/case. These are demand maxima, not utilization checks; another case can govern a capacity interaction.

Automatic C&C lookup is implemented from the user-supplied Figures 30.5-1 and 30.5-2 and §30.5.2, as detailed below. MWFRS net roof coefficients and the separate exposed-frame GCf remain manual; C&C tables must not be used as MWFRS drag coefficients. The hazard PDF supplies wind speed, not those coefficients.

## Automatic C&C coefficients — supplied ASCE Figures 30.5-1 and 30.5-2

In **Wind & C&C → Components & cladding**, change **C&C coefficient source** from manual to **ASCE figures 30.5-1 / 30.5-2 · auto CN**. This opt-in preserves existing projects and their manual coefficients. Mono-slope (including 0°/flat) uses Figure 30.5-1; gable uses Figure 30.5-2. The numeric source tables are transcribed in `src/windTables.js`, with tests against the supplied image values. They are restricted to the ASCE 7-22 selection; other editions require manual coefficients from their applicable procedure.

The lookup:

- Computes roof angle from rise per 12. Both supplied figures require 0°–45° and **0.25 ≤ h/L ≤ 1.00**. Since the app evaluates both principal wind directions, both h/width and h/length must satisfy the limits. Unsupported cases stop automatic lookup; values are not clamped or extrapolated.
- Uses eave height as h when θ ≤ 10°, otherwise the average eave/highest roof elevation. An optional explicit h override is available. Confirm Kz at the selected h; Kz stays a project input rather than being recomputed.
- Computes `a = max(min(0.10 Bmin, 0.4h), 0.04 Bmin, 3 ft)` using the least horizontal dimension. Selects the printed effective-area bands: `Ae ≤ a²`, `a² < Ae ≤ 4a²`, or `Ae > 4a²`. There is no area interpolation.
- Selects clear flow for blockage ≤ 50%, obstructed flow for blockage > 50%, as in figure note 2.
- Uses exact rows at 0°, 7.5°, 15°, 30°, and 45°, or the permitted linear interpolation in θ for both signs and each zone. The report exposes the bounding values and interpolation fraction.
- Retains figure signs: CN+ acts toward the roof top surface; CN− acts away. CN already includes top and bottom surface pressure. It does not receive an enclosed-building internal-pressure term.

Pressure follows the supplied §30.5.2 equation **`p = qh Kd G CN` (30.5-1)** for both roof shapes. G is entered explicitly (0.85 starting value, confirm §26.11); it is not included in the tabulated CN. The app's positive-uplift convention is `pup = qh Kd G |CN−|`, `pdown = -qh Kd G CN+`. Kd and G each enter once. An **entered pressure floor** is applied independently in each sign as `max(calculated magnitude, entered floor)`. Its starting value of 16 psf is a project input, not a minimum established by the supplied figures or §30.5 excerpt. The user must confirm the applicable minimum, gust factor, and component zone, then mark those inputs reviewed. Changes to geometry, hazard values, or wind inputs invalidate that review. The calculated and floored values remain visible.

The result tab and printable hand sheet show source figure, θ, h, both h/L ratios, a, effective-area band, blockage, angle interpolation, signed CN values, gust conversion, pressure arithmetic, and forces using the separately entered component tributary area. Zones use the figure's labels **Zone 1, Zone 2, Zone 3**, not generic interior/edge/corner aliases. Actual component location is not automatically assigned to a zone; use the provided figure's plan diagram. Gable plan zoning changes above 10°.

C&C results remain local component demands; they do not modify or add to MWFRS post reactions. Manual mode preserves entered net coefficients and applies no extra gust factor.

## Longitudinal open-building wind — §28.3.7

In **Wind & C&C**, select **Longitudinal wind method → ASCE §28.3.7**. Existing projects retain the manual method until switched. This implements the supplied ASCE 7-22 horizontal wind procedure for gable/pitched roofs with transverse frames, parallel to the ridge (Y). It checks `0° < θ < 45°`, low-rise height `h ≤ 60 ft` and `h ≤ least plan dimension`; the engineer must verify all remaining Chapter 28 conditions and the structural load path. Other roof shapes/editions require an applicable manual procedure.

The source is Figure 28.3-1 Load Case 2: surface **5 = +0.40, 5E = +0.61, 6 = −0.29, 6E = −0.43**. Three explicit coefficient options are available:

- **Conservative E envelope (starting option):** use +0.61 and −0.43 over each entire end wall. This bounds any area-weighted mixture of the two supplied coefficients on each wall; it is a conservative assumption rather than inferred E-zone geometry.
- **Area-weighted:** enter actual 5E and 6E areas from the source figure. Each remaining area uses 5 or 6; arithmetic is shown. The two end orientations are checked by swapping the entered areas, and the larger force is conservatively used for both Y signs. Areas must be between zero and AE.
- **Manual average override:** enter project-specific signed area averages and their source.

With B across the ridge, AE includes the full equivalent enclosed rectangular end wall and gable triangle. As is effective solid end-wall area (including exposed fascia where applicable), entered independently, `0 ≤ As ≤ AE`. The hand sheet calculates:

```text
φ = As / AE
n = max(number of Y frame lines, 3)
KB = 1.8 − 0.01 B for B < 100 ft; otherwise 0.8
KS = 0.60 + 0.073(n − 3) + 1.25 φ^1.8
p = qh Kd [(GCpf)windward − (GCpf)leeward] KB KS   (28.3-3)
F = p AE                                             (28.3-4)
```

Kd enters once, and GCpf already includes gust effects. F uses **AE**, even for a fully open end wall with As = 0. Enter Kz appropriate to h; no automatic Kz lookup occurs.

The supplied section applies F at the AE centroid. A symmetric gable puts that centroid at B/2 across the roof, so each outer sidewall receives F/2. The hand method assigns each wall's force along Y by tributary length. Interior X post lines receive no direct longitudinal reference force. Base moments conservatively use `|HY,i| × max(actual post-top height, AE centroid height)`; this is a design envelope, not a stiffness analysis or roof/bracing capacity check. The assumptions, centroid calculation, all post shares, shears, and moments are printed explicitly. Review the actual sidewall and roof transfer path.

This force replaces the previous manual Y reference force and enters both signed Y cases with the separately entered roof-normal uplift/downward loads, including their X slope components. **The Chapter 27 roof loads referenced by §28.3.7 and transverse X wind still require applicable project inputs.** This change does not implement the entire envelope procedure or derive roof coefficients from Figure 28.3-1. C&C remains separate. Changes to geometry, hazards, or wind inputs clear the longitudinal review flag.

## Scope

This is an engineering review tool, not automatic CBC/ASCE compliance certification. The user-specified R is recorded rather than verified against a material/system table. Code selection does not automatically supply aerodynamic tables, spectrum ordinates, period limits, system eligibility, or jurisdictional amendments.

The Chapter 2 combination set is reduced to D, Lr, W, and E. Service cases are explicitly unfactored diagnostic studies; ASD applies 0.6 to ultimate wind. Snow, rain/ponding, ice, floor live load, thermal actions, equipment, and other applicable loads need separate treatment. This version implements the 100%/30% directional force-effect combinations, but does not implement accidental torsion, overstrength/anchorage combinations, capacity design, uplift-dependent support behavior, roof-load eccentric transfer moments, P–Delta, member strength, connection/anchor design, foundations, soil flexibility, or roof diaphragm design. Automatic Kz lookup, automatic transverse/roof MWFRS coefficient selection, automatic period estimation, and numeric multi-period spectrum retrieval are not implemented.

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
