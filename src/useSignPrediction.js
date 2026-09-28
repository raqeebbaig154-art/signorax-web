import { useEffect, useRef, useState } from 'react'
import * as tf from '@tensorflow/tfjs'

// ─────────────────────────────────────────────────────────────────────────
// Custom layer registration
// ─────────────────────────────────────────────────────────────────────────
// The model's attention_block() uses a Keras Lambda layer:
//   layers.Lambda(lambda t: tf.reduce_sum(t, axis=1))(context)
// TF.js can't deserialize arbitrary Python Lambda functions automatically
// (that's what "Unknown layer: Lambda" means), so we register a JS class
// that performs the exact same operation, summing across the time axis
// (axis 1) to collapse (batch, 30, units) into (batch, units), and tell
// TF.js to use it for every layer whose saved class_name is "Lambda".
// There is only one Lambda layer in this model, so this is safe.
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
  // Already registered, happens harmlessly during Vite hot-reload
  // when this module gets re-evaluated without a full page refresh.
}

// ─────────────────────────────────────────────────────────────────────────
// The model's attention_block() also uses layers.Softmax(axis=1) to
// normalize attention scores across the 30 timesteps, but TF.js's built-in
// Softmax layer only supports softmax along the LAST axis and throws
// ("Softmax along a non-last dimension is not yet supported") on this
// (batch, 30, 1) tensor. Rather than fight over which "Softmax" wins
// registration, model.json's class_name for this one layer was renamed to
// "TimeSoftmax" (see setup instructions) so it's guaranteed to route here.
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
  // Already registered, harmless during hot-reload
}

const MODEL_URL = '/model/model.json'
const LABELS_URL = '/model/labels.json'
const PREDICT_INTERVAL_MS = 300   // how often to run inference once the buffer is full
const CONFIDENCE_THRESHOLD = 0.6  // below this, treat as "not confident enough" rather than showing a wrong word

// Usage:
//   const { predictedWord, confidence, isModelReady, confirmedWord } =
//     useSignPrediction(getFeatureBuffer, isBufferFull, isActive)
//
// getFeatureBuffer : the function returned by useHandLandmarks, call it to
//                    get the current (30, 252) buffer as an array of frames
// isBufferFull     : from useHandLandmarks
// isActive         : true while in signToText mode
// confirmedWord    : { word, id } fired once a word has held steady for
//                    2 consecutive prediction cycles. The id is a fresh
//                    timestamp every time, so consumers can reliably
//                    react to it even if the same word is confirmed twice
//                    in a row (React skips re-renders on identical state,
//                    so a plain repeated string would be silently missed).

export function useSignPrediction(getFeatureBuffer, isBufferFull, isActive) {
  const [isModelReady, setIsModelReady] = useState(false)
  const [predictedWord, setPredictedWord] = useState(null)
  const [confidence, setConfidence] = useState(0)
  const [confirmedWord, setConfirmedWord] = useState(null)

  const modelRef = useRef(null)
  const labelsRef = useRef(null)
  const intervalRef = useRef(null)
  const stableWordRef = useRef(null)
  const stableCountRef = useRef(0)

  // Load model + labels once.
  useEffect(() => {
    let cancelled = false

    async function load() {
      const [model, labelsResponse] = await Promise.all([
        tf.loadLayersModel(MODEL_URL),
        fetch(LABELS_URL).then((res) => res.json()),
      ])

      if (cancelled) return

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

  // Run throttled prediction while active and the buffer is full.
  useEffect(() => {
    if (!isActive || !isModelReady || !isBufferFull) {
      setPredictedWord(null)
      setConfidence(0)
      return
    }

    function runPrediction() {
      const model = modelRef.current
      const labels = labelsRef.current
      const buffer = getFeatureBuffer() // array of 30 Float32Array(252)

      if (!model || !labels || buffer.length !== 30) return

      tf.tidy(() => {
        // Shape (1, 30, 252), batch of 1, 30 timesteps, 252 features
        const flat = new Float32Array(30 * 252)
        buffer.forEach((frame, i) => flat.set(frame, i * 252))

        const inputTensor = tf.tensor3d(flat, [1, 30, 252])
        const output = model.predict(inputTensor)
        const probabilities = output.dataSync()

        let bestIdx = 0
        let bestScore = probabilities[0]
        for (let i = 1; i < probabilities.length; i++) {
          if (probabilities[i] > bestScore) {
            bestScore = probabilities[i]
            bestIdx = i
          }
        }

        if (bestScore >= CONFIDENCE_THRESHOLD) {
          const word = labels[bestIdx]
          setPredictedWord(word)
          setConfidence(bestScore)

          if (word === stableWordRef.current) {
            stableCountRef.current += 1
          } else {
            stableWordRef.current = word
            stableCountRef.current = 1
          }

          if (stableCountRef.current === 2) {
            setConfirmedWord({ word, id: Date.now() })
          }
        } else {
          setPredictedWord(null)
          setConfidence(bestScore)
          stableWordRef.current = null
          stableCountRef.current = 0
        }
      })
    }

    runPrediction() // run immediately once the buffer first fills
    intervalRef.current = setInterval(runPrediction, PREDICT_INTERVAL_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isActive, isModelReady, isBufferFull, getFeatureBuffer])

  return { predictedWord, confidence, isModelReady, confirmedWord }
}