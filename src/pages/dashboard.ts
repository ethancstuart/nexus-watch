import { App } from '../App.ts';
import { createAIBar, registerCommands } from '../ui/aiBar.ts';
import { createTicker } from '../ui/ticker.ts';
import { createSpaceBar } from '../ui/spaceBar.ts';
import { createLayout } from '../ui/layout.ts';
import { renderSpace } from '../ui/widgetGrid.ts';
import { createPulseBar } from '../ui/pulseBar.ts';
import { initSettingsPanel } from '../ui/settingsPanel.ts';
import { initPredictionBanner } from '../ui/predictionBanner.ts';
import { initKeyboardShortcuts } from '../ui/keyboard.ts';
import { initBriefing } from '../ui/briefing.ts';
import { initOfflineIndicator } from '../ui/offlineIndicator.ts';
import { initInstallPrompt } from '../ui/installPrompt.ts';
import { initIntelligence, destroyIntelligence } from '../services/intelligence.ts';
import { autoPopulateInterests } from '../services/interests.ts';
import { interpretQuery } from '../services/aiShell.ts';
import { showAIOverlay } from '../ui/aiOverlay.ts';
import {
  getSpaces,
  getActiveSpace,
  setActiveSpace,
  addWidgetToSpace,
  removeWidgetFromSpace,
  createSpace as createNewSpace,
} from '../services/spaces.ts';
import { WeatherPanel } from '../panels/WeatherPanel.ts';
import { StocksPanel } from '../panels/StocksPanel.ts';
import { NewsPanel } from '../panels/NewsPanel.ts';
import { SportsPanel } from '../panels/SportsPanel.ts';
import { CryptoPanel } from '../panels/CryptoPanel.ts';
import { ChatPanel } from '../panels/ChatPanel.ts';
import { NotesPanel } from '../panels/NotesPanel.ts';
import { CalendarPanel } from '../panels/CalendarPanel.ts';
import { EntertainmentPanel } from '../panels/EntertainmentPanel.ts';
import { GlobePanel } from '../panels/GlobePanel.ts';
import { HackerNewsPanel } from '../panels/HackerNewsPanel.ts';
import { GitHubPanel } from '../panels/GitHubPanel.ts';
import { SpotifyPanel } from '../panels/SpotifyPanel.ts';
import { showWelcome } from '../ui/welcome.ts';
import { isOnboardingComplete, showOnboarding } from '../ui/onboarding.ts';
import { checkSession } from '../services/auth.ts';
import { initPrefsSync } from '../services/prefsSync.ts';
import { applyTheme } from '../config/theme.ts';
import { applyDensity } from '../config/density.ts';
import { cycleTheme } from '../config/theme.ts';
import { openAlertsModal } from '../ui/alertsModal.ts';
import { exportConfig, importConfig } from '../services/configSync.ts';
import type { ThemeName } from '../config/themes.ts';
import type { DensityMode } from '../config/density.ts';
import type { Panel } from '../panels/Panel.ts';
import type { WidgetSize } from '../types/index.ts';

let dashboardAbort: AbortController | null = null;

