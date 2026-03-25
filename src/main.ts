import "@babylonjs/core/Rendering/boundingBoxRenderer";

import { SceneManager } from "./managers/SceneManager";
import { BuildingManager } from "./managers/BuildingManager";
import { SelectionManager } from "./managers/SelectionManager";
import { HistoryManager } from "./managers/HistoryManager";
import { InteractionManager } from "./managers/InteractionManager";
import { UIManager } from "./ui/UIManager";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

// ── Wire up all managers ──────────────────────────────────────────────────────

const sceneManager = new SceneManager(canvas);

let uiManager: UIManager;

const historyManager = new HistoryManager(() => {
  uiManager?.updateHistory();
  uiManager?.updateStats();
});

const buildingManager = new BuildingManager(
  sceneManager.scene,
  sceneManager.shadowGenerator,
  () => {
    uiManager?.updateStats();
  },
);

const selectionManager = new SelectionManager(
  sceneManager.scene,
  buildingManager.buildings,
  (ids) => {
    uiManager?.onSelectionChange(ids);
  },
);

// Inject selection manager into building manager
buildingManager.setSelectionManager(selectionManager);

uiManager = new UIManager(
  buildingManager,
  selectionManager,
  historyManager,
  sceneManager,
);

const _interactionManager = new InteractionManager(
  sceneManager.scene,
  sceneManager.camera, // ← new
  canvas, // ← new
  buildingManager,
  selectionManager,
  historyManager,
);

// ── Initial stats render ──────────────────────────────────────────────────────
uiManager.updateStats();
uiManager.updateHistory();

console.log("[SpaceSync] Massing Editor ready.");
