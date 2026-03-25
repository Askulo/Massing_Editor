import type { BuildingManager } from "../managers/BuildingManager";
import type { SelectionManager } from "../managers/SelectionManager";
import type { HistoryManager } from "../managers/HistoryManager";
import type { SceneManager } from "../managers/SceneManager";
import {
  ResizeBuildingCommand,
  DeleteBuildingCommand,
} from "../commands/BuildingCommands";
import type { BuildingData } from "../types";

const SITE_AREA = 2000;
const FAR_LIMIT = 2.5;
const FLOOR_HEIGHT = 3;

export class UIManager {
  // Draws a Blender-style corner axis widget in a canvas overlay
  drawCornerAxisWidget(camera: any) {
    // TODO: Implement 3D axes rendering in a small overlay canvas
    // 1. Get the canvas (e.g., document.getElementById('corner-axis-canvas'))
    // 2. Use a 2D or 3D context to draw X/Y/Z axes
    // 3. Orient axes to match camera's rotation (camera.alpha, camera.beta)
    // 4. Call this method on each frame (e.g., in render loop)
  }
  private bm: BuildingManager;
  private sm: SelectionManager;
  private hm: HistoryManager;
  private scene: SceneManager;

  // Plan view drag/pan state
  private planOffsetX = 0;
  private planOffsetY = 0;
  private planScale = 1;
  private planDragging = false;
  private planDragStartX = 0;
  private planDragStartY = 0;
  private planDragOriginX = 0;
  private planDragOriginY = 0;

  // Elements
  private propsEmpty: HTMLElement;
  private propsContent: HTMLElement;
  private propNameInput: HTMLInputElement;
  private propColor: HTMLElement;
  private inputW: HTMLInputElement;
  private inputD: HTMLInputElement;
  private inputH: HTMLInputElement;
  private btnDelete: HTMLButtonElement;
  private historyList: HTMLElement;
  private statusBar: HTMLElement;
  private statFootprint: HTMLElement;
  private statFloorArea: HTMLElement;
  private farValue: HTMLElement;
  private statCount: HTMLElement;
  private btnSectionCut: HTMLButtonElement;
  private btnExport: HTMLButtonElement;
  private sectionCanvas: HTMLCanvasElement;
  private sunSlider: HTMLInputElement;
  private sunTimeLabel: HTMLElement;

  // Sun simulation elements
  private sunDiagram!: HTMLCanvasElement;
  private sunElevationEl!: HTMLElement;
  private sunAzimuthEl!: HTMLElement;
  private sunShadowEl!: HTMLElement;
  private sunPeriodEl!: HTMLElement;
  private sunDescEl!: HTMLElement;
  private sunIconEl!: HTMLElement;

  private resizeBeforeW = 0;
  private resizeBeforeD = 0;
  private resizeBeforeH = 0;
  private resizePending = false;
  private resizeTimer = 0;

  private sectionCutVisible = false;

  constructor(
    bm: BuildingManager,
    sm: SelectionManager,
    hm: HistoryManager,
    scene: SceneManager,
  ) {
    this.bm = bm;
    this.sm = sm;
    this.hm = hm;
    this.scene = scene;

    this.propsEmpty = document.getElementById("props-empty")!;
    this.propsContent = document.getElementById("props-content")!;
    this.propNameInput = document.getElementById(
      "prop-name-input",
    ) as HTMLInputElement;
    this.propColor = document.getElementById("prop-color")!;
    this.inputW = document.getElementById("input-w") as HTMLInputElement;
    this.inputD = document.getElementById("input-d") as HTMLInputElement;
    this.inputH = document.getElementById("input-h") as HTMLInputElement;
    this.btnDelete = document.getElementById("btn-delete") as HTMLButtonElement;
    this.historyList = document.getElementById("history-list")!;
    this.statusBar = document.getElementById("statusbar")!;
    this.statFootprint = document.getElementById("stat-footprint")!;
    this.statFloorArea = document.getElementById("stat-floor-area")!;
    this.farValue = document.getElementById("far-value")!;
    this.statCount = document.getElementById("stat-count")!;
    this.btnSectionCut = document.getElementById(
      "btn-section-cut",
    ) as HTMLButtonElement;
    this.btnExport = document.getElementById("btn-export") as HTMLButtonElement;
    this.sectionCanvas = document.getElementById(
      "section-cut-canvas",
    ) as HTMLCanvasElement;
    this.sunSlider = document.getElementById("sun-slider") as HTMLInputElement;
    this.sunTimeLabel = document.getElementById("sun-time-label")!;

    // Sun simulation elements
    this.sunDiagram = document.getElementById(
      "sun-diagram",
    ) as HTMLCanvasElement;
    this.sunElevationEl = document.getElementById("sun-elevation")!;
    this.sunAzimuthEl = document.getElementById("sun-azimuth")!;
    this.sunShadowEl = document.getElementById("sun-shadow")!;
    this.sunPeriodEl = document.getElementById("sun-period")!;
    this.sunDescEl = document.getElementById("sun-desc")!;
    this.sunIconEl = document.querySelector(".sun-icon") as HTMLElement;

    this._bindEvents();
    this._updateSun(0.5); // initial noon position
  }

