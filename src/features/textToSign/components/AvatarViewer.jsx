import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createProceduralAvatar } from './proceduralFallback.js'
import { loadClip } from '../animation/clipLoader.js'
import './AvatarViewer.css'

/**
 * Checks if WebGL is available in the current browser environment.
 */
function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    )
  } catch {
    return false
  }
}

/**
 * Camera framing parameters tailored for Joe (1.82m tall, Rigify rig).
 */
const DEFAULT_CAMERA_POS = new THREE.Vector3(0, 1.4, 1.7)
const DEFAULT_TARGET_POS = new THREE.Vector3(0, 1.3, 0)

// Hero framing: head to waist, centered in the circle area
const HERO_CAMERA_POS = new THREE.Vector3(0, 1.38, 1.55)
const HERO_TARGET_POS = new THREE.Vector3(0, 1.33, 0)

// Preallocated math objects for non-destructive procedural offsets
const _euler = new THREE.Euler()
const _quat = new THREE.Quaternion()

/**
 * Safely applies an additive local rotation offset to a bone based on its
 * saved rest quaternion, preventing rotation drift or Euler angle corruption.
 */
function applyBoneOffset(bone, x = 0, y = 0, z = 0) {
  if (!bone || !bone.userData?.restQuaternion) return
  _euler.set(x, y, z)
  _quat.setFromEuler(_euler)
  bone.quaternion.copy(bone.userData.restQuaternion).multiply(_quat)
}

/**
 * Resolves standard anatomical bone references across Rigify (DEF-*) rigs
 * and the procedural mannequin fallback.
 */
function resolveRigBones(bonesMap) {
  if (!bonesMap) return null
  const find = (...names) => {
    for (const name of names) {
      if (bonesMap[name]) return bonesMap[name]
    }
    return null
  }

  return {
    chest: find('DEF-spine.004', 'DEF-spine.003', 'Chest'),
    spine: find('DEF-spine.002', 'DEF-spine.001', 'DEF-spine', 'Spine'),
    neck: find('DEF-spine.005', 'Neck'),
    head: find('DEF-spine.006', 'Head'),
    shoulderL: find('DEF-shoulder.L', 'LeftShoulder'),
    shoulderR: find('DEF-shoulder.R', 'RightShoulder'),
    upperArmL: find('DEF-upper_arm.L', 'LeftArm'),
    upperArmR: find('DEF-upper_arm.R', 'RightArm'),
    forearmL: find('DEF-forearm.L', 'LeftForeArm'),
    forearmR: find('DEF-forearm.R', 'RightForeArm'),
    handL: find('DEF-hand.L', 'LeftHand'),
    handR: find('DEF-hand.R', 'RightHand'),
  }
}

