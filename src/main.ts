import './styles/main.css';
import { applyTheme } from './config/theme.ts';
import { applyDensity } from './config/density.ts';
import { Router } from './router.ts';
import { registerCommandPalette } from './ui/commandPalette.ts';
import { registerPwaInstall } from './ui/pwaInstall.ts';

applyTheme();
applyDensity();
// Cmd+K / Ctrl+K opens the command palette from anywhere
registerCommandPalette();
// PWA install banner (shows on supported browsers after 15s)
registerPwaInstall();

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
  .on('/portfolio', () => {
    import('./pages/portfolio.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderPortfolioPage(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/pricing', () => {
    import('./pages/pricing.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderPricingPage(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/api', () => {
    import('./pages/apidocs.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderApiDocsPage(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/whats-new', () => {
    import('./pages/releaseNotes.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderReleaseNotes(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/status', () => {
    import('./pages/status.ts')
      .then((m) => {
        appRoot.textContent = '';
        void m.renderStatusPage(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/audit', () => {
    import('./pages/audit.ts')
      .then((m) => {
        appRoot.textContent = '';
        void m.renderAuditPage(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/audit/:country', (params) => {
    import('./pages/audit.ts')
      .then((m) => {
        appRoot.textContent = '';
        void m.renderAuditPage(appRoot, params?.country);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/compare', () => {
    import('./pages/compare.ts')
      .then((m) => {
        appRoot.textContent = '';
        void m.renderComparePage(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/entities', () => {
    import('./pages/entities.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderEntitiesPage(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/entities/:id', (params) => {
    import('./pages/entities.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderEntitiesPage(appRoot, params?.id);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/brief-country/:code', (params) => {
    import('./pages/countryBrief.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderCountryBrief(appRoot, params?.code || '');
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/watchlist', () => {
    import('./pages/watchlist.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderWatchlistPage(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/feed', () => {
    import('./pages/feed.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderFeedPage(appRoot);
      })
      .catch((err) => showRouteError(appRoot, err));
  })
  .on('/welcome', () => {
    import('./pages/welcome.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderWelcomePage(appRoot);
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
  .on('/admin/marketing', () => {
    import('./pages/adminMarketing.ts')
      .then((m) => {
        appRoot.textContent = '';
        m.renderAdminMarketing(appRoot);
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
