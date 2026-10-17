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
const NO_HAND_RESET_FRAMES = 10

// NEW: sample at a fixed 30 fps (same time scale as training), instead of
// once per screen refresh (60 fps or whatever the browser manages)
const SAMPLE_MS = 1000 / TARGET_FPS

// NEW: run MediaPipe on a smaller mirrored canvas (0.5 = half size).
// x/y are still scaled by the REAL video size below, so the features are
// identical to before. Set to 1 to go back to full size.
const DETECT_SCALE = 0.5

// NEW: logs the real sampling FPS to the browser console once per second
const DEBUG = true

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
    const [mx, my, mz] = rel[9]
    const scale = Math.sqrt(mx * mx + my * my + mz * mz) + 1e-8
    return rel.map(([x, y, z]) => [x / scale, y / scale, z / scale])
  }

  const leftOut = processHand(left)
  const rightOut = processHand(right)

  return new Float32Array([...leftOut.flat(), ...rightOut.flat()])
}

function computeVelocity(currentNorm, prevNorm, dt) {
  const expectedDt = 1.0 / TARGET_FPS
  const minDt = 1.0 / (TARGET_FPS * 2)
  const maxDt = 1.0 / (TARGET_FPS * 0.25)
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

// leftHand / rightHand are now simple true/false (they were full landmark
// arrays). Translate.jsx only used them as true/false for the green dots,
// so nothing else needs to change there.
export function useHandLandmarks(videoRef, isActive) {
  const [isReady, setIsReady] = useState(false)
  const [leftHand, setLeftHand] = useState(false)
  const [rightHand, setRightHand] = useState(false)
  const [bufferLength, setBufferLength] = useState(0)

  const landmarkerRef = useRef(null)
  const rafIdRef = useRef(null)
  const prevNormalizedRef = useRef(null)
  const prevTimestampRef = useRef(null)
  const bufferRef = useRef([])
  const noHandCountRef = useRef(0)
  const mirrorCanvasRef = useRef(null)
  const mirrorCtxRef = useRef(null)

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
      setLeftHand(false)
      setRightHand(false)
      setBufferLength(0)
      bufferRef.current = []
      noHandCountRef.current = 0
      prevNormalizedRef.current = null
      prevTimestampRef.current = null
      return
    }

    let stopped = false
    let lastSample = 0
    let lastTs = 0
    let fpsCount = 0
    let fpsMark = performance.now()

    function detectFrame() {
      if (stopped) return

      const video = videoRef.current
      const landmarker = landmarkerRef.current
      const now = performance.now()

      // Only process when the next 33 ms sample slot has arrived
      // (the -5 stops it from alternating between 33 ms and 50 ms)
      if (
        video &&
        landmarker &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        now - lastSample >= SAMPLE_MS - 5 &&
        now > lastTs
      ) {
        lastSample = now
        lastTs = now

        const vw = video.videoWidth
        const vh = video.videoHeight
        const cw = Math.round(vw * DETECT_SCALE)
        const ch = Math.round(vh * DETECT_SCALE)

        // Create the canvas once. Resizing it every frame was expensive.
        if (!mirrorCanvasRef.current) {
          mirrorCanvasRef.current = document.createElement('canvas')
          mirrorCtxRef.current = mirrorCanvasRef.current.getContext('2d')
        }
        const canvas = mirrorCanvasRef.current
        if (canvas.width !== cw || canvas.height !== ch) {
          canvas.width = cw
          canvas.height = ch
        }
        const ctx = mirrorCtxRef.current

        // Mirror the frame, same as cv2.flip(frame, 1) in training
        ctx.setTransform(-1, 0, 0, 1, cw, 0)
        ctx.drawImage(video, 0, 0, cw, ch)
        ctx.setTransform(1, 0, 0, 1, 0, 0)

        const result = landmarker.detectForVideo(canvas, now)

        // Debug dots only
        let hasLeft = false
        let hasRight = false
        const handed = result.handedness ?? result.handednesses ?? []
        result.landmarks.forEach((points, i) => {
          const label = handed[i]?.[0]?.categoryName
          if (label === 'Left') hasLeft = true
          if (label === 'Right') hasRight = true
        })
        setLeftHand(hasLeft)
        setRightHand(hasRight)

        // Model input: scaled by the REAL video size, same as before
        const raw = extractRawLandmarks(result.landmarks, vw, vh)
        const normalized = normalizeLandmarks(raw)

        let dt = null
        if (prevTimestampRef.current != null) {
          dt = (now - prevTimestampRef.current) / 1000
        }

        const velocity =
          prevNormalizedRef.current == null
            ? new Float32Array(VELOCITY_DIM)
            : computeVelocity(normalized, prevNormalizedRef.current, dt)

        const features = buildFeatureVector(normalized, velocity)

        prevNormalizedRef.current = normalized
        prevTimestampRef.current = now

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

        if (DEBUG) {
          fpsCount++
          if (now - fpsMark >= 1000) {
            console.log(`[sampling] ${fpsCount} fps (${vw}x${vh} camera)`)
            fpsCount = 0
            fpsMark = now
          }
        }
      }

      rafIdRef.current = requestAnimationFrame(detectFrame)
    }

    rafIdRef.current = requestAnimationFrame(detectFrame)

    return () => {
      stopped = true
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