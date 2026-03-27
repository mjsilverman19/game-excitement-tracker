/**
 * March Madness Bracket Component
 * Displays NCAA tournament games in a bracket visualization
 */

// Round display order and labels
const ROUNDS = [
    { key: 'First Round', short: 'R64', order: 1 },
    { key: 'Second Round', short: 'R32', order: 2 },
    { key: 'Sweet 16', short: 'S16', order: 3 },
    { key: 'Elite Eight', short: 'E8', order: 4 },
    { key: 'Final Four', short: 'F4', order: 5 },
    { key: 'Championship', short: 'Final', order: 6 }
];

// Normalize ESPN round names to our standard keys
function normalizeRound(roundStr) {
    if (!roundStr) return null;
    const lower = roundStr.toLowerCase();
    if (lower.includes('first round') || lower.includes('round of 64') || lower.includes('1st round')) return 'First Round';
    if (lower.includes('second round') || lower.includes('round of 32') || lower.includes('2nd round')) return 'Second Round';
    if (lower.includes('sweet 16') || lower.includes('sweet sixteen') || lower.includes('regional semifinal')) return 'Sweet 16';
    if (lower.includes('elite eight') || lower.includes('elite 8') || lower.includes('regional final')) return 'Elite Eight';
    if (lower.includes('final four') || lower.includes('national semifinal')) return 'Final Four';
    if (lower.includes('championship') || lower.includes('national championship') || lower.includes('title game')) return 'Championship';
    // Try to detect from "NCAA Tournament" prefix
    if (lower.includes('first four')) return null; // Skip First Four
    return null;
}

const REGIONS = ['South', 'East', 'Midwest', 'West'];

function normalizeRegion(regionStr) {
    if (!regionStr) return null;
    for (const r of REGIONS) {
        if (regionStr.toLowerCase().includes(r.toLowerCase())) return r;
    }
    return null;
}

/**
 * Open the bracket view - fetches tournament data and renders bracket
 */
export async function openBracketView() {
    window.viewMode = 'bracket';

    // Update UI state
    document.getElementById('bracketLink').classList.add('active');
    document.getElementById('dateSelector').style.display = 'none';
    document.getElementById('weekSelector').style.display = 'none';

    // Update header
    document.getElementById('headerWeekInfo').textContent = `March Madness ${window.selectedSeason + 1}`;

    window.showLoading('loading march madness bracket...');

    try {
        // Fetch bracket games via API
        const season = window.selectedSeason;
        const year = season + 1;
        const startDate = `${year}-03-01`;
        const endDate = `${year}-04-15`;

        // Fetch games day by day through the tournament window
        const allGames = [];
        const start = new Date(startDate);
        const end = new Date(endDate);

        // Try fetching from API with tournament params
        const response = await fetch('/api/games', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sport: 'CBB',
                season: season,
                tournamentMode: true
            })
        });

        const data = await response.json();
        if (data.success && data.games) {
            allGames.push(...data.games);
        }

        // If API didn't return tournament data, try fetching date by date
        if (allGames.length === 0) {
            // Fetch recent tournament dates
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0];
                try {
                    const resp = await fetch('/api/games', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sport: 'CBB', date: dateStr })
                    });
                    const dayData = await resp.json();
                    if (dayData.success && dayData.games) {
                        // Tag games with their bracket metadata
                        dayData.games.forEach(g => {
                            if (g.bracketRound || g.bracketRegion) {
                                allGames.push(g);
                            }
                        });
                    }
                } catch (e) {
                    // Skip failed dates
                }
            }
        }

        if (allGames.length === 0) {
            window.showEmpty('No March Madness games found yet. Check back once tournament games have been played.');
            return;
        }

        renderBracket(allGames);
    } catch (error) {
        console.error('Error loading bracket:', error);
        window.showEmpty('Could not load March Madness bracket. Please try again.');
    }
}

/**
 * Close the bracket view and return to normal date-based view
 */
export function closeBracketView() {
    window.viewMode = 'week';
    document.getElementById('bracketLink').classList.remove('active');
    window.updateUI();
    window.loadGames();
}

/**
 * Render the bracket visualization
 */
