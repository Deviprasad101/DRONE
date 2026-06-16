"""Train PPO agent for indoor drone navigation."""

from __future__ import annotations

import argparse
from pathlib import Path

from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import EvalCallback
from stable_baselines3.common.vec_env import DummyVecEnv

from env.indoor_drone_env import IndoorDroneEnv

MODELS_DIR = Path(__file__).parent / "models"
MODELS_DIR.mkdir(exist_ok=True)
DEFAULT_MODEL_PATH = MODELS_DIR / "ppo_indoor_drone"


def make_env():
    return IndoorDroneEnv()


def train(total_timesteps: int = 100_000, save_path: Path = DEFAULT_MODEL_PATH):
    print("Creating environment...")
    env = DummyVecEnv([make_env])
    eval_env = DummyVecEnv([make_env])

    eval_callback = EvalCallback(
        eval_env,
        best_model_save_path=str(save_path.parent / "best"),
        log_path=str(save_path.parent / "logs"),
        eval_freq=5000,
        deterministic=True,
        render=False,
    )

    model = PPO(
        "MlpPolicy",
        env,
        learning_rate=3e-4,
        n_steps=2048,
        batch_size=64,
        n_epochs=10,
        gamma=0.99,
        verbose=1,
        tensorboard_log=str(save_path.parent / "tensorboard"),
    )

    print(f"Training for {total_timesteps} timesteps...")
    model.learn(total_timesteps=total_timesteps, callback=eval_callback)
    model.save(str(save_path))
    print(f"Model saved to {save_path}")
    return model


def main():
    parser = argparse.ArgumentParser(description="Train indoor drone RL agent")
    parser.add_argument(
        "--timesteps", type=int, default=100_000, help="Training timesteps"
    )
    parser.add_argument(
        "--output", type=str, default=str(DEFAULT_MODEL_PATH), help="Model save path"
    )
    args = parser.parse_args()
    train(total_timesteps=args.timesteps, save_path=Path(args.output))


if __name__ == "__main__":
    main()
