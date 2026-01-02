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

function handlePreviousDate() {
    if (selectedSport !== 'NBA' || !selectedDate) return;

    const currentDate = parseDate(selectedDate);
    const prevDate = addDays(currentDate, -1);

    selectedDate = formatDate(prevDate);
    isInitialLoad = false;

    if (typeof updateUI === 'function') updateUI();
    if (typeof loadGames === 'function') loadGames();
}

function handleNextDate() {
    if (selectedSport !== 'NBA' || !selectedDate) return;

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
    if (selectedSport !== 'NBA' || !selectedDate) return;

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
    handleNextWeek
};
