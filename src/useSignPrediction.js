import { useEffect, useRef, useState } from 'react'
import * as tf from '@tensorflow/tfjs'

// ─────────────────────────────────────────────────────────────────────────
// Custom layer registration (unchanged from your working version)
// ─────────────────────────────────────────────────────────────────────────
class TemporalSum extends tf.layers.Layer {
  static className = 'Lambda'

  computeOutputShape(inputShape) {
    return [inputShape[0], inputShape[2]]
  }

  call(inputs) {
    return tf.tidy(() => {
      const input = Array.isArray(inputs) ? inputs[0] : inputs
      return input.sum(1)
    })
  }

  getConfig() {
    return super.getConfig()
  }
}

try {
  tf.serialization.registerClass(TemporalSum)
} catch (err) {
  // Already registered (Vite hot-reload)
}

class TimeSoftmax extends tf.layers.Layer {
  static className = 'TimeSoftmax'

  constructor(config) {
    super(config)
    this.axis = config.axis !== undefined ? config.axis : -1
  }

  computeOutputShape(inputShape) {
    return inputShape
  }

  call(inputs) {
    return tf.tidy(() => {
      const input = Array.isArray(inputs) ? inputs[0] : inputs
      let axis = this.axis
      if (axis < 0) axis = input.rank + axis

      const maxVal = input.max(axis, true)
      const shifted = input.sub(maxVal)
      const expVal = shifted.exp()
      const sumVal = expVal.sum(axis, true)
      return expVal.div(sumVal)
    })
  }

  getConfig() {
    const config = super.getConfig()
    config['axis'] = this.axis
    return config
  }
}

try {
  tf.serialization.registerClass(TimeSoftmax)
} catch (err) {
  // Already registered (Vite hot-reload)
}

const MODEL_URL = '/model/model.json'
const LABELS_URL = '/model/labels.json'

// ── Settings you can tune ────────────────────────────────────────────────
// Wait this long AFTER a prediction finishes before starting the next one
const PREDICT_GAP_MS = 30
// A guess must be at least this confident to count
const CONFIDENCE_THRESHOLD = 0.85
// The same word must win this many times in a row before it is shown.
// Higher = fewer random words between signs, but a slightly slower result.
const CONFIRM_COUNT = 3
// Logs how long one prediction takes, once every 10 predictions
const DEBUG = true

export function useSignPrediction(getFeatureBuffer, isBufferFull, isActive) {
  const [isModelReady, setIsModelReady] = useState(false)
  const [predictedWord, setPredictedWord] = useState(null)
  const [confidence, setConfidence] = useState(0)
  const [confirmedWord, setConfirmedWord] = useState(null)

  const modelRef = useRef(null)
  const labelsRef = useRef(null)
  const stableWordRef = useRef(null)
  const stableCountRef = useRef(0)
  const lastConfirmedRef = useRef(null)

  // Load model + labels once.
  useEffect(() => {
    let cancelled = false

    async function load() {
      await tf.ready()

      const [model, labelsResponse] = await Promise.all([
        tf.loadLayersModel(MODEL_URL),
        fetch(LABELS_URL).then((res) => res.json()),
      ])

      if (cancelled) {
        model.dispose()
        return
      }

      // Warm-up: the very first prediction is always slow (WebGL compiles
      // its shaders), so we do it now, before the user signs.
      tf.tidy(() => {
        const warm = model.predict(tf.zeros([1, 30, 252]))
        warm.dataSync()
      })

      modelRef.current = model
      labelsRef.current = labelsResponse
      setIsModelReady(true)
    }

    load().catch((err) => {
      console.error('Failed to load sign-language model:', err)
    })

    return () => {
      cancelled = true
      if (modelRef.current) {
        modelRef.current.dispose()
        modelRef.current = null
      }
    }
  }, [])

  // Prediction loop while active and the buffer is full.
  useEffect(() => {
    if (!isActive || !isModelReady || !isBufferFull) {
      setPredictedWord(null)
      setConfidence(0)
      stableWordRef.current = null
      stableCountRef.current = 0
      lastConfirmedRef.current = null
      return
    }

    let cancelled = false
    let timer = null
    let count = 0

    async function runPrediction() {
      const model = modelRef.current
      const labels = labelsRef.current
      const buffer = getFeatureBuffer()

      if (!model || !labels || buffer.length !== 30) return

      const t0 = performance.now()

      const flat = new Float32Array(30 * 252)
      buffer.forEach((frame, i) => flat.set(frame, i * 252))

      const inputTensor = tf.tensor3d(flat, [1, 30, 252])
      const output = model.predict(inputTensor)
      // .data() is async, so the page keeps drawing the camera while
      // the model works (dataSync() froze the whole page)
      const probabilities = await output.data()
      inputTensor.dispose()
      output.dispose()

      if (cancelled) return

      if (DEBUG && ++count % 10 === 0) {
        console.log(`[predict] ${(performance.now() - t0).toFixed(0)} ms per prediction`)
      }

      let bestIdx = 0
      let bestScore = probabilities[0]
      for (let i = 1; i < probabilities.length; i++) {
        if (probabilities[i] > bestScore) {
          bestScore = probabilities[i]
          bestIdx = i
        }
      }

      setConfidence(bestScore)

      if (bestScore >= CONFIDENCE_THRESHOLD) {
        const word = labels[bestIdx]

        if (word === stableWordRef.current) {
          stableCountRef.current += 1
        } else {
          stableWordRef.current = word
          stableCountRef.current = 1
        }

        // Only show and confirm a word once it has held steady
        if (stableCountRef.current >= CONFIRM_COUNT) {
          setPredictedWord(word)

          // Add to the sentence once, and not again until the hand
          // leaves or a different word is confirmed
          if (word !== lastConfirmedRef.current) {
            lastConfirmedRef.current = word
            setConfirmedWord({ word, id: Date.now() })
          }
        }
      } else {
        stableWordRef.current = null
        stableCountRef.current = 0
      }
    }

    async function loop() {
      if (cancelled) return
      try {
        await runPrediction()
      } catch (err) {
        console.error('Prediction failed:', err)
      }
      if (!cancelled) timer = setTimeout(loop, PREDICT_GAP_MS)
    }

    loop()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [isActive, isModelReady, isBufferFull, getFeatureBuffer])

  return { predictedWord, confidence, isModelReady, confirmedWord }
}