import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Chess, Square, PieceSymbol } from 'chess.js';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { socket } from '../../lib/socket';
import { ChessBoard } from './ChessBoard';
import { Clock } from '../common/Clock';
import { BettingPanel } from '../betting/BettingPanel';
import { PlayerPopover } from '../common/PlayerPopover';
import { VideoChat } from '../video/VideoChat';
import { useSound } from '../../hooks/useSound';
import { useUserStore, useNotificationStore, useBettingStore, useLiveGamesStore } from '../../stores';
import { useAnalysisStore, analyseGame } from '../../stores/analysisStore';
import { HeadToHeadPanel } from '../common/HeadToHeadPanel';
import { countryFlag } from '../../lib/countries';

interface TimeControl {
  initial: number; // minutes
  increment: number; // seconds
}

function parseTimeControl(tc: string): TimeControl {
  const parts = tc.split('+');
  return {
    initial: parseInt(parts[0] || '5') * 60 * 1000,
    increment: parseInt(parts[1] || '0') * 1000,
  };
}

const COMPUTER_OPPONENT = { id: 'computer', name: 'Computer', rating: 1500 };

// CHAT_INIT is created inside the component so it can use t()


interface Props {
  onOpenWallet?: () => void;
}

export const ChessGame: React.FC<Props> = ({ onOpenWallet }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mode, tc, id } = useParams<{ mode?: string; tc?: string; id?: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const user           = useUserStore(s => s.user);
  const addNotification = useNotificationStore(s => s.addNotification);
  const activeBet      = useBettingStore(s => s.activeBet);
  const settleBet      = useBettingStore(s => s.settleBet);
  const registerGame   = useLiveGamesStore(s => s.registerGame);
  const updateGame     = useLiveGamesStore(s => s.updateGame);
  const removeGame     = useLiveGamesStore(s => s.removeGame);
  const saveGame       = useAnalysisStore(s => s.saveGame);
  const setCurrentGame = useAnalysisStore(s => s.setCurrentGame);
  const { play } = useSound();

  const urlTc = tc || searchParams.get('tc') || '5+0';
  const timeControl = parseTimeControl(urlTc);
  const isVsComputer = mode === 'computer';
  const roomId = id;
  const isOnline = !!roomId;
  const myColor = (searchParams.get('color') as 'w' | 'b') || 'w';

  const chatInit = React.useMemo(() => [
    { id: '1', userId: 'system', username: 'System', text: t('game.gameStarted'), timestamp: Date.now() },
  ], []); // eslint-disable-line react-hooks/exhaustive-deps

  const [game, setGame] = useState(() => new Chess());
  const [flipped, setFlipped] = useState(myColor === 'b');
  const playerColor: 'w' | 'b' = myColor;
  const [whiteTime, setWhiteTime] = useState(timeControl.initial);
  const [blackTime, setBlackTime] = useState(timeControl.initial);
  const [gameStatus, setGameStatus] = useState<'playing' | 'ended'>('playing');
  const [result, setResult] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [chatMessages, setChatMessages] = useState(chatInit);
  const [chatInput, setChatInput] = useState('');
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [showBetting, setShowBetting] = useState(false);
  const [showVideo, setShowVideo] = useState(true);
  const [isOpponentDisconnected, setIsOpponentDisconnected] = useState(false);
  const [activeTab, setActiveTab] = useState<'moves' | 'chat'>('moves');
  const [drawOffered, setDrawOffered] = useState(false);
  const [incomingDraw, setIncomingDraw] = useState(false);
  const [drawDeclinedMsg, setDrawDeclinedMsg] = useState(false);
  const [takebackSent, setTakebackSent] = useState(false);
  const [incomingTakeback, setIncomingTakeback] = useState(false);
  const [spectators, setSpectators] = useState<string[]>([]);
  const [savingResult, setSavingResult] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef(game);
  gameRef.current = game;
  const userRef = useRef(user);
  userRef.current = user;
  const computerMovePending = useRef(false);
  const computerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [opponentInfo, setOpponentInfo] = useState<{ name: string; rating: number; country: string }>(() => {
    const nav = (location.state as any);
    if (nav?.whitePlayer && nav?.blackPlayer) {
      const opp = myColor === 'w' ? nav.blackPlayer : nav.whitePlayer;
      return { name: opp?.name || 'Opponent', rating: opp?.rating?.chess ?? opp?.rating ?? 1500, country: opp?.country || '' };
    }
    return { name: 'Opponent', rating: 1500, country: '' };
  });
  const opponent = isVsComputer ? COMPUTER_OPPONENT : { id: 'p2', name: opponentInfo.name, rating: opponentInfo.rating };

  const currentTurn = game.turn();

  // ── Register this game in the live games store ──────────────────────────────
  const gameIdRef = useRef(`chess-live-${Date.now()}`);
  useEffect(() => {
    const gid = gameIdRef.current;
    registerGame({
      id: gid,
      universe: 'chess',
      white: { name: user?.name || 'You', rating: user?.rating.chess || 1500 },
      black: { name: opponent.name, rating: opponent.rating },
      tc: urlTc,
      bet: activeBet?.amount || 0,
      fen: game.fen(),
      moveCount: 0,
      startedAt: Date.now(),
      status: 'playing',
    });
    return () => removeGame(gid);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep fen in sync
  useEffect(() => {
    updateGame(gameIdRef.current, {
      fen: game.fen(),
      moveCount: game.history().length,
      status: gameStatus,
    });
  }, [game, gameStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Computer move
  const makeComputerMove = useCallback(() => {
    if (computerMovePending.current) return;
    computerMovePending.current = true;

    // Clear any existing timeout
    if (computerTimeoutRef.current) clearTimeout(computerTimeoutRef.current);

    computerTimeoutRef.current = setTimeout(() => {
      computerMovePending.current = false;
      const g = gameRef.current;
      if (g.isGameOver() || gameStatus !== 'playing') return;

      const moves = g.moves();
      if (moves.length === 0) return;

      // Slightly smart: prefer captures
      const captures = moves.filter(m => m.includes('x'));
      const chosen = captures.length > 0 && Math.random() < 0.7
        ? captures[Math.floor(Math.random() * captures.length)]
        : moves[Math.floor(Math.random() * moves.length)];

      const newGame = new Chess(g.fen());
      const moveResult = newGame.move(chosen);
      
      if (moveResult) {
        setGame(newGame);
        setLastMove({ from: moveResult.from as Square, to: moveResult.to as Square });
        setMoveHistory(h => [...h, moveResult.san]);
        
        if (moveResult.captured) play('capture');
        else play('move');
        if (newGame.isCheck()) play('check');

        if (newGame.isGameOver()) {
          handleGameOver(newGame);
        }

        // Add increment to computer's clock
        if (playerColor === 'w') setBlackTime(t => t + timeControl.increment);
        else setWhiteTime(t => t + timeControl.increment);
      }
    }, 400 + Math.random() * 600);
  }, [play, playerColor, timeControl.increment, gameStatus]);

  // Trigger computer move whenever it becomes the computer's turn
  useEffect(() => {
    if (!isVsComputer || gameStatus !== 'playing') return;
    const compColor: 'w' | 'b' = playerColor === 'w' ? 'b' : 'w';
    if (game.turn() === compColor) {
      makeComputerMove();
    }

    return () => {
      if (computerTimeoutRef.current) {
        clearTimeout(computerTimeoutRef.current);
        computerMovePending.current = false;
      }
    };
  }, [game, isVsComputer, gameStatus, playerColor, makeComputerMove]);

  const handleMove = useCallback((from: Square, to: Square, promotion?: PieceSymbol) => {
    if (gameStatus !== 'playing') return;
    if (game.turn() !== playerColor) return;

    const newGame = new Chess(game.fen());
    const moveResult = newGame.move({ from, to, promotion: promotion || 'q' });
    if (!moveResult) return;

    setGame(newGame);
    setLastMove({ from, to });
    setMoveHistory(h => [...h, newGame.history().slice(-1)[0]]);
    if (moveResult.captured) play('capture');
    else play('move');
    if (newGame.isCheck()) play('check');
    if (moveResult.flags.includes('p')) play('promote');

    // Add increment to clock
    if (playerColor === 'w') setWhiteTime(t => t + timeControl.increment);
    else setBlackTime(t => t + timeControl.increment);

    if (isOnline) {
      socket.emit('move', { roomId, from, to, promotion: promotion || 'q' });
    }

    if (newGame.isGameOver()) {
      handleGameOver(newGame);
    }
  }, [game, gameStatus, playerColor, play, timeControl.increment]);

  const handleGameOver = (g: Chess) => {
    setGameStatus('ended');
    play('gameEnd');
    if (isOnline) setSavingResult(true);
    let res = '';
    if (g.isCheckmate()) {
      res = g.turn() === 'b' ? t('game.whiteWinsCheckmate') : t('game.blackWinsCheckmate');
    } else if (g.isStalemate()) res = t('game.drawStalemate');
    else if (g.isThreefoldRepetition()) res = t('game.drawThreefold');
    else if (g.isInsufficientMaterial()) res = t('game.drawInsufficient');
    else if (g.isDraw()) res = t('game.draw');
    setResult(res);

    // Settle bets if any
    if (activeBet && activeBet.amount > 0) {
      const winner = g.isCheckmate()
        ? (g.turn() === 'b' ? user?.id : opponent.id)
        : null;
      
      if (winner) {
        const isMe = winner === user?.id;
        useUserStore.getState().updateBetStats(isMe ? 'win' : 'loss');
        
        if (isMe) {
          const payout = activeBet.amount * 2 * 0.95; // 5% rake
          useUserStore.getState().updateBalance(payout);
          play('betWon');
          addNotification(t('game.youWonAmount', { amount: payout.toFixed(2) }), 'success');
        }
        settleBet(winner);
      } else if (!g.isCheckmate()) {
        // Draw: refund the wager
        useUserStore.getState().updateBalance(activeBet.amount);
        addNotification(t('game.drawBetRefunded'), 'info');
        useBettingStore.getState().cancelBet();
      }
    }
  };

  const handleResign = useCallback(() => {
    if (gameStatus === 'ended') return;
    if (moveHistory.length === 0) {
      // If no moves made, just leave the room silently (or cancel)
      socket.emit('room:cancel', { roomId });
      navigate('/');
      return;
    }
    if (window.confirm(t('game.resignConfirm'))) {
      if (isOnline) {
        socket.emit('resign', { roomId });
      } else {
        // Local game resignation
        setGameStatus('ended');
        setResult(t('game.youResigned'));
        play('gameEnd');
      }
    }
  }, [gameStatus, moveHistory.length, roomId, navigate, t, isOnline, play, game]);

  const handleQuitRoom = useCallback(() => {
    socket.emit('room:cancel', { roomId });
    navigate('/');
  }, [roomId, navigate]);

  const handleOfferDraw = () => {
    if (isVsComputer) {
      // Computer accepts draw if game is long (≥40 moves) or randomly (20% chance)
      const accepts = moveHistory.length >= 40 || Math.random() < 0.2;
      if (accepts) {
        setGameStatus('ended');
        setResult(t('game.drawAgreement'));
        play('gameEnd');
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
    setGameStatus('ended');
    setResult(t('game.drawAgreement'));
    play('gameEnd');
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

  const handleAnalyse = () => {
    const whitePlayer = playerColor === 'w' ? (user?.name || 'You') : opponent.name;
    const blackPlayer = playerColor === 'b' ? (user?.name || 'You') : opponent.name;
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const analysed = analyseGame(moveHistory, startFen, whitePlayer, blackPlayer, urlTc, result || '*');
    saveGame(analysed);
    setCurrentGame(analysed);
    navigate(`/chess/analysis`);
  };

  const handleNewGame = () => {
    setGame(new Chess());
    setWhiteTime(timeControl.initial);
    setBlackTime(timeControl.initial);
    setGameStatus('playing');
    setResult(null);
    setLastMove(null);
    setMoveHistory([]);
    setChatMessages(chatInit);
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    const msg = {
      id: Date.now().toString(),
      userId: user?.id || 'guest',
      username: user?.name || 'You',
      text: chatInput.trim(),
      timestamp: Date.now(),
    };
    setChatMessages(m => [...m, msg]);
    setChatInput('');
    
    if (isOnline) {
      socket.emit('chat', { roomId, message: msg.text, username: msg.username });
    }
  };

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatMessages]);

  useEffect(() => {
    if (!isOnline) return;

    const handleSocketMove = ({ from, to, promotion }: any) => {
      const g = gameRef.current;
      // Only apply the opponent's move (guard against receiving our own move)
      if (g.turn() === playerColor) return;
      const newGame = new Chess(g.fen());
      const res = newGame.move({ from, to, promotion });
      if (res) {
        setGame(newGame);
        setLastMove({ from: res.from as Square, to: res.to as Square });
        setMoveHistory(h => [...h, res.san]);
        if (res.captured) play('capture');
        else play('move');
        if (newGame.isCheck()) play('check');
        if (newGame.isGameOver()) handleGameOver(newGame);
        // Add increment to the player who just moved (the opponent)
        if (playerColor === 'w') setBlackTime(t => t + timeControl.increment);
        else setWhiteTime(t => t + timeControl.increment);
      }
    };

    const handleSocketChat = (msg: any) => {
      if (msg.isSystem && msg.systemType === 'spec_join') {
        setChatMessages(m => [...m, { id: msg.timestamp.toString(), userId: 'system', username: 'System', text: t('game.specJoined', { name: msg.message }), timestamp: msg.timestamp }]);
        return;
      }
      if (msg.isSystem && msg.systemType === 'spec_leave') {
        setChatMessages(m => [...m, { id: msg.timestamp.toString(), userId: 'system', username: 'System', text: t('game.specLeft', { name: msg.message }), timestamp: msg.timestamp }]);
        return;
      }
      setChatMessages(m => [...m, { id: msg.timestamp.toString(), userId: msg.isSpectator ? 'spectator' : 'opp', username: msg.username, text: msg.message, isSpectator: msg.isSpectator, timestamp: msg.timestamp }]);
    };

    const handleGameOverEmit = (data: any) => {
      setGameStatus('ended');
      if (data.result === 'resign') {
        setResult(t('game.opponentResigned'));
      } else if (data.result === 'draw') {
        setResult(t('game.drawAgreement'));
      } else {
        setResult(t('game.gameOver'));
      }
      play('gameEnd');
    };

    const handleDrawOffer = () => {
      setIncomingDraw(true);
      addNotification(t('game.opponentOfferedDraw', 'Your opponent offered a draw'), 'info');
    };
    const handleDrawDeclined = () => {
      setDrawOffered(false);
      setDrawDeclinedMsg(true);
      setTimeout(() => setDrawDeclinedMsg(false), 2500);
      addNotification(t('game.drawDeclined', 'Draw offer was declined'), 'warning');
    };

    const handleGameStart = (data: any) => {
      const myName = userRef.current?.name || '';
      const isWhite = data.whitePlayer?.name === myName || myColor === 'w';
      const opp = isWhite ? data.blackPlayer : data.whitePlayer;
      if (opp) setOpponentInfo({ name: opp.name, rating: opp.rating?.chess ?? opp.rating ?? 1500, country: opp.country || '' });
    };

    const handleSpectateList = (list: string[]) => setSpectators(list);

    // ── Reconnect tokens ────────────────────────────────────────────────────
    const handleRoomTokens = (data: { roomId: string; token: string; color: 'white' | 'black' }) => {
      sessionStorage.setItem('damcash_rejoin_chess', JSON.stringify(data));
    };

    // ── Restore game state after reconnect ──────────────────────────────────
    const handleRoomState = (data: any) => {
      const rebuilt = new Chess();
      for (const m of (data.moves || [])) {
        rebuilt.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' });
      }
      setGame(rebuilt);
      setMoveHistory(rebuilt.history());
      const lastM = data.moves?.[data.moves.length - 1];
      if (lastM) setLastMove({ from: lastM.from as Square, to: lastM.to as Square });
      const myCol = data.color; // 'white' | 'black'
      const opp = myCol === 'white' ? data.blackPlayer : data.whitePlayer;
      if (opp) setOpponentInfo({ name: opp.name || 'Opponent', rating: Number(opp.rating?.chess ?? opp.rating) || 1500, country: opp.country || '' });
    };

    const handleTakebackRequest = () => {
      setIncomingTakeback(true);
      addNotification(t('game.opponentRequestsTakeback', 'Your opponent requested a takeback'), 'info');
    };
    const handleTakebackAccepted = (data: { undoCount: number }) => {
      setTakebackSent(false);
      addNotification(t('game.takebackAccepted', 'Takeback accepted'), 'success');
      const count = data?.undoCount ?? 1;
      setGame(prev => {
        const hist = prev.history({ verbose: true });
        const rebuilt = new Chess();
        for (let i = 0; i < hist.length - count; i++) rebuilt.move(hist[i]);
        return rebuilt;
      });
      setMoveHistory(prev => prev.slice(0, Math.max(0, prev.length - count)));
      setLastMove(null);
    };
    const handleTakebackDeclined = () => { setTakebackSent(false); addNotification(t('game.takebackDeclined', 'Takeback request declined'), 'warning'); };
    const handleTakebackExpired  = () => { setTakebackSent(false); addNotification(t('game.takebackExpired', 'Takeback request expired'), 'warning'); };

    const handleRoomCancelled = () => {
      addNotification(t('game.roomCancelled'), 'info');
      navigate('/');
    };

    const handlePlayerDisconnected = (data: { socketId: string }) => {
      addNotification(t('game.opponentDisconnected'), 'warning');
      setIsOpponentDisconnected(true);
      // If no moves were made, just go back. Otherwise, the game is likely aborted or ended.
      if (moveHistory.length === 0) {
        navigate('/');
      } else {
        setGameStatus('ended');
        setResult(t('game.opponentLeft'));
      }
    };

    const handlePlayerReconnected = (data: { socketId: string; color: string }) => {
      addNotification(t('game.opponentReconnected'), 'success');
      setIsOpponentDisconnected(false);
    };

    const handleRoomPlayers = (data: any) => {
      const opp = myColor === 'w' ? data.blackPlayer : data.whitePlayer;
      if (opp?.name && (opponentInfo.name === 'Opponent' || (opp.name !== 'White' && opp.name !== 'Black'))) {
        setOpponentInfo({ name: opp.name, rating: Number(opp.rating?.chess ?? opp.rating) || 1500, country: opp.country || '' });
      }
    };

    const handleRatingUpdate = () => setSavingResult(false);

    socket.on('game-start', handleGameStart);
    socket.on('spectate:list', handleSpectateList);
    socket.on('move', handleSocketMove);
    socket.on('chat', handleSocketChat);
    socket.on('game-over', handleGameOverEmit);
    socket.on('draw:offer', handleDrawOffer);
    socket.on('draw:declined', handleDrawDeclined);
    socket.on('takeback:request',  handleTakebackRequest);
    socket.on('takeback:accept',   handleTakebackAccepted);
    socket.on('takeback:declined', handleTakebackDeclined);
    socket.on('takeback:expired',  handleTakebackExpired);
    socket.on('room:tokens',  handleRoomTokens);
    socket.on('room:state',   handleRoomState);
    socket.on('room:cancelled', handleRoomCancelled);
    socket.on('room:players', handleRoomPlayers);
    socket.on('rating:update', handleRatingUpdate);
    socket.on('player-disconnected', handlePlayerDisconnected);
    socket.on('player-reconnected',  handlePlayerReconnected);

    // Attempt rejoin if this socket is new but we have a stored token for this room
    const stored = sessionStorage.getItem('damcash_rejoin_chess');
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
      socket.off('draw:offer', handleDrawOffer);
      socket.off('draw:declined', handleDrawDeclined);
      socket.off('takeback:request',  handleTakebackRequest);
      socket.off('takeback:accept',   handleTakebackAccepted);
      socket.off('takeback:declined', handleTakebackDeclined);
      socket.off('takeback:expired',  handleTakebackExpired);
      socket.off('room:tokens',  handleRoomTokens);
      socket.off('room:state',   handleRoomState);
      socket.off('room:cancelled', handleRoomCancelled);
      socket.off('room:players', handleRoomPlayers);
      socket.off('rating:update', handleRatingUpdate);
      socket.off('player-disconnected', handlePlayerDisconnected);
      socket.off('player-reconnected',  handlePlayerReconnected);
    };
  }, [isOnline, playerColor, play, timeControl.increment]);

  // Warn before closing tab mid-game
  useEffect(() => {
    if (!isOnline || gameStatus !== 'playing') return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isOnline, gameStatus]);

  const isPlayerTurn = currentTurn === playerColor;
  const inCheck = game.isCheck();

  // Format moves for display
  const movePairs: { num: number; white: string; black: string }[] = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    movePairs.push({
      num: Math.floor(i / 2) + 1,
      white: moveHistory[i] || '',
      black: moveHistory[i + 1] || '',
    });
  }

  return (
    <div className="game-room">
      {/* Center: board */}
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
                {isOpponentDisconnected && (
                  <span style={{ color: '#ef4444', fontSize: 11, fontWeight: 700, marginLeft: 6 }}>
                    ● {t('game.disconnected', 'OFFLINE')}
                  </span>
                )}
              </div>
            </PlayerPopover>
            <div className="player-rating">({opponent.rating})</div>
          </div>
          <Clock
            timeMs={playerColor === 'w' ? blackTime : whiteTime}
            active={gameStatus === 'playing' && currentTurn !== playerColor && moveHistory.length > 0}
            onTick={(ms) => playerColor === 'w' ? setBlackTime(ms) : setWhiteTime(ms)}
            onExpire={() => handleGameOver(game)}
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
        <div className="chess-board-wrap">
          <ChessBoard
            game={game}
            flipped={flipped}
            playerColor={playerColor}
            onMove={handleMove}
            lastMove={lastMove}
            inCheck={inCheck}
          />
          {gameStatus === 'ended' && (
            <div className="game-over-overlay">
              <div className="game-over-box">
                <div className="game-over-title">
                  {result?.includes('wins') ? (result.includes('White') && playerColor === 'w' ? '🏆' : '💔') : '🤝'}
                </div>
                <div className="game-over-title">{t('game.gameOver')}</div>
                <div className="game-over-subtitle">{result}</div>
                {savingResult && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 4 }}>
                    <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                    {t('game.savingResult', 'Saving result…')}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={handleNewGame}>{t('game.rematch')}</button>
                  <button className="btn btn-secondary" onClick={() => navigate('/')}>
                    {t('game.quit')}
                  </button>
                  {moveHistory.length > 2 && (
                    <button className="btn btn-secondary" onClick={handleAnalyse}>
                      📊 {t('game.analysis')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Head-to-head score strip */}
        {isOnline && user?.name && opponentInfo.name !== 'Opponent' && (
          <HeadToHeadPanel
            playerA={user.name}
            playerB={opponentInfo.name}
            universe="chess"
          />
        )}

        {/* Player bar */}
        <div className="player-bar" style={{ width: '100%' }}>
          <div className="player-avatar" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
            {user?.name?.[0] || 'Y'}
          </div>
          <div>
            <PlayerPopover player={{ name: user?.name || 'You', rating: user?.rating.chess || 1500 }}>
              <div className="player-name" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                {user?.country && <span style={{ fontSize: 15 }}>{countryFlag(user.country)}</span>}
                {user?.name || 'You'}
              </div>
            </PlayerPopover>
            <div className="player-rating">({user?.rating.chess || 1500})</div>
          </div>
          <Clock
            timeMs={playerColor === 'w' ? whiteTime : blackTime}
            active={gameStatus === 'playing' && currentTurn === playerColor && moveHistory.length > 0}
            onTick={(ms) => playerColor === 'w' ? setWhiteTime(ms) : setBlackTime(ms)}
            onExpire={() => handleGameOver(game)}
          />
        </div>

        {/* Controls */}
        <div className="game-controls">
          <button className="btn btn-secondary btn-sm" onClick={() => setFlipped(f => !f)} aria-label={t('game.flip')}>
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
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleOfferDraw}
                disabled={drawOffered}
                title={drawOffered ? 'Draw offer sent' : 'Offer a draw'}
              >
                {drawOffered ? '½ Offered…' : '½ Draw'}
              </button>
              {(moveHistory.length > 0 || game.history().length > 0) ? (
                <button
                  className="btn btn-danger btn-sm"
                  style={{ flex: 1 }}
                  onClick={handleResign}
                >
                  🏳 {t('game.resign')}
                </button>
              ) : (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => {
                    if (isOnline) socket.emit('room:cancel', { roomId });
                    navigate('/');
                  }}
                >
                  🚪 {t('game.quitRoom')}
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
                roomId={roomId || `chess-local-${gameIdRef.current}`}
                playerName={user?.name || 'You'}
                opponentName={opponent.name}
              />
            </div>
          </div>
        )}

        {/* Betting */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">💰 {t('betting.wallet')}</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowBetting(s => !s)}
            >
              {showBetting ? '▲' : '▼'}
            </button>
          </div>
          {showBetting && (
            <div className="panel-body">
              <BettingPanel />
            </div>
          )}
          {!showBetting && (
            <div className="panel-body" style={{ padding: '8px 12px', cursor: 'pointer' }} onClick={() => setShowBetting(true)}>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                {activeBet
                  ? t('game.activeBet', { amount: activeBet.amount })
                  : t('betting.playForFun')}
              </div>
            </div>
          )}
        </div>

        {/* Moves / Chat */}
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
                {movePairs.map((pair) => (
                  <div key={pair.num} className="move-row">
                    <span className="move-num">{pair.num}.</span>
                    <span className="move-white">{pair.white}</span>
                    <span className="move-black">{pair.black}</span>
                  </div>
                ))}
                {moveHistory.length === 0 && (
                  <div className="text-muted text-sm text-center" style={{ padding: 16 }}>
                    {isPlayerTurn ? t('game.yourTurn') : t('game.waitingForOpponent')}
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
                  {chatMessages.map((msg) => (
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
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
                    maxLength={200}
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
