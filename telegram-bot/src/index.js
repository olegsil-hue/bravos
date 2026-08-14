'use strict';

require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');

const db = require('./db');
const { computePlayerGameStats } = require('./core/stats');
const { playerRating } = require('./core/rating');
const { smartDivide, optimizeTeamBalance } = require('./core/division');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID ? Number(process.env.TELEGRAM_GROUP_CHAT_ID) : null;
const ADMIN_USER_ID = process.env.TELEGRAM_ADMIN_USER_ID ? Number(process.env.TELEGRAM_ADMIN_USER_ID) : null;
const TIMEZONE = process.env.TIMEZONE || 'Europe/Moscow';

if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN не задан — см. .env.example');
  process.exit(1);
}

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
  await ctx.reply('✅ Утверждено. Состав сохранён, вечером в среду откроется запись игр (эта часть — в следующей версии бота).');

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
// Планировщик: среда 12:00 — закрыть опрос и отправить деление на апрув.
// Среда 18:00 (запись игр) — заглушка, следующая версия бота.
// ===================================================================

cron.schedule('0 12 * * 3', async () => {
  const poll = db.getLatestOpenPoll();
  if (!poll) return;
  db.closePoll(poll.id);
  await sendDivisionForApproval(poll);
}, { timezone: TIMEZONE });

cron.schedule('0 18 * * 3', async () => {
  if (ADMIN_USER_ID) {
    await bot.telegram.sendMessage(
      ADMIN_USER_ID,
      '⏰ 18:00 среды — запись игр ещё не реализована в этой версии бота.'
    );
  }
}, { timezone: TIMEZONE });

bot.launch().then(() => console.log('Бот запущен.'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
