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
  end_ INTEGER NOT NULL
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

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM players').get().c;
  if (count > 0) return;

  const insertPlayer = db.prepare(`
    INSERT INTO players (name, pos1, pos2, gk, def, att, end_)
    VALUES (@name, @pos1, @pos2, @gk, @def, @att, @end)
  `);
  const insertDay = db.prepare(`
    INSERT INTO game_days (date, legacy, teams_json, matches_json, legacy_stats_json, manual_standings_json, personal_stats_json, status)
    VALUES (@date, @legacy, @teams_json, @matches_json, @legacy_stats_json, @manual_standings_json, @personal_stats_json, 'completed')
  `);

  const tx = db.transaction(() => {
    seed.roster.forEach(p => insertPlayer.run({ ...p, pos2: p.pos2 || null }));
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

seedIfEmpty();

// --- Игроки ---

function getRoster() {
  return db.prepare('SELECT name, pos1, pos2, gk, def, att, end_ AS end FROM players').all();
}

function findPlayerByName(name) {
  return db.prepare('SELECT name, pos1, pos2, gk, def, att, end_ AS end FROM players WHERE name = ?').get(name);
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
  getAllGameDaysForStats,
  insertGameDay,
  getGameDayById,
  getLatestGameDayByStatus,
  setGameDayStatus,
  appendMatchToGameDay,
  linkTelegramUser,
  getPlayerNameByTelegramId,
  createPoll,
  getOpenPollByTelegramId,
  getLatestOpenPoll,
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
