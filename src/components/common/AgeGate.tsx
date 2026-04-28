import React, { useState, useEffect } from 'react';

const STORAGE_KEY = 'damcash_age_verified';

/**
 * Age gate + Terms of Service consent wall.
 * Blocks access to the app until the user confirms they are 18+
 * and accepts the Terms of Service.
 *
 * Stored in localStorage — persists across sessions.
 * Cleared on logout (see stores/index.ts logout action).
 */
export function AgeGate({ children }: { children: React.ReactNode }) {
  const [verified, setVerified] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'yes'; } catch { return false; }
  });
  const [checked, setChecked] = useState(false);
  const [declined, setDeclined] = useState(false);

  if (verified) return <>{children}</>;

  if (declined) {
    return (
      <div style={overlay}>
        <div style={card}>
          <div style={{ fontSize: 56 }}>🚫</div>
          <h2 style={{ color: '#ef4444', margin: 0 }}>Access Restricted</h2>
          <p style={{ color: '#94a3b8', margin: 0, maxWidth: 340 }}>
            You must be 18 or older to use DamCash. If you believe this is an error, please contact support.
          </p>
        </div>
      </div>
    );
  }

  const handleAccept = () => {
    if (!checked) return;
    try { localStorage.setItem(STORAGE_KEY, 'yes'); } catch {}
    setVerified(true);
  };

  return (
    <div style={overlay}>
      <div style={card}>
        {/* Logo */}
        <img src="/logo.svg" alt="DamCash" style={{ width: 72, height: 72, borderRadius: 16 }} />

        <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}>
          <span style={{ color: '#f59e0b' }}>DAM</span>
          <span style={{ color: '#6fcf97' }}>CASH</span>
        </h1>

        <div style={{
          background: '#1c1c2e', border: '1px solid #2a2a40',
          borderRadius: 12, padding: '20px 24px', width: '100%', textAlign: 'left',
        }}>
          <p style={{ color: '#e2e8f0', fontWeight: 700, margin: '0 0 8px' }}>
            ⚠️ Age Verification Required
          </p>
          <p style={{ color: '#94a3b8', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            DamCash is a real-money wagering platform. By continuing, you confirm that:
          </p>
          <ul style={{ color: '#94a3b8', fontSize: 14, lineHeight: 2, marginTop: 10, paddingLeft: 20 }}>
            <li>You are <strong style={{ color: '#e2e8f0' }}>18 years of age or older</strong> (or the legal gambling age in your jurisdiction, whichever is higher)</li>
            <li>Real-money wagering is <strong style={{ color: '#e2e8f0' }}>legal</strong> in your country or region</li>
            <li>You accept our{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#6fcf97' }}>Terms of Service</a>{' '}
              and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#6fcf97' }}>Privacy Policy</a>
            </li>
            <li>You understand that gambling carries financial risk and you play responsibly</li>
          </ul>
        </div>

        {/* Responsible gambling notice */}
        <div style={{
          background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: 8, padding: '12px 16px', width: '100%', textAlign: 'left',
        }}>
          <p style={{ color: '#f59e0b', fontSize: 13, margin: 0, fontWeight: 600 }}>
            🎲 Responsible Gambling
          </p>
          <p style={{ color: '#94a3b8', fontSize: 12, margin: '6px 0 0', lineHeight: 1.5 }}>
            If gambling is causing problems, please seek help:{' '}
            <a href="https://www.begambleaware.org" target="_blank" rel="noopener noreferrer" style={{ color: '#6fcf97' }}>BeGambleAware.org</a>
            {' · '}
            <a href="https://www.ncpgambling.org" target="_blank" rel="noopener noreferrer" style={{ color: '#6fcf97' }}>NCPG Helpline</a>
          </p>
        </div>

        {/* Checkbox */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={e => setChecked(e.target.checked)}
            style={{ width: 18, height: 18, marginTop: 2, accentColor: '#6fcf97', flexShrink: 0 }}
          />
          <span style={{ color: '#e2e8f0', fontSize: 14, lineHeight: 1.5 }}>
            I confirm I am <strong>18 or older</strong>, gambling is legal in my jurisdiction, and I accept the Terms of Service.
          </span>
        </label>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12, width: '100%' }}>
          <button
            onClick={() => setDeclined(true)}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 8,
              border: '1px solid #2a2a40', background: 'transparent',
              color: '#94a3b8', fontWeight: 600, fontSize: 14, cursor: 'pointer',
            }}
          >
            I am under 18
          </button>
          <button
            onClick={handleAccept}
            disabled={!checked}
            style={{
              flex: 2, padding: '12px 0', borderRadius: 8, border: 'none',
              background: checked ? '#6fcf97' : '#1c1c2e',
              color: checked ? '#000' : '#64748b',
              fontWeight: 700, fontSize: 14,
              cursor: checked ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
            }}
          >
            ✅ I'm 18+ — Enter DamCash
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 99999,
  background: 'rgba(7,7,15,0.97)',
  backdropFilter: 'blur(12px)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  padding: '24px',
  overflowY: 'auto',
};

const card: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
  background: '#14141f', border: '1px solid #2a2a40', borderRadius: 20,
  padding: '40px 36px', maxWidth: 480, width: '100%',
  boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
  margin: 'auto',
};
