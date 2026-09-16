'use strict';

const {
  formatGroupLineup,
  formatDayResultsText,
  assertGroupTextIsDayOnly,
} = require('./groupMessages');

const day = {
  date: '2026-09-16',
  teams: [
    { name: 'Команда 1', players: ['Ваня от Клюшина', 'Паша Вирник'] },
    { name: 'Команда 2', players: [{ name: 'Дима Князев' }, { name: 'Антон Борисов' }] },
  ],
};

let failed = 0;
function assert(name, cond) {
  if (!cond) {
    failed++;
    console.error('FAIL', name);
  }
}

const lineup = formatGroupLineup(day.teams, day.date);
assert('lineup has date', lineup.includes('2026-09-16'));
assert('lineup has Vanya', lineup.includes('Ваня от Клюшина'));
assert('lineup has no rating word', !/рейтинг/i.test(lineup));
assert('lineup has no top-10', !/топ/i.test(lineup));
assertGroupTextIsDayOnly(lineup, day);

const results = formatDayResultsText(day, [
  { idx: 1, gp: 2, w: 2, d: 0, l: 0, gf: 4, ga: 0, pts: 6 },
  { idx: 0, gp: 2, w: 0, d: 0, l: 0, gf: 0, ga: 4, pts: 0 },
], [{ name: 'Дима Князев', teamIdx: 1, goals: 2, assists: 0 }]);
assert('results are day stats', results.includes('Итоговая таблица') && results.includes('Личная статистика дня'));
assertGroupTextIsDayOnly(results, day);

const top10 = 'Рейтинг (топ-10)\n1. Саша Скрывля — 7.8\n2. Витинька — 7';
try {
  assertGroupTextIsDayOnly(top10, day);
  failed++;
  console.error('FAIL expected throw for top-10');
} catch (e) {
  assert('top-10 rejected', /общий рейтинг/.test(e.message));
}

const teamsWithRating = 'Команда 1 (рейтинг 30.5):\n  • Саша Скрывля — 7.8';
try {
  assertGroupTextIsDayOnly(teamsWithRating, day);
  failed++;
  console.error('FAIL expected throw for team rating');
} catch (e) {
  assert('team rating rejected', /общий рейтинг/.test(e.message));
}

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('all groupMessages tests passed');
