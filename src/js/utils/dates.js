import { getNFLPlayoffRoundKeys } from '../../../shared/algorithm-config.js';
import { getSeasonInfo } from '../../../shared/season-dates.js';

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
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const label = document.getElementById('periodLabel');
  if (label) {
    label.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
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
    return response.ok;
  } catch (e) {
    return false;
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

  if (sport === 'NBA' || sport === 'MLB') {
    const today = new Date();
    const emoji = sport === 'NBA' ? '🏀' : '⚾';
    console.log(`${emoji} ${sport}: Checking backwards from yesterday`);

    for (let daysAgo = 1; daysAgo <= 7; daysAgo++) {
      const date = addDays(today, -daysAgo);
      const dateStr = formatDate(date);

      if (await staticFileExists(sport, season, dateStr)) {
        console.log(`✅ Found ${sport} date ${dateStr}`);
        return { week: dateStr, fromCache: false };
      }
    }

    const yesterday = formatDate(addDays(today, -1));
    console.log(`⚠️ No ${sport} data found in last 7 days, defaulting to ${yesterday}`);
    return { week: yesterday, fromCache: false };
  }

  console.log('⚠️ Unexpected sport, using getCurrentWeek fallback');
  const fallback = getCurrentWeek(sport);
  return { week: fallback.week, fromCache: false };
}
