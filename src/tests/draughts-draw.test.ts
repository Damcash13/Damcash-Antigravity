import { describe, expect, it } from 'vitest';
import {
  applyMove,
  createDraughtsDrawState,
  isGameOver,
  updateDraughtsDrawState,
} from '../engines/draughts.engine';
import type { Color, DraughtsBoard, DraughtsMove } from '../types';

function emptyBoard(): DraughtsBoard {
  return Array.from({ length: 10 }, () => Array(10).fill(null));
}

function kings(white: Array<[number, number]>, black: Array<[number, number]>): DraughtsBoard {
  const board = emptyBoard();
  white.forEach(([row, col]) => { board[row][col] = { color: 'white', type: 'king' }; });
  black.forEach(([row, col]) => { board[row][col] = { color: 'black', type: 'king' }; });
  return board;
}

function move(from: [number, number], to: [number, number]): DraughtsMove {
  return { from: { row: from[0], col: from[1] }, to: { row: to[0], col: to[1] } };
}

function play(board: DraughtsBoard, turn: Color, state: ReturnType<typeof createDraughtsDrawState>, m: DraughtsMove) {
  const nextBoard = applyMove(board, m);
  const nextTurn: Color = turn === 'white' ? 'black' : 'white';
  const nextState = updateDraughtsDrawState(state, board, nextBoard, m, nextTurn);
  return { board: nextBoard, turn: nextTurn, state: nextState };
}

describe('draughts draw rules', () => {
  it('declares a draw on threefold repetition', () => {
    let board = kings([[5, 0]], [[0, 1]]);
    let turn: Color = 'white';
    let state = createDraughtsDrawState(board, turn);

    for (const m of [
      move([5, 0], [6, 1]),
      move([0, 1], [1, 2]),
      move([6, 1], [5, 0]),
      move([1, 2], [0, 1]),
      move([5, 0], [6, 1]),
      move([0, 1], [1, 2]),
      move([6, 1], [5, 0]),
      move([1, 2], [0, 1]),
    ]) {
      ({ board, turn, state } = play(board, turn, state, m));
    }

    expect(isGameOver(board, turn, state)).toEqual({ over: true, winner: 'draw' });
  });

  it('declares a draw after 25 quiet moves without capture or promotion', () => {
    const board = kings([[5, 0]], [[0, 1]]);
    expect(isGameOver(board, 'white', {
      positionCounts: {},
      quietPly: 25,
      endgameKey: null,
      endgamePly: 0,
    })).toEqual({ over: true, winner: 'draw' });
  });

  it('declares king endgame draws', () => {
    expect(isGameOver(kings([[5, 0], [5, 2]], [[0, 1], [0, 3]]), 'white')).toEqual({ over: true, winner: 'draw' });

    expect(isGameOver(kings([[5, 0], [5, 2], [5, 4]], [[0, 1]]), 'white', {
      positionCounts: {},
      quietPly: 0,
      endgameKey: '3v1',
      endgamePly: 16,
    })).toEqual({ over: true, winner: 'draw' });

    expect(isGameOver(kings([[5, 0], [5, 2]], [[0, 1]]), 'white', {
      positionCounts: {},
      quietPly: 0,
      endgameKey: '2v1',
      endgamePly: 5,
    })).toEqual({ over: true, winner: 'draw' });
  });
});
