import { useEffect, useRef, useState, useCallback } from 'react'
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

// ─────────────────────────────────────────────────────────────────────────
// Constants — must match sign_utils.py exactly
// ─────────────────────────────────────────────────────────────────────────
const SEQ_LEN = 30
const RAW_COORDS = 126
const VELOCITY_DIM = 126
const TARGET_FPS = 30.0
const VELOCITY_AMP = 5.0
const NO_HAND_RESET_FRAMES = 8

// ─────────────────────────────────────────────────────────────────────────
// Step 1: raw landmark extraction — SLOT ORDER, not handedness.
// This mirrors sign_utils.py's extract_raw_landmarks(), which assigns
// whichever hand MediaPipe detects first to slot 0 ("left" position in
// the array) and the second detected hand to slot 1 ("right" position),
// with no regard for which hand it actually is. Training data was built
// this way, so inference must replicate it exactly, quirk and all.
// ─────────────────────────────────────────────────────────────────────────
function extractRawLandmarks(landmarksArray, frameWidth, frameHeight) {
  const raw = new Float32Array(RAW_COORDS) // zero-filled

  landmarksArray.slice(0, 2).forEach((points, idx) => {
    const offset = idx * 63
    points.forEach((lm, li) => {
      raw[offset + li * 3 + 0] = lm.x * frameWidth
      raw[offset + li * 3 + 1] = lm.y * frameHeight
      raw[offset + li * 3 + 2] = lm.z
    })
  })

  return raw
}

// ─────────────────────────────────────────────────────────────────────────
// Step 2: normalize — wrist-relative, scaled by wrist-to-middle-MCP(9)
// distance. Matches normalize_landmarks() in sign_utils.py.
// ─────────────────────────────────────────────────────────────────────────
function normalizeLandmarks(raw126) {
  const coords = []
  for (let i = 0; i < 42; i++) {
    coords.push([raw126[i * 3], raw126[i * 3 + 1], raw126[i * 3 + 2]])
  }

  const left = coords.slice(0, 21)
  const right = coords.slice(21, 42)

  function processHand(hand) {
    const wrist = hand[0]
    const rel = hand.map(([x, y, z]) => [x - wrist[0], y - wrist[1], z - wrist[2]])
    const [mx, my, mz] = rel[9] // middle finger MCP, landmark 9
    const scale = Math.sqrt(mx * mx + my * my + mz * mz) + 1e-8
    return rel.map(([x, y, z]) => [x / scale, y / scale, z / scale])
  }

  const leftOut = processHand(left)
  const rightOut = processHand(right)

  return new Float32Array([...leftOut.flat(), ...rightOut.flat()])
}

// ─────────────────────────────────────────────────────────────────────────
// Step 3: velocity — dt-normalized, clipped, amplified. Matches
// compute_velocity() in sign_utils.py, including the dt clamp range and
// the 5.0 amplification factor.
// ─────────────────────────────────────────────────────────────────────────
function computeVelocity(currentNorm, prevNorm, dt) {
  const expectedDt = 1.0 / TARGET_FPS
  const minDt = 1.0 / (TARGET_FPS * 2)      // fastest allowed (1/60s)
  const maxDt = 1.0 / (TARGET_FPS * 0.25)   // slowest allowed (1/7.5s)
  const clampedDt = Math.min(Math.max(dt ?? expectedDt, minDt), maxDt)

  const scale = (expectedDt / clampedDt) * VELOCITY_AMP
  const velocity = new Float32Array(VELOCITY_DIM)

  for (let i = 0; i < VELOCITY_DIM; i++) {
    let v = (currentNorm[i] - prevNorm[i]) * scale
    if (v > 3.0) v = 3.0
    if (v < -3.0) v = -3.0
    velocity[i] = v
  }

  return velocity
}

// ─────────────────────────────────────────────────────────────────────────
// Step 4: combine into the 252-dim feature vector
// ─────────────────────────────────────────────────────────────────────────
function buildFeatureVector(normalized, velocity) {
  const features = new Float32Array(252)
  features.set(normalized, 0)
  features.set(velocity, 126)
  return features
}

function handPresent(normalized) {
  for (let i = 0; i < normalized.length; i++) {
    if (Math.abs(normalized[i]) > 1e-6) return true
  }
  return false
}

