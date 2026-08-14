'use strict';

require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');

const db = require('./db');
const { computePlayerGameStats, computeStandings, computeDayPersonalStats } = require('./core/stats');
const { playerRating } = require('./core/rating');
const { smartDivide, optimizeTeamBalance } = require('./core/division');
const gameRecording = require('./gameRecording');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID ? Number(process.env.TELEGRAM_GROUP_CHAT_ID) : null;
const ADMIN_USER_ID = process.env.TELEGRAM_ADMIN_USER_ID ? Number(process.env.TELEGRAM_ADMIN_USER_ID) : null;
const TIMEZONE = process.env.TIMEZONE || 'Europe/Moscow';

if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN не задан — см. .env.example');
  process.exit(1);
}

console.log(
  `Конфигурация: TOKEN=${TOKEN.slice(0, 8)}… GROUP_CHAT_ID=${GROUP_CHAT_ID ?? 'не задан'} ` +
  `ADMIN_USER_ID=${ADMIN_USER_ID ?? 'не задан'} TIMEZONE=${TIMEZONE}`
);
if (!GROUP_CHAT_ID) console.warn('⚠️ TELEGRAM_GROUP_CHAT_ID не задан — /poll и запись игр не смогут писать в группу.');
if (!ADMIN_USER_ID) console.warn('⚠️ TELEGRAM_ADMIN_USER_ID не задан — некому будет прислать деление на апрув.');

process.on('unhandledRejection', err => console.error('unhandledRejection:', err));
process.on('uncaughtException', err => console.error('uncaughtException:', err));

const bot = new Telegraf(TOKEN);

const POLL_QUESTION = '⚽ Футбол в среду в 19:00 (до 15 человек)';
const OPT_IN = 'Буду';
const OPT_OUT = 'Не смогу';

function isAdmin(ctx) {
  return ADMIN_USER_ID && ctx.from && ctx.from.id === ADMIN_USER_ID;
}

function nextWednesday(from = new Date()) {
  const d = new Date(from);
  const day = d.getDay(); // 0=Вс,1=Пн,...3=Ср
  let diff = (3 - day + 7) % 7;
  if (diff === 0) diff = 7; // если сегодня среда — берём следующую
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ===================================================================
// Команды
// ===================================================================

bot.start(ctx => ctx.reply(
  'Привет! Это бот футбольных сборов.\n\n' +
  'Сначала привяжите себя к игроку командой:\n' +
  '/register Имя Фамилия (как в списке игроков)\n\n' +
  'После этого сможете голосовать в еженедельном опросе.'
));

bot.command('register', async ctx => {
  const name = ctx.message.text.replace(/^\/register(@\w+)?/, '').trim();
  if (!name) {
    return ctx.reply('Использование: /register Имя Фамилия — как игрок записан в списке приложения.');
  }
  const player = db.findPlayerByName(name);
  if (!player) {
    return ctx.reply(`❌ Не нашёл игрока «${name}» в списке. Проверьте написание (регистр не важен, но имя должно точно совпадать).`);
  }
  db.linkTelegramUser(ctx.from.id, ctx.from.username, player.name);
  return ctx.reply(`✅ Готово, вы привязаны к игроку «${player.name}».`);
});

bot.command('players', ctx => {
  const names = db.getRoster().map(p => p.name).sort((a, b) => a.localeCompare(b, 'ru'));
  return ctx.reply('Список игроков:\n' + names.join('\n'));
});

// Ручной запуск опроса — «после моего апрува» = сама команда и есть апрув.
bot.command('poll', async ctx => {
  if (!isAdmin(ctx)) return ctx.reply('Эта команда только для администратора.');
  if (!GROUP_CHAT_ID) return ctx.reply('❌ Не задан TELEGRAM_GROUP_CHAT_ID в настройках бота.');

  const eventDate = nextWednesday();
  const message = await bot.telegram.sendPoll(
    GROUP_CHAT_ID,
    POLL_QUESTION,
    [OPT_IN, OPT_OUT],
    { is_anonymous: false, allows_multiple_answers: false }
  );

  db.createPoll({
    telegramPollId: message.poll.id,
    chatId: message.chat.id,
    messageId: message.message_id,
    eventDate,
  });

  return ctx.reply(`✅ Опрос отправлен в группу на игру ${eventDate}.`);
});

bot.command('status', ctx => {
  if (!isAdmin(ctx)) return ctx.reply('Эта команда только для администратора.');
  const poll = db.getLatestOpenPoll();
  if (!poll) return ctx.reply('Открытых опросов нет.');
  const responses = db.getPollResponses(poll.id);
  const inCount = responses.filter(r => r.option_text === OPT_IN).length;
  return ctx.reply(
    `Опрос на ${poll.event_date}: ${responses.length} ответов, «${OPT_IN}» — ${inCount}.`
  );
});

// Тестовая команда: дозаполнить текущий опрос случайными игроками из
// списка (фейковые telegram_user_id, отрицательные — не пересекутся с
// реальными). Не трогает уже поданные настоящие голоса. Нужна, чтобы
// проверить деление и запись игр без сбора реальных 9-15 человек.
bot.command('simulate_votes', async ctx => {
  if (!isAdmin(ctx)) return ctx.reply('Эта команда только для администратора.');
  const poll = db.getLatestOpenPoll();
  if (!poll) return ctx.reply('Открытых опросов нет — сначала /poll.');

  const arg = ctx.message.text.replace(/^\/simulate_votes(@\w+)?/, '').trim();
  const count = Math.max(1, Math.min(15, parseInt(arg, 10) || 9));

  const alreadyLinkedNames = new Set(
    db.getPollResponses(poll.id)
      .map(r => db.getPlayerNameByTelegramId(r.telegram_user_id))
      .filter(Boolean)
  );
  const pool = db.getRoster().map(p => p.name).filter(n => !alreadyLinkedNames.has(n));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, count);

  picked.forEach((name, i) => {
    const fakeId = -1000 - i - Date.now() % 1000; // отрицательный, гарантированно не реальный
    db.linkTelegramUser(fakeId, `test_${i}`, name);
    db.recordPollResponse(poll.id, fakeId, OPT_IN);
  });

  return ctx.reply(`✅ Добавлено ${picked.length} тестовых голосов «${OPT_IN}»: ${picked.join(', ')}`);
});

