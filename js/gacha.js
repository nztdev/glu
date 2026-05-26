// gacha.js — card pull logic

const Gacha = (() => {
  const RARITY_WEIGHTS = {
    common:    55,
    rare:      28,
    epic:      12,
    legendary:  5,
  };

  const PACK_SIZE = 5;
  const PITY_LEGENDARY = 40; // guaranteed legendary every 40 pulls (tracked by pulls since last legendary)

  function weightedRandom(weights) {
    const entries = Object.entries(weights);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [key, w] of entries) {
      r -= w;
      if (r <= 0) return key;
    }
    return entries[entries.length - 1][0];
  }

  function pullRarity(forceLegendary = false) {
    if (forceLegendary) return 'legendary';
    return weightedRandom(RARITY_WEIGHTS);
  }

  function selectCard(allCards, rarity, collection) {
    const pool = allCards.filter(c => c.rarity === rarity);
    if (pool.length === 0) return selectCard(allCards, 'common', collection);

    // Prefer cards the player doesn't have yet
    const unowned = pool.filter(c => !(collection[c.id] > 0));
    const source = unowned.length > 0 ? unowned : pool;
    return source[Math.floor(Math.random() * source.length)];
  }

  function pull(allCards, count = PACK_SIZE) {
    const collection = Storage.getCollection();
    const pulled = [];
    let pullsSinceLegendary = parseInt(localStorage.getItem('fgg_pity') || '0');

    for (let i = 0; i < count; i++) {
      pullsSinceLegendary++;
      const forceLegendary = pullsSinceLegendary >= PITY_LEGENDARY;
      const rarity = pullRarity(forceLegendary);
      if (rarity === 'legendary') pullsSinceLegendary = 0;

      const card = selectCard(allCards, rarity, collection);
      pulled.push(card);
    }

    localStorage.setItem('fgg_pity', pullsSinceLegendary.toString());

    // Persist and award FKS
    pulled.forEach(card => {
      const isNew = !(collection[card.id] > 0);
      Storage.addCard(card.id);
      if (isNew) {
        FKS.award('CARD_PULLED', card.title);
      }
    });

    Storage.setLastPackTime();
    Storage.logPull(pulled.map(c => c.id));

    return pulled;
  }

  function getRarityColor(rarity) {
    return {
      common:    '#8a9bb0',
      rare:      '#4a90d9',
      epic:      '#9b59b6',
      legendary: '#f0a500',
    }[rarity] || '#888';
  }

  function getRarityLabel(rarity) {
    return rarity.charAt(0).toUpperCase() + rarity.slice(1);
  }

  return { pull, getRarityColor, getRarityLabel, PACK_SIZE };
})();
