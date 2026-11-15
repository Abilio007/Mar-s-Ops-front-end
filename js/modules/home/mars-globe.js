import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { appState } from '../../core/state.js';
import { clamp, latLonToVector3Args } from '../../utils/helpers.js';
import marsGlobeTextureUrl from '../../../3D_GLOBE/public/textures/2k_mars.jpg';

const GLOBE_RADIUS = 1.65;

// Reusable math helpers outside render loop (zero GC churn)
const _targetCamPos = new THREE.Vector3();
const _currentDir = new THREE.Vector3();
const _desiredDir = new THREE.Vector3();
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();

let cachedIsSoftwareGl = null;
function detectSoftwareWebGL() {
  if (cachedIsSoftwareGl !== null) return cachedIsSoftwareGl;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
      cachedIsSoftwareGl = true;
      return true;
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cachedIsSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    return cachedIsSoftwareGl;
  } catch {
    cachedIsSoftwareGl = true;
    return true;
  }
}

/**
 * Deterministic pseudo-noise for realistic procedural Martian terrain.
 */
function hash2D(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash2D(ix, iy);
  const b = hash2D(ix + 1, iy);
  const c = hash2D(ix, iy + 1);
  const d = hash2D(ix + 1, iy + 1);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x, y, octaves = 4) {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * valueNoise(x * freq, y * freq);
    freq *= 2.02;
    amp *= 0.5;
  }
  return value;
}

let cachedMarsCanvases = null;

