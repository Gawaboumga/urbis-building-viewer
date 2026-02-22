import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/Addons.js';

/* ---------------------------------------------
 * Geometry helpers
 * --------------------------------------------- */

export function computeNormal(vertices: THREE.Vector3[]): THREE.Vector3 {
  const normal = new THREE.Vector3();
  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % n];

    normal.x += (current.y - next.y) * (current.z + next.z);
    normal.y += (current.z - next.z) * (current.x + next.x);
    normal.z += (current.x - next.x) * (current.y + next.y);
  }

  return normal.normalize();
}

export function projectPolygonTo2D(points3D: THREE.Vector3[], normal: THREE.Vector3) {
  const centroid = points3D.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(points3D.length);

  let xAxis = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 0, 1)).normalize();
  if (xAxis.length() < 1e-4) {
    xAxis = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
  }

  const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();

  const points2D = points3D.map(p => {
    const relative = new THREE.Vector3().subVectors(p, centroid);
    return new THREE.Vector2(relative.dot(xAxis), relative.dot(yAxis));
  });

  return { points2D, centroid, xAxis, yAxis };
}

function shoelaceArea(points: THREE.Vector2[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const { x: x1, y: y1 } = points[i];
    const { x: x2, y: y2 } = points[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function toVector3Array(array: Float32Array): THREE.Vector3[] {
  const vectors: THREE.Vector3[] = [];
  for (let i = 0; i < array.length; i += 3) {
    vectors.push(new THREE.Vector3(array[i], array[i + 1], array[i + 2]));
  }
  return vectors;
}

/**
 * NOTE: This was in your original code. It assumes the geometry is a simple polygon.
 * If your mesh is triangulated, dbArea is preferred (as you already do).
 */
function computeArea3D(geometry: THREE.BufferGeometry): number {
  const positions = geometry.getAttribute('position').array as Float32Array;
  const vertices = toVector3Array(positions);
  const normal = computeNormal(vertices);
  const { points2D } = projectPolygonTo2D(vertices, normal);
  return shoelaceArea(points2D);
}

/* ---------------------------------------------
 * Text label helpers
 * --------------------------------------------- */

function makeTextCanvas(
  text: string,
  opts?: { font?: string; padding?: number; fillStyle?: string; strokeStyle?: string; lineWidth?: number; bg?: string }
) {
  const {
    font = '24px Arial',
    padding = 16,
    fillStyle = '#000',
    strokeStyle = '#fff',
    lineWidth = 4,
    bg,
  } = opts || {};

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = 24; // approx

  canvas.width = Math.ceil(textWidth + padding * 2);
  canvas.height = Math.ceil(textHeight + padding * 2);

  const ctx2 = canvas.getContext('2d')!;
  ctx2.font = font;
  ctx2.textAlign = 'left';
  ctx2.textBaseline = 'middle';

  if (bg) {
    ctx2.fillStyle = bg;
    ctx2.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx2.lineWidth = lineWidth;
  ctx2.strokeStyle = strokeStyle;
  ctx2.strokeText(text, padding, canvas.height / 2);

  ctx2.fillStyle = fillStyle;
  ctx2.fillText(text, padding, canvas.height / 2);

  return canvas;
}

function addSurfaceLabel(mesh: THREE.Mesh, sizeInMeters = 1.0, offset = 0.02) {
  const info = mesh.userData.labelInfo;
  if (!info) return;
  const { name, centroid, xAxis, yAxis, normal } = info as {
    name: string; centroid: THREE.Vector3; xAxis: THREE.Vector3; yAxis: THREE.Vector3; normal: THREE.Vector3;
  };

  if (mesh.userData.label) return;

  const canvas = makeTextCanvas(name, { font: '36px Arial', fillStyle: '#111', strokeStyle: '#fff', lineWidth: 6, bg: 'rgba(255,255,255,0.5)' });
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.anisotropy = 4;

  const aspect = canvas.width / canvas.height;
  const height = sizeInMeters;
  const width = height * aspect;

  const geom = new THREE.PlaneGeometry(width, height);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  const label = new THREE.Mesh(geom, mat);

  // prevent labels from being pick targets
  label.raycast = () => {};

  const basis = new THREE.Matrix4().makeBasis(xAxis.clone().normalize(), yAxis.clone().normalize(), normal.clone().normalize());
  const q = new THREE.Quaternion().setFromRotationMatrix(basis);
  label.quaternion.copy(q);

  const pos = centroid.clone().add(normal.clone().normalize().multiplyScalar(offset));
  label.position.copy(pos);

  mesh.add(label);
  mesh.userData.label = label;
}

/* ---------------------------------------------
 * Multi-solid helpers (NEW)
 * --------------------------------------------- */

function asArray<T>(x: T | T[]): T[] {
  return Array.isArray(x) ? x : [x];
}

/**
 * Your existing mapping: (lon -> x), (alt -> y), (-lat -> z)
 * This helper is used only for "center" computations.
 */
function mappedXZFromLonLat(lon: number, lat: number): THREE.Vector3 {
  return new THREE.Vector3(lon, 0, -lat);
}

/**
 * Compute one global center across ALL solids so that:
 * - solids keep their relative offsets
 * - we avoid huge lon/lat numbers near origin
 */
function computeGlobalCenter(solids: any[]): THREE.Vector3 {
  const sum = new THREE.Vector3();
  let count = 0;

  for (const geojson of solids) {
    geojson.features?.forEach((face: any) => {
      face.geometry.coordinates.forEach((polygon: number[][][]) => {
        polygon.forEach((ring: number[][]) => {
          ring.forEach(([lon, lat]: number[]) => {
            sum.add(mappedXZFromLonLat(lon, lat));
            count++;
          });
        });
      });
    });
  }

  return count > 0 ? sum.multiplyScalar(1 / count) : new THREE.Vector3();
}

/* ---------------------------------------------
 * Measure drawing helper
 * --------------------------------------------- */

class MeasureDrawHelper {
  private raycaster = new THREE.Raycaster();
  private scene: THREE.Scene;

  private activeMesh: THREE.Mesh | null = null;
  private points: THREE.Vector3[] = [];
  private closed = false;

  private overlay = new THREE.Group();
  private line: THREE.Line | null = null;
  private pointMeshes: THREE.Mesh[] = [];
  private edgeLabels: THREE.Object3D[] = [];
  private areaLabel: THREE.Object3D | null = null;

  private readonly pointSize = 0.15;
  private readonly labelOffset = 0.03;
  private readonly closeThreshold = 0.6;
  private readonly lineColor = 0xff3333;
  private readonly areaLabelOffset = 0.05;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.overlay);
  }

  public destroy() {
    this.clear();
    this.scene.remove(this.overlay);
  }

  public clear() {
    this.closed = false;
    this.activeMesh = null;
    this.points = [];

    if (this.line) {
      this.line.geometry.dispose();
      (this.line.material as THREE.Material).dispose();
      this.overlay.remove(this.line);
      this.line = null;
    }

    if (this.areaLabel) {
      this.disposeObject(this.areaLabel);
      this.overlay.remove(this.areaLabel);
      this.areaLabel = null;
    }

    this.pointMeshes.forEach(pm => {
      pm.geometry.dispose();
      (pm.material as THREE.Material).dispose();
      this.overlay.remove(pm);
    });
    this.pointMeshes = [];

    this.edgeLabels.forEach(lbl => {
      lbl.traverse(obj => {
        const anyObj = obj as any;
        const g = anyObj.geometry as THREE.BufferGeometry | undefined;
        const m = anyObj.material as THREE.Material | THREE.Material[] | undefined;
        if (m) {
          const mats = Array.isArray(m) ? m : [m];
          mats.forEach(mat => {
            const anyMat = mat as any;
            if (anyMat.map) anyMat.map.dispose?.();
            mat.dispose();
          });
        }
        g?.dispose?.();
      });
      this.overlay.remove(lbl);
    });
    this.edgeLabels = [];
  }

  public addPointFromNDC(ndc: THREE.Vector2, scene: THREE.Scene, camera: THREE.Camera) {
    if (this.closed) {
      this.clear();
    }

    this.raycaster.setFromCamera(ndc, camera);

    // Intersect everything; labels/markers have raycast disabled.
    const [hit] = this.raycaster.intersectObjects(scene.children, true);
    if (!hit || !(hit.object instanceof THREE.Mesh)) return;

    const mesh = hit.object as THREE.Mesh;
    if (!this.activeMesh) this.activeMesh = mesh;

    const p = hit.point.clone();

    if (this.points.length >= 3) {
      const first = this.points[0];
      if (p.distanceTo(first) <= this.closeThreshold) {
        this.closed = true;
        this.updateVisuals();
        return;
      }
    }

    if (this.activeMesh !== mesh) {
      this.clear();
      this.activeMesh = mesh;
    }

    this.points.push(p);
    this.addPointMarker(p);
    this.updateVisuals();
  }

  private addPointMarker(p: THREE.Vector3) {
    const geom = new THREE.SphereGeometry(this.pointSize, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: this.lineColor });
    const m = new THREE.Mesh(geom, mat);
    m.position.copy(p);
    m.raycast = () => {}; // ignore picking
    this.pointMeshes.push(m);
    this.overlay.add(m);
  }

  private updateVisuals() {
    this.updateLine();
    this.updateEdgeLabels();
    this.updateAreaLabel();
  }

  private updateLine() {
    const pts = this.closed ? [...this.points, this.points[0]] : this.points;
    if (pts.length < 2) return;

    const geom = new THREE.BufferGeometry().setFromPoints(pts);

    if (!this.line) {
      const mat = new THREE.LineBasicMaterial({ color: this.lineColor });
      this.line = new THREE.Line(geom, mat);
      this.line.raycast = () => {}; // IMPORTANT: prevent line capturing clicks
      this.overlay.add(this.line);
    } else {
      this.line.geometry.dispose();
      this.line.geometry = geom;
    }
  }

  private updateAreaLabel() {
    if (this.areaLabel) {
      this.disposeObject(this.areaLabel);
      this.overlay.remove(this.areaLabel);
      this.areaLabel = null;
    }

    if (!this.closed || this.points.length < 3 || !this.activeMesh) return;

    const normal = this.getSurfaceNormalWorld(this.activeMesh);
    const { points2D, centroid, xAxis, yAxis } = projectPolygonTo2D(this.points, normal);
    const area = shoelaceArea(points2D);

    const text = `${area.toFixed(2)} m²`;

    const canvas = makeTextCanvas(text, {
      font: '36px Arial',
      fillStyle: '#111',
      strokeStyle: '#fff',
      lineWidth: 6,
      bg: 'rgba(255,255,255,0.70)'
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.anisotropy = 4;

    const aspect = canvas.width / canvas.height;
    const height = 1.1;
    const width = height * aspect;

    const geom = new THREE.PlaneGeometry(width, height);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });

    const plane = new THREE.Mesh(geom, mat);
    plane.raycast = () => {};

    const basis = new THREE.Matrix4().makeBasis(
      xAxis.clone().normalize(),
      yAxis.clone().normalize(),
      normal.clone().normalize()
    );
    plane.quaternion.setFromRotationMatrix(basis);

    plane.position.copy(centroid.clone().add(normal.clone().normalize().multiplyScalar(this.areaLabelOffset)));

    this.areaLabel = plane;
    this.overlay.add(plane);
  }

  private updateEdgeLabels() {
    this.edgeLabels.forEach(lbl => {
      lbl.traverse(obj => {
        const anyObj = obj as any;
        const g = anyObj.geometry as THREE.BufferGeometry | undefined;
        const m = anyObj.material as THREE.Material | THREE.Material[] | undefined;
        if (m) {
          const mats = Array.isArray(m) ? m : [m];
          mats.forEach(mat => {
            const anyMat = mat as any;
            if (anyMat.map) anyMat.map.dispose?.();
            mat.dispose();
          });
        }
        g?.dispose?.();
      });
      this.overlay.remove(lbl);
    });
    this.edgeLabels = [];

    if (this.points.length < 2) return;

    const normal = this.getSurfaceNormalWorld(this.activeMesh);
    const segPts = this.closed ? [...this.points, this.points[0]] : this.points;

    for (let i = 0; i < segPts.length - 1; i++) {
      const a = segPts[i];
      const b = segPts[i + 1];
      const dist = a.distanceTo(b);
      const mid = a.clone().add(b).multiplyScalar(0.5);

      const label = this.makeEdgeLabel(`${dist.toFixed(2)} m`, a, b, normal, mid);
      this.edgeLabels.push(label);
      this.overlay.add(label);
    }
  }

  private getSurfaceNormalWorld(mesh: THREE.Mesh | null): THREE.Vector3 {
    if (!mesh) return new THREE.Vector3(0, 1, 0);

    const info = mesh.userData.labelInfo as any;
    if (info?.normal) return (info.normal as THREE.Vector3).clone().normalize();

    const n = new THREE.Vector3(0, 1, 0);
    n.applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
    return n.normalize();
  }

  private makeEdgeLabel(
    text: string,
    a: THREE.Vector3,
    b: THREE.Vector3,
    normal: THREE.Vector3,
    midpoint: THREE.Vector3
  ) {
    const canvas = makeTextCanvas(text, {
      font: '28px Arial',
      fillStyle: '#111',
      strokeStyle: '#fff',
      lineWidth: 6,
      bg: 'rgba(255,255,255,0.65)'
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.anisotropy = 4;

    const aspect = canvas.width / canvas.height;
    const height = 0.9;
    const width = height * aspect;

    const geom = new THREE.PlaneGeometry(width, height);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });

    const plane = new THREE.Mesh(geom, mat);
    plane.raycast = () => {};

    const xAxis = b.clone().sub(a).normalize();
    let yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();
    if (yAxis.length() < 1e-6) yAxis = new THREE.Vector3(0, 1, 0);

    const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, normal.clone().normalize());
    plane.quaternion.setFromRotationMatrix(basis);

    plane.position.copy(midpoint.clone().add(normal.clone().normalize().multiplyScalar(this.labelOffset)));
    return plane;
  }

  private disposeObject(obj: THREE.Object3D) {
    obj.traverse(o => {
      const anyO = o as any;
      const g = anyO.geometry as THREE.BufferGeometry | undefined;
      const m = anyO.material as THREE.Material | THREE.Material[] | undefined;

      if (m) {
        const mats = Array.isArray(m) ? m : [m];
        mats.forEach(mat => {
          const anyMat = mat as any;
          if (anyMat.map) anyMat.map.dispose?.();
          mat.dispose();
        });
      }
      g?.dispose?.();
    });
  }
}

