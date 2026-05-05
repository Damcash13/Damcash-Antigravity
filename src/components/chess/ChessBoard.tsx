import React, { useState, useCallback, useRef } from 'react';
import { Chess, Square, PieceSymbol, Color as ChessColor } from 'chess.js';
import { useSound } from '../../hooks/useSound';
import { ChessPiece } from './ChessPieces';

const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['8','7','6','5','4','3','2','1'];

interface Props {
  game: Chess;
  flipped: boolean;
  playerColor: 'w' | 'b';
  onMove: (from: Square, to: Square, promotion?: PieceSymbol) => void;
  lastMove: { from: Square; to: Square } | null;
  inCheck: boolean;
  premove?: { from: Square; to: Square } | null;
  onPremove?: (from: Square, to: Square) => void;
  onClearPremove?: () => void;
}

interface CellProps {
  sq: Square;
  light: boolean;
  isSelected: boolean;
  isLegal: boolean;
  isLastFrom: boolean;
  isLastTo: boolean;
  isKingCheck: boolean;
  isPremove: boolean;
  isDragging: boolean;
  pieceObj: { type: PieceSymbol; color: ChessColor } | null;
  file: string;
  rank: string;
  showFileCoord: boolean;
  showRankCoord: boolean;
  onClick: (sq: Square) => void;
}

const ChessCell: React.FC<CellProps> = React.memo(({
  sq, light, isSelected, isLegal, isLastFrom, isLastTo, isKingCheck,
  isPremove, isDragging, pieceObj,
  file, rank, showFileCoord, showRankCoord, onClick,
}) => {
  const hasPiece = !!pieceObj;
  let cellClass = `chess-cell ${light ? 'light' : 'dark'}`;
  if (isSelected) cellClass += ' selected';
  if (isLegal && hasPiece) cellClass += ' legal-capture';
  else if (isLegal) cellClass += ' legal-move';
  if (isLastFrom || isLastTo) cellClass += ' last-move-from';
  if (isKingCheck) cellClass += ' in-check';
  if (isPremove) cellClass += ' premove';

  return (
    <div
      className={cellClass}
      data-sq={sq}
      onClick={() => onClick(sq)}
    >
      {pieceObj && (
        <div
          className="chess-piece-el-container"
          style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1,
            opacity: isDragging ? 0.25 : 1,
            touchAction: 'none',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          <ChessPiece type={pieceObj.type} color={pieceObj.color} />
        </div>
      )}
      {showFileCoord && <span className="board-coords board-coord-file">{file}</span>}
      {showRankCoord && <span className="board-coords board-coord-rank">{rank}</span>}
    </div>
  );
});

interface DragStateType {
  sq: Square;
  piece: { type: PieceSymbol; color: ChessColor };
  x: number;
  y: number;
  size: number;
}

