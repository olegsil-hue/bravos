'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const seed = require('./seed-data.json');

const DB_PATH = process.env.DB_PATH || './data/football.db';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  name TEXT PRIMARY KEY,
  pos1 TEXT NOT NULL,
  pos2 TEXT,
  gk INTEGER NOT NULL,
  def INTEGER NOT NULL,
  att INTEGER NOT NULL,
  end_ INTEGER NOT NULL,
  telegram_username TEXT
);

CREATE TABLE IF NOT EXISTS telegram_links (
  telegram_user_id INTEGER PRIMARY KEY,
  username TEXT,
  player_name TEXT NOT NULL REFERENCES players(name),
  linked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS game_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  legacy INTEGER NOT NULL DEFAULT 0,
  teams_json TEXT NOT NULL DEFAULT '[]',
  matches_json TEXT NOT NULL DEFAULT '[]',
  legacy_stats_json TEXT,
  manual_standings_json TEXT,
  personal_stats_json TEXT,
  status TEXT NOT NULL DEFAULT 'completed'
);

CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_poll_id TEXT UNIQUE,
  chat_id INTEGER NOT NULL,
  message_id INTEGER,
  event_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS poll_responses (
  poll_id INTEGER NOT NULL REFERENCES polls(id),
  telegram_user_id INTEGER NOT NULL,
  option_text TEXT NOT NULL,
  responded_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (poll_id, telegram_user_id)
);

CREATE TABLE IF NOT EXISTS pending_divisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL REFERENCES polls(id),
  teams_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Текущий/только что сыгранный мини-матч внутри игрового дня. Одна строка
