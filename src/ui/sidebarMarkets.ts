import { createElement } from '../utils/dom.ts';
import { fetchStocks } from '../services/stocks.ts';
import { fetchCryptoData } from '../services/crypto.ts';
import type { StockQuote, CryptoCoin } from '../types/index.ts';

const DEFAULT_WATCHLIST = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'SPY', 'QQQ', 'DIA'];

export function createMarketsTab(): {
  element: HTMLElement;
  startDataCycle: () => void;
  stopDataCycle: () => void;
} {
  const el = createElement('div', { className: 'nw-markets-tab' });
  let stockInterval: ReturnType<typeof setInterval> | null = null;
  let cryptoInterval: ReturnType<typeof setInterval> | null = null;

  function startDataCycle() {
    fetchAndRenderStocks();
    fetchAndRenderCrypto();
    stockInterval = setInterval(fetchAndRenderStocks, 60_000);
    cryptoInterval = setInterval(fetchAndRenderCrypto, 120_000);
  }

  function stopDataCycle() {
    if (stockInterval) clearInterval(stockInterval);
    if (cryptoInterval) clearInterval(cryptoInterval);
    stockInterval = null;
    cryptoInterval = null;
  }

  async function fetchAndRenderStocks() {
    const section = el.querySelector('.nw-stocks-section') || createSection(el, 'nw-stocks-section', 'EQUITIES');
    try {
      const data = await fetchStocks(DEFAULT_WATCHLIST);
      renderStockTable(section as HTMLElement, data.watchlist);
    } catch {
      (section as HTMLElement).querySelector('.nw-section-body')!.textContent = 'Failed to load';
    }
  }

  async function fetchAndRenderCrypto() {
    const section = el.querySelector('.nw-crypto-section') || createSection(el, 'nw-crypto-section', 'CRYPTO');
    try {
      const data = await fetchCryptoData();
      renderCryptoTable(section as HTMLElement, data.coins.slice(0, 10));
    } catch {
      (section as HTMLElement).querySelector('.nw-section-body')!.textContent = 'Failed to load';
    }
  }

  // Show skeletons initially
  createSection(el, 'nw-stocks-section', 'EQUITIES');
  createSection(el, 'nw-crypto-section', 'CRYPTO');
  renderSkeletons(el.querySelector('.nw-stocks-section .nw-section-body') as HTMLElement, 10);
  renderSkeletons(el.querySelector('.nw-crypto-section .nw-section-body') as HTMLElement, 10);

  return { element: el, startDataCycle, stopDataCycle };
}

function createSection(parent: HTMLElement, className: string, title: string): HTMLElement {
  const existing = parent.querySelector(`.${className}`);
  if (existing) return existing as HTMLElement;

  const section = createElement('div', { className });
  const header = createElement('div', { className: 'nw-section-header', textContent: title });
  const body = createElement('div', { className: 'nw-section-body' });
  section.appendChild(header);
  section.appendChild(body);
  parent.appendChild(section);
  return section;
}

function renderStockTable(section: HTMLElement, quotes: StockQuote[]): void {
  const body = section.querySelector('.nw-section-body') as HTMLElement;
  body.textContent = '';

  for (const q of quotes) {
    const row = createElement('div', { className: 'nw-market-row' });

    const sym = createElement('span', { className: 'nw-market-symbol', textContent: q.symbol });
    const price = createElement('span', { className: 'nw-market-price' });
    price.textContent = q.price.toFixed(2);

    const change = createElement('span', { className: 'nw-market-change' });
    const pct = q.changePercent;
    const sign = pct >= 0 ? '+' : '';
    change.textContent = `${sign}${pct.toFixed(2)}%`;
    change.style.color = pct >= 0 ? '#00ff00' : '#ff3333';

    row.appendChild(sym);
    row.appendChild(price);
    row.appendChild(change);
    body.appendChild(row);
  }
}

function renderCryptoTable(section: HTMLElement, coins: CryptoCoin[]): void {
  const body = section.querySelector('.nw-section-body') as HTMLElement;
  body.textContent = '';

  for (const c of coins) {
    const row = createElement('div', { className: 'nw-market-row' });

    const sym = createElement('span', { className: 'nw-market-symbol' });
    sym.textContent = c.symbol.toUpperCase();

    const price = createElement('span', { className: 'nw-market-price' });
    price.textContent = c.price >= 1 ? c.price.toFixed(2) : c.price.toFixed(4);

    const change = createElement('span', { className: 'nw-market-change' });
    const pct = c.change24h;
    const sign = pct >= 0 ? '+' : '';
    change.textContent = `${sign}${pct.toFixed(2)}%`;
    change.style.color = pct >= 0 ? '#00ff00' : '#ff3333';

    row.appendChild(sym);
    row.appendChild(price);
    row.appendChild(change);
    body.appendChild(row);
  }
}

function renderSkeletons(container: HTMLElement, count: number): void {
  for (let i = 0; i < count; i++) {
    const sk = createElement('div', { className: 'nw-skeleton-row' });
    const b1 = createElement('div', { className: 'nw-skeleton-bar' });
    b1.style.width = '48px';
    const b2 = createElement('div', { className: 'nw-skeleton-bar' });
    b2.style.width = '64px';
    b2.style.marginLeft = 'auto';
    const b3 = createElement('div', { className: 'nw-skeleton-bar' });
    b3.style.width = '48px';
    sk.appendChild(b1);
    sk.appendChild(b2);
    sk.appendChild(b3);
    container.appendChild(sk);
  }
}
