/**
 * HERO_EFFECTS — the underwater backdrop registry. Each entry is a
 * fullscreen, pointer-events-none, reduced-motion-aware layer that sits
 * behind the creatures: god rays, water column, deep caustics, kelp, reef,
 * canyon, surface view, bubbles, plankton, abyss, vent, wreck.
 *
 * In the site this was extracted from the registry also held ~40 unrelated
 * hero templates; only the purpose-built underwater set travels with the
 * engine.
 */
import { lazy, type ComponentType } from 'react';

/**
 * Stand-in for next/dynamic: React.lazy with the Next option bag ignored.
 * Every backdrop touches WebGL on mount, so they are all loaded lazily and
 * the demo wraps them in a Suspense boundary.
 */
function dynamic<P extends object>(
  loader: () => Promise<ComponentType<P>>,
  _opts?: { ssr?: boolean },
): ComponentType<P> {
  return lazy(() => loader().then((C) => ({ default: C }))) as unknown as ComponentType<P>;
}
import type { ShaderHeroPalette } from '@/components/motion/shader-hero';

export type HeroEffect = {
  id: string;
  label: string;
  /**
   * `palette` — the active animal's registry bg (what ShaderHero receives
   * in «Auto» mode). Palette-adaptive backdrops (uw-kelp) use it; every
   * other effect simply ignores the extra optional prop.
   */
  Comp: ComponentType<{ className?: string; palette?: ShaderHeroPalette | null }>;
  /** fits the underwater ambience of /lab/ocean */
  water: boolean;
  /** purpose-built underwater background (hero-uw-* set) */
  uw?: boolean;
};

const uw = (
  id: string,
  label: string,
  Comp: ComponentType<{ className?: string }>,
): HeroEffect => ({ id, label, Comp, water: true, uw: true });

/* eslint-disable @typescript-eslint/promise-function-async */
export const HERO_EFFECTS: HeroEffect[] = [
  uw('uw-god-rays', 'God rays', dynamic(() => import('./hero-uw-god-rays').then((m) => m.HeroUwGodRays), { ssr: false })),
  uw('uw-surface', 'Surface view', dynamic(() => import('./hero-uw-surface').then((m) => m.HeroUwSurface), { ssr: false })),
  uw('uw-water-column', 'Water column · marine snow', dynamic(() => import('./hero-uw-water-column').then((m) => m.HeroUwWaterColumn), { ssr: false })),
  uw('uw-caustics-deep', 'Caustics · deep', dynamic(() => import('./hero-uw-caustics-deep').then((m) => m.HeroUwCausticsDeep), { ssr: false })),
  uw('uw-kelp', 'Kelp cathedral', dynamic(() => import('./hero-uw-kelp').then((m) => m.HeroUwKelp), { ssr: false })),
  uw('uw-seagrass', 'Eelgrass meadow', dynamic(() => import('./hero-uw-seagrass').then((m) => m.HeroUwSeagrass), { ssr: false })),
  uw('uw-gorgonia', 'Gorgonian garden', dynamic(() => import('./hero-uw-gorgonian').then((m) => m.HeroUwGorgonian), { ssr: false })),
  uw('uw-biolum-garden', 'Glowing garden', dynamic(() => import('./hero-uw-biolum-garden').then((m) => m.HeroUwBiolumGarden), { ssr: false })),
  uw('uw-rockreef', 'Rocky reef', dynamic(() => import('./hero-uw-rockreef').then((m) => m.HeroUwRockreef), { ssr: false })),
  uw('uw-reef', 'Coral reef', dynamic(() => import('./hero-uw-reef').then((m) => m.HeroUwReef), { ssr: false })),
  uw('uw-canyon', 'Rock canyon', dynamic(() => import('./hero-uw-canyon').then((m) => m.HeroUwCanyon), { ssr: false })),
  uw('uw-coral-canyon-art', 'Coral canyon (art)', dynamic(() => import('./hero-uw-coral-canyon-art').then((m) => m.HeroUwCoralCanyonArt), { ssr: false })),
  uw('uw-bubbles', 'Bubbles', dynamic(() => import('./hero-uw-bubbles').then((m) => m.HeroUwBubbles), { ssr: false })),
  uw('uw-plankton', 'Plankton · bioluminescence', dynamic(() => import('./hero-uw-plankton').then((m) => m.HeroUwPlankton), { ssr: false })),
  uw('uw-abyss', 'Abyss', dynamic(() => import('./hero-uw-abyss').then((m) => m.HeroUwAbyss), { ssr: false })),
  uw('uw-vent', 'Hydrothermal vent', dynamic(() => import('./hero-uw-vent').then((m) => m.HeroUwVent), { ssr: false })),
  uw('uw-wreck', 'Shipwreck', dynamic(() => import('./hero-uw-wreck').then((m) => m.HeroUwWreck), { ssr: false })),
];


/**
 * Optgroup structure for the /lab/ocean Background select: the purpose-built
 * underwater set first, then the kept water-reading effects. Non-water effects
 * are deliberately absent here (still available on the /hero-gallery pages).
 */
export type HeroEffectGroup = { label: string; effects: HeroEffect[] };

export const OCEAN_BG_GROUPS: HeroEffectGroup[] = [
  { label: 'Underwater', effects: HERO_EFFECTS.filter((f) => f.uw) },
  { label: 'Other effects', effects: HERO_EFFECTS.filter((f) => !f.uw && f.water) },
];
