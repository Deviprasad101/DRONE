"""Furniture placements and navigation obstacles (shared with 3D interior)."""

from __future__ import annotations

import math

import numpy as np

from env.map_layout import PADDING, SCALE

# Original apartment furniture (every piece kept)
_ORIGINAL = [
    {"type": "bed", "x": 2.5, "z": 2.5, "rot": 0},
    {"type": "lamp", "x": 1.5, "z": 1.5, "rot": 0},
    {"type": "bed", "x": 16.5, "z": 2.5, "rot": 3.14159},
    {"type": "lamp", "x": 17.5, "z": 1.5, "rot": 0},
    {"type": "kitchen", "x": 9.5, "z": 2.5, "rot": 0},
    {"type": "dining", "x": 12, "z": 7, "rot": 1.5708},
    {"type": "sofa", "x": 7, "z": 12, "rot": 1.5708},
    {"type": "table", "x": 7, "z": 14, "rot": 0},
    {"type": "bed", "x": 2.5, "z": 16.5, "rot": 0},
    {"type": "desk", "x": 3.5, "z": 15, "rot": -0.7854},
    {"type": "bed", "x": 16.5, "z": 16.5, "rot": 3.14159},
    {"type": "wardrobe", "x": 17.5, "z": 15, "rot": 0},
    {"type": "bath", "x": 2.5, "z": 3.5, "rot": 0},
    {"type": "shower", "x": 3.5, "z": 1.5, "rot": 0},
    {"type": "bath", "x": 16.5, "z": 3.5, "rot": 0},
    {"type": "plant", "x": 5, "z": 5, "rot": 0},
    {"type": "plant", "x": 14, "z": 5, "rot": 0},
    {"type": "plant", "x": 5, "z": 14, "rot": 0},
    {"type": "plant", "x": 14, "z": 14, "rot": 0},
    {"type": "plant", "x": 10, "z": 10, "rot": 0},
    {"type": "lamp", "x": 12, "z": 12, "rot": 0},
    {"type": "lamp", "x": 6, "z": 6, "rot": 0},
]

_EXTRA = [
    {"type": "bookshelf", "x": 8, "z": 4, "rot": 0},
    {"type": "tv", "x": 5, "z": 10, "rot": 3.14159},
    {"type": "armchair", "x": 7, "z": 9, "rot": -0.6},
    {"type": "armchair", "x": 9, "z": 8, "rot": 0.8},
    {"type": "bookshelf", "x": 2, "z": 15, "rot": 1.5708},
]

_MORE = [
    {"type": "nightstand", "x": 4.0, "z": 2.5, "rot": 0},
    {"type": "nightstand", "x": 15.0, "z": 2.5, "rot": 0},
    {"type": "nightstand", "x": 4.0, "z": 16.5, "rot": 0},
    {"type": "nightstand", "x": 15.0, "z": 16.5, "rot": 0},
    {"type": "dresser", "x": 5.5, "z": 17.5, "rot": 0},
    {"type": "dresser", "x": 16.5, "z": 17.5, "rot": 3.14159},
    {"type": "sidetable", "x": 8.5, "z": 13.5, "rot": 0},
    {"type": "sidetable", "x": 5.5, "z": 13.5, "rot": 0},
    {"type": "ottoman", "x": 8.0, "z": 15.0, "rot": 0},
    {"type": "plant", "x": 11, "z": 5, "rot": 0},
    {"type": "plant", "x": 9, "z": 17, "rot": 0},
    {"type": "plant", "x": 17, "z": 9, "rot": 0},
    {"type": "plant", "x": 3, "z": 10, "rot": 0},
    {"type": "lamp", "x": 10, "z": 7, "rot": 0},
    {"type": "lamp", "x": 14, "z": 16, "rot": 0},
    {"type": "lamp", "x": 4, "z": 12, "rot": 0},
    {"type": "bookshelf", "x": 18.5, "z": 5.5, "rot": 0},
    {"type": "sidetable", "x": 13, "z": 8, "rot": 0},
    {"type": "armchair", "x": 11, "z": 9, "rot": 0.4},
    {"type": "table", "x": 10, "z": 15, "rot": 0},
]

# Half width (x) and half depth (z) in world units — matches interior.js mesh sizes.
FURNITURE_HALF_SIZE: dict[str, tuple[float, float]] = {
    "bed": (0.85, 1.05),
    "sofa": (1.15, 0.48),
    "dining": (0.7, 0.4),
    "kitchen": (1.25, 0.3),
    "desk": (0.5, 0.28),
    "table": (0.45, 0.25),
    "wardrobe": (0.45, 0.25),
    "bookshelf": (0.6, 0.18),
    "dresser": (0.55, 0.23),
    "nightstand": (0.23, 0.2),
    "sidetable": (0.25, 0.25),
    "ottoman": (0.33, 0.33),
    "tv": (0.7, 0.18),
    "armchair": (0.38, 0.38),
    "bath": (0.25, 0.2),
    "shower": (0.45, 0.45),
    "plant": (0.2, 0.2),
    "lamp": (0.1, 0.1),
}

# Extra clearance so paths and drone stay outside visible furniture meshes.
FOOTPRINT_MARGIN = 0.45


def _scale_pos(x: float, z: float) -> tuple[float, float]:
    return x * SCALE + PADDING, z * SCALE + PADDING


def _scale_item(item: dict) -> dict:
    sx, sz = _scale_pos(item["x"], item["z"])
    return {**item, "x": sx, "z": sz}


DECORATIONS: list[dict] = [
    _scale_item(item) for item in (_ORIGINAL + _EXTRA + _MORE)
]


def _point_in_footprint(px: float, pz: float, item: dict) -> bool:
    hw, hh = FURNITURE_HALF_SIZE.get(item["type"], (0.35, 0.35))
    hw += FOOTPRINT_MARGIN
    hh += FOOTPRINT_MARGIN
    cx, cz = item["x"], item["z"]
    rot = float(item.get("rot", 0.0))
    dx = px - cx
    dz = pz - cz
    cos_r = math.cos(rot)
    sin_r = math.sin(rot)
    lx = dx * cos_r + dz * sin_r
    lz = -dx * sin_r + dz * cos_r
    return abs(lx) <= hw and abs(lz) <= hh


def _cell_blocked_by_item(row: int, col: int, item: dict) -> bool:
    """True if any sample point in this floor tile overlaps the furniture footprint."""
    for ox in (-0.5, 0.0, 0.5):
        for oz in (-0.5, 0.0, 0.5):
            if _point_in_footprint(col + ox, row + oz, item):
                return True
    return False


def furniture_cells() -> set[tuple[int, int]]:
    cells: set[tuple[int, int]] = set()
    for item in DECORATIONS:
        hw, hh = FURNITURE_HALF_SIZE.get(item["type"], (0.35, 0.35))
        pad = int(math.ceil(max(hw, hh) + FOOTPRINT_MARGIN)) + 1
        cx, cz = item["x"], item["z"]
        min_c = int(math.floor(cx)) - pad
        max_c = int(math.ceil(cx)) + pad
        min_r = int(math.floor(cz)) - pad
        max_r = int(math.ceil(cz)) + pad
        for row in range(min_r, max_r + 1):
            for col in range(min_c, max_c + 1):
                if _cell_blocked_by_item(row, col, item):
                    cells.add((row, col))
    return cells


def merge_furniture_obstacles(base_grid: np.ndarray) -> np.ndarray:
    nav = base_grid.copy()
    h, w = nav.shape
    for row, col in furniture_cells():
        if 0 <= row < h and 0 <= col < w and nav[row, col] == 0:
            nav[row, col] = 2
    return nav
