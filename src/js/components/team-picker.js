/**
 * Team Picker Component
 * Handles team search, selection, and schedule viewing functionality
 */

// ===== TEAM LOOKUP FUNCTIONS =====

/**
 * Load all teams for the current sport
 */
export async function loadTeams() {
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

/**
 * Display teams in the dropdown list
 */
export function displayTeams(teams) {
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

/**
 * Filter teams based on search query
 */
export function filterTeams(query) {
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

/**
 * Handle team selection
 */
export function selectTeam(team) {
    window.selectedTeam = team;
    document.getElementById('teamPicker').classList.remove('visible');
    document.getElementById('teamSearchInput').value = '';
    loadSchedule(team);
}

/**
 * Load schedule for selected team
 */
export async function loadSchedule(team) {
    window.viewMode = 'schedule';
    window.periodAverages = null;
    window.isLoading = true;
    window.showLoading(`loading ${team.displayName} schedule...`);

    try {
        const response = await fetch(`/api/schedule?sport=${window.selectedSport}&teamId=${team.id}&season=${window.selectedSeason}`);
        const data = await response.json();

        if (data.success && data.games) {
            window.currentSchedule = data.games;
            displaySchedule(data.team, data.games);
        } else {
            window.showEmpty(`No completed games found for ${team.displayName} in ${window.selectedSeason}.`);
        }
    } catch (error) {
        console.error('Error loading schedule:', error);
        window.showEmpty('Failed to load schedule. Please try again.');
    } finally {
        window.isLoading = false;
    }
}

/**
 * Display team's schedule
 */
export function displaySchedule(team, games) {
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

/**
 * Load a single game by ID
 */
export async function loadSingleGame(gameId) {
    window.viewMode = 'single-game';
    window.periodAverages = null;
    window.selectedGameFromSchedule = gameId;
    window.isLoading = true;
    window.showLoading('analyzing game...');

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
            window.showEmpty('Could not analyze this game. Please try another.');
        }
    } catch (error) {
        console.error('Error loading single game:', error);
        window.showEmpty('Failed to load game. Please try again.');
    } finally {
        window.isLoading = false;
    }
}

/**
 * Display single game view
 */
export function displaySingleGame(game) {
    window.periodAverages = null;
    const resultsArea = document.getElementById('resultsArea');

    let html = `
        <a href="#" class="back-link" id="backToSchedule">← back to ${window.selectedTeam.displayName.toLowerCase()} schedule</a>
        <div class="games-list">
            ${window.createGameRow(game, 0)}
        </div>
    `;

    resultsArea.innerHTML = html;

    // Attach event listeners
    document.getElementById('backToSchedule').addEventListener('click', (e) => {
        e.preventDefault();
        backToSchedule();
    });

    window.attachRadarChartListeners();
}

/**
 * Return to week view
 */
export function backToWeek() {
    window.viewMode = 'week';
    window.selectedTeam = null;
    window.currentSchedule = null;
    window.selectedGameFromSchedule = null;
    window.isInitialLoad = false; // User manually navigated back
    window.loadGames();
}

/**
 * Return to schedule view
 */
export function backToSchedule() {
    window.viewMode = 'schedule';
    window.periodAverages = null;
    window.selectedGameFromSchedule = null;
    displaySchedule({ displayName: window.selectedTeam.displayName }, window.currentSchedule);
}
