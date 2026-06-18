import * as THREE from "three";

export const WALL_HEIGHT = 2.4;
export const FURNITURE_HEIGHT = 0.75;

const PALETTE = {
  wall: 0xf5f0e8,
  wallTrim: 0xe8e0d4,
  wood: 0xb8956a,
  woodDark: 0x8b6914,
  tile: 0xe8e4dc,
  fabric: 0x5c4a3a,
  fabricLight: 0x9a8b7a,
  white: 0xffffff,
  metal: 0xc0c0c0,
  plant: 0x2d5a27,
  plantPot: 0x6b4423,
  counter: 0x3d2b1f,
  countertop: 0x2a2a2a,
  rug: 0x6b6b6b,
  lamp: 0xffd89b,
  door: 0x4a7ab5,
};

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function createWoodTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#c9a66b";
  ctx.fillRect(0, 0, size, size);

  const plankH = 32;
  for (let y = 0; y < size; y += plankH) {
    const shade = 0.92 + (y % (plankH * 2) === 0 ? 0.06 : 0);
    ctx.fillStyle = `rgb(${Math.floor(185 * shade)}, ${Math.floor(140 * shade)}, ${Math.floor(90 * shade)})`;
    ctx.fillRect(0, y, size, plankH - 1);
    ctx.strokeStyle = "rgba(80,50,20,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + plankH);
    ctx.lineTo(size, y + plankH);
    ctx.stroke();
  }

  for (let i = 0; i < 80; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = `rgba(60,40,15,${0.02 + Math.random() * 0.04})`;
    ctx.fillRect(x, y, 2 + Math.random() * 8, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

export function createTileTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ece8e0";
  ctx.fillRect(0, 0, size, size);

  const tile = 32;
  for (let y = 0; y < size; y += tile) {
    for (let x = 0; x < size; x += tile) {
      const v = 0.95 + ((x + y) % (tile * 2) === 0 ? 0.05 : 0);
      ctx.fillStyle = `rgb(${Math.floor(230 * v)}, ${Math.floor(225 * v)}, ${Math.floor(215 * v)})`;
      ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

export function createMaterials() {
  const woodTex = createWoodTexture();
  const tileTex = createTileTexture();

  return {
    wall: new THREE.MeshStandardMaterial({
      color: 0xfff8f0,
      roughness: 0.88,
      metalness: 0.01,
    }),
    wallTrim: new THREE.MeshStandardMaterial({
      color: PALETTE.wallTrim,
      roughness: 0.9,
    }),
    floor: new THREE.MeshStandardMaterial({
      map: woodTex,
      color: 0xd4a96a,
      roughness: 0.72,
      metalness: 0.04,
    }),
    tile: new THREE.MeshStandardMaterial({
      map: tileTex,
      roughness: 0.6,
      metalness: 0.02,
    }),
    fabric: new THREE.MeshStandardMaterial({
      color: PALETTE.fabric,
      roughness: 0.95,
    }),
    fabricLight: new THREE.MeshStandardMaterial({
      color: PALETTE.fabricLight,
      roughness: 0.95,
    }),
    wood: new THREE.MeshStandardMaterial({
      color: PALETTE.woodDark,
      roughness: 0.7,
    }),
    white: new THREE.MeshStandardMaterial({
      color: PALETTE.white,
      roughness: 0.5,
    }),
    counter: new THREE.MeshStandardMaterial({
      color: PALETTE.counter,
      roughness: 0.6,
    }),
    countertop: new THREE.MeshStandardMaterial({
      color: PALETTE.countertop,
      roughness: 0.3,
      metalness: 0.1,
    }),
    plant: new THREE.MeshStandardMaterial({ color: PALETTE.plant, roughness: 0.9 }),
    pot: new THREE.MeshStandardMaterial({ color: PALETTE.plantPot, roughness: 0.85 }),
    rug: new THREE.MeshStandardMaterial({
      color: PALETTE.rug,
      roughness: 1.0,
    }),
    door: new THREE.MeshStandardMaterial({ color: PALETTE.door, roughness: 0.6 }),
    metal: new THREE.MeshStandardMaterial({
      color: PALETTE.metal,
      roughness: 0.35,
      metalness: 0.7,
    }),
  };
}

function addMesh(group, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export function createBed(mats) {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(1.6, 0.35, 2.0), mats.wood, 0, 0.2, 0);
  addMesh(g, new THREE.BoxGeometry(1.5, 0.2, 1.9), mats.fabricLight, 0, 0.45, 0);
  addMesh(g, new THREE.BoxGeometry(1.5, 0.12, 0.35), mats.white, 0, 0.58, -0.75);
  addMesh(g, new THREE.BoxGeometry(0.35, 0.45, 0.35), mats.wood, -0.75, 0.35, -0.75);
  addMesh(g, new THREE.BoxGeometry(0.35, 0.45, 0.35), mats.wood, 0.75, 0.35, -0.75);
  return g;
}

export function createSofa(mats) {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(2.2, 0.4, 0.9), mats.fabric, 0, 0.25, 0);
  addMesh(g, new THREE.BoxGeometry(2.2, 0.55, 0.25), mats.fabric, 0, 0.55, -0.32);
  addMesh(g, new THREE.BoxGeometry(0.25, 0.5, 0.9), mats.fabric, -0.98, 0.45, 0);
  addMesh(g, new THREE.BoxGeometry(0.25, 0.5, 0.9), mats.fabric, 0.98, 0.45, 0);
  return g;
}

export function createDiningSet(mats) {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(1.4, 0.06, 0.8), mats.wood, 0, 0.75, 0);
  for (const [cx, cz] of [
    [-0.5, -0.25],
    [0.5, -0.25],
    [-0.5, 0.25],
    [0.5, 0.25],
    [0, -0.45],
    [0, 0.45],
  ]) {
    addMesh(g, new THREE.BoxGeometry(0.35, 0.7, 0.35), mats.fabricLight, cx, 0.4, cz);
  }
  return g;
}

export function createDesk(mats) {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(1.0, 0.05, 0.55), mats.wood, 0, 0.72, 0);
  for (const [dx, dz] of [
    [-0.4, -0.2],
    [0.4, -0.2],
    [-0.4, 0.2],
    [0.4, 0.2],
  ]) {
    addMesh(g, new THREE.BoxGeometry(0.06, 0.72, 0.06), mats.wood, dx, 0.36, dz);
  }
  addMesh(g, new THREE.BoxGeometry(0.4, 0.35, 0.06), mats.fabricLight, 0, 0.5, 0.2);
  return g;
}

export function createKitchen(mats) {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(2.5, 0.9, 0.6), mats.counter, 0, 0.45, 0);
  addMesh(g, new THREE.BoxGeometry(2.5, 0.05, 0.62), mats.countertop, 0, 0.92, 0);
  addMesh(g, new THREE.BoxGeometry(0.7, 1.8, 0.65), mats.metal, -0.85, 0.9, -0.1);
  addMesh(g, new THREE.BoxGeometry(0.55, 0.55, 0.55), mats.metal, 0.9, 0.55, 0);
  return g;
}

