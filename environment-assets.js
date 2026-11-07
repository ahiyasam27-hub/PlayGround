import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Loads, normalizes, caches, and places static GLTF environment assets. */
export class EnvironmentAssetManager {
  constructor(scene, { onStatus = () => {} } = {}) {
    this.scene = scene;
    this.onStatus = onStatus;
    this.loader = new GLTFLoader();
    this.cache = new Map();
    this.instances = new Set();
  }

  async load(url, { id = url, height = 3.8 } = {}) {
    if (this.cache.has(id)) return this.cache.get(id);
    this.onStatus({ state: 'loading', id, url, loaded: 0, total: 0 });
    const task = this.loader.loadAsync(url, (event) => {
      this.onStatus({ state: 'loading', id, url, loaded: event.loaded, total: event.total || 0 });
    }).then((gltf) => {
      const source = gltf.scene;
      source.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(source);
      const size = bounds.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.y) || size.y <= 0) throw new Error(`Model has no usable height: ${url}`);
      const center = bounds.getCenter(new THREE.Vector3());
      const normalized = new THREE.Group();
      normalized.name = id;
      source.scale.multiplyScalar(height / size.y);
      source.position.set(-center.x * height / size.y, -bounds.min.y * height / size.y, -center.z * height / size.y);
      source.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = true;
        object.userData.assetId = id;
      });
      normalized.add(source);
      normalized.userData.assetId = id;
      normalized.userData.sourceUrl = url;
      this.onStatus({ state: 'loaded', id, url, loaded: 1, total: 1 });
      return normalized;
    }).catch((error) => {
      this.cache.delete(id);
      this.onStatus({ state: 'error', id, url, error });
      throw error;
    });
    this.cache.set(id, task);
    return task;
  }

  async place(url, placements, options = {}) {
    const template = await this.load(url, options);
    return placements.map((placement) => {
      const instance = template.clone(true);
      const { position, rotationY = 0, scale = 1, region, biome } = placement;
      instance.position.copy(position);
      instance.rotation.y = rotationY;
      instance.scale.setScalar(scale);
      instance.userData = {
        ...instance.userData,
        assetId: options.id || url,
        region,
        biome,
      };
      this.scene.add(instance);
      this.instances.add(instance);
      return instance;
    });
  }

  remove(instance) {
    this.scene.remove(instance);
    this.instances.delete(instance);
  }
}
