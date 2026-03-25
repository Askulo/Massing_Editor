import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  ShadowGenerator,
  DynamicTexture,
  Texture,
} from "@babylonjs/core";
import type { BuildingData } from "../types";
import type { SelectionManager } from "./SelectionManager";

const MUTED_PALETTE: [number, number, number][] = [
  [0.35, 0.55, 0.75],
  [0.65, 0.45, 0.35],
  [0.35, 0.6, 0.5],
  [0.7, 0.55, 0.3],
  [0.5, 0.35, 0.65],
  [0.55, 0.65, 0.35],
  [0.65, 0.35, 0.45],
  [0.35, 0.5, 0.65],
];

let _nameIndex = 0;
export function nextAutoName(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const idx = _nameIndex++;
  if (idx < 26) return `Block ${letters[idx]}`;
  return `Block ${letters[Math.floor(idx / 26) - 1]}${letters[idx % 26]}`;
}

export class BuildingManager {
  private scene: Scene;
  private shadowGen: ShadowGenerator;
  buildings: Map<string, BuildingData> = new Map();
  private selectionManager!: SelectionManager;
  private colorIndex = 0;
  private onChange: () => void;
  private siteWidth = 50; // same as your boundary box
  private siteDepth = 40;

  // label meshes keyed by building id
  private labels: Map<string, Mesh> = new Map();

  constructor(scene: Scene, shadowGen: ShadowGenerator, onChange: () => void) {
    this.scene = scene;
    this.shadowGen = shadowGen;
    this.onChange = onChange;
  }

  setSelectionManager(sm: SelectionManager): void {
    this.selectionManager = sm;
  }

  //   isOutOfBounds(x: number, z: number, width: number, depth: number): boolean {
  //   const halfWidth = this.siteWidth / 2;
  //   const halfDepth = this.siteDepth / 2;

  //   return (
  //     x - width / 2 < -halfWidth ||
  //     x + width / 2 > halfWidth ||
  //     z - depth / 2 < -halfDepth ||
  //     z + depth / 2 > halfDepth
  //   );
  // }

  private _nextColor(): { color: Color3; hex: string } {
    const [r, g, b] = MUTED_PALETTE[this.colorIndex % MUTED_PALETTE.length];
    this.colorIndex++;
    const toHex = (v: number) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0");
    return {
      color: new Color3(r, g, b),
      hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
    };
  }

  snapToGrid(v: number): number {
    return Math.round(v);
  }

  getStackingY(
    x: number,
    z: number,
    w: number,
    d: number,
    excludeId?: string,
  ): number {
    let maxY = 0;
    for (const [id, b] of this.buildings) {
      if (id === excludeId) continue;
      const aMinX = b.posX - b.width / 2,
        aMaxX = b.posX + b.width / 2;
      const aMinZ = b.posZ - b.depth / 2,
        aMaxZ = b.posZ + b.depth / 2;
      const bMinX = x - w / 2,
        bMaxX = x + w / 2;
      const bMinZ = z - d / 2,
        bMaxZ = z + d / 2;
      if (aMinX < bMaxX && aMaxX > bMinX && aMinZ < bMaxZ && aMaxZ > bMinZ) {
        const top = b.baseY + b.height;
        if (top > maxY) maxY = top;
      }
    }
    return maxY;
  }