export async function renderDashboard(root: HTMLElement): Promise<void> {
  if (dashboardAbort) dashboardAbort.abort();
  dashboardAbort = new AbortController();
  const signal = dashboardAbort.signal;

  root.textContent = '';

  // Auth gate — require login
  const sessionUser = await checkSession();
  if (!sessionUser) {
    // Redirect to landing page for login
    window.location.hash = '#/';
    return;
  }

  // Show onboarding for first-time visitors
  if (!isOnboardingComplete()) {
    await showOnboarding();
  }

  // Handle post-checkout upgrade
  if (window.location.hash.includes('upgraded=true')) {
    await checkSession(); // Re-fetch session to get updated tier
    const cleanHash = window.location.hash.replace(/[?&]upgraded=true/, '');
    history.replaceState(null, '', cleanHash || '#/app');
    // Show success toast after layout renders
    requestAnimationFrame(() => showAIOverlay('Welcome to Premium! All features unlocked.'));
  }

  await initPrefsSync();
  await showWelcome(sessionUser.name);

  const app = new App();

  // Register all panels
  const newsPanel = new NewsPanel();
  app.registerPanel(new WeatherPanel());
  app.registerPanel(new StocksPanel());
  app.registerPanel(newsPanel);
  app.registerPanel(new GlobePanel());
  app.registerPanel(new SportsPanel());
  app.registerPanel(new CryptoPanel());
  app.registerPanel(new ChatPanel());
  app.registerPanel(new CalendarPanel());
  app.registerPanel(new EntertainmentPanel());
  app.registerPanel(new NotesPanel());
  app.registerPanel(new HackerNewsPanel());
  app.registerPanel(new GitHubPanel());
  app.registerPanel(new SpotifyPanel());

  // Build panel map for quick lookup
  const panelMap = new Map<string, Panel>();
  for (const p of app.getPanels()) {
    panelMap.set(p.id, p);
  }

  // Create layout
  const layout = createLayout();

  // Track which panels have had their data cycle started
  const initializedPanels = new Set<string>();

  // Function to render active space
  function renderActiveSpace() {
    const spaces = getSpaces();
    const activeId = getActiveSpace();
    const space = spaces.find((s) => s.id === activeId) || spaces[0];
    if (!space) return;

    const visiblePanelIds = new Set(space.widgets.map((w) => w.panelId));

    // Detach all panels first
    for (const p of app.getPanels()) {
      if (p.container.parentElement) {
        p.container.remove();
      }
      // Stop data cycles for panels not in the active space
      if (!visiblePanelIds.has(p.id) && p.enabled) {
        p.stopDataCycle();
      }
    }

    renderSpace(layout.spaceContent, space, panelMap);

    // Start data cycles only for visible panels
    for (const wid of visiblePanelIds) {
      const panel = panelMap.get(wid);
      if (panel && panel.enabled && !initializedPanels.has(wid)) {
        initializedPanels.add(wid);
        void panel.startDataCycle();
      } else if (panel && panel.enabled) {
        panel.resumeDataCycle();
      }
    }
  }

  // AI Bar (commands registered after app.init)
  const aiBar = createAIBar(
    {
      onCommand: (cmd) => {
        executeSlashCommand(cmd, app, renderActiveSpace);
      },
      onAIQuery: async (query) => {
        try {
          showAIOverlay('Thinking...', undefined);
          const result = await interpretQuery(query);
          executeAIAction(result, renderActiveSpace);
        } catch {
          showAIOverlay('Something went wrong. Please try again.');
        }
      },
    },
    signal,
  );

  // Space Bar
  const spaceBar = createSpaceBar({
    onSpaceChange: () => {
      renderActiveSpace();
    },
  });

  // Pulse Bar
  const pulseBar = createPulseBar();

  // Ticker strip
  const ticker = createTicker();

  // Intel Map link
  const intelLink = document.createElement('a');
  intelLink.href = '#/intel';
  intelLink.className = 'dashboard-intel-link';
  intelLink.textContent = 'Intel Map';
  intelLink.title = 'Open geopolitical intelligence map';

  // Assemble page
  root.appendChild(aiBar);
  root.appendChild(ticker);
  root.appendChild(spaceBar);
  spaceBar.appendChild(intelLink);
  root.appendChild(layout.root);
  layout.pulseBarSlot.appendChild(pulseBar);
  root.appendChild(layout.pulseBarSlot);

  // Initialize panels (attach + fetch data)
  // First attach all panels to a hidden container, then renderActiveSpace will move visible ones
  const hiddenContainer = document.createElement('div');
  hiddenContainer.style.display = 'none';
  root.appendChild(hiddenContainer);
  app.panelGridContainer = hiddenContainer;

  // Start intelligence listener BEFORE panels fetch so we capture initial data events
  initIntelligence(signal);

  await app.init();

  // Mark all enabled panels as initialized — app.init() already started their data cycles
  for (const p of app.getPanels()) {
    if (p.enabled) initializedPanels.add(p.id);
  }

  // Build command registry AFTER app.init so panels are available
  const commands = buildCommands(app, renderActiveSpace);
  registerCommands(commands);

  // Now render the active space (moves visible panels into the grid)
  renderActiveSpace();

  // Initialize subsystems
  initSettingsPanel(app, signal);
  initPredictionBanner(layout.predictionBanner);
  initKeyboardShortcuts(app, signal);
  initBriefing(app);
  initOfflineIndicator();
  initInstallPrompt(aiBar);
  autoPopulateInterests();

  // Re-render when spaces change (settings toggles, AI actions, size changes)
  document.addEventListener(
    'dashview:spaces-changed',
    () => {
      renderActiveSpace();
    },
    { signal },
  );

  // Re-apply theme/density and re-render layout when prefs arrive from another device
  document.addEventListener(
    'dashview:prefs-synced',
    () => {
      applyTheme();
      applyDensity();
      renderActiveSpace();
    },
    { signal },
  );

  // Cleanup intelligence on SPA navigation away from dashboard
  window.addEventListener(
    'hashchange',
    () => {
      if (!window.location.hash.startsWith('#/dashboard')) {
        destroyIntelligence();
        dashboardAbort?.abort();
        dashboardAbort = null;
      }
    },
    { signal },
  );
}

