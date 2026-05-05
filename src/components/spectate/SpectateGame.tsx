import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import { socket } from '../../lib/socket';
import { useUniverseStore } from '../../stores';
import { createInitialBoard, applyMove } from '../../engines/draughts.engine';
import { DraughtsBoard as DraughtsBoardType, DraughtsMove } from '../../types';

// ── Mini read-only chess board ────────────────────────────────────────────────
const CHESS_PIECES: Record<string, string> = {
  wk: '/pieces/wk.svg?v=3', wq: '/pieces/wq.svg?v=3', wr: '/pieces/wr.svg?v=3',
  wb: '/pieces/wb.svg?v=3', wn: '/pieces/wn.svg?v=3', wp: '/pieces/wp.svg?v=3',
  bk: '/pieces/bk.svg?v=3', bq: '/pieces/bq.svg?v=3', br: '/pieces/br.svg?v=3',
  bb: '/pieces/bb.svg?v=3', bn: '/pieces/bn.svg?v=3', bp: '/pieces/bp.svg?v=3',
};

const CELL = 72;

const ChessSpectateBoard: React.FC<{ fen: string }> = ({ fen }) => {
  let chess: Chess;
  try { chess = new Chess(fen); } catch { chess = new Chess(); }

  const ranks = ['8','7','6','5','4','3','2','1'];
  const files = ['a','b','c','d','e','f','g','h'];

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(8, ${CELL}px)`,
      gridTemplateRows: `repeat(8, ${CELL}px)`,
      border: '2px solid #555', borderRadius: 4, overflow: 'hidden',
    }}>
      {ranks.map((rank, ri) => files.map((file, fi) => {
        const isLight = (ri + fi) % 2 === 0;
        const sq = `${file}${rank}` as any;
        const piece = chess.get(sq);
        const key = piece ? `${piece.color}${piece.type}` : null;
        return (
          <div key={sq} style={{
            width: CELL, height: CELL,
            background: isLight ? '#f0d9b5' : '#b58863',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
          }}>
            {/* Coordinate labels */}
            {fi === 0 && <span style={{ position: 'absolute', top: 2, left: 3, fontSize: 10, color: isLight ? '#b58863' : '#f0d9b5', fontWeight: 700 }}>{rank}</span>}
            {ri === 7 && <span style={{ position: 'absolute', bottom: 2, right: 3, fontSize: 10, color: isLight ? '#b58863' : '#f0d9b5', fontWeight: 700 }}>{file}</span>}
            {key && CHESS_PIECES[key] && (
              <img src={CHESS_PIECES[key]} alt={key} style={{ width: '88%', height: '88%', pointerEvents: 'none' }} />
            )}
          </div>
        );
      }))}
    </div>
  );
};

const DraughtsSpectateBoard: React.FC<{ board: DraughtsBoardType }> = ({ board }) => {
  const DCELL = 64;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(10, ${DCELL}px)`,
      gridTemplateRows: `repeat(10, ${DCELL}px)`,
      border: '2px solid #555', borderRadius: 4, overflow: 'hidden',
    }}>
      {Array.from({ length: 10 }, (_, row) =>
        Array.from({ length: 10 }, (_, col) => {
          const isLight = (row + col) % 2 === 0;
          const piece = board[row]?.[col];
          return (
            <div key={`${row}-${col}`} style={{
              width: DCELL, height: DCELL,
              background: isLight ? '#f5e6c8' : '#7a3f1e',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {piece && (
                <div style={{
                  width: '78%', height: '78%', borderRadius: '50%',
                  background: piece.color === 'white'
                    ? 'radial-gradient(circle at 35% 35%, #fff, #ccc)'
                    : 'radial-gradient(circle at 35% 35%, #555, #1a1a1a)',
                  border: piece.color === 'white' ? '2px solid #aaa' : '2px solid #000',
                  boxShadow: '2px 3px 6px rgba(0,0,0,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, color: piece.color === 'white' ? '#333' : '#eee',
                }}>
                  {piece.type === 'king' ? '♛' : ''}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

// ── Main spectate page ────────────────────────────────────────────────────────
export const SpectateGame: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { universe } = useUniverseStore();
  const navigate = useNavigate();

  const [fen,      setFen]      = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const [board,    setBoard]    = useState<DraughtsBoardType>(createInitialBoard);
  const [moves,    setMoves]    = useState<string[]>([]);
  const [players,  setPlayers]  = useState<{ white: string; black: string }>({ white: '?', black: '?' });
  const [chat,     setChat]     = useState<{ username: string; message: string }[]>([]);
  const [chatMsg,  setChatMsg]  = useState('');
  const [ended,    setEnded]    = useState(false);
  const [error,    setError]    = useState('');
  const [viewers,  setViewers]  = useState(1);

  useEffect(() => {
    if (!id) return;

    const onState = (data: { fen?: string; board?: DraughtsBoardType; moves?: string[]; white: string; black: string; viewers: number }) => {
      if (data.fen)   setFen(data.fen);
      if (data.board) setBoard(data.board);
      if (data.moves) setMoves(data.moves);
      setPlayers({ white: data.white, black: data.black });
      setViewers(data.viewers);
    };

    const onMove = (data: { fen?: string; move?: string; draughtsMove?: DraughtsMove; board?: DraughtsBoardType }) => {
      if (data.fen)   setFen(data.fen);
      if (data.board) setBoard(data.board);
      if (data.move)  setMoves(m => [...m, data.move!]);
      if (data.draughtsMove) setMoves(m => [...m, `${data.draughtsMove!.from.row},${data.draughtsMove!.from.col}-${data.draughtsMove!.to.row},${data.draughtsMove!.to.col}`]);
    };

    const onChat = (data: { message: string; username: string }) => {
      setChat(c => [...c.slice(-49), data]);
    };

    const onGameOver = () => setEnded(true);
    const onViewers  = (count: number) => setViewers(count);
    const onRoomError = (data: { message?: string }) => {
      setError(data.message || 'This live game is no longer available.');
    };

    socket.on('spectate:state',    onState);
    socket.on('spectate:move',     onMove);
    socket.on('chat',              onChat);
    socket.on('game-over',         onGameOver);
    socket.on('spectate:viewers',  onViewers);
    socket.on('room:error',        onRoomError);

    // Join as spectator AFTER listeners are attached
    socket.emit('spectate:join', { roomId: id });

    return () => {
      socket.emit('spectate:leave', { roomId: id });
      socket.off('spectate:state',   onState);
      socket.off('spectate:move',    onMove);
      socket.off('chat',             onChat);
      socket.off('game-over',        onGameOver);
      socket.off('spectate:viewers', onViewers);
      socket.off('room:error',       onRoomError);
    };
  }, [id]);


  // Move list formatted
  const movePairs: [string, string?][] = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push([moves[i], moves[i + 1]]);
  }

  if (error) {
    return (
      <div style={{ maxWidth: 520, margin: '72px auto', padding: 20, textAlign: 'center', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>📺</div>
        <h1 style={{ margin: '0 0 8px', fontSize: 22, color: 'var(--text-1)' }}>Live game unavailable</h1>
        <p style={{ margin: '0 0 18px', color: 'var(--text-3)', lineHeight: 1.45 }}>{error}</p>
        <button className="btn btn-primary" onClick={() => navigate(`/${universe}`)}>Back to live games</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 20, padding: '16px 0', maxWidth: 1200, margin: '0 auto', flexWrap: 'wrap' }}>
      {/* Board */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        {/* Black player */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'stretch', background: 'var(--bg-2)', padding: '8px 12px', borderRadius: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#1a1a1a', border: '2px solid #555', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#eee', fontWeight: 700 }}>
            {players.black[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{players.black}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Black</div>
          </div>
        </div>

        {/* Board */}
        {universe === 'chess'
          ? <ChessSpectateBoard fen={fen} />
          : <DraughtsSpectateBoard board={board} />
        }

        {/* White player */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'stretch', background: 'var(--bg-2)', padding: '8px 12px', borderRadius: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#fff', border: '2px solid #999', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#333', fontWeight: 700 }}>
            {players.white[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{players.white}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>White</div>
          </div>
        </div>

        {/* Viewer count */}
        <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
          {viewers} watching
        </div>

        {ended && (
          <div style={{ padding: '10px 20px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Game ended</div>
            <button className="btn btn-secondary" onClick={() => navigate(`/${universe}`)}>← Back to lobby</button>
          </div>
        )}
      </div>

      {/* Sidebar: moves + chat */}
      <div style={{ flex: 1, minWidth: 240, maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Live badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12, animation: 'pulse 2s infinite' }}>
            ● LIVE
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Spectating</span>
        </div>

        {/* Move history */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', flex: 1 }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>
            Moves ({moves.length})
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto', padding: 8 }}>
            {movePairs.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: 12 }}>No moves yet</div>
              : movePairs.map(([w, b], i) => (
                <div key={i} style={{ display: 'flex', gap: 4, padding: '2px 4px', fontSize: 13, fontFamily: 'monospace', borderRadius: 4 }}>
                  <span style={{ color: 'var(--text-3)', width: 24, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
                  <span style={{ flex: 1, padding: '1px 6px', borderRadius: 3 }}>{w}</span>
                  {b && <span style={{ flex: 1, padding: '1px 6px', borderRadius: 3 }}>{b}</span>}
                </div>
              ))
            }
          </div>
        </div>

        {/* Chat */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>
            Chat
          </div>
          <div style={{ height: 160, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {chat.map((m, i) => (
              <div key={i} style={{ fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{m.username}: </span>
                <span style={{ color: 'var(--text-1)' }}>{m.message}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, padding: 8, borderTop: '1px solid var(--border)' }}>
            <input
              value={chatMsg}
              onChange={e => setChatMsg(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && chatMsg.trim()) {
                  socket.emit('chat', { roomId: id, message: chatMsg, username: 'Spectator' });
                  setChatMsg('');
                }
              }}
              placeholder="Say something…"
              style={{ flex: 1, padding: '5px 8px', borderRadius: 6, fontSize: 12, background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            />
          </div>
        </div>

        {/* Back button */}
        <button className="btn btn-secondary" onClick={() => navigate(`/${universe}`)}>
          ← Back to lobby
        </button>
      </div>
    </div>
  );
};
