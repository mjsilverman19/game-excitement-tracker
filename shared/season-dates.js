/**
 * Season and week calendar logic shared by the browser and Node.
 *
 * All season boundaries are derived from the calendar rather than hardcoded
 * per year, so nothing here needs to change at the start of a new season.
 *
 * Football week boundaries follow ESPN's calendar:
 * - NFL kicks off the Thursday after Labor Day. Week N runs Thursday to
 *   Wednesday starting kickoff + 7 * (N - 1) days. The season itself turns
 *   over at Labor Day so an opener earlier in that week is still reachable.
 * - CFB "Week 0" is the Saturday nine days before Labor Day. ESPN folds
 *   Week 0 into week 1, which runs through Labor Day Monday. Week 2 starts
 *   the Tuesday after Labor Day and every later week is Tuesday to Monday.
 *
 * Verified against the ESPN calendars for 2023, 2024 and 2025.
 */

export const MAX_REGULAR_SEASON_WEEKS = {
  NFL: 18,
  CFB: 15
};

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(later, earlier) {
  return Math.floor((startOfDay(later) - startOfDay(earlier)) / DAY_MS);
}

/** First Monday of September for the given year. */
export function getLaborDay(year) {
  const d = new Date(year, 8, 1);
  while (d.getDay() !== 1) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/** NFL opening kickoff: the Thursday after Labor Day. */
export function getNFLKickoff(year) {
  const d = getLaborDay(year);
  d.setDate(d.getDate() + 3);
  return d;
}

/** CFB Week 0 Saturday, which ESPN counts as the start of week 1. */
export function getCFBWeekOneStart(year) {
  const d = getLaborDay(year);
  d.setDate(d.getDate() - 9);
  return d;
}

/** First day of CFB week 2: the Tuesday after Labor Day. */
export function getCFBWeekTwoStart(year) {
  const d = getLaborDay(year);
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * The season year a sport is in on the given date.
 * Football seasons are labeled by the year they start. Winter sports that
 * span the new year (NBA, CBB) are labeled by the year they start. MLB is
 * labeled by the calendar year of the regular season.
 */
export function getCurrentSeason(sport, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();

  if (sport === 'NFL') {
    // Labor Day, not kickoff. Week 1 is anchored to the Thursday after Labor
    // Day for week *numbering*, but the league has opened on other nights, and
    // pinning the season flip to that Thursday leaves any earlier week 1 game
    // unreachable: the app would still be asking ESPN for last season. Flipping
    // at Labor Day covers the whole opening week, and getCurrentWeekNumber
    // already clamps the pre-kickoff days to week 1.
    return startOfDay(now) >= getLaborDay(year) ? year : year - 1;
  }
  if (sport === 'CFB') {
    return startOfDay(now) >= getCFBWeekOneStart(year) ? year : year - 1;
  }
  if (sport === 'MLB') {
    return month >= 2 ? year : year - 1;
  }
  if (sport === 'NBA' || sport === 'CBB') {
    return month >= 9 ? year : year - 1;
  }
  return year;
}

/**
 * The regular-season week number in progress on the given date, clamped to
 * the sport's regular-season length. Before kickoff this returns 1; after the
 * regular season it returns the final week.
 */
export function getCurrentWeekNumber(sport, now = new Date()) {
  const season = getCurrentSeason(sport, now);
  const maxWeek = MAX_REGULAR_SEASON_WEEKS[sport];

  if (sport === 'NFL') {
    const days = daysBetween(now, getNFLKickoff(season));
    const week = Math.floor(days / 7) + 1;
    return Math.min(maxWeek, Math.max(1, week));
  }

  if (sport === 'CFB') {
    const weekTwoStart = getCFBWeekTwoStart(season);
    if (startOfDay(now) < weekTwoStart) return 1;
    const days = daysBetween(now, weekTwoStart);
    const week = Math.floor(days / 7) + 2;
    return Math.min(maxWeek, Math.max(1, week));
  }

  return 1;
}

/**
 * Convenience wrapper returning { season, week } for a sport.
 * Date-based sports (NBA, MLB, CBB) always report week 1.
 */
export function getSeasonInfo(sport, now = new Date()) {
  return {
    season: getCurrentSeason(sport, now),
    week: getCurrentWeekNumber(sport, now)
  };
}
