// /api/games.js — last 7 days, single cached analysis per sport
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

const TTL = 60 * 60 * 12; // 12h cache

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { sport = "NFL" } = req.body || {};

  // Compute last 7 full calendar days in UTC: [end-6, end]
  const end = new Date();                      // now
  end.setUTCHours(0, 0, 0, 0);                 // start of today UTC
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 7);      // last 7 full days

  const rangeKey = `${iso(start)}_${iso(sub(end,1))}`; // e.g., 2025-09-16_2025-09-22
  const cacheKey = `games:${sport}:last7:${rangeKey}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        games: cached.games,
        metadata: { ...cached.metadata, cached: true, source: "Redis", range: rangeKey },
      });
    }

    const analysis = await runClaudeAnalysisLast7(sport, start, end);

    const payload = {
      games: analysis.games,
      metadata: {
        sport,
        range: rangeKey,
        source: "Claude AI + WP variance",
        gameCount: analysis.games.length,
        analyzedAt: new Date().toISOString(),
      },
    };

    await redis.set(cacheKey, payload, { ex: TTL });
    return res.status(200).json({ success: true, ...payload });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: String(e), games: [] });
  }
}

// ---- AI analysis for a range (one call) ----
async function runClaudeAnalysisLast7(sport, startDate, endDate) {
  const dateRange = `${iso(startDate)} to ${iso(sub(endDate,1))}`;

  const prompt = `
You are helping build a sports excitement tracker.

Look at all ${sport} games played from ${dateRange}. Imagine you are viewing each game's ESPN win probability chart.
Judge excitement from volatility: big swings, multiple 50% crossings, late-game flips, and overtime.

Rate 1–10:
- 8–10: chaotic chart, many swings and late drama
- 6–8: several swings or a notable comeback
- 4–6: modest movement
- 1–3: steady blowout

Bonuses: +1 overtime, +0.5–1 for final 2-minute drama, +1.5 major comeback.

Respond with JSON ONLY:

{
  "games": [
    {
      "date": "YYYY-MM-DD",
      "homeTeam": "Team",
      "awayTeam": "Team",
      "homeScore": 0,
      "awayScore": 0,
      "excitement": 0.0,
      "overtime": false,
      "description": "one terse English sentence about the ride",
      "varianceAnalysis": "short string describing swings/crossings",
      "keyMoments": ["bullet", "bullet"]
    }
  ]
}
If no games, return {"games": []}.
`.trim();

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Claude API ${r.status}: ${t}`);
  }

  const data = await r.json();
  let text = data?.content?.[0]?.text ?? "";
  // strip fences if present
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (fenced) text = fenced[1].trim();
  const jsonish = text.match(/\{[\s\S]*\}/)?.[0] ?? "{}";
  const parsed = JSON.parse(jsonish);

  const games = Array.isArray(parsed.games) ? parsed.games : [];
  const normalized = games.map((g, i) => ({
    id: `last7-${iso(startDate)}-${i}`,
    date: g.date || null,
    homeTeam: g.homeTeam ?? "Unknown",
    awayTeam: g.awayTeam ?? "Unknown",
    homeScore: toInt(g.homeScore),
    awayScore: toInt(g.awayScore),
    excitement: toFloat(g.excitement, 5.0),
    overtime: Boolean(g.overtime),
    description: g.description || "",
    varianceAnalysis: g.varianceAnalysis || "",
    keyMoments: Array.isArray(g.keyMoments) ? g.keyMoments : [],
    source: "Claude AI",
  }));

  return { games: normalized };
}

// ---- helpers ----
function iso(d) { return new Date(d).toISOString().slice(0, 10); }
function sub(d, days) { const x = new Date(d); x.setUTCDate(x.getUTCDate() - days); return x; }
function toInt(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; }
function toFloat(v, def) { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n*10)/10 : def; }