/* ---------------------------------------------
 * Picker helper (updated for multi-solid ids)
 * --------------------------------------------- */

export class PickHelper {
  private raycaster = new THREE.Raycaster();

  // selected meshes
  private selected = new Set<THREE.Mesh>();

  // Grouped selection data:
  // solidId -> faceId -> { area, faceName, geometryId }
  private grouped: Map<string, Map<string, { area: number; faceName: string; geometryId: number }>> = new Map();

  private removeLabel(mesh: THREE.Mesh) {
    const label = mesh.userData.label as THREE.Object3D | undefined;
    if (!label) return;

    mesh.remove(label);

    label.traverse(obj => {
      const m = (obj as any).material as THREE.Material | THREE.Material[] | undefined;
      const g = (obj as any).geometry as THREE.BufferGeometry | undefined;

      if (m) {
        const materials = Array.isArray(m) ? m : [m];
        materials.forEach(mat => {
          const anyMat = mat as any;
          if (anyMat.map) anyMat.map.dispose?.();
          mat.dispose();
        });
      }
      g?.dispose?.();
    });

    mesh.userData.label = undefined;
  }

  private unselectMesh(mesh: THREE.Mesh) {
    const material = mesh.material as THREE.MeshStandardMaterial;

    // restore color
    if (mesh.userData.originalColor !== undefined) {
      material.color.setHex(mesh.userData.originalColor);
    }

    // remove label
    this.removeLabel(mesh);

    // remove from grouped map using stored ids
    const solidId = String(mesh.userData.buildingSolidId ?? mesh.userData.solidId ?? 'unknown-solid');
    const faceId = String(mesh.userData.buildingFaceId ?? 'unknown-face');

    const solidMap = this.grouped.get(solidId);
    if (solidMap) {
      solidMap.delete(faceId);
      if (solidMap.size === 0) this.grouped.delete(solidId);
    }

    // remove from selected set
    this.selected.delete(mesh);

    this.updateFaceList();
  }

