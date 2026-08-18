/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/**
 * Hummingbird — deliberate whimsy: a bird in the ocean scene. The water is
 * treated as air and never apologized for.
 *
 * Signature traits, all hover-first (NOT fish-like):
 *  - default state is a HOVER: body pitched up ~40°, position held by a stiff
 *    spring with tiny jitter, tail fanned wide;
 *  - DARTS: sudden decisive dashes to a new hover point around the cursor —
 *    straight lines with an anticipation dip, backward flight included
 *    (facing always tracks the cursor, velocity is independent);
 *  - wings render as translucent BLURRED FANS, not flapping plates: particles
 *    sit along the figure-eight stroke arc with arcsine density (piled toward
 *    the stroke ends, where a real wingtip dwells) and shimmer at ~12 Hz;
 *  - NECTAR DRINKING: the cursor is the flower. The bird approaches from a
 *    random sector on the sphere around it (previous sector vetoed — never
 *    the same angle twice in a row), parks so the BILL TIP rests exactly on
 *    the cursor (body pitched along the approach axis), sips for 2–5 s with
 *    micro-jitter, head-sips, fanned tail and a faint gorget flare, then
 *    backs off with anticipation and re-approaches from a new sector.
 *
 * Catch semantics (Hero morph): registry catchR is 0.3 — BELOW the drinking
 * head-to-cursor distance (~0.49, the bill reach), so ordinary sipping never
 * triggers a catch. Only the final "deep sip" lunge after a COMPLETED drink
 * plunges the head onto the cursor and crosses catchR: in the Hero, one full
 * drink = one earned "caught it".
 */
import * as THREE from 'three';
import { BasisSmoother, makePoints, type Particle, type WorldCtx } from '@/components/motion/ocean/core';
import { APPEARANCE, mul, paramDefaults, PROPORTIONS, rhythm, SPEED, TURN } from '@/components/motion/ocean/params';
import type { OceanAnimal, OceanParamDef } from '@/components/motion/ocean/types';

export const HUMMINGBIRD_PARAMS: OceanParamDef[] = [
  SPEED, TURN,
  rhythm('Stroke rate', 'Rate of the wing-fan shimmer; the beats are too fast to resolve feathers'),
  mul('dartSharp', 'Dart sharpness', 'Acceleration and suddenness of the darts between hover points'),
  mul('tailFan', 'Tail fanning', 'How wide the tail fans out while hovering', 0.3, 2),
  mul('drinkTime', 'Drinking time', 'Multiplier on how long a nectar sip at the cursor-flower lasts (2 to 5 s by default)', 0.3, 3),
  mul('boldness', 'Approach boldness', 'How close and how decisively the hummingbird commits to the flower', 0.3, 2.5),
  ...PROPORTIONS, ...APPEARANCE,
];

// movement states
const HOVER = 0, ANTIC = 1, DART = 2, DRINK = 3;

