// Results rendering: hero card, feature cards, and the rankings table

import { heroArt } from './sport-art.js';
import { isGameSaved, toggleSavedGame } from '../services/saved.js';
import { isDateBasedSport, parseDate } from '../utils/dates.js';

const SPORT_LABELS = {
    NFL: 'NFL',
    CFB: 'College Football',
    NBA: 'NBA',
    MLB: 'MLB',
    CBB: 'College Basketball'
};

const NFL_ROUND_SHORT = {
    'wild-card': 'Wild Card',
    'divisional': 'Divisional Round',
    'conference': 'Conference Championships',
    'super-bowl': 'Super Bowl'
};

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const BOOKMARK_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 2.5h8a.5.5 0 0 1 .5.5v10.5L8 10.5l-4.5 3V3a.5.5 0 0 1 .5-.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
const BOOKMARK_FILLED = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5h8a.5.5 0 0 1 .5.5v10.5L8 10.5l-4.5 3V3a.5.5 0 0 1 .5-.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
const ARROW_ICON = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ===== Formatting helpers =====

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function formatScore(score) {
    const decimals = window.ALGORITHM_CONFIG.precision.decimals;
    return Number(score || 0).toFixed(decimals);
}

function tierFor(game) {
    return window.getTier(game.excitement || 0, window.selectedSport);
}

function capitalize(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function initials(name) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return words.slice(0, 2).map(w => w[0]).join('').toUpperCase();
    return String(name || '?').slice(0, 3).toUpperCase();
}

function renderLogo(name, url, size, abbr = null) {
    if (url) {
        return `<img class="team-logo team-logo-${size}" src="${escapeHtml(url)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:this.className+' team-logo-fallback',textContent:this.dataset.abbr}))" data-abbr="${escapeHtml(abbr || initials(name))}">`;
    }
    return `<span class="team-logo team-logo-${size} team-logo-fallback" aria-hidden="true">${escapeHtml(abbr || initials(name))}</span>`;
}

/**
 * Date shown on a card. Real game dates arrive with the data pipeline;
 * until then fall back to the period being viewed.
 */
function formatGameDate(game) {
    if (game.date) {
        const d = new Date(game.date);
        if (!Number.isNaN(d.getTime())) {
            return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
        }
    }
    if (game._topGamesContext) {
        return game._topGamesContext;
    }
    if (isDateBasedSport(window.selectedSport) && window.selectedDate) {
        const d = parseDate(window.selectedDate);
        return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    }
    const week = window.selectedWeek;
    if (window.selectedSport === 'NFL' && NFL_ROUND_SHORT[week]) return NFL_ROUND_SHORT[week];
    if (week === 'bowls') return 'Bowl Season';
    if (week === 'playoffs') return 'College Football Playoff';
    if (week) return `Week ${week}`;
    return '';
}

/**
 * Postseason context line. Hidden in strict mode because a bowl name or
 * playoff round says something about how far a team went.
 */
function contextLabel(game) {
    if (window.spoilerMode === 'strict') return '';
    if (window.selectedSport === 'CFB' && (game.bowlName || game.playoffRound)) {
        if (game.playoffRound === 'Championship') return 'CFP National Championship';
        if (game.playoffRound === 'First Round') return 'CFP First Round';
        if (game.playoffRound && game.bowlName) return `${game.bowlName} · CFP ${game.playoffRound}`;
        if (game.playoffRound) return `CFP ${game.playoffRound}`;
        return game.bowlName;
    }
    if (window.selectedSport === 'NFL' && game.playoffRound) return game.playoffRound;
    return '';
}

function overtimeBadge(game) {
    if (window.spoilerMode === 'strict' || !game.overtime) return '';
    return '<span class="ot-badge">OT</span>';
}

function finalScoreText(game) {
    if (window.spoilerMode !== 'scores') return '';
    return `Final ${game.awayScore ?? 0}–${game.homeScore ?? 0}${game.overtime ? ' OT' : ''}`;
}

function recapUrl(game) {
    const paths = { NFL: 'nfl', CFB: 'college-football', NBA: 'nba', MLB: 'mlb', CBB: 'mens-college-basketball' };
    return `https://www.espn.com/${paths[window.selectedSport] || 'nfl'}/game/_/gameId/${game.id}`;
}

function saveButton(game, variant) {
    const saved = isGameSaved(window.selectedSport, game.id);
    return `<button type="button" class="save-btn save-btn-${variant} ${saved ? 'saved' : ''}" data-game-id="${game.id}" aria-pressed="${saved}">
        <span class="save-icon">${saved ? BOOKMARK_FILLED : BOOKMARK_ICON}</span><span class="save-label">${saved ? 'Saved' : 'Save game'}</span>
    </button>`;
}

