/** Shared contract between the OceanHero host and each ported animal. */
import type * as THREE from 'three';
import type { PointCloud, WorldCtx } from '@/components/motion/ocean/core';

/**
 * One behavior knob a species exposes to /lab/ocean («Behavior» section).
 * Most are multipliers around 1.0 applied to the species' authored constants
 * — `def` IS the shipped behavior, so an absent/default value changes nothing.
 */
export interface OceanParamDef {
  /** Stable id — used in ocean-hero.json `params` and `animal.p` lookups. */
  key: string;
  /** Slider label (RU). */
  label: string;
  /** One-line RU description shown under the slider. */
  desc: string;
  min: number;
  max: number;
  step: number;
  /** Default == the authored constant (multiplier 1 = shipped behavior). */
  def: number;
  /**
   * Range-capable knob: the persisted value may be `[min, max]` instead of a
   * number — the host then makes the EFFECTIVE multiplier wander smoothly
   * inside the bounds (see ocean-hero's resolveRange). The species always
   * reads a plain number from `p`.
   */
  range?: boolean;
  /** Display unit for the lab UI ('deg' → «°», default multiplier «×»). */
  unit?: 'deg';
}

/**
 * A persisted param value: plain number (fixed) or `[min, max]` bounds for
 * range-capable knobs (the effective value wanders inside them at runtime).
 */
export type OceanParamValue = number | [number, number];

export interface OceanAnimal {
  cloud: PointCloud;
  /** Advance simulation + write particle positions. */
  update(cursor: THREE.Vector3, dt: number, time: number): void;
  /** Live head/center position — used for catch detection. */
  head: THREE.Vector3;
  dispose(): void;
  /**
   * Live behavior param values (key → number), pre-filled with the defaults
   * of the def's `params` schema. update() reads these each frame (plain
   * object lookups — allocation-free), so the host can mutate them live
   * (lab sliders) or once at spawn (saved ocean-hero.json tuning).
   */
  p?: Record<string, number>;
}

export type OceanAnimalFactory = (world: WorldCtx) => OceanAnimal;

export interface OceanAnimalDef {
  id: string;
  /** Shown in the /lab picker only. */
  label: string;
  make: OceanAnimalFactory;
  /** Preferred camera position (from the prototype's tuning). */
  cam: [number, number, number];
  /** How a morph is triggered: chase animals on catch, the school on a timer. */
  morph: 'catch' | 'timer';
  /** Catch radius (world units) for morph: 'catch'. */
  catchR?: number;
  /**
   * Behavior tuning schema (/lab/ocean «Behavior»). Declared next to the
   * species code that consumes it (animals/<id>.ts) and re-exported here so
   * the lab renders sliders and Save writes `params` into ocean-hero.json.
   */
  params?: OceanParamDef[];
  /** ShaderHero background palette for this animal. */
  bg: {
    c0: [number, number, number];
    c1: [number, number, number];
    c2: [number, number, number];
    accent: [number, number, number];
  };
}