function executeSlashCommand(cmd: string, app: App, rerender: () => void): void {
  const parts = cmd.slice(1).trim().split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const args = parts.slice(1).join(' ');

  switch (command) {
    case 'theme':
      if (['dark', 'light', 'oled'].includes(args)) {
        applyTheme(args as ThemeName);
        showAIOverlay(`Theme set to ${args}`);
      } else {
        cycleTheme();
        showAIOverlay('Theme cycled');
      }
      break;
    case 'density':
      if (['compact', 'comfortable', 'spacious'].includes(args)) {
        applyDensity(args as DensityMode);
        showAIOverlay(`Density set to ${args}`);
      }
      break;
    case 'space':
      if (args) {
        const spaces = getSpaces();
        const match = spaces.find((s) => s.name.toLowerCase() === args.toLowerCase() || s.id === args);
        if (match) {
          setActiveSpace(match.id);
          rerender();
          showAIOverlay(`Switched to ${match.name}`);
        }
      }
      break;
    case 'add':
      if (args) {
        const activeId = getActiveSpace();
        addWidgetToSpace(activeId, args.toLowerCase(), 'medium');
        rerender();
        showAIOverlay(`Added ${args} widget`);
      }
      break;
    case 'remove':
      if (args) {
        const activeId = getActiveSpace();
        removeWidgetFromSpace(activeId, args.toLowerCase());
        rerender();
        showAIOverlay(`Removed ${args} widget`);
      }
      break;
    case 'refresh':
      for (const p of app.getPanels()) {
        if (p.enabled) void p.refresh();
      }
      showAIOverlay('Refreshing all panels');
      break;
    case 'briefing':
      document.dispatchEvent(new CustomEvent('dashview:briefing'));
      break;
    case 'alert':
    case 'alerts':
      openAlertsModal();
      break;
    case 'note': {
      const notesPanel = app.getPanel('notes');
      if (notesPanel) {
        notesPanel.container.scrollIntoView({ behavior: 'smooth' });
        requestAnimationFrame(() => {
          const input = notesPanel.container.querySelector('.notes-input') as HTMLTextAreaElement;
          if (input) {
            input.focus();
            if (args) {
              input.value = args;
            }
          }
        });
      }
      break;
    }
    case 'shortcuts':
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
      break;
    default: {
      // Panel-name aliases: /weather → /go-to-weather, etc.
      const panelAliases: Record<string, string> = {
        weather: 'weather',
        stocks: 'stocks',
        news: 'news',
        sports: 'sports',
        chat: 'chat',
        calendar: 'calendar',
        crypto: 'crypto',
        globe: 'globe',
        notes: 'notes',
        entertainment: 'entertainment',
        hackernews: 'hackernews',
        hn: 'hackernews',
        github: 'github',
        spotify: 'spotify',
      };
      if (command && panelAliases[command]) {
        const panel = app.getPanel(panelAliases[command]);
        if (panel) {
          if (!panel.enabled) app.togglePanel(panel.id, true);
          panel.container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          break;
        }
      }
      showAIOverlay(`Unknown command: /${command}`);
    }
  }
}

