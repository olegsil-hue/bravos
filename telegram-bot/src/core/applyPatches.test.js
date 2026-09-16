'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { datesMatch } = require('./matchLog');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-patches-'));
process.env.DB_PATH = path.join(dir, 'test.db');

const db = require('../db');

let failed = 0;
function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failed++;
    console.error('FAIL', name, { actual, expected });
  }
}

const days = db.getAllGameDaysForStats();
const day = days.find(d => datesMatch(d.date, '2026-09-16'));
if (!day) {
  console.error('FAIL 16.09 day not created');
  process.exit(1);
}

eq('team 2 has no Корольков', day.teams[1].players.includes('Дима Корольков'), false);
eq('team 1 has Корольков', day.teams[0].players.includes('Дима Корольков'), true);
eq('Артем on team 3', day.teams[2].players.includes('Артем от Димы'), true);
eq('10 matches when starting empty (7 seed + 3 append)', day.matches.length, 10);

const last3 = day.matches.slice(-3);
eq('game 8/9 pair K3 vs K1', [last3[0].teamAIdx, last3[0].teamBIdx, last3[0].scoreA, last3[0].scoreB], [2, 0, 0, 2]);
eq('Ilya scored', last3[0].scorersB[0].name, 'Илья Сыван');
eq('Pasha is Virnik', last3[0].scorersB[1].name, 'Паша Вирник');
eq('game 10 Knyazev', last3[1].scorersB[0].name, 'Дима Князев');
eq('game 11 Zaitsev', last3[2].scorersB[0].name, 'Алексей Зайцев');

const before = JSON.stringify(day.matches);
db.applyMatchLogPatches();
const again = db.getAllGameDaysForStats().find(d => datesMatch(d.date, '2026-09-16'));
eq('idempotent match count', again.matches.length, 10);
eq('idempotent matches', JSON.stringify(again.matches), before);

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('all applyPatches tests passed');
