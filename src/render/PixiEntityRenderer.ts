import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  type Texture,
} from "pixi.js";

import type {
  InspectedCombatVisualEvent,
  IndividualCombatVisualState,
  LiveCombatDebugIndividualSnapshot,
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
import {
  getCombatVisualEventGlyphSpec,
  pruneRetainedCombatVisualEvents,
  retainedCombatVisualEventKey,
  type RetainedCombatVisualEvent,
} from "./combatVisualEventGrammar";
import {
  createCasualtyVisualGlyphSpec,
  type CasualtyVisualGlyphSpec,
} from "./casualtyVisualGrammar";

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
const EVENT_TEXT_OFFSET_Y = -16;

export interface RenderWorldLabel {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

export interface RenderWorldFocus {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export class PixiEntityRenderer {
  private readonly worldLayer = new Container();
  private readonly reachOverlayLayer = new Container();
  private readonly casualtyRelationshipLayer = new Container();
  private readonly entityLayer = new Container();
  private readonly combatGlyphLayer = new Container();
  private readonly casualtyGlyphLayer = new Container();
  private readonly combatEventLayer = new Container();
  private readonly combatEventGraphics = new Graphics();
  private readonly casualtyRelationshipGraphics = new Graphics();
  private readonly combatEventTextLayer = new Container();
  private readonly worldLabelLayer = new Container();
  private readonly spritesByEntityId = new Map<number, Sprite>();
  private readonly combatGlyphsByEntityId = new Map<number, Graphics>();
  private readonly reachGlyphsByEntityId = new Map<number, Graphics>();
  private readonly casualtyGlyphsByEntityId = new Map<number, Graphics>();
  private readonly worldLabelsByText = new Map<string, Text>();
  private readonly retainedCombatVisualEvents: RetainedCombatVisualEvent[] = [];
  private readonly retainedCombatVisualEventKeys = new Set<string>();
  private readonly combatEventTexts: Text[] = [];
  private entityOrder: Uint32Array | undefined;
  private worldBounds: SimulationBounds | undefined;
  private worldFocus: RenderWorldFocus | undefined;

  private constructor(
    private readonly application: Application,
    private readonly dotTexture: Texture,
  ) {
    this.worldLayer.addChild(
      this.reachOverlayLayer,
      this.casualtyRelationshipLayer,
      this.entityLayer,
      this.combatGlyphLayer,
      this.casualtyGlyphLayer,
      this.combatEventLayer,
      this.worldLabelLayer,
    );
    this.casualtyRelationshipLayer.addChild(this.casualtyRelationshipGraphics);
    this.casualtyRelationshipLayer.visible = false;
    this.casualtyGlyphLayer.visible = false;
    this.combatEventLayer.addChild(
      this.combatEventGraphics,
      this.combatEventTextLayer,
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

  public setCombatEventsVisible(visible: boolean): void {
    this.combatEventLayer.visible = visible;
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

  public setCasualtyVisualsVisible(visible: boolean): void {
    this.casualtyRelationshipLayer.visible = visible;
    this.casualtyGlyphLayer.visible = visible;
  }

  public setWorldFocus(focus?: RenderWorldFocus): void {
    this.worldFocus = focus;
    this.layoutWorld();
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
    for (const glyph of this.casualtyGlyphsByEntityId.values()) {
      glyph.destroy();
    }
    for (const label of this.worldLabelsByText.values()) {
      label.destroy();
    }
    this.clearCombatVisualEvents();

    this.spritesByEntityId.clear();
    this.combatGlyphsByEntityId.clear();
    this.reachGlyphsByEntityId.clear();
    this.casualtyGlyphsByEntityId.clear();
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
    this.clearCombatVisualEvents();
    this.updateSpritePositions(snapshot.positions);
    this.updateCombatGlyphs(
      snapshot.positions,
      snapshot.combatDebug?.individualCombatVisuals ?? [],
    );
    this.updateCombatVisualEvents(
      snapshot.tick,
      snapshot.positions,
      snapshot.combatDebug?.inspectedCombatVisualEvents ?? [],
    );
    this.updateCasualtyGlyphs(
      snapshot.positions,
      snapshot.combatDebug?.inspectedIndividuals ?? [],
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
    this.updateCombatVisualEvents(
      snapshot.tick,
      snapshot.positions,
      snapshot.combatDebug?.inspectedCombatVisualEvents ?? [],
    );
    this.updateCasualtyGlyphs(
      snapshot.positions,
      snapshot.combatDebug?.inspectedIndividuals ?? [],
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

  private updateCasualtyGlyphs(
    positions: Int32Array,
    individuals: readonly LiveCombatDebugIndividualSnapshot[],
  ): void {
    const activeEntityIds = new Set<number>();
    const positionsByEntityId = new Map<number, { readonly x: number; readonly y: number }>();
    for (const individual of individuals) {
      activeEntityIds.add(individual.entityId);
      const offset = this.getPositionOffsetForEntity(individual.entityId);
      const position = Object.freeze({
        x: positions[offset]!,
        y: positions[offset + 1]!,
      });
      positionsByEntityId.set(individual.entityId, position);
      let glyph = this.casualtyGlyphsByEntityId.get(individual.entityId);
      if (glyph === undefined) {
        glyph = new Graphics();
        this.casualtyGlyphsByEntityId.set(individual.entityId, glyph);
        this.casualtyGlyphLayer.addChild(glyph);
      }
      glyph.position.set(position.x, position.y);
      drawCasualtyGlyph(glyph, createCasualtyVisualGlyphSpec(individual));
    }
    for (const [entityId, glyph] of this.casualtyGlyphsByEntityId) {
      if (activeEntityIds.has(entityId)) continue;
      this.casualtyGlyphLayer.removeChild(glyph);
      glyph.destroy();
      this.casualtyGlyphsByEntityId.delete(entityId);
    }
    drawCasualtyRelationships(
      this.casualtyRelationshipGraphics,
      individuals,
      positionsByEntityId,
    );
  }

  private updateCombatVisualEvents(
    snapshotTick: number,
    positions: Int32Array,
    events: readonly InspectedCombatVisualEvent[],
  ): void {
    pruneRetainedCombatVisualEvents(
      this.retainedCombatVisualEvents,
      snapshotTick,
    );
    this.rebuildRetainedCombatVisualEventKeys();

    for (let index = 0; index < events.length; index += 1) {
      const event = events[index]!;
      const key = retainedCombatVisualEventKey(event);
      if (this.retainedCombatVisualEventKeys.has(key)) {
        continue;
      }
      const attackerOffset = this.getPositionOffsetForEntity(
        event.attackerEntityId,
      );
      const targetOffset = this.getPositionOffsetForEntity(event.targetEntityId);
      this.retainedCombatVisualEvents.push({
        event,
        attackerX: positions[attackerOffset]!,
        attackerY: positions[attackerOffset + 1]!,
        targetX: positions[targetOffset]!,
        targetY: positions[targetOffset + 1]!,
      });
      this.retainedCombatVisualEventKeys.add(key);
    }

    pruneRetainedCombatVisualEvents(
      this.retainedCombatVisualEvents,
      snapshotTick,
    );
    this.rebuildRetainedCombatVisualEventKeys();
    this.drawRetainedCombatVisualEvents(snapshotTick);
  }

  private drawRetainedCombatVisualEvents(snapshotTick: number): void {
    this.combatEventGraphics.clear();
    this.clearCombatEventTexts();
    for (
      let index = 0;
      index < this.retainedCombatVisualEvents.length;
      index += 1
    ) {
      const retained = this.retainedCombatVisualEvents[index]!;
      const age = Math.max(0, snapshotTick - retained.event.tick);
      const alpha = Math.max(0.25, 1 - age / 12);
      drawCombatVisualEvent(this.combatEventGraphics, retained, alpha);
      if (retained.event.kind === "hitApplied") {
        this.addCombatEventText(retained, alpha);
      }
    }
  }

  private addCombatEventText(
    retained: RetainedCombatVisualEvent,
    alpha: number,
  ): void {
    const text = new Text({
      text: `-${retained.event.appliedHitLoss}`,
      style: {
        fill: 0xff_ff_ff,
        fontFamily: "system-ui, sans-serif",
        fontSize: 10,
        fontWeight: "700",
        stroke: { color: 0x0d_13_1f, width: 3 },
      },
    });
    text.anchor.set(0.5);
    text.alpha = alpha;
    text.position.set(retained.targetX, retained.targetY + EVENT_TEXT_OFFSET_Y);
    this.combatEventTexts.push(text);
    this.combatEventTextLayer.addChild(text);
  }

  private clearCombatVisualEvents(): void {
    this.retainedCombatVisualEvents.length = 0;
    this.retainedCombatVisualEventKeys.clear();
    this.combatEventGraphics.clear();
    this.clearCombatEventTexts();
  }

  private clearCombatEventTexts(): void {
    for (const text of this.combatEventTexts) {
      this.combatEventTextLayer.removeChild(text);
      text.destroy();
    }
    this.combatEventTexts.length = 0;
  }

  private rebuildRetainedCombatVisualEventKeys(): void {
    this.retainedCombatVisualEventKeys.clear();
    for (const retained of this.retainedCombatVisualEvents) {
      this.retainedCombatVisualEventKeys.add(
        retainedCombatVisualEventKey(retained.event),
      );
    }
  }

  private layoutWorld(): void {
    const bounds = this.worldBounds;
    if (bounds === undefined) {
      return;
    }

    const focus = this.worldFocus;
    const viewWidth = focus?.width ?? bounds.width;
    const viewHeight = focus?.height ?? bounds.height;
    const centreX = focus?.x ?? bounds.width / 2;
    const centreY = focus?.y ?? bounds.height / 2;
    const scale = Math.min(
      this.application.screen.width / viewWidth,
      this.application.screen.height / viewHeight,
    );
    this.worldLayer.scale.set(scale);
    this.worldLayer.position.set(
      this.application.screen.width / 2 - centreX * scale,
      this.application.screen.height / 2 - centreY * scale,
    );
  }

  private readonly handleResize = (): void => {
    this.application.resize();
    this.layoutWorld();
  };
}

function drawCasualtyGlyph(
  graphics: Graphics,
  spec: CasualtyVisualGlyphSpec,
): void {
  graphics.clear();
  drawCasualtyLifecycleGlyph(graphics, spec);
  if (spec.freshZeroHit) {
    for (let ray = 0; ray < 8; ray += 1) {
      const angle = ray * Math.PI / 4;
      graphics
        .moveTo(Math.cos(angle) * 13, Math.sin(angle) * 13)
        .lineTo(Math.cos(angle) * 18, Math.sin(angle) * 18);
    }
    graphics.stroke({ color: 0xff_4d_5e, width: 2, alpha: 0.95 });
  }
  if (spec.deathCountProgress > 0 || spec.lifecycleGlyph === "dying") {
    graphics
      .arc(
        0,
        0,
        12,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, spec.deathCountProgress),
      )
      .stroke({ color: 0xff_8a_7a, width: 2, alpha: 0.9 });
  }
  if (spec.deathCountPaused) {
    graphics
      .rect(-4, -7, 3, 14)
      .rect(2, -7, 3, 14)
      .fill({ color: 0xff_f1_8a, alpha: 0.95 });
  }
  if (spec.assistanceState === "rescueRequested") {
    graphics.circle(0, 0, 15).stroke({ color: 0xff_a6_3d, width: 2, alpha: 0.9 });
  }
  if (spec.dragPhase === "gathering") {
    graphics.circle(0, 0, 17).stroke({ color: 0xff_c0_5c, width: 1, alpha: 0.75 });
  } else if (spec.dragPhase === "dragging") {
    graphics
      .moveTo(-16, 14)
      .lineTo(16, 14)
      .stroke({ color: 0xff_9f_43, width: 3, alpha: 0.95 });
  }
  for (let hand = 0; hand < spec.committedDragHands; hand += 1) {
    const y = 16 + hand * 4;
    graphics
      .moveTo(-17, y)
      .lineTo(-9, y)
      .stroke({ color: 0xff_d0_78, width: 2, alpha: 0.95 });
  }
  if (spec.hasMedicalClaim) {
    graphics.circle(0, 0, 19).stroke({ color: 0xff_d9_66, width: 1, alpha: 0.8 });
  }
  if (spec.isApproachingClaimedPatient) {
    graphics
      .moveTo(-5, 18)
      .lineTo(0, 23)
      .lineTo(5, 18)
      .stroke({ color: 0xff_e5_8f, width: 2, alpha: 0.9 });
  }
  if (spec.treatmentKind !== undefined) {
    graphics
      .arc(
        0,
        0,
        16,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, spec.treatmentProgress),
      )
      .stroke({
        color: treatmentColor(spec.treatmentKind),
        width: 3,
        alpha: 0.95,
      });
  }
  if (spec.currentHerbs > 0 || spec.reservedHerbs > 0 || spec.consumedHerbs > 0) {
    const herbColor = spec.reservedHerbs > 0 ? 0xff_d9_66 : 0x7d_ff_a5;
    graphics
      .moveTo(-10, -20)
      .lineTo(-10, -12)
      .moveTo(-14, -16)
      .lineTo(-6, -16)
      .stroke({ color: herbColor, width: 2, alpha: 0.95 });
  }
  if (spec.traumaticWound) {
    graphics
      .moveTo(-8, 9)
      .lineTo(-3, 4)
      .lineTo(1, 10)
      .lineTo(7, 4)
      .stroke({ color: 0xff_5c_d7, width: 2, alpha: 0.95 });
  }
  if (spec.traumaWithdrawal) {
    graphics
      .moveTo(10, -3)
      .lineTo(16, 0)
      .lineTo(10, 3)
      .stroke({ color: 0xff_88_e6, width: 2, alpha: 0.9 });
  }
  if (spec.disabledArm) {
    graphics
      .moveTo(-14, 8)
      .lineTo(-6, 8)
      .moveTo(-10, 4)
      .lineTo(-10, 12)
      .stroke({ color: 0xff_b3_62, width: 2, alpha: 0.95 });
  }
  if (spec.disabledLeg) {
    graphics
      .moveTo(10, 5)
      .lineTo(10, 14)
      .moveTo(6, 10)
      .lineTo(14, 10)
      .stroke({ color: 0xff_75_75, width: 2, alpha: 0.95 });
  }
  if (spec.executionProgress > 0) {
    graphics.circle(0, 0, 21).stroke({ color: 0xff_3b_4d, width: 2, alpha: 0.9 });
    graphics
      .moveTo(-21, 0)
      .lineTo(-15, 0)
      .moveTo(15, 0)
      .lineTo(21, 0)
      .stroke({ color: 0xff_3b_4d, width: 2, alpha: 0.9 });
  }
  if (spec.executionCompleted) {
    graphics
      .moveTo(19, -10)
      .lineTo(19, 7)
      .moveTo(14, -5)
      .lineTo(24, -5)
      .moveTo(16, 7)
      .lineTo(19, 11)
      .lineTo(22, 7)
      .closePath()
      .stroke({ color: 0xff_24_3f, width: 2, alpha: 1 });
  }
  if (spec.treatmentInterrupted) {
    graphics
      .moveTo(-18, -18)
      .lineTo(-10, -10)
      .moveTo(-10, -18)
      .lineTo(-18, -10)
      .stroke({ color: 0xff_d1_5c, width: 2, alpha: 0.95 });
  }
  if (spec.restoredHit) {
    graphics
      .moveTo(10, -15)
      .lineTo(18, -15)
      .moveTo(14, -19)
      .lineTo(14, -11)
      .stroke({ color: 0x66_ff_a3, width: 2, alpha: 0.95 });
  }
  if (spec.comfortCompleted) {
    graphics
      .circle(13, -14, 3)
      .circle(18, -14, 3)
      .moveTo(10, -13)
      .lineTo(15.5, -7)
      .lineTo(21, -13)
      .fill({ color: 0x73_e8_ff, alpha: 0.9 });
  }
}

function drawCasualtyLifecycleGlyph(
  graphics: Graphics,
  spec: CasualtyVisualGlyphSpec,
): void {
  switch (spec.lifecycleGlyph) {
    case "active":
      graphics.circle(0, 0, 8).stroke({ color: 0x62_e6_8b, width: 2, alpha: 0.85 });
      break;
    case "dying":
      graphics
        .moveTo(-7, -7)
        .lineTo(7, 7)
        .moveTo(7, -7)
        .lineTo(-7, 7)
        .stroke({ color: 0xff_4d_5e, width: 3, alpha: 0.95 });
      break;
    case "terminalAwaitingComfort":
      graphics.rect(-8, -8, 16, 16).stroke({ color: 0xc2_83_ff, width: 3, alpha: 0.95 });
      break;
    case "terminalComforted":
      graphics
        .moveTo(0, -10)
        .lineTo(10, 0)
        .lineTo(0, 10)
        .lineTo(-10, 0)
        .closePath()
        .stroke({ color: 0x73_e8_ff, width: 3, alpha: 0.95 });
      break;
    case "respawnEgress":
      graphics
        .moveTo(-8, -7)
        .lineTo(0, 0)
        .lineTo(-8, 7)
        .moveTo(1, -7)
        .lineTo(9, 0)
        .lineTo(1, 7)
        .stroke({ color: 0xff_b1_4a, width: 3, alpha: 0.95 });
      break;
    case "waitingAtRespawn":
      graphics
        .rect(-9, -9, 18, 18)
        .rect(-5, -5, 10, 10)
        .stroke({ color: 0x61_b5_ff, width: 2, alpha: 0.95 });
      break;
    case "terminal":
      graphics.circle(0, 0, 9).fill({ color: 0x75_68_87, alpha: 0.8 });
      break;
  }
}

function treatmentColor(kind: NonNullable<CasualtyVisualGlyphSpec["treatmentKind"]>): number {
  switch (kind) {
    case "chirurgeonDying":
      return 0x65_ea_ff;
    case "physickRestoreGlobalHit":
      return 0x76_ff_a5;
    case "physickTraumaticWound":
      return 0xff_69_da;
    case "physickLimbWithHerb":
      return 0xff_b6_52;
    case "physickLimbWithoutHerb":
      return 0xff_7c_62;
    case "physickTerminalComfort":
      return 0xa9_8b_ff;
  }
}

function drawCasualtyRelationships(
  graphics: Graphics,
  individuals: readonly LiveCombatDebugIndividualSnapshot[],
  positions: ReadonlyMap<number, { readonly x: number; readonly y: number }>,
): void {
  graphics.clear();
  for (const individual of individuals) {
    const source = positions.get(individual.entityId);
    if (source === undefined) continue;
    if (
      individual.casualtyDragPatientEntityId === individual.entityId &&
      individual.casualtyDragHelperEntityIds !== undefined
    ) {
      for (const helperId of individual.casualtyDragHelperEntityIds) {
        drawEntityLink(graphics, positions, helperId, individual.entityId, 0xff_9f_43, 2);
      }
      const destinationX = individual.casualtyAssistanceDestinationX ?? -1;
      const destinationY = individual.casualtyAssistanceDestinationY ?? -1;
      if (destinationX >= 0 && destinationY >= 0) {
        graphics
          .moveTo(source.x, source.y)
          .lineTo(destinationX, destinationY)
          .stroke({ color: 0xff_9f_43, width: 1, alpha: 0.65 });
        graphics
          .circle(destinationX, destinationY, 7)
          .stroke({ color: 0xff_c0_5c, width: 2, alpha: 0.9 });
      }
    }
    const claimedPatient = individual.claimedMedicalPatientEntityId ?? -1;
    if (claimedPatient >= 0) {
      drawEntityLink(graphics, positions, individual.entityId, claimedPatient, 0xff_d9_66, 2);
    }
    const withdrawalPhysick = individual.withdrawalTargetPhysickEntityId ?? -1;
    if (individual.traumaWithdrawalActive === true && withdrawalPhysick >= 0) {
      drawEntityLink(graphics, positions, individual.entityId, withdrawalPhysick, 0xff_5c_d7, 1);
    }
    if (
      individual.executionExecutorEntityId === individual.entityId &&
      (individual.executionTargetEntityId ?? -1) >= 0
    ) {
      drawEntityLink(
        graphics,
        positions,
        individual.entityId,
        individual.executionTargetEntityId!,
        0xff_3b_4d,
        2,
      );
    }
    if (
      individual.playerPresenceState === "respawnEgress" &&
      (individual.respawnDestinationX ?? -1) >= 0 &&
      (individual.respawnDestinationY ?? -1) >= 0
    ) {
      graphics
        .moveTo(source.x, source.y)
        .lineTo(individual.respawnDestinationX!, individual.respawnDestinationY!)
        .stroke({ color: 0xff_b1_4a, width: 2, alpha: 0.75 });
    }
  }
}

function drawEntityLink(
  graphics: Graphics,
  positions: ReadonlyMap<number, { readonly x: number; readonly y: number }>,
  sourceEntityId: number,
  targetEntityId: number,
  color: number,
  width: number,
): void {
  const source = positions.get(sourceEntityId);
  const target = positions.get(targetEntityId);
  if (source === undefined || target === undefined) return;
  graphics
    .moveTo(source.x, source.y)
    .lineTo(target.x, target.y)
    .stroke({ color, width, alpha: 0.7 });
}

function drawCombatVisualEvent(
  graphics: Graphics,
  retained: RetainedCombatVisualEvent,
  alpha: number,
): void {
  const spec = getCombatVisualEventGlyphSpec(retained.event.kind);
  const targetX = retained.targetX;
  const targetY = retained.targetY;
  switch (spec.shape) {
    case "line":
      graphics
        .moveTo(retained.attackerX, retained.attackerY)
        .lineTo(targetX, targetY)
        .stroke({ color: spec.color, width: 1, alpha });
      break;
    case "cross":
      graphics
        .moveTo(targetX - 5, targetY - 5)
        .lineTo(targetX + 5, targetY + 5)
        .moveTo(targetX + 5, targetY - 5)
        .lineTo(targetX - 5, targetY + 5)
        .stroke({ color: spec.color, width: 2, alpha });
      break;
    case "smallCircle":
      graphics.circle(targetX, targetY, 6).stroke({
        color: spec.color,
        width: 2,
        alpha,
      });
      break;
    case "broadArc":
      drawWorldArc(graphics, targetX, targetY, 9, Math.PI * 0.85, Math.PI * 1.85, spec.color, alpha, 3);
      break;
    case "hollowCross":
      graphics.circle(targetX, targetY, 7).stroke({
        color: spec.color,
        width: 1,
        alpha,
      });
      graphics
        .moveTo(targetX - 4, targetY - 4)
        .lineTo(targetX + 4, targetY + 4)
        .moveTo(targetX + 4, targetY - 4)
        .lineTo(targetX - 4, targetY + 4)
        .stroke({ color: spec.color, width: 2, alpha });
      break;
    case "burst":
      graphics
        .moveTo(targetX - 6, targetY)
        .lineTo(targetX + 6, targetY)
        .moveTo(targetX, targetY - 6)
        .lineTo(targetX, targetY + 6)
        .moveTo(targetX - 4, targetY - 4)
        .lineTo(targetX + 4, targetY + 4)
        .moveTo(targetX + 4, targetY - 4)
        .lineTo(targetX - 4, targetY + 4)
        .stroke({ color: spec.color, width: 2, alpha });
      break;
    case "filledPulse":
      graphics.circle(targetX, targetY, 4).fill({ color: spec.color, alpha });
      break;
    case "brokenRing":
      drawWorldDashedCircle(graphics, targetX, targetY, 7, spec.color, alpha);
      break;
    case "hitLossText":
      break;
    case "downPulse":
      graphics.circle(targetX, targetY, 11).stroke({
        color: spec.color,
        width: 3,
        alpha,
      });
      graphics
        .moveTo(targetX - 5, targetY)
        .lineTo(targetX + 5, targetY)
        .stroke({ color: spec.color, width: 3, alpha });
      break;
  }
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

function drawWorldArc(
  graphics: Graphics,
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  color: number,
  alpha: number,
  width: number,
): void {
  const start = pointOnCircle(radius, startAngle);
  graphics.moveTo(centerX + start.x, centerY + start.y);
  const segmentCount = 8;
  for (let segment = 1; segment <= segmentCount; segment += 1) {
    const angle = startAngle + ((endAngle - startAngle) * segment) / segmentCount;
    const point = pointOnCircle(radius, angle);
    graphics.lineTo(centerX + point.x, centerY + point.y);
  }
  graphics.stroke({ color, width, alpha });
}

function drawWorldDashedCircle(
  graphics: Graphics,
  centerX: number,
  centerY: number,
  radius: number,
  color: number,
  alpha: number,
): void {
  const segmentCount = 12;
  for (let segment = 0; segment < segmentCount; segment += 2) {
    drawWorldArc(
      graphics,
      centerX,
      centerY,
      radius,
      (Math.PI * 2 * segment) / segmentCount,
      (Math.PI * 2 * (segment + 1)) / segmentCount,
      color,
      alpha,
      2,
    );
  }
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
