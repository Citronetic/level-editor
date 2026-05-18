---
name: level-designer
description: Use this skill when the user asks to design, generate, mutate, or remix a new Match-3 / BlockOut / Color-Block-Jam puzzle level for this editor. Reads existing JSON levels under `data/levels/`, applies mathematically-grounded design rules (wall continuity, color balance, exit throughput, solvability), produces a NEW valid level JSON, writes it to `data/levels/custom-<name>.json`, and reports every mutation it made plus why. Trigger phrases include "make a level", "design a level", "出一道关卡", "新建关卡", "设计关卡", "remix level X", "做一个 Y 难度的关卡", "based on level X, make…", "调一下颜色出个新关卡".
---

# Level Designer

A level for this editor is **not a sketch** — it's a small mathematical
puzzle. Most random changes (swap two cells, drop in a curtain, shift the
exit one column) silently break solvability or color balance. This skill
encodes the invariants so a mutation either keeps the level solvable or
explicitly flags itself as unsolvable.

The skill assumes you are running inside the level-editor repository
(`index.html` + `js/*.js` + `data/levels/*.json` present). If not, refuse
the task and tell the user to `cd` into the editor checkout first.

## Resources you have access to

This skill folder ships with executable validators and a reference library.
Use them — don't reimplement.

- [scripts/validate.py](scripts/validate.py) — runs every hard rule (G1..G6,
  CB1..CB4, element limits) against a level JSON. Exit 0 = valid. Always
  invoke this on the final output before claiming "done".
- [scripts/solvability.py](scripts/solvability.py) — per-block slide-graph
  BFS to a matching door. Necessary-but-not-sufficient solvability check.
- [scripts/mutate.py](scripts/mutate.py) — apply named mutations (recolor,
  mirror, rotate, translate, add_ice, add_curtain) that preserve the hard
  rules where possible.
- [references/solvability.md](references/solvability.md) — deeper dive
  on the slide model + BFS algorithm + curtain / ice door handling.
- [references/mutations-cookbook.md](references/mutations-cookbook.md) —
  worked before/after snippets for every mutation, plus a chaining
  example.
- [references/worked-examples.md](references/worked-examples.md) — three
  full end-to-end remix sessions (intent → mutations → validation →
  report). Skim before remixing your first level.

---

## 1. What this skill produces

A single JSON file at `data/levels/custom-<descriptive-name>.json` plus a
short report explaining every change. The file conforms to the Level Model
(LM) schema and can be loaded by the running editor at
[http://localhost:8081](http://localhost:8081) (or wherever the user is
serving) by clicking the **导入** button OR by adding the seedId to
`data/level-manifest.json`.

The schema is fully documented in [DATA_FORMAT.md](../../DATA_FORMAT.md) —
**re-read it before generating** if you haven't already. The skill is a
strategy guide, not a schema replacement.

---

## 2. When to use this skill — and when not to

**Use it when** the user wants a complete new level, a variant of an
existing level, or a level "in the style of X". The user trusts the
skill to make legal levels they can actually play to completion.

**Do NOT use it for**:

- Schema documentation questions ("what does BCT mean?") — answer
  directly from [DATA_FORMAT.md](../../DATA_FORMAT.md).
- Editing an already-loaded custom level in the running editor — the
  user can do that with the GUI. The skill writes JSON files, it does
  not drive the in-browser editor.
- Bulk renames or batch operations across many levels — that's a script,
  not a design task.

---

## 3. Hard rules (mathematical invariants the level MUST satisfy)

Every output must satisfy ALL of these. If you can't, redesign the level
— don't ship a broken one. Comment in your report which rule forced
which decision.

### 3.1 Geometry

