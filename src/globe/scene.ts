/**
 * Time-Machine WebGL Globe — three.js scene + atmosphere shader.
 *
 * Earth (sphere + albedo texture) + atmosphere (Fresnel glow shader) +
 * cloud layer (rotating equirect) + day/night terminator (sun-vector
 * lighting in fragment shader) + CII marker dots + crisis pulses.
 *
 * Lazy-loaded behind the /#/globe page so three.js (~600KB gzip) never
 * enters the main bundle.
 *
 * 2026-05 tier-up Phase 5.
 */

import * as THREE from 'three';
import { timeCursor } from '../state/timeCursor.ts';

const EARTH_TEXTURE = 'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg';
const EARTH_CLOUDS = 'https://threejs.org/examples/textures/planets/earth_clouds_1024.png';

const ATMOSPHERE_VERT = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const ATMOSPHERE_FRAG = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  uniform vec3 uColor;
  uniform float uIntensity;
  void main() {
    float fresnel = pow(1.0 - max(dot(vWorldNormal, vViewDir), 0.0), 2.2);
    gl_FragColor = vec4(uColor, fresnel * uIntensity);
  }
`;

const EARTH_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

const EARTH_FRAG = /* glsl */ `
  uniform sampler2D uAlbedo;
  uniform vec3 uSunDir;            // in view space
  uniform float uAmbient;
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vec3 base = texture2D(uAlbedo, vUv).rgb;
    float lambert = max(dot(normalize(vNormal), normalize(uSunDir)), 0.0);
    // Mix day/night so dark side is dim warm tone, day side full color.
    vec3 night = base * 0.05 + vec3(0.02, 0.018, 0.015);
    vec3 day = base * (uAmbient + (1.0 - uAmbient) * lambert);
    float t = smoothstep(-0.05, 0.18, dot(normalize(vNormal), normalize(uSunDir)));
    gl_FragColor = vec4(mix(night, day, t), 1.0);
  }
