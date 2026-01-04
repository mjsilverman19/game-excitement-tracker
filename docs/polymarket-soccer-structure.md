# Polymarket Soccer API Structure

## API Overview

Polymarket provides a hosted service called **Gamma** that indexes market data through a free REST API. No authentication or API key is required for read operations.

**Base URLs:**
- Events/Sports: `https://gamma-api.polymarket.com`
- Price History: `https://clob.polymarket.com`

## Available Endpoints

### 1. Sports Metadata
```
GET https://gamma-api.polymarket.com/sports
```

Returns comprehensive metadata for sports including tag IDs, images, resolution sources, and series information.

**Response Structure:**
```json
[
  {
    "id": "soccer",
    "label": "Soccer",
    "series": [
      {
        "id": "epl",
        "name": "English Premier League"
      },
      {
        "id": "champions-league",
        "name": "UEFA Champions League"
      }
    ]
  }
]
```

### 2. Events Endpoint
```
GET https://gamma-api.polymarket.com/events
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Number of results (default: 100) |
| `offset` | integer | Pagination offset |
| `active` | boolean | Filter for active markets |
| `closed` | boolean | Filter for closed markets |
| `tag` | string | Filter by sport/category tag |
| `series_id` | string | Filter by league/series |

**Example Request:**
```bash
curl "https://gamma-api.polymarket.com/events?tag=soccer&closed=true&limit=10"
```

**Response Structure:**
```json
[
  {
    "id": "event-123",
    "slug": "liverpool-vs-manchester-city-epl-2025",
    "title": "Liverpool vs Manchester City - EPL",
    "active": false,
    "closed": true,
    "category": "Sports",
    "subcategory": "Soccer",
    "startDate": "2025-03-15T15:00:00Z",
    "endDate": "2025-03-15T17:00:00Z",
    "markets": [
      {
        "id": "market-456",
        "question": "Will Liverpool win?",
        "clobTokenIds": ["0xtoken_yes", "0xtoken_no"],
        "outcomes": "[\"Yes\", \"No\"]",
        "outcomePrices": "[\"0.65\", \"0.35\"]"
      },
      {
        "id": "market-457",
        "question": "Will Manchester City win?",
        "clobTokenIds": ["0xtoken_yes", "0xtoken_no"],
        "outcomes": "[\"Yes\", \"No\"]",
        "outcomePrices": "[\"0.30\", \"0.70\"]"
      }
    ]
  }
]
```

### 3. Price History Endpoint
```
GET https://clob.polymarket.com/prices-history
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `market` | string | Token ID from market (clobTokenIds) |
| `interval` | string | Time interval: `max`, `1h`, `1d`, etc. |
| `fidelity` | integer | Number of data points (optional) |

**Example Request:**
```bash
curl "https://clob.polymarket.com/prices-history?market=0xtoken_yes&interval=max"
```

**Response Structure:**
```json
{
  "history": [
    {
      "t": 1710504000,
      "p": 0.50
    },
    {
      "t": 1710504300,
      "p": 0.52
    },
    {
      "t": 1710504600,
      "p": 0.55
    }
  ]
}
```

Where:
- `t` = Unix timestamp (seconds)
- `p` = Price (0 to 1, representing probability)

## Soccer Market Structure

### Binary Markets per Team

Polymarket uses **separate binary (Yes/No) markets** for each outcome:
- Market 1: "Will [Home Team] win?" → Yes = homeWin, No = not homeWin
- Market 2: "Will [Away Team] win?" → Yes = awayWin, No = not awayWin

**There is typically NO explicit draw market** in soccer. The draw probability is inferred.

### Probability Normalization

Since markets are separate, we must:
1. Get the "Yes" price for home team's market = `homeWinPrice`
2. Get the "Yes" price for away team's market = `awayWinPrice`
3. Infer draw: `drawPrice = max(0, 1 - homeWinPrice - awayWinPrice)`

**Note:** Prices should roughly sum to ~1.0 across all outcomes, but may deviate slightly due to market inefficiencies or vig.

### Two-Way Normalization (for Entertainment Algorithm)

Our entertainment algorithm expects two-way probabilities (no draws). We collapse the draw evenly:

