import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ display: 'grid', gap: 8 }}>
    <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
    <div style={{ color: 'var(--text-2)', lineHeight: 1.65, fontSize: 14 }}>{children}</div>
  </section>
);

export const LegalPage: React.FC = () => {
  const { pathname } = useLocation();
  const isPrivacy = pathname === '/privacy';

  return (
    <main style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text-1)',
      padding: '48px 20px',
    }}>
      <div style={{ maxWidth: 820, margin: '0 auto', display: 'grid', gap: 28 }}>
        <Link to="/" style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>
          Back to DamCash
        </Link>

        <header style={{ display: 'grid', gap: 8 }}>
          <div style={{ color: 'var(--text-3)', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 800 }}>
            DamCash Legal
          </div>
          <h1 style={{ margin: 0, fontSize: 34 }}>{isPrivacy ? 'Privacy Policy' : 'Terms of Service'}</h1>
          <p style={{ color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
            Last updated May 5, 2026. This page is a product notice and should be reviewed by qualified legal counsel before public real-money launch.
          </p>
        </header>

        {isPrivacy ? (
          <>
            <Section title="Information We Collect">
              DamCash may collect account details, gameplay records, wallet ledger entries, moderation reports, device/session data, and messages needed to operate the service.
            </Section>
            <Section title="How We Use Information">
              We use information to authenticate users, run games and tournaments, maintain ratings and stats, process wallet events, prevent abuse, and support safety reviews.
            </Section>
            <Section title="Payments And Compliance">
              Payment providers may process deposits or withdrawals. DamCash should keep audit records for wallet, betting, refund, dispute, and moderation events.
            </Section>
            <Section title="Data Retention">
              Game records, wallet history, tournament results, and safety audit records may be retained long term for integrity, compliance, and dispute resolution.
            </Section>
          </>
        ) : (
          <>
            <Section title="Eligibility">
              You must be 18 or older, or the legal gambling age in your jurisdiction, whichever is higher. You are responsible for confirming that wagering is legal where you live.
            </Section>
            <Section title="Gameplay And Fair Play">
              Players must not cheat, manipulate results, abuse reconnection behavior, harass other users, or exploit bugs. DamCash may review suspicious games or payments.
            </Section>
            <Section title="Wallet And Wagering">
              Wallet balances, deposits, withdrawals, entry fees, stakes, refunds, and payouts must be recorded in the server ledger. Real-money features require payment, compliance, and legal review before scaling.
            </Section>
            <Section title="Responsible Play">
              Play within your limits. If gambling is causing problems, pause play and seek support from a responsible gambling organization in your country.
            </Section>
          </>
        )}
      </div>
    </main>
  );
};
