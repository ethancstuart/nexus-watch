import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/tier.ts', () => ({
  hasAccess: vi.fn(() => true),
}));

vi.mock('../services/analytics.ts', () => ({
  trackPanelView: vi.fn(),
}));

vi.mock('../services/calendar.ts', () => ({
  isCalendarConnected: vi.fn(),
  fetchCalendarEvents: vi.fn(),
  connectCalendar: vi.fn(),
  disconnectCalendar: vi.fn(),
}));

import { CalendarPanel } from './CalendarPanel.ts';
import { isCalendarConnected, fetchCalendarEvents } from '../services/calendar.ts';

let panel: CalendarPanel;

beforeEach(() => {
  vi.mocked(isCalendarConnected).mockReset();
  vi.mocked(fetchCalendarEvents).mockReset();
  panel = new CalendarPanel();
});

describe('CalendarPanel', () => {
  it('has premium requiredTier', () => {
    expect(panel.requiredTier).toBe('premium');
  });

  describe('disconnected state', () => {
    it('renders connect button when not connected', async () => {
      vi.mocked(isCalendarConnected).mockResolvedValue(false);

      await panel.fetchData();

      const connectBtn = panel.container.querySelector('.calendar-connect-btn');
      expect(connectBtn).not.toBeNull();
      expect(connectBtn!.textContent).toBe('Connect Google Calendar');
    });

    it('shows explanation text', async () => {
      vi.mocked(isCalendarConnected).mockResolvedValue(false);

      await panel.fetchData();

      const text = panel.container.querySelector('.calendar-connect-text');
      expect(text).not.toBeNull();
      expect(text!.textContent).toContain('Connect your Google Calendar');
    });
  });

  describe('connected with no events', () => {
    it('renders empty state', async () => {
      vi.mocked(isCalendarConnected).mockResolvedValue(true);
      vi.mocked(fetchCalendarEvents).mockResolvedValue([]);

      await panel.fetchData();

      const empty = panel.container.querySelector('.calendar-empty');
      expect(empty).not.toBeNull();
      expect(empty!.textContent).toBe('No upcoming events');
    });

    it('shows disconnect button', async () => {
      vi.mocked(isCalendarConnected).mockResolvedValue(true);
      vi.mocked(fetchCalendarEvents).mockResolvedValue([]);

      await panel.fetchData();

      const disconnectBtn = panel.container.querySelector('.calendar-disconnect-btn');
      expect(disconnectBtn).not.toBeNull();
    });
  });

  describe('connected with events', () => {
    const now = new Date();
    now.setHours(14, 0, 0, 0);
    const later = new Date(now);
    later.setHours(15, 0, 0, 0);

    const mockEvents = [
      {
        id: 'evt-1',
        title: 'Team Standup',
        start: now.toISOString(),
        end: later.toISOString(),
        allDay: false,
        calendarColor: '#4285f4',
      },
      {
        id: 'evt-2',
        title: 'Company Holiday',
        start: now.toISOString(),
        end: later.toISOString(),
        allDay: true,
        calendarColor: '#0b8043',
      },
    ];

    it('renders events when connected', async () => {
      vi.mocked(isCalendarConnected).mockResolvedValue(true);
      vi.mocked(fetchCalendarEvents).mockResolvedValue(mockEvents);

      await panel.fetchData();

      const eventCards = panel.container.querySelectorAll('.calendar-event');
      const allDayBanners = panel.container.querySelectorAll('.calendar-allday');
      expect(eventCards.length).toBeGreaterThanOrEqual(1);
      expect(allDayBanners.length).toBeGreaterThanOrEqual(1);
    });

    it('renders all-day events with badge', async () => {
      vi.mocked(isCalendarConnected).mockResolvedValue(true);
      vi.mocked(fetchCalendarEvents).mockResolvedValue(mockEvents);

      await panel.fetchData();

      const badge = panel.container.querySelector('.calendar-allday-badge');
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toBe('All Day');
    });

    it('renders event titles', async () => {
      vi.mocked(isCalendarConnected).mockResolvedValue(true);
      vi.mocked(fetchCalendarEvents).mockResolvedValue(mockEvents);

      await panel.fetchData();

      const titles = panel.container.querySelectorAll('.calendar-event-title, .calendar-allday-title');
      const titleTexts = Array.from(titles).map((t) => t.textContent);
      expect(titleTexts).toContain('Team Standup');
      expect(titleTexts).toContain('Company Holiday');
    });

    it('renders compact size with event count', async () => {
      vi.mocked(isCalendarConnected).mockResolvedValue(true);
      vi.mocked(fetchCalendarEvents).mockResolvedValue(mockEvents);

      await panel.fetchData();
      panel.renderAtSize('compact');

      const header = panel.container.querySelector('.calendar-section-header');
      expect(header).not.toBeNull();
      expect(header!.textContent).toContain('today');
    });
  });
});
