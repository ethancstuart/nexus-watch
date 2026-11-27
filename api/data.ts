import type { VercelRequest, VercelResponse } from '@vercel/node';
import { shell } from './_lib/ssr-shell.js';
import { correctionsNewestFirst } from './_lib/corrections.js';
import {
  DATA_PAGE_CACHE_CONTROL,
  DATA_PAGE_CSS,
  DATA_PAGE_DESCRIPTION,
  DATA_PAGE_TITLE,
  DATA_PATH,
  renderDataPageBody,
} from './_lib/data-page.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * Server-rendered /data (vercel.json rewrites the path here, as it does
 * /ledger): the documentation for /data/calls.csv and /data/calls.json.
 *
 * It reads no database (api/_lib/data-page.ts). The one thing it checks is
 * whether /corrections is live, by the same gate /corrections uses, so it
 * never links to a page that answers 404.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('method_not_allowed');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', DATA_PAGE_CACHE_CONTROL);
  return res.status(200).send(
    shell(renderDataPageBody({ correctionsPageLive: correctionsNewestFirst().length > 0 }), {
      title: DATA_PAGE_TITLE,
      description: DATA_PAGE_DESCRIPTION,
      canonicalPath: DATA_PATH,
      css: DATA_PAGE_CSS,
    }),
  );
}