  togglePick(position: THREE.Vector2, scene: THREE.Scene, camera: THREE.Camera) {
    this.raycaster.setFromCamera(position, camera);
    const [hit] = this.raycaster.intersectObjects(scene.children, true);
    if (!hit || !(hit.object instanceof THREE.Mesh)) return;

    const mesh = hit.object as THREE.Mesh;

    // ignore helper meshes if any
    if (mesh.userData?.isHelper) return;

    const material = mesh.material as THREE.MeshStandardMaterial;

    // If already selected: unselect
    if (this.selected.has(mesh)) {
      this.unselectMesh(mesh);
      return;
    }

    // Select: tint green
    mesh.userData.originalColor = material.color.getHex();
    material.color.setHex(0x00ff00);

    // ids from properties/userData
    const solidId = String(mesh.userData.buildingSolidId ?? mesh.userData.solidId ?? 'unknown-solid');
    const faceId = String(mesh.userData.buildingFaceId ?? mesh.geometry.id);

    // human name
    const faceName =
      mesh.userData.faceName ??
      mesh.userData.labelInfo?.name ??
      `Face-${faceId}`;

    // area (prefer dbArea from backend)
    const area = mesh.userData.dbArea ?? computeArea3D(mesh.geometry);

    // store selection in grouped map
    if (!this.grouped.has(solidId)) this.grouped.set(solidId, new Map());
    this.grouped.get(solidId)!.set(faceId, { area, faceName, geometryId: mesh.geometry.id });

    // keep selection set + label
    this.selected.add(mesh);
    this.updateFaceList();
    addSurfaceLabel(mesh, 1.2, 0.03);
  }

