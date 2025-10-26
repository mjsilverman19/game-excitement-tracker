import { config } from 'dotenv';
config();

// Import the functions we need to test
import { readFileSync } from 'fs';

// Test cases with known games
const testCases = [
  {
    name: "Chiefs vs Bills (2024 AFC Championship)",
    awayTeam: "Kansas City Chiefs",
    homeTeam: "Buffalo Bills",
    awayScore: 32,
    homeScore: 29
  },
  {
    name: "49ers vs Lions (2024 NFC Championship)",
    awayTeam: "San Francisco 49ers",
    homeTeam: "Detroit Lions",
    awayScore: 34,
    homeScore: 31
  },
  {
    name: "LA Teams test (Rams vs Chargers)",
    awayTeam: "Los Angeles Chargers",
    homeTeam: "Los Angeles Rams",
    awayScore: 20,
    homeScore: 17
  }
];

// Load and evaluate the youtube-highlights.js functions
const youtubeCode = readFileSync('../api/youtube-highlights.js', 'utf8');

async function testYouTubeAPI() {
  console.log('='.repeat(80));
  console.log('TESTING YOUTUBE API MATCHING FIXES');
  console.log('='.repeat(80));
  
  const API_KEY = process.env.YOUTUBE_API_KEY;
  
  if (!API_KEY) {
    console.log('❌ No YouTube API key found in .env file');
    console.log('   Add YOUTUBE_API_KEY=your_key_here to .env to test');
    return;
  }
  
  console.log('✅ YouTube API key found\n');
  
  // Test the first case
  const testCase = testCases[0];
  console.log(`Testing: ${testCase.name}`);
  console.log(`  Away: ${testCase.awayTeam} (${testCase.awayScore})`);
  console.log(`  Home: ${testCase.homeTeam} (${testCase.homeScore})`);
  console.log();
  
  // Test NFL channel search
  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - 14);
  
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?` +
    `part=snippet&channelId=UCDVYQ4Zhbm3S2dlz7P1GBDg&type=video&order=date&maxResults=50&` +
    `videoDuration=medium&publishedAfter=${recentDate.toISOString()}&key=${API_KEY}`;
  
  console.log('Searching NFL channel for recent videos...');
  
  try {
    const response = await fetch(searchUrl);
    
    if (!response.ok) {
      console.log(`❌ API request failed: ${response.status} ${response.statusText}`);
      return;
    }
    
    const data = await response.json();
    console.log(`✅ Found ${data.items?.length || 0} videos from NFL channel\n`);
    
    if (data.items && data.items.length > 0) {
      console.log('Sample of recent NFL videos:');
      console.log('-'.repeat(80));
      data.items.slice(0, 10).forEach((video, i) => {
        const title = video.snippet.title;
        const date = new Date(video.snippet.publishedAt);
        const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`${i + 1}. ${title}`);
        console.log(`   Channel: ${video.snippet.channelTitle} | ${daysAgo} days ago`);
      });
      console.log();
      
      // Test matching logic
      console.log('Testing matching logic for Chiefs vs Bills...');
      console.log('-'.repeat(80));
      
      const matchingVideos = data.items.filter(video => {
        const title = video.snippet.title.toLowerCase();
        const hasChiefs = title.includes('chiefs') || title.includes('kansas city');
        const hasBills = title.includes('bills') || title.includes('buffalo');
        const hasHighlights = title.includes('highlights');
        return hasChiefs && hasBills && hasHighlights;
      });
      
      if (matchingVideos.length > 0) {
        console.log(`✅ Found ${matchingVideos.length} potential match(es):\n`);
        matchingVideos.forEach((video, i) => {
          console.log(`${i + 1}. ${video.snippet.title}`);
          console.log(`   URL: https://www.youtube.com/watch?v=${video.id.videoId}`);
          console.log(`   Published: ${video.snippet.publishedAt}`);
          console.log();
        });
      } else {
        console.log('❌ No matching videos found in the sample');
      }
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

testYouTubeAPI();