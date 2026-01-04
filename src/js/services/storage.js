export function loadVotes() {
  try {
    const stored = localStorage.getItem('gameVotes');
    return stored ? JSON.parse(stored) : {};
  } catch (e) {
    console.error('Error loading votes:', e);
    return {};
  }
}

export function saveVotes(votes) {
  try {
    localStorage.setItem('gameVotes', JSON.stringify(votes));
  } catch (e) {
    console.error('Error saving votes:', e);
  }
}