  clearAllSelections() {
    const all = Array.from(this.selected);
    all.forEach(mesh => this.unselectMesh(mesh));

    this.selected.clear();
    this.grouped.clear();
    this.updateFaceList();
  }

  /**
   * ✅ Renders "List of faces" grouped by solid, then faces.
   * - Solid header (bold)
   * - Face rows (indented)
   * - Solid total
   * - Grand total
   */
  private updateFaceList() {
    const list = document.getElementById('faceList');
    if (!list) return;

    list.innerHTML = '';

    const solidIds = Array.from(this.grouped.keys()).sort((a, b) => a.localeCompare(b));

    let grandTotal = 0;

    for (const solidId of solidIds) {
      const facesMap = this.grouped.get(solidId)!;

      // --- Solid header ---
      const header = document.createElement('li');
      header.className = 'list-group-item active';
      header.textContent = `Building solid: ${solidId}`;
      list.appendChild(header);

      // faces sorted by numeric face id if possible, else string
      const faceEntries = Array.from(facesMap.entries()).sort(([fa], [fb]) => {
        const na = Number(fa), nb = Number(fb);
        const aIsNum = Number.isFinite(na), bIsNum = Number.isFinite(nb);
        if (aIsNum && bIsNum) return na - nb;
        return fa.localeCompare(fb);
      });

      let solidTotal = 0;

      for (const [faceId, info] of faceEntries) {
        const li = document.createElement('li');
        li.className = 'list-group-item';

        // indent a bit so faces appear under solid header
        li.style.paddingLeft = '1.75rem';

        li.textContent = `Face ${faceId} — ${info.area.toFixed(2)} m²`;

        list.appendChild(li);
        solidTotal += info.area;
      }

      // --- Solid subtotal row ---
      const subtotal = document.createElement('li');
      subtotal.className = 'list-group-item';
      subtotal.style.fontWeight = '600';
      subtotal.style.paddingLeft = '1.75rem';
      subtotal.textContent = `Subtotal: ${solidTotal.toFixed(2)} m²`;
      list.appendChild(subtotal);

      grandTotal += solidTotal;
    }

    // --- Grand total ---
    const totalLi = document.createElement('li');
    totalLi.className = 'list-group-item';
    totalLi.style.fontWeight = '700';
    totalLi.textContent = `Total: ${grandTotal.toFixed(2)} m²`;
    list.appendChild(totalLi);
  }