export default function AvatarViewer({
  variant = 'default',
  fallbackComponent = null,
  onMixerReady,
  onLoaded,
  className = '',
  statusLabel = 'Idle',
  playableWords = null,
  manifest = null,
  playbackTrigger = 0,
  isPaused = false,
  speed = 1,
  onWordChange = null,
  onProgress = null,
  onPlaybackComplete = null,
}) {
  const isHero = variant === 'hero'

  const containerRef = useRef(null)
  const canvasWrapperRef = useRef(null)

  const [hasWebGL, setHasWebGL] = useState(() => isWebGLAvailable())
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [isLoading, setIsLoading] = useState(() => isWebGLAvailable())
  const [usingFallback, setUsingFallback] = useState(false)

  // Camera framing selection based on variant
  const cameraPos = useMemo(
    () => (isHero ? HERO_CAMERA_POS : DEFAULT_CAMERA_POS),
    [isHero]
  )
  const targetPos = useMemo(
    () => (isHero ? HERO_TARGET_POS : DEFAULT_TARGET_POS),
    [isHero]
  )

  // Store callback refs so changes don't trigger re-mounts or re-plays
  const onWordChangeRef = useRef(onWordChange)
  const onProgressRef = useRef(onProgress)
  const onPlaybackCompleteRef = useRef(onPlaybackComplete)
  const isPausedRef = useRef(isPaused)
  const speedRef = useRef(speed)

  useEffect(() => {
    onWordChangeRef.current = onWordChange
    onProgressRef.current = onProgress
    onPlaybackCompleteRef.current = onPlaybackComplete
    isPausedRef.current = isPaused
    speedRef.current = speed
  })

  // Three.js internal references stored across renders
  const threeRefs = useRef({
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    mixer: null,
    avatarRoot: null,
    bones: null,
    resolvedBones: null,
    isFallback: false,
    animFrameId: null,
    timer: new THREE.Timer(),
    isTabVisible: true,
    isIntersecting: true,
    // Playback state
    isClipPlaying: false,
    sequence: [],
    sequenceIndex: -1,
    totalSequenceDuration: 0,
    currentAction: null,
    isCrossfading: false,
    pendingSequence: null,
  })

  // Center / Reset camera view to default framing
  const handleResetCamera = useCallback(() => {
    const { camera, controls } = threeRefs.current
    if (camera && controls) {
      camera.position.copy(cameraPos)
      controls.target.copy(targetPos)
      controls.update()
    }
  }, [cameraPos, targetPos])

  const startSequence = useCallback(
    async (words, manifestData) => {
      const t = threeRefs.current
      if (!t.avatarRoot || !t.mixer || isHero) return

      // Stop existing playback
      if (t.currentAction) {
        t.currentAction.stop()
        t.currentAction = null
      }
      if (t.mixer) {
        t.mixer.stopAllAction()
      }

      // Reset bones to rest
      t.avatarRoot.traverse((child) => {
        if (child.isBone && child.userData?.restQuaternion) {
          child.quaternion.copy(child.userData.restQuaternion)
        }
      })

      t.isClipPlaying = false
      t.sequence = []
      t.sequenceIndex = -1
      t.isCrossfading = false

      if (!words || words.length === 0) {
        if (onWordChangeRef.current) onWordChangeRef.current(-1, null)
        if (onProgressRef.current) onProgressRef.current(0)
        return
      }

      // Load clips asynchronously for playable words
      const loaded = []
      for (const item of words) {
        const wordId = typeof item === 'string' ? item : item.id
        const clip = await loadClip(wordId, manifestData, t.avatarRoot)
        if (clip) {
          loaded.push({
            id: wordId,
            label: typeof item === 'object' && item.label ? item.label : wordId,
            clip,
          })
        }
      }

      if (loaded.length === 0) {
        t.isClipPlaying = false
        if (onWordChangeRef.current) onWordChangeRef.current(-1, null)
        if (onPlaybackCompleteRef.current) onPlaybackCompleteRef.current()
        return
      }

      let totalDuration = 0
      for (const item of loaded) {
        totalDuration += item.clip.duration
      }

      t.sequence = loaded
      t.totalSequenceDuration = totalDuration
      t.sequenceIndex = 0
      t.isCrossfading = false
      t.isClipPlaying = true

      t.mixer.timeScale = isPausedRef.current ? 0 : speedRef.current

      const firstClip = loaded[0].clip
      const firstAction = t.mixer.clipAction(firstClip)
      firstAction.reset()
      firstAction.setLoop(THREE.LoopOnce, 1)
      firstAction.clampWhenFinished = true
      firstAction.play()
      t.currentAction = firstAction

      if (onWordChangeRef.current) {
        onWordChangeRef.current(0, loaded[0])
      }
      if (onProgressRef.current) {
        onProgressRef.current(0)
      }
    },
    [isHero]
  )

  useEffect(() => {
    if (!hasWebGL) {
      return
    }

    const container = containerRef.current
    const wrapper = canvasWrapperRef.current
    if (!container || !wrapper) return

    // 1. Create a fresh canvas element for this mount (avoids StrictMode context loss reuse bug)
    const canvas = document.createElement('canvas')
    canvas.className = 'avatarCanvas'
    canvas.tabIndex = 0
    wrapper.appendChild(canvas)

    const t = threeRefs.current

    // 2. Scene
    const scene = new THREE.Scene()
    t.scene = scene

    // 3. Camera: Framed according to variant
    const width = wrapper.clientWidth || container.clientWidth || 400
    const height = wrapper.clientHeight || container.clientHeight || 520
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50)
    camera.position.copy(cameraPos)
    t.camera = camera

    // 4. Renderer wrapped in try/catch to gracefully handle browser context initialization
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      })
    } catch (err) {
      console.warn('Could not initialize WebGLRenderer:', err)
      setHasWebGL(false)
      setIsLoading(false)
      if (canvas.parentElement) {
        canvas.parentElement.removeChild(canvas)
      }
      return
    }

    if (!renderer || !renderer.getContext()) {
      console.warn('WebGL context unavailable from WebGLRenderer')
      setHasWebGL(false)
      setIsLoading(false)
      if (renderer) renderer.dispose()
      if (canvas.parentElement) {
        canvas.parentElement.removeChild(canvas)
      }
      return
    }

    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    t.renderer = renderer

    // 5. OrbitControls: Tailored for hero vs interactive modes
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(targetPos)
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = 0.05

    if (isHero) {
      // In hero: zoom and pan disabled, subtle bounded rotation
      controls.enableZoom = false
      controls.minDistance = 1.55
      controls.maxDistance = 1.55
      controls.minPolarAngle = Math.PI / 2 - 0.12
      controls.maxPolarAngle = Math.PI / 2 + 0.12
      controls.minAzimuthAngle = -Math.PI / 8
      controls.maxAzimuthAngle = Math.PI / 8
    } else {
      controls.minDistance = 0.9
      controls.maxDistance = 2.6
      controls.minPolarAngle = Math.PI / 4 // ~45 deg
      controls.maxPolarAngle = Math.PI / 1.8 // ~100 deg
      controls.minAzimuthAngle = -Math.PI / 2.5
      controls.maxAzimuthAngle = Math.PI / 2.5
    }
    t.controls = controls

    // 6. Lighting: Studio three-point lighting with Stripe-inspired accents
    const ambientLight = new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 1.15)
    scene.add(ambientLight)

    // Key Light (warm white main illumination)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8)
    keyLight.position.set(2.5, 4.5, 3.5)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.width = 1024
    keyLight.shadow.mapSize.height = 1024
    keyLight.shadow.camera.near = 0.5
    keyLight.shadow.camera.far = 10
    keyLight.shadow.camera.left = -1.5
    keyLight.shadow.camera.right = 1.5
    keyLight.shadow.camera.top = 2.2
    keyLight.shadow.camera.bottom = -0.2
    keyLight.shadow.bias = -0.0005
    scene.add(keyLight)

    // Fill Light (signature Stripe blurple reflection)
    const fillLight = new THREE.DirectionalLight(0x7a73ff, 0.75)
    fillLight.position.set(-2.8, 2.2, 2.2)
    scene.add(fillLight)

    // Rim / Back Light (crisp cyan edge silhouette)
    const rimLight = new THREE.DirectionalLight(0x00d4ff, 0.65)
    rimLight.position.set(0, 3.2, -3.0)
    scene.add(rimLight)

    // Subtle contact shadow plane
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.ShadowMaterial({ opacity: 0.12 })
    )
    shadowPlane.rotation.x = -Math.PI / 2
    shadowPlane.position.y = 0.001
    shadowPlane.receiveShadow = true
    scene.add(shadowPlane)

    // Gentle mouse-follow pointer tracking for hero variant
    const pointer = { x: 0, targetX: 0 }
    const handlePointerMove = (e) => {
      if (!isHero) return
      const rect = container.getBoundingClientRect()
      if (rect.width <= 0) return
      const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.targetX = THREE.MathUtils.clamp(normX, -1, 1)
    }
    const handlePointerLeave = () => {
      if (!isHero) return
      pointer.targetX = 0
    }

    if (isHero) {
      container.addEventListener('pointermove', handlePointerMove)
      container.addEventListener('pointerleave', handlePointerLeave)
    }

    // 7. Avatar Loading Pipeline (GLTFLoader with procedural fallback)
    const loader = new GLTFLoader()

    const mountAvatar = (rootObj, bonesMap, isFallbackFlag, clips = []) => {
      t.avatarRoot = rootObj
      t.bones = bonesMap
      t.resolvedBones = resolveRigBones(bonesMap)
      t.isFallback = isFallbackFlag
      scene.add(rootObj)

      // Initialize AnimationMixer for sign animation clips
      const mixer = new THREE.AnimationMixer(rootObj)
      t.mixer = mixer

      if (onMixerReady) {
        onMixerReady({
          mixer,
          root: rootObj,
          bones: bonesMap,
          clips,
          isFallback: isFallbackFlag,
        })
      }
      if (onLoaded) {
        onLoaded({ root: rootObj, isFallback: isFallbackFlag })
      }

      setLoadingProgress(100)
      setIsLoading(false)

      // If a playback sequence was triggered before model loaded, start it now
      if (t.pendingSequence && t.pendingSequence.trigger > 0) {
        const pending = t.pendingSequence
        t.pendingSequence = null
        startSequence(pending.words, pending.manifestData)
      }
    }

    loader.load(
      '/models/joe.glb',
      (gltf) => {
        const model = gltf.scene
        model.name = 'Joe_Avatar'

        // Enable shadows on all child meshes
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true
            child.receiveShadow = true
          }
        })

        // Build bone map and cache resting transforms for non-destructive idle loop
        const bonesMap = {}
        model.traverse((child) => {
          if (child.isBone) {
            if (!child.userData.name) {
              const assoc = gltf.parser?.associations?.get(child)
              if (assoc && assoc.nodes !== undefined) {
                const nodeDef = gltf.parser.json?.nodes?.[assoc.nodes]
                if (nodeDef?.name) {
                  child.userData.name = nodeDef.name
                }
              }
            }
            if (!child.userData.name) {
              child.userData.name = child.name
            }
            bonesMap[child.name] = child
            bonesMap[child.userData.name] = child
            child.userData.restQuaternion = child.quaternion.clone()
            child.userData.restPosition = child.position.clone()
          }
        })

        mountAvatar(model, bonesMap, false, gltf.animations || [])
      },
      (xhr) => {
        // Track download percentage with fallback for uncompressed size
        const total = xhr.lengthComputable && xhr.total > 0 ? xhr.total : 2039296
        const percent = Math.min(Math.round((xhr.loaded / total) * 100), 99)
        setLoadingProgress(percent)
      },
      (error) => {
        console.warn(
          'public/models/joe.glb failed to load. Activating procedural mannequin fallback.',
          error
        )
        setUsingFallback(true)

        const fallback = createProceduralAvatar()
        mountAvatar(fallback.root, fallback.bones, true)
      }
    )

    // 8. Render Loop with Sequential Sign Playback & Natural Idle Breathing
    let isRunning = true

    const animate = () => {
      if (!isRunning) return

      t.animFrameId = requestAnimationFrame(animate)

      // Only update when tab is visible and canvas is in viewport
      if (!t.isTabVisible || !t.isIntersecting) return

      t.timer.update()
      const delta = t.timer.getDelta()
      const elapsedTime = t.timer.getElapsed()

      // Update mixer if sign actions are playing
      if (t.mixer) {
        t.mixer.update(delta)
      }

      // Check playback sequence progression and crossfading
      if (t.isClipPlaying && t.currentAction && t.sequence && t.sequence.length > 0) {
        const currentItem = t.sequence[t.sequenceIndex]
        const clipDuration = currentItem?.clip?.duration || 1
        const actionTime = t.currentAction.time

        // 1. Calculate overall sentence progress
        let elapsed = 0
        for (let i = 0; i < t.sequenceIndex; i++) {
          elapsed += t.sequence[i].clip.duration
        }
        elapsed += Math.min(actionTime, clipDuration)
        const progressPct = Math.min(
          100,
          Math.round((elapsed / Math.max(t.totalSequenceDuration, 0.001)) * 100)
        )
        if (onProgressRef.current) {
          onProgressRef.current(progressPct)
        }

        // 2. Crossfade to next word 0.25 s before current word ends
        const hasNext = t.sequenceIndex + 1 < t.sequence.length
        if (hasNext) {
          const crossfadeThreshold = Math.max(0, clipDuration - 0.25)
          if (actionTime >= crossfadeThreshold && !t.isCrossfading) {
            t.isCrossfading = true
            const nextIdx = t.sequenceIndex + 1
            const nextItem = t.sequence[nextIdx]
            const nextAction = t.mixer.clipAction(nextItem.clip)
            nextAction.reset()
            nextAction.setLoop(THREE.LoopOnce, 1)
            nextAction.clampWhenFinished = true
            nextAction.play()

            // Smooth 0.25s crossfade between words
            t.currentAction.crossFadeTo(nextAction, 0.25, false)

            t.currentAction = nextAction
            t.sequenceIndex = nextIdx
            t.isCrossfading = false

            if (onWordChangeRef.current) {
              onWordChangeRef.current(nextIdx, nextItem)
            }
          }
        } else {
          // 3. Last word completion -> stop and return to idle breathing pose
          if (
            actionTime >= clipDuration ||
            (actionTime >= clipDuration - 0.03 && t.currentAction.paused)
          ) {
            t.currentAction.stop()
            if (t.mixer) t.mixer.stopAllAction()

            // Reset bones cleanly to rest pose
            if (t.avatarRoot) {
              t.avatarRoot.traverse((child) => {
                if (child.isBone && child.userData?.restQuaternion) {
                  child.quaternion.copy(child.userData.restQuaternion)
                }
              })
            }

            t.isClipPlaying = false
            t.currentAction = null
            t.sequenceIndex = -1

            if (onProgressRef.current) onProgressRef.current(100)
            if (onWordChangeRef.current) onWordChangeRef.current(-1, null)
            if (onPlaybackCompleteRef.current) onPlaybackCompleteRef.current()
          }
        }
      }

      // Smooth damp pointer follow for hero variant
      if (isHero) {
        pointer.x += (pointer.targetX - pointer.x) * 0.06
      }

      // Procedural Idle Pose: Subtle breathing & micro-sway
      if (t.resolvedBones) {
        const {
          chest,
          spine,
          neck,
          head,
          shoulderL,
          shoulderR,
          upperArmL,
          upperArmR,
        } = t.resolvedBones

        // Natural human breathing rhythm (~16 breaths per min -> period ~3.8s)
        const breath = Math.sin(elapsedTime * 1.65)
        // Subtle organic posture sway (slow period ~6.5s)
        const sway = Math.sin(elapsedTime * 0.95)
        const microSway = Math.cos(elapsedTime * 1.25)

        // 1. Chest: gentle expansion / elevation
        if (chest) {
          applyBoneOffset(chest, breath * 0.015, sway * 0.003, 0)
        }

        // 2. Spine: subtle support posture sway
        if (spine) {
          applyBoneOffset(spine, breath * 0.005, sway * 0.003, 0)
        }

        // 3. Neck & Head: subtle natural gaze alignment with optional hero pointer follow
        if (neck) {
          applyBoneOffset(neck, -breath * 0.006, microSway * 0.005, 0)
        }
        if (head) {
          const pointerTurn = isHero ? pointer.x * 0.14 : 0
          applyBoneOffset(
            head,
            -breath * 0.01,
            microSway * 0.008 + pointerTurn,
            microSway * 0.003
          )
        }

        // 4. Shoulders & Arms: gentle organic rise & fall with breathing
        // When a sign clip is playing, do NOT apply idle offsets to arm, hand or finger bones!
        if (!t.isClipPlaying) {
          if (shoulderL) {
            applyBoneOffset(shoulderL, breath * 0.006, 0, breath * 0.003)
          }
          if (shoulderR) {
            applyBoneOffset(shoulderR, breath * 0.006, 0, -breath * 0.003)
          }

          if (upperArmL) {
            applyBoneOffset(upperArmL, breath * 0.004, 0, 0)
          }
          if (upperArmR) {
            applyBoneOffset(upperArmR, breath * 0.004, 0, 0)
          }
        }
      }

      controls.update()
      renderer.render(scene, camera)
    }

    animate()

    // 9. Lifecycle Optimization Handlers
    const handleVisibilityChange = () => {
      t.isTabVisible = !document.hidden
      if (t.isTabVisible && t.timer) {
        t.timer.reset()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const observer = new IntersectionObserver(
      ([entry]) => {
        t.isIntersecting = entry.isIntersecting
        if (t.isIntersecting && t.timer) {
          t.timer.reset()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(container)

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newW, height: newH } = entry.contentRect
        if (newW > 0 && newH > 0 && camera && renderer) {
          camera.aspect = newW / newH
          camera.updateProjectionMatrix()
          renderer.setSize(newW, newH)
        }
      }
    })
    resizeObserver.observe(container)

    // 10. Thorough Memory & Context Disposal on Unmount
    return () => {
      isRunning = false
      if (t.animFrameId) {
        cancelAnimationFrame(t.animFrameId)
      }

      document.removeEventListener('visibilitychange', handleVisibilityChange)
      observer.disconnect()
      resizeObserver.disconnect()

      if (isHero) {
        container.removeEventListener('pointermove', handlePointerMove)
        container.removeEventListener('pointerleave', handlePointerLeave)
      }

      if (controls) {
        controls.dispose()
      }

      // Stop and uncache mixer
      if (t.mixer) {
        t.mixer.stopAllAction()
        if (t.avatarRoot) {
          t.mixer.uncacheRoot(t.avatarRoot)
        }
      }

      // Dispose timer
      if (t.timer) {
        t.timer.dispose()
      }

      // Helper to dispose all textures attached to a material
      const disposeMaterial = (mat) => {
        if (!mat) return
        const textureKeys = [
          'map',
          'lightMap',
          'bumpMap',
          'normalMap',
          'specularMap',
          'envMap',
          'roughnessMap',
          'metalnessMap',
          'alphaMap',
          'aoMap',
        ]
        for (const key of textureKeys) {
          if (mat[key] && typeof mat[key].dispose === 'function') {
            mat[key].dispose()
          }
        }
        if (typeof mat.dispose === 'function') {
          mat.dispose()
        }
      }

      // Dispose all scene meshes, geometries, and materials
      if (scene) {
        scene.traverse((obj) => {
          if (obj.isMesh) {
            if (obj.geometry) {
              obj.geometry.dispose()
            }
            if (Array.isArray(obj.material)) {
              obj.material.forEach(disposeMaterial)
            } else if (obj.material) {
              disposeMaterial(obj.material)
            }
          }
        })
      }

      if (renderer) {
        renderer.dispose()
        if (renderer.domElement && renderer.domElement.parentElement) {
          renderer.domElement.parentElement.removeChild(renderer.domElement)
        }
      }

      // Remove created canvas from DOM
      if (canvas.parentElement) {
        canvas.parentElement.removeChild(canvas)
      }

      if (t.currentAction) {
        t.currentAction.stop()
        t.currentAction = null
      }
      t.isClipPlaying = false
      t.sequence = []
      t.sequenceIndex = -1

      t.scene = null
      t.camera = null
      t.renderer = null
      t.controls = null
      t.mixer = null
      t.avatarRoot = null
      t.bones = null
      t.resolvedBones = null
    }
  }, [hasWebGL, isHero, cameraPos, targetPos, onMixerReady, onLoaded, startSequence])

  // Trigger sign animation sequence when playbackTrigger increments
  useEffect(() => {
    if (isHero) return
    const t = threeRefs.current
    if (playbackTrigger > 0) {
      if (t.avatarRoot && t.mixer) {
        startSequence(playableWords, manifest)
      } else {
        t.pendingSequence = {
          words: playableWords,
          manifestData: manifest,
          trigger: playbackTrigger,
        }
      }
    }
  }, [playbackTrigger, playableWords, manifest, isHero, startSequence])

  // Dynamically update animation speed or pause state on the AnimationMixer
  useEffect(() => {
    if (isHero) return
    const t = threeRefs.current
    if (t.mixer) {
      t.mixer.timeScale = isPaused ? 0 : speed
    }
  }, [isPaused, speed, isHero])

  if (!hasWebGL) {
    if (fallbackComponent) {
      return fallbackComponent
    }
    return (
      <div className={`avatarViewerContainer ${className}`}>
        <div className="webglFallbackCard">
          <div className="webglFallbackIcon">⚠️</div>
          <h3 className="webglFallbackTitle">3D View Not Available</h3>
          <p className="webglFallbackText">
            WebGL is not supported or is disabled in your browser. Sign
            translation words will continue to display normally.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`avatarViewerContainer ${
        isHero ? 'avatarViewerHero' : ''
      } ${className}`}
    >
      {/* Soft circular aura matching hero placeholder */}
      {isHero && (
        <div className="heroGlowBackdrop" aria-hidden="true">
          <div className="pulseRing" />
          <div className="pulseRing pulseRingDelay" />
          <div className="heroGlowCore" />
        </div>
      )}

      {/* Header overlay badge and controls - hidden in hero variant */}
      {!isHero && (
        <div className="avatarHeaderOverlay">
          <div className="avatarBadge">
            <span
              className={`statusDot ${
                statusLabel === 'Paused' ? 'statusDotPaused' : ''
              }`}
            />
            <span>Joe ({statusLabel})</span>
          </div>

          <div className="avatarOverlayControls">
            <button
              type="button"
              className="overlayIconButton"
              onClick={handleResetCamera}
              title="Reset Camera View"
              aria-label="Reset camera view"
            >
              ⟲
            </button>
          </div>
        </div>
      )}

      {/* Canvas Wrapper where the fresh canvas is mounted */}
      <div ref={canvasWrapperRef} className="avatarCanvasWrapper" />

      {/* Interactive controls hint - hidden in hero variant */}
      {!isHero && (
        <div className="avatarViewerHint">
          <span>Drag to rotate • Scroll to zoom</span>
        </div>
      )}

      {/* Loading overlay - small spinner in hero, full progress in default */}
      {isLoading &&
        (isHero ? (
          <div className="heroLoadingOverlay">
            <div className="loadingSpinnerRing heroSpinnerRing" />
          </div>
        ) : (
          <div className="avatarLoadingOverlay">
            <div className="loadingSpinnerRing" />
            <span className="loadingLabel">
              {loadingProgress > 0
                ? `Loading Joe (${loadingProgress}%)`
                : 'Loading Joe…'}
            </span>
            <div className="progressBarContainer">
              <div
                className="progressBarFill"
                style={{ width: `${Math.max(loadingProgress, 12)}%` }}
              />
            </div>
          </div>
        ))}

      {/* Fallback notice banner - hidden in hero variant */}
      {!isHero && usingFallback && !isLoading && (
        <div className="avatarNoticeBanner">
          <span className="noticePill">Notice</span>
          <span>
            Using procedural mannequin (<code>public/models/joe.glb</code> not
            found).
          </span>
        </div>
      )}
    </div>
  )
}
