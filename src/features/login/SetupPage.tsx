import React, { useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/api/client';
import { Button, Field, Card } from '@/components/ui';
import { Candy, UserPlus, Store } from 'lucide-react';

export function SetupPage() {
  const { setup } = useAuth();
  const [businessName, setBusinessName] = useState('Candy Production');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await setup(username, password);
      // Persist the business name (survives restart/logout). Non-fatal on error.
      const name = businessName.trim();
      if (name) await api.settings.save({ companyName: name });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-brand-50 dark:from-slate-900 dark:to-slate-800 p-4">
      <Card className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="rounded-xl bg-brand-600 p-3 text-white mb-3">
            <Candy className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Welcome!</h1>
          <p className="text-sm text-slate-500 text-center">
            Create your admin account to set up the system. This is a one-time set up on this computer.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Business Name" required>
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-slate-400" />
              <input className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Candy Production" />
            </div>
            <p className="text-xs text-slate-400 mt-1">This name appears throughout the application (sidebar, reports, window title). You can change it anytime in Settings.</p>
          </Field>
          <Field label="Username" required>
            <input className="input" value={username} autoFocus onChange={(e) => setUsername(e.target.value)} placeholder="e.g. admin" />
          </Field>
          <Field label="Password" required>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password" />
          </Field>
          <Field label="Confirm Password" required>
            <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button variant="primary" type="submit" className="w-full" disabled={busy || !username || !password || !confirm}>
            <UserPlus className="w-4 h-4" />
            {busy ? 'Creating…' : 'Create Admin Account'}
          </Button>
        </form>
      </Card>
    </div>
  );
}