`;

export interface GlobeMarker {
  lat: number;
  lon: number;
  intensity: number; // 0..1
  pulse?: boolean; // true → animated halo
  label?: string;
}

export interface GlobeSceneOptions {
  container: HTMLElement;
  markers?: GlobeMarker[];
}

export class GlobeScene {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private earth!: THREE.Mesh;
  private earthMat!: THREE.ShaderMaterial;
  private clouds!: THREE.Mesh;
  private atmosphere!: THREE.Mesh;
  private markerGroup: THREE.Group;
  private pulseGroup: THREE.Group;
  private raf = 0;
  private last = performance.now();
  private autoRotate = 0.04; // rad/sec
  private reduceMotion: boolean;
  private timeUnsub: (() => void) | null = null;
  private isPointerDown = false;
  private prevPointerX = 0;
  private prevPointerY = 0;

  constructor(opts: GlobeSceneOptions) {
    this.container = opts.container;
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050505);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 0.4, 3.2);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: navigator.hardwareConcurrency < 4 ? 'low-power' : 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.markerGroup = new THREE.Group();
    this.pulseGroup = new THREE.Group();
    this.scene.add(this.markerGroup, this.pulseGroup);

    void this.buildEarth();
    void this.buildAtmosphere();
    if (opts.markers) this.setMarkers(opts.markers);

    window.addEventListener('resize', this.handleResize);
    this.attachInteraction();
    this.timeUnsub = timeCursor.subscribe(() => this.updateSunForCursor());
  }

  private async buildEarth(): Promise<void> {
    const loader = new THREE.TextureLoader();
    const [albedo, clouds] = await Promise.all([
      loadTextureSafe(loader, EARTH_TEXTURE),
      loadTextureSafe(loader, EARTH_CLOUDS),
    ]);

    const radius = 1;
    const geom = new THREE.SphereGeometry(radius, 96, 96);
    this.earthMat = new THREE.ShaderMaterial({
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
      uniforms: {
        uAlbedo: { value: albedo ?? new THREE.DataTexture(new Uint8Array([20, 30, 40, 255]), 1, 1, THREE.RGBAFormat) },
        uSunDir: { value: new THREE.Vector3(1, 0.3, 0.6).normalize() },
        uAmbient: { value: 0.18 },
      },
    });
    this.earth = new THREE.Mesh(geom, this.earthMat);
    this.scene.add(this.earth);

    if (clouds) {
      const cloudMat = new THREE.MeshBasicMaterial({
        map: clouds,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const cloudGeom = new THREE.SphereGeometry(radius * 1.01, 96, 96);
      this.clouds = new THREE.Mesh(cloudGeom, cloudMat);
      this.scene.add(this.clouds);
    }

    this.updateSunForCursor();
  }

  private async buildAtmosphere(): Promise<void> {
    const mat = new THREE.ShaderMaterial({
      vertexShader: ATMOSPHERE_VERT,
      fragmentShader: ATMOSPHERE_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(0xff7a3a) },
        uIntensity: { value: 1.2 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const geom = new THREE.SphereGeometry(1.18, 64, 64);
    this.atmosphere = new THREE.Mesh(geom, mat);
    this.scene.add(this.atmosphere);
  }

  /** Replace the marker set. */
  setMarkers(markers: GlobeMarker[]): void {
    this.markerGroup.clear();
    this.pulseGroup.clear();
    const baseGeom = new THREE.SphereGeometry(0.012, 12, 12);
    const baseMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
    const pulseGeom = new THREE.SphereGeometry(0.025, 18, 18);
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    for (const m of markers) {
      const pos = latLonToVec(m.lat, m.lon, 1.012);
      const dot = new THREE.Mesh(baseGeom, baseMat.clone());
      (dot.material as THREE.MeshBasicMaterial).color = new THREE.Color().setHSL(0.07, 1, 0.4 + 0.25 * m.intensity);
      dot.position.copy(pos);
      this.markerGroup.add(dot);

      if (m.pulse) {
        const pulse = new THREE.Mesh(pulseGeom, pulseMat.clone());
        pulse.position.copy(pos);
        pulse.userData.phase = Math.random() * Math.PI * 2;
        this.pulseGroup.add(pulse);
      }
    }
  }

  /**
   * Compute approximate sun direction from the current timeCursor date.
   * This is decorative — within a couple degrees, not astronomical-grade.
   */
  private updateSunForCursor(): void {
    if (!this.earthMat) return;
    const d = timeCursor.get();
    // Hour of day (UTC) → longitude of sub-solar point
    const hours = d.getUTCHours() + d.getUTCMinutes() / 60;
    const lonDeg = -((hours - 12) * 15);
    // Day of year → declination (axial tilt up to 23.44°)
    const dayOfYear = dayOfYearUtc(d);
    const declDeg = 23.44 * Math.sin((2 * Math.PI * (dayOfYear - 80)) / 365);
    const sun = latLonToVec(declDeg, lonDeg, 1);
    this.earthMat.uniforms.uSunDir.value.copy(sun);
  }

  start(): void {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const loop = (t: number): void => {
      const dt = (t - this.last) / 1000;
      this.last = t;

      if (!this.reduceMotion) {
        const spin = this.autoRotate * dt;
        if (this.earth) this.earth.rotation.y += spin;
        if (this.clouds) this.clouds.rotation.y += spin * 1.15;
      }

      // Pulse markers
      for (const child of this.pulseGroup.children) {
        const phase = (child.userData.phase ?? 0) + dt * 2.6;
        child.userData.phase = phase;
        const s = 1 + 0.4 * Math.sin(phase);
        child.scale.setScalar(s);
        const opacity = 0.3 + 0.25 * Math.sin(phase + 1.2);
        const mat = child as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
        mat.material.opacity = Math.max(0.1, opacity);
      }

      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private handleResize = (): void => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private attachInteraction(): void {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      this.isPointerDown = true;
      this.prevPointerX = e.clientX;
      this.prevPointerY = e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.isPointerDown) return;
      const dx = (e.clientX - this.prevPointerX) * 0.005;
      const dy = (e.clientY - this.prevPointerY) * 0.005;
      this.prevPointerX = e.clientX;
      this.prevPointerY = e.clientY;
      if (this.earth) {
        this.earth.rotation.y += dx;
        this.earth.rotation.x = Math.max(-1.2, Math.min(1.2, this.earth.rotation.x + dy));
      }
      if (this.clouds) {
        this.clouds.rotation.y += dx;
        this.clouds.rotation.x = this.earth?.rotation.x ?? 0;
      }
    });
    const release = (): void => {
      this.isPointerDown = false;
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const z = Math.max(1.6, Math.min(6, this.camera.position.z + e.deltaY * 0.002));
        this.camera.position.z = z;
      },
      { passive: false },
    );
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.handleResize);
    this.timeUnsub?.();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function latLonToVec(latDeg: number, lonDeg: number, radius: number): THREE.Vector3 {
  const phi = (90 - latDeg) * (Math.PI / 180);
  const theta = (lonDeg + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function dayOfYearUtc(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return (d.getTime() - start) / 86_400_000;
}

async function loadTextureSafe(loader: THREE.TextureLoader, url: string): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    loader.load(
      url,
      (tex) => resolve(tex),
      undefined,
      () => resolve(null),
    );
  });
}
