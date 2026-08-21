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

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`HTTP-сервер (общая база + веб-приложение) слушает порт ${PORT}.`);
  });
}

module.exports = { startServer };