| # | Invariant | Why |
|---|---|---|
| G1 | Every `BPM` referenced in BMS / DMS / CLMS / EMS / CCMS / GRM lies on a CMS cell, OR is on a WMS wall for doors only. | Blocks can't sit in void. |
| G2 | The set of cells touched by WMS plus all CMS form a **simply-connected region** with no holes inside the playable area. Outer walls form a closed border around the CMS cells. | Blocks can't escape; geometry stays interpretable. |
| G3 | No two blocks in BMS share a BPM position. No block sits on a WMS cell. No door sits on a CMS cell. | One thing per cell rule. |
| G4 | BPMS of any multi-cell element (block / door / curtain) is **4-connected** — every cell is rook-adjacent to at least one other cell in the same element. | Disconnected "block group" doesn't make sense; the engine treats it as one body. |
| G5 | Every DMS door has at least one BPM that is **edge-adjacent to a CMS cell** (i.e. immediately outside the play area, against the wall). | Doors are exit channels in the wall, not free-floating tiles. |
| G6 | Grid bounds: x and y for any element fit within the bounding box of (CMS ∪ WMS ∪ DMS), and that bounding box width × height is reasonable for the editor's max cell size 80px — typical W,H in **5..14**. | Editor / play UI breaks down on huge grids. |

### 3.2 Color balance

The core throughput equation. For every color `c` in {0..9}:

```
totalBlockCells(c) ≡ requiredCapacity(c)   (mod door-cycle)
```

Concretely:

```
totalBlockCells(c)  = Σ over BMS where BCT=c of (BPMS.length)
totalDoorCells(c)   = Σ over DMS where BCT=c of (BPMS.length)
maxIceLoad(c)       = Σ over DMS where BCT=c of (DIC)
maxTurnLoad(c)      = Σ over DMS where BCT=c of (TBD)
```

Rules:

