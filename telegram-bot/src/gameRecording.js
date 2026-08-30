'use strict';

// Интерактивная запись игр в день матча: «Игра N: команда А vs команда Б»,
// запись гола (с необязательным пасом), автоматическая ротация —
// проигравшая команда уступает место той, что сидела.

const { Markup } = require('telegraf');
const db = require('./db');

function teamLabel(day, idx) {
  return day.teams[idx] ? day.teams[idx].name : `Команда ${idx + 1}`;
}

function scoreLine(m, day) {
  return `⚽ ${teamLabel(day, m.teamAIdx)} ${m.scoreA} : ${m.scoreB} ${teamLabel(day, m.teamBIdx)}`;
}

function goalsList(scorers) {
  if (!scorers.length) return '—';
  return scorers.map(s => `${s.name} ×${s.goals}${s.assist ? ` (пас: ${s.assist})` : ''}`).join(', ');
}

function scoreboardText(match, day) {
  const lines = [
    `🏟 Игра ${match.matchNumber}`,
    scoreLine(match, day),
    '',
    `${teamLabel(day, match.teamAIdx)}: ${goalsList(match.scorersA)}`,
    `${teamLabel(day, match.teamBIdx)}: ${goalsList(match.scorersB)}`,
  ];
  if (match.sittingOutIdx !== null && match.sittingOutIdx !== undefined) {
    lines.push('', `⏸ Отдыхает: ${teamLabel(day, match.sittingOutIdx)}`);
  }
  return lines.join('\n');
}

function mainKeyboard(match, day) {
  const rows = [
    [
      Markup.button.callback(`⚽ Гол: ${teamLabel(day, match.teamAIdx)}`, `goal_${match.id}_${match.teamAIdx}`),
      Markup.button.callback(`⚽ Гол: ${teamLabel(day, match.teamBIdx)}`, `goal_${match.id}_${match.teamBIdx}`),
    ],
  ];
  if (match.scoreA !== match.scoreB) {
    rows.push([Markup.button.callback('🏁 Матч окончен', `endmatch_${match.id}`)]);
  } else {
    rows.push([Markup.button.callback('🏁 Матч окончен (ничья)', `endmatch_${match.id}`)]);
  }
  if (match.scorersA.length + match.scorersB.length > 0) {
    rows.push([Markup.button.callback('↩️ Отменить последний гол', `undo_${match.id}`)]);
  }
  return Markup.inlineKeyboard(rows);
}

// callback_data ограничен 64 байтами у Telegram — кириллические имена туда
// не поместить надёжно, поэтому передаём индекс игрока в составе команды,
// а не само имя.
function playerPickKeyboard(match, teamIdx, day, prefix, excludeIdx) {
  const rows = day.teams[teamIdx].players
    .map((name, idx) => ({ name, idx }))
    .filter(p => p.idx !== excludeIdx)
    .map(p => [Markup.button.callback(p.name, `${prefix}_${match.id}_${teamIdx}_${p.idx}`)]);
  rows.push([Markup.button.callback('⬅️ Назад', `cancelpick_${match.id}`)]);
  return Markup.inlineKeyboard(rows);
}

async function renderMatch(bot, match, day) {
  const text = scoreboardText(match, day);
  const keyboard = mainKeyboard(match, day);
  if (match.chatId && match.messageId) {
    try {
      await bot.telegram.editMessageText(match.chatId, match.messageId, undefined, text, keyboard);
      return;
    } catch (e) {
      // сообщение могло устареть/быть удалено — пришлём новое ниже
    }
  }
  const sent = await bot.telegram.sendMessage(match.chatId, text, keyboard);
  db.updateLiveMatch(match.id, { chatId: sent.chat.id, messageId: sent.message_id });
}

/**
 * Стартует Игру 1 для игрового дня (2 или 3 команды). aIdx/bIdx — индексы
 * стартовой пары (по умолчанию 0/1 = первые две команды); для 3 команд
 * оставшаяся команда садится отдыхать. Выбор пары — см. openGameRecording
 * в index.js (спрашивает админа кнопками перед вызовом этой функции).
 */
