# ♟️  CHESS & THE APEX ENGINE

> **A cinematic, luxury editorial chess experience powered by the high-performance, browser-native APEX grandmaster engine.**

[![Pure JavaScript](https://img.shields.io/badge/Language-Vanilla%20JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)](#)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero%20(Pure%20Native)-2ea44f?style=flat)](#)
[![Web Worker Engine](https://img.shields.io/badge/AI%20Engine-Web%20Worker%20Threaded-c5a059?style=flat)](#)
[![Responsive & Mobile Ready](https://img.shields.io/badge/Design-Responsive%20%26%20Touch-blueviolet?style=flat)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-lightgrey?style=flat)](#)


https://chess-beta-rust.vercel.app/



## 🌟 Executive Summary

**NOIR CHESS** is a meticulously crafted web chess platform engineered from the ground up to merge **haute-horlogerie / editorial visual aesthetics** with a **genuine, uncompromising grandmaster-level chess calculation engine**.

Built exclusively with **Vanilla JavaScript (ES6+), semantic HTML5, and modern CSS3**, NOIR CHESS operates completely standalone with **zero external libraries, CDNs, or WebAssembly overhead**. Every move, animation, audio impulse, and AI calculation runs natively within the browser environment.

---

## ⚡ The APEX Engine

At the summit of NOIR CHESS is **APEX** (`⚡ APEX`), a custom-built, browser-native chess engine capable of evaluating complex tactical positions and long-term positional structures. APEX calculates genuine variations through deep tree search and evaluation modeling.

```
                     ┌────────────────────────────────┐
                     │     Grandmaster Opening Book   │
                     │  (e4, d4, c4, Nf3 Variations)  │
                     └───────────────┬────────────────┘
                                     │ (Out of book)
                     ┌───────────────▼────────────────┐
                     │      Iterative Deepening       │
                     │   (Depth 1 → 16 + Aspirations) │
                     └───────────────┬────────────────┘
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
┌──────────────────────┐                             ┌──────────────────────┐
│  Move Ordering (SEE) │                             │ Negamax + PVS Search │
│  • TT Probe Move     │                             │  • Null Move Pruning │
│  • Winning Captures  │                             │  • Late Move Reduct. │
│  • Queen Promotions  │                             │  • Futility Pruning  │
│  • Killer Moves      │                             │  • Check Extensions  │
│  • History Heuristic │                             └──────────┬───────────┘
└──────────┬───────────┘                                        │
           │                                                    │
           └─────────────────────────┬──────────────────────────┘
                                     │
                     ┌───────────────▼────────────────┐
                     │    Quiescence Search (Delta)   │
                     │  (Resolves Checks & Exchanges) │
                     └───────────────┬────────────────┘
                                     │
                     ┌───────────────▼────────────────┐
                     │    Tapered Positional Eval     │
                     │  (MG/EG Phase, PST, King Safe) │
                     └────────────────────────────────┘
```

### 🧠 Core Engine Capabilities

- **Negamax with Alpha-Beta Pruning**: Complete mathematical minimax formulation with symmetrical search windows.
- **Principal Variation Search (PVS)**: Searches the best candidate move with a full $(\alpha, \beta)$ window, exploring subsequent sibling moves with a minimal zero-window $(-\alpha - 1, -\alpha)$ for rapid cutoffs.
- **Iterative Deepening & Aspiration Windows**: Progressively analyzes plies from Depth 1 to 16. Uses dynamic aspiration windows $(\text{score} \pm 25\text{cp})$ at depths $\ge 4$ to accelerate alpha-beta cutoffs.
- **Quiescence Search (Q-Search)**: Continues past search horizon boundaries to resolve tactical capture trees and check evasions, eliminating the horizon effect. Includes **Delta Pruning** to safely discard hopeless captures.
- **Static Exchange Evaluation (SEE)**: Simulates tactical piece swaps on target squares to rank winning, equal, and losing trades before searching deep trees.
- **Move Ordering Pipeline**:
  1. Transposition Table Best Move (Hash Move)
  2. Winning & Equal Captures (ranked by MVV-LVA & SEE)
  3. Pawn Promotions to Queen
  4. Killer Move Heuristic (2 killer moves indexed per ply)
  5. History Heuristic table for quiet positional moves
  6. Losing Captures (tactical sacrifices/blunders)
  7. Quiet Positional Moves
- **64-Bit Zobrist Hashing**: Cryptographic-grade pseudo-random integer keys for pieces, squares, castling rights, turn, and en passant squares.
- **262,144-Entry Transposition Table (TT)**: Low-latency flat typed arrays (`Uint32Array`, `Int8Array`, `Int16Array`) caching exact evaluations, upper bounds, lower bounds, search depths, and best moves.
- **Tapered Positional Evaluation**: Blends Midgame (MG) and Endgame (EG) scores across a 24-point phase coefficient. Evaluates:
  - Custom Piece-Square Tables (PST) for all 6 piece types
  - Pawn structures: passed pawn bonuses, connected pawns, isolated/doubled/backward pawn penalties
  - Piece dynamics: Bishop pair bonus, central knight outposts, open/semi-open file rooks, and 7th-rank rook dominance
  - King safety: castled pawn shield integrity ($f2/g2/h2$ & $f7/g7/h7$) and endgame king centralization
- **Tactical Anti-Blunder Verification**: Mandatory root failsafe layer that verifies the candidate move does not allow an immediate mate-in-1.
- **Web Worker Multi-Threading**: Executes calculations in a background Web Worker (`apex-engine.js`), streaming live telemetry (`depth`, `nodes`, `nps`, `time`) without blocking the 60fps UI. Includes an automatic async fallback for restricted local `file:///` contexts.

---

## 🎨 Visual & Tactical Features

| Feature | Description |
|---|---|
| 👑 **Cinematic Entry** | Minimalist opening sequence with a photorealistic alabaster White King emergence, subtle breathing presence, and dissolved transition into the game arena. |
| ♟️ **High-Contrast Staunton Pieces** | Vector Staunton pieces with dual-tone lighting: solid Ivory Alabaster for White vs. deep Obsidian Charcoal for Black, guaranteeing clarity across all squares. |
| 🎭 **3 Luxury Editorial Themes** | **Noir** (Warm ivory & charcoal slate), **Ivory & Walnut** (Warm cream & aged walnut), and **Emerald** (Forest jade & parchment). |
| 🎚️ **6 Difficulty Settings** | `EASY` (Casual), `MEDIUM` (Club), `HARD` (Candidate), `EXTREME` (Master), `MASTER` (International Master), and `⚡ APEX` (Grandmaster calculation). |
| 📊 **Live Advantage & Material** | Real-time material advantage calculation (`WHITE +3`, `BLACK +2`, or `MATERIAL EQUAL`) with dynamic captured piece tallies. |
| ⏳ **Tournament Clock Engine** | Full digital chess clock supporting Bullet (`1+0`), Blitz (`3+2`, `5+0`), Rapid (`10+0`), Classical (`15+10`), and Untimed modes. Clocks engage only on the first move. |
| 📜 **Move History & Timeline Stepper** | Notation in Standard Algebraic Notation (SAN). Review games forward and backward or jump directly to any historical position. |
| 🔄 **Board Orientation & Controls** | Instant Board Flip (`F`), Undo (`U`), Redo (`R`), In-Line Promotion Picker, Draw Offers, Resignations, and Rematch flows. |
| 🔊 **Synthesized Web Audio** | Pure browser-synthesized audio effects for piece placement, captures, checks, checkmates, and UI interactions (no audio files needed). |
| 📱 **Responsive & Mobile Ready** | Optimized touch dragging, click-to-move, and compact mobile editorial layout with anti-scroll viewport locking. |

---

## 📂 Project Architecture

```
noir-chess/
├── index.html         # Main semantic structure, SVG Staunton definitions & modals
├── style.css          # Editorial styling, typography, themes, animations & layout
├── script.js          # Core chess state machine, UI controller & clock manager
├── apex-engine.js     # APEX engine: Search, TT, Eval, Opening Book & Web Worker
└── README.md          # Project documentation & reference manual
```

---

## 🚀 Getting Started

NOIR CHESS is a zero-dependency static application. You can run it immediately in any modern browser.

### 🌐 Direct Launch (Browser)
Simply double-click or open `index.html` in your favorite web browser (Google Chrome, Firefox, Safari, Edge, or Brave):
```bash
# Windows
start index.html

# macOS
open index.html

# Linux
xdg-open index.html
```

### 💻 Local HTTP Server (Recommended for Web Workers)
For full Web Worker performance without local file URL constraints, serve the folder via any lightweight static HTTP server:

```bash
# Using Python 3
python -m http.server 8000

# Using Node.js (npx)
npx serve .

# Using PHP
php -S localhost:8000
```
Then navigate to `http://localhost:8000` in your browser.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|:---:|---|
| <kbd>N</kbd> | Open New Game Configuration dialog |
| <kbd>F</kbd> | Flip Board orientation (White / Black perspective) |
| <kbd>U</kbd> | Undo last move (undos 2 plies against AI) |
| <kbd>R</kbd> | Redo previously undone move |
| <kbd>M</kbd> | Toggle audio sound effects On / Off |
| <kbd>←</kbd> | Step backward one move in match history |
| <kbd>→</kbd> | Step forward one move in match history |
| <kbd>Esc</kbd> | Close any open modal dialog or slideout card |

---

## 🔬 Benchmark Verification Suite

The APEX engine includes a built-in benchmark runner to measure calculation speed, nodes explored, and search efficiency across tactical positions:

1. Open NOIR CHESS in your web browser.
2. Open the Developer Tools Console (<kbd>F12</kbd> or <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>I</kbd>).
3. Type the following command and press <kbd>Enter</kbd>:
   ```javascript
   NoirApexBenchmark();
   ```

### 🎯 Benchmark Test Scenarios
- **Tactical Queen Sacrifice**: Evaluates tactical mating sequences and piece sacrifices.
- **Greek Gift Sacrifice**: Tests bishop sacrifices on $h7/h2$ and king hunt calculation.
- **Pawn Endgame Opposition**: Verifies endgame king opposition and key square principles.
- **Tactical Pin Defense**: Tests defensive tactical refutations and pin resolution.

---

## 🛠️ Engine Customization & API

`apex-engine.js` is structured as a Universal Module Definition (UMD), allowing direct programmatic use inside Node.js, Web Workers, or browser scripts:

```javascript
// Example programmatic search
const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

window.NoirApex.searchAsync(fen, {
  difficulty: 'apex',
  maxDepth: 12,
  softTime: 3000,
  hardTime: 6000
}, (progress) => {
  console.log(`Depth: ${progress.depth}, Nodes: ${progress.nodes}, NPS: ${progress.nps}`);
}).then((result) => {
  console.log('Best Move:', result.bestMove);
  console.log('Evaluation (cp):', result.score);
});
```

---

## 🛡️ License

This project is licensed under the **MIT License**. Feel free to use, study, modify, and distribute this codebase for educational and personal projects.

---

<p align="center">
  <b>NOIR CHESS</b> • <i>Precision. Strategy. Editorial Luxury.</i> ♟️⚡
</p>
