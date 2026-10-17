import * as THREE from 'three'

let manifestCache = null
let manifestPromise = null

/**
 * Fetches and caches manifest.json once from /animations/manifest.json.
 *
 * @returns {Promise<object>}
 */
export async function fetchManifest() {
  if (manifestCache) return manifestCache
  if (manifestPromise) return manifestPromise

  manifestPromise = (async () => {
    try {
      const res = await fetch('/animations/manifest.json')
      if (!res.ok) {
        throw new Error(`Failed to load manifest: ${res.status} ${res.statusText}`)
      }
      manifestCache = await res.json()
      return manifestCache
    } catch (err) {
      console.warn('Could not load animation manifest.json:', err)
      manifestCache = { words: {} }
      return manifestCache
    } finally {
      manifestPromise = null
    }
  })()

  return manifestPromise
}

/**
 * Checks if a word exists in the manifest (case-insensitive).
 *
 * @param {string} wordId
 * @param {object} manifest
 * @returns {boolean}
 */
export function hasClip(wordId, manifest) {
  if (!wordId || !manifest?.words) return false
  const target = wordId.toLowerCase()
  return Object.keys(manifest.words).some((key) => key.toLowerCase() === target)
}

/**
 * Gets the manifest entry for a word (case-insensitive).
 *
 * @param {string} wordId
 * @param {object} manifest
 * @returns {object|null}
 */
export function getManifestEntry(wordId, manifest) {
  if (!wordId || !manifest?.words) return null
  const target = wordId.toLowerCase()
  const key = Object.keys(manifest.words).find((k) => k.toLowerCase() === target)
  return key ? manifest.words[key] : null
}

const clipCache = new Map()

/**
 * Loads a clip file on demand and converts it into a THREE.AnimationClip.
 * Handles GLTFLoader bone name sanitization by finding obj.userData.name === boneName.
 *
 * @param {string} wordId
 * @param {object} manifest
 * @param {THREE.Object3D|null} avatarRoot
 * @returns {Promise<THREE.AnimationClip|null>}
 */
export async function loadClip(wordId, manifest, avatarRoot) {
  if (!wordId) return null
  const normalizedKey = wordId.toLowerCase()

  if (clipCache.has(normalizedKey)) {
    return clipCache.get(normalizedKey)
  }

  const entry = getManifestEntry(wordId, manifest)
  if (!entry) {
    return null
  }

  const fileName = entry.file || `Sign_${normalizedKey}.json`
  const url = `/animations/${fileName}`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`Could not load animation file ${url}: ${res.status}`)
      return null
    }
    const clipData = await res.json()

    const fps = clipData.fps || 30
    const frames = clipData.frames || Math.round((clipData.duration || 1) * fps)
    const duration = clipData.duration || frames / fps

    const times = new Float32Array(frames)
    for (let i = 0; i < frames; i++) {
      times[i] = i / fps
    }

    const getSanitizedName = (name) => {
      if (THREE.PropertyBinding && typeof THREE.PropertyBinding.sanitizeNodeName === 'function') {
        return THREE.PropertyBinding.sanitizeNodeName(name)
      }
      return name.replace(/\./g, '')
    }

    // Map original Rigify bone name -> Three.js runtime node name
    // GLTFLoader removes dots/special characters, so find each bone by obj.userData.name === boneName
    const boneMap = new Map()
    if (avatarRoot) {
      avatarRoot.traverse((child) => {
        if (child.isBone) {
          if (child.userData?.name) {
            boneMap.set(child.userData.name, child.name)
          }
          boneMap.set(child.name, child.name)
          boneMap.set(child.name.replace(/\./g, ''), child.name)
          boneMap.set(child.name.replace(/_/g, '.'), child.name)
        }
      })
    }

    const tracks = []
    if (clipData.bones && typeof clipData.bones === 'object') {
      for (const [boneName, quatValues] of Object.entries(clipData.bones)) {
        // Find bone by obj.userData.name === boneName, fallback to sanitized name
        let targetNodeName = boneMap.get(boneName)
        if (!targetNodeName) {
          targetNodeName =
            boneMap.get(boneName.replace(/\./g, '')) ||
            boneMap.get(getSanitizedName(boneName)) ||
            getSanitizedName(boneName)
        }

        const track = new THREE.QuaternionKeyframeTrack(
          `${targetNodeName}.quaternion`,
          times,
          quatValues
        )
        tracks.push(track)
      }
    }

    const clipName = clipData.clip || entry.clip || `Sign_${normalizedKey}`
    const clip = new THREE.AnimationClip(clipName, duration, tracks)

    clipCache.set(normalizedKey, clip)
    return clip
  } catch (err) {
    console.error(`Error loading sign clip for word "${wordId}":`, err)
    return null
  }
}
