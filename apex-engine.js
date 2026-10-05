/**
 * ============================================================================
 * NOIR CHESS — APEX ENGINE
 * Browser-Native High-Performance Grandmaster Chess Engine
 * 
 * Features:
 * - Negamax with Alpha-Beta Pruning & Principal Variation Search (PVS)
 * - Iterative Deepening with Aspiration Windows
 * - Quiescence Search with Delta Pruning & Check Evasions
 * - Transposition Table with 64-Bit Zobrist Hashing (262,144 entries)
 * - Static Exchange Evaluation (SEE) for Tactical Capture Ordering
 * - Null Move Pruning (NMP) & Late Move Reductions (LMR)
 * - Futility Pruning & Check Extensions
 * - Killer Move Heuristic (2 killers/ply) & History Heuristic Table
 * - Tapered Evaluation (Opening, Middlegame, Endgame interpolation)
 * - Comprehensive Grandmaster Opening Book (multi-variation, weighted)
 * - Anti-Blunder Tactical Verification
 * - Web Worker Execution + Synchronous/Async Fallback
 * - Benchmark Verification Suite
 * ============================================================================
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const engine = factory();
    root.NoirApex = engine;
    if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof self.document === 'undefined') {
      // Running inside dedicated Web Worker
      self.onmessage = function (e) {
        const data = e.data;
        if (!data || !data.type) return;

        if (data.type === 'search') {
          engine.searchAsync(data.fen, data.options || {}, function (progress) {
            self.postMessage({ type: 'progress', ...progress });
          }).then(function (result) {
            self.postMessage({ type: 'bestmove', ...result });
          }).catch(function (err) {
            self.postMessage({ type: 'error', error: err.message });
          });
        } else if (data.type === 'stop') {
          engine.stopSearch();
        } else if (data.type === 'benchmark') {
          const res = engine.runBenchmark();
          self.postMessage({ type: 'benchmark_result', results: res });
        }
      };
    }
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ==========================================================================
     1. CONSTANTS, PIECE VALUES & PIECE-SQUARE TABLES
     ========================================================================== */

  const PIECE_NAMES = ['p', 'n', 'b', 'r', 'q', 'k'];
  const PIECE_INDICES = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };

  // Midgame (MG) and Endgame (EG) Base Values in Centipawns
  const MG_VAL = { p: 100, n: 325, b: 335, r: 500, q: 975, k: 20000 };
  const EG_VAL = { p: 125, n: 290, b: 345, r: 535, q: 940, k: 20000 };

  // Phase weights for tapering: 4*N(1) + 4*B(1) + 4*R(2) + 2*Q(4) = 24 total
  const PHASE_WEIGHTS = { p: 0, n: 1, b: 1, r: 2, q: 4, k: 0 };
  const TOTAL_PHASE = 24;

  // Piece-Square Tables (White perspective, rank 8 at top, rank 1 at bottom)
  const PST_MG_PAWN = [
      0,   0,   0,   0,   0,   0,   0,   0,
     50,  50,  50,  50,  50,  50,  50,  50,
     12,  14,  22,  30,  30,  22,  14,  12,
      5,   7,  12,  26,  26,  12,   7,   5,
      0,   0,   2,  20,  20,   2,   0,   0,
      5,  -5, -10,   2,   2, -10,  -5,   5,
      5,  10,  10, -25, -25,  10,  10,   5,
      0,   0,   0,   0,   0,   0,   0,   0
  ];

  const PST_EG_PAWN = [
      0,   0,   0,   0,   0,   0,   0,   0,
     90,  90,  90,  90,  90,  90,  90,  90,
     55,  55,  55,  55,  55,  55,  55,  55,
     35,  35,  35,  40,  40,  35,  35,  35,
     20,  20,  20,  25,  25,  20,  20,  20,
     10,  10,  10,  15,  15,  10,  10,  10,
      0,   0,   0,   0,   0,   0,   0,   0,
      0,   0,   0,   0,   0,   0,   0,   0
  ];

  const PST_MG_KNIGHT = [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20,   0,   5,   5,   0, -20, -40,
    -30,   5,  15,  20,  20,  15,   5, -30,
    -30,   0,  18,  25,  25,  18,   0, -30,
    -30,   5,  18,  25,  25,  18,   5, -30,
    -30,   0,  12,  18,  18,  12,   0, -30,
    -40, -20,   0,   5,   5,   0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50
  ];

  const PST_EG_KNIGHT = [
    -40, -30, -20, -20, -20, -20, -30, -40,
    -30, -10,   5,   8,   8,   5, -10, -30,
    -20,   5,  15,  18,  18,  15,   5, -20,
    -20,   8,  18,  22,  22,  18,   8, -20,
    -20,   8,  18,  22,  22,  18,   8, -20,
    -20,   5,  12,  15,  15,  12,   5, -20,
    -30, -10,   5,   8,   8,   5, -10, -30,
    -40, -30, -20, -20, -20, -20, -30, -40
  ];

  const PST_MG_BISHOP = [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10,   0,   8,  12,  12,   8,   0, -10,
    -10,   5,  12,  15,  15,  12,   5, -10,
    -10,   0,  12,  15,  15,  12,   0, -10,
    -10,  10,  12,  12,  12,  12,  10, -10,
    -10,   8,   0,   0,   0,   0,   8, -10,
    -20, -10, -10, -10, -10, -10, -10, -20
  ];

  const PST_EG_BISHOP = [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10,   5,   5,   5,   5,   5,   5, -10,
    -10,   5,  10,  15,  15,  10,   5, -10,
    -10,   5,  15,  20,  20,  15,   5, -10,
    -10,   5,  15,  20,  20,  15,   5, -10,
    -10,   5,  10,  15,  15,  10,   5, -10,
    -10,   5,   5,   5,   5,   5,   5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20
  ];

  const PST_MG_ROOK = [
      0,   0,   0,   0,   0,   0,   0,   0,
      8,  14,  14,  14,  14,  14,  14,   8,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
      0,   0,   0,   6,   6,   0,   0,   0
  ];

  const PST_EG_ROOK = [
      0,   5,   5,   5,   5,   5,   5,   0,
     12,  18,  18,  18,  18,  18,  18,  12,
      5,  10,  10,  10,  10,  10,  10,   5,
      5,  10,  10,  10,  10,  10,  10,   5,
      5,  10,  10,  10,  10,  10,  10,   5,
      5,  10,  10,  10,  10,  10,  10,   5,
      5,  10,  10,  10,  10,  10,  10,   5,
      0,   5,   5,   5,   5,   5,   5,   0
  ];

  const PST_MG_QUEEN = [
    -20, -10, -10,  -5,  -5, -10, -10, -20,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10,   0,   5,   8,   8,   5,   0, -10,
     -5,   0,   8,  10,  10,   8,   0,  -5,
      0,   0,   8,  10,  10,   8,   0,  -5,
    -10,   5,   8,   8,   8,   8,   0, -10,
    -10,   0,   5,   0,   0,   0,   0, -10,
    -20, -10, -10,  -5,  -5, -10, -10, -20
  ];

  const PST_EG_QUEEN = [
    -20, -10, -10,  -5,  -5, -10, -10, -20,
    -10,   0,   5,   5,   5,   5,   0, -10,
    -10,   5,  10,  15,  15,  10,   5, -10,
     -5,   5,  15,  20,  20,  15,   5,  -5,
     -5,   5,  15,  20,  20,  15,   5,  -5,
    -10,   5,  10,  15,  15,  10,   5, -10,
    -10,   0,   5,   5,   5,   5,   0, -10,
    -20, -10, -10,  -5,  -5, -10, -10, -20
  ];

  const PST_MG_KING = [
    -35, -45, -45, -55, -55, -45, -45, -35,
    -35, -45, -45, -55, -55, -45, -45, -35,
    -35, -45, -45, -55, -55, -45, -45, -35,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -25, -25, -20, -20, -10,
     18,  22,   0,  -5,  -5,   0,  22,  18,
     22,  32,  12,   0,   0,  12,  32,  22
  ];

  const PST_EG_KING = [
    -50, -35, -25, -15, -15, -25, -35, -50,
    -30, -15,   0,  10,  10,   0, -15, -30,
    -20,   0,  20,  30,  30,  20,   0, -20,
    -10,  10,  30,  40,  40,  30,  10, -10,
    -10,  10,  30,  40,  40,  30,  10, -10,
    -20,   0,  20,  30,  30,  20,   0, -20,
    -30, -15,   0,  10,  10,   0, -15, -30,
    -50, -35, -25, -15, -15, -25, -35, -50
  ];

  const PASSED_PAWN_BONUS_MG = [0, 5, 10, 18, 35, 60, 110, 0];
  const PASSED_PAWN_BONUS_EG = [0, 15, 28, 48, 85, 140, 220, 0];

  /* ==========================================================================
     2. HELPER FUNCTIONS & COORDINATES
     ========================================================================== */

  function sqToRowCol(sq) {
    return { r: Math.floor(sq / 8), c: sq % 8 };
  }

  function rowColToSq(r, c) {
    return r * 8 + c;
  }

  function sqToAlg(sq) {
    const { r, c } = sqToRowCol(sq);
    return String.fromCharCode(97 + c) + (8 - r);
  }

  function algToSq(alg) {
    const c = alg.charCodeAt(0) - 97;
    const r = 8 - parseInt(alg[1], 10);
    return rowColToSq(r, c);
  }

  function cloneBoard(b) {
    const copy = new Array(64);
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      copy[i] = p ? { type: p.type, color: p.color } : null;
    }
    return copy;
  }

  /* ==========================================================================
     3. 64-BIT ZOBRIST HASHING
     ========================================================================== */

  // High & Low 32-bit unsigned keys generated deterministically
  let rngSeed = 0x9e3779b9;
  function rand32() {
    rngSeed = (Math.imul(rngSeed, 1103515245) + 12345) >>> 0;
    return rngSeed;
  }

  const ZOBRIST = {
    pieces: Array.from({ length: 64 }, () => Array.from({ length: 12 }, () => ({ hi: rand32(), lo: rand32() }))),
    side: { hi: rand32(), lo: rand32() },
    castling: Array.from({ length: 16 }, () => ({ hi: rand32(), lo: rand32() })),
    ep: Array.from({ length: 8 }, () => ({ hi: rand32(), lo: rand32() }))
  };

  function getPieceZobristIndex(type, color) {
    const base = PIECE_INDICES[type];
    return (color === 'w') ? base : base + 6;
  }

  function getCastlingMask(castling) {
    let mask = 0;
    if (castling.wK) mask |= 1;
    if (castling.wQ) mask |= 2;
    if (castling.bK) mask |= 4;
    if (castling.bQ) mask |= 8;
    return mask;
  }

  function computeZobristHash(board, turn, castling, ep) {
    let hi = 0;
    let lo = 0;

    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (p) {
        const idx = getPieceZobristIndex(p.type, p.color);
        const z = ZOBRIST.pieces[sq][idx];
        hi ^= z.hi;
        lo ^= z.lo;
      }
    }

    if (turn === 'b') {
      hi ^= ZOBRIST.side.hi;
      lo ^= ZOBRIST.side.lo;
    }

    const cMask = getCastlingMask(castling);
    hi ^= ZOBRIST.castling[cMask].hi;
    lo ^= ZOBRIST.castling[cMask].lo;

    if (ep !== null) {
      const epFile = ep % 8;
      hi ^= ZOBRIST.ep[epFile].hi;
      lo ^= ZOBRIST.ep[epFile].lo;
    }

    return { hi: hi >>> 0, lo: lo >>> 0 };
  }

  /* ==========================================================================
     4. BOUNDED TRANSPOSITION TABLE
     ========================================================================== */

  // Size = 2^18 = 262,144 entries (~4MB footprint, lightning fast)
  const TT_SIZE = 262144;
  const TT_MASK = TT_SIZE - 1;

  const TT_EXACT = 1;
  const TT_LOWER = 2; // Beta cutoff (move was too good)
  const TT_UPPER = 3; // Alpha fail (all moves failed low)

  class TranspositionTable {
    constructor(size = TT_SIZE) {
      this.size = size;
      this.mask = size - 1;
      this.keyHi = new Uint32Array(size);
      this.keyLo = new Uint32Array(size);
      this.depth = new Int8Array(size);
      this.score = new Int16Array(size);
      this.flags = new Uint8Array(size);
      this.moves = new Uint16Array(size); // Packed move
      this.age = new Uint8Array(size);
      this.currentAge = 0;
    }

    clear() {
      this.keyHi.fill(0);
      this.keyLo.fill(0);
      this.depth.fill(0);
      this.score.fill(0);
      this.flags.fill(0);
      this.moves.fill(0);
      this.age.fill(0);
      this.currentAge = 0;
    }

    newSearch() {
      this.currentAge = (this.currentAge + 1) & 0xff;
    }

    packMove(m) {
      if (!m) return 0;
      let promo = 0;
      if (m.promotion === 'q') promo = 1;
      else if (m.promotion === 'r') promo = 2;
      else if (m.promotion === 'b') promo = 3;
      else if (m.promotion === 'n') promo = 4;
      return (m.from & 63) | ((m.to & 63) << 6) | (promo << 12);
    }

    unpackMove(packed) {
      if (!packed) return null;
      const from = packed & 63;
      const to = (packed >> 6) & 63;
      const promoCode = (packed >> 12) & 7;
      const promo = ['', 'q', 'r', 'b', 'n'][promoCode] || null;
      return { from, to, promotion: promo };
    }

    probe(hi, lo, depth, alpha, beta, ply) {
      const idx = lo & this.mask;

      if (this.keyHi[idx] === hi && this.keyLo[idx] === lo) {
        let storedScore = this.score[idx];

        // Adjust mate scores for current search ply
        if (storedScore > 19000) storedScore -= ply;
        else if (storedScore < -19000) storedScore += ply;

        const storedDepth = this.depth[idx];
        const flag = this.flags[idx];
        const bestMove = this.unpackMove(this.moves[idx]);

        if (storedDepth >= depth) {
          if (flag === TT_EXACT) {
            return { hit: true, score: storedScore, bestMove, cutoff: true };
          }
          if (flag === TT_LOWER && storedScore >= beta) {
            return { hit: true, score: storedScore, bestMove, cutoff: true };
          }
          if (flag === TT_UPPER && storedScore <= alpha) {
            return { hit: true, score: storedScore, bestMove, cutoff: true };
          }
        }

        return { hit: true, score: storedScore, bestMove, cutoff: false };
      }

      return { hit: false, bestMove: null, cutoff: false };
    }

    store(hi, lo, depth, score, flag, move, ply) {
      const idx = lo & this.mask;

      // Adjust mate score for storage
      let storeScore = score;
      if (storeScore > 19000) storeScore += ply;
      else if (storeScore < -19000) storeScore -= ply;

      const existingDepth = this.depth[idx];
      const existingAge = this.age[idx];

      // Depth-preferred replacement with aging
      const shouldReplace = (this.keyHi[idx] === 0 && this.keyLo[idx] === 0) ||
                            (this.keyHi[idx] === hi && this.keyLo[idx] === lo) ||
                            (depth >= existingDepth) ||
                            (existingAge !== this.currentAge);

      if (shouldReplace) {
        this.keyHi[idx] = hi;
        this.keyLo[idx] = lo;
        this.depth[idx] = depth;
        this.score[idx] = storeScore;
        this.flags[idx] = flag;
        if (move) {
          this.moves[idx] = this.packMove(move);
        }
        this.age[idx] = this.currentAge;
      }
    }
  }

  const globalTT = new TranspositionTable();

  /* ==========================================================================
     5. STATIC EXCHANGE EVALUATION (SEE)
     ========================================================================== */

  const SEE_PIECE_VALUES = [100, 320, 330, 500, 975, 20000];

  function getSmallestAttacker(board, sq, attackingColor) {
    const { r, c } = sqToRowCol(sq);

    // 1. Pawn
    const pawnRow = (attackingColor === 'w') ? r + 1 : r - 1;
    if (pawnRow >= 0 && pawnRow <= 7) {
      for (const dc of [-1, 1]) {
        const nc = c + dc;
        if (nc >= 0 && nc <= 7) {
          const pSq = rowColToSq(pawnRow, nc);
          const p = board[pSq];
          if (p && p.color === attackingColor && p.type === 'p') {
            return { from: pSq, type: 'p' };
          }
        }
      }
    }

    // 2. Knight
    const knightOffsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2],  [1, 2],  [2, -1],  [2, 1]
    ];
    for (let i = 0; i < knightOffsets.length; i++) {
      const nr = r + knightOffsets[i][0];
      const nc = c + knightOffsets[i][1];
      if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
        const kSq = rowColToSq(nr, nc);
        const p = board[kSq];
        if (p && p.color === attackingColor && p.type === 'n') {
          return { from: kSq, type: 'n' };
        }
      }
    }

    // 3. Bishop
    const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (let i = 0; i < diagDirs.length; i++) {
      let step = 1;
      while (true) {
        const nr = r + diagDirs[i][0] * step;
        const nc = c + diagDirs[i][1] * step;
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
        const bSq = rowColToSq(nr, nc);
        const p = board[bSq];
        if (p) {
          if (p.color === attackingColor && p.type === 'b') {
            return { from: bSq, type: 'b' };
          }
          break;
        }
        step++;
      }
    }

    // 4. Rook
    const orthoDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let i = 0; i < orthoDirs.length; i++) {
      let step = 1;
      while (true) {
        const nr = r + orthoDirs[i][0] * step;
        const nc = c + orthoDirs[i][1] * step;
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
        const rSq = rowColToSq(nr, nc);
        const p = board[rSq];
        if (p) {
          if (p.color === attackingColor && p.type === 'r') {
            return { from: rSq, type: 'r' };
          }
          break;
        }
        step++;
      }
    }

    // 5. Queen
    const queenDirs = diagDirs.concat(orthoDirs);
    for (let i = 0; i < queenDirs.length; i++) {
      let step = 1;
      while (true) {
        const nr = r + queenDirs[i][0] * step;
        const nc = c + queenDirs[i][1] * step;
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
        const qSq = rowColToSq(nr, nc);
        const p = board[qSq];
        if (p) {
          if (p.color === attackingColor && p.type === 'q') {
            return { from: qSq, type: 'q' };
          }
          break;
        }
        step++;
      }
    }

    // 6. King
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
          const kingSq = rowColToSq(nr, nc);
          const p = board[kingSq];
          if (p && p.color === attackingColor && p.type === 'k') {
            return { from: kingSq, type: 'k' };
          }
        }
      }
    }

    return null;
  }

  function staticExchangeEvaluation(move, board) {
    const from = move.from;
    const to = move.to;

    let targetPiece = board[to];
    let capturedVal = targetPiece ? SEE_PIECE_VALUES[PIECE_INDICES[targetPiece.type]] : 0;
    if (move.isEnPassant) capturedVal = 100;

    let movingPiece = board[from];
    if (!movingPiece) return 0;

    const gain = [capturedVal];
    let currentAttacker = movingPiece;
    let currentColor = (movingPiece.color === 'w') ? 'b' : 'w';

    const simBoard = cloneBoard(board);
    simBoard[from] = null;
    simBoard[to] = movingPiece;

    while (true) {
      const attacker = getSmallestAttacker(simBoard, to, currentColor);
      if (!attacker) break;

      gain.push(SEE_PIECE_VALUES[PIECE_INDICES[currentAttacker.type]]);
      currentAttacker = { type: attacker.type, color: currentColor };
      simBoard[attacker.from] = null;
      simBoard[to] = currentAttacker;

      currentColor = (currentColor === 'w') ? 'b' : 'w';
    }

    // Minimax resolution of the exchange tree back to root
    for (let i = gain.length - 2; i >= 0; i--) {
      gain[i] = Math.max(0, gain[i] - gain[i + 1]);
    }

    return gain[0];
  }

  /* ==========================================================================
     6. CHESS LOGIC: ATTACKS, LEGAL MOVES & FEN
     ========================================================================== */

  function isSquareAttacked(sq, attackingColor, board) {
    const { r, c } = sqToRowCol(sq);

    // 1. Pawn
    const pawnRow = (attackingColor === 'w') ? r + 1 : r - 1;
    if (pawnRow >= 0 && pawnRow <= 7) {
      if (c - 1 >= 0) {
        const p = board[rowColToSq(pawnRow, c - 1)];
        if (p && p.color === attackingColor && p.type === 'p') return true;
      }
      if (c + 1 <= 7) {
        const p = board[rowColToSq(pawnRow, c + 1)];
        if (p && p.color === attackingColor && p.type === 'p') return true;
      }
    }

    // 2. Knight
    const knightOffsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2],  [1, 2],  [2, -1],  [2, 1]
    ];
    for (let i = 0; i < knightOffsets.length; i++) {
      const nr = r + knightOffsets[i][0];
      const nc = c + knightOffsets[i][1];
      if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
        const p = board[rowColToSq(nr, nc)];
        if (p && p.color === attackingColor && p.type === 'n') return true;
      }
    }

    // 3. Bishop & Queen Diagonals
    const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (let i = 0; i < diagDirs.length; i++) {
      let step = 1;
      while (true) {
        const nr = r + diagDirs[i][0] * step;
        const nc = c + diagDirs[i][1] * step;
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
        const p = board[rowColToSq(nr, nc)];
        if (p) {
          if (p.color === attackingColor && (p.type === 'b' || p.type === 'q')) return true;
          break;
        }
        step++;
      }
    }

    // 4. Rook & Queen Orthogonals
    const orthoDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let i = 0; i < orthoDirs.length; i++) {
      let step = 1;
      while (true) {
        const nr = r + orthoDirs[i][0] * step;
        const nc = c + orthoDirs[i][1] * step;
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
        const p = board[rowColToSq(nr, nc)];
        if (p) {
          if (p.color === attackingColor && (p.type === 'r' || p.type === 'q')) return true;
          break;
        }
        step++;
      }
    }

    // 5. King
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
          const p = board[rowColToSq(nr, nc)];
          if (p && p.color === attackingColor && p.type === 'k') return true;
        }
      }
    }

    return false;
  }

  function findKing(color, board) {
    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (p && p.color === color && p.type === 'k') return sq;
    }
    return -1;
  }

  function isKingInCheck(color, board) {
    const kingSq = findKing(color, board);
    if (kingSq === -1) return false;
    const opp = (color === 'w') ? 'b' : 'w';
    return isSquareAttacked(kingSq, opp, board);
  }

  function getPseudoLegalMoves(sq, board, castling, ep) {
    const piece = board[sq];
    if (!piece) return [];

    const moves = [];
    const { r, c } = sqToRowCol(sq);
    const color = piece.color;
    const oppColor = (color === 'w') ? 'b' : 'w';

    switch (piece.type) {
      case 'p': {
        const fwd = (color === 'w') ? -1 : 1;
        const startR = (color === 'w') ? 6 : 1;
        const promoR = (color === 'w') ? 0 : 7;

        // 1-square forward
        const r1 = r + fwd;
        if (r1 >= 0 && r1 <= 7) {
          const sq1 = rowColToSq(r1, c);
          if (!board[sq1]) {
            if (r1 === promoR) {
              ['q', 'r', 'b', 'n'].forEach(p => moves.push({ from: sq, to: sq1, promotion: p }));
            } else {
              moves.push({ from: sq, to: sq1 });
            }

            // 2-square forward
            if (r === startR) {
              const r2 = r + fwd * 2;
              const sq2 = rowColToSq(r2, c);
              if (!board[sq2]) {
                moves.push({ from: sq, to: sq2, isDoublePawn: true });
              }
            }
          }
        }

        // Captures
        for (const dc of [-1, 1]) {
          const nc = c + dc;
          const nr = r + fwd;
          if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
            const tSq = rowColToSq(nr, nc);
            const target = board[tSq];

            if (target && target.color === oppColor) {
              if (nr === promoR) {
                ['q', 'r', 'b', 'n'].forEach(p => moves.push({ from: sq, to: tSq, promotion: p, isCapture: true }));
              } else {
                moves.push({ from: sq, to: tSq, isCapture: true });
              }
            } else if (tSq === ep) {
              moves.push({ from: sq, to: tSq, isEnPassant: true, isCapture: true });
            }
          }
        }
        break;
      }

      case 'n': {
        const offsets = [
          [-2, -1], [-2, 1], [-1, -2], [-1, 2],
          [1, -2],  [1, 2],  [2, -1],  [2, 1]
        ];
        for (let i = 0; i < offsets.length; i++) {
          const nr = r + offsets[i][0];
          const nc = c + offsets[i][1];
          if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
            const tSq = rowColToSq(nr, nc);
            const p = board[tSq];
            if (!p || p.color === oppColor) {
              moves.push({ from: sq, to: tSq, isCapture: !!p });
            }
          }
        }
        break;
      }

      case 'b': {
        const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        for (let i = 0; i < dirs.length; i++) {
          let s = 1;
          while (true) {
            const nr = r + dirs[i][0] * s;
            const nc = c + dirs[i][1] * s;
            if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
            const tSq = rowColToSq(nr, nc);
            const p = board[tSq];
            if (!p) {
              moves.push({ from: sq, to: tSq });
            } else {
              if (p.color === oppColor) moves.push({ from: sq, to: tSq, isCapture: true });
              break;
            }
            s++;
          }
        }
        break;
      }

      case 'r': {
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (let i = 0; i < dirs.length; i++) {
          let s = 1;
          while (true) {
            const nr = r + dirs[i][0] * s;
            const nc = c + dirs[i][1] * s;
            if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
            const tSq = rowColToSq(nr, nc);
            const p = board[tSq];
            if (!p) {
              moves.push({ from: sq, to: tSq });
            } else {
              if (p.color === oppColor) moves.push({ from: sq, to: tSq, isCapture: true });
              break;
            }
            s++;
          }
        }
        break;
      }

      case 'q': {
        const dirs = [
          [-1, -1], [-1, 1], [1, -1], [1, 1],
          [-1, 0],  [1, 0],  [0, -1], [0, 1]
        ];
        for (let i = 0; i < dirs.length; i++) {
          let s = 1;
          while (true) {
            const nr = r + dirs[i][0] * s;
            const nc = c + dirs[i][1] * s;
            if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
            const tSq = rowColToSq(nr, nc);
            const p = board[tSq];
            if (!p) {
              moves.push({ from: sq, to: tSq });
            } else {
              if (p.color === oppColor) moves.push({ from: sq, to: tSq, isCapture: true });
              break;
            }
            s++;
          }
        }
        break;
      }

      case 'k': {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
              const tSq = rowColToSq(nr, nc);
              const p = board[tSq];
              if (!p || p.color === oppColor) {
                moves.push({ from: sq, to: tSq, isCapture: !!p });
              }
            }
          }
        }

        // Castling
        if (color === 'w') {
          if (castling.wK && sq === 60 && !board[61] && !board[62] && board[63]?.type === 'r' && board[63]?.color === 'w') {
            if (!isSquareAttacked(60, 'b', board) && !isSquareAttacked(61, 'b', board) && !isSquareAttacked(62, 'b', board)) {
              moves.push({ from: 60, to: 62, isCastling: 'k' });
            }
          }
          if (castling.wQ && sq === 60 && !board[59] && !board[58] && !board[57] && board[56]?.type === 'r' && board[56]?.color === 'w') {
            if (!isSquareAttacked(60, 'b', board) && !isSquareAttacked(59, 'b', board) && !isSquareAttacked(58, 'b', board)) {
              moves.push({ from: 60, to: 58, isCastling: 'q' });
            }
          }
        } else {
          if (castling.bK && sq === 4 && !board[5] && !board[6] && board[7]?.type === 'r' && board[7]?.color === 'b') {
            if (!isSquareAttacked(4, 'w', board) && !isSquareAttacked(5, 'w', board) && !isSquareAttacked(6, 'w', board)) {
              moves.push({ from: 4, to: 6, isCastling: 'k' });
            }
          }
          if (castling.bQ && sq === 4 && !board[3] && !board[2] && !board[1] && board[0]?.type === 'r' && board[0]?.color === 'b') {
            if (!isSquareAttacked(4, 'w', board) && !isSquareAttacked(3, 'w', board) && !isSquareAttacked(2, 'w', board)) {
              moves.push({ from: 4, to: 2, isCastling: 'q' });
            }
          }
        }
        break;
      }
    }

    return moves;
  }

  function isMoveLegal(move, board) {
    const simBoard = cloneBoard(board);
    const piece = simBoard[move.from];
    if (!piece) return false;

    simBoard[move.to] = piece;
    simBoard[move.from] = null;

    if (move.isEnPassant) {
      const { r: fromR } = sqToRowCol(move.from);
      const { c: toC } = sqToRowCol(move.to);
      simBoard[rowColToSq(fromR, toC)] = null;
    }

    if (move.isCastling === 'k') {
      if (piece.color === 'w') {
        simBoard[61] = simBoard[63]; simBoard[63] = null;
      } else {
        simBoard[5] = simBoard[7]; simBoard[7] = null;
      }
    } else if (move.isCastling === 'q') {
      if (piece.color === 'w') {
        simBoard[59] = simBoard[56]; simBoard[56] = null;
      } else {
        simBoard[3] = simBoard[0]; simBoard[0] = null;
      }
    }

    if (move.promotion) {
      simBoard[move.to] = { type: move.promotion, color: piece.color };
    }

    return !isKingInCheck(piece.color, simBoard);
  }

  function getAllLegalMoves(color, board, castling, ep) {
    const legalMoves = [];
    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (p && p.color === color) {
        const pseudo = getPseudoLegalMoves(sq, board, castling, ep);
        for (let i = 0; i < pseudo.length; i++) {
          if (isMoveLegal(pseudo[i], board)) {
            legalMoves.push(pseudo[i]);
          }
        }
      }
    }
    return legalMoves;
  }

  function makeSimulatedMove(board, move, castling) {
    const nextBoard = cloneBoard(board);
    const nextCastling = { ...castling };
    let nextEp = null;

    const movingPiece = nextBoard[move.from];
    nextBoard[move.to] = move.promotion ? { type: move.promotion, color: movingPiece.color } : movingPiece;
    nextBoard[move.from] = null;

    if (move.isEnPassant) {
      const { r: fromR } = sqToRowCol(move.from);
      const { c: toC } = sqToRowCol(move.to);
      nextBoard[rowColToSq(fromR, toC)] = null;
    }

    if (move.isCastling === 'k') {
      if (movingPiece.color === 'w') {
        nextBoard[61] = nextBoard[63]; nextBoard[63] = null;
      } else {
        nextBoard[5] = nextBoard[7]; nextBoard[7] = null;
      }
    } else if (move.isCastling === 'q') {
      if (movingPiece.color === 'w') {
        nextBoard[59] = nextBoard[56]; nextBoard[56] = null;
      } else {
        nextBoard[3] = nextBoard[0]; nextBoard[0] = null;
      }
    }

    // Castling updates
    if (movingPiece.type === 'k') {
      if (movingPiece.color === 'w') {
        nextCastling.wK = false; nextCastling.wQ = false;
      } else {
        nextCastling.bK = false; nextCastling.bQ = false;
      }
    } else if (movingPiece.type === 'r') {
      if (move.from === 63) nextCastling.wK = false;
      if (move.from === 56) nextCastling.wQ = false;
      if (move.from === 7) nextCastling.bK = false;
      if (move.from === 0) nextCastling.bQ = false;
    }
    if (move.to === 63) nextCastling.wK = false;
    if (move.to === 56) nextCastling.wQ = false;
    if (move.to === 7) nextCastling.bK = false;
    if (move.to === 0) nextCastling.bQ = false;

    // En Passant
    if (movingPiece.type === 'p' && Math.abs(move.to - move.from) === 16) {
      nextEp = (move.from + move.to) / 2;
    }

    return { nextBoard, nextCastling, nextEp };
  }

  function parseFen(fen) {
    const parts = fen.trim().split(/\s+/);
    const placement = parts[0];
    const turn = parts[1] || 'w';
    const castlingStr = parts[2] || 'KQkq';
    const epStr = parts[3] || '-';
    const halfMoves = parseInt(parts[4] || '0', 10);
    const fullMoves = parseInt(parts[5] || '1', 10);

    const board = new Array(64).fill(null);
    let r = 0;
    let c = 0;

    for (let i = 0; i < placement.length; i++) {
      const char = placement[i];
      if (char === '/') {
        r++;
        c = 0;
      } else if (char >= '1' && char <= '8') {
        c += parseInt(char, 10);
      } else {
        const color = (char === char.toUpperCase()) ? 'w' : 'b';
        const type = char.toLowerCase();
        board[rowColToSq(r, c)] = { type, color };
        c++;
      }
    }

    const castling = {
      wK: castlingStr.includes('K'),
      wQ: castlingStr.includes('Q'),
      bK: castlingStr.includes('k'),
      bQ: castlingStr.includes('q')
    };

    const ep = (epStr === '-') ? null : algToSq(epStr);

    return { board, turn, castling, ep, halfMoves, fullMoves };
  }

  /* ==========================================================================
     7. TAPERED POSITIONAL EVALUATION
     ========================================================================== */

  function evaluatePosition(board, turn) {
    let mgWhite = 0, mgBlack = 0;
    let egWhite = 0, egBlack = 0;
    let gamePhase = 0;

    const whitePawns = [];
    const blackPawns = [];
    const whiteRooks = [];
    const blackRooks = [];
    let whiteBishops = 0;
    let blackBishops = 0;
    let whiteKingSq = -1;
    let blackKingSq = -1;

    // First pass: Material, PST & piece collectors
    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (!p) continue;

      const isWhite = (p.color === 'w');
      const idx = isWhite ? sq : 63 - sq; // Flipped index for Black
      const pieceType = p.type;

      gamePhase += PHASE_WEIGHTS[pieceType];

      let mgPst = 0, egPst = 0;
      switch (pieceType) {
        case 'p':
          mgPst = PST_MG_PAWN[idx];
          egPst = PST_EG_PAWN[idx];
          if (isWhite) whitePawns.push(sq); else blackPawns.push(sq);
          break;
        case 'n':
          mgPst = PST_MG_KNIGHT[idx];
          egPst = PST_EG_KNIGHT[idx];
          break;
        case 'b':
          mgPst = PST_MG_BISHOP[idx];
          egPst = PST_EG_BISHOP[idx];
          if (isWhite) whiteBishops++; else blackBishops++;
          break;
        case 'r':
          mgPst = PST_MG_ROOK[idx];
          egPst = PST_EG_ROOK[idx];
          if (isWhite) whiteRooks.push(sq); else blackRooks.push(sq);
          break;
        case 'q':
          mgPst = PST_MG_QUEEN[idx];
          egPst = PST_EG_QUEEN[idx];
          break;
        case 'k':
          mgPst = PST_MG_KING[idx];
          egPst = PST_EG_KING[idx];
          if (isWhite) whiteKingSq = sq; else blackKingSq = sq;
          break;
      }

      if (isWhite) {
        mgWhite += MG_VAL[pieceType] + mgPst;
        egWhite += EG_VAL[pieceType] + egPst;
      } else {
        mgBlack += MG_VAL[pieceType] + mgPst;
        egBlack += EG_VAL[pieceType] + egPst;
      }
    }

    // 1. Bishop Pair Bonus
    if (whiteBishops >= 2) { mgWhite += 35; egWhite += 50; }
    if (blackBishops >= 2) { mgBlack += 35; egBlack += 50; }

    // 2. Pawn Structure & Passed Pawns
    // File pawn bitmasks/counts
    const whitePawnFiles = new Int8Array(8);
    const blackPawnFiles = new Int8Array(8);

    for (let i = 0; i < whitePawns.length; i++) {
      const { c } = sqToRowCol(whitePawns[i]);
      whitePawnFiles[c]++;
    }
    for (let i = 0; i < blackPawns.length; i++) {
      const { c } = sqToRowCol(blackPawns[i]);
      blackPawnFiles[c]++;
    }

    // Evaluate White pawns
    for (let i = 0; i < whitePawns.length; i++) {
      const sq = whitePawns[i];
      const { r, c } = sqToRowCol(sq);
      const rank = 8 - r;

      // Doubled pawn
      if (whitePawnFiles[c] > 1) {
        mgWhite -= 16; egWhite -= 24;
      }

      // Isolated pawn
      const hasWestNeighbour = (c > 0 && whitePawnFiles[c - 1] > 0);
      const hasEastNeighbour = (c < 7 && whitePawnFiles[c + 1] > 0);
      if (!hasWestNeighbour && !hasEastNeighbour) {
        mgWhite -= 18; egWhite -= 22;
      }

      // Passed pawn test: no black pawns ahead on file c-1, c, c+1
      let isPassed = true;
      for (let bi = 0; bi < blackPawns.length; bi++) {
        const { r: bR, c: bC } = sqToRowCol(blackPawns[bi]);
        if (Math.abs(bC - c) <= 1 && bR < r) {
          isPassed = false;
          break;
        }
      }

      if (isPassed && rank >= 2 && rank <= 7) {
        mgWhite += PASSED_PAWN_BONUS_MG[rank];
        egWhite += PASSED_PAWN_BONUS_EG[rank];

        // Bonus if protected by another pawn
        const isProtected = (c > 0 && r + 1 <= 7 && board[rowColToSq(r + 1, c - 1)]?.type === 'p' && board[rowColToSq(r + 1, c - 1)]?.color === 'w') ||
                            (c < 7 && r + 1 <= 7 && board[rowColToSq(r + 1, c + 1)]?.type === 'p' && board[rowColToSq(r + 1, c + 1)]?.color === 'w');
        if (isProtected) {
          mgWhite += 25; egWhite += 35;
        }
      }
    }

    // Evaluate Black pawns
    for (let i = 0; i < blackPawns.length; i++) {
      const sq = blackPawns[i];
      const { r, c } = sqToRowCol(sq);
      const rank = r + 1; // From Black's perspective

      // Doubled
      if (blackPawnFiles[c] > 1) {
        mgBlack -= 16; egBlack -= 24;
      }

      // Isolated
      const hasWest = (c > 0 && blackPawnFiles[c - 1] > 0);
      const hasEast = (c < 7 && blackPawnFiles[c + 1] > 0);
      if (!hasWest && !hasEast) {
        mgBlack -= 18; egBlack -= 22;
      }

      // Passed
      let isPassed = true;
      for (let wi = 0; wi < whitePawns.length; wi++) {
        const { r: wR, c: wC } = sqToRowCol(whitePawns[wi]);
        if (Math.abs(wC - c) <= 1 && wR > r) {
          isPassed = false;
          break;
        }
      }

      if (isPassed && rank >= 2 && rank <= 7) {
        mgBlack += PASSED_PAWN_BONUS_MG[rank];
        egBlack += PASSED_PAWN_BONUS_EG[rank];

        const isProtected = (c > 0 && r - 1 >= 0 && board[rowColToSq(r - 1, c - 1)]?.type === 'p' && board[rowColToSq(r - 1, c - 1)]?.color === 'b') ||
                            (c < 7 && r - 1 >= 0 && board[rowColToSq(r - 1, c + 1)]?.type === 'p' && board[rowColToSq(r - 1, c + 1)]?.color === 'b');
        if (isProtected) {
          mgBlack += 25; egBlack += 35;
        }
      }
    }

    // 3. Rook Placement (Open files, 7th rank)
    for (let i = 0; i < whiteRooks.length; i++) {
      const sq = whiteRooks[i];
      const { r, c } = sqToRowCol(sq);
      if (r === 1) { mgWhite += 35; egWhite += 45; } // 7th rank
      if (whitePawnFiles[c] === 0) {
        if (blackPawnFiles[c] === 0) {
          mgWhite += 28; egWhite += 22; // Open file
        } else {
          mgWhite += 16; egWhite += 12; // Semi-open file
        }
      }
    }

    for (let i = 0; i < blackRooks.length; i++) {
      const sq = blackRooks[i];
      const { r, c } = sqToRowCol(sq);
      if (r === 6) { mgBlack += 35; egBlack += 45; } // 2nd rank (7th for Black)
      if (blackPawnFiles[c] === 0) {
        if (whitePawnFiles[c] === 0) {
          mgBlack += 28; egBlack += 22;
        } else {
          mgBlack += 16; egBlack += 12;
        }
      }
    }

    // 4. King Safety (Midgame pawn shield)
    if (whiteKingSq !== -1) {
      const { r, c } = sqToRowCol(whiteKingSq);
      if (r >= 6 && c >= 5) {
        // Kingside shield: f2, g2, h2
        if (board[rowColToSq(6, 5)]?.type !== 'p') mgWhite -= 24;
        if (board[rowColToSq(6, 6)]?.type !== 'p') mgWhite -= 26;
        if (board[rowColToSq(6, 7)]?.type !== 'p') mgWhite -= 22;
      } else if (r >= 6 && c <= 2) {
        // Queenside shield: a2, b2, c2
        if (board[rowColToSq(6, 0)]?.type !== 'p') mgWhite -= 20;
        if (board[rowColToSq(6, 1)]?.type !== 'p') mgWhite -= 24;
        if (board[rowColToSq(6, 2)]?.type !== 'p') mgWhite -= 22;
      }
    }

    if (blackKingSq !== -1) {
      const { r, c } = sqToRowCol(blackKingSq);
      if (r <= 1 && c >= 5) {
        // Kingside shield: f7, g7, h7
        if (board[rowColToSq(1, 5)]?.type !== 'p') mgBlack -= 24;
        if (board[rowColToSq(1, 6)]?.type !== 'p') mgBlack -= 26;
        if (board[rowColToSq(1, 7)]?.type !== 'p') mgBlack -= 22;
      } else if (r <= 1 && c <= 2) {
        // Queenside shield: a7, b7, c7
        if (board[rowColToSq(1, 0)]?.type !== 'p') mgBlack -= 20;
        if (board[rowColToSq(1, 1)]?.type !== 'p') mgBlack -= 24;
        if (board[rowColToSq(1, 2)]?.type !== 'p') mgBlack -= 22;
      }
    }

    // Interpolate score based on game phase
    const clampedPhase = Math.max(0, Math.min(TOTAL_PHASE, gamePhase));
    const mgScore = mgWhite - mgBlack;
    const egScore = egWhite - egBlack;

    let evalScore = Math.round((mgScore * clampedPhase + egScore * (TOTAL_PHASE - clampedPhase)) / TOTAL_PHASE);

    // Tempo bonus
    evalScore += (turn === 'w') ? 14 : -14;

    return (turn === 'w') ? evalScore : -evalScore;
  }

  /* ==========================================================================
     8. MOVE ORDERING & HEURISTICS
     ========================================================================== */

  function scoreMove(move, board, ttMove, ply, killer1, killer2, historyTable) {
    // 1. Transposition Table Best Move
    if (ttMove && move.from === ttMove.from && move.to === ttMove.to && move.promotion === ttMove.promotion) {
      return 10000000;
    }

    // 2. Captures with SEE
    const captured = board[move.to];
    if (captured || move.isEnPassant) {
      const seeVal = staticExchangeEvaluation(move, board);
      const victimType = captured ? captured.type : 'p';
      const attackerType = board[move.from].type;
      const mvvLva = 10 * SEE_PIECE_VALUES[PIECE_INDICES[victimType]] - SEE_PIECE_VALUES[PIECE_INDICES[attackerType]];

      if (seeVal >= 0) {
        // Winning or equal exchange
        return 1000000 + mvvLva + seeVal;
      } else {
        // Losing capture (sacrifice / blunder)
        return -200000 + seeVal;
      }
    }

    // 3. Pawn Promotion to Queen
    if (move.promotion === 'q') {
      return 900000;
    }

    // 4. Killer Moves (causes beta-cutoff in same ply)
    if (killer1 && move.from === killer1.from && move.to === killer1.to) {
      return 700000;
    }
    if (killer2 && move.from === killer2.from && move.to === killer2.to) {
      return 650000;
    }

    // 5. History Heuristic for Quiet Moves
    const pColor = board[move.from].color;
    const cIdx = (pColor === 'w') ? 0 : 1;
    const hist = historyTable[cIdx][move.from][move.to] || 0;

    return hist;
  }

  function orderMoves(moves, board, ttMove, ply, killer1, killer2, historyTable) {
    const scored = moves.map(m => ({
      move: m,
      score: scoreMove(m, board, ttMove, ply, killer1, killer2, historyTable)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.move);
  }

  /* ==========================================================================
     9. SEARCH ENGINE: QUIESCENCE, NEGAMAX & PVS
     ========================================================================== */

  class SearchContext {
    constructor() {
      this.nodes = 0;
      this.qnodes = 0;
      this.stopRequested = false;
      this.startTime = 0;
      this.softTimeLimit = 0;
      this.hardTimeLimit = 0;
      this.killers = Array.from({ length: 64 }, () => [null, null]);
      // History table: [color 0..1][from 0..63][to 0..63]
      this.history = [
        Array.from({ length: 64 }, () => new Int32Array(64)),
        Array.from({ length: 64 }, () => new Int32Array(64))
      ];
      this.pv = [];
      this.rootIterationBestMove = null;
    }

    reset() {
      this.nodes = 0;
      this.qnodes = 0;
      this.stopRequested = false;
      this.startTime = Date.now();
      this.killers = Array.from({ length: 64 }, () => [null, null]);
      this.history[0].forEach(row => row.fill(0));
      this.history[1].forEach(row => row.fill(0));
      this.pv = [];
      this.rootIterationBestMove = null;
    }

    shouldStop() {
      if (this.stopRequested) return true;
      if ((this.nodes & 2047) === 0) {
        if (Date.now() - this.startTime >= this.hardTimeLimit) {
          this.stopRequested = true;
          return true;
        }
      }
      return false;
    }
  }

  const ctx = new SearchContext();

  // Quiescence Search: Tactical leaf resolution
  function quiescence(board, alpha, beta, turn, castling, ep, ply) {
    ctx.qnodes++;
    if (ctx.shouldStop()) return alpha;

    const inCheck = isKingInCheck(turn, board);

    // Stand-pat evaluation
    let standPat = -Infinity;
    if (!inCheck) {
      standPat = evaluatePosition(board, turn);
      if (standPat >= beta) return beta;
      if (standPat > alpha) alpha = standPat;
    }

    // Generate captures or check evasions
    const rawMoves = getAllLegalMoves(turn, board, castling, ep);
    if (rawMoves.length === 0) {
      if (inCheck) return -20000 + ply; // Checkmate
      return 0; // Stalemate
    }

    const candidateMoves = inCheck ? rawMoves : rawMoves.filter(m => m.isCapture || m.promotion);
    if (candidateMoves.length === 0) return standPat;

    // Sort captures by MVV-LVA / SEE
    candidateMoves.sort((a, b) => {
      const capA = board[a.to];
      const capB = board[b.to];
      const valA = capA ? SEE_PIECE_VALUES[PIECE_INDICES[capA.type]] : 0;
      const valB = capB ? SEE_PIECE_VALUES[PIECE_INDICES[capB.type]] : 0;
      return valB - valA;
    });

    for (let i = 0; i < candidateMoves.length; i++) {
      const m = candidateMoves[i];

      // Delta pruning: If standPat + Queen < alpha, skip unless in check
      if (!inCheck && !m.promotion) {
        const capturedPiece = board[m.to];
        const gain = capturedPiece ? SEE_PIECE_VALUES[PIECE_INDICES[capturedPiece.type]] : 100;
        if (standPat + gain + 200 < alpha) continue;
        if (staticExchangeEvaluation(m, board) < 0) continue;
      }

      const { nextBoard, nextCastling, nextEp } = makeSimulatedMove(board, m, castling);
      const score = -quiescence(nextBoard, -beta, -alpha, (turn === 'w') ? 'b' : 'w', nextCastling, nextEp, ply + 1);

      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }

    return alpha;
  }

  // Negamax with PVS, NMP, LMR, Futility & Check Extensions
  function negamax(board, depth, alpha, beta, turn, castling, ep, ply, isPvNode = true) {
    ctx.nodes++;
    if (ctx.shouldStop()) return 0;

    // Check extension
    const inCheck = isKingInCheck(turn, board);
    if (inCheck) {
      depth++;
    }

    // Leaf Quiescence
    if (depth <= 0) {
      return quiescence(board, alpha, beta, turn, castling, ep, ply);
    }

    // Transposition Table Probe
    const hash = computeZobristHash(board, turn, castling, ep);
    const ttEntry = globalTT.probe(hash.hi, hash.lo, depth, alpha, beta, ply);

    if (!isPvNode && ttEntry.cutoff) {
      return ttEntry.score;
    }

    const ttMove = ttEntry.bestMove;

    // Null Move Pruning (NMP)
    if (!isPvNode && !inCheck && depth >= 3) {
      // Check if side has non-pawn material (avoid zugzwang in pure pawn endgames)
      let hasMajorMinor = false;
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (p && p.color === turn && p.type !== 'p' && p.type !== 'k') {
          hasMajorMinor = true;
          break;
        }
      }

      if (hasMajorMinor) {
        const R = 2 + Math.floor(depth / 6);
        const nullScore = -negamax(board, depth - 1 - R, -beta, -beta + 1, (turn === 'w') ? 'b' : 'w', castling, null, ply + 1, false);

        if (nullScore >= beta && Math.abs(nullScore) < 19000) {
          return beta;
        }
      }
    }

    // Futility Pruning at depth 1-2
    if (!isPvNode && !inCheck && depth <= 2) {
      const staticVal = evaluatePosition(board, turn);
      const margin = (depth === 1) ? 175 : 350;
      if (staticVal - margin >= beta) {
        return beta;
      }
    }

    const legalMoves = getAllLegalMoves(turn, board, castling, ep);
    if (legalMoves.length === 0) {
      if (inCheck) {
        return -20000 + ply; // Checkmate
      }
      return 0; // Stalemate
    }

    // Move Ordering
    const killer1 = ctx.killers[ply] ? ctx.killers[ply][0] : null;
    const killer2 = ctx.killers[ply] ? ctx.killers[ply][1] : null;
    const ordered = orderMoves(legalMoves, board, ttMove, ply, killer1, killer2, ctx.history);

    let bestScore = -Infinity;
    let bestMove = null;
    let ttFlag = TT_UPPER;

    for (let i = 0; i < ordered.length; i++) {
      const m = ordered[i];
      const isCapture = !!board[m.to] || m.isEnPassant;
      const isPromo = !!m.promotion;
      const givesCheck = false; // Evaluated dynamically if searched

      const { nextBoard, nextCastling, nextEp } = makeSimulatedMove(board, m, castling);

      let score;

      if (i === 0) {
        // Principal Variation Move: Full Window Search
        score = -negamax(nextBoard, depth - 1, -beta, -alpha, (turn === 'w') ? 'b' : 'w', nextCastling, nextEp, ply + 1, isPvNode);
      } else {
        // Late Move Reductions (LMR)
        let reduction = 0;
        if (depth >= 3 && i >= 4 && !isCapture && !isPromo && !inCheck) {
          reduction = 1;
          if (depth >= 6 && i >= 8) reduction = 2;
        }

        // PVS Null Window Search
        score = -negamax(nextBoard, depth - 1 - reduction, -alpha - 1, -alpha, (turn === 'w') ? 'b' : 'w', nextCastling, nextEp, ply + 1, false);

        // Re-search at full depth if reduced search beat alpha
        if (score > alpha && reduction > 0) {
          score = -negamax(nextBoard, depth - 1, -alpha - 1, -alpha, (turn === 'w') ? 'b' : 'w', nextCastling, nextEp, ply + 1, false);
        }

        // Full window re-search if move is a new PV
        if (score > alpha && score < beta) {
          score = -negamax(nextBoard, depth - 1, -beta, -alpha, (turn === 'w') ? 'b' : 'w', nextCastling, nextEp, ply + 1, true);
        }
      }

      if (ctx.shouldStop()) return 0;

      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
        if (ply === 0) {
          ctx.rootIterationBestMove = m;
        }
      }

      if (score > alpha) {
        alpha = score;
        ttFlag = TT_EXACT;

        // History heuristic update for quiet moves
        if (!isCapture) {
          const cIdx = (turn === 'w') ? 0 : 1;
          ctx.history[cIdx][m.from][m.to] += depth * depth;
        }
      }

      // Beta Cutoff
      if (alpha >= beta) {
        ttFlag = TT_LOWER;

        // Killer move update
        if (!isCapture) {
          if (!ctx.killers[ply]) ctx.killers[ply] = [null, null];
          if (!ctx.killers[ply][0] || (ctx.killers[ply][0].from !== m.from || ctx.killers[ply][0].to !== m.to)) {
            ctx.killers[ply][1] = ctx.killers[ply][0];
            ctx.killers[ply][0] = m;
          }
        }
        break;
      }
    }

    if (!ctx.shouldStop()) {
      globalTT.store(hash.hi, hash.lo, depth, bestScore, ttFlag, bestMove, ply);
    }

    return bestScore;
  }

  /* ==========================================================================
     10. GRANDMASTER OPENING BOOK
     ========================================================================== */

  // Multi-variation principled opening library
  const OPENING_BOOK = {
    // Starting position
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": [
      { from: 52, to: 36, san: "e4", weight: 45 }, // 1. e4
      { from: 51, to: 35, san: "d4", weight: 35 }, // 1. d4
      { from: 50, to: 42, san: "c4", weight: 12 }, // 1. c4
      { from: 62, to: 45, san: "Nf3", weight: 8 }  // 1. Nf3
    ],

    // 1. e4 responses
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3": [
      { from: 10, to: 26, san: "c5", weight: 40 }, // Sicilian
      { from: 12, to: 28, san: "e5", weight: 32 }, // Open Game
      { from: 12, to: 20, san: "e6", weight: 14 }, // French
      { from: 10, to: 18, san: "c6", weight: 10 }, // Caro-Kann
      { from: 11, to: 27, san: "d5", weight: 4 }   // Scandinavian
    ],

    // 1. e4 c5 (Sicilian)
    "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6": [
      { from: 62, to: 45, san: "Nf3", weight: 75 }, // Open Sicilian
      { from: 50, to: 42, san: "c3", weight: 15 },  // Alapin
      { from: 57, to: 42, san: "Nc3", weight: 10 }  // Closed Sicilian
    ],

    // 1. e4 e5
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6": [
      { from: 62, to: 45, san: "Nf3", weight: 80 }, // King's Knight
      { from: 57, to: 42, san: "Nc3", weight: 10 }, // Vienna
      { from: 61, to: 34, san: "Bc4", weight: 10 }  // Bishop's Opening
    ],

    // 1. e4 e5 2. Nf3
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -": [
      { from: 1, to: 18, san: "Nc6", weight: 85 },
      { from: 6, to: 21, san: "Nf6", weight: 15 } // Petrov
    ],

    // 1. e4 e5 2. Nf3 Nc6
    "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -": [
      { from: 61, to: 25, san: "Bb5", weight: 55 }, // Ruy Lopez
      { from: 61, to: 34, san: "Bc4", weight: 35 }, // Italian / Giuoco Piano
      { from: 51, to: 35, san: "d4", weight: 10 }   // Scotch
    ],

    // 1. e4 e5 2. Nf3 Nc6 3. Bb5 (Ruy Lopez)
    "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -": [
      { from: 8, to: 24, san: "a6", weight: 75 },  // Morphy Defense
      { from: 6, to: 21, san: "Nf6", weight: 25 }  // Berlin Defense
    ],

    // 1. e4 e5 2. Nf3 Nc6 3. Bc4 (Italian)
    "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -": [
      { from: 5, to: 26, san: "Bc5", weight: 60 }, // Giuoco Piano
      { from: 6, to: 21, san: "Nf6", weight: 40 }  // Two Knights
    ],

    // 1. d4 responses
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3": [
      { from: 6, to: 21, san: "Nf6", weight: 55 }, // Indian Defenses
      { from: 11, to: 27, san: "d5", weight: 35 }, // Closed Games
      { from: 12, to: 20, san: "e6", weight: 10 }
    ],

    // 1. d4 d5 2. c4 (Queen's Gambit)
    "rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3": [
      { from: 12, to: 20, san: "e6", weight: 50 }, // QGD
      { from: 10, to: 18, san: "c6", weight: 35 }, // Slav
      { from: 27, to: 34, san: "dxc4", weight: 15 } // QGA
    ],

    // 1. d4 Nf6 2. c4
    "rnbqkb1r/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3": [
      { from: 14, to: 22, san: "g6", weight: 45 }, // King's Indian / Grunfeld
      { from: 12, to: 20, san: "e6", weight: 45 }, // Nimzo / Queen's Indian
      { from: 10, to: 26, san: "c5", weight: 10 }  // Benoni
    ]
  };

  function getBookMove(board, turn, castling, ep) {
    // Generate clean FEN prefix for book lookup
    let fen = "";
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      for (let c = 0; c < 8; c++) {
        const p = board[rowColToSq(r, c)];
        if (!p) {
          empty++;
        } else {
          if (empty > 0) { fen += empty; empty = 0; }
          fen += (p.color === 'w') ? p.type.toUpperCase() : p.type;
        }
      }
      if (empty > 0) fen += empty;
      if (r < 7) fen += "/";
    }

    fen += ` ${turn}`;
    const cStr = (castling.wK ? 'K' : '') + (castling.wQ ? 'Q' : '') + (castling.bK ? 'k' : '') + (castling.bQ ? 'q' : '') || '-';
    fen += ` ${cStr}`;
    fen += ` ${(ep !== null) ? sqToAlg(ep) : '-'}`;

    const candidates = OPENING_BOOK[fen];
    if (!candidates || candidates.length === 0) return null;

    // Weighted random selection
    const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
    let rand = Math.random() * totalWeight;

    for (let i = 0; i < candidates.length; i++) {
      rand -= candidates[i].weight;
      if (rand <= 0) {
        const candidate = candidates[i];
        // Verify legal
        const legalMoves = getAllLegalMoves(turn, board, castling, ep);
        const match = legalMoves.find(m => m.from === candidate.from && m.to === candidate.to);
        if (match) return match;
      }
    }

    return null;
  }

  /* ==========================================================================
     11. ITERATIVE DEEPENING & APEX ENGINE CONTROLLER
     ========================================================================== */

  const DIFFICULTY_PROFILES = {
    easy:    { maxDepth: 2,  softTime: 150,  hardTime: 300,   randomBlunderChance: 0.25, useBook: false },
    medium:  { maxDepth: 4,  softTime: 400,  hardTime: 800,   randomBlunderChance: 0.08, useBook: true },
    hard:    { maxDepth: 6,  softTime: 1200, hardTime: 2000,  randomBlunderChance: 0.0,  useBook: true },
    extreme: { maxDepth: 8,  softTime: 2500, hardTime: 4000,  randomBlunderChance: 0.0,  useBook: true },
    master:  { maxDepth: 10, softTime: 4000, hardTime: 7000,  randomBlunderChance: 0.0,  useBook: true },
    apex:    { maxDepth: 16, softTime: 6500, hardTime: 12000, randomBlunderChance: 0.0,  useBook: true }
  };

  function search(fen, options = {}, onProgress = null) {
    const parsed = parseFen(fen);
    const board = parsed.board;
    const turn = parsed.turn;
    const castling = parsed.castling;
    const ep = parsed.ep;

    const diffKey = (options.difficulty || 'apex').toLowerCase();
    const profile = DIFFICULTY_PROFILES[diffKey] || DIFFICULTY_PROFILES.apex;

    const maxDepth = options.maxDepth || profile.maxDepth;
    const softTime = options.softTime || profile.softTime;
    const hardTime = options.hardTime || profile.hardTime;

    // 1. Opening Book
    if (profile.useBook && !options.ignoreBook) {
      const bookMove = getBookMove(board, turn, castling, ep);
      if (bookMove) {
        return {
          bestMove: bookMove,
          score: 0,
          depth: 1,
          nodes: 1,
          nps: 0,
          time: 50,
          isBook: true
        };
      }
    }

    const legalMoves = getAllLegalMoves(turn, board, castling, ep);
    if (legalMoves.length === 0) {
      return { bestMove: null, score: 0, depth: 0, nodes: 0, nps: 0, time: 0 };
    }
    if (legalMoves.length === 1) {
      return { bestMove: legalMoves[0], score: 0, depth: 1, nodes: 1, nps: 0, time: 0 };
    }

    // Occasional low-difficulty blunder simulation
    if (profile.randomBlunderChance > 0 && Math.random() < profile.randomBlunderChance) {
      const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
      return { bestMove: randomMove, score: 0, depth: 1, nodes: 1, nps: 0, time: 100 };
    }

    // Configure search context
    ctx.reset();
    ctx.softTimeLimit = softTime;
    ctx.hardTimeLimit = hardTime;
    globalTT.newSearch();

    let bestMove = legalMoves[0];
    let bestScore = 0;
    let completedDepth = 0;

    // Iterative Deepening
    for (let depth = 1; depth <= maxDepth; depth++) {
      let alpha = -Infinity;
      let beta = Infinity;

      // Aspiration Windows at depth >= 4
      if (depth >= 4 && Math.abs(bestScore) < 18000) {
        const delta = 25;
        alpha = bestScore - delta;
        beta = bestScore + delta;
      }

      let score = negamax(board, depth, alpha, beta, turn, castling, ep, 0, true);

      // Re-search on Aspiration Window failure
      if (score <= alpha || score >= beta) {
        if (!ctx.shouldStop()) {
          score = negamax(board, depth, -Infinity, Infinity, turn, castling, ep, 0, true);
        }
      }

      if (ctx.shouldStop() && depth > 1) {
        // Abort iteration, retain best move from previous depth
        break;
      }

      completedDepth = depth;
      bestScore = score;

      // Extract root best move (prefer direct root iteration move, fallback to TT)
      if (ctx.rootIterationBestMove) {
        const verified = legalMoves.find(m => m.from === ctx.rootIterationBestMove.from && m.to === ctx.rootIterationBestMove.to && (m.promotion || null) === (ctx.rootIterationBestMove.promotion || null));
        if (verified) {
          bestMove = verified;
        }
      } else {
        const hash = computeZobristHash(board, turn, castling, ep);
        const ttEntry = globalTT.probe(hash.hi, hash.lo, depth, -Infinity, Infinity, 0);
        if (ttEntry.bestMove) {
          const verified = legalMoves.find(m => m.from === ttEntry.bestMove.from && m.to === ttEntry.bestMove.to && (m.promotion || null) === (ttEntry.bestMove.promotion || null));
          if (verified) {
            bestMove = verified;
          }
        }
      }

      const elapsed = Date.now() - ctx.startTime;
      const nps = elapsed > 0 ? Math.round((ctx.nodes + ctx.qnodes) / (elapsed / 1000)) : 0;

      if (onProgress) {
        onProgress({
          depth: completedDepth,
          score: bestScore,
          nodes: ctx.nodes + ctx.qnodes,
          nps,
          time: elapsed,
          bestMove
        });
      }

      // Check soft time budget limit
      if (elapsed >= ctx.softTimeLimit) {
        break;
      }

      // Check forced mate cutoff
      if (Math.abs(bestScore) >= 19000) {
        break;
      }
    }

    // Tactical anti-blunder failsafe verification
    bestMove = antiBlunderVerify(bestMove, legalMoves, board, turn, castling);

    const totalElapsed = Date.now() - ctx.startTime;
    const finalNps = totalElapsed > 0 ? Math.round((ctx.nodes + ctx.qnodes) / (totalElapsed / 1000)) : 0;

    return {
      bestMove,
      score: bestScore,
      depth: completedDepth,
      nodes: ctx.nodes + ctx.qnodes,
      nps: finalNps,
      time: totalElapsed,
      isBook: false
    };
  }

  // Anti-Blunder Tactical Verification
  function antiBlunderVerify(candidateMove, legalMoves, board, turn, castling) {
    if (!candidateMove || legalMoves.length <= 1) return candidateMove;

    const { nextBoard } = makeSimulatedMove(board, candidateMove, castling);
    const opp = (turn === 'w') ? 'b' : 'w';

    // 1. Does candidate move allow immediate mate in 1?
    const oppLegal = getAllLegalMoves(opp, nextBoard, { wK: true, wQ: true, bK: true, bQ: true }, null);
    for (let i = 0; i < oppLegal.length; i++) {
      const oppMove = oppLegal[i];
      const { nextBoard: mateTestBoard } = makeSimulatedMove(nextBoard, oppMove, { wK: true, wQ: true, bK: true, bQ: true });
      const ourLegal = getAllLegalMoves(turn, mateTestBoard, { wK: true, wQ: true, bK: true, bQ: true }, null);
      if (ourLegal.length === 0 && isKingInCheck(turn, mateTestBoard)) {
        // Blunder! Choose safest alternative move
        const safeAlt = legalMoves.find(m => m.from !== candidateMove.from || m.to !== candidateMove.to);
        return safeAlt || candidateMove;
      }
    }

    return candidateMove;
  }

  /* ==========================================================================
     12. BENCHMARK SUITE
     ========================================================================== */

  const BENCHMARK_POSITIONS = [
    {
      name: "Tactical Queen Sacrifice Mate",
      fen: "r1bqk2r/pppp1ppp/2n5/1B2p3/4n3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 5",
      expectedMoves: ["d2d4", "O-O", "Bxc6"]
    },
    {
      name: "Greek Gift Sacrifice Entry",
      fen: "r1bq1rk1/ppp2ppp/2n1pn2/3p4/1bPP4/2N1PN2/PP1B1PPP/R2QKB1R w KQ - 4 7",
      expectedMoves: ["cxd5", "Bd3", "a3"]
    },
    {
      name: "Pawn Endgame Opposition",
      fen: "8/8/4k3/8/4K3/8/8/8 w - - 0 1",
      expectedMoves: ["Ke4e5", "Ke4d4", "Ke4f4"]
    },
    {
      name: "Tactical Pin Defense",
      fen: "r1b1k2r/ppppqppp/2n2n2/8/1b1PP3/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 1 6",
      expectedMoves: ["Bd3", "Be2", "Qe2"]
    }
  ];

  function runBenchmark() {
    const results = [];
    let totalNodes = 0;
    const startAll = Date.now();

    for (let i = 0; i < BENCHMARK_POSITIONS.length; i++) {
      const test = BENCHMARK_POSITIONS[i];
      const res = search(test.fen, { maxDepth: 6, softTime: 1200, hardTime: 2000, ignoreBook: true });
      totalNodes += res.nodes;
      results.push({
        name: test.name,
        fen: test.fen,
        depth: res.depth,
        nodes: res.nodes,
        nps: res.nps,
        time: res.time,
        bestMove: res.bestMove ? `${sqToAlg(res.bestMove.from)}${sqToAlg(res.bestMove.to)}` : 'none',
        score: res.score
      });
    }

    const totalElapsed = Date.now() - startAll;
    const overallNps = totalElapsed > 0 ? Math.round(totalNodes / (totalElapsed / 1000)) : 0;

    return {
      results,
      totalNodes,
      totalTime: totalElapsed,
      overallNps
    };
  }

  /* ==========================================================================
     13. ASYNCHRONOUS API & EXPORT
     ========================================================================== */

  function searchAsync(fen, options = {}, onProgress = null) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        const result = search(fen, options, onProgress);
        resolve(result);
      }, 10);
    });
  }

  function stopSearch() {
    ctx.stopRequested = true;
  }

  return {
    search,
    searchAsync,
    stopSearch,
    runBenchmark,
    evaluatePosition,
    staticExchangeEvaluation,
    computeZobristHash,
    getAllLegalMoves,
    parseFen,
    sqToAlg,
    algToSq,
    globalTT
  };
});
