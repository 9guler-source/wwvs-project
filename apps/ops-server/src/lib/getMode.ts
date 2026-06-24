import { createClient } from '@supabase/supabase-js';

let cachedMode: string | null = null;
let cacheTime = 0;
const CACHE_TTL = 30_000;

export async function getSimulationMode(): Promise<boolean> {
  const now = Date.now();
  if (cachedMode !== null && now - cacheTime < CACHE_TTL) {
    return cachedMode === 'true';
  }
  try {
    const supabase = createClient(
      process.env.OPS_SUPABASE_URL ?? '',
      process.env.OPS_SUPABASE_SERVICE_KEY ?? ''
    );
    const { data } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'simulation_mode')
      .single();
    cachedMode = data?.value ?? process.env.NEXT_PUBLIC_SIMULATION_MODE ?? 'true';
  } catch {
    cachedMode = process.env.NEXT_PUBLIC_SIMULATION_MODE ?? 'true';
  }
  cacheTime = Date.now();
  return cachedMode === 'true';
}

export function resetModeCache() {
  cachedMode = null;
  cacheTime = 0;
}
