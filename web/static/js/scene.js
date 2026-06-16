import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const WALL_HEIGHT = 2.5;
const CRATE_HEIGHT = 0.8;

export class DroneScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a2332);
    this.scene.fog = new THREE.Fog(0x1a2332, 30, 60);

    this.camera = new THREE.PerspectiveCamera(
      50,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      100
    );
    this.camera.position.set(12, 18, 22);
    this.camera.lookAt(10, 0, 10);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2.2;
    this.controls.target.set(10, 0, 10);

    this._setupLights();
    this.drone = null;
    this.pathLine = null;
    this.plannedLine = null;
    this.startMarker = null;
    this.goalMarker = null;
    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);

    window.addEventListener("resize", () => this._onResize());
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(15, 25, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 50;
    sun.shadow.camera.left = -25;
    sun.shadow.camera.right = 25;
    sun.shadow.camera.top = 25;
    sun.shadow.camera.bottom = -25;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x6080c0, 0.3);
    fill.position.set(-10, 10, -5);
    this.scene.add(fill);
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

    const floorGeo = new THREE.PlaneGeometry(mapLayout[0].length, mapLayout.length);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x8899aa,
      roughness: 0.85,
      metalness: 0.05,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(mapLayout[0].length / 2 - 0.5, 0, mapLayout.length / 2 - 0.5);
    floor.receiveShadow = true;
    this.mapGroup.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      roughness: 0.7,
      metalness: 0.1,
    });
    const crateMat = new THREE.MeshStandardMaterial({
      color: 0x92400e,
      roughness: 0.8,
      metalness: 0.05,
    });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2563eb });
    const plantMat = new THREE.MeshStandardMaterial({ color: 0x166534 });

    for (let row = 0; row < mapLayout.length; row++) {
      for (let col = 0; col < mapLayout[row].length; col++) {
        const cell = mapLayout[row][col];
        if (cell === 0) continue;

        const x = col;
        const z = row;

        if (cell === 1) {
          const wall = new THREE.Mesh(
            new THREE.BoxGeometry(1, WALL_HEIGHT, 1),
            wallMat
          );
          wall.position.set(x, WALL_HEIGHT / 2, z);
          wall.castShadow = true;
          wall.receiveShadow = true;
          this.mapGroup.add(wall);

          if (Math.random() < 0.08) {
            const door = new THREE.Mesh(
              new THREE.BoxGeometry(0.6, 1.8, 0.1),
              doorMat
            );
            door.position.set(x, 0.9, z + 0.45);
            this.mapGroup.add(door);
          }
        } else if (cell === 2) {
          const crate = new THREE.Mesh(
            new THREE.BoxGeometry(0.85, CRATE_HEIGHT, 0.85),
            crateMat
          );
          crate.position.set(x, CRATE_HEIGHT / 2, z);
          crate.castShadow = true;
          crate.receiveShadow = true;
          this.mapGroup.add(crate);
        }
      }
    }

    // Decorative plants in free spaces
    const plantPositions = [
      [3, 3], [7, 2], [12, 4], [16, 3], [4, 12], [8, 14],
      [14, 8], [17, 12], [3, 17], [11, 17],
    ];
    for (const [px, pz] of plantPositions) {
      if (mapLayout[pz] && mapLayout[pz][px] === 0) {
        const pot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.18, 0.25, 8),
          new THREE.MeshStandardMaterial({ color: 0x78350f })
        );
        pot.position.set(px, 0.125, pz);
        this.mapGroup.add(pot);

        const plant = new THREE.Mesh(
          new THREE.SphereGeometry(0.3, 8, 8),
          plantMat
        );
        plant.position.set(px, 0.45, pz);
        plant.scale.y = 1.3;
        this.mapGroup.add(plant);
      }
    }
  }

  _createDrone() {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.12, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.3, roughness: 0.5 })
    );
    body.position.y = 1.2;
    body.castShadow = true;
    group.add(body);

    const armMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
    const positions = [
      [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3],
    ];
    for (const [ax, az] of positions) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.04), armMat);
      arm.position.set(ax * 0.5, 1.2, az * 0.5);
      arm.rotation.y = Math.atan2(az, ax);
      group.add(arm);

      const prop = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16),
        new THREE.MeshStandardMaterial({ color: 0x64748b, transparent: true, opacity: 0.7 })
      );
      prop.position.set(ax * 0.55, 1.28, az * 0.55);
      group.add(prop);
    }

    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x22c55e })
    );
    led.position.set(0, 1.25, 0.2);
    group.add(led);

    return group;
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

  updateState(state) {
    if (!state) return;

    if (state.map_layout && this.mapGroup.children.length === 0) {
      this.buildMap(state.map_layout);
    }

    if (!this.drone) {
      this.drone = this._createDrone();
      this.scene.add(this.drone);
    }

    if (state.position) {
      this.drone.position.set(state.position[0], 0, state.position[1]);
      this.drone.rotation.y = -(state.yaw || 0);
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

    if (state.path && state.path.length > 1) {
      if (this.pathLine) {
        this.scene.remove(this.pathLine);
        this.pathLine.geometry.dispose();
        this.pathLine.material.dispose();
      }

      const points = state.path.map((p) => new THREE.Vector3(p[0], 1.0, p[1]));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);

      this.pathLine = new THREE.Line(
        geometry,
        new THREE.LineDashedMaterial({
          color: 0x60a5fa,
          dashSize: 0.3,
          gapSize: 0.15,
        })
      );
      this.pathLine.computeLineDistances();
      this.scene.add(this.pathLine);
    }

    if (state.planned_path && state.planned_path.length > 1) {
      if (this.plannedLine) {
        this.scene.remove(this.plannedLine);
        this.plannedLine.geometry.dispose();
        this.plannedLine.material.dispose();
      }

      const planned = state.planned_path.map(
        (p) => new THREE.Vector3(p[0], 0.05, p[1])
      );
      const geometry = new THREE.BufferGeometry().setFromPoints(planned);
      this.plannedLine = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: 0x22c55e,
          transparent: true,
          opacity: 0.35,
        })
      );
      this.scene.add(this.plannedLine);
    }
  }

  clearPath() {
    if (this.pathLine) {
      this.scene.remove(this.pathLine);
      this.pathLine.geometry.dispose();
      this.pathLine.material.dispose();
      this.pathLine = null;
    }
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.render();
  }
}

export function drawLidar(canvas, lidarData, yaw = 0) {
  if (!canvas || !lidarData) return;
  const ctx = canvas.getContext("2d");
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = canvas.width / 2 - 4;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#2a3a4f";
  ctx.lineWidth = 1;
  for (let r = radius / 3; r <= radius; r += radius / 3) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const n = lidarData.length;
  for (let i = 0; i < n; i++) {
    const angle = yaw + (2 * Math.PI * i) / n - Math.PI / 2;
    const dist = lidarData[i] * radius;
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;

    ctx.strokeStyle = `rgba(59, 130, 246, ${0.3 + lidarData[i] * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#22c55e";
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
}
