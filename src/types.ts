import { Mesh, Color3 } from "@babylonjs/core";

export interface BuildingData {
  id: string;
  name: string;
  mesh: Mesh;
  width: number;
  depth: number;
  height: number;
  posX: number;
  posZ: number;
  baseY: number;
  color: Color3;
  colorHex: string;
  colorR: number;   // ← add
  colorG: number;   // ← add
  colorB: number;   // ← add
}

export interface Command {
  type: string;
  execute(): void;
  undo(): void;
}