// Тестовая команда: закрыть опрос и прислать деление на апрув прямо сейчас,
// не дожидаясь среды 12:00 по расписанию. Удобно для проверки после деплоя.
bot.command('divide_now', async ctx => {
  if (!isAdmin(ctx)) return ctx.reply('Эта команда только для администратора.');
  const poll = db.getLatestOpenPoll();
  if (!poll) return ctx.reply('Открытых опросов нет — сначала /poll.');
  db.closePoll(poll.id);
  await ctx.reply('Считаю состав...');
  await sendDivisionForApproval(poll);
});

// ===================================================================
// Ответы на опрос
// ===================================================================

bot.on('poll_answer', async ctx => {
  const answer = ctx.update.poll_answer;
  const poll = db.getOpenPollByTelegramId(answer.poll_id);
  if (!poll) return;

  // Пустой option_ids = пользователь отозвал голос.
  if (!answer.option_ids || answer.option_ids.length === 0) return;

  const optionText = answer.option_ids[0] === 0 ? OPT_IN : OPT_OUT;
  db.recordPollResponse(poll.id, answer.user.id, optionText);

  const playerName = db.getPlayerNameByTelegramId(answer.user.id);
  if (!playerName) {
    // Не привязан к игроку — не сможем учесть его в делении.
    try {
      await bot.telegram.sendMessage(
        answer.user.id,
        'Голос учтён, но вы ещё не привязаны к игроку в списке — наберите /register Имя Фамилия, иначе я не смогу включить вас в деление на команды.'
      );
    } catch (e) { /* пользователь мог не начинать диалог с ботом — не критично */ }
  }
});

// ===================================================================
// Деление на команды + апрув
// ===================================================================

function chooseTeamCount(n) {
  if (n <= 10) return 2;
  return 3; // 11-15 человек — 3 команды по спецификации (лимит 15)
}

async function runDivisionForPoll(poll) {
  const responses = db.getPollResponses(poll.id);
  const inResponses = responses.filter(r => r.option_text === OPT_IN);

  const roster = db.getRoster();
  const gameStats = computePlayerGameStats(db.getAllGameDaysForStats());

  const players = [];
  const notLinked = [];
  inResponses.forEach(r => {
    const playerName = db.getPlayerNameByTelegramId(r.telegram_user_id);
    if (!playerName) { notLinked.push(r.telegram_user_id); return; }
    const p = roster.find(x => x.name === playerName);
    if (p) players.push({ ...p, totalRating: playerRating(p, gameStats) });
  });

  if (players.length < 2) {
    return { error: `Недостаточно привязанных игроков для деления (${players.length}). Не привязаны: ${notLinked.length}.` };
  }

  const teamCount = chooseTeamCount(players.length);
  const teams = optimizeTeamBalance(smartDivide(players, teamCount));

  return { teams, notLinkedCount: notLinked.length, totalIn: inResponses.length };
}