- **CB1**: For every color `c` with at least one BMS, there is at least
  one DMS with the same color. (You can't exit a color that has no door.)
- **CB2**: `totalBlockCells(c) >= totalDoorCells(c) - tolerance` where
  `tolerance = maxIceLoad(c) + maxTurnLoad(c)`. Strict tutorials usually
  match exactly; harder levels can have more blocks than door cells
  provided ice/turn doors swallow the surplus.
- **CB3**: If a door has `DHS=true` (star door), there is at least one
  block on the board that satisfies the star condition (typically a
  `ILE=true` "explosive" block) OR a key-bearing block of matching KID.
  Don't ship a star door with no key.
- **CB4**: For `KID > 0` on a block: there must exist a matching KID on
  some interactive (e.g., a door's metadata or a paired block). Lone
  keys = dead weight.

If you mutate colors, RE-RUN CB1..CB4. They are not preserved by simple
relabeling unless you relabel both blocks and doors together.

### 3.3 Solvability heuristic

True solvability is PSPACE-hard in general (this is sliding-block puzzle
territory). The skill uses three escalating checks:

1. **Static check**: For each block, can it geometrically slide (BFS in
   the slide graph) to any door of matching color? If yes for all blocks,
   the level is *probably* solvable.
2. **Resource check**: For levels with curtains (CLMS), check that
   `sum(CLC across all curtains)` plus required block-exits per color
   doesn't exceed the number of "slide moves" a player would plausibly
   make. (>30 moves on a small level usually indicates over-puzzlement.)
3. **Play check**: When in doubt, write the level, load it in the editor
   at the dev URL, and try to win it. If you can't solve it in <50
   moves, the user probably can't either.

You do not need step 2 for every level — only when introducing curtains
or many ice layers. Step 1 is mandatory.

### 3.4 Element-specific limits

- **Curtain CLC**: must be in `[1, 9]`. CLC=0 means "always open" which
  defeats the purpose; CLC>9 means the player will never break it.
- **Door DIC** (ice layers): `[0, 5]`. >5 turns the door into a wall.
- **Door TBD** (turn-based): `[0, 6]`. >6 is just frustrating.
- **Block BIC** (initial-count): `[0, 9]`. Cosmetic for most cases.
- **Block BD / BAD**: only set if the level uses ice or
  directional blocks; don't set "for flavour".

---

## 4. Soft rules (what makes a level GOOD, not just legal)

Legal-but-bad levels: 12 blocks on one row, one door at the end —
mathematically solvable, gameplay boring.

| # | Heuristic | Tutorial | Intermediate | Hard |
|---|---|---|---|---|
| S1 | Distinct colors | 1–2 | 2–4 | 3–6 |
| S2 | Blocks count | 2–4 | 4–8 | 6–12 |
| S3 | Doors count | 1 | 2–3 | 2–4 |
| S4 | Has curtain / ice / turn-door | no | one of them | two combined |
| S5 | Min moves to solve | 2–4 | 6–12 | 10–20 |
| S6 | Walls form a non-rectangular shape | no | OK | encouraged (L, U, ⊥) |
| S7 | Visible symmetry (one of: 2-fold rotation, horizontal mirror, vertical mirror) | yes | optional | optional |
| S8 | Block sizes — mix of 1×1, 2×2, L, T | no, all small | mix | mix + I-shape |

Bias toward S5 between 4 and 12 moves. Below 4 = trivial. Above 12 the
player quits.

---

## 5. Mutation playbook

When the user asks for a "variant" or "harder version" of an existing
level, prefer SAFE mutations over rebuilds. They preserve solvability
"for free."

| Mutation | Safety | Color balance preserved? | Solvability preserved? |
|---|---|---|---|
| **Recolor pair** — swap two colors everywhere (BCT 2 ↔ BCT 3 in BOTH blocks and doors) | ✅ Safe | ✅ Yes | ✅ Yes |
| **Mirror** — reflect every BPM across vertical or horizontal axis | ✅ Safe | ✅ Yes | ✅ Yes |
| **Rotate 90°/180°/270°** — apply rotation to every BPM | ✅ Safe (180° is identity-safe; 90°/270° may invalidate non-square grids) | ✅ Yes | ✅ Yes |
| **Translate** — shift the whole board by a constant `(dx, dy)` | ✅ Safe if you also adjust BSP and stay in grid | ✅ Yes | ✅ Yes |
| **Add cosmetic walls** in unused corners | ✅ Safe iff new walls don't sit on existing block paths | ✅ Yes | ✅ Likely (re-run static check) |
| **Add a curtain** in front of a door | ⚠️ Medium | ✅ Yes | ❌ Re-run resource check; CLC must be ≤ feasible hits |
| **Add ice to a door** (DIC += 1..3) | ⚠️ Medium | requires CB2 re-check | ✅ Usually yes |
| **Relocate exit door** | ⚠️ Risky | ✅ Yes | ❌ Must re-verify reachability |
| **Add a new block** | ❌ Hard | ❌ Breaks CB2 unless paired with door capacity | ❌ Recheck both |
| **Remove a block** | ❌ Hard | ❌ Breaks CB2 | ✅ Usually yes |
| **Change board size** | ❌ Hard — basically a rebuild | n/a | n/a |

**Default playbook for "give me a variant":**
1. Pick a recolor (S1=satisfied, single mutation, no math to redo).
2. Apply a mirror or rotation.
3. Optionally add ice or a curtain WITH the matching resource check.

That sequence usually yields a "feels different" level while keeping the
hard rules intact.

---

## 6. Workflow

Follow these steps in order. Output files only at the end.

### Step 1 — Read the user's intent

Identify:
- Base level (explicit seedId, or "pick something easy", or "from scratch").
- Target difficulty (S1..S8 column).
- Any constraints they named ("must use yellow", "no curtains", "small grid").
- Any colors they want featured.

If under-specified, default to: base = `t76-level-1`, difficulty =
intermediate, mutation = recolor + mirror.

### Step 2 — Load the base

```bash
cat data/levels/<seedId>.json | python3 -m json.tool   # eyeball the layout
```

Note BMS, DMS, WMS, CMS counts and the bounding box.

### Step 3 — Decide the mutation set

Pick one or more from §5. Prefer combinations of SAFE mutations. Avoid
mixing risky and medium unless the user explicitly asked for a harder
puzzle and you can verify each one.

### Step 4 — Apply mutations

For each mutation, transform the level data structure-by-structure:

- Recolor: `BMS[i].BCT = newColor` AND `DMS[j].BCT = newColor` for the
  paired color. Doing only one side breaks CB1.
- Mirror across vertical axis at `xMid`: for every BPM, set
  `x = 2*xMid - x`. xMid = (min_x + max_x) / 2.
- Rotate 90° clockwise: `(x, y) → (y, max_y - x)` for every BPM, after
  computing max_y over the union of CMS / WMS / DMS / BMS / BSP.
- Translate by `(dx, dy)`: add to every BPM's x and y.
- Add curtain: append `{ "$type": "CLM", "BPMS": [...], "CLC": N }` to
  CLMS, where the BPMS lies in front of (between blocks and) the
  matching door.
- Add ice: increase `DMS[j].DIC`. Also bump BIC on matching blocks if
  CB2 requires (one ice layer melts on each block entry).

### Step 5 — Validate against §3

Just run the script — it covers every hard rule the skill ships with:

```bash
python3 .claude/skills/level-designer/scripts/validate.py data/levels/custom-<name>.json
```

Exit code 0 = pass. On failure, stderr lists which rules broke and which
elements violated them. Then also check solvability:

```bash
python3 .claude/skills/level-designer/scripts/solvability.py data/levels/custom-<name>.json
```

This reports `solvable_isolated` (per-block reachability) and a lower-
bound on the minimum moves to clear.

If validation FAILS, do not write the file (or leave it in place but
warn the user). Either auto-correct (e.g., bump a door's BCT to satisfy
CB1) or report the failure to the user and ask how to proceed.

Manual checklist if you can't run Python for some reason:

```
[ ] G1: every BPM has a backing CMS (or door-on-wall slot)
[ ] G2: walls form closed boundary (no gaps where blocks could exit other than doors)
[ ] G3: no overlap (block-block, block-wall, door-on-cell)
[ ] G4: every multi-cell element is 4-connected
[ ] G5: every door is wall-adjacent
[ ] G6: bounding box in [5..14] each dimension
[ ] CB1: every color with a block has a same-color door
[ ] CB2: every door with DIC=N has at least N+1 blocks of its color
[ ] CB3: star doors have a key/star-source (ILE block)
[ ] CB4: keys (KID>0) are paired across blocks
[ ] Solvability: BFS from each block to its door (in the slide graph)
```

### Step 6 — Write the file

```
data/levels/custom-<descriptive-name>.json
```

Examples of good names:

- `custom-blueonly-tutorial.json`
- `custom-t76-1-mirrored.json`
- `custom-cbj-derin-12-ice-variant.json`

`<descriptive-name>` should hint at the base level + the mutation kind.

Optionally also append the seedId to `data/level-manifest.json` so the
new level shows in the sidebar on next load. (Ask the user first —
some prefer to keep custom levels out of the global manifest and only
load them via 导入.)

### Step 7 — Report

End with a short report containing:

1. Base level + seedId.
2. Mutation list (one bullet per).
3. Validation results — every checkbox from Step 5, ticked or not.
4. Estimated min-moves to solve, if computable from the static check.
5. Path to the written file.
6. How to load it: "open the editor, click 导入, pick this file."

If you made a tradeoff (e.g., couldn't perfectly preserve CB2 so added
ice to compensate), call it out explicitly. Don't bury it.

---

## 7. Solvability static-check algorithm

This is the heart of "is this level legal?" Implement it (or simulate it
mentally) every time. For each block `b`:

```
slidegraph nodes  = BPMS positions of the block (b's body) translated through every
                    legal slide direction (up/down/left/right) until it hits a wall
                    or another block. Each node is a body position.
edges             = node_A → node_B if a single horizontal or vertical slide takes
                    A's body to B's body without crossing a curtain it can't pass.
target nodes      = body positions where the block fully overlaps a door of matching
                    color OR exits the board through a same-color door slot.
```

Reachability via BFS from b's start node to any target node = solvable
for that block alone. Doing all blocks in isolation is a necessary but
not sufficient solvability check (one block may block another's path).
For levels of <8 blocks this isolation check is usually enough; for
larger or curtain-heavy levels, mention to the user that full
solvability isn't guaranteed.

Curtains: treat a curtain as passable but each crossing decrements the
shared CLC counter. Track CLC budget across the BFS.

Doors with DIC > 0: ice layers absorb the first DIC entries. Track per-door
"ice remaining" in the BFS state.

---

## 8. Common pitfalls

- **Recoloring only blocks, not doors** → CB1 fails silently. The level
  has Red blocks but a Blue door — unsolvable.
- **Adding a curtain "to make it harder" without checking CLC budget** →
  player runs out of slides before opening the curtain. Always pair a
  curtain addition with a CLC value calibrated to the number of
  slide-moves available from same-color blocks.
- **Mirroring across the wrong axis on an asymmetric grid** — vertical
  mirror on a 7×9 grid is fine; rotating 90° turns it into 9×7 and may
  push elements outside the original bounding box. Use the post-mutation
  bounding box, not the pre-mutation one.
- **Forgetting to also mirror BSP (start position marker)** → the level
  loads but rendering origin is wrong. Always apply the same transform
  to BSP that you applied to everything else.
- **Setting DIC or TBD on a door whose blocks can't actually reach it
  through the ice/turn requirement** — verify reachability after adding
  any door obstacle.

---

## 9. Output format

The final user-facing message should look roughly like:

```
Created data/levels/custom-t76-1-greenflip.json

Base:           t76-level-1
Difficulty:     intermediate (S1=2 colors, S2=2 blocks, S3=2 doors, S5≈8 moves)
Mutations:      (1) recolor BCT 0 (Red) ↔ BCT 3 (Green) across both blocks and doors
                (2) horizontal mirror across xMid=6.5
                (3) ice door: DMS[1].DIC was 0, now 2 (CB2 still holds because
                    we have 9 cells of Green vs 4 door cells + 2 ice = 6 capacity,
                    so 3 surplus cells exit through DMS[0] which is exact-fit)

Validation:
  G1 ✅  G2 ✅  G3 ✅  G4 ✅  G5 ✅  G6 ✅
  CB1 ✅ CB2 ✅ CB3 n/a CB4 n/a
  Solvability static-check: 2/2 blocks reach matching door ✅

Load it: open the editor, click 导入, pick custom-t76-1-greenflip.json.
```

Tighter is OK, but always include validation results so the user can
spot any "n/a" or "skipped" check.

---

## 10. Quick reference table

| You want to… | Do this |
|---|---|
| Tweak a level so it feels new but plays the same | Recolor + mirror |
| Make a tutorial level | 2 blocks, 1 door, 1 color, no curtains/ice |
| Make a harder version of X | Mirror + add a curtain in front of one door with CLC=2 |
| Match a theme (e.g. "all warm colors") | Recolor with palette restricted to {0 Red, 2 Yellow, 5 Orange, 6 Pink} |
| Generate from scratch | Use intermediate defaults: 7×9 grid, walled border, 4 blocks, 2 doors, 2 colors |

---

## 11. Examples to skim before generating

If the user asked for a remix, skim the closest 2–3 examples under
`data/levels/` first to absorb the visual / mechanical idiom:

- `t76-level-1.json` — the canonical small BlockOut level (Red + DarkBlue, 2 doors).
- `t76-level-14.json` — first Hard-tagged level; useful curtain example.
- `cbj-derin_level_12.json` — Color-Block-Jam style with the "complex curtain + doors" idiom.
- `mockLevel.json` — exotic / all-features sandbox; do NOT use as a base unless the user explicitly wants experimental mechanics.

Reading these first prevents "synthetically plausible but stylistically
alien" output.
