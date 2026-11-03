/**
 * Score breakdown panel for the "Why this game?" detail view.
 *
 * Leads with a one-line answer, then lists each dimension strongest first
 * with a plain-language definition, a percentile bar and the period average.
 * Dimensions that reveal how the game ended (Finish, Twist) stay hidden while
 * scores are hidden, so the panel never spoils a comeback.
 */

// Short, always-visible definitions and the phrase used in the summary line.
const DIMENSION_COPY = {
    suspense: { short: 'Close throughout, with plays that could swing it', phrase: 'tension throughout' },
    surprise: { short: 'Big momentum swings and lead changes', phrase: 'big momentum swings' },
    finish: { short: 'The closing stretch stayed in doubt', phrase: 'a dramatic finish' },
    twist: { short: 'How unlikely the result looked at its lowest point', phrase: 'an unlikely turnaround' },
    pacing: { short: 'Not settled early', phrase: 'staying in doubt late' }
};

// Dimensions that reveal how the game ended.
const SPOILER_KEYS = new Set(['finish', 'twist']);

const SPORT_NAMES = { NFL: 'NFL', CFB: 'college football', NBA: 'NBA', MLB: 'MLB', CBB: 'college basketball' };

function periodLabel() {
    return (window.selectedSport === 'NBA' || window.selectedSport === 'MLB')
        ? 'Date average'
        : 'Week average';
}

/** Percentile phrasing that cannot be mistaken for the 1–10 rating. */
export function rankLabel(value) {
    const pct = Math.max(0, Math.min(100, value * 10));
    if (pct >= 50) return `Top ${Math.max(1, Math.round(100 - pct))}%`;
    return `Bottom ${Math.max(1, Math.round(pct))}%`;
}

function joinPhrases(phrases) {
    if (phrases.length <= 1) return phrases[0] || '';
    return `${phrases.slice(0, -1).join(', ')} and ${phrases.at(-1)}`;
}

/** One-line answer to "why it rates X", from the strongest visible dimensions. */
export function summaryLine(rows) {
    const standouts = rows.filter(row => row.value >= 7).slice(0, 2);
    if (standouts.length) {
        return `Stood out for ${joinPhrases(standouts.map(row => DIMENSION_COPY[row.key]?.phrase || row.label.toLowerCase()))}.`;
    }
    if (rows.every(row => row.value < 4)) return 'Little drama on any measure.';
    return 'A steady game without a standout moment.';
}

/**
 * @param {Object} breakdown - per-metric percentiles on a 0–10 scale
 * @param {Object|null} averages - period averages for the same keys
 * @returns {string} HTML
 */
export function renderScoreBreakdown(breakdown, averages = null) {
    const metrics = window.ALGORITHM_CONFIG?.metrics || [];

    if (!breakdown || metrics.length === 0 || Object.keys(breakdown).length === 0) {
        return '<p class="detail-copy">Breakdown data is not available for this game.</p>';
    }

    // Slates scored before v4 carry tension/drama/finish only.
    if (metrics.some(metric => typeof breakdown[metric.key] !== 'number')) {
        return '<p class="detail-copy">This game was scored by an earlier version of the index; the breakdown will appear once it is rescored.</p>';
    }

    const spoilerSafe = window.spoilerMode !== 'scores';
    const rows = metrics
        .filter(metric => !(spoilerSafe && SPOILER_KEYS.has(metric.key)))
        .map(metric => ({
            key: metric.key,
            label: metric.label,
            value: breakdown[metric.key],
            average: averages && typeof averages[metric.key] === 'number' ? averages[metric.key] : null
        }))
        .sort((a, b) => b.value - a.value);
    const hiddenLabels = metrics.filter(metric => spoilerSafe && SPOILER_KEYS.has(metric.key)).map(m => m.label);

    const dimensionRows = rows.map(row => {
        const pct = Math.max(0, Math.min(100, row.value * 10));
        const avgPct = row.average != null ? Math.max(0, Math.min(100, row.average * 10)) : null;
        const rank = rankLabel(row.value);
        const description = DIMENSION_COPY[row.key]?.short || '';
        return `
            <li class="score-dim">
                <div class="score-dim-head">
                    <span class="score-dim-label">${escapeHtml(row.label)}</span>
                    <span class="score-dim-rank">${rank}</span>
                </div>
                <div class="score-dim-track" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"
                    aria-label="${escapeHtml(row.label)}: ${rank}${avgPct != null ? `, ${periodLabel().toLowerCase()} ${rankLabel(row.average).toLowerCase()}` : ''}">
                    <span class="score-dim-fill" style="width:${pct}%"></span>
                    ${avgPct != null ? `<span class="score-dim-avg" style="left:${avgPct}%" aria-hidden="true"></span>` : ''}
                </div>
                <p class="score-dim-desc">${escapeHtml(description)}</p>
            </li>
        `;
    }).join('');

    const sport = SPORT_NAMES[window.selectedSport] || 'other';
    const hiddenNote = hiddenLabels.length
        ? `<p class="score-hidden-note">${escapeHtml(joinPhrases(hiddenLabels))} hidden to avoid spoilers. Turn on Show scores to see them.</p>`
        : '';

    return `
        <div class="score-breakdown">
            <p class="score-summary">${escapeHtml(summaryLine(rows))}</p>
            <ul class="score-dims">${dimensionRows}</ul>
            ${hiddenNote}
            <p class="score-key">
                ${averages ? `<span class="score-key-avg" aria-hidden="true"></span> ${periodLabel()} · ` : ''}Ranked against ${escapeHtml(sport)} games using ESPN's play-by-play win probability, not the final score.
            </p>
        </div>
    `;
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** Definitions are always visible now; kept for callers that still attach. */
export function attachScoreBreakdownListeners() {}
