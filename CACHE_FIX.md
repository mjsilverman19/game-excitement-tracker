# NBA Static Data Cache Fix

**Issue**: Only 1 of 9 games displaying despite valid JSON
**Root Cause**: Aggressive CDN caching serving stale data
**Status**: ✅ FIXED

## Problem Description

The frontend was displaying only 1 NBA game (Rockets v Nets) for December 31, 2025, even though the static JSON file `/public/data/nba/2025/2025-12-31.json` correctly contained all 9 games.

## Root Cause Analysis

### The Caching Issue

**Original `vercel.json` configuration:**
```json
{
  "key": "Cache-Control",
  "value": "public, max-age=31536000, immutable"
}
```

This set a **1-year cache** with the `immutable` directive, meaning:
1. Once a file is cached, browsers/CDN never revalidate it
2. The cached version persists for 365 days
3. Even when the file is regenerated on disk, the old cached version is served

### Timeline of Events

1. **Dec 31, 2025**: NBA static data generated with broken code (1 game)
2. **Jan 1, 2026**: API endpoints fixed, all data regenerated correctly (9 games)
3. **Problem**: Browsers/CDN continued serving the old 1-game version from cache
4. **Cache expiration**: Would have been Dec 31, 2026 (1 year later!)

### Frontend Investigation

The frontend code was working correctly:
- ✅ `fetchStaticData()` successfully loaded the JSON
- ✅ `loadGames()` correctly set `currentGames = staticData.games`
- ✅ `displayResults()` iterated through all games
- ❌ **But the JSON returned by the browser was the OLD cached version**

## The Fix

**Updated `vercel.json` to:**
```json
{
  "key": "Cache-Control",
  "value": "public, max-age=3600, must-revalidate"
}
```

Changes:
- **max-age=3600**: Cache for 1 hour (down from 1 year)
- **must-revalidate**: Force revalidation after expiration
- **Removed immutable**: Allow browsers to check for updates

### Why 1 Hour?

- **Performance**: Still provides caching benefits to reduce API load
- **Freshness**: Regenerated data propagates within 1 hour
- **Balance**: Reasonable compromise between performance and data freshness

## Manual Cache Clearing

For users who already have the stale cache, they can:

1. **Hard refresh**: Ctrl+Shift+R (Chrome/Firefox) or Cmd+Shift+R (Mac)
2. **Clear browser cache**: Settings → Clear browsing data → Cached images and files
3. **Incognito/Private mode**: Opens with fresh cache
4. **Wait 1 hour**: New cache policy will take effect

## Vercel CDN Purging

To immediately purge Vercel's CDN cache after deploying this fix:

```bash
# After deployment, purge specific files
vercel env pull
vercel --prod

# Or purge all cached files (requires Vercel CLI)
# This happens automatically on new deployments
```

## Prevention

### Best Practices Going Forward

1. **Shorter cache times for mutable data**: Use hours/days, not years
2. **Use `must-revalidate`**: Ensures freshness checks after expiration
3. **Avoid `immutable`**: Only use for truly immutable assets (hashed filenames)
4. **Monitor data quality**: Verify static files after regeneration
5. **Cache-busting**: Consider adding version query params for critical updates

### Alternative Solutions

If we need longer caching in the future, consider:

1. **Versioned paths**: `/data/v2/nba/2025/2025-12-31.json`
2. **Query parameters**: `/data/nba/2025/2025-12-31.json?v=20260101`
3. **Content hashing**: Include file hash in URL
4. **ETags**: Use entity tags for conditional requests

## Verification

After deployment, verify the fix:

```bash
# Check cache headers
curl -I https://your-domain.vercel.app/data/nba/2025/2025-12-31.json

# Should show:
# Cache-Control: public, max-age=3600, must-revalidate

# Verify JSON content
curl https://your-domain.vercel.app/data/nba/2025/2025-12-31.json | jq '.games | length'
# Should output: 9
```

## Related Files

- `vercel.json` - CDN caching configuration
- `index.html` - Frontend static data loading logic (lines 1009-1023, 1026-1048)
- `public/data/nba/2025/2025-12-31.json` - The correctly generated file with 9 games

## Lessons Learned

1. **Immutable caching is dangerous** for regenerated static files
2. **Always test cache behavior** when deploying static data systems
3. **Monitor CDN cache hits** to detect stale data issues
4. **Document cache policies** clearly in configuration files
