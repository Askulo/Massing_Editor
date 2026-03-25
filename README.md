# SpaceSync — Massing Editor

A browser-based 3D building massing editor built with **Babylon.js**, **TypeScript**, and **Vite**.

---

## Running Locally

1. Clone this repository:
   ```
   git clone https://github.com/Askulo/Massing_Editor.git
   cd massing-editor
   ```
2. Make sure you have [Node.js](https://nodejs.org/) installed (version 16 or higher recommended).
3. Install dependencies:
   ```
   npm install
   ```
4. Start the development server:
   ```
   npm run dev
   ```
5. Open your browser and go to [http://localhost:5173](http://localhost:5173) to use the editor.

---

## Quick Start (Standalone — Zero Build)

Open `massing-editor-standalone.html` directly in any modern browser.  
No server, no install, no build step — it loads Babylon.js from CDN.

---

---

## Library Choice

**Babylon.js** — chosen because it is the library SpaceDesign runs on, and it provides:

- `ArcRotateCamera` with panning and orbit built-in
- `ShadowGenerator` with blur shadow maps
- `HighlightLayer` for GPU-accelerated selection glow
- `GridMaterial` via materials library
- First-class TypeScript types

---

## How I Handled Pivot-Correct Height Resize

When a building's height changes, simply scaling the mesh would move its centre (and therefore its bottom face). Instead, this editor **rebuilds the geometry** via `MeshBuilder.CreateBox` with the new dimensions on every resize, and positions the mesh at `y = baseY + newHeight / 2`. The `baseY` value records the Y coordinate of the bottom face at placement time (accounting for stacking), so it never changes during a resize — only `mesh.position.y` shifts by half the height delta. This guarantees the bottom face stays perfectly flush with the ground (or the top of any mass it was stacked onto), with no floating-point drift over repeated edits.

---

## All 7 Core Requirements

| #   | Requirement        | Implementation                                                                                |
| --- | ------------------ | --------------------------------------------------------------------------------------------- |
| 01  | 3D Scene           | `ArcRotateCamera`, `DirectionalLight`, `HemisphericLight`, `GridMaterial` (1m), `AxesViewer`  |
| 02  | Click-to-Place     | Raycasting → ground, snap to 1m grid, stacking via AABB `getStackingY()`                      |
| 03  | Selection          | `HighlightLayer` green glow, Shift+click multi, 5px drag threshold, yellow bounding box       |
| 04  | Properties Panel   | Live W/D/H inputs, pivot-correct geometry rebuild, no `mesh.scaling`                          |
| 05  | Shadow Casting     | `ShadowGenerator` blur exponential, all masses cast + receive, live on resize/move            |
| 06  | Delete + Undo/Redo | Command pattern (Add/Delete/Resize/Move), 20-step history, stacking Y restored on undo        |
| 07  | FAR Calculator     | Live status bar, `FAR = floorArea / 2000`, site boundary turns red > 2.5, 0.00 on empty scene |

---

## Bonus Challenges Implemented

| Bonus                           | Approach                                                                                                                                                                                                                                                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Drag to Move (+10)**          | `POINTERDOWN` on selected mesh starts drag-move; `POINTERMOVE` snaps live to 1m grid; recorded as `MoveCommand` on `POINTERUP`. Does not conflict with orbit (orbit only fires when clicking non-selected or empty ground).                                                                                                             |
| **Overlap Warning (+10)**       | AABB check in XZ _and_ Y on every `updateStats()` call. Overlapping masses turn red with emissive tint; warning badge shown at top of viewport. Clears when separated. **Note:** The stacking logic always shifts a dragged or placed block upwards to avoid overlap, so in normal use, overlaps (and thus the warning) will not occur. |
| **Section Cut View (+10)**      | Top-down orthographic `<canvas>` overlay drawn with the Canvas 2D API. Shows filled colour rectangles, dimension labels (`W×D`), mass names, site boundary, and a 5m grid. Toggle with **⊞ Plan** button.                                                                                                                               |
| **Sun Shadow Simulation (+10)** | Slider maps 0–100 to 6 am–6 pm. Light direction computed as `(-cos θ, -sin(πt)·0.85, -sin θ·0.5)`, elevation follows a sine arc. Shadow angle and length update live.                                                                                                                                                                   |
| **IFC-style JSON Export (+5)**  | **↓ Export** button generates `{ buildings[], siteArea, siteW, siteD }` with `id, name, position{x,y,z}, dimensions{w,d,h}, floors, footprintArea, floorArea` per mass. Downloaded as `massing-export.json`.                                                                                                                            |

---


---

## Project Structure

```
├── index.html                        # Vite entry point
├── massing-editor-standalone.html   # Zero-install CDN single-file build
├── vite.config.ts
├── tsconfig.json
├── package.json
└── src/
    ├── main.ts                  # App entry — wires all managers
    ├── types.ts                 # BuildingData, Command interfaces
    ├── index.css                # Dark-theme UI styles
    ├── commands/
    │   └── BuildingCommands.ts  # Add / Delete / Resize / Move commands
    ├── managers/
    │   ├── SceneManager.ts      # Engine, camera, lighting, shadows, ground
    │   ├── BuildingManager.ts   # CRUD for masses, stacking, billboard labels
    │   ├── SelectionManager.ts  # Edge highlight, multi-select, group bbox
    │   ├── HistoryManager.ts    # Undo/redo stack (command pattern)
    │   ├── InteractionManager.ts# Pointer events, drag-to-move
    │   └── OverlapManager.ts    # AABB overlap detection + visual warning
    └── ui/
        └── UIManager.ts         # Panel, FAR stats, plan view, export, sun slider
```

---

## One Thing I'd Improve

The stacking logic (`getStackingY`) does a brute-force O(n²) AABB scan on every placement and move. With many masses this degrades. I'd replace it with a spatial hash grid (bucket XZ cells into 1m tiles) so stacking height queries become O(1) lookups — the same structure would also accelerate overlap detection.

---

## AI Tools

Claude (Anthropic) was used for initial scaffolding, structural suggestions. Gemini and chatgpt for debugging and optimisation. All 3D math, command-pattern design, and pivot-correct resize logic were verified and refined by hand.


## Controls Reference

| Input | Action |
|---|---|
| Click on ground | Place new building mass |
| Click on mass | Select mass |
| Shift + Click | Multi-select / toggle |
| Drag selected mass | Move with 1 m grid snap |
| Del / Delete button | Remove selected mass(es) |
| Ctrl + Z | Undo |
| Ctrl + Y | Redo |
| Alt + Click | Force-place on any surface |
| ⊞ Plan button | Toggle top-down plan view |
| ↑ Export button | Download IFC-style JSON |
| Sun slider | Simulate time-of-day shadows |