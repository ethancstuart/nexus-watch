#!/usr/bin/env tsx
/**
 * scripts/voice-eval.ts — CLI wrapper for the NexusWatch voice eval.
 *
 * Reads a draft from stdin (or a file passed as the first positional arg)
 * and runs the deterministic check against it. This is the local equivalent
 * of POSTing to /api/voice/eval, minus the semantic Claude call (so no
 * network, no API key needed).
 *
 * Usage:
 *
 *   # read content from stdin
 *   echo "We are tracking 14 fires along the Portuguese coast." \\
 *     | npx tsx scripts/voice-eval.ts --platform x
 *
 *   # read content from a file
 *   npx tsx scripts/voice-eval.ts --platform linkedin --file draft.txt
 *
 *   # show help
 *   npx tsx scripts/voice-eval.ts --help
 *
 * Exit codes:
 *   0 — draft passed deterministic check
 *   1 — draft failed deterministic check
 *   2 — CLI usage error
 */

import { readFileSync } from 'node:fs';
import { runDeterministicChecks, formatResult, type Platform } from '../src/voice/deterministic.ts';

interface CliArgs {
  platform: Platform;
  file?: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { platform: 'x', help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--platform' || arg === '-p') {
      const next = argv[++i];
      if (next !== 'x' && next !== 'linkedin' && next !== 'reddit' && next !== 'dm') {
        console.error(`error: --platform must be one of x, linkedin, reddit, dm (got: ${next})`);
        process.exit(2);
      }
      args.platform = next;
    } else if (arg === '--file' || arg === '-f') {
      const next = argv[++i];
      if (!next) {
        console.error('error: --file requires a path');
        process.exit(2);
      }
      args.file = next;
    }
  }
  return args;
}

function printHelp(): void {
  const help = `NexusWatch voice eval — local CLI

Usage:
  voice-eval [--platform <x|linkedin|reddit|dm>] [--file <path>]

Options:
  -p, --platform   Platform to validate against (default: x)
  -f, --file       Read draft content from file instead of stdin
  -h, --help       Show this help

Examples:
  echo "We are tracking 14 fires." | npx tsx scripts/voice-eval.ts -p x
  npx tsx scripts/voice-eval.ts -p linkedin -f draft.txt
`;
  process.stdout.write(help);
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', (err) => reject(err));
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  let content: string;
  if (args.file) {
    try {
      content = readFileSync(args.file, 'utf8');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`error: could not read file: ${msg}`);
      process.exit(2);
    }
  } else {
    if (process.stdin.isTTY) {
      console.error('error: no input on stdin. Pipe a draft in, use --file, or use --help.');
      process.exit(2);
    }
    content = await readStdin();
  }

  content = content.trim();
  if (!content) {
    console.error('error: draft content is empty');
    process.exit(2);
  }

  const result = runDeterministicChecks({ platform: args.platform, content });
  process.stdout.write(formatResult(result) + '\n');
  process.exit(result.passed ? 0 : 1);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`error: ${msg}`);
  process.exit(2);
});
