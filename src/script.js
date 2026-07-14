// script.js

/**
 * BoardManager Module
 * Responsibilities:
 * - Maintain reference to cell DOM elements
 * - Track active/inactive cells (ghosts)
 * - Remove matched tiles
 * - Provide helper methods for indexing, values, and adjacency checks
 */
class BoardManager {
  constructor(cellElements) {
    this.cells = cellElements;
    // Capture initial board state for reset functionality
    this.initialState = cellElements.map(cell => ({
      value: cell.textContent.trim(),
      isGhost: cell.classList.contains('ghost')
    }));
  }

  isCellActive(index) {
    if (index < 0 || index >= this.cells.length) return false;
    return !this.cells[index].classList.contains('ghost');
  }

  getCellValue(index) {
    if (!this.isCellActive(index)) return null;
    const val = parseInt(this.cells[index].textContent.trim(), 10);
    return isNaN(val) ? null : val;
  }

  removeCell(index) {
    if (index < 0 || index >= this.cells.length) return;
    const cell = this.cells[index];
    cell.classList.add('ghost');
    cell.classList.remove('highlighted');
    cell.textContent = '';
    cell.setAttribute('aria-hidden', 'true');
    cell.removeAttribute('aria-label');
  }

  getRemainingActiveCount() {
    let count = 0;
    for (let i = 0; i < this.cells.length; i++) {
      if (this.isCellActive(i)) {
        count++;
      }
    }
    return count;
  }

  getAllActiveIndices() {
    const indices = [];
    for (let i = 0; i < this.cells.length; i++) {
      if (this.isCellActive(i)) {
        indices.push(i);
      }
    }
    return indices;
  }

  /**
   * Match Adjacency Logic
   * Checks if two active cells are adjacent horizontally, vertically, diagonally, or wrap-around.
   * Empty/ghost cells are skipped and do not block adjacency.
   */
  areAdjacent(idx1, idx2) {
    if (idx1 === idx2) return false;

    // Ensure idx1 is the smaller index for consistent directional scanning
    if (idx1 > idx2) {
      const temp = idx1;
      idx1 = idx2;
      idx2 = temp;
    }

    // 1. Wrap-around / Linear Adjacency
    // If there are no other active cells between idx1 and idx2 in the overall grid sequence
    const activeIndices = this.getAllActiveIndices();
    const pos1 = activeIndices.indexOf(idx1);
    const pos2 = activeIndices.indexOf(idx2);
    if (pos1 !== -1 && pos2 !== -1 && Math.abs(pos1 - pos2) === 1) {
      return true;
    }

    const r1 = Math.floor(idx1 / 10);
    const c1 = idx1 % 10;
    const r2 = Math.floor(idx2 / 10);
    const c2 = idx2 % 10;

    // 2. Vertical Adjacency (same column)
    if (c1 === c2) {
      for (let r = r1 + 1; r < r2; r++) {
        if (this.isCellActive(r * 10 + c1)) {
          return false; // Blocked by an active cell
        }
      }
      return true;
    }

    // 3. Diagonal Adjacency
    const dr = r2 - r1;
    const dc = c2 - c1;
    if (Math.abs(dr) === Math.abs(dc)) {
      const stepR = 1;
      const stepC = dc > 0 ? 1 : -1;
      for (let i = 1; i < dr; i++) {
        const checkR = r1 + i * stepR;
        const checkC = c1 + i * stepC;
        if (this.isCellActive(checkR * 10 + checkC)) {
          return false; // Blocked by an active cell
        }
      }
      return true;
    }

    return false;
  }

  /**
   * Reset board to initial layout
   */
  reset() {
    this.initialState.forEach((state, idx) => {
      const cell = this.cells[idx];
      cell.textContent = state.value;
      cell.className = 'cell';
      if (state.isGhost) {
        cell.classList.add('ghost');
        cell.setAttribute('aria-hidden', 'true');
        cell.removeAttribute('aria-label');
      } else {
        cell.setAttribute('role', 'gridcell');
        cell.removeAttribute('aria-hidden');
      }
    });
  }
}

/**
 * SelectionManager Module
 * Responsibilities:
 * - Manage user cell selections
 * - Highlight/dehighlight cell elements
 * - Validate selected pairs
 * - Prevent duplicate clicks, race conditions, and selections > 2 cells
 */
class SelectionManager {
  constructor(boardManager, onMatchFound) {
    this.boardManager = boardManager;
    this.onMatchFound = onMatchFound;
    this.selectedIndex = null;
    this.isProcessing = false;
  }

