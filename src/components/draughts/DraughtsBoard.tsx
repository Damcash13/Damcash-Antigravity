import React, { useCallback, useRef } from 'react';
import { DraughtsBoard as Board, DraughtsMove, Position } from '../../types';

interface Props {
  board: Board;
  selectedSquare: Position | null;
  legalMoves: DraughtsMove[];
  lastMove: DraughtsMove | null;
  flipped: boolean;
  onSquareClick: (row: number, col: number) => void;
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
  onSquareClick: (row: number, col: number) => void;
}

const DraughtsCell: React.FC<CellProps> = React.memo(({
  row, col, isLight, piece, selected, legalTarget, lastFrom, lastTo, onSquareClick
}) => {
  let cellClass = `draughts-cell ${isLight ? 'light' : 'dark'}`;
  if (!isLight) {
    if (selected) cellClass += ' selected';
    else if (legalTarget) cellClass += ' legal-target';
    else if (lastFrom) cellClass += ' last-from';
    else if (lastTo) cellClass += ' last-to';
  }

  const handleDrop = (e: React.DragEvent) => {
    if (isLight) return;
    e.preventDefault();
    const fromRow = parseInt(e.dataTransfer.getData('row'), 10);
    const fromCol = parseInt(e.dataTransfer.getData('col'), 10);
    if (!isNaN(fromRow) && !isNaN(fromCol) && (fromRow !== row || fromCol !== col)) {
      onSquareClick(row, col);
    }
  };

  return (
    <div
      className={cellClass}
      onClick={() => !isLight && onSquareClick(row, col)}
      onDragOver={(e) => { if (!isLight) e.preventDefault(); }}
      onDrop={handleDrop}
    >
      {piece && (
        <div
          className={`draughts-piece ${piece.color === 'white' ? 'white-pc' : 'black-pc'} ${selected ? 'selected-piece' : ''} ${piece.type === 'king' ? 'is-king' : ''}`}
          draggable={!isLight}
          onDragStart={(e) => {
            e.dataTransfer.setData('row', row.toString());
            e.dataTransfer.setData('col', col.toString());
            onSquareClick(row, col);
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

export const DraughtsBoard: React.FC<Props> = ({
  board, selectedSquare, legalMoves, lastMove, flipped, onSquareClick,
}) => {
  const rows = flipped ? Array.from({ length: 10 }, (_, i) => 9 - i) : Array.from({ length: 10 }, (_, i) => i);
  const cols = flipped ? Array.from({ length: 10 }, (_, i) => 9 - i) : Array.from({ length: 10 }, (_, i) => i);

  // Stable callback so DraughtsCell memo can work — latest handler always in ref
  const onSquareClickRef = useRef(onSquareClick);
  onSquareClickRef.current = onSquareClick;
  const stableClick = useCallback((row: number, col: number) => {
    onSquareClickRef.current(row, col);
  }, []);

  const isLegalTarget = (row: number, col: number): boolean =>
    legalMoves.some(m => m.to.row === row && m.to.col === col);

  const isSelected = (row: number, col: number): boolean =>
    selectedSquare?.row === row && selectedSquare?.col === col;

  const isLastFrom = (row: number, col: number): boolean =>
    lastMove?.from.row === row && lastMove?.from.col === col;

  const isLastTo = (row: number, col: number): boolean =>
    lastMove?.to.row === row && lastMove?.to.col === col;

  return (
    <div className="draughts-board">
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
            onSquareClick={stableClick}
          />
        ))
      )}
    </div>
  );
};
