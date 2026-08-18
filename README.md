<p align="center">
  <a href="https://agurov.com/ocean/">
    <img src="assets/hero.gif" width="640" alt="A sea turtle made of particles swimming through god rays, flippers stroking on three axes" />
  </a>
</p>

<h1 align="center">particle-ocean</h1>

<p align="center">
  Eighteen creatures rendered as three.js point clouds, each with its own
  swimming physics.<br />
  They chase the cursor, and when one catches it the body scatters and
  reassembles as a different species.
</p>

<p align="center">
  <a href="https://agurov.com/ocean/"><b>▶ Live demo</b></a> ·
  <a href="docs/species.md">Species</a> ·
  <a href="docs/swimming.md">How it swims</a> ·
  <a href="docs/tuning.md">Tuning</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-d4ff00?style=flat-square" alt="MIT" />
  <img src="https://img.shields.io/badge/three.js-r170-1a1a1a?style=flat-square" alt="three.js" />
  <img src="https://img.shields.io/badge/dependencies-three%20%2B%20react-1a1a1a?style=flat-square" alt="two dependencies" />
  <img src="https://img.shields.io/badge/species-18-1a1a1a?style=flat-square" alt="18 species" />
</p>

---

## Not one animation with eighteen skins

Every species is written as its own model, not as a shared sine wave in a
different colour.

**Sea turtle.** Three-axis flippers. The blade reaches forward on the
recovery, sweeps down and back through the power stroke, and twists about its
own span so it bites water going down and sheds it coming up. Turns come from
making the two sides unequal, the way a real turtle manoeuvres, rather than
from rotating the whole body. The rear pair sculls and rudders instead of
hanging.

**Jellyfish.** Swims by contracting the bell and coasting, so thrust is
intrinsically pulsed rather than continuous. Tentacles and oral arms trail on
their own chains.

**Herring school.** 560 individuals as one creature, morphing between bait
ball, torus, wave sheet, vortex funnel, figure-eight ribbon and hourglass. The
cursor is a predator: the school parts around it and reforms behind.

**Hummingbird.** The one that is not a fish, and the only creature that has to
earn something. It commits to the cursor as a flower, hovers on a shimmering
wing fan, drinks for two to five seconds, then darts away.

The rest: blue shark, devil ray, dolphin, hammerhead, leafy seadragon,
lionfish, mola mola, moray, orca, ribbon eel, sailfish, sea spider, stingray,
whale shark.

## Run it

```bash
npm install
npm run dev
```

The demo is the tuning lab the creatures were built in. Every knob is live:
gait frequency, stroke amplitude, body proportions, particle size and glow,
plus the backdrop and biome picker. Any knob can be switched from a fixed
value to a min/max band that the value drifts between, so nothing runs at one
metronomic tempo.

## Use the engine

The engine is framework-agnostic three.js. Only the demo panel needs React.

```ts
import { OCEAN_ANIMALS } from './src/components/motion/ocean/registry';
import type { WorldCtx } from './src/components/motion/ocean/core';

const world: WorldCtx = { scene, camera, sprite };
const creature = OCEAN_ANIMALS[0].make(world);

// in your animation loop
creature.update(cursorInWorldSpace, dt, elapsed);
```

`update(cursor, dt, time)` writes straight into the point cloud's position
buffer. `creature.p` is the live parameter object: assign to it at any time and
the change takes effect on the next frame.

## Layout

| Path | What it holds |
| --- | --- |
| `src/components/motion/ocean/animals/` | the 17 sea species |
| `src/components/motion/ocean/animals/birds/` | the one that is not a fish |
| `src/components/motion/ocean/biomes/` | five underwater biomes with their own flora |
| `src/components/motion/ocean/swim.ts` | the shared swimming model: drive, basis, roll, thrust |
| `src/components/motion/ocean/steering.ts` | invisible art direction: attract regions, UI repulsion |
| `src/components/motion/ocean/morph.ts` | scatter and reassemble between species |
| `src/components/motion/ocean/params.ts` | the knob vocabulary every species speaks |
| `src/components/motion/hero-uw-*.tsx` | backdrop layers: god rays, caustics, plankton, wreck |
| `src/demo/` | the tuning lab |
| `scripts/` | headless capture: records the animation at the top of this page |

## Requirements

WebGL2, a browser from roughly the last four years, and a pointer. Everything
respects `prefers-reduced-motion`.

## Credit

MIT, so you can use this commercially, privately, in a client project, with or
without changes. The one legal condition is that the copyright notice travels
with the code, which is why every source file carries a `/*!` header and the
build keeps it through minification.

Beyond the license, a request that is not a condition of it: **if these
creatures end up in something you ship, link back**. Every one of the eighteen
was hand-tuned by one person against footage of the real animal, and a link is
the only way that work finds its way home.

```html
<!-- Creatures by Andrey Gurov · https://agurov.com -->
<a href="https://agurov.com">Creatures by Andrey Gurov</a>
```

If you build something with it I would genuinely like to see it. Open an issue,
or write to me from [agurov.com](https://agurov.com).

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
