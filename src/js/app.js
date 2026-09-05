import { ALGORITHM_CONFIG, getTier, NFL_PLAYOFF_ROUNDS, isNFLPlayoffRound, getNextNFLPlayoffRound, getPrevNFLPlayoffRound } from '../../shared/algorithm-config.js';
import { initSupabase, upsertVoteToSupabase, deleteVoteFromSupabase } from './services/supabase.js';
import { loadVotes, saveVotes } from './services/storage.js';
import {
    addDays,
    canNavigateToDate,
    findLatestAvailable,
    formatDate,
    getCurrentWeek,
    getDefaultNBADate,
    isDateBasedSport,
    parseDate,
    updateDateNavigation
} from './utils/dates.js';
import { loadGames } from './services/api.js';
import { openBracketView, closeBracketView } from './components/bracket.js';
import { displayResults, calculatePeriodAverages, createGameRow, renderRankings, attachRadarChartListeners } from './components/game-list.js';
import { renderRadarChart, attachMetricHoverListeners } from './components/radar-chart.js';
import { populateCustomDatePicker } from './components/date-picker.js';
import { populateWeekPicker } from './components/week-picker.js';
import { loadTeams, displayTeams, filterTeams, selectTeam, loadSchedule, displaySchedule, loadSingleGame, displaySingleGame, backToWeek, backToSchedule } from './components/team-picker.js';
import { openExportModal, closeExportModal, attachExportListeners } from './components/export-modal.js';
import { openTopGames, closeTopGames } from './components/top-games.js';

