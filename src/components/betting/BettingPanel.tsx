import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBettingStore, useUserStore, useNotificationStore } from '../../stores';
import { useSound } from '../../hooks/useSound';

const QUICK_AMOUNTS = [5, 10, 25, 50];

export const BettingPanel: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const { activeBet, betHistory, placeBet, cancelBet } = useBettingStore();
  const { addNotification } = useNotificationStore();
  const { play } = useSound();
  const [amount, setAmount] = useState(10);
  /** null = input phase, 'confirm' = waiting for explicit confirmation */
  const [step, setStep] = useState<'input' | 'confirm'>('input');

  const handleRequestBet = () => {
    if (!user) return;
    if (amount > user.walletBalance) {
      addNotification(t('betting.insufficientFunds'), 'error');
      return;
    }
    if (amount <= 0) return;
    // Move to confirm step — don't place yet
    setStep('confirm');
  };

  const handleConfirmBet = () => {
    if (!user) return;
    placeBet(amount, user.id);
    play('betPlaced');
    addNotification(t('betting.betPlaced'), 'success');
    setStep('input');
  };

  const handleCancelConfirm = () => setStep('input');

  const handleCancelBet = () => {
    cancelBet();
    addNotification(t('betting.refunded'), 'info');
  };

  const platformFee  = amount * 2 * 0.05;
  const potentialWin = amount * 2 * (1 - 0.05);

  return (
    <div className="betting-panel">
      {activeBet ? (
        // ── Active bet ────────────────────────────────────────
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="active-bet-display">
            <div className="active-bet-amount">${activeBet.amount.toFixed(2)}</div>
            <div className="active-bet-label">
              {activeBet.status === 'pending'
                ? t('betting.pending') + ' — ' + t('betting.escrow')
                : t('betting.active')}
            </div>
          </div>
          <div className="bet-info-row">
            <span>{t('betting.potentialWin')}</span>
            <span className="value positive">
              ${((activeBet.amount * 2) * 0.95).toFixed(2)}
            </span>
          </div>
          {activeBet.status === 'pending' && (
            <button className="btn btn-danger btn-full btn-sm" onClick={handleCancelBet}>
              {t('betting.cancelBet')}
            </button>
          )}
        </div>
      ) : step === 'confirm' ? (
        // ── Confirmation step ─────────────────────────────────
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)',
            borderRadius: 10, padding: '14px 16px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, marginBottom: 4, letterSpacing: '0.5px' }}>
              ⚠️ CONFIRM YOUR BET
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#fbbf24', letterSpacing: '-1px' }}>
              ${amount.toFixed(2)}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
              Win <strong style={{ color: '#6fcf97' }}>${potentialWin.toFixed(2)}</strong> · Fee <strong>${platformFee.toFixed(2)}</strong> · Balance after: <strong>${(user!.walletBalance - amount).toFixed(2)}</strong>
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
            This amount will be locked in escrow until the game ends. Are you sure?
          </div>
          <button
            className="btn btn-primary btn-full"
            onClick={handleConfirmBet}
            style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#000', fontWeight: 800 }}
          >
            ✅ Yes, place ${amount} bet
          </button>
          <button
            className="btn btn-full btn-sm"
            onClick={handleCancelConfirm}
            style={{ background: 'transparent', border: '1px solid #2a2a40', color: '#94a3b8' }}
          >
            ✕ Cancel
          </button>
        </div>
      ) : (
        // ── Amount input ──────────────────────────────────────
        <div>
          <div className="bet-quick-amounts">
            {QUICK_AMOUNTS.map((a) => (
              <div
                key={a}
                className={`bet-quick${amount === a ? ' active' : ''}`}
                onClick={() => setAmount(a)}
              >
                ${a}
              </div>
            ))}
          </div>

          <input
            type="number"
            className="amount-input"
            value={amount}
            min={1}
            max={user?.walletBalance ?? 1000}
            onChange={(e) => {
              const val = Number(e.target.value);
              const maxBal = user?.walletBalance ?? 0;
              setAmount(Math.max(1, Math.min(val, maxBal)));
            }}
          />
          {amount > (user?.walletBalance ?? 0) && (
            <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>
              {t('betting.exceedsBalance', 'Amount exceeds your balance')}
            </div>
          )}
          {(user?.walletBalance ?? 0) === 0 && (
            <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 2 }}>
              {t('betting.zeroBalance', 'Your balance is $0 — deposit funds to bet')}
            </div>
          )}

          <div className="bet-info-row">
            <span>{t('betting.platformFee')}</span>
            <span className="value">${platformFee.toFixed(2)} (5%)</span>
          </div>
          <div className="bet-info-row">
            <span>{t('betting.potentialWin')}</span>
            <span className="value positive">${potentialWin.toFixed(2)}</span>
          </div>
          <div className="bet-info-row">
            <span>{t('betting.balance')}</span>
            <span className="value">${Number(user?.walletBalance ?? 0).toFixed(2)}</span>
          </div>

          <div className="divider" />

          <button
            className="btn btn-primary btn-full"
            onClick={handleRequestBet}
            disabled={!user || amount > (user?.walletBalance ?? 0) || amount <= 0}
          >
            💰 {t('betting.placeBet')} ${amount}
          </button>
        </div>
      )}

      {/* Bet history */}
      {betHistory.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="panel-title" style={{ marginBottom: 6 }}>{t('betting.betHistory')}</div>
          {betHistory.slice(0, 5).map((b) => (
            <div key={b.id} className="bet-hist-item">
              <span className="text-muted text-xs">${b.amount}</span>
              <span className={`result-badge result-${b.status === 'won' ? 'win' : b.status === 'lost' ? 'loss' : 'draw'}`}>
                {t(`betting.${b.status}`)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
