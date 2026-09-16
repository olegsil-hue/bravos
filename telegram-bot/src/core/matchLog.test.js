'use strict';

const {
  resolvePlayerOnTeam,
  resolveMatch,
  applyAppend,
  matchesAlreadyApplied,
  datesMatch,
  dedupePlayersAcrossTeams,
  winnerStaysNext,
} = require('./matchLog');

const team1 = ['Ваня от Клюшина', 'Илья Сыван', 'Паша Тренин', 'Георгий Вагин', 'Дима Корольков'];
const team2 = ['Антон Борисов', 'Дима Князев', 'Паша Орлов', 'Женя Клюшин', 'Миша Фирсков'];
const team3 = ['Алексей Зайцев', 'Олег Иохин', 'Олег Сильченко', 'Паша Вирник', 'Андрей Берликов'];
const teams = [
  { name: 'Команда 1', players: team1 },
  { name: 'Команда 2', players: team2 },
  { name: 'Команда 3', players: team3 },
];

let failed = 0;
function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failed++;
    console.error('FAIL', name, { actual, expected });
  }
}

eq('Иван → Ваня от Клюшина', resolvePlayerOnTeam(team1, 'Иван'), 'Ваня от Клюшина');
eq('Илья', resolvePlayerOnTeam(team1, 'Илья'), 'Илья Сыван');
eq('Паша unique on team 1', resolvePlayerOnTeam(team1, 'Паша'), 'Паша Тренин');
eq('Борисов', resolvePlayerOnTeam(team2, 'Борисов'), 'Антон Борисов');
eq('Князев', resolvePlayerOnTeam(team2, 'Князев'), 'Дима Князев');
eq('Леша Зайцев', resolvePlayerOnTeam(team3, 'Леша Зайцев'), 'Алексей Зайцев');
eq('Олег И', resolvePlayerOnTeam(team3, 'Олег И'), 'Олег Иохин');
eq('dates ISO vs 16.09', datesMatch('2026-09-16', '2026-09-16'), true);
eq('dates ISO vs dmy', datesMatch('2026-09-16', '16.09'), true);

const resolved = resolveMatch(teams, {
  teamAIdx: 2, teamBIdx: 0, scoreA: 0, scoreB: 2,
  scorersA: [],
  scorersB: [
    { name: 'Илья', goals: 1, assist: 'Иван' },
    { name: 'Паша', goals: 1 },
  ],
});
eq('game 9 resolved', resolved, {
  teamAIdx: 2, teamBIdx: 0, scoreA: 0, scoreB: 2,
  scorersA: [],
  scorersB: [
    { name: 'Илья Сыван', goals: 1, assist: 'Ваня от Клюшина' },
    { name: 'Паша Тренин', goals: 1 },
  ],
});

const incoming = [
  { teamAIdx: 2, teamBIdx: 0, scoreA: 0, scoreB: 2 },
  { teamAIdx: 0, teamBIdx: 1, scoreA: 0, scoreB: 2 },
  { teamAIdx: 1, teamBIdx: 2, scoreA: 0, scoreB: 1 },
];
const eight = Array.from({ length: 8 }, (_, i) => ({ teamAIdx: 0, teamBIdx: 1, scoreA: i, scoreB: 0 }));
eq('append after 8', applyAppend(eight, incoming).length, 11);
eq('idempotent', applyAppend(applyAppend(eight, incoming), incoming).length, 11);
eq('already applied', matchesAlreadyApplied(applyAppend(eight, incoming), incoming), true);

const withStuckGame9 = [...eight, { teamAIdx: 2, teamBIdx: 0, scoreA: 0, scoreB: 0 }];
eq('replace stuck game 9', applyAppend(withStuckGame9, incoming).length, 11);
eq('replaced score', applyAppend(withStuckGame9, incoming)[8].scoreB, 2);

try {
  resolvePlayerOnTeam(team1, 'Князев');
  failed++;
  console.error('FAIL expected throw for Knyazev on team 1');
} catch (e) {
  eq('wrong team throws', e.message.includes('Князев'), true);
}

try {
  resolvePlayerOnTeam(['Паша Тренин', 'Паша Орлов'], 'Паша');
  failed++;
  console.error('FAIL expected throw for ambiguous Pasha');
} catch (e) {
  eq('ambiguous Pasha throws', e.message.includes('неоднозначно'), true);
}

eq('winner stays: K2 beat K1, K3 was sitting → next K2 vs K3', winnerStaysNext({
  teamAIdx: 1, teamBIdx: 0, sittingOutIdx: 2, scoreA: 2, scoreB: 0, teamCount: 3, wonByPenalties: null,
}), { nextA: 1, nextB: 2, nextSittingOut: 0, winnerIdx: 1, loserIdx: 0 });

const officialT1 = ['Ваня от Клюшина', 'Паша Вирник', 'Илья Сыван', 'Дима Корольков', 'Петр Звенигородский'];
eq('16.09 Паша → Вирник', resolvePlayerOnTeam(officialT1, 'Паша'), 'Паша Вирник');

const dup = dedupePlayersAcrossTeams([
  { name: 'К1', players: ['Дима Корольков', 'Ваня от Клюшина'] },
  { name: 'К2', players: ['Дима Князев', 'Дима Корольков', 'Андрей'] },
]);
eq('Корольков stays on team 1', dup.teams[0].players.includes('Дима Корольков'), true);
eq('Корольков dropped from team 2', dup.teams[1].players.includes('Дима Корольков'), false);
eq('dropped name', dup.dropped, ['Дима Корольков']);

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('all matchLog tests passed');
