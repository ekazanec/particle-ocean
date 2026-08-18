/**
 * OpenWaterFooter — ambient background for <SiteFooter>: dark open water
 * (the same `attachWater` mote current used behind the hero) with the
 * herring school drifting slowly across the footer width — autonomous, NOT
 * cursor-driven, so it reads as ambient life rather than another
 * interactive creature demanding attention. Replaces the earlier sea-floor
 * scene (sand strip + patrolling sea spider).
 *
 * Positioning: the school's own flocking physics keeps the formation
 * centred near the world origin. The slow sweep across the wide footer
 * frustum is applied OUTSIDE the physics, as a scene-graph transform on
 * the school's Points object — the render-position override idiom from
 * [[Decisions/2026-07-20-particle-creature-position-pin-override]], here
 * in its cheapest form (no per-particle delta loop needed because the
 * whole formation moves as one).
 *
 * Cursor: the species' own predator-avoidance is reused as-is — the real
 * pointer is unprojected onto the z=0 plane (same CursorTarget idiom as
 * OceanHero) and then mapped INTO the school's local space by undoing the
 * drift translation and fit scale, so the flee radius lines up with the
 * rendered fish. Fish scatter fast (species' panic force), regroup
 * gradually (formation attraction) once the pointer leaves. The canvas
 * keeps pointer-events:none — tracking is a window listener, so footer
 * links above stay fully hoverable/clickable. Touch/coarse pointers get no
 * chase, same convention as OceanHero.
 *
 * Per the same decision note, every world-unit quantity is derived from
 * the frame geometry instead of hardcoded: the school is scaled to fit the
 * visible half-width, and the drift amplitude is whatever width remains
 * after the (scaled) formation — so nothing clips on narrow/mobile
 * viewports and the sweep still uses ultra-wide ones.
 *
 * Reduced motion: renders one static assembled frame (after a short
 * warm-up sim so the fish have converged into formation), no animation
 * loop — same convention as OceanHero.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { attachWater, CursorTarget, makeSprite, type WorldCtx } from '@/components/motion/ocean/core';
import { makeHerringSchool } from '@/components/motion/ocean/animals/herring-school';

const DRIFT_PERIOD = 34; // s for one full there-and-back sweep (sine, so turnarounds are gentle)
const DRIFT_MARGIN = 0.88; // fraction of the visible half-width the sweep may use
const SCHOOL_HALF_WIDTH = 3.0; // world units, widest formation extent (wave sheet ±2.6 + sway)
const MAX_SCALE = 0.8; // never render the school larger than this, even on ultra-wide

// Visible half-width of the camera frustum at z=0 (the school's plane),
// given the camera's own distance and vertical FOV.
function visibleHalfWidth(camera: THREE.PerspectiveCamera): number {
  const distance = camera.position.z;
  const visibleHeight = 2 * Math.tan((camera.fov * Math.PI) / 360) * distance;
  return (visibleHeight * camera.aspect) / 2;
}

export function OpenWaterFooter() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Decoration must never take down the page: WebGL may be unavailable
    // (GPU-blocklisted browsers, battery saver, headless) — bail to no scene.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // Fog matches the site's dark editorial background so far fish dissolve
    // into the page instead of a tinted volume — no warm/sandy cast.
    scene.fog = new THREE.FogExp2(0x050505, 0.045);
    const camera = new THREE.PerspectiveCamera(50, el.clientWidth / Math.max(1, el.clientHeight), 0.1, 100);
    camera.position.set(0, 0.2, 9);
    const world: WorldCtx = { scene, camera, sprite: makeSprite() };
    const water = attachWater(world);

    const school = makeHerringSchool(world);
    school.cloud.mat.opacity = 0.75;

    // The school's "predator": parked far below the frame (flee/panic never
    // fire) until the real pointer is over the footer, then it becomes the
    // unprojected cursor in school-local space.
    const PARKED = new THREE.Vector3(0, -60, 0);
    const predator = PARKED.clone();
    const cursor = new CursorTarget();
    let pointerIn = false;
    // Same convention as OceanHero: coarse pointers get no cursor chase.
    const isTouch = window.matchMedia('(pointer: coarse)').matches;

    let schoolScale = 1;
    let driftX = 0;
    function fitToFrame(): void {
      const half = visibleHalfWidth(camera);
      schoolScale = Math.min(MAX_SCALE, (half * 0.55) / SCHOOL_HALF_WIDTH);
      school.cloud.points.scale.setScalar(schoolScale);
      driftX = Math.max(0, half * DRIFT_MARGIN - SCHOOL_HALF_WIDTH * schoolScale);
    }
    fitToFrame();

    let raf = 0;
    let lastT = performance.now();
    let elapsed = 0;

    function drift(): void {
      const p = school.cloud.points.position;
      p.x = Math.sin((elapsed * Math.PI * 2) / DRIFT_PERIOD) * driftX;
      p.y = Math.sin(elapsed * 0.23) * 0.35; // faint vertical breathing
    }

    function startLoop(): void {
      if (raf) return;
      lastT = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function stopLoop(): void {
      cancelAnimationFrame(raf);
      raf = 0;
    }

    function frame(): void {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      elapsed += dt;

      if (pointerIn && cursor.hasMouse && schoolScale > 1e-4) {
        // World point on the z=0 plane → school-local space (undo the
        // drift translation + fit scale) so the flee radius matches what
        // is actually rendered under the pointer.
        const p = cursor.update(camera);
        predator.set(
          (p.x - school.cloud.points.position.x) / schoolScale,
          (p.y - school.cloud.points.position.y) / schoolScale,
          0,
        );
      } else {
        // Pointer gone: predator parked far away — panic decays and the
        // formation attraction regroups the school gradually.
        predator.copy(PARKED);
      }

      water.update(dt, elapsed);
      school.update(predator, dt, elapsed);
      drift();

      renderer.render(scene, camera);
    }

    const host = el;

    // The canvas is pointer-events:none (footer links must stay clickable),
    // so the pointer is tracked at the window level and mapped to NDC
    // relative to the scene's own box.
    function onPointerMove(e: PointerEvent): void {
      const rect = host.getBoundingClientRect();
      pointerIn =
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (pointerIn && rect.width > 0 && rect.height > 0) {
        cursor.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -(((e.clientY - rect.top) / rect.height) * 2 - 1),
        );
      }
    }
    function onPointerGone(): void {
      pointerIn = false;
    }
    if (!reduced && !isTouch) {
      addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerleave', onPointerGone);
      addEventListener('blur', onPointerGone);
    }

    function onResize(): void {
      const w = host.clientWidth, h = Math.max(1, host.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      fitToFrame();
    }
    addEventListener('resize', onResize);

    // Only run the loop while the footer is actually on screen — it sits far
    // down the page, so on load (and for most of the scroll) this stays
    // paused, and the Hero's own observer (ocean-hero.tsx) pauses ITS loop
    // once scrolled past. At most one of these two WebGL scenes is ever
    // rendering per frame (the reported scroll-lag fix — keep it that way).
    const io = new IntersectionObserver(
      ([entry]) => {
        if (reduced) return;
        if (entry.isIntersecting) startLoop();
        else stopLoop();
      },
      { rootMargin: '200px 0px' },
    );
    io.observe(host);

    if (reduced) {
      // Warm-up sim so the static frame shows an assembled formation, not
      // the random spawn scatter. ~8 simulated seconds at 30 Hz, one-time.
      for (let i = 0; i < 240; i++) school.update(predator, 1 / 30, i / 30);
      drift();
      renderer.render(scene, camera);
    } else {
      startLoop();
    }

    return () => {
      stopLoop();
      io.disconnect();
      removeEventListener('resize', onResize);
      removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerGone);
      removeEventListener('blur', onPointerGone);
      school.dispose();
      water.dispose();
      world.sprite.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} aria-hidden className="pointer-events-none absolute inset-0" />;
}