  handleCellClick(index) {
    if (this.isProcessing) return;
    if (!this.boardManager.isCellActive(index)) return;

    if (this.selectedIndex === null) {
      // First tile selection
      this.selectCell(index);
      if (window.playableAdController) {
        window.playableAdController.soundManager.playClick();
        window.playableAdController.resetIdleTimer();
      }
    } else if (this.selectedIndex === index) {
      // De-select if same tile is clicked again
      this.clearSelection();
      if (window.playableAdController) {
        window.playableAdController.soundManager.playClick();
        window.playableAdController.resetIdleTimer();
      }
    } else {
      // Second tile selection
      this.isProcessing = true;
      const idx1 = this.selectedIndex;
      const idx2 = index;

      const isValid = this.validatePair(idx1, idx2);
      if (isValid) {
        // Save state before modifying board
        if (window.playableAdController) {
          window.playableAdController.saveUndoState();
        }

        // Animate match
        const cell1 = this.boardManager.cells[idx1];
        const cell2 = this.boardManager.cells[idx2];
        cell1.classList.add('matched-anim');
        cell2.classList.add('matched-anim');

        // Spawn particles & visual rewards
        if (window.playableAdController) {
          window.playableAdController.spawnMatchParticles(idx1, idx2);
          window.playableAdController.spawnFloatingScore(idx1, idx2);
          window.playableAdController.spawnFloatingReward(idx1, idx2, true);
        }

        setTimeout(() => {
          this.boardManager.removeCell(idx1);
          this.boardManager.removeCell(idx2);
          cell1.classList.remove('matched-anim');
          cell2.classList.remove('matched-anim');
          this.clearSelection();
          if (this.onMatchFound) {
            this.onMatchFound(idx1, idx2);
          }
          this.isProcessing = false;
        }, 400);
      } else {
        // Play wrong animation (shake + red flash)
        const cell1 = this.boardManager.cells[idx1];
        const cell2 = this.boardManager.cells[idx2];
        cell1.classList.add('wrong-anim');
        cell2.classList.add('wrong-anim');

        if (window.playableAdController) {
          window.playableAdController.soundManager.playWrong();
          window.playableAdController.handleWrongMatch();
          window.playableAdController.spawnFloatingReward(idx1, idx2, false);
          window.playableAdController.resetIdleTimer();
        }

        setTimeout(() => {
          cell1.classList.remove('wrong-anim');
          cell2.classList.remove('wrong-anim');
          this.clearSelection();
          this.isProcessing = false;
        }, 300);
      }
    }
  }

  selectCell(index) {
    this.selectedIndex = index;
    const cell = this.boardManager.cells[index];
    cell.classList.add('highlighted');
    const val = this.boardManager.getCellValue(index);
    cell.setAttribute('aria-label', `${val}, selected`);
  }

  clearSelection() {
    if (this.selectedIndex !== null) {
      const cell = this.boardManager.cells[this.selectedIndex];
      cell.classList.remove('highlighted');
      const val = this.boardManager.getCellValue(this.selectedIndex);
      if (val !== null) {
        cell.setAttribute('aria-label', `${val}`);
      }
      this.selectedIndex = null;
    }
  }

  validatePair(idx1, idx2) {
    const val1 = this.boardManager.getCellValue(idx1);
    const val2 = this.boardManager.getCellValue(idx2);

    if (val1 === null || val2 === null) return false;

    // Rule A: Identical values
    // Rule B: Sum equals 10
    const valueMatch = (val1 === val2) || (val1 + val2 === 10);
    if (!valueMatch) return false;

    // Rule C: Adjacency check
    return this.boardManager.areAdjacent(idx1, idx2);
  }

  reset() {
    this.clearSelection();
    this.isProcessing = false;
  }
}

/**
 * GameEngine Module
 * Responsibilities:
 * - Initialize game systems and DOM references
 * - Maintain game state (score, pauses)
 * - Handle reset, pause, resume
 * - Expose clean public API
 */
class GameEngine {
  constructor() {
    this.boardManager = null;
    this.selectionManager = null;
    this.score = 0;
    this.iq = 0;
    this.isPaused = false;
    this.isWon = false;
  }

  initialize() {
    const cellElements = Array.from(document.querySelectorAll('.board-container .cell'));
    this.boardManager = new BoardManager(cellElements);
    this.selectionManager = new SelectionManager(this.boardManager, (idx1, idx2) => {
      this.handleMatch(idx1, idx2);
    });

    // Clear any initial highlighted states hardcoded in index.html to ensure clean start
    this.boardManager.cells.forEach((cell, idx) => {
      if (!this.boardManager.isCellActive(idx)) {
        cell.classList.add('ghost');
      } else {
        cell.classList.remove('highlighted');
        const val = this.boardManager.getCellValue(idx);
        cell.setAttribute('aria-label', `${val}`);
      }
    });

    this.score = 0;
    this.iq = 0;
    this.updateScoreUI();

    // Event delegation on the board container
    const boardContainer = document.querySelector('.board-container');
    if (boardContainer) {
      boardContainer.addEventListener('click', (event) => {
        if (this.isPaused || this.isWon) return;
        
        // Block interaction if input is disabled (e.g., during Auto Tutorial or End Game)
        if (window.playableAdController && window.playableAdController.isInputDisabled) return;

        const cell = event.target.closest('.cell');
        if (cell) {
          const index = this.boardManager.cells.indexOf(cell);
          if (index !== -1) {
            this.selectionManager.handleCellClick(index);
          }
        }
      });
    }

    // Expose engine globally for testing/automation hooks
    window.gameEngine = this;

    // Instantiate Playable Ad Controller to drive 35s game flow and polish
    window.playableAdController = new PlayableAdController(this);
    window.playableAdController.init();
  }

  handleMatch(idx1, idx2) {
    if (window.playableAdController) {
      window.playableAdController.handleMatch(idx1, idx2);
    } else {
      this.score += 10;
      this.updateScoreUI();
      this.checkWinCondition();
    }
  }

  updateScoreUI() {
    const scoreVal = document.getElementById('score-value');
    if (scoreVal) {
      scoreVal.textContent = this.score;
    }
  }

  checkWinCondition() {
    if (this.boardManager.getRemainingActiveCount() === 0) {
      this.isWon = true;
      if (window.playableAdController) {
        window.playableAdController.triggerVictory();
      }
    }
  }

