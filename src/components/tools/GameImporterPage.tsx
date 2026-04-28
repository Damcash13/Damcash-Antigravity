import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import { useAnalysisStore, analyseGame } from '../../stores/analysisStore';
import { useUniverseStore } from '../../stores';

function parsePgn(pgn: string): { sans: string[]; white: string; black: string; result: string; startFen: string } | null {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn.trim());
    const header = chess.header();
    const sans = chess.history();
    if (sans.length === 0) return null;
    return {
      sans,
      white: header['White'] || 'White',
      black: header['Black'] || 'Black',
      result: header['Result'] || '*',
      startFen: header['FEN'] || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    };
  } catch {
    return null;
  }
}

const SAMPLE_PGN = `[Event "Casual Game"]
[White "Magnus"]
[Black "Hikaru"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O dxc3
8. Qb3 Qf6 9. e5 Qg6 10. Nxc3 Nge7 11. Ba3 O-O 12. Rfe1 d6 13. exd6 cxd6
14. Nb5 d5 15. Bxd5 Nxd5 16. Nxd5 Bxd2 17. Nxd2 f5 18. Nxe7+ Qxe7
19. Rxe7 Bxb3 20. axb3 1-0`;

export const GameImporterPage: React.FC = () => {
  const navigate = useNavigate();
  const { universe } = useUniverseStore();
  const { saveGame, setCurrentGame } = useAnalysisStore();

  const [pgn, setPgn] = useState('');
  const [error, setError] = useState('');
  const [imported, setImported] = useState(false);

  const handleImport = () => {
    setError('');
    const parsed = parsePgn(pgn);
    if (!parsed) {
      setError('Invalid PGN — please check the format and try again.');
      return;
    }
    const game = analyseGame(parsed.sans, parsed.startFen, parsed.white, parsed.black, '?+?', parsed.result);
    saveGame(game);
    setCurrentGame(game);
    setImported(true);
  };

  const handleAnalyse = () => {
    navigate(`/${universe}/analysis`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '20px 0', maxWidth: 640, margin: '0 auto' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 4 }}>⚙️ Game Importer</h2>
        <p style={{ color: 'var(--text-2)', fontSize: 14 }}>
          Paste a PGN game to import it and open it in the analysis board.
        </p>
      </div>

      <div style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>
          Paste PGN
        </div>
        <textarea
          value={pgn}
          onChange={e => { setPgn(e.target.value); setError(''); setImported(false); }}
          placeholder={SAMPLE_PGN}
          rows={14}
          style={{
            width: '100%', background: 'var(--bg-3)', border: `1px solid ${error ? '#ef4444' : 'var(--border)'}`,
            borderRadius: 6, color: 'var(--text-1)', padding: 10, fontSize: 12,
            fontFamily: 'monospace', resize: 'vertical', lineHeight: 1.5,
          }}
        />
        {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={!pgn.trim()}
            style={{ flex: 1, minWidth: 120 }}
          >
            Import game
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { setPgn(SAMPLE_PGN); setError(''); setImported(false); }}
          >
            Load sample
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setPgn(''); setError(''); setImported(false); }}
          >
            Clear
          </button>
        </div>
      </div>

      {imported && (
        <div style={{
          width: '100%', background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e',
          borderRadius: 10, padding: 16, textAlign: 'center',
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#22c55e', marginBottom: 8 }}>✓ Game imported successfully!</div>
          <button className="btn btn-primary" onClick={handleAnalyse}>
            ▶ Open in Analysis Board
          </button>
        </div>
      )}

      <div style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>
          PGN Format Guide
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.8 }}>
          <div>• Headers like <code style={{ color: 'var(--accent)' }}>[White "Name"]</code> are optional but recommended</div>
          <div>• Moves must be in Standard Algebraic Notation (SAN): e4, Nf3, O-O etc.</div>
          <div>• Comments in braces <code style={{ color: 'var(--accent)' }}>{'{'}comment{'}'}</code> and variations in parentheses are supported</div>
          <div>• The result token (1-0, 0-1, 1/2-1/2, *) can appear at the end</div>
        </div>
      </div>

      <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/${universe}`)}>← Back to lobby</button>
    </div>
  );
};
