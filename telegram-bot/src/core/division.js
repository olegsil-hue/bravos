'use strict';

// Портировано из football-heroes-live.html (smartDivide, optimizeTeamBalance).
// players: [{ name, pos1, pos2, totalRating }]

function smartDivide(players, teamCount) {
  const baseSize = Math.floor(players.length / teamCount);
  const extraSlots = players.length % teamCount;

  const gkPrimary = players.filter(p => p.pos1 === 'GK').sort((a, b) => b.totalRating - a.totalRating);
  const gkSecondary = players.filter(p => p.pos2 === 'GK' && p.pos1 !== 'GK').sort((a, b) => b.totalRating - a.totalRating);

  const positionGroups = {};
  players.forEach(p => {
    if (p.pos1 !== 'GK') {
      const key = p.pos2 ? `${p.pos1}/${p.pos2}` : p.pos1;
      if (!positionGroups[key]) positionGroups[key] = [];
      positionGroups[key].push(p);
    }
  });
  Object.keys(positionGroups).forEach(key => positionGroups[key].sort((a, b) => b.totalRating - a.totalRating));

  const teams = Array(teamCount).fill(null).map((_, i) => ({
    players: [],
    totalRating: 0,
    def: 0, mid: 0, st: 0,
    gk: 0,
    positionSets: {},
    slotsLeft: baseSize + (i < extraSlots ? 1 : 0),
  }));

  const usedPlayers = new Set();

  for (let i = 0; i < Math.min(teamCount, gkPrimary.length); i++) {
    const gk = gkPrimary[i];
    teams[i].players.push(gk);
    teams[i].totalRating += gk.totalRating;
    teams[i].slotsLeft--;
    teams[i].gk++;
    usedPlayers.add(gk);
  }
  for (let i = gkPrimary.length; i < teamCount; i++) {
    for (const gk of gkSecondary) {
      if (!usedPlayers.has(gk)) {
        teams[i].players.push(gk);
        teams[i].totalRating += gk.totalRating;
        teams[i].slotsLeft--;
        teams[i].gk++;
        usedPlayers.add(gk);
        break;
      }
    }
  }

  const positionKeys = Object.keys(positionGroups).sort((a, b) => positionGroups[b].length - positionGroups[a].length);

  for (const posKey of positionKeys) {
    for (const player of positionGroups[posKey]) {
      if (usedPlayers.has(player)) continue;
      let bestTeam = -1, bestScore = -Infinity;
      for (let i = 0; i < teamCount; i++) {
        if (teams[i].slotsLeft <= 0) continue;
        const currentCount = teams[i].positionSets[posKey] || 0;
        if (currentCount >= 3) continue;
        const score = -(teams[i].totalRating) * 1000 - currentCount * 100 + teams[i].slotsLeft;
        if (bestTeam === -1 || score > bestScore) { bestTeam = i; bestScore = score; }
      }
      if (bestTeam !== -1) {
        const team = teams[bestTeam];
        team.players.push(player);
        team.totalRating += player.totalRating;
        team.slotsLeft--;
        if (player.pos1 === 'DEF') team.def++;
        else if (player.pos1 === 'MID') team.mid++;
        else if (player.pos1 === 'ST') team.st++;
        team.positionSets[posKey] = (team.positionSets[posKey] || 0) + 1;
        usedPlayers.add(player);
      }
    }
  }

  players.forEach(player => {
    if (usedPlayers.has(player)) return;
    let bestTeam = -1;
    for (let i = 0; i < teamCount; i++) {
      if (teams[i].slotsLeft <= 0) continue;
      if (bestTeam === -1 || teams[i].totalRating < teams[bestTeam].totalRating) bestTeam = i;
    }
    if (bestTeam !== -1) {
      const team = teams[bestTeam];
      team.players.push(player);
      team.totalRating += player.totalRating;
      team.slotsLeft--;
      if (player.pos1 === 'DEF') team.def++;
      else if (player.pos1 === 'MID') team.mid++;
      else if (player.pos1 === 'ST') team.st++;
      usedPlayers.add(player);
    }
  });

  return teams;
}

function optimizeTeamBalance(teams) {
  let improved = true, iterations = 0;
  const maxIterations = 50;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 0; i < teams.length; i++) {
      const hasSTinTeam = teams[i].players.some(p => p.pos1 === 'ST' || p.pos2 === 'ST');
      if (!hasSTinTeam) {
        for (let j = 0; j < teams.length; j++) {
          if (i === j) continue;
          const stPlayerIdx = teams[j].players.findIndex(p => p.pos1 === 'ST' || p.pos2 === 'ST');
          if (stPlayerIdx !== -1) {
            const stPlayer = teams[j].players[stPlayerIdx];
            for (let p = 0; p < teams[i].players.length; p++) {
              const player = teams[i].players[p];
              if (player.pos1 === 'GK') continue;
              teams[i].players[p] = stPlayer;
              teams[j].players[stPlayerIdx] = player;
              teams[i].totalRating = teams[i].totalRating - player.totalRating + stPlayer.totalRating;
              teams[j].totalRating = teams[j].totalRating - stPlayer.totalRating + player.totalRating;
              improved = true;
              break;
            }
            if (improved) break;
          }
        }
        if (improved) break;
      }
    }
    if (improved) continue;

    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const team1 = teams[i], team2 = teams[j];
        if (Math.abs(team1.totalRating - team2.totalRating) < 0.1) continue;
        const strongTeam = team1.totalRating > team2.totalRating ? team1 : team2;
        const weakTeam = team1.totalRating > team2.totalRating ? team2 : team1;
        let bestSwap = null, bestImprovement = 0;

        for (let p1 = 0; p1 < strongTeam.players.length; p1++) {
          const player1 = strongTeam.players[p1];
          const pos1 = player1.pos2 ? `${player1.pos1}/${player1.pos2}` : player1.pos1;
          if (player1.pos1 === 'GK') continue;
          if ((player1.pos1 === 'ST' || player1.pos2 === 'ST') &&
              strongTeam.players.filter(p => p.pos1 === 'ST' || p.pos2 === 'ST').length === 1) continue;

          for (let p2 = 0; p2 < weakTeam.players.length; p2++) {
            const player2 = weakTeam.players[p2];
            const pos2 = player2.pos2 ? `${player2.pos1}/${player2.pos2}` : player2.pos1;
            if (player2.pos1 === 'GK') continue;
            if ((player2.pos1 === 'ST' || player2.pos2 === 'ST') &&
                weakTeam.players.filter(p => p.pos1 === 'ST' || p.pos2 === 'ST').length === 1) continue;
            if (pos1 !== pos2) continue;

            const currentDiff = Math.abs(strongTeam.totalRating - weakTeam.totalRating);
            const newStrongRating = strongTeam.totalRating - player1.totalRating + player2.totalRating;
            const newWeakRating = weakTeam.totalRating - player2.totalRating + player1.totalRating;
            const newDiff = Math.abs(newStrongRating - newWeakRating);
            const improvement = currentDiff - newDiff;
            if (improvement > bestImprovement) { bestImprovement = improvement; bestSwap = { p1, p2, player1, player2 }; }
          }
        }

        if (bestSwap && bestImprovement > 0.01) {
          const { p1, p2, player1, player2 } = bestSwap;
          strongTeam.players[p1] = player2;
          weakTeam.players[p2] = player1;
          strongTeam.totalRating = strongTeam.totalRating - player1.totalRating + player2.totalRating;
          weakTeam.totalRating = weakTeam.totalRating - player2.totalRating + player1.totalRating;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }
  return teams;
}

module.exports = { smartDivide, optimizeTeamBalance };