function formatTeamsMessage(teams, eventDate) {
  const lines = [`📅 Игра ${eventDate} — предложенный состав:\n`];
  teams.forEach((team, i) => {
    lines.push(`Команда ${i + 1} (рейтинг ${team.totalRating.toFixed(1)}):`);
    team.players
      .slice()
      .sort((a, b) => b.totalRating - a.totalRating)
      .forEach(p => lines.push(`  • ${p.name} (${p.pos1}${p.pos2 ? '/' + p.pos2 : ''}) — ${p.totalRating.toFixed(1)}`));
    lines.push('');
  });
  return lines.join('\n');
}

async function sendDivisionForApproval(poll) {
  const result = await runDivisionForPoll(poll);
  if (result.error) {
    if (ADMIN_USER_ID) await bot.telegram.sendMessage(ADMIN_USER_ID, `❌ ${result.error}`);
    return;
  }

  const divisionId = db.createPendingDivision(poll.id, result.teams);
  const text = formatTeamsMessage(result.teams, poll.event_date) +
    (result.notLinkedCount ? `\n⚠️ ${result.notLinkedCount} проголосовавших не привязаны к игроку (/register) и не попали в состав.` : '');

  if (!ADMIN_USER_ID) {
    console.warn('TELEGRAM_ADMIN_USER_ID не задан — некому отправить апрув.');
    return;
  }

  await bot.telegram.sendMessage(ADMIN_USER_ID, text, Markup.inlineKeyboard([
    Markup.button.callback('✅ Утвердить', `approve_${divisionId}`),
    Markup.button.callback('🔄 Пересчитать', `regenerate_${divisionId}`),
  ]));
}

bot.action(/^approve_(\d+)$/, async ctx => {
  const id = Number(ctx.match[1]);
  const division = db.getPendingDivision(id);
  if (!division) return ctx.answerCbQuery('Не найдено (уже обработано?)');

  db.setPendingDivisionStatus(id, 'approved');
  const poll = db.db.prepare('SELECT * FROM polls WHERE id = ?').get(division.poll_id);

  db.insertGameDay({
    date: poll.event_date,
    teams: division.teams.map((t, i) => ({
      name: `Команда ${i + 1}`,
      colorIdx: i,
      players: t.players.map(p => p.name),
    })),
    status: 'approved',
  });

  await ctx.editMessageReplyMarkup(undefined);
  await ctx.reply('✅ Утверждено. Состав сохранён. Запись игр откроется в среду в 18:00 (или запустите /start_game вручную для проверки).');

  if (GROUP_CHAT_ID) {
    const announce = formatTeamsMessage(division.teams, poll.event_date);
    await bot.telegram.sendMessage(GROUP_CHAT_ID, announce);
  }
});

bot.action(/^regenerate_(\d+)$/, async ctx => {
  const id = Number(ctx.match[1]);
  const division = db.getPendingDivision(id);
  if (!division) return ctx.answerCbQuery('Не найдено');
  db.setPendingDivisionStatus(id, 'rejected');

  const poll = db.db.prepare('SELECT * FROM polls WHERE id = ?').get(division.poll_id);
  await ctx.editMessageReplyMarkup(undefined);
  await ctx.reply('🔄 Пересчитываю...');
  await sendDivisionForApproval(poll);
  // Примечание: алгоритм детерминирован, поэтому пересчёт обычно даёт тот
  // же состав. Ручная перестановка — в следующей версии.
});

// ===================================================================
// Запись игр (Игра 1, Игра 2, ... — проигравшая команда уступает место)
// ===================================================================

async function openGameRecording(chatId) {
  const day = db.getLatestGameDayByStatus('approved');
  if (!day) {
    if (ADMIN_USER_ID) await bot.telegram.sendMessage(ADMIN_USER_ID, '❌ Нет утверждённого состава на сегодня — нечего открывать.');
    return;
  }
  await bot.telegram.sendMessage(chatId, `🟢 Запись игр открыта на ${day.date}!`);
  await gameRecording.startGameDay(bot, day, chatId);
}

// Ручной запуск для проверки — не ждать среды 18:00.
bot.command('start_game', async ctx => {
  if (!isAdmin(ctx)) return ctx.reply('Эта команда только для администратора.');
  await openGameRecording(ctx.chat.id);
});

