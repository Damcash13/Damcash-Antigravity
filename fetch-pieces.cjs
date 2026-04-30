const fs = require('fs');
const https = require('https');
const path = require('path');

const pieces = [
  'wP', 'wR', 'wN', 'wB', 'wQ', 'wK',
  'bP', 'bR', 'bN', 'bB', 'bQ', 'bK'
];

const dir = path.join(__dirname, 'public/pieces');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

pieces.forEach(p => {
  const file = path.join(dir, `${p.toLowerCase()}.svg`);
  const url = `https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett/${p}.svg`;
  
  https.get(url, (res) => {
    if (res.statusCode !== 200) {
      console.error(`Failed to fetch ${p}: ${res.statusCode}`);
      return;
    }
    const stream = fs.createWriteStream(file);
    res.pipe(stream);
    stream.on('finish', () => {
      stream.close();
      console.log(`Saved ${p} to ${file}`);
    });
  }).on('error', (err) => {
    console.error(`Error fetching ${p}: ${err.message}`);
  });
});
