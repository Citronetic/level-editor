#!/usr/bin/env python3
"""Validate a level JSON against the hard rules from SKILL.md (G1..G6, CB1..CB4, element limits).

Usage:
    python3 validate.py path/to/level.json
    python3 validate.py path/to/level.json --json    # JSON output only
    python3 validate.py path/to/level.json --strict  # fail on warnings too

Exit codes:
    0 = all hard rules pass
    1 = one or more hard rules failed
    2 = invocation error
"""

import argparse
import json
import sys
from collections import defaultdict


def load(path):
    with open(path) as f:
        return json.load(f)


def positions_of(elem):
    """Extract list of (x, y) tuples from an element with BPMS or BPM."""
    if 'BPMS' in elem and elem['BPMS']:
        return [(p['x'], p['y']) for p in elem['BPMS']]
    if 'BPM' in elem:
        return [(elem['BPM']['x'], elem['BPM']['y'])]
    return []


def bounding_box(level):
    all_pos = []
    for key in ('BMS', 'DMS', 'WMS', 'CMS', 'IWMS', 'GMS', 'EMS', 'CLMS', 'CCMS', 'GRM', 'BSP'):
        for el in level.get(key) or []:
            all_pos.extend(positions_of(el))
    if not all_pos:
        return (0, 0, 0, 0)
    xs, ys = zip(*all_pos)
    return (min(xs), max(xs), min(ys), max(ys))


# ── G1: every element position lies on a CMS cell (doors may sit on wall slots) ──
def check_G1_positions_on_cells(level):
    cells = {(c['BPM']['x'], c['BPM']['y']) for c in level.get('CMS') or []}
    walls = {(w['BPM']['x'], w['BPM']['y']) for w in level.get('WMS') or []}
    violations = []
    for key in ('BMS', 'CLMS', 'CCMS', 'GRM', 'EMS'):
        for i, el in enumerate(level.get(key) or []):
            for (x, y) in positions_of(el):
                if (x, y) not in cells:
                    violations.append(f'{key}[{i}] at ({x},{y}) is not on any CMS cell')
    for i, dm in enumerate(level.get('DMS') or []):
        for (x, y) in positions_of(dm):
            on_wall = (x, y) in walls
            adj_cell = any((x + dx, y + dy) in cells for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)])
            if not on_wall and not adj_cell:
                violations.append(f'DMS[{i}] at ({x},{y}) neither on a wall nor adjacent to any cell')
    return {'pass': not violations, 'failures': violations}


# ── G3: no overlap between blocks/blocks, block/wall, door/cell ──
def check_G3_no_overlap(level):
    violations = []
    walls = {(w['BPM']['x'], w['BPM']['y']) for w in level.get('WMS') or []}
    cells = {(c['BPM']['x'], c['BPM']['y']) for c in level.get('CMS') or []}
    for i, bm in enumerate(level.get('BMS') or []):
        for (x, y) in positions_of(bm):
            if (x, y) in walls:
                violations.append(f'BMS[{i}] at ({x},{y}) overlaps a wall')
    block_owners = defaultdict(list)
    for i, bm in enumerate(level.get('BMS') or []):
        for pos in positions_of(bm):
            block_owners[pos].append(i)
    for pos, owners in block_owners.items():
        if len(set(owners)) > 1:
            violations.append(f'cell {pos} claimed by multiple blocks: {sorted(set(owners))}')
    for i, dm in enumerate(level.get('DMS') or []):
        for (x, y) in positions_of(dm):
            if (x, y) in cells:
                # A door sitting on a CMS cell means the cell is unreachable as play area.
                violations.append(f'DMS[{i}] at ({x},{y}) sits on a CMS cell (door slot should be in the wall)')
    return {'pass': not violations, 'failures': violations}


# ── G4: multi-cell elements must be 4-connected ──
def check_G4_connectivity(level):
    violations = []
    for key in ('BMS', 'DMS', 'CLMS', 'CCMS'):
        for i, el in enumerate(level.get(key) or []):
            positions = set(positions_of(el))
            if len(positions) <= 1:
                continue
            start = next(iter(positions))
            seen = {start}
            stack = [start]
            while stack:
                (x, y) = stack.pop()
                for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
                    n = (x + dx, y + dy)
                    if n in positions and n not in seen:
                        seen.add(n)
                        stack.append(n)
            if seen != positions:
                violations.append(f'{key}[{i}] not 4-connected (cells: {sorted(positions)})')
    return {'pass': not violations, 'failures': violations}


# ── G5: every door has at least one cell adjacent to a CMS cell ──
def check_G5_doors_wall_adjacent(level):
    cells = {(c['BPM']['x'], c['BPM']['y']) for c in level.get('CMS') or []}
    violations = []
    for i, dm in enumerate(level.get('DMS') or []):
        positions = positions_of(dm)
        if not positions:
            continue
        ok = any(
            (x + dx, y + dy) in cells
            for (x, y) in positions
            for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)]
        )
        if not ok:
            violations.append(f'DMS[{i}] has no cell adjacent to any CMS — unreachable')
    return {'pass': not violations, 'failures': violations}


# ── G6: bounding box dimensions in a sane range ──
def check_G6_bounding_box(level):
    (xmin, xmax, ymin, ymax) = bounding_box(level)
    w = xmax - xmin + 1
    h = ymax - ymin + 1
    violations = []
    if w < 5 or w > 14:
        violations.append(f'width {w} outside recommended [5, 14]')
    if h < 5 or h > 14:
        violations.append(f'height {h} outside recommended [5, 14]')
    return {'pass': not violations, 'failures': violations}


