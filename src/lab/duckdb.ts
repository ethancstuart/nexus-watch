/**
 * Lazy DuckDB-WASM loader.
 *
 * The 7 MB @duckdb/duckdb-wasm bundle is dynamic-imported behind an
 * explicit "Launch Lab" click in src/pages/lab.ts so it never enters
 * the main chunk. Vite splits it via the dynamic import.
 *
 * 2026-05 tier-up Phase 1.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbPromise: Promise<any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let connPromise: Promise<any> | null = null;

export interface DuckDbReadyResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conn: any;
}

/**
 * Initialize DuckDB-WASM (idempotent). Returns the connection ready to
 * run SQL. Loads httpfs so we can read remote parquet via URL.
 */
export async function getDuckDb(onProgress?: (msg: string) => void): Promise<DuckDbReadyResult> {
  if (!dbPromise) {
    onProgress?.('Loading DuckDB-WASM (7 MB)…');
    dbPromise = (async () => {
      const duckdb = await import('@duckdb/duckdb-wasm');
      const bundles = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(bundles);
      const workerSrc = `importScripts("${bundle.mainWorker}");`;
      const workerUrl = URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' }));
      const worker = new Worker(workerUrl);
      const logger = new duckdb.ConsoleLogger();
      const db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker ?? undefined);
      URL.revokeObjectURL(workerUrl);
      return db;
    })();
  }

  const db = await dbPromise;

  if (!connPromise) {
    onProgress?.('Connecting + loading httpfs…');
    connPromise = (async () => {
      const conn = await db.connect();
      await conn.query('INSTALL httpfs; LOAD httpfs;');
      return conn;
    })();
  }

  const conn = await connPromise;
  onProgress?.('Ready.');
  return { db, conn };
}

export interface QueryRowsResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  ms: number;
}

/**
 * Run a SQL query and return rows as an array-of-arrays plus column names.
 * Suitable for direct table render or chart binding.
 */
export async function runQuery(sql: string, onProgress?: (msg: string) => void): Promise<QueryRowsResult> {
  const { conn } = await getDuckDb(onProgress);
  const t0 = performance.now();
  const result = await conn.query(sql);
  const ms = Math.round(performance.now() - t0);

  // Apache Arrow Table API
  const schema = result.schema;
  const columns: string[] = (schema?.fields ?? []).map((f: { name: string }) => f.name);
  const rows: unknown[][] = [];
  for (const batch of result.batches ?? [result]) {
    const n = batch.numRows ?? batch.length ?? 0;
    for (let i = 0; i < n; i++) {
      const row: unknown[] = [];
      for (const col of columns) {
        const vec = batch.getChild?.(col) ?? batch[col];
        const val = vec?.get?.(i) ?? null;
        row.push(typeof val === 'bigint' ? Number(val) : val);
      }
      rows.push(row);
    }
  }

  return { columns, rows, rowCount: rows.length, ms };
}

/**
 * Convenience: register a parquet URL as a named view so users can
 * `SELECT * FROM cii` without typing the URL each time.
 */
export async function registerParquetView(name: string, url: string): Promise<void> {
  const { conn } = await getDuckDb();
  await conn.query(`CREATE OR REPLACE VIEW ${name} AS SELECT * FROM read_parquet('${url}')`);
}
