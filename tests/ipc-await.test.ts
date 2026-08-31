import { describe, it, expect } from 'vitest';
import { openDatabase } from '../electron/db/manager';
import { executeCommand, type Ctx } from '../electron/services/ipc';

describe('IPC async-handler resolution (clone-safety)', () => {
  async function run(command: string, params?: unknown) {
    const manager = await openDatabase();
    const ctx: Ctx = { manager, isLocked: false, authenticated: true };
    try {
      // Simulate main.ts: await Promise.resolve(executeCommand(...)).
      const result = await Promise.resolve(executeCommand(ctx, command, params ?? {}));
      return { result, isPromise: result instanceof Promise };
    } finally {
      manager.db.close();
    }
  }

  it('resolves async backup.create to a plain object (no unresolved Promise)', async () => {
    const { result, isPromise } = await run('backup.create', { kind: 'manual' });
    expect(isPromise).toBe(false);
    const r = result as { fileName: string; filePath: string; sizeBytes: number };
    expect(r.fileName).toMatch(/^CandyBackup_/);
    expect(r.sizeBytes).toBeGreaterThan(0);
  });

  it('round-trips without throwing', async () => {
    await expect(run('backup.create', { kind: 'manual' })).resolves.toBeDefined();
  });
});
