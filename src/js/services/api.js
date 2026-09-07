import { setCache, isDateBasedSport, parseDate, addDays, formatDate, findPreviousDateWithGames } from '../utils/dates.js';

// Helper: Determine if we should try the static file before the API
export function shouldUseStatic(sport, season, weekOrDate) {
    if (isDateBasedSport(sport)) {
        // For date-based sports (NBA, MLB), only prior calendar days can have
        // a static file — games from "today" may still be in progress.
        // Use parseDate (local midnight) rather than `new Date('YYYY-MM-DD')`,
        // which is UTC midnight and shifts the day in US timezones.
        if (!weekOrDate || typeof weekOrDate !== 'string') return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const gameDate = parseDate(weekOrDate);
        gameDate.setHours(0, 0, 0, 0);
        return gameDate < today;
    }

    // For NFL/CFB, always try the static file first. The generator only writes
    // a week once its games are complete, so a file that exists is safe to
    // use, and a missing file falls through to the live API.
    return true;
}

// Helper: Get static file path
export function getStaticPath(sport, season, weekOrDate) {
    const sportLower = sport.toLowerCase();
    if (isDateBasedSport(sport)) {
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
export async function fetchStaticData(sport, season, weekOrDate) {
    try {
        const path = getStaticPath(sport, season, weekOrDate);
        const response = await fetch(path);

        if (!response.ok) {
            return null;
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            return null;
        }

        const data = await response.json();
        return data;
    } catch (error) {
        return null;
    }
}

// Load games
export async function loadGames(fallbackAttempt = 0) {
    const loadId = Math.random().toString(36).substr(2, 9);
    console.log(`🚀 [${loadId}] loadGames() START - window.isLoading was: ${window.isLoading}`);
    if (window.isLoading) {
        console.log(`⚠️ [${loadId}] loadGames() BLOCKED - already loading, aborting`);
        return;
    }

    // Set loading immediately to prevent race conditions
    window.isLoading = true;
    window.periodAverages = null;
    if (fallbackAttempt === 0) window.dateFallbackFrom = null;

    // Add small delay to ensure this sticks before any other calls
    await new Promise(resolve => setTimeout(resolve, 10));

    window.showLoading();
    console.log(`🚀 [${loadId}] loadGames() PROCEEDING - window.isLoading set to true`);

    const MAX_FALLBACK_ATTEMPTS = 3;
    // Each date-based fallback jumps to the nearest published slate rather than
    // one calendar day, so a handful of attempts spans any realistic off-day run.
    const MAX_DATE_FALLBACK_ATTEMPTS = 5;

    console.log(`🔍 [${loadId}] loadGames() called - Sport: ${window.selectedSport}, Week: ${window.selectedWeek}, Date: ${window.selectedDate}, window.isInitialLoad: ${window.isInitialLoad}, fallbackAttempt: ${fallbackAttempt}`);

    try {
        // Try to load from static file first
        const weekOrDate = isDateBasedSport(window.selectedSport) ? window.selectedDate : window.selectedWeek;
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
                window.dateFallbackFrom = null;
                window.displayResults();

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
        if (isDateBasedSport(window.selectedSport)) {
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
            window.dateFallbackFrom = null;
            window.displayResults();

            // Cache successful API load
            const weekOrDate = isDateBasedSport(window.selectedSport) ? window.selectedDate : window.selectedWeek;
            setCache(window.selectedSport, window.selectedSeason, weekOrDate);
            console.log(`💾 Cached successful API load: ${window.selectedSport} ${window.selectedSeason} ${weekOrDate}`);

            window.isInitialLoad = false;
        } else {
            console.log(`❌ No games found - window.isInitialLoad: ${window.isInitialLoad}, fallbackAttempt: ${fallbackAttempt}/${MAX_FALLBACK_ATTEMPTS}`);

            // No games found - check if we should auto-fallback.
            // Date-based sports always fall back: an off-day, a rainout, or a
            // slate still in progress leaves the requested date empty, and the
            // nearest earlier day with games is what the reader wants to see.
            const isDateSport = isDateBasedSport(window.selectedSport);
            const maxAttempts = isDateSport ? MAX_DATE_FALLBACK_ATTEMPTS : MAX_FALLBACK_ATTEMPTS;

            if ((isDateSport || window.isInitialLoad) && fallbackAttempt < maxAttempts) {
                let canFallback = false;

                if (isDateSport) {
                    // Jump to the nearest earlier slate with games. The helper
                    // falls through to the previous calendar day when nothing is
                    // published nearby, so the walk keeps making progress.
                    const fromDate = window.selectedDate || formatDate(addDays(new Date(), -1));
                    console.log(`🔄 ${window.selectedSport} fallback - current date: ${fromDate}`);
                    if (!window.dateFallbackFrom) window.dateFallbackFrom = fromDate;

                    const newDate = await findPreviousDateWithGames(
                        window.selectedSport,
                        window.selectedSeason,
                        fromDate
                    );

                    if (newDate) {
                        console.log(`📅 ${window.selectedSport} fallback: ${fromDate} → ${newDate}`);
                        window.selectedDate = newDate;
                        canFallback = true;
                    } else {
                        console.log(`⚠️ No earlier ${window.selectedSport} date to fall back to`);
                    }
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
                    window.updateUI();
                    return loadGames(fallbackAttempt + 1);
                } else {
                    console.log(`⛔ No fallback available`);
                }
            } else {
                console.log(`⛔ Fallback disabled - window.isInitialLoad: ${window.isInitialLoad}, attempts: ${fallbackAttempt}/${maxAttempts}`);
            }

            // No fallback or max attempts reached
            window.isInitialLoad = false;
            const requestedDate = window.dateFallbackFrom;
            window.dateFallbackFrom = null;
            if (requestedDate && isDateBasedSport(window.selectedSport)) {
                // The walk moved the date without turning up games. Put the
                // reader back on the day they asked for instead of stranding
                // them wherever the search gave up.
                window.selectedDate = requestedDate;
                window.updateUI();
            }
            window.showEmpty();
        }
    } catch (error) {
        console.error('Error:', error);
        window.isInitialLoad = false;
        window.showEmpty('Could not load games. Please try again.');
    } finally {
        window.isLoading = false;
    }
}
