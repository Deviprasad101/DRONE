"""A* path planner for indoor drone navigation demo."""

from __future__ import annotations

import heapq
import math
from typing import List, Tuple

import numpy as np

GridPos = Tuple[int, int]
WorldPos = Tuple[float, float]
CELL_SIZE = 1.0
DRONE_RADIUS = 0.25


def world_to_grid(x: float, y: float) -> GridPos:
    return int(round(y)), int(round(x))


def grid_to_world(row: int, col: int) -> WorldPos:
    return float(col), float(row)


def is_safe_for_drone(grid: np.ndarray, x: float, y: float, radius: float = DRONE_RADIUS) -> bool:
    """True if a drone with the given radius does not overlap walls/crates."""
    h, w = grid.shape
    for gi in range(h):
        for gj in range(w):
            if grid[gi, gj] == 0:
                continue
            cell_x, cell_y = float(gj), float(gi)
            if (
                x + radius > cell_x
                and x - radius < cell_x + CELL_SIZE
                and y + radius > cell_y
                and y - radius < cell_y + CELL_SIZE
            ):
                return False
    return True


def _cell_center_safe(grid: np.ndarray, row: int, col: int) -> bool:
    x, y = grid_to_world(row, col)
    return int(grid[row, col]) == 0 and is_safe_for_drone(grid, x, y)


def _neighbors(grid: np.ndarray, cell: GridPos) -> List[GridPos]:
    row, col = cell
    h, w = grid.shape
    result = []
    for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        nr, nc = row + dr, col + dc
        if 0 <= nr < h and 0 <= nc < w and grid[nr, nc] == 0:
            result.append((nr, nc))
    return result


def _heuristic(a: GridPos, b: GridPos) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def astar(grid: np.ndarray, start: GridPos, goal: GridPos) -> List[GridPos]:
    """Find path on walkable cells (value 0)."""
    if grid[start[0], start[1]] != 0 or grid[goal[0], goal[1]] != 0:
        return []

    open_set: list[tuple[float, GridPos]] = [(0.0, start)]
    came_from: dict[GridPos, GridPos] = {}
    g_score = {start: 0.0}

    while open_set:
        _, current = heapq.heappop(open_set)
        if current == goal:
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            path.reverse()
            return path

        for neighbor in _neighbors(grid, current):
            tentative = g_score[current] + 1.0
            if tentative < g_score.get(neighbor, float("inf")):
                came_from[neighbor] = current
                g_score[neighbor] = tentative
                f = tentative + _heuristic(neighbor, goal)
                heapq.heappush(open_set, (f, neighbor))

    return []


def is_walkable(grid: np.ndarray, x: float, y: float) -> bool:
    row, col = world_to_grid(x, y)
    if row < 0 or col < 0 or row >= grid.shape[0] or col >= grid.shape[1]:
        return False
    return int(grid[row, col]) == 0


def snap_to_walkable(grid: np.ndarray, x: float, y: float) -> WorldPos | None:
    """Snap click position to nearest safe walkable cell center."""
    row, col = world_to_grid(x, y)
    h, w = grid.shape
    if 0 <= row < h and 0 <= col < w and grid[row, col] == 0:
        snapped = grid_to_world(row, col)
        if is_safe_for_drone(grid, snapped[0], snapped[1]):
            return snapped

    best: WorldPos | None = None
    best_dist = float("inf")
    for radius in range(1, 8):
        for dr in range(-radius, radius + 1):
            for dc in range(-radius, radius + 1):
                nr, nc = row + dr, col + dc
                if nr < 0 or nc < 0 or nr >= h or nc >= w:
                    continue
                if grid[nr, nc] != 0:
                    continue
                wx, wy = grid_to_world(nr, nc)
                if not is_safe_for_drone(grid, wx, wy):
                    continue
                dist = dr * dr + dc * dc
                if dist < best_dist:
                    best_dist = dist
                    best = grid_to_world(nr, nc)
        if best is not None:
            return best
    return None


def path_exists(grid: np.ndarray, start: WorldPos, goal: WorldPos) -> bool:
    start_cell = world_to_grid(start[0], start[1])
    goal_cell = world_to_grid(goal[0], goal[1])
    return bool(astar(grid, start_cell, goal_cell))


def plan_world_path(
    grid: np.ndarray, start: WorldPos, goal: WorldPos
) -> List[WorldPos]:
    start_cell = world_to_grid(start[0], start[1])
    goal_cell = world_to_grid(goal[0], goal[1])
    cells = astar(grid, start_cell, goal_cell)
    if not cells:
        return []
    return [grid_to_world(r, c) for r, c in cells]


def wrap_angle(angle: float) -> float:
    while angle > math.pi:
        angle -= 2 * math.pi
    while angle < -math.pi:
        angle += 2 * math.pi
    return angle


