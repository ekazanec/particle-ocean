# particle-ocean

Eighteen sea creatures rendered as three.js point clouds, each with its own
swimming physics. They chase the cursor, and when one catches it the body
scatters and reassembles as a different species.

**[Live demo](https://agurov.com/ocean/)** · extracted from the
hero of [agurov.com](https://agurov.com)

## What makes it different from a particle demo

Every species is written as its own model, not as a shared sine wave with
different colors:

- A **jellyfish** swims by contracting its bell and coasting; thrust follows
  the contraction, not a clock.
- A **sea turtle** flies with three-axis flippers. The blade reaches forward on
  the recovery, sweeps down and back through the power stroke, and twists
  about its own span so it bites water going down and sheds it coming up.
  Turns are driven by making the two sides unequal, the way a real turtle
  manoeuvres, rather than by rotating the whole body.
- A **herring school** is one cloud of individuals with separation, alignment
  and a shared fright response.
- A **hummingbird** (the one freshwater outlier) earns each drink: it commits
  to the cursor as a flower, hovers, and darts away.

The rest of the roster: blue shark, devil ray, dolphin, hammerhead, leafy
seadragon, lionfish, mola mola, moray, orca, ribbon eel, sailfish, sea spider,
stingray, whale shark.

## Try it locally

```bash
npm install
npm run dev
```

The demo is the tuning lab the creatures were built in. Every knob is live:
gait frequency, stroke amplitude, body proportions, particle size and glow,
plus the backdrop and biome picker. Ranges can be switched from a fixed value
to a min/max band that the value drifts between.

## Using the engine in your own project

The engine is framework-agnostic three.js; only the demo panel needs React.

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
| `src/components/motion/ocean/animals/` | the 18 species |
| `src/components/motion/ocean/biomes/` | five underwater biomes with their own flora |
| `src/components/motion/ocean/swim.ts` | the shared swimming model: drive, basis, roll, thrust |
| `src/components/motion/ocean/steering.ts` | invisible art direction: attract regions, UI repulsion |
| `src/components/motion/ocean/morph.ts` | scatter and reassemble between species |
| `src/components/motion/ocean/params.ts` | the knob vocabulary every species speaks |
| `src/components/motion/hero-uw-*.tsx` | backdrop layers: god rays, caustics, plankton, wreck |
| `src/demo/` | the tuning lab |

More detail in [docs/species.md](docs/species.md),
[docs/swimming.md](docs/swimming.md) and [docs/tuning.md](docs/tuning.md).

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
