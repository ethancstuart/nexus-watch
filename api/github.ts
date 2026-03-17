import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'edge' };

interface GitHubEventPayload {
  size?: number;
  ref?: string;
  ref_type?: string;
  action?: string;
  pull_request?: { number: number; title: string };
  issue?: { number: number; title: string };
  comment?: { body: string };
  forkee?: { full_name: string };
}

interface GitHubRawEvent {
  id: string;
  type: string;
  repo: { name: string };
  payload: GitHubEventPayload;
  created_at: string;
}

function describeEvent(event: GitHubRawEvent): string {
  const p = event.payload;
  switch (event.type) {
    case 'PushEvent': {
      const size = p.size ?? 0;
      const ref = p.ref ? p.ref.replace('refs/heads/', '') : 'unknown';
      return `pushed ${size} commit(s) to ${ref}`;
    }
    case 'PullRequestEvent':
      return `${p.action} PR #${p.pull_request?.number}: ${p.pull_request?.title}`;
    case 'IssuesEvent':
      return `${p.action} issue #${p.issue?.number}: ${p.issue?.title}`;
    case 'CreateEvent':
      return `created ${p.ref_type} ${p.ref || ''}`.trim();
    case 'WatchEvent':
      return 'starred';
    case 'ForkEvent':
      return 'forked';
    case 'IssueCommentEvent':
      return `commented on #${p.issue?.number}`;
    default:
      return event.type;
  }
}

export default async function handler(req: VercelRequest, _res: VercelResponse) {
  const url = new URL(req.url!, 'https://localhost');
  const username = url.searchParams.get('username') || '';

  if (!username || !/^[a-zA-Z0-9-]+$/.test(username)) {
    return new Response(JSON.stringify({ error: 'Invalid username' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'DashPulse/1.0',
      Accept: 'application/vnd.github+json',
    };

    const token = process.env.GITHUB_TOKEN;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const resp = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=30`, {
      headers,
    });

    if (!resp.ok) {
      const msg = resp.status === 404 ? 'User not found' : `GitHub API error: ${resp.status}`;
      return new Response(JSON.stringify({ error: msg }), {
        status: resp.status === 404 ? 404 : 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const raw = (await resp.json()) as GitHubRawEvent[];

    const events = raw.map((event) => ({
      id: event.id,
      type: event.type,
      repo: event.repo.name,
      action: describeEvent(event),
      createdAt: event.created_at,
    }));

    return new Response(JSON.stringify({ events, username, fetchedAt: Date.now() }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=300',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch GitHub activity';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
