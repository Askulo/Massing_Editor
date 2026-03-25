import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Vector3,
  Color3,
  Color4,
  LinesMesh,
  VertexBuffer,
  Matrix,
} from "@babylonjs/core";
import type { BuildingData } from "../types";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SelectionEntry {
  building: BuildingData;
  edgeMesh: LinesMesh;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EDGE_COLOR_SINGLE = new Color3(0.3, 1.0, 0.5);   // CAD green – single selection
const EDGE_COLOR_MULTI  = new Color3(1.0, 0.85, 0.2);  // CAD amber – multi selection
const BBOX_COLOR        = new Color3(1.0, 0.85, 0.2);  // group bounding box
const EDGE_ALPHA        = 1.0;
const BBOX_ALPHA        = 0.6;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build 12 edges (24 points, line-pairs) for a world-space AABB.
 * Returns a flat Float32Array of positions suitable for CreateLineSystem.
 */
function aabbEdgeLines(min: Vector3, max: Vector3): Vector3[][] {
  const { x: x0, y: y0, z: z0 } = min;
  const { x: x1, y: y1, z: z1 } = max;

  // 8 corners
  const c = [
    new Vector3(x0, y0, z0),
    new Vector3(x1, y0, z0),
    new Vector3(x1, y0, z1),
    new Vector3(x0, y0, z1),
    new Vector3(x0, y1, z0),
    new Vector3(x1, y1, z0),
    new Vector3(x1, y1, z1),
    new Vector3(x0, y1, z1),
  ];

  // 12 edges as [start, end] pairs
  return [
    [c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]], // bottom
    [c[4], c[5]], [c[5], c[6]], [c[6], c[7]], [c[7], c[4]], // top
    [c[0], c[4]], [c[1], c[5]], [c[2], c[6]], [c[3], c[7]], // verticals
  ];
}

/**
 * Create a LineSystem mesh that draws only the 12 AABB edges of `mesh`.
 * The lines live in *world space* so they are independent of the mesh transform.
 */
function createEdgeHighlight(
  mesh: Mesh,
  scene: Scene,
  color: Color3
): LinesMesh {
  mesh.computeWorldMatrix(true);
  const info  = mesh.getBoundingInfo();
  const lines = aabbEdgeLines(
    info.boundingBox.minimumWorld,
    info.boundingBox.maximumWorld
  );

  const lm = MeshBuilder.CreateLineSystem(
    "__edgeHL__",
    { lines, updatable: true },
    scene
  ) as LinesMesh;

  lm.color        = color;
  lm.alpha        = EDGE_ALPHA;
  lm.isPickable   = false;
  lm.renderingGroupId = 1; // always on top of the building mesh
  lm.metadata     = { type: "ui" };

  return lm;
}

/**
 * Refit an existing edge LinesMesh to the current world AABB of `mesh`.
 * Cheaper than disposing + recreating every frame.
 */
function refitEdgeHighlight(edgeMesh: LinesMesh, mesh: Mesh): void {
  mesh.computeWorldMatrix(true);
  const info  = mesh.getBoundingInfo();
  const lines = aabbEdgeLines(
    info.boundingBox.minimumWorld,
    info.boundingBox.maximumWorld
  );

  // Flatten to positions array for updateLineSystem
  MeshBuilder.CreateLineSystem(
    "__edgeHL__",
    { lines, updatable: true, instance: edgeMesh },
    edgeMesh.getScene()
  );
}

// ─── SelectionManager ────────────────────────────────────────────────────────

export class SelectionManager {
  private scene:    Scene;
  private buildings: Map<string, BuildingData>;
  private onSelectionChange: (ids: string[]) => void;

  /** Live selection state – one entry per selected building */
  private entries: Map<string, SelectionEntry> = new Map();

  /** Group bounding box shown when ≥2 buildings are selected */
  private groupBoxMesh: LinesMesh | null = null;

