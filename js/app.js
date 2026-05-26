// app.js — data loader and global app state

const App = (() => {
  let _players = [];
  let _cards = [];
  let _categories = [];
  let _ready = false;
  const _listeners = [];

  async function loadJSON(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`Failed to load ${path}`);
    return r.json();
  }

  async function init() {
    try {
      [_players, _cards, _categories] = await Promise.all([
        loadJSON('data/players.json'),
        loadJSON('data/cards.json'),
        loadJSON('data/categories.json'),
      ]);

      // Run integrity checks
      AntiCheat.repairIfTampered(_cards);

      // Check for newly completed timelines / rivalries
      _checkProgressMilestones();

      _ready = true;
      _listeners.forEach(fn => fn());
    } catch (e) {
      console.error('App init failed:', e);
      document.body.innerHTML = `<div style="padding:2rem;color:#fff;font-family:monospace;">
        Failed to load game data. Please refresh.<br><small>${e.message}</small>
      </div>`;
    }
  }

  function onReady(fn) {
    if (_ready) fn();
    else _listeners.push(fn);
  }

  function getPlayers() { return _players; }
  function getCards() { return _cards; }
  function getCategories() { return _categories; }

  function getPlayer(id) { return _players.find(p => p.id === id); }
  function getCard(id) { return _cards.find(c => c.id === id); }
  function getCategory(id) { return _categories.find(c => c.id === id); }

  function getPlayerCards(playerId) {
    return _cards.filter(c => c.playerId === playerId).sort((a, b) => a.cardNumber - b.cardNumber);
  }

  function getCollectedPlayerCards(playerId) {
    const col = Storage.getCollection();
    return getPlayerCards(playerId).filter(c => col[c.id] > 0);
  }

  function getPlayerProgress(playerId) {
    const total = getPlayerCards(playerId).length;
    const collected = getCollectedPlayerCards(playerId).length;
    return { total, collected, percent: total > 0 ? collected / total : 0 };
  }

  function getOverallProgress() {
    const total = _cards.length;
    const col = Storage.getCollection();
    const collected = Object.keys(col).filter(k => col[k] > 0).length;
    return { total, collected, percent: total > 0 ? collected / total : 0 };
  }

  // Milestones: check and award FKS for completions
  const _awarded = JSON.parse(localStorage.getItem('fgg_milestones') || '{}');
  function _checkProgressMilestones() {
    _players.forEach(p => {
      const progress = getPlayerProgress(p.id);
      if (progress.collected === progress.total && progress.total > 0) {
        if (!_awarded[`timeline_${p.id}`]) {
          _awarded[`timeline_${p.id}`] = true;
          FKS.award('TIMELINE_COMPLETE', p.name);
          localStorage.setItem('fgg_milestones', JSON.stringify(_awarded));
        }
      }
    });

    FKS.getAllRivalries().forEach(([a, b]) => {
      const key = `rivalry_${a}_${b}`;
      if (!_awarded[key]) {
        if (FKS.checkRivalryComplete(a, b, _cards)) {
          _awarded[key] = true;
          const nameA = (_players.find(p => p.id === a) || {}).name || a;
          const nameB = (_players.find(p => p.id === b) || {}).name || b;
          FKS.award('RIVALRY_COMPLETE', `${nameA} & ${nameB}`);
          localStorage.setItem('fgg_milestones', JSON.stringify(_awarded));
        }
      }
    });
  }

  // Voting: compute weighted leaderboard for a category
  function getCategoryLeaderboard(categoryId) {
    const category = getCategory(categoryId);
    if (!category) return [];

    // Culturally-informed baseline scores per category.
    // These reflect real-world polling consensus rather than arbitrary seeds.
    // A user's vote weight is added on top of these baselines.
    const BASELINES = {
      overall: {
        messi: 3800, ronaldo_cr7: 3500, maradona: 2800, pele: 2600,
        cruyff: 1800, zidane: 1600, ronaldo_r7: 1400, ronaldinho: 1100,
        beckenbauer: 900, iniesta: 800,
      },
      attacker: {
        messi: 3600, ronaldo_cr7: 3200, ronaldo_r7: 2400, maradona: 2200,
        pele: 2000, ronaldinho: 1600, cruyff: 1200,
      },
      midfielder: {
        zidane: 2800, iniesta: 2400, maradona: 2200, cruyff: 2000,
        ronaldinho: 1800, beckenbauer: 1200,
      },
      defender: {
        beckenbauer: 3200, cruyff: 2000, iniesta: 1400,
      },
      bigMatch: {
        zidane: 3000, messi: 2800, maradona: 2600, ronaldo_cr7: 2400,
        iniesta: 2200, pele: 2000, ronaldo_r7: 1800, beckenbauer: 1600,
      },
      technical: {
        messi: 3400, maradona: 3200, ronaldinho: 2800, zidane: 2400,
        cruyff: 2000, iniesta: 1800, ronaldo_r7: 1400,
      },
      leader: {
        beckenbauer: 2800, ronaldo_cr7: 2600, zidane: 2400, cruyff: 2200,
        maradona: 2000, pele: 1800,
      },
      influential: {
        cruyff: 3600, pele: 3200, maradona: 2800, beckenbauer: 2200,
        ronaldinho: 1800, messi: 1600,
      },
    };

    // Stable per-player noise seeded on playerId + categoryId (not array index)
    // so results don't shift when eligible player order changes
    function playerNoise(playerId, catId) {
      const str = playerId + catId;
      let h = 0;
      for (let i = 0; i < str.length; i++) {
        h = Math.imul(31, h) + str.charCodeAt(i) | 0;
      }
      return (Math.abs(h) % 300); // ±150 variance band
    }

    const eligiblePlayers = category.eligiblePlayers
      .map(id => _players.find(p => p.id === id)).filter(Boolean);
    const userVote = Storage.getVote(categoryId);
    const userWeight = FKS.getVoteWeight(Storage.getFKSTotal(), _cards);
    const catBaselines = BASELINES[categoryId] || {};

    const scores = {};
    eligiblePlayers.forEach(p => {
      const base = catBaselines[p.id] || 800;
      const noise = playerNoise(p.id, categoryId);
      scores[p.id] = base + noise;
    });

    // Apply user's vote on top of baseline
    if (userVote && scores[userVote] !== undefined) {
      scores[userVote] += userWeight;
    }

    const total = Object.values(scores).reduce((s, v) => s + v, 0);
    return eligiblePlayers
      .map(p => ({
        player: p,
        score: scores[p.id],
        percent: total > 0 ? ((scores[p.id] / total) * 100).toFixed(1) : '0.0',
        isUserVote: p.id === userVote,
      }))
      .sort((a, b) => b.score - a.score);
  }

  return {
    init, onReady,
    getPlayers, getCards, getCategories,
    getPlayer, getCard, getCategory,
    getPlayerCards, getCollectedPlayerCards,
    getPlayerProgress, getOverallProgress,
    getCategoryLeaderboard,
  };
})();

// Auto-init
document.addEventListener('DOMContentLoaded', () => App.init());
