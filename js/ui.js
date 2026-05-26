// ui.js — shared UI helpers

const UI = (() => {

  // Toast notifications
  function toast(message, type = 'info', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = `
        position:fixed; bottom:2rem; right:2rem; z-index:9999;
        display:flex; flex-direction:column; gap:.6rem; pointer-events:none;
      `;
      document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = message;
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 400);
    }, duration);
  }

  // FKS award popup
  function fksPopup(amount, label) {
    const el = document.createElement('div');
    el.className = 'fks-popup';
    el.innerHTML = `<span class="fks-plus">+${amount}</span><span class="fks-label">FKS</span><span class="fks-reason">${label}</span>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.add('hide');
      setTimeout(() => el.remove(), 600);
    }, 2000);
  }

  // Format time remaining
  function formatTime(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  // Render a single card face (small version for collection grid)
  function renderCardMini(card, player, isOwned) {
    const rarityColor = Gacha.getRarityColor(card.rarity);
    const div = document.createElement('div');
    div.className = `card-mini rarity-${card.rarity} ${isOwned ? 'owned' : 'locked'}`;
    div.dataset.cardId = card.id;
    div.innerHTML = `
      <div class="card-mini-inner">
        <div class="card-mini-header" style="border-color:${rarityColor}">
          <span class="card-rarity-dot" style="background:${rarityColor}"></span>
          <span class="card-number">#${String(card.cardNumber).padStart(2,'0')}</span>
        </div>
        <div class="card-mini-body">
          <div class="card-era-badge">${card.era}</div>
          <div class="card-mini-title">${isOwned ? card.title : '???'}</div>
        </div>
        <div class="card-mini-footer">
          <span class="card-rarity-label" style="color:${rarityColor}">${Gacha.getRarityLabel(card.rarity)}</span>
        </div>
        ${!isOwned ? '<div class="card-lock">🔒</div>' : ''}
      </div>
    `;
    return div;
  }

  // Build a full card detail modal
  function openCardModal(card, player) {
    closeModal();
    const col = Storage.getCollection();
    const isOwned = (col[card.id] || 0) > 0;
    if (!isOwned) return;

    // Award FKS for reading
    const isFirstRead = Storage.markCardSeen(card.id);
    let fksAwarded = 0;
    if (isFirstRead) {
      fksAwarded = FKS.award('CARD_READ', card.title);
    }

    const rarityColor = Gacha.getRarityColor(card.rarity);
    const triviaAnswered = Storage.hasTriviaAnswered(card.id);
    const overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" style="--rarity-color:${rarityColor}">
        <button class="modal-close" onclick="UI.closeModal()">✕</button>
        <div class="modal-card-header">
          <div class="modal-player-name">${player.name}</div>
          <div class="modal-card-era">${card.era} · <span style="color:${rarityColor}">${Gacha.getRarityLabel(card.rarity)}</span></div>
          <div class="modal-card-title">${card.title}</div>
        </div>
        <div class="modal-section">
          <div class="modal-section-label">The Story</div>
          <p class="modal-story">${card.story}</p>
        </div>
        <div class="modal-section">
          <div class="modal-section-label">Historical Significance</div>
          <p class="modal-significance">${card.historicalSignificance}</p>
        </div>
        <div class="modal-trivia ${triviaAnswered ? 'trivia-done' : ''}" id="trivia-block">
          <div class="modal-section-label">Knowledge Check</div>
          ${triviaAnswered ? _renderTriviaResult(card) : _renderTriviaQuestion(card)}
        </div>
        ${fksAwarded > 0 ? `<div class="modal-fks-award">📖 +${fksAwarded} FKS awarded for reading</div>` : ''}
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    // Click outside to close
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  }

  function _renderTriviaQuestion(card) {
    return `
      <p class="trivia-question">${card.triviaQuestion}</p>
      <div class="trivia-options">
        ${card.triviaOptions.map((opt, i) => `
          <button class="trivia-btn" onclick="UI.answerTrivia('${card.id}', ${i}, ${card.triviaAnswer})">
            <span class="trivia-letter">${'ABCD'[i]}</span>${opt}
          </button>
        `).join('')}
      </div>
    `;
  }

  function _renderTriviaResult(card) {
    const result = Storage.getTriviaAnswered()[card.id];
    const icon = result.correct ? '✅' : '❌';
    const correct = card.triviaOptions[card.triviaAnswer];
    return `<p class="trivia-result">${icon} ${result.correct ? 'Correct!' : `Incorrect — the answer was: <strong>${correct}</strong>`}</p>`;
  }

  function answerTrivia(cardId, selectedIdx, correctIdx) {
    const card = App.getCard(cardId);
    if (!card) return;
    if (Storage.hasTriviaAnswered(cardId)) return;

    const correct = selectedIdx === correctIdx;
    Storage.markTriviaAnswered(cardId, correct);

    const awarded = correct
      ? FKS.award('TRIVIA_CORRECT', card.title)
      : FKS.award('TRIVIA_WRONG', card.title);

    // Update trivia block in modal
    const block = document.getElementById('trivia-block');
    if (block) {
      block.classList.add('trivia-done');
      block.innerHTML = `<div class="modal-section-label">Knowledge Check</div>` + _renderTriviaResult(card);
    }

    if (correct) {
      toast(`✅ Correct! +${awarded} FKS`, 'success');
      fksPopup(awarded, 'Trivia Correct');
    } else {
      toast(`❌ Not quite. +${awarded} FKS for trying`, 'error');
    }

    // Update FKS display if present
    updateFKSDisplay();
  }

  function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 300);
    }
  }

  function updateFKSDisplay() {
    const total = Storage.getFKSTotal();
    const level = FKS.getLevel(total);
    document.querySelectorAll('.fks-score').forEach(el => el.textContent = total.toLocaleString());
    document.querySelectorAll('.fks-level').forEach(el => el.textContent = level.icon + ' ' + level.name);
    document.querySelectorAll('.fks-bar-fill').forEach(el => {
      el.style.width = (FKS.getProgressToNext(total) * 100) + '%';
    });
  }

  // Countdown timer (calls callback with formatted string each second)
  function startCountdown(targetMs, el) {
    function tick() {
      const remaining = Math.max(0, targetMs - Date.now());
      if (el) el.textContent = formatTime(remaining);
      if (remaining > 0) setTimeout(tick, 1000);
    }
    tick();
  }

  // Nav active state
  function setActiveNav() {
    const path = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-link, .bottom-nav-link').forEach(a => {
      const href = a.getAttribute('href');
      a.classList.toggle('active', href === path);
    });
  }

  return {
    toast, fksPopup, formatTime,
    renderCardMini, openCardModal, closeModal,
    answerTrivia, updateFKSDisplay,
    startCountdown, setActiveNav
  };
})();
