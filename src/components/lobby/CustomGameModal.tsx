import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import '../../styles/custom-modal.css';
import { useUniverseStore } from '../../stores';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (tc: string, mode: 'online' | 'computer', color: 'white' | 'black' | 'random') => void;
}

// ── Piece SVGs (inline, Lichess-style) ────────────────────────────────────────

const PieceSVG: React.FC<{ color: 'white' | 'black' | 'random'; universe: string }> = ({ color, universe }) => {
  if (universe === 'checkers') {
    // Draughts puck
    const fill = color === 'white' ? '#e8e8e8' : color === 'black' ? '#222' : '#888';
    const stroke = color === 'white' ? '#aaa' : color === 'black' ? '#555' : '#666';
    return (
      <svg viewBox="0 0 80 50" width="72" height="44">
        <ellipse cx="40" cy="38" rx="38" ry="10" fill="rgba(0,0,0,0.15)" />
        <ellipse cx="40" cy="22" rx="36" ry="12" fill={stroke} />
        <ellipse cx="40" cy="18" rx="36" ry="12" fill={fill} />
        <ellipse cx="40" cy="14" rx="28" ry="7" fill="rgba(255,255,255,0.18)" />
      </svg>
    );
  }
  // Chess king silhouette
  const fill   = color === 'white' ? '#fff' : color === 'black' ? '#222' : '#888';
  const stroke = color === 'white' ? '#999' : color === 'black' ? '#555' : '#aaa';
  return (
    <svg viewBox="0 0 45 45" width="52" height="52">
      <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22.5 11.63V6M20 8h5" strokeWidth="2" />
        <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" />
        <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V17s-5.5-1-11 5c-1.5 3.5 5 5.5 5 5.5V37z" />
        <path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0" />
      </g>
    </svg>
  );
};

// ── Time category helper ──────────────────────────────────────────────────────

function getCategory(minutes: number): { labelKey: string; color: string } {
  if (minutes < 3)  return { labelKey: 'time.bullet',    color: '#ef4444' };
  if (minutes < 8)  return { labelKey: 'time.blitz',     color: '#f59e0b' };
  if (minutes < 25) return { labelKey: 'time.rapid',     color: '#22c55e' };
  return             { labelKey: 'time.classical', color: '#3b82f6' };
}

// ── Component ─────────────────────────────────────────────────────────────────

export const CustomGameModal: React.FC<Props> = ({ open, onClose, onConfirm }) => {
  const { t } = useTranslation();
  const { universe } = useUniverseStore();
  const [minutes,   setMinutes]   = useState(3);
  const [increment, setIncrement] = useState(0);
  const [color,     setColor]     = useState<'white' | 'black' | 'random'>('random');
  const [timeMode,  setTimeMode]  = useState<'realtime' | 'correspondence'>('realtime');
  const [variant,   setVariant]   = useState('Standard');

  const cat = getCategory(minutes);
  const tc  = `${minutes}+${increment}`;

  const handleConfirm = useCallback(() => {
    onConfirm(tc, 'online', color);
    onClose();
  }, [tc, color, onConfirm, onClose]);

  const handleComputer = useCallback(() => {
    onConfirm(tc, 'computer', color);
    onClose();
  }, [tc, color, onConfirm, onClose]);

  if (!open) return null;

  const COLOR_OPTIONS: { key: 'black' | 'random' | 'white'; label: string }[] = [
    { key: 'black',  label: t('common.black')      },
    { key: 'random', label: t('createGame.random') },
    { key: 'white',  label: t('common.white')      },
  ];

  return (
    <div className="custom-modal-backdrop" onClick={onClose}>
      <div className="custom-modal" onClick={(e) => e.stopPropagation()}>

        {/* Close button */}
        <button className="custom-modal-close" onClick={onClose}>×</button>

        {/* Title */}
        <h2 className="custom-modal-title">{t('nav.createGame')}</h2>

        {/* ── Variant ── */}
        <div className="custom-field-row">
          <label className="custom-field-label">{t('createGame.variant')}</label>
          <select
            className="custom-select"
            value={variant}
            onChange={e => setVariant(e.target.value)}
          >
            <option>Standard</option>
            {universe === 'checkers' ? (
              <>
                <option>International (10×10)</option>
                <option>Frisian</option>
              </>
            ) : (
              <>
                <option>Chess960</option>
                <option>King of the Hill</option>
                <option>Three-check</option>
              </>
            )}
          </select>
        </div>

        <hr className="custom-divider" />

        {/* ── Time control type ── */}
        <div className="custom-field-row">
          <label className="custom-field-label">{t('tournament.timeControl')}</label>
          <select
            className="custom-select"
            value={timeMode}
            onChange={e => setTimeMode(e.target.value as any)}
          >
            <option value="realtime">{t('createGame.realTime')}</option>
            <option value="correspondence">{t('lobby.correspondence')}</option>
          </select>
        </div>

        {/* ── Sliders ── */}
        {timeMode === 'realtime' && (
          <div className="custom-sliders">
            {/* Minutes per side */}
            <div className="custom-slider-group">
              <div className="custom-slider-label">
                {t('createGame.minutesPerSide')}: <strong>{minutes}</strong>
                <span className="custom-cat-pill" style={{ background: cat.color + '25', color: cat.color }}>
                  {t(cat.labelKey)}
                </span>
              </div>
              <div className="custom-slider-track-wrap">
                <input
                  type="range"
                  min={1} max={60} step={1}
                  value={minutes}
                  onChange={e => setMinutes(Number(e.target.value))}
                  className="custom-slider"
                  style={{ '--pct': `${((minutes - 1) / 59) * 100}%` } as React.CSSProperties}
                />
              </div>
            </div>

            {/* Increment */}
            <div className="custom-slider-group">
              <div className="custom-slider-label">
                {t('createGame.incrementSeconds')}: <strong>{increment}</strong>
              </div>
              <div className="custom-slider-track-wrap">
                <input
                  type="range"
                  min={0} max={60} step={1}
                  value={increment}
                  onChange={e => setIncrement(Number(e.target.value))}
                  className="custom-slider"
                  style={{ '--pct': `${(increment / 60) * 100}%` } as React.CSSProperties}
                />
              </div>
            </div>

            <div className="custom-tc-preview" style={{ borderColor: cat.color }}>
              <span style={{ color: cat.color, fontWeight: 800 }}>{tc}</span>
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{t(cat.labelKey)}</span>
            </div>
          </div>
        )}

        {timeMode === 'correspondence' && (
          <div className="custom-corr-note">
            <strong>{t('lobby.correspondence')}</strong> - {t('correspondence.startNewGame')}
          </div>
        )}

        <hr className="custom-divider" />

        {/* ── Color picker ── */}
        <div className="custom-color-row">
          {COLOR_OPTIONS.map(opt => (
            <button
              key={opt.key}
              className={`custom-color-btn ${color === opt.key ? 'active' : ''}`}
              onClick={() => setColor(opt.key)}
            >
              <div className="custom-piece-wrap">
                <PieceSVG color={opt.key} universe={universe} />
              </div>
              <span className="custom-color-label">{opt.label}</span>
            </button>
          ))}
        </div>

        {/* ── Actions ── */}
        <div className="custom-modal-actions">
          <button className="btn custom-btn-computer" onClick={handleComputer}>
            {t('createGame.vsComputer')}
          </button>
          <button className="btn custom-btn-online" onClick={handleConfirm}>
            {t('createGame.findOpponent')}
          </button>
        </div>
      </div>
    </div>
  );
};
