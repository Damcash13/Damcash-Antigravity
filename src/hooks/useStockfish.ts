import { useEffect, useRef, useCallback, useState } from 'react';

export interface StockfishEval {
  fen: string;
  score: number;    // centipawns from White's perspective
  bestMove: string; // e.g. "e2e4"
  bestSan?: string;
  depth: number;
}

type EvalCallback = (result: StockfishEval) => void;

export function useStockfish() {
  const workerRef  = useRef<Worker | null>(null);
  const cbRef      = useRef<EvalCallback | null>(null);
  const currentFen = useRef<string>('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const worker = new Worker('/stockfish.js');
    workerRef.current = worker;

    worker.postMessage('uci');
    worker.postMessage('setoption name Threads value 1');
    worker.postMessage('setoption name Hash value 16');

    worker.onmessage = (e: MessageEvent) => {
      const line: string = typeof e.data === 'string' ? e.data : e.data?.toString() ?? '';

      if (line === 'uciok') {
        worker.postMessage('isready');
        return;
      }
      if (line === 'readyok') {
        setReady(true);
        return;
      }

      // Parse bestmove
      if (line.startsWith('bestmove')) {
        const parts = line.split(' ');
        const bm = parts[1];
        if (bm && bm !== '(none)' && cbRef.current) {
          cbRef.current({ fen: currentFen.current, score: 0, bestMove: bm, depth: 0 });
        }
      }

      // Parse info score
      if (line.startsWith('info') && line.includes('score cp') && line.includes('pv')) {
        const cpMatch  = line.match(/score cp (-?\d+)/);
        const mateMatch = line.match(/score mate (-?\d+)/);
        const pvMatch  = line.match(/\bpv\s+(\S+)/);
        const depthMatch = line.match(/\bdepth (\d+)/);

        let score = 0;
        if (cpMatch)   score = parseInt(cpMatch[1]);
        if (mateMatch) score = parseInt(mateMatch[1]) > 0 ? 99999 : -99999;

        const bestMove = pvMatch?.[1] ?? '';
        const depth    = depthMatch ? parseInt(depthMatch[1]) : 0;

        if (cbRef.current && bestMove) {
          cbRef.current({
            fen:      currentFen.current,
            score,
            bestMove,
            depth,
          });
        }
      }
    };

    return () => {
      worker.postMessage('quit');
      worker.terminate();
    };
  }, []);

  const evaluate = useCallback((fen: string, depthLimit = 15, onResult: EvalCallback) => {
    if (!workerRef.current) return;
    currentFen.current = fen;
    cbRef.current = onResult;
    workerRef.current.postMessage('stop');
    workerRef.current.postMessage(`position fen ${fen}`);
    workerRef.current.postMessage(`go depth ${depthLimit}`);
  }, []);

  const stop = useCallback(() => {
    workerRef.current?.postMessage('stop');
  }, []);

  return { evaluate, stop, ready };
}