  constructor(
    scene: Scene,
    buildings: Map<string, BuildingData>,
    onSelectionChange: (ids: string[]) => void
  ) {
    this.scene             = scene;
    this.buildings         = buildings;
    this.onSelectionChange = onSelectionChange;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Replace current selection with a single building. */
  selectOne(id: string): void {
    this._clearInternal();
    this._add(id);
    this._syncGroupBox();
    this.onSelectionChange(this.getSelectedIds());
  }

  /** Add building to selection (Shift+click / Ctrl+click). */
  addToSelection(id: string): void {
    if (this.entries.has(id)) return;
    this._add(id);
    this._syncGroupBox();
    this.onSelectionChange(this.getSelectedIds());
  }

  /** Toggle a building's selected state. */
  toggleSelect(id: string): void {
    if (this.entries.has(id)) {
      this._remove(id);
    } else {
      this._add(id);
    }
    this._syncGroupBox();
    this.onSelectionChange(this.getSelectedIds());
  }

  /** Deselect everything. */
  clearAll(): void {
    this._clearInternal();
    this._syncGroupBox();
    this.onSelectionChange([]);
  }

  /** Call when a building mesh has been transformed (moved/scaled/rotated). */
  notifyBuildingTransformed(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    refitEdgeHighlight(entry.edgeMesh, entry.building.mesh);
    this._syncGroupBox();
  }

  /** Call when a building is removed from the scene. */
  notifyBuildingRemoved(id: string): void {
    if (!this.entries.has(id)) return;
    this._remove(id);
    this._syncGroupBox();
    this.onSelectionChange(this.getSelectedIds());
  }

  /** Call when a building's mesh is swapped / rebuilt. */
  refreshHighlight(id: string): void {
    if (!this.entries.has(id)) return;
    const b = this.buildings.get(id);
    if (!b) return;

    // Remove old edge mesh
    const old = this.entries.get(id)!;
    old.edgeMesh.dispose();

    // Re-create with correct color
    const color    = this._edgeColor();
    const edgeMesh = createEdgeHighlight(b.mesh, this.scene, color);
    this.entries.set(id, { building: b, edgeMesh });

    // Re-tint all existing edges to match new count
    this._retintAll();
    this._syncGroupBox();
  }

  /** Force a full re-sync of all edge meshes (e.g. after undo/redo batch). */
  refreshAll(): void {
    for (const [id] of this.entries) {
      this.refreshHighlight(id);
    }
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  getSelectedIds(): string[] {
    return Array.from(this.entries.keys());
  }

  getSelectedBuildings(): BuildingData[] {
    return Array.from(this.entries.values()).map(e => e.building);
  }

  isSelected(id: string): boolean {
    return this.entries.has(id);
  }

  count(): number {
    return this.entries.size;
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private _add(id: string): void {
    const b = this.buildings.get(id);
    if (!b || this.entries.has(id)) return;

    const color    = this._edgeColor(); // computed before we mutate entries
    const edgeMesh = createEdgeHighlight(b.mesh, this.scene, color);
    this.entries.set(id, { building: b, edgeMesh });

    // When adding a second item, re-tint the first one to multi color
    if (this.entries.size === 2) this._retintAll();
  }

  private _remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.edgeMesh.dispose();
    this.entries.delete(id);

    // If only one left, switch back to single-select color
    if (this.entries.size === 1) this._retintAll();
  }

  private _clearInternal(): void {
    for (const entry of this.entries.values()) {
      entry.edgeMesh.dispose();
    }
    this.entries.clear();
    this._destroyGroupBox();
  }

  /** The correct edge color for the *current* selection count (after mutation). */
  private _edgeColor(): Color3 {
    // If we're about to be multi-select (≥1 existing + 1 being added), use amber
    return this.entries.size >= 1 ? EDGE_COLOR_MULTI : EDGE_COLOR_SINGLE;
  }

  private _retintAll(): void {
    const color = this.entries.size === 1 ? EDGE_COLOR_SINGLE : EDGE_COLOR_MULTI;
    for (const entry of this.entries.values()) {
      entry.edgeMesh.color = color;
    }
  }

  // ── Group bounding box ─────────────────────────────────────────────────────

  private _syncGroupBox(): void {
    this._destroyGroupBox();
    if (this.entries.size < 2) return;

    let min = new Vector3( Infinity,  Infinity,  Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);

    for (const entry of this.entries.values()) {
      entry.building.mesh.computeWorldMatrix(true);
      const info = entry.building.mesh.getBoundingInfo();
      min = Vector3.Minimize(min, info.boundingBox.minimumWorld);
      max = Vector3.Maximize(max, info.boundingBox.maximumWorld);
    }

    // Expand by a small CAD-style margin
    const margin = new Vector3(0.12, 0.12, 0.12);
    min.subtractInPlace(margin);
    max.addInPlace(margin);

    const lines = aabbEdgeLines(min, max);
    const lm = MeshBuilder.CreateLineSystem(
      "__groupBox__",
      { lines },
      this.scene
    ) as LinesMesh;

    lm.color              = BBOX_COLOR;
    lm.alpha              = BBOX_ALPHA;
    lm.isPickable         = false;
    lm.renderingGroupId   = 1;
    lm.metadata           = { type: "ui" };

    // Dashed appearance via alpha modulation on alternate segments
    // (BabylonJS doesn't natively dash lines, so we fake it with alpha)
    this.groupBoxMesh = lm;
  }

  private _destroyGroupBox(): void {
    if (this.groupBoxMesh) {
      this.groupBoxMesh.dispose();
      this.groupBoxMesh = null;
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Dispose all GPU resources owned by this manager. */
  dispose(): void {
    this._clearInternal();
  }
}