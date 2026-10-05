/**
 * ============================================================================
 * NOIR CHESS — LUXURY EDITORIAL CHESSCLUB
 * Pure Vanilla JavaScript Complete Chess Engine, AI & Audio Synthesizer
 * ============================================================================
 */

(function () {
  'use strict';

  /* ==========================================================================
     1. CONSTANTS & PIECE-SQUARE EVALUATION TABLES
     ========================================================================== */

  // Piece Material Base Values (Centipawns for AI Minimax)
  const AI_PIECE_VALUES = {
    p: 100,
    n: 320,
    b: 335,
    r: 500,
    q: 925,
    k: 20000
  };

  // Standard Chess Piece Values (Display Score: P=1, N=3, B=3, R=5, Q=9)
  const STANDARD_PIECE_VALUES = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 0
  };

  // Piece-Square Tables (White perspective: row 0 = rank 8, row 7 = rank 1)
  const PST_PAWN = [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 26, 26, 10,  5,  5,
     0,  0,  0, 22, 22,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0
  ];

  const PST_KNIGHT = [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
  ];

  const PST_BISHOP = [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 12, 12,  5,  5,-10,
    -10,  0, 10, 12, 12, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20
  ];

  const PST_ROOK = [
      0,  0,  0,  0,  0,  0,  0,  0,
      5, 12, 12, 12, 12, 12, 12,  5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  0,  5,  5,  0,  0,  0
  ];

  const PST_QUEEN = [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20
  ];

  const PST_KING_MID = [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20
  ];

  const PST_KING_END = [
    -50,-40,-30,-20,-20,-30,-40,-50,
    -30,-20,-10,  0,  0,-10,-20,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-30,  0,  0,  0,  0,-30,-30,
    -50,-30,-30,-30,-30,-30,-30,-50
  ];

  // Helper coordinate conversions
  function sqToRowCol(sq) {
    return { r: Math.floor(sq / 8), c: sq % 8 };
  }

  function rowColToSq(r, c) {
    return r * 8 + c;
  }

  function sqToAlgebraic(sq) {
    const { r, c } = sqToRowCol(sq);
    return String.fromCharCode(97 + c) + (8 - r);
  }

  function algebraicToSq(alg) {
    const c = alg.charCodeAt(0) - 97;
    const r = 8 - parseInt(alg[1], 10);
    return rowColToSq(r, c);
  }

  /* ==========================================================================
     2. GAME STATE
     ========================================================================== */

  const state = {
    // 64-element board array (null or { type: 'p'|'n'|'b'|'r'|'q'|'k', color: 'w'|'b' })
    board: new Array(64).fill(null),
    initialBoardSnapshot: new Array(64).fill(null),
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassantSquare: null,
    halfMoveClock: 0,
    fullMoveNumber: 1,

    // Move history with full immutable snapshots
    history: [],
    historyIndex: -1,
    undoStack: [],
    redoStack: [],
    positionCounts: {},

    // Captured lists: captured.w = pieces captured BY White; captured.b = pieces captured BY Black
    captured: { w: [], b: [] },

    // Game lifecycle
    gameOver: false,
    gameResult: null,
    pendingPromotionMove: null,

    // Settings
    settings: {
      mode: 'ai', // 'ai' | 'pvp'
      playerColor: 'white', // 'white' | 'black' | 'random'
      actualPlayerColor: 'w',
      aiDifficulty: 'apex', // 'easy' | 'medium' | 'hard' | 'extreme' | 'master' | 'apex'
      timeControl: { time: 600, inc: 0 },
      boardFlipped: false,
      theme: 'noir',
      soundEnabled: true
    },

    // Clocks
    clocks: {
      w: 600,
      b: 600,
      active: false,
      intervalId: null
    },

    // Selection & interaction
    selectedSq: null,
    legalMovesForSelected: [],
    lastMove: null
  };

  /* ==========================================================================
     3. WEB AUDIO API SYNTHESIZER
     ========================================================================== */

  class ChessAudio {
    constructor() {
      this.ctx = null;
    }

    init() {
      if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    playMove() {
      if (!state.settings.soundEnabled) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.08);

      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    }

    playCapture() {
      if (!state.settings.soundEnabled) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.12);

      gain.gain.setValueAtTime(0.48, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);
    }

    playCheck() {
      if (!state.settings.soundEnabled) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [523.25, 659.25].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.05);

        gain.gain.setValueAtTime(0.24, now + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 0.35);
      });
    }

    playCheckmate() {
      if (!state.settings.soundEnabled) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [130.81, 196.00, 261.63].forEach((freq) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 1.2);
      });
    }

    playClick() {
      if (!state.settings.soundEnabled) return;
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.03);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.03);
    }
  }

  const audio = new ChessAudio();

  /* ==========================================================================
     4. BOARD INITIALIZATION & SNAPSHOTS
     ========================================================================== */

  const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  function initBoardFromFen(fen = STARTING_FEN) {
    const parts = fen.split(' ');
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

    state.board = board;
    state.initialBoardSnapshot = cloneBoard(board);
    state.turn = turn;
    state.castling = {
      wK: castlingStr.includes('K'),
      wQ: castlingStr.includes('Q'),
      bK: castlingStr.includes('k'),
      bQ: castlingStr.includes('q')
    };
    state.enPassantSquare = (epStr === '-') ? null : algebraicToSq(epStr);
    state.halfMoveClock = halfMoves;
    state.fullMoveNumber = fullMoves;
    state.selectedSq = null;
    state.legalMovesForSelected = [];
    state.lastMove = null;
    state.captured = { w: [], b: [] };
    state.history = [];
    state.historyIndex = -1;
    state.undoStack = [];
    state.redoStack = [];
    state.positionCounts = {};
    recordPosition();
  }

  function cloneBoard(b) {
    const copy = new Array(64);
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      copy[i] = p ? { type: p.type, color: p.color } : null;
    }
    return copy;
  }

  function recordPosition() {
    const key = generatePositionKey(state.board, state.turn, state.castling, state.enPassantSquare);
    state.positionCounts[key] = (state.positionCounts[key] || 0) + 1;
  }

  function generatePositionKey(board, turn, castling, ep) {
    let key = '';
    for (let i = 0; i < 64; i++) {
      const p = board[i];
      if (!p) {
        key += '.';
      } else {
        key += (p.color === 'w') ? p.type.toUpperCase() : p.type;
      }
    }
    key += '_' + turn;
    key += '_' + (castling.wK ? 'K' : '') + (castling.wQ ? 'Q' : '') + (castling.bK ? 'k' : '') + (castling.bQ ? 'q' : '');
    key += '_' + (ep !== null ? ep : '-');
    return key;
  }

  function getBoardFen(board = state.board, turn = state.turn, castling = state.castling, ep = state.enPassantSquare, halfMoves = state.halfMoveClock, fullMoves = state.fullMoveNumber) {
    let fen = '';
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
      if (r < 7) fen += '/';
    }

    fen += ` ${turn}`;
    const cStr = (castling.wK ? 'K' : '') + (castling.wQ ? 'Q' : '') + (castling.bK ? 'k' : '') + (castling.bQ ? 'q' : '') || '-';
    fen += ` ${cStr}`;
    fen += ` ${(ep !== null) ? sqToAlgebraic(ep) : '-'}`;
    fen += ` ${halfMoves} ${fullMoves}`;
    return fen;
  }

  /* ==========================================================================
     5. DYNAMIC MATERIAL & SCORE CALCULATION
     ========================================================================== */

  // Calculates exact on-board material score for each player
  function calculateMaterialScores(board = state.board) {
    let whiteMaterial = 0;
    let blackMaterial = 0;

    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (!p) continue;
      const val = STANDARD_PIECE_VALUES[p.type] || 0;
      if (p.color === 'w') {
        whiteMaterial += val;
      } else {
        blackMaterial += val;
      }
    }

    const diff = whiteMaterial - blackMaterial;
    return { whiteMaterial, blackMaterial, diff };
  }

  /* ==========================================================================
     6. CHESS LOGIC: ATTACKS & CHECK DETECTION
     ========================================================================== */

  function isSquareAttacked(sq, attackingColor, board = state.board) {
    const { r, c } = sqToRowCol(sq);

    // 1. Pawn attacks: White pawn attacks from r + 1; Black pawn attacks from r - 1
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

    // 2. Knight jumps
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

    // 3. Bishop / Queen diagonals
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

    // 4. Rook / Queen orthogonals
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

    // 5. King adjacent
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

  function findKing(color, board = state.board) {
    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (p && p.color === color && p.type === 'k') {
        return sq;
      }
    }
    return -1;
  }

  function isKingInCheck(color, board = state.board) {
    const kingSq = findKing(color, board);
    if (kingSq === -1) return false;
    const opponentColor = (color === 'w') ? 'b' : 'w';
    return isSquareAttacked(kingSq, opponentColor, board);
  }

  /* ==========================================================================
     7. MOVE GENERATION (PSEUDO-LEGAL & LEGAL)
     ========================================================================== */

  function getPseudoLegalMoves(sq, board = state.board, castling = state.castling, ep = state.enPassantSquare) {
    const piece = board[sq];
    if (!piece) return [];

    const moves = [];
    const { r, c } = sqToRowCol(sq);
    const color = piece.color;
    const opponentColor = (color === 'w') ? 'b' : 'w';

    switch (piece.type) {
      case 'p': {
        const forward = (color === 'w') ? -1 : 1;
        const startRank = (color === 'w') ? 6 : 1;
        const promoRank = (color === 'w') ? 0 : 7;

        // 1-step forward
        const r1 = r + forward;
        if (r1 >= 0 && r1 <= 7) {
          const sq1 = rowColToSq(r1, c);
          if (!board[sq1]) {
            if (r1 === promoRank) {
              ['q', 'r', 'b', 'n'].forEach(promo => moves.push({ from: sq, to: sq1, promotion: promo }));
            } else {
              moves.push({ from: sq, to: sq1 });
            }

            // 2-step forward from starting rank
            if (r === startRank) {
              const r2 = r + forward * 2;
              const sq2 = rowColToSq(r2, c);
              if (!board[sq2]) {
                moves.push({ from: sq, to: sq2, isDoublePawn: true });
              }
            }
          }
        }

        // Diagonal captures
        [-1, 1].forEach(dc => {
          const nc = c + dc;
          const nr = r + forward;
          if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
            const targetSq = rowColToSq(nr, nc);
            const targetPiece = board[targetSq];

            if (targetPiece && targetPiece.color === opponentColor) {
              if (nr === promoRank) {
                ['q', 'r', 'b', 'n'].forEach(promo => moves.push({ from: sq, to: targetSq, promotion: promo, isCapture: true }));
              } else {
                moves.push({ from: sq, to: targetSq, isCapture: true });
              }
            } else if (targetSq === ep) {
              // En passant
              moves.push({ from: sq, to: targetSq, isEnPassant: true, isCapture: true });
            }
          }
        });
        break;
      }

      case 'n': {
        const offsets = [
          [-2, -1], [-2, 1], [-1, -2], [-1, 2],
          [1, -2],  [1, 2],  [2, -1],  [2, 1]
        ];
        offsets.forEach(([dr, dc]) => {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
            const targetSq = rowColToSq(nr, nc);
            const p = board[targetSq];
            if (!p || p.color === opponentColor) {
              moves.push({ from: sq, to: targetSq, isCapture: !!p });
            }
          }
        });
        break;
      }

      case 'b': {
        const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        dirs.forEach(([dr, dc]) => {
          let step = 1;
          while (true) {
            const nr = r + dr * step;
            const nc = c + dc * step;
            if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
            const targetSq = rowColToSq(nr, nc);
            const p = board[targetSq];
            if (!p) {
              moves.push({ from: sq, to: targetSq });
            } else {
              if (p.color === opponentColor) {
                moves.push({ from: sq, to: targetSq, isCapture: true });
              }
              break;
            }
            step++;
          }
        });
        break;
      }

      case 'r': {
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        dirs.forEach(([dr, dc]) => {
          let step = 1;
          while (true) {
            const nr = r + dr * step;
            const nc = c + dc * step;
            if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
            const targetSq = rowColToSq(nr, nc);
            const p = board[targetSq];
            if (!p) {
              moves.push({ from: sq, to: targetSq });
            } else {
              if (p.color === opponentColor) {
                moves.push({ from: sq, to: targetSq, isCapture: true });
              }
              break;
            }
            step++;
          }
        });
        break;
      }

      case 'q': {
        const dirs = [
          [-1, -1], [-1, 1], [1, -1], [1, 1],
          [-1, 0],  [1, 0],  [0, -1], [0, 1]
        ];
        dirs.forEach(([dr, dc]) => {
          let step = 1;
          while (true) {
            const nr = r + dr * step;
            const nc = c + dc * step;
            if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
            const targetSq = rowColToSq(nr, nc);
            const p = board[targetSq];
            if (!p) {
              moves.push({ from: sq, to: targetSq });
            } else {
              if (p.color === opponentColor) {
                moves.push({ from: sq, to: targetSq, isCapture: true });
              }
              break;
            }
            step++;
          }
        });
        break;
      }

      case 'k': {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
              const targetSq = rowColToSq(nr, nc);
              const p = board[targetSq];
              if (!p || p.color === opponentColor) {
                moves.push({ from: sq, to: targetSq, isCapture: !!p });
              }
            }
          }
        }

        // Castling moves
        if (color === 'w') {
          // White Kingside
          if (castling.wK && sq === 60 && !board[61] && !board[62]) {
            const rk = board[63];
            if (rk && rk.type === 'r' && rk.color === 'w') {
              if (!isSquareAttacked(60, 'b', board) && !isSquareAttacked(61, 'b', board) && !isSquareAttacked(62, 'b', board)) {
                moves.push({ from: 60, to: 62, isCastling: 'k' });
              }
            }
          }
          // White Queenside
          if (castling.wQ && sq === 60 && !board[59] && !board[58] && !board[57]) {
            const rk = board[56];
            if (rk && rk.type === 'r' && rk.color === 'w') {
              if (!isSquareAttacked(60, 'b', board) && !isSquareAttacked(59, 'b', board) && !isSquareAttacked(58, 'b', board)) {
                moves.push({ from: 60, to: 58, isCastling: 'q' });
              }
            }
          }
        } else {
          // Black Kingside
          if (castling.bK && sq === 4 && !board[5] && !board[6]) {
            const rk = board[7];
            if (rk && rk.type === 'r' && rk.color === 'b') {
              if (!isSquareAttacked(4, 'w', board) && !isSquareAttacked(5, 'w', board) && !isSquareAttacked(6, 'w', board)) {
                moves.push({ from: 4, to: 6, isCastling: 'k' });
              }
            }
          }
          // Black Queenside
          if (castling.bQ && sq === 4 && !board[3] && !board[2] && !board[1]) {
            const rk = board[0];
            if (rk && rk.type === 'r' && rk.color === 'b') {
              if (!isSquareAttacked(4, 'w', board) && !isSquareAttacked(3, 'w', board) && !isSquareAttacked(2, 'w', board)) {
                moves.push({ from: 4, to: 2, isCastling: 'q' });
              }
            }
          }
        }
        break;
      }
    }

    return moves;
  }

  function isMoveLegal(move, board = state.board) {
    const simBoard = cloneBoard(board);
    const piece = simBoard[move.from];
    if (!piece) return false;

    // Apply move
    simBoard[move.to] = piece;
    simBoard[move.from] = null;

    // En Passant
    if (move.isEnPassant) {
      const { r: fromR } = sqToRowCol(move.from);
      const { c: toC } = sqToRowCol(move.to);
      simBoard[rowColToSq(fromR, toC)] = null;
    }

    // Castling
    if (move.isCastling === 'k') {
      if (piece.color === 'w') {
        simBoard[61] = simBoard[63];
        simBoard[63] = null;
      } else {
        simBoard[5] = simBoard[7];
        simBoard[7] = null;
      }
    } else if (move.isCastling === 'q') {
      if (piece.color === 'w') {
        simBoard[59] = simBoard[56];
        simBoard[56] = null;
      } else {
        simBoard[3] = simBoard[0];
        simBoard[0] = null;
      }
    }

    // Promotion
    if (move.promotion) {
      simBoard[move.to] = { type: move.promotion, color: piece.color };
    }

    return !isKingInCheck(piece.color, simBoard);
  }

  function getLegalMovesForSquare(sq, board = state.board, castling = state.castling, ep = state.enPassantSquare) {
    const pseudoMoves = getPseudoLegalMoves(sq, board, castling, ep);
    return pseudoMoves.filter(m => isMoveLegal(m, board));
  }

  function getAllLegalMoves(color, board = state.board, castling = state.castling, ep = state.enPassantSquare) {
    const moves = [];
    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (p && p.color === color) {
        const sqMoves = getLegalMovesForSquare(sq, board, castling, ep);
        for (let i = 0; i < sqMoves.length; i++) {
          moves.push(sqMoves[i]);
        }
      }
    }
    return moves;
  }

  /* ==========================================================================
     8. MOVE NOTATION & SAN
     ========================================================================== */

  function generateSAN(move, boardBefore = state.board) {
    const piece = boardBefore[move.from];
    if (!piece) return '';

    if (move.isCastling === 'k') return 'O-O';
    if (move.isCastling === 'q') return 'O-O-O';

    let san = '';
    const fromCoord = sqToAlgebraic(move.from);
    const toCoord = sqToAlgebraic(move.to);
    const isCapture = move.isCapture || move.isEnPassant;

    if (piece.type === 'p') {
      if (isCapture) {
        san += fromCoord[0] + 'x' + toCoord;
      } else {
        san += toCoord;
      }
      if (move.promotion) {
        san += '=' + move.promotion.toUpperCase();
      }
    } else {
      san += piece.type.toUpperCase();

      const candMoves = getAllLegalMoves(piece.color, boardBefore, state.castling, state.enPassantSquare)
        .filter(m => m.to === move.to && m.from !== move.from && boardBefore[m.from].type === piece.type);

      if (candMoves.length > 0) {
        const sameFile = candMoves.some(m => sqToAlgebraic(m.from)[0] === fromCoord[0]);
        const sameRank = candMoves.some(m => sqToAlgebraic(m.from)[1] === fromCoord[1]);

        if (!sameFile) {
          san += fromCoord[0];
        } else if (!sameRank) {
          san += fromCoord[1];
        } else {
          san += fromCoord;
        }
      }

      if (isCapture) {
        san += 'x';
      }
      san += toCoord;
    }

    // Check / Checkmate suffix
    const simBoard = cloneBoard(boardBefore);
    simBoard[move.to] = move.promotion ? { type: move.promotion, color: piece.color } : piece;
    simBoard[move.from] = null;
    if (move.isEnPassant) {
      const { r: fromR } = sqToRowCol(move.from);
      const { c: toC } = sqToRowCol(move.to);
      simBoard[rowColToSq(fromR, toC)] = null;
    }
    const opponent = (piece.color === 'w') ? 'b' : 'w';

    if (isKingInCheck(opponent, simBoard)) {
      const oppLegal = getAllLegalMoves(opponent, simBoard, state.castling, null);
      if (oppLegal.length === 0) {
        san += '#';
      } else {
        san += '+';
      }
    }

    return san;
  }

  function isInsufficientMaterial(board = state.board) {
    const pieces = [];
    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (p) pieces.push({ ...p, sq });
    }

    if (pieces.length === 2) return true; // K vs K

    if (pieces.length === 3) {
      const nonKings = pieces.filter(p => p.type !== 'k');
      if (nonKings.length === 1) {
        const t = nonKings[0].type;
        if (t === 'b' || t === 'n') return true;
      }
    }

    if (pieces.length === 4) {
      const nonKings = pieces.filter(p => p.type !== 'k');
      if (nonKings.length === 2 && nonKings[0].type === 'b' && nonKings[1].type === 'b') {
        const { r: r1, c: c1 } = sqToRowCol(nonKings[0].sq);
        const { r: r2, c: c2 } = sqToRowCol(nonKings[1].sq);
        if ((r1 + c1) % 2 === (r2 + c2) % 2) return true;
      }
    }

    return false;
  }

  /* ==========================================================================
     9. MOVE EXECUTION
     ========================================================================== */

  function executeMove(move, isReviewOrSim = false) {
    if (state.gameOver && !isReviewOrSim) return false;

    // Snap back to live move if currently reviewing historical step
    if (state.historyIndex !== state.history.length - 1 && !isReviewOrSim) {
      jumpToHistoryStep(state.history.length - 1);
    }

    const movingPiece = state.board[move.from];
    if (!movingPiece) return false;

    let capturedPiece = state.board[move.to];
    let isEnPassantCapture = false;

    if (move.isEnPassant) {
      const { r: fromR } = sqToRowCol(move.from);
      const { c: toC } = sqToRowCol(move.to);
      const epCapturedSq = rowColToSq(fromR, toC);
      capturedPiece = state.board[epCapturedSq];
      state.board[epCapturedSq] = null;
      isEnPassantCapture = true;
    }

    const san = generateSAN(move, state.board);

    // Save undo snapshot
    const snapshot = {
      board: cloneBoard(state.board),
      turn: state.turn,
      castling: { ...state.castling },
      enPassantSquare: state.enPassantSquare,
      halfMoveClock: state.halfMoveClock,
      fullMoveNumber: state.fullMoveNumber,
      captured: { w: [...state.captured.w], b: [...state.captured.b] },
      lastMove: state.lastMove ? { ...state.lastMove } : null,
      clocks: { w: state.clocks.w, b: state.clocks.b },
      historyEntry: null
    };

    // Record captured pieces
    if (capturedPiece) {
      state.captured[movingPiece.color].push(capturedPiece.type);
    }

    // Apply move to board
    state.board[move.to] = move.promotion ? { type: move.promotion, color: movingPiece.color } : movingPiece;
    state.board[move.from] = null;

    // Castling rook move
    if (move.isCastling === 'k') {
      if (movingPiece.color === 'w') {
        state.board[61] = state.board[63];
        state.board[63] = null;
      } else {
        state.board[5] = state.board[7];
        state.board[7] = null;
      }
    } else if (move.isCastling === 'q') {
      if (movingPiece.color === 'w') {
        state.board[59] = state.board[56];
        state.board[56] = null;
      } else {
        state.board[3] = state.board[0];
        state.board[0] = null;
      }
    }

    // Castling rights update
    if (movingPiece.type === 'k') {
      if (movingPiece.color === 'w') {
        state.castling.wK = false;
        state.castling.wQ = false;
      } else {
        state.castling.bK = false;
        state.castling.bQ = false;
      }
    } else if (movingPiece.type === 'r') {
      if (move.from === 63) state.castling.wK = false;
      if (move.from === 56) state.castling.wQ = false;
      if (move.from === 7) state.castling.bK = false;
      if (move.from === 0) state.castling.bQ = false;
    }
    if (move.to === 63) state.castling.wK = false;
    if (move.to === 56) state.castling.wQ = false;
    if (move.to === 7) state.castling.bK = false;
    if (move.to === 0) state.castling.bQ = false;

    // En Passant square update
    if (movingPiece.type === 'p' && Math.abs(move.to - move.from) === 16) {
      state.enPassantSquare = (move.from + move.to) / 2;
    } else {
      state.enPassantSquare = null;
    }

    // 50-move clock
    if (movingPiece.type === 'p' || capturedPiece) {
      state.halfMoveClock = 0;
    } else {
      state.halfMoveClock++;
    }

    // Full move counter
    if (state.turn === 'b') {
      state.fullMoveNumber++;
    }

    // Increment timer
    if (state.clocks.active && state.settings.timeControl.inc > 0) {
      state.clocks[state.turn] += state.settings.timeControl.inc;
    }

    // Record History item
    state.lastMove = { from: move.from, to: move.to };
    const historyItem = {
      from: move.from,
      to: move.to,
      san,
      turn: state.turn,
      fullMove: state.fullMoveNumber,
      boardSnapshot: cloneBoard(state.board),
      lastMove: { from: move.from, to: move.to },
      capturedSnapshot: { w: [...state.captured.w], b: [...state.captured.b] },
      clocksSnapshot: { w: state.clocks.w, b: state.clocks.b }
    };
    snapshot.historyEntry = historyItem;
    state.undoStack.push(snapshot);
    state.redoStack = [];

    state.history.push(historyItem);
    state.historyIndex = state.history.length - 1;

    // Turn switch
    state.turn = (state.turn === 'w') ? 'b' : 'w';

    recordPosition();

    // Start timer on first move
    if (!state.clocks.active && state.settings.timeControl.time > 0) {
      startClock();
    }

    // Sounds
    const oppKingInCheck = isKingInCheck(state.turn, state.board);
    if (!isReviewOrSim) {
      if (capturedPiece || isEnPassantCapture) {
        audio.playCapture();
      } else {
        audio.playMove();
      }
      if (oppKingInCheck) {
        audio.playCheck();
      }
    }

    // Check termination
    const nextLegalMoves = getAllLegalMoves(state.turn, state.board, state.castling, state.enPassantSquare);

    if (nextLegalMoves.length === 0) {
      if (oppKingInCheck) {
        const winner = (state.turn === 'w') ? 'b' : 'w';
        triggerGameOver(winner, 'checkmate');
      } else {
        triggerGameOver('draw', 'stalemate');
      }
    } else if (state.halfMoveClock >= 100) {
      triggerGameOver('draw', '50-move');
    } else if (state.positionCounts[generatePositionKey(state.board, state.turn, state.castling, state.enPassantSquare)] >= 3) {
      triggerGameOver('draw', 'repetition');
    } else if (isInsufficientMaterial(state.board)) {
      triggerGameOver('draw', 'insufficient');
    }

    state.selectedSq = null;
    state.legalMovesForSelected = [];
    renderAll();

    // Trigger AI move if applicable
    if (!state.gameOver && state.settings.mode === 'ai' && state.turn !== state.settings.actualPlayerColor) {
      triggerAIMove();
    }

    return true;
  }

  let isPieceAnimating = false;

  function executeMoveWithAnimation(move, skipAnimation = false) {
    if (skipAnimation || state.gameOver) {
      return executeMove(move);
    }

    const fromSqEl = el.chessboard.querySelector(`.square[data-sq="${move.from}"]`);
    const pieceEl = fromSqEl ? fromSqEl.querySelector('.piece') : null;
    const toSqEl = el.chessboard.querySelector(`.square[data-sq="${move.to}"]`);

    if (!pieceEl || !toSqEl) {
      return executeMove(move);
    }

    isPieceAnimating = true;
    const fromRect = pieceEl.getBoundingClientRect();
    const toRect = toSqEl.getBoundingClientRect();
    const dx = toRect.left - fromRect.left;
    const dy = toRect.top - fromRect.top;

    pieceEl.classList.add('moving');
    pieceEl.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      pieceEl.classList.remove('moving');
      pieceEl.style.transform = '';
      isPieceAnimating = false;
      executeMove(move);
    };

    pieceEl.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 210);
  }

  function triggerGameOver(winner, reason) {
    state.gameOver = true;
    stopClock();
    state.gameResult = { winner, reason };

    if (winner !== 'draw') {
      audio.playCheckmate();
    }

    saveGameToArchive(winner, reason);

    setTimeout(() => {
      showGameOverModal(winner, reason);
    }, 600);
  }

  /* ==========================================================================
     10. CLOCK & TIMER
     ========================================================================== */

  function startClock() {
    if (state.settings.timeControl.time <= 0) return;
    state.clocks.active = true;
    clearInterval(state.clocks.intervalId);

    let lastTick = Date.now();
    state.clocks.intervalId = setInterval(() => {
      if (state.gameOver || !state.clocks.active) {
        clearInterval(state.clocks.intervalId);
        return;
      }

      const now = Date.now();
      const deltaSec = (now - lastTick) / 1000;
      lastTick = now;

      state.clocks[state.turn] -= deltaSec;
      if (state.clocks[state.turn] <= 0) {
        state.clocks[state.turn] = 0;
        clearInterval(state.clocks.intervalId);
        const winner = (state.turn === 'w') ? 'b' : 'w';
        triggerGameOver(winner, 'timeout');
      }
      renderClocks();
    }, 100);
  }

  function stopClock() {
    state.clocks.active = false;
    clearInterval(state.clocks.intervalId);
  }

  function formatTime(sec) {
    if (sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const pad = (n) => (n < 10 ? '0' + n : n);
    return `${m}:${pad(s)}`;
  }

  /* ==========================================================================
     11. ARTIFICIAL INTELLIGENCE (MINIMAX WITH ALPHA-BETA)
     ========================================================================== */

  function evaluateBoardForAI(board = state.board) {
    let score = 0;
    let pieceCount = 0;

    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (!p) continue;
      pieceCount++;

      const isWhite = (p.color === 'w');
      const val = AI_PIECE_VALUES[p.type] || 0;
      let pstVal = 0;
      const idx = isWhite ? sq : 63 - sq;

      switch (p.type) {
        case 'p': pstVal = PST_PAWN[idx]; break;
        case 'n': pstVal = PST_KNIGHT[idx]; break;
        case 'b': pstVal = PST_BISHOP[idx]; break;
        case 'r': pstVal = PST_ROOK[idx]; break;
        case 'q': pstVal = PST_QUEEN[idx]; break;
        case 'k': pstVal = (pieceCount < 12) ? PST_KING_END[idx] : PST_KING_MID[idx]; break;
      }

      if (isWhite) {
        score += val + pstVal;
      } else {
        score -= (val + pstVal);
      }
    }

    return score;
  }

  function orderMoves(moves, board) {
    return moves.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      const pA = board[a.to];
      const pB = board[b.to];

      if (pA) {
        scoreA = 10 * (AI_PIECE_VALUES[pA.type] || 0) - (AI_PIECE_VALUES[board[a.from].type] || 0);
      }
      if (pB) {
        scoreB = 10 * (AI_PIECE_VALUES[pB.type] || 0) - (AI_PIECE_VALUES[board[b.from].type] || 0);
      }

      if (a.promotion) scoreA += 800;
      if (b.promotion) scoreB += 800;

      return scoreB - scoreA;
    });
  }

  function minimax(board, depth, alpha, beta, isMaximizing, castling, ep) {
    if (depth === 0) {
      return evaluateBoardForAI(board);
    }

    const color = isMaximizing ? 'w' : 'b';
    const rawMoves = getAllLegalMoves(color, board, castling, ep);

    if (rawMoves.length === 0) {
      if (isKingInCheck(color, board)) {
        return isMaximizing ? -99999 + (4 - depth) : 99999 - (4 - depth);
      }
      return 0;
    }

    const moves = orderMoves(rawMoves, board);

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        const nextBoard = cloneBoard(board);
        nextBoard[m.to] = m.promotion ? { type: m.promotion, color: 'w' } : nextBoard[m.from];
        nextBoard[m.from] = null;
        if (m.isEnPassant) {
          const { r: fromR } = sqToRowCol(m.from);
          const { c: toC } = sqToRowCol(m.to);
          nextBoard[rowColToSq(fromR, toC)] = null;
        }

        const evalScore = minimax(nextBoard, depth - 1, alpha, beta, false, castling, null);
        maxEval = Math.max(maxEval, evalScore);
        alpha = Math.max(alpha, evalScore);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        const nextBoard = cloneBoard(board);
        nextBoard[m.to] = m.promotion ? { type: m.promotion, color: 'b' } : nextBoard[m.from];
        nextBoard[m.from] = null;
        if (m.isEnPassant) {
          const { r: fromR } = sqToRowCol(m.from);
          const { c: toC } = sqToRowCol(m.to);
          nextBoard[rowColToSq(fromR, toC)] = null;
        }

        const evalScore = minimax(nextBoard, depth - 1, alpha, beta, true, castling, null);
        minEval = Math.min(minEval, evalScore);
        beta = Math.min(beta, evalScore);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  function getBestAIMove() {
    const aiColor = state.turn;
    const isMaximizing = (aiColor === 'w');
    const legalMoves = getAllLegalMoves(aiColor, state.board, state.castling, state.enPassantSquare);
    if (legalMoves.length === 0) return null;

    let depth = 3;
    if (state.settings.aiDifficulty === 'easy') {
      depth = 1;
      if (Math.random() < 0.35) {
        return legalMoves[Math.floor(Math.random() * legalMoves.length)];
      }
    } else if (state.settings.aiDifficulty === 'medium') {
      depth = 2;
    } else {
      depth = 3;
    }

    const orderedMoves = orderMoves(legalMoves, state.board);
    let bestMove = orderedMoves[0];
    let bestValue = isMaximizing ? -Infinity : Infinity;

    for (let i = 0; i < orderedMoves.length; i++) {
      const m = orderedMoves[i];
      const nextBoard = cloneBoard(state.board);
      nextBoard[m.to] = m.promotion ? { type: m.promotion, color: aiColor } : nextBoard[m.from];
      nextBoard[m.from] = null;
      if (m.isEnPassant) {
        const { r: fromR } = sqToRowCol(m.from);
        const { c: toC } = sqToRowCol(m.to);
        nextBoard[rowColToSq(fromR, toC)] = null;
      }

      const score = minimax(nextBoard, depth - 1, -Infinity, Infinity, !isMaximizing, state.castling, null);

      if (isMaximizing) {
        if (score > bestValue) {
          bestValue = score;
          bestMove = m;
        }
      } else {
        if (score < bestValue) {
          bestValue = score;
          bestMove = m;
        }
      }
    }

    return bestMove;
  }

  let apexWorker = null;
  let isApexWorkerAvailable = false;
  let activeSearchId = 0;

  function initApexWorker() {
    try {
      if (typeof Worker !== 'undefined') {
        apexWorker = new Worker('apex-engine.js');
        isApexWorkerAvailable = true;

        apexWorker.onerror = function (err) {
          console.warn('Noir Chess: Web Worker fallback triggered', err);
          isApexWorkerAvailable = false;
        };
      }
    } catch (e) {
      console.warn('Noir Chess: Web Worker not supported in this context, using window.NoirApex', e);
      isApexWorkerAvailable = false;
    }
  }

  function stopAISearch() {
    activeSearchId++;
    if (isApexWorkerAvailable && apexWorker) {
      apexWorker.postMessage({ type: 'stop' });
    } else if (window.NoirApex) {
      window.NoirApex.stopSearch();
    }
    if (el.topThinkingTag) {
      el.topThinkingTag.classList.add('hidden');
      el.topThinkingTag.classList.remove('apex');
    }
    if (el.bottomThinkingTag) {
      el.bottomThinkingTag.classList.add('hidden');
      el.bottomThinkingTag.classList.remove('apex');
    }
    renderStatus();
  }

  function triggerAIMove() {
    if (state.gameOver || state.turn === state.settings.actualPlayerColor) return;

    const isFlipped = state.settings.boardFlipped;
    const topColor = isFlipped ? 'w' : 'b';
    const isTopAi = (state.turn === topColor);

    const thinkingTag = isTopAi ? el.topThinkingTag : el.bottomThinkingTag;
    const isApex = (state.settings.aiDifficulty === 'apex');

    if (thinkingTag) {
      if (isApex) {
        thinkingTag.textContent = '⚡ APEX IS CALCULATING…';
        thinkingTag.classList.add('apex');
      } else {
        thinkingTag.textContent = `${state.settings.aiDifficulty.toUpperCase()} THINKING…`;
        thinkingTag.classList.remove('apex');
      }
      thinkingTag.classList.remove('hidden');
    }

    if (el.headerStatusText) {
      el.headerStatusText.textContent = isApex ? 'APEX IS CALCULATING…' : 'COMPUTER IS THINKING…';
    }

    const searchId = ++activeSearchId;
    const currentFen = getBoardFen();
    const searchOptions = {
      difficulty: state.settings.aiDifficulty
    };

    const handleProgress = (progress) => {
      if (searchId !== activeSearchId || state.gameOver) return;
      if (thinkingTag && isApex && progress && progress.depth) {
        const nodeStr = progress.nodes ? progress.nodes.toLocaleString() : '0';
        thinkingTag.textContent = `APEX: D${progress.depth} | ${nodeStr} NODES`;
      }
    };

    const handleSearchResult = (result) => {
      if (searchId !== activeSearchId || state.gameOver || state.turn === state.settings.actualPlayerColor) {
        if (thinkingTag) {
          thinkingTag.classList.add('hidden');
          thinkingTag.classList.remove('apex');
        }
        renderStatus();
        return;
      }

      if (thinkingTag) {
        thinkingTag.classList.add('hidden');
        thinkingTag.classList.remove('apex');
      }
      renderStatus();

      if (result && result.bestMove) {
        const legalMoves = getAllLegalMoves(state.turn, state.board, state.castling, state.enPassantSquare);
        const matched = legalMoves.find(m => 
          m.from === result.bestMove.from && 
          m.to === result.bestMove.to && 
          (m.promotion || null) === (result.bestMove.promotion || null)
        );
        const move = matched || result.bestMove;
        if (move.promotion && !['q', 'r', 'b', 'n'].includes(move.promotion)) {
          move.promotion = 'q';
        }
        executeMoveWithAnimation(move);
      }
    };

    if (isApexWorkerAvailable && apexWorker) {
      const onWorkerMsg = function (e) {
        const data = e.data;
        if (!data) return;

        if (data.type === 'progress') {
          handleProgress(data);
        } else if (data.type === 'bestmove') {
          apexWorker.removeEventListener('message', onWorkerMsg);
          handleSearchResult(data);
        }
      };

      apexWorker.addEventListener('message', onWorkerMsg);
      apexWorker.postMessage({
        type: 'search',
        fen: currentFen,
        options: searchOptions
      });
    } else if (window.NoirApex) {
      window.NoirApex.searchAsync(currentFen, searchOptions, handleProgress)
        .then(handleSearchResult)
        .catch(function (err) {
          console.error('NoirApex search error:', err);
          handleSearchResult({ bestMove: null });
        });
    } else {
      setTimeout(function () {
        const move = getBestAIMove();
        handleSearchResult({ bestMove: move });
      }, 300);
    }
  }

  /* ==========================================================================
     12. UNDO & REDO
     ========================================================================== */

  function undoMove() {
    stopAISearch();
    if (state.undoStack.length === 0 || state.gameOver) return;

    if (state.historyIndex !== state.history.length - 1) {
      jumpToHistoryStep(state.history.length - 1);
    }

    const stepsToUndo = (state.settings.mode === 'ai' && state.undoStack.length >= 2) ? 2 : 1;

    for (let s = 0; s < stepsToUndo; s++) {
      if (state.undoStack.length === 0) break;
      const prev = state.undoStack.pop();

      state.redoStack.push({
        board: cloneBoard(state.board),
        turn: state.turn,
        castling: { ...state.castling },
        enPassantSquare: state.enPassantSquare,
        halfMoveClock: state.halfMoveClock,
        fullMoveNumber: state.fullMoveNumber,
        captured: { w: [...state.captured.w], b: [...state.captured.b] },
        lastMove: state.lastMove ? { ...state.lastMove } : null,
        clocks: { w: state.clocks.w, b: state.clocks.b },
        historyEntry: state.history.pop()
      });

      state.board = prev.board;
      state.turn = prev.turn;
      state.castling = prev.castling;
      state.enPassantSquare = prev.enPassantSquare;
      state.halfMoveClock = prev.halfMoveClock;
      state.fullMoveNumber = prev.fullMoveNumber;
      state.captured = prev.captured;
      state.lastMove = prev.lastMove;
      state.clocks.w = prev.clocks.w;
      state.clocks.b = prev.clocks.b;
    }

    state.historyIndex = state.history.length - 1;
    state.selectedSq = null;
    state.legalMovesForSelected = [];
    renderAll();
    audio.playClick();
  }

  function redoMove() {
    if (state.redoStack.length === 0 || state.gameOver) return;

    const stepsToRedo = (state.settings.mode === 'ai' && state.redoStack.length >= 2) ? 2 : 1;

    for (let s = 0; s < stepsToRedo; s++) {
      if (state.redoStack.length === 0) break;
      const next = state.redoStack.pop();

      state.undoStack.push({
        board: cloneBoard(state.board),
        turn: state.turn,
        castling: { ...state.castling },
        enPassantSquare: state.enPassantSquare,
        halfMoveClock: state.halfMoveClock,
        fullMoveNumber: state.fullMoveNumber,
        captured: { w: [...state.captured.w], b: [...state.captured.b] },
        lastMove: state.lastMove ? { ...state.lastMove } : null,
        clocks: { w: state.clocks.w, b: state.clocks.b },
        historyEntry: next.historyEntry
      });

      state.board = next.board;
      state.turn = next.turn;
      state.castling = next.castling;
      state.enPassantSquare = next.enPassantSquare;
      state.halfMoveClock = next.halfMoveClock;
      state.fullMoveNumber = next.fullMoveNumber;
      state.captured = next.captured;
      state.lastMove = next.lastMove;
      state.clocks.w = next.clocks.w;
      state.clocks.b = next.clocks.b;
      if (next.historyEntry) state.history.push(next.historyEntry);
    }

    state.historyIndex = state.history.length - 1;
    state.selectedSq = null;
    state.legalMovesForSelected = [];
    renderAll();
    audio.playClick();
  }

  /* ==========================================================================
     13. DOM CACHE & RENDERING
     ========================================================================== */

  const el = {};

  function cacheDom() {
    el.headerStatusDot = document.getElementById('header-status-dot');
    el.headerStatusText = document.getElementById('header-status-text');

    el.btnSound = document.getElementById('btn-sound');
    el.soundLabel = document.getElementById('sound-label');
    el.btnTheme = document.getElementById('btn-theme');
    el.currentThemeLabel = document.getElementById('current-theme-label');
    el.btnPastGames = document.getElementById('btn-past-games');
    el.btnShortcuts = document.getElementById('btn-shortcuts');
    el.btnNewGameTop = document.getElementById('btn-new-game-top');

    // Player Strips
    el.topPlayerStrip = document.getElementById('top-player-strip');
    el.topPieceSvg = document.getElementById('top-piece-svg');
    el.topName = document.getElementById('top-name');
    el.topColorTag = document.getElementById('top-color-tag');
    el.topScoreNum = document.getElementById('top-score-num');
    el.topAdvTag = document.getElementById('top-adv-tag');
    el.topCapturedPieces = document.getElementById('top-captured-pieces');
    el.topClock = document.getElementById('top-clock');
    el.topClockDigits = document.getElementById('top-clock-digits');

    el.bottomPlayerStrip = document.getElementById('bottom-player-strip');
    el.bottomPieceSvg = document.getElementById('bottom-piece-svg');
    el.bottomName = document.getElementById('bottom-name');
    el.bottomColorTag = document.getElementById('bottom-color-tag');
    el.bottomScoreNum = document.getElementById('bottom-score-num');
    el.bottomAdvTag = document.getElementById('bottom-adv-tag');
    el.bottomCapturedPieces = document.getElementById('bottom-captured-pieces');
    el.bottomClock = document.getElementById('bottom-clock');
    el.bottomClockDigits = document.getElementById('bottom-clock-digits');

    // Board
    el.chessboard = document.getElementById('chessboard');

    // Sidebar
    el.balanceState = document.getElementById('balance-state');
    el.balanceSub = document.getElementById('balance-sub');
    el.specOpponent = document.getElementById('spec-opponent');
    el.specTimecontrol = document.getElementById('spec-timecontrol');

    el.historyPlyCount = document.getElementById('history-ply-count');
    el.historyScroll = document.getElementById('history-scroll');
    el.historyTable = document.getElementById('history-table');
    el.historyBody = document.getElementById('history-body');
    el.emptyHistoryPlaceholder = document.getElementById('empty-history-placeholder');

    el.btnFirstMove = document.getElementById('btn-first-move');
    el.btnPrevMove = document.getElementById('btn-prev-move');
    el.btnNextMove = document.getElementById('btn-next-move');
    el.btnLastMove = document.getElementById('btn-last-move');

    el.btnUndo = document.getElementById('btn-undo');
    el.btnRedo = document.getElementById('btn-redo');
    el.btnFlip = document.getElementById('btn-flip');
    el.btnDraw = document.getElementById('btn-draw');
    el.btnResign = document.getElementById('btn-resign');
    el.btnNewGamePanel = document.getElementById('btn-new-game-panel');

    // Modals & In-board Popups
    el.modalNewGame = document.getElementById('modal-new-game');
    el.closeModalNewGame = document.getElementById('close-modal-newgame');
    el.btnStartGame = document.getElementById('btn-start-game');

    el.topThinkingTag = document.getElementById('top-thinking-tag');
    el.bottomThinkingTag = document.getElementById('bottom-thinking-tag');

    el.inlinePromotion = document.getElementById('inline-promotion');
    el.inlineSvgQ = document.getElementById('inline-svg-q');
    el.inlineSvgR = document.getElementById('inline-svg-r');
    el.inlineSvgB = document.getElementById('inline-svg-b');
    el.inlineSvgN = document.getElementById('inline-svg-n');

    el.barConfirmDraw = document.getElementById('bar-confirm-draw');
    el.btnDrawCancel = document.getElementById('btn-draw-cancel');
    el.btnDrawConfirm = document.getElementById('btn-draw-confirm');
    el.barConfirmResign = document.getElementById('bar-confirm-resign');
    el.btnResignCancel = document.getElementById('btn-resign-cancel');
    el.btnResignConfirm = document.getElementById('btn-resign-confirm');

    el.modalGameover = document.getElementById('modal-gameover');
    el.gameoverTitle = document.getElementById('gameover-title');
    el.gameoverScore = document.getElementById('gameover-score');
    el.gameoverVerdict = document.getElementById('gameover-verdict');
    el.goMoves = document.getElementById('go-moves');
    el.goCaptures = document.getElementById('go-captures');
    el.goChecks = document.getElementById('go-checks');
    el.goMaterial = document.getElementById('go-material');
    el.btnGoNewgame = document.getElementById('btn-go-newgame');
    el.btnGoReview = document.getElementById('btn-go-review');

    el.modalThemes = document.getElementById('modal-themes');
    el.closeModalThemes = document.getElementById('close-modal-themes');

    el.modalPastGames = document.getElementById('modal-past-games');
    el.closeModalPastGames = document.getElementById('close-modal-pastgames');
    el.pastGamesList = document.getElementById('past-games-list');
    el.emptyArchiveMsg = document.getElementById('empty-archive-msg');
    el.btnClearArchive = document.getElementById('btn-clear-archive');

    el.modalShortcuts = document.getElementById('modal-shortcuts');
    el.closeModalShortcuts = document.getElementById('close-modal-shortcuts');

    el.introScreen = document.getElementById('intro-screen');
    el.heroKingWrapper = document.getElementById('hero-king-wrapper');
    el.introTitles = document.getElementById('intro-titles');
    el.noirApp = document.getElementById('noir-app');
  }

  function getActiveBoardView() {
    if (state.historyIndex === -1) {
      return state.initialBoardSnapshot;
    }
    if (state.historyIndex >= 0 && state.historyIndex < state.history.length) {
      return state.history[state.historyIndex].boardSnapshot;
    }
    return state.board;
  }

  function renderChessboard() {
    el.chessboard.innerHTML = '';
    const isFlipped = state.settings.boardFlipped;
    const currentBoard = getActiveBoardView();
    const kingInCheckSq = isKingInCheck(state.turn, currentBoard) ? findKing(state.turn, currentBoard) : -1;

    for (let rIndex = 0; rIndex < 8; rIndex++) {
      for (let cIndex = 0; cIndex < 8; cIndex++) {
        const r = isFlipped ? 7 - rIndex : rIndex;
        const c = isFlipped ? 7 - cIndex : cIndex;
        const sq = rowColToSq(r, c);
        const isLight = (r + c) % 2 === 0;

        const sqDiv = document.createElement('div');
        sqDiv.className = `square ${isLight ? 'light' : 'dark'}`;
        sqDiv.dataset.sq = sq;

        if (state.selectedSq === sq) {
          sqDiv.classList.add('selected');
        }

        const activeLastMove = (state.historyIndex >= 0 && state.historyIndex < state.history.length)
          ? state.history[state.historyIndex].lastMove
          : state.lastMove;

        if (activeLastMove && (activeLastMove.from === sq || activeLastMove.to === sq)) {
          sqDiv.classList.add(activeLastMove.from === sq ? 'last-move-from' : 'last-move-to');
        }

        if (sq === kingInCheckSq) {
          sqDiv.classList.add('in-check');
        }

        const showRank = isFlipped ? (cIndex === 7) : (cIndex === 0);
        const showFile = isFlipped ? (rIndex === 0) : (rIndex === 7);

        if (showRank) {
          const rankSpan = document.createElement('span');
          rankSpan.className = 'coord-label coord-rank';
          rankSpan.textContent = 8 - r;
          sqDiv.appendChild(rankSpan);
        }
        if (showFile) {
          const fileSpan = document.createElement('span');
          fileSpan.className = 'coord-label coord-file';
          fileSpan.textContent = String.fromCharCode(97 + c);
          sqDiv.appendChild(fileSpan);
        }

        const piece = currentBoard[sq];
        if (piece) {
          const pieceDiv = document.createElement('div');
          pieceDiv.className = 'piece';
          pieceDiv.dataset.sq = sq;
          pieceDiv.setAttribute('draggable', 'false');

          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('class', 'piece-svg');
          svg.setAttribute('viewBox', '0 0 45 45');
          const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
          use.setAttribute('href', `#piece-${piece.color}-${piece.type}`);
          use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `#piece-${piece.color}-${piece.type}`);
          svg.appendChild(use);
          pieceDiv.appendChild(svg);

          sqDiv.appendChild(pieceDiv);
        }

        if (state.historyIndex === state.history.length - 1) {
          const legalMove = state.legalMovesForSelected.find(m => m.to === sq);
          if (legalMove) {
            if (piece || legalMove.isEnPassant) {
              const ring = document.createElement('div');
              ring.className = 'legal-capture-ring';
              sqDiv.appendChild(ring);
            } else {
              const dot = document.createElement('div');
              dot.className = 'legal-dot';
              sqDiv.appendChild(dot);
            }
          }
        }

        el.chessboard.appendChild(sqDiv);
      }
    }
  }

  function renderStatus() {
    const oppKingCheck = isKingInCheck(state.turn, state.board);
    el.headerStatusDot.className = `status-indicator-dot ${state.turn === 'b' ? 'black' : ''} ${oppKingCheck ? 'check' : ''}`;

    if (state.historyIndex !== state.history.length - 1) {
      el.headerStatusText.textContent = `REVIEWING PLY ${state.historyIndex + 1} / ${state.history.length}`;
      return;
    }

    if (state.gameOver) {
      if (state.gameResult.winner === 'draw') {
        el.headerStatusText.textContent = `DRAW — ${state.gameResult.reason.toUpperCase()}`;
      } else {
        const winColor = (state.gameResult.winner === 'w') ? 'WHITE' : 'BLACK';
        el.headerStatusText.textContent = `CHECKMATE — ${winColor} WINS`;
      }
    } else {
      if (oppKingCheck) {
        el.headerStatusText.textContent = 'KING CHECK';
      } else {
        el.headerStatusText.textContent = (state.turn === 'w') ? 'WHITE TO MOVE' : 'BLACK TO MOVE';
      }
    }
  }

  function renderPlayerStrips() {
    const isFlipped = state.settings.boardFlipped;
    const isAi = state.settings.mode === 'ai';

    const topColor = isFlipped ? 'w' : 'b';
    const bottomColor = isFlipped ? 'b' : 'w';

    // Active turn border
    if (state.turn === topColor && !state.gameOver) {
      el.topPlayerStrip.classList.add('active-turn');
      el.bottomPlayerStrip.classList.remove('active-turn');
    } else if (state.turn === bottomColor && !state.gameOver) {
      el.bottomPlayerStrip.classList.add('active-turn');
      el.topPlayerStrip.classList.remove('active-turn');
    } else {
      el.topPlayerStrip.classList.remove('active-turn');
      el.bottomPlayerStrip.classList.remove('active-turn');
    }

    // Piece Pill SVGs
    el.topPieceSvg.setAttribute('href', `#piece-${topColor}-k`);
    el.topPieceSvg.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `#piece-${topColor}-k`);
    el.bottomPieceSvg.setAttribute('href', `#piece-${bottomColor}-k`);
    el.bottomPieceSvg.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `#piece-${bottomColor}-k`);

    // Names
    if (isAi) {
      const humanColor = state.settings.actualPlayerColor;
      if (topColor === humanColor) {
        el.topName.textContent = 'YOU';
        el.bottomName.textContent = 'COMPUTER';
      } else {
        el.topName.textContent = 'COMPUTER';
        el.bottomName.textContent = 'YOU';
      }
    } else {
      el.topName.textContent = topColor === 'w' ? 'PLAYER 1' : 'PLAYER 2';
      el.bottomName.textContent = bottomColor === 'w' ? 'PLAYER 1' : 'PLAYER 2';
    }

    el.topColorTag.textContent = topColor === 'w' ? 'WHITE' : 'BLACK';
    el.bottomColorTag.textContent = bottomColor === 'w' ? 'WHITE' : 'BLACK';

    // Real dynamic material calculation
    const currentBoard = getActiveBoardView();
    const { whiteMaterial, blackMaterial, diff } = calculateMaterialScores(currentBoard);

    const topScore = topColor === 'w' ? whiteMaterial : blackMaterial;
    const bottomScore = bottomColor === 'w' ? whiteMaterial : blackMaterial;

    el.topScoreNum.textContent = topScore;
    el.bottomScoreNum.textContent = bottomScore;

    // Advantage badges in player strips
    if (diff > 0) {
      // White is ahead
      if (topColor === 'w') {
        el.topAdvTag.textContent = `+${diff}`;
        el.topAdvTag.classList.remove('hidden');
        el.bottomAdvTag.classList.add('hidden');
      } else {
        el.bottomAdvTag.textContent = `+${diff}`;
        el.bottomAdvTag.classList.remove('hidden');
        el.topAdvTag.classList.add('hidden');
      }
    } else if (diff < 0) {
      // Black is ahead
      const absDiff = Math.abs(diff);
      if (topColor === 'b') {
        el.topAdvTag.textContent = `+${absDiff}`;
        el.topAdvTag.classList.remove('hidden');
        el.bottomAdvTag.classList.add('hidden');
      } else {
        el.bottomAdvTag.textContent = `+${absDiff}`;
        el.bottomAdvTag.classList.remove('hidden');
        el.topAdvTag.classList.add('hidden');
      }
    } else {
      el.topAdvTag.classList.add('hidden');
      el.bottomAdvTag.classList.add('hidden');
    }

    // Render Captured pieces
    renderCapturedGlyphs(topColor, el.topCapturedPieces);
    renderCapturedGlyphs(bottomColor, el.bottomCapturedPieces);

    // Sidebar Material Display
    if (diff > 0) {
      el.balanceState.textContent = `WHITE +${diff}`;
    } else if (diff < 0) {
      el.balanceState.textContent = `BLACK +${Math.abs(diff)}`;
    } else {
      el.balanceState.textContent = 'MATERIAL EQUAL';
    }
    el.balanceSub.textContent = `White: ${whiteMaterial}  •  Black: ${blackMaterial}`;
  }

  function renderCapturedGlyphs(color, containerEl) {
    containerEl.innerHTML = '';
    const capturedList = (state.historyIndex >= 0 && state.historyIndex < state.history.length)
      ? state.history[state.historyIndex].capturedSnapshot[color]
      : state.captured[color];

    // Pieces captured BY White are Black pieces; Pieces captured BY Black are White pieces
    const glyphs = {
      p: color === 'w' ? '♟' : '♙',
      n: color === 'w' ? '♞' : '♘',
      b: color === 'w' ? '♝' : '♗',
      r: color === 'w' ? '♜' : '♖',
      q: color === 'w' ? '♛' : '♕'
    };

    const order = ['p', 'n', 'b', 'r', 'q'];
    const sorted = [...capturedList].sort((a, b) => order.indexOf(a) - order.indexOf(b));

    sorted.forEach(t => {
      const span = document.createElement('span');
      span.className = 'captured-glyph';
      span.textContent = glyphs[t] || '';
      containerEl.appendChild(span);
    });
  }

  function renderClocks() {
    const isFlipped = state.settings.boardFlipped;
    const topColor = isFlipped ? 'w' : 'b';
    const bottomColor = isFlipped ? 'b' : 'w';

    if (state.settings.timeControl.time <= 0) {
      el.topClockDigits.textContent = '∞';
      el.bottomClockDigits.textContent = '∞';
      el.topClock.classList.remove('low-time');
      el.bottomClock.classList.remove('low-time');
      return;
    }

    el.topClockDigits.textContent = formatTime(state.clocks[topColor]);
    el.bottomClockDigits.textContent = formatTime(state.clocks[bottomColor]);

    if (state.clocks[topColor] < 20 && state.clocks.active) {
      el.topClock.classList.add('low-time');
    } else {
      el.topClock.classList.remove('low-time');
    }

    if (state.clocks[bottomColor] < 20 && state.clocks.active) {
      el.bottomClock.classList.add('low-time');
    } else {
      el.bottomClock.classList.remove('low-time');
    }
  }

  function renderHistory() {
    el.historyBody.innerHTML = '';
    const plyCount = state.history.length;
    el.historyPlyCount.textContent = `${plyCount} ${plyCount === 1 ? 'PLY' : 'PLIES'}`;

    if (plyCount === 0) {
      el.emptyHistoryPlaceholder.classList.remove('hidden');
      el.historyTable.classList.add('hidden');
      return;
    }

    el.emptyHistoryPlaceholder.classList.add('hidden');
    el.historyTable.classList.remove('hidden');

    for (let i = 0; i < state.history.length; i += 2) {
      const turnNum = Math.floor(i / 2) + 1;
      const whiteMove = state.history[i];
      const blackMove = state.history[i + 1];

      const tr = document.createElement('tr');

      const tdNum = document.createElement('td');
      tdNum.className = 'td-num';
      tdNum.textContent = `${turnNum}.`;
      tr.appendChild(tdNum);

      const tdW = document.createElement('td');
      tdW.className = `td-move ${state.historyIndex === i ? 'active-step' : ''}`;
      tdW.textContent = whiteMove.san;
      tdW.dataset.step = i;
      tr.appendChild(tdW);

      const tdB = document.createElement('td');
      tdB.className = `td-move ${blackMove && state.historyIndex === i + 1 ? 'active-step' : ''}`;
      tdB.textContent = blackMove ? blackMove.san : '';
      if (blackMove) tdB.dataset.step = i + 1;
      tr.appendChild(tdB);

      el.historyBody.appendChild(tr);
    }

    if (state.historyIndex === state.history.length - 1) {
      el.historyScroll.scrollTop = el.historyScroll.scrollHeight;
    }
  }

  function renderMatchSpecs() {
    if (state.settings.mode === 'ai') {
      const diffKey = state.settings.aiDifficulty;
      const diffStr = (diffKey === 'apex') ? '⚡ APEX' : diffKey.toUpperCase();
      el.specOpponent.textContent = `VS COMPUTER (${diffStr})`;
    } else {
      el.specOpponent.textContent = 'VS LOCAL PLAYER';
    }

    const tc = state.settings.timeControl;
    if (tc.time <= 0) {
      el.specTimecontrol.textContent = 'UNTIMED';
    } else {
      el.specTimecontrol.textContent = `${Math.floor(tc.time / 60)} + ${tc.inc} RAPID`;
    }
  }

  function renderAll() {
    renderChessboard();
    renderStatus();
    renderPlayerStrips();
    renderClocks();
    renderHistory();
    renderMatchSpecs();
  }

  /* ==========================================================================
     14. INTERACTIVE MOVEMENT & PROMOTION
     ========================================================================== */

  function handleSquareClick(sq) {
    if (state.gameOver || isPieceAnimating) return;

    if (state.historyIndex !== state.history.length - 1) {
      jumpToHistoryStep(state.history.length - 1);
    }

    if (state.settings.mode === 'ai' && state.turn !== state.settings.actualPlayerColor) {
      return;
    }

    // Hide inline promotion if user clicks elsewhere
    if (el.inlinePromotion && !el.inlinePromotion.classList.contains('hidden')) {
      el.inlinePromotion.classList.add('hidden');
    }

    const chosenMove = state.legalMovesForSelected.find(m => m.to === sq);
    if (chosenMove) {
      if (chosenMove.promotion) {
        showInlinePromotion(chosenMove);
        return;
      }
      executeMoveWithAnimation(chosenMove);
      return;
    }

    const clickedPiece = state.board[sq];
    if (clickedPiece && clickedPiece.color === state.turn) {
      if (state.selectedSq === sq) {
        state.selectedSq = null;
        state.legalMovesForSelected = [];
      } else {
        state.selectedSq = sq;
        state.legalMovesForSelected = getLegalMovesForSquare(sq, state.board, state.castling, state.enPassantSquare);
        audio.playClick();
      }
      renderAll();
      return;
    }

    if (state.selectedSq !== null) {
      state.selectedSq = null;
      state.legalMovesForSelected = [];
      renderAll();
    }
  }

  function showInlinePromotion(move) {
    state.pendingPromotionMove = move;
    const promoColor = state.board[move.from].color;

    if (el.inlineSvgQ) el.inlineSvgQ.setAttribute('href', `#piece-${promoColor}-q`);
    if (el.inlineSvgR) el.inlineSvgR.setAttribute('href', `#piece-${promoColor}-r`);
    if (el.inlineSvgB) el.inlineSvgB.setAttribute('href', `#piece-${promoColor}-b`);
    if (el.inlineSvgN) el.inlineSvgN.setAttribute('href', `#piece-${promoColor}-n`);

    const { r, c } = sqToRowCol(move.to);
    const isFlipped = state.settings.boardFlipped;
    const colOnScreen = isFlipped ? (7 - c) : c;
    const rowOnScreen = isFlipped ? (7 - r) : r;

    el.inlinePromotion.style.left = `${colOnScreen * 12.5}%`;
    if (rowOnScreen === 0) {
      el.inlinePromotion.style.top = '0';
      el.inlinePromotion.style.bottom = 'auto';
    } else {
      el.inlinePromotion.style.bottom = '0';
      el.inlinePromotion.style.top = 'auto';
    }

    el.inlinePromotion.classList.remove('hidden');
  }

  function handleInlinePromotionChoice(promoType) {
    if (!el.inlinePromotion) return;
    el.inlinePromotion.classList.add('hidden');
    if (!state.pendingPromotionMove) return;

    const move = { ...state.pendingPromotionMove, promotion: promoType };
    state.pendingPromotionMove = null;
    executeMoveWithAnimation(move);
  }

  /* ==========================================================================
     15. POINTER INTERACTIONS & DRAG-AND-DROP (TOUCH & MOUSE)
     ========================================================================== */

  let pointerDrag = {
    active: false,
    pointerId: null,
    sq: null,
    startX: 0,
    startY: 0,
    pieceEl: null,
    hasMoved: false
  };

  function initInteractions() {
    // Inline promotion choice buttons
    if (el.inlinePromotion) {
      el.inlinePromotion.querySelectorAll('.inline-promo-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleInlinePromotionChoice(btn.dataset.promo);
        });
      });
    }

    el.chessboard.addEventListener('pointerdown', (e) => {
      if (state.gameOver || isPieceAnimating) return;
      if (state.settings.mode === 'ai' && state.turn !== state.settings.actualPlayerColor) return;
      if (e.button !== undefined && e.button !== 0) return; // Only primary click / touch

      // If promotion popup is open and clicked, let button handle it
      if (e.target.closest('#inline-promotion')) return;

      if (el.inlinePromotion && !el.inlinePromotion.classList.contains('hidden')) {
        el.inlinePromotion.classList.add('hidden');
      }

      const sqEl = e.target.closest('.square');
      if (!sqEl) return;
      const sq = parseInt(sqEl.dataset.sq, 10);

      // If a destination square is clicked that belongs to legal moves
      const chosenMove = state.legalMovesForSelected.find(m => m.to === sq);
      if (chosenMove) {
        if (chosenMove.promotion) {
          showInlinePromotion(chosenMove);
        } else {
          executeMoveWithAnimation(chosenMove);
        }
        return;
      }

      const piece = state.board[sq];
      if (!piece || piece.color !== state.turn) {
        if (state.selectedSq !== null) {
          state.selectedSq = null;
          state.legalMovesForSelected = [];
          renderAll();
        }
        return;
      }

      if (state.historyIndex !== state.history.length - 1) {
        jumpToHistoryStep(state.history.length - 1);
      }

      // Begin potential drag or selection
      pointerDrag.active = true;
      pointerDrag.pointerId = e.pointerId;
      pointerDrag.sq = sq;
      pointerDrag.startX = e.clientX;
      pointerDrag.startY = e.clientY;
      pointerDrag.hasMoved = false;

      state.selectedSq = sq;
      state.legalMovesForSelected = getLegalMovesForSquare(sq, state.board, state.castling, state.enPassantSquare);
      renderAll();

      const freshSqEl = el.chessboard.querySelector(`.square[data-sq="${sq}"]`);
      pointerDrag.pieceEl = freshSqEl ? freshSqEl.querySelector('.piece') : null;

      if (pointerDrag.pieceEl) {
        try {
          pointerDrag.pieceEl.setPointerCapture(e.pointerId);
        } catch {}
      }
    });

    el.chessboard.addEventListener('pointermove', (e) => {
      if (!pointerDrag.active || e.pointerId !== pointerDrag.pointerId) return;

      const dx = e.clientX - pointerDrag.startX;
      const dy = e.clientY - pointerDrag.startY;

      if (!pointerDrag.hasMoved && Math.hypot(dx, dy) > 5) {
        pointerDrag.hasMoved = true;
        if (pointerDrag.pieceEl) {
          pointerDrag.pieceEl.classList.add('dragging');
        }
      }

      if (pointerDrag.hasMoved && pointerDrag.pieceEl) {
        pointerDrag.pieceEl.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      }
    });

    const finishPointer = (e) => {
      if (!pointerDrag.active || e.pointerId !== pointerDrag.pointerId) return;

      const { pieceEl, hasMoved } = pointerDrag;
      pointerDrag.active = false;
      pointerDrag.pointerId = null;

      if (pieceEl) {
        try {
          pieceEl.releasePointerCapture(e.pointerId);
        } catch {}
        pieceEl.classList.remove('dragging');
        pieceEl.style.transform = '';
      }

      if (hasMoved) {
        // Find square dropped on
        const elemBelow = document.elementFromPoint(e.clientX, e.clientY);
        const targetSqEl = elemBelow ? elemBelow.closest('.square') : null;

        if (targetSqEl) {
          const targetSq = parseInt(targetSqEl.dataset.sq, 10);
          const chosenMove = state.legalMovesForSelected.find(m => m.to === targetSq);

          if (chosenMove) {
            if (chosenMove.promotion) {
              showInlinePromotion(chosenMove);
            } else {
              // Direct drop: execute immediately
              executeMove(chosenMove);
            }
            return;
          }
        }

        renderAll();
      } else {
        audio.playClick();
      }
    };

    el.chessboard.addEventListener('pointerup', finishPointer);
    el.chessboard.addEventListener('pointercancel', finishPointer);
  }

  /* ==========================================================================
     16. GAME OVER & ARCHIVE
     ========================================================================== */

  function showGameOverModal(winner, reason) {
    el.gameoverTitle.textContent = (reason === 'checkmate') ? 'CHECKMATE' : reason.toUpperCase();

    if (winner === 'draw') {
      el.gameoverVerdict.textContent = 'MATCH ENDED IN A DRAW';
      el.gameoverScore.textContent = '½ — ½';
    } else {
      const winStr = (winner === 'w') ? 'WHITE' : 'BLACK';
      el.gameoverVerdict.textContent = `${winStr} IS VICTORIOUS`;
      el.gameoverScore.textContent = (winner === 'w') ? '1 — 0' : '0 — 1';
    }

    el.goMoves.textContent = state.fullMoveNumber;
    el.goCaptures.textContent = state.captured.w.length + state.captured.b.length;

    const checksCount = state.history.filter(h => h.san.includes('+') || h.san.includes('#')).length;
    el.goChecks.textContent = checksCount;

    const { whiteMaterial, blackMaterial, diff } = calculateMaterialScores(state.board);
    if (diff > 0) el.goMaterial.textContent = `+${diff} WHITE`;
    else if (diff < 0) el.goMaterial.textContent = `+${Math.abs(diff)} BLACK`;
    else el.goMaterial.textContent = 'EQUAL';

    el.modalGameover.classList.add('open');
  }

  const STORAGE_KEY_PAST_GAMES = 'noir_chess_past_games';
  const STORAGE_KEY_PREFS = 'noir_chess_preferences';

  function saveGameToArchive(winner, reason) {
    const archive = getPastGamesArchive();
    const gameRecord = {
      id: Date.now(),
      date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      mode: state.settings.mode === 'ai' ? `AI (${state.settings.aiDifficulty})` : 'Local PvP',
      winner,
      reason,
      moves: state.fullMoveNumber,
      pgn: state.history.map(h => h.san).join(' ')
    };

    archive.unshift(gameRecord);
    if (archive.length > 50) archive.pop();
    try {
      localStorage.setItem(STORAGE_KEY_PAST_GAMES, JSON.stringify(archive));
    } catch {}
  }

  function getPastGamesArchive() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PAST_GAMES);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function renderPastGamesList() {
    const archive = getPastGamesArchive();
    el.pastGamesList.innerHTML = '';

    if (archive.length === 0) {
      el.emptyArchiveMsg.classList.remove('hidden');
      el.btnClearArchive.classList.add('hidden');
      return;
    }

    el.emptyArchiveMsg.classList.add('hidden');
    el.btnClearArchive.classList.remove('hidden');

    archive.forEach(record => {
      const row = document.createElement('div');
      row.className = 'archive-row';

      const info = document.createElement('div');
      info.textContent = `${record.date} • ${record.mode} • ${record.moves} moves (${record.reason})`;

      const score = document.createElement('strong');
      score.textContent = record.winner === 'draw' ? '½-½' : (record.winner === 'w' ? '1-0' : '0-1');

      row.appendChild(info);
      row.appendChild(score);
      el.pastGamesList.appendChild(row);
    });
  }

  /* ==========================================================================
     17. PREFERENCES & LOCALSTORAGE
     ========================================================================== */

  function savePreferences() {
    const prefs = {
      theme: state.settings.theme,
      soundEnabled: state.settings.soundEnabled,
      boardFlipped: state.settings.boardFlipped,
      aiDifficulty: state.settings.aiDifficulty,
      timeControl: state.settings.timeControl
    };
    try {
      localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(prefs));
    } catch {}
  }

  function loadPreferences() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PREFS);
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (prefs.theme) applyTheme(prefs.theme);
      if (typeof prefs.soundEnabled === 'boolean') {
        state.settings.soundEnabled = prefs.soundEnabled;
        updateSoundLabel();
      }
      if (typeof prefs.boardFlipped === 'boolean') state.settings.boardFlipped = prefs.boardFlipped;
      if (prefs.aiDifficulty) {
        state.settings.aiDifficulty = prefs.aiDifficulty;
        tempSetup.difficulty = prefs.aiDifficulty;
        const diffBtns = document.querySelectorAll('#select-difficulty .seg-btn');
        diffBtns.forEach(b => {
          b.classList.toggle('active', b.dataset.val === prefs.aiDifficulty);
        });
      }
      if (prefs.timeControl) state.settings.timeControl = prefs.timeControl;
    } catch {}
  }

  function applyTheme(themeName) {
    state.settings.theme = themeName;
    document.body.setAttribute('data-theme', themeName);
    el.currentThemeLabel.textContent = `THEME: ${themeName.toUpperCase()}`;

    document.querySelectorAll('.theme-row-btn').forEach(card => {
      card.classList.toggle('active', card.dataset.themeVal === themeName);
    });
    savePreferences();
    renderChessboard();
  }

  function updateSoundLabel() {
    el.soundLabel.textContent = state.settings.soundEnabled ? 'SOUND: ON' : 'SOUND: OFF';
  }

  /* ==========================================================================
     18. NEW GAME SETUP FLOW
     ========================================================================== */

  let tempSetup = {
    opponent: 'ai',
    difficulty: 'apex',
    side: 'white',
    time: 600,
    inc: 0
  };

  function initNewGameModalListeners() {
    const oppBtns = document.querySelectorAll('#select-opponent .seg-btn');
    oppBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        oppBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tempSetup.opponent = btn.dataset.val;

        const diffGroup = document.getElementById('difficulty-group');
        diffGroup.style.display = (tempSetup.opponent === 'ai') ? 'flex' : 'none';
        audio.playClick();
      });
    });

    const diffBtns = document.querySelectorAll('#select-difficulty .seg-btn');
    diffBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        diffBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tempSetup.difficulty = btn.dataset.val;
        audio.playClick();
      });
    });

    const sideBtns = document.querySelectorAll('#select-side .seg-btn');
    sideBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        sideBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tempSetup.side = btn.dataset.val;
        audio.playClick();
      });
    });

    const tcBtns = document.querySelectorAll('#select-time-control .seg-btn');
    tcBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tcBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tempSetup.time = parseInt(btn.dataset.time, 10);
        tempSetup.inc = parseInt(btn.dataset.inc, 10);
        audio.playClick();
      });
    });

    el.btnStartGame.addEventListener('click', () => {
      startNewMatchFromSetup();
    });
  }

  function startNewMatchFromSetup() {
    stopAISearch();
    el.modalNewGame.classList.remove('open');
    el.modalGameover.classList.remove('open');

    if (el.barConfirmDraw) el.barConfirmDraw.classList.add('hidden');
    if (el.barConfirmResign) el.barConfirmResign.classList.add('hidden');
    if (el.inlinePromotion) el.inlinePromotion.classList.add('hidden');
    if (el.topThinkingTag) el.topThinkingTag.classList.add('hidden');
    if (el.bottomThinkingTag) el.bottomThinkingTag.classList.add('hidden');

    state.settings.mode = tempSetup.opponent;
    state.settings.aiDifficulty = tempSetup.difficulty;
    state.settings.playerColor = tempSetup.side;
    state.settings.timeControl = { time: tempSetup.time, inc: tempSetup.inc };

    if (tempSetup.side === 'random') {
      state.settings.actualPlayerColor = Math.random() < 0.5 ? 'w' : 'b';
    } else {
      state.settings.actualPlayerColor = (tempSetup.side === 'black') ? 'b' : 'w';
    }

    state.settings.boardFlipped = (state.settings.actualPlayerColor === 'b');

    state.clocks.w = tempSetup.time;
    state.clocks.b = tempSetup.time;
    state.clocks.active = false;
    stopClock();

    state.gameOver = false;
    state.gameResult = null;

    initBoardFromFen(STARTING_FEN);
    savePreferences();
    renderAll();
    audio.playClick();

    if (state.settings.mode === 'ai' && state.settings.actualPlayerColor === 'b') {
      triggerAIMove();
    }
  }

  /* ==========================================================================
     19. ENTRY ANIMATION
     ========================================================================== */

  function runIntroSequence() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function finishIntro() {
      if (!el.introScreen) return;
      el.introScreen.classList.add('fade-out');
      el.noirApp.classList.add('app-revealed');

      setTimeout(() => {
        if (el.introScreen && el.introScreen.parentNode) {
          el.introScreen.style.display = 'none';
        }
      }, 800);
    }

    el.introScreen.addEventListener('click', finishIntro);
    window.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        finishIntro();
        window.removeEventListener('keydown', escHandler);
      }
    });

    if (prefersReducedMotion) {
      setTimeout(finishIntro, 800);
      return;
    }

    setTimeout(() => {
      el.heroKingWrapper.classList.add('emerge');
      el.introTitles.classList.add('visible');

      setTimeout(() => {
        el.heroKingWrapper.classList.remove('emerge');
        el.heroKingWrapper.classList.add('presence');

        setTimeout(() => {
          el.heroKingWrapper.classList.remove('presence');
          el.heroKingWrapper.classList.add('exit');
          el.introTitles.classList.add('exit');

          setTimeout(() => {
            finishIntro();
          }, 800);
        }, 850);
      }, 1000);
    }, 400);
  }

  /* ==========================================================================
     20. EVENT LISTENERS
     ========================================================================== */

  function initEventListeners() {
    el.btnFlip.addEventListener('click', () => {
      state.settings.boardFlipped = !state.settings.boardFlipped;
      savePreferences();
      renderAll();
      audio.playClick();
    });

    el.btnUndo.addEventListener('click', undoMove);
    el.btnRedo.addEventListener('click', redoMove);

    // Inline confirmation popover for Draw
    el.btnDraw.addEventListener('click', () => {
      if (state.gameOver) return;
      if (el.barConfirmResign) el.barConfirmResign.classList.add('hidden');
      if (el.barConfirmDraw) el.barConfirmDraw.classList.toggle('hidden');
      audio.playClick();
    });

    if (el.btnDrawCancel) {
      el.btnDrawCancel.addEventListener('click', () => {
        if (el.barConfirmDraw) el.barConfirmDraw.classList.add('hidden');
        audio.playClick();
      });
    }

    if (el.btnDrawConfirm) {
      el.btnDrawConfirm.addEventListener('click', () => {
        if (el.barConfirmDraw) el.barConfirmDraw.classList.add('hidden');
        triggerGameOver('draw', 'agreement');
      });
    }

    // Inline confirmation popover for Resign
    el.btnResign.addEventListener('click', () => {
      if (state.gameOver) return;
      if (el.barConfirmDraw) el.barConfirmDraw.classList.add('hidden');
      if (el.barConfirmResign) el.barConfirmResign.classList.toggle('hidden');
      audio.playClick();
    });

    if (el.btnResignCancel) {
      el.btnResignCancel.addEventListener('click', () => {
        if (el.barConfirmResign) el.barConfirmResign.classList.add('hidden');
        audio.playClick();
      });
    }

    if (el.btnResignConfirm) {
      el.btnResignConfirm.addEventListener('click', () => {
        if (el.barConfirmResign) el.barConfirmResign.classList.add('hidden');
        const winner = (state.turn === 'w') ? 'b' : 'w';
        triggerGameOver(winner, 'resignation');
      });
    }

    el.btnNewGameTop.addEventListener('click', () => {
      el.modalNewGame.classList.add('open');
      audio.playClick();
    });
    el.btnNewGamePanel.addEventListener('click', () => {
      el.modalNewGame.classList.add('open');
      audio.playClick();
    });
    el.closeModalNewGame.addEventListener('click', () => {
      el.modalNewGame.classList.remove('open');
    });

    el.btnGoNewgame.addEventListener('click', () => {
      el.modalGameover.classList.remove('open');
      el.modalNewGame.classList.add('open');
    });
    el.btnGoReview.addEventListener('click', () => {
      el.modalGameover.classList.remove('open');
    });

    el.btnTheme.addEventListener('click', () => {
      el.modalThemes.classList.add('open');
      audio.playClick();
    });
    el.closeModalThemes.addEventListener('click', () => {
      el.modalThemes.classList.remove('open');
    });
    document.querySelectorAll('.theme-row-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        applyTheme(btn.dataset.themeVal);
        el.modalThemes.classList.remove('open');
        audio.playClick();
      });
    });

    el.btnSound.addEventListener('click', () => {
      state.settings.soundEnabled = !state.settings.soundEnabled;
      updateSoundLabel();
      savePreferences();
      audio.playClick();
    });

    el.btnPastGames.addEventListener('click', () => {
      renderPastGamesList();
      el.modalPastGames.classList.add('open');
      audio.playClick();
    });
    el.closeModalPastGames.addEventListener('click', () => {
      el.modalPastGames.classList.remove('open');
    });
    el.btnClearArchive.addEventListener('click', () => {
      if (confirm('Clear match records?')) {
        localStorage.removeItem(STORAGE_KEY_PAST_GAMES);
        renderPastGamesList();
      }
    });

    el.btnShortcuts.addEventListener('click', () => {
      el.modalShortcuts.classList.add('open');
      audio.playClick();
    });
    el.closeModalShortcuts.addEventListener('click', () => {
      el.modalShortcuts.classList.remove('open');
    });

    el.historyTable.addEventListener('click', (e) => {
      const td = e.target.closest('.td-move');
      if (!td || td.dataset.step === undefined) return;
      const step = parseInt(td.dataset.step, 10);
      jumpToHistoryStep(step);
    });

    el.btnFirstMove.addEventListener('click', () => jumpToHistoryStep(-1));
    el.btnPrevMove.addEventListener('click', () => jumpToHistoryStep(state.historyIndex - 1));
    el.btnNextMove.addEventListener('click', () => jumpToHistoryStep(state.historyIndex + 1));
    el.btnLastMove.addEventListener('click', () => jumpToHistoryStep(state.history.length - 1));

    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      switch (e.key.toLowerCase()) {
        case 'n':
          el.modalNewGame.classList.add('open');
          audio.playClick();
          break;
        case 'f':
          state.settings.boardFlipped = !state.settings.boardFlipped;
          savePreferences();
          renderAll();
          audio.playClick();
          break;
        case 'u':
          undoMove();
          break;
        case 'r':
          redoMove();
          break;
        case 'm':
          state.settings.soundEnabled = !state.settings.soundEnabled;
          updateSoundLabel();
          savePreferences();
          audio.playClick();
          break;
        case 'arrowleft':
          jumpToHistoryStep(state.historyIndex - 1);
          break;
        case 'arrowright':
          jumpToHistoryStep(state.historyIndex + 1);
          break;
        case 'escape':
          document.querySelectorAll('.modal-scrim.open').forEach(m => m.classList.remove('open'));
          if (el.inlinePromotion) el.inlinePromotion.classList.add('hidden');
          if (el.barConfirmDraw) el.barConfirmDraw.classList.add('hidden');
          if (el.barConfirmResign) el.barConfirmResign.classList.add('hidden');
          break;
      }
    });

    document.querySelectorAll('.modal-scrim').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('open');
        }
      });
    });
  }

  function jumpToHistoryStep(targetIndex) {
    if (targetIndex < -1 || targetIndex >= state.history.length) return;
    state.historyIndex = targetIndex;
    state.selectedSq = null;
    state.legalMovesForSelected = [];
    renderAll();
    audio.playClick();
  }

  /* ==========================================================================
     21. APPLICATION ENTRY POINT
     ========================================================================== */

  function bootstrap() {
    cacheDom();
    loadPreferences();
    initApexWorker();
    initBoardFromFen(STARTING_FEN);
    initInteractions();
    initNewGameModalListeners();
    initEventListeners();
    renderAll();
    runIntroSequence();

    // Developer benchmark suite runner
    window.NoirApexBenchmark = function () {
      console.log('⚡ NOIR CHESS — APEX ENGINE BENCHMARK SUITE RUNNING…');
      if (window.NoirApex) {
        const res = window.NoirApex.runBenchmark();
        console.table(res.results);
        console.log(`Total Nodes: ${res.totalNodes.toLocaleString()} | Total Time: ${res.totalTime}ms | Overall NPS: ${res.overallNps.toLocaleString()}`);
        return res;
      } else {
        console.warn('NoirApex engine module not loaded.');
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})();