  reset() {
    this.boardManager.reset();
    this.selectionManager.reset();
    this.score = 0;
    this.iq = 0;
    this.isWon = false;
    this.updateScoreUI();
    if (window.playableAdController) {
      window.playableAdController.updateIQUI();
    }
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  getScore() {
    return this.score;
  }

  isGameOver() {
    return this.isWon;
  }
}

/**
 * SoundManager Module (Web Audio API Synthesizer)
 * Generates all match, levelup, incorrect, click, and victory sounds dynamically.
 */
class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playClick() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  playCorrect() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const freqs = [800, 1000, 1200, 1500];
    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.06);
      gain.gain.setValueAtTime(0.1, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.15);
    });
  }

  playWrong() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.linearRampToValueAtTime(80, now + 0.15);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playLevelUp() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(250, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.35);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  playVictory() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    notes.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.08);
      gain.gain.setValueAtTime(0.1, now + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.3);
    });
  }

  playSpecial() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }
}

/**
 * PlayableAdController Module
 * Handles game timer, Auto Tutorial, Guided Play, Free Play, End Game,
 * shuffles, hints, undo history, particles, and visual polish injections.
 */
class PlayableAdController {
  constructor(gameEngine) {
    this.engine = gameEngine;
    this.soundManager = new SoundManager();
    
    // Playable Settings
    this.timeLimit = 35;
    this.currentTime = 0;
    this.isInputDisabled = true;
    this.isAdEnded = false;
    
    // Guided Play Idle
    this.idleTime = 0;
    this.guidedMatchesCompleted = 0;
    
    // Combo Tracking
    this.lastMatchTime = 0;
    this.comboCount = 0;
    
    // Undo Stack
    this.undoStack = [];
    
    // DOM Cache
    this.handEl = null;
    this.messageEl = null;
    this.ctaEl = null;
    this.soundBtnEl = null;

    // Hand Animation State
    this.handTargetX = 0;
    this.handTargetY = 0;
    this.handCurrentX = 0;
    this.handCurrentY = 0;
  }

  init() {
    this.injectStyles();
    this.createUIElements();
    this.bindControls();
    this.updateIQUI();

    // Cache sound button and bind toggle
    this.soundBtnEl = document.querySelector('.sound-btn');
    if (this.soundBtnEl) {
      this.soundBtnEl.addEventListener('click', () => {
        this.toggleSound();
      });
    }

    // Start 60fps Loop for Smooth Hand Interpolation and Idle Floating
    this.startRenderLoop();

    // Start 35s Game Loop ticker (runs every 100ms)
    this.ticker = setInterval(() => {
      this.tick();
    }, 100);
  }

