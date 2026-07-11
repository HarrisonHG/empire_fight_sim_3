import {
  Application,
  Container,
  Graphics,
  Sprite,
  type Texture,
} from "pixi.js";

import type {
  InitialSimulationSnapshot,
  PositionSimulationSnapshot,
  SimulationBounds,
  SimulationSnapshot,
} from "../sim/types";

const DOT_RADIUS = 2;
const DOT_COLOR = 0xe8_f1_ff;
const BACKGROUND_COLOR = 0x0d_13_1f;
const DEFAULT_DOT_TINT = 0xff_ff_ff;
const FIRST_FACTION_TINT = 0x63_9d_ff;
const SECOND_FACTION_TINT = 0xff_6b_78;

export class PixiEntityRenderer {
  private readonly worldLayer = new Container();
  private readonly spritesByEntityId = new Map<number, Sprite>();
  private entityOrder: Uint32Array | undefined;
  private worldBounds: SimulationBounds | undefined;

  private constructor(
    private readonly application: Application,
    private readonly dotTexture: Texture,
  ) {
    this.application.stage.addChild(this.worldLayer);
    window.addEventListener("resize", this.handleResize);
  }

  public static async create(host: HTMLElement): Promise<PixiEntityRenderer> {
    const application = new Application();
    await application.init({
      antialias: false,
      autoDensity: true,
      backgroundColor: BACKGROUND_COLOR,
      preference: "webgl",
      resizeTo: host,
      resolution: Math.min(window.devicePixelRatio, 2),
    });

    const dot = new Graphics()
      .circle(DOT_RADIUS, DOT_RADIUS, DOT_RADIUS)
      .fill(DOT_COLOR);
    const dotTexture = application.renderer.generateTexture({
      target: dot,
      resolution: 1,
    });
    dot.destroy();

    application.canvas.setAttribute("aria-label", "Simulation viewport");
    application.canvas.setAttribute("role", "img");
    host.append(application.canvas);

    return new PixiEntityRenderer(application, dotTexture);
  }

  public applySnapshot(snapshot: SimulationSnapshot): void {
    switch (snapshot.kind) {
      case "initial":
        this.applyInitialSnapshot(snapshot);
        break;
      case "positions":
        this.applyPositionSnapshot(snapshot);
        break;
    }
  }

  public destroy(): void {
    window.removeEventListener("resize", this.handleResize);

    for (const sprite of this.spritesByEntityId.values()) {
      sprite.destroy();
    }

    this.spritesByEntityId.clear();
    this.dotTexture.destroy(true);
    this.application.destroy(true, { children: true });
  }

  private applyInitialSnapshot(snapshot: InitialSimulationSnapshot): void {
    this.validateSnapshotLengths(snapshot);

    const activeEntityIds = new Set<number>();
    for (let index = 0; index < snapshot.entityCount; index += 1) {
      const entityId = snapshot.ids[index]!;
      if (activeEntityIds.has(entityId)) {
        throw new Error(`Initial snapshot contains duplicate entity ID ${entityId}.`);
      }

      activeEntityIds.add(entityId);
      if (!this.spritesByEntityId.has(entityId)) {
        const sprite = new Sprite(this.dotTexture);
        sprite.anchor.set(0.5);
        this.spritesByEntityId.set(entityId, sprite);
        this.worldLayer.addChild(sprite);
      }

      const sprite = this.spritesByEntityId.get(entityId);
      if (sprite === undefined) {
        throw new Error(`Renderer has no sprite for entity ID ${entityId}.`);
      }

      sprite.tint = getFactionTint(snapshot.factionIds?.[index]);
    }

    for (const [entityId, sprite] of this.spritesByEntityId) {
      if (!activeEntityIds.has(entityId)) {
        this.worldLayer.removeChild(sprite);
        sprite.destroy();
        this.spritesByEntityId.delete(entityId);
      }
    }

    this.entityOrder = snapshot.ids.slice();
    this.worldBounds = {
      width: snapshot.bounds.width,
      height: snapshot.bounds.height,
    };
    this.updateSpritePositions(snapshot.positions);
    this.layoutWorld();
  }

  private applyPositionSnapshot(snapshot: PositionSimulationSnapshot): void {
    if (this.entityOrder === undefined) {
      throw new Error("Position snapshot received before an initial snapshot.");
    }

    if (snapshot.entityCount !== this.entityOrder.length) {
      throw new Error(
        `Position snapshot entity count ${snapshot.entityCount} does not match renderer count ${this.entityOrder.length}.`,
      );
    }

    if (snapshot.positions.length !== snapshot.entityCount * 2) {
      throw new Error("Position snapshot has an invalid interleaved position count.");
    }

    this.updateSpritePositions(snapshot.positions);
  }

  private validateSnapshotLengths(snapshot: InitialSimulationSnapshot): void {
    if (snapshot.ids.length !== snapshot.entityCount) {
      throw new Error("Initial snapshot has an invalid entity ID count.");
    }

    if (snapshot.positions.length !== snapshot.entityCount * 2) {
      throw new Error("Initial snapshot has an invalid interleaved position count.");
    }

    if (
      snapshot.factionIds !== undefined &&
      snapshot.factionIds.length !== snapshot.entityCount
    ) {
      throw new Error("Initial snapshot has an invalid faction ID count.");
    }
  }

  private updateSpritePositions(positions: Int32Array): void {
    const entityOrder = this.entityOrder;
    if (entityOrder === undefined) {
      return;
    }

    for (let index = 0; index < entityOrder.length; index += 1) {
      const entityId = entityOrder[index]!;
      const sprite = this.spritesByEntityId.get(entityId);
      if (sprite === undefined) {
        throw new Error(`Renderer has no sprite for entity ID ${entityId}.`);
      }

      const positionOffset = index * 2;
      sprite.position.set(
        positions[positionOffset]!,
        positions[positionOffset + 1]!,
      );
    }
  }

  private layoutWorld(): void {
    const bounds = this.worldBounds;
    if (bounds === undefined) {
      return;
    }

    const scale = Math.min(
      this.application.screen.width / bounds.width,
      this.application.screen.height / bounds.height,
    );
    this.worldLayer.scale.set(scale);
    this.worldLayer.position.set(
      (this.application.screen.width - bounds.width * scale) / 2,
      (this.application.screen.height - bounds.height * scale) / 2,
    );
  }

  private readonly handleResize = (): void => {
    this.application.resize();
    this.layoutWorld();
  };
}

function getFactionTint(factionId: number | undefined): number {
  switch (factionId) {
    case 1:
      return FIRST_FACTION_TINT;
    case 2:
      return SECOND_FACTION_TINT;
    default:
      return DEFAULT_DOT_TINT;
  }
}
