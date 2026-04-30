import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { socket } from '../../lib/socket';
import { DraughtsBoard as Board } from './DraughtsBoard';
import { Clock } from '../common/Clock';
import { BettingPanel } from '../betting/BettingPanel';
import { PlayerPopover } from '../common/PlayerPopover';
import { VideoChat } from '../video/VideoChat';
import { useSound } from '../../hooks/useSound';
import { useUserStore, useNotificationStore, useBettingStore, useLiveGamesStore } from '../../stores';
import { HeadToHeadPanel } from '../common/HeadToHeadPanel';
import { countryFlag } from '../../lib/countries';
import {
  createInitialBoard,
  getLegalMoves,
  applyMove,
  isGameOver,
  getBestAIMove,
  formatMove,
  getMovesFromSquare,
} from '../../engines/draughts.engine';
import { DraughtsBoard as DraughtsBoardType, DraughtsMove, Position, Color } from '../../types';

function parseTimeControl(tc: string): { initial: number; increment: number } {
  const parts = tc.split('+');
  return {
    initial: parseInt(parts[0] || '5') * 60 * 1000,
    increment: parseInt(parts[1] || '0') * 1000,
  };
}

const COMPUTER_OPPONENT = { id: 'computer', name: 'Computer', rating: 1500 };