function whyLink(game) {
    return `<button type="button" class="why-link" data-game-id="${game.id}" aria-expanded="false" aria-controls="detail-${game.id}">Why this game? ${ARROW_ICON}</button>`;
}

function detailPanel(game) {
    return `<div class="game-detail" id="detail-${game.id}" data-breakdown='${escapeHtml(JSON.stringify(game.breakdown || {}))}' hidden></div>`;
}

function dataQualityNote(game) {
    if (!game.dataQuality?.warning) return '';
    const issues = (game.dataQuality.issues || []).map(escapeHtml).join(' ');
    return `<div class="detail-note">Data note: ${issues}</div>`;
}

// ===== Cards =====

function heroEyebrow(game, index, options) {
    if (options.mode === 'top-games' && game._topGamesContext) {
        return `#${index + 1} · ${escapeHtml(game._topGamesContext)}`;
    }
    return `Top pick · ${SPORT_LABELS[window.selectedSport] || window.selectedSport}`;
}

export function renderHeroCard(game, index = 0, options = {}) {
    const tier = tierFor(game);
    const context = contextLabel(game);
    const finalText = finalScoreText(game);
    return `
        <section class="hero-card" data-game-id="${game.id}">
            ${heroArt(window.selectedSport)}
            <div class="hero-body">
                <div class="hero-eyebrow">${heroEyebrow(game, index, options)}${context ? ` · ${escapeHtml(context)}` : ''}</div>
                <div class="hero-matchup">
                    <div class="hero-team">
                        ${renderLogo(game.awayTeam, game.awayLogo, 'lg', game.awayAbbr)}
                        <span class="hero-team-name">${escapeHtml(game.awayTeam)}</span>
                    </div>
                    <div class="hero-team hero-team-home">
                        <span class="hero-vs">vs</span>
                        <span class="hero-team-name">${escapeHtml(game.homeTeam)}</span>
                        ${renderLogo(game.homeTeam, game.homeLogo, 'lg', game.homeAbbr)}
                    </div>
                </div>
                <div class="hero-date">${escapeHtml(formatGameDate(game))}${overtimeBadge(game)}${finalText ? `<span class="final-score">${escapeHtml(finalText)}</span>` : ''}</div>
                <div class="hero-score-line">
                    <span class="gei-label">GEI</span>
                    <span class="hero-score">${formatScore(game.excitement)}</span>
                    <span class="hero-divider"></span>
                    <span class="hero-tier tier-${tier.cssClass}">${capitalize(tier.label)}</span>
                </div>
                <div class="hero-actions">
                    ${saveButton(game, 'hero')}
                    ${whyLink(game)}
                </div>
            </div>
        </section>
        ${detailPanel(game)}
    `;
}

export function renderFeatureCard(game, index, options = {}) {
    const tier = tierFor(game);
    const context = contextLabel(game);
    const finalText = finalScoreText(game);
    const rank = options.mode === 'top-games' ? `<div class="feature-rank">#${index + 1}${game._topGamesContext ? ` · ${escapeHtml(game._topGamesContext)}` : ''}</div>` : '';
    return `
        <article class="feature-card" data-game-id="${game.id}">
            ${rank}
            <div class="feature-main">
                <div class="feature-matchup">
                    ${renderLogo(game.awayTeam, game.awayLogo, 'md', game.awayAbbr)}
                    <div class="feature-names">
                        <span class="feature-team-name">${escapeHtml(game.awayTeam)}</span>
                        <span class="feature-vs">vs</span>
                        <span class="feature-team-name">${escapeHtml(game.homeTeam)}</span>
                    </div>
                    ${renderLogo(game.homeTeam, game.homeLogo, 'md', game.homeAbbr)}
                </div>
                <div class="feature-side">
                    <div class="feature-date">${escapeHtml(formatGameDate(game))}${overtimeBadge(game)}</div>
                    ${context ? `<div class="feature-context">${escapeHtml(context)}</div>` : ''}
                    <div class="feature-score-line"><span class="gei-label">GEI</span><span class="feature-score">${formatScore(game.excitement)}</span></div>
                    <div class="feature-tier tier-${tier.cssClass}">${capitalize(tier.label)}</div>
                    ${finalText ? `<div class="final-score">${escapeHtml(finalText)}</div>` : ''}
                </div>
            </div>
            <div class="feature-actions">
                ${saveButton(game, 'card')}
                ${whyLink(game)}
            </div>
        </article>
        ${detailPanel(game)}
    `;
}

