'use strict';

// Сопоставление коротких имён из чат-лога («Иван», «Леша Зайцев») с полными
// именами в составе команды. Ищем только внутри указанной команды, чтобы
// не приписать гол однофамильцу с другой стороны.

function normalizeHint(raw) {
  return (raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const HINT_ALIASES = {
  'иван': ['Ваня от Клюшина', 'Иван от Ивана'],
  'ваня': ['Ваня от Клюшина'],
  'илья': ['Илья Сыван'],
  'паша': ['Паша Тренин', 'Паша Вирник', 'Паша Орлов', 'Паша Пахомов'],
  'борисов': ['Антон Борисов'],
  'антон борисов': ['Антон Борисов'],
  'князев': ['Дима Князев'],
  'дима князев': ['Дима Князев'],
  'леша зайцев': ['Алексей Зайцев'],
  'лёша зайцев': ['Алексей Зайцев'],
  'зайцев': ['Алексей Зайцев'],
  'алексей зайцев': ['Алексей Зайцев'],
  'олег и': ['Олег Иохин'],
  'олег иохин': ['Олег Иохин'],
  'артем': ['Артем от Димы'],
  'артём': ['Артем от Димы'],
  'артем от димы': ['Артем от Димы'],
};

function unique(arr) {
  return [...new Set(arr)];
}

function resolvePlayerOnTeam(teamPlayers, hint) {
  if (!hint) return null;
  const players = teamPlayers || [];
  const n = normalizeHint(hint);
  if (!n) return null;

  const exact = players.find(p => normalizeHint(p) === n);
  if (exact) return exact;

  const aliases = HINT_ALIASES[n] || [];
  const aliasHits = unique(aliases.filter(name => players.includes(name)));
  if (aliasHits.length === 1) return aliasHits[0];

  const substrHits = unique(players.filter(p => {
    const pn = normalizeHint(p);
    return pn.includes(n) || n.split(' ').filter(part => part.length >= 4).some(part => pn.includes(part));
  }));
  if (substrHits.length === 1) return substrHits[0];

  if (aliasHits.length > 1 || substrHits.length > 1) {
    throw new Error(`«${hint}» неоднозначно среди игроков команды: ${(aliasHits.length ? aliasHits : substrHits).join(', ')}`);
  }
  throw new Error(`Не удалось сопоставить «${hint}» среди игроков команды: ${players.join(', ') || '(пусто)'}`);
}

function resolveScorers(teamPlayers, scorers) {
  return (scorers || []).map(s => {
    const name = resolvePlayerOnTeam(teamPlayers, s.name);
    const resolved = { name, goals: s.goals || 1 };
    if (s.assist) resolved.assist = resolvePlayerOnTeam(teamPlayers, s.assist);
    return resolved;
  });
}

function resolveMatch(teams, match) {
  const teamA = (teams[match.teamAIdx] && teams[match.teamAIdx].players) || [];
  const teamB = (teams[match.teamBIdx] && teams[match.teamBIdx].players) || [];
  return {
    teamAIdx: match.teamAIdx,
    teamBIdx: match.teamBIdx,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    scorersA: resolveScorers(teamA, match.scorersA),
    scorersB: resolveScorers(teamB, match.scorersB),
    ...(match.wonByPenalties !== undefined ? { wonByPenalties: match.wonByPenalties } : {}),
  };
}

function samePairAndScore(a, b) {
  return a.teamAIdx === b.teamAIdx && a.teamBIdx === b.teamBIdx && a.scoreA === b.scoreA && a.scoreB === b.scoreB;
}

function samePair(a, b) {
  return a.teamAIdx === b.teamAIdx && a.teamBIdx === b.teamBIdx;
}

function matchesAlreadyApplied(existing, incoming) {
  if (!incoming.length || existing.length < incoming.length) return false;
  const tail = existing.slice(-incoming.length);
  return tail.every((m, i) => samePairAndScore(m, incoming[i]));
}

/** Дописывает матчи в конец дня. Если последняя записанная игра — та же пара,
 *  что первая в патче (бот завис на ней), заменяем её, а не дублируем. */
function applyAppend(existing, incoming) {
  if (matchesAlreadyApplied(existing, incoming)) return existing;
  if (existing.length > 0 && incoming.length > 0 && samePair(existing[existing.length - 1], incoming[0])) {
    return [...existing.slice(0, -1), ...incoming];
  }
  return [...existing, ...incoming];
}

function datesMatch(stored, wanted) {
  if (!stored || !wanted) return false;
  if (stored === wanted) return true;
  // «2026-09-16» ↔ «16.09» / «16.09.2026»
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stored);
  if (iso) {
    const dmy = `${iso[3]}.${iso[2]}`;
    const dmyYear = `${iso[3]}.${iso[2]}.${iso[1]}`;
    return wanted === dmy || wanted === dmyYear || wanted === stored;
  }
  return false;
}

/** Победитель остаётся, проигравший уступает место отдыхавшей команде. */
function winnerStaysNext({ teamAIdx, teamBIdx, sittingOutIdx, scoreA, scoreB, teamCount, wonByPenalties }) {
  const winnerIdx = wonByPenalties !== null && wonByPenalties !== undefined
    ? wonByPenalties
    : (scoreA > scoreB ? teamAIdx : (scoreB > scoreA ? teamBIdx : null));
  const loserIdx = winnerIdx === null ? null
    : (winnerIdx === teamAIdx ? teamBIdx : teamAIdx);
  if (teamCount < 3 || sittingOutIdx === null || sittingOutIdx === undefined) {
    return { nextA: teamAIdx, nextB: teamBIdx, nextSittingOut: null, winnerIdx, loserIdx };
  }
  if (winnerIdx === null) {
    return { nextA: teamAIdx, nextB: teamBIdx, nextSittingOut: sittingOutIdx, winnerIdx, loserIdx };
  }
  return { nextA: winnerIdx, nextB: sittingOutIdx, nextSittingOut: loserIdx, winnerIdx, loserIdx };
}

function sittingOutIdxForPair(teamCount, teamAIdx, teamBIdx) {
  if (teamCount < 3) return null;
  for (let i = 0; i < teamCount; i++) {
    if (i !== teamAIdx && i !== teamBIdx) return i;
  }
  return null;
}

/** Если одно имя попало в две команды (описка в протоколе) — оставляем первое вхождение. */
function dedupePlayersAcrossTeams(teams) {
  const seen = new Set();
  const dropped = [];
  const next = (teams || []).map(t => {
    const players = [];
    (t.players || []).forEach(name => {
      if (seen.has(name)) {
        dropped.push(name);
        return;
      }
      seen.add(name);
      players.push(name);
    });
    return { ...t, players };
  });
  return { teams: next, dropped };
}

module.exports = {
  normalizeHint,
  resolvePlayerOnTeam,
  resolveScorers,
  resolveMatch,
  applyAppend,
  matchesAlreadyApplied,
  datesMatch,
  dedupePlayersAcrossTeams,
  winnerStaysNext,
  sittingOutIdxForPair,
};
