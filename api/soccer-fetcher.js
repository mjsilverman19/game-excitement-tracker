const ODDS_API_BASE = 'https://api.the-odds-api.com/v4/historical/sports';

export const SOCCER_LEAGUES = {
  EPL: 'soccer_epl',
  CHAMPIONS_LEAGUE: 'soccer_uefa_champs_league',
  LA_LIGA: 'soccer_spain_la_liga',
  BUNDESLIGA: 'soccer_germany_bundesliga',
  SERIE_A: 'soccer_italy_serie_a',
  MLS: 'soccer_usa_mls'
};

const eventCache = new Map();

function getOddsApiKey() {
  return process.env.ODDS_API_KEY;
}

function toIsoTimestamp(dateInput) {
  if (!dateInput) return new Date().toISOString();
  if (typeof dateInput === 'string' && dateInput.includes('T')) {
    return new Date(dateInput).toISOString();
  }
  return new Date(`${dateInput}T00:00:00Z`).toISOString();
}

function logCreditUsage(response) {
  const remaining = response.headers.get('x-requests-remaining');
  const used = response.headers.get('x-requests-used');

  if (remaining || used) {
    console.log(`Odds API credits - remaining: ${remaining ?? 'unknown'}, used: ${used ?? 'unknown'}`);
  }

  if (remaining && Number(remaining) < 1000) {
    console.warn(`⚠️ Odds API credits running low: ${remaining} remaining`);
  }
}

async function fetchOddsApi(url) {
  const response = await fetch(url);
  logCreditUsage(response);

  if (response.status === 401) {
    console.error('Odds API unauthorized: Invalid ODDS_API_KEY');
    return { error: 'unauthorized' };
  }

  if (response.status === 429) {
    console.error('Odds API rate limit exceeded');
    return { error: 'rate_limited' };
  }

  if (response.status === 404) {
    console.warn('Odds API data not found');
    return { error: 'not_found' };
  }

  if (!response.ok) {
    throw new Error(`Odds API error: ${response.status}`);
  }

  const data = await response.json();
  return { data };
}

function normalizeThreeWay(homeOdds, drawOdds, awayOdds) {
  const rawHome = 1 / homeOdds;
  const rawDraw = 1 / drawOdds;
  const rawAway = 1 / awayOdds;
  const total = rawHome + rawDraw + rawAway;
  return {
    home: rawHome / total,
    draw: rawDraw / total,
    away: rawAway / total
  };
}

function collapseToTwoWay(home, draw, away) {
  return home + draw / 2;
}

function buildClock(elapsedMs) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return {
    minute: minutes,
    clock: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  };
}

function getPeriodFromMinute(minute) {
  if (minute <= 45) return 1;
  if (minute <= 90) return 2;
  return 3;
}

function parseScores(scores = [], homeTeam, awayTeam) {
  let homeScore = 0;
  let awayScore = 0;

  scores.forEach(scoreEntry => {
    if (!scoreEntry?.name) return;
    if (scoreEntry.name === homeTeam) {
      homeScore = parseInt(scoreEntry.score ?? 0, 10);
    } else if (scoreEntry.name === awayTeam) {
      awayScore = parseInt(scoreEntry.score ?? 0, 10);
    }
  });

  return { homeScore, awayScore };
}

