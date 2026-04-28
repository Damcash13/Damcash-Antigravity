// Use the global supabase object injected by the CDN script in index.html
// The @supabase/supabase-js@2 UMD build exposes `window.supabase` with `createClient`.
/* eslint-disable @typescript-eslint/no-explicit-any */
const supabaseUrl  = (import.meta as any).env?.VITE_SUPABASE_URL  as string | undefined;
const supabaseKey  = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;
/* eslint-enable @typescript-eslint/no-explicit-any */

// Support both CDN global shapes: window.supabase.createClient and window.createClient
const _win = window as any;
const createClient =
  _win.supabase?.createClient ??   // @supabase/supabase-js@2 UMD
  _win.Supabase?.createClient ??   // some CDN variants capitalise it
  _win.createClient ??             // bare export
  null;

if (!createClient) {
  console.error('[Supabase] CDN failed to expose createClient. Check the <script> tag in index.html.');
}

if (!supabaseUrl || !supabaseKey) {
  console.warn('[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing in .env');
}

export const supabase: any = createClient && supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// ── Timeout wrapper ────────────────────────────────────────────────────────────
// Supabase free-tier projects pause after inactivity.  When paused, every SDK
// call hangs forever because the underlying fetch never resolves.  This helper
// races any promise against a timeout so the UI always gets a response.

const DEFAULT_AUTH_TIMEOUT = 12_000; // 12 seconds – generous but not infinite

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number = DEFAULT_AUTH_TIMEOUT,
  label = 'Supabase',
): Promise<T> {
  const timeout = new Promise<never>((_resolve, reject) =>
    setTimeout(
      () => reject(new Error(
        `${label} did not respond within ${Math.round(ms / 1000)}s. ` +
        'Your Supabase project may be paused — visit supabase.com/dashboard to restore it.'
      )),
      ms,
    ),
  );
  return Promise.race([promise, timeout]);
}

// ── Health check ───────────────────────────────────────────────────────────────
// Quick connectivity test (reachable ≠ healthy, but catches paused projects).

let _supabaseReachable: boolean | null = null;   // null = unknown
let _healthCheckPromise: Promise<boolean> | null = null;

export function checkSupabaseHealth(): Promise<boolean> {
  if (_healthCheckPromise) return _healthCheckPromise;
  if (!supabaseUrl || !supabaseKey) {
    _supabaseReachable = false;
    return Promise.resolve(false);
  }

  // Use Promise.race — AbortController alone is unreliable when the TCP
  // connection is stuck (paused Supabase project accepts TCP but never responds).
  const timeout = new Promise<boolean>(resolve =>
    setTimeout(() => { _supabaseReachable = false; resolve(false); }, 8_000),
  );

  const check = fetch(`${supabaseUrl}/auth/v1/health`, {
    headers: { apikey: supabaseKey },
  })
    .then(r => { _supabaseReachable = r.ok; return r.ok; })
    .catch(() => { _supabaseReachable = false; return false; });

  _healthCheckPromise = Promise.race([check, timeout])
    .finally(() => { _healthCheckPromise = null; });

  return _healthCheckPromise;
}

export function isSupabaseReachable(): boolean | null { return _supabaseReachable; }
