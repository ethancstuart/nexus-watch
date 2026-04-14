import './styles/main.css';
import { applyTheme } from './config/theme.ts';
import { applyDensity } from './config/density.ts';
import { Router } from './router.ts';

applyTheme();
applyDensity();

const router = new Router();
const appRoot = document.getElementById('app')!;

function showRouteError(root: HTMLElement, err: unknown) {
  root.textContent = '';
  const msg = document.createElement('div');
  msg.style.cssText = 'padding:2rem;text-align:center;color:#666;font-family:monospace';
  msg.textContent = 'Failed to load. Please refresh.';
  root.appendChild(msg);
  console.error('Route load error:', err);
}

router
  .on('/', () => {
    import('./pages/landing.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderLanding(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/intel', () => {
    import('./pages/nexuswatch.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderNexusWatch(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/app', () => {
    import('./pages/nexuswatch.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderNexusWatch(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/about', () => {
    import('./pages/casestudy.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderCaseStudy(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/roadmap', () => {
    import('./pages/roadmap.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderRoadmap(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/briefs', () => {
    import('./pages/briefs.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderBriefs(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/methodology', () => {
    import('./pages/methodology.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderMethodology(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/accuracy', () => {
    import('./pages/accuracy.ts')
      .then((m) => {
        appRoot.textContent = '';
        void m.renderAccuracyPage(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/settings', () => {
    import('./pages/settings.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderSettings(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/admin/social-queue', () => {
    import('./pages/socialQueue.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderSocialQueue(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/brief/:date', (params) => {
    import('./pages/briefs.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderBrief(appRoot, params?.date || '');
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .otherwise(() => router.navigate('/'))
  .start();
