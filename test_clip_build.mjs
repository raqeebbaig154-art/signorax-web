import fs from 'fs';
import * as THREE from 'three';

const raw = fs.readFileSync('public/animations/Sign_sit.json', 'utf8');
const clipData = JSON.parse(raw);

const fps = clipData.fps || 30;
const frames = clipData.frames || (clipData.duration * fps);
const duration = clipData.duration || (frames / fps);

const times = new Float32Array(frames);
for (let i = 0; i < frames; i++) {
  times[i] = i / fps;
}

const tracks = [];
for (const [boneName, quatValues] of Object.entries(clipData.bones)) {
  const track = new THREE.QuaternionKeyframeTrack(
    boneName + '.quaternion',
    times,
    quatValues
  );
  tracks.push(track);
}

const clip = new THREE.AnimationClip(clipData.clip || 'Sign_sit', duration, tracks);
console.log('Created clip:', clip.name, 'duration:', clip.duration, 'tracks count:', clip.tracks.length);
console.log('Sample track name:', clip.tracks[0].name);
