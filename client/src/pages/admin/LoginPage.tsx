import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, LogIn, Printer } from 'lucide-react';
import { http, apiError, getAdminToken, setAdminToken } from '../../services/api';
import { useToast } from '../../components/ui/Toast';

export default function LoginPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!getAdminToken()) {
      setChecking(false);
      return;
    }
    http
      .get('/api/auth/me')
      .then(() => navigate('/admin', { replace: true }))
      .catch(() => {
        setChecking(false);
      });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await http.post('/api/auth/login', { email, password });
      setAdminToken(res.data.token);
      navigate('/admin', { replace: true });
    } catch (err) {
      toast(apiError(err).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="rounded-2xl bg-brand-600 p-3 text-white shadow-lg shadow-brand-600/30">
            <Printer className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-extrabold text-slate-800">Print Shop Admin</h1>
          <p className="text-sm text-slate-500">Sign in to manage your print requests</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="input"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary w-full !py-3" disabled={busy}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
