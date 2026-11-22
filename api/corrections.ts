import type { VercelRequest, VercelResponse } from '@vercel/node';
import { shell } from './_lib/ssr-shell.js';
import {
  approvedIntro,
  correctionsNewestFirst,
  renderCorrectionsPage,
  CORRECTIONS_PAGE_CSS,
} from './_lib/corrections.js';
import { CORRECTIONS_PATH } from './_lib/correction-words.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * Server-rendered /corrections (vercel.json rewrites the path here, as it does
 * /ledger): every approved correction note, newest first, each linking to the
 * brief it corrects.
 *
 * IT DOES NOT EXIST UNTIL THE OWNER APPROVES A NOTE. With no approved note the
 * route answers 404, uncached, so the page cannot be found, linked or indexed
 * before then, and nothing of the drafts is served. It reads no database: the
 * notes are data in the repository (api/_lib/corrections-data.ts), so a
 * database outage cannot hide a correction.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('method_not_allowed');
  }

  const notes = correctionsNewestFirst();
  if (notes.length === 0) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).send('not_found');
  }

  const page = renderCorrectionsPage(notes, approvedIntro());
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=900');
  return res.status(200).send(
    shell(page.body, {
      title: page.title,
      description: page.description,
      canonicalPath: CORRECTIONS_PATH,
      css: CORRECTIONS_PAGE_CSS,
    }),
  );
}