export async function fetchSoccerGames(league, date) {
  const apiKey = getOddsApiKey();
  if (!apiKey) {
    throw new Error('ODDS_API_KEY is not set');
  }

  const sportKey = SOCCER_LEAGUES[league];
  if (!sportKey) {
    throw new Error(`Unsupported soccer league: ${league}`);
  }

  const isoDate = toIsoTimestamp(date);
  const url = `${ODDS_API_BASE}/${sportKey}/events?apiKey=${apiKey}&date=${encodeURIComponent(isoDate)}`;

  const { data, error } = await fetchOddsApi(url);
  if (error === 'not_found') {
    return [];
  }
  if (error) {
    return null;
  }

  const events = data?.data || data?.events || data || [];
  if (!Array.isArray(events)) {
    return [];
  }

  const games = events.map(event => {
    const homeTeam = event.home_team || event.homeTeam;
    const awayTeam = event.away_team || event.awayTeam;
    const scores = parseScores(event.scores || [], homeTeam, awayTeam);
    const isCompleted = event.completed === true || (Array.isArray(event.scores) && event.scores.length > 0);

    const game = {
      id: event.id,
      homeTeam,
      awayTeam,
      homeScore: scores.homeScore,
      awayScore: scores.awayScore,
      completed: isCompleted,
      date: event.commence_time || event.commenceTime,
      league,
      sportKey
    };

    eventCache.set(event.id, {
      sportKey,
      commenceTime: event.commence_time || event.commenceTime,
      homeTeam,
      awayTeam
    });

    return game;
  });

  return games.filter(game => game.completed);
}

export async function fetchSoccerOddsTimeseries(matchId) {
  const apiKey = getOddsApiKey();
  if (!apiKey) {
    throw new Error('ODDS_API_KEY is not set');
  }

  const cached = eventCache.get(matchId);
  if (!cached) {
    console.warn(`Missing cached soccer event for match ${matchId}`);
    return null;
  }

  const isoDate = toIsoTimestamp(cached.commenceTime);
  const url = `${ODDS_API_BASE}/${cached.sportKey}/odds?apiKey=${apiKey}&regions=uk,eu&markets=h2h&date=${encodeURIComponent(isoDate)}`;

  const { data, error } = await fetchOddsApi(url);
  if (error) {
    return null;
  }

  const events = data?.data || data?.events || data || [];
  if (!Array.isArray(events)) {
    return null;
  }

  const eventOdds = events.find(event => event.id === matchId);
  if (!eventOdds) {
    return null;
  }

  const bookmakers = eventOdds.bookmakers || [];
  const snapshots = [];
  const commenceTime = new Date(cached.commenceTime).getTime();

  bookmakers.forEach(bookmaker => {
    const market = (bookmaker.markets || []).find(m => m.key === 'h2h') || bookmaker.markets?.[0];
    if (!market || !Array.isArray(market.outcomes)) return;

    const homeOutcome = market.outcomes.find(outcome => outcome.name === cached.homeTeam);
    const awayOutcome = market.outcomes.find(outcome => outcome.name === cached.awayTeam);
    const drawOutcome = market.outcomes.find(
      outcome => typeof outcome.name === 'string' && outcome.name.toLowerCase() === 'draw'
    );

    if (!homeOutcome || !awayOutcome || !drawOutcome) return;

    const normalized = normalizeThreeWay(homeOutcome.price, drawOutcome.price, awayOutcome.price);
    const value = collapseToTwoWay(normalized.home, normalized.draw, normalized.away);

    const lastUpdate = bookmaker.last_update || eventOdds.last_update || cached.commenceTime;
    const elapsedMs = new Date(lastUpdate).getTime() - commenceTime;
    const clockData = buildClock(elapsedMs);

    snapshots.push({
      value,
      period: getPeriodFromMinute(clockData.minute),
      clock: clockData.clock,
      minute: clockData.minute,
      timestamp: lastUpdate
    });
  });

  if (snapshots.length === 0) {
    return null;
  }

  snapshots.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const deduped = new Map();
  snapshots.forEach(snapshot => {
    const key = snapshot.minute;
    const existing = deduped.get(key);
    if (!existing || new Date(snapshot.timestamp) > new Date(existing.timestamp)) {
      deduped.set(key, snapshot);
    }
  });

  const result = Array.from(deduped.values())
    .sort((a, b) => a.minute - b.minute)
    .map(({ timestamp, ...rest }) => rest);

  if (result.length < 5) {
    return null;
  }

  return result;
}

export const soccerOddsUtils = {
  normalizeThreeWay,
  collapseToTwoWay
};
