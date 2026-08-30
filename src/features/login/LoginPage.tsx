import React, { useState } from 'react';
import { useAuth } from '@/store/auth';
import { Button, Field, Card, toast } from '@/components/ui';
import { Candy, Lock, Eye, EyeOff } from 'lucide-react';

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username, password);
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
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Candy Production</h1>
          <p className="text-sm text-slate-500">Sign in to continue</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Username" required>
            <input
              className="input"
              value={username}
              autoFocus
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
            />
          </Field>
          <Field label="Password" required>
            <div className="relative">
              <input
                className="input pr-10"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button variant="primary" type="submit" className="w-full" disabled={busy || !username || !password}>
            <Lock className="w-4 h-4" />
            {busy ? 'Signing in…' : 'Login'}
          </Button>
        </form>
      </Card>
    </div>
  );
}