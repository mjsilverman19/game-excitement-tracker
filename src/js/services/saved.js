/**
 * Saved games, kept in localStorage.
 * Keyed by sport and game id so the same ESPN id in two leagues cannot collide.
 */

const STORAGE_KEY = 'savedGames';

export function savedKey(sport, gameId) {
    return `${sport}:${gameId}`;
}

export function loadSavedGames() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        console.error('Error loading saved games:', e);
        return {};
    }
}

function persist(saved) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (e) {
        console.error('Error saving games:', e);
    }
}

export function isGameSaved(sport, gameId) {
    return Boolean(loadSavedGames()[savedKey(sport, gameId)]);
}

export function savedGamesCount() {
    return Object.keys(loadSavedGames()).length;
}

/**
 * Snapshot enough of the game to render it later without refetching.
 */
function snapshot(game, sport, context) {
    return {
        id: game.id,
        sport,
        season: context.season ?? null,
        week: context.week ?? null,
        date: game.date ?? context.date ?? null,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        homeLogo: game.homeLogo ?? null,
        awayLogo: game.awayLogo ?? null,
        homeAbbr: game.homeAbbr ?? null,
        awayAbbr: game.awayAbbr ?? null,
        excitement: game.excitement,
        breakdown: game.breakdown ?? null,
        overtime: Boolean(game.overtime),
        bowlName: game.bowlName ?? null,
        playoffRound: game.playoffRound ?? null,
        savedAt: Date.now()
    };
}

/**
 * Toggle a game in the saved list. Returns the new saved state.
 */
export function toggleSavedGame(game, sport, context = {}) {
    const saved = loadSavedGames();
    const key = savedKey(sport, game.id);
    if (saved[key]) {
        delete saved[key];
        persist(saved);
        return false;
    }
    saved[key] = snapshot(game, sport, context);
    persist(saved);
    return true;
}

export function removeSavedGame(sport, gameId) {
    const saved = loadSavedGames();
    delete saved[savedKey(sport, gameId)];
    persist(saved);
}

/**
 * Saved games as an array, newest first.
 */
export function listSavedGames() {
    return Object.values(loadSavedGames()).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}
