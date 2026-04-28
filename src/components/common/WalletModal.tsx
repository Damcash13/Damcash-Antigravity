import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { useUserStore, useBettingStore, useNotificationStore } from '../../stores';
import { api } from '../../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const WalletModal: React.FC<Props> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const { user, updateBalance } = useUserStore();
  const { betHistory } = useBettingStore();
  const { addNotification } = useNotificationStore();
  const [depositAmount, setDepositAmount] = useState(50);
  const [tab, setTab] = useState<'balance' | 'history'>('balance');

  const [loading, setLoading] = useState(false);

  const handleDeposit = async () => {
    setLoading(true);
    try {
      const result = await api.wallet.stripeCheckout(depositAmount);
      if (result.url) {
        // Redirect to Stripe Checkout
        window.location.href = result.url;
      } else {
        // Stripe not configured — fall back to mock deposit
        updateBalance(depositAmount);
        addNotification(t('betting.depositSuccess', { amount: depositAmount }), 'success');
      }
    } catch {
      updateBalance(depositAmount);
      addNotification(t('betting.depositSuccess', { amount: depositAmount }), 'success');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!user || depositAmount > user.walletBalance) {
      addNotification(t('betting.insufficientFunds'), 'error');
      return;
    }
    setLoading(true);
    try {
      await api.wallet.withdraw(depositAmount);
      updateBalance(-depositAmount);
      addNotification(t('betting.withdrawalRequested', { amount: depositAmount }), 'info');
    } catch {
      addNotification(t('betting.withdrawalFailed') || 'Withdrawal failed. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="💰 Wallet" maxWidth={400}>
      {/* Balance display */}
      <div style={{
        background: 'var(--bg-2)',
        borderRadius: 'var(--radius-lg)',
        padding: 20,
        textAlign: 'center',
        marginBottom: 16,
        border: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>{t('betting.balance')}</div>
        <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--accent)' }}>
          ${Number(user?.walletBalance ?? 0).toFixed(2)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>USD</div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {[
          { label: t('profile.betsWon'), value: user?.betsWon || 0, color: 'var(--accent)' },
          { label: t('profile.betLost'), value: user?.betsLost || 0, color: 'var(--danger)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: 'var(--bg-2)',
            borderRadius: 'var(--radius)',
            padding: 12,
            textAlign: 'center',
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Toggle Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg-2)', padding: 4, borderRadius: 'var(--radius)' }}>
        <button
          style={{ flex: 1, padding: '6px 12px', border: 'none', background: tab === 'balance' ? 'var(--bg-card)' : 'transparent', color: tab === 'balance' ? 'var(--text-1)' : 'var(--text-3)', fontWeight: tab === 'balance' ? 700 : 500, borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all 0.15s', boxShadow: tab === 'balance' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none' }}
          onClick={() => setTab('balance')}
        >💳 {t('betting.cashier')}</button>
        <button
          style={{ flex: 1, padding: '6px 12px', border: 'none', background: tab === 'history' ? 'var(--bg-card)' : 'transparent', color: tab === 'history' ? 'var(--text-1)' : 'var(--text-3)', fontWeight: tab === 'history' ? 700 : 500, borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all 0.15s', boxShadow: tab === 'history' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none' }}
          onClick={() => setTab('history')}
        >📜 {t('betting.historyTab')} ({betHistory.length})</button>
      </div>

      {tab === 'balance' && (
        <div style={{ animation: 'fadeIn 0.2s ease' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('betting.actionDetails')}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{ position: 'absolute', left: 12, top: 9, color: 'var(--text-3)', fontWeight: 800 }}>$</span>
              <input
                type="number"
                value={depositAmount}
                min={5} max={10000}
                onChange={e => setDepositAmount(Number(e.target.value))}
                style={{
                  width: '100%', padding: '8px 12px 8px 24px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-1)', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-base)', outline: 'none'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[25, 50, 100].map(amt => (
                <button
                  key={amt}
                  onClick={() => setDepositAmount(amt)}
                  style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-2)', padding: '0 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'border 0.15s' }}
                >
                  ${amt}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1, padding: '12px 0' }} onClick={handleDeposit} disabled={loading}>
              {loading ? '…' : `↑ ${t('betting.deposit')}`}
            </button>
            <button
              className="btn btn-secondary"
              style={{ flex: 1, padding: '12px 0', opacity: depositAmount > (user?.walletBalance || 0) ? 0.5 : 1 }}
              onClick={handleWithdraw}
              disabled={loading}
            >
              ↓ {t('betting.withdraw')}
            </button>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto', paddingRight: 4, animation: 'fadeIn 0.2s ease' }}>
          {betHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-3)', fontSize: 13 }}>
              {t('betting.noBets')}
            </div>
          ) : (
            betHistory.map((bet, i) => {
              const pnl = bet.status === 'won' ? (bet.amount * 2 * 0.95) - bet.amount : (bet.status === 'lost' ? -bet.amount : 0);
              const isWin = pnl > 0;
              const isLoss = pnl < 0;
              
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                      {t('betting.wagered', { amount: bet.amount })}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {new Date(parseInt(bet.id.replace('bet-', ''))).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: isWin ? '#22c55e' : isLoss ? '#ef4444' : 'var(--text-3)' }}>
                      {isWin ? '+' : ''}{pnl !== 0 ? `$${Math.abs(pnl).toFixed(2)}` : '$0.00'}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', background: isWin ? 'rgba(34,197,94,0.15)' : isLoss ? 'rgba(239,68,68,0.15)' : 'var(--bg-3)', color: isWin ? '#22c55e' : isLoss ? '#ef4444' : 'var(--text-3)', padding: '2px 6px', borderRadius: 4 }}>
                      {bet.status}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </Modal>
  );
};
