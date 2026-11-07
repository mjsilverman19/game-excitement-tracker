/**
 * Spoiler-free, reader-facing breakdown of a game's entertainment rating.
 * The five dimension ratings come from the scoring model; the short
 * explanations here describe the viewing experience, not the formula.
 */

const DIMENSION_DESCRIPTIONS = {
    pacing: 'How consistently the game held your attention',
    suspense: 'How uncertain the outcome remained',
    finish: 'How compelling the closing stretch was',
    surprise: 'How much the game defied expectations',
    twist: 'How the balance of advantage shifted'
};

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * @param {Object} breakdown - per-dimension ratings (0–10)
 * @returns {string} HTML
 */
export function renderScoreBreakdown(breakdown) {
    const metrics = window.ALGORITHM_CONFIG?.metrics || [];
    const maxScale = window.ALGORITHM_CONFIG?.scale?.max || 10;
    const decimals = window.ALGORITHM_CONFIG?.precision?.decimals ?? 1;

    if (!breakdown || metrics.length === 0 || Object.keys(breakdown).length === 0) {
        return '<p class="detail-copy">Breakdown data is not available for this game.</p>';
    }

    if (metrics.some(metric => typeof breakdown[metric.key] !== 'number')) {
        return '<p class="detail-copy">This game was scored by an earlier version of the index; the breakdown will appear once it is rescored.</p>';
    }

    const rows = metrics.map(metric => ({
        key: metric.key,
        label: metric.label,
        value: breakdown[metric.key],
        description: DIMENSION_DESCRIPTIONS[metric.key] || metric.description || ''
    })).sort((a, b) => b.value - a.value);

    const dimensionRows = rows.map(row => {
        const value = Math.max(0, Math.min(maxScale, row.value));
        const fillPct = (value / maxScale) * 100;
        return `
            <div class="score-dim-row">
                <div class="score-dim-heading">
                    <span class="score-dim-label">${escapeHtml(row.label)}</span>
                    <span class="score-dim-value">${value.toFixed(decimals)}</span>
                </div>
                <div class="score-dim-track" role="meter" aria-label="${escapeHtml(row.label)}" aria-valuemin="0" aria-valuemax="${maxScale}" aria-valuenow="${value}">
                    <span class="score-dim-fill" style="width:${fillPct}%"></span>
                </div>
                <p class="score-dim-description">${escapeHtml(row.description)}</p>
            </div>
        `;
    }).join('');

    return `
        <div class="score-breakdown">
            <div class="score-section-label">What made this game stand out</div>
            <div class="score-dims">${dimensionRows}</div>
        </div>
    `;
}
