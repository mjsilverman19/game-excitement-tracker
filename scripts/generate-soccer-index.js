import { readdir, writeFile } from 'fs/promises';
import { join } from 'path';

const PUBLIC_DATA_DIR = './public/data';
const LEAGUES = ['epl', 'champions_league', 'la_liga', 'bundesliga', 'serie_a', 'mls'];

async function generateLeagueIndex(league) {
    const leagueDir = join(PUBLIC_DATA_DIR, 'soccer', league);

    // Find all season directories
    const seasons = await readdir(leagueDir);

    const allDates = [];

    for (const season of seasons) {
        if (season === 'index.json') continue;

        const seasonDir = join(leagueDir, season);
        const files = await readdir(seasonDir);

        // Extract dates from filenames (e.g., "2025-12-26.json" -> "2025-12-26")
        const dates = files
            .filter(f => f.endsWith('.json') && f !== 'index.json')
            .map(f => f.replace('.json', ''))
            .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));  // Validate date format

        allDates.push(...dates);
    }

    // Sort dates descending (most recent first)
    allDates.sort((a, b) => b.localeCompare(a));

    const indexData = {
        league: league.toUpperCase(),
        updatedAt: new Date().toISOString(),
        availableDates: allDates
    };

    const indexPath = join(leagueDir, 'index.json');
    await writeFile(indexPath, JSON.stringify(indexData, null, 2));

    console.log(`✅ Generated ${indexPath} with ${allDates.length} dates`);
}

async function generateAllIndexes() {
    for (const league of LEAGUES) {
        try {
            await generateLeagueIndex(league);
        } catch (e) {
            console.log(`⚠️ Skipping ${league}: ${e.message}`);
        }
    }
}

generateAllIndexes();
