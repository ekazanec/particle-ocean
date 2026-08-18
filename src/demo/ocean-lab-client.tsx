/**
 * /lab/ocean — preview harness: pick any of the 16 animals, force a morph,
 * tune Depth (roam range toward/away from camera), Size, catch radius and
 * camera distance, preview it against any animal's background palette,
 * then Save.
 *
 * Panel layout: collapsible (header pill remembers its state in
 * localStorage) with three tabs — «Creature» (behavior / proportions / particles
 * + catch radius + Save), «Morph» (choreography variant + trigger),
 * «Scene» (Depth / Size / Camera — how the scene frames the creature, saved
 * per-animal — plus body density + bg preview). While the pointer hovers
 * the panel the creature parks mid-screen (parkAtCenter) so it stays
 * visible during tuning. Every control carries a one-line Russian
 * description as visible text, not a tooltip.
 *
 * Save POSTs to the dev-only ocean-config-server (:9902, `pnpm ocean:config`)
 * which writes ocean-hero.json; every consumer (Hero's 5-slide narrative,
 * this lab's own random mode, anything future) reads the same committed
 * JSON, so a saved+committed tuning applies everywhere automatically — but
 * ONLY once that JSON is committed and deployed. On the live production
 * site (static export, no server to POST to) Save can never write the file
 * directly: it falls back to showing the JSON on-screen (and best-effort
 * clipboard) so the value isn't silently lost, but someone still has to
 * paste it into ocean-hero.json and ship a deploy for it to take effect.
 */
import { useEffect, useState } from 'react';
import type { BodyRenderMode } from '@/components/motion/ocean/core';
import { BG_FLORA } from '@/components/motion/ocean/flora';
import { MORPH_VARIANTS, type MorphVariantId } from '@/components/motion/ocean/morph';
import { DEFAULT_DEPTH_RANGE, DEFAULT_SCALE, OceanHero } from '@/components/motion/ocean/ocean-hero';
import { APPEARANCE_KEYS, PROPORTION_KEYS } from '@/components/motion/ocean/params';
import type { OceanParamDef, OceanParamValue } from '@/components/motion/ocean/types';
import { HERO_EFFECTS, OCEAN_BG_GROUPS } from '@/components/motion/hero-effects';
import { ShaderHero } from '@/components/motion/shader-hero';
import oceanHeroCfg from '@/config/ocean-hero';
import { OCEAN_ANIMALS } from '@/components/motion/ocean/registry';

const SAVE_SERVER = 'http://localhost:9902/save-animal';
const SAVE_VARIANT_SERVER = 'http://localhost:9902/save-variant';

type PanelTab = 'animal' | 'morph' | 'scene';
const PANEL_TABS: { id: PanelTab; label: string }[] = [
  { id: 'animal', label: 'Creature' },
  { id: 'morph', label: 'Morph' },
  { id: 'scene', label: 'Scene' },
];
// localStorage keys — the panel's fold state and active tab survive reloads
const LS_COLLAPSED = 'oceanLab.panel.collapsed';
const LS_TAB = 'oceanLab.panel.tab';

/** One-line Russian helper text under a control — visible, not a tooltip. */
function Desc({ text }: { text: string }) {
  return <p className="mt-1 text-[0.625rem] leading-snug text-[color:var(--fg-subtle)]">{text}</p>;
}

function SliderRow({ label, value, display, min, max, step, onChange, desc, testid }: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  desc?: string;
  testid?: string;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-[color:var(--fg)]">
        <span>{label}</span>
        <span className="tabular-nums text-[color:var(--fg-subtle)]">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        data-testid={testid}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[color:var(--accent)]"
      />
      {desc ? <Desc text={desc} /> : null}
    </label>
  );
}

/** Value formatting: multipliers as «1.25×», hue as «+120°». */
function fmtVal(d: OceanParamDef, v: number): string {
  return d.unit === 'deg' ? `${v > 0 ? '+' : ''}${v.toFixed(0)}°` : `${v.toFixed(2)}×`;
}

/**
 * One schema-driven knob. Range-capable knobs (speed/turn) carry a
 * «Fixed | Range» toggle: fixed = one slider; range = min/max sliders and
 * the engine wanders the effective value between them (shown live).
 */
