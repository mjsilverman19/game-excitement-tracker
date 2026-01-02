// Supabase client and vote storage
let supabaseClient = null;

// Wait for Supabase CDN to load, then initialize client
async function initSupabase() {
    // Wait for window.supabase to be available
    let attempts = 0;
    while (!window.supabase && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (!window.supabase) {
        console.error('Supabase CDN failed to load');
        return false;
    }

    try {
        supabaseClient = window.supabase.createClient(CONFIG.supabase.url, CONFIG.supabase.key);
        console.log('Supabase initialized successfully');
        return true;
    } catch (e) {
        console.error('Error initializing Supabase:', e);
        return false;
    }
}

// Get or create anonymous visitor ID
function getVisitorId() {
    let visitorId = localStorage.getItem('visitorId');
    if (!visitorId) {
        // Generate a simple UUID v4
        visitorId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
        localStorage.setItem('visitorId', visitorId);
    }
    return visitorId;
}

// Upsert vote to Supabase (fire and forget)
async function upsertVoteToSupabase(gameId, voteType, game, sport, season, week) {
    if (!supabaseClient) {
        console.warn('Supabase not initialized, skipping vote upsert');
        return;
    }

    try {
        const visitorId = getVisitorId();
        const payload = {
            visitor_id: visitorId,
            game_id: gameId,
            vote: voteType,
            algorithm_score: game?.excitement || null,
            algorithm_version: window.ALGORITHM_CONFIG?.version || null,
            sport: sport,
            season: season,
            week: week
        };

        const { error } = await supabaseClient
            .from('votes')
            .upsert(payload, { onConflict: 'visitor_id,game_id' });

        if (error) {
            console.error('Error upserting vote to Supabase:', error);
        }
    } catch (e) {
        console.error('Error upserting vote to Supabase:', e);
    }
}

// Delete vote from Supabase (fire and forget)
async function deleteVoteFromSupabase(gameId) {
    if (!supabaseClient) {
        console.warn('Supabase not initialized, skipping vote deletion');
        return;
    }

    try {
        const visitorId = getVisitorId();
        const { error } = await supabaseClient
            .from('votes')
            .delete()
            .eq('visitor_id', visitorId)
            .eq('game_id', gameId);

        if (error) {
            console.error('Error deleting vote from Supabase:', error);
        }
    } catch (e) {
        console.error('Error deleting vote from Supabase:', e);
    }
}
