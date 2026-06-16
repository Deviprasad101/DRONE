import { DroneScene, drawLidar } from "./scene.js";

const canvas = document.getElementById("canvas3d");
const lidarCanvas = document.getElementById("lidar-canvas");
const scene = new DroneScene(canvas);
scene.animate();

const hudSteps = document.getElementById("hud-steps");
const hudDist = document.getElementById("hud-dist");
const hudStatus = document.getElementById("hud-status");
const hudReward = document.getElementById("hud-reward");
const logEl = document.getElementById("log");

const btnStart = document.getElementById("btn-start");
const btnTrain = document.getElementById("btn-train");
const btnReset = document.getElementById("btn-reset");

let ws = null;
let totalReward = 0;

function log(msg, type = "") {
  const entry = document.createElement("div");
  entry.className = `entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.prepend(entry);
  if (logEl.children.length > 50) logEl.lastChild.remove();
}

function setStatus(text, cls) {
  hudStatus.textContent = text;
  hudStatus.className = `value ${cls}`;
}

function setButtonsRunning(running) {
  btnStart.disabled = running;
  btnTrain.disabled = running;
}

async function fetchInitialState() {
  try {
    const res = await fetch("/api/state");
    const state = await res.json();
    scene.updateState(state);
    drawLidar(lidarCanvas, state.lidar || [], state.yaw || 0);
    hudDist.textContent = state.dist_to_goal?.toFixed(2) ?? "--";
    hudSteps.textContent = state.steps ?? 0;
  } catch (e) {
    log("Failed to load initial state", "error");
  }
}

function connectWebSocket() {
  if (ws) ws.close();

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}/ws/simulation`);

  ws.onopen = () => log("Connected to simulation", "info");

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "state") {
      scene.updateState(data.state);
      drawLidar(lidarCanvas, data.state.lidar || [], data.state.yaw || 0);
      hudSteps.textContent = data.state.steps ?? 0;
      hudDist.textContent = (data.state.dist_to_goal ?? 0).toFixed(2);
      if (data.reward !== undefined) {
        totalReward += data.reward;
        hudReward.textContent = totalReward.toFixed(1);
      }
    } else if (data.type === "done") {
      setButtonsRunning(false);
      if (data.success) {
        setStatus("Goal Reached!", "success");
        log(`Episode complete! Steps: ${data.steps}, Reward: ${data.total_reward?.toFixed(1)}`, "success");
      } else {
        setStatus(data.reason || "Failed", "failed");
        log(`Episode ended: ${data.reason}`, "error");
      }
      btnStart.textContent = "Start Demo";
    } else if (data.type === "training") {
      log(data.message, data.level || "info");
      if (data.done) {
        setButtonsRunning(false);
        btnTrain.textContent = "Quick Train";
        setStatus("Training Complete", "success");
      }
    } else if (data.type === "reset") {
      totalReward = 0;
      hudReward.textContent = "0";
      scene.updateState(data.state);
      setStatus("Idle", "idle");
      log("Environment reset", "info");
    }
  };

  ws.onclose = () => log("Disconnected", "error");
  ws.onerror = () => log("WebSocket error", "error");
}

btnStart.addEventListener("click", () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) connectWebSocket();
  setTimeout(() => {
    scene.clearPath();
    ws.send(JSON.stringify({ action: "start" }));
    setButtonsRunning(true);
    btnStart.textContent = "Running...";
    setStatus("Navigating", "running");
    totalReward = 0;
    hudReward.textContent = "0";
    log("Starting RL navigation demo...", "info");
  }, 300);
});

btnTrain.addEventListener("click", () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) connectWebSocket();
  setTimeout(() => {
    ws.send(JSON.stringify({ action: "train", timesteps: 20000 }));
    setButtonsRunning(true);
    btnTrain.textContent = "Training...";
    setStatus("Training", "running");
    log("Quick training started (20k steps)...", "info");
  }, 300);
});

btnReset.addEventListener("click", () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) connectWebSocket();
  setTimeout(() => {
    ws.send(JSON.stringify({ action: "reset" }));
    setButtonsRunning(false);
    btnStart.textContent = "Start Demo";
    btnTrain.textContent = "Quick Train";
    totalReward = 0;
    hudReward.textContent = "0";
    log("Reset requested", "info");
  }, 300);
});

fetchInitialState();
connectWebSocket();
