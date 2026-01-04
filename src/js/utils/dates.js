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

export function getCurrentWeek(sport) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (sport === 'NFL') {
    let season = year;
    let seasonStart = new Date(year, 8, 1);

    while (seasonStart.getDay() !== 1) {
      seasonStart.setDate(seasonStart.getDate() + 1);
    }
    seasonStart.setDate(seasonStart.getDate() + 3);

    if (now < seasonStart) {
      season = year - 1;
      seasonStart = new Date(season, 8, 1);
      while (seasonStart.getDay() !== 1) {
        seasonStart.setDate(seasonStart.getDate() + 1);
      }
      seasonStart.setDate(seasonStart.getDate() + 3);
    }

    const daysSinceStart = Math.floor((now - seasonStart) / (24 * 60 * 60 * 1000));
    let week = Math.floor(daysSinceStart / 7) + 1;
    week = Math.min(18, Math.max(1, week));
    return { season: season, week: week };
  }

  if (sport === 'CFB') {
    let season = year;
    let seasonStart = new Date(year, 7, 24);

    if (now < seasonStart) {
      season = year - 1;
      seasonStart = new Date(season, 7, 24);
    }

    const daysSinceStart = Math.floor((now - seasonStart) / (24 * 60 * 60 * 1000));
    let week = Math.floor(daysSinceStart / 7) + 1;
    week = Math.min(15, Math.max(1, week));
    return { season: season, week: week };
  }

  if (sport === 'NBA') {
    const season = month >= 9 ? year : year - 1;
    const info = { season: season, week: 1 };
    console.log('🏀 getCurrentWeek(NBA):', info);
    return info;
  }

  return { season: year, week: 1 };
}

export function updateDateNavigation() {
  if (window.selectedSport !== 'NBA' || !window.selectedDate) return;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentDate = parseDate(window.selectedDate);

  const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const yesterday = addDays(today, -1);
  const twoDaysAgo = addDays(today, -2);

  let currentDisplayText;
  if (formatDate(currentDate) === formatDate(today)) {
    currentDisplayText = 'today';
  } else if (formatDate(currentDate) === formatDate(yesterday)) {
    currentDisplayText = 'yesterday';
  } else if (formatDate(currentDate) === formatDate(twoDaysAgo)) {
    currentDisplayText = '2 days ago';
  } else {
    currentDisplayText = `${monthShort[currentDate.getMonth()]} ${currentDate.getDate()}`;
  }

  const currentDisplay = document.getElementById('currentDateDisplay');
  if (currentDisplay) currentDisplay.textContent = currentDisplayText;

  const prevDate = addDays(currentDate, -1);
  const nextDate = addDays(currentDate, 1);

  const prevDisplay = document.getElementById('prevDateDisplay');
  const nextDisplay = document.getElementById('nextDateDisplay');

  if (prevDisplay) {
    prevDisplay.textContent = `${monthShort[prevDate.getMonth()]} ${prevDate.getDate()}`;
  }

  if (nextDisplay) {
    const canGoNext = canNavigateToDate(nextDate);
    nextDisplay.textContent = canGoNext ? `${monthShort[nextDate.getMonth()]} ${nextDate.getDate()}` : '';

    const nextButton = document.getElementById('nextDate');
    if (nextButton) {
      nextButton.style.opacity = canGoNext ? '1' : '0.3';
      nextButton.style.pointerEvents = canGoNext ? 'auto' : 'none';
    }
  }
}

const CACHE_TTL = {
  NFL: 24 * 60 * 60 * 1000,
  CFB: 24 * 60 * 60 * 1000,
  NBA: 12 * 60 * 60 * 1000
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
  return `data/static/${sportLower}/${season}/${weekOrDate}.json`;
}

export async function findLatestAvailable(sport, season) {
  console.log(`🔍 findLatestAvailable(${sport}, ${season})`);

  if (sport === 'CFB' && isCFBPostseason()) {
    console.log('🏈 CFB postseason detected (Dec/Jan)');

    const cached = getValidCache(sport, season);
    if (cached && (cached.week === 'playoffs' || cached.week === 'bowls')) {
      console.log(`✅ Using cached postseason week: ${cached.week}`);
      return { week: cached.week, fromCache: true };
    }

    if (cached && typeof cached.week === 'number') {
      console.log(`⚠️ Ignoring cached regular season week ${cached.week} during postseason`);
    }

    console.log('🔎 Checking postseason weeks: playoffs → bowls → week 15...');
    for (const week of ['playoffs', 'bowls']) {
      if (await staticFileExists(sport, season, week)) {
        console.log(`✅ Found ${week} data`);
        return { week, fromCache: false };
      }
    }

    console.log('⚠️ No postseason data found, falling back to regular season');
  }

  const cached = getValidCache(sport, season);
  if (cached) {
    console.log(`✅ Using cached week/date: ${cached.week}`);
    return { week: cached.week, fromCache: true };
  }

  console.log('🔎 No valid cache, starting HEAD request discovery');

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

  if (sport === 'NBA') {
    const today = new Date();
    console.log('🏀 NBA: Checking backwards from yesterday');

    for (let daysAgo = 1; daysAgo <= 7; daysAgo++) {
      const date = addDays(today, -daysAgo);
      const dateStr = formatDate(date);

      if (await staticFileExists(sport, season, dateStr)) {
        console.log(`✅ Found NBA date ${dateStr}`);
        return { week: dateStr, fromCache: false };
      }
    }

    const yesterday = formatDate(addDays(today, -1));
    console.log(`⚠️ No NBA data found in last 7 days, defaulting to ${yesterday}`);
    return { week: yesterday, fromCache: false };
  }

  console.log('⚠️ Unexpected sport, using getCurrentWeek fallback');
  const fallback = getCurrentWeek(sport);
  return { week: fallback.week, fromCache: false };
}
