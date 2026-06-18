import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildApartmentInterior } from "./interior.js?v=10";

const SCENE_VERSION = 11;
const DRONE_FLY_Y = 0;
const FLIGHT_PATH_Y = 1.55;
const PLANNED_PATH_Y = 1.4;
const DRONE_LERP = 0.28;
const DEFAULT_MAP_SIZE = 60;

function pathToVectors(points, y) {
  return points.map((p) => new THREE.Vector3(p[0], y, p[1]));
}

function pathKey(points) {
  if (!points || points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${points.length}:${first[0]},${first[1]}:${last[0]},${last[1]}`;
}

export class DroneScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8dfd0);
    this.scene.fog = new THREE.Fog(0xe8dfd0, 60, 140);

    this._mapW = DEFAULT_MAP_SIZE;
    this._mapH = DEFAULT_MAP_SIZE;

    this.camera = new THREE.PerspectiveCamera(
      52,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      250
    );

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2.12;
    this.controls.minDistance = 8;

    this._fitCameraToMap();

    this._setupLights();
    this.drone = null;
    this.pathLine = null;
    this.plannedLine = null;
    this.startMarker = null;
    this.goalMarker = null;
    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);
    this.floorMesh = null;
    this.pickMode = null;
    this.onPick = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._pickTarget = new THREE.Vector3();
    this._mapLayout = null;

    this.displayPos = new THREE.Vector3();
    this.targetPos = new THREE.Vector3();
    this.displayYaw = 0;
    this.targetYaw = 0;
    this._posInitialized = false;
    this._plannedKey = "";
    this._trailCount = 0;
    this._builtSceneVersion = 0;
    this._buildScheduled = false;
    this._pendingLayout = null;

    window.addEventListener("resize", () => this._onResize());
  }

  setPickMode(mode, callback) {
    this.pickMode = mode;
    this.onPick = callback;
    this.controls.enabled = !mode;
    this.canvas.style.cursor = mode ? "crosshair" : "";
  }

  _snapPickToWalkable(x, z) {
    if (!this._mapLayout) {
      return { x: Math.round(x), z: Math.round(z) };
    }
    const row = Math.round(z);
    const col = Math.round(x);
    const rows = this._mapLayout.length;
    const cols = this._mapLayout[0]?.length ?? 0;
    const walkable = (r, c) =>
      r >= 0 && c >= 0 && r < rows && c < cols && this._mapLayout[r][c] === 0;

    if (walkable(row, col)) {
      return { x: col, z: row };
    }

    for (let radius = 1; radius < 8; radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const nr = row + dr;
          const nc = col + dc;
          if (walkable(nr, nc)) {
            return { x: nc, z: nr };
          }
        }
      }
    }
    return null;
  }

  previewMarker(type, x, z) {
    if (type === "start") {
      if (!this.startMarker) {
        this.startMarker = this._createMarker(0x3b82f6, 0x3b82f6);
        this.scene.add(this.startMarker);
      }
      this.startMarker.position.set(x, 0, z);
    } else if (type === "goal") {
      if (!this.goalMarker) {
        this.goalMarker = this._createMarker(0x22c55e, 0x22c55e);
        this.scene.add(this.goalMarker);
      }
      this.goalMarker.position.set(x, 0, z);
    }
  }

  pickAtScreen(clientX, clientY) {
    if (!this.pickMode || !this.onPick) return false;

    const rect = this.canvas.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return false;
    }

    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    let worldX = null;
    let worldZ = null;

    const hits = this.raycaster.intersectObjects(this.mapGroup.children, true);
    for (const hit of hits) {
      if (hit.point.y > 0.35) continue;
      worldX = hit.point.x;
      worldZ = hit.point.z;
      break;
    }

    if (worldX === null && this.floorMesh) {
      const floorHits = this.raycaster.intersectObject(this.floorMesh, false);
      if (floorHits.length > 0) {
        worldX = floorHits[0].point.x;
        worldZ = floorHits[0].point.z;
      }
    }

    if (worldX === null && this.raycaster.ray.intersectPlane(this._pickPlane, this._pickTarget)) {
      worldX = this._pickTarget.x;
      worldZ = this._pickTarget.z;
    }

    if (worldX === null) return false;

    const maxX = this._mapW - 1;
    const maxZ = this._mapH - 1;
    if (worldX < 0 || worldX > maxX || worldZ < 0 || worldZ > maxZ) {
      return false;
    }

    const snapped = this._snapPickToWalkable(worldX, worldZ);
    if (!snapped) return false;

    this.onPick(this.pickMode, snapped.x, snapped.z);
    return true;
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight(0xfff5e6, 0.55);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffeedd, 1.1);
    sun.position.set(18, 28, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 100;
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xc8d8f0, 0.25);
    fill.position.set(-12, 14, -8);
    this.scene.add(fill);

    const warm = new THREE.HemisphereLight(0xfff8f0, 0x8b7355, 0.35);
    this.scene.add(warm);
  }

  _onResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this._fitCameraToMap();
  }

  buildMap(mapLayout) {
    while (this.mapGroup.children.length) {
      const child = this.mapGroup.children[0];
      this.mapGroup.remove(child);
      child.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    }

    const { floorMesh } = buildApartmentInterior(this.mapGroup, mapLayout, this.scene);
    this.floorMesh = floorMesh;
  }

  _createDrone() {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.12, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.4, roughness: 0.45 })
    );
    body.position.y = 1.35;
    body.castShadow = true;
    group.add(body);

    const armMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.3 });
    const positions = [
      [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3],
    ];
    for (const [ax, az] of positions) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.04), armMat);
      arm.position.set(ax * 0.5, 1.35, az * 0.5);
      arm.rotation.y = Math.atan2(az, ax);
      group.add(arm);

      const prop = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16),
        new THREE.MeshStandardMaterial({ color: 0x64748b, transparent: true, opacity: 0.7 })
      );
      prop.position.set(ax * 0.55, 1.43, az * 0.55);
      group.add(prop);
    }

    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x22c55e })
    );
    led.position.set(0, 1.4, 0.2);
    group.add(led);

    return group;
  }

  _setLinePoints(line, points) {
    const array = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      array[i * 3] = points[i].x;
      array[i * 3 + 1] = points[i].y;
      array[i * 3 + 2] = points[i].z;
    }
    line.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(array, 3)
    );
    line.geometry.computeBoundingSphere();
  }

  _ensurePlannedLine(points, legs) {
    const key = legs?.length
      ? `legs:${legs.length}:${legs.map((l) => pathKey(l)).join("|")}`
      : pathKey(points);
    if (key === this._plannedKey && this.plannedLine) return;
    this._plannedKey = key;

    if (this.plannedLine) {
      this.scene.remove(this.plannedLine);
      this.plannedLine.geometry.dispose();
      this.plannedLine.material.dispose();
      this.plannedLine = null;
    }

    const segmentPoints = [];
    const useDensePath = points && points.length > 2;
    if (useDensePath) {
      const vectors = pathToVectors(points, PLANNED_PATH_Y);
      for (let i = 0; i < vectors.length - 1; i++) {
        segmentPoints.push(vectors[i], vectors[i + 1]);
      }
    } else if (legs && legs.length > 0) {
      for (const leg of legs) {
        if (!leg || leg.length < 2) continue;
        const a = pathToVectors([leg[0]], PLANNED_PATH_Y)[0];
        const b = pathToVectors([leg[1]], PLANNED_PATH_Y)[0];
        segmentPoints.push(a, b);
      }
    } else if (points && points.length > 1) {
      const vectors = pathToVectors(points, PLANNED_PATH_Y);
      for (let i = 0; i < vectors.length - 1; i++) {
        segmentPoints.push(vectors[i], vectors[i + 1]);
      }
    }

    if (segmentPoints.length < 2) return;

    const geometry = new THREE.BufferGeometry().setFromPoints(segmentPoints);
    this.plannedLine = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: 0.9,
      })
    );
    this.scene.add(this.plannedLine);
  }

  _ensureTrailLine(trail, position) {
    if (!trail || trail.length < 2) return;

    const points = trail.map((p) => [p[0], p[1]]);
    if (position) {
      const last = points[points.length - 1];
      const dx = position[0] - last[0];
      const dz = position[1] - last[1];
      if (Math.hypot(dx, dz) > 0.01) {
        points.push([position[0], position[1]]);
      }
    }

    const vectors = pathToVectors(points, FLIGHT_PATH_Y);
    const segmentPoints = [];
    for (let i = 0; i < vectors.length - 1; i++) {
      segmentPoints.push(vectors[i], vectors[i + 1]);
    }

    if (!this.pathLine) {
      const geometry = new THREE.BufferGeometry();
      this.pathLine = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({
          color: 0x60a5fa,
          transparent: true,
          opacity: 0.95,
        })
      );
      this.scene.add(this.pathLine);
    }

    this._setLinePoints(this.pathLine, segmentPoints);
    this._trailCount = segmentPoints.length;
  }

  _createMarker(color, emissive) {
    const group = new THREE.Group();

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.5, 32),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    group.add(ring);

    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 32),
      new THREE.MeshBasicMaterial({
        color: emissive,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.01;
    group.add(glow);

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 })
    );
    pillar.position.y = 0.3;
    group.add(pillar);

    return group;
  }

  _fitCameraToMap() {
    const cx = this._mapW / 2 - 0.5;
    const cz = this._mapH / 2 - 0.5;
    const span = Math.max(this._mapW, this._mapH);
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const dist = (span * 0.52) / Math.tan(fovRad / 2);
    this.controls.target.set(cx, 0, cz);
    this.camera.position.set(cx + dist * 0.5, dist * 0.72, cz + dist * 0.5);
    this.camera.lookAt(cx, 0, cz);
    this.controls.maxDistance = dist * 1.8;
    this.controls.update();
  }

  _scheduleBuildMap(mapLayout) {
    if (this._buildScheduled) {
      this._pendingLayout = mapLayout;
      return;
    }
    this._buildScheduled = true;
    this._pendingLayout = null;
    requestAnimationFrame(() => {
      this.buildMap(mapLayout);
      this._buildScheduled = false;
      if (this._pendingLayout) {
        const layout = this._pendingLayout;
        this._pendingLayout = null;
        this._scheduleBuildMap(layout);
      }
    });
  }

  updateState(state) {
    if (!state) return;

    if (state.grid_size) {
      this._mapW = state.grid_size[0];
      this._mapH = state.grid_size[1];
    } else if (state.map_layout) {
      this._mapH = state.map_layout.length;
      this._mapW = state.map_layout[0]?.length ?? DEFAULT_MAP_SIZE;
    }

    if (
      state.map_layout &&
      (this.mapGroup.children.length === 0 || this._builtSceneVersion !== SCENE_VERSION)
    ) {
      this._builtSceneVersion = SCENE_VERSION;
      this._scheduleBuildMap(state.map_layout);
      this._fitCameraToMap();
    }

    if (state.map_layout) {
      this._mapLayout = state.map_layout;
    }

    if (!this.drone) {
      this.drone = this._createDrone();
      this.scene.add(this.drone);
    }

    if (state.position) {
      this.targetPos.set(state.position[0], DRONE_FLY_Y, state.position[1]);
      this.targetYaw = -(state.yaw || 0);
      if (!this._posInitialized) {
        this.displayPos.copy(this.targetPos);
        this.displayYaw = this.targetYaw;
        this._posInitialized = true;
      }
    }

    if (this.drone) {
      this.drone.position.copy(this.displayPos);
      this.drone.rotation.y = this.displayYaw;
    }

    if (state.start) {
      if (!this.startMarker) {
        this.startMarker = this._createMarker(0x3b82f6, 0x3b82f6);
        this.scene.add(this.startMarker);
      }
      this.startMarker.position.set(state.start[0], 0, state.start[1]);
    }

    if (state.goal) {
      if (!this.goalMarker) {
        this.goalMarker = this._createMarker(0x22c55e, 0x22c55e);
        this.scene.add(this.goalMarker);
      }
      this.goalMarker.position.set(state.goal[0], 0, state.goal[1]);
    }

    if (state.planned_path && state.planned_path.length > 1) {
      this._ensurePlannedLine(state.planned_path, state.planned_legs);
    }

    if (state.path && state.path.length > 1) {
      this._ensureTrailLine(state.path, state.position);
    }
  }

  clearPath() {
    if (this.pathLine) {
      this.scene.remove(this.pathLine);
      this.pathLine.geometry.dispose();
      this.pathLine.material.dispose();
      this.pathLine = null;
    }
    this._trailCount = 0;
  }

  clearPlannedPath() {
    if (this.plannedLine) {
      this.scene.remove(this.plannedLine);
      this.plannedLine.geometry.dispose();
      this.plannedLine.material.dispose();
      this.plannedLine = null;
    }
    this._plannedKey = "";
  }

  resetFlight() {
    this.clearPath();
    this._posInitialized = false;
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (this._posInitialized && this.drone) {
      this.displayPos.lerp(this.targetPos, DRONE_LERP);
      const yawDelta = this.targetYaw - this.displayYaw;
      let wrapped = yawDelta;
      while (wrapped > Math.PI) wrapped -= Math.PI * 2;
      while (wrapped < -Math.PI) wrapped += Math.PI * 2;
      this.displayYaw += wrapped * DRONE_LERP;
      this.drone.position.copy(this.displayPos);
      this.drone.rotation.y = this.displayYaw;
    }

    this.render();
  }
}
