/**
 * Score breakdown panel: stacked contribution bar + per-dimension
 * comparison against the period average. Replaces the radar chart in
 * the "Why this game?" detail view.
 */

const DIMENSION_COLORS = {
    tension: 'var(--metric-tension)',
    drama: 'var(--metric-drama)',
    finish: 'var(--metric-finish)'
};

function decimals() {
    return window.ALGORITHM_CONFIG?.precision?.decimals ?? 1;
}

function formatMetric(value) {
    const n = typeof value === 'number' ? value : 0;
    return n.toFixed(decimals());
}

function periodLabel() {
    return (window.selectedSport === 'NBA' || window.selectedSport === 'MLB')
        ? 'date average'
        : 'week average';
}

/**
 * Round contributions so the displayed parts sum exactly to the target
 * score (avoids "1.6 + 4.2 + 3.4 ≠ 9.3" from independent rounding).
 */
function roundContributionsToTotal(values, target, places) {
    const factor = 10 ** places;
    const rounded = values.map(v => Math.round(v * factor) / factor);
    if (rounded.length === 0) return rounded;

    const targetRounded = Math.round(target * factor) / factor;
    const sum = rounded.reduce((acc, v) => acc + v, 0);
    const diff = Math.round((targetRounded - sum) * factor) / factor;
    if (diff === 0) return rounded;

    let idx = 0;
    for (let i = 1; i < rounded.length; i++) {
        if (rounded[i] >= rounded[idx]) idx = i;
    }
    rounded[idx] = Math.round((rounded[idx] + diff) * factor) / factor;
    return rounded;
}

/**
 * @param {Object} breakdown - per-metric scores (typically 0–10)
 * @param {Object|null} averages - period averages for the same keys
 * @param {number} excitement - final GEI score
 * @returns {string} HTML
 */
export function renderScoreBreakdown(breakdown, averages = null, excitement = 0) {
    const metrics = window.ALGORITHM_CONFIG?.metrics || [];
    const weights = window.ALGORITHM_CONFIG?.weights || {};
    const maxScale = window.ALGORITHM_CONFIG?.scale?.max || 10;
    const places = decimals();

    if (!breakdown || metrics.length === 0) {
        return '<p class="detail-copy">Breakdown data is not available for this game.</p>';
    }

    const rows = metrics.map(metric => {
        const value = typeof breakdown[metric.key] === 'number' ? breakdown[metric.key] : 0;
        const weight = typeof weights[metric.key] === 'number' ? weights[metric.key] : 0;
        return {
            key: metric.key,
            label: metric.label,
            desc: metric.description || '',
            value,
            weight,
            // Pre-bonus weighted share of the score
            contribution: value * weight,
            color: DIMENSION_COLORS[metric.key] || 'var(--color-primary)',
            average: averages && typeof averages[metric.key] === 'number' ? averages[metric.key] : null
        };
    });

    // Final GEI includes bonuses / decision / margin adjustments on top of the
    // weighted sum. Scale the parts so the stacked bar and legend always add
    // up to the published score.
    const weightedSum = rows.reduce((sum, row) => sum + row.contribution, 0);
    const score = typeof excitement === 'number' && !Number.isNaN(excitement)
        ? Math.max(0, Math.min(maxScale, excitement))
        : weightedSum;
    const scale = weightedSum > 0 ? score / weightedSum : 0;
    const scaled = rows.map(row => row.contribution * scale);
    const displayParts = roundContributionsToTotal(scaled, score, places);
    rows.forEach((row, i) => {
        row.displayContribution = displayParts[i] ?? 0;
    });

    const shortfall = Math.max(0, Math.round((maxScale - score) * (10 ** places)) / (10 ** places));

    const stackedSegments = rows.map(row => {
        const pct = Math.max(0, (row.displayContribution / maxScale) * 100);
        return `<span class="score-stack-seg" style="width:${pct}%;background:${row.color}" title="${row.label}: ${formatMetric(row.displayContribution)}"></span>`;
    }).join('');

    const legend = rows.map(row => `
        <span class="score-legend-item" data-metric="${row.key}" data-desc="${escapeAttr(row.desc)}">
            <span class="score-legend-swatch" style="background:${row.color}" aria-hidden="true"></span>
            <span class="score-legend-label">${row.label}</span>
            <span class="score-legend-value">${formatMetric(row.displayContribution)}</span>
        </span>
    `).join('');

    const avgHeading = `Each dimension vs ${periodLabel()}`;
    const dimensionRows = rows.map(row => {
        const fillPct = Math.max(0, Math.min(100, (row.value / maxScale) * 100));
        const avgPct = row.average != null
            ? Math.max(0, Math.min(100, (row.average / maxScale) * 100))
            : null;
        const marker = avgPct != null
            ? `<span class="score-dim-avg" style="left:${avgPct}%" title="${periodLabel()}: ${formatMetric(row.average)}"></span>`
            : '';
        return `
            <div class="score-dim-row" data-metric="${row.key}" data-desc="${escapeAttr(row.desc)}">
                <span class="score-dim-label">${row.label}</span>
                <div class="score-dim-track">
                    <span class="score-dim-fill" style="width:${fillPct}%"></span>
                    ${marker}
                </div>
                <span class="score-dim-value">${formatMetric(row.value)}</span>
            </div>
        `;
    }).join('');

    return `
        <div class="score-breakdown">
            <div class="score-section">
                <div class="score-section-label">How the score is built</div>
                <div class="score-stack" role="img" aria-label="Score composition out of ${maxScale}">
                    <div class="score-stack-bar">${stackedSegments}</div>
                </div>
                <div class="score-legend">
                    ${legend}
                    <span class="score-legend-shortfall">${formatMetric(shortfall)} short of ${maxScale}</span>
                </div>
            </div>
            <div class="score-section">
                <div class="score-section-label">${avgHeading}</div>
                <div class="score-dims">${dimensionRows}</div>
            </div>
            <div class="metric-tooltip" id="metric-tooltip" hidden></div>
        </div>
    `;
}

function escapeAttr(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Tooltips for legend / dimension labels (same pattern as the old radar).
 */
export function attachScoreBreakdownListeners(container) {
    const root = container.querySelector('.score-breakdown') || container;
    const tooltip = root.querySelector('.metric-tooltip');
    if (!tooltip) return;

    const hide = () => {
        tooltip.hidden = true;
        tooltip.style.display = '';
        tooltip.textContent = '';
    };

    const targets = root.querySelectorAll('[data-desc]');
    targets.forEach(el => {
        el.addEventListener('mouseenter', () => {
            const desc = el.dataset.desc;
            if (!desc) return;
            tooltip.textContent = desc;
            tooltip.hidden = false;
            tooltip.style.display = 'block';
        });
        el.addEventListener('mousemove', (e) => {
            if (tooltip.hidden) return;
            const rect = root.getBoundingClientRect();
            tooltip.style.left = `${e.clientX - rect.left + 10}px`;
            tooltip.style.top = `${e.clientY - rect.top + 10}px`;
        });
        el.addEventListener('mouseleave', hide);
    });

    root.addEventListener('mouseleave', hide);
}