async function startGameDay(bot, gameDay, chatId, aIdx = 0, bIdx = 1) {
  db.setGameDayStatus(gameDay.id, 'in_progress');
  const sittingOutIdx = gameDay.teams.length >= 3
    ? gameDay.teams.findIndex((_, i) => i !== aIdx && i !== bIdx)
    : null;
  let match = db.createLiveMatch({
    gameDayId: gameDay.id,
    matchNumber: 1,
    teamAIdx: aIdx,
    teamBIdx: bIdx,
    sittingOutIdx,
  });
  match = db.updateLiveMatch(match.id, { chatId });
  await renderMatch(bot, match, gameDay);
  return match;
}

async function handleGoalButton(bot, ctx, matchId, teamIdx) {
  const match = db.getLiveMatch(matchId);
  const day = db.getGameDayById(match.gameDayId);
  const updated = db.updateLiveMatch(matchId, { pendingAction: { step: 'scorer', teamIdx } });
  await ctx.editMessageText(
    `Кто забил за «${teamLabel(day, teamIdx)}»?`,
    playerPickKeyboard(updated, teamIdx, day, 'scorer')
  );
  await ctx.answerCbQuery();
}

async function handleScorerPick(bot, ctx, matchId, teamIdx, scorerIdx) {
  const match = db.getLiveMatch(matchId);
  const day = db.getGameDayById(match.gameDayId);
  const scorerName = day.teams[teamIdx].players[scorerIdx];
  db.updateLiveMatch(matchId, { pendingAction: { step: 'assist', teamIdx, scorer: scorerName } });
  await ctx.editMessageText(
    `Кто отдал пас на гол (${scorerName})? Можно пропустить.`,
    Markup.inlineKeyboard([
      ...day.teams[teamIdx].players
        .map((name, idx) => ({ name, idx }))
        .filter(p => p.idx !== Number(scorerIdx))
        .map(p => [Markup.button.callback(p.name, `assist_${matchId}_${teamIdx}_${p.idx}`)]),
      [Markup.button.callback('Без паса', `assist_${matchId}_${teamIdx}_none`)],
    ])
  );
  await ctx.answerCbQuery();
}

async function finalizeGoal(bot, ctx, matchId, teamIdx, assistIdxOrNone) {
  let match = db.getLiveMatch(matchId);
  const day = db.getGameDayById(match.gameDayId);
  const scorer = match.pendingAction && match.pendingAction.scorer;
  if (!scorer) { await ctx.answerCbQuery('Что-то пошло не так, попробуйте заново'); return; }

  const assistName = assistIdxOrNone === 'none' ? null : day.teams[teamIdx].players[Number(assistIdxOrNone)];

  const isA = teamIdx === match.teamAIdx;
  const scorers = isA ? [...match.scorersA] : [...match.scorersB];
  scorers.push({ name: scorer, goals: 1, assist: assistName || null });

  const patch = isA
    ? { scoreA: match.scoreA + 1, scorersA: scorers, pendingAction: null }
    : { scoreB: match.scoreB + 1, scorersB: scorers, pendingAction: null };
  match = db.updateLiveMatch(matchId, patch);

  await ctx.answerCbQuery('Гол записан ⚽');
  await renderMatch(bot, match, day);
}

async function handleUndo(bot, ctx, matchId) {
  let match = db.getLiveMatch(matchId);
  const day = db.getGameDayById(match.gameDayId);
  const scorersA = [...match.scorersA];
  const scorersB = [...match.scorersB];
  // убираем последний по времени добавленный гол — сравниваем длину массивов
  // проще: тот, что был добавлен последним, всегда в конце своего массива;
  // без единой временной метки берём наибольшую сумму голов как "последнюю команду".
  let patch;
  if (scorersB.length && (!scorersA.length || match.scoreB >= match.scoreA)) {
    scorersB.pop();
    patch = { scoreB: Math.max(0, match.scoreB - 1), scorersB };
  } else if (scorersA.length) {
    scorersA.pop();
    patch = { scoreA: Math.max(0, match.scoreA - 1), scorersA };
  } else {
    await ctx.answerCbQuery('Отменять нечего');
    return;
  }
  match = db.updateLiveMatch(matchId, patch);
  await ctx.answerCbQuery('Последний гол отменён');
  await renderMatch(bot, match, day);
}

async function handleCancelPick(bot, ctx, matchId) {
  const match = db.updateLiveMatch(matchId, { pendingAction: null });
  const day = db.getGameDayById(match.gameDayId);
  await ctx.answerCbQuery();
  await renderMatch(bot, match, day);
}

