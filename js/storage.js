// storage.js — single source of truth for all persistent state

const Storage = (() => {
  const KEYS = {
    COLLECTION: 'fgg_collection',
    FKS: 'fgg_fks',
    VOTES: 'fgg_votes',
    LAST_PACK: 'fgg_last_pack',
    TRIVIA_DONE: 'fgg_trivia',
    DEVICE_ID: 'fgg_device_id',
    PULL_LOG: 'fgg_pull_log',
    SEEN_CARDS: 'fgg_seen',
  };

  function get(key) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  }

  function set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      if (e instanceof DOMException && (
        e.code === 22 ||              // QuotaExceededError
        e.code === 1014 ||            // NS_ERROR_DOM_QUOTA_REACHED (Firefox)
        e.name === 'QuotaExceededError' ||
        e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      )) {
        // Storage full — prune oldest FKS log entries and retry once
        try {
          const fksData = JSON.parse(localStorage.getItem(KEYS.FKS) || '{"total":0,"log":[]}');
          if (fksData.log && fksData.log.length > 50) {
            fksData.log = fksData.log.slice(-50);
            localStorage.setItem(KEYS.FKS, JSON.stringify(fksData));
          }
          localStorage.setItem(key, JSON.stringify(value));
          return true;
        } catch { return false; }
      }
      return false;
    }
  }

  // --- Device ID ---
  function getDeviceId() {
    let id = get(KEYS.DEVICE_ID);
    if (!id) {
      id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      set(KEYS.DEVICE_ID, id);
    }
    return id;
  }

  // --- Collection ---
  function getCollection() {
    return get(KEYS.COLLECTION) || {};
  }

  function addCard(cardId) {
    const col = getCollection();
    col[cardId] = (col[cardId] || 0) + 1;
    set(KEYS.COLLECTION, col);
  }

  function hasCard(cardId) {
    const col = getCollection();
    return (col[cardId] || 0) > 0;
  }

  function getCardCount(cardId) {
    return getCollection()[cardId] || 0;
  }

  // --- FKS ---
  function getFKS() {
    return get(KEYS.FKS) || { total: 0, log: [] };
  }

  function addFKS(amount, reason) {
    const data = getFKS();
    data.total += amount;
    data.log.push({ amount, reason, ts: Date.now() });
    if (data.log.length > 200) data.log = data.log.slice(-200);
    set(KEYS.FKS, data);
    return data.total;
  }

  function getFKSTotal() {
    return getFKS().total;
  }

  // --- Trivia ---
  function getTriviaAnswered() {
    return get(KEYS.TRIVIA_DONE) || {};
  }

  function markTriviaAnswered(cardId, correct) {
    const done = getTriviaAnswered();
    done[cardId] = { correct, ts: Date.now() };
    set(KEYS.TRIVIA_DONE, done);
  }

  function hasTriviaAnswered(cardId) {
    return !!getTriviaAnswered()[cardId];
  }

  // --- Seen Cards ---
  function getSeenCards() {
    return get(KEYS.SEEN_CARDS) || {};
  }

  function markCardSeen(cardId) {
    const seen = getSeenCards();
    if (!seen[cardId]) {
      seen[cardId] = Date.now();
      set(KEYS.SEEN_CARDS, seen);
      return true; // first time
    }
    return false;
  }

  // --- Votes ---
  function getVotes() {
    return get(KEYS.VOTES) || {};
  }

  function setVote(categoryId, playerId) {
    const votes = getVotes();
    votes[categoryId] = { playerId, ts: Date.now() };
    set(KEYS.VOTES, votes);
  }

  function getVote(categoryId) {
    return (getVotes()[categoryId] || {}).playerId || null;
  }

  // --- Pack Timing ---
  function getLastPackTime() {
    return get(KEYS.LAST_PACK) || 0;
  }

  function setLastPackTime() {
    set(KEYS.LAST_PACK, Date.now());
  }

  function canOpenPack() {
    const last = getLastPackTime();
    const cooldown = 6 * 60 * 60 * 1000; // 6 hours
    return Date.now() - last > cooldown;
  }

  function timeUntilNextPack() {
    const last = getLastPackTime();
    const cooldown = 6 * 60 * 60 * 1000;
    const remaining = cooldown - (Date.now() - last);
    return Math.max(0, remaining);
  }

  // --- Pull Log (anti-cheat) ---
  function logPull(cards) {
    const log = get(KEYS.PULL_LOG) || [];
    log.push({ cards, ts: Date.now() });
    if (log.length > 100) log.splice(0, log.length - 100);
    set(KEYS.PULL_LOG, log);
  }

  // --- Stats ---
  function getStats() {
    const col = getCollection();
    const seen = getSeenCards();
    const trivia = getTriviaAnswered();
    const uniqueCards = Object.keys(col).filter(k => col[k] > 0).length;
    const seenCount = Object.keys(seen).length;
    const triviaCorrect = Object.values(trivia).filter(v => v.correct).length;
    return { uniqueCards, seenCount, triviaCorrect };
  }

  // --- Reset (dev) ---
  function reset() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  }

  return {
    getDeviceId,
    getCollection, addCard, hasCard, getCardCount,
    getFKS, addFKS, getFKSTotal,
    getTriviaAnswered, markTriviaAnswered, hasTriviaAnswered,
    getSeenCards, markCardSeen,
    getVotes, setVote, getVote,
    getLastPackTime, setLastPackTime, canOpenPack, timeUntilNextPack,
    logPull, getStats, reset,
    KEYS
  };
})();