// ─────────────────────────────────────────────────────────────────────────
// The hook
// ─────────────────────────────────────────────────────────────────────────
// Returns:
//   isReady        : model loaded and ready
//   leftHand       : landmarks classified as the actual left hand — for
//                    the debug indicator ONLY, not used for model input
//   rightHand      : same, for the actual right hand
//   bufferLength   : how many frames are currently in the rolling window (0-30)
//   isBufferFull   : true once 30 frames have been collected
//   getFeatureBuffer(): returns the current buffer as an array of 30
//                    Float32Array(252) frames (oldest first), ready to be
//                    stacked into a (30, 252) tensor for Stage 5
export function useHandLandmarks(videoRef, isActive) {
  const [isReady, setIsReady] = useState(false)
  const [leftHand, setLeftHand] = useState(null)
  const [rightHand, setRightHand] = useState(null)
  const [bufferLength, setBufferLength] = useState(0)

  const landmarkerRef = useRef(null)
  const rafIdRef = useRef(null)
  const prevNormalizedRef = useRef(null)
  const prevTimestampRef = useRef(null)
  const bufferRef = useRef([]) // array of Float32Array(252), oldest first
  const noHandCountRef = useRef(0)
  const mirrorCanvasRef = useRef(null) // offscreen canvas used to flip frames before detection

  useEffect(() => {
    let cancelled = false

    async function load() {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      )

      const landmarker = await HandLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
      })

      if (cancelled) {
        landmarker.close()
        return
      }

      landmarkerRef.current = landmarker
      setIsReady(true)
    }

    load().catch((err) => {
      console.error('Failed to load HandLandmarker:', err)
    })

    return () => {
      cancelled = true
      if (landmarkerRef.current) {
        landmarkerRef.current.close()
        landmarkerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!isActive || !isReady) {
      setLeftHand(null)
      setRightHand(null)
      setBufferLength(0)
      bufferRef.current = []
      noHandCountRef.current = 0
      prevNormalizedRef.current = null
      prevTimestampRef.current = null
      return
    }

    function detectFrame() {
      const video = videoRef.current
      const landmarker = landmarkerRef.current

      if (video && landmarker && video.readyState >= 2 && video.videoWidth > 0) {
        const now = performance.now()

        // Training data was captured with cv2.flip(frame, 1) applied
        // BEFORE MediaPipe ever saw it (see collect_data.py) — every
        // sample is a mirrored view. The raw <video> element here is
        // NOT mirrored (only the on-screen CSS display is), so we flip
        // it onto an offscreen canvas first to match training exactly.
        if (!mirrorCanvasRef.current) {
          mirrorCanvasRef.current = document.createElement('canvas')
        }
        const canvas = mirrorCanvasRef.current
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        ctx.save()
        ctx.scale(-1, 1)
        ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height)
        ctx.restore()

        const result = landmarker.detectForVideo(canvas, now)

        // For the debug display only — true handedness classification
        let debugLeft = null
        let debugRight = null
        result.landmarks.forEach((points, i) => {
          const label = result.handedness[i]?.[0]?.categoryName
          if (label === 'Left') debugLeft = points
          if (label === 'Right') debugRight = points
        })
        setLeftHand(debugLeft)
        setRightHand(debugRight)

        // For the model — detection-order slots, matching sign_utils.py
        const raw = extractRawLandmarks(result.landmarks, canvas.width, canvas.height)
        const normalized = normalizeLandmarks(raw)

        let dt = null
        if (prevTimestampRef.current != null) {
          dt = (now - prevTimestampRef.current) / 1000
        }

        const velocity =
          prevNormalizedRef.current == null
            ? new Float32Array(VELOCITY_DIM) // zeros for the first frame
            : computeVelocity(normalized, prevNormalizedRef.current, dt)

        const features = buildFeatureVector(normalized, velocity)

        prevNormalizedRef.current = normalized
        prevTimestampRef.current = now

        // Only buffer frames where at least one hand is present, so a
        // sign doesn't get diluted with empty frames while the hand is
        // still moving into position. If the hand disappears for a
        // short stretch (a natural pause between signs), wipe the
        // buffer so the next sign starts from a clean window instead
        // of a stale mix of the previous sign's frames.
        if (handPresent(normalized)) {
          noHandCountRef.current = 0
          const buf = bufferRef.current
          buf.push(features)
          if (buf.length > SEQ_LEN) buf.shift()
          setBufferLength(buf.length)
        } else {
          noHandCountRef.current += 1
          if (noHandCountRef.current >= NO_HAND_RESET_FRAMES && bufferRef.current.length > 0) {
            bufferRef.current = []
            setBufferLength(0)
          }
        }
      }

      rafIdRef.current = requestAnimationFrame(detectFrame)
    }

    rafIdRef.current = requestAnimationFrame(detectFrame)

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
    }
  }, [isActive, isReady, videoRef])

  const getFeatureBuffer = useCallback(() => {
    return bufferRef.current.slice()
  }, [])

  return {
    isReady,
    leftHand,
    rightHand,
    bufferLength,
    isBufferFull: bufferLength >= SEQ_LEN,
    getFeatureBuffer,
  }
}