  createBuilding(
    x: number,
    z: number,
    width = 10,
    depth = 10,
    height = 3,
    id?: string,
    name?: string,
    colorOverride?: { color: Color3; hex: string },
    baseYOverride?: number,
  ): BuildingData {
    const snappedX = this.snapToGrid(x);
    const snappedZ = this.snapToGrid(z);
    const baseY =
      baseYOverride !== undefined
        ? baseYOverride
        : this.getStackingY(snappedX, snappedZ, width, depth);

    const { color, hex } = colorOverride ?? this._nextColor();
    const buildingId =
      id ?? `bld_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const buildingName = name ?? nextAutoName();

    const mesh = this._buildMesh(
      buildingId,
      width,
      depth,
      height,
      snappedX,
      snappedZ,
      baseY,
      color,
    );

    const data: BuildingData = {
      id: buildingId,
      name: buildingName,
      mesh,
      width,
      depth,
      height,
      posX: snappedX,
      posZ: snappedZ,
      baseY,
      color,
      colorHex: hex,
      colorR: color.r,
      colorG: color.g,
      colorB: color.b,
    };

    this.buildings.set(buildingId, data);
    this.shadowGen.addShadowCaster(mesh, true);
    this._createLabel(data);
    this.onChange();
    return data;
  }

  restoreBuilding(data: BuildingData): void {
    const mesh = this._buildMesh(
      data.id,
      data.width,
      data.depth,
      data.height,
      data.posX,
      data.posZ,
      data.baseY,
      data.color,
    );
    const restored: BuildingData = { ...data, mesh };
    this.buildings.set(data.id, restored);
    this.shadowGen.addShadowCaster(mesh, true);
    this._createLabel(restored);
    this.onChange();
  }

  removeBuildingById(
    id: string,
    notifySelection = true,
  ): BuildingData | undefined {
    const b = this.buildings.get(id);
    if (!b) return undefined;
    if (notifySelection) this.selectionManager?.notifyBuildingRemoved(id);
    else
      try {
        this.selectionManager?.notifyBuildingRemoved(id);
      } catch {}
    b.mesh.dispose();
    this._disposeLabel(id);
    this.buildings.delete(id);
    this.onChange();
    return b;
  }

  applyResize(id: string, w: number, d: number, h: number): void {
    const b = this.buildings.get(id);
    if (!b) return;
    b.width = w;
    b.depth = d;
    b.height = h;
    b.mesh.dispose();
    const mesh = this._buildMesh(id, w, d, h, b.posX, b.posZ, b.baseY, b.color);
    b.mesh = mesh;
    this.shadowGen.addShadowCaster(mesh, true);
    this._updateLabelPosition(b);
    if (this.selectionManager?.isSelected(id)) {
      this.selectionManager.refreshHighlight(id);
    }
    this.onChange();
  }

  applyMove(id: string, x: number, z: number): void {
    const b = this.buildings.get(id);
    if (!b) return;
    b.posX = x;
    b.posZ = z;
    b.baseY = this.getStackingY(x, z, b.width, b.depth, id);
    b.mesh.position.x = x;
    b.mesh.position.z = z;
    b.mesh.position.y = b.baseY + b.height / 2;
    this._updateLabelPosition(b);
    this.onChange();
  }

  renameBuilding(id: string, newName: string): void {
    const b = this.buildings.get(id);
    if (!b) return;
    b.name = newName.trim() || b.name; // don't allow empty name
    this._disposeLabel(id);
    this._createLabel(b);
  }

  // ── Billboard label ────────────────────────────────────────────────────────

  private _createLabel(b: BuildingData): void {
    this._disposeLabel(b.id);

    const TEX_W = 256,
      TEX_H = 64;
    const plane = MeshBuilder.CreatePlane(
      `label_${b.id}`,
      { width: 6, height: 1.5 },
      this.scene,
    );

    // Position just above top of building
    plane.position = new Vector3(b.posX, b.baseY + b.height + 1.2, b.posZ);
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.isPickable = false;
    plane.metadata = { type: "ui" };

    const tex = new DynamicTexture(
      `labelTex_${b.id}`,
      { width: TEX_W, height: TEX_H },
      this.scene,
      false,
    );
    tex.hasAlpha = true;
    this._drawLabelTexture(tex, b.name, b.colorHex, TEX_W, TEX_H);

    const mat = new StandardMaterial(`labelMat_${b.id}`, this.scene);
    mat.diffuseTexture = tex;
    mat.emissiveTexture = tex;
    mat.opacityTexture = tex;
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    plane.material = mat;

    this.labels.set(b.id, plane);
  }

  private _drawLabelTexture(
    tex: DynamicTexture,
    name: string,
    colorHex: string,
    w: number,
    h: number,
  ): void {
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, w, h);

    // Pill background
    const radius = 10;
    ctx.fillStyle = "rgba(14,15,17,0.82)";
    ctx.beginPath();
    ctx.roundRect(2, 2, w - 4, h - 4, radius);
    ctx.fill();

    // Colour accent border
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(2, 2, w - 4, h - 4, radius);
    ctx.stroke();

    // Colour dot
    ctx.fillStyle = colorHex;
    ctx.beginPath();
    ctx.arc(22, h / 2, 6, 0, Math.PI * 2);
    ctx.fill();

    // Name text
    ctx.fillStyle = "#e8eaf0";
    ctx.font = "bold 22px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(name, 36, h / 2 + 1);

    tex.update();
  }

  private _updateLabelPosition(b: BuildingData): void {
    const label = this.labels.get(b.id);
    if (!label) return;
    label.position = new Vector3(b.posX, b.baseY + b.height + 1.2, b.posZ);
  }

  private _disposeLabel(id: string): void {
    const label = this.labels.get(id);
    if (!label) return;
    label.material?.dispose();
    label.dispose();
    this.labels.delete(id);
  }

  private _buildMesh(
    id: string,
    w: number,
    d: number,
    h: number,
    x: number,
    z: number,
    baseY: number,
    color: Color3,
  ): Mesh {
    const mesh = MeshBuilder.CreateBox(
      id,
      { width: w, depth: d, height: h },
      this.scene,
    );
    mesh.position = new Vector3(x, baseY + h / 2, z);
    mesh.receiveShadows = true;
    const mat = new StandardMaterial(`mat_${id}`, this.scene);
    mat.diffuseColor = color;
    mat.specularColor = new Color3(0.1, 0.1, 0.1);
    mesh.material = mat;
    mesh.metadata = { type: "building", id };
    return mesh;
  }

  getAll(): BuildingData[] {
    return Array.from(this.buildings.values());
  }

  getBuildingAt(meshId: string): BuildingData | undefined {
    return this.buildings.get(meshId);
  }
}