export const DraughtsGame: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mode, tc, id } = useParams<{ mode?: string; tc?: string; id?: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const user            = useUserStore(s => s.user);
  const addNotification = useNotificationStore(s => s.addNotification);
  const activeBet       = useBettingStore(s => s.activeBet);
  const settleBet       = useBettingStore(s => s.settleBet);
  const registerGame    = useLiveGamesStore(s => s.registerGame);
  const updateGame      = useLiveGamesStore(s => s.updateGame);
  const removeGame      = useLiveGamesStore(s => s.removeGame);
  const { play } = useSound();

  const urlTc = tc || searchParams.get('tc') || '5+0';
  const timeControl = parseTimeControl(urlTc);
  const roomId = id;
  const isOnline = !!roomId;
  const isVsComputer = mode === 'computer';
  const colorParam = searchParams.get('color');
  const playerColor: Color = (colorParam === 'black' || colorParam === 'b') ? 'black' : 'white';

  const [board, setBoard] = useState<DraughtsBoardType>(() => createInitialBoard());
  const [turn, setTurn] = useState<Color>('white');
  const [selected, setSelected] = useState<Position | null>(null);
  const [legalMovesForSelected, setLegalMovesForSelected] = useState<DraughtsMove[]>([]);
  const [lastMove, setLastMove] = useState<DraughtsMove | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [gameStatus, setGameStatus] = useState<'playing' | 'ended'>('playing');
  const [result, setResult] = useState<string | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [whiteTime, setWhiteTime] = useState(timeControl.initial);
  const [blackTime, setBlackTime] = useState(timeControl.initial);
  const chatInit = React.useMemo(() => [
    { id: '1', userId: 'system', username: 'System', text: t('game.gameStarted') },
  ], [t]);
  const [chatMessages, setChatMessages] = useState(chatInit);
  const [chatInput, setChatInput] = useState('');
  const [activeTab, setActiveTab] = useState<'moves' | 'chat'>('moves');
  const [showBetting, setShowBetting] = useState(false);
  const [showVideo, setShowVideo] = useState(true);
  const [drawOffered, setDrawOffered] = useState(false);
  const [incomingDraw, setIncomingDraw] = useState(false);
  const [drawDeclinedMsg, setDrawDeclinedMsg] = useState(false);
  const [takebackSent, setTakebackSent] = useState(false);
  const [incomingTakeback, setIncomingTakeback] = useState(false);
  const [spectators, setSpectators] = useState<string[]>([]);
  const [savingResult, setSavingResult] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef(board);
  const turnRef = useRef(turn);
  boardRef.current = board;
  turnRef.current = turn;
  const userRef = useRef(user);
  userRef.current = user;
  const computerMovePending = useRef(false);
  const computerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [opponentInfo, setOpponentInfo] = useState<{ name: string; rating: number; country: string }>(() => {
    const nav = (location.state as any);
    if (nav?.whitePlayer && nav?.blackPlayer) {
      const opp = playerColor === 'white' ? nav.blackPlayer : nav.whitePlayer;
      return { name: opp?.name || 'Opponent', rating: opp?.rating?.checkers ?? opp?.rating ?? 1450, country: opp?.country || '' };
    }
    return { name: 'Opponent', rating: 1450, country: '' };
  });
  const opponent = isVsComputer ? COMPUTER_OPPONENT : { id: 'p2', name: opponentInfo.name, rating: opponentInfo.rating };

  // ── Register this game in the live games store ──────────────────────────────
  const gameIdRef = useRef(`checkers-live-${Date.now()}`);
  useEffect(() => {
    const gid = gameIdRef.current;
    registerGame({
      id: gid,
      universe: 'checkers',
      white: { name: user?.name || 'You', rating: user?.rating.checkers || 1450 },
      black: { name: opponent.name, rating: opponent.rating },
      tc: urlTc,
      bet: activeBet?.amount || 0,
      draughtsBoard: board,
      moveCount: 0,
      startedAt: Date.now(),
      status: 'playing',
    });
    return () => removeGame(gid);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep board in sync
  useEffect(() => {
    updateGame(gameIdRef.current, {
      draughtsBoard: board,
      moveCount: moveHistory.length,
      status: gameStatus,
    });
  }, [board, gameStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGameEnd = useCallback((winner: Color | 'draw', _boardState: DraughtsBoardType) => {
    setGameStatus('ended');
    play('gameEnd');
    if (isOnline) setSavingResult(true);
    let res = '';
    if (winner === 'draw') res = t('game.draw');
    else if (winner === playerColor) res = t('game.youWon');
    else res = t('game.youLost');
    setResult(res);

    if (activeBet && activeBet.amount > 0) {
      const winnerId = winner === 'draw' ? null : (winner === playerColor ? user?.id : opponent.id);
      
      if (winnerId) {
        const isMe = winnerId === user?.id;
        useUserStore.getState().updateBetStats(isMe ? 'win' : 'loss');

        if (isMe) {
          const payout = activeBet.amount * 2 * 0.95;
          useUserStore.getState().updateBalance(payout);
          play('betWon');
          addNotification(t('game.youWonAmount', { amount: payout.toFixed(2) }), 'success');
        }
        settleBet(winnerId);
      } else if (winner === 'draw') {
        useUserStore.getState().updateBalance(activeBet.amount);
        addNotification(t('game.drawBetRefunded'), 'info');
        useBettingStore.getState().cancelBet();
      }
    }
  }, [play, playerColor, activeBet, user, opponent, settleBet, addNotification, t]);

  const makeMove = useCallback((move: DraughtsMove, currentBoard: DraughtsBoardType, currentTurn: Color, isRemote: boolean = false) => {
    const newBoard = applyMove(currentBoard, move);
    const notation = formatMove(move);

    setBoard(newBoard);
    setLastMove(move);
    setMoveHistory(h => [...h, notation]);
    setSelected(null);
    setLegalMovesForSelected([]);

    if (move.captured && move.captured.length > 0) play('capture');
    else play('move');
    if (move.promotesToKing) {
      play('promote');
      addNotification(t('checkers.kingPromotion'), 'success');
    }

    const nextTurn: Color = currentTurn === 'white' ? 'black' : 'white';
    setTurn(nextTurn);

    // Add increment
    if (currentTurn === 'white') setWhiteTime(t => t + timeControl.increment);
    else setBlackTime(t => t + timeControl.increment);

    if (isOnline && !isRemote) {
      // Include serialized board so receiver can reconstruct exact state
      socket.emit('move', { roomId, move, board: JSON.stringify(newBoard) });
    }

    const { over, winner } = isGameOver(newBoard, nextTurn);
    if (over) {
      handleGameEnd(winner || 'draw', newBoard);
    }

    return { newBoard, nextTurn };
  }, [play, addNotification, t, timeControl.increment, handleGameEnd]);

  // Computer move
  const makeComputerMove = useCallback(() => {
    if (computerMovePending.current) return;
    computerMovePending.current = true;

    // Clear any existing timeout
    if (computerTimeoutRef.current) clearTimeout(computerTimeoutRef.current);

    const compColor = playerColor === 'white' ? 'black' : 'white';
    
    computerTimeoutRef.current = setTimeout(() => {
      computerMovePending.current = false;
      const currentBoard = boardRef.current;
      const currentTurn = turnRef.current;

      // Ensure it's still computer's turn and game is on
      if (currentTurn !== compColor || gameStatus !== 'playing') return;

      const move = getBestAIMove(currentBoard, compColor, 4);
      if (move) {
        makeMove(move, currentBoard, compColor);
      }
    }, 500 + Math.random() * 800);
  }, [makeMove, playerColor, gameStatus]);

  // Trigger computer move whenever it becomes the computer's turn
  useEffect(() => {
    if (!isVsComputer || gameStatus !== 'playing') return;
    const compColor: Color = playerColor === 'white' ? 'black' : 'white';
    if (turn === compColor) {
      makeComputerMove();
    }

    return () => {
      if (computerTimeoutRef.current) {
        clearTimeout(computerTimeoutRef.current);
        computerMovePending.current = false;
      }
    };
  }, [turn, isVsComputer, gameStatus, playerColor, makeComputerMove]);

  const handleSquareClick = useCallback((row: number, col: number) => {
    if (gameStatus !== 'playing') return;
    if (turn !== playerColor) return;

    const piece = board[row][col];

    // Click on own piece: select it
    if (piece && piece.color === playerColor) {
      const moves = getMovesFromSquare(board, row, col, playerColor);
      const allLegal = getLegalMoves(board, playerColor);
      // Filter: only show if these are legal (mandatory capture applies)
      const validMoves = moves.filter(m =>
        allLegal.some(al => al.from.row === m.from.row && al.from.col === m.from.col && al.to.row === m.to.row && al.to.col === m.to.col)
      );
      setSelected({ row, col });
      setLegalMovesForSelected(validMoves);
      return;
    }

    // Click on legal target
    if (selected) {
      const targetMove = legalMovesForSelected.find(m => m.to.row === row && m.to.col === col);
      if (targetMove) {
        makeMove(targetMove, board, playerColor);
        return;
      }
    }

    // Deselect
    setSelected(null);
    setLegalMovesForSelected([]);
  }, [gameStatus, turn, playerColor, board, selected, legalMovesForSelected, makeMove]);

  const handleOfferDraw = () => {
    if (isVsComputer) {
      const accepts = moveHistory.length >= 40 || Math.random() < 0.2;
      if (accepts) {
        handleGameEnd('draw', board);
      } else {
        setDrawDeclinedMsg(true);
        setTimeout(() => setDrawDeclinedMsg(false), 2500);
        addNotification(t('game.drawDeclined', 'Draw offer declined'), 'warning');
      }
      return;
    }
    socket.emit('draw:offer', { roomId });
    setDrawOffered(true);
  };

  const handleAcceptDraw = () => {
    setIncomingDraw(false);
    socket.emit('draw:accept', { roomId });
    handleGameEnd('draw', board);
  };

  const handleDeclineDraw = () => {
    setIncomingDraw(false);
    socket.emit('draw:decline', { roomId });
  };

  const handleRequestTakeback = () => {
    if (!isOnline || gameStatus !== 'playing' || moveHistory.length === 0) return;
    socket.emit('takeback:request', { roomId });
    setTakebackSent(true);
  };

  const handleAcceptTakeback = () => {
    setIncomingTakeback(false);
    socket.emit('takeback:accept', { roomId });
  };

  const handleDeclineTakeback = () => {
    setIncomingTakeback(false);
    socket.emit('takeback:decline', { roomId });
  };

  const handleResign = () => {
    setGameStatus('ended');
    setResult(t('game.youLost'));
    play('gameEnd');
    if (isOnline) {
      socket.emit('resign', { roomId });
    }
  };

  const handleNewGame = () => {
    setBoard(createInitialBoard());
    setTurn('white');
    setSelected(null);
    setLegalMovesForSelected([]);
    setLastMove(null);
    setGameStatus('playing');
    setResult(null);
    setMoveHistory([]);
    setWhiteTime(timeControl.initial);
    setBlackTime(timeControl.initial);
    setChatMessages([{ id: '1', userId: 'system', username: 'System', text: t('game.gameStarted') }]);
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    const msg = {
      id: Date.now().toString(),
      userId: user?.id || 'guest',
      username: user?.name || 'You',
      text: chatInput.trim(),
    };
    setChatMessages(m => [...m, msg]);
    setChatInput('');
    if (isOnline) {
      socket.emit('chat', { roomId, message: msg.text, username: msg.username });
    }
  };

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages]);

  useEffect(() => {
    if (!isOnline) return;

    const handleSocketMove = (payload: any) => {
      // Only apply opponent's move: skip if it's our turn (move is an echo of ours)
      if (turnRef.current === playerColor) return;
      const oppColor: Color = playerColor === 'white' ? 'black' : 'white';
      // If sender included full board state, use it as ground truth
      if (payload.board) {
        try {
          const syncedBoard: DraughtsBoardType = JSON.parse(payload.board);
          const notation = payload.move ? formatMove(payload.move) : '';
          setBoard(syncedBoard);
          setLastMove(payload.move || null);
          if (notation) setMoveHistory(h => [...h, notation]);
          setSelected(null);
          setLegalMovesForSelected([]);
          if (payload.move?.captured?.length > 0) play('capture');
          else play('move');
          if (payload.move?.promotesToKing) play('promote');
          const nextTurn: Color = oppColor === 'white' ? 'black' : 'white';
          setTurn(nextTurn);
          if (oppColor === 'white') setWhiteTime(t => t + timeControl.increment);
          else setBlackTime(t => t + timeControl.increment);
          const { over, winner } = isGameOver(syncedBoard, nextTurn);
          if (over) handleGameEnd(winner || 'draw', syncedBoard);
          return;
        } catch {}
      }
      // Fallback: apply move locally
      makeMove(payload.move, boardRef.current, oppColor, true);
    };

    const handleSocketChat = (msg: any) => {
      if (msg.isSystem && msg.systemType === 'spec_join') {
        setChatMessages(m => [...m, { id: msg.timestamp?.toString() || Date.now().toString(), userId: 'system', username: 'System', text: t('game.specJoined', { name: msg.message }) }]);
        return;
      }
      if (msg.isSystem && msg.systemType === 'spec_leave') {
        setChatMessages(m => [...m, { id: msg.timestamp?.toString() || Date.now().toString(), userId: 'system', username: 'System', text: t('game.specLeft', { name: msg.message }) }]);
        return;
      }
      setChatMessages(m => [...m, { id: msg.timestamp?.toString() || Date.now().toString(), userId: msg.isSpectator ? 'spectator' : 'opp', username: msg.username, text: msg.message, isSpectator: msg.isSpectator }]);
    };

    const handleGameOverEmit = (data: any) => {
      setGameStatus('ended');
      if (data.result === 'resign') setResult(t('game.opponentResigned'));
      else if (data.result === 'draw') setResult(t('game.drawAgreement'));
      else setResult(t('game.gameOver'));
      play('gameEnd');
    };

    const handleDrawOfferEvent = () => { setIncomingDraw(true); addNotification(t('game.opponentOfferedDraw', 'Your opponent offered a draw'), 'info'); };
    const handleDrawDeclined = () => {
      setDrawOffered(false);
      setDrawDeclinedMsg(true);
      setTimeout(() => setDrawDeclinedMsg(false), 2500);
      addNotification(t('game.drawDeclined', 'Draw offer was declined'), 'warning');
    };

    const handleGameStart = (data: any) => {
      const myName = userRef.current?.name || '';
      const isWhite = data.whitePlayer?.name === myName || playerColor === 'white';
      const opp = isWhite ? data.blackPlayer : data.whitePlayer;
      if (opp) setOpponentInfo({ name: opp.name, rating: opp.rating?.checkers ?? opp.rating ?? 1450, country: opp.country || '' });
    };

    const handleSpectateList = (list: string[]) => setSpectators(list);

    // ── Reconnect tokens ────────────────────────────────────────────────────
    const handleRoomTokens = (data: { roomId: string; token: string; color: 'white' | 'black' }) => {
      sessionStorage.setItem('damcash_rejoin_draughts', JSON.stringify(data));
    };

    // ── Restore game state after reconnect ──────────────────────────────────
    const handleRoomState = (data: any) => {
      if (data.board) {
        try {
          const restoredBoard: DraughtsBoardType = JSON.parse(data.board);
          setBoard(restoredBoard);
        } catch { /* corrupt board — keep current */ }
      }
      if (Array.isArray(data.moves)) {
        setMoveHistory(data.moves.map((m: any) => formatMove(m)));
        const last = data.moves[data.moves.length - 1];
        if (last) setLastMove(last);
      }
      if (data.turn) setTurn(data.turn as Color);
      const myCol: Color = data.color || playerColor;
      const opp = myCol === 'white' ? data.blackPlayer : data.whitePlayer;
      if (opp) setOpponentInfo({ name: opp.name || 'Opponent', rating: Number(opp.rating?.checkers ?? opp.rating) || 1450, country: opp.country || '' });
    };

    const handleTakebackRequest  = () => { setIncomingTakeback(true); addNotification(t('game.opponentRequestsTakeback', 'Your opponent requested a takeback'), 'info'); };
    const handleTakebackDeclined = () => { setTakebackSent(false); addNotification(t('game.takebackDeclined', 'Takeback request declined'), 'warning'); };
    const handleTakebackExpired  = () => { setTakebackSent(false); addNotification(t('game.takebackExpired', 'Takeback request expired'), 'warning'); };
    const handleTakebackAccepted = (data: { undoCount: number; board?: string }) => {
      setTakebackSent(false);
      addNotification(t('game.takebackAccepted', 'Takeback accepted'), 'success');
      const count = data?.undoCount ?? 1;
      if (data.board) {
        try { setBoard(JSON.parse(data.board)); } catch { /* keep current */ }
      }
      setMoveHistory(prev => prev.slice(0, Math.max(0, prev.length - count)));
      setLastMove(null);
    };

    const handleRoomCancelled = () => {
      addNotification(t('game.roomCancelled', 'Opponent left the room before starting'), 'info');
      navigate('/');
    };

    const handleRoomPlayers = (data: any) => {
      const opp = playerColor === 'white' ? data.blackPlayer : data.whitePlayer;
      if (opp?.name && opp.name !== 'White' && opp.name !== 'Black') {
        setOpponentInfo({ name: opp.name, rating: Number(opp.rating?.checkers ?? opp.rating) || 1450, country: opp.country || '' });
      }
    };

    const handleRatingUpdate = () => setSavingResult(false);

    socket.on('game-start', handleGameStart);
    socket.on('spectate:list', handleSpectateList);
    socket.on('move', handleSocketMove);
    socket.on('chat', handleSocketChat);
    socket.on('game-over', handleGameOverEmit);
    socket.on('draw:offer', handleDrawOfferEvent);
    socket.on('draw:declined', handleDrawDeclined);
    socket.on('takeback:request',  handleTakebackRequest);
    socket.on('takeback:accept',   handleTakebackAccepted);
    socket.on('takeback:declined', handleTakebackDeclined);
    socket.on('takeback:expired',  handleTakebackExpired);
    socket.on('room:tokens', handleRoomTokens);
    socket.on('room:state',  handleRoomState);
    socket.on('room:cancelled', handleRoomCancelled);
    socket.on('room:players', handleRoomPlayers);
    socket.on('rating:update', handleRatingUpdate);

    // Attempt rejoin if this socket is new but we have a stored token for this room
    const stored = sessionStorage.getItem('damcash_rejoin_draughts');
    if (stored) {
      try {
        const { roomId: storedRoom, token } = JSON.parse(stored);
        if (storedRoom === roomId) {
          socket.emit('room:rejoin', { roomId, token });
        }
      } catch { /* corrupt storage — ignore */ }
    }

    // Request fresh player info on mount (handles case where game-start fired before component mounted)
    socket.emit('room:request-players', { roomId });

    return () => {
      socket.off('game-start', handleGameStart);
      socket.off('spectate:list', handleSpectateList);
      socket.off('move', handleSocketMove);
      socket.off('chat', handleSocketChat);
      socket.off('game-over', handleGameOverEmit);
      socket.off('draw:offer', handleDrawOfferEvent);
      socket.off('draw:declined', handleDrawDeclined);
      socket.off('takeback:request',  handleTakebackRequest);
      socket.off('takeback:accept',   handleTakebackAccepted);
      socket.off('takeback:declined', handleTakebackDeclined);
      socket.off('takeback:expired',  handleTakebackExpired);
      socket.off('room:tokens', handleRoomTokens);
      socket.off('room:state',  handleRoomState);
      socket.off('room:cancelled', handleRoomCancelled);
      socket.off('room:players', handleRoomPlayers);
      socket.off('rating:update', handleRatingUpdate);
    };
  }, [isOnline, playerColor, play, makeMove, handleGameEnd, timeControl.increment]);

  // Warn before closing tab mid-game
  useEffect(() => {
    if (!isOnline || gameStatus !== 'playing') return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isOnline, gameStatus]);

  // Count pieces
  const whitePieces = board.flat().filter(p => p?.color === 'white').length;
  const blackPieces = board.flat().filter(p => p?.color === 'black').length;

  // Check if must capture
  const allLegal = getLegalMoves(board, turn);
  const mustCapture = allLegal.some(m => m.captured && m.captured.length > 0);

  return (
    <div className="game-room">
      <div className="game-center">
        {/* Opponent bar */}
        <div className="player-bar" style={{ width: '100%', background: 'transparent' }}>
          <div className="player-avatar">
            {isVsComputer ? '🤖' : opponent.name[0]}
          </div>
          <div style={{ flex: 1 }}>
            <PlayerPopover player={opponent}>
              <div className="player-name" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 16 }}>
                {opponentInfo.country && (
                  <span style={{ fontSize: 22, lineHeight: 1 }} title={opponentInfo.country}>
                    {countryFlag(opponentInfo.country)}
                  </span>
                )}
                <strong>{opponent.name}</strong>
              </div>
            </PlayerPopover>
            <div className="player-rating">({opponent.rating})</div>
          </div>
          <Clock
            timeMs={playerColor === 'white' ? blackTime : whiteTime}
            active={gameStatus === 'playing' && turn !== playerColor && moveHistory.length > 0}
            onTick={(ms) => playerColor === 'white' ? setBlackTime(ms) : setWhiteTime(ms)}
            onExpire={() => handleGameEnd(playerColor, board)}
          />
        </div>

        {/* Incoming draw offer banner */}
        {incomingDraw && (
          <div className="draw-offer-banner">
            <span>🤝 {t('game.opponentOfferedDraw')}</span>
            <button className="btn btn-success btn-sm" onClick={handleAcceptDraw}>{t('game.acceptDraw')}</button>
            <button className="btn btn-secondary btn-sm" onClick={handleDeclineDraw}>{t('game.declineDraw')}</button>
          </div>
        )}

        {/* Incoming takeback request banner */}
        {incomingTakeback && (
          <div className="draw-offer-banner">
            <span>↩ {t('game.opponentRequestsTakeback')}</span>
            <button className="btn btn-success btn-sm" onClick={handleAcceptTakeback}>{t('game.acceptTakeback')}</button>
            <button className="btn btn-secondary btn-sm" onClick={handleDeclineTakeback}>{t('game.declineTakeback')}</button>
          </div>
        )}

        {/* Draw declined flash */}
        {drawDeclinedMsg && (
          <div className="draw-declined-msg">❌ {t('game.drawDeclined')}</div>
        )}

        {/* Board */}
        <div style={{ position: 'relative' }}>
          <Board
            board={board}
            selectedSquare={selected}
            legalMoves={legalMovesForSelected}
            lastMove={lastMove}
            flipped={flipped}
            onSquareClick={handleSquareClick}
          />
          {gameStatus === 'ended' && (
            <div className="game-over-overlay">
              <div className="game-over-box">
                <div className="game-over-title">
                  {result === t('game.youWon') ? '🏆' : result === t('game.draw') ? '🤝' : '💔'}
                </div>
                <div className="game-over-title">{t('game.gameOver')}</div>
                <div className="game-over-subtitle">{result}</div>
                {savingResult && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 4 }}>
                    <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                    {t('game.savingResult', 'Saving result…')}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button className="btn btn-primary" onClick={handleNewGame}>{t('game.rematch')}</button>
                  <button className="btn btn-secondary" onClick={() => navigate('/')}>
                    {t('game.quit')}
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Must capture notice */}
          {mustCapture && turn === playerColor && gameStatus === 'playing' && (
            <div style={{
              position: 'absolute',
              top: -36,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--danger)',
              color: '#fff',
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}>
              ⚠ Must capture
            </div>
          )}
        </div>

        {/* Head-to-head score strip */}
        {isOnline && user?.name && opponentInfo.name !== 'Opponent' && (
          <HeadToHeadPanel
            playerA={user.name}
            playerB={opponentInfo.name}
            universe="checkers"
          />
        )}

        {/* Player bar */}
        <div className="player-bar" style={{ width: '100%' }}>
          <div className="player-avatar" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
            {user?.name?.[0] || 'Y'}
          </div>
          <div>
            <PlayerPopover player={{ name: user?.name || 'You', rating: user?.rating.checkers || 1450 }}>
              <div className="player-name" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                {user?.country && <span style={{ fontSize: 15 }}>{countryFlag(user.country)}</span>}
                {user?.name || 'You'}
              </div>
            </PlayerPopover>
            <div className="player-rating">
              ({user?.rating.checkers || 1450}) · {playerColor === 'white' ? whitePieces : blackPieces} pieces
            </div>
          </div>
          <Clock
            timeMs={playerColor === 'white' ? whiteTime : blackTime}
            active={gameStatus === 'playing' && turn === playerColor && moveHistory.length > 0}
            onTick={(ms) => playerColor === 'white' ? setWhiteTime(ms) : setBlackTime(ms)}
            onExpire={() => handleGameEnd(playerColor === 'white' ? 'black' : 'white', board)}
          />
        </div>

        {/* Controls */}
        <div className="game-controls">
          <button className="btn btn-secondary btn-sm" onClick={() => setFlipped(f => !f)}>
            ↕ {t('game.flip')}
          </button>
          {gameStatus === 'playing' && (
            <>
              {isOnline && moveHistory.length > 0 && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleRequestTakeback}
                  disabled={takebackSent}
                  title={takebackSent ? t('game.takebackSent') : t('game.requestTakeback')}
                >
                  {takebackSent ? `↩ ${t('game.takebackSent')}` : `↩ ${t('game.takeback')}`}
                </button>
              )}
              {moveHistory.length > 0 ? (
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => { if(window.confirm(t('game.confirmResign'))) handleResign(); }}
                >
                  🏳 {t('game.resign')}
                </button>
              ) : (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => { socket.emit('room:cancel', { roomId }); navigate('/'); }}
                >
                  🚪 {t('game.quitRoom')}
                </button>
              )}
              {gameStatus === 'playing' && moveHistory.length > 0 && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleOfferDraw}
                  disabled={drawOffered}
                  title={drawOffered ? 'Draw offer sent' : 'Offer a draw'}
                >
                  {drawOffered ? '½ Offered…' : '½ Draw'}
                </button>
              )}
            </>
          )}
          {gameStatus === 'ended' && (
            <button className="btn btn-primary btn-sm" onClick={handleNewGame}>
              ↺ {t('game.rematch')}
            </button>
          )}
        </div>
      </div>

      {/* Right sidebar */}
      <div className="game-sidebar">
        {/* Video Chat — always mounted to preserve WebRTC connection; only body collapsed */}
        {isOnline && (
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">📹 {t('video.videoChat')}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowVideo(v => !v)}>
                {showVideo ? '▲' : '▼'}
              </button>
            </div>
            <div className="panel-body" style={{ display: showVideo ? 'block' : 'none' }}>
              <VideoChat
                roomId={roomId || `checkers-local-${gameIdRef.current}`}
                playerName={user?.name || 'You'}
                opponentName={opponent.name}
              />
            </div>
          </div>
        )}

        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">💰 {t('betting.wallet')}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowBetting(s => !s)}>
              {showBetting ? '▲' : '▼'}
            </button>
          </div>
          {showBetting && (
            <div className="panel-body"><BettingPanel /></div>
          )}
          {!showBetting && (
            <div className="panel-body" style={{ padding: '8px 12px', cursor: 'pointer' }} onClick={() => setShowBetting(true)}>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                {activeBet ? t('game.activeBet', { amount: activeBet.amount }) : t('betting.playForFun')}
              </div>
            </div>
          )}
        </div>

        <div className="panel" style={{ flex: 1 }}>
          <div className="panel-header">
            <div style={{ display: 'flex', gap: 0 }}>
              {(['moves', 'chat'] as const).map(tab => (
                <button
                  key={tab}
                  className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                  style={{ padding: '6px 14px' }}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'moves' ? t('game.moves') : (
                    <>
                      {t('game.chat')}
                      {spectators.length > 0 && (
                        <span style={{ marginLeft: 5, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 8 }}>
                          👁 {spectators.length}
                        </span>
                      )}
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="panel-body">
            {activeTab === 'moves' && (
              <div className="move-history">
                {Array.from({ length: Math.ceil(moveHistory.length / 2) }, (_, i) => ({
                  num: i + 1,
                  white: moveHistory[i * 2] || '',
                  black: moveHistory[i * 2 + 1] || '',
                })).map(pair => (
                  <div key={pair.num} className="move-row">
                    <span className="move-num">{pair.num}.</span>
                    <span className="move-white">{pair.white}</span>
                    <span className="move-black">{pair.black}</span>
                  </div>
                ))}
                {moveHistory.length === 0 && (
                  <div className="text-muted text-sm text-center" style={{ padding: 16 }}>
                    {turn === playerColor ? t('game.yourTurn') : t('game.waitingForOpponent')}
                  </div>
                )}
              </div>
            )}
            {activeTab === 'chat' && (
              <>
                {/* Spectator list strip */}
                {spectators.length > 0 && (
                  <div style={{
                    padding: '4px 10px', borderBottom: '1px solid var(--border)',
                    fontSize: 10, color: 'var(--text-3)',
                    display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
                  }}>
                    <span style={{ color: '#ef4444' }}>👁</span>
                    {spectators.join(', ')}
                  </div>
                )}
                <div className="chat-messages" ref={chatRef}>
                  {chatMessages.map(msg => (
                    <div key={msg.id} className={`chat-msg ${msg.userId === 'system' ? 'system' : (msg as any).isSpectator ? 'spectator' : ''}`}>
                      {msg.userId !== 'system' && (
                        <span className="chat-msg-name">
                          {(msg as any).isSpectator && <span style={{ color: '#ef4444', marginRight: 2 }}>👁</span>}
                          {msg.username}:
                        </span>
                      )}
                      <span className="chat-msg-text">{msg.text}</span>
                    </div>
                  ))}
                </div>
                <div className="chat-input-row">
                  <input
                    type="text"
                    className="chat-input"
                    value={chatInput}
                    placeholder={t('game.typeMessage')}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') sendChat(); }}
                  />
                  <button className="btn btn-primary btn-sm" onClick={sendChat}>↵</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
