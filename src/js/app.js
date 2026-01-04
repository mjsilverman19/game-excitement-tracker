import { ALGORITHM_CONFIG, getTier } from '../../shared/algorithm-config.js';
import { initSupabase, upsertVoteToSupabase, deleteVoteFromSupabase } from './services/supabase.js';
import { loadVotes, saveVotes } from './services/storage.js';
import {
    addDays,
    canNavigateToDate,
    findLatestAvailable,
    formatDate,
    getCurrentWeek,
    getDefaultNBADate,
    isToday,
    isYesterday,
    parseDate,
    setCache,
    updateDateNavigation
} from './utils/dates.js';

window.ALGORITHM_CONFIG = ALGORITHM_CONFIG;
window.getTier = getTier;

        // Legacy function for backwards compatibility
        function getCurrentNFLWeek() {
            return getCurrentWeek('NFL');
        }

        // State
        const currentNFLWeek = getCurrentNFLWeek();
        window.selectedSport = 'NFL';
        window.selectedSeason = currentNFLWeek.season;
        window.selectedWeek = currentNFLWeek.week;
        window.selectedDate = null; // For NBA date-based navigation
        window.spoilerFree = localStorage.getItem('spoilerFree') !== 'false';
        window.currentGames = null;
        window.periodAverages = null;
        window.isLoading = false;
        window.isInitialLoad = true; // Track if this is the first load to enable auto-fallback

        // Theme state
        window.currentTheme = localStorage.getItem('theme') || 'dark';

        // Team lookup state
        window.viewMode = 'week'; // 'week' | 'schedule' | 'single-game'
        window.selectedTeam = null;
        window.selectedGameFromSchedule = null;
        window.allTeams = [];
        window.currentSchedule = null;
        window.pickerMonth = null;
        window.pickerYear = null;

        // Initialize
        async function init() {
            // Initialize Supabase (async, won't block UI)
            initSupabase(); // Fire and forget

            updateThemeToggleText();
            attachEventListeners();

            initNavigation();

            // Smart week discovery: Find the best starting week/date before loading games
            const result = await findLatestAvailable(window.selectedSport, window.selectedSeason);

            if (window.selectedSport === 'NBA') {
                window.selectedDate = result.week; // For NBA, 'week' is actually the date string
            } else {
                window.selectedWeek = result.week;
            }

            console.log(`📍 Smart discovery: Starting with ${window.selectedSport} ${window.selectedSport === 'NBA' ? 'date' : 'week'} ${result.week} (fromCache: ${result.fromCache})`);

            updateUI();
            loadGames();
        }

        // Theme Toggle Functions
        function toggleTheme() {
            window.currentTheme = window.currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', window.currentTheme);
            localStorage.setItem('theme', window.currentTheme);
            updateThemeToggleText();
        }

        function updateThemeToggleText() {
            const themeToggle = document.getElementById('themeToggle');
            if (themeToggle) {
                themeToggle.textContent = window.currentTheme === 'dark' ? 'light' : 'dark';
            }
        }

        // Update UI elements
        function updateUI() {
            // Update header week info
            const now = new Date();
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

            if (window.selectedSport === 'NBA') {
                const dateObj = window.selectedDate ? new Date(window.selectedDate) : new Date(now.getTime() - 24*60*60*1000);
                document.getElementById('headerWeekInfo').textContent =
                    `${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}, ${dateObj.getFullYear()}`;
            } else {
                if (window.selectedWeek === 'bowls') {
                    document.getElementById('headerWeekInfo').textContent =
                        `Bowl Season · ${monthNames[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
                } else if (window.selectedWeek === 'playoffs') {
                    document.getElementById('headerWeekInfo').textContent =
                        `College Football Playoff · ${monthNames[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
                } else {
                    document.getElementById('headerWeekInfo').textContent =
                        `Week ${window.selectedWeek} · ${monthNames[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
                }
            }

            // Update sport selector
            document.getElementById('nflOption').classList.toggle('active', window.selectedSport === 'NFL');
            document.getElementById('cfbOption').classList.toggle('active', window.selectedSport === 'CFB');
            document.getElementById('nbaOption').classList.toggle('active', window.selectedSport === 'NBA');

            // Show/hide appropriate navigation
            if (window.selectedSport === 'NBA') {
                document.getElementById('weekSelector').style.display = 'none';
                document.getElementById('dateSelector').style.display = 'block';
                updateDateNavigation();
            } else {
                document.getElementById('weekSelector').style.display = 'block';
                document.getElementById('dateSelector').style.display = 'none';
                updateWeekNavigation();
            }
        }

        // Update week-based navigation (NFL/CFB)
        function updateWeekNavigation() {
            // Update week display
            if (window.selectedWeek === 'bowls') {
                document.getElementById('currentWeekDisplay').textContent =
                    `${window.selectedSeason} · bowls`;
            } else if (window.selectedWeek === 'playoffs') {
                document.getElementById('currentWeekDisplay').textContent =
                    `${window.selectedSeason} · playoffs`;
            } else {
                document.getElementById('currentWeekDisplay').textContent =
                    `${window.selectedSeason} · week ${window.selectedWeek}`;
            }

            // Update prev/next week numbers
            const maxWeeks = window.selectedSport === 'NFL' ? 18 : 15;
            const prevWeekLink = document.getElementById('prevWeek');
            const nextWeekLink = document.getElementById('nextWeek');

            // Handle navigation for CFB playoffs
            if (window.selectedWeek === 'playoffs') {
                // Previous from playoffs is bowls
                document.getElementById('prevWeekNum').textContent = 'bowls';
                prevWeekLink.style.display = 'inline';
                nextWeekLink.style.display = 'none';
            } else if (window.selectedWeek === 'bowls') {
                // Previous from bowls is week 15, next is playoffs for CFB
                document.getElementById('prevWeekNum').textContent = maxWeeks;
                prevWeekLink.style.display = 'inline';
                if (window.selectedSport === 'CFB') {
                    document.getElementById('nextWeekNum').textContent = 'playoffs';
                    nextWeekLink.style.display = 'inline';
                } else {
                    nextWeekLink.style.display = 'none';
                }
            } else {
                const prevWeekNum = window.selectedWeek > 1 ? window.selectedWeek - 1 : null;
                let nextWeekNum;

                // For CFB at week 15, next is "bowls"
                if (window.selectedSport === 'CFB' && window.selectedWeek === maxWeeks) {
                    nextWeekNum = 'bowls';
                } else if (window.selectedWeek < maxWeeks) {
                    nextWeekNum = window.selectedWeek + 1;
                } else {
                    nextWeekNum = null;
                }

                if (prevWeekNum) {
                    document.getElementById('prevWeekNum').textContent = prevWeekNum;
                    prevWeekLink.style.display = 'inline';
                } else {
                    prevWeekLink.style.display = 'none';
                }

                if (nextWeekNum) {
                    if (nextWeekNum === 'bowls') {
                        document.getElementById('nextWeekNum').textContent = 'bowls';
                    } else {
                        document.getElementById('nextWeekNum').textContent = nextWeekNum;
                    }
                    nextWeekLink.style.display = 'inline';
                } else {
                    nextWeekLink.style.display = 'none';
                }
            }
        }

        function handlePreviousDate() {
            if (window.selectedSport !== 'NBA' || !window.selectedDate) return;

            const currentDate = parseDate(window.selectedDate);
            const prevDate = addDays(currentDate, -1);

            window.selectedDate = formatDate(prevDate);
            window.isInitialLoad = false;

            updateUI();
            loadGames();
        }

        function handleNextDate() {
            if (window.selectedSport !== 'NBA' || !window.selectedDate) return;

            const currentDate = parseDate(window.selectedDate);
            const nextDate = addDays(currentDate, 1);

            if (canNavigateToDate(nextDate)) {
                window.selectedDate = formatDate(nextDate);
                window.isInitialLoad = false;

                updateUI();
                loadGames();
            }
        }

        function handlePreviousWeek() {
            if (window.selectedSport === 'NBA') {
                handlePreviousDate();
                return;
            }

            if (window.selectedSport === 'CFB') {
                if (window.selectedWeek === 'playoffs') {
                    window.selectedWeek = 'bowls';
                } else if (window.selectedWeek === 'bowls') {
                    window.selectedWeek = 15;
                } else {
                    window.selectedWeek = Math.max(1, window.selectedWeek - 1);
                }
            } else {
                window.selectedWeek = Math.max(1, window.selectedWeek - 1);
            }

            window.isInitialLoad = false;
            updateUI();
            loadGames();
        }

        function handleNextWeek() {
            if (window.selectedSport === 'NBA') {
                handleNextDate();
                return;
            }

            const maxWeek = window.selectedSport === 'NFL' ? 18 : 15;

            if (window.selectedSport === 'CFB') {
                if (window.selectedWeek === 'bowls') {
                    window.selectedWeek = 'playoffs';
                } else if (window.selectedWeek < maxWeek) {
                    window.selectedWeek++;
                } else if (window.selectedWeek === maxWeek) {
                    window.selectedWeek = 'bowls';
                }
            } else {
                if (window.selectedWeek < maxWeek) {
                    window.selectedWeek++;
                }
            }

            window.isInitialLoad = false;
            updateUI();
            loadGames();
        }

        function initNavigation() {
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

        // Attach event listeners
        function attachEventListeners() {
            // Sport selector
            document.getElementById('nflOption').addEventListener('click', () => {
                if (window.selectedSport !== 'NFL') {
                    window.periodAverages = null;
                    window.selectedSport = 'NFL';
                    const currentWeek = getCurrentWeek('NFL');
                    window.selectedSeason = currentWeek.season;
                    window.selectedWeek = currentWeek.week;
                    // Reset team lookup state
                    window.allTeams = [];
                    window.viewMode = 'week';
                    window.selectedTeam = null;
                    window.isInitialLoad = true; // Allow fallback for sport switch
                    updateUI();
                    loadGames();
                }
            });

            document.getElementById('cfbOption').addEventListener('click', () => {
                if (window.selectedSport !== 'CFB') {
                    window.periodAverages = null;
                    window.selectedSport = 'CFB';
                    const currentWeek = getCurrentWeek('CFB');
                    window.selectedSeason = currentWeek.season;
                    window.selectedWeek = 'playoffs'; // Default to playoffs during CFP season
                    // Reset team lookup state
                    window.allTeams = [];
                    window.viewMode = 'week';
                    window.selectedTeam = null;
                    window.isInitialLoad = true; // Allow fallback for sport switch
                    updateUI();
                    loadGames();
                }
            });

            document.getElementById('nbaOption').addEventListener('click', () => {
                if (window.selectedSport !== 'NBA') {
                    window.periodAverages = null;
                    window.selectedSport = 'NBA';
                    window.selectedSeason = getCurrentWeek('NBA').season;
                    // Use navigation module for clean date handling
                    window.selectedDate = getDefaultNBADate();

                    // Reset date picker state
                    window.pickerMonth = null;
                    window.pickerYear = null;
                    // Reset team lookup state
                    window.allTeams = [];
                    window.viewMode = 'week';
                    window.selectedTeam = null;
                    window.isInitialLoad = true; // Allow fallback for sport switch
                    updateUI();
                    loadGames();
                }
            });

            // Custom date picker toggle (NBA)
            document.getElementById('currentDateDisplay').addEventListener('click', (e) => {
                if (window.selectedSport === 'NBA') {
                    e.stopPropagation();
                    const picker = document.getElementById('customDatePicker');
                    const isVisible = picker.classList.contains('visible');

                    if (!isVisible) {
                        populateCustomDatePicker();
                        picker.classList.add('visible');
                    } else {
                        picker.classList.remove('visible');
                    }
                }
            });

            // Close custom date picker when clicking outside
            document.addEventListener('click', (e) => {
                const picker = document.getElementById('customDatePicker');
                const currentDateDisplay = document.getElementById('currentDateDisplay');

                if (window.selectedSport === 'NBA' && !picker.contains(e.target) && e.target !== currentDateDisplay) {
                    picker.classList.remove('visible');
                }
            });

            // About link
            document.getElementById('aboutLink').addEventListener('click', (e) => {
                e.preventDefault();
                const mainContent = document.getElementById('mainContent');
                const aboutContent = document.getElementById('aboutContent');

                if (aboutContent.classList.contains('hidden')) {
                    mainContent.classList.add('hidden');
                    aboutContent.classList.remove('hidden');
                    e.target.textContent = 'home';
                } else {
                    aboutContent.classList.add('hidden');
                    mainContent.classList.remove('hidden');
                    e.target.textContent = 'about';
                }
            });

            // Theme toggle
            document.getElementById('themeToggle').addEventListener('click', (e) => {
                e.preventDefault();
                toggleTheme();
            });

            // Week picker toggle
            document.getElementById('currentWeekDisplay').addEventListener('click', (e) => {
                e.stopPropagation();
                const picker = document.getElementById('weekPicker');
                const isVisible = picker.classList.contains('visible');

                if (!isVisible) {
                    populateWeekPicker();
                    picker.classList.add('visible');
                } else {
                    picker.classList.remove('visible');
                }
            });

            // Close week picker when clicking outside
            document.addEventListener('click', (e) => {
                const picker = document.getElementById('weekPicker');
                const currentWeekDisplay = document.getElementById('currentWeekDisplay');

                if (!picker.contains(e.target) && e.target !== currentWeekDisplay) {
                    picker.classList.remove('visible');
                }
            });

            // Team lookup - Find a game link
            document.getElementById('findGameLink').addEventListener('click', (e) => {
                e.stopPropagation();
                const picker = document.getElementById('teamPicker');
                const isVisible = picker.classList.contains('visible');

                if (!isVisible) {
                    loadTeams();
                    picker.classList.add('visible');
                    document.getElementById('teamSearchInput').focus();
                } else {
                    picker.classList.remove('visible');
                }
            });

            // Team search input
            document.getElementById('teamSearchInput').addEventListener('input', (e) => {
                filterTeams(e.target.value);
            });

            // Close team picker when clicking outside
            document.addEventListener('click', (e) => {
                const picker = document.getElementById('teamPicker');
                const findGameLink = document.getElementById('findGameLink');

                if (!picker.contains(e.target) && e.target !== findGameLink) {
                    picker.classList.remove('visible');
                }
            });
        }

        // Populate custom date picker
        function populateCustomDatePicker() {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const currentDate = window.selectedDate ? new Date(window.selectedDate) : new Date(today.getTime() - 24*60*60*1000);

            // Initialize picker to current selected date's month
            if (!window.pickerMonth && !window.pickerYear) {
                window.pickerMonth = currentDate.getMonth();
                window.pickerYear = currentDate.getFullYear();
            }

            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

            // Update month/year display
            document.getElementById('window.pickerMonthYear').textContent = `${monthNames[window.pickerMonth]} ${window.pickerYear}`;

            // Setup month navigation
            const prevMonthBtn = document.getElementById('prevMonth');
            const nextMonthBtn = document.getElementById('nextMonth');

            prevMonthBtn.onclick = (e) => {
                e.stopPropagation();
                window.pickerMonth--;
                if (window.pickerMonth < 0) {
                    window.pickerMonth = 11;
                    window.pickerYear--;
                }
                populateCustomDatePicker();
            };

            nextMonthBtn.onclick = (e) => {
                e.stopPropagation();
                window.pickerMonth++;
                if (window.pickerMonth > 11) {
                    window.pickerMonth = 0;
                    window.pickerYear++;
                }
                populateCustomDatePicker();
            };

            // Build calendar grid
            const firstDay = new Date(window.pickerYear, window.pickerMonth, 1);
            const lastDay = new Date(window.pickerYear, window.pickerMonth + 1, 0);
            const prevMonthLastDay = new Date(window.pickerYear, window.pickerMonth, 0);

            const startDayOfWeek = firstDay.getDay(); // 0 = Sunday
            const daysInMonth = lastDay.getDate();
            const daysInPrevMonth = prevMonthLastDay.getDate();

            const dateGrid = document.getElementById('dateGrid');

            // Remove all existing date cells (keep headers)
            const headers = Array.from(dateGrid.querySelectorAll('.date-grid-header'));
            dateGrid.innerHTML = '';
            headers.forEach(header => dateGrid.appendChild(header));

            // Add previous month's trailing days
            for (let i = startDayOfWeek - 1; i >= 0; i--) {
                const day = daysInPrevMonth - i;
                const cell = document.createElement('div');
                cell.className = 'date-item other-month';
                cell.textContent = day;
                dateGrid.appendChild(cell);
            }

            // Add current month's days
            for (let day = 1; day <= daysInMonth; day++) {
                const cell = document.createElement('div');
                cell.className = 'date-item';
                cell.textContent = day;

                const cellDate = new Date(window.pickerYear, window.pickerMonth, day);

                // Disable future dates
                if (cellDate > today) {
                    cell.classList.add('disabled');
                } else {
                    // Check if this is the selected date
                    const cellDateStr = cellDate.toISOString().split('T')[0];
                    const selectedDateStr = window.selectedDate || new Date(today.getTime() - 24*60*60*1000).toISOString().split('T')[0];

                    if (cellDateStr === selectedDateStr) {
                        cell.classList.add('selected');
                    }

                    cell.addEventListener('click', (e) => {
                        e.stopPropagation();
                        window.periodAverages = null;
                        window.selectedDate = cellDateStr;
                        console.log(`📅 NBA window.selectedDate changed via date picker: ${window.selectedDate}`);
                        window.isInitialLoad = false; // User manually selected date
                        document.getElementById('customDatePicker').classList.remove('visible');
                        updateUI();
                        loadGames();
                    });
                }

                dateGrid.appendChild(cell);
            }

            // Add next month's leading days to complete the grid
            // Count only date-item cells (not headers)
            const dateCells = dateGrid.querySelectorAll('.date-item').length;
            const remainingCells = (Math.ceil(dateCells / 7) * 7) - dateCells;

            for (let day = 1; day <= remainingCells; day++) {
                const cell = document.createElement('div');
                cell.className = 'date-item other-month';
                cell.textContent = day;
                dateGrid.appendChild(cell);
            }
        }

        // Populate week picker dropdown
        function populateWeekPicker() {
            const currentYear = new Date().getFullYear();
            const maxWeeks = window.selectedSport === 'NFL' ? 18 : 15;

            // Determine current season for the selected sport
            const currentSeasonInfo = getCurrentWeek(window.selectedSport);
            const currentSeasonYear = currentSeasonInfo.season;

            // Populate season buttons
            // Only show current season (historical data not available)
            const seasonButtons = document.getElementById('seasonButtons');
            seasonButtons.innerHTML = '';

            const seasonsToShow = [currentSeasonYear];

            seasonsToShow.forEach(year => {
                const btn = document.createElement('div');
                btn.className = 'season-btn';
                if (year === window.selectedSeason) {
                    btn.classList.add('active');
                }
                btn.textContent = year;
                btn.addEventListener('click', () => {
                    window.periodAverages = null;
                    window.selectedSeason = year;
                    window.selectedWeek = 1; // Reset to week 1 when changing season
                    window.isInitialLoad = false; // User manually selected season
                    updateUI();
                    loadGames();
                    document.getElementById('weekPicker').classList.remove('visible');
                });
                seasonButtons.appendChild(btn);
            });

            // Populate week grid
            const weekGrid = document.getElementById('weekGrid');
            weekGrid.innerHTML = '';

            for (let week = 1; week <= maxWeeks; week++) {
                const weekItem = document.createElement('div');
                weekItem.className = 'week-item';
                if (week === window.selectedWeek) {
                    weekItem.classList.add('selected');
                }
                weekItem.textContent = week;
                weekItem.addEventListener('click', () => {
                    window.periodAverages = null;
                    window.selectedWeek = week;
                    window.isInitialLoad = false; // User manually selected week
                    updateUI();
                    loadGames();
                    document.getElementById('weekPicker').classList.remove('visible');
                });
                weekGrid.appendChild(weekItem);
            }

            // Add "Bowls" and "Playoffs" options for CFB
            if (window.selectedSport === 'CFB') {
                const bowlsItem = document.createElement('div');
                bowlsItem.className = 'week-item';
                if (window.selectedWeek === 'bowls') {
                    bowlsItem.classList.add('selected');
                }
                bowlsItem.textContent = 'Bowls';
                bowlsItem.addEventListener('click', () => {
                    window.periodAverages = null;
                    window.selectedWeek = 'bowls';
                    window.isInitialLoad = false;
                    updateUI();
                    loadGames();
                    document.getElementById('weekPicker').classList.remove('visible');
                });
                weekGrid.appendChild(bowlsItem);

                const playoffsItem = document.createElement('div');
                playoffsItem.className = 'week-item';
                if (window.selectedWeek === 'playoffs') {
                    playoffsItem.classList.add('selected');
                }
                playoffsItem.textContent = 'Playoffs';
                playoffsItem.addEventListener('click', () => {
                    window.periodAverages = null;
                    window.selectedWeek = 'playoffs';
                    window.isInitialLoad = false;
                    updateUI();
                    loadGames();
                    document.getElementById('weekPicker').classList.remove('visible');
                });
                weekGrid.appendChild(playoffsItem);
            }
        }

        // Helper: Determine if static file should be used for this request
        function shouldUseStatic(sport, season, weekOrDate) {
            // Don't use static files for current/future weeks
            // Use 24-hour buffer to ensure games are completed
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            if (sport === 'NBA') {
                // For NBA, check if the date is at least 1 day ago
                const gameDate = new Date(weekOrDate);
                console.log(`🔍 shouldUseStatic check - gameDate: ${gameDate.toISOString()}, oneDayAgo: ${oneDayAgo.toISOString()}, result: ${gameDate <= oneDayAgo}`);
                return gameDate <= oneDayAgo;
            } else {
                // For NFL/CFB, use week end dates
                const weekEndDate = getWeekEndDate(sport, season, weekOrDate);
                return weekEndDate <= oneDayAgo;
            }
        }

        // Helper: Get the end date for a given week
        function getWeekEndDate(sport, season, week) {
            // This is a simplified version - actual week end dates vary
            // For production, you may want to use more precise dates
            const now = new Date();

            // If requesting current season and current/future week, assume not completed
            if (season >= now.getFullYear()) {
                // Return far future date to force API call for current season
                return new Date('2099-12-31');
            }

            // For past seasons, assume all weeks are completed
            return new Date(season, 11, 31); // End of season year
        }

        // Helper: Get static file path
        function getStaticPath(sport, season, weekOrDate) {
            const sportLower = sport.toLowerCase();
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

        // Helper: Fetch from static file
        async function fetchStaticData(sport, season, weekOrDate) {
            try {
                const path = getStaticPath(sport, season, weekOrDate);
                const response = await fetch(path);

                if (!response.ok) {
                    return null;
                }

                const data = await response.json();
                return data;
            } catch (error) {
                return null;
            }
        }

        // Load games
        async function loadGames(fallbackAttempt = 0) {
            const loadId = Math.random().toString(36).substr(2, 9);
            console.log(`🚀 [${loadId}] loadGames() START - window.isLoading was: ${window.isLoading}`);
            if (window.isLoading) {
                console.log(`⚠️ [${loadId}] loadGames() BLOCKED - already loading, aborting`);
                return;
            }

            // Set loading immediately to prevent race conditions
            window.isLoading = true;
            window.periodAverages = null;

            // Add small delay to ensure this sticks before any other calls
            await new Promise(resolve => setTimeout(resolve, 10));

            showLoading();
            console.log(`🚀 [${loadId}] loadGames() PROCEEDING - window.isLoading set to true`);

            const MAX_FALLBACK_ATTEMPTS = 3;

            console.log(`🔍 [${loadId}] loadGames() called - Sport: ${window.selectedSport}, Week: ${window.selectedWeek}, Date: ${window.selectedDate}, window.isInitialLoad: ${window.isInitialLoad}, fallbackAttempt: ${fallbackAttempt}`);

            try {
                // Try to load from static file first
                const weekOrDate = window.selectedSport === 'NBA' ? window.selectedDate : window.selectedWeek;
                console.log(`📂 [${loadId}] Checking static file - weekOrDate: ${weekOrDate}`);
                if (shouldUseStatic(window.selectedSport, window.selectedSeason, weekOrDate)) {
                    const staticData = await fetchStaticData(window.selectedSport, window.selectedSeason, weekOrDate);
                    console.log(`📂 [${loadId}] Static data result:`, staticData ? `success=${staticData.success}, games=${staticData.games?.length || 0}` : 'null');
                    if (staticData && staticData.success && staticData.games && staticData.games.length > 0) {
                        console.log(`✅ [${loadId}] Loaded from static file:`, getStaticPath(window.selectedSport, window.selectedSeason, weekOrDate));
                        console.log(`📊 [${loadId}] All games from static file:`, staticData.games.map(g => `${g.homeTeam} v ${g.awayTeam}`));
                        window.currentGames = staticData.games;
                        console.log(`📊 [${loadId}] window.currentGames set to:`, window.currentGames.length, 'games');
                        console.log(`🎯 [${loadId}] About to call displayResults()`);
                        displayResults();

                        // Cache successful load
                        setCache(window.selectedSport, window.selectedSeason, weekOrDate);
                        console.log(`💾 [${loadId}] Cached successful load: ${window.selectedSport} ${window.selectedSeason} ${weekOrDate}`);

                        window.isLoading = false;
                        window.isInitialLoad = false;
                        console.log(`✅ [${loadId}] loadGames() COMPLETE - static path`);
                        return;
                    }
                    console.log(`⚠️ [${loadId}] Static file not found or empty, falling back to API`);
                } else {
                    console.log(`❌ [${loadId}] shouldUseStatic returned false, using API instead`);
                }

                // Fall back to API
                let requestBody;
                if (window.selectedSport === 'NBA') {
                    requestBody = {
                        sport: window.selectedSport,
                        date: window.selectedDate
                    };
                } else {
                    requestBody = {
                        sport: window.selectedSport,
                        season: window.selectedSeason,
                        week: window.selectedWeek,
                        seasonType: '2'
                    };
                }

                console.log('🌐 Loading from API...');
                const response = await fetch('/api/games', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                const data = await response.json();
                console.log(`🌐 API response:`, data ? `success=${data.success}, games=${data.games?.length || 0}` : 'null');

                if (data.success && data.games && data.games.length > 0) {
                    console.log(`✅ Loaded ${data.games.length} games from API`);
                    window.currentGames = data.games;
                    displayResults();

                    // Cache successful API load
                    const weekOrDate = window.selectedSport === 'NBA' ? window.selectedDate : window.selectedWeek;
                    setCache(window.selectedSport, window.selectedSeason, weekOrDate);
                    console.log(`💾 Cached successful API load: ${window.selectedSport} ${window.selectedSeason} ${weekOrDate}`);

                    window.isInitialLoad = false;
                } else {
                    console.log(`❌ No games found - window.isInitialLoad: ${window.isInitialLoad}, fallbackAttempt: ${fallbackAttempt}/${MAX_FALLBACK_ATTEMPTS}`);

                    // No games found - check if we should auto-fallback
                    if (window.isInitialLoad && fallbackAttempt < MAX_FALLBACK_ATTEMPTS) {
                        let canFallback = false;

                        if (window.selectedSport === 'NBA') {
                            // For NBA, try previous date
                            console.log(`🔄 NBA fallback - current date: ${window.selectedDate}`);
                            const currentDate = window.selectedDate ? new Date(window.selectedDate) : new Date(new Date().getTime() - 24*60*60*1000);
                            const prevDate = new Date(currentDate);
                            prevDate.setDate(prevDate.getDate() - 1);

                            // Format using local date components to avoid timezone issues
                            const year = prevDate.getFullYear();
                            const month = String(prevDate.getMonth() + 1).padStart(2, '0');
                            const day = String(prevDate.getDate()).padStart(2, '0');
                            const newDate = `${year}-${month}-${day}`;
                            console.log(`📅 NBA fallback: ${window.selectedDate} → ${newDate}`);
                            window.selectedDate = newDate;
                            console.log(`📅 NBA window.selectedDate changed via fallback: ${window.selectedDate}`);
                            canFallback = true;
                        } else {
                            // For NFL/CFB, try previous week
                            console.log(`🔄 ${window.selectedSport} fallback - current week: ${window.selectedWeek}`);
                            if (window.selectedWeek === 'playoffs') {
                                console.log(`📅 Playoffs fallback: playoffs → bowls`);
                                window.selectedWeek = 'bowls';
                                canFallback = true;
                            } else if (window.selectedWeek === 'bowls') {
                                const maxWeeks = window.selectedSport === 'NFL' ? 18 : 15;
                                console.log(`📅 Bowls fallback: bowls → week ${maxWeeks}`);
                                window.selectedWeek = maxWeeks;
                                canFallback = true;
                            } else if (window.selectedWeek > 1) {
                                console.log(`📅 Week fallback: week ${window.selectedWeek} → week ${window.selectedWeek - 1}`);
                                window.selectedWeek--;
                                canFallback = true;
                            } else {
                                console.log(`⚠️ Cannot fallback - already at week 1`);
                            }
                        }

                        if (canFallback) {
                            console.log(`🔄 Retrying with fallback attempt ${fallbackAttempt + 1}`);
                            window.isLoading = false;
                            updateUI();
                            return loadGames(fallbackAttempt + 1);
                        } else {
                            console.log(`⛔ No fallback available`);
                        }
                    } else {
                        console.log(`⛔ Fallback disabled - window.isInitialLoad: ${window.isInitialLoad}, attempts: ${fallbackAttempt}/${MAX_FALLBACK_ATTEMPTS}`);
                    }

                    // No fallback or max attempts reached
                    window.isInitialLoad = false;
                    showEmpty();
                }
            } catch (error) {
                console.error('Error:', error);
                window.isInitialLoad = false;
                showEmpty('Could not load games. Please try again.');
            } finally {
                window.isLoading = false;
            }
        }

        // Show loading state
        function showLoading(customMessage = null) {
            const resultsArea = document.getElementById('resultsArea');
            let loadingMessage = customMessage;

            if (!loadingMessage) {
                if (window.selectedSport === 'NBA') {
                    const dateObj = window.selectedDate ? new Date(window.selectedDate) : new Date(new Date().getTime() - 24*60*60*1000);
                    const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    loadingMessage = `loading ${monthShort[dateObj.getMonth()]} ${dateObj.getDate()}...`;
                } else if (window.selectedWeek === 'bowls') {
                    loadingMessage = `loading bowl games...`;
                } else if (window.selectedWeek === 'playoffs') {
                    loadingMessage = `loading playoff games...`;
                } else {
                    loadingMessage = `loading week ${window.selectedWeek}...`;
                }
            }

            resultsArea.innerHTML = `
                <div class="loading">
                    <div class="loading-text">${loadingMessage}</div>
                </div>
            `;
        }

        // Show empty state
        function showEmpty(message = null) {
            if (!message) {
                if (window.selectedSport === 'NBA') {
                    const dateObj = window.selectedDate ? new Date(window.selectedDate) : new Date(new Date().getTime() - 24*60*60*1000);
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
                    message = `No games found for ${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}, ${dateObj.getFullYear()}.`;
                } else if (window.selectedWeek === 'bowls') {
                    message = `No completed bowl games yet for the ${window.selectedSeason} season.`;
                } else if (window.selectedWeek === 'playoffs') {
                    message = `No completed playoff games yet for the ${window.selectedSeason} season.`;
                } else {
                    message = `No games found for Week ${window.selectedWeek}, ${window.selectedSeason}.`;
                }
            }
            const resultsArea = document.getElementById('resultsArea');
            resultsArea.innerHTML = `
                <div class="empty-state">
                    <div class="empty-message">${message}</div>
                </div>
            `;
        }

        // Display results
        function displayResults() {
            console.log('🎯 displayResults() called with window.currentGames:', window.currentGames?.length || 'null/undefined');
            if (!window.currentGames) return;

            // Filter games based on bowls vs playoffs view
            let filteredGames = [...window.currentGames];
            if (window.selectedSport === 'CFB' && (window.selectedWeek === 'bowls' || window.selectedWeek === 'playoffs')) {
                if (window.selectedWeek === 'bowls') {
                    // Bowls view: games with bowlName AND no playoffRound, OR games with neither (default to bowls)
                    filteredGames = window.currentGames.filter(g => !g.playoffRound);
                } else if (window.selectedWeek === 'playoffs') {
                    // Playoffs view: only games with playoffRound
                    filteredGames = window.currentGames.filter(g => g.playoffRound);
                }
            }

            // Sort games by excitement score
            const sortedGames = [...filteredGames].sort((a, b) => (b.excitement || 0) - (a.excitement || 0));
            console.log('🎯 sortedGames length:', sortedGames.length);

            // Calculate statistics
            const stats = {
                mustWatch: sortedGames.filter(g => (g.excitement || 0) >= 8).length,
                recommended: sortedGames.filter(g => (g.excitement || 0) >= 6 && (g.excitement || 0) < 8).length,
                skip: sortedGames.filter(g => (g.excitement || 0) < 6).length
            };

            // Build HTML
            let html = '';

            // Statistics line
            html += `<div class="statistics-line">
                <span class="stat-number">${stats.mustWatch}</span> must watch ·
                <span class="stat-number">${stats.recommended}</span> recommended ·
                <span class="stat-number">${stats.skip}</span> skip
            </div>`;

            // Toggle slider for scores
            html += `
                <div class="spoiler-toggle-wrapper">
                    <span class="toggle-label">show scores</span>
                    <div class="toggle-switch ${!window.spoilerFree ? 'active' : ''}" id="scoreToggle">
                        <div class="toggle-slider"></div>
                    </div>
                </div>
            `;

            // Games list
            html += '<div class="games-list">';
            console.log(`🎮 About to render ${sortedGames.length} games to DOM`);
            sortedGames.forEach((game, index) => {
                console.log(`🎮 Processing game ${index}: ${game.homeTeam} v ${game.awayTeam}`);
                html += createGameRow(game, index);
            });
            html += '</div>';
            console.log(`🎮 Generated HTML for ${sortedGames.length} games, HTML length:`, html.length);

            document.getElementById('resultsArea').innerHTML = html;
            console.log(`🎮 DOM updated. resultsArea innerHTML length:`, document.getElementById('resultsArea').innerHTML.length);

            // Verify games in DOM
            const gameElements = document.querySelectorAll('.game-row');
            console.log(`🎮 DOM verification: Found ${gameElements.length} .game-row elements in DOM`);

            // Attach event listeners
            window.periodAverages = calculatePeriodAverages(window.currentGames);
            attachScoreToggleListener();
            attachRadarChartListeners();
            attachVoteListeners();
        }

        function calculatePeriodAverages(games) {
            if (!games || games.length < 2) return null;

            const metrics = window.ALGORITHM_CONFIG.metrics || [];
            const metricKeys = metrics.map(metric => metric.key);

            if (metricKeys.length === 0) return null;

            const validGames = games.filter(game =>
                game.breakdown &&
                metricKeys.every(key => typeof game.breakdown[key] === 'number')
            );

            if (validGames.length < 2) return null;

            const averages = {};
            metricKeys.forEach(key => {
                const sum = validGames.reduce((acc, game) => acc + game.breakdown[key], 0);
                averages[key] = sum / validGames.length;
            });

            return averages;
        }

        // Render radar chart for metric breakdown
        function renderRadarChart(breakdown, averages = null) {
            // Handle missing or empty breakdown data
            if (!breakdown || Object.keys(breakdown).length === 0) {
                return '<div style="color: #6b6560; font-size: 11px; padding: 8px;">Breakdown data not available for this game. Try selecting a different week to load fresh data.</div>';
            }

            const metrics = window.ALGORITHM_CONFIG.metrics || [];
            if (metrics.length === 0) {
                return '<div style="color: #6b6560; font-size: 11px; padding: 8px;">Breakdown data not available for this game. Try selecting a different week to load fresh data.</div>';
            }

            const size = 330;
            const center = size / 2;
            const radius = 80;
            const labelDistance = 130;
            const angleStep = (2 * Math.PI) / metrics.length;
            const startAngle = -Math.PI / 2; // Start at top
            const maxScale = window.ALGORITHM_CONFIG.scale.max || 10;
            const decimals = window.ALGORITHM_CONFIG.precision.decimals;

            // Calculate vertex positions for max (10) and actual values
            const points = metrics.map((metric, i) => {
                const angle = startAngle + (i * angleStep);
                const value = typeof breakdown[metric.key] === 'number' ? breakdown[metric.key] : 0;
                const r = (value / maxScale) * radius;
                return {
                    x: center + r * Math.cos(angle),
                    y: center + r * Math.sin(angle),
                    labelX: center + labelDistance * Math.cos(angle),
                    labelY: center + labelDistance * Math.sin(angle),
                    label: metric.label,
                    value: value,
                    desc: metric.description || ''
                };
            });

            // Build SVG
            const polygonPoints = points.map(p => `${p.x},${p.y}`).join(' ');
            const hasAverages = averages && typeof averages === 'object';
            const averagePoints = hasAverages ? metrics.map((metric, i) => {
                const angle = startAngle + (i * angleStep);
                const value = typeof averages[metric.key] === 'number' ? averages[metric.key] : 0;
                const r = (value / maxScale) * radius;
                return {
                    x: center + r * Math.cos(angle),
                    y: center + r * Math.sin(angle)
                };
            }) : [];
            const averagesPolygonPoints = averagePoints.map(p => `${p.x},${p.y}`).join(' ');

            // Grid lines (circles at 2, 4, 6, 8, 10)
            let gridLines = '';
            const gridLevels = 5;
            for (let step = 1; step <= gridLevels; step += 1) {
                const level = (maxScale / gridLevels) * step;
                const r = (level / maxScale) * radius;
                gridLines += `<circle cx="${center}" cy="${center}" r="${r}" class="radar-grid"/>`;
            }

            // Axis lines
            let axisLines = '';
            points.forEach((p, i) => {
                const angle = startAngle + (i * angleStep);
                const endX = center + radius * Math.cos(angle);
                const endY = center + radius * Math.sin(angle);
                axisLines += `<line x1="${center}" y1="${center}" x2="${endX}" y2="${endY}" class="radar-axis"/>`;
            });

            // Labels with hover tooltips
            let labels = '';
            points.forEach((p, i) => {
                labels += `
                    <g class="radar-label-group" data-metric="${metrics[i].key}" data-desc="${p.desc}">
                        <text x="${p.labelX}" y="${p.labelY}" class="radar-label">${p.label}</text>
                        <text x="${p.labelX}" y="${p.labelY + 14}" class="radar-value">${p.value.toFixed(decimals)}</text>
                    </g>
                `;
            });

            const legendLabel = window.selectedSport === 'NBA' ? 'Date avg' : 'Week avg';
            const legend = hasAverages ? `
                <div class="radar-legend">
                    <div class="radar-legend-item">
                        <svg width="20" height="10" aria-hidden="true">
                            <line x1="0" y1="5" x2="20" y2="5" stroke="var(--accent-must-watch)" stroke-width="2"></line>
                        </svg>
                        <span>This game</span>
                    </div>
                    <div class="radar-legend-item">
                        <svg width="20" height="10" aria-hidden="true">
                            <line x1="0" y1="5" x2="20" y2="5" stroke="rgba(160, 140, 180, 0.6)" stroke-width="1.5" stroke-dasharray="4 3"></line>
                        </svg>
                        <span>${legendLabel}</span>
                    </div>
                </div>
            ` : '';

            return `
                <div style="position: relative;">
                    <svg width="${size}" height="${size}" class="radar-chart" viewBox="0 0 ${size} ${size}">
                        ${gridLines}
                        ${axisLines}
                        ${hasAverages ? `<polygon points="${averagesPolygonPoints}" class="radar-average"/>` : ''}
                        <polygon points="${polygonPoints}" class="radar-fill"/>
                        ${labels}
                    </svg>
                    <div class="metric-tooltip" id="metric-tooltip"></div>
                    ${legend}
                </div>
            `;
        }

        // Create game row HTML
        function createGameRow(game, index) {
            console.log(`🎮 createGameRow called for game ${index}: ${game.homeTeam} v ${game.awayTeam}`);
            const score = game.excitement || 0;
            let ratingClass, ratingText;

            if (score >= 8) {
                ratingClass = 'must-watch';
                ratingText = 'must watch';
            } else if (score >= 6) {
                ratingClass = 'recommended';
                ratingText = 'recommended';
            } else {
                ratingClass = 'skip';
                ratingText = 'skip';
            }

            const shouldShowGameScore = !window.spoilerFree;

            // Format scores
            const displayScore = score % 1 === 0 ? score : score.toFixed(window.ALGORITHM_CONFIG.precision.decimals);
            const gameScoreText = `${game.awayScore || 0}-${game.homeScore || 0}${game.overtime ? ' OT' : ''}`;

            // Calculate pie chart values
            const radius = 21;
            const circumference = 2 * Math.PI * radius;
            const progress = (score / 10) * circumference;
            const remaining = circumference - progress;

            // Generate ESPN recap URL
            let sportPath;
            if (window.selectedSport === 'NFL') {
                sportPath = 'nfl';
            } else if (window.selectedSport === 'CFB') {
                sportPath = 'college-football';
            } else if (window.selectedSport === 'NBA') {
                sportPath = 'nba';
            }
            const recapUrl = `https://www.espn.com/${sportPath}/game/_/gameId/${game.id}`;

            // Build bowl/playoff info for CFB postseason
            let bowlInfo = '';
            if (window.selectedSport === 'CFB' && (game.bowlName || game.playoffRound)) {
                if (game.playoffRound) {
                    // Format playoff games based on round
                    if (game.playoffRound === 'Championship') {
                        bowlInfo = `<div class="bowl-info playoff">CFP National Championship</div>`;
                    } else if (game.playoffRound === 'First Round') {
                        bowlInfo = `<div class="bowl-info playoff">CFP First Round</div>`;
                    } else if (game.bowlName) {
                        // Quarterfinals and Semifinals: "Rose Bowl · CFP Quarterfinal"
                        bowlInfo = `<div class="bowl-info playoff">${game.bowlName} · CFP ${game.playoffRound}</div>`;
                    } else {
                        // Fallback if no bowl name
                        bowlInfo = `<div class="bowl-info playoff">CFP ${game.playoffRound}</div>`;
                    }
                } else if (game.bowlName) {
                    // Regular bowl game - just the bowl name
                    bowlInfo = `<div class="bowl-info">${game.bowlName}</div>`;
                }
            }

            return `
                <div class="game-row" data-game-index="${index}">
                    ${bowlInfo}
                    <div class="score-rating-line ${ratingClass}">
                        <span class="score-value">${displayScore}</span>
                        <span class="score-separator"> · </span>
                        <span class="rating-text">${ratingText}</span>
                    </div>
                    <div class="matchup-wrapper">
                        <div class="score-pie">
                            <svg width="48" height="48" viewBox="0 0 48 48">
                                <circle class="score-pie-bg" cx="24" cy="24" r="${radius}"/>
                                <circle class="score-pie-fill ${ratingClass}"
                                        cx="24" cy="24" r="${radius}"
                                        stroke-dasharray="${progress} ${remaining}"/>
                            </svg>
                            <div class="score-pie-value">${displayScore}</div>
                        </div>
                        <div class="matchup">
                            ${game.awayTeam} <span class="vs-separator">v</span> ${game.homeTeam}
                        </div>
                    </div>
                    <div class="rating ${ratingClass}">${ratingText}</div>
                    <div class="vote-container">
                        <button class="vote-btn upvote" data-game-id="${game.id}" data-vote="up">△</button>
                        <button class="vote-btn downvote" data-game-id="${game.id}" data-vote="down">▽</button>
                        <div class="vote-tooltip">Agree with this rating?</div>
                    </div>
                    <div class="game-score ${shouldShowGameScore ? 'visible' : ''}">${gameScoreText}</div>
                    <button class="breakdown-toggle" data-game-id="${game.id}" data-breakdown='${JSON.stringify(game.breakdown || {})}'>View breakdown</button>
                    <div class="game-breakdown" id="breakdown-${game.id}"></div>
                    <a href="${recapUrl}" target="_blank" rel="noopener noreferrer" class="game-recap-link">See ESPN recap</a>
                </div>
            `;
        }

        // Attach score toggle listener
        function attachScoreToggleListener() {
            const toggle = document.getElementById('scoreToggle');
            if (toggle) {
                toggle.addEventListener('click', () => {
                    window.spoilerFree = !window.spoilerFree;
                    localStorage.setItem('spoilerFree', window.spoilerFree);
                    displayResults();
                });
            }
        }

        // Attach radar chart click listeners
        function attachRadarChartListeners() {
            document.querySelectorAll('.breakdown-toggle').forEach(button => {
                button.addEventListener('click', (e) => {
                    console.log('Breakdown button clicked');
                    console.log('Breakdown data:', button.dataset.breakdown);

                    try {
                        const breakdown = JSON.parse(button.dataset.breakdown);
                        console.log('Parsed breakdown:', breakdown);

                        const gameId = button.dataset.gameId;
                        const container = document.getElementById(`breakdown-${gameId}`);
                        console.log('Container found:', container);

                        if (container.innerHTML) {
                            console.log('Collapsing chart');
                            container.innerHTML = '';
                            button.textContent = 'View breakdown';
                        } else {
                            console.log('Rendering chart');
                            container.innerHTML = renderRadarChart(breakdown, window.periodAverages);
                            button.textContent = 'Hide breakdown';

                            // Attach hover listeners to metric labels
                            setTimeout(() => {
                                attachMetricHoverListeners(container);
                            }, 0);
                        }
                    } catch (error) {
                        console.error('Error in radar chart click handler:', error);
                    }
                });
            });
        }

        // Attach hover listeners to radar chart metric labels
        function attachMetricHoverListeners(container) {
            const labelGroups = container.querySelectorAll('.radar-label-group');
            const tooltip = container.querySelector('.metric-tooltip');

            if (!tooltip) return;

            labelGroups.forEach(group => {
                group.addEventListener('mouseenter', (e) => {
                    const desc = group.dataset.desc;
                    tooltip.textContent = desc;
                    tooltip.style.display = 'block';
                });

                group.addEventListener('mousemove', (e) => {
                    const rect = container.getBoundingClientRect();
                    tooltip.style.left = (e.clientX - rect.left + 10) + 'px';
                    tooltip.style.top = (e.clientY - rect.top + 10) + 'px';
                });

                group.addEventListener('mouseleave', () => {
                    tooltip.style.display = 'none';
                });
            });
        }

        function updateVoteUI(gameId, voteType) {
            const upButton = document.querySelector(`.vote-btn.upvote[data-game-id="${gameId}"]`);
            const downButton = document.querySelector(`.vote-btn.downvote[data-game-id="${gameId}"]`);

            if (upButton && downButton) {
                // Update active class
                upButton.classList.toggle('active', voteType === 'up');
                downButton.classList.toggle('active', voteType === 'down');

                // Update arrow character (hollow when inactive, filled when active)
                upButton.textContent = voteType === 'up' ? '▲' : '△';
                downButton.textContent = voteType === 'down' ? '▼' : '▽';
            }
        }

        function handleVote(gameId, voteType) {
            const votes = loadVotes();
            const currentVote = votes[gameId];

            // Find the game object for Supabase payload
            const game = window.currentGames?.find(g => g.id === gameId);

            // Toggle off if clicking the same button
            if (currentVote === voteType) {
                delete votes[gameId];
                saveVotes(votes);
                updateVoteUI(gameId, null);
                // Delete from Supabase (fire and forget)
                deleteVoteFromSupabase(gameId);
            } else {
                // Switch to new vote or set initial vote
                votes[gameId] = voteType;
                saveVotes(votes);
                updateVoteUI(gameId, voteType);
                // Upsert to Supabase (fire and forget)
                upsertVoteToSupabase(gameId, voteType, game, window.selectedSport, window.selectedSeason, window.selectedWeek);
            }
        }

        function attachVoteListeners() {
            const votes = loadVotes();

            document.querySelectorAll('.vote-btn').forEach(button => {
                const gameId = button.dataset.gameId;
                const voteType = button.dataset.vote;

                // Set initial active state and arrow character
                if (votes[gameId] === voteType) {
                    button.classList.add('active');
                    button.textContent = voteType === 'up' ? '▲' : '▼';
                }

                // Add click handler
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    handleVote(gameId, voteType);
                });
            });
        }

        // Team Lookup Functions
        async function loadTeams() {
            if (window.allTeams.length > 0) {
                displayTeams(window.allTeams);
                return;
            }

            try {
                const response = await fetch(`/api/teams?sport=${window.selectedSport}`);
                const data = await response.json();

                if (data.success && data.teams) {
                    window.allTeams = data.teams;
                    displayTeams(window.allTeams);
                }
            } catch (error) {
                console.error('Error loading teams:', error);
                document.getElementById('teamList').innerHTML = '<div style="color: #6b6560; padding: 8px;">Failed to load teams</div>';
            }
        }

        function displayTeams(teams) {
            const teamList = document.getElementById('teamList');
            teamList.innerHTML = '';

            if (teams.length === 0) {
                teamList.innerHTML = '<div style="color: #6b6560; padding: 8px;">No teams found</div>';
                return;
            }

            teams.forEach(team => {
                const teamItem = document.createElement('div');
                teamItem.className = 'team-item';
                teamItem.textContent = team.displayName;
                teamItem.addEventListener('click', () => {
                    selectTeam(team);
                });
                teamList.appendChild(teamItem);
            });
        }

        function filterTeams(query) {
            if (!query) {
                displayTeams(window.allTeams);
                return;
            }

            const filtered = window.allTeams.filter(team =>
                team.displayName.toLowerCase().includes(query.toLowerCase()) ||
                team.name.toLowerCase().includes(query.toLowerCase()) ||
                team.abbreviation.toLowerCase().includes(query.toLowerCase())
            );

            displayTeams(filtered);
        }

        function selectTeam(team) {
            window.selectedTeam = team;
            document.getElementById('teamPicker').classList.remove('visible');
            document.getElementById('teamSearchInput').value = '';
            loadSchedule(team);
        }

        async function loadSchedule(team) {
            window.viewMode = 'schedule';
            window.periodAverages = null;
            window.isLoading = true;
            showLoading(`loading ${team.displayName} schedule...`);

            try {
                const response = await fetch(`/api/schedule?sport=${window.selectedSport}&teamId=${team.id}&season=${window.selectedSeason}`);
                const data = await response.json();

                if (data.success && data.games) {
                    window.currentSchedule = data.games;
                    displaySchedule(data.team, data.games);
                } else {
                    showEmpty(`No completed games found for ${team.displayName} in ${window.selectedSeason}.`);
                }
            } catch (error) {
                console.error('Error loading schedule:', error);
                showEmpty('Failed to load schedule. Please try again.');
            } finally {
                window.isLoading = false;
            }
        }

        function displaySchedule(team, games) {
            const resultsArea = document.getElementById('resultsArea');

            let html = `
                <div class="schedule-view">
                    <div class="schedule-header">
                        <span class="team-name">${team.displayName}</span>
                        <span class="separator">·</span>
                        <span class="schedule-season">${window.selectedSeason}</span>
                    </div>
                    <a href="#" class="back-link" id="backToWeek">← back to week ${window.selectedWeek}</a>

                    <div class="spoiler-toggle-wrapper">
                        <span class="toggle-label">show results</span>
                        <div class="toggle-switch ${!window.spoilerFree ? 'active' : ''}" id="scheduleScoreToggle">
                            <div class="toggle-slider"></div>
                        </div>
                    </div>

                    <div class="schedule-list">
            `;

            games.forEach(game => {
                // Handle postseason/bowl game labeling
                const weekText = game.isPostseason
                    ? (game.bowlName || 'bowl game')
                    : (game.week ? `week ${game.week}` : game.displayDate);

                const locationPrefix = game.homeAway === 'home' ? 'vs' : '@';

                // Show results based on spoiler state
                const resultText = window.spoilerFree ? 'final' : game.result;

                html += `
                    <div class="schedule-row" data-game-id="${game.id}">
                        <span class="schedule-week">${weekText}</span>
                        <span class="separator">·</span>
                        <span class="schedule-date">${game.displayDate}</span>
                        <span class="separator">·</span>
                        <span class="schedule-opponent">${locationPrefix} ${game.opponent}</span>
                        <span class="separator">·</span>
                        <span class="schedule-result">${resultText}</span>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;

            resultsArea.innerHTML = html;

            // Attach event listeners
            document.getElementById('backToWeek').addEventListener('click', (e) => {
                e.preventDefault();
                backToWeek();
            });

            // Toggle listener
            const toggle = document.getElementById('scheduleScoreToggle');
            if (toggle) {
                toggle.addEventListener('click', () => {
                    window.spoilerFree = !window.spoilerFree;
                    localStorage.setItem('spoilerFree', window.spoilerFree);
                    displaySchedule(team, games);  // Re-render with new spoiler state
                });
            }

            document.querySelectorAll('.schedule-row').forEach(row => {
                row.addEventListener('click', () => {
                    const gameId = row.dataset.gameId;
                    loadSingleGame(gameId);
                });
            });
        }

        async function loadSingleGame(gameId) {
            window.viewMode = 'single-game';
            window.periodAverages = null;
            window.selectedGameFromSchedule = gameId;
            window.isLoading = true;
            showLoading('analyzing game...');

            try {
                const response = await fetch('/api/games', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sport: window.selectedSport,
                        gameId: gameId
                    })
                });

                const data = await response.json();

                if (data.success && data.games && data.games.length > 0) {
                    displaySingleGame(data.games[0]);
                } else {
                    showEmpty('Could not analyze this game. Please try another.');
                }
            } catch (error) {
                console.error('Error loading single game:', error);
                showEmpty('Failed to load game. Please try again.');
            } finally {
                window.isLoading = false;
            }
        }

        function displaySingleGame(game) {
            window.periodAverages = null;
            const resultsArea = document.getElementById('resultsArea');

            let html = `
                <a href="#" class="back-link" id="backToSchedule">← back to ${window.selectedTeam.displayName.toLowerCase()} schedule</a>
                <div class="games-list">
                    ${createGameRow(game, 0)}
                </div>
            `;

            resultsArea.innerHTML = html;

            // Attach event listeners
            document.getElementById('backToSchedule').addEventListener('click', (e) => {
                e.preventDefault();
                backToSchedule();
            });

            attachRadarChartListeners();
        }

        function backToWeek() {
            window.viewMode = 'week';
            window.selectedTeam = null;
            window.currentSchedule = null;
            window.selectedGameFromSchedule = null;
            window.isInitialLoad = false; // User manually navigated back
            loadGames();
        }

        function backToSchedule() {
            window.viewMode = 'schedule';
            window.periodAverages = null;
            window.selectedGameFromSchedule = null;
            displaySchedule({ displayName: window.selectedTeam.displayName }, window.currentSchedule);
        }

        // ===== SEASON EXPORT FUNCTIONALITY =====

        window.exportCancelled = false;

        // Get week range presets for a sport
        function getWeekRangePresets(sport) {
            if (sport === 'NFL') {
                return [
                    { label: 'All', value: 'all', start: 1, end: 18 },
                    { label: 'First Half', value: 'first-half', start: 1, end: 9 },
                    { label: 'Second Half', value: 'second-half', start: 10, end: 18 },
                    { label: 'Custom', value: 'custom', start: null, end: null }
                ];
            } else if (sport === 'CFB') {
                return [
                    { label: 'All', value: 'all', start: 1, end: 'playoffs' },
                    { label: 'Regular Season', value: 'regular', start: 1, end: 15 },
                    { label: 'Bowls Only', value: 'bowls', start: 'bowls', end: 'bowls' },
                    { label: 'Playoffs Only', value: 'playoffs', start: 'playoffs', end: 'playoffs' },
                    { label: 'Custom', value: 'custom', start: null, end: null }
                ];
            } else if (sport === 'NBA') {
                // NBA uses date ranges
                const currentSeasonInfo = getCurrentWeek('NBA');
                const season = currentSeasonInfo.season;
                return [
                    { label: 'All', value: 'all', start: `${season}-10-01`, end: `${season + 1}-04-30` },
                    { label: 'Pre-All-Star', value: 'pre-allstar', start: `${season}-10-01`, end: `${season + 1}-02-15` },
                    { label: 'Post-All-Star', value: 'post-allstar', start: `${season + 1}-02-16`, end: `${season + 1}-04-30` },
                    { label: 'Custom', value: 'custom', start: null, end: null }
                ];
            }
            return [];
        }

        // Populate week range UI
        function populateWeekRangeUI(sport) {
            const weekRangeGroup = document.getElementById('weekRangeGroup');
            const dateRangeGroup = document.getElementById('dateRangeGroup');
            const exportPresets = document.getElementById('exportPresets');
            const exportDatePresets = document.getElementById('exportDatePresets');
            const exportStartWeek = document.getElementById('exportStartWeek');
            const exportEndWeek = document.getElementById('exportEndWeek');
            const exportStartDate = document.getElementById('exportStartDate');
            const exportEndDate = document.getElementById('exportEndDate');
            const validationMessage = document.getElementById('exportValidationMessage');

            // Clear validation message
            validationMessage.style.display = 'none';
            validationMessage.textContent = '';

            // Show/hide appropriate range UI
            if (sport === 'NBA') {
                weekRangeGroup.style.display = 'none';
                dateRangeGroup.style.display = 'block';
            } else {
                weekRangeGroup.style.display = 'block';
                dateRangeGroup.style.display = 'none';
            }

            // Get presets for the sport
            const presets = getWeekRangePresets(sport);

            // Populate preset buttons
            const presetsContainer = sport === 'NBA' ? exportDatePresets : exportPresets;
            presetsContainer.innerHTML = '';

            presets.forEach(preset => {
                const btn = document.createElement('button');
                btn.className = 'export-preset-btn';
                btn.textContent = preset.label;
                btn.dataset.value = preset.value;
                btn.dataset.start = preset.start;
                btn.dataset.end = preset.end;

                // Set "All" as default active
                if (preset.value === 'all') {
                    btn.classList.add('active');
                }

                presetsContainer.appendChild(btn);
            });

            // Populate week dropdowns for NFL/CFB
            if (sport !== 'NBA') {
                let weekOptions = [];
                if (sport === 'NFL') {
                    weekOptions = Array.from({ length: 18 }, (_, i) => ({ value: i + 1, label: `Week ${i + 1}` }));
                } else if (sport === 'CFB') {
                    weekOptions = Array.from({ length: 15 }, (_, i) => ({ value: i + 1, label: `Week ${i + 1}` }));
                    weekOptions.push({ value: 'bowls', label: 'Bowls' });
                    weekOptions.push({ value: 'playoffs', label: 'Playoffs' });
                }

                exportStartWeek.innerHTML = weekOptions.map(opt =>
                    `<option value="${opt.value}">${opt.label}</option>`
                ).join('');
                exportEndWeek.innerHTML = weekOptions.map(opt =>
                    `<option value="${opt.value}">${opt.label}</option>`
                ).join('');

                // Set default to full range
                exportStartWeek.value = weekOptions[0].value;
                exportEndWeek.value = weekOptions[weekOptions.length - 1].value;
            } else {
                // Initialize NBA date inputs with default "All" preset
                const allPreset = presets.find(p => p.value === 'all');
                if (allPreset) {
                    exportStartDate.value = allPreset.start;
                    exportEndDate.value = allPreset.end;
                }
            }
        }

        // Handle preset selection
        function handlePresetSelection(sport, preset) {
            const exportCustomRange = document.getElementById('exportCustomRange');
            const exportCustomDateRange = document.getElementById('exportCustomDateRange');
            const exportStartWeek = document.getElementById('exportStartWeek');
            const exportEndWeek = document.getElementById('exportEndWeek');
            const exportStartDate = document.getElementById('exportStartDate');
            const exportEndDate = document.getElementById('exportEndDate');
            const validationMessage = document.getElementById('exportValidationMessage');

            // Clear validation
            validationMessage.style.display = 'none';
            validationMessage.textContent = '';

            if (preset.value === 'custom') {
                // Show custom range inputs
                if (sport === 'NBA') {
                    exportCustomDateRange.style.display = 'block';
                    const currentSeasonInfo = getCurrentWeek('NBA');
                    const season = currentSeasonInfo.season;
                    exportStartDate.value = `${season}-10-01`;
                    exportEndDate.value = `${season + 1}-04-30`;
                } else {
                    exportCustomRange.style.display = 'block';
                }
            } else {
                // Hide custom range inputs
                exportCustomRange.style.display = 'none';
                exportCustomDateRange.style.display = 'none';

                // Set values from preset
                if (sport === 'NBA') {
                    exportStartDate.value = preset.start;
                    exportEndDate.value = preset.end;
                } else {
                    exportStartWeek.value = preset.start;
                    exportEndWeek.value = preset.end;
                }
            }

            // Validate the selection
            validateRangeSelection(sport);
        }

        // Validate range selection
        function validateRangeSelection(sport) {
            const validationMessage = document.getElementById('exportValidationMessage');
            const downloadBtn = document.getElementById('exportDownloadBtn');

            if (sport === 'NBA') {
                const startDate = document.getElementById('exportStartDate').value;
                const endDate = document.getElementById('exportEndDate').value;

                if (!startDate || !endDate) {
                    validationMessage.textContent = 'Please select both start and end dates.';
                    validationMessage.style.display = 'block';
                    downloadBtn.disabled = true;
                    return false;
                }

                if (new Date(startDate) > new Date(endDate)) {
                    validationMessage.textContent = 'End date must be after start date.';
                    validationMessage.style.display = 'block';
                    downloadBtn.disabled = true;
                    return false;
                }
            } else {
                const startWeek = document.getElementById('exportStartWeek').value;
                const endWeek = document.getElementById('exportEndWeek').value;

                // Handle bowls/playoffs special cases
                const weekOrder = { 'bowls': 16, 'playoffs': 17 };
                const getWeekValue = (week) => {
                    if (weekOrder[week] !== undefined) return weekOrder[week];
                    return parseInt(week);
                };

                const startValue = getWeekValue(startWeek);
                const endValue = getWeekValue(endWeek);

                if (startValue > endValue) {
                    validationMessage.textContent = 'Start week must be before or equal to end week.';
                    validationMessage.style.display = 'block';
                    downloadBtn.disabled = true;
                    return false;
                }
            }

            // Valid selection
            validationMessage.style.display = 'none';
            validationMessage.textContent = '';
            downloadBtn.disabled = false;
            return true;
        }

        // Open export modal
        function openExportModal() {
            const modal = document.getElementById('exportModal');
            const overlay = document.getElementById('exportModalOverlay');
            const sportSelect = document.getElementById('exportSportSelect');
            const seasonSelect = document.getElementById('exportSeasonSelect');
            const warningDiv = document.getElementById('exportWarning');

            // Pre-fill with current selections
            sportSelect.value = window.selectedSport;

            // Populate season options (only current season available)
            const currentSeasonInfo = getCurrentWeek(window.selectedSport);
            seasonSelect.innerHTML = `<option value="${currentSeasonInfo.season}">${currentSeasonInfo.season}</option>`;

            // Show/hide NBA warning
            if (window.selectedSport === 'NBA') {
                warningDiv.style.display = 'block';
            } else {
                warningDiv.style.display = 'none';
            }

            // Populate week range UI
            populateWeekRangeUI(window.selectedSport);

            // Show modal
            modal.classList.add('visible');
            overlay.classList.add('visible');

            // Reset export state
            window.exportCancelled = false;
            hideExportProgress();
        }

        // Close export modal
        function closeExportModal() {
            const modal = document.getElementById('exportModal');
            const overlay = document.getElementById('exportModalOverlay');

            modal.classList.remove('visible');
            overlay.classList.remove('visible');

            // Cancel any in-progress export
            window.exportCancelled = true;
        }

        // Show export progress
        function showExportProgress(current, total, message) {
            const progressDiv = document.getElementById('exportProgress');
            const progressText = document.getElementById('exportProgressText');
            const progressFill = document.getElementById('exportProgressFill');
            const downloadBtn = document.getElementById('exportDownloadBtn');

            progressDiv.classList.add('visible');
            progressText.textContent = message;

            const percentage = (current / total) * 100;
            progressFill.style.width = `${percentage}%`;

            // Disable download button during export
            downloadBtn.disabled = true;
        }

        // Hide export progress
        function hideExportProgress() {
            const progressDiv = document.getElementById('exportProgress');
            const downloadBtn = document.getElementById('exportDownloadBtn');

            progressDiv.classList.remove('visible');
            downloadBtn.disabled = false;
        }

        // Get range information for display and filename
        function getRangeInfo(sport, rangeStart, rangeEnd) {
            let isPartial = false;
            let label = '';
            let filenameSuffix = 'full-season';

            if (sport === 'NFL') {
                const defaultStart = 1;
                const defaultEnd = 18;
                isPartial = rangeStart !== defaultStart || rangeEnd !== defaultEnd;
                if (isPartial) {
                    label = `weeks ${rangeStart}-${rangeEnd}`;
                    filenameSuffix = `weeks-${rangeStart}-${rangeEnd}`;
                }
            } else if (sport === 'CFB') {
                const isPlayoffsOnly = rangeStart === 'playoffs' && rangeEnd === 'playoffs';
                const isBowlsOnly = rangeStart === 'bowls' && rangeEnd === 'bowls';
                const isFullSeason = rangeStart === 1 && rangeEnd === 'playoffs';

                if (isPlayoffsOnly) {
                    isPartial = true;
                    label = 'playoffs only';
                    filenameSuffix = 'playoffs';
                } else if (isBowlsOnly) {
                    isPartial = true;
                    label = 'bowls only';
                    filenameSuffix = 'bowls';
                } else if (!isFullSeason) {
                    isPartial = true;
                    if (rangeEnd === 'playoffs') {
                        label = `weeks ${rangeStart}-15 + bowls + playoffs`;
                        filenameSuffix = `weeks-${rangeStart}-playoffs`;
                    } else if (rangeEnd === 'bowls') {
                        label = `weeks ${rangeStart}-15 + bowls`;
                        filenameSuffix = `weeks-${rangeStart}-bowls`;
                    } else {
                        label = `weeks ${rangeStart}-${rangeEnd}`;
                        filenameSuffix = `weeks-${rangeStart}-${rangeEnd}`;
                    }
                }
            } else if (sport === 'NBA') {
                // Check if it's a partial season by comparing dates
                const currentSeasonInfo = getCurrentWeek('NBA');
                const season = currentSeasonInfo.season;
                const defaultStart = `${season}-10-01`;
                const defaultEnd = `${season + 1}-04-30`;

                if (rangeStart && rangeEnd && (rangeStart !== defaultStart || rangeEnd !== defaultEnd)) {
                    isPartial = true;
                    // Format dates for display (e.g., "Oct-Dec")
                    const startDate = new Date(rangeStart);
                    const endDate = new Date(rangeEnd);
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const startMonth = monthNames[startDate.getMonth()];
                    const endMonth = monthNames[endDate.getMonth()];
                    label = `${startMonth}-${endMonth}`;
                    filenameSuffix = `${startMonth.toLowerCase()}-${endMonth.toLowerCase()}`;
                }
            }

            return { isPartial, label, filenameSuffix };
        }

        // Fetch all weeks for a season
        async function fetchAllWeeks(sport, season, rangeStart = null, rangeEnd = null) {
            const allGames = [];
            let weeks = [];
            let useDateBasedFetch = false;

            // Determine weeks to fetch based on sport
            if (sport === 'NFL') {
                const start = rangeStart || 1;
                const end = rangeEnd || 18;
                weeks = Array.from({ length: end - start + 1 }, (_, i) => start + i);
            } else if (sport === 'CFB') {
                const start = (rangeStart === 'bowls' || rangeStart === 'playoffs') ? rangeStart : (rangeStart || 1);
                const end = (rangeEnd === 'bowls' || rangeEnd === 'playoffs') ? rangeEnd : (rangeEnd || 15);

                if (start === 'playoffs' && end === 'playoffs') {
                    // Playoffs only
                    weeks = ['playoffs'];
                } else if (start === 'bowls' && end === 'bowls') {
                    // Bowls only
                    weeks = ['bowls'];
                } else if (start === 'bowls' && end === 'playoffs') {
                    // Bowls and playoffs
                    weeks = ['bowls', 'playoffs'];
                } else if (start === 'bowls' || start === 'playoffs') {
                    // Invalid: can't start with bowls/playoffs unless end is also bowls/playoffs
                    weeks = [start];
                } else {
                    // Regular weeks
                    weeks = Array.from({ length: end - start + 1 }, (_, i) => start + i);
                    // Add bowls and/or playoffs if end is 'bowls' or 'playoffs'
                    if (rangeEnd === 'playoffs') {
                        weeks.push('bowls', 'playoffs');
                    } else if (rangeEnd === 'bowls') {
                        weeks.push('bowls');
                    }
                }
            } else if (sport === 'NBA') {
                // NBA uses date-based fetching
                useDateBasedFetch = true;
                // Use provided date range or default to Oct 1 - Today
                const startDate = rangeStart ? new Date(rangeStart) : new Date(season, 9, 1);
                const endDate = rangeEnd ? new Date(rangeEnd) : new Date();
                const daysDiff = Math.floor((endDate - startDate) / (24 * 60 * 60 * 1000));

                weeks = Array.from({ length: daysDiff + 1 }, (_, i) => {
                    const date = new Date(startDate);
                    date.setDate(date.getDate() + i);
                    return date.toISOString().split('T')[0];
                });
            }

            const totalWeeks = weeks.length;
            const rangeInfo = getRangeInfo(sport, rangeStart, rangeEnd);

            for (let i = 0; i < weeks.length; i++) {
                if (window.exportCancelled) {
                    throw new Error('Export cancelled by user');
                }

                const week = weeks[i];
                let progressMessage;

                if (useDateBasedFetch) {
                    if (rangeInfo.isPartial) {
                        progressMessage = `Fetching date ${i + 1} of ${totalWeeks} (${rangeInfo.label})...`;
                    } else {
                        progressMessage = `Fetching date ${i + 1} of ${totalWeeks}...`;
                    }
                } else if (week === 'bowls') {
                    progressMessage = `Fetching bowl games...`;
                } else if (week === 'playoffs') {
                    progressMessage = `Fetching playoff games...`;
                } else {
                    if (rangeInfo.isPartial) {
                        progressMessage = `Fetching week ${week} (${rangeInfo.label})...`;
                    } else {
                        progressMessage = `Fetching week ${week} of ${totalWeeks}...`;
                    }
                }

                showExportProgress(i + 1, totalWeeks, progressMessage);

                try {
                    // Try static file first
                    const staticData = await fetchStaticData(sport, season, week);
                    if (staticData && staticData.success && staticData.games) {
                        console.log(`✅ ${useDateBasedFetch ? 'Date' : 'Week'} ${week}: loaded from static`);
                        staticData.games.forEach(game => {
                            game.week = week;
                            allGames.push(game);
                        });
                    } else {
                        // Fall back to API
                        console.log(`⚠️ ${useDateBasedFetch ? 'Date' : 'Week'} ${week}: falling back to API`);

                        let requestBody;
                        if (useDateBasedFetch) {
                            requestBody = {
                                sport: sport,
                                date: week
                            };
                        } else {
                            requestBody = {
                                sport: sport,
                                season: season,
                                week: week,
                                seasonType: '2'
                            };
                        }

                        const response = await fetch('/api/games', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(requestBody)
                        });

                        const data = await response.json();

                        if (data.success && data.games && data.games.length > 0) {
                            // Add week/date info to each game for Excel
                            data.games.forEach(game => {
                                game.week = week;
                                allGames.push(game);
                            });
                        }
                    }
                } catch (error) {
                    console.error(`Error fetching ${useDateBasedFetch ? 'date' : 'week'} ${week}:`, error);
                    // Continue with remaining weeks even if one fails
                }

                // Add small delay to avoid hammering the API
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            return allGames;
        }

        // Export full season to Excel
        async function exportFullSeason() {
            const sportSelect = document.getElementById('exportSportSelect');
            const seasonSelect = document.getElementById('exportSeasonSelect');

            const sport = sportSelect.value;
            const season = parseInt(seasonSelect.value);

            // Get selected range
            let rangeStart, rangeEnd;
            if (sport === 'NBA') {
                rangeStart = document.getElementById('exportStartDate').value;
                rangeEnd = document.getElementById('exportEndDate').value;
            } else {
                rangeStart = document.getElementById('exportStartWeek').value;
                rangeEnd = document.getElementById('exportEndWeek').value;
                // Convert to numbers if not 'bowls' or 'playoffs'
                if (rangeStart !== 'bowls' && rangeStart !== 'playoffs') rangeStart = parseInt(rangeStart);
                if (rangeEnd !== 'bowls' && rangeEnd !== 'playoffs') rangeEnd = parseInt(rangeEnd);
            }

            // Validate range before proceeding
            if (!validateRangeSelection(sport)) {
                return;
            }

            try {
                showExportProgress(0, 100, 'Starting export...');

                // Fetch all games for the selected range
                const allGames = await fetchAllWeeks(sport, season, rangeStart, rangeEnd);

                if (allGames.length === 0) {
                    const validationMessage = document.getElementById('exportValidationMessage');
                    validationMessage.textContent = 'No completed games in selected range.';
                    validationMessage.style.display = 'block';
                    hideExportProgress();
                    return;
                }

                // Sort by excitement score descending
                allGames.sort((a, b) => (b.excitement || 0) - (a.excitement || 0));

                showExportProgress(1, 1, 'Generating Excel file...');

                // Generate Excel file
                const workbook = XLSX.utils.book_new();

                // Prepare data for Excel
                const excelData = allGames.map((game, index) => {
                    const rating = game.excitement || 0;
                    let tier;
                    if (rating >= 8) tier = 'Must Watch';
                    else if (rating >= 6) tier = 'Recommended';
                    else tier = 'Skip';

                    // Format week - handle bowls, playoffs, and dates
                    let weekDisplay;
                    if (sport === 'NBA') {
                        weekDisplay = game.week; // Date string
                    } else if (game.week === 'playoffs' || game.playoffRound) {
                        weekDisplay = 'Playoff';
                    } else if (game.week === 'bowls' || game.bowlName) {
                        weekDisplay = 'Bowl';
                    } else {
                        weekDisplay = game.week;
                    }

                    // Format date
                    let dateDisplay = '';
                    if (game.date) {
                        const gameDate = new Date(game.date);
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        dateDisplay = `${monthNames[gameDate.getMonth()]} ${gameDate.getDate()}`;
                    }

                    return {
                        'Rank': index + 1,
                        'Rating': rating.toFixed(window.ALGORITHM_CONFIG.precision.decimals),
                        'Tier': tier,
                        'Week': weekDisplay,
                        'Date': dateDisplay,
                        'Away Team': game.awayTeam,
                        'Home Team': game.homeTeam,
                        'Away Score': game.awayScore || 0,
                        'Home Score': game.homeScore || 0,
                        'OT': game.overtime ? 'Yes' : 'No',
                        'Bowl': game.bowlName || '',
                        'Playoff Round': game.playoffRound || ''
                    };
                });

                // Create worksheet from data
                const worksheet = XLSX.utils.json_to_sheet(excelData);

                // Set column widths
                worksheet['!cols'] = [
                    { wch: 6 },  // Rank
                    { wch: 8 },  // Rating
                    { wch: 14 }, // Tier
                    { wch: 10 }, // Week
                    { wch: 10 }, // Date
                    { wch: 20 }, // Away Team
                    { wch: 20 }, // Home Team
                    { wch: 12 }, // Away Score
                    { wch: 12 }, // Home Score
                    { wch: 6 },  // OT
                    { wch: 25 }, // Bowl
                    { wch: 15 }  // Playoff Round
                ];

                // Add worksheet to workbook
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Games');

                // Generate filename with range info
                const rangeInfo = getRangeInfo(sport, rangeStart, rangeEnd);
                let filename;
                if (sport === 'NBA') {
                    filename = `gei-nba-${season}-${season + 1}-${rangeInfo.filenameSuffix}.xlsx`;
                } else {
                    filename = `gei-${sport.toLowerCase()}-${season}-${rangeInfo.filenameSuffix}.xlsx`;
                }

                // Download file
                XLSX.writeFile(workbook, filename);

                // Close modal
                hideExportProgress();
                closeExportModal();

            } catch (error) {
                console.error('Export error:', error);
                hideExportProgress();

                if (error.message === 'Export cancelled by user') {
                    alert('Export cancelled.');
                } else {
                    alert('Export failed. Please try again.');
                }
            }
        }

        // Attach export modal event listeners
        function attachExportListeners() {
            // Export season link
            document.getElementById('exportSeasonLink').addEventListener('click', (e) => {
                e.preventDefault();
                openExportModal();
            });

            // Cancel button
            document.getElementById('exportCancelBtn').addEventListener('click', () => {
                closeExportModal();
            });

            // Download button
            document.getElementById('exportDownloadBtn').addEventListener('click', () => {
                exportFullSeason();
            });

            // Close modal when clicking overlay
            document.getElementById('exportModalOverlay').addEventListener('click', () => {
                closeExportModal();
            });

            // Update warning and season when sport changes
            document.getElementById('exportSportSelect').addEventListener('change', (e) => {
                const sport = e.target.value;
                const warningDiv = document.getElementById('exportWarning');
                const seasonSelect = document.getElementById('exportSeasonSelect');

                // Show/hide NBA warning
                if (sport === 'NBA') {
                    warningDiv.style.display = 'block';
                } else {
                    warningDiv.style.display = 'none';
                }

                // Update season options
                const currentSeasonInfo = getCurrentWeek(sport);
                seasonSelect.innerHTML = `<option value="${currentSeasonInfo.season}">${currentSeasonInfo.season}</option>`;

                // Repopulate week range UI
                populateWeekRangeUI(sport);
            });

            // Event delegation for preset buttons (since they're dynamically created)
            document.getElementById('exportPresets').addEventListener('click', (e) => {
                if (e.target.classList.contains('export-preset-btn')) {
                    const sport = document.getElementById('exportSportSelect').value;

                    // Remove active class from all buttons
                    document.querySelectorAll('#exportPresets .export-preset-btn').forEach(btn => {
                        btn.classList.remove('active');
                    });

                    // Add active class to clicked button
                    e.target.classList.add('active');

                    // Handle preset selection
                    const preset = {
                        value: e.target.dataset.value,
                        start: e.target.dataset.start === 'null' ? null : e.target.dataset.start,
                        end: e.target.dataset.end === 'null' ? null : e.target.dataset.end
                    };

                    // Convert to numbers if applicable
                    if (preset.start && preset.start !== 'bowls' && preset.start !== 'playoffs') {
                        preset.start = parseInt(preset.start);
                    }
                    if (preset.end && preset.end !== 'bowls' && preset.end !== 'playoffs') {
                        preset.end = parseInt(preset.end);
                    }

                    handlePresetSelection(sport, preset);
                }
            });

            // Event delegation for NBA date preset buttons
            document.getElementById('exportDatePresets').addEventListener('click', (e) => {
                if (e.target.classList.contains('export-preset-btn')) {
                    const sport = document.getElementById('exportSportSelect').value;

                    // Remove active class from all buttons
                    document.querySelectorAll('#exportDatePresets .export-preset-btn').forEach(btn => {
                        btn.classList.remove('active');
                    });

                    // Add active class to clicked button
                    e.target.classList.add('active');

                    // Handle preset selection
                    const preset = {
                        value: e.target.dataset.value,
                        start: e.target.dataset.start === 'null' ? null : e.target.dataset.start,
                        end: e.target.dataset.end === 'null' ? null : e.target.dataset.end
                    };

                    handlePresetSelection(sport, preset);
                }
            });

            // Custom range inputs validation
            document.getElementById('exportStartWeek').addEventListener('change', () => {
                const sport = document.getElementById('exportSportSelect').value;
                validateRangeSelection(sport);
            });

            document.getElementById('exportEndWeek').addEventListener('change', () => {
                const sport = document.getElementById('exportSportSelect').value;
                validateRangeSelection(sport);
            });

            document.getElementById('exportStartDate').addEventListener('change', () => {
                validateRangeSelection('NBA');
            });

            document.getElementById('exportEndDate').addEventListener('change', () => {
                validateRangeSelection('NBA');
            });
        }

        window.createGameRow = createGameRow;
        window.displayResults = displayResults;
        window.displaySchedule = displaySchedule;
        window.displaySingleGame = displaySingleGame;
        window.renderRadarChart = renderRadarChart;
        window.attachMetricHoverListeners = attachMetricHoverListeners;
        window.calculatePeriodAverages = calculatePeriodAverages;
        window.populateCustomDatePicker = populateCustomDatePicker;
        window.populateWeekPicker = populateWeekPicker;
        window.loadTeams = loadTeams;
        window.displayTeams = displayTeams;
        window.filterTeams = filterTeams;
        window.selectTeam = selectTeam;
        window.openExportModal = openExportModal;
        window.closeExportModal = closeExportModal;
        window.showExportProgress = showExportProgress;
        window.hideExportProgress = hideExportProgress;
        window.exportFullSeason = exportFullSeason;
        window.fetchGamesForExport = fetchGamesForExport;
        window.processExportData = processExportData;
        window.generateExportFilename = generateExportFilename;
        window.getRangeInfo = getRangeInfo;
        window.validateRangeSelection = validateRangeSelection;
        window.handlePresetSelection = handlePresetSelection;
        window.populateWeekRangeUI = populateWeekRangeUI;
        window.loadGames = loadGames;
        window.fetchStaticData = fetchStaticData;
        window.shouldUseStatic = shouldUseStatic;

        // Start the app
        init();
        attachExportListeners();
