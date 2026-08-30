'use strict';

// Рисует три картинки итогов игрового дня (таблица, журнал игр, личная
// статистика) — SVG собирается вручную и растеризуется через sharp
// (libvips), без headless-браузера. Стиль подглядывает у day-card в
// football-heroes-live.html (тёмная шапка, цвета команд, медали), но не
// является пиксельной копией — это лёгкая переотрисовка тех же данных.

const sharp = require('sharp');

const TEAM_COLORS = [
  { bg: '#c62828', text: '#ffffff' }, // 1 — красный
  { bg: '#1a1a1a', text: '#ffffff' }, // 2 — чёрный
  { bg: '#ff9800', text: '#1a1a1a' }, // 3 — оранжевый
  { bg: '#43a047', text: '#ffffff' }, // 4 — зелёный
  { bg: '#8e24aa', text: '#ffffff' }, // 5 — фиолетовый
];

const WIDTH = 900;
const PAD = 24;
const HEADER_H = 70;
const TITLE_H = 40;
const TABLE_HEAD_H = 34;
const ROW_H = 40;
const FONT = 'DejaVu Sans, Arial, sans-serif';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Как window.formatDate в football-heroes-live.html — ISO (YYYY-MM-DD) →
// ДД.ММ.ГГГГ, иначе (старые записи вида "12.08") без изменений.
function formatDate(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : dateStr;
}

function teamColor(idx) {
  return TEAM_COLORS[((idx % TEAM_COLORS.length) + TEAM_COLORS.length) % TEAM_COLORS.length];
}

// Оценка ширины текста в px — сервер без браузера, реального измерения
// шрифта нет; используется только для переноса длинных списков голов.
function estimateWidth(text, fontSize) {
  return [...String(text)].reduce((sum, ch) => sum + (/[а-яё]/i.test(ch) ? 0.62 : 0.54) * fontSize, 0);
}