  computeVolume(geometry: THREE.BufferGeometry): number {
    const geom = geometry.toNonIndexed();
    const pos = geom.attributes.position;
    let volume = 0;

    for (let i = 0; i < pos.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(pos, i);
      const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
      volume += a.dot(b.clone().cross(c)) / 6;
    }

    return Math.abs(volume);
  }
}

/* ---------------------------------------------
 * BuildingViewer (MULTI-SOLID)
 * --------------------------------------------- */

export class BuildingViewer {
  private container: HTMLElement;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;

  private pickHelper = new PickHelper();
  private measureHelper: MeasureDrawHelper;

  // NEW: root group containing all solids
  private buildingsRoot = new THREE.Group();

  constructor(container: HTMLElement, buildingSolids: any | any[]) {
    this.container = container;

    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      50000
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.camera.position.set(0, 20, 30);
    this.controls.update();

    this.scene.add(new THREE.AmbientLight(0xffffff));
    this.scene.add(this.buildingsRoot);

    // ✅ Load all solids into the same scene with a shared origin
    this.loadSolids(buildingSolids);

    this.measureHelper = new MeasureDrawHelper(this.scene);

    this.setupPicker();
    this.animate();

    // Optional: handle resize
    window.addEventListener('resize', this.onResize);
  }

