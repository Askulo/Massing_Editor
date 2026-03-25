import type { Command, BuildingData } from "../types";
import type { BuildingManager } from "../managers/BuildingManager";

/* ── Add Command ── */
export class AddBuildingCommand implements Command {
  type = "ADD";
  private building: BuildingData;
  private manager: BuildingManager;

  constructor(building: BuildingData, manager: BuildingManager) {
    this.building = building;
    this.manager = manager;
  }

  execute(): void {
    this.manager.restoreBuilding(this.building);
  }

  undo(): void {
    this.manager.removeBuildingById(this.building.id, false);
  }

  get label() { return `Add ${this.building.name}`; }
}

/* ── Delete Command ── */
export class DeleteBuildingCommand implements Command {
  type = "DELETE";
  private buildings: BuildingData[];
  private manager: BuildingManager;

  constructor(buildings: BuildingData[], manager: BuildingManager) {
    this.buildings = [...buildings];
    this.manager = manager;
  }

  execute(): void {
    for (const b of this.buildings) {
      this.manager.removeBuildingById(b.id, false);
    }
  }

  undo(): void {
    for (const b of this.buildings) {
      this.manager.restoreBuilding(b);
    }
  }

  get label() {
    return `Delete ${this.buildings.length === 1 ? this.buildings[0].name : `${this.buildings.length} masses`}`;
  }
}

/* ── Resize Command ── */
export interface ResizeSnapshot {
  id: string;
  oldW: number; oldD: number; oldH: number;
  newW: number; newD: number; newH: number;
}

export class ResizeBuildingCommand implements Command {
  type = "RESIZE";
  private snap: ResizeSnapshot;
  private manager: BuildingManager;

  constructor(snap: ResizeSnapshot, manager: BuildingManager) {
    this.snap = snap;
    this.manager = manager;
  }

  execute(): void {
    this.manager.applyResize(this.snap.id, this.snap.newW, this.snap.newD, this.snap.newH);
  }

  undo(): void {
    this.manager.applyResize(this.snap.id, this.snap.oldW, this.snap.oldD, this.snap.oldH);
  }

  get label() { return `Resize`; }
}

/* ── Move Command ── */
export interface MoveSnapshot {
  id: string;
  oldX: number; oldZ: number;
  newX: number; newZ: number;
}

export class MoveBuildingCommand implements Command {
  type = "MOVE";
  private snap: MoveSnapshot;
  private manager: BuildingManager;

  constructor(snap: MoveSnapshot, manager: BuildingManager) {
    this.snap = snap;
    this.manager = manager;
  }

  execute(): void {
    this.manager.applyMove(this.snap.id, this.snap.newX, this.snap.newZ);
  }

  undo(): void {
    this.manager.applyMove(this.snap.id, this.snap.oldX, this.snap.oldZ);
  }

  get label() { return `Move`; }
}
