import fs from 'fs';

const raw = fs.readFileSync('public/animations/Sign_sit.json', 'utf8');
const data = JSON.parse(raw);

console.log('Top keys:', Object.keys(data));
console.log('fps:', data.fps);
console.log('frames:', data.frames);
console.log('duration:', data.duration);
console.log('Bones count:', Object.keys(data.bones).length);
console.log('Bone names sample:', Object.keys(data.bones).slice(0, 10));

const sampleBone = Object.keys(data.bones)[0];
console.log('Sample bone:', sampleBone);
console.log('Sample bone values length:', data.bones[sampleBone].length);
console.log('frames * 4:', data.frames * 4);
