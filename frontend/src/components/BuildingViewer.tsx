import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/Addons.js';


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

function makeTextCanvas(text: string, opts?: { font?: string; padding?: number; fillStyle?: string; strokeStyle?: string; lineWidth?: number; bg?: string }) {
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
  const textHeight = 24; // approx; you can refine using metrics

  canvas.width = Math.ceil(textWidth + padding * 2);
  canvas.height = Math.ceil(textHeight + padding * 2);

  // Redraw after resize
  const ctx2 = canvas.getContext('2d')!;
  ctx2.font = font;
  ctx2.textAlign = 'left';
  ctx2.textBaseline = 'middle';

  if (bg) {
    ctx2.fillStyle = bg;
    ctx2.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Stroke for contrast
  ctx2.lineWidth = lineWidth;
  ctx2.strokeStyle = strokeStyle;
  ctx2.strokeText(text, padding, canvas.height / 2);

  // Fill
  ctx2.fillStyle = fillStyle;
  ctx2.fillText(text, padding, canvas.height / 2);

  return canvas;
}

function addSurfaceLabel(mesh: THREE.Mesh, sizeInMeters = 1.0, offset = 0.02) {
  const info = mesh.userData.labelInfo;
  if (!info) return;
  const { name, centroid, xAxis, yAxis, normal } = info as {
    name: string, centroid: THREE.Vector3, xAxis: THREE.Vector3, yAxis: THREE.Vector3, normal: THREE.Vector3
  };

  // Avoid duplicate label
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

  label.raycast = () => {};

  // Build orientation basis so the plane lies on the polygon
  const basis = new THREE.Matrix4().makeBasis(xAxis.clone().normalize(), yAxis.clone().normalize(), normal.clone().normalize());
  const q = new THREE.Quaternion().setFromRotationMatrix(basis);
  label.quaternion.copy(q);

  // Place a hair above the face along normal to avoid z-fighting
  const pos = centroid.clone().add(normal.clone().normalize().multiplyScalar(offset));
  label.position.copy(pos);

  // Keep the label attached to the face (so it moves if the face moves)
  mesh.add(label);

  // Keep a reference for later removal/toggling
  mesh.userData.label = label;
}


export class PickHelper {
  private raycaster = new THREE.Raycaster();
  // Keep track of selected meshes
  private selected = new Set<THREE.Mesh>();
  private faceAreas: Record<string, number> = {};

  // Click handler: toggle selection
  togglePick(position: THREE.Vector2, scene: THREE.Scene, camera: THREE.Camera) {
    this.raycaster.setFromCamera(position, camera);
    // Search recursively in groups
    const [hit] = this.raycaster.intersectObjects(scene.children, true);
    if (!hit || !(hit.object instanceof THREE.Mesh)) return;

    const mesh = hit.object as THREE.Mesh;
    const id = mesh.geometry.id.toString();
    const material = mesh.material as THREE.MeshStandardMaterial;

    if (this.selected.has(mesh)) {
      // 🔽 Unselect
      if (mesh.userData.originalColor !== undefined) {
        material.color.setHex(mesh.userData.originalColor);
      }
      this.selected.delete(mesh);
      delete this.faceAreas[id];
      this.updateFaceList();

      if (mesh.userData.label) {
        mesh.remove(mesh.userData.label);
        (mesh.userData.label as THREE.Object3D).traverse(obj => {
          if ((obj as THREE.Mesh).isMesh) {
            const m = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[];
            if (Array.isArray(m)) m.forEach(mm => mm.dispose());
            else m.dispose();
            (obj as THREE.Mesh).geometry.dispose();
          }
        });
        mesh.userData.label = undefined;
      }

    } else {
      // 🔼 Select
      mesh.userData.originalColor = material.color.getHex();
      material.color.setHex(0x00ff00);

      const area = mesh.userData.dbArea ?? this.computeArea3D(mesh.geometry);
      this.faceAreas[id] = area;
      this.selected.add(mesh);
      this.updateFaceList();
      addSurfaceLabel(mesh, /*sizeInMeters=*/1.2, /*offset=*/0.03);
    }
  }

  // Optional: clear all selections programmatically
  clearAllSelections() {
    for (const mesh of this.selected) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (mesh.userData.originalColor !== undefined) {
        material.color.setHex(mesh.userData.originalColor);
      }
    }
    this.selected.clear();
    this.faceAreas = {};
    this.updateFaceList();
  }

  // ---- Area helpers (unchanged logic, refactored for reuse) ----

  private updateFaceList() {
    const list = document.getElementById('faceList');
    if (!list) return;

    list.innerHTML = '';
    let total = 0;

    // Show all currently selected faces
    Object.entries(this.faceAreas).forEach(([key, val]) => {
      const li = document.createElement('li');
      li.className = 'list-group-item';
      li.textContent = `ID: ${key} - m²: ${val.toFixed(2)}`;
      list.appendChild(li);
      total += val;
    });

    const totalLi = document.createElement('li');
    totalLi.className = 'list-group-item';
    totalLi.textContent = `Total: ${total.toFixed(2)}`;
    list.appendChild(totalLi);
  }

  private shoelaceArea(points: THREE.Vector2[]): number {
    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const { x: x1, y: y1 } = points[i];
      const { x: x2, y: y2 } = points[(i + 1) % n];
      area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area) / 2;
  }

  private computeArea3D(geometry: THREE.BufferGeometry): number {
    const positions = geometry.getAttribute('position').array as Float32Array;
    const vertices = this.toVector3Array(positions);
    const normal = computeNormal(vertices);
    const { points2D } = projectPolygonTo2D(vertices, normal);
    return this.shoelaceArea(points2D);
  }

  private toVector3Array(array: Float32Array): THREE.Vector3[] {
    const vectors: THREE.Vector3[] = [];
    for (let i = 0; i < array.length; i += 3) {
      vectors.push(new THREE.Vector3(array[i], array[i + 1], array[i + 2]));
    }
    return vectors;
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

export class BuildingViewer {
  private container: HTMLElement;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private pickHelper = new PickHelper();

  constructor(container: HTMLElement, buildingSolid: any) {
    this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer();
    this.container = container;
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.camera.position.set(0, 20, 30);
    this.controls.update();

    this.scene.add(new THREE.AmbientLight(0xffffff));
    this.scene.add(this.createMeshFromGeoJSON(buildingSolid));

    this.setupPicker();
    this.animate();
  }

  public destroy = () => {
    this.container.removeChild(this.renderer.domElement);
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private computeGroupCenter(geojson: any) {
    const all = new THREE.Vector3();
    let count = 0;

    geojson.features.forEach((face: any) => {
      face.geometry.coordinates.forEach((polygon: number[][][]) => {
        polygon.forEach((ring: number[][]) => {
          ring.forEach(([lon, lat, _]) => {
            // Your mapping to 3D:
            all.add(new THREE.Vector3(lon, 0, -lat));
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
    // Work on a non-indexed copy for easy triangle swapping
    const g = geometry.toNonIndexed();

    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3();
    const avg = new THREE.Vector3(0, 0, 0);

    // Accumulate area-weighted normal
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i + 0);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      avg.add(ab.cross(ac)); // area-weighted normal (twice area)
    }

    // If pointing inward, swap (v1,v2) for every triangle
    if (avg.dot(outwardDir) < 0) {
      for (let i = 0; i < pos.count; i += 3) {
        // swap vertices 1 and 2 in-place
        const x1 = pos.getX(i + 1), y1 = pos.getY(i + 1), z1 = pos.getZ(i + 1);
        const x2 = pos.getX(i + 2), y2 = pos.getY(i + 2), z2 = pos.getZ(i + 2);
        pos.setXYZ(i + 1, x2, y2, z2);
        pos.setXYZ(i + 2, x1, y1, z1);
      }
      pos.needsUpdate = true;
    }

    // Recompute normals after final winding is set
    g.computeVertexNormals();
    return g;
  }

  private createMeshFromGeoJSON(geojson: any): THREE.Group {
    const group = new THREE.Group();
    const solidCenter = this.computeGroupCenter(geojson);

    geojson.features.forEach((face: any) => {
      const dbArea = face.properties.area;

      face.geometry.coordinates.forEach((polygon: number[][][]) => {
        polygon.forEach((ring: number[][]) => {
          const vertices = ring.map(([lon, lat, alt]) => new THREE.Vector3(lon, alt, -lat));
          const normal = computeNormal(vertices);
          const { points2D, centroid, xAxis, yAxis } = projectPolygonTo2D(vertices, normal);

          const shape = new THREE.Shape(points2D);
          const shapeGeometry = new THREE.ShapeGeometry(shape);
          const geometry3D = this.mapTo3D(shapeGeometry, centroid, xAxis, yAxis);

          // 🔴 Ensure triangles face outward relative to solid center
          const outward = centroid.clone().sub(solidCenter).normalize();
          const geometry = this.ensureTrianglesFaceOutward(geometry3D, outward);

          // (Re)build vertex colors using final triangle winding
          const colors: number[] = [];
          const nonIndexed = geometry; // already non-indexed from the helper
          const pos = nonIndexed.getAttribute('position');

          for (let j = 0; j < pos.count; j += 3) {
            const a = new THREE.Vector3().fromBufferAttribute(pos, j);
            const b = new THREE.Vector3().fromBufferAttribute(pos, j + 1);
            const c = new THREE.Vector3().fromBufferAttribute(pos, j + 2);

            const ab = new THREE.Vector3().subVectors(b, a);
            const ac = new THREE.Vector3().subVectors(c, a);
            const faceNormal = new THREE.Vector3().crossVectors(ab, ac).normalize();

            const color = new THREE.Color((faceNormal.x + 1) / 2, (faceNormal.y + 1) / 2, (faceNormal.z + 1) / 2);
            for (let k = 0; k < 3; k++) {
              colors.push(color.r, color.g, color.b);
            }
          }

          geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

          const material = new THREE.MeshStandardMaterial({
            side: THREE.DoubleSide,
            vertexColors: true,
          });

          const mesh = new THREE.Mesh(geometry, material);
          const name = face.properties.name ?? `Face-${geometry.id}`;
          mesh.userData.dbArea = dbArea;
          mesh.userData.labelInfo = { name, centroid, xAxis, yAxis, normal };
          group.add(mesh);
        });
      });
    });

    const box = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    box.getCenter(center);
    group.position.sub(center);

    const boxSize = new THREE.Vector3();
    box.getSize(boxSize);

    const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z);
    const distance = maxDim;

    // Move camera back along Z (or any direction you prefer)
    this.camera.position.set(0, distance * 0.77, distance * 0.77);
    this.camera.lookAt(0, 0, 0);
    this.controls.update();

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
        // Only left button (0)
        if (event.button !== 0) return;

        const pos = getCanvasRelativePosition(event);
        const ndc = new THREE.Vector2(
          (pos.x / canvas.width) * 2 - 1,
          -(pos.y / canvas.height) * 2 + 1
        );

        this.pickHelper.togglePick(ndc, this.scene, this.camera);
      });
  }
}
