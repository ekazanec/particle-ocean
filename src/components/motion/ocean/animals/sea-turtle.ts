/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
/** Sea turtle — scute shell, flipper flight, fast gaze / slow body. Port of sea-turtle.html. */
import * as THREE from 'three';
import { BasisSmoother, makePoints, type Particle, type WorldCtx } from '@/components/motion/ocean/core';
import { APPEARANCE, mul, paramDefaults, PROPORTIONS, rhythm, SPEED, TURN } from '@/components/motion/ocean/params';
import type { OceanAnimal, OceanParamDef } from '@/components/motion/ocean/types';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export const SEA_TURTLE_PARAMS: OceanParamDef[] = [
  SPEED, TURN,
  rhythm('Stroke rate', 'How often the turtle strokes with its front flippers'),
  mul('flapAmp', 'Stroke amplitude', 'How far the flippers travel on each stroke, front and rear', 0.3, 2),
  mul('sweepAmp', 'Fore and aft sweep', 'How far the flipper reaches forward and pushes back: a loop, not a flat flap', 0, 2),
  mul('flipperTwist', 'Flipper feathering', 'How much the flipper twists edge on through the stroke: a blade, not a wing', 0, 2),
  mul('asym', 'Manoeuvre asymmetry', 'How much harder the outside flipper pulls in a turn, and how hard the inside one brakes', 0, 2),
  mul('rearLife', 'Rear flipper activity', 'Sculling and steering with the rear pair; at zero they just hang', 0, 2),
  ...PROPORTIONS, ...APPEARANCE,
];

