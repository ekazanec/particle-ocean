# Tuning

Every knob in the demo is a **multiplier around 1.0** applied to a constant a
human chose while looking at the animal. That is deliberate: `1` is always
exactly the shipped look, the slider always scales a real term in a real
equation, and the vocabulary is the same for all 17 species.

The definitions live in
[`params.ts`](../src/components/motion/ocean/params.ts); each species declares
which ones it exposes plus its own.

## Shared across (almost) every species

| Key | Label | What it scales |
| --- | --- | --- |
| `speed` | Travel speed | thrust and the top-speed cap |
| `turn` | Turn rate | steering gain and the angular-velocity cap |
| `rhythm` | species-flavored | gait frequency: flap, pulse or body wave |
| `waveAmp` | Body wave amplitude | travelling-wave displacement, not its frequency |
| `bodyLen` `bodyWide` `bodyThick` | Proportions | the species' local particle frame, so the shape stretches with the body |
| `particleSize` `glow` `hue` `sat` `bright` | Particles | rendering, applied by the host rather than by the species |

`rhythm` and `waveAmp` are kept separate on purpose. Speeding a gait up and
bending a body further are different animals, and conflating them is how
swimming turns into vibrating.

## Species-specific knobs

Each species adds its own vocabulary next to the code that consumes it. The sea
turtle is a good example of how far that goes:

| Key | What it does |
| --- | --- |
| `flapAmp` | how far the flippers travel on each stroke |
| `sweepAmp` | how far a flipper reaches forward and pushes back, which turns a flat flap into a loop |
| `flipperTwist` | how much the blade twists edge-on through the stroke |
| `asym` | how much harder the outside flipper pulls in a turn, and how hard the inside one brakes |
| `rearLife` | sculling and steering with the rear pair; at zero they hang |

## Fixed values and ranges

Any knob can be switched from a single value to a min/max band. The value then
drifts smoothly between the two, which is how a creature avoids running at one
metronomic tempo for as long as it is on screen. A fixed slider at `1` and a
range of `1` to `1` are the same thing.

## Saving

The demo writes the current state as JSON. In the hosted build there is no
server behind it, so the JSON is copied to the clipboard and printed on screen
for you to paste into `src/config/ocean-hero.json`.
