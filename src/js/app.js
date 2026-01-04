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
    parseDate,
    updateDateNavigation
} from './utils/dates.js';
import { loadGames } from './services/api.js';
import { displayResults, calculatePeriodAverages, createGameRow, attachScoreToggleListener, attachRadarChartListeners } from './components/game-list.js';
import { renderRadarChart, attachMetricHoverListeners } from './components/radar-chart.js';
import { populateCustomDatePicker } from './components/date-picker.js';
import { populateWeekPicker } from './components/week-picker.js';
import { loadTeams, displayTeams, filterTeams, selectTeam, loadSchedule, displaySchedule, loadSingleGame, displaySingleGame, backToWeek, backToSchedule } from './components/team-picker.js';
import { openExportModal, closeExportModal, attachExportListeners } from './components/export-modal.js';

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

        // Expose functions to window for use by imported modules
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
        window.loadSchedule = loadSchedule;
        window.loadSingleGame = loadSingleGame;
        window.backToWeek = backToWeek;
        window.backToSchedule = backToSchedule;
        window.openExportModal = openExportModal;
        window.closeExportModal = closeExportModal;
        window.loadGames = loadGames;
        window.showLoading = showLoading;
        window.showEmpty = showEmpty;
        window.updateUI = updateUI;
        window.attachRadarChartListeners = attachRadarChartListeners;
        window.attachScoreToggleListener = attachScoreToggleListener;
        window.attachVoteListeners = attachVoteListeners;

        // Start the app
        init();
        attachExportListeners();