export const ChessBoard: React.FC<Props> = ({
  game, flipped, playerColor, onMove, lastMove, inCheck,
  premove, onPremove, onClearPremove,
}) => {
  const [selected, setSelected] = useState<Square | null>(null);
  const [legalMoves, setLegalMoves] = useState<Square[]>([]);
  const [promotionPending, setPromotionPending] = useState<{ from: Square; to: Square } | null>(null);
  const [premoveFrom, setPremoveFrom] = useState<Square | null>(null);
  const [dragState, setDragState] = useState<DragStateType | null>(null);
  const { play } = useSound();

  const gameRef = useRef(game);
  const selectedRef = useRef(selected);
  const legalMovesRef = useRef(legalMoves);
  const dragRef = useRef(dragState);
  const premoveFromRef = useRef(premoveFrom);
  gameRef.current = game;
  selectedRef.current = selected;
  legalMovesRef.current = legalMoves;
  dragRef.current = dragState;
  premoveFromRef.current = premoveFrom;

  const boardRef = useRef<HTMLDivElement>(null);

  const ranks = flipped ? [...RANKS].reverse() : RANKS;
  const files = flipped ? [...FILES].reverse() : FILES;

  const isLight = (rankIdx: number, fileIdx: number): boolean => {
    const file = FILES.indexOf(files[fileIdx]);
    const rank = RANKS.indexOf(ranks[rankIdx]);
    return (file + rank) % 2 === 0;
  };

  const getPremoveTargets = useCallback((g: Chess, from: Square): Square[] => {
    try {
      const fenParts = g.fen().split(' ');
      fenParts[1] = playerColor;
      const premoveGame = new Chess(fenParts.join(' '));
      return premoveGame.moves({ square: from, verbose: true }).map(m => m.to as Square);
    } catch {
      return [];
    }
  }, [playerColor]);

  const handleSquareClick = useCallback((sq: Square) => {
    const g = gameRef.current;
    const sel = selectedRef.current;
    const legal = legalMovesRef.current;
    const piece = g.get(sq);

    // ── Opponent's turn: premove mode ────────────────────────────────────────
    if (g.turn() !== playerColor) {
      if (premove && (premove.from === sq || premove.to === sq)) {
        onClearPremove?.();
        setSelected(null);
        setPremoveFrom(null);
        setLegalMoves([]);
        play('premove');
        return;
      }

      if (piece && piece.color === playerColor) {
        const targets = getPremoveTargets(g, sq);
        if (targets.length === 0) {
          setSelected(null);
          setPremoveFrom(null);
          setLegalMoves([]);
          return;
        }
        onClearPremove?.();
        setSelected(sq);
        setPremoveFrom(sq);
        setLegalMoves(targets);
        play('premove');
        return;
      }

      const pmFrom = premoveFromRef.current;
      if (pmFrom && legal.includes(sq)) {
        onPremove?.(pmFrom, sq);
        setPremoveFrom(null);
        setSelected(null);
        setLegalMoves([]);
        play('premove');
        return;
      }

      setSelected(null);
      setPremoveFrom(null);
      setLegalMoves([]);
      return;
    }

    // ── Player's turn: normal move ────────────────────────────────────────────
    onClearPremove?.();
    setPremoveFrom(null);

    if (piece && piece.color === playerColor) {
      setSelected(sq);
      setLegalMoves(g.moves({ square: sq, verbose: true }).map(m => m.to as Square));
      return;
    }
    if (sel && legal.includes(sq)) {
      const piece2 = g.get(sel);
      const isPromotion = piece2?.type === 'p' &&
        ((piece2.color === 'w' && sq[1] === '8') || (piece2.color === 'b' && sq[1] === '1'));
      if (isPromotion) setPromotionPending({ from: sel, to: sq });
      else { onMove(sel, sq); }
      setSelected(null); setLegalMoves([]); return;
    }
    setSelected(null); setLegalMoves([]);
  }, [playerColor, onMove, play, onPremove, onClearPremove, premove, getPremoveTargets]);

  const handlePromotion = (piece: PieceSymbol) => {
    if (promotionPending) { onMove(promotionPending.from, promotionPending.to, piece); setPromotionPending(null); }
  };

  const getKingSquare = (): Square | null => {
    if (!inCheck) return null;
    const turn = game.turn();
    for (const f of FILES) {
      for (const r of RANKS) {
        const sq = `${f}${r}` as Square;
        const p = game.get(sq);
        if (p && p.type === 'k' && p.color === turn) return sq;
      }
    }
    return null;
  };

  const kingInCheckSq = getKingSquare();

  // ── Pointer-based drag & drop (works on mouse + touch) ───────────────────────
  const handleBoardPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Find if the pointer is on a piece cell
    const cellEl = (e.target as HTMLElement).closest('[data-sq]') as HTMLElement | null;
    if (!cellEl) return;
    const sq = cellEl.getAttribute('data-sq') as Square;
    if (!sq) return;
    const g = gameRef.current;
    const piece = g.get(sq);
    // Only drag player's own pieces (or premove pieces on opponent's turn)
    if (!piece || piece.color !== playerColor) return;

    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const size = rect.width / 8;
    setDragState({ sq, piece, x: e.clientX, y: e.clientY, size });
    handleSquareClick(sq);
  }, [playerColor, handleSquareClick]);

  const handleBoardPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setDragState(d => d ? { ...d, x: e.clientX, y: e.clientY } : null);
  }, []);

  const handleBoardPointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    // Find the target cell under the pointer (elementsFromPoint ignores pointer capture)
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    const cellEl = els.find(el => el.hasAttribute('data-sq'));
    if (cellEl) {
      const targetSq = cellEl.getAttribute('data-sq') as Square;
      if (targetSq && targetSq !== drag.sq) {
        const g = gameRef.current;
        if (g.turn() !== playerColor) {
          const targets = getPremoveTargets(g, drag.sq);
          if (targets.includes(targetSq)) {
            onClearPremove?.();
            onPremove?.(drag.sq, targetSq);
            play('premove');
          }
          setSelected(null);
          setPremoveFrom(null);
          setLegalMoves([]);
        } else {
          handleSquareClick(targetSq);
        }
      }
    }
    setDragState(null);
  }, [getPremoveTargets, handleSquareClick, onClearPremove, onPremove, play, playerColor]);

  const isPremoveSquare = (sq: Square) =>
    premove?.from === sq || premove?.to === sq ||
    (premoveFrom === sq);

  return (
    <div style={{ position: 'relative' }}>
      <div
        className="chess-board"
        ref={boardRef}
        onPointerDown={handleBoardPointerDown}
        onPointerMove={handleBoardPointerMove}
        onPointerUp={handleBoardPointerUp}
        style={{ touchAction: 'none', userSelect: 'none' }}
      >
        {ranks.map((rank, ri) =>
          files.map((file, fi) => {
            const sq = `${file}${rank}` as Square;
            return (
              <ChessCell
                key={sq}
                sq={sq}
                light={isLight(ri, fi)}
                isSelected={selected === sq}
                isLegal={legalMoves.includes(sq)}
                isLastFrom={lastMove?.from === sq}
                isLastTo={lastMove?.to === sq}
                isKingCheck={kingInCheckSq === sq}
                isPremove={isPremoveSquare(sq)}
                isDragging={dragState?.sq === sq}
                pieceObj={game.get(sq) ?? null}
                file={file}
                rank={rank}
                showFileCoord={ri === ranks.length - 1}
                showRankCoord={fi === 0}
                onClick={handleSquareClick}
              />
            );
          })
        )}
      </div>

      {/* Floating ghost piece during drag */}
      {dragState && (
        <div
          style={{
            position: 'fixed',
            left: dragState.x - dragState.size / 2,
            top: dragState.y - dragState.size / 2,
            width: dragState.size,
            height: dragState.size,
            pointerEvents: 'none',
            zIndex: 9999,
            opacity: 0.88,
            transform: 'scale(1.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))',
          }}
        >
          <ChessPiece type={dragState.piece.type} color={dragState.piece.color} />
        </div>
      )}

      {/* Promotion modal */}
      {promotionPending && (
        <div className="modal-overlay" onClick={() => setPromotionPending(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Promote pawn</div>
            <div className="promotion-pieces">
              {(['q', 'r', 'b', 'n'] as PieceSymbol[]).map((p) => (
                <div
                  key={p}
                  className="promotion-piece"
                  onClick={() => handlePromotion(p)}
                  style={{ width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <ChessPiece type={p} color={playerColor} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
