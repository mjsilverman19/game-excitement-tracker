/**
 * Radar Chart Component
 * Handles rendering and interaction for the metric breakdown radar charts
 */

/**
 * Render radar chart for metric breakdown
 * @param {Object} breakdown - The game's metric breakdown data
 * @param {Object|null} averages - Optional period averages to display as comparison
 * @returns {string} HTML string containing the SVG radar chart
 */
export function renderRadarChart(breakdown, averages = null) {
    // Handle missing or empty breakdown data
    if (!breakdown || Object.keys(breakdown).length === 0) {
        return '<div style="color: #6b6560; font-size: 11px; padding: 8px;">Breakdown data not available for this game. Try selecting a different week to load fresh data.</div>';
    }

    const metrics = window.ALGORITHM_CONFIG.metrics || [];
    if (metrics.length === 0) {
        return '<div style="color: #6b6560; font-size: 11px; padding: 8px;">Breakdown data not available for this game. Try selecting a different week to load fresh data.</div>';
    }

    const size = 330;
    const center = size / 2;
    const radius = 80;
    const labelDistance = 130;
    const angleStep = (2 * Math.PI) / metrics.length;
    const startAngle = -Math.PI / 2; // Start at top
    const maxScale = window.ALGORITHM_CONFIG.scale.max || 10;
    const decimals = window.ALGORITHM_CONFIG.precision.decimals;

    // Calculate vertex positions for max (10) and actual values
    const points = metrics.map((metric, i) => {
        const angle = startAngle + (i * angleStep);
        const value = typeof breakdown[metric.key] === 'number' ? breakdown[metric.key] : 0;
        const r = (value / maxScale) * radius;
        return {
            x: center + r * Math.cos(angle),
            y: center + r * Math.sin(angle),
            labelX: center + labelDistance * Math.cos(angle),
            labelY: center + labelDistance * Math.sin(angle),
            label: metric.label,
            value: value,
            desc: metric.description || ''
        };
    });

    // Build SVG
    const polygonPoints = points.map(p => `${p.x},${p.y}`).join(' ');
    const hasAverages = averages && typeof averages === 'object';
    const averagePoints = hasAverages ? metrics.map((metric, i) => {
        const angle = startAngle + (i * angleStep);
        const value = typeof averages[metric.key] === 'number' ? averages[metric.key] : 0;
        const r = (value / maxScale) * radius;
        return {
            x: center + r * Math.cos(angle),
            y: center + r * Math.sin(angle)
        };
    }) : [];
    const averagesPolygonPoints = averagePoints.map(p => `${p.x},${p.y}`).join(' ');

    // Grid lines (circles at 2, 4, 6, 8, 10)
    let gridLines = '';
    const gridLevels = 5;
    for (let step = 1; step <= gridLevels; step += 1) {
        const level = (maxScale / gridLevels) * step;
        const r = (level / maxScale) * radius;
        gridLines += `<circle cx="${center}" cy="${center}" r="${r}" class="radar-grid"/>`;
    }

    // Axis lines
    let axisLines = '';
    points.forEach((p, i) => {
        const angle = startAngle + (i * angleStep);
        const endX = center + radius * Math.cos(angle);
        const endY = center + radius * Math.sin(angle);
        axisLines += `<line x1="${center}" y1="${center}" x2="${endX}" y2="${endY}" class="radar-axis"/>`;
    });

    // Labels with hover tooltips
    let labels = '';
    points.forEach((p, i) => {
        labels += `
            <g class="radar-label-group" data-metric="${metrics[i].key}" data-desc="${p.desc}">
                <text x="${p.labelX}" y="${p.labelY}" class="radar-label">${p.label}</text>
                <text x="${p.labelX}" y="${p.labelY + 14}" class="radar-value">${p.value.toFixed(decimals)}</text>
            </g>
        `;
    });

    const legendLabel = window.selectedSport === 'NBA' ? 'Date avg' : 'Week avg';
    const legend = hasAverages ? `
        <div class="radar-legend">
            <div class="radar-legend-item">
                <svg width="20" height="10" aria-hidden="true">
                    <line x1="0" y1="5" x2="20" y2="5" stroke="var(--accent-must-watch)" stroke-width="2"></line>
                </svg>
                <span>This game</span>
            </div>
            <div class="radar-legend-item">
                <svg width="20" height="10" aria-hidden="true">
                    <line x1="0" y1="5" x2="20" y2="5" stroke="rgba(160, 140, 180, 0.6)" stroke-width="1.5" stroke-dasharray="4 3"></line>
                </svg>
                <span>${legendLabel}</span>
            </div>
        </div>
    ` : '';

    return `
        <div style="position: relative;">
            <svg width="${size}" height="${size}" class="radar-chart" viewBox="0 0 ${size} ${size}">
                ${gridLines}
                ${axisLines}
                ${hasAverages ? `<polygon points="${averagesPolygonPoints}" class="radar-average"/>` : ''}
                <polygon points="${polygonPoints}" class="radar-fill"/>
                ${labels}
            </svg>
            <div class="metric-tooltip" id="metric-tooltip"></div>
            ${legend}
        </div>
    `;
}

/**
 * Attach hover listeners to radar chart metric labels
 * Shows tooltips with metric descriptions on hover
 * @param {HTMLElement} container - The container element containing the radar chart
 */
export function attachMetricHoverListeners(container) {
    const labelGroups = container.querySelectorAll('.radar-label-group');
    const tooltip = container.querySelector('.metric-tooltip');

    if (!tooltip) return;

    labelGroups.forEach(group => {
        group.addEventListener('mouseenter', (e) => {
            const desc = group.dataset.desc;
            tooltip.textContent = desc;
            tooltip.style.display = 'block';
        });

        group.addEventListener('mousemove', (e) => {
            const rect = container.getBoundingClientRect();
            tooltip.style.left = (e.clientX - rect.left + 10) + 'px';
            tooltip.style.top = (e.clientY - rect.top + 10) + 'px';
        });

        group.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
    });
}
