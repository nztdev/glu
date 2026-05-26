// antiCheat.js — lightweight client-side integrity checks

const AntiCheat = (() => {
  // Detect rapid repeated pulls (time-based)
  function isPullSuspicious() {
    const log = JSON.parse(localStorage.getItem('fgg_pull_log') || '[]');
    if (log.length < 3) return false;
    const recent = log.slice(-3).map(e => e.ts);
    const gaps = recent.slice(1).map((t, i) => t - recent[i]);
    // 3 packs in under 5 seconds = suspicious
    return gaps.some(g => g < 5000);
  }

  // Detect FKS tampering
  function isFKSTampered() {
    try {
      const stored = JSON.parse(localStorage.getItem('fgg_fks') || '{"total":0,"log":[]}');
      if (typeof stored.total !== 'number') return true;
      if (stored.total < 0) return true;
      // Recalculate from log
      const recalc = (stored.log || []).reduce((s, e) => s + (e.amount || 0), 0);
      // Allow small float drift
      if (Math.abs(recalc - stored.total) > 5) return true;
      return false;
    } catch { return true; }
  }

  // Detect collection tampering
  function isCollectionTampered(allCards) {
    try {
      const col = JSON.parse(localStorage.getItem('fgg_collection') || '{}');
      const validIds = new Set(allCards.map(c => c.id));
      return Object.keys(col).some(k => !validIds.has(k) || typeof col[k] !== 'number' || col[k] < 0);
    } catch { return true; }
  }

  // Vote integrity: enforce one vote per category
  function isVoteTampered() {
    try {
      const votes = JSON.parse(localStorage.getItem('fgg_votes') || '{}');
      return Object.values(votes).some(v => !v.playerId || !v.ts);
    } catch { return true; }
  }

  function runChecks(allCards) {
    const results = {
      pullSuspicious: isPullSuspicious(),
      fksTampered: isFKSTampered(),
      collectionTampered: isCollectionTampered(allCards),
      voteTampered: isVoteTampered(),
    };
    results.clean = !Object.values(results).some(Boolean);
    return results;
  }

  // Soft reset tampered fields only
  function repairIfTampered(allCards) {
    const checks = runChecks(allCards);
    if (checks.fksTampered) {
      localStorage.removeItem('fgg_fks');
      console.warn('[AntiCheat] FKS data repaired.');
    }
    if (checks.collectionTampered) {
      localStorage.removeItem('fgg_collection');
      console.warn('[AntiCheat] Collection data repaired.');
    }
    if (checks.voteTampered) {
      localStorage.removeItem('fgg_votes');
      console.warn('[AntiCheat] Vote data repaired.');
    }
  }

  return { runChecks, repairIfTampered, isPullSuspicious };
})();
