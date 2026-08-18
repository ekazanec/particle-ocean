/**
 * Ocean animal registry — all 18 creatures, each with its prototype camera
 * tuning and a ShaderHero background palette derived from the prototype's
 * scene colors (bg → c0/c1, dominant body hue → c2, glow hue → accent).
 */
import { BLUE_SHARK_PARAMS, makeBlueShark } from '@/components/motion/ocean/animals/blue-shark';
import { DEVIL_RAY_PARAMS, makeDevilRay } from '@/components/motion/ocean/animals/devil-ray';
import { DOLPHIN_PARAMS, makeDolphin } from '@/components/motion/ocean/animals/dolphin';
import { HAMMERHEAD_PARAMS, makeHammerhead } from '@/components/motion/ocean/animals/hammerhead';
import { HERRING_SCHOOL_PARAMS, makeHerringSchool } from '@/components/motion/ocean/animals/herring-school';
import { HUMMINGBIRD_PARAMS, makeHummingbird } from '@/components/motion/ocean/animals/hummingbird';
import { JELLYFISH_PARAMS, makeJellyfish } from '@/components/motion/ocean/animals/jellyfish';
import { LEAFY_SEADRAGON_PARAMS, makeLeafySeadragon } from '@/components/motion/ocean/animals/leafy-seadragon';
import { LIONFISH_PARAMS, makeLionfish } from '@/components/motion/ocean/animals/lionfish';
import { MOLA_MOLA_PARAMS, makeMolaMola } from '@/components/motion/ocean/animals/mola-mola';
import { MORAY_PARAMS, makeMoray } from '@/components/motion/ocean/animals/moray';
import { ORCA_PARAMS, makeOrca } from '@/components/motion/ocean/animals/orca';
import { RIBBON_EEL_PARAMS, makeRibbonEel } from '@/components/motion/ocean/animals/ribbon-eel';
import { SAILFISH_PARAMS, makeSailfish } from '@/components/motion/ocean/animals/sailfish';
import { SEA_SPIDER_PARAMS, makeSeaSpider } from '@/components/motion/ocean/animals/sea-spider';
import { SEA_TURTLE_PARAMS, makeSeaTurtle } from '@/components/motion/ocean/animals/sea-turtle';
import { STINGRAY_PARAMS, makeStingray } from '@/components/motion/ocean/animals/stingray';
import { WHALE_SHARK_PARAMS, makeWhaleShark } from '@/components/motion/ocean/animals/whale-shark';
import type { OceanAnimalDef } from '@/components/motion/ocean/types';

const rgb = (hex: number): [number, number, number] => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];

