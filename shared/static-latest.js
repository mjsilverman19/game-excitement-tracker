/**
 * Compact static JSON helpers and a per-season "latest" pointer so the
 * browser can resolve Latest without probing hundreds of missing dates.
 */

import { NFL_PLAYOFF_ROUNDS, isNFLPlayoffRound } from './algorithm-config.js';

export function stringifyStaticJson(data) {
  return `${JSON.stringify(data)}\n`;
}

/** Numeric sort key — higher means more recent within a season. */
export function periodSortKey(sport, period) {
  if (period == null) return -Infinity;

  if (sport === 'NBA' || sport === 'MLB' || sport === 'CBB') {
    // YYYY-MM-DD sorts chronologically as a string, but use timestamp
    const t = Date.parse(`${period}T12:00:00`);
    return Number.isNaN(t) ? -Infinity : t;
  }

  if (sport === 'NFL' && isNFLPlayoffRound(period)) {
    return NFL_PLAYOFF_ROUNDS[period].order;
  }

  if (sport === 'CFB') {
    if (period === 'bowls') return 16;
    if (period === 'playoffs') return 17;
  }

  const week = typeof period === 'number' ? period : parseInt(period, 10);
  return Number.isFinite(week) ? week : -Infinity;
}

export function isPeriodNewer(sport, candidate, current) {
  return periodSortKey(sport, candidate) > periodSortKey(sport, current);
}

/**
 * @returns {{ period: string|number, updatedAt: string } | null}
 */
export function parseLatestPointer(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.period == null) return null;
  return {
    period: data.period,
    updatedAt: data.updatedAt || null
  };
}

export function buildLatestPointer(period) {
  return {
    period,
    updatedAt: new Date().toISOString()
  };
}
