'use strict';

// HTTP-сервер общей базы: отдаёт статическую страницу (patched-копию
// football-heroes-live.html) и API из двух эндпоинтов, читающих/пишущих
// ТУ ЖЕ SQLite, что использует сам бот — единственный источник правды
// для роспись/игровых дней вместо localStorage браузера. Раздаётся с
// того же origin, что и API, поэтому CORS не нужен, а CSP артефактов
// claude.ai (блокирующий обращения к внешним хостам) тут ни при чём —
// страница больше не живёт внутри артефакта.

const path = require('path');
const express = require('express');
const db = require('./db');
const { getAvatarPath } = require('./avatar');

function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/state', (req, res) => {
    try {
      res.json({ roster: db.getRoster(), gameDays: db.getAllGameDaysForStats() });
    } catch (err) {
      console.error('GET /api/state упал:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.post('/api/state', (req, res) => {
    const { roster, gameDays } = req.body || {};
    if (!Array.isArray(roster) || !Array.isArray(gameDays)) {
      return res.status(400).json({ error: 'roster and gameDays must be arrays' });
    }
    try {
      db.replaceState(roster, gameDays);
      res.json({ ok: true });
    } catch (err) {
      console.error('POST /api/state упал:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // Фото профиля из Telegram для страницы «Игроки». Токен бота используется
  // только здесь, на сервере, — клиенту отдаётся готовый jpg-файл.
  app.get('/api/avatar/:playerName', async (req, res) => {
    try {
      const playerName = req.params.playerName;
      const telegramUserId = db.getTelegramUserIdByPlayerName(playerName);
      if (!telegramUserId) return res.status(404).end();
      const avatarPath = await getAvatarPath(telegramUserId);
      if (!avatarPath) return res.status(404).end();
      res.set('Cache-Control', 'public, max-age=3600');
      res.sendFile(path.resolve(avatarPath));
    } catch (err) {
      console.error('GET /api/avatar упал:', err);
      res.status(500).end();
    }
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`HTTP-сервер (общая база + веб-приложение) слушает порт ${PORT}.`);
  });
}

module.exports = { startServer };