bot.command('end_day', async ctx => {
  if (!isAdmin(ctx)) return ctx.reply('Эта команда только для администратора.');
  const day = db.getLatestGameDayByStatus('in_progress') || db.getLatestGameDayByStatus('approved');
  if (!day) return ctx.reply('Нет открытого игрового дня.');

  const finished = gameRecording.finishGameDay(day.id);
  if (finished.teams.length < 2 || finished.matches.length === 0) {
    return ctx.reply('Матчей ещё не было записано — итоги считать не из чего.');
  }

  const standings = computeStandings(finished);
  const personal = computeDayPersonalStats(finished);
  const teamName = idx => (finished.teams[idx] ? finished.teams[idx].name : `Команда ${idx + 1}`);

  const lines = [`🏆 Итоги ${finished.date}\n`, 'Итоговая таблица:'];
  standings.forEach((s, i) => {
    const medal = ['🥇', '🥈', '🥉'][i] || '';
    lines.push(`${medal} ${teamName(s.idx)} — И:${s.gp} В:${s.w} Н:${s.d} П:${s.l} Голы:${s.gf}:${s.ga} Очки:${s.pts}`);
  });
  lines.push('\nЛичная статистика:');
  personal.forEach(p => lines.push(`${p.name} (${teamName(p.teamIdx)}) — ⚽${p.goals} 🎯${p.assists}`));

  await ctx.reply(lines.join('\n'));
  if (GROUP_CHAT_ID) await bot.telegram.sendMessage(GROUP_CHAT_ID, lines.join('\n'));
});

// --- Кнопки записи гола/паса ---

bot.action(/^goal_(\d+)_(\d+)$/, ctx => gameRecording.handleGoalButton(bot, ctx, Number(ctx.match[1]), Number(ctx.match[2])));
bot.action(/^scorer_(\d+)_(\d+)_(\d+)$/, ctx => gameRecording.handleScorerPick(bot, ctx, Number(ctx.match[1]), Number(ctx.match[2]), Number(ctx.match[3])));
bot.action(/^assist_(\d+)_(\d+)_(none|\d+)$/, ctx => gameRecording.finalizeGoal(bot, ctx, Number(ctx.match[1]), Number(ctx.match[2]), ctx.match[3]));
bot.action(/^undo_(\d+)$/, ctx => gameRecording.handleUndo(bot, ctx, Number(ctx.match[1])));
bot.action(/^cancelpick_(\d+)$/, ctx => gameRecording.handleCancelPick(bot, ctx, Number(ctx.match[1])));
bot.action(/^endmatch_(\d+)$/, ctx => gameRecording.handleEndMatch(bot, ctx, Number(ctx.match[1])));
bot.action(/^pk_(\d+)_(none|\d+)$/, ctx => gameRecording.handlePenaltyWinner(bot, ctx, Number(ctx.match[1]), ctx.match[2]));

// ===================================================================
// Планировщик: среда 12:00 — закрыть опрос и отправить деление на апрув.
// Среда 18:00 — открыть запись игр в группе.
// ===================================================================

cron.schedule('0 12 * * 3', async () => {
  const poll = db.getLatestOpenPoll();
  if (!poll) return;
  db.closePoll(poll.id);
  await sendDivisionForApproval(poll);
}, { timezone: TIMEZONE });

cron.schedule('0 18 * * 3', async () => {
  if (GROUP_CHAT_ID) await openGameRecording(GROUP_CHAT_ID);
}, { timezone: TIMEZONE });

// Пошагово, а не через один await bot.launch() — чтобы точно видеть, на
// каком именно шаге что-то идёт не так (getMe / deleteWebhook / старт
// поллинга). ВАЖНО: промис bot.launch() у Telegraf НЕ резолвится, пока не
// вызван bot.stop() — это штатное поведение long-polling цикла, а не
// зависание. Поэтому его нельзя ждать через await — иначе строка про
// успешный запуск никогда не напечатается, даже если бот уже отвечает.
(async () => {
  try {
    console.log('Шаг 1/3: getMe()...');
    const me = await bot.telegram.getMe();
    console.log(`Шаг 1/3 OK: это бот @${me.username}.`);

    console.log('Шаг 2/3: deleteWebhook() (на случай, если где-то остался вебхук)...');
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });
    console.log('Шаг 2/3 OK.');

    console.log('Шаг 3/3: bot.launch() — старт поллинга (промис не резолвится, пока бот работает — это нормально, не ждём его)...');
    bot.launch().catch(err => {
      console.error('❌ bot.launch() завершился с ошибкой во время работы:', err);
      process.exit(1);
    });
    console.log('Шаг 3/3 OK. Бот запущен и слушает Telegram (long polling).');
  } catch (err) {
    console.error('❌ Запуск бота провалился:', err);
    process.exit(1);
  }
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Диагностическая метка деплоя — если в логах есть эта строка, значит
// Railway реально забрал самый свежий коммит из ветки, а не закешировал
// старый билд.
console.log('BUILD MARKER: e7a6c6b+2-launch-fix (' + new Date().toISOString() + ')');
