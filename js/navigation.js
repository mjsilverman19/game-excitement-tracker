// Navigation Module - Date and Week Navigation Logic

// Simple, reliable date utilities
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseDate(dateString) {
    // Parse date string (YYYY-MM-DD) as local time to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function isToday(date) {
    const today = new Date();
    return formatDate(date) === formatDate(today);
}

function isYesterday(date) {
    const yesterday = addDays(new Date(), -1);
    return formatDate(date) === formatDate(yesterday);
}

// NBA Date Navigation
function getDefaultNBADate() {
    // Default to yesterday for NBA (most recent completed games)
    return formatDate(addDays(new Date(), -1));
}

function canNavigateToDate(date) {
    // Allow navigation to today or any past date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    return targetDate <= today;
}

function isDateBasedSport(sport) {
    return sport === 'NBA' || sport === 'SOCCER';
}

async function handlePreviousDate() {
    if (!isDateBasedSport(selectedSport) || !selectedDate) return;

    // SOCCER: Use index-based navigation
    if (selectedSport === 'SOCCER') {
        if (typeof loadSoccerDateIndex !== 'function') {
            console.error('loadSoccerDateIndex not available');
            return;
        }

        const dates = await loadSoccerDateIndex(selectedLeague);
        const currentIndex = dates.indexOf(selectedDate);

        if (currentIndex < dates.length - 1) {
            selectedDate = dates[currentIndex + 1];  // Next older date
            isInitialLoad = false;

            if (typeof updateUI === 'function') updateUI();
            if (typeof loadGames === 'function') loadGames();
        }
        return;
    }

    // NBA: Day-by-day navigation
    const currentDate = parseDate(selectedDate);
    const prevDate = addDays(currentDate, -1);

    selectedDate = formatDate(prevDate);
    isInitialLoad = false;

    if (typeof updateUI === 'function') updateUI();
    if (typeof loadGames === 'function') loadGames();
}

async function handleNextDate() {
    if (!isDateBasedSport(selectedSport) || !selectedDate) return;

    // SOCCER: Use index-based navigation
    if (selectedSport === 'SOCCER') {
        if (typeof loadSoccerDateIndex !== 'function') {
            console.error('loadSoccerDateIndex not available');
            return;
        }

        const dates = await loadSoccerDateIndex(selectedLeague);
        const currentIndex = dates.indexOf(selectedDate);

        if (currentIndex > 0) {
            selectedDate = dates[currentIndex - 1];  // Next newer date
            isInitialLoad = false;

            if (typeof updateUI === 'function') updateUI();
            if (typeof loadGames === 'function') loadGames();
        }
        return;
    }

    // NBA: Day-by-day navigation
    const currentDate = parseDate(selectedDate);
    const nextDate = addDays(currentDate, 1);

    if (canNavigateToDate(nextDate)) {
        selectedDate = formatDate(nextDate);
        isInitialLoad = false;

        if (typeof updateUI === 'function') updateUI();
        if (typeof loadGames === 'function') loadGames();
    }
}

// NFL/CFB Week Navigation
function getCurrentWeek(sport) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed

    if (sport === 'NFL') {
        // NFL season runs September - January
        let season;
        let seasonStart;

        // Try current year's season first
        season = year;
        seasonStart = new Date(year, 8, 1); // Sept 1

        // Find first Monday (week 1 usually starts first Monday)
        while (seasonStart.getDay() !== 1) {
            seasonStart.setDate(seasonStart.getDate() + 1);
        }
        // Add a few days to account for season start variations
        seasonStart.setDate(seasonStart.getDate() + 3);

        // If we're before this season's start, use previous year's season
        if (now < seasonStart) {
            season = year - 1;
            seasonStart = new Date(season, 8, 1); // Sept 1 of previous year
            while (seasonStart.getDay() !== 1) {
                seasonStart.setDate(seasonStart.getDate() + 1);
            }
            seasonStart.setDate(seasonStart.getDate() + 3);
        }

        // Calculate weeks since season start
        const daysSinceStart = Math.floor((now - seasonStart) / (24 * 60 * 60 * 1000));
        let week = Math.floor(daysSinceStart / 7) + 1;

        // Cap at week 18
        week = Math.min(18, Math.max(1, week));
        return { season: season, week: week };

    } else if (sport === 'CFB') {
        // CFB season runs late August - early January
        let season;
        let seasonStart;

        // Try current year's season first
        season = year;
        seasonStart = new Date(year, 7, 24); // Aug 24 (roughly last week of August)

        // If we're before this season's start, use previous year's season
        if (now < seasonStart) {
            season = year - 1;
            seasonStart = new Date(season, 7, 24); // Aug 24 of previous year
        }

        // Calculate weeks since season start
        const daysSinceStart = Math.floor((now - seasonStart) / (24 * 60 * 60 * 1000));
        let week = Math.floor(daysSinceStart / 7) + 1;

        // Cap at week 15 (regular season)
        week = Math.min(15, Math.max(1, week));
        return { season: season, week: week };
    } else if (sport === 'NBA') {
        // NBA season runs October - April (next year); season year is the start year
        const season = month >= 9 ? year : year - 1; // October (9) through December use current year
        const info = { season: season, week: 1 };
        console.log('🏀 getCurrentWeek(NBA):', info);
        return info;
    } else if (sport === 'SOCCER') {
        const info = { season: year, week: formatDate(addDays(now, -1)) };
        console.log('⚽ getCurrentWeek(SOCCER):', info);
        return info;
    }

    return { season: year, week: 1 };
}

