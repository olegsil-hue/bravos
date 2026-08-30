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
const { getAvatarPath, getManualAvatarPath, saveManualAvatar, deleteManualAvatar } = require('./avatar');

function startServer() {
  const app = express();
  // 10mb — с запасом под фото, загруженные вручную (base64 в JSON тяжелее
  // исходника примерно на треть; сам файл на сервере пережимается до иконки).
  app.use(express.json({ limit: '10mb' }));
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

  // Фото для страницы «Игроки». Приоритет: фото, загруженное вручную из
  // веб-приложения (не зависит от Telegram вообще) — если его нет, пробуем
  // фото профиля Telegram (только если игрок уже привязан к id). Токен бота
  // используется только здесь, на сервере, — клиенту отдаётся готовый jpg.
  app.get('/api/avatar/:playerName', async (req, res) => {
    try {
      const playerName = req.params.playerName;
      const manualPath = getManualAvatarPath(playerName);
      if (manualPath) {
        res.set('Cache-Control', 'public, max-age=3600');
        return res.sendFile(path.resolve(manualPath));
      }
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

  // Ручная загрузка фото из веб-приложения — { dataUrl: "data:image/...;base64,..." }.
  app.post('/api/avatar/:playerName', async (req, res) => {
    try {
      const playerName = req.params.playerName;
      if (!db.findPlayerByName(playerName)) return res.status(404).json({ error: 'player_not_found' });
      const { dataUrl } = req.body || {};
      await saveManualAvatar(playerName, dataUrl);
      res.json({ ok: true });
    } catch (err) {
      console.error('POST /api/avatar упал:', err);
      res.status(400).json({ error: err.message || 'bad_request' });
    }
  });

  app.delete('/api/avatar/:playerName', (req, res) => {
    try {
      deleteManualAvatar(req.params.playerName);
      res.json({ ok: true });
    } catch (err) {
      console.error('DELETE /api/avatar упал:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // Настройки автозапуска опроса (bot-control.html) — читает и правит сам
  // бот (index.js, cron-тик каждую минуту сверяет текущее время с этим).
  app.get('/api/settings', (req, res) => {
    try {
      res.json(db.getPollSettings());
    } catch (err) {
      console.error('GET /api/settings упал:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.post('/api/settings', (req, res) => {
    const { pollDayOfWeek, pollTime } = req.body || {};
    if (pollDayOfWeek != null && (!Number.isInteger(pollDayOfWeek) || pollDayOfWeek < 1 || pollDayOfWeek > 7)) {
      return res.status(400).json({ error: 'pollDayOfWeek must be an integer 1-7 (1=Пн)' });
    }
    if (pollTime != null && !/^\d{2}:\d{2}$/.test(pollTime)) {
      return res.status(400).json({ error: 'pollTime must be HH:MM' });
    }
    try {
      res.json(db.setPollSettings({ pollDayOfWeek, pollTime }));
    } catch (err) {
      console.error('POST /api/settings упал:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`HTTP-сервер (общая база + веб-приложение) слушает порт ${PORT}.`);
  });
}

module.exports = { startServer };
