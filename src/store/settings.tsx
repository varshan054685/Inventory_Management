import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '@/api/client';
import type { SettingsData } from '@/shared/types';

/**
 * Provides the configured business/settings data to consumers (sidebar, header,
 * window title, reports). Loads once and exposes a `refresh`/`save` so UI reacts
 * immediately when the business name changes in Settings — no app restart.
 */
interface SettingsContextValue {
  settings: SettingsData | null;
  businessName: string;
  currency: string;
  refresh: () => void;
  save: (patch: Partial<SettingsData>) => Promise<SettingsData>;
}

const Ctx = createContext<SettingsContextValue | null>(null);

let memSettings: SettingsData | null = null;

const DEFAULT_NAME = 'Candy Production';

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SettingsData | null>(memSettings);
  const [version, setVersion] = useState(0);
  const loaded = useRef(false);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await api.settings.get();
        if (alive) {
          memSettings = s;
          setSettings(s);
        }
      } catch {
        // backend unavailable — keep defaults
      } finally {
        loaded.current = true;
      }
    })();
    return () => {
      alive = false;
    };
  }, [version]);

  const save = useCallback(async (patch: Partial<SettingsData>) => {
    const s = await api.settings.save(patch);
    memSettings = s;
    setSettings(s);
    return s;
  }, []);

  const businessName = (settings?.companyName || '').trim() || DEFAULT_NAME;
  const currency = settings?.currency || 'INR';

  return (
    <Ctx.Provider value={{ settings, businessName, currency, refresh, save }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}

export { DEFAULT_NAME };