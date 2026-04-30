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
}

interface CellProps {
  sq: Square;
  light: boolean;
  isSelected: boolean;
  isLegal: boolean;
  isLastFrom: boolean;
  isLastTo: boolean;
  isKingCheck: boolean;
  pieceObj: { type: PieceSymbol; color: ChessColor } | null;
  file: string;
  rank: string;
  showFileCoord: boolean;
  showRankCoord: boolean;
  onClick: (sq: Square) => void;
}

const ChessCell: React.FC<CellProps> = React.memo(({
  sq, light, isSelected, isLegal, isLastFrom, isLastTo, isKingCheck, pieceObj,
  file, rank, showFileCoord, showRankCoord, onClick
}) => {
  const hasPiece = !!pieceObj;
  let cellClass = `chess-cell ${light ? 'light' : 'dark'}`;
  if (isSelected) cellClass += ' selected';
  if (isLegal && hasPiece) cellClass += ' legal-capture';
  else if (isLegal) cellClass += ' legal-move';
  if (isLastFrom || isLastTo) cellClass += ' last-move-from';
  if (isKingCheck) cellClass += ' in-check';

  return (
    <div
      className={cellClass}
      onClick={() => onClick(sq)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const fromSq = e.dataTransfer.getData('from') as Square;
        if (fromSq && fromSq !== sq) onClick(sq);
      }}
    >
      {pieceObj && (
        <div
          className="chess-piece-el-container"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('from', sq);
            onClick(sq);
          }}
          style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}
        >
          <ChessPiece type={pieceObj.type} color={pieceObj.color} />
        </div>
      )}
      {showFileCoord && <span className="board-coords board-coord-file">{file}</span>}
      {showRankCoord && <span className="board-coords board-coord-rank">{rank}</span>}
    </div>
  );
});

export const ChessBoard: React.FC<Props> = ({
  game, flipped, playerColor, onMove, lastMove, inCheck,
}) => {
  const [selected, setSelected] = useState<Square | null>(null);
  const [legalMoves, setLegalMoves] = useState<Square[]>([]);
  const [promotionPending, setPromotionPending] = useState<{ from: Square; to: Square } | null>(null);
  const { play } = useSound();

  // Refs keep the latest values without changing handler identity
  const gameRef = useRef(game);
  const selectedRef = useRef(selected);
  const legalMovesRef = useRef(legalMoves);
  gameRef.current = game;
  selectedRef.current = selected;
  legalMovesRef.current = legalMoves;

  const ranks = flipped ? [...RANKS].reverse() : RANKS;
  const files = flipped ? [...FILES].reverse() : FILES;

  const isLight = (rankIdx: number, fileIdx: number): boolean => {
    const file = FILES.indexOf(files[fileIdx]);
    const rank = RANKS.indexOf(ranks[rankIdx]);
    return (file + rank) % 2 === 0;
  };

  const handleSquareClick = useCallback((sq: Square) => {
    const g = gameRef.current;
    const sel = selectedRef.current;
    const legal = legalMovesRef.current;
    const piece = g.get(sq);
    if (piece && piece.color === playerColor) {
      setSelected(sq);
      setLegalMoves(g.moves({ square: sq, verbose: true }).map(m => m.to as Square));
      return;
    }
    if (sel && legal.includes(sq)) {
      const piece2 = g.get(sel);
      const isPromotion = piece2?.type === 'p' && ((piece2.color === 'w' && sq[1] === '8') || (piece2.color === 'b' && sq[1] === '1'));
      if (isPromotion) setPromotionPending({ from: sel, to: sq });
      else { onMove(sel, sq); if (g.get(sq)) play('move'); }
      setSelected(null); setLegalMoves([]); return;
    }
    setSelected(null); setLegalMoves([]);
  }, [playerColor, onMove, play]);

  const handlePromotion = (piece: PieceSymbol) => {
    if (promotionPending) { onMove(promotionPending.from, promotionPending.to, piece); setPromotionPending(null); }
  };

  const getKingSquare = (): Square | null => {
    if (!inCheck) return null;
    const turn = game.turn();
    for (let f of FILES) { for (let r of RANKS) { const sq = `${f}${r}` as Square; const p = game.get(sq); if (p && p.type === 'k' && p.color === turn) return sq; } }
    return null;
  };

  const kingInCheckSq = getKingSquare();

  return (
    <div style={{ position: 'relative' }}>
      <div className="chess-board">
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
                pieceObj={game.get(sq) ?? null}
                file={file}
                rank={rank}
                showFileCoord={ri === 7}
                showRankCoord={fi === 7}
                onClick={handleSquareClick}
              />
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
