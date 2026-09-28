import { useState, useRef, useEffect } from 'react'
import './Translate.css'
import { useHandLandmarks } from '../useHandLandmarks'
import { useSignPrediction } from '../useSignPrediction'
import { wordPhrases } from '../wordPhrases'

function Translate() {
  const [mode, setMode] = useState(null)
  const videoRef = useRef(null)
  const [cameraError, setCameraError] = useState(null)
  const [sentenceText, setSentenceText] = useState('')

  const { leftHand, rightHand, isReady, bufferLength, isBufferFull, getFeatureBuffer } =
    useHandLandmarks(videoRef, mode === 'signToText')
  const { predictedWord, confidence, isModelReady, confirmedWord } =
    useSignPrediction(getFeatureBuffer, isBufferFull, mode === 'signToText')

  useEffect(() => {
    if (mode === 'signToText') {
      navigator.mediaDevices
        .getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream
          }
        })
        .catch(() => {
          setCameraError('Camera access was denied or is unavailable.')
        })
    }

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop())
      }
    }
  }, [mode])

  useEffect(() => {
  if (mode !== 'signToText' || !confirmedWord) return
  const phrase = wordPhrases[confirmedWord.word] || confirmedWord.word
  setSentenceText((prev) => (prev ? `${prev}. ${phrase}` : phrase))
}, [confirmedWord, mode])

  return (
    <section className="translateSection">
      {mode === null && (
        <h1 className="translateHeading">Which Way Do You Need</h1>
      )}

      {mode === null && (
        <div className="modeOptions">
          <div
            className="modeCard modeCardBlue"
            onClick={() => setMode('textToSign')}
          >
            <div className="modeIcon modeIconBlue">T</div>
            <h3>Text to Sign</h3>
            <p>Type something. Joe signs it back.</p>
          </div>

          <div
            className="modeCard modeCardPurple"
            onClick={() => setMode('signToText')}
          >
            <div className="modeIcon modeIconPurple">S</div>
            <h3>Sign to Text</h3>
            <p>Sign something. The words show up.</p>
          </div>
        </div>
      )}

      {mode === 'textToSign' && (
        <div className="modeInterface">
          <h2>Text to Sign</h2>
          <p className="modeNote">
            Interface placeholder. Text input and Joe's avatar output will
            connect here.
          </p>
          <button className="backButton" onClick={() => setMode(null)}>
            Back
          </button>
        </div>
      )}

      {mode === 'signToText' && (
        <div className="modeInterface">
          <h2>Sign to Text</h2>

          {cameraError ? (
            <p className="modeNote">{cameraError}</p>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="cameraFeed"
              />

              <div className="predictionDisplay">
                {predictedWord ? (
                  <span className="predictedWord">{predictedWord}</span>
                ) : (
                  <span className="predictedWordPlaceholder">
                    {isModelReady ? 'Watching for a sign…' : 'Loading model…'}
                  </span>
                )}
              </div>

                              <div className="sentenceDisplay">
                  <textarea
                    className="sentenceTextarea"
                    value={sentenceText}
                    onChange={(e) => setSentenceText(e.target.value)}
                    placeholder="Your sentence will build here as you sign. Click here to edit anytime."
                    rows={3}
                  />

                  {sentenceText.length > 0 && (
                    <button
                      className="clearButton"
                      onClick={() => setSentenceText('')}
                    >
                      Clear
                    </button>
                  )}
                </div>

              {isReady && (
                <div className="landmarkDebug">
                  <span style={{ color: leftHand ? '#22c55e' : '#999' }}>
                    ● Left hand
                  </span>
                  <span style={{ color: rightHand ? '#22c55e' : '#999' }}>
                    ● Right hand
                  </span>
                  <span style={{ color: isBufferFull ? '#22c55e' : '#999' }}>
                    Buffer: {bufferLength}/30
                  </span>
                  {isBufferFull && (
                    <span>confidence: {(confidence * 100).toFixed(0)}%</span>
                  )}
                </div>
              )}
            </>
          )}

          <button className="backButton" onClick={() => setMode(null)}>
            Back
          </button>
        </div>
      )}
    </section>
  )
}

export default Translate