```javascript
function normalizeToTwoWay(homeWinPrice, awayWinPrice) {
  const drawProb = Math.max(0, 1 - homeWinPrice - awayWinPrice);
  return {
    homeWinPercentage: homeWinPrice + (drawProb / 2),
    awayWinPercentage: awayWinPrice + (drawProb / 2)
  };
}
```

## League Coverage

Based on Polymarket's sports offerings (as of 2026):

| League | Tag/Series ID | Coverage |
|--------|---------------|----------|
| English Premier League (EPL) | `epl` | High |
| UEFA Champions League | `champions-league` | High |
| La Liga | `la-liga` | Medium |
| Bundesliga | `bundesliga` | Medium |
| Serie A | `serie-a` | Medium |
| MLS | `mls` | Limited |

**Note:** Actual tag IDs should be discovered via the `/sports` endpoint as they may vary.

## Team Name Conventions

Polymarket may use different naming conventions than ESPN:
- "Man United" vs "Manchester United"
- "Man City" vs "Manchester City"
- "Spurs" vs "Tottenham Hotspur"

**Fuzzy matching recommended** when correlating events.

## Data Characteristics

### Price History Resolution

- **Update Frequency:** Per-trade (not fixed intervals)
- **Typical Data Points:**
  - High-profile match: 500-2000+ points during 90 minutes
  - Low-profile match: 50-200 points
- **Pre-match Data:** Hours to days before kickoff
- **Live Updates:** Real-time during match

### Coverage Gaps

**Limitations:**
1. Not all leagues/matches have markets
2. Lower-tier matches may have insufficient liquidity
3. Some matches may have incomplete price history
4. Historical depth varies (newer platform)

## Implementation Notes

### Market Identification

To fetch a specific match:
1. Query `/events` with date range and soccer tag
2. Parse event titles to match teams (fuzzy matching)
3. Extract `clobTokenIds` for home and away win markets
4. Fetch price history for both token IDs

### Time Alignment

Price histories for home/away markets may have different timestamps:
- **Solution:** Interpolate to align timestamps
- **Frequency:** Use 1-minute intervals for consistency
- **Filter:** Only include data during match duration (kickoff to final whistle)

### Match Duration Estimation

Soccer matches typically:
- 90 minutes regulation
- +5-10 minutes stoppage time
- 30 minutes extra time (knockout matches)

**Heuristic:** Use price history timestamps to infer actual match duration.

## Example Workflow

1. **Find Match:**
   ```javascript
   const events = await fetch(
     'https://gamma-api.polymarket.com/events?tag=soccer&closed=true&limit=50'
   ).then(r => r.json());

   const match = events.find(e =>
     e.title.includes('Liverpool') && e.title.includes('Manchester City')
   );
   ```

2. **Extract Markets:**
   ```javascript
   const homeMarket = match.markets.find(m =>
     m.question.includes('Liverpool win')
   );
   const awayMarket = match.markets.find(m =>
     m.question.includes('Manchester City win')
   );

   const homeTokenId = homeMarket.clobTokenIds[0]; // Yes token
   const awayTokenId = awayMarket.clobTokenIds[0]; // Yes token
   ```

3. **Fetch Price Histories:**
   ```javascript
   const homeHistory = await fetch(
     `https://clob.polymarket.com/prices-history?market=${homeTokenId}&interval=max`
   ).then(r => r.json());

   const awayHistory = await fetch(
     `https://clob.polymarket.com/prices-history?market=${awayTokenId}&interval=max`
   ).then(r => r.json());
   ```

4. **Normalize & Format:**
   ```javascript
   const timeseries = alignAndNormalize(
     homeHistory.history,
     awayHistory.history,
     match.startDate,
     match.endDate
   );
   ```

## Sources

- [Polymarket Documentation](https://docs.polymarket.com/)
- [How to Fetch Markets Guide](https://docs.polymarket.com/developers/gamma-markets-api/fetch-markets-guide)
- [Polymarket API Analysis](https://apidog.com/blog/polymarket-api/)
- [GitHub - Polymarket Agents](https://github.com/Polymarket/agents)