function renderTableRow(game, index, options = {}) {
    const tier = tierFor(game);
    const context = contextLabel(game);
    const finalText = finalScoreText(game);
    const saved = isGameSaved(window.selectedSport, game.id);
    const showScores = window.spoilerMode === 'scores';
    return `
        <tr class="rankings-row" data-game-id="${game.id}">
            <td class="col-game">
                <div class="row-matchup">
                    <span class="row-logos">${renderLogo(game.awayTeam, game.awayLogo, 'sm', game.awayAbbr)}${renderLogo(game.homeTeam, game.homeLogo, 'sm', game.homeAbbr)}</span>
                    <span class="row-names">
                        ${options.mode === 'top-games' ? `<span class="row-rank">#${index + 1}</span>` : ''}
                        <span class="row-teams">${escapeHtml(game.awayTeam)} <span class="row-vs">vs</span> ${escapeHtml(game.homeTeam)}</span>
                        ${context ? `<span class="row-context">${escapeHtml(context)}</span>` : ''}
                    </span>
                </div>
            </td>
            <td class="col-date">${escapeHtml(formatGameDate(game))}${overtimeBadge(game)}</td>
            ${showScores ? `<td class="col-final">${escapeHtml(finalText.replace('Final ', ''))}</td>` : ''}
            <td class="col-gei">${formatScore(game.excitement)}</td>
            <td class="col-rec"><span class="tier-${tier.cssClass}">${capitalize(tier.label)}</span><button type="button" class="why-link visually-hidden" data-game-id="${game.id}" aria-expanded="false" aria-controls="detail-${game.id}">Why this game?</button></td>
            <td class="col-save"><button type="button" class="save-btn save-btn-icon ${saved ? 'saved' : ''}" data-game-id="${game.id}" aria-pressed="${saved}" aria-label="${saved ? 'Remove from saved games' : 'Save game'}">${saved ? BOOKMARK_FILLED : BOOKMARK_ICON}</button></td>
        </tr>
        <tr class="rankings-detail-row" hidden>
            <td colspan="${showScores ? 6 : 5}">${detailPanel(game)}</td>
        </tr>
    `;
}

/**
 * Full rankings layout: hero, two feature cards, then the table.
 */
export function renderRankings(games, options = {}) {
    if (!games || games.length === 0) return '';
    const showScores = window.spoilerMode === 'scores';
    const [first, second, third, ...rest] = games;

    let html = '<div class="rankings">';
    html += renderHeroCard(first, 0, options);

    if (second) {
        html += '<div class="feature-grid">';
        html += renderFeatureCard(second, 1, options);
        if (third) html += renderFeatureCard(third, 2, options);
        html += '</div>';
    }

    if (rest.length > 0) {
        const heading = options.tableHeading || 'Explore the rankings';
        const link = options.mode === 'top-games'
            ? ''
            : '<button type="button" class="section-link" id="viewSeasonLink">View season ' + ARROW_ICON + '</button>';
        html += `
            <section class="rankings-section">
                <div class="section-heading">
                    <h2 class="section-title">${escapeHtml(heading)}</h2>
                    ${link}
                </div>
                <div class="rankings-table-wrap">
                    <table class="rankings-table">
                        <thead>
                            <tr>
                                <th class="col-game">Game</th>
                                <th class="col-date">Date</th>
                                ${showScores ? '<th class="col-final">Final</th>' : ''}
                                <th class="col-gei">GEI</th>
                                <th class="col-rec">Recommendation</th>
                                <th class="col-save"><span class="visually-hidden">Save</span>${BOOKMARK_ICON}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rest.map((game, i) => renderTableRow(game, i + 3, options)).join('')}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    html += '</div>';
    return html;
}

// Kept for the single game view and other callers that render one game
export function createGameRow(game, index = 0) {
    return renderHeroCard(game, index, {});
}

// ===== Display =====

export function displayResults() {
    if (!window.currentGames) return;

    // Filter games based on bowls vs playoffs view
    let filteredGames = [...window.currentGames];
    if (window.selectedSport === 'CFB' && (window.selectedWeek === 'bowls' || window.selectedWeek === 'playoffs')) {
        if (window.selectedWeek === 'bowls') {
            filteredGames = window.currentGames.filter(g => !g.playoffRound);
        } else {
            filteredGames = window.currentGames.filter(g => g.playoffRound);
        }
    }

    const sortedGames = [...filteredGames].sort((a, b) => (b.excitement || 0) - (a.excitement || 0));

    const stats = {
        mustWatch: sortedGames.filter(g => tierFor(g).cssClass === 'must-watch').length,
        recommended: sortedGames.filter(g => tierFor(g).cssClass === 'recommended').length,
        skip: sortedGames.filter(g => tierFor(g).cssClass === 'skip').length
    };

    let html = `<div class="statistics-line">
        <span class="stat-number">${sortedGames.length}</span> games ·
        <span class="stat-number">${stats.mustWatch}</span> must watch ·
        <span class="stat-number">${stats.recommended}</span> recommended ·
        <span class="stat-number">${stats.skip}</span> skip
    </div>`;

    html += renderRankings(sortedGames, { mode: 'week' });

    document.getElementById('resultsArea').innerHTML = html;

    window.periodAverages = calculatePeriodAverages(window.currentGames);
    attachRadarChartListeners();
    window.attachVoteListeners();
    window.rerenderResults = displayResults;
}

