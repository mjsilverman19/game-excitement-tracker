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
 * @param {Object} breakdown - per-metric scores (typically 0–10)
 * @param {Object|null} averages - period averages for the same keys
 * @param {number} excitement - final GEI score
 * @returns {string} HTML
 */
export function renderScoreBreakdown(breakdown, averages = null, excitement = 0) {
    const metrics = window.ALGORITHM_CONFIG?.metrics || [];
    const weights = window.ALGORITHM_CONFIG?.weights || {};
    const maxScale = window.ALGORITHM_CONFIG?.scale?.max || 10;

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
            contribution: value * weight,
            color: DIMENSION_COLORS[metric.key] || 'var(--color-primary)',
            average: averages && typeof averages[metric.key] === 'number' ? averages[metric.key] : null
        };
    });

    const contributionSum = rows.reduce((sum, row) => sum + row.contribution, 0);
    const score = typeof excitement === 'number' ? excitement : contributionSum;
    const shortfall = Math.max(0, maxScale - score);

    const stackedSegments = rows.map(row => {
        const pct = Math.max(0, (row.contribution / maxScale) * 100);
        return `<span class="score-stack-seg" style="width:${pct}%;background:${row.color}" title="${row.label}: ${formatMetric(row.contribution)}"></span>`;
    }).join('');

    const legend = rows.map(row => `
        <span class="score-legend-item" data-metric="${row.key}" data-desc="${escapeAttr(row.desc)}">
            <span class="score-legend-swatch" style="background:${row.color}" aria-hidden="true"></span>
            <span class="score-legend-label">${row.label}</span>
            <span class="score-legend-value">${formatMetric(row.contribution)}</span>
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
    const tooltip = container.querySelector('.metric-tooltip');
    if (!tooltip) return;

    const targets = container.querySelectorAll('[data-desc]');
    targets.forEach(el => {
        el.addEventListener('mouseenter', () => {
            const desc = el.dataset.desc;
            if (!desc) return;
            tooltip.textContent = desc;
            tooltip.hidden = false;
            tooltip.style.display = 'block';
        });
        el.addEventListener('mousemove', (e) => {
            const rect = container.getBoundingClientRect();
            tooltip.style.left = `${e.clientX - rect.left + 10}px`;
            tooltip.style.top = `${e.clientY - rect.top + 10}px`;
        });
        el.addEventListener('mouseleave', () => {
            tooltip.hidden = true;
            tooltip.style.display = 'none';
        });
    });
}