export function createBathFixture(mats) {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(0.5, 0.4, 0.4), mats.white, 0, 0.25, 0);
  addMesh(g, new THREE.BoxGeometry(0.35, 0.15, 0.25), mats.white, 0.5, 0.2, 0);
  return g;
}

export function createShower(mats) {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(0.05, 1.8, 0.9), mats.metal, -0.4, 0.9, 0);
  addMesh(g, new THREE.BoxGeometry(0.9, 0.05, 0.05), mats.metal, 0, 1.8, 0);
  addMesh(g, new THREE.BoxGeometry(0.9, 0.05, 0.05), mats.metal, 0, 0.05, 0);
  return g;
}

export function createWardrobe(mats) {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(0.9, 1.6, 0.5), mats.wood, 0, 0.8, 0);
  addMesh(g, new THREE.BoxGeometry(0.02, 1.5, 0.02), mats.metal, 0, 0.8, 0.26);
  return g;
}

export function createCoffeeTable(mats) {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(0.9, 0.06, 0.5), mats.wood, 0, 0.3, 0);
  for (const [tx, tz] of [
    [-0.35, -0.18],
    [0.35, -0.18],
    [-0.35, 0.18],
    [0.35, 0.18],
  ]) {
    addMesh(g, new THREE.BoxGeometry(0.06, 0.3, 0.06), mats.wood, tx, 0.15, tz);
  }
  return g;
}

export function createPlant(mats) {
  const g = new THREE.Group();
  addMesh(g, new THREE.CylinderGeometry(0.12, 0.14, 0.2, 10), mats.pot, 0, 0.1, 0);
  addMesh(g, new THREE.SphereGeometry(0.22, 10, 10), mats.plant, 0, 0.38, 0);
  addMesh(g, new THREE.SphereGeometry(0.15, 8, 8), mats.plant, 0.12, 0.48, 0.08);
  return g;
}