function getMarsCanvases() {
  if (cachedMarsCanvases) return cachedMarsCanvases;

  const width = 768;
  const height = 384;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = width;
  albedoCanvas.height = height;
  const albedoCtx = albedoCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bumpCtx = bumpCanvas.getContext('2d');

  const albedoData = albedoCtx.createImageData(width, height);
  const bumpData = bumpCtx.createImageData(width, height);
  const elevationField = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    const v = y / height;
    const latDeg = (0.5 - v) * 180;

    for (let x = 0; x < width; x++) {
      const u = x / width;
      const lonDeg = u * 360 - 180;

      const angle = u * Math.PI * 2;
      const nx = Math.cos(angle) * 2.4 + 4.2;
      const ny = Math.sin(angle) * 2.4 + 4.2;
      const nz = v * 4.8;

      const baseNoise = fbm(nx + nz * 0.35, ny + nz * 0.75, 4);
      const fineNoise = fbm(nx * 3.8, ny * 3.8 + nz * 2.1, 2);

      let elevation = baseNoise * 0.65 + fineNoise * 0.25;
      let darkBasalt = 0;

      // Syrtis Major
      const dSyrtis = Math.hypot((latDeg - 8) / 28, (lonDeg - 68) / 22);
      if (dSyrtis < 1.3) darkBasalt += (1 - dSyrtis / 1.3) * 0.55;

      // Acidalia Planitia
      const dAcidalia = Math.hypot((latDeg - 46) / 24, (lonDeg + 22) / 34);
      if (dAcidalia < 1.2) darkBasalt += (1 - dAcidalia / 1.2) * 0.42;

      // Mare Erythraeum
      const dEryth = Math.hypot((latDeg + 24) / 20, (lonDeg + 30) / 48);
      if (dEryth < 1.2) darkBasalt += (1 - dEryth / 1.2) * 0.45;

      // Valles Marineris
      if (lonDeg > -88 && lonDeg < -34) {
        const canyonDist = Math.abs(latDeg + 13.5 + Math.sin(lonDeg * 0.12) * 1.8);
        if (canyonDist < 3.6) {
          const canyonFactor = 1 - canyonDist / 3.6;
          elevation -= canyonFactor * 0.58;
          darkBasalt += canyonFactor * 0.35;
        }
      }

      // Olympus Mons
      const dOlympus = Math.hypot(latDeg - 18.65, lonDeg + 133.8);
      if (dOlympus < 11) elevation += (1 - dOlympus / 11) * 0.68;

      // Hellas Basin
      const dHellas = Math.hypot((latDeg + 42.4) / 18, (lonDeg - 70.5) / 24);
      if (dHellas < 1.0) elevation -= (1 - dHellas) * 0.36;

      elevationField[y * width + x] = elevation;

      let r = 178 + baseNoise * 56 - darkBasalt * 86 + (fineNoise - 0.5) * 24;
      let g = 82 + baseNoise * 44 - darkBasalt * 46 + (fineNoise - 0.5) * 16;
      let b = 46 + baseNoise * 26 - darkBasalt * 22 + (fineNoise - 0.5) * 10;

      if (elevation > 0.65) {
        const dust = (elevation - 0.65) * 1.4;
        r += dust * 36;
        g += dust * 26;
        b += dust * 16;
      }

      const iceThreshold = 77 + (baseNoise - 0.5) * 8;
      if (Math.abs(latDeg) > iceThreshold) {
        const iceBlend = clamp((Math.abs(latDeg) - iceThreshold) / 7, 0, 1);
        r += (236 - r) * iceBlend;
        g += (232 - g) * iceBlend;
        b += (228 - b) * iceBlend;
      }

      const idx = (y * width + x) * 4;
      albedoData.data[idx] = clamp(Math.round(r), 0, 255);
      albedoData.data[idx + 1] = clamp(Math.round(g), 0, 255);
      albedoData.data[idx + 2] = clamp(Math.round(b), 0, 255);
      albedoData.data[idx + 3] = 255;
    }
  }

  // Fast bounding-box crater pass (900x faster than per-pixel crater scan)
  for (let i = 0; i < 110; i++) {
    const cx = Math.floor(hash2D(i * 1.3, 4.7) * width);
    const cy = Math.floor((0.12 + hash2D(i * 2.1, 9.2) * 0.76) * height);
    const rPx = Math.max(3, Math.round((0.006 + hash2D(i * 5.7, 3.1) * 0.028) * height));
    const depth = 0.4 + hash2D(i * 3.9, 7.4) * 0.6;

    for (let dy = -rPx; dy <= rPx; dy++) {
      const py = cy + dy;
      if (py < 0 || py >= height) continue;
      for (let dx = -rPx; dx <= rPx; dx++) {
        const dist = Math.hypot(dx, dy);
        if (dist >= rPx) continue;
        const px = (cx + dx + width) % width;
        const norm = dist / rPx;
        const delta =
          norm > 0.78
            ? (1 - (norm - 0.78) / 0.22) * 0.14 * depth
            : -(1 - norm / 0.78) * 0.18 * depth;

        const pIdx = py * width + px;
        elevationField[pIdx] = clamp(elevationField[pIdx] + delta, 0, 1);

        const cIdx = pIdx * 4;
        const shade = delta * 95;
        albedoData.data[cIdx] = clamp(Math.round(albedoData.data[cIdx] + shade), 0, 255);
        albedoData.data[cIdx + 1] = clamp(Math.round(albedoData.data[cIdx + 1] + shade * 0.75), 0, 255);
        albedoData.data[cIdx + 2] = clamp(Math.round(albedoData.data[cIdx + 2] + shade * 0.55), 0, 255);
      }
    }
  }

  for (let i = 0; i < width * height; i++) {
    const bumpVal = clamp(Math.round(elevationField[i] * 255), 0, 255);
    const idx = i * 4;
    bumpData.data[idx] = bumpVal;
    bumpData.data[idx + 1] = bumpVal;
    bumpData.data[idx + 2] = bumpVal;
    bumpData.data[idx + 3] = 255;
  }

  albedoCtx.putImageData(albedoData, 0, 0);
  bumpCtx.putImageData(bumpData, 0, 0);

  cachedMarsCanvases = { albedoCanvas, bumpCanvas };
  return cachedMarsCanvases;
}

