/**
 * Decorative sport artwork for the hero card.
 * Inline SVG drawn in currentColor so it inherits the card's text color.
 * Everything is generated; teams with a real stadium photo use that instead
 * (see STADIUM_IMAGES in game-list.js).
 *
 * The baseball seam is the reference: a long double seam sweeping down
 * the right of the card with dense V-shaped stitches, the way the
 * thread reads on a close-up photograph.
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

function f(n) {
    return n.toFixed(1);
}

/**
 * Chevron stitches along a seam: each stitch is a V whose apex sits just
 * ahead of the seam centerline and whose arms reach back past both seam
 * edges, so a run of them reads as the thread on a baseball.
 */
function seamStitches(p0, p1, p2, p3, count, reach) {
    let out = '';
    for (let i = 0; i <= count; i++) {
        const t = i / count;
        const p = cubicPoint(p0, p1, p2, p3, t);
        const tan = cubicTangent(p0, p1, p2, p3, t);
        const n = { x: -tan.y, y: tan.x };
        const apex = { x: p.x + tan.x * reach * 0.55, y: p.y + tan.y * reach * 0.55 };
        const left = { x: p.x + n.x * reach - tan.x * reach * 0.45, y: p.y + n.y * reach - tan.y * reach * 0.45 };
        const right = { x: p.x - n.x * reach - tan.x * reach * 0.45, y: p.y - n.y * reach - tan.y * reach * 0.45 };
        out += `<path d="M${f(left.x)} ${f(left.y)} L${f(apex.x)} ${f(apex.y)} L${f(right.x)} ${f(right.y)}"/>`;
    }
    return out;
}

function seamPath(p0, p1, p2, p3, offset) {
    let d = '';
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p = cubicPoint(p0, p1, p2, p3, t);
        const tan = cubicTangent(p0, p1, p2, p3, t);
        const x = p.x - tan.y * offset;
        const y = p.y + tan.x * offset;
        d += `${i === 0 ? 'M' : 'L'}${f(x)} ${f(y)} `;
    }
    return d;
}

function baseballArt() {
    const p0 = { x: 700, y: -60 };
    const p1 = { x: 500, y: 110 };
    const p2 = { x: 500, y: 330 };
    const p3 = { x: 720, y: 500 };
    return `
        <svg class="hero-art" viewBox="0 0 720 420" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
            <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <path d="${seamPath(p0, p1, p2, p3, 14)}" stroke-width="2" opacity="0.22"/>
                <path d="${seamPath(p0, p1, p2, p3, -14)}" stroke-width="2" opacity="0.22"/>
                <g stroke-width="7" opacity="0.72">${seamStitches(p0, p1, p2, p3, 26, 26)}</g>
            </g>
        </svg>`;
}

function footballArt() {
    const lace = [];
    for (let i = 0; i < 8; i++) {
        const x = 452 + i * 30;
        lace.push(`<path d="M${x} 176 L${x} 244"/>`);
    }
    return `
        <svg class="hero-art" viewBox="0 0 720 420" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
            <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <path d="M260 210 C260 40, 470 -40, 660 30 C820 90, 820 330, 660 390 C470 460, 260 380, 260 210 Z" stroke-width="3" opacity="0.3"/>
                <path d="M300 210 C330 110, 410 50, 540 40 M300 210 C330 310, 410 370, 540 380" stroke-width="2" opacity="0.18"/>
                <path d="M420 210 L690 210" stroke-width="8" opacity="0.7"/>
                <g stroke-width="8" opacity="0.7">${lace.join('')}</g>
            </g>
        </svg>`;
}

function basketballArt() {
    return `
        <svg class="hero-art" viewBox="0 0 720 420" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
            <g fill="none" stroke="currentColor" stroke-linecap="round">
                <circle cx="660" cy="210" r="320" stroke-width="3" opacity="0.3"/>
                <path d="M340 210 H980" stroke-width="7" opacity="0.6"/>
                <path d="M660 -110 V530" stroke-width="7" opacity="0.6"/>
                <path d="M436 -10 C580 110, 580 310, 436 430" stroke-width="7" opacity="0.6"/>
                <path d="M884 -10 C740 110, 740 310, 884 430" stroke-width="7" opacity="0.6"/>
            </g>
        </svg>`;
}

/**
 * Artwork for the hero card, keyed by sport.
 */
export function heroArt(sport) {
    if (sport === 'MLB') return baseballArt();
    if (sport === 'NBA') return basketballArt();
    return footballArt();
}
