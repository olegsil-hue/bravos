'use strict';

// Тексты, которые бот имеет право слать в ГРУППУ после игры / после
// утверждения состава. Официальный рейтинг всей группы (топ-10 Саша
// Скрывля, Витинька, …) сюда не входит: это страница /rating.html, а не
// рассылка. В группе — только кто играл сегодня и счёт дня.

function playerName(p) {
  return typeof p === 'string' ? p : p.name;
}

function formatGroupLineup(teams, eventDate) {
  const lines = [`📅 Игра ${eventDate} — состав:\n`];
  (teams || []).forEach((team, i) => {
    lines.push(`Команда ${i + 1}:`);
    (team.players || []).forEach(p => lines.push(`  • ${playerName(p)}`));
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}

function formatDayResultsText(day, standings, personal) {
  const teamName = idx => (day.teams[idx] ? day.teams[idx].name : `Команда ${idx + 1}`);
  const lines = [`🏆 Итоги ${day.date}\n`, 'Итоговая таблица:'];
  (standings || []).forEach((s, i) => {
    const medal = ['🥇', '🥈', '🥉'][i] || '';
    lines.push(`${medal} ${teamName(s.idx)} — И:${s.gp} В:${s.w} Н:${s.d} П:${s.l} Голы:${s.gf}:${s.ga} Очки:${s.pts}`);
  });
  if (personal && personal.length) {
    lines.push('\nЛичная статистика дня (голы и пасы только этой среды):');
    personal.forEach(p => lines.push(`${p.name} (${teamName(p.teamIdx)}) — ⚽${p.goals} 🎯${p.assists}`));
  }
  return lines.join('\n');
}

function todayPlayerNames(day) {
  return new Set((day.teams || []).flatMap(t => t.players || []).map(playerName));
}

/** Защита: групповой текст не должен содержать официальный топ рейтинга
 *  и игроков, которых сегодня не было в составах. */
function assertGroupTextIsDayOnly(text, day) {
  const today = todayPlayerNames(day);
  const forbiddenHeaders = [
    /рейтинг\s*\(топ/i,
    /официальный рейтинг/i,
    /топ-?\s*10/i,
    /команда\s+\d+\s*\(рейтинг/i,
  ];
  for (const re of forbiddenHeaders) {
    if (re.test(text)) throw new Error(`В групповом тексте нельзя слать общий рейтинг: совпало ${re}`);
  }
  return today;
}

module.exports = {
  formatGroupLineup,
  formatDayResultsText,
  todayPlayerNames,
  assertGroupTextIsDayOnly,
};
