/**
 * Saved games view: the reader's watchlist, rendered from localStorage
 * snapshots so it works without a network call.
 */

import { listSavedGames, removeSavedGame, savedGamesCount } from '../services/saved.js';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const SPORT_LABELS = { NFL: 'NFL', CFB: 'CFB', NBA: 'NBA', MLB: 'MLB' };

const NFL_ROUND_SHORT = {
    'wild-card': 'Wild Card',
    'divisional': 'Divisional Round',
    'conference': 'Conference Championships',
    'super-bowl': 'Super Bowl'
};

const REMOVE_ICON = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function initials(name) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return words.slice(0, 2).map(w => w[0]).join('').toUpperCase();
    return String(name || '?').slice(0, 3).toUpperCase();
}

function logo(name, url, abbr) {
    const mono = escapeHtml(abbr || initials(name));
    if (url) {
        return `<img class="team-logo team-logo-sm" src="${escapeHtml(url)}" alt="" loading="lazy" data-abbr="${mono}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:this.className+' team-logo-fallback',textContent:this.dataset.abbr}))">`;
    }
    return `<span class="team-logo team-logo-sm team-logo-fallback" aria-hidden="true">${mono}</span>`;
}

function whenLabel(game) {
    if (game.date) {
        const d = new Date(game.date);
        if (!Number.isNaN(d.getTime())) {
            return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
        }
    }
    if (game.week) {
        if (NFL_ROUND_SHORT[game.week]) return `${NFL_ROUND_SHORT[game.week]} · ${game.season}`;
        if (game.week === 'bowls') return `Bowl Season · ${game.season}`;
        if (game.week === 'playoffs') return `CFP · ${game.season}`;
        return `Week ${game.week} · ${game.season}`;
    }
    return game.season ? String(game.season) : '';
}

function capitalize(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function formatScore(score) {
    return Number(score || 0).toFixed(window.ALGORITHM_CONFIG.precision.decimals);
}

export function updateSavedCount() {
    const badge = document.getElementById('savedCount');
    if (!badge) return;
    const count = savedGamesCount();
    badge.textContent = String(count);
    badge.hidden = count === 0;
}

export function renderSavedGames() {
    const area = document.getElementById('savedArea');
    if (!area) return;

    const games = listSavedGames();
    const showScores = window.spoilerMode === 'scores';
    const showContext = showScores;

    if (games.length === 0) {
        area.innerHTML = `
            <div class="empty-state">
                <div class="empty-message">Nothing saved yet. Use <strong>Save game</strong> on a card, or the bookmark in the rankings, to build a watchlist.</div>
            </div>
        `;
        updateSavedCount();
        return;
    }

    const rows = games.map(game => {
        const tier = window.getTier(game.excitement || 0, game.sport);
        const context = showContext ? [game.playoffRound, game.bowlName].filter(Boolean).join(' · ') : '';
        const ot = showContext && game.overtime ? '<span class="ot-badge">OT</span>' : '';
        const finalText = showScores ? `${game.awayScore ?? 0}–${game.homeScore ?? 0}${game.overtime ? ' OT' : ''}` : '';
        const recapPaths = { NFL: 'nfl', CFB: 'college-football', NBA: 'nba', MLB: 'mlb' };
        const recap = `https://www.espn.com/${recapPaths[game.sport] || 'nfl'}/game/_/gameId/${game.id}`;
        return `
            <tr class="rankings-row" data-sport="${escapeHtml(game.sport)}" data-game-id="${escapeHtml(game.id)}">
                <td class="col-sport"><span class="sport-pill">${escapeHtml(SPORT_LABELS[game.sport] || game.sport)}</span></td>
                <td class="col-game">
                    <div class="row-matchup">
                        <span class="row-logos">${logo(game.awayTeam, game.awayLogo, game.awayAbbr)}${logo(game.homeTeam, game.homeLogo, game.homeAbbr)}</span>
                        <span class="row-names">
                            <span class="row-teams">${escapeHtml(game.awayTeam)} <span class="row-vs">vs</span> ${escapeHtml(game.homeTeam)}</span>
                            ${context ? `<span class="row-context">${escapeHtml(context)}</span>` : ''}
                        </span>
                    </div>
                </td>
                <td class="col-date">${escapeHtml(whenLabel(game))}${ot}</td>
                ${showScores ? `<td class="col-final">${escapeHtml(finalText)}</td>` : ''}
                <td class="col-gei">${formatScore(game.excitement)}</td>
                <td class="col-rec"><span class="tier-${tier.cssClass}">${capitalize(tier.label)}</span></td>
                <td class="col-actions">
                    <a class="row-link" href="${recap}" target="_blank" rel="noopener noreferrer">Recap</a>
                    <button type="button" class="remove-btn" data-sport="${escapeHtml(game.sport)}" data-game-id="${escapeHtml(game.id)}" aria-label="Remove ${escapeHtml(game.awayTeam)} vs ${escapeHtml(game.homeTeam)} from saved games">${REMOVE_ICON}</button>
                </td>
            </tr>
        `;
    }).join('');

    area.innerHTML = `
        <div class="section-heading saved-heading">
            <div class="statistics-line"><span class="stat-number">${games.length}</span> saved ${games.length === 1 ? 'game' : 'games'}</div>
            <label class="show-scores-toggle">
                <input type="checkbox" class="show-scores-input" ${showScores ? 'checked' : ''}>
                Show scores
            </label>
        </div>
        <div class="rankings-table-wrap">
            <table class="rankings-table saved-table">
                <thead>
                    <tr>
                        <th class="col-sport">Sport</th>
                        <th class="col-game">Game</th>
                        <th class="col-date">When</th>
                        ${showScores ? '<th class="col-final">Final</th>' : ''}
                        <th class="col-gei">GEI</th>
                        <th class="col-rec">Recommendation</th>
                        <th class="col-actions"><span class="visually-hidden">Actions</span></th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;

    area.querySelectorAll('.remove-btn').forEach(button => {
        button.addEventListener('click', () => {
            removeSavedGame(button.dataset.sport, button.dataset.gameId);
            renderSavedGames();
        });
    });

    if (typeof window.attachShowScoresToggles === 'function') window.attachShowScoresToggles();
    updateSavedCount();
}
