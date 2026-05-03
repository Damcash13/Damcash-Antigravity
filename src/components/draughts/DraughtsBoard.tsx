import React, { useCallback, useRef, useState } from 'react';
import { DraughtsBoard as Board, DraughtsMove, Position } from '../../types';

interface Props {
  board: Board;
  selectedSquare: Position | null;
  legalMoves: DraughtsMove[];
  lastMove: DraughtsMove | null;
  flipped: boolean;
  onSquareClick: (row: number, col: number) => void;
}

// International draughts: dark squares numbered 1–50, top-left to bottom-right
function getDraughtsSquareNumber(row: number, col: number): number | null {
  if ((row + col) % 2 === 0) return null; // light square
  const darkIndex = row % 2 === 0 ? (col - 1) / 2 : col / 2;
  return row * 5 + darkIndex + 1;
}

interface CellProps {
  row: number;
  col: number;
  isLight: boolean;
  piece: { color: 'white' | 'black'; type: 'man' | 'king' } | null;
  selected: boolean;
  legalTarget: boolean;
  lastFrom: boolean;
  lastTo: boolean;
  isDragging: boolean;
  onSquareClick: (row: number, col: number) => void;
}

const DraughtsCell: React.FC<CellProps> = React.memo(({
  row, col, isLight, piece, selected, legalTarget, lastFrom, lastTo, isDragging, onSquareClick,
}) => {
  let cellClass = `draughts-cell ${isLight ? 'light' : 'dark'}`;
  if (!isLight) {
    if (selected) cellClass += ' selected';
    else if (legalTarget) cellClass += ' legal-target';
    else if (lastFrom) cellClass += ' last-from';
    else if (lastTo) cellClass += ' last-to';
  }

  const squareNum = getDraughtsSquareNumber(row, col);

  return (
    <div
      className={cellClass}
      data-row={row}
      data-col={col}
      onClick={() => !isLight && onSquareClick(row, col)}
    >
      {squareNum !== null && (
        <span style={{
          position: 'absolute', top: 2, left: 3,
          fontSize: 9, fontWeight: 700, lineHeight: 1,
          color: 'rgba(255,255,255,0.35)',
          pointerEvents: 'none', userSelect: 'none',
        }}>
          {squareNum}
        </span>
      )}
      {piece && (
        <div
          className={`draughts-piece ${piece.color === 'white' ? 'white-pc' : 'black-pc'} ${selected ? 'selected-piece' : ''} ${piece.type === 'king' ? 'is-king' : ''}`}
          style={{
            opacity: isDragging ? 0.25 : 1,
            touchAction: 'none',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          {piece.type === 'king' && <div className="draughts-piece-bottom" />}
          {piece.type === 'king' && (
            <span className="draughts-king-crown">
              {piece.color === 'white' ? '♛' : '♕'}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

interface DragStateType {
  row: number;
  col: number;
  piece: { color: 'white' | 'black'; type: 'man' | 'king' };
  x: number;
  y: number;
  size: number;
}

export const DraughtsBoard: React.FC<Props> = ({
  board, selectedSquare, legalMoves, lastMove, flipped, onSquareClick,
}) => {
  const rows = flipped
    ? Array.from({ length: 10 }, (_, i) => 9 - i)
    : Array.from({ length: 10 }, (_, i) => i);
  const cols = flipped
    ? Array.from({ length: 10 }, (_, i) => 9 - i)
    : Array.from({ length: 10 }, (_, i) => i);

  const onSquareClickRef = useRef(onSquareClick);
  onSquareClickRef.current = onSquareClick;
  const stableClick = useCallback((row: number, col: number) => {
    onSquareClickRef.current(row, col);
  }, []);

  const [dragState, setDragState] = useState<DragStateType | null>(null);
  const dragRef = useRef(dragState);
  dragRef.current = dragState;
  const boardRef = useRef<HTMLDivElement>(null);

  const isLegalTarget = (row: number, col: number) =>
    legalMoves.some(m => m.to.row === row && m.to.col === col);
  const isSelected = (row: number, col: number) =>
    selectedSquare?.row === row && selectedSquare?.col === col;
  const isLastFrom = (row: number, col: number) =>
    lastMove?.from.row === row && lastMove?.from.col === col;
  const isLastTo = (row: number, col: number) =>
    lastMove?.to.row === row && lastMove?.to.col === col;

  // ── Pointer-based drag & drop (mouse + touch) ─────────────────────────────
  const handleBoardPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const cellEl = (e.target as HTMLElement).closest('[data-row]') as HTMLElement | null;
    if (!cellEl) return;
    const row = parseInt(cellEl.getAttribute('data-row') || '', 10);
    const col = parseInt(cellEl.getAttribute('data-col') || '', 10);
    if (isNaN(row) || isNaN(col)) return;
    // Only dark squares have pieces
    if ((row + col) % 2 === 0) return;
    const piece = board[row]?.[col];
    if (!piece) return;

    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const size = rect.width / 10;
    setDragState({ row, col, piece, x: e.clientX, y: e.clientY, size });
    stableClick(row, col);
  }, [board, stableClick]);

  const handleBoardPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setDragState(d => d ? { ...d, x: e.clientX, y: e.clientY } : null);
  }, []);

  const handleBoardPointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    const cellEl = els.find(el => el.hasAttribute('data-row') && el.hasAttribute('data-col'));
    if (cellEl) {
      const targetRow = parseInt(cellEl.getAttribute('data-row') || '', 10);
      const targetCol = parseInt(cellEl.getAttribute('data-col') || '', 10);
      if (!isNaN(targetRow) && !isNaN(targetCol) &&
          (targetRow !== drag.row || targetCol !== drag.col)) {
        stableClick(targetRow, targetCol);
      }
    }
    setDragState(null);
  }, [stableClick]);

  return (
    <div style={{ position: 'relative' }}>
      <div
        className="draughts-board"
        ref={boardRef}
        onPointerDown={handleBoardPointerDown}
        onPointerMove={handleBoardPointerMove}
        onPointerUp={handleBoardPointerUp}
        style={{ touchAction: 'none', userSelect: 'none' }}
      >
        {rows.map(row =>
          cols.map(col => (
            <DraughtsCell
              key={`${row}-${col}`}
              row={row}
              col={col}
              isLight={(row + col) % 2 === 0}
              piece={board[row][col]}
              selected={isSelected(row, col)}
              legalTarget={isLegalTarget(row, col)}
              lastFrom={isLastFrom(row, col)}
              lastTo={isLastTo(row, col)}
              isDragging={dragState?.row === row && dragState?.col === col}
              onSquareClick={stableClick}
            />
          ))
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
          }}
        >
          <div
            className={`draughts-piece ${dragState.piece.color === 'white' ? 'white-pc' : 'black-pc'} ${dragState.piece.type === 'king' ? 'is-king' : ''}`}
            style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))' }}
          >
            {dragState.piece.type === 'king' && <div className="draughts-piece-bottom" />}
            {dragState.piece.type === 'king' && (
              <span className="draughts-king-crown">
                {dragState.piece.color === 'white' ? '♛' : '♕'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
