# The swimming model

Nothing here simulates fluid. The goal is a body that reads as *alive* at
250 to 4000 particles, on a laptop GPU, at 60 fps. Everything below is an
approximation chosen because it survives that constraint.

## Two layers

Every species is built from the same two-layer split:

1. **Where the animal is going** — a `Swimmer` in
   [`swim.ts`](../src/components/motion/ocean/swim.ts): an inertial steering
   solver that owns position, velocity, heading and roll.
2. **What the body does about it** — per-species code that reads the swimmer's
   frame and writes every particle's position for this frame.

Species that do not fit the shared swimmer (jellyfish, sea turtle, hummingbird,
sea spider) run their own integrator, but the split stays the same.

## The swimmer

`Swimmer` steers like something with mass, not like a cursor follower:

- The nose turns toward the target through a spring with angular inertia
  (`turnK`), and the angular velocity is capped (`avMax`). A creature cannot
  snap around; it has to come about.
- Heading is clamped in pitch (`pitchMax`) so nothing swims straight up the
  vertical pole, which always reads as broken.
- The body **banks into the turn**: roll is driven from the lateral component
  of the angular velocity and clamped (`rollMax`). This one term does more for
  believability than any amount of body detail.
- The orthonormal frame is smoothed by `BasisSmoother` rather than rebuilt each
  frame from a world-up cross product. A naive `cross(dir, up)` flips the frame
  when the heading passes vertical, and the whole animal snaps inside out.
- A soft boundary (`bound`) pulls the creature back toward the scene instead of
  clamping it, so the return reads as a decision.

## Gait

`Drive` produces the phase every body reads. Frequency rises with distance to
the target, so a creature approaching from far away swims harder, and a
creature hovering near the cursor idles.

Thrust is taken from the **stroke**, never from a bare clock. In practice that
means thrust is a function of the phase derivative, weighted by which part of
the cycle actually moves water. The sea turtle is the clearest case: 72 percent
of its thrust comes from the downstroke and 28 percent from the upstroke,
because a flipper bites water in both directions.

## Bodies

Three generators cover most anatomy:

- `body()` — a tapered particle volume along the spine.
- `fin()` — a membrane with span and chord, which is also how wings, flippers
  and ray discs are built.
- `layoutWave()` — a travelling wave down the spine, phase-lagged along the
  length, which is what makes eels eel and sharks shark.

The lag along the body is the single most sensitive constant in the codebase.
Too little and the creature is a rigid plank. Too much and it turns into a
ribbon. The sea turtle's flippers were shipped once at a lag of 0.30 and read
immediately as a bird flapping its wings; they now run at 0.09.

## Steering that the viewer should not notice

[`steering.ts`](../src/components/motion/ocean/steering.ts) is art direction
disguised as physics. It can bias creatures toward a region of the frame and
push them away from an area where interface elements sit, with a grace period,
a ramp, and a release, so a creature never appears to be obeying a rule. It
scales its own bias down when the creature is already busy chasing the cursor.

## Morphing

[`morph.ts`](../src/components/motion/ocean/morph.ts) turns one species into
another in place, across arbitrary and unequal particle counts. Three
choreographies ship: flow (a liquid dissolve and reform), pulse (the old body
collapses into a luminous core and the new one blooms out of it), and vortex
(the particles are swept into a swirl and released as the new shape).
