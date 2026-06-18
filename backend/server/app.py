"""FastAPI server for RL indoor drone navigation demo."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from env.indoor_drone_env import IndoorDroneEnv
from agent.navigator import PathFollower, path_exists, snap_to_walkable, sanitize_display_path

WEB_DIR = Path(__file__).parent.parent.parent / "frontend"
MODELS_DIR = Path(__file__).parent.parent / "models"
DEFAULT_MODEL = MODELS_DIR / "ppo_indoor_drone.zip"

app = FastAPI(title="RL Indoor Drone Navigation Demo")
app.mount("/static", StaticFiles(directory=WEB_DIR / "static"), name="static")

env = IndoorDroneEnv()
path_follower = PathFollower(env.map_layout)
model = None
simulation_running = False


def load_model():
    global model
    if DEFAULT_MODEL.exists():
        try:
            from stable_baselines3 import PPO

            model = PPO.load(str(DEFAULT_MODEL))
            return True
        except Exception:
            model = None
    return False


def heuristic_action(obs: np.ndarray, pos: np.ndarray, yaw: float) -> np.ndarray:
    """A* path follower used when no trained RL model is available."""
    lidar = obs[:16]
    return path_follower.get_action(pos, yaw, lidar)


def predict_action(obs: np.ndarray, pos: np.ndarray, yaw: float) -> np.ndarray:
    if model is not None:
        action, _ = model.predict(obs, deterministic=True)
        return action
    return heuristic_action(obs, pos, yaw)


@app.on_event("startup")
async def startup():
    loaded = load_model()
    print(f"Model loaded: {loaded}")


@app.get("/")
async def index():
    return FileResponse(
        WEB_DIR / "index.html",
        headers={"Cache-Control": "no-cache"},
    )


def build_state(include_map: bool = True) -> dict:
    state = env.get_state_dict(include_lidar=False, include_map=include_map)
    state["planned_path"] = path_follower.planned_path
    # Prefer dense safe path for rendering; straight legs cut through furniture visually.
    state["planned_legs"] = (
        [] if len(path_follower.playback_path) > 1 else path_follower.planned_legs
    )
    if path_follower.playback_index > 0:
        state["path"] = path_follower.traveled_path
    elif len(state.get("path", [])) > 1:
        state["path"] = sanitize_display_path(env.map_layout, state["path"])
    state["path_valid"] = bool(path_follower.waypoints) or path_exists(
        env.map_layout,
        tuple(env.start_pos.tolist()),
        tuple(env.goal_pos.tolist()),
    )
    return state


def apply_point(point_type: str, x: float, y: float) -> dict:
    snapped = snap_to_walkable(env.map_layout, x, y)
    if snapped is None:
        return {"ok": False, "error": "No walkable area near click. Click on open floor."}

    start = tuple(env.start_pos.tolist())
    goal = tuple(env.goal_pos.tolist())

    if point_type == "start":
        start = snapped
    elif point_type == "goal":
        goal = snapped
    else:
        return {"ok": False, "error": "Invalid point type"}

    if start == goal:
        return {"ok": False, "error": "Start and goal must be different points."}

    env.set_mission(start, goal)
    env.reset()
    has_path = path_follower.preview_plan(start, goal)

    return {
        "ok": True,
        "state": build_state(include_map=False),
        "point_type": point_type,
        "position": list(snapped),
        "path_valid": has_path,
        "warning": None
        if has_path
        else "Point set, but no path to the other marker yet. Adjust the other point.",
    }


class SetPointRequest(BaseModel):
    point_type: str
    x: float
    y: float


@app.post("/api/set-point")
async def set_point(req: SetPointRequest):
    if simulation_running:
        return {"ok": False, "error": "Cannot change points while simulation is running."}
    if req.point_type not in ("start", "goal"):
        return {"ok": False, "error": "point_type must be 'start' or 'goal'"}
    return apply_point(req.point_type, req.x, req.y)


@app.get("/api/state")
async def get_state():
    return build_state()


@app.get("/api/model-status")
async def model_status():
    return {
        "loaded": model is not None,
        "path": str(DEFAULT_MODEL),
        "exists": DEFAULT_MODEL.exists(),
    }


async def run_episode(ws: WebSocket):
    global simulation_running

    if not path_exists(
        env.map_layout,
        tuple(env.start_pos.tolist()),
        tuple(env.goal_pos.tolist()),
    ):
        await ws.send_json(
            {
                "type": "error",
                "message": "No valid path. Set start and goal on walkable floor tiles.",
            }
        )
        simulation_running = False
        return

    obs, info = env.reset()
    path_follower.reset(
        tuple(env.start_pos.tolist()),
        tuple(env.goal_pos.tolist()),
    )
    total_reward = 0.0
    use_scripted = model is None
    steps_per_tick = 1 if use_scripted else 1

    state = build_state()
    await ws.send_json({"type": "state", "state": state, "reward": 0})
    await asyncio.sleep(0.15)

    pose = None
    while simulation_running:
        if use_scripted:
            success = False
            reason = ""
            for _ in range(steps_per_tick):
                pose = path_follower.current_playback_pose()
                if pose is None:
                    env.set_pose(float(env.goal_pos[0]), float(env.goal_pos[1]))
                    env.steps += 1
                    success = True
                    reason = "Goal reached!"
                    break

                (x, y), yaw = pose
                if env.set_pose(x, y, yaw):
                    env.steps += 1
                    path_follower.advance_playback()
                else:
                    path_follower.advance_playback()

                dist = float(np.linalg.norm(env.goal_pos - env.pos))
                if dist < 0.5:
                    success = True
                    reason = "Goal reached!"
                    break

            reward = 0.1
            terminated = success
            truncated = False
            info = env.get_state_dict()
            info["reached_goal"] = success
            info["dist_to_goal"] = float(np.linalg.norm(env.goal_pos - env.pos))
        else:
            action = predict_action(obs, env.pos, env.yaw)
            obs, reward, terminated, truncated, info = env.step(action)
            success = info.get("reached_goal", False)
            reason = "Goal reached!" if success else ""

        total_reward += reward
        state = build_state()
        await ws.send_json(
            {"type": "state", "state": state, "reward": float(reward)}
        )

        if use_scripted and success:
            await ws.send_json(
                {
                    "type": "done",
                    "success": True,
                    "reason": "Goal reached!",
                    "steps": env.steps,
                    "total_reward": total_reward,
                }
            )
            simulation_running = False
            return

        if not use_scripted and (terminated or truncated):
            if success:
                reason = "Goal reached!"
            elif truncated:
                reason = "Time limit reached"
            else:
                reason = "Collision!"
            await ws.send_json(
                {
                    "type": "done",
                    "success": success,
                    "reason": reason,
                    "steps": env.steps,
                    "total_reward": total_reward,
                }
            )
            simulation_running = False
            return

        await asyncio.sleep(0.08 if use_scripted else 0.06)


@app.websocket("/ws/simulation")
async def websocket_simulation(ws: WebSocket):
    global simulation_running
    await ws.accept()

    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            action = msg.get("action")

            if action == "start":
                if not simulation_running:
                    simulation_running = True
                    asyncio.create_task(run_episode(ws))

            elif action == "reset":
                simulation_running = False
                await asyncio.sleep(0.1)
                env.reset()
                path_follower.reset(
                    tuple(env.start_pos.tolist()),
                    tuple(env.goal_pos.tolist()),
                )
                await ws.send_json({"type": "reset", "state": build_state()})

            elif action in ("set_start", "set_goal"):
                if simulation_running:
                    await ws.send_json(
                        {"type": "error", "message": "Cannot change points while running."}
                    )
                    continue
                x = float(msg.get("x", 0))
                y = float(msg.get("y", 0))
                point_type = "start" if action == "set_start" else "goal"
                result = apply_point(point_type, x, y)
                if result["ok"]:
                    await ws.send_json(
                        {
                            "type": "points_updated",
                            "point_type": point_type,
                            "position": result["position"],
                            "state": result["state"],
                        }
                    )
                else:
                    await ws.send_json({"type": "error", "message": result["error"]})

    except WebSocketDisconnect:
        simulation_running = False
