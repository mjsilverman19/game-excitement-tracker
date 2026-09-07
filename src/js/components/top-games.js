import { beginLoad } from '../services/load-state.js';
/**
 * Top Games Component
 * Shows the best games across a time range without needing to export
 */

import { fetchStaticData } from '../services/api.js';
import { getCurrentWeek, getDefaultNBADate, formatDate, addDays, parseDate, isDateBasedSport } from '../utils/dates.js';

const TOP_GAMES_COUNT = 10;

/**
 * Opening day for date-based sports (aligned with export / static generator).
 */
function getDateSeasonStart(sport, season) {
    if (sport === 'MLB') return parseDate(`${season}-03-20`);
    return parseDate(`${season}-10-01`); // NBA
}

/**
 * Get range presets for each sport
 */
export function getRangePresets(sport) {
    if (isDateBasedSport(sport)) {
        return [
            { label: 'last 7 days', value: 'last-7', count: 7 },
            { label: 'last 14 days', value: 'last-14', count: 14 },
            { label: 'last 30 days', value: 'last-30', count: 30 },
            { label: 'full season', value: 'full', count: null },
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
    if (isDateBasedSport(sport)) {
        const dates = [];
        if (preset.value === 'full') {
            const end = parseDate(getDefaultNBADate());
            let cursor = getDateSeasonStart(sport, season);
            while (cursor <= end) {
                dates.push(formatDate(cursor));
                cursor = addDays(cursor, 1);
            }
            return dates;
        }

        const startDate = parseDate(getDefaultNBADate());
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
    if (isDateBasedSport(sport)) {
        const date = parseDate(period);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[date.getMonth()]} ${date.getDate()}`;
    } else {
        return `Week ${period}`;
    }
}

/**
 * Fetch games for one period (week or date). Full-season scans stay on static
 * files so off-days don't trigger hundreds of API calls.
 */
async function fetchPeriodGames(sport, season, period, { allowApi }) {
    try {
        const staticData = await fetchStaticData(sport, season, period);
        if (staticData && staticData.success && staticData.games) {
            return staticData.games.map(game => {
                game._topGamesContext = formatContext(sport, period);
                return game;
            });
        }

        if (!allowApi) return [];

        let requestBody;
        if (isDateBasedSport(sport)) {
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
            return data.games.map(game => {
                game._topGamesContext = formatContext(sport, period);
                return game;
            });
        }
    } catch (error) {
        console.error(`Error fetching period ${period}:`, error);
    }
    return [];
}

/**
 * Fetch top games across a time range
 */
async function fetchTopGames(sport, season, preset, isCurrent) {
    const periods = getPeriodsToFetch(sport, season, preset);
    const allGames = [];
    const allowApi = !(preset.value === 'full' && isDateBasedSport(sport));
    const chunkSize = preset.value === 'full' && isDateBasedSport(sport) ? 20 : 1;

    for (let i = 0; i < periods.length; i += chunkSize) {
        if (!isCurrent()) return [];
        const chunk = periods.slice(i, i + chunkSize);
        window.showLoading(`finding top games... (${Math.min(i + chunk.length, periods.length)}/${periods.length})`);

        const results = await Promise.all(
            chunk.map(period => fetchPeriodGames(sport, season, period, { allowApi }))
        );
        if (!isCurrent()) return [];
        results.forEach(games => allGames.push(...games));

        // Small delay between short-range fetches to avoid hammering the API
        if (allowApi && i + chunkSize < periods.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    allGames.sort((a, b) => (b.excitement || 0) - (a.excitement || 0));
    return allGames.slice(0, TOP_GAMES_COUNT);
}

/**
 * Load and display top games for a specific preset
 */
async function loadTopGamesForPreset(sport, season, preset) {
    const isCurrent = beginLoad();
    window.isLoading = true;

    try {
        const topGames = await fetchTopGames(sport, season, preset, isCurrent);
        if (!isCurrent()) return;

        if (topGames.length === 0) {
            window.showEmpty('No games found for this range.');
            return;
        }

        window.currentGames = topGames;
        displayTopGamesResults(topGames, preset.label);
    } catch (error) {
        if (!isCurrent()) return;
        console.error('Error loading top games:', error);
        window.showEmpty('Could not load top games. Please try again.');
    } finally {
        if (isCurrent()) window.isLoading = false;
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

    html += window.renderRankings(games, { mode: 'top-games', tableHeading: `More from ${rangeLabel}` });

    if (typeof window.placeDiscoverControls === 'function') window.placeDiscoverControls('dock');
    resultsArea.innerHTML = html;
    if (typeof window.placeDiscoverControls === 'function') window.placeDiscoverControls('rankings');

    window.rerenderResults = () => displayTopGamesResults(games, rangeLabel);

    window.periodAverages = window.calculatePeriodAverages(games);
    window.attachRadarChartListeners();
    if (typeof window.attachShowScoresToggles === 'function') window.attachShowScoresToggles();
    window.attachVoteListeners();
    if (typeof window.hydrateHeroStadium === 'function') window.hydrateHeroStadium(games[0]);
}

/**
 * Open top games view.
 * scope 'season' loads the widest preset; 'week' loads the narrowest.
 */
export function openTopGames(scope = 'season') {
    // Save current state for "back" navigation
    if (window.viewMode !== 'top-games') {
        window._topGamesPrevState = {
            viewMode: window.viewMode,
            selectedWeek: window.selectedWeek,
            selectedDate: window.selectedDate,
        };
    }

    window.viewMode = 'top-games';
    window.isLoading = false;

    // Keep the upper-right clear — range is chosen via Latest / This week / Season
    document.getElementById('periodStepper').hidden = true;
    document.getElementById('topGamesSelector').hidden = true;
    window.updateUI();

    const presets = getRangePresets(window.selectedSport);
    const index = scope === 'week' ? 0 : presets.length - 1;
    return loadTopGamesForPreset(window.selectedSport, window.selectedSeason, presets[index]);
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

    document.getElementById('topGamesSelector').hidden = true;
    document.getElementById('periodStepper').hidden = false;

    // Restore normal UI
    window.updateUI();
    window.loadGames();
}
