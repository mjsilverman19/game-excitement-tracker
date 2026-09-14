import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHighlights } from '../api/highlights.js';

function video(id, headline, { duration = 60, source = `https://cdn.example.com/${id}.mp4` } = {}) {
  return {
    id,
    headline,
    duration,
    links: {
      web: { href: `https://www.espn.com/video/clip/_/id/${id}` },
      source: { href: source }
    }
  };
}

test('game highlight packages rank ahead of studio coverage', () => {
  const highlights = parseHighlights({
    videos: [
      video('coverage', "Orlovsky slams 'immature' Drake Maye in Patriots loss", { duration: 75 }),
      video('play', 'Maye finds his receiver for a fourth-quarter touchdown', { duration: 35 }),
      video('game', 'Seahawks vs. Patriots game highlights', { duration: 240 })
    ]
  });

  assert.deepEqual(highlights.map(clip => clip.id), ['game', 'play', 'coverage']);
});

test('highlight ordering stays stable when clips have the same priority', () => {
  const highlights = parseHighlights({
    videos: [
      video('first', 'Opening-drive touchdown', { duration: 30 }),
      video('second', 'Fourth-quarter interception', { duration: 30 })
    ]
  });

  assert.deepEqual(highlights.map(clip => clip.id), ['first', 'second']);
});

test('duplicate highlight media appears only once', () => {
  const source = 'https://cdn.example.com/shared.mp4';
  const highlights = parseHighlights({
    videos: [
      video('first', 'Game highlights', { source }),
      video('duplicate', 'Game highlights duplicate', { source }),
      video('different', 'Another clip')
    ]
  });

  assert.deepEqual(highlights.map(clip => clip.id), ['first', 'different']);
});
