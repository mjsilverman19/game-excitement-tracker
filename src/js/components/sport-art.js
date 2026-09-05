/**
 * Decorative sport artwork for the hero card.
 * Inline SVG drawn in currentColor so it inherits the card's text color
 * and works in both themes. Everything is generated, no image assets.
 */

function cubicPoint(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return {
        x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
        y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y
    };
}

function cubicTangent(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    const x = 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
    const y = 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
}

/**
 * Stitches along a cubic curve: short angled ticks either side of the seam,
 * the way a baseball's red thread reads from a distance.
 */
function stitches(p0, p1, p2, p3, count, length, angle) {
    let out = '';
    for (let i = 0; i <= count; i++) {
        const t = i / count;
        const p = cubicPoint(p0, p1, p2, p3, t);
        const tan = cubicTangent(p0, p1, p2, p3, t);
        const n = { x: -tan.y, y: tan.x };
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        // Rotate the normal by +/- angle to give the stitch its lean
        const d1 = { x: n.x * c - n.y * s, y: n.x * s + n.y * c };
        const d2 = { x: n.x * c + n.y * s, y: -n.x * s + n.y * c };
        out += `<line x1="${(p.x - d1.x * length).toFixed(1)}" y1="${(p.y - d1.y * length).toFixed(1)}" x2="${(p.x + d1.x * length * 0.15).toFixed(1)}" y2="${(p.y + d1.y * length * 0.15).toFixed(1)}"/>`;
        out += `<line x1="${(p.x + d2.x * length).toFixed(1)}" y1="${(p.y + d2.y * length).toFixed(1)}" x2="${(p.x - d2.x * length * 0.15).toFixed(1)}" y2="${(p.y - d2.y * length * 0.15).toFixed(1)}"/>`;
    }
    return out;
}

function baseballArt() {
    // One long seam sweeping down the right side of the card
    const p0 = { x: 620, y: -40 };
    const p1 = { x: 470, y: 120 };
    const p2 = { x: 470, y: 320 };
    const p3 = { x: 640, y: 470 };
    const seam = `M${p0.x} ${p0.y} C${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;
    return `
        <svg class="hero-art" viewBox="0 0 720 420" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
            <g fill="none" stroke="currentColor" stroke-linecap="round">
                <path d="${seam}" stroke-width="3" opacity="0.35"/>
                <g stroke-width="5">${stitches(p0, p1, p2, p3, 22, 22, 0.55)}</g>
            </g>
        </svg>`;
}

function footballArt() {
    // A football silhouette turned on its side, laces up
    const lace = [];
    for (let i = 0; i < 7; i++) {
        const x = 470 + i * 26;
        lace.push(`<line x1="${x}" y1="188" x2="${x}" y2="232"/>`);
    }
    return `
        <svg class="hero-art" viewBox="0 0 720 420" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
            <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <path d="M300 210 C300 60, 480 -20, 640 40 C760 90, 760 330, 640 380 C480 440, 300 360, 300 210 Z" stroke-width="3" opacity="0.35"/>
                <path d="M340 210 C360 130, 420 80, 520 62 M340 210 C360 290, 420 340, 520 358" stroke-width="2" opacity="0.2"/>
                <line x1="450" y1="210" x2="640" y2="210" stroke-width="5"/>
                <g stroke-width="5">${lace.join('')}</g>
            </g>
        </svg>`;
}

function basketballArt() {
    // The quarter of a ball that shows at the edge of the card
    return `
        <svg class="hero-art" viewBox="0 0 720 420" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
            <g fill="none" stroke="currentColor" stroke-linecap="round">
                <circle cx="640" cy="210" r="300" stroke-width="3" opacity="0.35"/>
                <path d="M340 210 H940" stroke-width="4" opacity="0.6"/>
                <path d="M640 -90 V510" stroke-width="4" opacity="0.6"/>
                <path d="M430 -2 C560 120, 560 300, 430 422" stroke-width="4" opacity="0.6"/>
                <path d="M850 -2 C720 120, 720 300, 850 422" stroke-width="4" opacity="0.6"/>
            </g>
        </svg>`;
}

/**
 * Artwork for the hero card, keyed by sport.
 */
export function heroArt(sport) {
    if (sport === 'MLB') return baseballArt();
    if (sport === 'NBA' || sport === 'CBB') return basketballArt();
    return footballArt();
}
