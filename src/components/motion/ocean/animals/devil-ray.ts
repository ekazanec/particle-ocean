/** Devil ray — winged flight, cephalic fins, physics tail chain. Port of devil-ray.html. */
import * as THREE from 'three';
import { BasisSmoother, makePoints, type Particle, type WorldCtx } from '@/components/motion/ocean/core';
import { APPEARANCE, mul, paramDefaults, PROPORTIONS, rhythm, SPEED, TURN } from '@/components/motion/ocean/params';
import type { OceanAnimal, OceanParamDef } from '@/components/motion/ocean/types';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export const DEVIL_RAY_PARAMS: OceanParamDef[] = [
  SPEED, TURN,
  rhythm('Stroke rate', 'Wingbeat rate'),
  mul('flapAmp', 'Stroke amplitude', 'How far the wings travel up and down', 0.3, 2),
  mul('poseSpeed', 'Rate of the lobe poses', 'How fast the cephalic lobes change pose: funnel, spiral, ring'),
  mul('wingAsym', 'Wing asymmetry', 'How much harder the outside wing beats in a turn', 0, 2),
  ...PROPORTIONS, ...APPEARANCE,
];

export function makeDevilRay(world: WorldCtx): OceanAnimal {
  // wing planform: leading/trailing edges by span fraction s
  const leadEdge = (s: number) => 0.62 - 0.10 * s - 0.72 * s * s;
  const trailEdge = (s: number) => { const te = -0.55 + 0.10 * s + 0.75 * s * s; return Math.min(te, leadEdge(s)); };
  const S_MAX = 0.826;
  const SPAN = 1.7;

  const P: Particle[] = [];
  const cTop = new THREE.Color(0x2a4a8f), cTop2 = new THREE.Color(0x1a2c55);
  const cBelly = new THREE.Color(0xbfe6f0), cEdge = new THREE.Color(0x57d8e8), cHorn = new THREE.Color(0x7fd6e0);

  const BODY_N = 4200;
  for (let i = 0; i < BODY_N; i++) {
    const s = Math.pow(Math.random(), 0.75) * S_MAX;
    const sgn = Math.random() < 0.5 ? -1 : 1;
    const u = Math.random();
    const le = leadEdge(s), te = trailEdge(s);
    const ly = le + (te - le) * u;
    const th = 0.20 * (1 - s * s) * (1 - Math.abs(u * 2 - 1) * 0.7) + 0.012;
    // volumetric central torso: head→tail dorsal hump between the wings.
    // Additive particle clouds only read volume through the SILHOUETTE, so
    // the hump must be broad (σ² 0.12 ≈ a third of the span) and tall, and
    // the wingtips get a gentle downward camber — head-on the disc draws an
    // arc, not a line (user: "too flat" at the narrow 0.055/0.30).
    const hump = 0.36 * Math.exp(-(s * s) / 0.12) * Math.sin(Math.PI * Math.pow(u, 0.8));
    const v = Math.random() * 2 - 1;
    // dorsal side bulges more than ventral + slight arched-back lift
    const lz = v * (th * 0.5 + hump * (v > 0 ? 0.62 : 0.30)) + hump * 0.12 - 0.14 * s * s;
    const c = new THREE.Color();
    if (v > 0) c.copy(cTop).lerp(cTop2, s * 0.6 + Math.random() * 0.2);
    else c.copy(cBelly).multiplyScalar(0.55);
    if (s > 0.76) c.lerp(cEdge, (s - 0.76) / 0.07 * 0.8);
    c.multiplyScalar(0.4 + Math.random() * 0.35);
    P.push({ kind: 'body', s, sgn, u, ly, lz0: lz, c });
  }
  // dense torso fill: the hump reads only if the central mass is noticeably
  // denser than the wing membranes — concentrate extra points on the hump
  // with a slight brightness lift so the silhouette AND the fill both say
  // "thick body" (user: hump barely visible at uniform density)
  const TORSO_N = 1300;
  // Irwin–Hall(3) ≈ gaussian, cheap and dependency-free
  const gauss3 = () => (Math.random() + Math.random() + Math.random()) / 1.5 - 1;
  for (let i = 0; i < TORSO_N; i++) {
    const s = Math.abs(gauss3()) * 0.33;
    if (s > 0.6) { continue; }
    const sgn = Math.random() < 0.5 ? -1 : 1;
    const u = 0.18 + Math.random() * 0.66;
    const le = leadEdge(s), te = trailEdge(s);
    const ly = le + (te - le) * u;
    const th = 0.20 * (1 - s * s) * (1 - Math.abs(u * 2 - 1) * 0.7) + 0.012;
    const hump = 0.36 * Math.exp(-(s * s) / 0.12) * Math.sin(Math.PI * Math.pow(u, 0.8));
    const v = Math.random() * 2 - 1;
    const lz = v * (th * 0.5 + hump * (v > 0 ? 0.62 : 0.30)) + hump * 0.12 - 0.14 * s * s;
    const c = new THREE.Color();
    // bright dorsal ridge: the dark cTop palette vanished against the dark
    // water (user: "the hump is very dark, make it bright") — the hump fill reads
    // in the edge-cyan/belly range instead, peaking at the ridge line
    if (v > 0) c.copy(cEdge).lerp(cBelly, Math.random() * 0.45).multiplyScalar(0.8 + 0.5 * (1 - s / 0.6));
    else c.copy(cBelly).multiplyScalar(0.55);
    c.multiplyScalar(0.55 + Math.random() * 0.4);
    P.push({ kind: 'body', s, sgn, u, ly, lz0: lz, c });
  }
  // white shoulder patches
  for (let i = 0; i < 260; i++) {
    const sgn = Math.random() < 0.5 ? -1 : 1;
    const s = 0.18 + Math.random() * 0.22;
    const u = 0.12 + Math.random() * 0.2;
    const le = leadEdge(s), te = trailEdge(s);
    P.push({ kind: 'body', s, sgn, u, ly: le + (te - le) * u, lz0: 0.085 * (1 - s * s),
      c: new THREE.Color(0xdff4f8).multiplyScalar(0.35 + Math.random() * 0.25) });
  }
  // cephalic lobes — two flexible paddles at the FRONT CORNERS of the head,
  // separated by the mouth (~17% of wingspan) and angled forward-OUTWARD.
  // Shape is a per-frame integrated arc (curl/uncurl in update); here we only
  // sample the particle's place on the paddle: d along length, w across.
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 340; i++) {
      const d = Math.pow(Math.random(), 0.85);
      const halfW = 0.10 * (1 - 0.55 * d) + 0.012;
      const w = (Math.random() * 2 - 1) * halfW;
      const jt = (Math.random() - 0.5) * 0.05 * (1 - 0.35 * d);
      const c = new THREE.Color();
      if (Math.random() < 0.5) c.copy(cTop).lerp(cTop2, 0.3 + Math.random() * 0.3);
      else c.copy(cHorn).multiplyScalar(0.6);
      if (Math.abs(w) > halfW * 0.72 || d > 0.9) c.lerp(cEdge, 0.5);
      c.multiplyScalar(0.35 + Math.random() * 0.3);
      P.push({ kind: 'horn', d, w, jt, sgn, c });
    }
  }
  // eye highlights on top of the head at the lobe bases
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 30; i++) {
      P.push({ kind: 'body', s: 0.16 + (Math.random() - 0.5) * 0.012, sgn, u: 0.05,
        ly: 0.50 + (Math.random() - 0.5) * 0.025, lz0: 0.06 + (Math.random() - 0.5) * 0.02,
        c: new THREE.Color(0xffffff).multiplyScalar(0.5 + Math.random() * 0.4) });
    }
  }
  // physics tail chain
  // whip tail ≈ one body length (mobula tails are short, unlike manta lore)
  const TAIL_K = 26, TAIL_LEN = 1.6;
  const tail: THREE.Vector3[] = [];
  for (let k = 0; k < TAIL_K; k++) tail.push(new THREE.Vector3(0, -0.55 - k * TAIL_LEN / TAIL_K, 0));
  const tailSeg = TAIL_LEN / TAIL_K;
  for (let i = 0; i < 320; i++) {
    const d = Math.pow(Math.random(), 0.8);
    const w = 0.03 * (1 - 0.7 * d);
    P.push({ kind: 'tail', d, jx: (Math.random() - 0.5) * w, jy: (Math.random() - 0.5) * w, jz: (Math.random() - 0.5) * w,
      c: new THREE.Color().copy(cEdge).lerp(cBelly, 0.3).multiplyScalar((0.4 + Math.random() * 0.25) * (1 - 0.75 * d)) });
  }

  const pts = makePoints(world, P, { size: 0.078, opacity: 0.8 });
  const pos = pts.pos;

  const head = new THREE.Vector3(-1.5, 0, 0);
  const hVel = new THREE.Vector3(0.4, 0, 0);
  const fwd = new THREE.Vector3(1, 0, 0);
  const fwdVel = new THREE.Vector3();
  const basis = new BasisSmoother(fwd);
  let roll = 0, rollVel = 0;
  let flapPh = Math.random();
  let prevFlap = 0;

  // Cephalic-lobe state, preallocated (2 lobes × HORN_K nodes, no per-frame
  // allocs). Each lobe curls on its OWN clock (own rate + wobble — the pair is
  // never mirror-synced), integrating a planar arc from unrolled feeding
  // funnel to rolled-up spiral. On top of that an irregular SHARED event
  // blends both lobes into one closed "jet-intake" ring in front of the
  // mouth. Particles interpolate position + local frame along cached nodes.
  const HORN_K = 30;
  const LOBE_LEN = 0.55;
  const nodeP = [new Float32Array(HORN_K * 3), new Float32Array(HORN_K * 3)];
  const nodeN = [new Float32Array(HORN_K * 3), new Float32Array(HORN_K * 3)];
  const nodeW = [new Float32Array(HORN_K * 3), new Float32Array(HORN_K * 3)];

  // Pose machine for the lobes — stochastic, seeded at construction, NOT a
  // metronome: every dwell and every transition duration is drawn at random,
  // and the next pose is a Markov pick (repeats allowed occasionally).
  //   FUNNEL  — unrolled, tips arcing loosely toward each other
  //   SPIRAL  — each lobe rolled into its own tight spiral "horn"
  //   TURBINE — both lobes sweep inward and close ONE ring (jet intake)
  const POSE_FUNNEL = 0, POSE_SPIRAL = 1, POSE_TURBINE = 2;
  let pose = Math.random() < 0.5 ? POSE_FUNNEL : POSE_SPIRAL;
  let fromPose = pose;
  let dwellLeft = 4 + Math.random() * 10;
  let blendT = 1, blendDur = 2;
  const cuS = [pose === POSE_SPIRAL ? 1 : 0, pose === POSE_SPIRAL ? 1 : 0];
  const cuTgtOf = (p: number) => (p === POSE_SPIRAL ? 1 : p === POSE_TURBINE ? 0.25 : 0);
  const pickNext = (cur: number): number => {
    const r = Math.random();
    if (cur === POSE_FUNNEL) return r < 0.40 ? POSE_SPIRAL : r < 0.75 ? POSE_TURBINE : POSE_FUNNEL;
    if (cur === POSE_SPIRAL) return r < 0.40 ? POSE_FUNNEL : r < 0.70 ? POSE_TURBINE : POSE_SPIRAL;
    return r < 0.45 ? POSE_FUNNEL : r < 0.90 ? POSE_SPIRAL : POSE_TURBINE;
  };

  const side = new THREE.Vector3(), up2 = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const sideR = new THREE.Vector3(), upR = new THREE.Vector3();
  const prevDir = new THREE.Vector3();
  const bp = paramDefaults(DEVIL_RAY_PARAMS);

  return {
    cloud: pts,
    head,
    p: bp,
    update(cursor, dt, time) {
      tmp2.copy(cursor).sub(head);
      const dist = tmp2.length();
      if (dist > 0.001) tmp2.normalize();

      const behind_tmp2 = tmp2.dot(fwd);
      if (behind_tmp2 < -0.35 && dist > 0.001) {
        const px = -fwd.z, pz = fwd.x;
        const sgn = tmp2.x * px + tmp2.z * pz >= 0 ? 1 : -1;
        const w = (-behind_tmp2 - 0.35) * 1.8;
        tmp2.x += px * sgn * w; tmp2.z += pz * sgn * w;
        tmp2.normalize();
      }
      const want = Math.min(1, dist / 1.5);
      tmp.copy(tmp2).sub(fwd);
      fwdVel.addScaledVector(tmp, 0.9 * bp.turn * want * dt);
      fwdVel.multiplyScalar(Math.pow(0.3, dt));
      const av = fwdVel.length();
      const avCap = 1.1 * bp.turn;
      if (av > avCap) fwdVel.multiplyScalar(avCap / av);
      fwd.addScaledVector(fwdVel, dt).normalize();
      if (Math.abs(fwd.y) > 0.68) { fwd.y = Math.sign(fwd.y) * 0.68; fwd.normalize(); }

      side.copy(basis.update(fwd, dt));
      up2.crossVectors(fwd, side).normalize();

      const turn = fwdVel.dot(side);
      const rollTarget = THREE.MathUtils.clamp(-turn * 1.4, -0.9, 0.9);
      rollVel += (rollTarget - roll) * 3.5 * dt; rollVel *= Math.pow(0.12, dt);
      roll += rollVel * dt * 3;
      const cr = Math.cos(roll), sr = Math.sin(roll);
      sideR.copy(side).multiplyScalar(cr).addScaledVector(up2, sr);
      upR.copy(up2).multiplyScalar(cr).addScaledVector(side, -sr);

      // slow flaps, thrust on the downstroke
      const flapF = (0.42 + 0.1 * Math.min(1, dist / 3)) * bp.rhythm;
      flapPh += flapF * dt;
      const flap = Math.sin(flapPh * Math.PI * 2);
      const flapV = (flap - prevFlap) / Math.max(dt, 1e-4); prevFlap = flap;
      const thrust = (Math.max(0, -flapV) * 0.16 + 0.25) * bp.speed;
      const slowT = Math.min(1, Math.max(0.35, dist / 1.4));
      // wing-beat asymmetry: bank into the turn (outer wing beats bigger),
      // plus a little natural drift when cruising straight
      const flapAsym = (THREE.MathUtils.clamp(turn * 1.6, -0.38, 0.38) + 0.06 * Math.sin(time * 0.47)) * bp.wingAsym;

      hVel.addScaledVector(fwd, thrust * slowT * dt * 2.2);
      hVel.multiplyScalar(Math.pow(0.5, dt));
      hVel.multiplyScalar(Math.pow(0.25, dt * (1 - slowT) * 1.6)); // arrival brake
      const off = head.length();
      if (off > 6.5) hVel.addScaledVector(tmp.copy(head).multiplyScalar(-1 / off), (off - 6.5) * 2.0 * dt);
      const sp = hVel.length();
      const spCap = 2.2 * bp.speed;
      if (sp > spCap) hVel.multiplyScalar(spCap / sp);
      if (!Number.isFinite(head.x + hVel.x + fwd.x)) { head.set(0, 0, 0); hVel.set(0.3, 0, 0); fwd.set(1, 0, 0); fwdVel.set(0, 0, 0); }
      head.addScaledVector(hVel, dt);

      // cephalic lobes — advance the stochastic pose machine («Rate of the lobe poses»
      // scales the machine's clock: dwells and blends shorten/lengthen together)
      dwellLeft -= dt * bp.poseSpeed;
      blendT = Math.min(1, blendT + (dt * bp.poseSpeed) / blendDur);
      if (dwellLeft <= 0) {
        fromPose = pose;
        pose = pickNext(pose);
        blendDur = 1.5 + Math.random() * 2;
        blendT = 0;
        dwellLeft = blendDur + (pose === POSE_TURBINE ? 5 + Math.random() * 7 : 4 + Math.random() * 10);
        // debug/verification trail (lab harness reads these; harmless in prod)
        const w = window as unknown as { __devilRayLog?: string[] };
        w.__devilRayLog = w.__devilRayLog ?? [];
        w.__devilRayLog.push(`${time.toFixed(1)}s ${fromPose}>${pose} blend=${blendDur.toFixed(1)} dwell=${dwellLeft.toFixed(1)}`);
        if (w.__devilRayLog.length > 60) w.__devilRayLog.shift();
      }
      (window as unknown as { __devilRayPose?: [number, number] }).__devilRayPose = [pose, blendT];
      const bs = blendT * blendT * (3 - 2 * blendT);
      const ringW = (fromPose === POSE_TURBINE ? 1 - bs : 0) + (pose === POSE_TURBINE ? bs : 0);
      const cuTgt = cuTgtOf(fromPose) + (cuTgtOf(pose) - cuTgtOf(fromPose)) * bs;
      const RING_R = 0.165; // jet-intake ring radius (slight arc-length stretch is fine)
      const baseBob = Math.sin((flapPh - 0.06) * Math.PI * 2) * 0.03;
      for (let j = 0; j < 2; j++) {
        const sgn = j === 0 ? -1 : 1;
        // per-lobe pursuit of the pose target: own time constant + own wobble,
        // so the pair never moves mirror-synced
        const k = 1 - Math.pow(0.5, dt / (j === 0 ? 0.9 : 1.6));
        cuS[j] += (cuTgt - cuS[j]) * k;
        const cu = THREE.MathUtils.clamp(
          cuS[j] + 0.16 * (1 - ringW) * Math.sin(time * (0.23 + 0.11 * j) + j * 2.9), 0, 1);
        const sway = Math.sin(time * (0.29 + j * 0.06) + j * 2.3);
        const theta = 0.56 + 0.09 * sway - 0.10 * cu; // ~32° outward off axis
        const st = Math.sin(theta), ct = Math.cos(theta);
        const tx = sgn * st, ty = ct; // lobe axis: forward-outward, horizontal
        // curl plane: tips inward at low curl, rolling downward as it winds up
        const tilt = 0.18 + 0.5 * cu;
        let nx = -sgn * ct * (1 - tilt), ny = st * (1 - tilt), nz = -tilt;
        const nl = Math.hypot(nx, ny, nz);
        nx /= nl; ny /= nl; nz /= nl;
        const bx = sgn * 0.24, by = 0.55, bz = -0.02 + baseBob;
        // free-arc turn: ~110° funnel → ~430° spiral, tip winding tighter,
        // amplitude breathing on its own slow noise
        const turnTot = (1.9 + 5.6 * cu) * (1 + 0.12 * Math.sin(time * (0.15 + j * 0.04) + j));
        const kap0 = turnTot / LOBE_LEN;
        const dl = LOBE_LEN / (HORN_K - 1);
        const NP = nodeP[j], NN = nodeN[j], NW = nodeW[j];
        let phi = 0, ta = 0, tb = 0;
        for (let k = 0; k < HORN_K; k++) {
          const x = k / (HORN_K - 1);
          const sphi = Math.sin(phi), cphi = Math.cos(phi);
          // free arc node + its in-plane thickness normal
          let px = bx + tx * ta + nx * tb;
          let py = by + ty * ta + ny * tb;
          let pz = bz + nz * tb;
          let qx = -sphi * tx + cphi * nx;
          let qy = -sphi * ty + cphi * ny;
          let qz = cphi * nz;
          if (ringW > 0) {
            // shared ring pose: short lead-in, then this lobe's half circle in
            // the transverse plane (right over the top, left under the bottom)
            let rx: number, ry: number, rz: number, ux: number, uz: number;
            const cy = 0.80, cz = -0.05 + baseBob;
            if (x < 0.25) {
              const f = x / 0.25;
              rx = bx + (sgn * RING_R - bx) * f;
              ry = by + (cy - by) * f;
              rz = bz + (cz - bz) * f;
              ux = sgn; uz = 0;
            } else {
              const al = (j === 1 ? 0 : Math.PI) + Math.PI * ((x - 0.25) / 0.75);
              ux = Math.cos(al); uz = Math.sin(al);
              // Squashed, breathing intake — two fins meeting, not a compass
              // circle: vertically flattened ellipse + slow per-lobe radius
              // wobble, so the seam and the arc never read as machined.
              const wob = 1
                + 0.07 * Math.sin(al * 2 + time * 0.5 + j * 1.7)
                + 0.05 * Math.sin(al * 3 - time * 0.31 + j);
              rx = ux * RING_R * 1.06 * wob;
              ry = cy;
              rz = cz + uz * RING_R * 0.70 * wob;
            }
            px += (rx - px) * ringW; py += (ry - py) * ringW; pz += (rz - pz) * ringW;
            qx += (ux - qx) * ringW; qy += (0 - qy) * ringW; qz += (uz - qz) * ringW;
          }
          NP[k * 3] = px; NP[k * 3 + 1] = py; NP[k * 3 + 2] = pz;
          NN[k * 3] = qx; NN[k * 3 + 1] = qy; NN[k * 3 + 2] = qz;
          ta += cphi * dl; tb += sphi * dl;
          phi += kap0 * ((0.7 + 0.6 * x * cu) / (0.7 + 0.3 * cu)) * dl;
        }
        // second pass: orthonormal frame per node (tangent from neighbours,
        // thickness normal re-orthogonalized, width axis = t × n)
        for (let k = 0; k < HORN_K; k++) {
          const ka = Math.max(0, k - 1) * 3, kb = Math.min(HORN_K - 1, k + 1) * 3;
          let dx = NP[kb] - NP[ka], dy = NP[kb + 1] - NP[ka + 1], dz = NP[kb + 2] - NP[ka + 2];
          const dlen = Math.hypot(dx, dy, dz) || 1;
          dx /= dlen; dy /= dlen; dz /= dlen;
          let qx = NN[k * 3], qy = NN[k * 3 + 1], qz = NN[k * 3 + 2];
          const dot = qx * dx + qy * dy + qz * dz;
          qx -= dx * dot; qy -= dy * dot; qz -= dz * dot;
          const qlen = Math.hypot(qx, qy, qz) || 1;
          qx /= qlen; qy /= qlen; qz /= qlen;
          NN[k * 3] = qx; NN[k * 3 + 1] = qy; NN[k * 3 + 2] = qz;
          NW[k * 3] = dy * qz - dz * qy;
          NW[k * 3 + 1] = dz * qx - dx * qz;
          NW[k * 3 + 2] = dx * qy - dy * qx;
        }
      }

      // wing bend wave root→tip with lag
      const kFlap = bp.flapAmp; // wing-beat vertical amplitude
      const kL = bp.bodyLen, kW = bp.bodyWide, kT = bp.bodyThick; // «Proportions» (width = span)
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (p.kind === 'tail') continue;
        let lx: number, ly: number, lz: number;
        if (p.kind === 'body') {
          const s = p.s as number;
          const sgn = p.sgn as number;
          lx = sgn * s * SPAN;
          ly = p.ly as number;
          // asymmetric beat: in a turn the OUTER wing sweeps harder
          const amp = (1 - sgn * flapAsym) * kFlap;
          const bend = Math.sin((flapPh - s * 0.35 - (p.u as number) * 0.06) * Math.PI * 2);
          lz = (p.lz0 as number) + bend * Math.pow(s, 1.6) * 0.62 * amp + Math.pow(s, 2) * 0.06;
          ly += -bend * Math.pow(s, 2.5) * 0.10 * amp;
        } else {
          // cephalic lobe: interpolate position + frame along cached nodes,
          // offset by paddle width (W) and thickness jitter (N)
          const j = (p.sgn as number) < 0 ? 0 : 1;
          const fu = (p.d as number) * (HORN_K - 1.001);
          const k0 = Math.floor(fu) * 3, f = fu - Math.floor(fu);
          const NP = nodeP[j], NN = nodeN[j], NW = nodeW[j];
          const jt = p.jt as number, w = p.w as number;
          lx = NP[k0] + (NP[k0 + 3] - NP[k0]) * f
            + (NW[k0] + (NW[k0 + 3] - NW[k0]) * f) * w
            + (NN[k0] + (NN[k0 + 3] - NN[k0]) * f) * jt;
          ly = NP[k0 + 1] + (NP[k0 + 4] - NP[k0 + 1]) * f
            + (NW[k0 + 1] + (NW[k0 + 4] - NW[k0 + 1]) * f) * w
            + (NN[k0 + 1] + (NN[k0 + 4] - NN[k0 + 1]) * f) * jt;
          lz = NP[k0 + 2] + (NP[k0 + 5] - NP[k0 + 2]) * f
            + (NW[k0 + 2] + (NW[k0 + 5] - NW[k0 + 2]) * f) * w
            + (NN[k0 + 2] + (NN[k0 + 5] - NN[k0 + 2]) * f) * jt;
        }
        lx *= kW; ly *= kL; lz *= kT; // proportions: wings + lobes together
        pos[i * 3] = head.x + fwd.x * ly + sideR.x * lx + upR.x * lz;
        pos[i * 3 + 1] = head.y + fwd.y * ly + sideR.y * lx + upR.y * lz;
        pos[i * 3 + 2] = head.z + fwd.z * ly + sideR.z * lx + upR.z * lz;
      }

      // tail: anchored chain, stiff near root; the root follows the stretched
      // body (kL) so the whip never detaches
      tmp.set(
        head.x + fwd.x * -0.5 * kL + upR.x * 0.01,
        head.y + fwd.y * -0.5 * kL + upR.y * 0.01,
        head.z + fwd.z * -0.5 * kL + upR.z * 0.01,
      );
      tail[0].copy(tmp);
      prevDir.set(-fwd.x, -fwd.y, -fwd.z);
      for (let k = 1; k < TAIL_K; k++) {
        const p0 = tail[k - 1], p1 = tail[k];
        const kk = k / (TAIL_K - 1);
        p1.x += Math.sin(time * 0.9 + k * 0.5) * 0.04 * kk * dt;
        p1.y -= 0.12 * kk * dt;
        p1.z += Math.cos(time * 0.8 + k * 0.45) * 0.04 * kk * dt;
        tmp2.copy(p1).sub(p0);
        const d = tmp2.length();
        if (d > 1e-6) tmp2.multiplyScalar(1 / d); else tmp2.copy(prevDir);
        const stiff = Math.pow(1 - kk, 2.2) * (1 - Math.pow(0.002, dt));
        tmp2.lerp(prevDir, stiff).normalize();
        if (d > tailSeg || stiff > 0.01) p1.copy(p0).addScaledVector(tmp2, Math.min(d, tailSeg));
        prevDir.copy(tmp2);
      }
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (p.kind !== 'tail') continue;
        const fu = (p.d as number) * (TAIL_K - 1.001);
        const k0 = Math.floor(fu), f = fu - k0;
        tmp.copy(tail[k0]).lerp(tail[k0 + 1], f);
        pos[i * 3] = tmp.x + (p.jx as number);
        pos[i * 3 + 1] = tmp.y + (p.jy as number);
        pos[i * 3 + 2] = tmp.z + (p.jz as number);
      }
      pts.geo.attributes.position.needsUpdate = true;
    },
    dispose() { world.scene.remove(pts.points); pts.geo.dispose(); pts.mat.dispose(); },
  };
}
