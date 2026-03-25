import {
  Engine,
  Scene,
  ArcRotateCamera,
  DirectionalLight,
  Vector3,
  Color3,
  Color4,
  HemisphericLight,
  ShadowGenerator,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  AxesViewer,
  RenderTargetTexture,
} from "@babylonjs/core";
import { GridMaterial } from "@babylonjs/materials";

export class SceneManager {
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
  dirLight: DirectionalLight;
  shadowGenerator: ShadowGenerator;
  groundMesh: Mesh;
  siteBoundary: Mesh;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true);
    this.engine.setHardwareScalingLevel(1 / window.devicePixelRatio);
    this.scene = new Scene(this.engine);
    this.scene.createDefaultEnvironment({
      createSkybox: true,
      skyboxSize: 500,
    });

    this.camera = this._setupCamera(canvas);
    this.dirLight = this._setupLighting();
    this.shadowGenerator = this._setupShadows();
    this.groundMesh = this._setupGround();
    this.siteBoundary = this._setupSiteBoundary();
    this._setupAxes();

    window.addEventListener("resize", () => this.engine.resize());
    this.engine.runRenderLoop(() => this.scene.render());
  }

  private _setupCamera(canvas: HTMLCanvasElement): ArcRotateCamera {
    const cam = new ArcRotateCamera(
      "cam",
      -Math.PI / 4,
      Math.PI / 3.5,
      80,
      new Vector3(0, 5, 0),
      this.scene,
    );
    cam.lowerRadiusLimit = 5;
    cam.upperRadiusLimit = 200;
    cam.lowerBetaLimit = 0.1;
    cam.upperBetaLimit = Math.PI / 2 - 0.05;
    cam.wheelPrecision = 3;
    cam.panningSensibility = 50;
    cam.panningDistanceLimit = 100;
    cam.attachControl(canvas, true);
    cam.inertia = 0.9;
    cam.angularSensibilityX = 500;
    cam.angularSensibilityY = 500;

    return cam;
  }

 private _setupLighting(): DirectionalLight {
  // 🌤️ Ambient (sky light)
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), this.scene);
  hemi.intensity = 0.4;
  hemi.diffuse = new Color3(0.75, 0.8, 0.9);   // sky tint
  hemi.groundColor = new Color3(0.2, 0.2, 0.25); // subtle ground bounce

  // ☀️ Directional (sun light)
  const dir = new DirectionalLight(
    "dir",
    new Vector3(-0.6, -1, -0.4),
    this.scene
  );

  dir.position = new Vector3(50, 80, 50);

  // 🔥 Better intensity balance
  dir.intensity = 1.2;

  // 🌅 Slight warm sunlight
  dir.diffuse = new Color3(1, 0.96, 0.9);
  dir.specular = new Color3(1, 0.96, 0.9);

  // 🧠 IMPORTANT: stabilize shadows (huge visual improvement)
  dir.autoUpdateExtends = false;
  dir.shadowFrustumSize = 150;

  return dir;
}
  private _setupShadows(): ShadowGenerator {
    const sg = new ShadowGenerator(2048, this.dirLight);
    sg.useBlurExponentialShadowMap = true;
    sg.blurKernel = 16;
    sg.useContactHardeningShadow = true;
    sg.contactHardeningLightSizeUVRatio = 0.05;
    sg.bias = 0.0005;
sg.normalBias = 0.02;

    // CRITICAL: refresh every frame so shadows update live when light moves
    const shadowMap = sg.getShadowMap();
    if (shadowMap) {
      shadowMap.refreshRate =
        RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME;
    }

    return sg;
  }

  private _setupGround(): Mesh {
    const ground = MeshBuilder.CreateGround(
      "site",
      { width: 200, height: 200, subdivisions: 1 },
      this.scene,
    );
    const mat = new GridMaterial("gridMat", this.scene);

    // 🔲 GRID STRUCTURE
    mat.gridRatio = 1; // base grid size (1 unit)
    mat.majorUnitFrequency = 5; // thick line every 5 units
    mat.minorUnitVisibility = 0.45; // visibility of small lines

    // 🎨 COLORS (more professional contrast)
    mat.mainColor = new Color3(0.11, 0.12, 0.14); // darker background
    mat.lineColor = new Color3(0.35, 0.38, 0.42); // softer grid lines

    // ✨ VISUAL QUALITY
    mat.opacity = 0.95;
    mat.backFaceCulling = false;

    // 🔥 PRO SETTINGS (important additions)
    mat.useMaxLine = true; // sharper major lines
    mat.opacity = 0.95;
    ground.material = mat;
    ground.receiveShadows = true;
    ground.metadata = { type: "ground" };

    // 🧠 OPTIONAL: make grid slightly fade at distance (clean UX)
    // this.scene.onBeforeRenderObservable.add(() => {
    //   const r = this.camera.radius;

    //   // Adaptive grid density
    //   if (r > 120) mat.gridRatio = 10;
    //   else if (r > 60) mat.gridRatio = 5;
    //   else mat.gridRatio = 1;

    //   // Subtle fade
    //   mat.opacity = Math.max(0.35, 1 - r / 300);
    // });
    return ground;
  }

  private _setupSiteBoundary(): Mesh {
    const box = MeshBuilder.CreateBox(
      "siteBoundary",
      { width: 50, depth: 40, height: 0.05 },
      this.scene,
    );
    const mat = new StandardMaterial("siteMat", this.scene);
    mat.diffuseColor = new Color3(0.25, 0.8, 0.45);
    mat.emissiveColor = new Color3(0.1, 0.4, 0.2);
    mat.wireframe = true;
    mat.alpha = 0.6;
    box.material = mat;
    box.position.y = 0.03;
    box.isPickable = false;
    return box;
  }

  private _setupAxes(): void {
   new AxesViewer(this.scene, 5);
  }

  setSiteBoundaryOverLimit(over: boolean): void {
    const mat = this.siteBoundary.material as StandardMaterial;
    if (over) {
      mat.diffuseColor = new Color3(0.9, 0.2, 0.2);
      mat.emissiveColor = new Color3(0.5, 0.1, 0.1);
    } else {
      mat.diffuseColor = new Color3(0.25, 0.8, 0.45);
      mat.emissiveColor = new Color3(0.1, 0.4, 0.2);
    }
  }

  setSunAngle(t: number): void {
    // t: 0 = 6am, 1 = 6pm
    // Elevation: sine arc — 0 at horizon, peaks at noon
    const elevation = Math.max(0.02, Math.sin(Math.PI * t));

    // Azimuth: east (−X) at dawn → overhead → west (+X) at dusk
    const azimuth = Math.PI * t; // 0 → π

    // Direction vector pointing FROM sky TO scene (downward)
    const dx = Math.cos(azimuth);
    const dy = -elevation;
    const dz = -0.3 * Math.sin(Math.PI * t); // slight north/south arc

    this.dirLight.direction = new Vector3(dx, dy, dz).normalize();
    this.dirLight.autoUpdateExtends = false;
    this.dirLight.shadowFrustumSize = 150;

    // Place light far away in the opposite direction for accurate shadow projection
    this.dirLight.position = new Vector3(-dx * 100, elevation * 100, -dz * 100);

    // Intensity: dim at dawn/dusk, full at noon
    this.dirLight.intensity = 0.2 + elevation * 1.1;

    // Colour temperature: orange at low sun, white at high sun
    const warmth = 1 - elevation;
    this.dirLight.diffuse = new Color3(
      1,
      0.6 + elevation * 0.4,
      0.2 + elevation * 0.8 - warmth * 0.1,
    );

  }

  dispose(): void {
    this.engine.dispose();
  }
}