def interpolate_path(
    grid: np.ndarray,
    waypoints: List[WorldPos],
    step_size: float = 0.12,
) -> List[WorldPos]:
    """Dense axis-aligned path that stays in walkable cells (no wall clipping)."""
    if not waypoints:
        return []

    dense: List[WorldPos] = []

    def _append_if_valid(x: float, y: float) -> None:
        if not is_safe_for_drone(grid, x, y):
            return
        if dense and abs(dense[-1][0] - x) < 1e-4 and abs(dense[-1][1] - y) < 1e-4:
            return
        dense.append((x, y))

    _append_if_valid(float(waypoints[0][0]), float(waypoints[0][1]))

    for i in range(len(waypoints) - 1):
        bx, by = float(waypoints[i + 1][0]), float(waypoints[i + 1][1])
        if not dense:
            break
        x, y = dense[-1]

        while abs(bx - x) > 1e-4:
            step = step_size if bx > x else -step_size
            if abs(bx - x) < abs(step):
                x = bx
            else:
                x += step
            _append_if_valid(x, y)

        while abs(by - y) > 1e-4:
            step = step_size if by > y else -step_size
            if abs(by - y) < abs(step):
                y = by
            else:
                y += step
            _append_if_valid(x, y)

    return dense


def ensure_axis_aligned_path(
    grid: np.ndarray, path: List[WorldPos]
) -> List[WorldPos]:
    """Break diagonal jumps into Manhattan corners so line rendering stays in corridors."""
    if len(path) < 2:
        return path

    aligned: List[WorldPos] = [path[0]]
    for x, y in path[1:]:
        px, py = aligned[-1]
        if abs(x - px) > 1e-4 and abs(y - py) > 1e-4:
            for corner in ((x, py), (px, y)):
                if is_safe_for_drone(grid, corner[0], corner[1]):
                    if abs(corner[0] - aligned[-1][0]) > 1e-4 or abs(corner[1] - aligned[-1][1]) > 1e-4:
                        aligned.append(corner)
                    break

        if abs(x - aligned[-1][0]) > 1e-4 or abs(y - aligned[-1][1]) > 1e-4:
            if is_safe_for_drone(grid, x, y):
                aligned.append((x, y))

    return aligned


def is_segment_safe(
    grid: np.ndarray,
    ax: float,
    ay: float,
    bx: float,
    by: float,
    step: float = 0.08,
) -> bool:
    """True if a straight segment stays clear of walls/crates for the drone."""
    dist = math.hypot(bx - ax, by - ay)
    if dist < 1e-6:
        return is_safe_for_drone(grid, ax, ay)
    steps = max(int(dist / step), 1)
    for i in range(steps + 1):
        t = i / steps
        x = ax + (bx - ax) * t
        y = ay + (by - ay) * t
        if not is_safe_for_drone(grid, x, y):
            return False
    return True


def _grid_step_direction(a: WorldPos, b: WorldPos) -> tuple[int, int]:
    """Cardinal direction between two adjacent grid cell centers."""
    ax, ay = int(round(a[0])), int(round(a[1]))
    bx, by = int(round(b[0])), int(round(b[1]))
    dx = max(-1, min(1, bx - ax))
    dy = max(-1, min(1, by - ay))
    return (dx, dy)


def collapse_grid_waypoints(waypoints: List[WorldPos]) -> List[WorldPos]:
    """Merge collinear A* cells into long straight legs (no zig-zag)."""
    if len(waypoints) < 2:
        return list(waypoints)

    corners: List[WorldPos] = [waypoints[0]]
    prev_dir = _grid_step_direction(waypoints[0], waypoints[1])
    for i in range(2, len(waypoints)):
        direction = _grid_step_direction(waypoints[i - 1], waypoints[i])
        if direction != prev_dir:
            corners.append(waypoints[i - 1])
            prev_dir = direction
    corners.append(waypoints[-1])
    return corners


def build_safe_corner_path(grid: np.ndarray, waypoints: List[WorldPos]) -> List[WorldPos]:
    """Corner path from A* grid — straight horizontal/vertical legs only."""
    return string_pull_corners(grid, collapse_grid_waypoints(waypoints))


def string_pull_corners(grid: np.ndarray, corners: List[WorldPos]) -> List[WorldPos]:
    """Skip intermediate corners when a direct straight leg is wall-safe."""
    if len(corners) < 3:
        return list(corners)

    pulled: List[WorldPos] = [corners[0]]
    i = 0
    while i < len(corners) - 1:
        best_j = i + 1
        for j in range(len(corners) - 1, i, -1):
            start = pulled[-1]
            end = corners[j]
            aligned = abs(start[0] - end[0]) < 1e-4 or abs(start[1] - end[1]) < 1e-4
            if aligned and is_segment_safe(grid, start[0], start[1], end[0], end[1]):
                best_j = j
                break
        pulled.append(corners[best_j])
        i = best_j
    return pulled


def corner_playback_indices(corners: List[WorldPos], playback: List[WorldPos]) -> List[int]:
    """Map each corner to the nearest index along the dense playback path."""
    indices: List[int] = []
    for cx, cy in corners:
        best_j = 0
        best_d = float("inf")
        for j, (px, py) in enumerate(playback):
            d = math.hypot(px - cx, py - cy)
            if d < best_d:
                best_d = d
                best_j = j
        indices.append(best_j)
    return indices


