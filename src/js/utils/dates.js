import { getNFLPlayoffRoundKeys } from '../../../shared/algorithm-config.js';
import { getSeasonInfo } from '../../../shared/season-dates.js';
import { parseLatestPointer } from '../../../shared/static-latest.js';

export function isDateBasedSport(sport) {
  return sport === 'NBA' || sport === 'MLB';
}

export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Human-readable form of a YYYY-MM-DD string or Date, parsed at local
 * midnight. `new Date('YYYY-MM-DD')` is UTC midnight and renders the prior
 * day in US timezones, so callers must not use it for display.
 */
export function formatDisplayDate(dateOrString) {
  const date = typeof dateOrString === 'string' ? parseDate(dateOrString) : dateOrString;
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function isToday(date) {
  const today = new Date();
  return formatDate(date) === formatDate(today);
}

export function isYesterday(date) {
  const yesterday = addDays(new Date(), -1);
  return formatDate(date) === formatDate(yesterday);
}

export function getDefaultNBADate() {
  return formatDate(addDays(new Date(), -1));
}

export function canNavigateToDate(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  return targetDate <= today;
}

// Season and week boundaries live in shared/season-dates.js so the browser,
// the static generator, and the GitHub workflow all agree on them.
export function getCurrentWeek(sport) {
  return getSeasonInfo(sport);
}

export function updateDateNavigation() {
  if (!isDateBasedSport(window.selectedSport) || !window.selectedDate) return;

  const currentDate = parseDate(window.selectedDate);

  const label = document.getElementById('periodLabel');
  if (label) {
    label.textContent = formatDisplayDate(currentDate);
  }

  const nextButton = document.getElementById('nextPeriod');
  if (nextButton) {
    nextButton.disabled = !canNavigateToDate(addDays(currentDate, 1));
  }
  const prevButton = document.getElementById('prevPeriod');
  if (prevButton) prevButton.disabled = false;
}

const CACHE_TTL = {
  NFL: 24 * 60 * 60 * 1000,
  CFB: 24 * 60 * 60 * 1000,
  NBA: 12 * 60 * 60 * 1000,
  MLB: 12 * 60 * 60 * 1000
};

function getCacheKey(sport, season) {
  return `gei_lastWeek_${sport}_${season}`;
}

export function getValidCache(sport, season) {
  const cacheKey = getCacheKey(sport, season);
  const cached = localStorage.getItem(cacheKey);

  if (!cached) return null;

  try {
    const data = JSON.parse(cached);
    const age = Date.now() - data.timestamp;

    if (age > CACHE_TTL[sport]) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    return data;
  } catch (e) {
    localStorage.removeItem(cacheKey);
    return null;
  }
}

export function setCache(sport, season, weekOrDate) {
  const cacheKey = getCacheKey(sport, season);
  const data = {
    week: weekOrDate,
    timestamp: Date.now()
  };
  localStorage.setItem(cacheKey, JSON.stringify(data));
}

export function isCFBPostseason() {
  const now = new Date();
  const month = now.getMonth();
  return month === 11 || month === 0;
}

export function isNFLPostseason() {
  // NFL playoffs run from Wild Card weekend (early January) through Super Bowl (early February)
  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();

  // January (month 0): playoffs after ~Jan 10
  if (month === 0 && day >= 10) return true;
  // February (month 1): playoffs until ~Feb 15 (Super Bowl usually first Sunday in Feb)
  if (month === 1 && day <= 15) return true;

  return false;
}

async function staticFileExists(sport, season, weekOrDate) {
  const path = getStaticPath(sport, season, weekOrDate);

  try {
    const response = await fetch(path, { method: 'HEAD' });
    if (!response.ok) return false;
    // SPA fallbacks return 200 HTML for missing paths; only real JSON counts.
    const contentType = response.headers.get('content-type') || '';
    return contentType.includes('application/json');
  } catch (e) {
    return false;
  }
}

/**
 * Walk day-by-day from fromDateStr until a static slate with games exists.
 * direction: -1 previous, +1 next. Returns the date string or null.
 *
 * When no static file is found within the walk, falls back to the next
 * calendar day in that direction so the caller can load via the live API.
 * Only the immediate step is refused when it lands in the future: today has
 * no static file by design (the generator only writes completed days), so
 * stepping forward onto today must hand off to the API rather than give up.
 */
export async function findAdjacentDateWithData(sport, season, fromDateStr, direction, { maxSteps = 14 } = {}) {
  if (!fromDateStr || !direction) return null;

  const immediate = addDays(parseDate(fromDateStr), direction);
  if (direction > 0 && !canNavigateToDate(immediate)) return null;

  let cursor = parseDate(fromDateStr);
  for (let step = 0; step < maxSteps; step++) {
    cursor = addDays(cursor, direction);
    // Stop the static walk at today; the caller loads it from the live API.
    if (direction > 0 && !canNavigateToDate(cursor)) break;

    const dateStr = formatDate(cursor);
    if (await staticFileExists(sport, season, dateStr)) {
      return dateStr;
    }
  }

  // No nearby static slate — step one calendar day and let loadGames use the API.
  return formatDate(immediate);
}

/**
 * Newest slate with games at or before fromDateStr. Tries the short day-by-day
 * walk first, then the season's latest pointer, which is what reaches back to
 * the previous season during an offseason. Returns the previous calendar day
 * when neither turns one up, so a caller stepping through API-served dates
 * still makes progress.
 */
export async function findPreviousDateWithGames(sport, season, fromDateStr) {
  const walked = await findAdjacentDateWithData(sport, season, fromDateStr, -1);
  if (walked && await staticFileExists(sport, season, walked)) return walked;

  const pointer = await readLatestPointer(sport, season);
  if (pointer && pointer < fromDateStr && await staticFileExists(sport, season, pointer)) {
    return pointer;
  }

  return walked;
}

async function readLatestPointer(sport, season) {
  const sportLower = sport.toLowerCase();
  const path = `/data/${sportLower}/${season}/latest.json`;
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    const data = await response.json();
    const pointer = parseLatestPointer(data);
    return pointer ? pointer.period : null;
  } catch {
    return null;
  }
}

