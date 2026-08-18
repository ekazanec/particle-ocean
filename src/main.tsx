/*!
 * particle-ocean · https://github.com/ekazanec/particle-ocean
 * Copyright (c) 2026 Andrey Gurov · https://agurov.com
 * MIT licensed. If you ship something built on this, a link back is appreciated.
 */
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { OceanLabClient } from '@/demo/ocean-lab-client';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Every backdrop is lazily loaded (see hero-effects), so the tree needs
        one boundary; the ocean itself renders without waiting for it. */}
    <Suspense fallback={null}>
      <OceanLabClient />
    </Suspense>
  </StrictMode>,
);