window.ALGORITHM_CONFIG = ALGORITHM_CONFIG;
window.getTier = getTier;

        // State
        const currentMLBWeek = getCurrentWeek('MLB');
        window.selectedSport = 'MLB';
        window.selectedSeason = currentMLBWeek.season;
        window.selectedWeek = null;
        window.selectedDate = getDefaultNBADate(); // For date-based navigation (NBA, MLB)

        // Range: 'latest' (smart discovery), 'current' (this week / last 7 days),
        // 'season' (top games across the season), or 'custom' after manual navigation
        window.rangeMode = 'latest';

        // Spoiler level: 'strict' hides everything, 'context' shows overtime and
        // postseason labels, 'scores' shows final scores. spoilerFree stays in sync
        // for the renderers that only need a yes/no.
        const SPOILER_MODES = ['strict', 'context', 'scores'];
        const SPOILER_HINTS = {
            strict: 'No scores. No spoilers. Just great games.',
            context: 'Overtime and postseason context, still no scores.',
            scores: 'Final scores shown. Spoilers ahead.'
        };
        function readSpoilerMode() {
            const stored = localStorage.getItem('spoilerMode');
            if (SPOILER_MODES.includes(stored)) return stored;
            // Migrate the old boolean preference
            return localStorage.getItem('spoilerFree') === 'false' ? 'scores' : 'strict';
        }
        window.spoilerMode = readSpoilerMode();
        window.spoilerFree = window.spoilerMode !== 'scores';
        window.rerenderResults = null; // set by whichever view last rendered
        window.currentGames = null;
        window.periodAverages = null;
        window.isLoading = false;
        window.isInitialLoad = true; // Track if this is the first load to enable auto-fallback

        // Theme state
        window.currentTheme = localStorage.getItem('theme') || 'light';

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
            updateSpoilerControl();
            attachEventListeners();
            initNavigation();

            await applyRangeMode('latest');
        }

        // Apply a range mode for the current sport and load the matching games
        async function applyRangeMode(mode) {
            if (window.viewMode === 'top-games' && mode !== 'season' && !(mode === 'current' && isDateBasedSport(window.selectedSport))) {
                // Leave the top games view without triggering its own reload
                window.viewMode = 'week';
                window.isLoading = false;
                delete window._topGamesPrevState;
                document.getElementById('topGamesSelector').hidden = true;
                document.getElementById('periodStepper').hidden = false;
            }

            window.rangeMode = mode;
            updateRangeControl();

            if (mode === 'season') {
                openTopGames('season');
                return;
            }

            if (mode === 'current') {
                if (isDateBasedSport(window.selectedSport)) {
                    // Last seven days for date-based sports
                    openTopGames('week');
                    return;
                }
                window.selectedWeek = getCurrentWeek(window.selectedSport).week;
                window.isInitialLoad = false;
                updateUI();
                loadGames();
                return;
            }

            // Latest: smart discovery of the most recent period with data
            window.isInitialLoad = true;
            const result = await findLatestAvailable(window.selectedSport, window.selectedSeason);
            if (isDateBasedSport(window.selectedSport)) {
                window.selectedDate = result.week; // For date-based sports, 'week' is the date string
            } else {
                window.selectedWeek = result.week;
            }
            console.log(`📍 Smart discovery: ${window.selectedSport} ${result.week} (fromCache: ${result.fromCache})`);
            updateUI();
            loadGames();
        }

        function updateRangeControl() {
            document.querySelectorAll('#rangeControl .segmented-option').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.range === window.rangeMode);
            });
        }

        // Manual navigation (stepper, pickers) leaves the preset ranges
        function markCustomRange() {
            if (window.rangeMode !== 'custom') {
                window.rangeMode = 'custom';
                updateRangeControl();
            }
        }

        function setSpoilerMode(mode) {
            if (!SPOILER_MODES.includes(mode)) return;
            window.spoilerMode = mode;
            window.spoilerFree = mode !== 'scores';
            localStorage.setItem('spoilerMode', mode);
            localStorage.setItem('spoilerFree', String(window.spoilerFree));
            updateSpoilerControl();
            if (typeof window.rerenderResults === 'function') {
                window.rerenderResults();
            }
        }

        function updateSpoilerControl() {
            document.querySelectorAll('#spoilerControl .segmented-option').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === window.spoilerMode);
            });
            document.getElementById('spoilerHint').textContent = SPOILER_HINTS[window.spoilerMode];
        }

        const SPORT_NOUNS = {
            NFL: 'football',
            CFB: 'college football',
            NBA: 'basketball',
            MLB: 'baseball',
            CBB: 'college basketball'
        };

        function updateIntro() {
            const noun = SPORT_NOUNS[window.selectedSport] || 'games';
            const sub = document.getElementById('subheadline');
            if (window.rangeMode === 'season') {
                sub.textContent = `The best ${noun} of the season, without the result.`;
            } else {
                sub.textContent = `The best recent ${noun}, without the result.`;
            }
        }

        function showView(view) {
            const isAbout = view === 'about';
            document.getElementById('mainContent').classList.toggle('hidden', isAbout);
            document.getElementById('aboutContent').classList.toggle('hidden', !isAbout);
            document.getElementById('discoverLink').classList.toggle('active', !isAbout);
            document.getElementById('aboutLink').classList.toggle('active', isAbout);
            if (isAbout) populateAlgorithmMetricsTable();
            window.scrollTo(0, 0);
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
                themeToggle.textContent = window.currentTheme === 'dark' ? 'Light' : 'Dark';
            }
        }

        // Update UI elements
        function updateUI() {
            updateIntro();

            // Update sport tabs
            ['NFL', 'CFB', 'NBA', 'MLB', 'CBB'].forEach(sport => {
                document.getElementById(`${sport.toLowerCase()}Option`).classList.toggle('active', window.selectedSport === sport);
            });

            // March Madness link only for CBB
            const bracketLink = document.getElementById('bracketLink');
            const isCBB = window.selectedSport === 'CBB';
            bracketLink.hidden = !isCBB;
            if (isCBB) {
                bracketLink.textContent = window.viewMode === 'bracket' ? 'Back to dates' : 'March Madness';
            }

            // Stepper shows the selected period unless top games is open
            const inTopGames = window.viewMode === 'top-games';
            document.getElementById('topGamesSelector').hidden = !inTopGames;
            document.getElementById('periodStepper').hidden = inTopGames;
            if (inTopGames) return;

            if (isDateBasedSport(window.selectedSport)) {
                updateDateNavigation();
            } else {
                updateWeekNavigation();
            }
        }

        // Update week-based navigation (NFL/CFB)
        function updateWeekNavigation() {
            const maxWeeks = window.selectedSport === 'NFL' ? 18 : 15;
            const week = window.selectedWeek;
            let label;
            let hasPrev = true;
            let hasNext = true;

            if (window.selectedSport === 'NFL' && isNFLPlayoffRound(week)) {
                label = NFL_PLAYOFF_ROUNDS[week].label;
                hasNext = getNextNFLPlayoffRound(week) !== null;
            } else if (week === 'playoffs') {
                label = 'College Football Playoff';
                hasNext = false;
            } else if (week === 'bowls') {
                label = 'Bowl Season';
                hasNext = window.selectedSport === 'CFB';
            } else {
                label = `Week ${week}`;
                hasPrev = week > 1;
                // Week 15/18 steps into the postseason for both sports
                hasNext = week < maxWeeks || window.selectedSport === 'CFB' || window.selectedSport === 'NFL';
            }

            document.getElementById('periodLabel').textContent = `${label} · ${window.selectedSeason}`;
            document.getElementById('prevPeriod').disabled = !hasPrev;
            document.getElementById('nextPeriod').disabled = !hasNext;
        }

        function handlePreviousDate() {
            if (!isDateBasedSport(window.selectedSport) || !window.selectedDate) return;

            const currentDate = parseDate(window.selectedDate);
            const prevDate = addDays(currentDate, -1);

            window.selectedDate = formatDate(prevDate);
            window.isInitialLoad = false;
            markCustomRange();

            updateUI();
            loadGames();
        }

        function handleNextDate() {
            if (!isDateBasedSport(window.selectedSport) || !window.selectedDate) return;

            const currentDate = parseDate(window.selectedDate);
            const nextDate = addDays(currentDate, 1);

            if (canNavigateToDate(nextDate)) {
                window.selectedDate = formatDate(nextDate);
                window.isInitialLoad = false;
                markCustomRange();

                updateUI();
                loadGames();
            }
        }

        function handlePreviousWeek() {
            if (isDateBasedSport(window.selectedSport)) {
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
            } else if (window.selectedSport === 'NFL') {
                // Handle NFL playoff round navigation
                if (isNFLPlayoffRound(window.selectedWeek)) {
                    const prevRound = getPrevNFLPlayoffRound(window.selectedWeek);
                    window.selectedWeek = prevRound; // Either previous round or 18
                } else {
                    window.selectedWeek = Math.max(1, window.selectedWeek - 1);
                }
            } else {
                window.selectedWeek = Math.max(1, window.selectedWeek - 1);
            }

            window.isInitialLoad = false;
            markCustomRange();
            updateUI();
            loadGames();
        }

        function handleNextWeek() {
            if (isDateBasedSport(window.selectedSport)) {
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
            } else if (window.selectedSport === 'NFL') {
                // Handle NFL playoff round navigation
                if (isNFLPlayoffRound(window.selectedWeek)) {
                    const nextRound = getNextNFLPlayoffRound(window.selectedWeek);
                    if (nextRound) {
                        window.selectedWeek = nextRound;
                    }
                    // If no next round (super-bowl), do nothing
                } else if (window.selectedWeek === maxWeek) {
                    // Week 18 -> Wild Card
                    window.selectedWeek = 'wild-card';
                } else if (window.selectedWeek < maxWeek) {
                    window.selectedWeek++;
                }
            } else {
                if (window.selectedWeek < maxWeek) {
                    window.selectedWeek++;
                }
            }

            window.isInitialLoad = false;
            markCustomRange();
            updateUI();
            loadGames();
        }

        function initNavigation() {
            document.getElementById('prevPeriod').addEventListener('click', (e) => {
                e.preventDefault();
                handlePreviousWeek();
            });
            document.getElementById('nextPeriod').addEventListener('click', (e) => {
                e.preventDefault();
                handleNextWeek();
            });
        }

        // Populate algorithm metrics table in about page
        function populateAlgorithmMetricsTable() {
            const tableBody = document.getElementById('algorithmMetricsTable');
            if (!tableBody) return;

            // Clear existing content
            tableBody.innerHTML = '';

            // Get metrics and weights from config
            const metrics = ALGORITHM_CONFIG.metrics;
            const weights = ALGORITHM_CONFIG.weights;

            // Populate table rows
            metrics.forEach(metric => {
                const row = document.createElement('tr');
                const weight = weights[metric.key];
                const weightPercent = Math.round(weight * 100);

                row.innerHTML = `
                    <td style="text-transform: capitalize;">${metric.label}</td>
                    <td>${weightPercent}%</td>
                    <td>${metric.description}</td>
                `;
                tableBody.appendChild(row);
            });
        }

        // Switch sport and re-apply the active range
        async function switchSport(sport) {
            if (window.selectedSport === sport) return;
            window.periodAverages = null;
            window.selectedSport = sport;
            window.selectedSeason = getCurrentWeek(sport).season;
            window.selectedDate = getDefaultNBADate();
            window.pickerMonth = null;
            window.pickerYear = null;
            // Reset team lookup state
            window.allTeams = [];
            window.viewMode = window.viewMode === 'top-games' ? 'top-games' : 'week';
            window.selectedTeam = null;
            document.getElementById('teamSearchInput').value = '';
            closeTeamPicker();

            const mode = window.rangeMode === 'custom' ? 'latest' : window.rangeMode;
            await applyRangeMode(mode);
        }

        function closeTeamPicker() {
            document.getElementById('teamPicker').classList.remove('visible');
        }

        function openTeamPicker() {
            loadTeams();
            document.getElementById('teamPicker').classList.add('visible');
        }

        // Attach event listeners
        function attachEventListeners() {
            // Sport tabs
            document.querySelectorAll('.sport-tab').forEach(tab => {
                tab.addEventListener('click', () => switchSport(tab.dataset.sport));
            });

            // Range control
            document.querySelectorAll('#rangeControl .segmented-option').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (window.rangeMode === btn.dataset.range && window.viewMode !== 'about') return;
                    applyRangeMode(btn.dataset.range);
                });
            });

            // Spoiler control
            document.querySelectorAll('#spoilerControl .segmented-option').forEach(btn => {
                btn.addEventListener('click', () => setSpoilerMode(btn.dataset.mode));
            });

            // March Madness bracket link
            document.getElementById('bracketLink').addEventListener('click', (e) => {
                e.preventDefault();
                if (window.viewMode === 'bracket') {
                    closeBracketView();
                } else {
                    openBracketView();
                }
            });

            // Period label opens the week or date picker
            document.getElementById('periodLabel').addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.viewMode === 'bracket') return;
                const isDate = isDateBasedSport(window.selectedSport);
                const picker = document.getElementById(isDate ? 'customDatePicker' : 'weekPicker');
                const other = document.getElementById(isDate ? 'weekPicker' : 'customDatePicker');
                other.classList.remove('visible');
                if (picker.classList.contains('visible')) {
                    picker.classList.remove('visible');
                    return;
                }
                if (isDate) {
                    populateCustomDatePicker();
                } else {
                    populateWeekPicker();
                }
                picker.classList.add('visible');
            });

            // Close pickers and the team list when clicking outside
            document.addEventListener('click', (e) => {
                const label = document.getElementById('periodLabel');
                ['weekPicker', 'customDatePicker'].forEach(id => {
                    const picker = document.getElementById(id);
                    if (!picker.contains(e.target) && e.target !== label) {
                        picker.classList.remove('visible');
                    }
                });
                if (!document.getElementById('teamSearch').contains(e.target)) {
                    closeTeamPicker();
                }
            });

            // Site navigation
            document.getElementById('aboutLink').addEventListener('click', (e) => {
                e.preventDefault();
                showView('about');
            });
            document.getElementById('discoverLink').addEventListener('click', (e) => {
                e.preventDefault();
                showView('discover');
            });
            document.getElementById('homeLink').addEventListener('click', (e) => {
                e.preventDefault();
                showView('discover');
            });

            // Theme toggle
            document.getElementById('themeToggle').addEventListener('click', (e) => {
                e.preventDefault();
                toggleTheme();
            });

            // Team search
            const searchInput = document.getElementById('teamSearchInput');
            searchInput.addEventListener('focus', () => openTeamPicker());
            searchInput.addEventListener('click', (e) => {
                e.stopPropagation();
                openTeamPicker();
            });
            searchInput.addEventListener('input', (e) => {
                openTeamPicker();
                filterTeams(e.target.value);
            });
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    searchInput.value = '';
                    closeTeamPicker();
                    searchInput.blur();
                }
            });
        }

        // Show loading state
        function showLoading(customMessage = null) {
            const resultsArea = document.getElementById('resultsArea');
            let loadingMessage = customMessage;

            if (!loadingMessage) {
                if (isDateBasedSport(window.selectedSport)) {
                    const dateObj = window.selectedDate ? new Date(window.selectedDate) : new Date(new Date().getTime() - 24*60*60*1000);
                    const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    loadingMessage = `loading ${monthShort[dateObj.getMonth()]} ${dateObj.getDate()}...`;
                } else if (window.selectedWeek === 'bowls') {
                    loadingMessage = `loading bowl games...`;
                } else if (window.selectedWeek === 'playoffs') {
                    loadingMessage = `loading playoff games...`;
                } else if (window.selectedSport === 'NFL' && isNFLPlayoffRound(window.selectedWeek)) {
                    const roundInfo = NFL_PLAYOFF_ROUNDS[window.selectedWeek];
                    loadingMessage = `loading ${roundInfo.label.toLowerCase()}...`;
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
                if (isDateBasedSport(window.selectedSport)) {
                    const dateObj = window.selectedDate ? new Date(window.selectedDate) : new Date(new Date().getTime() - 24*60*60*1000);
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
                    message = `No games found for ${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}, ${dateObj.getFullYear()}.`;
                } else if (window.selectedWeek === 'bowls') {
                    message = `No completed bowl games yet for the ${window.selectedSeason} season.`;
                } else if (window.selectedWeek === 'playoffs') {
                    message = `No completed playoff games yet for the ${window.selectedSeason} season.`;
                } else if (window.selectedSport === 'NFL' && isNFLPlayoffRound(window.selectedWeek)) {
                    const roundInfo = NFL_PLAYOFF_ROUNDS[window.selectedWeek];
                    message = `No completed ${roundInfo.label} games yet for the ${window.selectedSeason} season.`;
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

        function attachVoteListeners(root = document) {
            const votes = loadVotes();

            root.querySelectorAll('.vote-btn').forEach(button => {
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
        window.renderRankings = renderRankings;
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
        window.openTopGames = openTopGames;
        window.closeTopGames = closeTopGames;
        window.openBracketView = openBracketView;
        window.closeBracketView = closeBracketView;
        window.loadGames = loadGames;
        window.showLoading = showLoading;
        window.showEmpty = showEmpty;
        window.updateUI = updateUI;
        window.markCustomRange = markCustomRange;
        window.applyRangeMode = applyRangeMode;
        window.attachRadarChartListeners = attachRadarChartListeners;
        window.attachVoteListeners = attachVoteListeners;

        // Start the app
        init();
        attachExportListeners();