# ── CB1: every block-color has a matching door-color ──
def check_CB1_doors_match_colors(level):
    block_colors = {bm['BCT'] for bm in level.get('BMS') or []}
    door_colors = {dm['BCT'] for dm in level.get('DMS') or []}
    missing = block_colors - door_colors
    return {
        'pass': not missing,
        'failures': [f'color {c} has blocks but no matching door' for c in sorted(missing)],
    }


# ── CB2: capacity — enough blocks to melt the ice on doors of the same color ──
# Each ice layer on a door consumes one block-entry before the door becomes a
# regular exit. So we need at least DIC blocks of color c PLUS at least one
# block left over to actually exit. A door with DIC=0 has no constraint here.
def check_CB2_capacity(level):
    by_color_blocks = defaultdict(int)
    by_color_doors = defaultdict(int)
    by_color_ice = defaultdict(int)
    for bm in level.get('BMS') or []:
        by_color_blocks[bm['BCT']] += 1  # blocks, not cells — a block exits in one slide
    for dm in level.get('DMS') or []:
        by_color_doors[dm['BCT']] += 1
        by_color_ice[dm['BCT']] += dm.get('DIC', 0) or 0
    violations = []
    for c, ice in by_color_ice.items():
        # Need ice melts + at least one exit. Without enough blocks the door stays frozen.
        needed = ice + (1 if by_color_doors[c] > 0 else 0)
        have = by_color_blocks[c]
        if have < needed:
            violations.append(
                f'color {c}: {have} block(s) but doors need {needed} '
                f'({ice} for ice + {by_color_doors[c]} for exit)'
            )
    return {'pass': not violations, 'failures': violations}


# ── CB3: star doors require a key/star source ──
def check_CB3_star_doors(level):
    violations = []
    star_doors = [(i, dm) for i, dm in enumerate(level.get('DMS') or []) if dm.get('DHS')]
    explosive_blocks = [bm for bm in (level.get('BMS') or []) if bm.get('ILE')]
    if star_doors and not explosive_blocks:
        # If no block carries a star/key, the star doors can never open.
        violations.append(
            f'{len(star_doors)} star door(s) present but no block with ILE=true to satisfy them'
        )
    return {'pass': not violations, 'failures': violations}


# ── CB4: keys (KID > 0) are paired between blocks and doors ──
def check_CB4_keys_paired(level):
    block_kids = {bm.get('KID') for bm in (level.get('BMS') or []) if bm.get('KID', 0) > 0}
    # Doors don't track KID in this schema; the key-block pairs another block.
    # We just warn about lone-key blocks (singleton KID values).
    counts = defaultdict(int)
    for bm in level.get('BMS') or []:
        kid = bm.get('KID', 0) or 0
        if kid > 0:
            counts[kid] += 1
    violations = [
        f'KID={kid} appears on only one block — keys should pair with at least one consumer'
        for kid, n in counts.items() if n < 2
    ]
    return {'pass': not violations, 'failures': violations}


# ── Element limit ranges (CLC, DIC, TBD) ──
def check_element_limits(level):
    violations = []
    for i, cl in enumerate(level.get('CLMS') or []):
        clc = cl.get('CLC', 0) or 0
        if not 1 <= clc <= 9:
            violations.append(f'CLMS[{i}].CLC={clc} outside [1, 9]')
    for i, dm in enumerate(level.get('DMS') or []):
        dic = dm.get('DIC', 0) or 0
        tbd = dm.get('TBD', 0) or 0
        if not 0 <= dic <= 5:
            violations.append(f'DMS[{i}].DIC={dic} outside [0, 5]')
        if not 0 <= tbd <= 6:
            violations.append(f'DMS[{i}].TBD={tbd} outside [0, 6]')
    return {'pass': not violations, 'failures': violations}


def main():
    parser = argparse.ArgumentParser(description='Validate level JSON against hard rules.')
    parser.add_argument('path', help='path to level JSON file')
    parser.add_argument('--json', action='store_true', help='emit JSON only (suppress human summary)')
    args = parser.parse_args()

    try:
        level = load(args.path)
    except Exception as e:
        print(f'error: could not load {args.path}: {e}', file=sys.stderr)
        sys.exit(2)

    results = {
        'G1_positions_on_cells':  check_G1_positions_on_cells(level),
        'G3_no_overlap':          check_G3_no_overlap(level),
        'G4_connectivity':        check_G4_connectivity(level),
        'G5_doors_wall_adjacent': check_G5_doors_wall_adjacent(level),
        'G6_bounding_box':        check_G6_bounding_box(level),
        'CB1_doors_match_colors': check_CB1_doors_match_colors(level),
        'CB2_capacity':           check_CB2_capacity(level),
        'CB3_star_doors':         check_CB3_star_doors(level),
        'CB4_keys_paired':        check_CB4_keys_paired(level),
        'element_limits':         check_element_limits(level),
    }
    all_pass = all(r['pass'] for r in results.values())
    print(json.dumps({'valid': all_pass, 'rules': results}, indent=2, ensure_ascii=False))
    if not args.json and not all_pass:
        print('\nFAILED RULES:', file=sys.stderr)
        for name, r in results.items():
            if not r['pass']:
                print(f'  {name}:', file=sys.stderr)
                for v in r['failures']:
                    print(f'    - {v}', file=sys.stderr)
    sys.exit(0 if all_pass else 1)


if __name__ == '__main__':
    main()
