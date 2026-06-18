"""Furniture placements and navigation obstacles (shared with 3D interior)."""

from __future__ import annotations

import numpy as np

# Decorative furniture — mirrors frontend/static/js/interior.js DECORATIONS
DECORATIONS: list[dict] = [
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

# Grid-cell radius blocked around each furniture center (Manhattan square)
BLOCK_RADIUS: dict[str, int] = {
    "bed": 1,
    "sofa": 1,
    "dining": 1,
    "kitchen": 1,
    "desk": 1,
    "table": 1,
    "wardrobe": 1,
    "bath": 0,
    "shower": 0,
    "plant": 0,
    "lamp": 0,
}


def furniture_cells() -> set[tuple[int, int]]:
    """Return (row, col) cells occupied by decorative furniture."""
    cells: set[tuple[int, int]] = set()
    for dec in DECORATIONS:
        radius = BLOCK_RADIUS.get(dec["type"], 0)
        if radius <= 0:
            continue
        center_col = int(round(dec["x"]))
        center_row = int(round(dec["z"]))
        for dr in range(-radius, radius + 1):
            for dc in range(-radius, radius + 1):
                cells.add((center_row + dr, center_col + dc))
    return cells


def merge_furniture_obstacles(base_grid: np.ndarray) -> np.ndarray:
    """Return navigation grid with furniture marked as obstacles (cell 2)."""
    nav = base_grid.copy()
    h, w = nav.shape
    for row, col in furniture_cells():
        if 0 <= row < h and 0 <= col < w and nav[row, col] == 0:
            nav[row, col] = 2
    return nav