export const OCEAN_ANIMALS: OceanAnimalDef[] = [
  { id: 'jellyfish', label: 'Jellyfish', make: makeJellyfish, params: JELLYFISH_PARAMS, cam: [0, 0.4, 8.5], morph: 'catch', catchR: 1.0,
    bg: { c0: rgb(0x0a0814), c1: rgb(0x171030), c2: rgb(0x2e2060), accent: rgb(0xb9a4f5) } },
  { id: 'devil-ray', label: 'Devil ray', make: makeDevilRay, params: DEVIL_RAY_PARAMS, cam: [0, 0.8, 9], morph: 'catch', catchR: 0.55,
    bg: { c0: rgb(0x060a12), c1: rgb(0x0a1424), c2: rgb(0x14264a), accent: rgb(0x57d8e8) } },
  { id: 'stingray', label: 'Stingray', make: makeStingray, params: STINGRAY_PARAMS, cam: [0, 0.7, 8.5], morph: 'catch', catchR: 0.6,
    bg: { c0: rgb(0x070a0c), c1: rgb(0x100e08), c2: rgb(0x2a2210), accent: rgb(0x3fc8f0) } },
  { id: 'lionfish', label: 'Lionfish', make: makeLionfish, params: LIONFISH_PARAMS, cam: [0, 0.5, 7.5], morph: 'catch', catchR: 0.75,
    bg: { c0: rgb(0x08090f), c1: rgb(0x160d0c), c2: rgb(0x341410), accent: rgb(0xd0452e) } },
  { id: 'moray', label: 'Moray', make: makeMoray, params: MORAY_PARAMS, cam: [0, 0.6, 8.5], morph: 'catch', catchR: 0.55,
    bg: { c0: rgb(0x060b0c), c1: rgb(0x0b1410), c2: rgb(0x1c2a16), accent: rgb(0x4fc9a8) } },
  { id: 'sea-spider', label: 'Sea spider', make: makeSeaSpider, params: SEA_SPIDER_PARAMS, cam: [0, 0.7, 7.5], morph: 'catch', catchR: 0.5,
    bg: { c0: rgb(0x070b10), c1: rgb(0x120c08), c2: rgb(0x2c1408), accent: rgb(0xffd9a0) } },
  { id: 'sea-turtle', label: 'Sea turtle', make: makeSeaTurtle, params: SEA_TURTLE_PARAMS, cam: [0, 0.9, 8], morph: 'catch', catchR: 0.75,
    bg: { c0: rgb(0x071018), c1: rgb(0x0e1410), c2: rgb(0x2a2410), accent: rgb(0x9fe8d8) } },
  { id: 'sailfish', label: 'Sailfish', make: makeSailfish, params: SAILFISH_PARAMS, cam: [0, 0.6, 9.5], morph: 'catch', catchR: 0.6,
    bg: { c0: rgb(0x050d1e), c1: rgb(0x081430), c2: rgb(0x10225c), accent: rgb(0x6fa8e8) } },
  { id: 'dolphin', label: 'Dolphin', make: makeDolphin, params: DOLPHIN_PARAMS, cam: [0, 0.7, 8], morph: 'catch', catchR: 0.55,
    bg: { c0: rgb(0x071120), c1: rgb(0x0c1826), c2: rgb(0x22303e), accent: rgb(0x93a5b5) } },
  { id: 'ribbon-eel', label: 'Ribbon eel', make: makeRibbonEel, params: RIBBON_EEL_PARAMS, cam: [0, 0.5, 7.5], morph: 'catch', catchR: 0.5,
    bg: { c0: rgb(0x06101a), c1: rgb(0x081a30), c2: rgb(0x102a60), accent: rgb(0xf0d43c) } },
  { id: 'mola-mola', label: 'Mola mola', make: makeMolaMola, params: MOLA_MOLA_PARAMS, cam: [0, 0.7, 9], morph: 'catch', catchR: 0.6,
    bg: { c0: rgb(0x0a1016), c1: rgb(0x10161c), c2: rgb(0x222c34), accent: rgb(0xb9c1c9) } },
  { id: 'whale-shark', label: 'Whale shark', make: makeWhaleShark, params: WHALE_SHARK_PARAMS, cam: [0, 0.9, 10.5], morph: 'catch', catchR: 0.7,
    bg: { c0: rgb(0x05121a), c1: rgb(0x0a1c26), c2: rgb(0x16303c), accent: rgb(0xe8e4c8) } },
  { id: 'blue-shark', label: 'Blue shark', make: makeBlueShark, params: BLUE_SHARK_PARAMS, cam: [0, 0.6, 8.5], morph: 'catch', catchR: 0.55,
    bg: { c0: rgb(0x060c1c), c1: rgb(0x0a1430), c2: rgb(0x142464), accent: rgb(0x9fb4d8) } },
  { id: 'hammerhead', label: 'Hammerhead', make: makeHammerhead, params: HAMMERHEAD_PARAMS, cam: [0, 0.7, 9], morph: 'catch', catchR: 0.55,
    bg: { c0: rgb(0x081018), c1: rgb(0x0e1820), c2: rgb(0x1e2c38), accent: rgb(0xfff2c8) } },
  { id: 'orca', label: 'Orca', make: makeOrca, params: ORCA_PARAMS, cam: [0, 0.8, 9.5], morph: 'catch', catchR: 0.65,
    bg: { c0: rgb(0x060a14), c1: rgb(0x0a0e1a), c2: rgb(0x18202e), accent: rgb(0xdde6ee) } },
  { id: 'leafy-seadragon', label: 'Leafy seadragon', make: makeLeafySeadragon, params: LEAFY_SEADRAGON_PARAMS, cam: [0, 0.4, 6], morph: 'catch', catchR: 0.4,
    bg: { c0: rgb(0x0a1410), c1: rgb(0x101a10), c2: rgb(0x2a3018), accent: rgb(0xcfd76a) } },
  { id: 'herring-school', label: 'Herring school', make: makeHerringSchool, params: HERRING_SCHOOL_PARAMS, cam: [0, 0.3, 10], morph: 'timer',
    bg: { c0: rgb(0x071120), c1: rgb(0x0b1a30), c2: rgb(0x1c3452), accent: rgb(0xcfe0ee) } },
  // deliberate whimsy: a hummingbird "flying" through the ocean — dawn-warm
  // palette (deep teal night → warm amber glow) against the dark editorial bg.
  // catchR 0.3 < bill reach (~0.49): sipping nectar at the cursor never
  // triggers the morph — only the deep-sip lunge after a COMPLETED drink
  // plunges the head inside catchR (full drink = the catch, by design).
  { id: 'hummingbird', label: 'Hummingbird', make: makeHummingbird, params: HUMMINGBIRD_PARAMS, cam: [0, 0.3, 6], morph: 'catch', catchR: 0.3,
    bg: { c0: rgb(0x0a0d12), c1: rgb(0x0d1a1c), c2: rgb(0x382812), accent: rgb(0xf5b168) } },
];