  injectStyles() {
    const css = `
      .tutorial-hand {
        position: absolute;
        width: 60px;
        height: 60px;
        z-index: 200;
        pointer-events: none;
        opacity: 0;
        left: 0;
        top: 0;
      }
      .tutorial-hand img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        transform-origin: 10% 10%;
        transition: transform 0.15s ease-out;
      }
      .tutorial-hand.tapped img {
        transform: scale(0.78);
      }
      .screen-message {
        position: absolute;
        top: 45%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.4);
        font-family: var(--ff-title);
        font-size: 44px;
        color: var(--gold-mid);
        text-shadow: 0 0 10px rgba(0, 0, 0, 0.95), 0 0 20px var(--gold-mid);
        z-index: 150;
        opacity: 0;
        pointer-events: none;
        transition: all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      .screen-message.show {
        transform: translate(-50%, -50%) scale(1);
        opacity: 1;
      }
      .cta-overlay {
        position: absolute;
        inset: 0;
        background: rgba(4, 2, 26, 0.94);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 25px;
        z-index: 1000;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.5s ease;
      }
      .cta-overlay.show {
        opacity: 1;
        pointer-events: auto;
      }
      .cta-card {
        background: linear-gradient(180deg, #1e0a54 0%, #0d0526 100%);
        border: 3.5px solid var(--gold-mid);
        border-radius: var(--r-md);
        padding: 30px;
        text-align: center;
        box-shadow: 0 0 35px rgba(255, 215, 0, 0.6), inset 0 0 15px rgba(255, 255, 255, 0.1);
        transform: scale(0.7);
        transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        max-width: 320px;
      }
      .cta-overlay.show .cta-card {
        transform: scale(1);
      }
      .cta-title {
        font-family: var(--ff-title);
        font-size: 54px;
        background: linear-gradient(180deg, #fffa80 0%, #ffd700 40%, #ff8800 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
        margin-bottom: 5px;
        animation: glow-title 1.5s infinite alternate;
      }
      .cta-subtitle {
        font-family: var(--ff-body);
        font-weight: 800;
        font-size: 14px;
        color: #bfdbfe;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        margin-bottom: 25px;
      }
      .cta-btn {
        background: linear-gradient(180deg, #34d399 0%, #059669 100%);
        border: 2px solid #a7f3d0;
        border-radius: 30px;
        color: #fff;
        font-family: var(--ff-display);
        font-size: 24px;
        padding: 12px 35px;
        box-shadow: 0 0 20px rgba(16, 185, 129, 0.7);
        cursor: pointer;
        animation: bounce-btn 2s infinite;
        transition: all 0.2s ease;
        text-shadow: 0 1px 3px rgba(0,0,0,0.3);
      }
      @keyframes bounce-btn {
        0%, 100%, 20%, 50%, 80% { transform: translateY(0); }
        40% { transform: translateY(-10px); }
        60% { transform: translateY(-5px); }
      }
      @keyframes glow-title {
        0% { filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)) drop-shadow(0 0 5px rgba(255,215,0,0.5)); }
        100% { filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)) drop-shadow(0 0 20px rgba(255,215,0,0.8)); }
      }
      .floating-score {
        position: absolute;
        color: var(--gold-mid);
        font-family: var(--ff-display);
        font-size: 24px;
        text-shadow: 0 2px 5px rgba(0,0,0,0.9);
        pointer-events: none;
        z-index: 100;
        animation: float-up 0.8s ease-out forwards;
      }
      .floating-reward {
        position: absolute;
        font-family: var(--ff-title);
        font-size: 26px;
        text-shadow: 0 2px 8px rgba(0,0,0,0.95);
        pointer-events: none;
        z-index: 102;
        animation: float-reward-anim 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
      }
      @keyframes float-reward-anim {
        0% { transform: scale(0.3) translateY(0); opacity: 0; }
        50% { transform: scale(1.1) translateY(-20px); opacity: 1; }
        100% { transform: scale(1) translateY(-40px); opacity: 0; }
      }
      @keyframes float-up {
        0% { transform: scale(0.5) translateY(0); opacity: 1; }
        100% { transform: scale(1.2) translateY(-60px); opacity: 0; }
      }
      .particle {
        position: absolute;
        pointer-events: none;
        z-index: 90;
        opacity: 1;
        animation: burst 0.6s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
      }
      @keyframes burst {
        to {
          transform: translate(var(--dx), var(--dy)) scale(0.1) rotate(180deg);
          opacity: 0;
        }
      }
      .pulse {
        animation: pulse-element 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      @keyframes pulse-element {
        0% { transform: scale(1); }
        50% { transform: scale(1.25); filter: brightness(1.2); }
        100% { transform: scale(1); }
      }
      .wrong-anim {
        animation: shake-error 0.3s ease-in-out;
      }
      @keyframes shake-error {
        0%, 100% { transform: translateX(0); background: #f87171; border-color: #dc2626; color: #fff; }
        20%, 60% { transform: translateX(-4px); }
        40%, 80% { transform: translateX(4px); }
      }
      .hint-highlight {
        animation: hint-glow 1s infinite alternate;
      }
      @keyframes hint-glow {
        0% { box-shadow: 0 0 2px var(--gold-mid); border-color: var(--gold-mid); }
        100% { box-shadow: 0 0 12px var(--gold-mid); border-color: var(--gold-hi); }
      }
      .matched-anim {
        animation: cellMatched 0.4s ease-out forwards;
        pointer-events: none;
      }
      @keyframes cellMatched {
        0% { transform: scale(1); box-shadow: 0 0 15px rgba(255, 215, 0, 0.8); filter: brightness(1.25); }
        50% { transform: scale(1.15); opacity: 0.8; }
        100% { transform: scale(0); opacity: 0; }
      }
      
      /* Active Highlight Animation for selected cell */
      .cell.highlighted {
        animation: select-pulse 1s infinite alternate;
      }
      @keyframes select-pulse {
        0% { transform: scale(1); box-shadow: 0 0 4px rgba(255, 215, 0, 0.7); }
        100% { transform: scale(1.05); box-shadow: 0 0 12px rgba(255, 215, 0, 0.95); }
      }

      /* Cooldown animation for hint button */
      .cooldown-active {
        opacity: 0.5 !important;
        pointer-events: none !important;
        position: relative;
      }
      .cooldown-active::after {
        content: '';
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
        border-radius: inherit;
        animation: cooldown-drain 1.5s linear forwards;
      }
      @keyframes cooldown-drain {
        0% { clip-path: inset(0 0 0 0); }
        100% { clip-path: inset(100% 0 0 0); }
      }

      /* Rotate icon for Shuffle */
      .rotate-icon svg {
        transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
        transform: rotate(360deg);
      }

      /* Flip icon for Undo */
      .flip-icon {
        animation: arrow-flip 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      @keyframes arrow-flip {
        0% { transform: rotate(0); }
        100% { transform: rotate(-360deg); }
      }
      
      /* Brain Level Up Glow */
      .brain-levelup-glow {
        box-shadow: 0 0 30px #d8b4fe, 0 0 60px #c084fc !important;
        animation: brain-rainbow-glow 0.8s ease-out;
      }
      @keyframes brain-rainbow-glow {
        0% { transform: scale(1); filter: brightness(1.5); }
        50% { transform: scale(1.3); filter: brightness(2.0); }
        100% { transform: scale(1); filter: brightness(1); }
      }
    `;
    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  createUIElements() {
    const wrapper = document.querySelector('.game-wrapper');

    // Create Tutorial Hand element (using hand.png)
    this.handEl = document.createElement('div');
    this.handEl.className = 'tutorial-hand';
    this.handEl.innerHTML = `<img src="../assets/images/hand.png" alt="Hand pointer" />`;
    wrapper.appendChild(this.handEl);

    // Create Large Screen Announcement (Your Turn, etc.)
    this.messageEl = document.createElement('div');
    this.messageEl.className = 'screen-message';
    wrapper.appendChild(this.messageEl);

    // Create End Game CTA Overlay
    this.ctaEl = document.createElement('div');
    this.ctaEl.className = 'cta-overlay';
    this.ctaEl.innerHTML = `
      <div class="cta-card">
        <h2 class="cta-title">GENIUS!</h2>
        <p class="cta-subtitle">Train Your Brain Today</p>
        <button class="cta-btn" id="cta-play-btn">PLAY NOW</button>
      </div>
    `;
    wrapper.appendChild(this.ctaEl);

    // Register CTA button click
    const playBtn = this.ctaEl.querySelector('#cta-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this.soundManager.playSpecial();
        this.redirectToStore();
      });
    }
  }

  bindControls() {
    // Hint button click
    const hintBtn = document.getElementById('hint-btn');
    if (hintBtn) {
      hintBtn.addEventListener('click', () => {
        if (this.currentTime < 15.0 || this.isAdEnded || hintBtn.classList.contains('cooldown-active')) return;
        this.triggerHint();
      });
    }

    // Shuffle button click
    const shuffleBtn = document.getElementById('shuffle-btn');
    if (shuffleBtn) {
      shuffleBtn.addEventListener('click', () => {
        if (this.currentTime < 15.0 || this.isAdEnded) return;
        this.triggerShuffle();
      });
    }

    // Undo button click
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
      undoBtn.addEventListener('click', () => {
        if (this.currentTime < 15.0 || this.isAdEnded) return;
        this.triggerUndo();
      });
    }
  }

  toggleSound() {
    this.soundManager.muted = !this.soundManager.muted;
    if (this.soundBtnEl) {
      if (this.soundManager.muted) {
        this.soundBtnEl.style.opacity = '0.4';
        // Toggle path to muted representation
        this.soundBtnEl.innerHTML = `
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
          </svg>
        `;
      } else {
        this.soundBtnEl.style.opacity = '1';
        this.soundBtnEl.innerHTML = `
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
          </svg>
        `;
        this.soundManager.playClick();
      }
    }
  }

  redirectToStore() {
    console.log("Playable redirect: Store Navigation!");
    if (typeof mraid !== "undefined" && mraid.open) {
      mraid.open();
    } else {
      window.open("https://play.google.com/store", "_blank");
    }
  }

  /**
   * Main game loop ticker (every 100ms)
   */
  tick() {
    if (this.isAdEnded) return;

    this.currentTime += 0.1;

    // Phase 1 (0 to 15s) - Auto Tutorial Demonstration
    if (this.currentTime < 15.0) {
      this.handleAutoTutorial();
    } 
    // Phase 2 (15 to 20s) - Guided play
    else if (this.currentTime >= 15.0 && this.currentTime < 20.0) {
      if (this.isInputDisabled) {
        this.isInputDisabled = false; // Enable inputs at 15s
      }
      this.handleGuidedPlay();
    } 
    // Phase 3 (20 to 32s) - Free Play
    else if (this.currentTime >= 20.0 && this.currentTime < 32.0) {
      this.handleFreePlay();
    } 
    // Phase 4 (32 to 35s) - End Game
    else if (this.currentTime >= 32.0) {
      this.triggerEndGame();
    }
  }

  /**
   * 0 - 15s: Auto Tutorial Demonstration
   */
  handleAutoTutorial() {
    const t = parseFloat(this.currentTime.toFixed(1));

    // Pair 1: Row 2 Col 0 (index 10, value '2') & Row 2 Col 1 (index 11, value '2')
    if (t === 1.2) {
      this.setHandTargetCell(10);
    }
    if (t === 3.0) {
      this.tapCell(10);
    }
    if (t === 4.2) {
      this.setHandTargetCell(11);
    }
    if (t === 6.0) {
      this.tapCell(11);
    }

    // Pair 2: Row 5 Col 0 (index 40, value '3') & Row 5 Col 1 (index 41, value '7')
    if (t === 8.2) {
      this.setHandTargetCell(40);
    }
    if (t === 10.0) {
      this.tapCell(40);
    }
    if (t === 11.2) {
      this.setHandTargetCell(41);
    }
    if (t === 13.0) {
      this.tapCell(41);
    }

    // Transition to "YOUR TURN!" at 13.8s
    if (t === 13.8) {
      this.hideHand();
      this.showMessage("YOUR TURN!");
    }
  }

  /**
   * 15 - 20s: Guided Play
   */
  handleGuidedPlay() {
    if (this.guidedMatchesCompleted >= 2) {
      this.hideHand();
      return;
    }

    this.idleTime += 0.1;
    if (this.idleTime >= 2.0) {
      const pair = this.findNextPair();
      if (pair) {
        this.pointHandAtCell(pair[0]);
      }
    }
  }

  /**
   * 20 - 32s: Free Play
   */
  handleFreePlay() {
    this.hideHand();
  }

  resetIdleTimer() {
    this.idleTime = 0;
    if (this.currentTime >= 15.0 && this.currentTime < 20.0 && this.guidedMatchesCompleted < 2) {
      this.hideHand();
    }
  }

  /**
   * 60fps Loop for Smooth Hand Movement Easing & Floating
   */
  startRenderLoop() {
    const render = () => {
      if (this.isAdEnded) return;

      // Smooth Easing Interpolation (Lerp) for Hand Movement
      const lerpFactor = 0.08;
      this.handCurrentX += (this.handTargetX - this.handCurrentX) * lerpFactor;
      this.handCurrentY += (this.handTargetY - this.handCurrentY) * lerpFactor;

      // Visual Hand floating (Subtle Sine oscillation when stationary)
      let floatOffset = 0;
      if (Math.abs(this.handCurrentX - this.handTargetX) < 1.0) {
        floatOffset = Math.sin(Date.now() / 250) * 2;
      }

      this.handEl.style.left = `${this.handCurrentX}px`;
      this.handEl.style.top = `${this.handCurrentY + floatOffset}px`;

      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }

  setHandTargetCell(index) {
    const cell = this.engine.boardManager.cells[index];
    if (!cell) return;

    const cellRect = cell.getBoundingClientRect();
    const wrapperRect = document.querySelector('.game-wrapper').getBoundingClientRect();
    
    // Offset target X and Y such that finger tip (top-left) points exactly to the cell center
    this.handTargetX = cellRect.left - wrapperRect.left + cellRect.width / 2 - 6;
    this.handTargetY = cellRect.top - wrapperRect.top + cellRect.height / 2 - 6;

    if (this.handEl.style.opacity === '0' || !this.handEl.style.opacity) {
      this.handCurrentX = this.handTargetX;
      this.handCurrentY = this.handTargetY;
      this.handEl.style.opacity = '1';
    }
  }

  pointHandAtCell(index) {
    this.setHandTargetCell(index);
  }

  tapCell(index) {
    this.handEl.classList.add('tapped');
    setTimeout(() => {
      this.handEl.classList.remove('tapped');
    }, 150);

    // Click execution
    this.engine.selectionManager.handleCellClick(index);
  }

  hideHand() {
    this.handEl.style.opacity = '0';
    this.handTargetX = -100;
    this.handTargetY = -100;
  }

  showMessage(text) {
    this.messageEl.textContent = text;
    this.messageEl.classList.add('show');
    setTimeout(() => {
      this.messageEl.classList.remove('show');
    }, 1000);
  }

  /**
   * Gameplay Events
   */
  handleMatch(idx1, idx2) {
    // 1. Score Calculation
    let points = 10;
    const now = Date.now();
    let isCombo = false;

    if (now - this.lastMatchTime < 3000) {
      this.comboCount++;
      isCombo = true;
      if (this.comboCount === 1) points += 15;
      else if (this.comboCount === 2) points += 20;
      else points += 30;
    } else {
      this.comboCount = 0;
    }
    this.lastMatchTime = now;

    this.engine.score += points;
    this.engine.updateScoreUI();
    this.animateScorePop();

    // 2. IQ Calculation
    let iqPoints = 3;
    if (isCombo) {
      iqPoints += 5; 
      this.showFloatingText(`COMBO!`, idx1, '#ffd700');
    }
    this.engine.iq += iqPoints;
    this.updateIQUI(true); // true -> positive change, trigger pop and brain pulse

    // Sound
    this.soundManager.playCorrect();

    // Target check
    if (this.engine.score >= 100) {
      this.triggerVictory();
    } else {
      this.engine.checkWinCondition();
    }

    // Phase 2 steps
    if (this.currentTime >= 15.0 && this.currentTime < 20.0) {
      this.guidedMatchesCompleted++;
      if (this.guidedMatchesCompleted >= 2) {
        this.hideHand();
      }
    }
    this.resetIdleTimer();
  }

  handleWrongMatch() {
    this.engine.iq = Math.max(0, this.engine.iq - 2);
    this.updateIQUI(false); // false -> negative decrease animation
  }

  updateIQUI(isPositive = null) {
    const iqVal = document.querySelector('.iq-number');
    const iqRank = document.querySelector('.iq-tier');
    const tubeFill = document.querySelector('.tube-rainbow-fill');
    const brain = document.querySelector('.brain-wrap');

    if (iqVal) {
      iqVal.textContent = this.engine.iq;
      if (isPositive === true) {
        // Pop IQ text with glow
        iqVal.classList.add('pulse');
        setTimeout(() => iqVal.classList.remove('pulse'), 350);
      }
    }

    // Determine Rank
    let rank = "BEGINNER";
    const iq = this.engine.iq;
    if (iq >= 31 && iq <= 60) rank = "THINKER";
    else if (iq >= 61 && iq <= 90) rank = "SMART";
    else if (iq >= 91 && iq <= 120) rank = "GENIUS";
    else if (iq >= 121) rank = "MASTERMIND";

    if (iqRank && iqRank.textContent !== rank) {
      iqRank.textContent = rank;
      this.soundManager.playLevelUp();
      // Crossing rank: glow brain, spawn tiny stars
      if (brain) {
        brain.classList.add('brain-levelup-glow');
        setTimeout(() => brain.classList.remove('brain-levelup-glow'), 800);
        this.spawnRankStars();
      }
    }

    // Smooth Progress tube fill
    const percentage = Math.min(100, (iq / 150) * 100);
    if (tubeFill) {
      tubeFill.style.transition = 'top 0.4s cubic-bezier(0.1, 0.8, 0.3, 1)';
      tubeFill.style.top = `${100 - percentage}%`;
    }

    // Pulse Brain Icon
    if (isPositive === true && brain) {
      brain.classList.add('pulse');
      setTimeout(() => {
        brain.classList.remove('pulse');
      }, 300);
    }
  }

  animateScorePop() {
    const scoreCard = document.getElementById('score-card');
    if (scoreCard) {
      scoreCard.classList.add('pulse');
      setTimeout(() => scoreCard.classList.remove('pulse'), 350);
    }
  }

  /**
   * Floating Messages & Stars/Confetti Emitters
   */
  spawnMatchParticles(idx1, idx2) {
    const wrapper = document.querySelector('.game-wrapper');
    const cells = [this.engine.boardManager.cells[idx1], this.engine.boardManager.cells[idx2]];

    cells.forEach(cell => {
      if (!cell) return;
      const rect = cell.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      const x = rect.left - wrapperRect.left + rect.width / 2;
      const y = rect.top - wrapperRect.top + rect.height / 2;

      // Burst lightweight sparkle particles (10 circles)
      for (let i = 0; i < 10; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const colors = ['#ffd700', '#c4b5fd', '#818cf8', '#a7f3d0'];
        p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        p.style.left = `${x}px`;
        p.style.top = `${y}px`;

        const angle = Math.random() * Math.PI * 2;
        const speed = 20 + Math.random() * 45;
        const dx = Math.cos(angle) * speed;
        const dy = Math.sin(angle) * speed;

        p.style.setProperty('--dx', `${dx}px`);
        p.style.setProperty('--dy', `${dy}px`);

        wrapper.appendChild(p);
        setTimeout(() => p.remove(), 600);
      }
    });
  }

  spawnRankStars() {
    // Spawn stars from progress base tube area
    const wrapper = document.querySelector('.game-wrapper');
    const base = document.querySelector('.tube-glow-base');
    if (!base) return;

    const baseRect = base.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const x = baseRect.left - wrapperRect.left + baseRect.width / 2;
    const y = baseRect.top - wrapperRect.top;

    for (let i = 0; i < 8; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.innerHTML = '✦';
      p.style.color = '#ffd700';
      p.style.fontSize = '12px';
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;

      const angle = (Math.random() * Math.PI) + Math.PI; // upward burst
      const speed = 30 + Math.random() * 50;
      const dx = Math.cos(angle) * speed;
      const dy = Math.sin(angle) * speed;

      p.style.setProperty('--dx', `${dx}px`);
      p.style.setProperty('--dy', `${dy}px`);

      wrapper.appendChild(p);
      setTimeout(() => p.remove(), 600);
    }
  }

  spawnFloatingScore(idx1, idx2) {
    const cell1 = this.engine.boardManager.cells[idx1];
    const cell2 = this.engine.boardManager.cells[idx2];
    if (!cell1 || !cell2) return;

    const r1 = cell1.getBoundingClientRect();
    const r2 = cell2.getBoundingClientRect();
    const wrapperRect = document.querySelector('.game-wrapper').getBoundingClientRect();
    
    const x = (r1.left + r2.left) / 2 - wrapperRect.left + 15;
    const y = (r1.top + r2.top) / 2 - wrapperRect.top;

    let bonus = 10;
    if (Date.now() - this.lastMatchTime < 3000) {
      if (this.comboCount === 1) bonus += 15;
      else if (this.comboCount === 2) bonus += 20;
      else bonus += 30;
    }

    this.showFloatingText(`+${bonus}`, x, y);
  }

  showFloatingText(text, x, y, color = 'var(--gold-mid)') {
    const f = document.createElement('div');
    f.className = 'floating-score';
    f.textContent = text;
    f.style.left = typeof x === 'string' ? x : `${x}px`;
    f.style.top = typeof y === 'string' ? y : `${y}px`;
    f.style.color = color;
    document.querySelector('.game-wrapper').appendChild(f);
    setTimeout(() => f.remove(), 800);
  }

  spawnFloatingReward(idx1, idx2, isCorrect) {
    const cell1 = this.engine.boardManager.cells[idx1];
    const cell2 = this.engine.boardManager.cells[idx2];
    if (!cell1 || !cell2) return;

    const r1 = cell1.getBoundingClientRect();
    const r2 = cell2.getBoundingClientRect();
    const wrapperRect = document.querySelector('.game-wrapper').getBoundingClientRect();
    
    const x = (r1.left + r2.left) / 2 - wrapperRect.left - 20;
    const y = (r1.top + r2.top) / 2 - wrapperRect.top - 10;

    const correctWords = ["WOW!", "GREAT!", "AWESOME!", "PERFECT!", "SMART!", "NICE!", "EXCELLENT!"];
    const incorrectWords = ["TRY AGAIN", "OOPS", "NOT A MATCH"];

    const rText = document.createElement('div');
    rText.className = 'floating-reward';
    rText.textContent = isCorrect 
      ? correctWords[Math.floor(Math.random() * correctWords.length)]
      : incorrectWords[Math.floor(Math.random() * incorrectWords.length)];
    
    rText.style.left = `${x}px`;
    rText.style.top = `${y}px`;
    rText.style.color = isCorrect ? 'var(--gold-mid)' : '#f87171';
    
    document.querySelector('.game-wrapper').appendChild(rText);
    setTimeout(() => rText.remove(), 600);
  }

  /**
   * Solvability & Solver
   */
  findNextPair() {
    const activeIndices = this.engine.boardManager.getAllActiveIndices();
    if (activeIndices.length < 2) return null;

    // Linear
    for (let i = 0; i < activeIndices.length - 1; i++) {
      const idx1 = activeIndices[i];
      const idx2 = activeIndices[i + 1];
      if (this.engine.selectionManager.validatePair(idx1, idx2)) {
        return [idx1, idx2];
      }
    }

    // Adjacency cross-search
    for (let i = 0; i < activeIndices.length; i++) {
      const idx1 = activeIndices[i];
      for (let j = i + 1; j < activeIndices.length; j++) {
        const idx2 = activeIndices[j];
        if (this.engine.boardManager.areAdjacent(idx1, idx2) && this.engine.selectionManager.validatePair(idx1, idx2)) {
          return [idx1, idx2];
        }
      }
    }
    return null;
  }

  /**
   * Bottom controls actions
   */
  triggerHint() {
    const badge = document.querySelector('#hint-btn .btn-badge');
    const hintBtn = document.getElementById('hint-btn');
    let count = parseInt(badge.textContent, 10);
    if (count <= 0) return;

    const pair = this.findNextPair();
    if (pair) {
      this.saveUndoState();

      count--;
      badge.textContent = count;

      // Glow pair cells
      const c1 = this.engine.boardManager.cells[pair[0]];
      const c2 = this.engine.boardManager.cells[pair[1]];
      c1.classList.add('hint-highlight');
      c2.classList.add('hint-highlight');

      // Deduct IQ
      this.engine.iq = Math.max(0, this.engine.iq - 5);
      this.updateIQUI();

      this.soundManager.playClick();

      // Hint Cooldown Animation
      if (hintBtn) {
        hintBtn.classList.add('cooldown-active');
        setTimeout(() => hintBtn.classList.remove('cooldown-active'), 1500);
      }

      setTimeout(() => {
        c1.classList.remove('hint-highlight');
        c2.classList.remove('hint-highlight');
      }, 2000);
    }
  }

  triggerShuffle() {
    const badge = document.querySelector('#shuffle-btn .btn-badge');
    const shuffleBtn = document.getElementById('shuffle-btn');
    let count = parseInt(badge.textContent, 10);
    if (count <= 0) return;

    this.saveUndoState();

    count--;
    badge.textContent = count;

    const activeIndices = this.engine.boardManager.getAllActiveIndices();
    if (activeIndices.length < 2) return;

    // Shuffle rotation animation
    if (shuffleBtn) {
      shuffleBtn.classList.add('rotate-icon');
      setTimeout(() => shuffleBtn.classList.remove('rotate-icon'), 500);
    }

    let solved = false;
    let attempts = 0;
    const originalValues = activeIndices.map(idx => {
      return parseInt(this.engine.boardManager.cells[idx].textContent.trim(), 10);
    });

    while (!solved && attempts < 100) {
      attempts++;
      const shuffledValues = [...originalValues];
      for (let i = shuffledValues.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = shuffledValues[i];
        shuffledValues[i] = shuffledValues[j];
        shuffledValues[j] = temp;
      }

      activeIndices.forEach((idx, i) => {
        this.engine.boardManager.cells[idx].textContent = shuffledValues[i];
      });

      if (this.findNextPair()) {
        solved = true;
      }
    }

    if (!solved) {
      const idx1 = activeIndices[0];
      const idx2 = activeIndices[1] || activeIndices[0];
      if (idx1 !== idx2) {
        this.engine.boardManager.cells[idx1].textContent = '5';
        this.engine.boardManager.cells[idx2].textContent = '5';
      }
    }

    // Deduct IQ
    this.engine.iq = Math.max(0, this.engine.iq - 4);
    this.updateIQUI();

    this.soundManager.playClick();
  }

  triggerUndo() {
    const badge = document.querySelector('#undo-btn .btn-badge');
    const undoBtn = document.getElementById('undo-btn');
    let count = parseInt(badge.textContent, 10);
    if (count <= 0) return;

    // Flip arrow animation
    if (undoBtn) {
      undoBtn.classList.add('flip-icon');
      setTimeout(() => undoBtn.classList.remove('flip-icon'), 400);
    }

    const success = this.popUndoState();
    if (success) {
      count--;
      badge.textContent = count;
      this.soundManager.playClick();
    }
  }

  saveUndoState() {
    const state = {
      score: this.engine.score,
      iq: this.engine.iq,
      board: this.engine.boardManager.cells.map(cell => ({
        value: cell.textContent,
        isGhost: cell.classList.contains('ghost')
      }))
    };
    this.undoStack.push(JSON.stringify(state));
  }

  popUndoState() {
    if (this.undoStack.length === 0) return false;
    const rawState = this.undoStack.pop();
    const state = JSON.parse(rawState);

    this.engine.score = state.score;
    this.engine.iq = state.iq;

    state.board.forEach((s, idx) => {
      const cell = this.engine.boardManager.cells[idx];
      cell.textContent = s.value;
      cell.className = 'cell';
      if (s.isGhost) {
        cell.classList.add('ghost');
        cell.setAttribute('aria-hidden', 'true');
        cell.removeAttribute('aria-label');
      } else {
        cell.setAttribute('role', 'gridcell');
        cell.removeAttribute('aria-hidden');
        cell.setAttribute('aria-label', s.value);
      }
    });

    this.engine.updateScoreUI();
    this.updateIQUI();
    return true;
  }

  /**
   * Victory & End Game
   */
  triggerVictory() {
    this.engine.isWon = true;
    this.triggerEndGame();
  }

  triggerEndGame() {
    if (this.isAdEnded) return;
    this.isAdEnded = true;
    this.isInputDisabled = true;
    clearInterval(this.ticker);

    this.hideHand();

    this.soundManager.playLevelUp();

    let endIQ = 140;
    let stepIQ = this.engine.iq;
    
    // Rapidly animate IQ progress and score
    const iqInterval = setInterval(() => {
      if (stepIQ < endIQ) {
        stepIQ = Math.min(endIQ, stepIQ + 4);
        this.engine.iq = stepIQ;
        this.updateIQUI(true);
      } else {
        clearInterval(iqInterval);
        this.soundManager.playVictory();
        this.spawnConfettiExplosion();
        // Show CTA overlay
        setTimeout(() => {
          this.ctaEl.classList.add('show');
        }, 800);
      }
    }, 40);
  }

  spawnConfettiExplosion() {
    const wrapper = document.querySelector('.game-wrapper');
    const colors = ['#ffd700', '#c4b5fd', '#818cf8', '#a7f3d0', '#f472b6'];
    
    for (let exp = 0; exp < 4; exp++) {
      setTimeout(() => {
        const x = 50 + Math.random() * (wrapper.clientWidth - 100);
        const y = 150 + Math.random() * (wrapper.clientHeight - 300);

        for (let i = 0; i < 24; i++) {
          const p = document.createElement('div');
          p.className = 'particle';
          // Rectangular confetti particles
          p.style.width = '10px';
          p.style.height = '6px';
          p.style.borderRadius = '1px';
          p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
          p.style.left = `${x}px`;
          p.style.top = `${y}px`;
          
          const angle = Math.random() * Math.PI * 2;
          const speed = 40 + Math.random() * 90;
          const dx = Math.cos(angle) * speed;
          const dy = Math.sin(angle) * speed;

          p.style.setProperty('--dx', `${dx}px`);
          p.style.setProperty('--dy', `${dy}px`);

          wrapper.appendChild(p);
          setTimeout(() => p.remove(), 600);
        }
      }, exp * 250);
    }
  }
}

// Auto-start on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const engine = new GameEngine();
    engine.initialize();
  });
} else {
  const engine = new GameEngine();
  engine.initialize();
}
