import {
  Scene,
  ArcRotateCamera,
  PointerEventTypes,
  Observer,
  PointerInfo,
} from "@babylonjs/core";
import type { BuildingManager } from "./BuildingManager";
import type { SelectionManager } from "./SelectionManager";
import type { HistoryManager } from "./HistoryManager";
import {
  AddBuildingCommand,
  MoveBuildingCommand,
} from "../commands/BuildingCommands";

const DRAG_THRESHOLD_PX = 5;

export class InteractionManager {
  private scene: Scene;
  private camera: ArcRotateCamera;
  private canvas: HTMLCanvasElement;
  private buildingManager: BuildingManager;
  private selectionManager: SelectionManager;
  private historyManager: HistoryManager;
  private pointerObserver: Observer<PointerInfo> | null = null;

  private pointerDownX = 0;
  private pointerDownY = 0;
  private isDragging = false;

  // Drag-to-move state
  private dragMode = false;
  private dragBuildingId = "";
  private dragOrigX = 0;
  private dragOrigZ = 0;

  constructor(
    scene: Scene,
    camera: ArcRotateCamera,
    canvas: HTMLCanvasElement,
    buildingManager: BuildingManager,
    selectionManager: SelectionManager,
    historyManager: HistoryManager,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.buildingManager = buildingManager;
    this.selectionManager = selectionManager;
    this.historyManager = historyManager;

    this._attach();
    this._attachWindowSafetyNet();
  }

  private _attach(): void {
    this.pointerObserver = this.scene.onPointerObservable.add((info) => {
      switch (info.type) {
        case PointerEventTypes.POINTERDOWN:
          this._onDown(info.event as PointerEvent);
          break;
        case PointerEventTypes.POINTERMOVE:
          this._onMove(info.event as PointerEvent);
          break;
        case PointerEventTypes.POINTERUP:
          this._onUp(info.event as PointerEvent);
          break;
      }
    });
  }

  dispose(): void {
    if (this.pointerObserver) {
      this.scene.onPointerObservable.remove(this.pointerObserver);
      this.pointerObserver = null;
    }

    window.removeEventListener("pointerup", this._pointerUpHandler);
  }

  /**
   * Safety net: if the pointer is released outside the canvas (e.g. over the
   * side panel) the scene's POINTERUP never fires, so the camera would stay
   * detached forever. This window-level listener catches that case.
   */

  private _pointerUpHandler = () => {
    if (!this.dragMode) return;

    this.dragMode = false;
    this.dragBuildingId = "";
    this.camera.attachControl(this.canvas, true);
  };
  private _attachWindowSafetyNet(): void {
    window.addEventListener("pointerup", this._pointerUpHandler);
  }

  private _onDown(e: PointerEvent): void {
    this.pointerDownX = e.clientX;
    this.pointerDownY = e.clientY;
    this.isDragging = false;

    if (e.altKey) return; // alt is force-place, handled on up

    // Check if clicking a selected building with no modifier → start drag
    const pick = this.scene.pick(e.offsetX, e.offsetY);
    if (pick?.hit && pick.pickedMesh?.metadata?.type === "building") {
      const id = pick.pickedMesh.metadata.id as string;
      if (this.selectionManager.isSelected(id) && !e.shiftKey) {
        const b = this.buildingManager.buildings.get(id);
        if (b) {
          this.dragMode = true;
          this.dragBuildingId = id;
          this.dragOrigX = b.posX;
          this.dragOrigZ = b.posZ;
          // Detach camera so it doesn't fight the mass drag
          this.camera.detachControl();
        }
      }
    }
  }

  private _onMove(e: PointerEvent): void {
    const dx = e.clientX - this.pointerDownX;
    const dy = e.clientY - this.pointerDownY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > DRAG_THRESHOLD_PX) this.isDragging = true;

    // Live drag-move
    if (this.dragMode && this.isDragging && this.dragBuildingId) {
      const pick = this.scene.pick(
        e.offsetX,
        e.offsetY,
        (m) => m.metadata?.type === "ground",
      );
      if (pick?.hit && pick.pickedPoint) {
        const snappedX = this.buildingManager.snapToGrid(pick.pickedPoint.x);
        const snappedZ = this.buildingManager.snapToGrid(pick.pickedPoint.z);
        const b = this.buildingManager.buildings.get(this.dragBuildingId);
        if (b) {
          b.posX = snappedX;
          b.posZ = snappedZ;
          const baseY = this.buildingManager.getStackingY(
            snappedX,
            snappedZ,
            b.width,
            b.depth,
            this.dragBuildingId,
          );
          b.baseY = baseY;
          b.mesh.position.x = snappedX;
          b.mesh.position.z = snappedZ;
          b.mesh.position.y = baseY + b.height / 2;
          // Update label position live during drag
          this.buildingManager["_updateLabelPosition"](b);
          this.selectionManager.notifyBuildingTransformed(this.dragBuildingId);
        }
      }
    }
  }

  private _onUp(e: PointerEvent): void {
    const dx = e.clientX - this.pointerDownX;
    const dy = e.clientY - this.pointerDownY;
    const wasDrag = Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD_PX;

    // Finish drag-move
    if (this.dragMode) {
      const b = this.buildingManager.buildings.get(this.dragBuildingId);
      if (b && wasDrag) {
        if (b.posX !== this.dragOrigX || b.posZ !== this.dragOrigZ) {
          const cmd = new MoveBuildingCommand(
            {
              id: b.id,
              oldX: this.dragOrigX,
              oldZ: this.dragOrigZ,
              newX: b.posX,
              newZ: b.posZ,
            },
            this.buildingManager,
          );
          this.historyManager.push(cmd);
        }
      }
      this.dragMode = false;
      this.dragBuildingId = "";
      // Reattach camera now that drag is finished
      this.camera.attachControl(this.canvas, true);
      return;
    }

    if (wasDrag) return; // was a camera orbit drag

    // It's a click
    this._handleClick(e);
  }

  private _handleClick(e: PointerEvent): void {
    const pick = this.scene.pick(e.offsetX, e.offsetY);
    if (!pick?.hit) {
      this.selectionManager.clearAll();
      return;
    }

    const mesh = pick.pickedMesh;
    if (!mesh) return;

    // Alt+Click → force-place on whatever was hit
    if (e.altKey) {
      this._placeBuilding(pick.pickedPoint?.x ?? 0, pick.pickedPoint?.z ?? 0);
      return;
    }

    // Click on building → select
    if (mesh.metadata?.type === "building") {
      const id = mesh.metadata.id as string;
      if (e.shiftKey) {
        this.selectionManager.toggleSelect(id);
      } else {
        this.selectionManager.selectOne(id);
      }
      return;
    }

    // Click on ground → place or deselect
    if (mesh.metadata?.type === "ground") {
      if (e.shiftKey) {
        this.selectionManager.clearAll();
      } else {
        this._placeBuilding(pick.pickedPoint?.x ?? 0, pick.pickedPoint?.z ?? 0);
      }
      return;
    }

    // Click on UI mesh → ignore
    if (mesh.metadata?.type === "ui") return;

    this.selectionManager.clearAll();
  }

  private _placeBuilding(worldX: number, worldZ: number): void {
    const data = this.buildingManager.createBuilding(worldX, worldZ);
    const cmd = new AddBuildingCommand(data, this.buildingManager);
    this.historyManager.push(cmd);
  }
}