export function makeHummingbird(world: WorldCtx): OceanAnimal {
  // ---- anatomy (local: lx side, ly forward, lz up; head vector = body center)
  const BL = 0.56; // body length — deliberately SMALL next to the fish
  const BILL = 0.19; // ~1/3 of body — needle-thin line
  const TL = 0.30; // tail feather length
  const WL = 0.44; // wing fan radius

  // profile: head lobe + plump chest lobe merged into one teardrop
  const rHead = (u: number) => 0.075 * Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.10) / 0.15, 2)));
  const rBody = (u: number) => u > 0.16
    ? 0.155 * Math.sin(Math.PI * Math.pow(Math.min(1, (u - 0.16) / 0.84), 0.8))
    : 0;
  const prof = (u: number) => Math.max(rHead(u), rBody(u)) + 0.006;

  const cEm = new THREE.Color(0x14b868), cTeal = new THREE.Color(0x0cd898);
  const cSheen = new THREE.Color(0x9ade4a), cDarkG = new THREE.Color(0x0a4a2c);
  const cBelly = new THREE.Color(0xd8e8dc);
  const cG1 = new THREE.Color(0xff1a5e), cG2 = new THREE.Color(0xd4127a); // gorget ruby→magenta
  const cBill = new THREE.Color(0x4a4038);
  const cTailG = new THREE.Color(0x0e9a62), cBand = new THREE.Color(0x0c2416);
  const cTip = new THREE.Color(0xf4f8f2), cAmber = new THREE.Color(0xe8a858);
  const cWing = new THREE.Color(0x5a7a6e), cWingIri = new THREE.Color(0x2ad4b0);

  const P: Particle[] = [];

  // body + head (iridescent emerald back, white belly hint, ruby gorget)
  for (let i = 0; i < 2100; i++) {
    const u = -0.05 + Math.random() * 1.05;
    const a = Math.random() * Math.PI * 2;
    const rr = Math.pow(Math.random(), 0.3); // surface-biased: iridescence lives on feathers
    const R = prof(Math.max(0, u));
    const sa = Math.sin(a);
    const hb = rHead(Math.max(0, u)) / 0.075; // 0..1 "headness"
    const lx = Math.cos(a) * R * rr * 0.92;
    const lz = sa * R * rr + hb * 0.028;
    const ly = (0.5 - u) * BL;
    const c = new THREE.Color();
    if (sa < -0.3 && u < 0.32) {
      // GORGET — the brightest accent on the whole bird
      c.copy(cG1).lerp(cG2, Math.random());
      c.multiplyScalar(Math.random() < 0.08 ? 1.15 : 0.5 + Math.random() * 0.4);
    } else if (sa < -0.35) {
      c.copy(cBelly).multiplyScalar(0.18 + Math.random() * 0.12); // white belly hint
    } else {
      const band = 0.5 + 0.5 * Math.sin(u * 14 + a * 2); // iridescent banding
      c.copy(cEm).lerp(cTeal, band);
      if (sa > 0.55 && Math.random() < 0.3) c.lerp(cSheen, 0.55); // crown/back sheen
      if (Math.random() < 0.2) c.lerp(cDarkG, 0.5);
      c.multiplyScalar(0.30 + Math.random() * 0.28);
    }
    P.push({ kind: 'b', lx, ly, lz, c });
  }
  // dense gorget shell pass (surface only) — makes the throat patch read.
  // kind 'g': carries a radial outward normal so the feathers can FLARE a
  // touch while drinking (faint gorget pulse) — positions only, colors stay
  // baked (palette / pristine-copy discipline).
  for (let i = 0; i < 260; i++) {
    const u = 0.02 + Math.random() * 0.28;
    const a = Math.PI + (Math.random() * 0.4 + 0.3) * Math.PI * (Math.random() < 0.5 ? 1 : -1) * 0.5;
    const R = prof(u);
    const sa = Math.sin(a) < -0.25 ? Math.sin(a) : -0.6 - Math.random() * 0.4;
    const lx = Math.cos(a) * R * 0.9;
    const lzv = sa * R * 0.95;
    const r0 = Math.max(1e-3, Math.hypot(lx, lzv));
    const c = new THREE.Color().copy(cG1).lerp(cG2, Math.random());
    c.multiplyScalar(Math.random() < 0.1 ? 1.2 : 0.55 + Math.random() * 0.45);
    P.push({ kind: 'g', lx, ly: (0.5 - u) * BL, lz: lzv + rHead(u) / 0.075 * 0.028,
      gx: lx / r0, gz: lzv / r0, gp: Math.random() * Math.PI * 2, c });
  }
  // eyes
  for (const sgn of [-1, 1]) for (let i = 0; i < 12; i++) {
    P.push({ kind: 'b', lx: sgn * 0.058 + (Math.random() - 0.5) * 0.012,
      ly: (0.5 - 0.07) * BL + (Math.random() - 0.5) * 0.012,
      lz: 0.062 + (Math.random() - 0.5) * 0.012,
      c: new THREE.Color(0xffffff).multiplyScalar(0.5 + Math.random() * 0.3) });
  }
  // bill — long thin straight needle, slight droop at the tip
  for (let i = 0; i < 120; i++) {
    const t = Math.random();
    const rad = 0.006 * (1 - t * 0.6);
    P.push({ kind: 'b', lx: (Math.random() - 0.5) * 2 * rad,
      ly: 0.5 * BL + 0.02 + t * BILL,
      lz: 0.030 - t * t * 0.015 + (Math.random() - 0.5) * 2 * rad,
      c: new THREE.Color().copy(cBill).multiplyScalar(0.32 + Math.random() * 0.18 + t * 0.1) });
  }
  // tail — 10 discrete feathers; spread animated (fanned in hover, folded in darts)
  const FEATHERS = 10;
  for (let f = 0; f < FEATHERS; f++) {
    const fa = (f / (FEATHERS - 1)) * 2 - 1;
    for (let i = 0; i < 70; i++) {
      const fs = Math.pow(Math.random(), 0.7);
      const c = new THREE.Color();
      if (Math.abs(fa) > 0.45 && fs > 0.82) c.copy(cTip).multiplyScalar(0.5 + Math.random() * 0.3);
      else if (fs > 0.64 && fs <= 0.82) c.copy(cBand).multiplyScalar(0.35 + Math.random() * 0.2);
      else if (Math.abs(fa) > 0.85 && Math.random() < 0.4) c.copy(cAmber).multiplyScalar(0.3 + Math.random() * 0.15);
      else c.copy(cTailG).lerp(cDarkG, Math.random() * 0.5).multiplyScalar(0.26 + Math.random() * 0.18);
      P.push({ kind: 't', fa: fa + (Math.random() - 0.5) * 0.06, fs,
        lo: (Math.random() - 0.5) * 0.018, tz: (Math.random() - 0.5) * 0.012, c });
    }
  }
  // wings — translucent blurred fans along the stroke arc. wv uniform →
  // phi0 = Φ·sin(π(wv−½)) gives the arcsine density of a sinusoidal stroke
  // (piled at the ends). sv precomputed; shimmer phase wph per particle.
  for (const sgn of [-1, 1]) for (let i = 0; i < 900; i++) {
    const wr = 0.12 + 0.88 * Math.pow(Math.random(), 0.55);
    const wv = Math.random();
    const c = new THREE.Color();
    if (Math.random() < 0.15) c.copy(cWingIri).multiplyScalar(0.16 + Math.random() * 0.12);
    else c.copy(cWing).lerp(cEm, Math.random() * 0.4).multiplyScalar(0.07 + Math.random() * 0.09);
    P.push({ kind: 'w', sgn, wr, sv: Math.sin(Math.PI * (wv - 0.5)),
      wph: Math.random(), wz: (Math.random() - 0.5) * 0.03, c });
  }

  const pts = makePoints(world, P, { size: 0.06, opacity: 0.85 });
  const pos = pts.pos;

  // ---- flight state
  const head = new THREE.Vector3(-1.2, 0.2, 0);
  const vel = new THREE.Vector3();
  const fwd = new THREE.Vector3(1, 0, 0);
  const fwdVel = new THREE.Vector3();
  const basis = new BasisSmoother(fwd);
  let roll = 0, rollVel = 0;
  let state = HOVER, stateT = 0, nextDartIn = 2 + Math.random() * 2;
  let hoverAmt = 1; // 1 = full hover pose (also the reduced-motion static frame)
  let flapPh = Math.random();
  // ---- nectar-drinking state
  let drinkAmt = 0; // 0..1 smoothed drinking-pose blend
  let drinkT = 0; // seconds the bill tip has actually been on the flower
  let drinkDur = 3; // this cycle's drink length: (2–5 s) × «Drinking time»
  let lungeT = -1; // ≥0 → final deep-sip lunge running (this IS the catch)
  let drinkPitch = 0.7; // body pitch while drinking — set by the approach sector
  let sipPh = Math.random();
  const offset = new THREE.Vector3(0.75, 0.3, 0.1); // staging offset from the flower
  const prevApproach = new THREE.Vector3(0.9, 0.3, 0.1).normalize();
  const billF = new THREE.Vector3(0.6, 0.5, 0).normalize(); // last frame's bill axis (bF)
  const billU = new THREE.Vector3(0, 1, 0); // last frame's bU
  const drinkTarget = new THREE.Vector3();
  const billTip = new THREE.Vector3();
  const hoverPt = new THREE.Vector3();
  const dartDir = new THREE.Vector3();
  const side = new THREE.Vector3(), up2 = new THREE.Vector3();
  const sideR = new THREE.Vector3(), upR = new THREE.Vector3();
  const bF = new THREE.Vector3(), bU = new THREE.Vector3();
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const bp = paramDefaults(HUMMINGBIRD_PARAMS);
  // debug probe fields — surfaced through window.__ocDbg.bp (the host exposes
  // `animal.p` by reference); the /lab verification harness reads them, the
  // tuning UI never renders them (sliders come from the schema only)
  bp.dbgState = HOVER; bp.dbgBillD = 9; bp.dbgAz = 0; bp.dbgEl = 0;
  bp.dbgDrinks = 0; bp.dbgDrinkT = 0; bp.dbgDrinkDur = 0;

  const TWO_PI = Math.PI * 2;

  /**
   * New approach sector on the sphere around the flower: random azimuth ×
   * elevation (z compressed toward the screen plane so poses read on
   * camera), VETOED against the previous direction (≥55° apart — never the
   * same angle twice in a row; the continuous sampling is the jitter).
   * Staging radius shrinks with «Approach boldness». Also rolls this cycle's
   * drink duration and the drinking body pitch (bill points back along the
   * approach axis, so the bird drinks downward when it came from above).
   */
  function repickOffset(): void {
    for (let tries = 0; tries < 12; tries++) {
      const az = Math.random() * TWO_PI;
      const el = Math.asin(Math.random() * 2 - 1);
      tmp.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az) * 0.6).normalize();
      if (tmp.dot(prevApproach) < 0.574) break; // cos 55°
    }
    prevApproach.copy(tmp);
    const rad = Math.max(0.35, (0.55 + Math.random() * 0.55) / bp.boldness);
    offset.copy(tmp).multiplyScalar(rad);
    drinkPitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(-tmp.y, -1, 1)), -1.15, 1.25);
    drinkDur = (2 + Math.random() * 3) * bp.drinkTime;
    bp.dbgAz = Math.round(Math.atan2(tmp.z, tmp.x) * (180 / Math.PI));
    bp.dbgEl = Math.round(Math.asin(THREE.MathUtils.clamp(tmp.y, -1, 1)) * (180 / Math.PI));
  }

  return {
    cloud: pts,
    head,
    p: bp,
    update(cursor, dt, time) {
      // facing: the bird WATCHES the cursor; velocity is independent, so
      // darts away from the gaze direction read as backward flight
      tmp2.copy(cursor).sub(head);
      const dist = tmp2.length();
      if (dist > 0.001) tmp2.normalize();
      const want = Math.min(1, dist / 1.2);
      tmp.copy(tmp2).sub(fwd);
      // while drinking the facing is held nearly still — the pose is owned
      // by the approach-sector pitch, not by cursor-tracking
      const faceK = state === DRINK ? 0.3 : 1;
      fwdVel.addScaledVector(tmp, 2.2 * bp.turn * want * faceK * dt);
      fwdVel.multiplyScalar(Math.pow(0.18, dt));
      const av = fwdVel.length();
      const avCap = 1.8 * bp.turn;
      if (av > avCap) fwdVel.multiplyScalar(avCap / av);
      fwd.addScaledVector(fwdVel, dt).normalize();
      if (Math.abs(fwd.y) > 0.35) { fwd.y = Math.sign(fwd.y) * 0.35; fwd.normalize(); }

      side.copy(basis.update(fwd, dt, 4.0));
      up2.crossVectors(fwd, side).normalize();

      // hover point: cursor + offset + tiny multi-frequency jitter
      hoverPt.copy(cursor).add(offset);
      hoverPt.x += 0.05 * Math.sin(time * 2.9 + 1.3) + 0.02 * Math.sin(time * 7.1);
      hoverPt.y += 0.04 * Math.sin(time * 3.7 + 0.4) + 0.02 * Math.sin(time * 6.3 + 2.1);
      hoverPt.z += 0.04 * Math.sin(time * 2.3 + 3.0);
      const hpLen = hoverPt.length();
      if (hpLen > 5.2) hoverPt.multiplyScalar(5.2 / hpLen); // stay in the world

      stateT += dt;
      if (state === HOVER) {
        // stiff spring — position held at the staging point near the flower
        tmp.copy(hoverPt).sub(head);
        vel.addScaledVector(tmp, 8 * dt);
        vel.multiplyScalar(Math.pow(0.002, dt));
        const hs = vel.length();
        if (hs > 1.6) vel.multiplyScalar(1.6 / hs);
        if (tmp.length() > 2.0 || stateT > nextDartIn) {
          // flower jumped far (or restlessness) — re-approach, fresh sector
          repickOffset();
          state = ANTIC; stateT = 0;
        } else if (stateT > 0.3 + 0.5 / bp.boldness && tmp.length() < 0.5) {
          // settled at the staging point → glide in and drink
          state = DRINK; stateT = 0; drinkT = 0; lungeT = -1;
        }
      } else if (state === ANTIC) {
        // anticipation dip: sink back-and-down before the launch
        dartDir.copy(cursor).add(offset).sub(head);
        if (dartDir.lengthSq() > 1e-6) dartDir.normalize();
        vel.addScaledVector(dartDir, -1.8 * bp.dartSharp * dt);
        vel.y -= 1.6 * dt;
        if (stateT > Math.min(0.3, Math.max(0.04, 0.11 / bp.dartSharp))) { state = DART; stateT = 0; }
      } else if (state === DART) {
        // DART — straight, decisive; target tracks the live cursor
        tmp.copy(cursor).add(offset);
        dartDir.copy(tmp).sub(head);
        const dd = dartDir.length();
        if (dd > 1e-4) dartDir.multiplyScalar(1 / dd);
        vel.addScaledVector(dartDir, 26 * bp.dartSharp * bp.speed * dt);
        vel.multiplyScalar(Math.pow(0.3, dt));
        const sp = vel.length();
        const spCap = 4.8 * bp.speed;
        if (sp > spCap) vel.multiplyScalar(spCap / sp);
        if (dd < 0.28 || stateT > 1.0) {
          state = HOVER; stateT = 0;
          nextDartIn = 2.2 + Math.random() * 3.2;
        }
      } else {
        // DRINK — the bill tip rests exactly on the flower (the cursor):
        // the head parks at cursor − billAxis·reach, held by a stiff spring
        const reach = (0.5 * BL + 0.02 + BILL) * bp.bodyLen;
        // keep-out shell while not lunging: the glide-in can transiently
        // swing toward the flower during the pitch crossfade (measured min
        // head↔cursor 0.20 without this) — hold the head outside catchR so
        // ONLY the deliberate deep-sip lunge can cross it
        if (lungeT < 0 && dist < 0.36 && dist > 1e-4) {
          tmp.copy(head).sub(cursor).multiplyScalar(0.36 / dist);
          head.copy(cursor).add(tmp);
          tmp.normalize();
          const vin = vel.dot(tmp);
          if (vin < 0) vel.addScaledVector(tmp, -vin);
        }
        drinkTarget.copy(cursor)
          .addScaledVector(billF, -reach)
          .addScaledVector(billU, -0.015 * bp.bodyThick);
        // hover micro-jitter (steadier when bolder) + rhythmic head "sips"
        const ja = 0.014 / (0.5 + 0.5 * bp.boldness);
        drinkTarget.x += ja * Math.sin(time * 8.3 + 0.7);
        drinkTarget.y += ja * Math.sin(time * 6.9 + 2.2);
        drinkTarget.z += ja * Math.sin(time * 7.7 + 4.1);
        sipPh += dt * 2.4;
        const sip = Math.max(0, Math.sin(sipPh * TWO_PI)) ** 2;
        drinkTarget.addScaledVector(billF, sip * 0.022);
        if (lungeT >= 0) {
          // final deep sip — plunge the head onto the flower. The head
          // crosses catchR (0.3) ONLY here; ordinary sipping keeps it at
          // reach ≈0.49, so in the Hero a COMPLETED drink is the catch.
          drinkTarget.copy(cursor);
          lungeT += dt;
          if (lungeT > 0.45) {
            bp.dbgDrinks += 1;
            repickOffset(); // back off toward a NEW sector
            state = ANTIC; stateT = 0; lungeT = -1;
          }
        }
        tmp.copy(drinkTarget).sub(head);
        // lunge pulls much harder — it must actually cross catchR (0.3)
        // against the heavy hover damping (measured: 14/s only reached 0.32)
        vel.addScaledVector(tmp, (lungeT >= 0 ? 30 : 9 + 5 * bp.boldness) * dt);
        vel.multiplyScalar(Math.pow(0.0012, dt));
        const ds = vel.length();
        const dsCap = lungeT >= 0 ? 3.5 : 2.4;
        if (ds > dsCap) vel.multiplyScalar(dsCap / ds);
        // the sip clock runs only while the bill is actually on the flower
        if (lungeT < 0 && bp.dbgBillD < 0.09) {
          drinkT += dt;
          if (drinkT >= drinkDur) lungeT = 0;
        }
        // flower pulled away mid-drink (or the glide never connected) →
        // break off and chase per the existing ANTIC→DART behavior
        if (dist > reach + 0.9 || (stateT > 8 && drinkT < 0.5)) {
          repickOffset();
          state = ANTIC; stateT = 0; lungeT = -1;
        }
      }

      // soft world bound (same convention as the fish)
      const off = head.length();
      if (off > 5.8) vel.addScaledVector(tmp.copy(head).multiplyScalar(-1 / off), (off - 5.8) * 2.5 * dt);
      if (!Number.isFinite(head.x + vel.x + fwd.x)) {
        head.set(0, 0, 0); vel.set(0, 0, 0); fwd.set(1, 0, 0); fwdVel.set(0, 0, 0); state = HOVER; stateT = 0;
      }
      head.addScaledVector(vel, dt);

      // lean into lateral motion (subtle — hummingbirds stay level)
      const latV = vel.dot(side);
      const rollTarget = THREE.MathUtils.clamp(-latV * 0.10, -0.3, 0.3);
      rollVel += (rollTarget - roll) * 3 * dt; rollVel *= Math.pow(0.15, dt);
      roll += rollVel * dt * 3;
      const crr = Math.cos(roll), srr = Math.sin(roll);
      sideR.copy(side).multiplyScalar(crr).addScaledVector(up2, srr);
      upR.copy(up2).multiplyScalar(crr).addScaledVector(side, -srr);

      // hover pose amount → body pitch (up ~41° in hover, level in darts);
      // while drinking the pitch crossfades to the approach-sector pitch so
      // the bird drinks downward from above, level from the side, upward
      // from below — the bill always pointing at the flower
      const hoverTgt = state === DART ? 0 : state === ANTIC ? 0.55 : 1;
      hoverAmt += (hoverTgt - hoverAmt) * Math.min(1, 8 * dt);
      const drinkTgt = state === DRINK ? 1 : 0;
      drinkAmt += (drinkTgt - drinkAmt) * Math.min(1, 6 * dt);
      let pitch = 0.10 + 0.62 * hoverAmt + 0.04 * Math.sin(time * 2.3);
      pitch += (drinkPitch - pitch) * drinkAmt;
      const cp = Math.cos(pitch), sp2 = Math.sin(pitch);
      bF.copy(fwd).multiplyScalar(cp).addScaledVector(upR, sp2);
      bU.copy(upR).multiplyScalar(cp).addScaledVector(fwd, -sp2);

      // wing shimmer clock (~12 Hz visual; faster in darts) + tail spread
      const hz = (11.5 + 3.5 * (1 - hoverAmt)) * bp.rhythm;
      flapPh += hz * dt;
      if (flapPh > 512) flapPh -= 512;
      const spread = Math.min(1.45, (0.22 + 0.78 * hoverAmt) * bp.tailFan * (1 + 0.3 * drinkAmt));
      const PHI = 0.78 + 0.30 * hoverAmt; // stroke half-sweep
      const sweptBack = (1 - hoverAmt) * 0.30;
      const bob = 0.007 * Math.sin(flapPh * TWO_PI);
      const kL = bp.bodyLen, kW = bp.bodyWide, kT = bp.bodyThick; // «Proportions»

      // bill axis for the next frame's drink target + measured bill-tip
      // distance to the flower (the /lab harness asserts this ≈ 0 in DRINK)
      billF.copy(bF); billU.copy(bU);
      billTip.copy(head)
        .addScaledVector(bF, (0.5 * BL + 0.02 + BILL) * kL)
        .addScaledVector(bU, 0.015 * kT);
      bp.dbgBillD = Math.round(billTip.distanceTo(cursor) * 1000) / 1000;
      bp.dbgState = state;
      bp.dbgDrinkT = Math.round(drinkT * 100) / 100;
      bp.dbgDrinkDur = Math.round(drinkDur * 100) / 100;

      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (p.kind === 'b') {
          const lx = (p.lx as number) * kW, ly = (p.ly as number) * kL, lz = ((p.lz as number) + bob) * kT;
          pos[i * 3] = head.x + bF.x * ly + sideR.x * lx + bU.x * lz;
          pos[i * 3 + 1] = head.y + bF.y * ly + sideR.y * lx + bU.y * lz;
          pos[i * 3 + 2] = head.z + bF.z * ly + sideR.z * lx + bU.z * lz;
        } else if (p.kind === 'g') {
          // gorget shell — faint radial feather flare while drinking
          const ga = drinkAmt * 0.02 * (0.5 + 0.5 * Math.sin(TWO_PI * time * 1.6 + (p.gp as number)));
          const lx = ((p.lx as number) + (p.gx as number) * ga) * kW;
          const ly = (p.ly as number) * kL;
          const lz = ((p.lz as number) + (p.gz as number) * ga + bob) * kT;
          pos[i * 3] = head.x + bF.x * ly + sideR.x * lx + bU.x * lz;
          pos[i * 3 + 1] = head.y + bF.y * ly + sideR.y * lx + bU.y * lz;
          pos[i * 3 + 2] = head.z + bF.z * ly + sideR.z * lx + bU.z * lz;
        } else if (p.kind === 't') {
          const fa = p.fa as number, fs = p.fs as number;
          const ang = fa * spread * 0.95;
          const sn = Math.sin(ang), cs = Math.cos(ang);
          const wag = 0.03 * fs * Math.sin(time * 2.2 + fa * 1.5);
          const lx = (sn * fs * TL + (p.lo as number)) * kW;
          const ly = (-0.28 - cs * fs * TL) * kL;
          const lz = (-0.05 * fs + (p.tz as number) + wag) * kT;
          pos[i * 3] = head.x + bF.x * ly + sideR.x * lx + bU.x * lz;
          pos[i * 3 + 1] = head.y + bF.y * ly + sideR.y * lx + bU.y * lz;
          pos[i * 3 + 2] = head.z + bF.z * ly + sideR.z * lx + bU.z * lz;
        } else {
          // wing fan: shoulder rides the pitched body; the stroke plane stays
          // near-horizontal (unpitched frame) — the reason the body pitches up
          const sgn = p.sgn as number, wr = p.wr as number, wph = p.wph as number;
          const phi0 = PHI * (p.sv as number);
          const shim = 0.15 * (0.35 + 0.65 * wr) * Math.sin(TWO_PI * (flapPh + wph));
          const phi = phi0 + shim;
          const r = wr * WL * (1 + 0.04 * Math.sin(TWO_PI * (2 * flapPh + 2 * wph)));
          const lxw = sgn * r * Math.cos(phi) * kW;
          const lyw = (r * Math.sin(phi) - sweptBack * r) * kL;
          const lzw = ((p.wz as number) + 0.05 * wr * Math.sin(2 * phi0 + TWO_PI * 2 * flapPh + wph * 6.28)) * kT;
          // shoulder anchor scales with the same multipliers — wings stay attached
          const bx = head.x + bF.x * 0.10 * kL + sideR.x * sgn * 0.06 * kW + bU.x * 0.06 * kT;
          const by = head.y + bF.y * 0.10 * kL + sideR.y * sgn * 0.06 * kW + bU.y * 0.06 * kT;
          const bz = head.z + bF.z * 0.10 * kL + sideR.z * sgn * 0.06 * kW + bU.z * 0.06 * kT;
          pos[i * 3] = bx + fwd.x * lyw + sideR.x * lxw + upR.x * lzw;
          pos[i * 3 + 1] = by + fwd.y * lyw + sideR.y * lxw + upR.y * lzw;
          pos[i * 3 + 2] = bz + fwd.z * lyw + sideR.z * lxw + upR.z * lzw;
        }
      }
      pts.geo.attributes.position.needsUpdate = true;
    },
    dispose() { world.scene.remove(pts.points); pts.geo.dispose(); pts.mat.dispose(); },
  };
}