class PathFollower:
    """Follows A* waypoints with forward + yaw steering."""

    def __init__(self, grid: np.ndarray):
        self.grid = grid
        self.waypoints: List[WorldPos] = []
        self.playback_path: List[WorldPos] = []
        self.corner_path: List[WorldPos] = []
        self._corner_playback_idx: List[int] = []
        self.waypoint_index = 0
        self.playback_index = 0

    def reset(self, start: WorldPos, goal: WorldPos) -> None:
        self.waypoints = plan_world_path(self.grid, start, goal)
        dense = interpolate_path(self.grid, self.waypoints, step_size=0.12)
        self.playback_path = ensure_axis_aligned_path(self.grid, dense)
        self.corner_path = build_safe_corner_path(self.grid, self.waypoints)
        self._corner_playback_idx = corner_playback_indices(
            self.corner_path, self.playback_path
        )
        self.waypoint_index = 0
        self.playback_index = 0

    def advance_playback(self) -> None:
        self.playback_index += 1

    def current_playback_pose(self) -> tuple[WorldPos, float] | None:
        """Return pose at current playback index without advancing."""
        if self.playback_index >= len(self.playback_path):
            return None

        x, y = self.playback_path[self.playback_index]
        if self.playback_index + 1 < len(self.playback_path):
            nx, ny = self.playback_path[self.playback_index + 1]
            yaw = math.atan2(ny - y, nx - x)
        else:
            yaw = math.atan2(
                self.waypoints[-1][1] - y,
                self.waypoints[-1][0] - x,
            )
        return (x, y), yaw

    def next_playback_pose(self) -> tuple[WorldPos, float] | None:
        """Return next pose along planned path for scripted demo."""
        pose = self.current_playback_pose()
        if pose is not None:
            self.advance_playback()
        return pose

    @property
    def traveled_path(self) -> List[List[float]]:
        """Straight corner legs already traveled — wall-safe blue trail."""
        if self.playback_index <= 0 or len(self.corner_path) < 2:
            return []
        if self.playback_index >= len(self.playback_path):
            return [[p[0], p[1]] for p in self.corner_path]

        result: List[List[float]] = [[self.corner_path[0][0], self.corner_path[0][1]]]
        for i in range(1, len(self.corner_path)):
            if self._corner_playback_idx[i] > self.playback_index:
                break
            end = self.corner_path[i]
            result.append([end[0], end[1]])

        return result

    def _current_target(self, pos: np.ndarray, goal_pos: np.ndarray) -> np.ndarray:
        while self.waypoint_index < len(self.waypoints):
            target = np.array(self.waypoints[self.waypoint_index], dtype=np.float32)
            if float(np.linalg.norm(target - pos)) < 0.65:
                self.waypoint_index += 1
            else:
                return target
        return goal_pos

    def get_action(self, pos: np.ndarray, yaw: float, lidar: np.ndarray) -> np.ndarray:
        goal_pos = np.array(
            self.waypoints[-1] if self.waypoints else pos, dtype=np.float32
        )
        if float(np.linalg.norm(goal_pos - pos)) < 0.45:
            return np.array([0.0, 0.0, 0.0], dtype=np.float32)

        target = self._current_target(pos, goal_pos)
        delta = target - pos
        dist = float(np.linalg.norm(delta))
        if dist < 1e-4:
            return np.array([0.0, 0.0, 0.0], dtype=np.float32)

        desired_yaw = math.atan2(delta[1], delta[0])
        yaw_error = wrap_angle(desired_yaw - yaw)

        front = min(lidar[0], lidar[1], lidar[15])
        speed = 1.0 if front > 0.3 else (0.5 if front > 0.18 else 0.15)

        world_vx = (delta[0] / dist) * speed
        world_vy = (delta[1] / dist) * speed

        cos_y = math.cos(yaw)
        sin_y = math.sin(yaw)
        forward = cos_y * world_vx + sin_y * world_vy
        strafe = -sin_y * world_vx + cos_y * world_vy
        yaw_rate = float(np.clip(yaw_error * 3.0, -1.0, 1.0))

        if front < 0.18:
            left = min(lidar[4], lidar[5], lidar[6])
            right = min(lidar[10], lidar[11], lidar[12])
            forward = 0.1
            strafe = 0.0
            yaw_rate = 0.9 if left > right else -0.9

        return np.array(
            [
                float(np.clip(forward, -1.0, 1.0)),
                float(np.clip(strafe, -1.0, 1.0)),
                float(np.clip(yaw_rate, -1.0, 1.0)),
            ],
            dtype=np.float32,
        )

    @property
    def planned_path(self) -> List[List[float]]:
        """Straight corner legs of the full route — wall-safe green path."""
        return [[p[0], p[1]] for p in self.corner_path]
