import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildApartmentInterior } from "./interior.js?v=6";

const SCENE_VERSION = 6;
const DRONE_FLY_Y = 0;
const FLIGHT_PATH_Y = 1.55;
const PLANNED_PATH_Y = 1.4;
const DRONE_LERP = 0.28;

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
    this.scene.fog = new THREE.Fog(0xe8dfd0, 35, 70);

    this.camera = new THREE.PerspectiveCamera(
      42,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      120
    );
    this.camera.position.set(26, 22, 26);
    this.camera.lookAt(9.5, 0, 9.5);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 45;
    this.controls.target.set(9.5, 0, 9.5);

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

    if (this.floorMesh) {
      const hits = this.raycaster.intersectObject(this.floorMesh);
      if (hits.length > 0) {
        const p = hits[0].point;
        this.onPick(this.pickMode, p.x, p.z);
        return true;
      }
    }

    if (this.raycaster.ray.intersectPlane(this._pickPlane, this._pickTarget)) {
      const x = this._pickTarget.x;
      const z = this._pickTarget.z;
      if (x >= 0 && x <= 19 && z >= 0 && z <= 19) {
        this.onPick(this.pickMode, x, z);
        return true;
      }
    }
    return false;
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight(0xfff5e6, 0.55);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffeedd, 1.1);
    sun.position.set(18, 28, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 55;
    sun.shadow.camera.left = -22;
    sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 22;
    sun.shadow.camera.bottom = -22;
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
    if (legs && legs.length > 0) {
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

    if (
      state.map_layout &&
      (this.mapGroup.children.length === 0 || this._builtSceneVersion !== SCENE_VERSION)
    ) {
      this._builtSceneVersion = SCENE_VERSION;
      this._scheduleBuildMap(state.map_layout);
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
