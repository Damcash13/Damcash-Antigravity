import React, { useState, useCallback } from 'react';
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
}

export const ChessBoard: React.FC<Props> = ({
  game, flipped, playerColor, onMove, lastMove, inCheck,
}) => {
  const [selected, setSelected] = useState<Square | null>(null);
  const [legalMoves, setLegalMoves] = useState<Square[]>([]);
  const [promotionPending, setPromotionPending] = useState<{ from: Square; to: Square } | null>(null);
  const { play } = useSound();

  const ranks = flipped ? [...RANKS].reverse() : RANKS;
  const files = flipped ? [...FILES].reverse() : FILES;

  const getSquare = (rankIdx: number, fileIdx: number): Square => {
    return `${files[fileIdx]}${ranks[rankIdx]}` as Square;
  };

  const isLight = (rankIdx: number, fileIdx: number): boolean => {
    const file = FILES.indexOf(files[fileIdx]);
    const rank = RANKS.indexOf(ranks[rankIdx]);
    return (file + rank) % 2 === 0;
  };

  const handleSquareClick = useCallback((sq: Square) => {
    const piece = game.get(sq);

    // If clicking own piece, select it
    if (piece && piece.color === playerColor) {
      setSelected(sq);
      const moves = game.moves({ square: sq, verbose: true }).map(m => m.to as Square);
      setLegalMoves(moves);
      return;
    }

    // If we have a selection and click a legal target
    if (selected && legalMoves.includes(sq)) {
      // Check if this is a pawn promotion move
      const piece2 = game.get(selected);
      const isPromotion =
        piece2?.type === 'p' &&
        ((piece2.color === 'w' && sq[1] === '8') || (piece2.color === 'b' && sq[1] === '1'));

      if (isPromotion) {
        setPromotionPending({ from: selected, to: sq });
      } else {
        onMove(selected, sq);
        const moveResult = game.get(sq);
        if (moveResult) play('move');
      }
      setSelected(null);
      setLegalMoves([]);
      return;
    }

    // Deselect
    setSelected(null);
    setLegalMoves([]);
  }, [game, playerColor, selected, legalMoves, onMove, play]);

  const handlePromotion = (piece: PieceSymbol) => {
    if (promotionPending) {
      onMove(promotionPending.from, promotionPending.to, piece);
      setPromotionPending(null);
    }
  };

  // Find king in check position
  const getKingSquare = (): Square | null => {
    if (!inCheck) return null;
    const turn = game.turn();
    for (let f of FILES) {
      for (let r of RANKS) {
        const sq = `${f}${r}` as Square;
        const p = game.get(sq);
        if (p && p.type === 'k' && p.color === turn) return sq;
      }
    }
    return null;
  };

  const kingInCheckSq = getKingSquare();

  return (
    <div style={{ position: 'relative' }}>
      <div className="chess-board">
        {ranks.map((rank, ri) =>
          files.map((file, fi) => {
            const sq = `${file}${rank}` as Square;
            const light = isLight(ri, fi);
            const isSelected = selected === sq;
            const isLegal = legalMoves.includes(sq);
            const isLastFrom = lastMove?.from === sq;
            const isLastTo = lastMove?.to === sq;
            const isKingCheck = kingInCheckSq === sq;
            const pieceObj = game.get(sq);
            const hasPiece = !!pieceObj;

            let cellClass = `chess-cell ${light ? 'light' : 'dark'}`;
            if (isSelected) cellClass += ' selected';
            if (isLegal && hasPiece) cellClass += ' legal-capture';
            else if (isLegal) cellClass += ' legal-move';
            if (isLastFrom || isLastTo) cellClass += ' last-move-from';
            if (isKingCheck) cellClass += ' in-check';

            const showFileCoord = ri === 7;
            const showRankCoord = fi === 7;

            return (
              <div
                key={sq}
                className={cellClass}
                onClick={() => handleSquareClick(sq)}
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromSq = e.dataTransfer.getData('from') as Square;
                  if (fromSq && fromSq !== sq) {
                    handleSquareClick(sq);
                  }
                }}
              >
                {pieceObj && (
                  <div
                    className="chess-piece-el-container"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('from', sq);
                      handleSquareClick(sq);
                    }}
                    style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}
                  >
                    <ChessPiece type={pieceObj.type} color={pieceObj.color} />
                  </div>
                )}
                {showFileCoord && (
                  <span className="board-coords board-coord-file">{file}</span>
                )}
                {showRankCoord && (
                  <span className="board-coords board-coord-rank">{rank}</span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Promotion modal */}
      {promotionPending && (
        <div className="modal-overlay" onClick={() => setPromotionPending(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Promote pawn</div>
            <div className="promotion-pieces">
              {(['q', 'r', 'b', 'n'] as PieceSymbol[]).map((p) => {
                const color = playerColor;
                return (
                  <div
                    key={p}
                    className="promotion-piece"
                    onClick={() => handlePromotion(p)}
                    style={{ width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <ChessPiece type={p} color={color} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
