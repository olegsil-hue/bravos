'use strict';

// Портировано 1:1 из football-heroes-live.html — держите эти два места
// в синхроне вручную, если меняете формулу в веб-версии.

const ATT_WEIGHT = 0.6;
const GOALS_ASSISTS_WEIGHT = 0.05;

/** Голы+передачи за игру по всей истории, приведено к шкале 0-10. */
function playerGoalAssistFactor(name, gameStatsByName) {
  const s = gameStatsByName[name];
  if (!s || !s.games) return null;
  const perGame = (s.goals + s.assists) / s.games;
  return Math.min(10, Math.max(0, perGame * 2));
}

/**
 * Рейтинг игрока: ATT весит 60%, GK/DEF/END делят оставшиеся 40% поровну,
 * плюс фактор Гол/Пас (реальная результативность) с весом 5% поверх.
 */
function playerRating(p, gameStatsByName) {
  const otherWeight = (1 - ATT_WEIGHT) / 3;
  const skillRating = p.att * ATT_WEIGHT + (p.gk + p.def + p.end) * otherWeight;
  const gaFactor = playerGoalAssistFactor(p.name, gameStatsByName || {});
  if (gaFactor === null) return skillRating;
  return skillRating * (1 - GOALS_ASSISTS_WEIGHT) + gaFactor * GOALS_ASSISTS_WEIGHT;
}

module.exports = { playerRating, playerGoalAssistFactor, ATT_WEIGHT, GOALS_ASSISTS_WEIGHT };
