import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUniverseStore } from '../../stores';

// Tiny inline static board — just for the popover thumbnail
const PopoverBoard: React.FC<{ universe: 'chess' | 'checkers' }> = ({ universe }) => {
  const size  = universe === 'chess' ? 8 : 10;
  const light = universe === 'chess' ? '#f0d9b5' : '#f5e6c8';
  const dark  = universe === 'chess' ? '#b58863' : '#7a3f1e';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${size}, 1fr)`, width: '100%', height: '100%' }}>
      {Array.from({ length: size * size }).map((_, i) => {
        const row = Math.floor(i / size);
        const col = i % size;
        const isLight = (row + col) % 2 === 0;
        let hasPiece = false, isWhite = false;
        if (universe === 'chess') {
          if (row <= 1) { hasPiece = true; isWhite = false; }
          else if (row >= 6) { hasPiece = true; isWhite = true; }
        } else if (!isLight) {
          if (row <= 3) { hasPiece = true; isWhite = false; }
          else if (row >= 6) { hasPiece = true; isWhite = true; }
        }
        return (
          <div key={i} style={{ background: isLight ? light : dark, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {hasPiece && (
              <div style={{ width: '65%', height: '65%', borderRadius: '50%', background: isWhite ? '#fff' : '#222', boxShadow: '0 1px 2px rgba(0,0,0,0.4)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
};

interface Player { name: string; rating?: number; }
interface Props  { player: Player; children: React.ReactNode; }

export const PlayerPopover: React.FC<Props> = ({ player, children }) => {
  const [show, setShow] = useState(false);
  const { universe } = useUniverseStore();
  const navigate = useNavigate();

  return (
    <div
      style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="player-popover" style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 99999,
          background: 'var(--bg-1)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 12, minWidth: 200,
          boxShadow: 'var(--shadow)', marginTop: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
            <strong style={{ fontSize: 14 }}>{player.name}</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
            {[
              { label: 'Blitz',  val: player.rating || 1500 },
              { label: 'Rapid',  val: (player.rating || 1500) - 80 },
              { label: 'Bullet', val: (player.rating || 1500) + 60 },
            ].map(({ label, val }) => (
              <div key={label} style={{ background: 'var(--bg-2)', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{val}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ width: '100%', aspectRatio: '1', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <PopoverBoard universe={universe} />
          </div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ width: '100%', marginTop: 8, fontSize: 11 }}
            onClick={(e) => { e.stopPropagation(); navigate(`/profile/${player.name}`); setShow(false); }}
          >
            👤 View profile
          </button>
        </div>
      )}
    </div>
  );
};