  public clearSelectedFaces() {
    this.pickHelper.clearAllSelections();
    this.measureHelper.clear();
  }

  public destroy = () => {
    window.removeEventListener('resize', this.onResize);
    this.measureHelper?.destroy();
    this.container.removeChild(this.renderer.domElement);
  };

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  /* ---------- MULTI SOLID LOADING (NEW) ---------- */

  private loadSolids(buildingSolids: any | any[]) {
    const solids = asArray(buildingSolids);

    // Shared origin for all solids (keeps them near each other & reduces floating point drift)
    const globalCenter = computeGlobalCenter(solids);

    // Clear existing
    this.buildingsRoot.clear();

    solids.forEach((solid, idx) => {
      const solidId =
        solid?.properties?.id ??
        solid?.properties?.name ??
        solid?.id ??
        `Solid-${idx + 1}`;

      const group = this.createMeshFromGeoJSON(solid, solidId, globalCenter);
      this.buildingsRoot.add(group);
    });

    // Fit camera to all buildings together
    this.fitCameraToObject(this.buildingsRoot);
  }

  private fitCameraToObject(obj: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);

    let distance = maxDim / (2 * Math.tan(fov / 2));
    distance *= 1.35;

    this.camera.position.set(
      center.x + distance * 0.8,
      center.y + distance * 0.7,
      center.z + distance * 0.8
    );
    this.camera.lookAt(center);
    this.controls.target.copy(center);
    this.controls.update();
  }

  /* ---------- Geometry build helpers ---------- */

  private computeGroupCenter(geojson: any) {
    const all = new THREE.Vector3();
    let count = 0;

    geojson.features.forEach((face: any) => {
      face.geometry.coordinates.forEach((polygon: number[][][]) => {
        polygon.forEach((ring: number[][]) => {
          ring.forEach(([lon, lat]: number[]) => {
            all.add(mappedXZFromLonLat(lon, lat));
            count++;
          });
        });
      });
    });

    return count > 0 ? all.multiplyScalar(1 / count) : new THREE.Vector3();
  }

  private ensureTrianglesFaceOutward(
    geometry: THREE.BufferGeometry,
    outwardDir: THREE.Vector3
  ): THREE.BufferGeometry {
    const g = geometry.toNonIndexed();

    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3();
    const avg = new THREE.Vector3(0, 0, 0);

    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i + 0);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      avg.add(ab.cross(ac));
    }

    if (avg.dot(outwardDir) < 0) {
      for (let i = 0; i < pos.count; i += 3) {
        const x1 = pos.getX(i + 1), y1 = pos.getY(i + 1), z1 = pos.getZ(i + 1);
        const x2 = pos.getX(i + 2), y2 = pos.getY(i + 2), z2 = pos.getZ(i + 2);
        pos.setXYZ(i + 1, x2, y2, z2);
        pos.setXYZ(i + 2, x1, y1, z1);
      }
      pos.needsUpdate = true;
    }

    g.computeVertexNormals();
    return g;
  }

  /**
   * Build a group of meshes for ONE solid,
   * but coordinates are shifted by the shared globalCenter.
   */
  private createMeshFromGeoJSON(geojson: any, solidId: string, globalCenter: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();

    // solid center in the same shifted coordinate system
    const solidCenter = this.computeGroupCenter(geojson).sub(globalCenter);

    geojson.features.forEach((face: any) => {
      const dbArea = face.properties.area;

      face.geometry.coordinates.forEach((polygon: number[][][]) => {
        polygon.forEach((ring: number[][]) => {
          const vertices = ring.map(([lon, lat, alt]: number[]) =>
            new THREE.Vector3(
              lon - globalCenter.x,
              alt,
              (-lat) - globalCenter.z
            )
          );

          const normal = computeNormal(vertices);
          const { points2D, centroid, xAxis, yAxis } = projectPolygonTo2D(vertices, normal);

          const shape = new THREE.Shape(points2D);
          const shapeGeometry = new THREE.ShapeGeometry(shape);
          const geometry3D = this.mapTo3D(shapeGeometry, centroid, xAxis, yAxis);

          const outward = centroid.clone().sub(solidCenter).normalize();

          if (normal.dot(outward) < 0) {
            normal.multiplyScalar(-1);
            xAxis.multiplyScalar(-1);
            yAxis.crossVectors(normal, xAxis).normalize();
          }

          const geometry = this.ensureTrianglesFaceOutward(geometry3D, outward);

          const colors: number[] = [];
          const pos = geometry.getAttribute('position');

          for (let j = 0; j < pos.count; j += 3) {
            const a = new THREE.Vector3().fromBufferAttribute(pos as any, j);
            const b = new THREE.Vector3().fromBufferAttribute(pos as any, j + 1);
            const c = new THREE.Vector3().fromBufferAttribute(pos as any, j + 2);

            const ab = new THREE.Vector3().subVectors(b, a);
            const ac = new THREE.Vector3().subVectors(c, a);
            const faceNormal = new THREE.Vector3().crossVectors(ab, ac).normalize();

            const color = new THREE.Color(
              (faceNormal.x + 1) / 2,
              (faceNormal.y + 1) / 2,
              (faceNormal.z + 1) / 2
            );
            for (let k = 0; k < 3; k++) colors.push(color.r, color.g, color.b);
          }

          geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

          const material = new THREE.MeshStandardMaterial({
            side: THREE.DoubleSide,
            vertexColors: true,
          });

          const mesh = new THREE.Mesh(geometry, material);

          const props = face.properties ?? {};

          // Prefer IDs from properties
          const buildingSolidId = props.building_solid_id ?? solidId;
          const buildingFaceId = props.building_face_id ?? geometry.id; // fallback only

          const name = props.name ?? props.face_name ?? `Face-${buildingFaceId}`;

          mesh.userData.solidId = buildingSolidId;               // keep for compatibility
          mesh.userData.buildingSolidId = buildingSolidId;       // explicit
          mesh.userData.buildingFaceId = buildingFaceId;         // explicit

          mesh.userData.dbArea = dbArea;

          // Store a stable selection key used by PickHelper list + delete logic
          mesh.userData.selectionKey = `Solid: ${buildingSolidId} Face: ${buildingFaceId}`;

          // Keep label info (you can also include ids here if useful)
          mesh.userData.labelInfo = {
            name,
            centroid,
            xAxis,
            yAxis,
            normal,
            buildingSolidId,
            buildingFaceId,
          };

          group.add(mesh);
        });
      });
    });

    return group;
  }

  private mapTo3D(
    geometry: THREE.ShapeGeometry,
    centroid: THREE.Vector3,
    xAxis: THREE.Vector3,
    yAxis: THREE.Vector3
  ): THREE.BufferGeometry {
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const world = new THREE.Vector3()
        .addScaledVector(xAxis, x)
        .addScaledVector(yAxis, y)
        .add(centroid);
      pos.setXYZ(i, world.x, world.y, world.z);
    }

    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  /* ---------- Picker wiring ---------- */

  private setupPicker() {
    const canvas = this.renderer.domElement;

    const getCanvasRelativePosition = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * canvas.width / rect.width,
        y: (event.clientY - rect.top) * canvas.height / rect.height,
      };
    };

    canvas.addEventListener('click', (event: MouseEvent) => {
      if (event.button !== 0) return;

      const pos = getCanvasRelativePosition(event);
      const ndc = new THREE.Vector2(
        (pos.x / canvas.width) * 2 - 1,
        -(pos.y / canvas.height) * 2 + 1
      );

      if (event.shiftKey) {
        this.measureHelper.addPointFromNDC(ndc, this.scene, this.camera);
      } else {
        this.pickHelper.togglePick(ndc, this.scene, this.camera);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.measureHelper.clear();
    });
  }
}