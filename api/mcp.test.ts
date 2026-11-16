import { describe, it, expect, vi } from 'vitest';
import handler, { TOOLS } from './mcp.js';

/**
 * The MCP endpoint said "nine tools" (scenarios, portfolio
 * exposure, alerts) for the three that are left, because the sentence was
 * typed once and the tool list kept changing. These assertions compare every
 * description with the TOOLS array the endpoint itself returns. The page and
 * its search snippet are checked against the same array in src/pages/mcp.test.ts.
 */

function getInfo(): Record<string, unknown> {
  let body: Record<string, unknown> = {};
  const res = {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn((b: Record<string, unknown>) => {
      body = b;
      return res;
    }),
  };
  void handler({ method: 'GET' } as never, res as never);
  return body;
}

describe('api/mcp GET description matches the tools it returns', () => {
  const info = getInfo();

  it('lists exactly the TOOLS names', () => {
    expect(info.tools).toEqual(TOOLS.map((t) => t.name));
  });

  it('states a tool count equal to TOOLS.length', () => {
    expect(String(info.description)).toContain(`${TOOLS.length} tools`);
    // Any digit-count in the sentence must be that count and no other.
    const counts = String(info.description).match(/\b(\d+) tools\b/g) ?? [];
    expect(counts).toEqual([`${TOOLS.length} tools`]);
  });

  it('names every tool and no retired capability', () => {
    for (const t of TOOLS) expect(String(info.description)).toContain(t.name);
    expect(String(info.description)).not.toMatch(/scenario|portfolio|alert|prediction/i);
  });
});
