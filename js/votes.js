// Vote Management
function loadVotes() {
    try {
        const stored = localStorage.getItem('gameVotes');
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        console.error('Error loading votes:', e);
        return {};
    }
}

function saveVotes(votes) {
    try {
        localStorage.setItem('gameVotes', JSON.stringify(votes));
    } catch (e) {
        console.error('Error saving votes:', e);
    }
}

function updateVoteUI(gameId, voteType) {
    const upButton = document.querySelector(`.vote-btn.upvote[data-game-id="${gameId}"]`);
    const downButton = document.querySelector(`.vote-btn.downvote[data-game-id="${gameId}"]`);

    if (upButton && downButton) {
        // Update active class
        upButton.classList.toggle('active', voteType === 'up');
        downButton.classList.toggle('active', voteType === 'down');

        // Update arrow character (hollow when inactive, filled when active)
        upButton.textContent = voteType === 'up' ? '▲' : '△';
        downButton.textContent = voteType === 'down' ? '▼' : '▽';
    }
}

function handleVote(gameId, voteType) {
    const votes = loadVotes();
    const currentVote = votes[gameId];

    // Find the game object for Supabase payload
    const game = window.currentGames?.find(g => g.id === gameId);

    // Toggle off if clicking the same button
    if (currentVote === voteType) {
        delete votes[gameId];
        saveVotes(votes);
        updateVoteUI(gameId, null);
        // Delete from Supabase (fire and forget)
        deleteVoteFromSupabase(gameId);
    } else {
        // Switch to new vote or set initial vote
        votes[gameId] = voteType;
        saveVotes(votes);
        updateVoteUI(gameId, voteType);
        // Upsert to Supabase (fire and forget)
        upsertVoteToSupabase(gameId, voteType, game, window.selectedSport, window.selectedSeason, window.selectedWeek);
    }
}

function attachVoteListeners() {
    const votes = loadVotes();

    document.querySelectorAll('.vote-btn').forEach(button => {
        const gameId = button.dataset.gameId;
        const voteType = button.dataset.vote;

        // Set initial active state and arrow character
        if (votes[gameId] === voteType) {
            button.classList.add('active');
            button.textContent = voteType === 'up' ? '▲' : '▼';
        }

        // Add click handler
        button.addEventListener('click', (e) => {
            e.preventDefault();
            handleVote(gameId, voteType);
        });
    });
}