function ParamKnob({ d, value, eff, onChange }: {
  d: OceanParamDef;
  value: OceanParamValue;
  eff?: number;
  onChange: (v: OceanParamValue) => void;
}) {
  const isArr = Array.isArray(value);
  const modeBtn = (on: boolean) =>
    `px-1.5 py-0.5 text-[0.5625rem] uppercase tracking-wider transition-colors ${
      on ? 'bg-[color:var(--accent)] text-[color:var(--accent-fg)]' : 'text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]'
    }`;
  return (
    <div data-testid={`knob-${d.key}`}>
      {d.range && (
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[color:var(--fg)]">{d.label}</span>
          <div className="flex overflow-hidden rounded border border-[color:var(--border-strong)]">
            <button
              data-testid={`mode-fix-${d.key}`}
              className={modeBtn(!isArr)}
              onClick={() => { if (isArr) onChange(Number((((value[0] as number) + (value[1] as number)) / 2).toFixed(2))); }}
            >
              Fixed
            </button>
            <button
              data-testid={`mode-range-${d.key}`}
              className={modeBtn(isArr)}
              onClick={() => {
                if (isArr) return;
                const v = value as number;
                const spread = (d.max - d.min) * 0.25;
                onChange([
                  Number(Math.max(d.min, v - spread).toFixed(2)),
                  Number(Math.min(d.max, v + spread).toFixed(2)),
                ]);
              }}
            >
              Range
            </button>
          </div>
        </div>
      )}
      {isArr ? (
        <div className="space-y-1">
          <SliderRow
            label="min"
            value={value[0]}
            display={fmtVal(d, value[0])}
            min={d.min}
            max={d.max}
            step={d.step}
            testid={`bhv-${d.key}-min`}
            onChange={(nv) => onChange([nv, Math.max(nv, value[1])])}
          />
          <SliderRow
            label="max"
            value={value[1]}
            display={fmtVal(d, value[1])}
            min={d.min}
            max={d.max}
            step={d.step}
            testid={`bhv-${d.key}-max`}
            onChange={(nv) => onChange([Math.min(nv, value[0]), nv])}
          />
          <p className="tabular-nums text-[0.625rem] text-[color:var(--accent)]" data-testid={`eff-${d.key}`}>
            now: {eff !== undefined ? fmtVal(d, eff) : '—'}
          </p>
          <Desc text={`${d.desc}. The value drifts smoothly between min and max`} />
        </div>
      ) : (
        <SliderRow
          label={d.range ? 'value' : d.label}
          value={value}
          display={fmtVal(d, value)}
          min={d.min}
          max={d.max}
          step={d.step}
          testid={`bhv-${d.key}`}
          onChange={onChange}
          desc={d.desc}
        />
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function OceanLabClient() {
  const [forceId, setForceId] = useState<string | undefined>(undefined);
  const [morphSignal, setMorphSignal] = useState(0);
  const [current, setCurrent] = useState('');
  const [depthRange, setDepthRange] = useState(DEFAULT_DEPTH_RANGE);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  // null until the first animal reports in — the Hero then uses its own
  // saved/registry fallback instead of a wrong lab-default override
  const [catchR, setCatchR] = useState<number | null>(null);
  const [camZ, setCamZ] = useState<number | null>(null);
  // Behavior params («Behavior»): key → live value for the CURRENT animal,
  // resolved saved-config → schema default on every animal switch. null
  // until the first animal reports in (same contract as catchR/camZ).
  // A value can be `[min, max]` — range mode on range-capable knobs: the
  // engine wanders the effective multiplier smoothly inside the bounds.
  const [bhv, setBhv] = useState<Record<string, OceanParamValue> | null>(null);
  // Pointer over the tuning panel → the creature parks mid-screen (visible
  // while tweaking) instead of chasing a cursor hidden behind the panel.
  const [panelHover, setPanelHover] = useState(false);
  // Live effective values (window.__ocDbg.bp) — shown under range knobs so
  // the wandering multiplier is visible. Polled only while a range is active.
  const [liveEff, setLiveEff] = useState<Record<string, number>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'copied'>('idle');
  // Set only on the clipboard-fallback path (production / no config server).
  // Stays on screen until dismissed — unlike the transient button label,
  // this is the one place the value is actually recoverable if the fallback
  // fires, so it must not auto-vanish after a timeout.
  const [fallbackJson, setFallbackJson] = useState<string | null>(null);
  // 'auto' = the shown animal's own registry palette (what Hero actually
  // does); an animal id previews THIS animal against ANOTHER animal's
  // palette, to check combinations before committing one in registry.ts;
  // 'fx:<id>' swaps the palette shader for one of the standalone effect
  // backgrounds (god rays, caustics, …) from the HERO_EFFECTS registry.
  const [bgId, setBgId] = useState<string>('auto');
  const bgEffect = bgId.startsWith('fx:')
    ? HERO_EFFECTS.find((f) => f.id === bgId.slice(3)) ?? null
    : null;
  const bgSourceId = bgId === 'auto' ? current : bgId;
  const bgPalette = bgEffect ? null : OCEAN_ANIMALS.find((a) => a.id === bgSourceId)?.bg ?? null;
  // The five seafloor-biome backdrops bring matching IN-SCENE flora (real
  // depth-writing geometry inside the creature scene, occluding per depth) —
  // one selection activates both the 2D ambience layer and the geometry.
  // Each biome owns its motion character; there is no separate sway select.
  const sceneFlora = bgEffect ? BG_FLORA[bgEffect.id] ?? null : null;
  // Morph choreography preview (global, not per-animal). Initialized from
  // the committed config so the lab shows what production actually does.
  const [morphVariant, setMorphVariant] = useState<MorphVariantId>(oceanHeroCfg.morphVariant ?? 'legacy');
  // Body density preview (lab-only, no Save plumbing yet): how solid the
  // creature's particle body renders. 'glow' is the shipped additive look.
  const [bodyMode, setBodyMode] = useState<BodyRenderMode>('glow');
  // Panel chrome: fold state + active tab, persisted across reloads.
  // Defaults render first (SSR/prerender has no localStorage); the mount
  // effect below restores the remembered state — a lab tool tolerates the
  // one-frame flicker in exchange for zero hydration mismatch.
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<PanelTab>('animal');

  useEffect(() => {
    try {
      if (localStorage.getItem(LS_COLLAPSED) === '1') setCollapsed(true);
      const t = localStorage.getItem(LS_TAB);
      if (t === 'animal' || t === 'morph' || t === 'scene') setTab(t);
    } catch { /* storage blocked — defaults are fine */ }
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(LS_COLLAPSED, next ? '1' : '0'); } catch { /* ignore */ }
  }

  function pickTab(t: PanelTab) {
    setTab(t);
    try { localStorage.setItem(LS_TAB, t); } catch { /* ignore */ }
  }

  // Re-sync the sliders to the ACTIVE animal's saved tuning whenever it
  // changes (button pick, morph, or the initial random spawn) — otherwise a
  // slider dragged for one species would silently leak onto the next.
  // catchR/camZ resolve saved config → registry default, mirroring the
  // Hero's own fallback order.
  useEffect(() => {
    if (!current) return;
    const t = oceanHeroCfg.animals[current];
    const def = OCEAN_ANIMALS.find((a) => a.id === current);
    setDepthRange(t?.depthRange ?? DEFAULT_DEPTH_RANGE);
    setScale(t?.scale ?? DEFAULT_SCALE);
    setCatchR(t?.catchR ?? def?.catchR ?? 0.5);
    setCamZ(t?.camZ ?? def?.cam[2] ?? 8.5);
    // behavior sliders: saved value → schema default, per declared knob only
    // (saved value may be [min, max] for range-capable knobs)
    const next: Record<string, OceanParamValue> = {};
    for (const d of def?.params ?? []) next[d.key] = t?.params?.[d.key] ?? d.def;
    setBhv(next);
    // NOT resetting fallbackJson/saveState here: `current` also changes on
    // every automatic morph (not just a deliberate animal pick), which would
    // otherwise wipe the fallback panel moments after Save shows it — the
    // exact race that made a saved value vanish unseen. It's dismissed only
    // by its own close button, or superseded by the next Save.
  }, [current]);

  const paramDefs = OCEAN_ANIMALS.find((a) => a.id === current)?.params ?? [];
  // Panel sections: behavior vs «Proportions» vs «Particles» (appearance)
  const behaviorDefs = paramDefs.filter((d) => !APPEARANCE_KEYS.has(d.key) && !PROPORTION_KEYS.has(d.key));
  const proportionDefs = paramDefs.filter((d) => PROPORTION_KEYS.has(d.key));
  const appearanceDefs = paramDefs.filter((d) => APPEARANCE_KEYS.has(d.key));
  const hasRange = !!bhv && Object.values(bhv).some((v) => Array.isArray(v));

  // Poll the engine's effective params while any range knob is active — the
  // wandering multiplier is displayed live under the min/max sliders.
  useEffect(() => {
    if (!hasRange) return;
    const id = setInterval(() => {
      const bp = (window as unknown as { __ocDbg?: { bp?: Record<string, number> } }).__ocDbg?.bp;
      if (bp) setLiveEff({ ...bp });
    }, 300);
    return () => clearInterval(id);
  }, [hasRange]);

  async function save() {
    // Behavior params: persist ONLY non-default values, but always send the
    // `params` key — the server replaces the set wholesale, so a knob
    // returned to its default is also CLEARED from ocean-hero.json.
    // Range values ([min, max]) are always non-default by definition.
    const bhvSave: Record<string, OceanParamValue> = {};
    if (bhv) for (const d of paramDefs) {
      const v = bhv[d.key];
      if (typeof v === 'number' && v !== d.def) bhvSave[d.key] = v;
      else if (Array.isArray(v)) bhvSave[d.key] = v;
    }
    const cfg = {
      depthRange,
      scale,
      ...(catchR !== null ? { catchR } : {}),
      ...(camZ !== null ? { camZ } : {}),
      ...(bhv !== null ? { params: bhvSave } : {}),
    };
    let savedToServer = false;
    try {
      const res = await fetch(SAVE_SERVER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ animalId: current, cfg }),
      });
      savedToServer = res.ok;
    } catch { /* server not running — fall through to on-screen JSON */ }

    if (savedToServer) {
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
    } else {
      const json = JSON.stringify({ [current]: cfg }, null, 2);
      try {
        await navigator.clipboard.writeText(json);
      } catch { /* clipboard unavailable — the on-screen text is the fallback */ }
      setSaveState('copied');
      setFallbackJson(json);
    }
  }

  // Same save flow as depth/scale, but for the GLOBAL morphVariant field:
  // dev config server first, on-screen JSON + clipboard as the fallback.
  async function saveVariant() {
    let savedToServer = false;
    try {
      const res = await fetch(SAVE_VARIANT_SERVER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ morphVariant }),
      });
      savedToServer = res.ok;
    } catch { /* server not running — fall through to on-screen JSON */ }

    if (savedToServer) {
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
    } else {
      const json = JSON.stringify({ morphVariant }, null, 2);
      try {
        await navigator.clipboard.writeText(json);
      } catch { /* clipboard unavailable — the on-screen text is the fallback */ }
      setSaveState('copied');
      setFallbackJson(json);
    }
  }

  const currentLabel = OCEAN_ANIMALS.find((a) => a.id === current)?.label ?? current;

  return (
    <div className="fixed inset-0 z-[999] bg-[#07090f]">
      <div className="pointer-events-none absolute inset-0">
        {bgEffect ? (
          // key forces a clean remount (and WebGL teardown) per effect
          // switch; palette-adaptive effects (uw-kelp) follow the CURRENT
          // animal's registry palette live, like ShaderHero's «Auto» mode
          <bgEffect.Comp
            key={bgEffect.id}
            palette={OCEAN_ANIMALS.find((a) => a.id === current)?.bg ?? null}
          />
        ) : (
          <ShaderHero palette={bgPalette} />
        )}
      </div>
      <div className="pointer-events-auto absolute inset-0">
        <OceanHero
          forceId={forceId}
          morphSignal={morphSignal}
          onAnimalChange={setCurrent}
          liveDepthRange={depthRange}
          liveScale={scale}
          liveCatchR={catchR ?? undefined}
          liveCamZ={camZ ?? undefined}
          liveParams={bhv ?? undefined}
          liveMorphVariant={morphVariant}
          liveBodyMode={bodyMode}
          sceneFlora={sceneFlora}
          parkAtCenter={panelHover}
          disableAutoMorph
        />
      </div>

      {/* Chip row must never wrap under the right-side tuning panel (equal
          z-index, panel later in DOM → panel paints on top and swallowed the
          old «Morph →» chip's clicks): reserve the panel's 16rem + margins
          even while it's collapsed to a pill, so toggling never reflows. */}
      <div className="absolute left-4 top-4 z-10 flex max-w-[calc(100vw-21rem)] flex-wrap gap-1.5">
        {OCEAN_ANIMALS.map((a) => (
          <button
            key={a.id}
            onClick={() => setForceId(a.id)}
            className={`rounded-full border px-3 py-1.5 font-mono text-[0.625rem] uppercase tracking-[0.1em] transition-colors ${
              current === a.id
                ? 'border-[color:var(--accent)] text-[color:var(--accent)]'
                : 'border-[color:var(--border-strong)] text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* tuning panel — collapsed: just the header pill */}
      {collapsed ? (
        <button
          onClick={toggleCollapsed}
          onPointerEnter={() => setPanelHover(true)}
          onPointerLeave={() => setPanelHover(false)}
          aria-expanded={false}
          data-testid="panel-toggle"
          className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full border border-[color:var(--border-strong)] bg-black/55 px-3 py-1.5 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-[color:var(--fg-muted)] backdrop-blur transition-colors hover:text-[color:var(--fg)]"
        >
          <span>{currentLabel || '—'}</span>
          <Chevron open={false} />
        </button>
      ) : (
        <div
          onPointerEnter={() => setPanelHover(true)}
          onPointerLeave={() => setPanelHover(false)}
          data-testid="tuning-panel"
          // data-lenis-prevent: the site-wide Lenis wheel hijack swallows wheel
          // events (defaultPrevented) before the panel's native overflow scroll
          // ever sees them — programmatic scrollTop worked, real wheel didn't
          data-lenis-prevent
          className="absolute right-4 top-4 z-10 max-h-[calc(100vh-2rem)] w-64 overflow-y-auto overscroll-contain rounded-lg border border-[color:var(--border-strong)] bg-black/55 font-mono text-xs text-[color:var(--fg-muted)] backdrop-blur"
        >
          <button
            onClick={toggleCollapsed}
            aria-expanded
            data-testid="panel-toggle"
            className="flex w-full items-center justify-between px-3 py-2 text-left uppercase tracking-wider text-[color:var(--fg-subtle)] transition-colors hover:text-[color:var(--fg)]"
          >
            <span>{currentLabel || '—'}</span>
            <Chevron open />
          </button>

          <div className="space-y-3 border-t border-[color:var(--border)] p-3">
            {/* tabs */}
            <div className="flex gap-1" role="tablist">
              {PANEL_TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  data-testid={`tab-${t.id}`}
                  onClick={() => pickTab(t.id)}
                  className={`flex-1 rounded border px-1 py-1 text-[0.625rem] uppercase tracking-wider transition-colors ${
                    tab === t.id
                      ? 'border-[color:var(--accent)] text-[color:var(--accent)]'
                      : 'border-[color:var(--border-strong)] text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'animal' && (
              <div className="space-y-3">
                {/* Depth / Size / Camera live on the «Scene» tab; this one holds the
                    creature's own behavior. Catch radius is a trait of the animal. */}
                <SliderRow
                  label="Catch radius"
                  value={catchR ?? 0.5}
                  display={(catchR ?? 0.5).toFixed(2)}
                  min={0.2}
                  max={2}
                  step={0.05}
                  onChange={setCatchR}
                  desc="At what distance the creature counts as having caught the cursor, which starts the morph"
                />

                {/* behavior knobs — schema-driven, declared by the species
                    itself (animals/<id>.ts); multipliers of the authored
                    constants, 1x = the shipped behavior */}
                {behaviorDefs.length > 0 && bhv && (
                  <div className="space-y-3 border-t border-[color:var(--border)] pt-3">
                    <p className="uppercase tracking-wider text-[color:var(--fg-subtle)]">Behavior</p>
                    {behaviorDefs.map((d) => (
                      <ParamKnob
                        key={d.key}
                        d={d}
                        value={bhv[d.key] ?? d.def}
                        eff={liveEff[d.key]}
                        onChange={(v) => setBhv((prev) => ({ ...(prev ?? {}), [d.key]: v }))}
                      />
                    ))}
                  </div>
                )}

                {/* body proportions — local-frame stretch (length/width/thickness) */}
                {proportionDefs.length > 0 && bhv && (
                  <div className="space-y-3 border-t border-[color:var(--border)] pt-3">
                    <p className="uppercase tracking-wider text-[color:var(--fg-subtle)]">Proportions</p>
                    {proportionDefs.map((d) => (
                      <ParamKnob
                        key={d.key}
                        d={d}
                        value={bhv[d.key] ?? d.def}
                        onChange={(v) => setBhv((prev) => ({ ...(prev ?? {}), [d.key]: v }))}
                      />
                    ))}
                  </div>
                )}

                {/* particle appearance — size + hue/sat/brightness grade */}
                {appearanceDefs.length > 0 && bhv && (
                  <div className="space-y-3 border-t border-[color:var(--border)] pt-3">
                    <p className="uppercase tracking-wider text-[color:var(--fg-subtle)]">Particles</p>
                    {appearanceDefs.map((d) => (
                      <ParamKnob
                        key={d.key}
                        d={d}
                        value={bhv[d.key] ?? d.def}
                        onChange={(v) => setBhv((prev) => ({ ...(prev ?? {}), [d.key]: v }))}
                      />
                    ))}
                  </div>
                )}

                {paramDefs.length > 0 && bhv && (
                  <>
                    <button
                      onClick={() => {
                        const next: Record<string, OceanParamValue> = {};
                        for (const d of paramDefs) next[d.key] = d.def;
                        setBhv(next);
                      }}
                      data-testid="reset-behavior"
                      className="w-full rounded border border-[color:var(--border-strong)] px-2 py-1 text-[0.625rem] uppercase tracking-wider text-[color:var(--fg-muted)] transition-colors hover:text-[color:var(--fg)]"
                    >
                      Reset this species
                    </button>
                    <Desc text="Return every knob (behavior, proportions, particles) to the species defaults; ranges collapse to a fixed 1x" />
                  </>
                )}

                <button
                  onClick={save}
                  disabled={!current}
                  data-testid="save-animal"
                  className="w-full rounded bg-[color:var(--accent)] px-2 py-1.5 text-[0.6875rem] uppercase tracking-wider text-[color:var(--accent-fg)] disabled:opacity-40"
                >
                  {saveState === 'idle' ? 'Save' : saveState === 'saved' ? '✓ saved' : '✓ copied'}
                </button>
                <Desc text="Save this creature's settings into ocean-hero.json" />
              </div>
            )}

            {tab === 'morph' && (
              <div className="space-y-3">
                <label className="block">
                  <span className="flex items-center justify-between">
                    <span className="text-[color:var(--fg)]">Morph</span>
                    <button
                      onClick={saveVariant}
                      data-testid="save-variant"
                      className="rounded border border-[color:var(--border-strong)] px-2 py-0.5 text-[0.625rem] uppercase tracking-wider text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
                    >
                      {saveState === 'idle' ? 'Save' : saveState === 'saved' ? '✓ saved' : '✓ copied'}
                    </button>
                  </span>
                  <select
                    value={morphVariant}
                    onChange={(e) => setMorphVariant(e.target.value as MorphVariantId)}
                    className="mt-1 w-full rounded border border-[color:var(--border-strong)] bg-black/40 px-2 py-1.5 text-[0.6875rem] text-[color:var(--fg)]"
                  >
                    {MORPH_VARIANTS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <Desc text="Choreography of one creature turning into another, in place" />
                </label>
                <div>
                  <button
                    onClick={() => setMorphSignal((n) => n + 1)}
                    data-testid="morph-now"
                    className="w-full rounded bg-[var(--accent)] px-3 py-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-[color:var(--accent-fg)]"
                  >
                    Morph →
                  </button>
                  <Desc text="Run the morph now" />
                </div>
              </div>
            )}

            {tab === 'scene' && (
              <div className="space-y-3">
                {/* per-animal scene framing — relocated from «Creature»: this
                    is how the SCENE shows the creature, not its behavior.
                    Storage semantics unchanged: same per-animal keys in
                    ocean-hero.json, same Save. */}
                <SliderRow
                  label="Depth range"
                  value={depthRange}
                  display={depthRange.toFixed(2)}
                  min={1}
                  max={10}
                  step={0.1}
                  onChange={setDepthRange}
                  desc="How far the creature may swim toward the camera and away from it"
                />
                <SliderRow
                  label="Size"
                  value={scale}
                  display={`${scale.toFixed(2)}×`}
                  min={0.4}
                  max={2}
                  step={0.05}
                  onChange={setScale}
                  desc="Visual scale of the creature"
                />
                <SliderRow
                  label="Camera"
                  value={camZ ?? 8.5}
                  display={(camZ ?? 8.5).toFixed(1)}
                  min={4}
                  max={14}
                  step={0.1}
                  onChange={setCamZ}
                  desc="How far the camera sits from the scene for this species"
                />
                <button
                  onClick={save}
                  disabled={!current}
                  data-testid="save-animal-scene"
                  className="w-full rounded bg-[color:var(--accent)] px-2 py-1.5 text-[0.6875rem] uppercase tracking-wider text-[color:var(--accent-fg)] disabled:opacity-40"
                >
                  {saveState === 'idle' ? 'Save' : saveState === 'saved' ? '✓ saved' : '✓ copied'}
                </button>
                <Desc text="Saved per creature, into ocean-hero.json, alongside the Creature tab settings" />

                <label className="block border-t border-[color:var(--border)] pt-3">
                  <span className="text-[color:var(--fg)]">Body</span>
                  <select
                    value={bodyMode}
                    onChange={(e) => setBodyMode(e.target.value as BodyRenderMode)}
                    className="mt-1 w-full rounded border border-[color:var(--border-strong)] bg-black/40 px-2 py-1.5 text-[0.6875rem] text-[color:var(--fg)]"
                  >
                    <option value="glow">Glow (current)</option>
                    <option value="opaque">Opaque</option>
                    <option value="core-glow">Core plus halo</option>
                    <option value="spheres">Spheres</option>
                  </select>
                  <Desc text="Body density: glow, opaque, core plus halo, spheres. Preview only until saved" />
                </label>
                <label className="block">
                  <span className="text-[color:var(--fg)]">Background</span>
                  <select
                    value={bgId}
                    onChange={(e) => setBgId(e.target.value)}
                    className="mt-1 w-full rounded border border-[color:var(--border-strong)] bg-black/40 px-2 py-1.5 text-[0.6875rem] text-[color:var(--fg)]"
                  >
                    <option value="auto">Auto ({currentLabel || '—'})</option>
                    {OCEAN_BG_GROUPS.map((g) => (
                      <optgroup key={g.label} label={g.label}>
                        {g.effects.map((f) => (
                          <option key={f.id} value={`fx:${f.id}`}>
                            {f.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <optgroup label="Creature palettes">
                      {OCEAN_ANIMALS.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <Desc text="Backdrop: an effect, or another creature's palette. The five underwater biomes bring their own 3D flora into the scene; the biome drives its motion and the cursor does not touch it" />
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="absolute bottom-4 left-4 z-10 font-mono text-[0.6875rem] text-[color:var(--fg-subtle)]">
        {current} · the cursor is the target · catching it scatters this creature and assembles the next
      </p>

      {fallbackJson && (
        <div className="absolute inset-x-4 bottom-16 z-20 mx-auto max-w-lg space-y-2 rounded-lg border border-[color:var(--accent)]/60 bg-black/85 p-3 font-mono text-xs text-[color:var(--fg)] backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[color:var(--fg-subtle)]">
              The local save server is not running, which is always the case in this
              hosted demo (it is a static build). Nothing was written to a file.
              The same JSON is copied to your clipboard if the browser allowed it,
              and printed below so you can paste it into
              <code>src/config/ocean-hero.json</code> yourself.
            </p>
            <button
              onClick={() => {
                setFallbackJson(null);
                setSaveState('idle');
              }}
              aria-label="Close"
              className="shrink-0 rounded border border-[color:var(--border-strong)] px-2 py-1 text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
            >
              ✕
            </button>
          </div>
          <textarea
            readOnly
            value={fallbackJson}
            onFocus={(e) => e.currentTarget.select()}
            rows={4}
            className="w-full rounded border border-[color:var(--border-strong)] bg-black/60 p-2 text-[0.6875rem] text-[color:var(--accent)]"
          />
        </div>
      )}
    </div>
  );
}
