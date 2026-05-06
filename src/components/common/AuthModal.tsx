import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { useUserStore } from '../../stores';
import { supabase, withTimeout } from '../../lib/supabase';
import { CountrySelect } from './CountrySelect';

interface Props {
  open: boolean;
  onClose: () => void;
}

const cleanUsername = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 24);

export const AuthModal: React.FC<Props> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const { login, restoreSession, guestLogin, updateProfile } = useUserStore();
  const [tab, setTab] = useState<'login' | 'register' | 'forgot'>('register');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => { setUsername(''); setEmail(''); setPassword(''); setConfirmPassword(''); setCountry(''); setError(''); setInfo(''); };
  const switchTab = (t_: 'login' | 'register' | 'forgot') => { setTab(t_); setError(''); setInfo(''); };

  const handleGoogleSignIn = async () => {
    setError('');
    setInfo('');
    if (!supabase) { setError(t('auth.supabaseError')); return; }
    setLoading(true);
    try {
      const { error: oauthError } = await withTimeout<any>(
        supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: `${window.location.origin}/`,
            queryParams: { prompt: 'select_account' },
          },
        }),
        12_000,
        'Google sign-in',
      );
      if (oauthError) throw oauthError;
    } catch (err: any) {
      setError(err?.message || t('auth.somethingWentWrong'));
      setLoading(false);
    }
  };

  // ── Forgot password handler ───────────────────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!email.trim()) { setError(t('auth.emailRequired')); return; }
    if (!supabase) { setError(t('auth.supabaseError')); return; }
    setLoading(true);
    try {
      const { error: resetError } = await withTimeout<any>(
        supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        }),
        12_000,
        'Password reset',
      );
      if (resetError) throw resetError;
      setInfo(t('auth.resetEmailSent'));
    } catch (err: any) {
      setError(err?.message || t('auth.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  // ── Register / login handler ──────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      if (tab === 'register') {
        const cleanedUsername = cleanUsername(username);
        const cleanedEmail = email.trim().toLowerCase();
        if (!cleanedUsername || cleanedUsername.length < 2) { setError(t('auth.usernameRequired')); setLoading(false); return; }
        if (!cleanedEmail)    { setError(t('auth.emailRequired'));    setLoading(false); return; }
        if (password.length < 6) { setError(t('auth.passwordTooShort')); setLoading(false); return; }
        if (password !== confirmPassword) { setError(t('auth.passwordMismatch', 'Passwords do not match')); setLoading(false); return; }
        if (!country)         { setError(t('auth.countryRequired'));  setLoading(false); return; }

        if (!supabase) throw new Error(t('auth.supabaseError'));

        const { data, error: signUpError } = await withTimeout<any>(
          supabase.auth.signUp({
            email: cleanedEmail,
            password,
            options: {
              data: {
                username: cleanedUsername,
                preferred_username: cleanedUsername,
                name: cleanedUsername,
                country,
              },
            },
          }),
          15_000,
          'Registration',
        );

        if (signUpError) throw signUpError;

        if (data.session) {
          // Supabase created a session immediately (email confirmation disabled).
          // Sync explicitly after restore so the Prisma profile cannot fall back
          // to an email-derived username if auth metadata is delayed.
          await restoreSession();
          await updateProfile({ username: cleanedUsername, country });
          reset();
          onClose();
        } else {
          // Email confirmation may be required — try signing in anyway
          try {
            await login(email, password);
            reset();
            onClose();
          } catch {
            // Confirmation required — drop to login tab with prefilled email
            setInfo(t('auth.accountCreated'));
            setTab('login');
            setPassword('');
          }
        }
      } else {
        if (!email.trim()) { setError(t('auth.emailRequired')); setLoading(false); return; }
        await login(email, password);
        reset();
        onClose();
      }
    } catch (err: any) {
      const msg: string = err?.message || '';
      if (msg.includes('did not respond within')) {
        setError(t('auth.supabaseTimeout', 'Could not reach the server. Your Supabase project may be paused — visit supabase.com/dashboard to restore it, then try again.'));
      } else if (msg.toLowerCase().includes('email not confirmed')) {
        setError(t('auth.emailNotConfirmed'));
      } else if (msg.toLowerCase().includes('invalid login credentials')) {
        setError(t('auth.invalidCredentials'));
      } else if (msg.toLowerCase().includes('user already registered')) {
        setError(t('auth.emailExists'));
        setTab('login');
      } else if (msg.toLowerCase().includes('database error saving new user')) {
        setError('Registration failed due to a server configuration issue. Please contact support or try again later.');
      } else {
        setError(msg || t('auth.somethingWentWrong'));
      }
    } finally {
      setLoading(false);
    }
  };

  const msgBox = (msg: string, variant: 'info' | 'error') => (
    <div style={{
      fontSize: 12,
      color: variant === 'error' ? 'var(--danger)' : '#22c55e',
      background: variant === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
      border: `1px solid ${variant === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.25)'}`,
      borderRadius: 6, padding: '8px 10px',
    }}>
      {msg}
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} maxWidth={380}>

      {/* ── Forgot password view ── */}
      {tab === 'forgot' ? (
        <>
          <div style={{ marginBottom: 20 }}>
            <button
              onClick={() => switchTab('login')}
              style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              ← {t('auth.backToLogin')}
            </button>
            <h3 style={{ marginTop: 12, fontSize: 17, fontWeight: 700 }}>{t('auth.forgotPasswordTitle')}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{t('auth.forgotPasswordDesc')}</p>
          </div>

          <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                {t('auth.email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                autoFocus
                required
              />
            </div>

            {info  && msgBox(info,  'info')}
            {error && msgBox(error, 'error')}

            <button type="submit" className={`btn btn-primary btn-full${loading ? ' btn-loading' : ''}`} style={{ marginTop: 4 }} disabled={loading || !!info}>
              {t('auth.sendResetLink')}
            </button>
          </form>
        </>
      ) : (
        <>
          {/* ── Tabs: Register / Sign In ── */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
            {(['register', 'login'] as const).map(t_ => (
              <button
                type="button"
                key={t_}
                className={`tab-btn ${tab === t_ ? 'active' : ''}`}
                onClick={() => switchTab(t_)}
              >
                {t_ === 'register' ? t('nav.register') : t('nav.signIn')}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-full"
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{ marginBottom: 12 }}
          >
            Continue with Google
          </button>

          <div style={{ textAlign: 'center', margin: '0 0 16px', color: 'var(--text-3)', fontSize: 12 }}>
            {t('common.or')} use email
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tab === 'register' && (
              <>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                    {t('auth.username')}
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder={t('auth.usernamePlaceholder')}
                    autoComplete="username"
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                    {t('auth.country')} <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <CountrySelect value={country} onChange={setCountry} required />
                </div>
              </>
            )}

            <div>
              <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                {t('auth.email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span>{t('auth.password')}</span>
                {tab === 'login' && (
                  <button
                    type="button"
                    onClick={() => switchTab('forgot')}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0 }}
                  >
                    {t('auth.forgotPassword')}
                  </button>
                )}
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={t('auth.passwordPlaceholder')}
                autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
                required
              />
            </div>

            {tab === 'register' && (
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                  {t('auth.confirmPassword', 'Confirm password')}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder={t('auth.confirmPasswordPlaceholder', 'Re-enter your password')}
                  autoComplete="new-password"
                  required
                />
                {password && confirmPassword && password !== confirmPassword && (
                  <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
                    {t('auth.passwordMismatch', 'Passwords do not match')}
                  </div>
                )}
              </div>
            )}

            {info  && msgBox(info,  'info')}
            {error && msgBox(error, 'error')}

            <button type="submit" className={`btn btn-primary btn-full${loading ? ' btn-loading' : ''}`} style={{ marginTop: 4 }} disabled={loading}>
              {tab === 'register' ? t('nav.register') : t('nav.signIn')}
            </button>
          </form>

          <div style={{ textAlign: 'center', margin: '16px 0', color: 'var(--text-3)', fontSize: 13 }}>
            — {t('common.or')} —
          </div>

          <button
            className="btn btn-secondary btn-full"
            onClick={() => { guestLogin(); onClose(); }}
          >
            {t('auth.playAsGuest')}
          </button>
        </>
      )}
    </Modal>
  );
};