export function makeSeaTurtle(world: WorldCtx): OceanAnimal {
  const cShell = new THREE.Color(0xb5883c), cShellD = new THREE.Color(0x5e4a1e);
  const cSeam = new THREE.Color(0x2e2410), cSkin = new THREE.Color(0x86a06a), cSkinD = new THREE.Color(0x49603c);
  const cGlow = new THREE.Color(0x9fe8d8);

  function shellColor(u: number, a: number): THREE.Color {
    const gu = Math.abs(Math.sin(u * Math.PI * 3.2));
    const ga = Math.abs(Math.sin(a * 2.5 + u * 1.5));
    const seam = Math.min(gu, ga);
    const c = new THREE.Color();
    if (seam < 0.18) c.copy(cSeam);
    else c.copy(cShell).lerp(cShellD, 0.5 - 0.5 * Math.cos(a * 5 + u * 9) * 0.4 + Math.random() * 0.2);
    return c.multiplyScalar(0.45 + Math.random() * 0.3);
  }

  const P: Particle[] = [];
  const SHELL_N = 3000;
  for (let i = 0; i < SHELL_N; i++) {
    const u = Math.random();
    const a = Math.random() * Math.PI;
    const prof = Math.sin(Math.PI * Math.pow(u, 1.35));
    const W = 0.52 * prof + 0.02;
    P.push({ kind: 'body', lx: Math.cos(a) * W, ly: (u - 0.5) * 1.15, lz0: Math.sin(a) * (0.30 * prof + 0.01) + 0.05, c: shellColor(u, a) });
  }
  for (let i = 0; i < 700; i++) {
    const u = Math.random();
    const prof = Math.sin(Math.PI * Math.pow(u, 1.35));
    const W = 0.48 * prof + 0.02;
    const lx = (Math.random() * 2 - 1) * W;
    const sag = 1 - Math.pow(Math.abs(lx) / (W + 1e-6), 2);
    P.push({ kind: 'body', lx, ly: (u - 0.5) * 1.1, lz0: 0.03 - (0.09 + Math.random() * 0.03) * sag * prof,
      c: new THREE.Color(0xd8c890).multiplyScalar(0.22 + Math.random() * 0.15) });
  }
  for (let i = 0; i < 380; i++) {
    const u = 0.15 + Math.random() * 0.7;
    const prof = Math.sin(Math.PI * Math.pow(u, 1.35));
    const sgn = Math.random() < 0.5 ? -1 : 1;
    const t = Math.random();
    P.push({ kind: 'body', lx: sgn * (0.50 * prof + 0.02) * (1 - 0.12 * t), ly: (u - 0.5) * 1.12, lz0: 0.04 - t * (0.10 * prof + 0.02),
      c: new THREE.Color().copy(cShellD).lerp(new THREE.Color(0xd8c890), t * 0.6).multiplyScalar(0.25 + Math.random() * 0.15) });
  }
  for (let i = 0; i < 420; i++) {
    const u = Math.random();
    const prof = Math.sin(Math.PI * Math.pow(u, 1.35));
    const sgn = Math.random() < 0.5 ? -1 : 1;
    P.push({ kind: 'body', lx: sgn * (0.52 * prof + 0.02 + (Math.random() - 0.5) * 0.02), ly: (u - 0.5) * 1.15, lz0: 0.04 + (Math.random() - 0.5) * 0.03,
      c: new THREE.Color().copy(cShell).lerp(cGlow, 0.45).multiplyScalar(0.3 + Math.random() * 0.2) });
  }
  function addFlipper(sgn: number, baseLy: number, baseLx: number, len: number, wid: number, kind: 'front' | 'rear'): void {
    const PK = kind === 'front' ? 900 : 260;
    for (let i = 0; i < PK; i++) {
      const s = Math.pow(Math.random(), 0.8) * 1.08 - 0.08;
      const w = Math.random() * 2 - 1;
      const ss = Math.max(0, s);
      // Chord profile: a turtle's flipper is NARROW where it leaves the
      // shell, widest around a third of the way out, then tapers to a
      // rounded tip. The old profile was widest at the root, which read as
      // a slab bolted to the carapace.
      // The front pair also gets an elliptical cap over the last quarter of
      // the span, so the blade ends in a round tip instead of a cut-off slab.
      const tipCap = kind === 'front' && ss > 0.75
        ? Math.sqrt(Math.max(0, 1 - Math.pow((ss - 0.75) / 0.32, 2)))
        : 1;
      const chord = wid * (0.26 + 0.86 * Math.pow(ss, 0.4) * Math.pow(1 - ss * 0.85, 1.1)) * tipCap;
      const c = new THREE.Color();
      if (Math.random() < 0.65) c.copy(cSkin).lerp(cSkinD, Math.random() * 0.7);
      else c.copy(cShellD).multiplyScalar(0.8);
      if (ss > 0.88) c.lerp(cGlow, 0.35);
      c.multiplyScalar((0.35 + Math.random() * 0.25) * (1 - 0.25 * ss));
      P.push({ kind, sgn, s: ss, w, baseLy, baseLx, len, chord, jz: (Math.random() - 0.5) * 0.03, c });
    }
  }
  addFlipper(-1, 0.26, -0.32, 1.05, 0.21, 'front');
  addFlipper(1, 0.26, 0.32, 1.05, 0.21, 'front');
  for (const sgn of [-1, 1]) for (let i = 0; i < 240; i++) {
    const t = Math.random(), q = Math.random();
    P.push({ kind: 'body', lx: sgn * (0.16 + t * 0.26), ly: 0.30 + q * 0.22 * (1 - t * 0.55), lz0: -0.05 + Math.random() * 0.09 * (1 - t * 0.4),
      c: new THREE.Color().copy(cSkin).lerp(cSkinD, Math.random() * 0.8).multiplyScalar(0.3 + Math.random() * 0.18) });
  }
  // Hip skin bridging the carapace's rear taper to the back flipper roots.
  // The front pair always had this fill; the rear pair did not, and once the
  // chord narrowed there was nothing left to hide the gap.
  for (const sgn of [-1, 1]) for (let i = 0; i < 220; i++) {
    const t = Math.random(), q = Math.random();
    P.push({ kind: 'body', lx: sgn * (0.09 + t * 0.20), ly: -0.28 - q * 0.17 * (1 - t * 0.35), lz0: -0.04 + Math.random() * 0.08 * (1 - t * 0.4),
      c: new THREE.Color().copy(cSkin).lerp(cSkinD, Math.random() * 0.8).multiplyScalar(0.28 + Math.random() * 0.16) });
  }
  addFlipper(-1, -0.42, -0.26, 0.45, 0.13, 'rear');
  addFlipper(1, -0.42, 0.26, 0.45, 0.13, 'rear');
  for (let i = 0; i < 60; i++) {
    const d = Math.random();
    P.push({ kind: 'body', lx: (Math.random() - 0.5) * 0.05 * (1 - d), ly: -0.58 - d * 0.16, lz0: -0.02 + (Math.random() - 0.5) * 0.04 * (1 - d),
      c: new THREE.Color().copy(cSkinD).multiplyScalar(0.4 * (1 - 0.5 * d)) });
  }
  const NECK_N = 340, HEAD_N = 520;
  for (let i = 0; i < NECK_N; i++) {
    const t = Math.random();
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random());
    // base flare: the root widens into the shell instead of ending as a
    // clean-cut tube disc (user: "the neck is cut off like a piece of pipe")
    const rad = (0.085 + 0.028 * Math.exp(-t / 0.14)) * (1 - 0.35 * t);
    P.push({ kind: 'neck', t, ox: Math.cos(a) * rr * rad, oz: Math.sin(a) * rr * rad,
      c: new THREE.Color().copy(cSkin).lerp(cSkinD, Math.random() * 0.8).multiplyScalar(0.35 + Math.random() * 0.2) });
  }
  // shallow throat fill: bridges plastron→neck underside WITHOUT bulging
  // (the first version read as an Adam's apple — keep it tight and dim)
  for (let i = 0; i < 80; i++) {
    const t = Math.random() * 0.3;
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random());
    const rad = 0.095 * (1 - 0.3 * t);
    const oz = -Math.abs(Math.sin(a)) * rr * rad * 0.5;
    P.push({ kind: 'neck', t, ox: Math.cos(a) * rr * rad, oz,
      c: new THREE.Color().copy(cSkinD).multiplyScalar(0.22 + Math.random() * 0.12) });
  }
  for (let i = 0; i < HEAD_N; i++) {
    const a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1);
    const rr = Math.pow(Math.random(), 0.4);
    const hx = Math.sin(b) * Math.cos(a) * 0.085 * rr;
    let hy = Math.cos(b) * 0.125 * rr;
    const hz = Math.sin(b) * Math.sin(a) * 0.08 * rr;
    if (hy > 0) hy *= 1.15;
    const c = new THREE.Color().copy(cSkin).lerp(cSkinD, Math.random() * 0.6);
    if (Math.random() < 0.25) c.copy(cShellD);
    c.multiplyScalar(0.4 + Math.random() * 0.25);
    P.push({ kind: 'head', hx, hy, hz, c });
  }
  for (const sgn of [-1, 1]) for (let i = 0; i < 26; i++) {
    P.push({ kind: 'head', hx: sgn * (0.07 + (Math.random() - 0.5) * 0.012), hy: 0.055 + (Math.random() - 0.5) * 0.014, hz: 0.02 + (Math.random() - 0.5) * 0.014,
      c: new THREE.Color(0xffffff).multiplyScalar(0.55 + Math.random() * 0.35) });
  }

  const pts = makePoints(world, P, { size: 0.065 });
  const pos = pts.pos;

  const head = new THREE.Vector3(-1.4, 0, 0);
  const hVel = new THREE.Vector3(0.2, 0, 0);
  const fwd = new THREE.Vector3(1, 0, 0);
  const fwdVel = new THREE.Vector3();
  const gaze = new THREE.Vector3(1, 0, 0);
  const gazeVel = new THREE.Vector3();
  const basis = new BasisSmoother(fwd);
  const gazeBasis = new BasisSmoother(gaze);
  let roll = 0, rollVel = 0;
  let flapPh = 0;
  // per-side flipper drive, index 0 = left (sgn -1), 1 = right (sgn +1)
  const fPhase = [0, 0], fGain = [0, 0], fSweepBias = [0, 0], fPitchBias = [0, 0];

  const side = new THREE.Vector3(), up2 = new THREE.Vector3(), tmp = new THREE.Vector3();
  const sideR = new THREE.Vector3(), upR = new THREE.Vector3();
  const hSide = new THREE.Vector3(), hUp = new THREE.Vector3();
  const neckBase = new THREE.Vector3(), desired = new THREE.Vector3();
  const bp = paramDefaults(SEA_TURTLE_PARAMS);

  return {
    cloud: pts,
    head,
    p: bp,
    update(cursor, dt, time) {
      desired.copy(cursor).sub(head);
      const dist = desired.length();
      if (dist > 0.001) desired.normalize();

      const behind_desired = desired.dot(fwd);
      if (behind_desired < -0.35 && dist > 0.001) {
        const px = -fwd.z, pz = fwd.x;
        const sgn = desired.x * px + desired.z * pz >= 0 ? 1 : -1;
        const w = (-behind_desired - 0.35) * 1.8;
        desired.x += px * sgn * w; desired.z += pz * sgn * w;
        desired.normalize();
      }
      const want = Math.min(1, dist / 1.8);
      tmp.copy(desired).sub(fwd);
      fwdVel.addScaledVector(tmp, 0.5 * bp.turn * want * dt);
      fwdVel.multiplyScalar(Math.pow(0.35, dt));
      const av = fwdVel.length();
      const avCap = 0.55 * bp.turn;
      if (av > avCap) fwdVel.multiplyScalar(avCap / av);
      fwd.addScaledVector(fwdVel, dt).normalize();
      if (Math.abs(fwd.y) > 0.55) { fwd.y = Math.sign(fwd.y) * 0.55; fwd.normalize(); }

      tmp.copy(desired).sub(gaze);
      gazeVel.addScaledVector(tmp, 4.5 * dt);
      gazeVel.multiplyScalar(Math.pow(0.05, dt));
      gaze.addScaledVector(gazeVel, dt * 3).normalize();
      const cosMax = Math.cos(0.96);
      const d0 = gaze.dot(fwd);
      if (d0 < cosMax) {
        tmp.copy(fwd).multiplyScalar(-d0).add(gaze).normalize();
        gaze.copy(fwd).multiplyScalar(cosMax).addScaledVector(tmp, Math.sin(0.96)).normalize();
      }

      side.copy(basis.update(fwd, dt));
      up2.crossVectors(fwd, side).normalize();

      const turn = fwdVel.dot(side);
      const rollTarget = THREE.MathUtils.clamp(-turn * 1.0, -0.45, 0.45);
      rollVel += (rollTarget - roll) * 3 * dt; rollVel *= Math.pow(0.15, dt);
      roll += rollVel * dt * 3;
      const cr = Math.cos(roll), sr = Math.sin(roll);
      sideR.copy(side).multiplyScalar(cr).addScaledVector(up2, sr);
      upR.copy(up2).multiplyScalar(cr).addScaledVector(side, -sr);

      const flapF = (0.30 + 0.14 * Math.min(1, dist / 3)) * bp.rhythm;
      flapPh += flapF * dt;
      // Thrust follows the blade, not a bare sine: most of it on the
      // downstroke, a smaller share on the upstroke, because a turtle's
      // flipper bites water in both directions.
      const strokeVel = Math.cos(flapPh * Math.PI * 2);
      const thrust = (0.10 + 0.17 * (Math.max(0, strokeVel) * 0.72 + Math.max(0, -strokeVel) * 0.28)) * bp.speed;

      // Manoeuvres live in the flippers, not in the body rotation: the
      // outside flipper pulls harder and reaches further forward, the inside
      // one shortens its stroke and turns its blade across the flow to brake.
      const steer = THREE.MathUtils.clamp(turn / (0.55 * bp.turn + 1e-6), -1, 1);
      const kAsym = bp.asym;
      for (let k = 0; k < 2; k++) {
        const sg = k === 0 ? -1 : 1;
        const inside = sg * steer; // > 0 while this flipper is inside the turn
        fGain[k] = Math.max(0.22, 1 - inside * 0.62 * kAsym) * (1 + sg * 0.07 * Math.sin(time * 0.23 + k));
        fPhase[k] = sg * (0.045 + 0.10 * steer * kAsym) + sg * 0.02 * Math.sin(time * 0.37);
        fSweepBias[k] = -inside * 0.30 * kAsym;
        fPitchBias[k] = inside * 0.55 * kAsym;
      }
      const slowT = Math.min(1, Math.max(0.35, dist / 1.5));

      hVel.addScaledVector(fwd, thrust * slowT * dt * 2.2);
      hVel.y += Math.sin(time * 0.6) * 0.008 * dt;
      hVel.multiplyScalar(Math.pow(0.5, dt));
      hVel.multiplyScalar(Math.pow(0.25, dt * (1 - slowT) * 1.6)); // arrival brake
      const off = head.length();
      if (off > 6.5) hVel.addScaledVector(tmp.copy(head).multiplyScalar(-1 / off), (off - 6.5) * 2.0 * dt);
      const sp = hVel.length();
      const spCap = 1.4 * bp.speed;
      if (sp > spCap) hVel.multiplyScalar(spCap / sp);
      if (!Number.isFinite(head.x + hVel.x + fwd.x)) { head.set(0, 0, 0); hVel.set(0.2, 0, 0); fwd.set(1, 0, 0); fwdVel.set(0, 0, 0); gaze.copy(fwd); }
      head.addScaledVector(hVel, dt);

      hSide.copy(gazeBasis.update(gaze, dt, 4.0));
      hUp.crossVectors(gaze, hSide).normalize();

      const NECK_LEN = 0.34;
      const kFlap = bp.flapAmp; // flipper stroke height/sweep multiplier
      const kSweep = bp.sweepAmp, kTwist = bp.flipperTwist, kRear = bp.rearLife;
      // «Proportions»: length along fwd, width along sideR, thickness along upR.
      // The neck base and head anchor scale with the SAME multipliers as the
      // shell, so the neck seam never opens (lesson of the neck-tube bug).
      const kL = bp.bodyLen, kW = bp.bodyWide, kT = bp.bodyThick;
      // root buried at the shell's front taper (0.44, was 0.52 — the tube
      // started past the rim and detached visually from the body); lifted to
      // +0.03 so the neck exits the shell OPENING, not from under the belly
      neckBase.set(
        head.x + fwd.x * 0.44 * kL + upR.x * 0.03 * kT,
        head.y + fwd.y * 0.44 * kL + upR.y * 0.03 * kT,
        head.z + fwd.z * 0.44 * kL + upR.z * 0.03 * kT,
      );

      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (p.kind === 'body') {
          const lx = (p.lx as number) * kW, ly = (p.ly as number) * kL, lz = (p.lz0 as number) * kT;
          pos[i * 3] = head.x + fwd.x * ly + sideR.x * lx + upR.x * lz;
          pos[i * 3 + 1] = head.y + fwd.y * ly + sideR.y * lx + upR.y * lz;
          pos[i * 3 + 2] = head.z + fwd.z * ly + sideR.z * lx + upR.z * lz;
        } else if (p.kind === 'front' || p.kind === 'rear') {
          // Flipper kinematics, three axes instead of one:
          //   stroke — dorsoventral, the up/down that used to be the whole
          //            motion and read as a bird wing;
          //   sweep  — fore/aft, so the tip traces a loop: it reaches forward
          //            on the recovery and pushes back through the power part;
          //   pitch  — twist about the flipper's own span, so the blade bites
          //            water going down and sheds it coming up.
          // All three are read at the point's own span position, but with a
          // SMALL lag: a turtle flipper is a stiff bone-and-cartilage paddle
          // with a little give at the trailing edge, not a ribbon.
          const isF = p.kind === 'front';
          const s = p.s as number, w = p.w as number, sgn = p.sgn as number;
          const k = sgn > 0 ? 1 : 0;
          let stroke: number, sweep: number, pitch: number, span: number;
          if (isF) {
            const ph = flapPh + fPhase[k] - s * 0.09;
            const c = Math.cos(ph * Math.PI * 2), sn = Math.sin(ph * Math.PI * 2);
            const g = fGain[k];
            stroke = sn * 0.60 * kFlap * g;
            sweep = 0.16 + c * 0.24 * kSweep * g + fSweepBias[k];
            pitch = (-c * 0.62 * kTwist * g + fPitchBias[k]) * (0.62 + 0.38 * s);
            span = s * (p.len as number) * 0.86;
          } else {
            // The rear pair is not dead weight: it sculls slowly at roughly
            // half the front rhythm, drifts on its own slow cycle so it is
            // never frozen, and works as a rudder pair in a turn (outside one
            // extends, inside one tucks and turns its blade across the flow).
            const ph = flapPh * 0.5 + sgn * 0.12 - s * 0.06;
            const c = Math.cos(ph * Math.PI * 2), sn = Math.sin(ph * Math.PI * 2);
            const idleA = Math.sin(time * 0.41 + sgn * 1.3);
            const idleB = Math.sin(time * 0.33 + sgn);
            const inside = sgn * steer;
            stroke = (sn * 0.22 * kFlap + idleB * 0.09) * kRear + inside * 0.14 * kAsym;
            sweep = -0.50 + (c * 0.14 + idleA * 0.10) * kRear - inside * 0.24 * kAsym;
            pitch = ((sn * 0.24 + idleA * 0.14) * kRear + inside * 0.60 * kAsym) * (0.65 + 0.35 * s);
            span = s * (p.len as number) * 0.70;
          }
          // Build the flipper frame in body-local axes (x lateral, y forward,
          // z dorsal): sweep about the dorsal axis, stroke about the chord,
          // then feather about the span itself.
          const cw = Math.cos(sweep), sw = Math.sin(sweep);
          const spx = sgn * cw, spy = sw;
          const chx = -sgn * sw, chy = cw;
          const ct = Math.cos(stroke), st = Math.sin(stroke);
          const sx = spx * ct, sy = spy * ct, sz = -st;
          const nx = spx * st, ny = spy * st, nz = ct;
          const cp = Math.cos(pitch), sp2 = Math.sin(pitch);
          const cx = chx * cp + nx * sp2, cy = chy * cp + ny * sp2, cz = nz * sp2;
          const chordOff = w * (p.chord as number);
          const droop = Math.pow(s, 2) * (isF ? 0.05 : -0.04);
          const lx = ((p.baseLx as number) + sx * span + cx * chordOff) * kW;
          const ly = ((p.baseLy as number) + sy * span + cy * chordOff) * kL;
          const lz = (-0.03 + (p.jz as number) + sz * span + cz * chordOff + droop) * kT;
          pos[i * 3] = head.x + fwd.x * ly + sideR.x * lx + upR.x * lz;
          pos[i * 3 + 1] = head.y + fwd.y * ly + sideR.y * lx + upR.y * lz;
          pos[i * 3 + 2] = head.z + fwd.z * ly + sideR.z * lx + upR.z * lz;
        } else if (p.kind === 'neck') {
          const t = p.t as number;
          const w0 = t - t * t * 0.5, w1 = t * t * 0.5;
          tmp.set(
            neckBase.x + (fwd.x * w0 + gaze.x * w1) * NECK_LEN * kL,
            neckBase.y + (fwd.y * w0 + gaze.y * w1) * NECK_LEN * kL,
            neckBase.z + (fwd.z * w0 + gaze.z * w1) * NECK_LEN * kL,
          );
          const ox = (p.ox as number) * kW, oz = (p.oz as number) * kT;
          pos[i * 3] = tmp.x + hSide.x * ox * (1 - t * 0.3) + sideR.x * ox * t * 0.3 + hUp.x * oz;
          pos[i * 3 + 1] = tmp.y + hSide.y * ox * (1 - t * 0.3) + sideR.y * ox * t * 0.3 + hUp.y * oz;
          pos[i * 3 + 2] = tmp.z + hSide.z * ox * (1 - t * 0.3) + sideR.z * ox * t * 0.3 + hUp.z * oz;
        } else {
          tmp.set(
            neckBase.x + (fwd.x * 0.5 + gaze.x * 0.5) * NECK_LEN * kL,
            neckBase.y + (fwd.y * 0.5 + gaze.y * 0.5) * NECK_LEN * kL,
            neckBase.z + (fwd.z * 0.5 + gaze.z * 0.5) * NECK_LEN * kL,
          );
          const bob = 0.008 * Math.sin(time * 1.4);
          const hx = (p.hx as number) * kW, hy = ((p.hy as number) + 0.09) * kL, hz = ((p.hz as number) + bob) * kT;
          pos[i * 3] = tmp.x + gaze.x * hy + hSide.x * hx + hUp.x * hz;
          pos[i * 3 + 1] = tmp.y + gaze.y * hy + hSide.y * hx + hUp.y * hz;
          pos[i * 3 + 2] = tmp.z + gaze.z * hy + hSide.z * hx + hUp.z * hz;
        }
      }
      pts.geo.attributes.position.needsUpdate = true;
    },
    dispose() { world.scene.remove(pts.points); pts.geo.dispose(); pts.mat.dispose(); },
  };
}
