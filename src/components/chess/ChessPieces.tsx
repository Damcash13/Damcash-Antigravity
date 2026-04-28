import React from 'react';

interface ChessPieceProps {
  type: string;  // 'p','r','n','b','q','k'
  color: 'w' | 'b';
  size?: number;
}

export const ChessPiece: React.FC<ChessPieceProps> = ({ type, color }) => {
  const pieces: Record<string, string> = {
    wk: 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
    wq: 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
    wr: 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    wb: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    wn: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
    wp: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
    bk: 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
    bq: 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
    br: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    bb: 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    bn: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
    bp: 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
  };

  const key = `${color}${type.toLowerCase()}`;
  const url = pieces[key];

  if (!url) return null;

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
        src={url} 
        alt={key} 
        style={{ 
          width: '100%', 
          height: '100%', 
          display: 'block',
          pointerEvents: 'none' // Prevent native image dragging ghost
        }} 
      />
    </div>
  );
};
