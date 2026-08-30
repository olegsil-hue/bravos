'use strict';

// Портировано из football-heroes-live.html (computePlayerGameStats,
// computeStandings, computeDayPersonalStats).

function computePlayerGameStats(gameDays) {
  const playerStats = {};
  const bump = (name, goals, assists) => {
    if (!playerStats[name]) playerStats[name] = { goals: 0, assists: 0, games: 0 };
    playerStats[name].goals += goals;
    playerStats[name].assists += assists;
    playerStats[name].games += 1;
  };

  gameDays.forEach(day => {
    if (day.legacy) {
      day.legacyStats.forEach(team => team.forEach(p => bump(p.name, p.goals, p.assists)));
    } else if ((day.matches || []).length === 0 && Array.isArray(day.personalStats)) {
      day.personalStats.forEach(p => bump(p.name, p.goals, p.assists));
    } else {
      const seenToday = new Set();
      const touch = name => {
        if (!playerStats[name]) playerStats[name] = { goals: 0, assists: 0, games: 0 };
        if (!seenToday.has(name)) { playerStats[name].games += 1; seenToday.add(name); }
      };
      (day.matches || []).forEach(m => {
        [...(m.scorersA || []), ...(m.scorersB || [])].forEach(s => {
          touch(s.name);
          playerStats[s.name].goals += s.goals;
          if (s.assist) { touch(s.assist); playerStats[s.assist].assists += s.goals; }
        });
      });
      (day.teams || []).forEach(t => t.players.forEach(name => {
        if (!seenToday.has(name)) {
          if (!playerStats[name]) playerStats[name] = { goals: 0, assists: 0, games: 0 };
          playerStats[name].games += 1;
          seenToday.add(name);
        }
      }));
    }
  });

  return playerStats;
}

function computeStandings(day) {
  const table = day.teams.map((t, i) => ({ idx: i, name: t.name, gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
  (day.matches || []).forEach(m => {
    const a = table[m.teamAIdx], b = table[m.teamBIdx];
    if (!a || !b) return;
    a.gp++; b.gp++;
    a.gf += m.scoreA; a.ga += m.scoreB;
    b.gf += m.scoreB; b.ga += m.scoreA;
    if (m.scoreA > m.scoreB) { a.w++; b.l++; a.pts += 3; }
    else if (m.scoreA < m.scoreB) { b.w++; a.l++; b.pts += 3; }
    else if (m.wonByPenalties === m.teamAIdx) { a.w++; b.l++; a.pts += 3; }
    else if (m.wonByPenalties === m.teamBIdx) { b.w++; a.l++; b.pts += 3; }
    else { a.d++; b.d++; a.pts += 1; b.pts += 1; }
  });
  return table.sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
}

function computeDayPersonalStats(day) {
  const stats = {};
  const ensure = (name, teamIdx) => {
    if (!stats[name]) stats[name] = { name, teamIdx, goals: 0, assists: 0 };
    return stats[name];
  };
  (day.matches || []).forEach(m => {
    (m.scorersA || []).forEach(s => {
      ensure(s.name, m.teamAIdx).goals += s.goals;
      if (s.assist) ensure(s.assist, m.teamAIdx).assists += s.goals;
    });
    (m.scorersB || []).forEach(s => {
      ensure(s.name, m.teamBIdx).goals += s.goals;
      if (s.assist) ensure(s.assist, m.teamBIdx).assists += s.goals;
    });
  });
  return Object.values(stats).sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists) || b.goals - a.goals);
}

module.exports = { computePlayerGameStats, computeStandings, computeDayPersonalStats };
