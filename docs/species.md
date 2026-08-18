# The eighteen

Each species is its own file under
[`src/components/motion/ocean/animals/`](../src/components/motion/ocean/animals/).
What follows is what each one does that the others do not.

## Body-wave swimmers

| Species | The distinguishing motion |
| --- | --- |
| **Blue shark** | long scythe pectorals riding a lateral body wave |
| **Hammerhead** | the cephalofoil sweeps side to side on a search pattern, independent of the swimming wave |
| **Whale shark** | a slow heterocercal cruise, checker spots, and a filter mouth that opens on the strike |
| **Orca** | a vertical (cetacean) wave instead of a lateral one, with eye patch and saddle |
| **Dolphin** | the same vertical wave, plus a body bend into turns and a jaw that opens on the strike |
| **Sailfish** | the dorsal sail unfurls when it commits to a hunt, and the bill quivers on the strike |
| **Moray** | anguilliform curvature down the whole body, a jaw that opens and closes just to breathe, and a separate lunge |
| **Ribbon eel** | the same curvature at an amplitude nothing else would survive, with a yellow dorsal crest |

## Disc and wing swimmers

| Species | The distinguishing motion |
| --- | --- |
| **Devil ray** | flight rather than swimming: the wings beat, the cephalic fins change pose (funnel, spiral, ring), and the tail is a physics chain that follows |
| **Stingray** | rajiform undulation travelling around the margin of the disc while the disc itself stays flat, plus a barbed whip tail |
| **Mola mola** | no tail at all; it sculls with opposed dorsal and anal lobes and steers with the clavus |

## Their own integrators

| Species | The distinguishing motion |
| --- | --- |
| **Jellyfish** | swims by contracting the bell and coasting. Thrust comes from the contraction, so it is intrinsically pulsed, and the tentacles and oral arms trail on their own chains |
| **Sea turtle** | three-axis flippers: stroke, fore-and-aft sweep, and feathering about the flipper's own span. Turns come from making the two sides unequal. The rear pair sculls and rudders instead of hanging |
| **Sea spider** | metachronal rowing: eight legs with per-frame joints, each phase-lagged behind the last |


## Birds

One of the eighteen is not a fish, so it does not sit in a list of fish. It
lives in `animals/birds/` and the picker gives it its own row.

| Species | The distinguishing motion |
| --- | --- |
| **Hummingbird** | the only creature that has to earn something. It commits to the cursor as a flower, hovers on a shimmering wing fan, drinks for two to five seconds, then darts away |

## Crowds

| Species | The distinguishing motion |
| --- | --- |
| **Herring school** | 560 individuals as one creature, morphing between bait ball, torus, wave sheet, vortex funnel, figure-eight ribbon and hourglass. The cursor is a predator: the school parts around it and reforms behind |

## Camouflage

| Species | The distinguishing motion |
| --- | --- |
| **Leafy seadragon** | a curved seahorse spine that barely translates, with leaf appendages that sway on their own timing. It is the slowest thing here on purpose |
| **Lionfish** | hovers rather than swims; the venomous rays fan out and the pectorals do the work |

## Adding one

A species is a function `(world: WorldCtx) => OceanAnimal`. Build the particle
list once, return an object with `cloud`, `head`, `p` (its live parameters),
`update(cursor, dt, time)` and `dispose()`, then export a `*_PARAMS` array
describing its knobs and register it in
[`registry.ts`](../src/components/motion/ocean/registry.ts). Nothing else in
the engine needs to know it exists.