function handlePreviousWeek() {
    if (selectedSport === 'NBA') {
        handlePreviousDate();
        return;
    }

    // For CFB: playoffs → bowls → week 15 → ...
    // For NFL: week 18 → week 17 → ...
    if (selectedSport === 'CFB') {
        if (selectedWeek === 'playoffs') {
            selectedWeek = 'bowls';
        } else if (selectedWeek === 'bowls') {
            selectedWeek = 15;
        } else {
            selectedWeek = Math.max(1, selectedWeek - 1);
        }
    } else {
        selectedWeek = Math.max(1, selectedWeek - 1);
    }

    isInitialLoad = false;
    if (typeof updateUI === 'function') updateUI();
    if (typeof loadGames === 'function') loadGames();
}

function handleNextWeek() {
    if (selectedSport === 'NBA') {
        handleNextDate();
        return;
    }

    const maxWeek = selectedSport === 'NFL' ? 18 : 15;

    // For CFB: ... → week 15 → bowls → playoffs
    // For NFL: ... → week 17 → week 18
    if (selectedSport === 'CFB') {
        if (selectedWeek === 'bowls') {
            selectedWeek = 'playoffs';
        } else if (selectedWeek < maxWeek) {
            selectedWeek++;
        } else if (selectedWeek === maxWeek) {
            selectedWeek = 'bowls';
        }
    } else {
        if (selectedWeek < maxWeek) {
            selectedWeek++;
        }
    }

    isInitialLoad = false;
    if (typeof updateUI === 'function') updateUI();
    if (typeof loadGames === 'function') loadGames();
}

