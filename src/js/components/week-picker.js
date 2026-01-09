/**
 * Week picker component for NFL/CFB week selection
 * Generates week grid with season selector
 */

import { getCurrentWeek } from '../utils/dates.js';
import { NFL_PLAYOFF_ROUNDS, isNFLPlayoffRound } from '../../../shared/algorithm-config.js';

/**
 * Populates the week picker with season selector and week grid
 * - Shows current season only (historical data not available)
 * - Generates week numbers based on sport (NFL: 18 weeks, CFB: 15 weeks)
 * - Adds special CFB postseason options (Bowls, Playoffs)
 * - Highlights selected week
 * - Handles week and season selection
 */
export function populateWeekPicker() {
    const currentYear = new Date().getFullYear();
    const maxWeeks = window.selectedSport === 'NFL' ? 18 : 15;

    // Determine current season for the selected sport
    const currentSeasonInfo = getCurrentWeek(window.selectedSport);
    const currentSeasonYear = currentSeasonInfo.season;

    // Populate season buttons
    // Only show current season (historical data not available)
    const seasonButtons = document.getElementById('seasonButtons');
    seasonButtons.innerHTML = '';

    const seasonsToShow = [currentSeasonYear];

    seasonsToShow.forEach(year => {
        const btn = document.createElement('div');
        btn.className = 'season-btn';
        if (year === window.selectedSeason) {
            btn.classList.add('active');
        }
        btn.textContent = year;
        btn.addEventListener('click', () => {
            window.periodAverages = null;
            window.selectedSeason = year;
            window.selectedWeek = 1; // Reset to week 1 when changing season
            window.isInitialLoad = false; // User manually selected season
            window.updateUI();
            window.loadGames();
            document.getElementById('weekPicker').classList.remove('visible');
        });
        seasonButtons.appendChild(btn);
    });

    // Populate week grid
    const weekGrid = document.getElementById('weekGrid');
    weekGrid.innerHTML = '';

    for (let week = 1; week <= maxWeeks; week++) {
        const weekItem = document.createElement('div');
        weekItem.className = 'week-item';
        if (week === window.selectedWeek) {
            weekItem.classList.add('selected');
        }
        weekItem.textContent = week;
        weekItem.addEventListener('click', () => {
            window.periodAverages = null;
            window.selectedWeek = week;
            window.isInitialLoad = false; // User manually selected week
            window.updateUI();
            window.loadGames();
            document.getElementById('weekPicker').classList.remove('visible');
        });
        weekGrid.appendChild(weekItem);
    }

    // Add "Bowls" and "Playoffs" options for CFB
    if (window.selectedSport === 'CFB') {
        const bowlsItem = document.createElement('div');
        bowlsItem.className = 'week-item';
        if (window.selectedWeek === 'bowls') {
            bowlsItem.classList.add('selected');
        }
        bowlsItem.textContent = 'Bowls';
        bowlsItem.addEventListener('click', () => {
            window.periodAverages = null;
            window.selectedWeek = 'bowls';
            window.isInitialLoad = false;
            window.updateUI();
            window.loadGames();
            document.getElementById('weekPicker').classList.remove('visible');
        });
        weekGrid.appendChild(bowlsItem);

        const playoffsItem = document.createElement('div');
        playoffsItem.className = 'week-item';
        if (window.selectedWeek === 'playoffs') {
            playoffsItem.classList.add('selected');
        }
        playoffsItem.textContent = 'Playoffs';
        playoffsItem.addEventListener('click', () => {
            window.periodAverages = null;
            window.selectedWeek = 'playoffs';
            window.isInitialLoad = false;
            window.updateUI();
            window.loadGames();
            document.getElementById('weekPicker').classList.remove('visible');
        });
        weekGrid.appendChild(playoffsItem);
    }

    // Add NFL playoff round options
    if (window.selectedSport === 'NFL') {
        // Display labels for the buttons (shorter versions for UI)
        const roundLabels = {
            'wild-card': 'Wild Card',
            'divisional': 'Divisional',
            'conference': 'Conference',
            'super-bowl': 'Super Bowl'
        };

        Object.keys(NFL_PLAYOFF_ROUNDS).forEach(roundKey => {
            const roundItem = document.createElement('div');
            roundItem.className = 'week-item';
            if (window.selectedWeek === roundKey) {
                roundItem.classList.add('selected');
            }
            roundItem.textContent = roundLabels[roundKey];
            roundItem.addEventListener('click', () => {
                window.periodAverages = null;
                window.selectedWeek = roundKey;
                window.isInitialLoad = false;
                window.updateUI();
                window.loadGames();
                document.getElementById('weekPicker').classList.remove('visible');
            });
            weekGrid.appendChild(roundItem);
        });
    }
}