async function handleEndMatch(bot, ctx, matchId) {
  const match = db.getLiveMatch(matchId);
  const day = db.getGameDayById(match.gameDayId);

  if (match.scoreA === match.scoreB) {
    // Ничья: спрашиваем, был ли победитель по буллитам, или оставляем ничью.
    await ctx.editMessageText(
      scoreboardText(match, day) + '\n\nНичья. Есть победитель по пенальти?',
      Markup.inlineKeyboard([
        [Markup.button.callback(`🎯 ${teamLabel(day, match.teamAIdx)}`, `pk_${matchId}_${match.teamAIdx}`)],
        [Markup.button.callback(`🎯 ${teamLabel(day, match.teamBIdx)}`, `pk_${matchId}_${match.teamBIdx}`)],
        [Markup.button.callback('Просто ничья, без буллитов', `pk_${matchId}_none`)],
      ])
    );
    await ctx.answerCbQuery();
    return;
  }

  await finishMatch(bot, match, day, null);
  await ctx.answerCbQuery();
}

async function handlePenaltyWinner(bot, ctx, matchId, winnerTeamIdxOrNone) {
  const match = db.getLiveMatch(matchId);
  const day = db.getGameDayById(match.gameDayId);
  const wonByPenalties = winnerTeamIdxOrNone === 'none' ? null : Number(winnerTeamIdxOrNone);
  await finishMatch(bot, match, day, wonByPenalties);
  await ctx.answerCbQuery();
}

async function finishMatch(bot, match, day, wonByPenalties) {
  db.updateLiveMatch(match.id, { status: 'finished' });

  db.appendMatchToGameDay(day.id, {
    teamAIdx: match.teamAIdx,
    teamBIdx: match.teamBIdx,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    scorersA: match.scorersA,
    scorersB: match.scorersB,
    ...(wonByPenalties !== null && wonByPenalties !== undefined ? { wonByPenalties } : {}),
  });

  const winnerIdx = wonByPenalties !== null && wonByPenalties !== undefined
    ? wonByPenalties
    : (match.scoreA > match.scoreB ? match.teamAIdx : (match.scoreB > match.scoreA ? match.teamBIdx : null));
  const loserIdx = winnerIdx === null ? null
    : (winnerIdx === match.teamAIdx ? match.teamBIdx : match.teamAIdx);

  const resultLine = winnerIdx === null
    ? `\n\n🤝 Ничья ${match.scoreA}:${match.scoreB}. Следующая игра — те же команды.`
    : `\n\n🏆 Победа: ${teamLabel(day, winnerIdx)}!`;
  await bot.telegram.sendMessage(match.chatId, scoreboardText(match, day) + resultLine);

  // Определяем состав следующей игры.
  let nextA, nextB, nextSittingOut;
  if (day.teams.length < 3 || match.sittingOutIdx === null || match.sittingOutIdx === undefined) {
    // 2 команды — просто следующая игра между теми же двумя.
    nextA = match.teamAIdx; nextB = match.teamBIdx; nextSittingOut = null;
  } else if (winnerIdx === null) {
    // Ничья без буллитов — состав не меняем.
    nextA = match.teamAIdx; nextB = match.teamBIdx; nextSittingOut = match.sittingOutIdx;
  } else {
    nextA = winnerIdx;
    nextB = match.sittingOutIdx;
    nextSittingOut = loserIdx;
  }

  let next = db.createLiveMatch({
    gameDayId: day.id,
    matchNumber: match.matchNumber + 1,
    teamAIdx: nextA,
    teamBIdx: nextB,
    sittingOutIdx: nextSittingOut,
  });
  next = db.updateLiveMatch(next.id, { chatId: match.chatId });
  await renderMatch(bot, next, db.getGameDayById(day.id));
}

/** Завершает игровой день (без активного матча) и возвращает готовый день. */
function finishGameDay(gameDayId) {
  db.setGameDayStatus(gameDayId, 'completed');
  return db.getGameDayById(gameDayId);
}

module.exports = {
  startGameDay,
  handleGoalButton,
  handleScorerPick,
  finalizeGoal,
  handleUndo,
  handleCancelPick,
  handleEndMatch,
  handlePenaltyWinner,
  finishGameDay,
};
