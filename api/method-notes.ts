import type { VercelRequest, VercelResponse } from '@vercel/node';
import { methodologyPayload } from './_lib/call-notes.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * GET /api/method-notes: the approved dated sections of /methodology, as JSON.
 *
 * /methodology is a client-rendered page, and anything the client imports is
 * bundled into the public JavaScript whether or not it is approved. So the
 * page's dated notes are served from here, through the same two-key gate as
 * every call note (api/_lib/call-notes.ts), and the page renders whatever this
 * returns. With no approved section it returns `{"notes":[]}` and the page
 * shows nothing. It reads no database: the notes are reviewed data in the
 * repository (api/_lib/call-notes-data.ts).
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GET only' });
  }
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=900');
  return res.status(200).json({ notes: methodologyPayload() });
}
