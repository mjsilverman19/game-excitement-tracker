/**
 * Score breakdown panel for the "Why this game?" detail view.
 *
 * A bullet-graph list (Few): one row per dimension, label · bar · value,
 * strongest first, with the period average as a comparative tick. Text is kept
 * to the data itself; definitions appear on demand when a label is tapped.
 * Finish and Twist reveal how the game ended, so they stay locked while scores
 * are hidden.
 */

const DEFINITIONS = {
    suspense: 'Close throughout, with plays that could swing it',
    surprise: 'Big momentum swings and lead changes',
    finish: 'The closing stretch stayed in doubt',
    twist: 'How unlikely the result looked at its lowest point',
    pacing: 'Not settled early'
};

// Dimensions that reveal how the game ended.
const SPOILER_KEYS = new Set(['finish', 'twist']);

const LOCK_ICON = '<svg class="score-lock" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/></svg>';

function periodLabel() {
    return (window.selectedSport === 'NBA' || window.selectedSport === 'MLB') ? 'Date avg' : 'Week avg';
}

/** Percentile phrasing that cannot be mistaken for the 1–10 rating. */
export function rankLabel(value) {
    const pct = Math.max(0, Math.min(100, value * 10));
    if (pct >= 50) return `Top ${Math.max(1, Math.round(100 - pct))}%`;
    return `Bottom ${Math.max(1, Math.round(pct))}%`;
}

/** The takeaway, stated once: the strongest visible dimensions. */
export function strongestLine(rows) {
    const standouts = rows.filter(row => row.value >= 7).slice(0, 2).map(row => row.label);
    return standouts.length ? `Strongest: ${standouts.join(' · ')}` : '';
}

/**
 * @param {Object} breakdown - per-metric percentiles on a 0–10 scale
 * @param {Object|null} averages - period averages for the same keys
 * @returns {string} HTML
 */
export function renderScoreBreakdown(breakdown, averages = null) {
    const metrics = window.ALGORITHM_CONFIG?.metrics || [];

    if (!breakdown || metrics.length === 0 || Object.keys(breakdown).length === 0) {
        return '<p class="detail-copy">Breakdown not available.</p>';
    }
    // Slates scored before v4 carry tension/drama/finish only.
    if (metrics.some(metric => typeof breakdown[metric.key] !== 'number')) {
        return '<p class="detail-copy">Breakdown available once this game is rescored.</p>';
    }

    const spoilerSafe = window.spoilerMode !== 'scores';
    const all = metrics.map(metric => ({
        key: metric.key,
        label: metric.label,
        value: breakdown[metric.key],
        average: averages && typeof averages[metric.key] === 'number' ? averages[metric.key] : null,
        locked: spoilerSafe && SPOILER_KEYS.has(metric.key)
    }));
    const visible = all.filter(row => !row.locked).sort((a, b) => b.value - a.value);
    const locked = all.filter(row => row.locked);

    const rowHtml = row => {
        const defId = `def-${row.key}-${Math.random().toString(36).slice(2, 8)}`;
        const label = `<button type="button" class="score-dim-label" aria-expanded="false" aria-controls="${defId}">${row.label}</button>`;
        const def = `<p class="score-dim-def" id="${defId}" hidden>${DEFINITIONS[row.key] || ''}</p>`;
        if (row.locked) {
            return `<li class="score-dim is-locked">${label}<span class="score-dim-track" aria-hidden="true"></span><span class="score-dim-value" aria-label="Hidden while scores are off">${LOCK_ICON}</span>${def}</li>`;
        }
        const pct = Math.max(0, Math.min(100, row.value * 10));
        const avgPct = row.average != null ? Math.max(0, Math.min(100, row.average * 10)) : null;
        const rank = rankLabel(row.value);
        return `<li class="score-dim">${label}<span class="score-dim-track" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="${row.label}: ${rank}"><span class="score-dim-fill" style="width:${pct}%"></span>${avgPct != null ? `<span class="score-dim-avg" style="left:${avgPct}%"></span>` : ''}</span><span class="score-dim-value">${rank}</span>${def}</li>`;
    };

    const strongest = strongestLine(visible);
    const keyParts = [];
    if (averages) keyParts.push(`<span class="score-key-avg" aria-hidden="true"></span>${periodLabel()}`);
    if (locked.length) keyParts.push(`${LOCK_ICON}Show scores to reveal`);

    return `
        <div class="score-breakdown">
            ${strongest ? `<p class="score-summary">${strongest}</p>` : ''}
            <ul class="score-dims">${[...visible, ...locked].map(rowHtml).join('')}</ul>
            ${keyParts.length ? `<p class="score-key">${keyParts.join('<span class="score-key-sep" aria-hidden="true">·</span>')}</p>` : ''}
        </div>
    `;
}

/** Tapping a dimension label shows its definition (details on demand). */
export function attachScoreBreakdownListeners(container) {
    container.querySelectorAll('.score-dim-label').forEach(button => {
        button.addEventListener('click', () => {
            const def = container.querySelector(`#${button.getAttribute('aria-controls')}`);
            if (!def) return;
            const open = button.getAttribute('aria-expanded') === 'true';
            button.setAttribute('aria-expanded', String(!open));
            def.hidden = open;
        });
    });
}
