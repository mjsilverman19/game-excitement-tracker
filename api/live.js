import { parseLiveEvent, enrichLiveGame } from '../shared/live-signals.js';

async function fetchJSON(url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`ESPN returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Use GET' });
  }
  try {
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date()).replace(/-/g, '');
    const scoreboard = await fetchJSON(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${day}&limit=100`, 5000
    );
    const events = (scoreboard.events || []).map(parseLiveEvent).filter(Boolean);
    const live = events.filter(game => game.state === 'in');
    const games = await Promise.all(live.map(async game => {
      try {
        const summary = await fetchJSON(
          `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${game.id}`, 6000
        );
        return enrichLiveGame(game, summary);
      } catch {
        return { ...game, priority: -1, label: 'Live data pending', closeness: null, recentSwing: null, dataPending: true };
      }
    }));
    const ongoing = games.filter(game => game.state === 'in');
    ongoing.sort((a, b) => b.priority - a.priority || String(a.id).localeCompare(String(b.id)));
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=20');
    return res.status(200).json({
      success: true, games: ongoing,
      upcoming: events.filter(game => game.state === 'pre').sort((a, b) => String(a.date).localeCompare(String(b.date))),
      metadata: { sport: 'NFL', fetchedAt: new Date().toISOString(), refreshSeconds: 60,
        pending: ongoing.filter(game => game.dataPending).length }
    });
  } catch (error) {
    console.error('Live scoreboard unavailable:', error.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ success: false, error: 'Live games are unavailable. Please try again.' });
  }
}
