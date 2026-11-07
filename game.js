import * as THREE from 'three';

(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const shell = document.querySelector('#shell');
  const ui = Object.fromEntries(
    'overlay title message eyebrow hint start hearts keyCount questName questText pause toast'
      .split(' ').map((id) => [id, document.getElementById(id)])
  );
  ui.coins = document.getElementById('coinCount');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x9caeaa);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9aaca7);
  scene.fog = new THREE.Fog(0x9aaca7, 42, 105);
  const camera = new THREE.OrthographicCamera(-16, 16, 9, -9, 0.1, 180);
  const hemi = new THREE.HemisphereLight(0xd5e8ff, 0x4c493b, 2.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe6bd, 3.2);
  sun.position.set(-18, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 85;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);

  const SCALE = 30;
  const REGION = 720;
  const MAP_H = 440;
  const REGIONS = [
    { name: 'Verdant Reach', boss: 'Mossfang', ground: 0x687950, tile: 0x77865a, accent: 0xa2ad6c, sky: 0x9aaca7, leaf: 0x386047 },
    { name: 'Frostveil Peaks', boss: 'The Glacier Warden', ground: 0x718b98, tile: 0x92aab0, accent: 0xc4d8d8, sky: 0x9bb7c8, leaf: 0xb9d2d7 },
    { name: 'Sunken Coast', boss: 'Tidecaller', ground: 0x3e7270, tile: 0x568b82, accent: 0x9bc7a0, sky: 0x82b9b8, leaf: 0x2d6962 },
    { name: 'Ashen March', boss: 'Cindermaw', ground: 0x77503e, tile: 0x956346, accent: 0xc68a5c, sky: 0xc29379, leaf: 0x7f4739 },
    { name: 'Starfall Crown', boss: 'The Void King', ground: 0x514b72, tile: 0x6a6090, accent: 0xb2a4d1, sky: 0xaaa1c7, leaf: 0x61518b },
  ];
  const WORLD = REGION * REGIONS.length;
  const input = { left: false, right: false, up: false, down: false, attack: false, jump: false, jumpPressed: false, stickX: 0, stickY: 0 };
  const rightAxis = new THREE.Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2);
  const depthAxis = new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2);
  const temp = new THREE.Object3D();
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const worldAt = (x, y, height = 0) => new THREE.Vector3(
    (x * rightAxis.x + y * depthAxis.x) / SCALE,
    height,
    (x * rightAxis.z + y * depthAxis.z) / SCALE,
  );
  const mat = (color, roughness = 0.82, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  const mats = {
    bark: mat(0x584332), darkBark: mat(0x392d2b), leaf: mat(0x41694a), leafLight: mat(0x60804d), snow: mat(0xd5e4df),
    rock: mat(0x656c69), gold: mat(0xffc653, 0.3, { metalness: 0.48, emissive: 0x6e3c04, emissiveIntensity: 0.35 }),
    heroCoat: mat(0xb6493c), heroTrim: mat(0xe4b76f), skin: mat(0xc98d65), hair: mat(0x44332f), leather: mat(0x443b37), steel: mat(0xdde2df, 0.28, { metalness: 0.72 }),
    slime: mat(0x7ca564, 0.38, { emissive: 0x173a1b, emissiveIntensity: 0.16 }), eye: mat(0xf3e9b4, 0.3, { emissive: 0xc7a950, emissiveIntensity: 0.24 }),
  };
  const shared = {
    trunk: new THREE.CylinderGeometry(0.13, 0.2, 1.3, 7),
    foliage: new THREE.ConeGeometry(0.78, 1.25, 7),
    rock: new THREE.DodecahedronGeometry(0.55, 0),
    sphere: new THREE.SphereGeometry(1, 12, 9),
    box: new THREE.BoxGeometry(1, 1, 1),
  };
  const colliders = [];
  const worldGroup = new THREE.Group();
  const objectGroup = new THREE.Group();
  const actorGroup = new THREE.Group();
  scene.add(worldGroup, objectGroup, actorGroup);

  let width = 960, height = 540, screen = 'title', last = performance.now(), elapsed = 0, toastTimer = 0;
  let hero, enemies, coins, checkpoints, gates, bosses, particles, keysFound = 0;
  const random01 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const regionAt = (x) => Math.max(0, Math.min(REGIONS.length - 1, Math.floor(x / REGION)));

  function resize() {
    const rect = shell.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    const viewHeight = width < 600 ? (height > width * 1.2 ? 16 : 20) : 18;
    camera.left = -viewHeight * (width / height) / 2;
    camera.right = viewHeight * (width / height) / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  function addMesh(parent, geometry, material, position, options = {}) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = options.castShadow ?? true;
    mesh.receiveShadow = options.receiveShadow ?? true;
    if (options.scale) mesh.scale.set(...options.scale);
    if (options.rotation) mesh.rotation.set(...options.rotation);
    parent.add(mesh);
    return mesh;
  }

  function buildEnvironment() {
    const marginX = 900, marginY = 600;
    const groundWidth = (WORLD + marginX * 2) / SCALE;
    const groundHeight = (MAP_H + marginY * 2) / SCALE;
    const groundGeo = new THREE.PlaneGeometry(groundWidth, groundHeight, 300, 96);
    const positions = groundGeo.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const biomeColors = REGIONS.map((region) => new THREE.Color(region.ground));
    for (let i = 0; i < positions.count; i++) {
      const x = WORLD / 2 + positions.getX(i) * SCALE;
      const boundary = Math.round(x / REGION) * REGION;
      const left = Math.max(0, Math.min(REGIONS.length - 1, Math.floor((boundary - 1) / REGION)));
      const right = Math.max(0, Math.min(REGIONS.length - 1, left + 1));
      let color = biomeColors[regionAt(Math.max(0, Math.min(WORLD - 1, x)))].clone();
      if (boundary > 0 && boundary < WORLD && Math.abs(x - boundary) < 110) {
        const t = THREE.MathUtils.smoothstep(x, boundary - 110, boundary + 110);
        color = biomeColors[left].clone().lerp(biomeColors[right], t);
      }
      const variation = 0.88 + random01(i * 19 + 3) * 0.2;
      color.multiplyScalar(variation);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const groundMaterial = new THREE.MeshStandardMaterial({ map: createGroundTexture(), vertexColors: true, roughness: 1 });
    const ground = new THREE.Mesh(groundGeo, groundMaterial);
    ground.position.copy(worldAt(WORLD / 2, MAP_H / 2, -0.12));
    ground.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
    ground.receiveShadow = true;
    ground.frustumCulled = false;
    worldGroup.add(ground);
    buildTrail();
    buildTreesAndRocks();
    buildGroundCover();
    buildDecorativeLights();
  }

  function createGroundTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const context = canvas.getContext('2d');
    context.fillStyle = '#f2f0e6';
    context.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 18000; i++) {
      const shade = 110 + Math.floor(random01(i + 318) * 120);
      const alpha = 0.025 + random01(i + 619) * 0.09;
      const size = 1 + random01(i + 817) * 3;
      context.fillStyle = `rgba(${shade},${shade},${shade},${alpha})`;
      context.fillRect(random01(i + 101) * 512, random01(i + 203) * 512, size, size);
    }
    for (let i = 0; i < 140; i++) {
      const shade = 100 + Math.floor(random01(i + 911) * 110);
      context.fillStyle = `rgba(${shade},${shade},${shade},0.055)`;
      context.beginPath();
      context.ellipse(random01(i + 301) * 512, random01(i + 401) * 512, 4 + random01(i + 501) * 17, 3 + random01(i + 601) * 12, random01(i + 701) * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(28, 12);
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  function trailCenter(x) {
    return MAP_H / 2 + Math.sin(x / 275) * 32 + Math.sin(x / 107) * 11;
  }

  function buildTrail() {
    const segments = Math.ceil(WORLD / 8);
    const vertices = new Float32Array((segments + 1) * 2 * 3);
    const colors = new Float32Array((segments + 1) * 2 * 3);
    const indices = [];
    const edgeColor = new THREE.Color(0x806344), centerColor = new THREE.Color(0xb19361);
    for (let i = 0; i <= segments; i++) {
      const x = WORLD * i / segments;
      const center = trailCenter(x);
      const width = 102 + Math.sin(x / 145) * 13 + (random01(i + 153) - 0.5) * 10;
      for (let side = 0; side < 2; side++) {
        const edge = side === 0 ? -1 : 1;
        const irregular = (random01(i * 2 + side + 440) - 0.5) * 10;
        const y = center + edge * (width / 2 + irregular);
        const p = worldAt(x, y, -0.045);
        const index = (i * 2 + side) * 3;
        vertices[index] = p.x; vertices[index + 1] = p.y; vertices[index + 2] = p.z;
        const color = edgeColor.clone().lerp(centerColor, 0.28 + random01(i * 5 + side + 67) * 0.54);
        colors[index] = color.r; colors[index + 1] = color.g; colors[index + 2] = color.b;
      }
      if (i < segments) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const trail = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
    trail.frustumCulled = false;
    worldGroup.add(trail);

    const stones = new THREE.InstancedMesh(shared.rock, mats.rock, 520);
    for (let i = 0; i < 520; i++) {
      const x = random01(i + 128) * WORLD;
      const width = 102 + Math.sin(x / 145) * 13;
      const y = trailCenter(x) + (random01(i + 228) - 0.5) * width * 0.86;
      temp.position.copy(worldAt(x, y, -0.005));
      temp.rotation.set(random01(i + 328) * 0.18, random01(i + 428) * Math.PI, random01(i + 528) * 0.18);
      temp.scale.set(0.12 + random01(i + 628) * 0.28, 0.025 + random01(i + 728) * 0.04, 0.08 + random01(i + 828) * 0.2);
      temp.updateMatrix();
      stones.setMatrixAt(i, temp.matrix);
      stones.setColorAt(i, new THREE.Color([0x8e816b, 0xb0a184, 0x766c5b][i % 3]).multiplyScalar(0.8 + random01(i + 928) * 0.4));
    }
    stones.instanceMatrix.needsUpdate = true;
    if (stones.instanceColor) stones.instanceColor.needsUpdate = true;
    stones.castShadow = false;
    stones.receiveShadow = true;
    worldGroup.add(stones);
  }

  function buildGroundCover() {
    const grassGeo = new THREE.ConeGeometry(0.085, 0.38, 4);
    const grass = new THREE.InstancedMesh(grassGeo, mat(0x72804b), 1100);
    for (let i = 0; i < 1100; i++) {
      const x = random01(i + 2031) * WORLD;
      let y = 18 + random01(i + 2131) * (MAP_H - 36);
      if (Math.abs(y - trailCenter(x)) < 78) y += y < MAP_H / 2 ? -75 : 75;
      y = Math.max(10, Math.min(MAP_H - 10, y));
      temp.position.copy(worldAt(x, y, 0.025));
      temp.rotation.set(0, random01(i + 2231) * Math.PI, (random01(i + 2331) - 0.5) * 0.28);
      const scale = 0.35 + random01(i + 2431) * 0.9;
      temp.scale.set(scale, scale, scale);
      temp.updateMatrix();
      grass.setMatrixAt(i, temp.matrix);
      grass.setColorAt(i, new THREE.Color([0x647849, 0x899052, 0x9a965b, 0x536d43][i % 4]).multiplyScalar(0.8 + random01(i + 2531) * 0.35));
    }
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    grass.castShadow = false;
    grass.receiveShadow = true;
    worldGroup.add(grass);
  }

  function buildTreesAndRocks() {
    for (let regionIndex = 0; regionIndex < REGIONS.length; regionIndex++) {
      for (let i = 0; i < 16; i++) {
        const seed = regionIndex * 17 + i;
        const x = regionIndex * REGION + 34 + random01(seed + 20) * (REGION - 68);
        const edge = random01(seed + 21) < 0.5 ? 0 : 1;
        const y = edge === 0
          ? 24 + random01(seed + 22) * (MAP_H / 2 - 96)
          : MAP_H / 2 + 72 + random01(seed + 22) * (MAP_H / 2 - 96);
        const region = regionAt(x), g = new THREE.Group();
        const p = worldAt(x, y);
        g.position.set(p.x, 0, p.z);
        g.rotation.y = Math.PI / 4;
        const s = 0.82 + random01(seed + 23) * 0.48;
        addMesh(g, shared.trunk, mats.bark, v3(0, 0.66 * s, 0), { scale: [s, s, s] });
        const leafMat = region === 1 ? mats.snow : mat(REGIONS[region].leaf);
        for (let layer = 0; layer < 3; layer++) {
          addMesh(g, shared.foliage, leafMat, v3(0, (1.25 + layer * 0.5) * s, 0), { scale: [s * (1.15 - layer * 0.12), s, s * (1.15 - layer * 0.12)] });
        }
        worldGroup.add(g);
        colliders.push({ x, y, r: 22 * s });
      }
    }
    for (let i = 0; i < 34; i++) {
      const region = i % REGIONS.length;
      const x = region * REGION + 80 + random01(i + 100) * (REGION - 160);
      const y = 55 + random01(i + 700) * (MAP_H - 110);
      if (Math.abs(y - MAP_H / 2) < 70) continue;
      const p = worldAt(x, y, 0.18);
      const rock = addMesh(worldGroup, shared.rock, mat(i % 3 ? 0x68706a : 0x817c70), p, { scale: [0.55 + random01(i) * 0.6, 0.35 + random01(i + 2) * 0.35, 0.48 + random01(i + 3) * 0.5], rotation: [random01(i + 4), random01(i + 5), random01(i + 6)] });
      rock.castShadow = true;
      colliders.push({ x, y, r: 17 });
    }
  }

  function buildDecorativeLights() {
    const geo = new THREE.SphereGeometry(0.045, 8, 6);
    const glow = new THREE.MeshBasicMaterial({ color: 0xffd98b, transparent: true, opacity: 0.65 });
    const count = 18;
    const lights = new THREE.InstancedMesh(geo, glow, count);
    for (let i = 0; i < count; i++) {
      const x = random01(i + 85) * WORLD, y = 70 + random01(i + 45) * 300;
      temp.position.copy(worldAt(x, y, 0.6 + random01(i) * 1.2));
      temp.updateMatrix(); lights.setMatrixAt(i, temp.matrix);
    }
    worldGroup.add(lights);
  }

  buildEnvironment();

  function createHeroModel() {
    const root = new THREE.Group();
    const torsoPivot = new THREE.Group();
    torsoPivot.position.set(0, 0.78, 0);
    root.add(torsoPivot);
    const torso = addMesh(torsoPivot, new THREE.CapsuleGeometry(0.27, 0.48, 4, 8), mats.heroCoat, v3(0, 0.12, 0));
    torso.scale.set(0.82, 1, 0.58);
    addMesh(torsoPivot, shared.box, mats.heroTrim, v3(0, 0.13, 0.16), { scale: [0.09, 0.6, 0.04], rotation: [0, 0, -0.12] });

    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.69, 0);
    torsoPivot.add(headPivot);
    addMesh(headPivot, shared.sphere, mats.skin, v3(0, 0.11, 0), { scale: [0.23, 0.25, 0.22] });
    addMesh(headPivot, shared.sphere, mats.hair, v3(0, 0.26, -0.035), { scale: [0.245, 0.17, 0.235] });

    const legs = [], feet = [], arms = [];
    for (const side of [-1, 1]) {
      const legPivot = new THREE.Group();
      legPivot.position.set(side * 0.12, 0.58, 0.015);
      root.add(legPivot);
      addMesh(legPivot, new THREE.CapsuleGeometry(0.105, 0.32, 3, 6), mats.leather, v3(0, -0.22, 0));
      const foot = addMesh(legPivot, shared.box, mats.heroTrim, v3(0, -0.49, 0.09), { scale: [0.2, 0.12, 0.34] });
      legs.push(legPivot);
      feet.push(foot);

      const armPivot = new THREE.Group();
      armPivot.position.set(side * 0.29, 0.42, 0);
      torsoPivot.add(armPivot);
      addMesh(armPivot, new THREE.CapsuleGeometry(0.09, 0.34, 3, 6), mats.heroCoat, v3(side * 0.025, -0.2, 0));
      addMesh(armPivot, new THREE.SphereGeometry(0.085, 8, 6), mats.skin, v3(0, -0.4, 0.025));
      arms.push(armPivot);
    }

    const swordPivot = new THREE.Group();
    swordPivot.position.set(0, -0.42, 0.04);
    arms[1].add(swordPivot);
    addMesh(swordPivot, new THREE.BoxGeometry(0.09, 0.56, 0.055), mats.steel, v3(0, 0.3, 0));
    addMesh(swordPivot, new THREE.BoxGeometry(0.28, 0.07, 0.09), mats.heroTrim, v3(0, 0.02, 0));
    addMesh(swordPivot, new THREE.CylinderGeometry(0.045, 0.055, 0.22, 7), mats.leather, v3(0, -0.13, 0));
    return { root, torsoPivot, torso, headPivot, legs, feet, arms, swordPivot };
  }

  function createSlimeModel(isBoss = false, region = 0) {
    const root = new THREE.Group();
    const color = isBoss ? [0x689b60, 0x9bcbd2, 0x4c9993, 0xd8794b, 0x9b75c5][region] : 0x6f9c68;
    const bodyMat = mat(color, 0.35, { emissive: color, emissiveIntensity: isBoss ? 0.12 : 0.08 });
    const size = isBoss ? 0.76 : 0.43;
    const body = addMesh(root, new THREE.SphereGeometry(1, 16, 12), bodyMat, v3(0, size * 0.75, 0), { scale: [size, size * 0.82, size * 0.72] });
    body.scale.y *= 0.78;
    const eyeGeo = new THREE.SphereGeometry(isBoss ? 0.075 : 0.045, 8, 6);
    for (const side of [-1, 1]) {
      addMesh(root, eyeGeo, mats.eye, v3(side * size * 0.31, size * 0.83, size * 0.59));
      addMesh(root, new THREE.SphereGeometry(0.022, 6, 5), mats.leather, v3(side * size * 0.31, size * 0.82, size * 0.64));
    }
    if (isBoss) {
      for (const side of [-1, 1]) addMesh(root, new THREE.ConeGeometry(0.14, 0.45, 6), mat(0xe4c886), v3(side * 0.48, 1.15, 0), { rotation: [0, 0, side * -0.45] });
    }
    return { root, body };
  }

  function createGate(gate) {
    const group = new THREE.Group();
    const stone = mat(0x293b45), trim = mat(gate.open ? 0xffd277 : 0x9f9070, 0.35, { emissive: gate.open ? 0x9b5b13 : 0x17130d, emissiveIntensity: 0.45 });
    addMesh(group, shared.box, stone, v3(-0.9, 1.15, 0), { scale: [0.28, 2.3, 0.38] });
    addMesh(group, shared.box, stone, v3(0.9, 1.15, 0), { scale: [0.28, 2.3, 0.38] });
    addMesh(group, shared.box, trim, v3(0, 2.32, 0), { scale: [2.05, 0.24, 0.42] });
    const portal = addMesh(group, new THREE.PlaneGeometry(1.45, 1.85), mat(gate.open ? 0xffcf72 : 0x4b6570, 0.3, { transparent: true, opacity: gate.open ? 0.55 : 0.24, emissive: gate.open ? 0x8e5719 : 0x10191d, emissiveIntensity: 0.8, side: THREE.DoubleSide }), v3(0, 1.08, 0.24));
    portal.userData.portal = true;
    const p = worldAt(gate.x, gate.y);
    group.position.set(p.x, 0, p.z);
    group.rotation.y = Math.PI / 4;
    gate.group = group;
    gate.portal = portal;
    objectGroup.add(group);
  }

  function createCheckpoint(cp) {
    const group = new THREE.Group();
    addMesh(group, new THREE.CylinderGeometry(0.055, 0.08, 0.95, 7), mats.bark, v3(0, 0.48, 0));
    const flame = addMesh(group, new THREE.OctahedronGeometry(0.19, 0), mat(0xffcb72, 0.25, { emissive: 0xff6e1d, emissiveIntensity: 1.4 }), v3(0, 1.08, 0));
    const p = worldAt(cp.x, cp.y);
    group.position.set(p.x, 0, p.z);
    objectGroup.add(group);
    cp.group = group;
    cp.flame = flame;
  }

  function createCoin(coin) {
    const group = new THREE.Group();
    addMesh(group, new THREE.TorusGeometry(0.2, 0.065, 8, 16), mats.gold, v3(0, 0, 0), { rotation: [Math.PI / 2, 0, 0] });
    addMesh(group, new THREE.SphereGeometry(0.045, 8, 6), mat(0xfff0b5, 0.2, { emissive: 0xffc64a, emissiveIntensity: 0.8 }), v3(0, 0, 0.015));
    const p = worldAt(coin.x, coin.y, 0.95);
    group.position.copy(p);
    objectGroup.add(group);
    coin.group = group;
  }

  function createWorldObjects() {
    for (const cp of checkpoints) createCheckpoint(cp);
    for (const gate of gates) createGate(gate);
    for (const coin of coins) createCoin(coin);
    for (const enemy of enemies) {
      const model = createSlimeModel();
      const p = worldAt(enemy.x, enemy.y);
      model.root.position.set(p.x, 0, p.z);
      actorGroup.add(model.root);
      enemy.model = model;
    }
    for (const boss of bosses) {
      const model = createSlimeModel(true, boss.region);
      const p = worldAt(boss.x, boss.y);
      model.root.position.set(p.x, 0, p.z);
      actorGroup.add(model.root);
      const bar = new THREE.Group();
      addMesh(bar, shared.box, mat(0x202c32), v3(0, 1.92, 0), { scale: [1.35, 0.11, 0.09] });
      boss.healthMesh = addMesh(bar, shared.box, mat(0xff7468, 0.5, { emissive: 0x9c201b, emissiveIntensity: 0.35 }), v3(-0.015, 1.92, 0.055), { scale: [1.29, 0.065, 0.04] });
      model.root.add(bar);
      actorGroup.add(model.root);
      boss.model = model;
    }
  }

  function reset() {
    while (actorGroup.children.length) actorGroup.remove(actorGroup.children[0]);
    hero = { x: 65, y: 220, vx: 0, vy: 0, faceX: 1, faceY: 0, targetYaw: Math.PI / 4, hp: 5, invuln: 0, attack: 0, attackCd: 0, attackHit: false, jumpHeight: 0, jumpVelocity: 0, jumpPhase: 'grounded', jumpTimer: 0, landing: 0, gaitPhase: 0, moveBlend: 0, runBlend: 0, idleTime: 0, checkpoint: { x: 65, y: 220 }, model: createHeroModel() };
    actorGroup.add(hero.model.root);
    enemies = []; coins = []; checkpoints = []; gates = []; bosses = []; particles = []; keysFound = 0;
    for (let r = 0; r < REGIONS.length; r++) {
      const offset = r * REGION;
      for (const [dx, y] of [[225, 150], [370, 300], [475, 115]]) enemies.push({ x: offset + dx, y, homeX: offset + dx, homeY: y, hp: 2, alive: true, phase: dx });
      for (const [dx, y] of [[165, 250], [340, 110], [445, 340], [625, 230]]) coins.push({ x: offset + dx, y, taken: false, phase: dx * 0.04 });
      checkpoints.push({ x: offset + 100, y: 220, active: false }, { x: offset + 410, y: 220, active: false });
      gates.push({ x: offset + 690, y: 220, open: false, region: r });
      bosses.push({ x: offset + 550, y: 220, homeX: offset + 550, yHome: 220, hp: 4, maxHp: 4, alive: true, region: r, hitCd: 0 });
    }
    createWorldObjects();
    updateHUD();
    updateQuest();
    placeHero();
  }

  function placeHero() {
    const p = worldAt(hero.x, hero.y);
    const hurtBob = hero.invuln > 0 ? 0.025 * Math.sin(elapsed * 28) : 0;
    hero.model.root.position.set(p.x, hero.jumpHeight + hurtBob, p.z);
  }

  function updateHUD() {
    ui.hearts.innerHTML = Array.from({ length: 5 }, (_, i) => `<span class="${i >= hero.hp ? 'empty' : ''}">♥</span>`).join('');
    ui.coins.textContent = coins.filter((coin) => coin.taken).length;
    ui.keyCount.textContent = `${keysFound}/5 keys`;
  }
  function updateQuest() {
    const region = regionAt(hero.x), boss = bosses[region];
    ui.questName.textContent = REGIONS[region].name.toUpperCase();
    ui.questText.textContent = boss?.alive ? `Defeat ${REGIONS[region].boss} and claim the key` : (region === REGIONS.length - 1 ? 'Reach the portal home' : 'Key claimed · continue to the next nation');
  }
  function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add('show');
    toastTimer = 1.8;
  }
  function begin() {
    if (screen === 'win') reset();
    else if (screen === 'dead') {
      hero.x = hero.checkpoint.x; hero.y = hero.checkpoint.y; hero.hp = 5; hero.invuln = 1.5; hero.attack = hero.attackCd = 0;
      updateHUD(); showToast('Back at the last campfire');
    }
    screen = 'playing';
    ui.overlay.classList.add('hidden');
    last = performance.now();
  }
  ui.start.addEventListener('click', () => {
    if (screen === 'playing') { ui.overlay.classList.add('hidden'); return; }
    begin();
  });
  function pauseGame() {
    if (screen === 'playing') {
      screen = 'paused'; ui.eyebrow.textContent = 'TAKE A BREATH'; ui.title.textContent = 'Journey Paused';
      ui.message.textContent = 'Your adventure is waiting. The forest will be right where you left it.';
      ui.start.textContent = 'RESUME'; ui.hint.textContent = 'Your progress is saved for this journey'; ui.overlay.classList.remove('hidden');
    } else if (screen === 'paused') begin();
  }
  ui.pause.addEventListener('click', pauseGame);

  function releaseInputs() {
    for (const key of Object.keys(input)) if (typeof input[key] === 'boolean') input[key] = false;
    input.stickX = 0;
    input.stickY = 0;
    document.querySelectorAll('[data-key]').forEach((button) => button.classList.remove('pressed'));
    document.getElementById('joystick')?.classList.remove('active');
    const knob = document.getElementById('stickKnob');
    if (knob) knob.style.transform = 'translate(0px, 0px)';
  }
  const keyMap = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', j: 'attack', x: 'attack', ' ': 'jump' };
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key in keyMap) {
      event.preventDefault();
      const action = keyMap[key];
      if (action === 'jump' && !input.jump) input.jumpPressed = true;
      input[action] = true;
    }
    if (key === 'escape') pauseGame();
    if (key === 'enter' && screen !== 'playing') begin();
  });
  window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (key in keyMap) { event.preventDefault(); input[keyMap[key]] = false; }
  });
  window.addEventListener('blur', releaseInputs);
  document.querySelectorAll('[data-key]').forEach((button) => {
    const key = button.dataset.key;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      if (key === 'jump') input.jumpPressed = true;
      input[key] = true;
      button.classList.add('pressed');
    });
    const release = (event) => {
      event.preventDefault();
      input[key] = false;
      button.classList.remove('pressed');
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  });

  const joystick = document.getElementById('joystick');
  const stickKnob = document.getElementById('stickKnob');
  if (joystick && stickKnob) {
    const moveStick = (event) => {
      const rect = joystick.getBoundingClientRect();
      const max = Math.max(1, rect.width * 0.5 - stickKnob.offsetWidth * 0.5 - 4);
      let dx = event.clientX - (rect.left + rect.width * 0.5);
      let dy = event.clientY - (rect.top + rect.height * 0.5);
      const distance = Math.hypot(dx, dy);
      if (distance > max) { dx *= max / distance; dy *= max / distance; }
      let x = dx / max, y = dy / max;
      const magnitude = Math.hypot(x, y);
      if (magnitude < 0.12) x = y = 0;
      else if (magnitude > 1) { x /= magnitude; y /= magnitude; }
      input.stickX = x;
      input.stickY = y;
      stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    joystick.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      joystick.setPointerCapture(event.pointerId);
      joystick.classList.add('active');
      moveStick(event);
    });
    joystick.addEventListener('pointermove', (event) => {
      if (joystick.hasPointerCapture(event.pointerId)) moveStick(event);
    });
    const releaseStick = (event) => {
      if (event.cancelable) event.preventDefault();
      input.stickX = 0;
      input.stickY = 0;
      joystick.classList.remove('active');
      stickKnob.style.transform = 'translate(0px, 0px)';
    };
    joystick.addEventListener('pointerup', releaseStick);
    joystick.addEventListener('pointercancel', releaseStick);
    joystick.addEventListener('lostpointercapture', releaseStick);
  }

  function burst(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      particles.push({ x, y, z: 0.3 + Math.random() * 1.15, vx: (Math.random() - 0.5) * 90, vy: -30 - Math.random() * 95, vz: 0.45 + Math.random() * 0.6, life: 0.35 + Math.random() * 0.55, maxLife: 0.9, color: new THREE.Color(color) });
    }
  }

  const particlePositions = new Float32Array(360 * 3);
  const particleColors = new Float32Array(360 * 3);
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
  const particleMaterial = new THREE.PointsMaterial({ size: 0.15, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true });
  const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
  particleSystem.frustumCulled = false;
  scene.add(particleSystem);

  function updateParticles(dt) {
    for (const particle of particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
      particle.vy += 190 * dt;
      particle.life -= dt;
    }
    particles = particles.filter((particle) => particle.life > 0);
    const count = Math.min(particles.length, 360);
    for (let i = 0; i < count; i++) {
      const p = particles[i], world = worldAt(p.x, p.y, Math.max(0.06, p.z));
      particlePositions[i * 3] = world.x;
      particlePositions[i * 3 + 1] = world.y;
      particlePositions[i * 3 + 2] = world.z;
      const fade = Math.min(1, p.life / 0.2);
      particleColors[i * 3] = p.color.r * fade;
      particleColors[i * 3 + 1] = p.color.g * fade;
      particleColors[i * 3 + 2] = p.color.b * fade;
    }
    particleGeometry.setDrawRange(0, count);
    particleGeometry.attributes.position.needsUpdate = true;
    particleGeometry.attributes.color.needsUpdate = true;
  }

  function blocked(x, y, radius = 12) {
    if (y < 14 || y > MAP_H - 14 || x < 5 || x > WORLD - 5) return true;
    for (const obstacle of colliders) {
      const dx = x - obstacle.x, dy = y - obstacle.y;
      const reach = radius + obstacle.r;
      if (dx * dx + dy * dy < reach * reach) return true;
    }
    for (const gate of gates) {
      if (!gate.open && Math.abs(x - gate.x) < radius + 16 && Math.abs(y - gate.y) < 72) return true;
    }
    return false;
  }

  function moveWithCollision(actor, dx, dy, radius = 12) {
    const oldX = actor.x, oldY = actor.y;
    if (!blocked(oldX + dx, oldY, radius)) actor.x += dx;
    else actor.vx = 0;
    if (!blocked(actor.x, oldY + dy, radius)) actor.y += dy;
    else actor.vy = 0;
    if (actor.x === oldX && actor.y === oldY) {
      actor.vx *= 0.15;
      actor.vy *= 0.15;
    }
  }

  function hurt() {
    if (hero.invuln > 0) return;
    hero.hp--;
    hero.invuln = 1.25;
    hero.x = Math.max(0, hero.x - hero.faceX * 22);
    hero.y = Math.max(14, Math.min(MAP_H - 14, hero.y - hero.faceY * 22));
    updateHUD();
    burst(hero.x, hero.y, 0xff7468, 14);
    if (hero.hp <= 0) {
      screen = 'dead'; ui.eyebrow.textContent = 'THE FOREST CLAIMS ANOTHER'; ui.title.textContent = 'Not the end';
      ui.message.textContent = 'Every blade can rise again. Your journey will begin at the last campfire.';
      ui.start.textContent = 'TRY AGAIN'; ui.hint.textContent = 'Tip: face a creature and strike with your sword'; ui.overlay.classList.remove('hidden');
    }
  }

  function moveInput() {
    let x = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let y = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (Math.abs(input.stickX) + Math.abs(input.stickY) > 0.01) { x = input.stickX; y = input.stickY; }
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    return { x, y };
  }

  function faceHero(x, y) {
    const length = Math.hypot(x, y);
    if (length < 0.08) return;
    hero.faceX = x / length;
    hero.faceY = y / length;
    const wx = hero.faceX * rightAxis.x + hero.faceY * depthAxis.x;
    const wz = hero.faceX * rightAxis.z + hero.faceY * depthAxis.z;
    hero.targetYaw = Math.atan2(wx, wz);
  }

  function animateHero(dt, movementSpeed) {
    const model = hero.model;
    const speed01 = THREE.MathUtils.clamp(movementSpeed / 190, 0, 1);
    const moveTarget = speed01 * speed01 * (3 - 2 * speed01);
    const runTarget = THREE.MathUtils.clamp((speed01 - 0.48) / 0.28, 0, 1);
    hero.moveBlend += (moveTarget - hero.moveBlend) * (1 - Math.exp(-dt * 9));
    hero.runBlend += (runTarget - hero.runBlend) * (1 - Math.exp(-dt * 6));

    if (movementSpeed > 0.5) {
      // Advance the feet with real travel distance so cadence stays believable as speed changes.
      const strideLength = 2.45 + hero.runBlend * 0.5;
      hero.gaitPhase += (movementSpeed / SCALE) * (Math.PI * 2 / strideLength) * dt;
    } else hero.idleTime += dt;

    const yawDelta = Math.atan2(Math.sin(hero.targetYaw - model.root.rotation.y), Math.cos(hero.targetYaw - model.root.rotation.y));
    model.root.rotation.y += yawDelta * (1 - Math.exp(-dt * 13));
    const yaw = model.root.rotation.y;
    const worldVX = hero.vx * rightAxis.x + hero.vy * depthAxis.x;
    const worldVZ = hero.vx * rightAxis.z + hero.vy * depthAxis.z;
    const forwardSpeed = worldVX * Math.sin(yaw) + worldVZ * Math.cos(yaw);
    const sideSpeed = worldVX * Math.cos(yaw) - worldVZ * Math.sin(yaw);
    const locomotion = hero.moveBlend;
    const run = hero.runBlend;
    const phase = hero.gaitPhase;
    const stride = 0.42 + run * 0.24;
    const jumpActive = hero.jumpHeight > 0 || hero.jumpPhase === 'takeoff';
    const idleBreath = Math.sin(elapsed * 2.1);

    model.torso.scale.y = 1 + idleBreath * 0.012 * (1 - locomotion);
    model.torsoPivot.position.y = 0.78 + Math.abs(Math.sin(phase * 2)) * (0.012 + run * 0.018) * locomotion;
    model.torsoPivot.rotation.x = 0.025 + locomotion * (0.035 + run * 0.075) - THREE.MathUtils.clamp(forwardSpeed / 190, -1, 1) * 0.055;
    model.torsoPivot.rotation.y = -yawDelta * 0.16 * (0.3 + locomotion * 0.7);
    model.torsoPivot.rotation.z = -sideSpeed / 190 * 0.07 * locomotion + Math.sin(elapsed * 1.35) * 0.012 * (1 - locomotion);
    model.headPivot.rotation.x = -model.torsoPivot.rotation.x * 0.35;
    model.headPivot.rotation.y = Math.sin(elapsed * 0.8) * 0.025 * (1 - locomotion) + yawDelta * 0.08;

    for (let i = 0; i < 2; i++) {
      const legPhase = phase + i * Math.PI;
      const swing = Math.sin(legPhase);
      const lift = Math.max(0, Math.cos(legPhase));
      model.legs[i].rotation.x = swing * stride * locomotion;
      model.feet[i].position.y = -0.49 + lift * (0.075 + run * 0.065) * locomotion;
      model.feet[i].rotation.x = -swing * stride * 0.42 * locomotion + lift * 0.08 * locomotion;
      const armSwing = Math.sin(phase + (1 - i) * Math.PI) * (0.28 + run * 0.24) * locomotion;
      model.arms[i].rotation.x = armSwing;
      model.arms[i].rotation.z = (i === 0 ? -0.08 : 0.12) * (1 - locomotion) - sideSpeed / 190 * 0.08;
    }

    if (hero.attack > 0) {
      const progress = THREE.MathUtils.clamp(1 - hero.attack / 0.34, 0, 1);
      // Wind-up, crisp slash, then a short follow-through instead of a single soft sine pose.
      const windup = 1 - THREE.MathUtils.smoothstep(progress, 0.08, 0.32);
      const slash = Math.sin(THREE.MathUtils.smoothstep(progress, 0.22, 0.76) * Math.PI);
      const followThrough = THREE.MathUtils.smoothstep(progress, 0.58, 0.9) * (1 - THREE.MathUtils.smoothstep(progress, 0.88, 1));
      model.torsoPivot.rotation.y += -0.12 * windup + 0.2 * slash;
      model.torsoPivot.rotation.x -= 0.08 * slash;
      model.arms[1].rotation.x = 0.72 * windup - 1.12 * slash - 0.28 * followThrough;
      model.arms[1].rotation.z = 0.28 + 0.3 * slash;
      model.swordPivot.rotation.x = -0.15 - 1.9 * slash - 0.35 * followThrough;
    } else {
      model.swordPivot.rotation.x = 0;
    }

    if (jumpActive) {
      const takeoff = hero.jumpPhase === 'takeoff' ? THREE.MathUtils.smoothstep(hero.jumpTimer, 0, 0.11) : 1;
      const descent = hero.jumpVelocity < 0 ? THREE.MathUtils.clamp(-hero.jumpVelocity / 5.2, 0, 1) : 0;
      const tuck = hero.jumpPhase === 'takeoff' ? 0.25 + takeoff * 0.2 : 0.9 - descent * 0.35;
      model.torsoPivot.position.y -= (1 - takeoff) * 0.11;
      model.torsoPivot.rotation.x -= 0.12 + (1 - takeoff) * 0.16;
      model.torso.scale.y = 1 + (1 - takeoff) * 0.06;
      model.root.scale.y = 1;
      for (let i = 0; i < 2; i++) {
        model.legs[i].rotation.x = -0.42 * tuck + (i === 0 ? 0.08 : -0.08);
        model.feet[i].position.y = -0.43;
        model.feet[i].rotation.x = 0.16 + descent * 0.25;
        model.arms[i].rotation.x = -0.45 - (i === 0 ? 0.22 : 0) - descent * 0.12;
      }
      if (hero.attack <= 0) model.swordPivot.rotation.x = 0.12;
    } else if (hero.jumpPhase === 'landing') {
      const impact = THREE.MathUtils.clamp(1 - (0.24 - hero.landing) / 0.24, 0, 1);
      const compression = Math.exp(-impact * 9);
      model.root.scale.y = 1 - compression * 0.075;
      model.torsoPivot.position.y -= compression * 0.13;
      model.torsoPivot.rotation.x += compression * 0.16;
      model.legs[0].rotation.x = model.legs[1].rotation.x = -compression * 0.24;
      model.arms[0].rotation.x = -compression * 0.4;
      model.arms[1].rotation.x = -compression * 0.22;
    } else {
      model.root.scale.y = 1;
    }
  }

  function startAttack() {
    if (hero.attackCd > 0) return;
    hero.attack = 0.34;
    hero.attackCd = 0.4;
    hero.attackHit = false;
    hero.model.swordPivot.rotation.x = -0.5;
  }

  function attackTargets() {
    if (hero.attack <= 0 || hero.attackHit) return;
    const strike = (target, range) => {
      const dx = target.x - hero.x, dy = target.y - hero.y;
      const distance = Math.hypot(dx, dy) || 1;
      return distance < range;
    };
    for (const enemy of enemies) {
      if (!enemy.alive || !strike(enemy, 65)) continue;
      enemy.hp--;
      hero.attackHit = true;
      enemy.x += hero.faceX * 17; enemy.y += hero.faceY * 17;
      burst(enemy.x, enemy.y, 0xa8da8e, 9);
      if (enemy.hp <= 0) {
        enemy.alive = false; enemy.model.root.visible = false;
        burst(enemy.x, enemy.y, 0x8bd17d, 15); showToast('Forest slime defeated');
      }
      return;
    }
    const region = regionAt(hero.x), boss = bosses[region];
    if (boss?.alive && strike(boss, 82) && boss.hitCd <= 0) {
      boss.hp--; boss.hitCd = 0.42; hero.attackHit = true;
      boss.healthMesh.scale.x = 1.29 * (boss.hp / boss.maxHp);
      boss.healthMesh.position.x = -0.66 + (boss.healthMesh.scale.x / 2);
      burst(boss.x, boss.y, 0xffd57a, 14);
      if (boss.hp <= 0) {
        boss.alive = false; boss.model.root.visible = false; keysFound++;
        gates[region].open = true;
        const portalMaterial = gates[region].portal.material;
        portalMaterial.color.setHex(0xffcf72); portalMaterial.emissive.setHex(0x8e5719); portalMaterial.opacity = 0.55;
        showToast(`${REGIONS[region].name} key found!`); updateHUD(); updateQuest();
        burst(boss.x, boss.y, 0xffe7a0, 28);
      } else showToast(`${REGIONS[region].boss} · ${boss.hp} strikes left`);
      return;
    }
  }

  function update(dt) {
    elapsed += dt;
    if (toastTimer > 0 && (toastTimer -= dt) <= 0) ui.toast.classList.remove('show');
    if (screen !== 'playing') { updateParticles(dt); return; }
    const direction = moveInput();
    const speed = 190;
    const response = direction.x || direction.y ? 10.5 : 8.5;
    hero.vx += (direction.x * speed - hero.vx) * Math.min(1, dt * response);
    hero.vy += (direction.y * speed - hero.vy) * Math.min(1, dt * response);
    if (Math.abs(direction.x) < 0.01) hero.vx *= Math.pow(0.08, dt);
    if (Math.abs(direction.y) < 0.01) hero.vy *= Math.pow(0.08, dt);
    moveWithCollision(hero, hero.vx * dt, hero.vy * dt, 12);
    if (direction.x || direction.y) faceHero(direction.x, direction.y);

    if (input.jumpPressed) {
      if (hero.jumpPhase === 'grounded') {
        hero.jumpPhase = 'takeoff';
        hero.jumpVelocity = 5.2;
        hero.jumpTimer = 0;
      }
      input.jumpPressed = false;
    }
    if (hero.jumpPhase === 'takeoff' || hero.jumpPhase === 'airborne') {
      hero.jumpTimer += dt;
      hero.jumpVelocity -= 13 * dt;
      hero.jumpHeight = Math.max(0, hero.jumpHeight + hero.jumpVelocity * dt);
      if (hero.jumpPhase === 'takeoff' && hero.jumpTimer >= 0.11) hero.jumpPhase = 'airborne';
      if (hero.jumpHeight <= 0 && hero.jumpVelocity < 0) {
        hero.jumpHeight = 0;
        hero.jumpVelocity = 0;
        hero.jumpPhase = 'landing';
        hero.landing = 0.24;
      }
    } else if (hero.jumpPhase === 'landing') {
      hero.landing = Math.max(0, hero.landing - dt);
      if (hero.landing === 0) hero.jumpPhase = 'grounded';
    }

    if (hero.invuln > 0) hero.invuln = Math.max(0, hero.invuln - dt);
    if (hero.attack > 0) hero.attack = Math.max(0, hero.attack - dt);
    if (hero.attackCd > 0) hero.attackCd = Math.max(0, hero.attackCd - dt);
    if (input.attack && hero.attackCd <= 0) startAttack();
    animateHero(dt, Math.hypot(hero.vx, hero.vy));
    placeHero();

    for (const coin of coins) {
      if (coin.taken) continue;
      coin.group.position.y = 0.93 + Math.sin(elapsed * 3.2 + coin.phase) * 0.11;
      coin.group.rotation.y = elapsed * 1.7;
      if (Math.hypot(hero.x - coin.x, hero.y - coin.y) < 28) {
        coin.taken = true; coin.group.visible = false; burst(coin.x, coin.y, 0xffd36f, 10); updateHUD(); showToast('A little treasure for the road');
      }
    }
    for (const cp of checkpoints) {
      cp.flame.rotation.y = elapsed * 1.6;
      cp.flame.scale.setScalar(0.85 + Math.sin(elapsed * 5) * 0.12);
      if (!cp.active && Math.hypot(hero.x - cp.x, hero.y - cp.y) < 30) {
        checkpoints.forEach((point) => { point.active = false; }); cp.active = true;
        hero.checkpoint = { x: cp.x, y: cp.y }; showToast('Campfire found · progress saved'); burst(cp.x, cp.y, 0xffd47d, 14);
      }
    }

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      let dx = hero.x - enemy.x, dy = hero.y - enemy.y, distance = Math.hypot(dx, dy) || 1;
      if (distance < 175) { enemy.vx = (enemy.vx || 0) + (dx / distance * 48 - (enemy.vx || 0)) * Math.min(1, dt * 3); enemy.vy = (enemy.vy || 0) + (dy / distance * 48 - (enemy.vy || 0)) * Math.min(1, dt * 3); }
      else { enemy.vx = (enemy.homeX + Math.sin(elapsed * 0.6 + enemy.phase) * 24 - enemy.x) * 0.8; enemy.vy = (enemy.homeY + Math.cos(elapsed * 0.5 + enemy.phase) * 20 - enemy.y) * 0.8; }
      moveWithCollision(enemy, enemy.vx * dt, enemy.vy * dt, 14);
      const p = worldAt(enemy.x, enemy.y); enemy.model.root.position.set(p.x, Math.abs(Math.sin(elapsed * 6 + enemy.phase)) * 0.09, p.z);
      enemy.model.root.scale.y = 0.94 + Math.abs(Math.sin(elapsed * 6 + enemy.phase)) * 0.12;
      dx = hero.x - enemy.x; dy = hero.y - enemy.y; distance = Math.hypot(dx, dy);
      if (hero.attack > 0 && distance < 62) attackTargets();
      else if (distance < 29 && hero.invuln <= 0) { hero._hitX = enemy.x; hero._hitY = enemy.y; hurt(); }
    }
    const region = regionAt(hero.x), boss = bosses[region], gate = gates[region];
    if (boss?.alive) {
      boss.hitCd = Math.max(0, boss.hitCd - dt);
      const dx = hero.x - boss.x, dy = hero.y - boss.y, distance = Math.hypot(dx, dy) || 1;
      if (distance > 54) {
        boss.x += dx / distance * 38 * dt; boss.y += dy / distance * 38 * dt;
        boss.x = Math.max(boss.homeX - 48, Math.min(boss.homeX + 48, boss.x));
        boss.y = Math.max(35, Math.min(MAP_H - 35, boss.y));
      }
      const p = worldAt(boss.x, boss.y); boss.model.root.position.set(p.x, Math.abs(Math.sin(elapsed * 3.3)) * 0.1, p.z);
      boss.model.root.rotation.y = Math.atan2((hero.x - boss.x) * rightAxis.x + (hero.y - boss.y) * depthAxis.x, (hero.x - boss.x) * rightAxis.z + (hero.y - boss.y) * depthAxis.z);
      if (hero.attack > 0 && distance < 82 && boss.hitCd <= 0) attackTargets();
      else if (distance < 43 && hero.invuln <= 0) { hero._hitX = boss.x; hero._hitY = boss.y; hurt(); }
    } else if (gate) gate.open = true;

    updateParticles(dt);
    const target = worldAt(hero.x, hero.y, 0.25);
    const follow = 1 - Math.exp(-dt * 4.2);
    const cameraOffset = depthAxis.clone().multiplyScalar(23.5 * Math.cos(35 * Math.PI / 180));
    const lookTarget = target.clone().add(v3(0, 0.45, 0));
    camera.position.lerp(lookTarget.clone().add(cameraOffset).add(v3(0, 23.5 * Math.sin(35 * Math.PI / 180), 0)), follow);
    camera.lookAt(lookTarget);
    const biome = REGIONS[regionAt(hero.x)];
    scene.background.setHex(biome.sky); scene.fog.color.setHex(biome.sky);
    updateQuest();
    if (keysFound === REGIONS.length && hero.x > gates[4].x + 20) {
      screen = 'win'; ui.eyebrow.textContent = 'THE PROPHECY FULFILLED'; ui.title.textContent = 'The Way Home';
      ui.message.textContent = 'The fifth key turns in the ancient portal. Its light opens onto the familiar forest where your journey began. You have saved five nations—and found your way home.';
      ui.start.textContent = 'PLAY AGAIN'; ui.hint.textContent = 'Five nations · Five guardians · Five keys'; ui.overlay.classList.remove('hidden');
    }
  }

  function render(now) {
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000));
    last = now;
    update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }
  reset();
  // Place the opening scene with its orthographic camera already framed around the hero.
  const initialTarget = worldAt(hero.x, hero.y, 0.25);
  camera.position.copy(initialTarget).add(depthAxis.clone().multiplyScalar(23.5 * Math.cos(35 * Math.PI / 180))).add(v3(0, 23.5 * Math.sin(35 * Math.PI / 180), 0));
  camera.lookAt(initialTarget);
  requestAnimationFrame(render);
})();
