// fks.js — Football Knowledge Score system

const FKS = (() => {
  const LEVELS = [
    { name: 'Rookie Fan',       min: 0,    max: 49,   color: '#888', icon: '⚽' },
    { name: 'Enthusiast',       min: 50,   max: 199,  color: '#4caf7d', icon: '📖' },
    { name: 'Historian',        min: 200,  max: 499,  color: '#5b9bd5', icon: '📚' },
    { name: 'Tactical Analyst', min: 500,  max: 999,  color: '#c8a84b', icon: '🔭' },
    { name: 'Football Sage',    min: 1000, max: Infinity, color: '#c0392b', icon: '🧠' },
  ];

  const REWARDS = {
    CARD_PULLED:      { amount: 1,  label: 'New card pulled' },
    CARD_READ:        { amount: 3,  label: 'Card story read' },
    TRIVIA_CORRECT:   { amount: 10, label: 'Trivia answered correctly' },
    TRIVIA_WRONG:     { amount: 1,  label: 'Trivia attempted' },
    TIMELINE_COMPLETE:{ amount: 25, label: 'Player timeline completed' },
    RIVALRY_COMPLETE: { amount: 20, label: 'Rivalry set unlocked' },
    PLAYER_SET_FULL:  { amount: 35, label: 'Full player set collected' },
  };

  function getLevel(score) {
    return LEVELS.find(l => score >= l.min && score <= l.max) || LEVELS[0];
  }

  function getNextLevel(score) {
    const idx = LEVELS.findIndex(l => score >= l.min && score <= l.max);
    return idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
  }

  function getProgressToNext(score) {
    const current = getLevel(score);
    const next = getNextLevel(score);
    if (!next) return 1;
    const range = next.min - current.min;
    const progress = score - current.min;
    return Math.min(1, progress / range);
  }

  function award(type, extraLabel) {
    const reward = REWARDS[type];
    if (!reward) return 0;
    const label = extraLabel ? `${reward.label}: ${extraLabel}` : reward.label;
    const newTotal = Storage.addFKS(reward.amount, label);
    return reward.amount;
  }

  // Breadth: how many distinct players and eras the user has unlocked cards for
  function getBreadth(allCards) {
    const collection = Storage.getCollection();
    const ownedCardIds = Object.keys(collection).filter(k => collection[k] > 0);
    const playersSeen = new Set();
    const erasSeen = new Set();

    ownedCardIds.forEach(cardId => {
      const card = allCards.find(c => c.id === cardId);
      if (card) {
        playersSeen.add(card.playerId);
        erasSeen.add(card.era);
      }
    });

    return {
      players: playersSeen.size,
      eras: erasSeen.size,
      total: playersSeen.size + erasSeen.size
    };
  }

  // Vote weight: FKS capped by breadth diversity
  function getVoteWeight(fksTotal, allCards) {
    const breadth = getBreadth(allCards);
    // Base: full FKS up to breadth gating
    // Need at least 3 players for 60% weight, 5 for 80%, 7 for 100%
    let multiplier = 0.3;
    if (breadth.players >= 3) multiplier = 0.6;
    if (breadth.players >= 5) multiplier = 0.8;
    if (breadth.players >= 7) multiplier = 1.0;
    return Math.round(fksTotal * multiplier);
  }

  function checkTimelineComplete(playerId, allCards) {
    const playerCards = allCards.filter(c => c.playerId === playerId);
    const collection = Storage.getCollection();
    return playerCards.every(c => (collection[c.id] || 0) > 0);
  }

  // Rivalry checks now delegate to App which loads from rivalries.json
  // These stubs remain for backwards compatibility during init
  function checkRivalryComplete(playerA, playerB, allCards) {
    return checkTimelineComplete(playerA, allCards) &&
           checkTimelineComplete(playerB, allCards);
  }

  function getCompletedRivalries(allCards) {
    // Delegate to App once loaded; during early init return empty
    if (typeof App !== 'undefined' && App.getRivalries) {
      return App.getRivalries()
        .filter(r => checkRivalryComplete(r.playerA, r.playerB, allCards))
        .map(r => [r.playerA, r.playerB]);
    }
    return [];
  }

  function getAllRivalries() {
    if (typeof App !== 'undefined' && App.getRivalries) {
      return App.getRivalries().map(r => [r.playerA, r.playerB]);
    }
    return [];
  }

  function getAllLevels()   { return LEVELS; }
  function getAllRewards()  { return REWARDS; }

  return {
    getLevel, getNextLevel, getProgressToNext,
    award, getBreadth, getVoteWeight,
    checkTimelineComplete, checkRivalryComplete,
    getCompletedRivalries, getAllRivalries,
    getAllLevels, getAllRewards,
    REWARDS
  };
})();
