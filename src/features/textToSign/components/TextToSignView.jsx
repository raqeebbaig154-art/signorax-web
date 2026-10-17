import { useState, useEffect, useCallback, useMemo } from 'react'
import AvatarViewer from './AvatarViewer'
import { translateTextToSign } from '../engine/textToSignEngine'
import { fetchManifest, hasClip } from '../animation/clipLoader'
import './TextToSignView.css'

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25]

const QUICK_EXAMPLES = ['Sit', 'Please sit', 'Hello', 'Thank you']

export default function TextToSignView({ onBack }) {
  const [inputText, setInputText] = useState('')
  const [vocabularyData, setVocabularyData] = useState(null)
  const [manifest, setManifest] = useState(null)
  const [isLoadingData, setIsLoadingData] = useState(true)

  const [translatedResult, setTranslatedResult] = useState(null)
  const [playableItems, setPlayableItems] = useState([])
  const [playbackTrigger, setPlaybackTrigger] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [currentWordIndex, setCurrentWordIndex] = useState(-1)
  const [sentenceProgress, setSentenceProgress] = useState(0)
  const [playbackStatus, setPlaybackStatus] = useState('idle') // 'idle' | 'signing' | 'paused' | 'completed'

  // Fetch vocabulary.json and manifest.json on mount
  useEffect(() => {
    let cancelled = false

    async function loadData() {
      try {
        const [vocabRes, manifestData] = await Promise.all([
          fetch('/data/vocabulary.json').then((r) => (r.ok ? r.json() : null)),
          fetchManifest(),
        ])

        if (!cancelled) {
          setVocabularyData(vocabRes)
          setManifest(manifestData)
          setIsLoadingData(false)
        }
      } catch (err) {
        console.warn('Failed to load vocabulary or manifest data:', err)
        if (!cancelled) {
          setIsLoadingData(false)
        }
      }
    }

    loadData()
    return () => {
      cancelled = true
    }
  }, [])

  // Execute translation
  const handleTranslate = useCallback(
    (customText) => {
      const textToTranslate =
        typeof customText === 'string' ? customText : inputText
      if (!textToTranslate || !textToTranslate.trim() || !vocabularyData) {
        return
      }

      if (typeof customText === 'string') {
        setInputText(customText)
      }

      const result = translateTextToSign(textToTranslate, vocabularyData)

      // Map manifest clip availability
      let playableCounter = 0
      const annotatedItems = result.items.map((item) => {
        if (item.status === 'matched') {
          const available = hasClip(item.id, manifest)
          const pIndex = available ? playableCounter++ : -1
          return { ...item, hasClip: available, playableIndex: pIndex }
        }
        return { ...item, hasClip: false, playableIndex: -1 }
      })

      const playable = annotatedItems.filter(
        (item) => item.status === 'matched' && item.hasClip
      )

      setTranslatedResult({ ...result, items: annotatedItems })
      setPlayableItems(playable)
      setIsPaused(false)
      setSentenceProgress(0)

      if (playable.length > 0) {
        setCurrentWordIndex(0)
        setPlaybackStatus('signing')
        setPlaybackTrigger((prev) => prev + 1)
      } else {
        setCurrentWordIndex(-1)
        setPlaybackStatus('idle')
      }
    },
    [inputText, vocabularyData, manifest]
  )

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleTranslate()
    }
  }

  // Playback control handlers
  const handleTogglePause = () => {
    if (playableItems.length === 0) return
    setIsPaused((prev) => !prev)
    setPlaybackStatus((prev) => (prev === 'paused' ? 'signing' : 'paused'))
  }

  const handleReplay = () => {
    if (playableItems.length === 0) return
    setIsPaused(false)
    setCurrentWordIndex(0)
    setSentenceProgress(0)
    setPlaybackStatus('signing')
    setPlaybackTrigger((prev) => prev + 1)
  }

  const handleSpeedChange = (newSpeed) => {
    setSpeed(newSpeed)
  }

  // AvatarViewer event callbacks
  const handleWordChange = useCallback((index) => {
    setCurrentWordIndex(index)
    if (index >= 0) {
      setPlaybackStatus('signing')
    }
  }, [])

  const handleProgress = useCallback((percent) => {
    setSentenceProgress(percent)
  }, [])

  const handlePlaybackComplete = useCallback(() => {
    setCurrentWordIndex(-1)
    setSentenceProgress(100)
    setPlaybackStatus('completed')
    setIsPaused(false)
  }, [])

  // Status label for avatar header badge
  const avatarStatusLabel = useMemo(() => {
    if (playbackStatus === 'signing') {
      if (currentWordIndex >= 0 && playableItems[currentWordIndex]) {
        return `Signing: ${playableItems[currentWordIndex].label}`
      }
      return 'Signing'
    }
    if (playbackStatus === 'paused') return 'Paused'
    if (playbackStatus === 'completed') return 'Complete'
    return 'Idle'
  }, [playbackStatus, currentWordIndex, playableItems])

  return (
    <div className="textToSignContainer">
      <div className="textToSignHeader">
        <h2 className="textToSignTitle">Text to Sign</h2>
        <p className="textToSignSubtitle">
          Type an English sentence or choose a phrase. Joe will translate it
          into sign language in real-time 3D.
        </p>
      </div>

      {/* Input bar and quick-examples */}
      <div className="translateInputCard">
        <div className="inputRow">
          <input
            type="text"
            className="textInputField"
            placeholder="Type a word or sentence (e.g. 'Please sit', 'Sit', 'Hello')…"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoadingData}
            aria-label="Text to sign input"
          />
          <button
            type="button"
            className="translateSubmitButton"
            onClick={() => handleTranslate()}
            disabled={isLoadingData || !inputText.trim()}
          >
            Translate
          </button>
        </div>

        {/* Quick prompt suggestions */}
        <div className="quickPromptRow">
          <span className="quickPromptLabel">Try:</span>
          {QUICK_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className="quickPromptChip"
              onClick={() => handleTranslate(example)}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {/* Sequence Chips & Playback Controls (visible when translation performed) */}
      {translatedResult && (
        <div className="sequenceControlCard">
          {/* Word chips display */}
          <div className="wordChipsContainer">
            {translatedResult.items.map((item, idx) => {
              const isPlaying =
                item.playableIndex !== -1 &&
                item.playableIndex === currentWordIndex
              const isComingSoon = item.status === 'matched' && !item.hasClip
              const isUnsupported = item.status === 'unsupported'
              const isSkipped = item.status === 'skipped'

              let chipClass = 'wordChip'
              if (isPlaying) chipClass += ' wordChipActive'
              else if (isComingSoon) chipClass += ' wordChipComingSoon'
              else if (isUnsupported) chipClass += ' wordChipUnsupported'
              else if (isSkipped) chipClass += ' wordChipSkipped'
              else chipClass += ' wordChipPlayable'

              return (
                <div key={`${item.id}-${idx}`} className={chipClass}>
                  <div className="chipHeader">
                    <span className="chipLabel">{item.label}</span>
                    {isPlaying && <span className="chipPlayingDot" />}
                  </div>

                  {isComingSoon && (
                    <span className="chipBadge chipBadgeSoon">
                      animation coming soon
                    </span>
                  )}
                  {isPlaying && (
                    <span className="chipBadge chipBadgeActive">
                      Signing now
                    </span>
                  )}
                  {isUnsupported && (
                    <span className="chipBadge chipBadgeUnsupported">
                      not in dictionary
                    </span>
                  )}
                  {isSkipped && (
                    <span className="chipBadge chipBadgeSkipped">skipped</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Sentence progress bar */}
          {playableItems.length > 0 && (
            <div className="sentenceProgressBarWrapper">
              <div className="progressBarHeader">
                <span className="progressBarTitle">Sentence Progress</span>
                <span className="progressBarPercent">{sentenceProgress}%</span>
              </div>
              <div className="sentenceProgressBarTrack">
                <div
                  className="sentenceProgressBarFill"
                  style={{ width: `${sentenceProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Playback Controls Toolbar */}
          {playableItems.length > 0 && (
            <div className="playbackToolbar">
              <div className="playbackButtonCluster">
                {/* Play / Pause Toggle */}
                {playbackStatus === 'completed' ? (
                  <button
                    type="button"
                    className="playbackBtn playbackBtnPrimary"
                    onClick={handleReplay}
                    title="Replay sequence"
                  >
                    ↺ Replay
                  </button>
                ) : (
                  <button
                    type="button"
                    className="playbackBtn playbackBtnPrimary"
                    onClick={handleTogglePause}
                    title={isPaused ? 'Resume playback' : 'Pause playback'}
                  >
                    {isPaused ? '▶ Resume' : '⏸ Pause'}
                  </button>
                )}

                {/* Replay Button */}
                {playbackStatus !== 'completed' && (
                  <button
                    type="button"
                    className="playbackBtn playbackBtnSecondary"
                    onClick={handleReplay}
                    title="Replay from beginning"
                  >
                    ↺ Replay
                  </button>
                )}
              </div>

              {/* Speed selector */}
              <div className="speedSelector">
                <span className="speedSelectorLabel">Speed:</span>
                <div className="speedButtonsGroup">
                  {SPEED_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`speedBtn ${speed === opt ? 'speedBtnActive' : ''}`}
                      onClick={() => handleSpeedChange(opt)}
                    >
                      {opt}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Informational note when no words have animations yet */}
          {playableItems.length === 0 && (
            <div className="noClipsNotice">
              <span>
                ℹ️ None of the words in this sentence have 3D animation files
                available in the library yet. Joe will stay in idle breathing
                pose.
              </span>
            </div>
          )}
        </div>
      )}

      {/* 3D Avatar Viewer Container */}
      <div className="avatarViewerFrame">
        <AvatarViewer
          variant="default"
          playableWords={playableItems}
          manifest={manifest}
          playbackTrigger={playbackTrigger}
          isPaused={isPaused}
          speed={speed}
          onWordChange={handleWordChange}
          onProgress={handleProgress}
          onPlaybackComplete={handlePlaybackComplete}
          statusLabel={avatarStatusLabel}
        />
      </div>

      {/* Back button to return to mode choice */}
      {onBack && (
        <div className="textToSignFooter">
          <button type="button" className="backButton" onClick={onBack}>
            ← Back to Mode Select
          </button>
        </div>
      )}
    </div>
  )
}
