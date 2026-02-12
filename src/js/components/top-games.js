/**
 * Top Games Component
 * Shows the best games across a time range without needing to export
 */

import { fetchStaticData } from '../services/api.js';
import { getCurrentWeek, getDefaultNBADate, formatDate, addDays, parseDate } from '../utils/dates.js';

const TOP_GAMES_COUNT = 10;

/**
 * Get range presets for each sport
 */
export function getRangePresets(sport) {
    if (sport === 'NBA') {
        return [
            { label: 'last 7 days', value: 'last-7', count: 7 },
            { label: 'last 14 days', value: 'last-14', count: 14 },
            { label: 'last 30 days', value: 'last-30', count: 30 },
        ];
    } else {
        return [
            { label: 'last 2 weeks', value: 'last-2', count: 2 },
            { label: 'last 4 weeks', value: 'last-4', count: 4 },
            { label: 'full season', value: 'full', count: sport === 'NFL' ? 18 : 15 },
        ];
    }
}

/**
 * Get periods (weeks or dates) to fetch for a given preset
 */
function getPeriodsToFetch(sport, season, preset) {
    if (sport === 'NBA') {
        const startDate = parseDate(getDefaultNBADate());
        const dates = [];
        for (let i = 0; i < preset.count; i++) {
            dates.push(formatDate(addDays(startDate, -i)));
        }
        return dates;
    } else {
        const currentWeek = getCurrentWeek(sport);
        const maxWeek = sport === 'NFL' ? 18 : 15;
        const weeks = [];

        if (preset.value === 'full') {
            for (let i = 1; i <= maxWeek; i++) {
                weeks.push(i);
            }
        } else {
            const startWeek = typeof currentWeek.week === 'number' ? currentWeek.week : maxWeek;
            for (let i = 0; i < preset.count; i++) {
                const week = startWeek - i;
                if (week >= 1) weeks.push(week);
            }
        }
        return weeks;
    }
}

/**
 * Format context label for a game (shown in the game row)
 */