function createProceduralMarsTextures(maxAnisotropy) {
  const { albedoCanvas, bumpCanvas } = getMarsCanvases();

  const albedoTexture = new THREE.CanvasTexture(albedoCanvas);
  albedoTexture.colorSpace = THREE.SRGBColorSpace;
  albedoTexture.anisotropy = maxAnisotropy;
  albedoTexture.wrapS = THREE.RepeatWrapping;

  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  bumpTexture.colorSpace = THREE.NoColorSpace;
  bumpTexture.anisotropy = maxAnisotropy;
  bumpTexture.wrapS = THREE.RepeatWrapping;

  return { albedoTexture, bumpTexture };
}

let cachedThumbUrl = null;
export function getMarsThumbnailDataUrl() {
  if (cachedThumbUrl) return cachedThumbUrl;
  const { albedoCanvas } = getMarsCanvases();
  const size = 96;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');

  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(albedoCanvas, 40, 20, 320, 320, 0, 0, size, size);

  // Spherical shadow shading matching solar key light
  const shade = ctx.createRadialGradient(size * 0.34, size * 0.32, size * 0.08, size * 0.5, size * 0.5, size * 0.54);
  shade.addColorStop(0, 'rgba(255, 220, 190, 0.16)');
  shade.addColorStop(0.55, 'rgba(0, 0, 0, 0.08)');
  shade.addColorStop(1, 'rgba(3, 6, 9, 0.88)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  cachedThumbUrl = c.toDataURL('image/png');
  return cachedThumbUrl;
}

function createOrbitEllipse(radiusX, radiusZ, color, opacity) {
  const pts = [];
  const segs = 128;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radiusX, 0, Math.sin(a) * radiusZ));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const loop = new THREE.LineLoop(geo, mat);
  loop.rotation.x = 0.24;
  loop.rotation.z = -0.12;
  return loop;
}

function createAtmosphereMesh() {
  const geo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.055, 64, 48);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color('#e9692c') },
      uRimColor: { value: new THREE.Color('#ff2929') },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uRimColor;
      varying vec3 vNormal;
      void main() {
        float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.2);
        vec3 col = mix(uColor, uRimColor, clamp(intensity, 0.0, 1.0));
        gl_FragColor = vec4(col, clamp(intensity * 0.72, 0.0, 0.65));
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

function createStarfield() {
  const count = 1400;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = 18 + Math.random() * 42;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const tint = Math.random();
    if (tint > 0.85) {
      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 0.76;
      colors[i * 3 + 2] = 0.62;
    } else if (tint > 0.65) {
      colors[i * 3] = 0.76;
      colors[i * 3 + 1] = 0.86;
      colors[i * 3 + 2] = 1.0;
    } else {
      colors[i * 3] = 0.94;
      colors[i * 3 + 1] = 0.95;
      colors[i * 3 + 2] = 0.98;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.085,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    sizeAttenuation: true,
  });

  return new THREE.Points(geo, mat);
}