  private _bindEvents(): void {
    this.inputW.addEventListener("input", () => this._onDimensionInput());
    this.inputD.addEventListener("input", () => this._onDimensionInput());
    this.inputH.addEventListener("input", () => this._onDimensionInput());

    this.inputW.addEventListener("focus", () => this._captureResizeBefore());
    this.inputD.addEventListener("focus", () => this._captureResizeBefore());
    this.inputH.addEventListener("focus", () => this._captureResizeBefore());

    this.inputW.addEventListener("blur", () => this._commitResize());
    this.inputD.addEventListener("blur", () => this._commitResize());
    this.inputH.addEventListener("blur", () => this._commitResize());

    this.btnDelete.addEventListener("click", () => this._deleteSelected());

    // ── Inline rename ─────────────────────────────────────────────────────
    this.propNameInput.addEventListener("change", () => {
      const ids = this.sm.getSelectedIds();
      if (ids.length !== 1) return;
      const newName = this.propNameInput.value.trim();
      if (!newName) {
        const b = this.bm.buildings.get(ids[0]);
        if (b) this.propNameInput.value = b.name;
        return;
      }
      this.bm.renameBuilding(ids[0], newName);
    });

    this.propNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.propNameInput.blur();
      if (e.key === "Escape") {
        const ids = this.sm.getSelectedIds();
        if (ids.length === 1) {
          const b = this.bm.buildings.get(ids[0]);
          if (b) this.propNameInput.value = b.name;
        }
        this.propNameInput.blur();
      }
    });

    // +/− step buttons via event delegation
    document.getElementById("panel")!.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".sbtn");
      if (!btn) return;

      const fieldId = btn.dataset.field!;
      const dir = parseInt(btn.dataset.dir!);
      const input = document.getElementById(fieldId) as HTMLInputElement;
      if (!input) return;

      this._captureResizeBefore();
      input.value = String(Math.max(1, (parseFloat(input.value) || 1) + dir));
      this._onDimensionInput();
      this._commitResize();
    });

    this.btnSectionCut.addEventListener("click", () =>
      this._toggleSectionCut(),
    );
    this.btnExport.addEventListener("click", () => this._exportJSON());

    this.sunSlider.addEventListener("input", () => {
      this._updateSun(parseInt(this.sunSlider.value) / 100);
    });

    document.addEventListener("keydown", (e) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        this._deleteSelected();
      }
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        this.hm.undo();
      }
      if (e.ctrlKey && e.key === "y") {
        e.preventDefault();
        this.hm.redo();
      }
    });
  }

  // ── Resize ──────────────────────────────────────────────────────────────────

  private _captureResizeBefore(): void {
    const selected = this.sm.getSelectedBuildings();
    if (selected.length !== 1) return;
    const b = selected[0];
    this.resizeBeforeW = b.width;
    this.resizeBeforeD = b.depth;
    this.resizeBeforeH = b.height;
    this.resizePending = false;
  }

  private _onDimensionInput(): void {
    const selected = this.sm.getSelectedBuildings();
    if (selected.length !== 1) return;
    const b = selected[0];

    const w = Math.max(1, parseFloat(this.inputW.value) || 1);
    const d = Math.max(1, parseFloat(this.inputD.value) || 1);
    const h = Math.max(1, parseFloat(this.inputH.value) || 1);

    this.bm.applyResize(b.id, w, d, h);
    this.resizePending = true;
  }

  private _commitResize(): void {
    if (!this.resizePending) return;
    this.resizePending = false;

    const selected = this.sm.getSelectedBuildings();
    if (selected.length !== 1) return;
    const b = selected[0];

    const cmd = new ResizeBuildingCommand(
      {
        id: b.id,
        oldW: this.resizeBeforeW,
        oldD: this.resizeBeforeD,
        oldH: this.resizeBeforeH,
        newW: b.width,
        newD: b.depth,
        newH: b.height,
      },
      this.bm,
    );
    this.hm.push(cmd);
  }

  private _deleteSelected(): void {
    const selected = this.sm.getSelectedBuildings();
    if (selected.length === 0) return;
    const cmd = new DeleteBuildingCommand(selected, this.bm);
    cmd.execute();
    this.hm.push(cmd);
  }

  // ── Selection / Properties ───────────────────────────────────────────────────

  onSelectionChange(ids: string[]): void {
    this.updatePropertiesPanel(ids);
  }

  updatePropertiesPanel(ids: string[]): void {
    if (ids.length !== 1) {
      this.propsEmpty.style.display = "block";
      this.propsContent.style.display = "none";
      this.propsEmpty.textContent =
        ids.length === 0 ? "No mass selected" : `${ids.length} masses selected`;
      return;
    }

    const b = this.bm.buildings.get(ids[0]);
    if (!b) return;

    this.propsEmpty.style.display = "none";
    this.propsContent.style.display = "block";
    this.propNameInput.value = b.name;
    this.propColor.style.background = b.colorHex;
    this.inputW.value = b.width.toString();
    this.inputD.value = b.depth.toString();
    this.inputH.value = b.height.toString();
  }

  // ── Stats ────────────────────────────────────────────────────────────────────

  updateStats(): void {
    const buildings = this.bm.getAll();
    const count = buildings.length;

    let footprint = 0;
    let floorArea = 0;
    for (const b of buildings) {
      const fp = b.width * b.depth;
      footprint += fp;
      floorArea += fp * Math.max(1, Math.ceil(b.height / FLOOR_HEIGHT));
    }

    const far = count === 0 ? 0 : floorArea / SITE_AREA;
    const overLimit = far > FAR_LIMIT;

    this.statCount.textContent = count.toString();
    this.statFootprint.textContent = `${footprint.toFixed(0)} m²`;
    this.statFloorArea.textContent = `${floorArea.toFixed(0)} m²`;
    this.farValue.textContent = far.toFixed(2);

    this.farValue.classList.toggle("over", overLimit);
    this.statusBar.classList.toggle("over-limit", overLimit);
    this.scene.setSiteBoundaryOverLimit(overLimit);

    const selectedIds = this.sm.getSelectedIds();
    if (selectedIds.length === 1) this.updatePropertiesPanel(selectedIds);

    if (this.sectionCutVisible) this._drawSectionCut();
  }

  // ── History ──────────────────────────────────────────────────────────────────

  updateHistory(): void {
    const stack = this.hm.getStack();
    const pointer = this.hm.getPointer();
    this.historyList.innerHTML = "";

    if (stack.length === 0) {
      this.historyList.innerHTML = `<div style="font-size:11px;color:var(--text-muted);font-style:italic;">No actions yet</div>`;
      return;
    }

    for (let i = stack.length - 1; i >= 0; i--) {
      const cmd = stack[i] as any;
      const label = cmd.label ?? cmd.type;
      const div = document.createElement("div");
      div.className = "history-item";
      if (i === pointer) div.classList.add("current");
      else if (i > pointer) div.classList.add("future");

      const icons: Record<string, string> = {
        ADD: "＋",
        DELETE: "✕",
        RESIZE: "⟷",
        MOVE: "↕",
      };
      const icon = icons[cmd.type] ?? "○";
      div.innerHTML = `<span class="history-icon">${icon}</span> ${label}`;
      this.historyList.appendChild(div);
    }
  }

  // ── Section Cut ──────────────────────────────────────────────────────────────

  private _toggleSectionCut(): void {
    this.sectionCutVisible = !this.sectionCutVisible;
    this.btnSectionCut.classList.toggle("active", this.sectionCutVisible);
    if (this.sectionCutVisible) {
      // Reset pan/zoom on open
      this.planOffsetX = 0;
      this.planOffsetY = 0;
      this.planScale = 1;
      this.sectionCanvas.classList.add("visible");
      this._attachPlanViewDrag();
      this._drawSectionCut();
    } else {
      this.sectionCanvas.classList.remove("visible");
      this._detachPlanViewDrag();
    }
  }

  private _planWheelHandler = (e: WheelEvent) => this._onPlanWheel(e);
  private _planDownHandler = (e: PointerEvent) => this._onPlanDown(e);
  private _planMoveHandler = (e: PointerEvent) => this._onPlanMove(e);
  private _planUpHandler = (e: PointerEvent) => this._onPlanUp(e);

  private _attachPlanViewDrag(): void {
    const c = this.sectionCanvas;
    c.addEventListener("wheel", this._planWheelHandler, { passive: false });
    c.addEventListener("pointerdown", this._planDownHandler);
    c.addEventListener("pointermove", this._planMoveHandler);
    c.addEventListener("pointerup", this._planUpHandler);
    c.addEventListener("pointerleave", this._planUpHandler);
    c.addEventListener("dblclick", () => {
      this.planOffsetX = 0;
      this.planOffsetY = 0;
      this.planScale = 1;
      this._drawSectionCut();
    });
  }

  private _detachPlanViewDrag(): void {
    const c = this.sectionCanvas;
    c.removeEventListener("wheel", this._planWheelHandler);
    c.removeEventListener("pointerdown", this._planDownHandler);
    c.removeEventListener("pointermove", this._planMoveHandler);
    c.removeEventListener("pointerup", this._planUpHandler);
    c.removeEventListener("pointerleave", this._planUpHandler);
  }

  private _onPlanWheel(e: WheelEvent): void {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.3, Math.min(5, this.planScale * zoomFactor));

    // Zoom toward mouse cursor position
    const rect = this.sectionCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    this.planOffsetX =
      mouseX - (mouseX - this.planOffsetX) * (newScale / this.planScale);
    this.planOffsetY =
      mouseY - (mouseY - this.planOffsetY) * (newScale / this.planScale);
    this.planScale = newScale;

    this._drawSectionCut();
  }

  private _onPlanDown(e: PointerEvent): void {
    this.planDragging = true;
    this.planDragStartX = e.clientX;
    this.planDragStartY = e.clientY;
    this.planDragOriginX = this.planOffsetX;
    this.planDragOriginY = this.planOffsetY;
    this.sectionCanvas.setPointerCapture(e.pointerId);
    this.sectionCanvas.style.cursor = "grabbing";
  }

  private _onPlanMove(e: PointerEvent): void {
    if (!this.planDragging) return;
    this.planOffsetX = this.planDragOriginX + (e.clientX - this.planDragStartX);
    this.planOffsetY = this.planDragOriginY + (e.clientY - this.planDragStartY);
    this._drawSectionCut();
  }

  private _onPlanUp(_e: PointerEvent): void {
    this.planDragging = false;
    this.sectionCanvas.style.cursor = "grab";
  }

  private _drawSectionCut(): void {
    const canvas = this.sectionCanvas;
    const parent = canvas.parentElement!;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;

    // Set grab cursor
    if (!this.planDragging) canvas.style.cursor = "grab";

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#0e0f11";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ── Apply pan + zoom transform ────────────────────────────────────────
    ctx.save();
    ctx.translate(this.planOffsetX, this.planOffsetY);
    ctx.scale(this.planScale, this.planScale);

    const CX = canvas.width / 2;
    const CY = canvas.height / 2;
    const PAD = 60;
    const scaleX = (canvas.width - PAD * 2) / 50;
    const scaleY = (canvas.height - PAD * 2) / 40;
    const scale = Math.min(scaleX, scaleY);

    const toX = (wx: number) => CX + wx * scale;
    const toY = (wz: number) => CY + wz * scale;

    // 1m grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 0.5;
    for (let g = -25; g <= 25; g++) {
      ctx.beginPath();
      ctx.moveTo(toX(g), toY(-20));
      ctx.lineTo(toX(g), toY(20));
      ctx.stroke();
    }
    for (let g = -20; g <= 20; g++) {
      ctx.beginPath();
      ctx.moveTo(toX(-25), toY(g));
      ctx.lineTo(toX(25), toY(g));
      ctx.stroke();
    }

    // 5m grid
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.lineWidth = 1;
    for (let g = -25; g <= 25; g += 5) {
      ctx.beginPath();
      ctx.moveTo(toX(g), toY(-20));
      ctx.lineTo(toX(g), toY(20));
      ctx.stroke();
    }
    for (let g = -20; g <= 20; g += 5) {
      ctx.beginPath();
      ctx.moveTo(toX(-25), toY(g));
      ctx.lineTo(toX(25), toY(g));
      ctx.stroke();
    }

    // Site boundary
    const siteX = toX(-25),
      siteY = toY(-20);
    const siteW = 50 * scale,
      siteH = 40 * scale;

    ctx.fillStyle = "rgba(74,222,128,0.04)";
    ctx.fillRect(siteX, siteY, siteW, siteH);

    ctx.strokeStyle = "rgba(74,222,128,0.7)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(siteX, siteY, siteW, siteH);
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(74,222,128,0.6)";
    ctx.font = `11px 'JetBrains Mono', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("50m", siteX + siteW / 2, siteY - 4);

    ctx.save();
    ctx.translate(siteX - 4, siteY + siteH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = "bottom";
    ctx.fillText("40m", 0, 0);
    ctx.restore();

    // Buildings
    const buildings = this.bm.getAll();

    for (const b of buildings) {
      const bx = toX(b.posX - b.width / 2);
      const bz = toY(b.posZ - b.depth / 2);
      const bw = b.width * scale;
      const bd = b.depth * scale;

      // Drop shadow
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(bx + 4, bz + 4, bw, bd);

      // Fill
      ctx.fillStyle = b.colorHex + "cc";
      ctx.fillRect(bx, bz, bw, bd);

      // Border
      ctx.strokeStyle = b.colorHex;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, bz, bw, bd);

      // Dimension lines
      const TICK = 5,
        DGAP = 10;
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1;

      // Width (bottom)
      const dimY = bz + bd + DGAP;
      ctx.beginPath();
      ctx.moveTo(bx, bz + bd);
      ctx.lineTo(bx, dimY + TICK);
      ctx.moveTo(bx + bw, bz + bd);
      ctx.lineTo(bx + bw, dimY + TICK);
      ctx.moveTo(bx, dimY);
      ctx.lineTo(bx + bw, dimY);
      ctx.moveTo(bx, dimY);
      ctx.lineTo(bx + 5, dimY - 3);
      ctx.moveTo(bx, dimY);
      ctx.lineTo(bx + 5, dimY + 3);
      ctx.moveTo(bx + bw, dimY);
      ctx.lineTo(bx + bw - 5, dimY - 3);
      ctx.moveTo(bx + bw, dimY);
      ctx.lineTo(bx + bw - 5, dimY + 3);
      ctx.stroke();

      ctx.font = `bold ${Math.max(10, scale * 1.1)}px 'JetBrains Mono', monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(`${b.width}m`, bx + bw / 2, dimY + 3);

      // Depth (right)
      const dimX = bx + bw + DGAP;
      ctx.beginPath();
      ctx.moveTo(bx + bw, bz);
      ctx.lineTo(dimX + TICK, bz);
      ctx.moveTo(bx + bw, bz + bd);
      ctx.lineTo(dimX + TICK, bz + bd);
      ctx.moveTo(dimX, bz);
      ctx.lineTo(dimX, bz + bd);
      ctx.moveTo(dimX, bz);
      ctx.lineTo(dimX - 3, bz + 5);
      ctx.moveTo(dimX, bz);
      ctx.lineTo(dimX + 3, bz + 5);
      ctx.moveTo(dimX, bz + bd);
      ctx.lineTo(dimX - 3, bz + bd - 5);
      ctx.moveTo(dimX, bz + bd);
      ctx.lineTo(dimX + 3, bz + bd - 5);
      ctx.stroke();

      ctx.save();
      ctx.translate(dimX + 3, bz + bd / 2);
      ctx.rotate(Math.PI / 2);
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${b.depth}m`, 0, 0);
      ctx.restore();

      // Name
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.max(10, scale * 1.2)}px 'JetBrains Mono', monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.name, bx + bw / 2, bz + bd / 2 - 7);

      // Height
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = `${Math.max(9, scale * 0.9)}px 'JetBrains Mono', monospace`;
      ctx.fillText(`h:${b.height}m`, bx + bw / 2, bz + bd / 2 + 7);
    }

    ctx.restore(); // ← end pan/zoom transform

    // ── UI overlays (not affected by pan/zoom) ────────────────────────────

    // North arrow
    const NX = canvas.width - 36,
      NY = 44,
      NR = 16;
    ctx.save();
    ctx.translate(NX, NY);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, NR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(74,222,128,0.9)";
    ctx.beginPath();
    ctx.moveTo(0, -NR);
    ctx.lineTo(6, 4);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.moveTo(0, NR);
    ctx.lineTo(-6, 4);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -NR);
    ctx.lineTo(-6, 4);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(74,222,128,0.9)";
    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", 0, -NR - 8);
    ctx.restore();

    // Scale bar
    const SX = 20,
      SY = canvas.height - 20,
      S5 = 5 * scale * this.planScale;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(SX, SY);
    ctx.lineTo(SX + S5, SY);
    ctx.moveTo(SX, SY - 4);
    ctx.lineTo(SX, SY + 4);
    ctx.moveTo(SX + S5, SY - 4);
    ctx.lineTo(SX + S5, SY + 4);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("5m", SX + S5 / 2, SY - 6);

    // Zoom level indicator
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${Math.round(this.planScale * 100)}%`, SX, SY - 6);

    // Reset button hint
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(
      "SCROLL = ZOOM  •  DRAG = PAN  •  DBL-CLICK = RESET",
      20,
      canvas.height - 36,
    );

    // Header
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(0, 0, canvas.width, 36);
    ctx.fillStyle = "rgba(74,222,128,0.9)";
    ctx.font = "bold 12px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("PLAN VIEW  —  TOP DOWN  —  ORTHOGRAPHIC", 16, 18);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText(
      `${buildings.length} MASS${buildings.length !== 1 ? "ES" : ""}  |  CLICK ⊞ PLAN TO EXIT`,
      canvas.width - 16,
      18,
    );
  }

  // ── Sun Simulation ───────────────────────────────────────────────────────────

  private _updateSun(t: number): void {
    this.scene.setSunAngle(t);

    // Time display
    const totalMinutes = 6 * 60 + t * 12 * 60;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor(totalMinutes % 60)
      .toString()
      .padStart(2, "0");
    const hours12 = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    const period = hours >= 12 ? "PM" : "AM";

    this.sunTimeLabel.textContent = `${hours12}:${minutes}`;
    if (this.sunPeriodEl) this.sunPeriodEl.textContent = period;

    // Elevation & azimuth
    const elevation = Math.max(0, Math.sin(Math.PI * t));
    const elevationDeg = Math.round(elevation * 90);
    const azimuthDeg = Math.round(t * 180);

    if (this.sunElevationEl)
      this.sunElevationEl.textContent = `${elevationDeg}°`;
    if (this.sunAzimuthEl) this.sunAzimuthEl.textContent = `${azimuthDeg}°`;

    // Shadow length in metres: height / tan(elevation)
    const elevRad = Math.max(0.01, elevation * (Math.PI / 2));
    const shadowMetres =
      elevation < 0.05 ? Infinity : Math.min(99, 3 / Math.tan(elevRad));

    if (this.sunShadowEl) {
      this.sunShadowEl.textContent =
        elevation < 0.05 ? "∞" : `${shadowMetres.toFixed(1)}m`;
    }

    // Contextual label
    let sunDesc: string;
    let iconColor: string;

    if (elevationDeg < 10) {
      sunDesc = t < 0.5 ? "Sunrise" : "Sunset";
      iconColor = "#f97316";
    } else if (elevationDeg < 30) {
      sunDesc = t < 0.5 ? "Morning" : "Evening";
      iconColor = "#fbbf24";
    } else if (elevationDeg < 60) {
      sunDesc = t < 0.5 ? "Mid Morning" : "Afternoon";
      iconColor = "#fde68a";
    } else {
      sunDesc = "High Sun";
      iconColor = "#ffffff";
    }

    if (this.sunDescEl) this.sunDescEl.textContent = sunDesc;
    if (this.sunIconEl) {
      this.sunIconEl.style.color = iconColor;
      this.sunIconEl.style.transform = `rotate(${(t - 0.5) * 60}deg)`;
    }

    if (this.sunDiagram) this._drawSunDiagram(t, elevationDeg);
  }

  private _drawSunDiagram(t: number, elevationDeg: number): void {
    const canvas = this.sunDiagram;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width,
      H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    const elevation = Math.max(0, Math.sin(Math.PI * t));

    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    if (elevation < 0.1) {
      skyGrad.addColorStop(0, "#1a0a00");
      skyGrad.addColorStop(1, "#3d1a00");
    } else {
      skyGrad.addColorStop(0, "#0a1628");
      skyGrad.addColorStop(1, "#0e1f3d");
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    const groundY = H - 14;

    // Ground line
    ctx.strokeStyle = "rgba(74,222,128,0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W, groundY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Ground fill
    ctx.fillStyle = "rgba(74,222,128,0.06)";
    ctx.fillRect(0, groundY, W, H - groundY);

    // E / W labels
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("E", 4, groundY - 2);
    ctx.textAlign = "right";
    ctx.fillText("W", W - 4, groundY - 2);

    // Sun path arc
    ctx.strokeStyle = "rgba(251,191,36,0.25)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const ti = i / 100;
      const ex = ti * W;
      const ey = groundY - Math.max(0, Math.sin(Math.PI * ti)) * (groundY - 10);
      i === 0 ? ctx.moveTo(ex, ey) : ctx.lineTo(ex, ey);
    }
    ctx.stroke();

    // Current sun X/Y on canvas
    const sunX = t * W;
    const sunY = groundY - Math.max(0, Math.sin(Math.PI * t)) * (groundY - 10);

    // Shadow ray from sun toward ground
    if (elevation > 0.02) {
      const shadowLen = (1 - elevation) * 55;
      const grad = ctx.createLinearGradient(
        sunX,
        sunY,
        sunX + shadowLen,
        groundY,
      );
      grad.addColorStop(0, "rgba(251,191,36,0.4)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(sunX, sunY);
      ctx.lineTo(sunX + shadowLen, groundY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Sun glow
    if (elevation > 0.02) {
      const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 16);
      const alpha = 0.2 + elevation * 0.3;
      glow.addColorStop(0, `rgba(251,191,36,${alpha})`);
      glow.addColorStop(1, "rgba(251,191,36,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 16, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sun disc
    const sunRadius = elevation > 0.02 ? 5 : 3;
    const sunColor =
      elevation > 0.3 ? "#fffde7" : elevation > 0.1 ? "#fbbf24" : "#f97316";
    ctx.fillStyle = sunColor;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    ctx.fill();

    // Vertical drop line
    if (elevation > 0.05) {
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(sunX, sunY);
      ctx.lineTo(sunX, groundY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Elevation label
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${elevationDeg}°`, sunX, sunY - 7);
    }
  }

  // ── Export ───────────────────────────────────────────────────────────────────

  private _exportJSON(): void {
    const buildings = this.bm.getAll();
    const data = buildings.map((b) => ({
      id: b.id,
      name: b.name,
      position: { x: b.posX, y: b.baseY, z: b.posZ },
      dimensions: { w: b.width, d: b.depth, h: b.height },
      floors: Math.max(1, Math.ceil(b.height / FLOOR_HEIGHT)),
      footprintArea: b.width * b.depth,
      floorArea:
        b.width * b.depth * Math.max(1, Math.ceil(b.height / FLOOR_HEIGHT)),
    }));

    const json = JSON.stringify(
      { buildings: data, siteArea: SITE_AREA },
      null,
      2,
    );
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "massing-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }
}
