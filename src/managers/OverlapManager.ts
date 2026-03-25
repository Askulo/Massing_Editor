import { Color3 } from "@babylonjs/core";
import { StandardMaterial } from "@babylonjs/core";
import type { BuildingData } from "../types";

export class OverlapManager {
  private buildings: Map<string, BuildingData>;
  private warnEl: HTMLElement | null;

  constructor(buildings: Map<string, BuildingData>) {
    this.buildings = buildings;
    this.warnEl = document.getElementById("overlap-warn");
  }

  check(): void {
    const overlapping = new Set<string>();
    const arr = Array.from(this.buildings.values());

    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];

        const aMinX = a.posX - a.width / 2,  aMaxX = a.posX + a.width / 2;
        const aMinZ = a.posZ - a.depth / 2,  aMaxZ = a.posZ + a.depth / 2;
        const bMinX = b.posX - b.width / 2,  bMaxX = b.posX + b.width / 2;
        const bMinZ = b.posZ - b.depth / 2,  bMaxZ = b.posZ + b.depth / 2;

        // XZ plane AABB overlap only — stacked masses are intentional, not overlaps
        const overlapX = aMinX < bMaxX && aMaxX > bMinX;
        const overlapZ = aMinZ < bMaxZ && aMaxZ > bMinZ;

        // Only flag as overlap if they also share the same Y range (not cleanly stacked)
        const aMinY = a.baseY, aMaxY = a.baseY + a.height;
        const bMinY = b.baseY, bMaxY = b.baseY + b.height;
        const overlapY = aMinY < bMaxY && aMaxY > bMinY;

        if (overlapX && overlapZ && overlapY) {
          overlapping.add(a.id);
          overlapping.add(b.id);
        }
      }
    }

    // Update material colours
    for (const [id, b] of this.buildings) {
      const mat = b.mesh.material as StandardMaterial;
      if (overlapping.has(id)) {
        mat.diffuseColor  = new Color3(0.85, 0.2, 0.2);
        mat.emissiveColor = new Color3(0.3, 0.05, 0.05);
      } else {
        mat.diffuseColor  = b.color;
        mat.emissiveColor = new Color3(0, 0, 0);
      }
    }

    // Show/hide warning badge
    if (this.warnEl) {
      this.warnEl.classList.toggle("vis", overlapping.size > 0);
    }
  }
}