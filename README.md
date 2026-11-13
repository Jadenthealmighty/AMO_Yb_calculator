# PhysCalc

A Desmos-style physics calculator that runs locally in your browser at **http://localhost:31415**.
It's unit-aware throughout (`h*c/(399 nm) to eV`) and includes ¹⁷⁴Yb data, CODATA 2022 constants,
about 200 equations, matrices and eigen-solvers, plots, sliders, and numerical integration and root-finding.
Everything runs offline in the browser using math.js and KaTeX.

## Install

```bash
cd ~/Downloads/physcalc        # wherever the folder is
bash install.sh
```

The same script works on **macOS** and **Linux** (written for Kubuntu). It needs only `python3`,
which both systems already have.

| | macOS | Linux |
|---|---|---|
| App is copied to | `~/Applications/PhysCalc` | `~/.local/share/physcalc` |
| Server starts at login via | a launchd agent | a systemd user service (`physcalc.service`) |
| How to open it | Chrome → `localhost:31415` | application menu → **PhysCalc** (or any browser → `localhost:31415`) |

- **macOS:** you may see a "Background item added" notice; that is the server. For its own window and
  Dock icon, open the Chrome menu (⋮) → **Cast, save, and share → Install page as app…**.
- **Linux:** with Chrome or Chromium installed, the menu entry opens PhysCalc in its own window;
  otherwise it opens in your default browser. Check the server with `systemctl --user status physcalc`.
- Port already taken? `PHYSCALC_PORT=31416 bash install.sh`.
- Re-running `install.sh` updates the app and keeps your own equations and constants.
- You can also skip the server and open `index.html` directly. Worksheets are then stored separately
  from the localhost version, and equations you add are kept in that browser only.

**Uninstall:** run `bash uninstall.sh` in the installed folder. Add `--all` to delete the files too.

### Moving to another computer

1. Copy this folder to the other computer (USB stick, `scp -r`, a shared drive) and run `bash install.sh` there.
2. Equations you added in the app: copy `equations/custom_equations.js` from the installed folder on the
   old computer into the installed folder on the new one, then reload the page.
3. Worksheets live in the browser. Use **⋯ → Export as .txt** on the old computer and **⋯ → Import .txt…** on the new one.

## Using it

| Type | Get |
|---|---|
| `w = 1.5 mm` | a variable (used by every line below) |
| `I_peak(15 mW, w) to mW/cm^2` | equation from the library + unit conversion |
| `f(x) = x^2 sin(x)` | your own function |
| `M = [[0, 1], [1, 0]]` then `eig(M)` | eigenvalues + normalized eigenvectors |
| `v = [1, 2, 3]`, `v'`, `v' * v`, `v * v'` | column vector, its row transpose, inner product, outer product |
| `plot(f, 0, 10)` / `plot2d(g, -1, 1, -1, 1)` | line plot / heat map |
| `a = slider(2 mm, 0.5 mm, 5 mm)` | a variable with a slider (value, min, max[, step]) |
| `integrate(f, a, b)`, `findroot(f, a, b)` | numerics (unit-aware) |
| `Yb.Isat399`, `Yb.Pvap(450 degC) to torr` | ¹⁷⁴Yb data |
| `# note` | a text line; `x = 3  # comment` also works |
| `ans`, `$3` | previous result; result of line 3 |

**Input hints.** While the cursor is inside a function's brackets, a small box lists the function's
inputs with their descriptions and highlights the one you are typing. The autocomplete list shows each
function's inputs too. `Esc` hides the box.

**Plots.**

| Type | Get |
|---|---|
| `plot(f, g, h, 0, 10)` | several curves overlaid, with a legend and a shared hover read-out |
| `plot(f, 0, 10, xlabel="Detuning", ylabel="Rate", title="…")` | axis labels and a title; the unit is appended for you |
| `legend="cold, hot"`, `y2label="…"` | curve names; label for the right-hand axis |
| `logx=true`, `logy=true`, `zero=true`, `ymin=…`, `ymax=…` | axis options |
| `normalize=true` | every curve scaled to a peak of 1, to compare shapes |
| `d = points([1, 2, 3] MHz, [4, 5, 6])` then `plot(f, d, 0 MHz, 4 MHz)` | data points on top of a model (`plot(d)` plots the data alone) |

Curves whose units can't be converted into each other (say s⁻¹ and N) are drawn against a second axis on
the right, dashed. The boxes under each plot (title, axis labels, legend, log, **Save PNG**) edit the same
options, so you don't have to type them.

**Data files.** The **Data** tab takes `.csv` / `.txt` / `.tsv` / `.dat` files (columns of numbers, with or
without a header row) and NumPy `.npy` / `.npz` files, by drag-and-drop or **Choose a file…**. Each file
becomes a name whose columns work on any line:

| Type | Get |
|---|---|
| `scan.signal`, `max(scan.signal)`, `scan.freq MHz` | a column, a number from it, a column with units |
| `plot(points(scan.freq, scan.signal))` | the data as points; add `lines=true` to join them |
| `plot(model, points(scan.freq MHz, scan.signal), -60 MHz, 60 MHz)` | data on top of a model |
| `heatmap(img.data)` | colour map of a 2-D array (row 1 at the bottom); `heatmap(M, xmin, xmax, ymin, ymax)` sets the axes |

The tab's **Plot** and **Heat map** buttons write these lines for you. Files are stored in the browser on
that computer, so they stay after a reload but do not travel with the folder. Complex, structured and
3-D arrays are not read.

