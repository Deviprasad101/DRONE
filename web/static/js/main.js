import { DroneScene, drawLidar } from "./scene.js";

const canvas = document.getElementById("canvas3d");
const canvasWrap = document.getElementById("canvas-wrap");
const pickOverlay = document.getElementById("pick-overlay");
const pickOverlayText = document.getElementById("pick-overlay-text");
const lidarCanvas = document.getElementById("lidar-canvas");
const scene = new DroneScene(canvas);
scene.animate();

const hudSteps = document.getElementById("hud-steps");
const hudDist = document.getElementById("hud-dist");
const hudStatus = document.getElementById("hud-status");
const hudReward = document.getElementById("hud-reward");
const logEl = document.getElementById("log");
const readoutStart = document.getElementById("readout-start");
const readoutGoal = document.getElementById("readout-goal");
const pickHint = document.getElementById("pick-hint");

const btnStart = document.getElementById("btn-start");
const btnReset = document.getElementById("btn-reset");
const btnPickStart = document.getElementById("btn-pick-start");
const btnPickGoal = document.getElementById("btn-pick-goal");

let ws = null;
let totalReward = 0;
let pickMode = null;

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
  btnPickStart.disabled = running;
  btnPickGoal.disabled = running;
}

function updateReadout(state) {
  if (state?.start) {
    readoutStart.textContent = `${state.start[0].toFixed(0)}, ${state.start[1].toFixed(0)}`;
  }
  if (state?.goal) {
    readoutGoal.textContent = `${state.goal[0].toFixed(0)}, ${state.goal[1].toFixed(0)}`;
  }
}

function setPickMode(mode) {
  pickMode = mode;
  btnPickStart.classList.toggle("active", mode === "start");
  btnPickGoal.classList.toggle("active", mode === "goal");

  canvasWrap.classList.remove("picking", "picking-start", "picking-goal");
  pickOverlay.classList.add("hidden");
  pickOverlay.setAttribute("aria-hidden", "true");

  if (mode === "start") {
    canvasWrap.classList.add("picking", "picking-start");
    pickOverlay.classList.remove("hidden");
    pickOverlay.setAttribute("aria-hidden", "false");
    pickOverlayText.textContent = "Click the open floor to place START (blue)";
    pickHint.textContent = "Click the 3D floor inside the blue border...";
    pickHint.classList.add("active");
    scene.setPickMode("start", onMapClick);
  } else if (mode === "goal") {
    canvasWrap.classList.add("picking", "picking-goal");
    pickOverlay.classList.remove("hidden");
    pickOverlay.setAttribute("aria-hidden", "false");
    pickOverlayText.textContent = "Click the open floor to place GOAL (green)";
    pickHint.textContent = "Click the 3D floor inside the green border...";
    pickHint.classList.add("active");
    scene.setPickMode("goal", onMapClick);
  } else {
    pickHint.textContent = "Select start and goal, then press Start Demo.";
    pickHint.classList.remove("active");
    scene.setPickMode(null, null);
  }
}

async function onMapClick(type, x, y) {
  try {
    const res = await fetch("/api/set-point", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ point_type: type, x, y }),
    });
    const data = await res.json();

    if (data.ok) {
      scene.clearPath();
      applyState(data.state);
      setPickMode(null);
      const label = data.point_type === "start" ? "Start" : "Goal";
      log(
        `${label} set to (${data.position[0].toFixed(0)}, ${data.position[1].toFixed(0)})`,
        "success"
      );
      if (data.warning) {
        log(data.warning, "error");
        setStatus("Adjust other point", "failed");
      } else if (data.state.path_valid) {
        setStatus("Route Ready", "idle");
        log("Collision-free path planned.", "info");
      } else {
        setStatus("Route Ready", "idle");
      }
    } else {
      log(data.error || "Could not set point", "error");
    }
  } catch (e) {
    log("Failed to set point. Is the server running?", "error");
  }
}

function applyState(state) {
  scene.updateState(state);
  drawLidar(lidarCanvas, state.lidar || [], state.yaw || 0);
  hudDist.textContent = state.dist_to_goal?.toFixed(2) ?? "--";
  hudSteps.textContent = state.steps ?? 0;
  updateReadout(state);
}

async function fetchInitialState() {
  try {
    const res = await fetch("/api/state");
    const state = await res.json();
    applyState(state);
  } catch (e) {
    log("Failed to load initial state", "error");
  }
}

function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  if (ws) ws.close();

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}/ws/simulation`);

  ws.onopen = () => log("Connected to simulation", "info");

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "state") {
      applyState(data.state);
      if (data.reward !== undefined) {
        totalReward += data.reward;
        hudReward.textContent = totalReward.toFixed(1);
      }
    } else if (data.type === "error") {
      log(data.message, "error");
      setButtonsRunning(false);
      btnStart.textContent = "Start Demo";
    } else if (data.type === "done") {
      setButtonsRunning(false);
      setPickMode(null);
      if (data.success) {
        setStatus("Goal Reached!", "success");
        log(`Episode complete! Steps: ${data.steps}`, "success");
      } else {
        setStatus(data.reason || "Failed", "failed");
        log(`Episode ended: ${data.reason}`, "error");
      }
      btnStart.textContent = "Start Demo";
    } else if (data.type === "reset") {
      totalReward = 0;
      hudReward.textContent = "0";
      scene.clearPath();
      applyState(data.state);
      setStatus("Idle", "idle");
      log("Environment reset", "info");
    }
  };

  ws.onclose = () => log("Disconnected", "error");
  ws.onerror = () => log("WebSocket error", "error");
}

pickOverlay.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!pickMode) return;
  const picked = scene.pickAtScreen(e.clientX, e.clientY);
  if (!picked) {
    log("Click on the gray floor area inside the building.", "error");
  }
});

btnStart.addEventListener("click", async () => {
  try {
    const res = await fetch("/api/state");
    const state = await res.json();
    if (!state.path_valid) {
      log("Set valid start and goal points with a clear path first.", "error");
      return;
    }
  } catch (e) {
    log("Could not verify route.", "error");
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) connectWebSocket();
  setTimeout(() => {
    setPickMode(null);
    scene.clearPath();
    ws.send(JSON.stringify({ action: "start" }));
    setButtonsRunning(true);
    btnStart.textContent = "Running...";
    setStatus("Navigating", "running");
    totalReward = 0;
    hudReward.textContent = "0";
    log("Starting navigation along planned path...", "info");
  }, 300);
});

btnReset.addEventListener("click", () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) connectWebSocket();
  setTimeout(() => {
    setPickMode(null);
    ws.send(JSON.stringify({ action: "reset" }));
    setButtonsRunning(false);
    btnStart.textContent = "Start Demo";
    totalReward = 0;
    hudReward.textContent = "0";
    log("Reset requested", "info");
  }, 300);
});

btnPickStart.addEventListener("click", (e) => {
  e.stopPropagation();
  setPickMode(pickMode === "start" ? null : "start");
});

btnPickGoal.addEventListener("click", (e) => {
  e.stopPropagation();
  setPickMode(pickMode === "goal" ? null : "goal");
});

fetchInitialState();
connectWebSocket();
