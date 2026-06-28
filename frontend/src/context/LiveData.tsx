import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

interface CacheStatus {
  last_fetched: string | null;
  age_seconds: number | null;
  ttl_seconds: number;
  sgd_count: number;
  fraud_count: number;
  demo_mode: boolean;
}

interface LiveDataCtx {
  sgdCount: number;
  fraudCount: number;
  lastFetched: string | null;
  ageSeconds: number | null;
  demoMode: boolean;
  refreshing: boolean;
  newDataFlash: boolean;        // true for 3s after new rows detected
  manualRefresh: () => Promise<void>;
  pollInterval: number;
}

const Ctx = createContext<LiveDataCtx>({
  sgdCount: 0, fraudCount: 0, lastFetched: null, ageSeconds: null,
  demoMode: false, refreshing: false, newDataFlash: false,
  manualRefresh: async () => {}, pollInterval: 15,
});

export const useLiveData = () => useContext(Ctx);

// How often the frontend polls the health endpoint (seconds)
const POLL_SECONDS = 15;

export function LiveDataProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<CacheStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [newDataFlash, setNewDataFlash] = useState(false);
  const prevSGDCount = useRef<number>(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStatus = useCallback(async (invalidate = false) => {
    try {
      if (invalidate) {
        setRefreshing(true);
        await fetch('/api/cache/invalidate', { method: 'POST' });
      }
      const res = await fetch('/api/health');
      const data = await res.json();
      const newStatus: CacheStatus = data.cache ?? data;

      setStatus(prev => {
        // Detect new rows — flash the indicator
        if (prev && newStatus.sgd_count > prevSGDCount.current) {
          setNewDataFlash(true);
          if (flashTimer.current) clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setNewDataFlash(false), 3000);
        }
        prevSGDCount.current = newStatus.sgd_count;
        return newStatus;
      });
    } catch {
      // silently ignore network errors during polling
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Poll on a fixed interval
  useEffect(() => {
    fetchStatus();
    const id = setInterval(() => fetchStatus(), POLL_SECONDS * 1000);
    return () => { clearInterval(id); if (flashTimer.current) clearTimeout(flashTimer.current); };
  }, [fetchStatus]);

  const manualRefresh = useCallback(() => fetchStatus(true), [fetchStatus]);

  return (
    <Ctx.Provider value={{
      sgdCount:    status?.sgd_count    ?? 0,
      fraudCount:  status?.fraud_count  ?? 0,
      lastFetched: status?.last_fetched ?? null,
      ageSeconds:  status?.age_seconds  ?? null,
      demoMode:    status?.demo_mode    ?? false,
      refreshing,
      newDataFlash,
      manualRefresh,
      pollInterval: POLL_SECONDS,
    }}>
      {children}
    </Ctx.Provider>
  );
}
