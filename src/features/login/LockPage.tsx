import React, { useState } from 'react';
import { useAuth } from '@/store/auth';
import { Button, Field, Card } from '@/components/ui';
import { Lock } from 'lucide-react';

export function LockPage() {
  const { user, unlock } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (!user) throw new Error('No user');
      await unlock(user.username, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <Card className="w-full max-w-sm bg-slate-800 border-slate-700">
        <div className="flex flex-col items-center mb-6">
          <div className="rounded-xl bg-brand-600 p-3 text-white mb-3">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-white">Application Locked</h1>
          <p className="text-sm text-slate-400">Enter your password to continue as {user?.username}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Password" required>
            <input className="input" type="password" value={password} autoFocus onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button variant="primary" type="submit" className="w-full" disabled={busy || !password}>
            Unlock
          </Button>
        </form>
      </Card>
    </div>
  );
}