-- на матч (проигравшая команда уступает место — 'Игра 2', 'Игра 3', ...).
CREATE TABLE IF NOT EXISTS live_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_day_id INTEGER NOT NULL REFERENCES game_days(id),
  match_number INTEGER NOT NULL,
  team_a_idx INTEGER NOT NULL,
  team_b_idx INTEGER NOT NULL,
  sitting_out_idx INTEGER,
  score_a INTEGER NOT NULL DEFAULT 0,
  score_b INTEGER NOT NULL DEFAULT 0,
  scorers_a_json TEXT NOT NULL DEFAULT '[]',
  scorers_b_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'in_progress',
  pending_action_json TEXT,
  chat_id INTEGER,
  message_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Миграция для баз, созданных до появления telegram_username (CREATE TABLE
// IF NOT EXISTS не добавляет новые колонки в уже существующую таблицу).
const playerColumns = db.prepare("PRAGMA table_info(players)").all().map(c => c.name);
if (!playerColumns.includes('telegram_username')) {
  db.exec('ALTER TABLE players ADD COLUMN telegram_username TEXT');
}
if (!playerColumns.includes('telegram_display_name')) {
  db.exec('ALTER TABLE players ADD COLUMN telegram_display_name TEXT');
}

db.exec(`
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

// Одноразовая миграция на общую базу бот+веб-приложение: раньше это были
// два независимых хранилища (SQLite бота и localStorage браузера), и все
// правки (рейтинги, игровые дни, Telegram-имена) приходилось переносить
// вручную. full-state-migration.json — это снимок актуальных данных из
// football-heroes-live.html на момент перехода. Выполняется РОВНО ОДИН
// РАЗ за всё время жизни базы (флаг в schema_meta) — переживает любой
// передеплой, но не перезатирает то, что уже накопилось в базе бота
// после перехода (голоса, живые матчи и т.д.) при повторных запусках.
function runFullStateMigrationIfNeeded() {
  const flag = db.prepare("SELECT value FROM schema_meta WHERE key = 'full_state_migrated'").get();
  if (flag) return;

  let snapshot;
  try {
    snapshot = require('./full-state-migration.json');
  } catch (e) {
    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('full_state_migrated', datetime('now'))").run();
    return; // файла нет — считаем миграцию неприменимой, отмечаем как выполненную
  }

  const tx = db.transaction(() => {
    // telegram_links.player_name — внешний ключ на players(name); без
    // предварительной очистки DELETE FROM players падает с
    // SQLITE_CONSTRAINT_FOREIGNKEY, если хоть у кого-то уже есть привязка
    // (/register, голос в опросе с авто-распознаванием и т.п.) — а на уже
    // работающем боте она почти наверняка есть.
    db.prepare('DELETE FROM telegram_links').run();
    db.prepare('DELETE FROM live_matches').run();
    db.prepare('DELETE FROM game_days').run();
    db.prepare('DELETE FROM players').run();

    const insertPlayer = db.prepare(`
      INSERT INTO players (name, pos1, pos2, gk, def, att, end_, telegram_username, telegram_display_name)
      VALUES (@name, @pos1, @pos2, @gk, @def, @att, @end, @telegramUsername, @telegramDisplayName)
    `);
    snapshot.roster.forEach(p => insertPlayer.run({
      ...p,
      pos2: p.pos2 || null,
      telegramUsername: p.telegramUsername || null,
      telegramDisplayName: p.telegramDisplayName || null,
    }));

    const insertDay = db.prepare(`
      INSERT INTO game_days (id, date, legacy, teams_json, matches_json, legacy_stats_json, manual_standings_json, personal_stats_json, status)
      VALUES (@id, @date, @legacy, @teams_json, @matches_json, @legacy_stats_json, @manual_standings_json, @personal_stats_json, 'completed')
    `);
    snapshot.gameDays.forEach(d => insertDay.run({
      id: d.id,
      date: d.date,
      legacy: d.legacy ? 1 : 0,
      teams_json: JSON.stringify(d.teams || []),
      matches_json: JSON.stringify(d.matches || []),
      legacy_stats_json: d.legacyStats ? JSON.stringify(d.legacyStats) : null,
      manual_standings_json: d.manualStandings ? JSON.stringify(d.manualStandings) : null,
      personal_stats_json: d.personalStats ? JSON.stringify(d.personalStats) : null,
    }));

    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('full_state_migrated', datetime('now'))").run();
  });
  tx();
  console.log(`Единая база: перенесено ${snapshot.roster.length} игроков, ${snapshot.gameDays.length} игровых дней из веб-приложения.`);
}

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM players').get().c;
  if (count > 0) return;

  const insertPlayer = db.prepare(`
    INSERT INTO players (name, pos1, pos2, gk, def, att, end_, telegram_username)
    VALUES (@name, @pos1, @pos2, @gk, @def, @att, @end, @telegramUsername)
  `);
  const insertDay = db.prepare(`
    INSERT INTO game_days (date, legacy, teams_json, matches_json, legacy_stats_json, manual_standings_json, personal_stats_json, status)
    VALUES (@date, @legacy, @teams_json, @matches_json, @legacy_stats_json, @manual_standings_json, @personal_stats_json, 'completed')
  `);

  const tx = db.transaction(() => {
    seed.roster.forEach(p => insertPlayer.run({ ...p, pos2: p.pos2 || null, telegramUsername: p.telegramUsername || null }));
    seed.gameDays.forEach(d => insertDay.run({
      date: d.date,
      legacy: d.legacy ? 1 : 0,
      teams_json: JSON.stringify(d.teams || []),
      matches_json: JSON.stringify(d.matches || []),
      legacy_stats_json: d.legacyStats ? JSON.stringify(d.legacyStats) : null,
      manual_standings_json: d.manualStandings ? JSON.stringify(d.manualStandings) : null,
      personal_stats_json: d.personalStats ? JSON.stringify(d.personalStats) : null,
    }));
  });
  tx();
  console.log(`Сид загружен: ${seed.roster.length} игроков, ${seed.gameDays.length} игровых дней.`);
}

runFullStateMigrationIfNeeded();
seedIfEmpty();

// Известные сопоставления username/displayName -> игрок, разобранные
// вручную из скриншотов реальных опросов (см. known-telegram-names.json).
// Применяется на КАЖДОМ запуске (идемпотентно), а не только на пустой
// базе — чтобы не зависеть от того, помнит ли кто-то запустить
// /set_usernames или /set_display_names руками. Никогда не перезаписывает
// уже заданное значение — правки через сами эти команды (или через
// веб-приложение + бот) остаются приоритетнее этого списка.
function applyKnownTelegramNames() {
  let known;
  try {
    known = require('./known-telegram-names.json').mappings;
  } catch (e) {
    return; // файла нет — не критично, просто пропускаем
  }
  const setUsername = db.prepare("UPDATE players SET telegram_username = ? WHERE name = ? AND (telegram_username IS NULL OR telegram_username = '')");
  const setDisplayName = db.prepare("UPDATE players SET telegram_display_name = ? WHERE name = ? AND (telegram_display_name IS NULL OR telegram_display_name = '')");
  let applied = 0;
  known.forEach(m => {
    if (m.username) { const r = setUsername.run(normalizeTelegramUsername(m.username), m.name); if (r.changes) applied++; }
    if (m.displayName) { const r = setDisplayName.run(m.displayName, m.name); if (r.changes) applied++; }
  });
  if (applied) console.log(`Применены известные Telegram-сопоставления: ${applied} полей.`);
}

applyKnownTelegramNames();

// Разовое исправление конкретной обнаруженной коллизии: у «Паша Орлов» и
// «Паша Тренин» настоящие Telegram-аккаунты совпали по generic
// отображаемому имени "Pavel" (короткое имя без фамилии — недостаточно
// уникально, чтобы быть надёжным идентификатором) — автосопоставление по
// имени присвоило привязку (и вместе с ней фото профиля) не тому игроку.
// Переносим уже установленную привязку на верного игрока, а не удаляем —
// telegram_user_id настоящий, ошибочным было только то, к какому игроку
// его приписали. Идемпотентно: как только исправлено один раз, при
// следующих запусках строк с player_name = 'Паша Орлов' уже не останется,
// и функция ничего не делает.
function fixOrlovTreninDisplayNameCollision() {
  const rows = db.prepare("SELECT telegram_user_id FROM telegram_links WHERE player_name = 'Паша Орлов'").all();
  if (rows.length === 1) {
    db.prepare("UPDATE telegram_links SET player_name = 'Паша Тренин' WHERE player_name = 'Паша Орлов'").run();
    console.log('Исправлена коллизия имён Telegram ("Pavel"): привязка перенесена с «Паша Орлов» на «Паша Тренин».');
  } else if (rows.length > 1) {
    console.warn(`⚠️ У «Паша Орлов» ${rows.length} Telegram-привязок одновременно — не переношу автоматически, разберите вручную.`);
  }
  db.prepare("UPDATE players SET telegram_display_name = NULL WHERE name = 'Паша Орлов' AND telegram_display_name = 'Pavel'").run();
}

fixOrlovTreninDisplayNameCollision();

// Есть ли у игрока УЖЕ привязка к ДРУГОМУ telegram_user_id, чем тот,
// который сейчас пытаемся привязать? Используется как защита от повторения
// коллизии Орлов/Тренин: если совпадение по отображаемому имени ведёт к
// игроку, который уже привязан к другому реальному аккаунту — это явный
// признак, что имя неоднозначно (совпадает у ≥2 разных людей), и
// автопривязку лучше пропустить, а не молча перезаписать/задвоить.
function hasOtherTelegramLink(playerName, telegramUserId) {
  const row = db.prepare('SELECT 1 FROM telegram_links WHERE player_name = ? AND telegram_user_id != ?').get(playerName, telegramUserId);
  return !!row;
}

// Ручные правки факторов GK/DEF/ATT/END из веб-версии, не попавшие в базу
// бота автоматически (см. known-roster-factor-overrides.json) — это
// отдельная база, синхронизации между ними нет. В отличие от
// applyKnownTelegramNames, здесь ВСЕГДА перезаписываем значения (не
// только если пусто) — это подправленные актуальные цифры, а не
// запасной вариант на случай пустого поля. Применяется на каждом
// запуске, так что переживёт передеплой.
function applyKnownRosterFactorOverrides() {
  let overrides;
  try {
    overrides = require('./known-roster-factor-overrides.json').overrides;
  } catch (e) {
    return; // файла нет — не критично, просто пропускаем
  }
  const setFactors = db.prepare('UPDATE players SET gk = ?, def = ?, att = ?, end_ = ? WHERE name = ?');
  let applied = 0;
  overrides.forEach(o => {
    const r = setFactors.run(o.gk, o.def, o.att, o.end, o.name);
    if (r.changes) applied++;
  });
  if (applied) console.log(`Применены правки факторов из веб-версии: ${applied} игроков.`);
}

applyKnownRosterFactorOverrides();

// Исторические игровые дни, не попавшие в изначальную full-state-migration
// (та применяется строго один раз) — см. additional-legacy-gamedays.json.
// UPSERT по id (не INSERT OR IGNORE): эти дни — авторитетные данные из
// исходной таблицы, которые могли доуточняться (например, сначала завели
// только суммарные Г/П за день, потом добавили точный по-игровой лог) —
// каждый новый запуск подтягивает актуальную версию файла. Как и
// applyKnownRosterFactorOverrides, намеренно ВСЕГДА перезаписывает (это не
// запасной вариант на случай пустого поля, а подправленные авторитетные
// цифры).
function applyAdditionalLegacyGameDays() {
  let extra;
  try {
    extra = require('./additional-legacy-gamedays.json').gameDays;
  } catch (e) {
    return; // файла нет — не критично, просто пропускаем
  }
  const upsertDay = db.prepare(`
    INSERT INTO game_days (id, date, legacy, teams_json, matches_json, legacy_stats_json, manual_standings_json, personal_stats_json, status)
    VALUES (@id, @date, @legacy, @teams_json, @matches_json, @legacy_stats_json, @manual_standings_json, @personal_stats_json, 'completed')
    ON CONFLICT(id) DO UPDATE SET
      date = excluded.date,
      legacy = excluded.legacy,
      teams_json = excluded.teams_json,
      matches_json = excluded.matches_json,
      legacy_stats_json = excluded.legacy_stats_json
      -- status/manual_standings/personal_stats намеренно не трогаем при конфликте
  `);
  let touched = 0;
  extra.forEach(d => {
    const r = upsertDay.run({
      id: d.id,
      date: d.date,
      legacy: d.legacy ? 1 : 0,
      teams_json: JSON.stringify(d.teams || []),
      matches_json: JSON.stringify(d.matches || []),
      legacy_stats_json: d.legacyStats ? JSON.stringify(d.legacyStats) : null,
      manual_standings_json: null,
      personal_stats_json: null,
    });
    if (r.changes) touched++;
  });
  if (touched) console.log(`Добавлены/обновлены недостающие исторические игровые дни: ${touched}.`);
}

applyAdditionalLegacyGameDays();

// --- Игроки ---

function getRoster() {
  return db.prepare('SELECT name, pos1, pos2, gk, def, att, end_ AS end, telegram_username AS telegramUsername, telegram_display_name AS telegramDisplayName FROM players').all();
}

function findPlayerByName(name) {
  return db.prepare('SELECT name, pos1, pos2, gk, def, att, end_ AS end, telegram_username AS telegramUsername, telegram_display_name AS telegramDisplayName FROM players WHERE name = ?').get(name);
}

// Убирает ведущий «@» и приводит к нижнему регистру — так же, как в
// football-heroes-live.html (window.normalizeTelegramUsername), чтобы
// сравнение было регистронезависимым и не зависело от того, ввёл ли
// админ «@» при заполнении.
function normalizeTelegramUsername(raw) {
  return (raw || '').trim().replace(/^@/, '').toLowerCase();
}

function findPlayerByTelegramUsername(username) {
  const normalized = normalizeTelegramUsername(username);
  if (!normalized) return null;
  return db.prepare('SELECT name, pos1, pos2, gk, def, att, end_ AS end, telegram_username AS telegramUsername FROM players WHERE telegram_username = ?').get(normalized);
}

function setPlayerTelegramUsername(name, username) {
  const normalized = normalizeTelegramUsername(username);
  const info = db.prepare('UPDATE players SET telegram_username = ? WHERE name = ?').run(normalized || null, name);
  return info.changes > 0;
}

// Отображаемое имя (first_name + last_name) в отличие от username —
// произвольный ник, который человек может задать как угодно (без «@»,
// эмодзи и т.п.) — сравниваем только по обрезанным пробелам и регистру,
// без изменения самого текста, чтобы не потерять эмодзи при копировании
// из «Poll Results».
function normalizeTelegramDisplayName(raw) {
  return (raw || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function findPlayerByTelegramDisplayName(displayName) {
  const normalized = normalizeTelegramDisplayName(displayName);
  if (!normalized) return null;
  const players = db.prepare('SELECT name, pos1, pos2, gk, def, att, end_ AS end, telegram_username AS telegramUsername, telegram_display_name AS telegramDisplayName FROM players').all();
  return players.find(p => normalizeTelegramDisplayName(p.telegramDisplayName) === normalized) || null;
}

function setPlayerTelegramDisplayName(name, displayName) {
  const info = db.prepare('UPDATE players SET telegram_display_name = ? WHERE name = ?').run(displayName ? displayName.trim() : null, name);
  return info.changes > 0;
}

// --- Игровые дни (для core/stats.js — тот же объектный вид, что и в вебе) ---

function getAllGameDaysForStats() {
  const rows = db.prepare('SELECT * FROM game_days').all();
  return rows.map(r => ({
    id: r.id,
    date: r.date,
    legacy: !!r.legacy,
    teams: JSON.parse(r.teams_json || '[]'),
    matches: JSON.parse(r.matches_json || '[]'),
    legacyStats: r.legacy_stats_json ? JSON.parse(r.legacy_stats_json) : undefined,
    manualStandings: r.manual_standings_json ? JSON.parse(r.manual_standings_json) : undefined,
    personalStats: r.personal_stats_json ? JSON.parse(r.personal_stats_json) : undefined,
  }));
}

// Сохраняет полное состояние (ростер + игровые дни) из веб-приложения —
// вызывается на каждое window.saveData() оттуда (см. server.js,
// POST /api/state). Игроков полностью заменяет по имени (первичный
// ключ) — веб-приложение теперь несёт те же поля, что и таблица
// (включая telegram_username/telegram_display_name), так что ничего
// боту-специфичного не теряется. Игровые дни — по id: для уже
// существующих строк НЕ трогает status и связанные live_matches (это
// управляется ботом при живой записи игр, веб-приложение об этом не
// знает); для новых — status='completed' (обычный случай для дней,
// заведённых со стороны веб-версии, где составы и результаты уже
// известны целиком). Дни, пропавшие из присланного списка (удалены в
// вебе), удаляются и у бота вместе с их live_matches.
function replaceState(roster, gameDays) {
  const tx = db.transaction(() => {
    const incomingNames = new Set(roster.map(p => p.name));
    db.prepare('SELECT name FROM players').all().forEach(r => {
      if (!incomingNames.has(r.name)) {
        // telegram_links.player_name — внешний ключ на players(name), чистим
        // сначала, иначе удаление игрока с привязкой упадёт (см. коммент у
        // runFullStateMigrationIfNeeded).
        db.prepare('DELETE FROM telegram_links WHERE player_name = ?').run(r.name);
        db.prepare('DELETE FROM players WHERE name = ?').run(r.name);
      }
    });
    const upsertPlayer = db.prepare(`
      INSERT INTO players (name, pos1, pos2, gk, def, att, end_, telegram_username, telegram_display_name)
      VALUES (@name, @pos1, @pos2, @gk, @def, @att, @end, @telegramUsername, @telegramDisplayName)
      ON CONFLICT(name) DO UPDATE SET
        pos1 = excluded.pos1, pos2 = excluded.pos2, gk = excluded.gk, def = excluded.def,
        att = excluded.att, end_ = excluded.end_,
        telegram_username = excluded.telegram_username, telegram_display_name = excluded.telegram_display_name
    `);
    roster.forEach(p => upsertPlayer.run({
      ...p,
      pos2: p.pos2 || null,
      telegramUsername: normalizeTelegramUsername(p.telegramUsername) || null,
      telegramDisplayName: p.telegramDisplayName || null,
    }));

    const incomingIds = new Set(gameDays.map(d => d.id));
    db.prepare('SELECT id FROM game_days').all().forEach(r => {
      if (!incomingIds.has(r.id)) {
        db.prepare('DELETE FROM live_matches WHERE game_day_id = ?').run(r.id);
        db.prepare('DELETE FROM game_days WHERE id = ?').run(r.id);
      }
    });
    const upsertDay = db.prepare(`
      INSERT INTO game_days (id, date, legacy, teams_json, matches_json, legacy_stats_json, manual_standings_json, personal_stats_json, status)
      VALUES (@id, @date, @legacy, @teams_json, @matches_json, @legacy_stats_json, @manual_standings_json, @personal_stats_json, 'completed')
      ON CONFLICT(id) DO UPDATE SET
        date = excluded.date, legacy = excluded.legacy, teams_json = excluded.teams_json,
        matches_json = excluded.matches_json, legacy_stats_json = excluded.legacy_stats_json,
        manual_standings_json = excluded.manual_standings_json, personal_stats_json = excluded.personal_stats_json
        -- status намеренно не трогаем при конфликте — управляется ботом
    `);
    gameDays.forEach(d => upsertDay.run({
      id: d.id,
      date: d.date,
      legacy: d.legacy ? 1 : 0,
      teams_json: JSON.stringify(d.teams || []),
      matches_json: JSON.stringify(d.matches || []),
      legacy_stats_json: d.legacyStats ? JSON.stringify(d.legacyStats) : null,
      manual_standings_json: d.manualStandings ? JSON.stringify(d.manualStandings) : null,
      personal_stats_json: d.personalStats ? JSON.stringify(d.personalStats) : null,
    }));
  });
  tx();
}

function insertGameDay(day) {
  const info = db.prepare(`
    INSERT INTO game_days (date, legacy, teams_json, matches_json, status)
    VALUES (?, 0, ?, '[]', ?)
  `).run(day.date, JSON.stringify(day.teams), day.status || 'pending_approval');
  return info.lastInsertRowid;
}

function getGameDayById(id) {
  const r = db.prepare('SELECT * FROM game_days WHERE id = ?').get(id);
  if (!r) return null;
  return {
    id: r.id,
    date: r.date,
    legacy: !!r.legacy,
    teams: JSON.parse(r.teams_json || '[]'),
    matches: JSON.parse(r.matches_json || '[]'),
    status: r.status,
  };
}

function getLatestGameDayByStatus(status) {
  const r = db.prepare("SELECT id FROM game_days WHERE status = ? ORDER BY id DESC LIMIT 1").get(status);
  return r ? getGameDayById(r.id) : null;
}

function setGameDayStatus(id, status) {
  db.prepare('UPDATE game_days SET status = ? WHERE id = ?').run(status, id);
}

// Краткий список игровых дней (для /days — чтобы найти id тестового дня и
// удалить его через /delete_day, не трогая остальную историю).
function getAllGameDaysBrief() {
  return db.prepare('SELECT id, date, status, legacy FROM game_days ORDER BY id DESC').all();
}

// Полностью удаляет игровой день и все его live_matches (тестовые дни,
// заведённые через /manual_divide + /start_game, не должны засорять
// реальную историю/статистику).
function deleteGameDay(id) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM live_matches WHERE game_day_id = ?').run(id);
    const info = db.prepare('DELETE FROM game_days WHERE id = ?').run(id);
    return info.changes;
  });
  return tx() > 0;
}

function appendMatchToGameDay(gameDayId, match) {
  const day = getGameDayById(gameDayId);
  const matches = [...day.matches, match];
  db.prepare('UPDATE game_days SET matches_json = ? WHERE id = ?').run(JSON.stringify(matches), gameDayId);
}

// --- Живые матчи (запись игр в день игры) ---

function createLiveMatch({ gameDayId, matchNumber, teamAIdx, teamBIdx, sittingOutIdx }) {
  const info = db.prepare(`
    INSERT INTO live_matches (game_day_id, match_number, team_a_idx, team_b_idx, sitting_out_idx)
    VALUES (?, ?, ?, ?, ?)
  `).run(gameDayId, matchNumber, teamAIdx, teamBIdx, sittingOutIdx === null || sittingOutIdx === undefined ? null : sittingOutIdx);
  return getLiveMatch(info.lastInsertRowid);
}

function getLiveMatch(id) {
  const r = db.prepare('SELECT * FROM live_matches WHERE id = ?').get(id);
  if (!r) return null;
  return {
    id: r.id,
    gameDayId: r.game_day_id,
    matchNumber: r.match_number,
    teamAIdx: r.team_a_idx,
    teamBIdx: r.team_b_idx,
    sittingOutIdx: r.sitting_out_idx,
    scoreA: r.score_a,
    scoreB: r.score_b,
    scorersA: JSON.parse(r.scorers_a_json || '[]'),
    scorersB: JSON.parse(r.scorers_b_json || '[]'),
    status: r.status,
    pendingAction: r.pending_action_json ? JSON.parse(r.pending_action_json) : null,
    chatId: r.chat_id,
    messageId: r.message_id,
  };
}

function getActiveLiveMatchForDay(gameDayId) {
  const r = db.prepare("SELECT id FROM live_matches WHERE game_day_id = ? AND status = 'in_progress' ORDER BY id DESC LIMIT 1").get(gameDayId);
  return r ? getLiveMatch(r.id) : null;
}

function updateLiveMatch(id, fields) {
  const current = getLiveMatch(id);
  if (!current) return null;
  const merged = { ...current, ...fields };
  db.prepare(`
    UPDATE live_matches SET
      score_a = ?, score_b = ?, scorers_a_json = ?, scorers_b_json = ?,
      status = ?, pending_action_json = ?, chat_id = ?, message_id = ?
    WHERE id = ?
  `).run(
    merged.scoreA, merged.scoreB,
    JSON.stringify(merged.scorersA), JSON.stringify(merged.scorersB),
    merged.status, merged.pendingAction ? JSON.stringify(merged.pendingAction) : null,
    merged.chatId || null, merged.messageId || null,
    id
  );
  return getLiveMatch(id);
}

// --- Привязка Telegram-аккаунтов к игрокам ---

function linkTelegramUser(telegramUserId, username, playerName) {
  db.prepare(`
    INSERT INTO telegram_links (telegram_user_id, username, player_name)
    VALUES (?, ?, ?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET username = excluded.username, player_name = excluded.player_name
  `).run(telegramUserId, username || null, playerName);
}

function getPlayerNameByTelegramId(telegramUserId) {
  const row = db.prepare('SELECT player_name FROM telegram_links WHERE telegram_user_id = ?').get(telegramUserId);
  return row ? row.player_name : null;
}

// Обратный поиск — нужен для подтягивания фото профиля (avatar.js): по
// игроку находим его telegram_user_id, если он когда-либо был привязан
// (через /register или автосопоставление при делении на команды).
function getTelegramUserIdByPlayerName(playerName) {
  const row = db.prepare('SELECT telegram_user_id FROM telegram_links WHERE player_name = ?').get(playerName);
  return row ? row.telegram_user_id : null;
}

// --- Опросы ---

function createPoll({ telegramPollId, chatId, messageId, eventDate }) {
  const info = db.prepare(`
    INSERT INTO polls (telegram_poll_id, chat_id, message_id, event_date, status)
    VALUES (?, ?, ?, ?, 'open')
  `).run(telegramPollId, chatId, messageId, eventDate);
  return info.lastInsertRowid;
}

function getOpenPollByTelegramId(telegramPollId) {
  return db.prepare("SELECT * FROM polls WHERE telegram_poll_id = ? AND status = 'open'").get(telegramPollId);
}

function getLatestOpenPoll() {
  return db.prepare("SELECT * FROM polls WHERE status = 'open' ORDER BY id DESC LIMIT 1").get();
}

function getPollById(id) {
  return db.prepare('SELECT * FROM polls WHERE id = ?').get(id);
}

// Список всех опросов с числом ответов — чтобы админ мог увидеть, если
// открытых опросов оказалось несколько (getLatestOpenPoll берёт только
// последний созданный, а не тот, где реально больше голосов), и явно
// указать нужный поле /divide_now <id>.
function getAllPollsWithCounts() {
  return db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM poll_responses r WHERE r.poll_id = p.id AND r.option_text = 'Буду') AS in_count,
      (SELECT COUNT(*) FROM poll_responses r WHERE r.poll_id = p.id) AS total_count
    FROM polls p ORDER BY p.id DESC
  `).all();
}

function closePoll(pollId) {
  db.prepare("UPDATE polls SET status = 'closed' WHERE id = ?").run(pollId);
}

function recordPollResponse(pollId, telegramUserId, optionText) {
  db.prepare(`
    INSERT INTO poll_responses (poll_id, telegram_user_id, option_text)
    VALUES (?, ?, ?)
    ON CONFLICT(poll_id, telegram_user_id) DO UPDATE SET option_text = excluded.option_text, responded_at = datetime('now')
  `).run(pollId, telegramUserId, optionText);
}

function getPollResponses(pollId) {
  return db.prepare('SELECT * FROM poll_responses WHERE poll_id = ?').all(pollId);
}

// --- Деления, ожидающие апрува ---

function createPendingDivision(pollId, teams) {
  const info = db.prepare(`
    INSERT INTO pending_divisions (poll_id, teams_json, status)
    VALUES (?, ?, 'pending')
  `).run(pollId, JSON.stringify(teams));
  return info.lastInsertRowid;
}

function getPendingDivision(id) {
  const row = db.prepare('SELECT * FROM pending_divisions WHERE id = ?').get(id);
  if (!row) return null;
  return { ...row, teams: JSON.parse(row.teams_json) };
}

function setPendingDivisionStatus(id, status) {
  db.prepare('UPDATE pending_divisions SET status = ? WHERE id = ?').run(status, id);
}

module.exports = {
  db,
  getRoster,
  findPlayerByName,
  findPlayerByTelegramUsername,
  setPlayerTelegramUsername,
  normalizeTelegramUsername,
  findPlayerByTelegramDisplayName,
  setPlayerTelegramDisplayName,
  getAllGameDaysForStats,
  replaceState,
  insertGameDay,
  getGameDayById,
  getLatestGameDayByStatus,
  setGameDayStatus,
  getAllGameDaysBrief,
  deleteGameDay,
  appendMatchToGameDay,
  linkTelegramUser,
  getPlayerNameByTelegramId,
  getTelegramUserIdByPlayerName,
  hasOtherTelegramLink,
  createPoll,
  getOpenPollByTelegramId,
  getLatestOpenPoll,
  getPollById,
  getAllPollsWithCounts,
  closePoll,
  recordPollResponse,
  getPollResponses,
  createPendingDivision,
  getPendingDivision,
  setPendingDivisionStatus,
  createLiveMatch,
  getLiveMatch,
  getActiveLiveMatchForDay,
  updateLiveMatch,
};