function renderBracket(games) {
    // Classify games by round
    const byRound = {};
    const byRegion = {};

    games.forEach(game => {
        const round = normalizeRound(game.bracketRound);
        if (!round) return;

        if (!byRound[round]) byRound[round] = [];
        byRound[round].push(game);

        const region = normalizeRegion(game.bracketRegion);
        if (region) {
            if (!byRegion[region]) byRegion[region] = {};
            if (!byRegion[region][round]) byRegion[region][round] = [];
            byRegion[region][round].push(game);
        }
    });

    // Sort games within each round by seed matchup
    Object.values(byRound).forEach(roundGames => {
        roundGames.sort((a, b) => {
            const seedA = Math.min(a.homeSeed || 99, a.awaySeed || 99);
            const seedB = Math.min(b.homeSeed || 99, b.awaySeed || 99);
            return seedA - seedB;
        });
    });

    // Build HTML
    let html = '';

    // Stats line
    const totalGames = games.filter(g => normalizeRound(g.bracketRound)).length;
    const mustWatch = games.filter(g => normalizeRound(g.bracketRound) && window.getTier(g.excitement || 0, 'CBB')?.cssClass === 'must-watch').length;
    const recommended = games.filter(g => normalizeRound(g.bracketRound) && window.getTier(g.excitement || 0, 'CBB')?.cssClass === 'recommended').length;

    html += `<div class="statistics-line">
        <span class="stat-number">${totalGames}</span> tournament games ·
        <span class="stat-number">${mustWatch}</span> must watch ·
        <span class="stat-number">${recommended}</span> recommended
    </div>`;

    // Spoiler toggle
    html += `
        <div class="spoiler-toggle-wrapper">
            <span class="toggle-label">show scores</span>
            <div class="toggle-switch ${!window.spoilerFree ? 'active' : ''}" id="scoreToggle">
                <div class="toggle-slider"></div>
            </div>
        </div>
    `;

    // Back link
    html += `<div class="bracket-back"><a href="#" class="bracket-back-link" id="bracketBackLink">← back to games</a></div>`;

    // Bracket container
    html += '<div class="bracket-container">';

    // Render round by round
    const activeRounds = ROUNDS.filter(r => byRound[r.key] && byRound[r.key].length > 0);

    if (activeRounds.length === 0) {
        html += '<div class="empty-message">No completed tournament games found.</div>';
    } else {
        activeRounds.forEach(round => {
            const roundGames = byRound[round.key] || [];
            html += `<div class="bracket-round">`;
            html += `<div class="bracket-round-header">${round.key}</div>`;
            html += `<div class="bracket-round-games">`;

            // Group by region within each round
            const regions = {};
            roundGames.forEach(game => {
                const region = normalizeRegion(game.bracketRegion) || 'Other';
                if (!regions[region]) regions[region] = [];
                regions[region].push(game);
            });

            // For Final Four and Championship, don't show region headers
            const showRegions = round.order <= 4 && Object.keys(regions).length > 1;

            if (showRegions) {
                REGIONS.forEach(regionName => {
                    const regionGames = regions[regionName];
                    if (!regionGames || regionGames.length === 0) return;

                    html += `<div class="bracket-region-label">${regionName}</div>`;
                    regionGames.forEach(game => {
                        html += renderMatchup(game);
                    });
                });
                // Handle games without a region
                if (regions['Other'] && regions['Other'].length > 0) {
                    regions['Other'].forEach(game => {
                        html += renderMatchup(game);
                    });
                }
            } else {
                roundGames.forEach(game => {
                    html += renderMatchup(game);
                });
            }

            html += `</div></div>`;
        });
    }

    html += '</div>';

    document.getElementById('resultsArea').innerHTML = html;

    // Attach event listeners
    document.getElementById('bracketBackLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        closeBracketView();
    });

    // Score toggle
    const scoreToggle = document.getElementById('scoreToggle');
    if (scoreToggle) {
        scoreToggle.addEventListener('click', () => {
            window.spoilerFree = !window.spoilerFree;
            localStorage.setItem('spoilerFree', window.spoilerFree);
            renderBracket(games); // Re-render with new spoiler state
        });
    }
}

/**
 * Render a single matchup in the bracket
 */
function renderMatchup(game) {
    const score = game.excitement || 0;
    const tier = window.getTier(score, 'CBB');
    const tierClass = tier.cssClass;
    const displayScore = score % 1 === 0 ? score : score.toFixed(1);

    const shouldShowScores = !window.spoilerFree;

    const homeSeed = game.homeSeed ? `(${game.homeSeed})` : '';
    const awaySeed = game.awaySeed ? `(${game.awaySeed})` : '';

    const homeWon = game.completed && game.homeScore > game.awayScore;
    const awayWon = game.completed && game.awayScore > game.homeScore;

    const homeScoreText = shouldShowScores ? game.homeScore : '';
    const awayScoreText = shouldShowScores ? game.awayScore : '';
    const otText = shouldShowScores && game.overtime ? ' OT' : '';

    const geiDisplay = displayScore;
    const geiClass = tierClass;

    return `
        <div class="bracket-matchup">
            <div class="bracket-team ${awayWon && shouldShowScores ? 'winner' : ''}">
                <span class="bracket-seed">${awaySeed}</span>
                <span class="bracket-name">${game.awayTeam}</span>
                <span class="bracket-team-score">${awayScoreText}</span>
            </div>
            <div class="bracket-team ${homeWon && shouldShowScores ? 'winner' : ''}">
                <span class="bracket-seed">${homeSeed}</span>
                <span class="bracket-name">${game.homeTeam}</span>
                <span class="bracket-team-score">${homeScoreText}</span>
            </div>
            <div class="bracket-gei ${geiClass}">${geiDisplay}${otText}</div>
        </div>
    `;
}
