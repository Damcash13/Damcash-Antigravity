import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { useUserStore, useNotificationStore } from '../../stores';
import { api, ApiTransaction } from '../../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const WalletModal: React.FC<Props> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const { user, isLoggedIn, setWalletBalance } = useUserStore();
  const { addNotification } = useNotificationStore();
  const [depositAmount, setDepositAmount] = useState(50);
  const [tab, setTab] = useState<'balance' | 'history'>('balance');
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState('');

  const [loading, setLoading] = useState(false);

  const refreshWalletLedger = useCallback(async () => {
    if (!user?.id) return;
    setTxLoading(true);
    setTxError('');
    try {
      const [wallet, txns] = await Promise.all([
        api.wallet.get(),
        api.wallet.transactions(),
      ]);
      setWalletBalance(Number(wallet.balance));
      setTransactions(txns);
    } catch (err: any) {
      setTxError(err?.message || 'Could not load wallet history. Refresh or try again in a few seconds.');
    } finally {
      setTxLoading(false);
    }
  }, [setWalletBalance, user?.id]);

  useEffect(() => {
    if (open) refreshWalletLedger();
  }, [open, refreshWalletLedger]);

  const handleDeposit = async () => {
    if (depositAmount < 5 || depositAmount > 10000) {
      addNotification('Deposit amount must be between $5 and $10,000.', 'error');
      return;
    }
    setLoading(true);
    try {
      const result = await api.wallet.stripeCheckout(depositAmount);
      if (result.url) {
        addNotification('Redirecting to secure checkout. Your wallet changes only after payment is verified.', 'info');
        window.location.href = result.url;
      } else {
        throw new Error('Payment checkout did not return a secure checkout URL. No funds were changed.');
      }
    } catch (err: any) {
      addNotification(err?.message || 'Deposit unavailable. No funds were changed; please try again later.', 'error');
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
      const wallet = await api.wallet.withdraw(depositAmount);
      setWalletBalance(Number(wallet.balance));
      addNotification(`${t('betting.withdrawalRequested', { amount: depositAmount })}. Balance updated and audit entry recorded.`, 'info');
      await refreshWalletLedger();
    } catch (err: any) {
      addNotification(err?.message || 'Withdrawal failed. No funds were changed; please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (amount: number | string) => {
    const value = Number(amount);
    return `${value >= 0 ? '+' : '-'}$${Math.abs(value).toFixed(2)}`;
  };

  const transactionLabel = (type: string) => {
    const labels: Record<string, { label: string; detail: string }> = {
      DEPOSIT: { label: 'Deposit verified', detail: 'Funds added after payment confirmation.' },
      WITHDRAWAL: { label: 'Withdrawal recorded', detail: 'Funds removed from wallet balance.' },
      BET_PLACED: { label: 'Bet escrowed', detail: 'Stake locked for an active money game.' },
      BET_WON: { label: 'Bet payout', detail: 'Winnings paid from settled escrow.' },
      BET_REFUND: { label: 'Bet refund', detail: 'Stake returned after draw or cancelled game.' },
      TOURNAMENT_ENTRY: { label: 'Tournament entry', detail: 'Entry fee added to the prize pool.' },
      TOURNAMENT_REFUND: { label: 'Tournament refund', detail: 'Entry fee returned before tournament start.' },
    };
    return labels[type] ?? { label: type.replace(/_/g, ' '), detail: 'Wallet ledger event.' };
  };

  const handleReviewTransaction = async (tx: ApiTransaction) => {
    if (!isLoggedIn) {
      addNotification('Sign in to request a wallet review.', 'warning');
      return;
    }
    try {
      await api.safety.review({
        reason: 'suspicious_payment',
        paymentId: tx.stripeSessionId || tx.id,
        matchId: tx.matchId || undefined,
        notes: `Wallet review requested for ${tx.type} transaction ${tx.id}.`,
      });
      addNotification('Wallet review request recorded for admins.', 'success');
    } catch (err: any) {
      addNotification(err?.message || 'Could not request wallet review. Please try again.', 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="💰 Wallet" maxWidth={520}>
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

      <div style={{
        background: 'rgba(245,158,11,0.08)',
        border: '1px solid rgba(245,158,11,0.24)',
        borderRadius: 'var(--radius)',
        padding: 12,
        marginBottom: 16,
        color: 'var(--text-2)',
        fontSize: 12,
        lineHeight: 1.5,
      }}>
        <strong style={{ color: '#f59e0b' }}>Money safety:</strong> balance changes are server-recorded only. Bet stakes are escrowed, draws/cancelled games are refunded, and every wallet event appears in the audit history below. Real-money scaling still needs compliance and legal review.
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
        >📜 {t('betting.historyTab')} ({transactions.length})</button>
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
          <div style={{ marginTop: 12, display: 'grid', gap: 8, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>
            <div>Deposits redirect to secure checkout and are credited only after payment verification.</div>
            <div>Withdrawals are recorded immediately in the ledger; external payout processing must be reviewed before public real-money scale.</div>
            <div>Money games use escrow: both stakes are locked at game start, winner receives the settled payout, and draws/cancelled games refund the stake.</div>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto', paddingRight: 4, animation: 'fadeIn 0.2s ease' }}>
          {txLoading ? (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div className="spinner" />
              <div style={{ marginTop: 10, color: 'var(--text-3)', fontSize: 13 }}>Loading wallet audit history…</div>
            </div>
          ) : txError ? (
            <div style={{ padding: 16, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, color: 'var(--text-2)', fontSize: 13, lineHeight: 1.5 }}>
              <strong style={{ color: '#ef4444' }}>Could not load wallet history.</strong>
              <div>{txError}</div>
              <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={refreshWalletLedger}>Try again</button>
            </div>
          ) : transactions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 12px', color: 'var(--text-3)', fontSize: 13, lineHeight: 1.5 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📜</div>
              <strong style={{ color: 'var(--text-2)' }}>No wallet activity yet.</strong>
              <div>Deposits, withdrawals, bet escrow, payouts, refunds, and tournament entry fees will appear here with timestamps.</div>
            </div>
          ) : (
            transactions.map((tx) => {
              const amount = Number(tx.amount);
              const positive = amount >= 0;
              const info = transactionLabel(tx.type);
              const linkedId = tx.matchId
                ? tx.type.startsWith('TOURNAMENT') ? ` · Tournament ${tx.matchId.slice(0, 8)}` : ` · Match ${tx.matchId.slice(0, 8)}`
                : '';
              const stripeId = tx.stripeSessionId ? ` · Stripe ${tx.stripeSessionId.slice(-8)}` : '';
              return (
                <div key={tx.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                      {info.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {info.detail}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                      {new Date(tx.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {linkedId}
                      {stripeId}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: positive ? '#22c55e' : '#ef4444' }}>
                      {formatMoney(tx.amount)}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', background: tx.status === 'COMPLETED' ? 'rgba(34,197,94,0.15)' : 'var(--bg-3)', color: tx.status === 'COMPLETED' ? '#22c55e' : 'var(--text-3)', padding: '2px 6px', borderRadius: 4 }}>
                      {tx.status}
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 10, padding: '2px 6px' }}
                      onClick={() => handleReviewTransaction(tx)}
                    >
                      Review
                    </button>
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
