'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Badge, BrandMark, Button, Card } from '@/components/ui/design-system';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { data, error } = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem('krato_seen_landing', 'true');
    }

    if (data?.user || mode === 'signin') {
      router.push('/');
      return;
    }

    setLoading(false);
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback',
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-[#0A0A0A] flex items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-6">
          <BrandMark size="lg" className="rounded-2xl" />
          <div>
            <h1 className="text-xl font-semibold">Welcome to Krato</h1>
            <p className="text-sm text-[#404040]">Sign in to keep your scans private.</p>
          </div>
        </div>

        <div className="mb-6 flex rounded-xl border-2 border-[#0A0A0A] bg-[#F7FAFA] p-1">
          <button type="button" onClick={() => setMode('signin')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${mode === 'signin' ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-[2px_2px_0px_0px_#0A0A0A]' : 'text-[#404040]'}`}>
            Sign in
          </button>
          <button type="button" onClick={() => setMode('signup')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${mode === 'signup' ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-[2px_2px_0px_0px_#0A0A0A]' : 'text-[#404040]'}`}>
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#404040]">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full rounded-xl border-2 border-[#0A0A0A] bg-[#FAFAF9] px-4 py-3 text-sm text-[#0A0A0A] outline-none transition focus:ring-2 focus:ring-cyan-400" placeholder="you@example.com" />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#404040]">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="w-full rounded-xl border-2 border-[#0A0A0A] bg-[#FAFAF9] px-4 py-3 text-sm text-[#0A0A0A] outline-none transition focus:ring-2 focus:ring-cyan-400" placeholder="At least 6 characters" />
          </div>

          {error && (
            <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <div className="mt-6 flex items-center gap-3 text-[#404040]">
          <span className="h-px flex-1 bg-[#0A0A0A]" />
          <span className="text-xs uppercase">or</span>
          <span className="h-px flex-1 bg-[#0A0A0A]" />
        </div>

        <Button type="button" onClick={handleGoogleSignIn} variant="secondary" className="mt-4 w-full" disabled={loading}>
          Continue with Google
        </Button>
      </Card>
    </div>
  );
}
