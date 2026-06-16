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

from env.indoor_drone_env import IndoorDroneEnv
from agent.navigator import PathFollower

WEB_DIR = Path(__file__).parent.parent / "web"
MODELS_DIR = Path(__file__).parent.parent / "models"
DEFAULT_MODEL = MODELS_DIR / "ppo_indoor_drone.zip"

app = FastAPI(title="RL Indoor Drone Navigation Demo")
app.mount("/static", StaticFiles(directory=WEB_DIR / "static"), name="static")

env = IndoorDroneEnv()
path_follower = PathFollower(env.map_layout)
model = None
training_lock = asyncio.Lock()
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
    return FileResponse(WEB_DIR / "index.html")


@app.get("/api/state")
async def get_state():
    return env.get_state_dict()


@app.get("/api/model-status")
async def model_status():
    return {
        "loaded": model is not None,
        "path": str(DEFAULT_MODEL),
        "exists": DEFAULT_MODEL.exists(),
    }


async def run_episode(ws: WebSocket):
    global simulation_running
    obs, info = env.reset()
    path_follower.reset(
        tuple(env.start_pos.tolist()),
        tuple(env.goal_pos.tolist()),
    )
    total_reward = 0.0
    use_scripted = model is None

    state = env.get_state_dict()
    state["planned_path"] = path_follower.planned_path
    await ws.send_json({"type": "state", "state": state, "reward": 0})
    await asyncio.sleep(0.3)

    while simulation_running:
        if use_scripted:
            pose = path_follower.next_playback_pose()
            if pose is None:
                env.set_pose(env.goal_pos[0], env.goal_pos[1])
                env.steps += 1
                success = True
                reason = "Goal reached!"
            else:
                (x, y), yaw = pose
                env.set_pose(x, y, yaw)
                env.steps += 1
                dist = float(np.linalg.norm(env.goal_pos - env.pos))
                success = dist < 0.5
                if success:
                    reason = "Goal reached!"
                else:
                    reason = ""
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
        state = env.get_state_dict()
        state["planned_path"] = path_follower.planned_path
        await ws.send_json(
            {"type": "state", "state": state, "reward": float(reward)}
        )

        if use_scripted and (pose is None or success):
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

        await asyncio.sleep(0.05 if use_scripted else 0.06)


async def run_training(ws: WebSocket, timesteps: int = 20000):
    global model
    async with training_lock:
        await ws.send_json(
            {"type": "training", "message": f"Training PPO for {timesteps} steps..."}
        )

        def _train():
            from train import train

            train(total_timesteps=timesteps)

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _train)

        loaded = load_model()
        await ws.send_json(
            {
                "type": "training",
                "message": f"Training complete! Model {'loaded' if loaded else 'saved'}.",
                "done": True,
                "level": "success",
            }
        )


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
                state = env.get_state_dict()
                state["planned_path"] = path_follower.planned_path
                await ws.send_json({"type": "reset", "state": state})

            elif action == "train":
                timesteps = msg.get("timesteps", 20000)
                asyncio.create_task(run_training(ws, timesteps))

    except WebSocketDisconnect:
        simulation_running = False