export function createLamp(mats) {
  const g = new THREE.Group();
  addMesh(g, new THREE.CylinderGeometry(0.04, 0.06, 0.5, 8), mats.metal, 0, 0.25, 0);
  const shade = addMesh(
    g,
    new THREE.CylinderGeometry(0.15, 0.2, 0.2, 12, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xfff5e0,
      emissive: 0xffd89b,
      emissiveIntensity: 0.4,
      side: THREE.DoubleSide,
      roughness: 0.9,
    }),
    0,
    0.55,
    0
  );
  shade.castShadow = false;
  return g;
}

export function createRug(mats, w = 2.5, d = 1.8) {
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    mats.rug
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.02;
  rug.receiveShadow = true;
  return rug;
}

export function createPicture(mats) {
  const g = new THREE.Group();
  addMesh(g, new THREE.BoxGeometry(0.6, 0.45, 0.04), mats.wood, 0, 0, 0);
  addMesh(
    g,
    new THREE.BoxGeometry(0.5, 0.35, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x7a9eb5, roughness: 0.8 }),
    0,
    0,
    0.03
  );
  return g;
}

const FURNITURE_BUILDERS = {
  bed: createBed,
  sofa: createSofa,
  dining: createDiningSet,
  desk: createDesk,
  kitchen: createKitchen,
  bath: createBathFixture,
  shower: createShower,
  wardrobe: createWardrobe,
  table: createCoffeeTable,
  plant: createPlant,
  lamp: createLamp,
};

const BATHROOM_ZONES = [
  { col: [1, 4], row: [1, 4] },
  { col: [15, 18], row: [1, 4] },
];

const DECORATIONS = [
  { type: "bed", x: 2.5, z: 2.5, rot: 0 },
  { type: "lamp", x: 1.5, z: 1.5, rot: 0 },
  { type: "bed", x: 16.5, z: 2.5, rot: Math.PI },
  { type: "lamp", x: 17.5, z: 1.5, rot: 0 },
  { type: "kitchen", x: 9.5, z: 2.5, rot: 0 },
  { type: "dining", x: 12, z: 7, rot: Math.PI / 2 },
  { type: "sofa", x: 7, z: 12, rot: Math.PI / 2 },
  { type: "table", x: 7, z: 14, rot: 0 },
  { type: "bed", x: 2.5, z: 16.5, rot: 0 },
  { type: "desk", x: 3.5, z: 15, rot: -Math.PI / 4 },
  { type: "bed", x: 16.5, z: 16.5, rot: Math.PI },
  { type: "wardrobe", x: 17.5, z: 15, rot: 0 },
  { type: "bath", x: 2.5, z: 3.5, rot: 0 },
  { type: "shower", x: 3.5, z: 1.5, rot: 0 },
  { type: "bath", x: 16.5, z: 3.5, rot: 0 },
  { type: "plant", x: 5, z: 5, rot: 0 },
  { type: "plant", x: 14, z: 5, rot: 0 },
  { type: "plant", x: 5, z: 14, rot: 0 },
  { type: "plant", x: 14, z: 14, rot: 0 },
  { type: "plant", x: 10, z: 10, rot: 0 },
  { type: "lamp", x: 12, z: 12, rot: 0 },
  { type: "lamp", x: 6, z: 6, rot: 0 },
];

const RUGS = [
  { x: 7, z: 13, w: 3.5, d: 2.5 },
  { x: 2.5, z: 2.5, w: 2.2, d: 2.0 },
  { x: 16.5, z: 2.5, w: 2.2, d: 2.0 },
  { x: 12, z: 7, w: 2.0, d: 1.6 },
];

const ROOM_LIGHTS = [
  { x: 2.5, z: 2.5 },
  { x: 16.5, z: 2.5 },
  { x: 9.5, z: 2.5 },
  { x: 7, z: 12 },
  { x: 12, z: 7 },
  { x: 2.5, z: 16.5 },
  { x: 16.5, z: 16.5 },
  { x: 10, z: 10 },
];

const OBSTACLE_FURNITURE = ["wardrobe", "table", "desk", "plant", "table", "plant", "wardrobe", "table"];

