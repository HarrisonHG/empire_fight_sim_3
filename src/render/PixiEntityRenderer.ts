import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  type Texture,
} from "pixi.js";

import type {
  IndividualCombatVisualState,
  InitialSimulationSnapshot,
  PositionSimulationSnapshot,
  SimulationBounds,
  SimulationSnapshot,
} from "../sim/types";
import {
  getArmourGlyphSpec,
  getShieldGlyphSpec,
  getWeaponGlyphSpec,
  shouldRenderPreferredDistanceMarker,
} from "./combatGlyphGrammar";

const DOT_RADIUS = 2;
const DOT_COLOR = 0xe8_f1_ff;
const BACKGROUND_COLOR = 0x0d_13_1f;
const DEFAULT_DOT_TINT = 0xff_ff_ff;
const FIRST_FACTION_TINT = 0x63_9d_ff;
const SECOND_FACTION_TINT = 0xff_6b_78;
const GLYPH_BODY_RADIUS = 4;
const GLYPH_DIRECTION_LENGTH = 9;
const OCTANT_RADIANS = Math.PI / 4;
const REACH_COLOR = 0xff_f3_a3;
const PREFERRED_COLOR = 0x7d_ff_c7;
const WEAPON_COLOR = 0xf8_fa_fc;
const FACING_COLOR = 0xff_f3_a3;
const SHIELD_COLOR = 0x93_c5_fd;
const ARMOUR_COLOR = 0xe2_e8_f0;

export interface RenderWorldLabel {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

export class PixiEntityRenderer {
  private readonly worldLayer = new Container();
  private readonly reachOverlayLayer = new Container();
  private readonly entityLayer = new Container();
  private readonly combatGlyphLayer = new Container();
  private readonly worldLabelLayer = new Container();
  private readonly spritesByEntityId = new Map<number, Sprite>();
  private readonly combatGlyphsByEntityId = new Map<number, Graphics>();
  private readonly reachGlyphsByEntityId = new Map<number, Graphics>();
  private readonly worldLabelsByText = new Map<string, Text>();
  private entityOrder: Uint32Array | undefined;
  private worldBounds: SimulationBounds | undefined;

  private constructor(
    private readonly application: Application,
    private readonly dotTexture: Texture,
  ) {
    this.worldLayer.addChild(
      this.reachOverlayLayer,
      this.entityLayer,
      this.combatGlyphLayer,
      this.worldLabelLayer,
    );
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

  public setReachOverlayVisible(visible: boolean): void {
    this.reachOverlayLayer.visible = visible;
  }

  public setWorldLabels(labels: readonly RenderWorldLabel[]): void {
    const activeLabels = new Set<string>();
    for (const label of labels) {
      activeLabels.add(label.text);
      let text = this.worldLabelsByText.get(label.text);
      if (text === undefined) {
        text = new Text({
          text: label.text,
          style: {
            fill: 0xe2_e8_f0,
            fontFamily: "system-ui, sans-serif",
            fontSize: 12,
            fontWeight: "600",
            stroke: { color: 0x0d_13_1f, width: 3 },
          },
        });
        text.anchor.set(0.5);
        this.worldLabelsByText.set(label.text, text);
        this.worldLabelLayer.addChild(text);
      }
      text.position.set(label.x, label.y);
    }

    for (const [label, text] of this.worldLabelsByText) {
      if (activeLabels.has(label)) {
        continue;
      }
      this.worldLabelLayer.removeChild(text);
      text.destroy();
      this.worldLabelsByText.delete(label);
    }
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
    for (const glyph of this.combatGlyphsByEntityId.values()) {
      glyph.destroy();
    }
    for (const glyph of this.reachGlyphsByEntityId.values()) {
      glyph.destroy();
    }
    for (const label of this.worldLabelsByText.values()) {
      label.destroy();
    }

    this.spritesByEntityId.clear();
    this.combatGlyphsByEntityId.clear();
    this.reachGlyphsByEntityId.clear();
    this.worldLabelsByText.clear();
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
        this.entityLayer.addChild(sprite);
      }

      const sprite = this.spritesByEntityId.get(entityId);
      if (sprite === undefined) {
        throw new Error(`Renderer has no sprite for entity ID ${entityId}.`);
      }

      sprite.tint = getFactionTint(snapshot.factionIds?.[index]);
    }

