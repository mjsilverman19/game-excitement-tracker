// Live recommendations use the current state, not the completed-game rating.
export function calculateLiveSignal(probabilities, { period = 1, clock = '' } = {}) {
  const points = (probabilities || []).filter(p =>
    typeof p.homeWinPercentage === 'number' && Number.isFinite(p.homeWinPercentage) &&
    p.homeWinPercentage >= 0 && p.homeWinPercentage <= 1
  );
  if (!points.length) return { priority: -1, label: 'Live data pending', closeness: null, recentSwing: null };
  const current = points.at(-1).homeWinPercentage;
  const closeness = 1 - Math.abs(current - 0.5) * 2;
  const recent = points.slice(-8);
  let recentSwing = 0;
  for (let i = 1; i < recent.length; i++) {
    recentSwing = Math.max(recentSwing, Math.abs(recent[i].homeWinPercentage - recent[i - 1].homeWinPercentage));
  }
  const parts = String(clock).split(':').map(Number);
  const seconds = parts.length === 2 && parts.every(Number.isFinite) ? parts[0] * 60 + parts[1] : null;
  const late = period > 4 || (period === 4 && seconds !== null && seconds <= 300);
  const tight = closeness >= 0.6;
  const label = late && tight ? 'Tight finish' : recentSwing >= 0.15 && closeness >= 0.2
    ? 'Momentum swing' : tight ? 'Close game' : 'One team in control';
  return {
    priority: Math.round((closeness * 70 + Math.min(recentSwing / 0.3, 1) * 20 + (late ? closeness * 10 : 0)) * 10) / 10,
    label, closeness, recentSwing
  };
}

export function parseLiveEvent(event) {
  const competition = event.competitions?.[0];
  if (!competition) return null;
  const status = competition.status || event.status || {};
  const home = competition.competitors?.find(c => c.homeAway === 'home');
  const away = competition.competitors?.find(c => c.homeAway === 'away');
  if (!home || !away) return null;
  return {
    id: event.id, name: event.name,
    homeTeam: home.team?.shortDisplayName || home.team?.displayName || 'Home',
    awayTeam: away.team?.shortDisplayName || away.team?.displayName || 'Away',
    homeScore: home.score ?? null, awayScore: away.score ?? null,
    homeLogo: home.team?.logo || null, awayLogo: away.team?.logo || null,
    state: status.type?.state, status: status.type?.shortDetail || '',
    period: status.period || 0, clock: status.displayClock || '', date: event.date
  };
}

export function enrichLiveGame(game, summary) {
  // Summary data couples probabilities to play IDs. Never apply post-game
  // trailing-noise cleanup here: a live recovery from 0/100% can be genuine.
  const status = summary.header?.competitions?.[0]?.status;
  const updated = status ? {
    ...game, state: status.type?.state || game.state,
    status: status.type?.shortDetail || game.status,
    period: status.period ?? game.period, clock: status.displayClock ?? game.clock
  } : { ...game };
  const competitors = summary.header?.competitions?.[0]?.competitors || [];
  for (const side of ['home', 'away']) {
    const competitor = competitors.find(c => c.homeAway === side);
    if (competitor?.score != null) updated[`${side}Score`] = competitor.score;
  }
  const drives = summary.drives || {};
  const plays = [...(drives.previous || []), ...(drives.current ? [drives.current] : [])]
    .flatMap(d => d.plays || []);
  const latestPlay = plays.reduce((latest, play) =>
    Number(play.sequenceNumber) > Number(latest?.sequenceNumber || -1) ? play : latest, null);
  const probabilities = summary.winprobability || [];
  const latestProbability = probabilities.at(-1);
  const pending = !latestProbability || !latestPlay || String(latestProbability.playId) !== String(latestPlay.id);
  return {
    ...updated,
    ...(pending ? { priority: -1, label: 'Live data pending', closeness: null, recentSwing: null }
      : calculateLiveSignal(probabilities, updated)),
    probabilityPlayId: latestProbability?.playId || null,
    lastPlayAt: latestPlay?.wallclock || null,
    dataPending: pending
  };
}