function isWalkable(mapLayout, col, row) {
  if (!mapLayout[row] || mapLayout[row][col] === undefined) return false;
  return mapLayout[row][col] === 0;
}

function isBathroom(col, row) {
  return BATHROOM_ZONES.some(
    (z) => col >= z.col[0] && col <= z.col[1] && row >= z.row[0] && row <= z.row[1]
  );
}

export function buildApartmentInterior(mapGroup, mapLayout, scene) {
  const mats = createMaterials();
  const rows = mapLayout.length;
  const cols = mapLayout[0].length;
  const rand = seeded(42);

  const floorGeo = new THREE.PlaneGeometry(cols, rows);
  const floor = new THREE.Mesh(floorGeo, mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cols / 2 - 0.5, 0, rows / 2 - 0.5);
  floor.receiveShadow = true;
  mapGroup.add(floor);

  for (const zone of BATHROOM_ZONES) {
    const w = zone.col[1] - zone.col[0] + 1;
    const h = zone.row[1] - zone.row[0] + 1;
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mats.tile);
    tile.rotation.x = -Math.PI / 2;
    tile.position.set(
      (zone.col[0] + zone.col[1]) / 2,
      0.01,
      (zone.row[0] + zone.row[1]) / 2
    );
    tile.receiveShadow = true;
    mapGroup.add(tile);
  }

  const doorPositions = new Set([
    "5,1", "5,2", "13,1", "14,1", "3,5", "7,5", "11,5", "15,5",
    "5,7", "5,13", "9,5", "9,8", "9,12", "5,15", "15,8", "15,13",
  ]);

  let obstacleIdx = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = mapLayout[row][col];
      if (cell === 0) continue;

      const x = col;
      const z = row;

      if (cell === 1) {
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(1, WALL_HEIGHT, 1),
          mats.wall
        );
        wall.position.set(x, WALL_HEIGHT / 2, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        mapGroup.add(wall);

        const trim = new THREE.Mesh(
          new THREE.BoxGeometry(1.02, 0.08, 1.02),
          mats.wallTrim
        );
        trim.position.set(x, 0.04, z);
        mapGroup.add(trim);

        if (doorPositions.has(`${col},${row}`) || rand() < 0.04) {
          const door = new THREE.Mesh(
            new THREE.BoxGeometry(0.65, 1.9, 0.08),
            mats.door
          );
          door.position.set(x, 0.95, z + 0.46);
          mapGroup.add(door);
        }

        if (rand() < 0.06 && row > 1 && row < rows - 2) {
          const pic = createPicture(mats);
          pic.position.set(x, 1.4, z + 0.48);
          mapGroup.add(pic);
        }
      } else if (cell === 2) {
        const type = OBSTACLE_FURNITURE[obstacleIdx % OBSTACLE_FURNITURE.length];
        obstacleIdx++;
        const builder = FURNITURE_BUILDERS[type];
        if (builder) {
          const item = builder(mats);
          item.position.set(x, 0, z);
          mapGroup.add(item);
        }
      }
    }
  }

  for (const rug of RUGS) {
    const col = Math.round(rug.x);
    const row = Math.round(rug.z);
    if (isWalkable(mapLayout, col, row)) {
      const r = createRug(mats, rug.w, rug.d);
      r.position.set(rug.x, 0.02, rug.z);
      mapGroup.add(r);
    }
  }

  for (const dec of DECORATIONS) {
    const col = Math.round(dec.x);
    const row = Math.round(dec.z);
    if (!isWalkable(mapLayout, col, row)) continue;

    const builder = FURNITURE_BUILDERS[dec.type];
    if (!builder) continue;
    const item = builder(mats);
    item.position.set(dec.x, 0, dec.z);
    item.rotation.y = dec.rot || 0;
    mapGroup.add(item);
  }

  for (const light of ROOM_LIGHTS) {
    const col = Math.round(light.x);
    const row = Math.round(light.z);
    if (!isWalkable(mapLayout, col, row) && !isBathroom(col, row)) continue;

    const pl = new THREE.PointLight(0xffd89b, 0.35, 8);
    pl.position.set(light.x, 2.0, light.z);
    pl.castShadow = false;
    mapGroup.add(pl);
  }

  const kitchenGlow = new THREE.PointLight(0xffb366, 0.25, 6);
  kitchenGlow.position.set(9.5, 1.2, 2.8);
  mapGroup.add(kitchenGlow);

  return { floorMesh: floor, mats };
}