// Date Navigation UI Updates
function updateDateNavigation() {
    if (!isDateBasedSport(selectedSport) || !selectedDate) return;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentDate = parseDate(selectedDate);

    // Format display dates
    const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const yesterday = addDays(today, -1);
    const twoDaysAgo = addDays(today, -2);

    // Update current date display
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

    // Update navigation buttons
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

// Initialize navigation event listeners
function initNavigation() {
    // Previous/Next date buttons (NBA)
    const prevButton = document.getElementById('prevDate');
    const nextButton = document.getElementById('nextDate');

    if (prevButton) {
        prevButton.addEventListener('click', (e) => {
            e.preventDefault();
            handlePreviousDate();
        });
    }

    if (nextButton) {
        nextButton.addEventListener('click', (e) => {
            e.preventDefault();
            handleNextDate();
        });
    }

    // Previous/Next week buttons (NFL/CFB)
    const prevWeekButton = document.getElementById('prevWeek');
    const nextWeekButton = document.getElementById('nextWeek');

    if (prevWeekButton) {
        prevWeekButton.addEventListener('click', (e) => {
            e.preventDefault();
            handlePreviousWeek();
        });
    }

    if (nextWeekButton) {
        nextWeekButton.addEventListener('click', (e) => {
            e.preventDefault();
            handleNextWeek();
        });
    }
}

// ===== SMART WEEK DISCOVERY WITH CACHING =====

// Cache management
const CACHE_TTL = {
    'NFL': 24 * 60 * 60 * 1000,  // 24 hours
    'CFB': 24 * 60 * 60 * 1000,  // 24 hours
    'NBA': 12 * 60 * 60 * 1000,  // 12 hours
    'SOCCER': 12 * 60 * 60 * 1000
};

function getCacheKey(sport, season, league) {
    if (sport === 'SOCCER' && league) {
        return `gei_lastWeek_${sport}_${league}_${season}`;
    }
    return `gei_lastWeek_${sport}_${season}`;
}

function getValidCache(sport, season, league) {
    const cacheKey = getCacheKey(sport, season, league);
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

function setCache(sport, season, weekOrDate, league) {
    const cacheKey = getCacheKey(sport, season, league);
    const data = {
        week: weekOrDate,
        timestamp: Date.now()
    };
    localStorage.setItem(cacheKey, JSON.stringify(data));
}

function isCFBPostseason() {
    const now = new Date();
    const month = now.getMonth(); // 0-indexed
    // December (11) or January (0)
    return month === 11 || month === 0;
}

// Check if static file exists via HEAD request
async function staticFileExists(sport, season, weekOrDate, league) {
    const path = getStaticPath(sport, season, weekOrDate, league);

    try {
        const response = await fetch(path, { method: 'HEAD' });
        return response.ok;
    } catch (e) {
        return false;
    }
}

// Helper to find recent soccer date with games by querying Polymarket API
async function findRecentSoccerDate(league, maxDaysBack) {
    const SERIES_IDS = {
        'EPL': '10188',
        'CHAMPIONS_LEAGUE': '10204',
        'LA_LIGA': '10193',
        'BUNDESLIGA': '10194',
        'SERIE_A': '10203',
        'MLS': '10189'
    };

    const seriesId = SERIES_IDS[league];
    if (!seriesId) {
        console.warn(`⚠️ Unknown league: ${league}`);
        return null;
    }

    try {
        console.log(`🔍 Querying Polymarket for recent ${league} games...`);
        // Fetch more events and filter/sort client-side since API doesn't support sort by date
        const response = await fetch(
            `https://gamma-api.polymarket.com/events?series_id=${seriesId}&limit=500`
        );

        if (!response.ok) {
            console.warn(`⚠️ Polymarket API error: ${response.status}`);
            return null;
        }

        const events = await response.json();

        // Find the most recent closed event date within maxDaysBack
        const today = new Date();
        const cutoff = addDays(today, -maxDaysBack);

        const recentDates = events
            .filter(e => e.startDate && e.closed === true)
            .map(e => new Date(e.startDate))
            .filter(d => d >= cutoff && d <= today)
            .sort((a, b) => b - a);

        if (recentDates.length > 0) {
            const foundDate = formatDate(recentDates[0]);
            console.log(`✅ Found recent ${league} games on ${foundDate}`);
            return foundDate;
        }

        console.warn(`⚠️ No recent ${league} games found in last ${maxDaysBack} days`);
    } catch (e) {
        console.error('Error finding recent soccer date:', e);
    }

    return null;
}

// Helper to construct static file path (matches main app logic)
function getStaticPath(sport, season, weekOrDate, league) {
    const sportLower = sport.toLowerCase();
    if (sport === 'SOCCER') {
        const leagueLower = league ? league.toLowerCase() : '';
        return `/data/${sportLower}/${leagueLower}/${season}/${weekOrDate}.json`;
    }
    if (sport === 'NBA') {
        return `/data/${sportLower}/${season}/${weekOrDate}.json`;
    }
    let weekStr;
    if (weekOrDate === 'bowls') {
        weekStr = 'bowls';
    } else if (weekOrDate === 'playoffs') {
        weekStr = 'playoffs';
    } else {
        weekStr = `week-${String(weekOrDate).padStart(2, '0')}`;
    }
    return `/data/${sportLower}/${season}/${weekStr}.json`;
}

// Main discovery function: Find the most recent week/date with available data
async function findLatestAvailable(sport, season, league) {
    console.log(`🔍 findLatestAvailable(${sport}, ${season})`);

    // CFB POSTSEASON: Special handling
    if (sport === 'CFB' && isCFBPostseason()) {
        console.log('🏈 CFB postseason detected (Dec/Jan)');

        // Only trust postseason cache entries
        const cached = getValidCache(sport, season, league);
        if (cached && (cached.week === 'playoffs' || cached.week === 'bowls')) {
            console.log(`✅ Using cached postseason week: ${cached.week}`);
            return { week: cached.week, fromCache: true };
        }

        if (cached && typeof cached.week === 'number') {
            console.log(`⚠️ Ignoring cached regular season week ${cached.week} during postseason`);
        }

        // Check playoffs → bowls → regular season
        console.log('🔎 Checking postseason weeks: playoffs → bowls → week 15...');
        for (const week of ['playoffs', 'bowls']) {
            if (await staticFileExists(sport, season, week, league)) {
                console.log(`✅ Found ${week} data`);
                return { week, fromCache: false };
            }
        }

        console.log('⚠️ No postseason data found, falling back to regular season');
        // Fall through to regular season discovery
    }

    // STANDARD PATH: NFL, NBA, or CFB regular season
    const cached = getValidCache(sport, season, league);
    if (cached) {
        console.log(`✅ Using cached week/date: ${cached.week}`);
        return { week: cached.week, fromCache: true };
    }

    console.log('🔎 No valid cache, starting HEAD request discovery');

    // HEAD REQUEST DISCOVERY
    if (sport === 'NFL') {
        // NFL: Check current week → previous weeks
        const { week: currentWeek } = getCurrentWeek('NFL');
        console.log(`🏈 NFL: Starting from week ${currentWeek}, checking backwards`);

        for (let week = currentWeek; week >= 1; week--) {
            if (await staticFileExists(sport, season, week, league)) {
                console.log(`✅ Found NFL week ${week}`);
                return { week, fromCache: false };
            }
        }

        // No data found, return current week (will trigger API fallback)
        console.log(`⚠️ No NFL data found, defaulting to week ${currentWeek}`);
        return { week: currentWeek, fromCache: false };

    } else if (sport === 'CFB') {
        // CFB regular season: Check current week → previous weeks
        const { week: currentWeek } = getCurrentWeek('CFB');
        console.log(`🏈 CFB: Starting from week ${currentWeek}, checking backwards`);

        for (let week = currentWeek; week >= 1; week--) {
            if (await staticFileExists(sport, season, week, league)) {
                console.log(`✅ Found CFB week ${week}`);
                return { week, fromCache: false };
            }
        }

        // No data found, return current week (will trigger API fallback)
        console.log(`⚠️ No CFB data found, defaulting to week ${currentWeek}`);
        return { week: currentWeek, fromCache: false };

    } else if (sport === 'NBA') {
        // NBA: Check yesterday → day before → ...
        const today = new Date();
        console.log(`🏀 NBA: Checking backwards from yesterday`);

        for (let daysAgo = 1; daysAgo <= 7; daysAgo++) {
            const date = addDays(today, -daysAgo);
            const dateStr = formatDate(date);

            if (await staticFileExists(sport, season, dateStr, league)) {
                console.log(`✅ Found NBA date ${dateStr}`);
                return { week: dateStr, fromCache: false }; // 'week' field is actually date for NBA
            }
        }

        // No data found in last 7 days, return yesterday (will trigger API fallback)
        const yesterday = formatDate(addDays(today, -1));
        console.log(`⚠️ No NBA data found in last 7 days, defaulting to ${yesterday}`);
        return { week: yesterday, fromCache: false };
    } else if (sport === 'SOCCER') {
        const today = new Date();
        console.log(`⚽ SOCCER: Checking backwards from yesterday for league ${league}`);

        // First try static files
        for (let daysAgo = 1; daysAgo <= 14; daysAgo++) {
            const date = addDays(today, -daysAgo);
            const dateStr = formatDate(date);

            if (await staticFileExists(sport, season, dateStr, league)) {
                console.log(`✅ Found SOCCER static file for ${dateStr}`);
                return { week: dateStr, fromCache: false };
            }
        }

        // If no static files, query API for recent dates with games
        console.log(`⚠️ No static files found, querying Polymarket for recent games`);
        const recentDate = await findRecentSoccerDate(league, 14);
        if (recentDate) {
            return { week: recentDate, fromCache: false };
        }

        // Final fallback
        const yesterday = formatDate(addDays(today, -1));
        console.log(`⚠️ No SOCCER data found, defaulting to ${yesterday}`);
        return { week: yesterday, fromCache: false };
    }

    // Fallback: should never reach here
    console.log('⚠️ Unexpected sport, using getCurrentWeek fallback');
    const fallback = getCurrentWeek(sport);
    return { week: fallback.week, fromCache: false };
}

// Export functions for use by other modules
window.Navigation = {
    addDays,
    formatDate,
    parseDate,
    isToday,
    isYesterday,
    getDefaultNBADate,
    canNavigateToDate,
    getCurrentWeek,
    updateDateNavigation,
    initNavigation,
    handlePreviousDate,
    handleNextDate,
    handlePreviousWeek,
    handleNextWeek,
    // Cache and discovery functions
    findLatestAvailable,
    setCache,
    getValidCache,
    isCFBPostseason
};