function wrapText(text, maxWidth, fontSize) {
  if (!text) return [''];
  const words = String(text).split(' ');
  const lines = [];
  let current = '';
  words.forEach(w => {
    const trial = current ? `${current} ${w}` : w;
    if (current && estimateWidth(trial, fontSize) > maxWidth) {
      lines.push(current);
      current = w;
    } else {
      current = trial;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function rankBadge(cx, cy, rank) {
  const colors = { 1: '#e0b23a', 2: '#a9adb8', 3: '#c07a45' };
  const c = colors[rank];
  if (!c) return `<text x="${cx}" y="${cy + 5}" font-size="14" font-weight="700" text-anchor="middle" fill="#888" font-family="${FONT}">${rank}</text>`;
  return `
    <circle cx="${cx}" cy="${cy}" r="13" fill="${c}"/>
    <text x="${cx}" y="${cy + 5}" font-size="13" font-weight="700" text-anchor="middle" fill="#1a1a1a" font-family="${FONT}">${rank}</text>
  `;
}

function teamChip(x, cy, name, idx, maxWidth) {
  const c = teamColor(idx);
  const fontSize = 12;
  let label = name || '—';
  while (estimateWidth(label, fontSize) > maxWidth - 16 && label.length > 3) {
    label = label.slice(0, -1);
  }
  if (label !== name) label = label.replace(/.{1}$/, '…');
  const w = Math.min(maxWidth, Math.max(64, estimateWidth(label, fontSize) + 20));
  return `
    <rect x="${x}" y="${cy - 13}" width="${w}" height="26" rx="5" fill="#ffffff" stroke="${c.bg}" stroke-width="1.6"/>
    <text x="${x + w / 2}" y="${cy + 4}" font-size="${fontSize}" font-weight="700" text-anchor="middle" fill="${c.bg}" font-family="${FONT}">${esc(label)}</text>
  `;
}

function pageHeader(dateLabel, dayNumber) {
  return `
    <rect x="0" y="0" width="${WIDTH}" height="${HEADER_H}" fill="#1a1a1a"/>
    <rect x="0" y="0" width="6" height="${HEADER_H}" fill="#e53935"/>
    <text x="${PAD}" y="${HEADER_H / 2 + 7}" font-size="24" font-weight="700" fill="#ffffff" font-family="${FONT}">${esc(dateLabel)}</text>
    ${dayNumber ? `<text x="${WIDTH - PAD}" y="${HEADER_H / 2 + 5}" font-size="12" font-weight="600" text-anchor="end" fill="#8a94a6" font-family="${FONT}" letter-spacing="0.5">ДЕНЬ #${dayNumber}</text>` : ''}
  `;
}

function sectionTitle(y, text) {
  return `
    <text x="${PAD}" y="${y}" font-size="13" font-weight="700" fill="#666" font-family="${FONT}" letter-spacing="1">${esc(text.toUpperCase())}</text>
    <rect x="${PAD}" y="${y + 8}" width="${WIDTH - PAD * 2}" height="3" fill="#e53935"/>
  `;
}

function svgWrap(height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${Math.ceil(height)}" viewBox="0 0 ${WIDTH} ${Math.ceil(height)}">
    <rect x="0" y="0" width="${WIDTH}" height="${Math.ceil(height)}" fill="#ffffff"/>
    ${body}
  </svg>`;
}

function tableHeaderRow(y, columns) {
  let cells = `<rect x="${PAD}" y="${y}" width="${WIDTH - PAD * 2}" height="${TABLE_HEAD_H}" fill="#1a1a1a"/>`;
  columns.forEach(col => {
    cells += `<text x="${col.x + (col.align === 'left' ? 10 : col.width / 2)}" y="${y + TABLE_HEAD_H / 2 + 4}" font-size="11" font-weight="700" fill="#ffffff" text-anchor="${col.align === 'left' ? 'start' : 'middle'}" font-family="${FONT}" letter-spacing="0.5">${esc(col.label)}</text>`;
  });
  return cells;
}

function colX(columns) {
  let x = PAD;
  return columns.map(c => {
    const withX = { ...c, x };
    x += c.width;
    return withX;
  });
}

async function toPng(svg) {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Картинка 1: итоговая таблица дня. */
async function renderStandingsImage(dateLabel, dayNumber, teams, standings) {
  const columns = colX([
    { label: '', width: 40, align: 'center' },
    { label: 'КОМАНДА', width: 220, align: 'left' },
    { label: 'И', width: 60, align: 'center' },
    { label: 'В', width: 60, align: 'center' },
    { label: 'Н', width: 60, align: 'center' },
    { label: 'П', width: 60, align: 'center' },
    { label: 'ГОЛЫ', width: 110, align: 'center' },
    { label: 'ОЧКИ', width: WIDTH - PAD * 2 - (40 + 220 + 60 * 4 + 110), align: 'center' },
  ]);
  const titleY = HEADER_H + TITLE_H;
  const tableY = titleY + 14;
  const bodyTop = tableY + TABLE_HEAD_H;
  const height = bodyTop + standings.length * ROW_H + PAD;

  let rows = '';
  standings.forEach((s, i) => {
    const y = bodyTop + i * ROW_H;
    const cy = y + ROW_H / 2;
    if (i === 0 && s.gp > 0) rows += `<rect x="${PAD}" y="${y}" width="${WIDTH - PAD * 2}" height="${ROW_H}" fill="#fff8e1"/>`;
    rows += `<line x1="${PAD}" y1="${y + ROW_H}" x2="${WIDTH - PAD}" y2="${y + ROW_H}" stroke="#eeeeee"/>`;
    rows += rankBadge(columns[0].x + columns[0].width / 2, cy, i + 1);
    rows += teamChip(columns[1].x + 10, cy, teams[s.idx] ? teams[s.idx].name : `Команда ${s.idx + 1}`, s.idx, columns[1].width - 20);
    const num = (colIdx, val, color) => `<text x="${columns[colIdx].x + columns[colIdx].width / 2}" y="${cy + 5}" font-size="14" font-weight="700" text-anchor="middle" fill="${color || '#1a1a1a'}" font-family="${FONT}">${val}</text>`;
    rows += num(2, s.gp);
    rows += num(3, s.w, '#2e7d32');
    rows += num(4, s.d, '#999');
    rows += num(5, s.l, '#c62828');
    rows += num(6, `${s.gf}:${s.ga}`);
    rows += num(7, s.pts, '#c62828');
  });

  const body = `
    ${pageHeader(dateLabel, dayNumber)}
    ${sectionTitle(titleY, 'Итоговая таблица')}
    ${tableHeaderRow(tableY, columns)}
    ${rows}
  `;
  return toPng(svgWrap(height, body));
}

/** Картинка 2: полный журнал мини-игр дня. */
async function renderMatchLogImage(dateLabel, dayNumber, teams, matches) {
  const columns = colX([
    { label: '#', width: 34, align: 'center' },
    { label: 'КОМАНДА А', width: 150, align: 'left' },
    { label: 'СЧЁТ', width: 70, align: 'center' },
    { label: 'КОМАНДА Б', width: 150, align: 'left' },
    { label: 'ГОЛЫ А', width: 0, align: 'left' }, // width вычисляется ниже
    { label: 'ГОЛЫ Б', width: 0, align: 'left' },
  ]);
  const fixedWidth = columns[0].width + columns[1].width + columns[2].width + columns[3].width;
  const remaining = (WIDTH - PAD * 2) - fixedWidth;
  columns[4].width = Math.floor(remaining / 2);
  columns[5].width = remaining - columns[4].width;
  columns[4].x = columns[3].x + columns[3].width;
  columns[5].x = columns[4].x + columns[4].width;

  const teamName = idx => (teams[idx] ? teams[idx].name : `Команда ${idx + 1}`);
  const scorersText = scorers => (scorers || []).map(s => `${s.name} ×${s.goals}${s.assist ? ` (пас: ${s.assist})` : ''}`).join(', ') || '—';

  const titleY = HEADER_H + TITLE_H;
  const tableY = titleY + 14;
  const bodyTop = tableY + TABLE_HEAD_H;

  const fontSize = 11.5;
  const lineH = 15;
  const rowsData = matches.map(m => {
    const linesA = wrapText(scorersText(m.scorersA), columns[4].width - 12, fontSize);
    const linesB = wrapText(scorersText(m.scorersB), columns[5].width - 12, fontSize);
    const lines = Math.max(linesA.length, linesB.length, 1);
    const h = Math.max(ROW_H, lines * lineH + 16);
    return { m, linesA, linesB, h };
  });
  const height = bodyTop + rowsData.reduce((s, r) => s + r.h, 0) + PAD;

  let rows = '';
  let y = bodyTop;
  rowsData.forEach((r, i) => {
    const cy = y + r.h / 2;
    rows += `<line x1="${PAD}" y1="${y + r.h}" x2="${WIDTH - PAD}" y2="${y + r.h}" stroke="#eeeeee"/>`;
    rows += `<text x="${columns[0].x + columns[0].width / 2}" y="${cy + 5}" font-size="13" fill="#999" text-anchor="middle" font-family="${FONT}">${i + 1}</text>`;
    rows += teamChip(columns[1].x + 6, cy, teamName(r.m.teamAIdx), r.m.teamAIdx, columns[1].width - 12);
    rows += `<text x="${columns[2].x + columns[2].width / 2}" y="${cy + 5}" font-size="15" font-weight="800" text-anchor="middle" fill="#1a1a1a" font-family="${FONT}">${r.m.scoreA} : ${r.m.scoreB}</text>`;
    if (typeof r.m.wonByPenalties === 'number') {
      rows += `<text x="${columns[2].x + columns[2].width / 2}" y="${cy + 17}" font-size="8.5" fill="#999" text-anchor="middle" font-family="${FONT}">пен: ${esc(teamName(r.m.wonByPenalties))}</text>`;
    }
    rows += teamChip(columns[3].x + 6, cy, teamName(r.m.teamBIdx), r.m.teamBIdx, columns[3].width - 12);
    const textBlock = (lines, col) => {
      const startY = cy - ((lines.length - 1) * lineH) / 2 + 4;
      return lines.map((line, li) => `<text x="${col.x + 6}" y="${startY + li * lineH}" font-size="${fontSize}" fill="#555" font-family="${FONT}">${esc(line)}</text>`).join('');
    };
    rows += textBlock(r.linesA, columns[4]);
    rows += textBlock(r.linesB, columns[5]);
    y += r.h;
  });

  const body = `
    ${pageHeader(dateLabel, dayNumber)}
    ${sectionTitle(titleY, `Результаты игр (${matches.length})`)}
    ${tableHeaderRow(tableY, columns)}
    ${rows}
  `;
  return toPng(svgWrap(height, body));
}

/** Картинка 3: личная статистика дня. */
async function renderPersonalStatsImage(dateLabel, dayNumber, teams, personal) {
  const columns = colX([
    { label: '#', width: 40, align: 'center' },
    { label: 'ИГРОК', width: 260, align: 'left' },
    { label: 'КОМАНДА', width: 160, align: 'left' },
    { label: 'ГОЛЫ', width: 100, align: 'center' },
    { label: 'ПАСЫ', width: 100, align: 'center' },
    { label: 'ОЧКИ', width: WIDTH - PAD * 2 - (40 + 260 + 160 + 100 + 100), align: 'center' },
  ]);
  const titleY = HEADER_H + TITLE_H;
  const tableY = titleY + 14;
  const bodyTop = tableY + TABLE_HEAD_H;
  const height = bodyTop + personal.length * ROW_H + PAD;

  let rows = '';
  personal.forEach((p, i) => {
    const y = bodyTop + i * ROW_H;
    const cy = y + ROW_H / 2;
    if (i === 0) rows += `<rect x="${PAD}" y="${y}" width="${WIDTH - PAD * 2}" height="${ROW_H}" fill="#fff8e1"/>`;
    rows += `<line x1="${PAD}" y1="${y + ROW_H}" x2="${WIDTH - PAD}" y2="${y + ROW_H}" stroke="#eeeeee"/>`;
    rows += `<text x="${columns[0].x + columns[0].width / 2}" y="${cy + 5}" font-size="13" fill="#999" text-anchor="middle" font-family="${FONT}">${i + 1}</text>`;
    rows += `<text x="${columns[1].x + 10}" y="${cy + 5}" font-size="13.5" font-weight="600" fill="#1a1a1a" font-family="${FONT}">${esc(p.name)}</text>`;
    rows += teamChip(columns[2].x + 6, cy, teams[p.teamIdx] ? teams[p.teamIdx].name : `Команда ${p.teamIdx + 1}`, p.teamIdx, columns[2].width - 12);
    const num = (colIdx, val, color) => `<text x="${columns[colIdx].x + columns[colIdx].width / 2}" y="${cy + 5}" font-size="14" font-weight="700" text-anchor="middle" fill="${color || '#1a1a1a'}" font-family="${FONT}">${val}</text>`;
    rows += num(3, p.goals, '#c62828');
    rows += num(4, p.assists);
    rows += num(5, p.goals + p.assists, '#c62828');
  });

  const body = `
    ${pageHeader(dateLabel, dayNumber)}
    ${sectionTitle(titleY, 'Личная статистика игрового дня')}
    ${tableHeaderRow(tableY, columns)}
    ${rows}
  `;
  return toPng(svgWrap(height, body));
}

/**
 * Генерирует все три картинки итогов дня.
 * day — { date, teams }, standings — из computeStandings, personal — из
 * computeDayPersonalStats (см. core/stats.js — тот же формат, что и веб).
 */
async function renderDayReportImages(day, standings, personal) {
  const dayNumber = day.dayNumber || null;
  const dateLabel = formatDate(day.date);
  const [standingsImg, matchLogImg, personalImg] = await Promise.all([
    renderStandingsImage(dateLabel, dayNumber, day.teams, standings),
    renderMatchLogImage(dateLabel, dayNumber, day.teams, day.matches),
    renderPersonalStatsImage(dateLabel, dayNumber, day.teams, personal),
  ]);
  return { standingsImg, matchLogImg, personalImg };
}

module.exports = { renderDayReportImages };