// Calculate period averages for radar chart overlay
export function calculatePeriodAverages(games) {
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

// ===== Interaction =====

function renderDetail(container, game) {
    let breakdown = {};
    try {
        breakdown = JSON.parse(container.dataset.breakdown || '{}');
    } catch (e) {
        breakdown = {};
    }
    container.innerHTML = `
        <div class="detail-inner">
            <div class="detail-chart">${window.renderRadarChart(breakdown, window.periodAverages)}</div>
            <div class="detail-side">
                <div class="detail-heading">Why it rates ${formatScore(game?.excitement)}</div>
                <p class="detail-copy">The score comes from ESPN win probability across the whole game: tension is how long the outcome stayed in doubt, drama is the size and timing of momentum swings, finish is how the ending played out.</p>
                ${dataQualityNote(game || {})}
                <div class="detail-vote">
                    <span class="detail-vote-label">Agree with this rating?</span>
                    <div class="vote-container">
                        <button type="button" class="vote-btn upvote" data-game-id="${container.id.replace('detail-', '')}" data-vote="up" aria-label="Agree">△</button>
                        <button type="button" class="vote-btn downvote" data-game-id="${container.id.replace('detail-', '')}" data-vote="down" aria-label="Disagree">▽</button>
                    </div>
                </div>
                ${game ? `<a href="${recapUrl(game)}" target="_blank" rel="noopener noreferrer" class="detail-link">See ESPN recap ${ARROW_ICON}</a>` : ''}
            </div>
        </div>
    `;
    setTimeout(() => window.attachMetricHoverListeners(container), 0);
    window.attachVoteListeners(container);
}

function findGame(gameId) {
    return (window.currentGames || []).find(g => String(g.id) === String(gameId))
        || window.currentSingleGame
        || null;
}

/**
 * Wire "Why this game?" toggles and Save buttons for everything in the
 * results area. The name is historical: the radar chart lives inside the
 * detail panel this opens.
 */
export function attachRadarChartListeners() {
    document.querySelectorAll('.why-link').forEach(button => {
        button.addEventListener('click', () => {
            const gameId = button.dataset.gameId;
            const container = document.getElementById(`detail-${gameId}`);
            if (!container) return;
            const detailRow = container.closest('.rankings-detail-row');
            const open = !container.hidden;

            if (open) {
                container.hidden = true;
                if (detailRow) detailRow.hidden = true;
                container.innerHTML = '';
            } else {
                renderDetail(container, findGame(gameId));
                container.hidden = false;
                if (detailRow) detailRow.hidden = false;
            }
            document.querySelectorAll(`.why-link[data-game-id="${gameId}"]`).forEach(b => {
                b.setAttribute('aria-expanded', String(!open));
            });
        });
    });

    // Tapping the matchup in a table row opens the same detail as "Why?"
    document.querySelectorAll('.rankings-row .col-game').forEach(cell => {
        cell.addEventListener('click', (e) => {
            if (e.target.closest('button, a')) return;
            const link = cell.closest('.rankings-row')?.querySelector('.why-link');
            if (link) link.click();
        });
    });

    document.querySelectorAll('.save-btn').forEach(button => {
        button.addEventListener('click', () => {
            const gameId = button.dataset.gameId;
            const game = findGame(gameId);
            if (!game) return;
            const saved = toggleSavedGame(game, window.selectedSport, {
                season: window.selectedSeason,
                week: isDateBasedSport(window.selectedSport) ? null : window.selectedWeek,
                date: isDateBasedSport(window.selectedSport) ? window.selectedDate : null
            });
            document.querySelectorAll(`.save-btn[data-game-id="${gameId}"]`).forEach(b => {
                b.classList.toggle('saved', saved);
                b.setAttribute('aria-pressed', String(saved));
                const icon = b.querySelector('.save-icon');
                const label = b.querySelector('.save-label');
                if (icon) icon.innerHTML = saved ? BOOKMARK_FILLED : BOOKMARK_ICON;
                else b.innerHTML = saved ? BOOKMARK_FILLED : BOOKMARK_ICON;
                if (label) label.textContent = saved ? 'Saved' : 'Save game';
                if (b.classList.contains('save-btn-icon')) {
                    b.setAttribute('aria-label', saved ? 'Remove from saved games' : 'Save game');
                }
            });
            if (typeof window.updateSavedCount === 'function') window.updateSavedCount();
        });
    });

    const seasonLink = document.getElementById('viewSeasonLink');
    if (seasonLink) {
        seasonLink.addEventListener('click', () => window.applyRangeMode('season'));
    }
}
