'use strict';

// Подтягивает фото профиля Telegram для игрока и кэширует на диск, чтобы
// не дёргать Bot API на каждый показ страницы «Игроки». Токен бота никогда
// не уходит в браузер — вся работа с api.telegram.org идёт здесь, на
// сервере; клиент получает готовую картинку через /api/avatar/:playerName.
//
// Bot API отдаёт фото только для пользователей, о которых бот уже что-то
// знает (переписывался в личке, состоит в группе с ботом и т.п.) — это
// покрывает игроков, привязанных через /register или автосопоставление при
// делении на команды (таблица telegram_links).

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DB_PATH = process.env.DB_PATH || './data/football.db';
const CACHE_DIR = path.join(path.dirname(DB_PATH), 'avatars');
fs.mkdirSync(CACHE_DIR, { recursive: true });

// Фото профиля меняются редко — сутки кэша достаточно и не нагружает Bot API.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function jpgPath(telegramUserId) {
  return path.join(CACHE_DIR, `${telegramUserId}.jpg`);
}
function nonePath(telegramUserId) {
  return path.join(CACHE_DIR, `${telegramUserId}.none`);
}

function freshFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return Date.now() - stat.mtimeMs < CACHE_TTL_MS ? filePath : null;
  } catch (e) {
    return null;
  }
}

// Возвращает путь к закэшированному jpg или null, если фото нет/не удалось получить.
async function getAvatarPath(telegramUserId) {
  if (!TOKEN || !telegramUserId) return null;

  const cachedJpg = freshFile(jpgPath(telegramUserId));
  if (cachedJpg) return cachedJpg;
  if (freshFile(nonePath(telegramUserId))) return null;

  try {
    const photosRes = await fetch(
      `https://api.telegram.org/bot${TOKEN}/getUserProfilePhotos?user_id=${telegramUserId}&limit=1`
    );
    const photosData = await photosRes.json();
    if (!photosData.ok || !photosData.result || photosData.result.photos.length === 0) {
      fs.writeFileSync(nonePath(telegramUserId), '');
      return null;
    }

    // photos[0] — размеры самого свежего фото профиля, от маленького к
    // большому. Берём средний размер — достаточно чётко для иконки 28px,
    // но не тащим полноразмерный оригинал.
    const sizes = photosData.result.photos[0];
    const chosen = sizes[Math.min(1, sizes.length - 1)];

    const fileRes = await fetch(`https://api.telegram.org/bot${TOKEN}/getFile?file_id=${chosen.file_id}`);
    const fileData = await fileRes.json();
    if (!fileData.ok) return null;

    const imgRes = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${fileData.result.file_path}`);
    if (!imgRes.ok) return null;

    const buf = Buffer.from(await imgRes.arrayBuffer());
    const target = jpgPath(telegramUserId);
    fs.writeFileSync(target, buf);
    try { fs.unlinkSync(nonePath(telegramUserId)); } catch (e) { /* не было — и ладно */ }
    return target;
  } catch (err) {
    console.error(`Не удалось получить фото профиля Telegram (id ${telegramUserId}):`, err.message);
    return null; // временная ошибка — не кэшируем «нет фото», попробуем в следующий раз
  }
}

module.exports = { getAvatarPath };
