import { getSettings } from './settings';
import type { AppDatabase } from '../db/connection';
import { audit } from './audit';

/**
 * Auto-lock manager. Tracks last user activity in the main process and, when
 * the app is left idle for the configured timeout (secure default: 15 min),
 * transitions the context to the locked state and notifies the renderer so it
 * can show the unlock screen.
 *
 * Lock state continues to gate IPC in `executeCommand` (main-process enforcement),
 * so locking is not merely cosmetic.
 */
export interface LockManager {
  /** Note activity. Call on every IPC command / user interaction. */
  poke(): void;
  /** Immediately request a lock. */
  lock(forceLegit?: boolean): void;
  /** Clear the lock. */
  unlock(): void;
  readonly isLocked: boolean;
  /** Tear down timers. */
  dispose(): void;
  /** Callable to re-read timeout from settings after they change. */
  refresh(config: { enabled: boolean; minutes: number }): void;
}

export interface LockManagerDeps {
  /** Return true when not currently authenticated (no lock needed). */
  isAuthed: () => boolean;
  onLockRequired: () => void;
  onUnlock: () => void;
}

export function createLockManager(
  db: AppDatabase,
  deps: LockManagerDeps,
): LockManager {
  let locked = false;
  let enabled = true;
  let minutes = 15;
  let lastSeen = Date.now();
  let timer: ReturnType<typeof setInterval> | null = null;

  const evaluate = () => {
    if (!enabled) return;
    if (!deps.isAuthed()) return;
    const idleMs = Date.now() - lastSeen;
    if (idleMs >= minutes * 60_000) {
      lock(true);
    }
  };

  function lock(legit: boolean): void {
    if (locked) return;
    if (!deps.isAuthed()) return;
    locked = true;
    try {
      audit(db, 'AUTH_LOCK', 'users', undefined, legit ? 'Application locked (inactivity)' : 'Application locked');
    } catch {
      /* audit must not break locking */
    }
    deps.onLockRequired();
  }

  function unlock(): void {
    if (!locked) return;
    locked = false;
    lastSeen = Date.now();
    deps.onUnlock();
  }

  function start(): void {
    stop();
    timer = setInterval(evaluate, 30_000); // check every 30s
    void timer;
  }
  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  start();

  return {
    poke() {
      lastSeen = Date.now();
    },
    lock(forceLegit = false) {
      lock(forceLegit);
    },
    unlock,
    get isLocked() {
      return locked;
    },
    dispose: stop,
    refresh(cfg) {
      enabled = cfg.enabled;
      minutes = Math.max(1, cfg.minutes);
      // A shorter timeout should take effect immediately for evaluation.
      lastSeen = Date.now();
      start();
    },
  };
}