// Game list display functions

// Display results
export function displayResults() {
    console.log('🎯 displayResults() called with window.currentGames:', window.currentGames?.length || 'null/undefined');
    if (!window.currentGames) return;

    // Filter games based on bowls vs playoffs view
    let filteredGames = [...window.currentGames];
    if (window.selectedSport === 'CFB' && (window.selectedWeek === 'bowls' || window.selectedWeek === 'playoffs')) {
        if (window.selectedWeek === 'bowls') {
            // Bowls view: games with bowlName AND no playoffRound, OR games with neither (default to bowls)
            filteredGames = window.currentGames.filter(g => !g.playoffRound);
        } else if (window.selectedWeek === 'playoffs') {
            // Playoffs view: only games with playoffRound
            filteredGames = window.currentGames.filter(g => g.playoffRound);
        }
    }

    // Sort games by excitement score
    const sortedGames = [...filteredGames].sort((a, b) => (b.excitement || 0) - (a.excitement || 0));
    console.log('🎯 sortedGames length:', sortedGames.length);

    // Calculate statistics
    const stats = {
        mustWatch: sortedGames.filter(g => (g.excitement || 0) >= 8).length,
        recommended: sortedGames.filter(g => (g.excitement || 0) >= 6 && (g.excitement || 0) < 8).length,
        skip: sortedGames.filter(g => (g.excitement || 0) < 6).length
    };

    // Build HTML
    let html = '';

    // Statistics line
    html += `<div class="statistics-line">
        <span class="stat-number">${stats.mustWatch}</span> must watch ·
        <span class="stat-number">${stats.recommended}</span> recommended ·
        <span class="stat-number">${stats.skip}</span> skip
    </div>`;

    // Toggle slider for scores
    html += `
        <div class="spoiler-toggle-wrapper">
            <span class="toggle-label">show scores</span>
            <div class="toggle-switch ${!window.spoilerFree ? 'active' : ''}" id="scoreToggle">
                <div class="toggle-slider"></div>
            </div>
        </div>
    `;

    // Games list
    html += '<div class="games-list">';
    console.log(`🎮 About to render ${sortedGames.length} games to DOM`);
    sortedGames.forEach((game, index) => {
        console.log(`🎮 Processing game ${index}: ${game.homeTeam} v ${game.awayTeam}`);
        html += createGameRow(game, index);
    });
    html += '</div>';
    console.log(`🎮 Generated HTML for ${sortedGames.length} games, HTML length:`, html.length);

    document.getElementById('resultsArea').innerHTML = html;
    console.log(`🎮 DOM updated. resultsArea innerHTML length:`, document.getElementById('resultsArea').innerHTML.length);

    // Verify games in DOM
    const gameElements = document.querySelectorAll('.game-row');
    console.log(`🎮 DOM verification: Found ${gameElements.length} .game-row elements in DOM`);

    // Attach event listeners
    window.periodAverages = calculatePeriodAverages(window.currentGames);
    attachScoreToggleListener();
    attachRadarChartListeners();
    window.attachVoteListeners();
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

// Create game row HTML
export function createGameRow(game, index) {
    console.log(`🎮 createGameRow called for game ${index}: ${game.homeTeam} v ${game.awayTeam}`);
    const score = game.excitement || 0;
    let ratingClass, ratingText;

    if (score >= 8) {
        ratingClass = 'must-watch';
        ratingText = 'must watch';
    } else if (score >= 6) {
        ratingClass = 'recommended';
        ratingText = 'recommended';
    } else {
        ratingClass = 'skip';
        ratingText = 'skip';
    }

    const shouldShowGameScore = !window.spoilerFree;

    // Format scores
    const displayScore = score % 1 === 0 ? score : score.toFixed(window.ALGORITHM_CONFIG.precision.decimals);
    const gameScoreText = `${game.awayScore || 0}-${game.homeScore || 0}${game.overtime ? ' OT' : ''}`;

    // Calculate pie chart values
    const radius = 21;
    const circumference = 2 * Math.PI * radius;
    const progress = (score / 10) * circumference;
    const remaining = circumference - progress;

    // Generate ESPN recap URL
    let sportPath;
    if (window.selectedSport === 'NFL') {
        sportPath = 'nfl';
    } else if (window.selectedSport === 'CFB') {
        sportPath = 'college-football';
    } else if (window.selectedSport === 'NBA') {
        sportPath = 'nba';
    }
    const recapUrl = `https://www.espn.com/${sportPath}/game/_/gameId/${game.id}`;


    // Build bowl/playoff info for postseason games
    let bowlInfo = '';
    if (window.selectedSport === 'CFB' && (game.bowlName || game.playoffRound)) {
        if (game.playoffRound) {
            // Format CFB playoff games based on round
            if (game.playoffRound === 'Championship') {
                bowlInfo = `<div class="bowl-info playoff">CFP National Championship</div>`;
            } else if (game.playoffRound === 'First Round') {
                bowlInfo = `<div class="bowl-info playoff">CFP First Round</div>`;
            } else if (game.bowlName) {
                // Quarterfinals and Semifinals: "Rose Bowl · CFP Quarterfinal"
                bowlInfo = `<div class="bowl-info playoff">${game.bowlName} · CFP ${game.playoffRound}</div>`;
            } else {
                // Fallback if no bowl name
                bowlInfo = `<div class="bowl-info playoff">CFP ${game.playoffRound}</div>`;
            }
        } else if (game.bowlName) {
            // Regular bowl game - just the bowl name
            bowlInfo = `<div class="bowl-info">${game.bowlName}</div>`;
        }
    } else if (window.selectedSport === 'NFL' && game.playoffRound) {
        // NFL playoff games - show the round label
        bowlInfo = `<div class="bowl-info playoff">${game.playoffRound}</div>`;
    }

    return `
        <div class="game-row" data-game-index="${index}">
            ${bowlInfo}
            <div class="score-rating-line ${ratingClass}">
                <span class="score-value">${displayScore}</span>
                <span class="score-separator"> · </span>
                <span class="rating-text">${ratingText}</span>
            </div>
            <div class="matchup-wrapper">
                <div class="score-pie">
                    <svg width="48" height="48" viewBox="0 0 48 48">
                        <circle class="score-pie-bg" cx="24" cy="24" r="${radius}"/>
                        <circle class="score-pie-fill ${ratingClass}"
                                cx="24" cy="24" r="${radius}"
                                stroke-dasharray="${progress} ${remaining}"/>
                    </svg>
                    <div class="score-pie-value">${displayScore}</div>
                </div>
                <div class="matchup">
                    ${game.awayTeam} <span class="vs-separator">v</span> ${game.homeTeam}
                </div>
            </div>
            <div class="rating ${ratingClass}">${ratingText}</div>
            <div class="vote-container">
                <button class="vote-btn upvote" data-game-id="${game.id}" data-vote="up">△</button>
                <button class="vote-btn downvote" data-game-id="${game.id}" data-vote="down">▽</button>
                <div class="vote-tooltip">Agree with this rating?</div>
            </div>
            <div class="game-score ${shouldShowGameScore ? 'visible' : ''}">${gameScoreText}</div>
            <button class="breakdown-toggle" data-game-id="${game.id}" data-breakdown='${JSON.stringify(game.breakdown || {})}'>View breakdown</button>
            <div class="game-breakdown" id="breakdown-${game.id}"></div>
            <a href="${recapUrl}" target="_blank" rel="noopener noreferrer" class="game-recap-link">See ESPN recap</a>
        </div>
    `;
}

// Attach score toggle listener
export function attachScoreToggleListener() {
    const toggle = document.getElementById('scoreToggle');
    if (toggle) {
        toggle.addEventListener('click', () => {
            window.spoilerFree = !window.spoilerFree;
            localStorage.setItem('spoilerFree', window.spoilerFree);
            displayResults();
        });
    }
}

// Attach radar chart click listeners
export function attachRadarChartListeners() {
    document.querySelectorAll('.breakdown-toggle').forEach(button => {
        button.addEventListener('click', (e) => {
            console.log('Breakdown button clicked');
            console.log('Breakdown data:', button.dataset.breakdown);

            try {
                const breakdown = JSON.parse(button.dataset.breakdown);
                console.log('Parsed breakdown:', breakdown);

                const gameId = button.dataset.gameId;
                const container = document.getElementById(`breakdown-${gameId}`);
                console.log('Container found:', container);

                if (container.innerHTML) {
                    console.log('Collapsing chart');
                    container.innerHTML = '';
                    button.textContent = 'View breakdown';
                } else {
                    console.log('Rendering chart');
                    container.innerHTML = window.renderRadarChart(breakdown, window.periodAverages);
                    button.textContent = 'Hide breakdown';

                    // Attach hover listeners to metric labels
                    setTimeout(() => {
                        window.attachMetricHoverListeners(container);
                    }, 0);
                }
            } catch (error) {
                console.error('Error in radar chart click handler:', error);
            }
        });
    });
}
