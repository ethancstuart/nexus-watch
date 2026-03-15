import { fetchWithRetry } from '../utils/fetch.ts';
import { getSpaces, getActiveSpace } from './spaces.ts';
import { getPanelData } from './intelligence.ts';
import type { WeatherData, StocksData, CryptoData, SportsData, NewsData } from '../types/index.ts';

export interface AIAction {
  action: 'navigate_space' | 'add_widget' | 'remove_widget' | 'create_space' | 'answer' | 'highlight';
  params?: Record<string, unknown>;
  message: string;
}

interface AIShellResponse {
  action: string;
  params?: Record<string, unknown>;
  message: string;
}

function summarizePanelData(): string {
  const data = getPanelData();
  const parts: string[] = [];

  const weather = data.get('weather') as WeatherData | undefined;
  if (weather?.current) {
    const c = weather.current;
    let summary = `Weather (${weather.name}): ${Math.round(c.temp)}° ${c.condition}, feels like ${Math.round(c.feelsLike)}°, high ${Math.round(c.high)}° low ${Math.round(c.low)}°, humidity ${c.humidity}%, wind ${Math.round(c.windSpeed)} mph`;
    if (weather.forecast?.length) {
      const fcast = weather.forecast.map((f) => `${f.day}: ${Math.round(f.high)}°/${Math.round(f.low)}°`).join(', ');
      summary += `\nForecast: ${fcast}`;
    }
    parts.push(summary);
  }

  const stocks = data.get('stocks') as StocksData | undefined;
  if (stocks?.watchlist?.length) {
    const lines = stocks.watchlist
      .slice(0, 10)
      .map(
        (q) => `${q.symbol}: $${q.price.toFixed(2)} (${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%)`,
      )
      .join(', ');
    parts.push(`Stocks: ${lines}`);
  }

  const crypto = data.get('crypto') as CryptoData | undefined;
  if (crypto?.coins?.length) {
    const lines = crypto.coins
      .slice(0, 8)
      .map(
        (c) =>
          `${c.symbol.toUpperCase()}: $${c.price.toLocaleString()} (${c.change24h >= 0 ? '+' : ''}${c.change24h.toFixed(1)}%)`,
      )
      .join(', ');
    parts.push(`Crypto: ${lines}`);
  }

  const sports = data.get('sports') as SportsData | undefined;
  if (sports?.games?.length) {
    const lines = sports.games.slice(0, 5).map((g) => {
      if (g.status === 'in_progress')
        return `LIVE: ${g.awayTeam.abbreviation} ${g.awayTeam.score ?? 0}-${g.homeTeam.score ?? 0} ${g.homeTeam.abbreviation}`;
      if (g.status === 'final')
        return `Final: ${g.awayTeam.abbreviation} ${g.awayTeam.score}-${g.homeTeam.score} ${g.homeTeam.abbreviation}`;
      return `${g.awayTeam.abbreviation} @ ${g.homeTeam.abbreviation} (${new Date(g.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})`;
    });
    parts.push(`Sports: ${lines.join(', ')}`);
  }

  const news = data.get('news') as NewsData | undefined;
  if (news?.articles?.length) {
    const headlines = news.articles
      .slice(0, 5)
      .map((a) => a.title)
      .join(' | ');
    parts.push(`Headlines: ${headlines}`);
  }

  return parts.join('\n\n');
}

function buildContext(): string {
  const spaces = getSpaces();
  const activeId = getActiveSpace();
  const activeSpace = spaces.find((s) => s.id === activeId);

  const spaceList = spaces.map((s) => `${s.name} (${s.id}): ${s.widgets.map((w) => w.panelId).join(', ')}`).join('\n');

  const availablePanels = [
    'weather',
    'stocks',
    'news',
    'crypto',
    'sports',
    'chat',
    'calendar',
    'entertainment',
    'notes',
  ];

  const sections = [
    `Active space: ${activeSpace?.name || 'unknown'} (${activeId})`,
    `Spaces:\n${spaceList}`,
    `Available panels: ${availablePanels.join(', ')}`,
  ];

  const dataSummary = summarizePanelData();
  if (dataSummary) {
    sections.push(`Live data:\n${dataSummary}`);
  }

  return sections.join('\n\n');
}

export async function interpretQuery(query: string): Promise<AIAction> {
  const context = buildContext();

  try {
    const res = await fetchWithRetry('/api/ai-shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, context }),
    });

    const data = (await res.json()) as AIShellResponse | { error: string };

    if ('error' in data) {
      return { action: 'answer', message: data.error };
    }

    return {
      action: (data.action || 'answer') as AIAction['action'],
      params: data.params,
      message: data.message || 'Done.',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI request failed';
    return { action: 'answer', message: msg };
  }
}

export async function getRemainingQueries(): Promise<number> {
  try {
    const res = await fetch('/api/ai-shell?check=quota');
    const data = (await res.json()) as { remaining: number };
    return data.remaining ?? 0;
  } catch {
    return 0;
  }
}
