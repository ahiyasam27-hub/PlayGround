import * as THREE from 'three';
import { EnvironmentAssetManager } from './environment-assets.js';

(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const shell = document.querySelector('#shell');
  const ui = Object.fromEntries(
    'overlay title message eyebrow hint start hearts keyCount questName questText pause toast'
      .split(' ').map((id) => [id, document.getElementById(id)])
  );
  ui.coins = document.getElementById('coinCount');
  ui.assetStatus = document.getElementById('assetStatus');
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
  const WORLD = 1600;
  const MAP_H = 1200;
  const REGIONS = [
    { name: 'Verdant Reach', boss: 'Mossfang', x: 255, y: 260, ground: 0x687950, tile: 0x77865a, accent: 0xa2ad6c, sky: 0x9aaca7, leaf: 0x386047 },
    { name: 'Frostveil Peaks', boss: 'The Glacier Warden', x: 390, y: 930, ground: 0x718b98, tile: 0x92aab0, accent: 0xc4d8d8, sky: 0x9bb7c8, leaf: 0xb9d2d7 },
    { name: 'Sunken Coast', boss: 'Tidecaller', x: 1330, y: 275, ground: 0x3e7270, tile: 0x568b82, accent: 0x9bc7a0, sky: 0x82b9b8, leaf: 0x2d6962 },
    { name: 'Ashen March', boss: 'Cindermaw', x: 800, y: 600, ground: 0x77503e, tile: 0x956346, accent: 0xc68a5c, sky: 0xc29379, leaf: 0x7f4739 },
    { name: 'Starfall Crown', boss: 'The Void King', x: 1260, y: 930, ground: 0x514b72, tile: 0x6a6090, accent: 0xb2a4d1, sky: 0xaaa1c7, leaf: 0x61518b },
  ];
  const input = { left: false, right: false, up: false, down: false, attack: false, jump: false, jumpPressed: false, stickX: 0, stickY: 0 };
  const rightAxis = new THREE.Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2);
  const depthAxis = new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2);
  const temp = new THREE.Object3D();
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const terrainHills = [
    [210, 470, 2.1, 260], [510, 1010, 4.6, 285], [790, 240, 2.4, 250],
    [1060, 680, 2.7, 310], [1370, 1000, 4.1, 290], [1450, 210, 1.7, 245],
    [85, 875, 3.2, 235], [685, 470, 1.8, 205], [1130, 1080, 2.8, 240],
    [1510, 690, 2.2, 250], [350, 155, 1.5, 215], [960, 1030, 1.7, 220],
  ];
  const terrainHeight = (x, y) => {
    let h = 0.18 * Math.sin(x / 92) * Math.cos(y / 107)
      + 0.12 * Math.sin((x + y) / 58)
      + 0.1 * Math.sin(x / 31 + Math.sin(y / 73)) * Math.cos(y / 39);
    for (const [cx, cy, amount, radius] of terrainHills) {
      const d = Math.hypot((x - cx) * 0.88, y - cy);
      h += amount * Math.exp(-(d * d) / (radius * radius));
    }
    return Math.max(0, h);
  };
  const worldAt = (x, y, height = terrainHeight(x, y)) => new THREE.Vector3(
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
    rock: new THREE.DodecahedronGeometry(0.55, 0),
    sphere: new THREE.SphereGeometry(1, 12, 9),
    box: new THREE.BoxGeometry(1, 1, 1),
  };
  const colliders = [];
  const importedTreePlacements = { broadleaf: [], pine: [] };
  const windClock = { value: 0 };
  let waterGlints = null;
  let ambientPointObject = null;
  const ambientPoints = [];
  const ambientPositions = new Float32Array(36 * 3);
  const ambientColors = new Float32Array(36 * 3);
  function windMaterial(color, amplitude, pivot) {
    const material = mat(color);
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = windClock;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>\nfloat windPhase = uWindTime * 0.62 + instanceMatrix[3].x * 0.17 + instanceMatrix[3].z * 0.19;\nfloat windHeight = max(0.0, position.y + ${pivot.toFixed(3)});\ntransformed.x += sin(windPhase) * windHeight * ${amplitude.toFixed(3)};\ntransformed.z += cos(windPhase * 0.73) * windHeight * ${(amplitude * 0.38).toFixed(3)};`);
    };
    material.customProgramCacheKey = () => `wind-${amplitude}-${pivot}`;
    return material;
  }
  const worldGroup = new THREE.Group();
  const objectGroup = new THREE.Group();
  const actorGroup = new THREE.Group();
  scene.add(worldGroup, objectGroup, actorGroup);

  let width = 960, height = 540, screen = 'title', last = performance.now(), elapsed = 0, toastTimer = 0;
  let hero, enemies, coins, checkpoints, gates, bosses, particles, keysFound = 0;
  const random01 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const regionAt = (x, y) => {
    let nearest = 0, distance = Infinity;
    for (let i = 0; i < REGIONS.length; i++) {
      const region = REGIONS[i], d = (x - region.x) ** 2 + (y - region.y) ** 2;
      if (d < distance) { nearest = i; distance = d; }
    }
    return nearest;
  };
  const riverX = (y) => 790 + Math.sin(y / 148) * 145 + Math.sin(y / 61) * 38;
  const BRIDGE_CROSSINGS = [330, 514, 764, 850];
  const onBridge = (x, y) => BRIDGE_CROSSINGS.some((crossing) => Math.abs(y - crossing) < 34 && Math.abs(x - riverX(crossing)) < 72);
  const inRiver = (x, y) => distanceToRiver(x, y) < 62 && !onBridge(x, y);
  const pathLines = [
    [[90, 450], [170, 360], [255, 260], [775, 514], [800, 600]],
    [[255, 260], [875, 330], [1050, 320], [1330, 275]],
    [[430, 930], [570, 850], [658, 764], [730, 700], [800, 600]],
    [[430, 930], [600, 900], [753, 850], [1000, 875], [1260, 930]],
    [[800, 600], [1000, 480], [1160, 380], [1330, 275]],
  ];
  const distanceToPath = (x, y) => {
    let nearest = Infinity;
    for (const line of pathLines) for (let i = 0; i < line.length - 1; i++) {
      const [ax, ay] = line[i], [bx, by] = line[i + 1];
      const dx = bx - ax, dy = by - ay;
      const t = THREE.MathUtils.clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
      nearest = Math.min(nearest, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
    return nearest;
  };
  const distanceToRiver = (x, y) => Math.abs(x - riverX(y));
  const terrainAt = (x, y, offset = 0) => terrainHeight(x, y) + offset;
  const regionColorAt = (x, y) => {
    const color = new THREE.Color(0), weights = REGIONS.map((region) => {
      const d = Math.hypot(x - region.x, y - region.y);
      return Math.exp(-(d * d) / (2 * 330 * 330));
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    REGIONS.forEach((region, index) => color.add(new THREE.Color(region.ground).multiplyScalar(weights[index] / total)));
    return color;
  };

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

  function buildDistantRidges() {
    const palettes = [0x627365, 0x71818a, 0x756f88];
    const sides = [
      (distance) => [-distance, -distance, WORLD + distance, -distance],
      (distance) => [WORLD + distance, -distance, WORLD + distance, MAP_H + distance],
      (distance) => [WORLD + distance, MAP_H + distance, -distance, MAP_H + distance],
      (distance) => [-distance, MAP_H + distance, -distance, -distance],
    ];
    for (let layer = 0; layer < 3; layer++) {
      const distance = 205 + layer * 125;
      const vertices = [], colors = [], indices = [];
      let vertex = 0;
      for (let side = 0; side < sides.length; side++) {
        const [x0, y0, x1, y1] = sides[side](distance);
        const length = Math.hypot(x1 - x0, y1 - y0);
        const steps = Math.ceil(length / 82);
        const edge = [];
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = THREE.MathUtils.lerp(x0, x1, t), y = THREE.MathUtils.lerp(y0, y1, t);
          const ground = terrainHeight(x, y);
          const peak = 2.4 + random01(layer * 701 + side * 97 + i * 19) * (layer === 0 ? 3.2 : 4.8);
          edge.push({ x, y, ground, peak });
        }
        for (const point of edge) {
          for (const h of [point.ground - 0.08, point.ground + point.peak]) {
            const p = worldAt(point.x, point.y, h);
            vertices.push(p.x, p.y, p.z);
            const shade = h === point.ground - 0.08 ? 0.72 : 0.88 + random01(vertex + layer * 43) * 0.18;
            const tint = new THREE.Color(palettes[layer]).multiplyScalar(shade);
            colors.push(tint.r, tint.g, tint.b);
            vertex++;
          }
        }
        const start = vertex / 2 - edge.length;
        for (let i = 0; i < edge.length - 1; i++) {
          const a = (start + i) * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const ridge = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, fog: true }));
      ridge.castShadow = false;
      ridge.receiveShadow = false;
      worldGroup.add(ridge);
    }
  }

  function buildBiomeDetails() {
    const decor = [
      { count: 24, primary: new THREE.ConeGeometry(0.14, 0.24, 6), primaryColor: 0x9b7052, secondary: new THREE.SphereGeometry(0.15, 7, 5), secondaryColor: 0xc98a70, size: [0.7, 1.25] },
      { count: 30, primary: new THREE.ConeGeometry(0.2, 0.9, 5), primaryColor: 0xa9c8ce, secondary: new THREE.ConeGeometry(0.12, 0.62, 5), secondaryColor: 0xd7e9e7, size: [0.65, 1.25] },
      { count: 34, primary: new THREE.CylinderGeometry(0.035, 0.085, 0.76, 5), primaryColor: 0x729782, secondary: new THREE.SphereGeometry(0.075, 6, 5), secondaryColor: 0xc2b27a, size: [0.7, 1.35] },
      { count: 28, primary: new THREE.DodecahedronGeometry(0.42, 0), primaryColor: 0x554d49, secondary: new THREE.ConeGeometry(0.2, 0.75, 5), secondaryColor: 0xa36545, size: [0.55, 1.15] },
      { count: 30, primary: new THREE.OctahedronGeometry(0.35, 0), primaryColor: 0x9086b7, secondary: new THREE.ConeGeometry(0.16, 0.68, 5), secondaryColor: 0xc6bce0, size: [0.65, 1.25] },
    ];
    for (let region = 0; region < decor.length; region++) {
      const biome = REGIONS[region], spec = decor[region];
      const primary = new THREE.InstancedMesh(spec.primary, mat(0xffffff), spec.count);
      const secondary = new THREE.InstancedMesh(spec.secondary, mat(0xffffff), spec.count);
      let placed = 0;
      for (let i = 0; i < spec.count; i++) {
        const seed = region * 10007 + i * 61 + 883;
        let x = biome.x, y = biome.y, valid = false;
        for (let attempt = 0; attempt < 28; attempt++) {
          x = biome.x + (random01(seed + attempt * 7 + 11) - 0.5) * 540;
          y = biome.y + (random01(seed + attempt * 7 + 17) - 0.5) * 440;
          valid = x > 18 && x < WORLD - 18 && y > 18 && y < MAP_H - 18
            && regionAt(x, y) === region && distanceToPath(x, y) > 34
            && distanceToRiver(x, y) > 84 && Math.hypot(x - 800, y - 600) > 130
            && colliders.every((obstacle) => Math.hypot(x - obstacle.x, y - obstacle.y) > obstacle.r + 10);
          if (valid) break;
        }
        if (!valid) continue;
        const scale = spec.size[0] + random01(seed + 23) * (spec.size[1] - spec.size[0]);
        const p = worldAt(x, y, terrainAt(x, y, 0.02));
        temp.position.copy(p);
        temp.rotation.set(0, random01(seed + 29) * Math.PI * 2, (random01(seed + 31) - 0.5) * 0.12);
        temp.scale.set(scale, scale, scale);
        temp.updateMatrix();
        primary.setMatrixAt(placed, temp.matrix);
        primary.setColorAt(placed, new THREE.Color(spec.primaryColor).offsetHSL((random01(seed + 37) - 0.5) * 0.035, 0, (random01(seed + 41) - 0.5) * 0.12));
        temp.position.set(p.x + (random01(seed + 43) - 0.5) * 0.34, p.y, p.z + (random01(seed + 47) - 0.5) * 0.34);
        temp.rotation.y += 0.8;
        temp.scale.set(scale * 0.68, scale * (0.65 + random01(seed + 53) * 0.35), scale * 0.68);
        temp.updateMatrix();
        secondary.setMatrixAt(placed, temp.matrix);
        secondary.setColorAt(placed, new THREE.Color(spec.secondaryColor).offsetHSL((random01(seed + 59) - 0.5) * 0.035, 0, (random01(seed + 61) - 0.5) * 0.12));
        placed++;
      }
      primary.count = secondary.count = placed;
      for (const mesh of [primary, secondary]) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        worldGroup.add(mesh);
      }
    }
  }

  function buildEnvironment() {
    const margin = 420, terrainWidth = WORLD + margin * 2, terrainDepth = MAP_H + margin * 2;
    const cols = 108, rows = 90;
    const positions = [], colors = [], indices = [];
    for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) {
      const x = -margin + terrainWidth * col / cols, y = -margin + terrainDepth * row / rows;
      const p = worldAt(x, y, terrainHeight(x, y) - 0.12);
      positions.push(p.x, p.y, p.z);
      const height = terrainHeight(x, y);
      const color = regionColorAt(x, y).multiplyScalar(0.9 + random01(row * 131 + col * 17) * 0.16);
      const exposedStone = THREE.MathUtils.smoothstep(height, 2.8, 5.2) * (regionAt(x, y) === 1 ? 0.18 : 0.34);
      color.lerp(new THREE.Color(regionAt(x, y) === 1 ? 0xc3d0c9 : 0x857e72), exposedStone);
      colors.push(color.r, color.g, color.b);
      if (row < rows && col < cols) {
        const a = row * (cols + 1) + col, b = a + cols + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const groundGeo = new THREE.BufferGeometry();
    groundGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    groundGeo.setIndex(indices); groundGeo.computeVertexNormals();
    worldGroup.add(new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ map: createGroundTexture(), vertexColors: true, roughness: 1, side: THREE.DoubleSide })));
    buildDistantRidges();
    buildTrail();
    buildRiver();
    buildLandmarks();
    buildTreesAndRocks();
    buildGroundCover();
    buildBiomeDetails();
    buildDecorativeLights();
    buildAmbientEffects();
  }

  function createGroundTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const context = canvas.getContext('2d');
    context.fillStyle = '#eeeadd';
    context.fillRect(0, 0, 512, 512);
    // Soft, overlapping moss and soil patches establish broad natural variation.
    const patchColors = ['rgba(92,112,65,0.12)', 'rgba(126,105,73,0.10)', 'rgba(149,143,111,0.10)', 'rgba(73,98,68,0.08)'];
    for (let i = 0; i < 230; i++) {
      context.fillStyle = patchColors[i % patchColors.length];
      context.beginPath();
      context.ellipse(random01(i + 301) * 512, random01(i + 401) * 512, 7 + random01(i + 501) * 28, 4 + random01(i + 601) * 18, random01(i + 701) * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
    // Fine soil grain and pale stone flecks keep the material legible at game scale.
    for (let i = 0; i < 15000; i++) {
      const shade = 92 + Math.floor(random01(i + 318) * 135);
      const alpha = 0.025 + random01(i + 619) * 0.085;
      const size = 0.7 + random01(i + 817) * 2.4;
      context.fillStyle = `rgba(${shade},${Math.floor(shade * 0.98)},${Math.floor(shade * 0.88)},${alpha})`;
      context.fillRect(random01(i + 101) * 512, random01(i + 203) * 512, size, size);
    }
    for (let i = 0; i < 230; i++) {
      const x = random01(i + 911) * 512, y = random01(i + 971) * 512;
      const size = 1 + random01(i + 1031) * 3.8;
      context.save();
      context.translate(x, y);
      context.rotate(random01(i + 1091) * Math.PI);
      context.fillStyle = i % 3 === 0 ? 'rgba(116,84,54,0.22)' : 'rgba(77,111,63,0.2)';
      context.beginPath();
      context.ellipse(0, 0, size, size * 0.42, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    for (let i = 0; i < 100; i++) {
      context.fillStyle = 'rgba(218,215,196,0.25)';
      context.beginPath();
      context.ellipse(random01(i + 1201) * 512, random01(i + 1301) * 512, 2 + random01(i + 1401) * 5, 1 + random01(i + 1501) * 3, random01(i + 1601) * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(28, 12);
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  function buildRibbon(lines, width, material, segments = 28, heightOffset = 0) {
    for (const line of lines) {
      const points = [];
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1], count = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / segments));
        for (let j = 0; j < count; j++) { const t = j / count; points.push([THREE.MathUtils.lerp(a[0], b[0], t), THREE.MathUtils.lerp(a[1], b[1], t)]); }
      }
      points.push(line[line.length - 1]);
      const vertices = [], indices = [];
      for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i], before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
        const length = Math.hypot(after[0] - before[0], after[1] - before[1]) || 1;
        const nx = -(after[1] - before[1]) / length, ny = (after[0] - before[0]) / length;
        for (const side of [-1, 1]) { const p = worldAt(x + nx * width * side / 2, y + ny * width * side / 2, terrainHeight(x, y) + 0.025 + heightOffset); vertices.push(p.x, p.y, p.z); }
        if (i < points.length - 1) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
      worldGroup.add(new THREE.Mesh(geometry, material));
    }
  }

  function buildTrail() {
    buildRibbon(pathLines, 58, new THREE.MeshStandardMaterial({ color: 0x5d5942, roughness: 1, side: THREE.DoubleSide }), 30, 0.012);
    buildRibbon(pathLines, 48, new THREE.MeshStandardMaterial({ color: 0x8a7854, roughness: 1, side: THREE.DoubleSide }), 30, 0.022);
    buildRibbon(pathLines, 39, new THREE.MeshStandardMaterial({ color: 0x9b8964, roughness: 1, side: THREE.DoubleSide }), 30, 0.032);
    buildRibbon(pathLines.map((line) => line.map(([x, y]) => [x, y + 9])), 5, new THREE.MeshStandardMaterial({ color: 0xc3a876, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }), 42, 0.045);
  }

  function buildRiver() {
    const line = [];
    for (let y = 0; y <= MAP_H; y += 14) line.push([riverX(y), y]);
    buildRibbon([line], 112, new THREE.MeshStandardMaterial({ color: 0x397d91, roughness: 0.3, metalness: 0.08, transparent: true, opacity: 0.9, side: THREE.DoubleSide }), 14);
    buildRibbon([line], 42, new THREE.MeshStandardMaterial({ color: 0x8bc2c0, roughness: 0.24, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }), 20, 0.035);
    const glintCount = 36;
    const glintGeometry = new THREE.BufferGeometry();
    glintGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(glintCount * 2 * 3), 3));
    const glintSeeds = Array.from({ length: glintCount }, (_, i) => ({
      y: random01(i + 5101) * MAP_H,
      across: (random01(i + 5127) - 0.5) * 78,
      length: 10 + random01(i + 5153) * 20,
      speed: 22 + random01(i + 5179) * 28,
      phase: random01(i + 5201) * Math.PI * 2,
    }));
    const glintMaterial = new THREE.LineBasicMaterial({ color: 0xd5f1e8, transparent: true, opacity: 0.34, depthWrite: false });
    waterGlints = { geometry: glintGeometry, seeds: glintSeeds };
    const glintLines = new THREE.LineSegments(glintGeometry, glintMaterial);
    glintLines.frustumCulled = false;
    worldGroup.add(glintLines);
    const bank = new THREE.MeshStandardMaterial({ color: 0xa59a72, roughness: 1, side: THREE.DoubleSide });
    for (const crossing of BRIDGE_CROSSINGS) {
      const group = new THREE.Group(), p = worldAt(riverX(crossing), crossing, terrainHeight(riverX(crossing), crossing) + 0.16);
      addMesh(group, new THREE.BoxGeometry(4.2, 0.2, 1.55), mat(0x806044), v3(0, 0, 0));
      for (const side of [-1, 1]) addMesh(group, new THREE.BoxGeometry(4.2, 0.12, 0.12), mat(0xb49464), v3(0, 0.24, side * 0.68));
      group.position.copy(p); group.rotation.y = Math.PI / 4; worldGroup.add(group);
      buildRibbon([[[riverX(crossing) - 110, crossing - 12], [riverX(crossing) + 110, crossing + 12]]], 5, bank, 18);
    }
  }

  function buildLandmarks() {
    const village = new THREE.Group();
    const hutMaterial = mat(0xc3a36a), wallMaterial = mat(0x9c7d52), roofMaterial = mat(0x694838);
    for (const [x, y, scale] of [[750, 560, 1], [850, 555, 0.82], [800, 655, 0.72]]) {
      const p = worldAt(x, y); const hut = new THREE.Group();
      addMesh(hut, new THREE.BoxGeometry(1.35, 0.95, 1.15), wallMaterial, v3(0, 0.48, 0), { castShadow: true });
      addMesh(hut, new THREE.ConeGeometry(1.0, 0.72, 4), roofMaterial, v3(0, 1.25, 0), { rotation: [0, Math.PI / 4, 0] });
      hut.scale.setScalar(scale); hut.position.set(p.x, p.y, p.z); village.add(hut);
      colliders.push({ x, y, r: 23 * scale });
    }
    worldGroup.add(village);
    const shrine = (x, y, color, size = 1) => {
      const p = worldAt(x, y), group = new THREE.Group(), stone = mat(color);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2, xx = Math.cos(a) * 1.25, zz = Math.sin(a) * 1.25;
        addMesh(group, new THREE.CylinderGeometry(0.16, 0.2, 1.65, 6), stone, v3(xx, 0.82, zz));
      }
      addMesh(group, new THREE.ConeGeometry(1.75, 0.62, 4), stone, v3(0, 1.95, 0), { rotation: [0, Math.PI / 4, 0] });
      group.position.set(p.x, p.y, p.z); group.scale.setScalar(size); worldGroup.add(group);
    };
    shrine(430, 940, 0x778783, 1.35); // ancient mountain ruins
    shrine(1260, 950, 0x625a80, 1.55); // starfall keep
    // A small cave mouth tucked into the western foothills.
    const cavePos = worldAt(130, 760), cave = addMesh(worldGroup, new THREE.TorusGeometry(0.95, 0.22, 7, 12, Math.PI), mat(0x4b5148), v3(cavePos.x, cavePos.y + 0.7, cavePos.z), { rotation: [Math.PI / 2, 0, Math.PI / 4] });
    addMesh(worldGroup, new THREE.SphereGeometry(0.72, 12, 8), mat(0x111719), v3(cavePos.x, cavePos.y + 0.52, cavePos.z), { scale: [1, 0.8, 0.32] });
  }

  function buildGroundCover() {
    const grassCount = 2500, flowerCount = 420;
    const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.075, 0.42, 4), windMaterial(0xffffff, 0.18, 0.21), grassCount);
    const flowers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 5), windMaterial(0xffffff, 0.14, 0.09), flowerCount);
    const shrubs = new THREE.InstancedMesh(shared.sphere, mat(0xffffff), 680);
    const coverPatches = REGIONS.map((biome, region) => Array.from({ length: 7 }, (_, patch) => {
      let x = biome.x, y = biome.y;
      for (let attempt = 0; attempt < 12; attempt++) {
        x = biome.x + (random01(region * 811 + patch * 37 + attempt * 13 + 1901) - 0.5) * 540;
        y = biome.y + (random01(region * 821 + patch * 41 + attempt * 17 + 1931) - 0.5) * 420;
        if (x > 35 && x < WORLD - 35 && y > 35 && y < MAP_H - 35 && regionAt(x, y) === region) break;
      }
      return { x, y };
    }));
    const placeCover = (mesh, i, seed, scaleRange, palette, yOffset = 0.025) => {
      const region = i % REGIONS.length;
      const biome = REGIONS[region];
      const patch = coverPatches[region][Math.floor(random01(seed + 1991) * coverPatches[region].length)];
      let x = patch.x, y = patch.y;
      for (let attempt = 0; attempt < 18; attempt++) {
        x = patch.x + (random01(seed + attempt * 7 + 2031) - 0.5) * 210;
        y = patch.y + (random01(seed + attempt * 7 + 2131) - 0.5) * 180;
        if (x > 16 && x < WORLD - 16 && y > 16 && y < MAP_H - 16
          && regionAt(x, y) === region && distanceToPath(x, y) > 25
          && distanceToRiver(x, y) > 72 && Math.hypot(x - 800, y - 600) > 118) break;
      }
      const scale = scaleRange[0] + random01(seed + 2431) * (scaleRange[1] - scaleRange[0]);
      temp.position.copy(worldAt(x, y, terrainAt(x, y, yOffset)));
      temp.rotation.set(0, random01(seed + 2231) * Math.PI, (random01(seed + 2331) - 0.5) * 0.2);
      temp.scale.set(scale, scale, scale);
      temp.updateMatrix();
      mesh.setMatrixAt(i, temp.matrix);
      const color = palette[i % palette.length];
      mesh.setColorAt(i, new THREE.Color(color).multiplyScalar(0.82 + random01(seed + 2531) * 0.36));
    };
    for (let i = 0; i < grassCount; i++) placeCover(grass, i, i * 11, [0.45, 1.65], [0x647849, 0x899052, 0x9a965b, 0x536d43]);
    for (let i = 0; i < flowerCount; i++) placeCover(flowers, i, i * 17 + 401, [0.55, 1.5], [0xe8c86b, 0xe9e3cb, 0xd88772, 0xc3b4df, 0xd2a85d], 0.16);
    for (let i = 0; i < shrubs.count; i++) placeCover(shrubs, i, i * 19 + 1103, [0.18, 0.38], [0x496b43, 0x557747, 0x6d7647], 0.16);
    for (const mesh of [grass, flowers, shrubs]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      worldGroup.add(mesh);
    }
  }

  function buildTreesAndRocks() {
    const treeCount = 28;
    for (let regionIndex = 0; regionIndex < REGIONS.length; regionIndex++) {
      const biome = REGIONS[regionIndex];
      for (let i = 0; i < treeCount; i++) {
        const seed = regionIndex * 1009 + i * 37;
        let x = biome.x, y = biome.y, valid = false;
        for (let attempt = 0; attempt < 32; attempt++) {
          x = biome.x + (random01(seed + attempt * 13 + 20) - 0.5) * 620;
          y = biome.y + (random01(seed + attempt * 13 + 21) - 0.5) * 500;
          valid = x > 28 && x < WORLD - 28 && y > 28 && y < MAP_H - 28
            && regionAt(x, y) === regionIndex && distanceToPath(x, y) > 44
            && distanceToRiver(x, y) > 96 && Math.hypot(x - 800, y - 600) > 132
            && Math.hypot(x - 225, y - 300) > 42
            && colliders.every((obstacle) => Math.hypot(x - obstacle.x, y - obstacle.y) > obstacle.r + 34);
          if (valid) break;
        }
        if (!valid) continue;
        const p = worldAt(x, y, terrainAt(x, y, 0.02));
        const scale = 0.78 + random01(seed + 23) * 0.62;
        const isBroadleaf = random01(seed + 67) < (regionIndex === 2 ? 0.72 : regionIndex === 1 ? 0.08 : 0.42);
        const placements = importedTreePlacements[isBroadleaf ? 'broadleaf' : 'pine'];
        placements.push({
          position: p,
          rotationY: random01(seed + 31) * Math.PI * 2,
          scale,
          region: biome.name,
          biome: isBroadleaf ? 'woodland' : 'coniferous',
        });
        // Keep the original trunk-only collision footprint; imported canopies stay walk-through.
        colliders.push({ x, y, r: 7.5 * scale });
      }
    }

    const rockCount = 145;
    const rocks = new THREE.InstancedMesh(shared.rock, mat(0xffffff), rockCount);
    let placed = 0;
    for (let i = 0; i < rockCount; i++) {
      const region = i % REGIONS.length, biome = REGIONS[region], seed = i * 29 + 509;
      const sx = 0.52 + random01(seed + 3) * 0.9, sy = 0.34 + random01(seed + 4) * 0.55, sz = 0.5 + random01(seed + 5) * 0.78;
      const rockRadius = 0.55 * Math.max(sx, sz) * SCALE + 1;
      let x = biome.x, y = biome.y, valid = false;
      for (let attempt = 0; attempt < 24; attempt++) {
        x = biome.x + (random01(seed + attempt * 5 + 91) - 0.5) * 600;
        y = biome.y + (random01(seed + attempt * 5 + 92) - 0.5) * 480;
        valid = x > 18 && x < WORLD - 18 && y > 18 && y < MAP_H - 18
          && distanceToPath(x, y) > 36 && distanceToRiver(x, y) > 76
          && Math.hypot(x - 800, y - 600) > 118
          && Math.hypot(x - 225, y - 300) > 42
          && colliders.every((obstacle) => Math.hypot(x - obstacle.x, y - obstacle.y) > obstacle.r + rockRadius + 8);
        if (valid) break;
      }
      if (!valid) continue;
      const p = worldAt(x, y, terrainAt(x, y, sy * 0.28));
      temp.position.copy(p); temp.rotation.set(random01(seed + 6) * 0.6, random01(seed + 7) * Math.PI, random01(seed + 8) * 0.6);
      temp.scale.set(sx, sy, sz); temp.updateMatrix();
      rocks.setMatrixAt(placed, temp.matrix);
      rocks.setColorAt(placed, new THREE.Color([0x68706a, 0x817c70, 0x777e78, 0x625e60][i % 4]).multiplyScalar(0.82 + random01(seed + 9) * 0.32));
      // Match the dodecahedron's footprint rather than using one oversized radius.
      colliders.push({ x, y, r: 0.55 * Math.max(sx, sz) * SCALE + 1 });
      placed++;
    }
    rocks.count = placed; rocks.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
    rocks.castShadow = true; rocks.receiveShadow = true; worldGroup.add(rocks);
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

  function buildAmbientEffects() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(ambientPositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(ambientColors, 3));
    const material = new THREE.PointsMaterial({ size: 0.13, vertexColors: true, transparent: true, opacity: 0.56, depthWrite: false, sizeAttenuation: true });
    ambientPointObject = new THREE.Points(geometry, material);
    ambientPointObject.frustumCulled = false;
    scene.add(ambientPointObject);
    for (let i = 0; i < 36; i++) {
      const firefly = i < 12;
      const particle = {
        x: 225 + (random01(i + 5301) - 0.5) * 650,
        y: 300 + (random01(i + 5327) - 0.5) * 520,
        phase: random01(i + 5353) * Math.PI * 2,
        firefly,
        altitude: firefly ? 0.55 + random01(i + 5379) * 1.25 : 0.25 + random01(i + 5401) * 0.9,
        color: new THREE.Color(firefly ? 0xe7ee9b : 0xb4bbb5),
      };
      ambientPoints.push(particle);
    }
  }

  buildEnvironment();

  const environmentAssets = new EnvironmentAssetManager(worldGroup, {
    onStatus: ({ state, id, loaded = 0, total = 0, error }) => {
      const status = ui.assetStatus;
      status.hidden = false;
      if (state === 'loading') {
        const progress = total > 0 ? ` · ${Math.round((loaded / total) * 100)}%` : '';
        status.textContent = `Loading ${id}${progress}`;
      } else if (state === 'loaded') {
        status.textContent = `Environment model ready · ${id}`;
        window.setTimeout(() => { status.hidden = true; }, 4000);
      } else if (state === 'error') {
        status.textContent = `Environment model failed to load: ${error?.message || 'unknown error'}`;
      }
    },
  });
  const legacyTreePlacements = [
    { x: 360, y: 190, rotationY: 0.4, scale: 1, region: 'Verdant Reach', biome: 'woodland' },
    { x: 390, y: 365, rotationY: 2.1, scale: 0.88, region: 'Verdant Reach', biome: 'woodland' },
  ].map(({ x, y, ...placement }) => ({
    ...placement,
    position: worldAt(x, y, terrainAt(x, y, 0.02)),
  }));
  const treeAssets = [
    ['./public/assets/environment/broadleaf-tree.glb', importedTreePlacements.broadleaf, { id: 'stefan-detailed-broadleaf', height: 4.8 }],
    ['./public/assets/environment/low-poly-pine.glb', importedTreePlacements.pine, { id: 'afloat-low-poly-pine', height: 4.9 }],
    ['./public/assets/environment/stylized-tree.glb', legacyTreePlacements, { id: 'lowlypoly-stylized-tree', height: 4.2 }],
  ];
  for (const [url, placements, options] of treeAssets) {
    environmentAssets.place(url, placements, options)
      .catch((error) => console.error(`Unable to load environment model ${options.id}:`, error));
  }

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
    group.position.set(p.x, p.y, p.z);
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
    group.position.set(p.x, p.y, p.z);
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
      model.root.position.set(p.x, p.y, p.z);
      actorGroup.add(model.root);
      enemy.model = model;
    }
    for (const boss of bosses) {
      const model = createSlimeModel(true, boss.region);
      const p = worldAt(boss.x, boss.y);
      model.root.position.set(p.x, p.y, p.z);
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
    while (objectGroup.children.length) objectGroup.remove(objectGroup.children[0]);
    const start = { x: 225, y: 300 };
    hero = { x: start.x, y: start.y, vx: 0, vy: 0, faceX: 1, faceY: 0, targetYaw: Math.PI / 4, hp: 5, invuln: 0, attack: 0, attackCd: 0, attackHit: false, jumpHeight: 0, jumpVelocity: 0, jumpPhase: 'grounded', jumpTimer: 0, landing: 0, gaitPhase: 0, moveBlend: 0, runBlend: 0, idleTime: 0, checkpoint: { ...start }, model: createHeroModel() };
    actorGroup.add(hero.model.root);
    enemies = []; coins = []; checkpoints = []; gates = []; bosses = []; particles = []; keysFound = 0;
    const enemyOffsets = [[[-78, -42], [72, 58], [18, 105]], [[-70, -45], [82, 45], [34, 96]], [[-80, -38], [65, 50], [22, -95]], [[-85, 38], [70, -50], [18, 104]], [[-70, -45], [78, 42], [22, 105]]];
    const coinOffsets = [[[-105, 25], [85, -75], [115, 82]], [[-110, 30], [96, -72], [85, 95]], [[-105, 25], [92, -85], [112, 80]], [[-115, -75], [105, 35], [30, 125]], [[-105, 25], [100, -78], [110, 78]]];
    REGIONS.forEach((region, r) => {
      for (const [dx, dy] of enemyOffsets[r]) enemies.push({ x: region.x + dx, y: region.y + dy, homeX: region.x + dx, homeY: region.y + dy, hp: 2, alive: true, phase: r * 13 + dx });
      for (const [dx, dy] of coinOffsets[r]) coins.push({ x: region.x + dx, y: region.y + dy, taken: false, phase: (r * 3 + dx) * 0.04 });
      const camp = r === 0 ? start : { x: region.x - 85, y: region.y + 55 };
      checkpoints.push({ ...camp, active: r === 0 });
      const bossX = region.x, bossY = region.y;
      bosses.push({ x: bossX, y: bossY, homeX: bossX, homeY: bossY, hp: 4, maxHp: 4, alive: true, region: r, hitCd: 0 });
      gates.push({ x: region.x + 82, y: region.y + 58, open: false, region: r });
    });
    createWorldObjects();
    updateHUD();
    updateQuest();
    placeHero();
  }

  function placeHero() {
    const p = worldAt(hero.x, hero.y);
    const hurtBob = hero.invuln > 0 ? 0.025 * Math.sin(elapsed * 28) : 0;
    hero.model.root.position.set(p.x, p.y + hero.jumpHeight + hurtBob, p.z);
  }

  function updateHUD() {
    ui.hearts.innerHTML = Array.from({ length: 5 }, (_, i) => `<span class="${i >= hero.hp ? 'empty' : ''}">♥</span>`).join('');
    ui.coins.textContent = coins.filter((coin) => coin.taken).length;
    ui.keyCount.textContent = `${keysFound}/5 keys`;
  }
  function updateQuest() {
    const region = regionAt(hero.x, hero.y), boss = bosses[region];
    ui.questName.textContent = REGIONS[region].name.toUpperCase();
    ui.questText.textContent = boss?.alive ? `Defeat ${REGIONS[region].boss} and claim the key` : (region === REGIONS.length - 1 ? 'Reach the portal home' : 'Key claimed · explore the connected lands');
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

  function updateEnvironmentMotion(dt) {
    windClock.value += dt;
    hemi.intensity = 2 + Math.sin(windClock.value * 0.12) * 0.025;
    sun.intensity = 3.2 + Math.sin(windClock.value * 0.12 + 0.8) * 0.035;

    if (waterGlints) {
      const positions = waterGlints.geometry.attributes.position.array;
      waterGlints.seeds.forEach((glint, i) => {
        const y = (glint.y + windClock.value * glint.speed) % MAP_H;
        const centerX = riverX(y) + glint.across + Math.sin(windClock.value * 0.7 + glint.phase) * 4;
        const halfLength = glint.length * 0.5;
        for (let end = 0; end < 2; end++) {
          const along = end === 0 ? -halfLength : halfLength;
          const x = centerX + riverX(y + along) - riverX(y);
          const flowY = (y + along + MAP_H) % MAP_H;
          const p = worldAt(x, flowY, terrainHeight(x, flowY) + 0.075);
          const offset = (i * 2 + end) * 3;
          positions[offset] = p.x; positions[offset + 1] = p.y; positions[offset + 2] = p.z;
        }
      });
      waterGlints.geometry.attributes.position.needsUpdate = true;
    }

    for (let i = 0; i < ambientPoints.length; i++) {
      const particle = ambientPoints[i];
      const spanX = 920, spanY = 720;
      particle.x += (particle.firefly ? 0.7 : 2.2) * dt;
      particle.y += Math.sin(windClock.value * 0.34 + particle.phase) * (particle.firefly ? 2.6 : 1.5) * dt;
      if (particle.x < hero.x - spanX / 2) particle.x += spanX;
      if (particle.x > hero.x + spanX / 2) particle.x -= spanX;
      if (particle.y < hero.y - spanY / 2) particle.y += spanY;
      if (particle.y > hero.y + spanY / 2) particle.y -= spanY;
      particle.x = THREE.MathUtils.clamp(particle.x, 8, WORLD - 8);
      particle.y = THREE.MathUtils.clamp(particle.y, 8, MAP_H - 8);
      const bob = Math.sin(windClock.value * (particle.firefly ? 1.3 : 0.55) + particle.phase);
      const height = terrainHeight(particle.x, particle.y) + particle.altitude + bob * (particle.firefly ? 0.14 : 0.04);
      const p = worldAt(particle.x, particle.y, height);
      const offset = i * 3;
      ambientPositions[offset] = p.x; ambientPositions[offset + 1] = p.y; ambientPositions[offset + 2] = p.z;
      const glow = particle.firefly ? 0.32 + (0.5 + 0.5 * Math.sin(windClock.value * 2.1 + particle.phase)) * 0.48 : 0.42;
      ambientColors[offset] = particle.color.r * glow;
      ambientColors[offset + 1] = particle.color.g * glow;
      ambientColors[offset + 2] = particle.color.b * glow;
    }
    if (ambientPointObject) {
      ambientPointObject.geometry.attributes.position.needsUpdate = true;
      ambientPointObject.geometry.attributes.color.needsUpdate = true;
    }
  }

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
    if (y < radius || y > MAP_H - radius || x < radius || x > WORLD - radius) return true;
    for (const obstacle of colliders) {
      const dx = x - obstacle.x, dy = y - obstacle.y;
      const reach = radius + obstacle.r;
      if (dx * dx + dy * dy < reach * reach) return true;
    }
    if (inRiver(x, y)) return true;
    for (const gate of gates) {
      if (!gate.open && Math.abs(x - gate.x) < radius + 16 && Math.abs(y - gate.y) < 72) return true;
    }
    return false;
  }

  function findFreePosition(x, y, radius) {
    if (!blocked(x, y, radius)) return { x, y };
    for (let distance = 8; distance <= 144; distance += 8) {
      for (let sample = 0; sample < 20; sample++) {
        const angle = sample * Math.PI / 10;
        const candidate = { x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance };
        if (!blocked(candidate.x, candidate.y, radius)) return candidate;
      }
    }
    return null;
  }

  function moveWithCollision(actor, dx, dy, radius = 12) {
    if (blocked(actor.x, actor.y, radius)) {
      const safe = actor.safeX !== undefined && !blocked(actor.safeX, actor.safeY, radius)
        ? { x: actor.safeX, y: actor.safeY }
        : findFreePosition(actor.x, actor.y, radius);
      if (safe) { actor.x = safe.x; actor.y = safe.y; }
      actor.vx = 0; actor.vy = 0;
      if (blocked(actor.x, actor.y, radius)) return;
    }
    actor.safeX = actor.x; actor.safeY = actor.y;

    const oldX = actor.x, oldY = actor.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
    const stepX = dx / steps, stepY = dy / steps;
    let hitX = false, hitY = false;
    for (let step = 0; step < steps; step++) {
      const x = actor.x, y = actor.y;
      const nextX = x + stepX, nextY = y + stepY;
      if (!blocked(nextX, nextY, radius)) {
        actor.x = nextX; actor.y = nextY;
        actor.safeX = actor.x; actor.safeY = actor.y;
        continue;
      }

      // Try both axes independently so a collision on one side never cancels sliding on the other.
      const axes = Math.abs(stepX) >= Math.abs(stepY) ? ['x', 'y'] : ['y', 'x'];
      let moved = false;
      for (const axis of axes) {
        const candidateX = actor.x + (axis === 'x' ? stepX : 0);
        const candidateY = actor.y + (axis === 'y' ? stepY : 0);
        if (!blocked(candidateX, candidateY, radius)) {
          actor.x = candidateX; actor.y = candidateY;
          if (axis === 'x') hitY = true; else hitX = true;
          moved = true;
        }
      }

      // At rounded corners, project the remaining motion onto a nearby circle's tangent.
      if (!moved) {
        let best = null, bestProgress = 0;
        for (const obstacle of colliders) {
          let nx = x - obstacle.x, ny = y - obstacle.y;
          const distance = Math.hypot(nx, ny) || 1;
          const reach = radius + obstacle.r;
          if (distance > reach + 6) continue;
          nx /= distance; ny /= distance;
          const intoSurface = stepX * nx + stepY * ny;
          if (intoSurface >= 0) continue;
          const tangentX = stepX - nx * intoSurface;
          const tangentY = stepY - ny * intoSurface;
          const candidateX = x + tangentX, candidateY = y + tangentY;
          const progress = tangentX * stepX + tangentY * stepY;
          if (progress > bestProgress && !blocked(candidateX, candidateY, radius)) {
            best = { x: candidateX, y: candidateY };
            bestProgress = progress;
          }
        }
        if (best) { actor.x = best.x; actor.y = best.y; moved = true; }
      }
      if (!moved) { hitX = true; hitY = true; }
      if (!blocked(actor.x, actor.y, radius)) { actor.safeX = actor.x; actor.safeY = actor.y; }
    }

    if (hitX && actor.vx * dx > 0) actor.vx = 0;
    if (hitY && actor.vy * dy > 0) actor.vy = 0;
    if (actor.x === oldX) actor.vx *= 0.15;
    if (actor.y === oldY) actor.vy *= 0.15;
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
    const region = regionAt(hero.x, hero.y), boss = bosses[region];
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
    updateEnvironmentMotion(dt);
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
      coin.group.position.y = terrainAt(coin.x, coin.y, 0.95 + Math.sin(elapsed * 3.2 + coin.phase) * 0.11);
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
      const p = worldAt(enemy.x, enemy.y); enemy.model.root.position.set(p.x, p.y + Math.abs(Math.sin(elapsed * 6 + enemy.phase)) * 0.09, p.z);
      enemy.model.root.scale.y = 0.94 + Math.abs(Math.sin(elapsed * 6 + enemy.phase)) * 0.12;
      dx = hero.x - enemy.x; dy = hero.y - enemy.y; distance = Math.hypot(dx, dy);
      if (hero.attack > 0 && distance < 62) attackTargets();
      else if (distance < 29 && hero.invuln <= 0) { hero._hitX = enemy.x; hero._hitY = enemy.y; hurt(); }
    }
    const region = regionAt(hero.x, hero.y), boss = bosses[region], gate = gates[region];
    if (boss?.alive) {
      boss.hitCd = Math.max(0, boss.hitCd - dt);
      const dx = hero.x - boss.x, dy = hero.y - boss.y, distance = Math.hypot(dx, dy) || 1;
      if (distance > 54) {
        boss.x += dx / distance * 38 * dt; boss.y += dy / distance * 38 * dt;
        boss.x = Math.max(boss.homeX - 48, Math.min(boss.homeX + 48, boss.x));
        boss.y = Math.max(35, Math.min(MAP_H - 35, boss.y));
      }
      const p = worldAt(boss.x, boss.y); boss.model.root.position.set(p.x, p.y + Math.abs(Math.sin(elapsed * 3.3)) * 0.1, p.z);
      boss.model.root.rotation.y = Math.atan2((hero.x - boss.x) * rightAxis.x + (hero.y - boss.y) * depthAxis.x, (hero.x - boss.x) * rightAxis.z + (hero.y - boss.y) * depthAxis.z);
      if (hero.attack > 0 && distance < 82 && boss.hitCd <= 0) attackTargets();
      else if (distance < 43 && hero.invuln <= 0) { hero._hitX = boss.x; hero._hitY = boss.y; hurt(); }
    } else if (gate) gate.open = true;

    updateParticles(dt);
    const target = worldAt(hero.x, hero.y, terrainAt(hero.x, hero.y, 0.25));
    const follow = 1 - Math.exp(-dt * 4.2);
    const cameraOffset = depthAxis.clone().multiplyScalar(23.5 * Math.cos(35 * Math.PI / 180));
    const lookTarget = target.clone().add(v3(0, 0.45, 0));
    camera.position.lerp(lookTarget.clone().add(cameraOffset).add(v3(0, 23.5 * Math.sin(35 * Math.PI / 180), 0)), follow);
    camera.lookAt(lookTarget);
    const biome = REGIONS[regionAt(hero.x, hero.y)];
    scene.background.setHex(biome.sky); scene.fog.color.setHex(biome.sky);
    updateQuest();
    const homeGate = gates[REGIONS.length - 1];
    if (keysFound === REGIONS.length && Math.hypot(hero.x - homeGate.x, hero.y - homeGate.y) < 44) {
      screen = 'win'; ui.eyebrow.textContent = 'THE PROPHECY FULFILLED'; ui.title.textContent = 'The Way Home';
      ui.message.textContent = 'The fifth key turns in the ancient portal. Its light opens onto the familiar forest where your journey began. You have saved five nations—and found your way home.';
      ui.start.textContent = 'PLAY AGAIN'; ui.hint.textContent = 'Five nations · Five guardians · Five keys'; ui.overlay.classList.remove('hidden');
    }
  }

  const perfSamples = [];
  let previousFrameTime = null;
  if (new URLSearchParams(location.search).has('perf')) {
    window.__gamePerf = {
      samples: perfSamples,
      state: () => ({ screen, hp: hero.hp, checkpoint: { ...hero.checkpoint }, bosses: bosses.map((boss) => ({ hp: boss.hp, alive: boss.alive })), gates: gates.map((gate) => gate.open), keysFound }),
      setQuality: ({ shadows = renderer.shadowMap.enabled, pixelRatio = renderer.getPixelRatio() } = {}) => {
        renderer.shadowMap.enabled = shadows;
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(width, height, false);
      },
      treeInstances: () => environmentAssets.instances.size,
      treeMeshes: () => {
        let count = 0;
        for (const root of environmentAssets.instances) root.traverse((object) => { if (object.isMesh) count++; });
        return count;
      },
      clearSamples: () => { perfSamples.length = 0; previousFrameTime = null; },
      snapshot: () => {
        const frames = perfSamples.map((sample) => sample.frameMs).filter(Number.isFinite).sort((a, b) => a - b);
        const percentile = (fraction) => frames.length ? frames[Math.min(frames.length - 1, Math.floor((frames.length - 1) * fraction))] : null;
        const elapsed = perfSamples.length > 1 ? perfSamples.at(-1).time - perfSamples[0].time : 0;
        return {
          fps: elapsed > 0 ? (perfSamples.length - 1) * 1000 / elapsed : null,
          frameMsP50: percentile(0.5),
          frameMsP95: percentile(0.95),
          sampleCount: frames.length,
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          treeInstances: environmentAssets.instances.size,
          treeMeshes: window.__gamePerf.treeMeshes(),
          position: hero ? [Math.round(hero.x), Math.round(hero.y)] : null,
        };
      },
      moveTo: (x, y) => {
        hero.x = x; hero.y = y; hero.vx = hero.vy = 0;
        const target = worldAt(x, y, terrainAt(x, y, 0.25));
        const lookTarget = target.clone().add(v3(0, 0.45, 0));
        camera.position.copy(lookTarget).add(depthAxis.clone().multiplyScalar(23.5 * Math.cos(35 * Math.PI / 180))).add(v3(0, 23.5 * Math.sin(35 * Math.PI / 180), 0));
        camera.lookAt(lookTarget);
      },
    };
  }
  function render(now) {
    const frameMs = previousFrameTime === null ? null : Math.max(0, now - previousFrameTime);
    previousFrameTime = now;
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000));
    last = now;
    const updateStart = performance.now();
    update(dt);
    const updateMs = performance.now() - updateStart;
    const renderStart = performance.now();
    renderer.render(scene, camera);
    const renderMs = performance.now() - renderStart;
    if (window.__gamePerf) {
      perfSamples.push({ time: now, frameMs, updateMs, renderMs, dt, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
      if (perfSamples.length > 120) perfSamples.shift();
    }
    requestAnimationFrame(render);
  }
  reset();
  // Place the opening scene with its orthographic camera already framed around the hero.
  const initialTarget = worldAt(hero.x, hero.y, terrainAt(hero.x, hero.y, 0.25));
  camera.position.copy(initialTarget).add(depthAxis.clone().multiplyScalar(23.5 * Math.cos(35 * Math.PI / 180))).add(v3(0, 23.5 * Math.sin(35 * Math.PI / 180), 0));
  camera.lookAt(initialTarget);
  requestAnimationFrame(render);
})();