function executeAIAction(
  result: { action: string; params?: Record<string, unknown>; message: string },
  rerender: () => void,
): void {
  switch (result.action) {
    case 'navigate_space': {
      const spaceId = result.params?.spaceId as string;
      if (spaceId) {
        setActiveSpace(spaceId);
        rerender();
      }
      showAIOverlay(result.message, `Action: navigate_space`);
      break;
    }
    case 'add_widget': {
      const panelId = result.params?.panelId as string;
      const size = (result.params?.size as WidgetSize) || 'medium';
      if (panelId) {
        addWidgetToSpace(getActiveSpace(), panelId, size);
        rerender();
      }
      showAIOverlay(result.message, `Added ${panelId}`);
      break;
    }
    case 'remove_widget': {
      const panelId = result.params?.panelId as string;
      if (panelId) {
        removeWidgetFromSpace(getActiveSpace(), panelId);
        rerender();
      }
      showAIOverlay(result.message, `Removed ${panelId}`);
      break;
    }
    case 'create_space': {
      const name = result.params?.name as string;
      const icon = (result.params?.icon as string) || '\uD83D\uDCCB';
      const widgets = (result.params?.widgets as { panelId: string; size: string }[]) || [];
      if (name) {
        const space = createNewSpace(name, icon);
        for (const w of widgets) {
          addWidgetToSpace(space.id, w.panelId, (w.size as WidgetSize) || 'medium');
        }
        setActiveSpace(space.id);
        rerender();
        document.dispatchEvent(new CustomEvent('dashview:spaces-changed'));
      }
      showAIOverlay(result.message, `Created space: ${name}`);
      break;
    }
    case 'highlight': {
      const panelId = result.params?.panelId as string;
      if (panelId) {
        const el = document.querySelector(`.panel-card[data-panel-id="${panelId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          el.classList.add('pulse-highlight');
          setTimeout(() => el.classList.remove('pulse-highlight'), 1500);
        }
      }
      showAIOverlay(result.message);
      break;
    }
    default:
      showAIOverlay(result.message);
  }
}

function buildCommands(
  app: App,
  rerender: () => void,
): { id: string; title: string; keywords: string; action: () => void }[] {
  const cmds: { id: string; title: string; keywords: string; action: () => void }[] = [];

  // Panel navigation
  for (const panel of app.getPanels()) {
    cmds.push({
      id: `goto-${panel.id}`,
      title: `Go to ${panel.title}`,
      keywords: `panel ${panel.id} jump scroll`,
      action: () => {
        if (!panel.enabled) app.togglePanel(panel.id, true);
        panel.container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      },
    });
  }

  // Panel toggles
  for (const panel of app.getPanels()) {
    cmds.push({
      id: `toggle-${panel.id}`,
      title: `Toggle ${panel.title}`,
      keywords: `show hide enable disable ${panel.id}`,
      action: () => app.togglePanel(panel.id, !panel.enabled),
    });
  }

  // Theme
  for (const t of ['dark', 'light', 'oled'] as ThemeName[]) {
    cmds.push({
      id: `theme-${t}`,
      title: `Theme: ${t}`,
      keywords: `theme ${t} appearance`,
      action: () => applyTheme(t),
    });
  }
  cmds.push({ id: 'theme-cycle', title: 'Cycle theme', keywords: 'theme toggle next', action: () => cycleTheme() });

  // Density
  for (const d of ['compact', 'comfortable', 'spacious'] as DensityMode[]) {
    cmds.push({
      id: `density-${d}`,
      title: `Density: ${d}`,
      keywords: `density ${d} spacing`,
      action: () => applyDensity(d),
    });
  }

  // Spaces
  for (const space of getSpaces()) {
    cmds.push({
      id: `space-${space.id}`,
      title: `Space: ${space.icon} ${space.name}`,
      keywords: `space switch ${space.name.toLowerCase()}`,
      action: () => {
        setActiveSpace(space.id);
        rerender();
        document.dispatchEvent(new CustomEvent('dashview:spaces-changed'));
      },
    });
  }

  // Actions
  cmds.push({
    id: 'refresh-all',
    title: 'Refresh all panels',
    keywords: 'reload update fetch',
    action: () => {
      for (const p of app.getPanels()) {
        if (p.enabled) void p.refresh();
      }
    },
  });

  cmds.push({
    id: 'daily-briefing',
    title: 'Daily briefing',
    keywords: 'briefing summary ai report',
    action: () => document.dispatchEvent(new CustomEvent('dashview:briefing')),
  });

  cmds.push({
    id: 'manage-alerts',
    title: 'Manage price alerts',
    keywords: 'alert notification price',
    action: () => openAlertsModal(),
  });

  cmds.push({
    id: 'open-settings',
    title: 'Open settings',
    keywords: 'settings gear preferences',
    action: () => document.dispatchEvent(new CustomEvent('dashview:open-settings')),
  });

  cmds.push({
    id: 'keyboard-shortcuts',
    title: 'Keyboard shortcuts',
    keywords: 'help keys hotkeys',
    action: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true })),
  });

  cmds.push({
    id: 'export-config',
    title: 'Export config',
    keywords: 'export download backup',
    action: () => exportConfig(),
  });

  cmds.push({
    id: 'import-config',
    title: 'Import config',
    keywords: 'import upload restore',
    action: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (file) await importConfig(file);
      });
      input.click();
    },
  });

  cmds.push({
    id: 'new-note',
    title: 'New note',
    keywords: 'note add create todo',
    action: () => {
      const notesPanel = app.getPanel('notes');
      if (notesPanel) {
        notesPanel.container.scrollIntoView({ behavior: 'smooth' });
        requestAnimationFrame(() => {
          const input = notesPanel.container.querySelector('.notes-input') as HTMLTextAreaElement;
          if (input) input.focus();
        });
      }
    },
  });

  cmds.push({
    id: 'share-dashboard',
    title: 'Share Dashboard',
    keywords: 'share link export send',
    action: () => {
      import('../ui/shareModal.ts').then((m) => m.openShareModal());
    },
  });

  return cmds;
}