**Lab MOT coils.** `equations/mot_coils.js` is the same model as `coil_field_model.py` (every turn an exact
circular loop), checked against magpylib:

| Type | Get |
|---|---|
| `coil_B(2 mm, 0 mm, 5 mm, 135 A)` | the field vector [Bx, By, Bz] in G at any point (z is the coil axis) |
| `coil_Bx`, `coil_By`, `coil_Bz`, `coil_Bmag` | one component or the magnitude, same inputs; use these in plots |
| `coil_grad_z(135 A)`, `coil_grad_r(135 A)` | gradients at the centre in G/cm |
| `coil_zero_z()` | height of the field zero on the axis |

The geometry, turn counts, current imbalance and stack offsets are constants at the top of that file.

**Opto-optical trap (OOT).** `equations/oot.js` has the closed-form results of the OOT supplemental
material (Eqs. S11–S32: dual-beam B_eff, the gradient β, the on-axis field and force, depth, trap frequency,
shift-beam scattering and heating, the modified Doppler temperature) and a port of `oot_shift_beams.py` +
`oot_rate_eq.py` that agrees with the Python to ~10⁻¹⁵:

| Type | Get |
|---|---|
| `S = oot_beams(2 W, 10 mm, 10)` | the shift-beam pyramid (P over every pass, waist, Δs; a plain number is in Γs). Optional: θ, N_quad, retro, φ₀ |
| `M = mot_beams(1, -0.5)` | six 399 nm cooling beams (s per beam, Δc; optional waist and handedness) |
| `oot_B(S, x, y, z)`, `oot_Bx` … `oot_Bmag` | B_eff in G at any point (static, as in the paper) |
| `oot_B_dop(S, x, y, z, vx, vy, vz)`, `oot_shifts(…)` | B_eff and the three ¹P₁ light shifts with Doppler-shifted shift beams |
| `oot_accel(S, M, x, y, z, vx, vy, vz)`, `oot_ax/ay/az` | acceleration from the rate equations (no gravity) |
| `oot_grad(S)`, `oot_freq(S, M)`, `oot_depth(S, M)` | gradient tensor, trap frequencies, depth |
| `p = oot_point(S, x, y, z, vx, vy, vz, M)` | everything at one point as a table; then `p.B`, `p.a`, `p.zeeman`, … |

The 1077 nm line is in the Yb tab (`Yb.k1077`, `Yb.Gamma1077`, `Yb.Isat1077`, …); defaults for θ, N_quad,
retro and φ₀ are at the top of `equations/oot.js`.

**Conventions**

- Hz and s⁻¹ are the same unit to the calculator. Γ, Ω, Δ and ω are angular (shown as s⁻¹); ν, f and γ are cyclic (Hz). Write detunings as `2*pi*15 MHz`.
- `G` is the gauss and `G_N` is Newton's constant.
- `qe` is the elementary charge and `e` is Euler's number.
- `u` means micro (`uK`, `um`), and you can also type `µ`.
- `450 degC` (or `450 °C`) is an absolute temperature and is converted to 723.15 K before any arithmetic. Use K for temperature differences.
- `[1, 2, 3]` is a column vector. Its transpose (`v'`, `transpose(v)`, `dagger(v)`) is a 1×3 row.

## Adding your own equations

In the **Equations** tab, every folder has a **＋ Add** button, and **＋ New equation / ＋ New folder** sit
at the top. The form checks the formula as you type, typesets it, and asks for a short description of each
input (these show up in the input hints). Equations added this way get **Edit** and **Delete** buttons.

They are saved by the local server in `equations/custom_equations.js`, so they don't depend on the browser.
Copy that file to share them with another PhysCalc.

## Files

```
equations/custom_equations.js   ← equations added in the app (written by the app; kept on re-install)
equations/my_equations.js       ← equations written by hand (kept on re-install)
data/user_constants.js          ← your own constants (kept too)
data/yb174.js                   ← every ¹⁷⁴Yb number, with its source
equations/amo.js, optics.js, thermal.js, quantum.js, em.js, functions.js   ← the built-in library
equations/mot_coils.js          ← the lab MOT coil model and its geometry
equations/oot.js                ← opto-optical trap: SI equations and the shift-beam model
data/codata2022.js              ← generated from scipy.constants (CODATA 2022)
```

After you edit a file by hand, reload the page. A hand-written equation is one line of calculator syntax:

```js
{ name: 'Lattice depth in recoils', def: 'U_Er(P, w) = lattice_U0(P, w, Yb.alpha759)/Yb.Er759',
  args: { P: 'power per beam', w: 'waist' }, example: 'U_Er(1 W, 100 um)' }
```

## Notes on the Yb data

- Transition frequencies are ¹⁷⁴Yb measurements:
  - 399 nm: Kleinert 2016
  - 556 nm: I₂-referenced, 2023
  - 578 nm: Poli 2008
  - 431 nm: Yao 2026
  - magic wavelength: Barber 2008
- The 680, 649, 770, 1389 and 1052 nm lines are computed from NIST level energies. Their accuracy is roughly 0.1 GHz.
- Lifetimes, branching ratios and reduced matrix elements come from the ¹⁷¹Yb Reference Data compilation (arXiv:2509.04416). They are electronic properties, so they are the same for ¹⁷⁴Yb at this precision. Where your lab spreadsheet differs, both values are noted.