function getStaticPath(sport, season, weekOrDate) {
  const sportLower = sport.toLowerCase();
  // NFL playoff rounds use the round name as the filename (e.g., wild-card.json)
  // Regular weeks use week-XX format
  let filename;
  if (sport === 'NFL' && getNFLPlayoffRoundKeys().includes(weekOrDate)) {
    filename = weekOrDate;
  } else if (weekOrDate === 'bowls' || weekOrDate === 'playoffs') {
    filename = weekOrDate;
  } else if (typeof weekOrDate === 'number') {
    filename = `week-${String(weekOrDate).padStart(2, '0')}`;
  } else {
    filename = weekOrDate;
  }
  return `/data/${sportLower}/${season}/${filename}.json`;
}

// Finds the most recent period with data. Deliberately ignores the
// last-viewed cache so "Latest" always means the newest games.
export async function findLatestAvailable(sport, season) {
  console.log(`🔍 findLatestAvailable(${sport}, ${season})`);

  if (isDateBasedSport(sport)) {
    const emoji = sport === 'NBA' ? '🏀' : '⚾';
    const today = formatDate(new Date());

    // Today is never published — the generator writes a day only once it is
    // complete — so "latest" starts on today and reads it from the live API.
    // A day with nothing final yet costs one cheap request, and loadGames
    // falls back to the newest published slate from there.
    console.log(`${emoji} ${sport}: Starting at today (${today}); loadGames falls back if nothing is final`);
    return { week: today, fromCache: false };
  }

  // Prefer the season's latest.json pointer (one request) when present.
  const fromPointer = await readLatestPointer(sport, season);
  if (fromPointer != null && await staticFileExists(sport, season, fromPointer)) {
    console.log(`✅ Using latest pointer → ${fromPointer}`);
    return { week: fromPointer, fromCache: false };
  }

  // Check for NFL postseason
  if (sport === 'NFL' && isNFLPostseason()) {
    console.log('🏈 NFL postseason detected (Jan/Feb)');
    const playoffRounds = getNFLPlayoffRoundKeys();


    // Check playoff rounds in chronological order
    // wild-card → divisional → conference → super-bowl
    console.log('🔎 Checking playoff rounds: wild-card → divisional → conference → super-bowl...');
    for (const round of playoffRounds) {
      if (await staticFileExists(sport, season, round)) {
        console.log(`✅ Found ${round} data`);
        return { week: round, fromCache: false };
      }
    }

    console.log('⚠️ No playoff data found, falling back to regular season');
  }

  // Check for CFB postseason
  if (sport === 'CFB' && isCFBPostseason()) {
    console.log('🏈 CFB postseason detected (Dec/Jan)');


    console.log('🔎 Checking postseason weeks: playoffs → bowls → week 15...');
    for (const week of ['playoffs', 'bowls']) {
      if (await staticFileExists(sport, season, week)) {
        console.log(`✅ Found ${week} data`);
        return { week, fromCache: false };
      }
    }

    console.log('⚠️ No postseason data found, falling back to regular season');
  }


  if (sport === 'NFL') {
    const { week: currentWeek } = getCurrentWeek('NFL');
    console.log(`🏈 NFL: Starting from week ${currentWeek}, checking backwards`);

    for (let week = currentWeek; week >= 1; week--) {
      if (await staticFileExists(sport, season, week)) {
        console.log(`✅ Found NFL week ${week}`);
        return { week, fromCache: false };
      }
    }

    console.log(`⚠️ No NFL data found, defaulting to week ${currentWeek}`);
    return { week: currentWeek, fromCache: false };
  }

  if (sport === 'CFB') {
    const { week: currentWeek } = getCurrentWeek('CFB');
    console.log(`🏈 CFB: Starting from week ${currentWeek}, checking backwards`);

    for (let week = currentWeek; week >= 1; week--) {
      if (await staticFileExists(sport, season, week)) {
        console.log(`✅ Found CFB week ${week}`);
        return { week, fromCache: false };
      }
    }

    console.log(`⚠️ No CFB data found, defaulting to week ${currentWeek}`);
    return { week: currentWeek, fromCache: false };
  }

  console.log('⚠️ Unexpected sport, using getCurrentWeek fallback');
  const fallback = getCurrentWeek(sport);
  return { week: fallback.week, fromCache: false };
}