export class MarsGlobe {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      autoRotate: options.autoRotate ?? true,
      showAtmosphere: options.showAtmosphere ?? true,
      reducedMotion: options.reducedMotion ?? false,
      markerFilter: options.markerFilter ?? 'all',
      selectedRegionId: options.selectedRegionId ?? null,
      onRegionSelect: options.onRegionSelect ?? null,
    };

    this.isSoftwareGl = detectSoftwareWebGL();
    this.disposed = false;
    this.frameId = 0;
    this.markerGroups = [];
    this.raycastTargets = [];
    this.routeGroup = new THREE.Group();
    this.focusDirection = null;
    this.focusDistance = null;
    this.isDragging = false;
    this.pointerDownPos = { x: 0, y: 0 };

    this._init();
  }

  _init() {
    if (!this.container) return;

    const width = Math.max(this.container.clientWidth || 320, 280);
    const height = Math.max(this.container.clientHeight || 320, 260);

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: !this.isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: true,
      });
    } catch (err) {
      this._renderFallback('WebGL indisponível neste dispositivo.');
      return;
    }

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 120);
    const aspect = width / height;
    const distScale = aspect < 0.9 ? clamp(0.95 / aspect, 1, 1.48) : 1;
    this.camera.position.set(0.6 * distScale, 1.15 * distScale, 4.75 * distScale);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableZoom = true;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 8.2;
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.72;
    this.controls.zoomSpeed = 0.85;

    this.controls.addEventListener('start', () => {
      this.focusDirection = null;
      this.focusDistance = null;
    });

    // Solar Key + Space Fill + Rim Lights
    const sunLight = new THREE.DirectionalLight('#fff2e2', 2.45);
    sunLight.position.set(5.5, 2.8, 4.5);
    this.scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight('#3b5570', '#180907', 0.62);
    this.scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight('#ff4c2e', 0.45);
    rimLight.position.set(-5.0, -1.5, -4.0);
    this.scene.add(rimLight);

    // Starfield
    this.starfield = createStarfield();
    this.scene.add(this.starfield);

    // Planet Group (rotates around Y axis)
    this.planetGroup = new THREE.Group();
    this.scene.add(this.planetGroup);

    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralMarsTextures(maxAnisotropy);

    const marsGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 72, 54);
    const marsMat = new THREE.MeshStandardMaterial({
      map: this.textures.albedoTexture,
      bumpMap: this.textures.bumpTexture,
      bumpScale: 0.032,
      roughness: 0.86,
      metalness: 0.04,
    });
    this.marsMesh = new THREE.Mesh(marsGeo, marsMat);
    this.planetGroup.add(this.marsMesh);
    this._loadGlobeTexture(maxAnisotropy);

    this.atmosphereMesh = createAtmosphereMesh();
    this.atmosphereMesh.visible = this.options.showAtmosphere;
    this.planetGroup.add(this.atmosphereMesh);

    this.orbitRing = createOrbitEllipse(GLOBE_RADIUS * 1.48, GLOBE_RADIUS * 1.48, '#a6b0b8', 0.28);
    this.scene.add(this.orbitRing);

    this.redOrbitRing = createOrbitEllipse(GLOBE_RADIUS * 1.18, GLOBE_RADIUS * 1.18, '#ff2929', 0.55);
    this.redOrbitRing.rotation.x = 0.68;
    this.redOrbitRing.visible = false;
    this.scene.add(this.redOrbitRing);

    this.markersGroupRoot = new THREE.Group();
    this.planetGroup.add(this.markersGroupRoot);
    this.planetGroup.add(this.routeGroup);

    this._buildMarkers();
    this.setMarkerFilter(this.options.markerFilter);
    this.setSelectedRegion(this.options.selectedRegionId, false);

    this.raycaster = new THREE.Raycaster();
    this.pointerNdc = new THREE.Vector2();

    this._bindEvents();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.clock = new THREE.Clock();
    this._tick();
  }

  _loadGlobeTexture(maxAnisotropy) {
    new THREE.TextureLoader().load(
      marsGlobeTextureUrl,
      (texture) => {
        if (this.disposed) {
          texture.dispose();
          return;
        }

        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = maxAnisotropy;
        texture.wrapS = THREE.RepeatWrapping;
        this.textures.albedoTexture.dispose();
        this.textures.albedoTexture = texture;
        this.marsMesh.material.map = texture;
        this.marsMesh.material.bumpMap = null;
        this.marsMesh.material.bumpScale = 0;
        this.marsMesh.material.needsUpdate = true;
      },
      undefined,
      (error) => {
        console.error('Unable to load the 3D_GLOBE Mars surface texture; keeping the procedural surface.', error);
      },
    );
  }

  _buildMarkers() {
    const ringGeo = new THREE.RingGeometry(0.032, 0.052, 24);
    const spireGeo = new THREE.ConeGeometry(0.018, 0.095, 10);
    const tipGeo = new THREE.SphereGeometry(0.022, 12, 12);
    const hitGeo = new THREE.SphereGeometry(0.11, 10, 10);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });

    appState.regions.forEach((region) => {
      const baseColor = '#F2A65A';

      const group = new THREE.Group();
      const [x, y, z] = latLonToVector3Args(region.lat, region.lon, GLOBE_RADIUS + 0.008);
      group.position.set(x, y, z);

      // Orient marker normal outward from planet center
      const normal = new THREE.Vector3(x, y, z).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      group.quaternion.setFromUnitVectors(up, normal);

      const ringMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      group.add(ring);

      const spireMat = new THREE.MeshStandardMaterial({
        color: baseColor,
        emissive: baseColor,
        emissiveIntensity: 0.55,
        roughness: 0.3,
        metalness: 0.2,
      });
      const spire = new THREE.Mesh(spireGeo, spireMat);
      spire.position.y = 0.048;
      group.add(spire);

      const tip = new THREE.Mesh(tipGeo, spireMat);
      tip.position.y = 0.1;
      group.add(tip);

      const hitCollider = new THREE.Mesh(hitGeo, hitMat);
      hitCollider.position.y = 0.06;
      hitCollider.userData.regionId = region.id;
      group.add(hitCollider);

      group.userData = {
        region,
        ring,
        spire,
        tip,
      };

      this.markersGroupRoot.add(group);
      this.markerGroups.push(group);
      this.raycastTargets.push(hitCollider);
    });
  }

  _bindEvents() {
    const canvas = this.renderer.domElement;

    this._onPointerDown = (e) => {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    this._onPointerUp = (e) => {
      const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
      if (dist > 6) return; // User dragged to rotate, not a tap/click

      const rect = canvas.getBoundingClientRect();
      this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.pointerNdc, this.camera);
      const visibleTargets = this.raycastTargets.filter((t) => t.parent?.visible);
      const hits = this.raycaster.intersectObjects(visibleTargets, false);

      if (hits.length > 0) {
        const regionId = hits[0].object.userData.regionId;
        this.setSelectedRegion(regionId, true);
        if (typeof this.options.onRegionSelect === 'function') {
          this.options.onRegionSelect(regionId);
        }
      }
    };

    this._onPointerMove = (e) => {
      if (this.isSoftwareGl) return;
      const rect = canvas.getBoundingClientRect();
      this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.pointerNdc, this.camera);
      const visibleTargets = this.raycastTargets.filter((t) => t.parent?.visible);
      const hits = this.raycaster.intersectObjects(visibleTargets, false);
      canvas.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
    };

    this._onContextLost = (e) => {
      e.preventDefault();
      cancelAnimationFrame(this.frameId);
      clearTimeout(this.frameId);
    };

    this._onContextRestored = () => {
      if (!this.disposed) this._tick();
    };

    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('webglcontextlost', this._onContextLost);
    canvas.addEventListener('webglcontextrestored', this._onContextRestored);

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this.container);
  }

  resize() {
    if (this.disposed || !this.renderer || !this.camera || !this.container) return;
    const width = Math.max(this.container.clientWidth, 260);
    const height = Math.max(this.container.clientHeight, 240);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  setAutoRotate(enabled) {
    this.options.autoRotate = Boolean(enabled);
  }

  setAtmosphereVisible(visible) {
    this.options.showAtmosphere = Boolean(visible);
    if (this.atmosphereMesh) {
      this.atmosphereMesh.visible = this.options.showAtmosphere;
    }
  }

  setMarkersVisible(visible) {
    if (this.markersGroupRoot) {
      this.markersGroupRoot.visible = Boolean(visible);
    }
  }

  setOrbitStyle(style = 'subtle') {
    if (this.orbitRing) {
      this.orbitRing.visible = style === 'subtle' || style === 'both';
    }
    if (this.redOrbitRing) {
      this.redOrbitRing.visible = style === 'red' || style === 'both';
    }
  }

  setInteractive(enabled) {
    if (this.controls) {
      this.controls.enabled = Boolean(enabled);
    }
    if (this.renderer?.domElement) {
      this.renderer.domElement.style.pointerEvents = enabled ? 'auto' : 'none';
    }
  }

  setOnRegionSelect(fn) {
    this.options.onRegionSelect = fn;
  }

  setOnFrame(fn) {
    this.onFrameCallback = fn;
  }

  getProjectedMarker(regionId, width, height) {
    const group = this.markerGroups.find((g) => g.userData.region.id === regionId);
    if (!group || !this.camera) return null;
    this.planetGroup.updateMatrixWorld(true);
    const worldPos = new THREE.Vector3();
    group.getWorldPosition(worldPos);

    // Hide callout if marker is on far side of planet relative to camera
    const toCam = _vA.copy(this.camera.position).normalize();
    const markerDir = _vB.copy(worldPos).normalize();
    if (markerDir.dot(toCam) < 0.08) {
      return { visible: false, x: 0, y: 0 };
    }

    const projected = worldPos.project(this.camera);
    return {
      visible: true,
      x: ((projected.x + 1) / 2) * width,
      y: (-(projected.y - 1) / 2) * height,
    };
  }

  setMarkerFilter(filter) {
    this.options.markerFilter = filter;
    this.markerGroups.forEach((group) => {
      group.visible = filter === 'all'
        || appState.alerts.some((alert) => alert.regionId === group.userData.region.id);
    });
  }

  setSelectedRegion(regionId, animateCamera = true) {
    this.options.selectedRegionId = regionId;
    this.markerGroups.forEach((group) => {
      const isSelected = group.userData.region.id === regionId;
      const scale = isSelected ? 1.45 : 1.0;
      group.scale.set(scale, scale, scale);
    });

    if (animateCamera) {
      this.focusDistance = null;
      const targetGroup = this.markerGroups.find((g) => g.userData.region.id === regionId);
      if (targetGroup) {
        this.planetGroup.updateMatrixWorld(true);
        const worldPos = new THREE.Vector3();
        targetGroup.getWorldPosition(worldPos);
        this.focusDirection = worldPos.normalize();
      }
    }
  }

  zoomBy(factor) {
    if (!this.camera || !this.controls) return;
    const dist = this.camera.position.length();
    const nextDist = clamp(dist * factor, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.setLength(nextDist);
    this.controls.update();
  }

  resetView() {
    this.focusDirection = null;
    this.focusDistance = null;
    if (this.camera && this.controls && this.container) {
      const w = Math.max(this.container.clientWidth, 260);
      const h = Math.max(this.container.clientHeight, 240);
      const aspect = w / h;
      const distScale = aspect < 0.9 ? clamp(0.95 / aspect, 1, 1.48) : 1;
      this.camera.position.set(0.6 * distScale, 1.15 * distScale, 4.75 * distScale);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
  }

  fitRouteToView(regionIds = []) {
    const regions = regionIds
      .map((id) => appState.regions.find((region) => region.id === id))
      .filter(Boolean);
    if (!this.camera || !this.controls || regions.length < 2) return;

    this.planetGroup.updateMatrixWorld(true);
    const directions = [];
    for (let index = 0; index < regions.length - 1; index++) {
      const start = new THREE.Vector3(...latLonToVector3Args(regions[index].lat, regions[index].lon, 1));
      const end = new THREE.Vector3(...latLonToVector3Args(regions[index + 1].lat, regions[index + 1].lon, 1));
      this.planetGroup.localToWorld(start).normalize();
      this.planetGroup.localToWorld(end).normalize();

      for (let segment = 0; segment <= 24; segment++) {
        const direction = new THREE.Vector3().lerpVectors(start, end, segment / 24);
        if (direction.lengthSq() > 1e-8) directions.push(direction.normalize());
      }
    }

    if (!directions.length) return;
    const center = directions.reduce((sum, direction) => sum.add(direction), new THREE.Vector3());
    if (center.lengthSq() < 1e-8) center.copy(directions[0]);
    center.normalize();

    const maxAngle = directions.reduce(
      (max, direction) => Math.max(max, Math.acos(clamp(center.dot(direction), -1, 1))),
      0,
    );
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const halfViewTangent = Math.min(Math.tan(halfFov), Math.tan(halfFov) * this.camera.aspect) * 0.78;
    const desiredDistance = GLOBE_RADIUS * Math.cos(maxAngle)
      + (GLOBE_RADIUS * Math.sin(maxAngle)) / Math.max(halfViewTangent, 0.01);

    this.focusDirection = center;
    this.focusDistance = clamp(desiredDistance, this.controls.minDistance, this.controls.maxDistance);
  }

  /**
   * Renders a great-circle route trajectory across ordered region IDs.
   */
  setRoute(regionIds = []) {
    while (this.routeGroup.children.length > 0) {
      const child = this.routeGroup.children[0];
      child.geometry?.dispose();
      child.material?.dispose();
      this.routeGroup.remove(child);
    }

    const regions = regionIds
      .map((id) => appState.regions.find((region) => region.id === id))
      .filter(Boolean);

    if (regions.length < 2) return;

    const routeColor = '#56C8C1';

    for (let i = 0; i < regions.length - 1; i++) {
      const start = regions[i];
      const end = regions[i + 1];

      const [x1, y1, z1] = latLonToVector3Args(start.lat, start.lon, 1);
      const [x2, y2, z2] = latLonToVector3Args(end.lat, end.lon, 1);
      _vA.set(x1, y1, z1).normalize();
      _vB.set(x2, y2, z2).normalize();

      const arcPoints = [];
      const segments = 44;
      for (let s = 0; s <= segments; s++) {
        const t = s / segments;
        const pt = new THREE.Vector3().copy(_vA).lerp(_vB, t).normalize();
        const altitudeLift = Math.sin(t * Math.PI) * 0.14;
        pt.multiplyScalar(GLOBE_RADIUS + 0.03 + altitudeLift);
        arcPoints.push(pt);
      }

      const curve = new THREE.CatmullRomCurve3(arcPoints);
      const tubeGeo = new THREE.TubeGeometry(curve, 44, 0.016, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: routeColor,
        transparent: true,
        opacity: 0.92,
      });
      this.routeGroup.add(new THREE.Mesh(tubeGeo, tubeMat));
    }

    // Add waypoint indicator spheres
    regions.forEach((reg, idx) => {
      const [wx, wy, wz] = latLonToVector3Args(reg.lat, reg.lon, GLOBE_RADIUS + 0.045);
      const wpGeo = new THREE.SphereGeometry(idx === 0 || idx === regions.length - 1 ? 0.045 : 0.034, 12, 12);
      const wpMat = new THREE.MeshBasicMaterial({
        color: idx === 0 ? '#E9692C' : idx === regions.length - 1 ? '#78E62E' : '#F5F5F5',
      });
      const wpMesh = new THREE.Mesh(wpGeo, wpMat);
      wpMesh.position.set(wx, wy, wz);
      this.routeGroup.add(wpMesh);
    });
  }

  _afterDraw(cb) {
    const gl = this.renderer.getContext();
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  _tick = () => {
    if (this.disposed) return;

    const delta = Math.min(this.clock.getDelta(), 0.1);

    // Continuous smooth planet rotation around Y axis
    if (this.options.autoRotate && !this.options.reducedMotion && !this.focusDirection && this.focusDistance === null) {
      this.planetGroup.rotation.y += delta * 0.11;
    }

    if (this.focusDirection || this.focusDistance !== null) {
      const dist = this.camera.position.length();
      const alpha = 1 - Math.exp(-5.5 * delta);
      const nextDistance = this.focusDistance === null
        ? dist
        : dist + (this.focusDistance - dist) * alpha;
      _currentDir.copy(this.camera.position).normalize();
      if (this.focusDirection) {
        _desiredDir.copy(this.focusDirection).normalize();
        _currentDir.lerp(_desiredDir, alpha).normalize();
      }
      _targetCamPos.copy(_currentDir).multiplyScalar(nextDistance);
      this.camera.position.copy(_targetCamPos);

      if (this.focusDirection && _currentDir.distanceTo(_desiredDir) < 0.015) {
        this.focusDirection = null;
      }
      if (this.focusDistance !== null && Math.abs(nextDistance - this.focusDistance) < 0.015) {
        this.camera.position.setLength(this.focusDistance);
        this.focusDistance = null;
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    if (typeof this.onFrameCallback === 'function') {
      this.onFrameCallback();
    }

    if (this.isSoftwareGl) {
      this._afterDraw(this._tick);
    } else {
      this.frameId = requestAnimationFrame(this._tick);
    }
  };

  _renderFallback(message) {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="globe-stage__fallback">
        <p>${message}</p>
      </div>
    `;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }

    if (this.renderer?.domElement) {
      const canvas = this.renderer.domElement;
      canvas.removeEventListener('pointerdown', this._onPointerDown);
      canvas.removeEventListener('pointerup', this._onPointerUp);
      canvas.removeEventListener('pointermove', this._onPointerMove);
      canvas.removeEventListener('webglcontextlost', this._onContextLost);
      canvas.removeEventListener('webglcontextrestored', this._onContextRestored);
    }

    this.controls?.dispose();
    this.textures?.albedoTexture?.dispose();
    this.textures?.bumpTexture?.dispose();

    this.scene?.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });

    this.renderer?.dispose();
    this.renderer?.forceContextLoss?.();
    this.renderer?.domElement?.remove();
  }
}

let sharedGlobeInstance = null;

export function initPersistentMarsStage(initialOptions = {}) {
  if (sharedGlobeInstance && !sharedGlobeInstance.disposed) {
    return sharedGlobeInstance;
  }
  const mount = document.getElementById('mars-global-canvas');
  if (!mount) return null;
  sharedGlobeInstance = new MarsGlobe(mount, initialOptions);
  return sharedGlobeInstance;
}

export function getSharedMarsGlobe() {
  return sharedGlobeInstance;
}

export function setMarsStageMode(mode, settings = {}) {
  const stageEl = document.getElementById('mars-persistent-stage');
  if (stageEl) {
    stageEl.className = `mars-stage mars-stage--${mode}`;
  }

  const globe = sharedGlobeInstance;
  if (!globe) return;

  if (mode === 'home') {
    globe.setInteractive(true);
    globe.setMarkersVisible(true);
    globe.setRoute([]);
    globe.setOrbitStyle('subtle');
    globe.setAutoRotate(settings.autoRotateGlobe ?? true);
  } else if (mode === 'planner-routes') {
    globe.setInteractive(true);
    globe.setMarkersVisible(true);
    globe.setOrbitStyle('subtle');
    globe.setAutoRotate(false);
  } else if (mode === 'ai') {
    globe.setInteractive(false);
    globe.setMarkersVisible(false);
    globe.setRoute([]);
    globe.setOrbitStyle('red');
    globe.setAutoRotate(settings.autoRotateGlobe ?? true);
  } else if (mode === 'settings') {
    globe.setInteractive(false);
    globe.setMarkersVisible(false);
    globe.setRoute([]);
    globe.setOrbitStyle('subtle');
    globe.setAutoRotate(settings.autoRotateGlobe ?? true);
  } else {
    globe.setInteractive(false);
    globe.setMarkersVisible(false);
    globe.setRoute([]);
    globe.setOrbitStyle('subtle');
    globe.setAutoRotate(settings.autoRotateGlobe ?? true);
  }
}
