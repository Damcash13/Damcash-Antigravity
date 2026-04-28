import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAnalysisStore } from '../../stores/analysisStore';
import { useUniverseStore } from '../../stores';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function classColor(cls: string): string {
  switch (cls) {
    case 'brilliant': return '#00b4d8';
    case 'great':     return '#3b82f6';
    case 'best':      return '#22c55e';
    case 'good':      return '#84cc16';
    case 'inaccuracy': return '#f59e0b';
    case 'mistake':   return '#f97316';
    case 'blunder':   return '#ef4444';
    default:          return 'var(--text-3)';
  }
}

export const MyStudiesPage: React.FC = () => {
  const navigate = useNavigate();
  const { universe } = useUniverseStore();
  const { games, setCurrentGame } = useAnalysisStore();

  const open = (id: string) => {
    const g = games.find(g => g.id === id);
    if (g) { setCurrentGame(g); navigate(`/${universe}/analysis`); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '20px 0', maxWidth: 700, margin: '0 auto' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 4 }}>🗂️ My Studies</h2>
        <p style={{ color: 'var(--text-2)', fontSize: 14 }}>
          Your saved and analysed games. Click any game to open it in the analysis board.
        </p>
      </div>

      {games.length === 0 ? (
        <div style={{
          width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🗂️</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>No studies yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>
            Games you analyse or import will appear here automatically.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={() => navigate(`/${universe}/analysis`)}>
              Open Analysis Board
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/chess/import`)}>
              Import a PGN
            </button>
          </div>
        </div>
      ) : (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {games.map(game => {
            const blunders = game.moves.filter(m => m.class === 'blunder').length;
            const mistakes = game.moves.filter(m => m.class === 'mistake').length;
            return (
              <div
                key={game.id}
                onClick={() => open(game.id)}
                style={{
                  background: 'var(--bg-2)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: 12, transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 800 }}>{game.white}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>vs</span>
                    <span style={{ fontSize: 15, fontWeight: 800 }}>{game.black}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                      background: game.result === '1-0' ? 'rgba(34,197,94,0.15)' : game.result === '0-1' ? 'rgba(239,68,68,0.15)' : 'var(--bg-3)',
                      color: game.result === '1-0' ? '#22c55e' : game.result === '0-1' ? '#ef4444' : 'var(--text-3)',
                    }}>
                      {game.result}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>{formatDate(game.playedAt)}</span>
                    <span>{game.tc} · {game.moves.length} moves</span>
                    {blunders > 0 && <span style={{ color: classColor('blunder') }}>{blunders} blunder{blunders > 1 ? 's' : ''}</span>}
                    {mistakes > 0 && <span style={{ color: classColor('mistake') }}>{mistakes} mistake{mistakes > 1 ? 's' : ''}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#f0d9b5' }}>{game.whiteAccuracy}%</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>White</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#b58863' }}>{game.blackAccuracy}%</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Black</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/${universe}`)}>← Back to lobby</button>
    </div>
  );
};
