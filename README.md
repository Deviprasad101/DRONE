# RL Indoor Drone Navigation Demo

Autonomous indoor drone navigation using **Reinforcement Learning**, with a 3D web-based simulation UI.

![Demo UI](assets/demo-preview.png)

## Features

- **Custom Gymnasium Environment** — Indoor building with walls, corridors, and crate obstacles
- **Lidar-based Observations** — 16-ray distance sensors + goal direction + velocity
- **PPO Agent** — Trained with Stable-Baselines3 (Proximal Policy Optimization)
- **3D Web Visualization** — Three.js scene matching the reference UI:
  - Gray concrete walls and corridors
  - Brown crate obstacles
  - Blue start marker, green goal marker
  - Dotted flight path trail
  - Animated quadcopter drone
  - Real-time lidar sensor display
- **Heuristic Fallback** — Demo works immediately without training

## Quick Start

### 1. Install Dependencies

```bash
cd "d:\TIH PROJECTS\DRONE"
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Run the Demo

```bash
python run_demo.py
```

Open **http://localhost:8000** in your browser.

### 3. Train the RL Agent (Optional)

```bash
# Full training (100k steps, ~5-10 min)
python train.py
```

After training, the model is saved to `models/ppo_indoor_drone.zip` and loaded automatically.

## Project Structure

```
DRONE/
├── env/
│   └── indoor_drone_env.py   # Gymnasium RL environment
├── server/
│   └── app.py                # FastAPI + WebSocket server
├── web/
│   ├── index.html            # Demo UI
│   └── static/
│       ├── css/style.css
│       └── js/
│           ├── main.js       # UI controls & WebSocket
│           └── scene.js      # Three.js 3D scene
├── train.py                  # PPO training script
├── run_demo.py               # Start demo server
├── requirements.txt
└── models/                   # Saved RL models
```

## RL Environment Details

| Component | Description |
|-----------|-------------|
| **State** | 16 lidar rays + goal direction (2) + velocity (2) + yaw (1) |
| **Actions** | Forward velocity, strafe velocity, yaw rate (continuous) |
| **Rewards** | +10 per unit closer to goal, +100 on arrival, -50 on collision |
| **Map** | 20×20 grid with walls, rooms, corridors, and crate obstacles |

## Controls

| Button | Action |
|--------|--------|
| **Start Demo** | Run navigation from start to goal |
| **Reset** | Reset drone to start position |

## Tech Stack

- **Python** — RL environment & training
- **Gymnasium** — RL environment API
- **Stable-Baselines3** — PPO algorithm
- **FastAPI** — Backend server
- **Three.js** — 3D visualization
- **WebSocket** — Real-time simulation streaming

## License

MIT