function formatContext(sport, period) {
    if (sport === 'NBA') {
        const date = parseDate(period);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[date.getMonth()]} ${date.getDate()}`;
    } else {
        return `Week ${period}`;
    }
}

/**
 * Fetch top games across a time range
 */
async function fetchTopGames(sport, season, preset) {
    const periods = getPeriodsToFetch(sport, season, preset);
    const allGames = [];

    for (let i = 0; i < periods.length; i++) {
        const period = periods[i];

        window.showLoading(`finding top games... (${i + 1}/${periods.length})`);

        try {
            const staticData = await fetchStaticData(sport, season, period);
            if (staticData && staticData.success && staticData.games) {
                staticData.games.forEach(game => {
                    game._topGamesContext = formatContext(sport, period);
                    allGames.push(game);
                });
            } else {
                // Fall back to API
                let requestBody;
                if (sport === 'NBA') {
                    requestBody = { sport, date: period };
                } else {
                    requestBody = { sport, season, week: period, seasonType: '2' };
                }

                const response = await fetch('/api/games', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });
                const data = await response.json();

                if (data.success && data.games) {
                    data.games.forEach(game => {
                        game._topGamesContext = formatContext(sport, period);
                        allGames.push(game);
                    });
                }
            }
        } catch (error) {
            console.error(`Error fetching period ${period}:`, error);
        }

        // Small delay between fetches to avoid hammering the server
        if (i < periods.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    allGames.sort((a, b) => (b.excitement || 0) - (a.excitement || 0));
    return allGames.slice(0, TOP_GAMES_COUNT);
}

/**
 * Populate range preset buttons
 */
function populateTopGamesPresets(sport) {
    const presetsContainer = document.getElementById('topGamesPresets');
    const presets = getRangePresets(sport);

    presetsContainer.innerHTML = '';
    presets.forEach((preset, index) => {
        const btn = document.createElement('button');
        btn.className = 'top-games-preset-btn';
        if (index === 0) btn.classList.add('active');
        btn.textContent = preset.label;
        btn.dataset.index = index;
        btn.addEventListener('click', () => {
            presetsContainer.querySelectorAll('.top-games-preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadTopGamesForPreset(window.selectedSport, window.selectedSeason, preset);
        });
        presetsContainer.appendChild(btn);
    });
}

/**
 * Load and display top games for a specific preset
 */
async function loadTopGamesForPreset(sport, season, preset) {
    if (window.isLoading) return;
    window.isLoading = true;

    try {
        const topGames = await fetchTopGames(sport, season, preset);

        if (topGames.length === 0) {
            window.showEmpty('No games found for this range.');
            return;
        }

        window.currentGames = topGames;
        displayTopGamesResults(topGames, preset.label);
    } catch (error) {
        console.error('Error loading top games:', error);
        window.showEmpty('Could not load top games. Please try again.');
    } finally {
        window.isLoading = false;
    }
}

/**
 * Display top games results in the results area
 */
function displayTopGamesResults(games, rangeLabel) {
    const resultsArea = document.getElementById('resultsArea');

    const stats = {
        mustWatch: games.filter(g => window.getTier(g.excitement || 0, window.selectedSport)?.cssClass === 'must-watch').length,
        recommended: games.filter(g => window.getTier(g.excitement || 0, window.selectedSport)?.cssClass === 'recommended').length,
        skip: games.filter(g => window.getTier(g.excitement || 0, window.selectedSport)?.cssClass === 'skip').length
    };

    let html = '';

    html += `<div class="statistics-line">
        top ${games.length} games · ${rangeLabel} ·
        <span class="stat-number">${stats.mustWatch}</span> must watch ·
        <span class="stat-number">${stats.recommended}</span> recommended ·
        <span class="stat-number">${stats.skip}</span> skip
    </div>`;

    html += `
        <div class="spoiler-toggle-wrapper">
            <span class="toggle-label">show scores</span>
            <div class="toggle-switch ${!window.spoilerFree ? 'active' : ''}" id="scoreToggle">
                <div class="toggle-slider"></div>
            </div>
        </div>
    `;

    html += '<div class="games-list">';
    games.forEach((game, index) => {
        html += window.createGameRow(game, index);
    });
    html += '</div>';

    resultsArea.innerHTML = html;

    // Attach spoiler toggle that re-renders top games view (not the normal displayResults)
    const toggle = document.getElementById('scoreToggle');
    if (toggle) {
        toggle.addEventListener('click', () => {
            window.spoilerFree = !window.spoilerFree;
            localStorage.setItem('spoilerFree', window.spoilerFree);
            displayTopGamesResults(games, rangeLabel);
        });
    }

    window.periodAverages = window.calculatePeriodAverages(games);
    window.attachRadarChartListeners();
    window.attachVoteListeners();
}

/**
 * Open top games view
 */
export function openTopGames() {
    // Save current state for "back" navigation
    window._topGamesPrevState = {
        viewMode: window.viewMode,
        selectedWeek: window.selectedWeek,
        selectedDate: window.selectedDate,
    };

    window.viewMode = 'top-games';

    // Hide normal navigation, show top games navigation
    document.getElementById('weekSelector').style.display = 'none';
    document.getElementById('dateSelector').style.display = 'none';
    document.getElementById('topGamesSelector').style.display = 'block';

    // Update header
    document.getElementById('headerWeekInfo').textContent = 'Top Games';

    // Highlight link
    document.getElementById('topGamesLink').classList.add('active');

    // Populate presets and auto-load first preset
    populateTopGamesPresets(window.selectedSport);
    const presets = getRangePresets(window.selectedSport);
    loadTopGamesForPreset(window.selectedSport, window.selectedSeason, presets[0]);
}

/**
 * Close top games view, return to previous state
 */
export function closeTopGames() {
    window.viewMode = 'week';
    window.isLoading = false; // Force reset in case top games was still loading

    // Restore previous state
    if (window._topGamesPrevState) {
        window.selectedWeek = window._topGamesPrevState.selectedWeek;
        window.selectedDate = window._topGamesPrevState.selectedDate;
        delete window._topGamesPrevState;
    }

    // Hide top games navigation
    document.getElementById('topGamesSelector').style.display = 'none';
    document.getElementById('topGamesLink').classList.remove('active');

    // Restore normal UI
    window.updateUI();
    window.loadGames();
}
