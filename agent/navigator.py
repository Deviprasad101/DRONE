"""A* path planner for indoor drone navigation demo."""

from __future__ import annotations

import heapq
import math
from typing import List, Tuple

import numpy as np

GridPos = Tuple[int, int]
WorldPos = Tuple[float, float]


def _neighbors(grid: np.ndarray, cell: GridPos) -> List[GridPos]:
    row, col = cell
    h, w = grid.shape
    result = []
    for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)):
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
            step_cost = 1.414 if neighbor[0] != current[0] and neighbor[1] != current[1] else 1.0
            tentative = g_score[current] + step_cost
            if tentative < g_score.get(neighbor, float("inf")):
                came_from[neighbor] = current
                g_score[neighbor] = tentative
                f = tentative + _heuristic(neighbor, goal)
                heapq.heappush(open_set, (f, neighbor))

    return []


def world_to_grid(x: float, y: float) -> GridPos:
    return int(round(y)), int(round(x))


def grid_to_world(row: int, col: int) -> WorldPos:
    return float(col), float(row)


def is_walkable(grid: np.ndarray, x: float, y: float) -> bool:
    row, col = world_to_grid(x, y)
    if row < 0 or col < 0 or row >= grid.shape[0] or col >= grid.shape[1]:
        return False
    return int(grid[row, col]) == 0


def snap_to_walkable(grid: np.ndarray, x: float, y: float) -> WorldPos | None:
    """Snap click position to nearest walkable cell center."""
    row, col = world_to_grid(x, y)
    h, w = grid.shape
    if 0 <= row < h and 0 <= col < w and grid[row, col] == 0:
        return grid_to_world(row, col)

    best: WorldPos | None = None
    best_dist = float("inf")
    for radius in range(1, 6):
        for dr in range(-radius, radius + 1):
            for dc in range(-radius, radius + 1):
                nr, nc = row + dr, col + dc
                if nr < 0 or nc < 0 or nr >= h or nc >= w:
                    continue
                if grid[nr, nc] != 0:
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


def interpolate_path(waypoints: List[WorldPos], step_size: float = 0.15) -> List[WorldPos]:
    """Create dense points along waypoint path for smooth demo playback."""
    if not waypoints:
        return []
    dense: List[WorldPos] = [waypoints[0]]
    for i in range(len(waypoints) - 1):
        a = np.array(waypoints[i], dtype=np.float32)
        b = np.array(waypoints[i + 1], dtype=np.float32)
        segment = b - a
        length = float(np.linalg.norm(segment))
        if length < 1e-6:
            continue
        direction = segment / length
        traveled = step_size
        while traveled < length:
            point = a + direction * traveled
            dense.append((float(point[0]), float(point[1])))
            traveled += step_size
        dense.append((float(b[0]), float(b[1])))
    return dense


class PathFollower:
    """Follows A* waypoints with forward + yaw steering."""

    def __init__(self, grid: np.ndarray):
        self.grid = grid
        self.waypoints: List[WorldPos] = []
        self.playback_path: List[WorldPos] = []
        self.waypoint_index = 0
        self.playback_index = 0

    def reset(self, start: WorldPos, goal: WorldPos) -> None:
        self.waypoints = plan_world_path(self.grid, start, goal)
        self.playback_path = interpolate_path(self.waypoints, step_size=0.18)
        self.waypoint_index = 0
        self.playback_index = 0

    def next_playback_pose(self) -> tuple[WorldPos, float] | None:
        """Return next pose along planned path for scripted demo."""
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
        self.playback_index += 1
        return (x, y), yaw

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
        return [[p[0], p[1]] for p in self.waypoints]