    for (const [entityId, sprite] of this.spritesByEntityId) {
      if (!activeEntityIds.has(entityId)) {
        this.entityLayer.removeChild(sprite);
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
    this.updateCombatGlyphs(
      snapshot.positions,
      snapshot.combatDebug?.individualCombatVisuals ?? [],
    );
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
    this.updateCombatGlyphs(
      snapshot.positions,
      snapshot.combatDebug?.individualCombatVisuals ?? [],
    );
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

  private updateCombatGlyphs(
    positions: Int32Array,
    visualStates: readonly IndividualCombatVisualState[],
  ): void {
    const activeEntityIds = new Set<number>();
    for (let index = 0; index < visualStates.length; index += 1) {
      const visualState = visualStates[index]!;
      activeEntityIds.add(visualState.entityId);
      const positionOffset = this.getPositionOffsetForEntity(visualState.entityId);
      const x = positions[positionOffset]!;
      const y = positions[positionOffset + 1]!;

      const combatGlyph = this.getOrCreateCombatGlyph(visualState.entityId);
      combatGlyph.position.set(x, y);
      drawCombatGlyph(combatGlyph, visualState);

      const reachGlyph = this.getOrCreateReachGlyph(visualState.entityId);
      reachGlyph.position.set(x, y);
      drawReachGlyph(reachGlyph, visualState);
    }

    for (const [entityId, glyph] of this.combatGlyphsByEntityId) {
      if (activeEntityIds.has(entityId)) continue;
      this.combatGlyphLayer.removeChild(glyph);
      glyph.destroy();
      this.combatGlyphsByEntityId.delete(entityId);
    }
    for (const [entityId, glyph] of this.reachGlyphsByEntityId) {
      if (activeEntityIds.has(entityId)) continue;
      this.reachOverlayLayer.removeChild(glyph);
      glyph.destroy();
      this.reachGlyphsByEntityId.delete(entityId);
    }
  }

  private getPositionOffsetForEntity(entityId: number): number {
    const entityOrder = this.entityOrder;
    if (entityOrder === undefined) {
      throw new Error("Combat glyph update received before initial entity order.");
    }
    for (let index = 0; index < entityOrder.length; index += 1) {
      if (entityOrder[index] === entityId) {
        return index * 2;
      }
    }
    throw new Error(`Combat visual state references unknown entity ID ${entityId}.`);
  }

  private getOrCreateCombatGlyph(entityId: number): Graphics {
    let glyph = this.combatGlyphsByEntityId.get(entityId);
    if (glyph === undefined) {
      glyph = new Graphics();
      this.combatGlyphsByEntityId.set(entityId, glyph);
      this.combatGlyphLayer.addChild(glyph);
    }
    return glyph;
  }

  private getOrCreateReachGlyph(entityId: number): Graphics {
    let glyph = this.reachGlyphsByEntityId.get(entityId);
    if (glyph === undefined) {
      glyph = new Graphics();
      this.reachGlyphsByEntityId.set(entityId, glyph);
      this.reachOverlayLayer.addChild(glyph);
    }
    return glyph;
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

function drawCombatGlyph(
  graphics: Graphics,
  visualState: IndividualCombatVisualState,
): void {
  graphics.clear();
  drawArmourGlyph(graphics, visualState.armourCategory);
  graphics.circle(0, 0, GLYPH_BODY_RADIUS).fill(0x0d_13_1f);
  graphics.circle(0, 0, GLYPH_BODY_RADIUS).stroke({
    color: 0xf8_fa_fc,
    width: 1,
    alpha: 0.95,
  });
  drawFacingGlyph(graphics, visualState.facingOctant);
  drawWeaponGlyph(graphics, visualState);
  drawShieldGlyph(graphics, visualState);
}

function drawReachGlyph(
  graphics: Graphics,
  visualState: IndividualCombatVisualState,
): void {
  graphics.clear();
  if (visualState.weaponThreatDistance <= 0) {
    return;
  }
  const angle = octantAngle(visualState.facingOctant);
  const halfAngle = ((visualState.attackArcOctants - 1) * OCTANT_RADIANS) / 2;
  drawArcSector(
    graphics,
    visualState.weaponThreatDistance,
    angle - halfAngle,
    angle + halfAngle,
    REACH_COLOR,
    0.18,
    1,
  );
  if (
    shouldRenderPreferredDistanceMarker(
      visualState.weaponPreferredMinimumDistance,
    )
  ) {
    drawDashedArc(
      graphics,
      visualState.weaponPreferredMinimumDistance,
      angle - halfAngle,
      angle + halfAngle,
      PREFERRED_COLOR,
      0.45,
    );
  }
}

function drawFacingGlyph(graphics: Graphics, octant: number): void {
  const angle = octantAngle(octant);
  const direction = unitVector(angle);
  const perpendicular = { x: -direction.y, y: direction.x };
  const tip = {
    x: direction.x * GLYPH_DIRECTION_LENGTH,
    y: direction.y * GLYPH_DIRECTION_LENGTH,
  };
  const base = {
    x: direction.x * 3,
    y: direction.y * 3,
  };
  graphics
    .poly([
      tip.x,
      tip.y,
      base.x + perpendicular.x * 3,
      base.y + perpendicular.y * 3,
      base.x - perpendicular.x * 3,
      base.y - perpendicular.y * 3,
    ])
    .fill({ color: FACING_COLOR, alpha: 0.95 });
}

function drawWeaponGlyph(
  graphics: Graphics,
  visualState: IndividualCombatVisualState,
): void {
  const spec = getWeaponGlyphSpec(visualState.weaponCategory);
  if (spec.length === 0) {
    return;
  }
  const angle = octantAngle(visualState.facingOctant);
  const direction = unitVector(angle);
  const perpendicular = { x: -direction.y, y: direction.x };
  const startDistance = GLYPH_BODY_RADIUS + 1;
  const start = {
    x: direction.x * startDistance,
    y: direction.y * startDistance,
  };
  const end = {
    x: direction.x * (startDistance + spec.length),
    y: direction.y * (startDistance + spec.length),
  };
  graphics.moveTo(start.x, start.y).lineTo(end.x, end.y).stroke({
    color: WEAPON_COLOR,
    width: spec.marker === "narrowPoint" ? 1 : 2,
    alpha: 0.95,
  });

  switch (spec.marker) {
    case "none":
      break;
    case "broad":
      graphics
        .moveTo(end.x - perpendicular.x * 3, end.y - perpendicular.y * 3)
        .lineTo(end.x + perpendicular.x * 3, end.y + perpendicular.y * 3)
        .stroke({ color: WEAPON_COLOR, width: 2, alpha: 0.95 });
      break;
    case "point":
    case "narrowPoint":
      graphics
        .poly([
          end.x + direction.x * 3,
          end.y + direction.y * 3,
          end.x - direction.x * 2 + perpendicular.x * 2,
          end.y - direction.y * 2 + perpendicular.y * 2,
          end.x - direction.x * 2 - perpendicular.x * 2,
          end.y - direction.y * 2 - perpendicular.y * 2,
        ])
        .fill({ color: WEAPON_COLOR, alpha: 0.95 });
      break;
    case "projectile":
      graphics.circle(end.x, end.y, 2).fill({ color: WEAPON_COLOR, alpha: 0.95 });
      break;
    case "bow":
      drawArc(
        graphics,
        startDistance + spec.length,
        angle - OCTANT_RADIANS / 4,
        angle + OCTANT_RADIANS / 4,
        WEAPON_COLOR,
        0.95,
        2,
      );
      break;
    case "circle":
      graphics.circle(end.x, end.y, 2).stroke({
        color: WEAPON_COLOR,
        width: 2,
        alpha: 0.95,
      });
      break;
    case "doubleEnded": {
      const back = {
        x: -direction.x * startDistance,
        y: -direction.y * startDistance,
      };
      graphics.moveTo(back.x, back.y).lineTo(end.x, end.y).stroke({
        color: WEAPON_COLOR,
        width: 2,
        alpha: 0.95,
      });
      break;
    }
  }
}

function drawShieldGlyph(
  graphics: Graphics,
  visualState: IndividualCombatVisualState,
): void {
  const shield = getShieldGlyphSpec(
    visualState.shieldCategory,
    visualState.shieldHeld,
  );
  if (shield === undefined) {
    return;
  }
  const angle = octantAngle(visualState.facingOctant);
  const halfAngle = ((shield.coverageOctants - 1) * OCTANT_RADIANS) / 2;
  drawArc(
    graphics,
    shield.radius,
    angle - halfAngle,
    angle + halfAngle,
    SHIELD_COLOR,
    0.9,
    shield.category === "shield" ? 3 : 2,
  );
}

function drawArmourGlyph(
  graphics: Graphics,
  category: IndividualCombatVisualState["armourCategory"],
): void {
  const spec = getArmourGlyphSpec(category);
  switch (spec.style) {
    case "plain":
      break;
    case "thinRing":
      graphics.circle(0, 0, 6).stroke({
        color: ARMOUR_COLOR,
        width: 1,
        alpha: 0.8,
      });
      break;
    case "doubleRing":
      graphics.circle(0, 0, 6).stroke({
        color: ARMOUR_COLOR,
        width: 1,
        alpha: 0.8,
      });
      graphics.circle(0, 0, 8).stroke({
        color: ARMOUR_COLOR,
        width: 1,
        alpha: 0.7,
      });
      break;
    case "thickRing":
      graphics.circle(0, 0, 7).stroke({
        color: ARMOUR_COLOR,
        width: 3,
        alpha: 0.85,
      });
      break;
    case "segmentedRing":
      drawDashedArc(graphics, 7, 0, Math.PI * 2, ARMOUR_COLOR, 0.85);
      break;
  }
}

function drawArcSector(
  graphics: Graphics,
  radius: number,
  startAngle: number,
  endAngle: number,
  color: number,
  alpha: number,
  width: number,
): void {
  const start = pointOnCircle(radius, startAngle);
  const end = pointOnCircle(radius, endAngle);
  graphics.moveTo(0, 0).lineTo(start.x, start.y).stroke({
    color,
    width,
    alpha,
  });
  drawArc(graphics, radius, startAngle, endAngle, color, alpha, width);
  graphics.moveTo(0, 0).lineTo(end.x, end.y).stroke({
    color,
    width,
    alpha,
  });
}

function drawDashedArc(
  graphics: Graphics,
  radius: number,
  startAngle: number,
  endAngle: number,
  color: number,
  alpha: number,
): void {
  const segmentCount = 12;
  const span = endAngle - startAngle;
  for (let segment = 0; segment < segmentCount; segment += 2) {
    const segmentStart = startAngle + (span * segment) / segmentCount;
    const segmentEnd = startAngle + (span * (segment + 1)) / segmentCount;
    drawArc(graphics, radius, segmentStart, segmentEnd, color, alpha, 1);
  }
}

function drawArc(
  graphics: Graphics,
  radius: number,
  startAngle: number,
  endAngle: number,
  color: number,
  alpha: number,
  width: number,
): void {
  const start = pointOnCircle(radius, startAngle);
  graphics.moveTo(start.x, start.y);
  const segmentCount = 8;
  for (let segment = 1; segment <= segmentCount; segment += 1) {
    const angle = startAngle + ((endAngle - startAngle) * segment) / segmentCount;
    const point = pointOnCircle(radius, angle);
    graphics.lineTo(point.x, point.y);
  }
  graphics.stroke({ color, width, alpha });
}

function octantAngle(octant: number): number {
  return octant * OCTANT_RADIANS;
}

function unitVector(angle: number): { readonly x: number; readonly y: number } {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function pointOnCircle(
  radius: number,
  angle: number,
): { readonly x: number; readonly y: number } {
  const direction = unitVector(angle);
  return {
    x: direction.x * radius,
    y: direction.y * radius,
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
