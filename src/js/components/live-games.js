let controller = null;
let timer = null;
let active = false;
let sequence = 0;
let lastData = null;
let showScores = false;

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export function renderLiveProbabilityChart(game, labelsVisible = false) {
  const values = (game.probabilityHistory || []).filter(value =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1);
  if (game.dataPending || !values.length) return '';
  const left = labelsVisible ? 32 : 4;
  const right = 316;
  const top = 8;
  const bottom = 72;
  const coordinates = values.map((value, i) => [
    values.length === 1 ? right : left + i / (values.length - 1) * (right - left),
    bottom - value * (bottom - top)
  ]);
  const path = coordinates.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [endX, endY] = coordinates.at(-1);
  const current = Math.round(values.at(-1) * 100);
  const accessibleLabel = labelsVisible
    ? `${game.homeTeam} win probability over recent plays, currently ${current} percent.`
    : 'Recent win-probability movement. Team and percentage labels hidden.';
  return `<figure class="live-probability">
    <figcaption class="live-chart-caption">Recent momentum</figcaption>
    <svg class="live-sparkline" viewBox="0 0 320 80" role="img" aria-label="${escapeHTML(accessibleLabel)}">
      <line class="live-chart-midline" x1="${left}" y1="40" x2="${right}" y2="40" />
      ${labelsVisible ? '<text class="live-chart-axis" x="0" y="12">100%</text><text class="live-chart-axis" x="0" y="44">50%</text><text class="live-chart-axis" x="0" y="76">0%</text>' : ''}
      <path class="live-chart-path" d="${path}" />
      <circle class="live-chart-end" cx="${endX.toFixed(1)}" cy="${endY.toFixed(1)}" r="3" />
    </svg>
    ${labelsVisible ? `<p class="live-chart-values">${escapeHTML(game.homeTeam)} ${current}% · ${escapeHTML(game.awayTeam)} ${100 - current}%</p>` : ''}
  </figure>`;
}

function render(data) {
  const area = document.getElementById('liveArea');
  const games = data.games || [];
  area.innerHTML = games.length ? `<div class="live-grid">${games.map((game, index) => `
    <article class="live-card ${index === 0 && !game.dataPending ? 'live-card-featured' : ''}">
      <div class="live-card-header"><span class="live-label">${escapeHTML(game.label)}</span><span class="live-clock">${escapeHTML(game.status)}</span></div>
      <h2>${escapeHTML(game.awayTeam)} <span class="live-at">at</span> ${escapeHTML(game.homeTeam)}</h2>
      ${renderLiveProbabilityChart(game, showScores)}
      ${showScores ? `<p class="live-score">${escapeHTML(game.awayTeam)} ${escapeHTML(game.awayScore)} · ${escapeHTML(game.homeTeam)} ${escapeHTML(game.homeScore)}</p>` : ''}
      <p class="live-reason">${game.dataPending ? 'Waiting for probabilities to catch up with the latest play.' :
        game.label === 'Tight finish' ? 'Still competitive in the final minutes.' :
        game.label === 'Momentum swing' ? 'A big shift in win probability in the last eight plays.' :
        game.label === 'Close game' ? 'Both teams have a strong chance to win.' : 'The current win probability favors one side.'}</p>
    </article>`).join('')}</div>` : '<div class="live-empty"><h2>No NFL games live right now</h2><p>Check back at kickoff, or find a completed game in Discover.</p></div>';
  if (data.upcoming?.length) {
    area.innerHTML += `<section class="live-upcoming"><h2>Next kickoffs</h2>${data.upcoming.map(game => `
      <div class="live-upcoming-row"><span>${escapeHTML(game.awayTeam)} at ${escapeHTML(game.homeTeam)}</span><time datetime="${escapeHTML(game.date)}">${escapeHTML(new Date(game.date).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }))}</time></div>`).join('')}</section>`;
  }
  const updated = new Date(data.metadata.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  document.getElementById('liveStatus').textContent = `Updated ${updated} · Refreshes every minute`;
}

async function refresh() {
  if (!active || document.hidden) return;
  const request = ++sequence;
  controller?.abort();
  const current = new AbortController();
  controller = current;
  const timeout = setTimeout(() => current.abort(), 18000);
  const button = document.getElementById('liveRefresh');
  button.disabled = true;
  document.getElementById('liveStatus').textContent = 'Updating live games…';
  try {
    const response = await fetch('/api/live', { signal: current.signal, cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Could not load live games');
    if (!active || request !== sequence) return;
    lastData = data;
    render(data);
  } catch {
    if (!active || request !== sequence) return;
    const updated = lastData ? new Date(lastData.metadata.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
    document.getElementById('liveStatus').textContent = updated
      ? `Refresh failed. Showing data from ${updated}. Retrying in one minute.`
      : 'Could not load live games. Retrying in one minute.';
    if (!lastData) document.getElementById('liveArea').innerHTML = '<div class="live-empty"><h2>Live games unavailable</h2><p>Use Refresh to try again.</p></div>';
  } finally {
    clearTimeout(timeout);
    if (active && request === sequence) {
      button.disabled = false;
      clearTimeout(timer);
      timer = setTimeout(refresh, 60000);
    }
  }
}

export function startLiveGames() {
  active = true;
  if (lastData) render(lastData);
  else document.getElementById('liveArea').textContent = 'Loading live games…';
  refresh();
}

export function stopLiveGames() {
  active = false;
  sequence++;
  controller?.abort();
  clearTimeout(timer);
}

export function initLiveGames() {
  document.getElementById('liveRefresh').addEventListener('click', refresh);
  document.getElementById('liveShowScores').addEventListener('change', event => {
    showScores = event.target.checked;
    if (lastData) render(lastData);
  });
  document.addEventListener('visibilitychange', () => {
    if (!active) return;
    if (document.hidden) {
      sequence++;
      controller?.abort();
      clearTimeout(timer);
    } else refresh();
  });
  window.addEventListener('pagehide', stopLiveGames);
}
