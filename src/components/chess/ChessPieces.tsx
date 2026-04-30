import React from 'react';

interface ChessPieceProps {
  type: string;  // 'p','r','n','b','q','k'
  color: 'w' | 'b';
  size?: number;
}

export const ChessPiece: React.FC<ChessPieceProps> = ({ type, color }) => {
  const key = `${color}${type.toLowerCase()}`;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'grab',
        userSelect: 'none',
        transition: 'transform 0.1s ease',
      }}
      className="chess-piece-wrapper"
    >
      <img
        src={`/pieces/${key}.svg?v=3`}
        alt={key}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
