/**
 * Export Modal Functions
 * Handles season export functionality for generating Excel files
 */

import { getCurrentWeek } from '../utils/dates.js';

// ===== HELPER FUNCTIONS =====

/**
 * Get static file path for a sport/season/week combination
 */
function getStaticPath(sport, season, weekOrDate) {
    const sportLower = sport.toLowerCase();
    if (sport === 'NBA') {
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

/**
 * Fetch data from static file
 */
async function fetchStaticData(sport, season, weekOrDate) {
    try {
        const path = getStaticPath(sport, season, weekOrDate);
        const response = await fetch(path);

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return data;
    } catch (error) {
        return null;
    }
}

// ===== EXPORT MODAL FUNCTIONS =====

/**
 * Get week range preset options for a sport
 */
export function getWeekRangePresets(sport) {
    if (sport === 'NFL') {
        return [
            { label: 'All', value: 'all', start: 1, end: 18 },
            { label: 'First Half', value: 'first-half', start: 1, end: 9 },
            { label: 'Second Half', value: 'second-half', start: 10, end: 18 },
            { label: 'Custom', value: 'custom', start: null, end: null }
        ];
    } else if (sport === 'CFB') {
        return [
            { label: 'All', value: 'all', start: 1, end: 'playoffs' },
            { label: 'Regular Season', value: 'regular', start: 1, end: 15 },
            { label: 'Bowls Only', value: 'bowls', start: 'bowls', end: 'bowls' },
            { label: 'Playoffs Only', value: 'playoffs', start: 'playoffs', end: 'playoffs' },
            { label: 'Custom', value: 'custom', start: null, end: null }
        ];
    } else if (sport === 'NBA') {
        // NBA uses date ranges
        const currentSeasonInfo = getCurrentWeek('NBA');
        const season = currentSeasonInfo.season;
        return [
            { label: 'All', value: 'all', start: `${season}-10-01`, end: `${season + 1}-04-30` },
            { label: 'Pre-All-Star', value: 'pre-allstar', start: `${season}-10-01`, end: `${season + 1}-02-15` },
            { label: 'Post-All-Star', value: 'post-allstar', start: `${season + 1}-02-16`, end: `${season + 1}-04-30` },
            { label: 'Custom', value: 'custom', start: null, end: null }
        ];
    }
    return [];
}

/**
 * Populate week range selection UI
 */
export function populateWeekRangeUI(sport) {
    const weekRangeGroup = document.getElementById('weekRangeGroup');
    const dateRangeGroup = document.getElementById('dateRangeGroup');
    const exportPresets = document.getElementById('exportPresets');
    const exportDatePresets = document.getElementById('exportDatePresets');
    const exportStartWeek = document.getElementById('exportStartWeek');
    const exportEndWeek = document.getElementById('exportEndWeek');
    const exportStartDate = document.getElementById('exportStartDate');
    const exportEndDate = document.getElementById('exportEndDate');
    const validationMessage = document.getElementById('exportValidationMessage');

    // Clear validation message
    validationMessage.style.display = 'none';
    validationMessage.textContent = '';

    // Show/hide appropriate range UI
    if (sport === 'NBA') {
        weekRangeGroup.style.display = 'none';
        dateRangeGroup.style.display = 'block';
    } else {
        weekRangeGroup.style.display = 'block';
        dateRangeGroup.style.display = 'none';
    }

    // Get presets for the sport
    const presets = getWeekRangePresets(sport);

    // Populate preset buttons
    const presetsContainer = sport === 'NBA' ? exportDatePresets : exportPresets;
    presetsContainer.innerHTML = '';

    presets.forEach(preset => {
        const btn = document.createElement('button');
        btn.className = 'export-preset-btn';
        btn.textContent = preset.label;
        btn.dataset.value = preset.value;
        btn.dataset.start = preset.start;
        btn.dataset.end = preset.end;

        // Set "All" as default active
        if (preset.value === 'all') {
            btn.classList.add('active');
        }

        presetsContainer.appendChild(btn);
    });

    // Populate week dropdowns for NFL/CFB
    if (sport !== 'NBA') {
        let weekOptions = [];
        if (sport === 'NFL') {
            weekOptions = Array.from({ length: 18 }, (_, i) => ({ value: i + 1, label: `Week ${i + 1}` }));
        } else if (sport === 'CFB') {
            weekOptions = Array.from({ length: 15 }, (_, i) => ({ value: i + 1, label: `Week ${i + 1}` }));
            weekOptions.push({ value: 'bowls', label: 'Bowls' });
            weekOptions.push({ value: 'playoffs', label: 'Playoffs' });
        }

        exportStartWeek.innerHTML = weekOptions.map(opt =>
            `<option value="${opt.value}">${opt.label}</option>`
        ).join('');
        exportEndWeek.innerHTML = weekOptions.map(opt =>
            `<option value="${opt.value}">${opt.label}</option>`
        ).join('');

        // Set default to full range
        exportStartWeek.value = weekOptions[0].value;
        exportEndWeek.value = weekOptions[weekOptions.length - 1].value;
    } else {
        // Initialize NBA date inputs with default "All" preset
        const allPreset = presets.find(p => p.value === 'all');
        if (allPreset) {
            exportStartDate.value = allPreset.start;
            exportEndDate.value = allPreset.end;
        }
    }
}

/**
 * Handle preset button selection
 */
export function handlePresetSelection(sport, preset) {
    const exportCustomRange = document.getElementById('exportCustomRange');
    const exportCustomDateRange = document.getElementById('exportCustomDateRange');
    const exportStartWeek = document.getElementById('exportStartWeek');
    const exportEndWeek = document.getElementById('exportEndWeek');
    const exportStartDate = document.getElementById('exportStartDate');
    const exportEndDate = document.getElementById('exportEndDate');
    const validationMessage = document.getElementById('exportValidationMessage');

    // Clear validation
    validationMessage.style.display = 'none';
    validationMessage.textContent = '';

    if (preset.value === 'custom') {
        // Show custom range inputs
        if (sport === 'NBA') {
            exportCustomDateRange.style.display = 'block';
            const currentSeasonInfo = getCurrentWeek('NBA');
            const season = currentSeasonInfo.season;
            exportStartDate.value = `${season}-10-01`;
            exportEndDate.value = `${season + 1}-04-30`;
        } else {
            exportCustomRange.style.display = 'block';
        }
    } else {
        // Hide custom range inputs
        exportCustomRange.style.display = 'none';
        exportCustomDateRange.style.display = 'none';

        // Set values from preset
        if (sport === 'NBA') {
            exportStartDate.value = preset.start;
            exportEndDate.value = preset.end;
        } else {
            exportStartWeek.value = preset.start;
            exportEndWeek.value = preset.end;
        }
    }

    // Validate the selection
    validateRangeSelection(sport);
}

/**
 * Validate the selected range
 */
export function validateRangeSelection(sport) {
    const validationMessage = document.getElementById('exportValidationMessage');
    const downloadBtn = document.getElementById('exportDownloadBtn');

    if (sport === 'NBA') {
        const startDate = document.getElementById('exportStartDate').value;
        const endDate = document.getElementById('exportEndDate').value;

        if (!startDate || !endDate) {
            validationMessage.textContent = 'Please select both start and end dates.';
            validationMessage.style.display = 'block';
            downloadBtn.disabled = true;
            return false;
        }

        if (new Date(startDate) > new Date(endDate)) {
            validationMessage.textContent = 'End date must be after start date.';
            validationMessage.style.display = 'block';
            downloadBtn.disabled = true;
            return false;
        }
    } else {
        const startWeek = document.getElementById('exportStartWeek').value;
        const endWeek = document.getElementById('exportEndWeek').value;

        // Handle bowls/playoffs special cases
        const weekOrder = { 'bowls': 16, 'playoffs': 17 };
        const getWeekValue = (week) => {
            if (weekOrder[week] !== undefined) return weekOrder[week];
            return parseInt(week);
        };

        const startValue = getWeekValue(startWeek);
        const endValue = getWeekValue(endWeek);

        if (startValue > endValue) {
            validationMessage.textContent = 'Start week must be before or equal to end week.';
            validationMessage.style.display = 'block';
            downloadBtn.disabled = true;
            return false;
        }
    }

    // Valid selection
    validationMessage.style.display = 'none';
    validationMessage.textContent = '';
    downloadBtn.disabled = false;
    return true;
}

/**
 * Open the export modal
 */
export function openExportModal() {
    const modal = document.getElementById('exportModal');
    const overlay = document.getElementById('exportModalOverlay');
    const sportSelect = document.getElementById('exportSportSelect');
    const seasonSelect = document.getElementById('exportSeasonSelect');
    const warningDiv = document.getElementById('exportWarning');

    // Pre-fill with current selections
    sportSelect.value = window.selectedSport;

    // Populate season options (only current season available)
    const currentSeasonInfo = getCurrentWeek(window.selectedSport);
    seasonSelect.innerHTML = `<option value="${currentSeasonInfo.season}">${currentSeasonInfo.season}</option>`;

    // Show/hide NBA warning
    if (window.selectedSport === 'NBA') {
        warningDiv.style.display = 'block';
    } else {
        warningDiv.style.display = 'none';
    }

    // Populate week range UI
    populateWeekRangeUI(window.selectedSport);

    // Show modal
    modal.classList.add('visible');
    overlay.classList.add('visible');

    // Reset export state
    window.exportCancelled = false;
    hideExportProgress();
}

/**
 * Close the export modal
 */
export function closeExportModal() {
    const modal = document.getElementById('exportModal');
    const overlay = document.getElementById('exportModalOverlay');

    modal.classList.remove('visible');
    overlay.classList.remove('visible');

    // Cancel any in-progress export
    window.exportCancelled = true;
}

/**
 * Show export progress
 */
export function showExportProgress(current, total, message) {
    const progressDiv = document.getElementById('exportProgress');
    const progressText = document.getElementById('exportProgressText');
    const progressFill = document.getElementById('exportProgressFill');
    const downloadBtn = document.getElementById('exportDownloadBtn');

    progressDiv.classList.add('visible');
    progressText.textContent = message;

    const percentage = (current / total) * 100;
    progressFill.style.width = `${percentage}%`;

    // Disable download button during export
    downloadBtn.disabled = true;
}

/**
 * Hide export progress
 */
export function hideExportProgress() {
    const progressDiv = document.getElementById('exportProgress');
    const downloadBtn = document.getElementById('exportDownloadBtn');

    progressDiv.classList.remove('visible');
    downloadBtn.disabled = false;
}

/**
 * Get range information for display and filename
 */
export function getRangeInfo(sport, rangeStart, rangeEnd) {
    let isPartial = false;
    let label = '';
    let filenameSuffix = 'full-season';

    if (sport === 'NFL') {
        const defaultStart = 1;
        const defaultEnd = 18;
        isPartial = rangeStart !== defaultStart || rangeEnd !== defaultEnd;
        if (isPartial) {
            label = `weeks ${rangeStart}-${rangeEnd}`;
            filenameSuffix = `weeks-${rangeStart}-${rangeEnd}`;
        }
    } else if (sport === 'CFB') {
        const isPlayoffsOnly = rangeStart === 'playoffs' && rangeEnd === 'playoffs';
        const isBowlsOnly = rangeStart === 'bowls' && rangeEnd === 'bowls';
        const isFullSeason = rangeStart === 1 && rangeEnd === 'playoffs';

        if (isPlayoffsOnly) {
            isPartial = true;
            label = 'playoffs only';
            filenameSuffix = 'playoffs';
        } else if (isBowlsOnly) {
            isPartial = true;
            label = 'bowls only';
            filenameSuffix = 'bowls';
        } else if (!isFullSeason) {
            isPartial = true;
            if (rangeEnd === 'playoffs') {
                label = `weeks ${rangeStart}-15 + bowls + playoffs`;
                filenameSuffix = `weeks-${rangeStart}-playoffs`;
            } else if (rangeEnd === 'bowls') {
                label = `weeks ${rangeStart}-15 + bowls`;
                filenameSuffix = `weeks-${rangeStart}-bowls`;
            } else {
                label = `weeks ${rangeStart}-${rangeEnd}`;
                filenameSuffix = `weeks-${rangeStart}-${rangeEnd}`;
            }
        }
    } else if (sport === 'NBA') {
        // Check if it's a partial season by comparing dates
        const currentSeasonInfo = getCurrentWeek('NBA');
        const season = currentSeasonInfo.season;
        const defaultStart = `${season}-10-01`;
        const defaultEnd = `${season + 1}-04-30`;

        if (rangeStart && rangeEnd && (rangeStart !== defaultStart || rangeEnd !== defaultEnd)) {
            isPartial = true;
            // Format dates for display (e.g., "Oct-Dec")
            const startDate = new Date(rangeStart);
            const endDate = new Date(rangeEnd);
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                              'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const startMonth = monthNames[startDate.getMonth()];
            const endMonth = monthNames[endDate.getMonth()];
            label = `${startMonth}-${endMonth}`;
            filenameSuffix = `${startMonth.toLowerCase()}-${endMonth.toLowerCase()}`;
        }
    }

    return { isPartial, label, filenameSuffix };
}

/**
 * Fetch all weeks/dates for export
 */
export async function fetchAllWeeks(sport, season, rangeStart = null, rangeEnd = null) {
    const allGames = [];
    let weeks = [];
    let useDateBasedFetch = false;

    // Determine weeks to fetch based on sport
    if (sport === 'NFL') {
        const start = rangeStart || 1;
        const end = rangeEnd || 18;
        weeks = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    } else if (sport === 'CFB') {
        const start = (rangeStart === 'bowls' || rangeStart === 'playoffs') ? rangeStart : (rangeStart || 1);
        const end = (rangeEnd === 'bowls' || rangeEnd === 'playoffs') ? rangeEnd : (rangeEnd || 15);

        if (start === 'playoffs' && end === 'playoffs') {
            // Playoffs only
            weeks = ['playoffs'];
        } else if (start === 'bowls' && end === 'bowls') {
            // Bowls only
            weeks = ['bowls'];
        } else if (start === 'bowls' && end === 'playoffs') {
            // Bowls and playoffs
            weeks = ['bowls', 'playoffs'];
        } else if (start === 'bowls' || start === 'playoffs') {
            // Invalid: can't start with bowls/playoffs unless end is also bowls/playoffs
            weeks = [start];
        } else {
            // Regular weeks
            weeks = Array.from({ length: end - start + 1 }, (_, i) => start + i);
            // Add bowls and/or playoffs if end is 'bowls' or 'playoffs'
            if (rangeEnd === 'playoffs') {
                weeks.push('bowls', 'playoffs');
            } else if (rangeEnd === 'bowls') {
                weeks.push('bowls');
            }
        }
    } else if (sport === 'NBA') {
        // NBA uses date-based fetching
        useDateBasedFetch = true;
        // Use provided date range or default to Oct 1 - Today
        const startDate = rangeStart ? new Date(rangeStart) : new Date(season, 9, 1);
        const endDate = rangeEnd ? new Date(rangeEnd) : new Date();
        const daysDiff = Math.floor((endDate - startDate) / (24 * 60 * 60 * 1000));

        weeks = Array.from({ length: daysDiff + 1 }, (_, i) => {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            return date.toISOString().split('T')[0];
        });
    }

    const totalWeeks = weeks.length;
    const rangeInfo = getRangeInfo(sport, rangeStart, rangeEnd);

    for (let i = 0; i < weeks.length; i++) {
        if (window.exportCancelled) {
            throw new Error('Export cancelled by user');
        }

        const week = weeks[i];
        let progressMessage;

        if (useDateBasedFetch) {
            if (rangeInfo.isPartial) {
                progressMessage = `Fetching date ${i + 1} of ${totalWeeks} (${rangeInfo.label})...`;
            } else {
                progressMessage = `Fetching date ${i + 1} of ${totalWeeks}...`;
            }
        } else if (week === 'bowls') {
            progressMessage = `Fetching bowl games...`;
        } else if (week === 'playoffs') {
            progressMessage = `Fetching playoff games...`;
        } else {
            if (rangeInfo.isPartial) {
                progressMessage = `Fetching week ${week} (${rangeInfo.label})...`;
            } else {
                progressMessage = `Fetching week ${week} of ${totalWeeks}...`;
            }
        }

        showExportProgress(i + 1, totalWeeks, progressMessage);

        try {
            // Try static file first
            const staticData = await fetchStaticData(sport, season, week);
            if (staticData && staticData.success && staticData.games) {
                console.log(`✅ ${useDateBasedFetch ? 'Date' : 'Week'} ${week}: loaded from static`);
                staticData.games.forEach(game => {
                    game.week = week;
                    allGames.push(game);
                });
            } else {
                // Fall back to API
                console.log(`⚠️ ${useDateBasedFetch ? 'Date' : 'Week'} ${week}: falling back to API`);

                let requestBody;
                if (useDateBasedFetch) {
                    requestBody = {
                        sport: sport,
                        date: week
                    };
                } else {
                    requestBody = {
                        sport: sport,
                        season: season,
                        week: week,
                        seasonType: '2'
                    };
                }

                const response = await fetch('/api/games', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                const data = await response.json();

                if (data.success && data.games && data.games.length > 0) {
                    // Add week/date info to each game for Excel
                    data.games.forEach(game => {
                        game.week = week;
                        allGames.push(game);
                    });
                }
            }
        } catch (error) {
            console.error(`Error fetching ${useDateBasedFetch ? 'date' : 'week'} ${week}:`, error);
            // Continue with remaining weeks even if one fails
        }

        // Add small delay to avoid hammering the API
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return allGames;
}

/**
 * Export full season to Excel
 */
export async function exportFullSeason() {
    const sportSelect = document.getElementById('exportSportSelect');
    const seasonSelect = document.getElementById('exportSeasonSelect');

    const sport = sportSelect.value;
    const season = parseInt(seasonSelect.value);

    // Get selected range
    let rangeStart, rangeEnd;
    if (sport === 'NBA') {
        rangeStart = document.getElementById('exportStartDate').value;
        rangeEnd = document.getElementById('exportEndDate').value;
    } else {
        rangeStart = document.getElementById('exportStartWeek').value;
        rangeEnd = document.getElementById('exportEndWeek').value;
        // Convert to numbers if not 'bowls' or 'playoffs'
        if (rangeStart !== 'bowls' && rangeStart !== 'playoffs') rangeStart = parseInt(rangeStart);
        if (rangeEnd !== 'bowls' && rangeEnd !== 'playoffs') rangeEnd = parseInt(rangeEnd);
    }

    // Validate range before proceeding
    if (!validateRangeSelection(sport)) {
        return;
    }

    try {
        showExportProgress(0, 100, 'Starting export...');

        // Fetch all games for the selected range
        const allGames = await fetchAllWeeks(sport, season, rangeStart, rangeEnd);

        if (allGames.length === 0) {
            const validationMessage = document.getElementById('exportValidationMessage');
            validationMessage.textContent = 'No completed games in selected range.';
            validationMessage.style.display = 'block';
            hideExportProgress();
            return;
        }

        // Sort by excitement score descending
        allGames.sort((a, b) => (b.excitement || 0) - (a.excitement || 0));

        showExportProgress(1, 1, 'Generating Excel file...');

        // Generate Excel file
        const workbook = XLSX.utils.book_new();

        // Prepare data for Excel
        const excelData = allGames.map((game, index) => {
            const rating = game.excitement || 0;
            let tier;
            if (rating >= 8) tier = 'Must Watch';
            else if (rating >= 6) tier = 'Recommended';
            else tier = 'Skip';

            // Format week - handle bowls, playoffs, and dates
            let weekDisplay;
            if (sport === 'NBA') {
                weekDisplay = game.week; // Date string
            } else if (game.week === 'playoffs' || game.playoffRound) {
                weekDisplay = 'Playoff';
            } else if (game.week === 'bowls' || game.bowlName) {
                weekDisplay = 'Bowl';
            } else {
                weekDisplay = game.week;
            }

            // Format date
            let dateDisplay = '';
            if (game.date) {
                const gameDate = new Date(game.date);
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                dateDisplay = `${monthNames[gameDate.getMonth()]} ${gameDate.getDate()}`;
            }

            return {
                'Rank': index + 1,
                'Rating': rating.toFixed(window.ALGORITHM_CONFIG.precision.decimals),
                'Tier': tier,
                'Week': weekDisplay,
                'Date': dateDisplay,
                'Away Team': game.awayTeam,
                'Home Team': game.homeTeam,
                'Away Score': game.awayScore || 0,
                'Home Score': game.homeScore || 0,
                'OT': game.overtime ? 'Yes' : 'No',
                'Bowl': game.bowlName || '',
                'Playoff Round': game.playoffRound || ''
            };
        });

        // Create worksheet from data
        const worksheet = XLSX.utils.json_to_sheet(excelData);

        // Set column widths
        worksheet['!cols'] = [
            { wch: 6 },  // Rank
            { wch: 8 },  // Rating
            { wch: 14 }, // Tier
            { wch: 10 }, // Week
            { wch: 10 }, // Date
            { wch: 20 }, // Away Team
            { wch: 20 }, // Home Team
            { wch: 12 }, // Away Score
            { wch: 12 }, // Home Score
            { wch: 6 },  // OT
            { wch: 25 }, // Bowl
            { wch: 15 }  // Playoff Round
        ];

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Games');

        // Generate filename with range info
        const rangeInfo = getRangeInfo(sport, rangeStart, rangeEnd);
        let filename;
        if (sport === 'NBA') {
            filename = `gei-nba-${season}-${season + 1}-${rangeInfo.filenameSuffix}.xlsx`;
        } else {
            filename = `gei-${sport.toLowerCase()}-${season}-${rangeInfo.filenameSuffix}.xlsx`;
        }

        // Download file
        XLSX.writeFile(workbook, filename);

        // Close modal
        hideExportProgress();
        closeExportModal();

    } catch (error) {
        console.error('Export error:', error);
        hideExportProgress();

        if (error.message === 'Export cancelled by user') {
            alert('Export cancelled.');
        } else {
            alert('Export failed. Please try again.');
        }
    }
}

/**
 * Attach all event listeners for export modal
 */
export function attachExportListeners() {
    // Export season link
    document.getElementById('exportSeasonLink').addEventListener('click', (e) => {
        e.preventDefault();
        openExportModal();
    });

    // Cancel button
    document.getElementById('exportCancelBtn').addEventListener('click', () => {
        closeExportModal();
    });

    // Download button
    document.getElementById('exportDownloadBtn').addEventListener('click', () => {
        exportFullSeason();
    });

    // Close modal when clicking overlay
    document.getElementById('exportModalOverlay').addEventListener('click', () => {
        closeExportModal();
    });

    // Update warning and season when sport changes
    document.getElementById('exportSportSelect').addEventListener('change', (e) => {
        const sport = e.target.value;
        const warningDiv = document.getElementById('exportWarning');
        const seasonSelect = document.getElementById('exportSeasonSelect');

        // Show/hide NBA warning
        if (sport === 'NBA') {
            warningDiv.style.display = 'block';
        } else {
            warningDiv.style.display = 'none';
        }

        // Update season options
        const currentSeasonInfo = getCurrentWeek(sport);
        seasonSelect.innerHTML = `<option value="${currentSeasonInfo.season}">${currentSeasonInfo.season}</option>`;

        // Repopulate week range UI
        populateWeekRangeUI(sport);
    });

    // Event delegation for preset buttons (since they're dynamically created)
    document.getElementById('exportPresets').addEventListener('click', (e) => {
        if (e.target.classList.contains('export-preset-btn')) {
            const sport = document.getElementById('exportSportSelect').value;

            // Remove active class from all buttons
            document.querySelectorAll('#exportPresets .export-preset-btn').forEach(btn => {
                btn.classList.remove('active');
            });

            // Add active class to clicked button
            e.target.classList.add('active');

            // Handle preset selection
            const preset = {
                value: e.target.dataset.value,
                start: e.target.dataset.start === 'null' ? null : e.target.dataset.start,
                end: e.target.dataset.end === 'null' ? null : e.target.dataset.end
            };

            // Convert to numbers if applicable
            if (preset.start && preset.start !== 'bowls' && preset.start !== 'playoffs') {
                preset.start = parseInt(preset.start);
            }
            if (preset.end && preset.end !== 'bowls' && preset.end !== 'playoffs') {
                preset.end = parseInt(preset.end);
            }

            handlePresetSelection(sport, preset);
        }
    });

    // Event delegation for NBA date preset buttons
    document.getElementById('exportDatePresets').addEventListener('click', (e) => {
        if (e.target.classList.contains('export-preset-btn')) {
            const sport = document.getElementById('exportSportSelect').value;

            // Remove active class from all buttons
            document.querySelectorAll('#exportDatePresets .export-preset-btn').forEach(btn => {
                btn.classList.remove('active');
            });

            // Add active class to clicked button
            e.target.classList.add('active');

            // Handle preset selection
            const preset = {
                value: e.target.dataset.value,
                start: e.target.dataset.start === 'null' ? null : e.target.dataset.start,
                end: e.target.dataset.end === 'null' ? null : e.target.dataset.end
            };

            handlePresetSelection(sport, preset);
        }
    });

    // Custom range inputs validation
    document.getElementById('exportStartWeek').addEventListener('change', () => {
        const sport = document.getElementById('exportSportSelect').value;
        validateRangeSelection(sport);
    });

    document.getElementById('exportEndWeek').addEventListener('change', () => {
        const sport = document.getElementById('exportSportSelect').value;
        validateRangeSelection(sport);
    });

    document.getElementById('exportStartDate').addEventListener('change', () => {
        validateRangeSelection('NBA');
    });

    document.getElementById('exportEndDate').addEventListener('change', () => {
        validateRangeSelection('NBA');
    });
}
