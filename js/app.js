// app.js — data loader and global app state

const App = (() => {
  let _players = [];
  let _cards = [];
  let _trivia = [];
  let _categories = [];
  let _rivalries = [];
  let _voteConfig = {};
  let _ready = false;
  const _listeners = [];

  async function loadJSON(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`Failed to load ${path}`);
    return r.json();
  }

  async function init() {
    try {
      [_players, _cards, _trivia, _categories, _rivalries, _voteConfig] = await Promise.all([
        loadJSON('data/players.json'),
        loadJSON('data/cards.json'),
        loadJSON('data/trivia.json'),
        loadJSON('data/categories.json'),
        loadJSON('data/rivalries.json'),
        loadJSON('data/voteConfig.json'),
      ]);

      // Attach trivia back to cards at runtime (keeps data files clean but UI access simple)
      _trivia.forEach(t => {
        const card = _cards.find(c => c.id === t.cardId);
        if (card) {
          card._trivia = t;
        }
      });

      // Apply FKS thresholds from voteConfig to categories
      const thresholds = _voteConfig.categoryFKSThresholds || {};
      _categories.forEach(cat => {
        if (thresholds[cat.id] !== undefined) {
          cat.minFKS = thresholds[cat.id];
        }
      });

      // Apply pack settings to storage/gacha constants
      if (_voteConfig.packSettings) {
        const ps = _voteConfig.packSettings;
        if (ps.cooldownHours) {
          Storage._setCooldown(ps.cooldownHours * 60 * 60 * 1000);
        }
      }

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

  function getPlayers()    { return _players; }
  function getCards()      { return _cards; }
  function getTrivia()     { return _trivia; }
  function getCategories() { return _categories; }
  function getRivalries()  { return _rivalries; }
  function getVoteConfig() { return _voteConfig; }

  function getPlayer(id)   { return _players.find(p => p.id === id); }
  function getCard(id)     { return _cards.find(c => c.id === id); }
  function getCategory(id) { return _categories.find(c => c.id === id); }
  function getRivalry(id)  { return _rivalries.find(r => r.id === id); }
  function getCardTrivia(cardId) { return _trivia.find(t => t.cardId === cardId); }

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

  // Rivalries helpers
  function checkRivalryComplete(rivalryId) {
    const rivalry = getRivalry(rivalryId);
    if (!rivalry) return false;
    return (
      getPlayerProgress(rivalry.playerA).percent === 1 &&
      getPlayerProgress(rivalry.playerB).percent === 1
    );
  }

  function getCompletedRivalries() {
    return _rivalries.filter(r => checkRivalryComplete(r.id));
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

    _rivalries.forEach(r => {
      const key = `rivalry_${r.id}`;
      if (!_awarded[key] && checkRivalryComplete(r.id)) {
        _awarded[key] = true;
        FKS.award('RIVALRY_COMPLETE', r.name);
        localStorage.setItem('fgg_milestones', JSON.stringify(_awarded));
      }
    });
  }

  // Voting: compute weighted leaderboard for a category
  function getCategoryLeaderboard(categoryId) {
    const category = getCategory(categoryId);
    if (!category) return [];

    // Culturally-informed baseline scores per category.
    // Reflect real-world polling consensus. User vote weight added on top.
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

    function playerNoise(playerId, catId) {
      const str = playerId + catId;
      let h = 0;
      for (let i = 0; i < str.length; i++) {
        h = Math.imul(31, h) + str.charCodeAt(i) | 0;
      }
      return (Math.abs(h) % 300);
    }

    const eligiblePlayers = category.eligiblePlayers
      .map(id => _players.find(p => p.id === id)).filter(Boolean);
    const userVote   = Storage.getVote(categoryId);
    const userWeight = FKS.getVoteWeight(Storage.getFKSTotal(), _cards);
    const catBaselines = BASELINES[categoryId] || {};

    const scores = {};
    eligiblePlayers.forEach(p => {
      const base  = catBaselines[p.id] || 800;
      const noise = playerNoise(p.id, categoryId);
      scores[p.id] = base + noise;
    });

    if (userVote && scores[userVote] !== undefined) {
      scores[userVote] += userWeight;
    }

    const total = Object.values(scores).reduce((s, v) => s + v, 0);
    return eligiblePlayers
      .map(p => ({
        player:     p,
        score:      scores[p.id],
        percent:    total > 0 ? ((scores[p.id] / total) * 100).toFixed(1) : '0.0',
        isUserVote: p.id === userVote,
      }))
      .sort((a, b) => b.score - a.score);
  }

  return {
    init, onReady,
    getPlayers, getCards, getTrivia, getCategories, getRivalries, getVoteConfig,
    getPlayer, getCard, getCategory, getRivalry, getCardTrivia,
    getPlayerCards, getCollectedPlayerCards,
    getPlayerProgress, getOverallProgress,
    checkRivalryComplete, getCompletedRivalries,
    getCategoryLeaderboard,
  };
})();

// Auto-init
document.addEventListener('DOMContentLoaded', () => App.init());
