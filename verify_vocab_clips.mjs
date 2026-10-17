import fs from 'fs';

const buf = fs.readFileSync('public/models/joe.glb');
const jsonLength = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.slice(20, 20 + jsonLength).toString('utf8'));
const animNames = new Set(gltf.animations.map(a => a.name.toLowerCase()));

const vocab = JSON.parse(fs.readFileSync('public/data/vocabulary.json', 'utf8'));

console.log('Total words in vocabulary.json:', vocab.words.length);

let matchedCount = 0;
let missing = [];

for (const word of vocab.words) {
  const clipName = `sign_${word.id.toLowerCase()}`;
  if (animNames.has(clipName)) {
    matchedCount++;
  } else {
    missing.push({ id: word.id, expected: clipName });
  }
}

console.log(`Matched ${matchedCount} / ${vocab.words.length} clips.`);
if (missing.length > 0) {
  console.log('Missing:', missing);
} else {
  console.log('All 45 vocabulary words have exact matching animation clips in joe.glb!');
}
