"""
Indoor Drone Navigation RL Environment

A Gymnasium environment simulating a quadcopter navigating through
an indoor building with walls, corridors, and crate obstacles.
"""

from __future__ import annotations

import math
from typing import Any

import gymnasium as gym
import numpy as np
from gymnasium import spaces

# Map layout: 0=free, 1=wall, 2=crate obstacle
# 20x20 grid representing an indoor floor plan
MAP_LAYOUT = np.array(
    [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1],
        [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1],
        [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        [1, 0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
    dtype=np.int8,
)

DEFAULT_START = (2.0, 2.0)
DEFAULT_GOAL = (17.0, 17.0)
CELL_SIZE = 1.0
DRONE_RADIUS = 0.25
MAX_STEPS = 800
NUM_LIDAR_RAYS = 16
LIDAR_RANGE = 5.0


class IndoorDroneEnv(gym.Env):
    """Quadcopter indoor navigation with lidar observations."""

    metadata = {"render_modes": ["human", "rgb_array"], "render_fps": 30}

    def __init__(
        self,
        render_mode: str | None = None,
        start_pos: tuple[float, float] | None = None,
        goal_pos: tuple[float, float] | None = None,
        max_steps: int = MAX_STEPS,
    ):
        super().__init__()
        self.render_mode = render_mode
        self.map_layout = MAP_LAYOUT.copy()
        self.grid_h, self.grid_w = self.map_layout.shape
        self.start_pos = np.array(start_pos or DEFAULT_START, dtype=np.float32)
        self.goal_pos = np.array(goal_pos or DEFAULT_GOAL, dtype=np.float32)
        self.max_steps = max_steps

        # Actions: [forward_vel, strafe_vel, yaw_rate] normalized to [-1, 1]
        self.action_space = spaces.Box(
            low=-1.0, high=1.0, shape=(3,), dtype=np.float32
        )

        # Observation: lidar distances + relative goal + velocity + yaw
        obs_dim = NUM_LIDAR_RAYS + 2 + 2 + 1  # lidar + goal_dx/dy + vx/vy + yaw
        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf, shape=(obs_dim,), dtype=np.float32
        )

        self.pos = self.start_pos.copy()
        self.velocity = np.zeros(2, dtype=np.float32)
        self.yaw = 0.0
        self.steps = 0
        self.path_history: list[list[float]] = []
        self._prev_dist_to_goal = 0.0

    def _world_to_grid(self, x: float, y: float) -> tuple[int, int]:
        return int(round(y)), int(round(x))

    def is_walkable(self, x: float, y: float) -> bool:
        row, col = self._world_to_grid(x, y)
        if row < 0 or col < 0 or row >= self.grid_h or col >= self.grid_w:
            return False
        return int(self.map_layout[row, col]) == 0

    def set_mission(self, start: tuple[float, float], goal: tuple[float, float]) -> None:
        self.start_pos = np.array(start, dtype=np.float32)
        self.goal_pos = np.array(goal, dtype=np.float32)

    def _is_collision(self, x: float, y: float) -> bool:
        for gi in range(self.grid_h):
            for gj in range(self.grid_w):
                if self.map_layout[gi, gj] == 0:
                    continue
                cell_x, cell_y = gj, gi
                if (
                    x + DRONE_RADIUS > cell_x
                    and x - DRONE_RADIUS < cell_x + CELL_SIZE
                    and y + DRONE_RADIUS > cell_y
                    and y - DRONE_RADIUS < cell_y + CELL_SIZE
                ):
                    return True
        return False

    def _cast_lidar(self) -> np.ndarray:
        distances = np.zeros(NUM_LIDAR_RAYS, dtype=np.float32)
        for i in range(NUM_LIDAR_RAYS):
            angle = self.yaw + (2 * math.pi * i / NUM_LIDAR_RAYS)
            dx, dy = math.cos(angle), math.sin(angle)
            dist = 0.0
            while dist < LIDAR_RANGE:
                dist += 0.05
                px = self.pos[0] + dx * dist
                py = self.pos[1] + dy * dist
                if self._is_collision(px, py):
                    break
            distances[i] = dist / LIDAR_RANGE
        return distances

    def _get_obs(self) -> np.ndarray:
        lidar = self._cast_lidar()
        goal_rel = self.goal_pos - self.pos
        dist = np.linalg.norm(goal_rel)
        if dist > 1e-6:
            goal_rel = goal_rel / dist
        obs = np.concatenate(
            [lidar, goal_rel, self.velocity / 2.0, [self.yaw / math.pi]]
        ).astype(np.float32)
        return obs

    def reset(
        self, *, seed: int | None = None, options: dict | None = None
    ) -> tuple[np.ndarray, dict]:
        super().reset(seed=seed)
        self.pos = self.start_pos.copy()
        self.velocity = np.zeros(2, dtype=np.float32)
        self.yaw = math.atan2(
            self.goal_pos[1] - self.pos[1], self.goal_pos[0] - self.pos[0]
        )
        self.steps = 0
        self.path_history = [self.pos.tolist()]
        self._prev_dist_to_goal = float(np.linalg.norm(self.goal_pos - self.pos))
        info = self._get_info()
        info["reached_goal"] = False
        return self._get_obs(), info

    def step(self, action: np.ndarray) -> tuple[np.ndarray, float, bool, bool, dict]:
        action = np.clip(action, -1.0, 1.0)
        forward_vel = float(action[0]) * 2.0
        strafe_vel = float(action[1]) * 1.2
        yaw_rate = float(action[2]) * 0.2

        self.yaw += yaw_rate
        cos_y, sin_y = math.cos(self.yaw), math.sin(self.yaw)
        world_vx = forward_vel * cos_y - strafe_vel * sin_y
        world_vy = forward_vel * sin_y + strafe_vel * cos_y

        new_pos = self.pos + np.array([world_vx * 0.12, world_vy * 0.12])
        if not self._is_collision(new_pos[0], new_pos[1]):
            self.pos = new_pos
            self.velocity = np.array([world_vx, world_vy])
        else:
            self.velocity *= 0.0

        self.steps += 1
        self.path_history.append(self.pos.tolist())

        dist_to_goal = float(np.linalg.norm(self.goal_pos - self.pos))
        progress = self._prev_dist_to_goal - dist_to_goal
        self._prev_dist_to_goal = dist_to_goal

        reward = progress * 10.0 - 0.05
        terminated = False
        truncated = False
        reached_goal = False

        if dist_to_goal < 0.5:
            reward += 100.0
            terminated = True
            reached_goal = True
        elif self._is_collision(self.pos[0], self.pos[1]):
            reward -= 50.0
            terminated = True
        elif self.steps >= self.max_steps:
            truncated = True
            reward -= 10.0

        info = self._get_info()
        info["reached_goal"] = reached_goal
        return self._get_obs(), reward, terminated, truncated, info

    def _get_info(self) -> dict[str, Any]:
        return {
            "position": self.pos.tolist(),
            "goal": self.goal_pos.tolist(),
            "start": self.start_pos.tolist(),
            "yaw": self.yaw,
            "path": self.path_history.copy(),
            "steps": self.steps,
            "dist_to_goal": float(np.linalg.norm(self.goal_pos - self.pos)),
            "map_layout": self.map_layout.tolist(),
            "grid_size": [self.grid_w, self.grid_h],
        }

    def set_pose(self, x: float, y: float, yaw: float | None = None) -> bool:
        """Set drone pose for scripted demo playback."""
        if self._is_collision(x, y):
            return False
        self.pos = np.array([x, y], dtype=np.float32)
        if yaw is not None:
            self.yaw = yaw
        self.path_history.append(self.pos.tolist())
        return True

    def get_state_dict(self) -> dict[str, Any]:
        """Full state for web visualization."""
        return {
            **self._get_info(),
            "lidar": self._cast_lidar().tolist(),
        }
