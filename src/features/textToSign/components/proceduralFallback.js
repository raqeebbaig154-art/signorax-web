import * as THREE from 'three'

/**
 * Creates a stylized procedural humanoid avatar mannequin with a standard
 * bone hierarchy (Spine, Chest, Neck, Head, Shoulders, Arms, Forearms, Hands, Fingers).
 *
 * This provides a reliable, self-contained fallback whenever `public/models/joe.glb`
 * is not yet provided, ensuring the Three.js scene, camera, lighting, idle loop,
 * and sequence controls can be developed and tested immediately.
 *
 * @returns {{ root: THREE.Group, bones: Object, isFallback: boolean }}
 */
export function createProceduralAvatar() {
  const root = new THREE.Group()
  root.name = 'Joe_ProceduralMannequin'

  // Material palette matching site styling
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x4f46e5, // indigo / blurple accent for torso
    roughness: 0.35,
    metalness: 0.1,
  })

  const skinMaterial = new THREE.MeshStandardMaterial({
    color: 0xfbcfe8, // soft warm skin tone
    roughness: 0.5,
    metalness: 0.05,
  })

  const jointMaterial = new THREE.MeshStandardMaterial({
    color: 0x635bff,
    roughness: 0.3,
    metalness: 0.2,
  })

  const handMaterial = new THREE.MeshStandardMaterial({
    color: 0xfbcfe8,
    roughness: 0.4,
    metalness: 0.05,
  })

  const bones = {}

  // 1. Root & Hips
  const hips = new THREE.Group()
  hips.name = 'Hips'
  hips.position.set(0, 0.95, 0)
  root.add(hips)
  bones.Hips = hips

  const hipsMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.15, 0.14, 16),
    bodyMaterial
  )
  hipsMesh.castShadow = true
  hips.add(hipsMesh)

  // 2. Spine & Chest (upper torso)
  const spine = new THREE.Group()
  spine.name = 'Spine'
  spine.position.set(0, 0.1, 0)
  hips.add(spine)
  bones.Spine = spine

  const chest = new THREE.Group()
  chest.name = 'Chest'
  chest.position.set(0, 0.2, 0)
  spine.add(chest)
  bones.Chest = chest

  const chestMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.18, 0.3, 16),
    bodyMaterial
  )
  chestMesh.position.set(0, 0.1, 0)
  chestMesh.castShadow = true
  chest.add(chestMesh)

  // 3. Neck & Head
  const neck = new THREE.Group()
  neck.name = 'Neck'
  neck.position.set(0, 0.28, 0)
  chest.add(neck)
  bones.Neck = neck

  const neckMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.09, 0.1, 16),
    skinMaterial
  )
  neckMesh.position.set(0, 0.04, 0)
  neck.add(neckMesh)

  const head = new THREE.Group()
  head.name = 'Head'
  head.position.set(0, 0.12, 0)
  neck.add(head)
  bones.Head = head

  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 24, 20),
    skinMaterial
  )
  headMesh.scale.set(0.9, 1.15, 0.95)
  headMesh.position.set(0, 0.1, 0)
  headMesh.castShadow = true
  head.add(headMesh)

  // Stylized hair / cap
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.165, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0x0a2540, roughness: 0.6 })
  )
  hair.scale.set(0.92, 0.9, 0.97)
  hair.position.set(0, 0.15, -0.02)
  head.add(hair)

  // Stylized friendly eyes
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x0a2540 })
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 12), eyeMaterial)
  leftEye.position.set(-0.06, 0.1, 0.14)
  head.add(leftEye)
  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 12), eyeMaterial)
  rightEye.position.set(0.06, 0.1, 0.14)
  head.add(rightEye)

  // Helper to build arms with clearly defined joints, palms, and articulated fingers
  function buildArm(side) {
    const isLeft = side === 'Left'
    const sign = isLeft ? 1 : -1

    const shoulder = new THREE.Group()
    shoulder.name = `${side}Shoulder`
    shoulder.position.set(sign * 0.22, 0.22, 0)
    chest.add(shoulder)
    bones[`${side}Shoulder`] = shoulder

    const shoulderJoint = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 16, 16),
      jointMaterial
    )
    shoulder.add(shoulderJoint)

    const arm = new THREE.Group()
    arm.name = `${side}Arm`
    arm.position.set(sign * 0.08, -0.02, 0)
    shoulder.add(arm)
    bones[`${side}Arm`] = arm

    // Upper arm
    const upperArmMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.05, 0.26, 16),
      skinMaterial
    )
    upperArmMesh.position.set(0, -0.13, 0)
    upperArmMesh.castShadow = true
    arm.add(upperArmMesh)

    // Forearm
    const foreArm = new THREE.Group()
    foreArm.name = `${side}ForeArm`
    foreArm.position.set(0, -0.27, 0)
    arm.add(foreArm)
    bones[`${side}ForeArm`] = foreArm

    const elbowJoint = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 14, 14),
      jointMaterial
    )
    foreArm.add(elbowJoint)

    const foreArmMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.04, 0.24, 16),
      skinMaterial
    )
    foreArmMesh.position.set(0, -0.12, 0)
    foreArmMesh.castShadow = true
    foreArm.add(foreArmMesh)

    // Hand (wrist + palm + fingers)
    const hand = new THREE.Group()
    hand.name = `${side}Hand`
    hand.position.set(0, -0.24, 0)
    foreArm.add(hand)
    bones[`${side}Hand`] = hand

    // Palm
    const palmMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.08, 0.025),
      handMaterial
    )
    palmMesh.position.set(0, -0.04, 0)
    palmMesh.castShadow = true
    hand.add(palmMesh)

    // Thumb
    const thumb = new THREE.Group()
    thumb.name = `${side}Thumb`
    thumb.position.set(sign * -0.035, -0.03, 0.01)
    hand.add(thumb)
    bones[`${side}Thumb`] = thumb

    const thumbMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.011, 0.04, 10),
      handMaterial
    )
    thumbMesh.position.set(sign * -0.015, -0.015, 0.01)
    thumbMesh.rotation.z = sign * -0.5
    thumb.add(thumbMesh)

    // 4 Fingers (Index, Middle, Ring, Little)
    const fingerOffsets = [-0.025, -0.008, 0.008, 0.025]
    const fingerLengths = [0.05, 0.055, 0.05, 0.04]

    fingerOffsets.forEach((offsetX, idx) => {
      const finger = new THREE.Group()
      finger.name = `${side}Finger_${idx}`
      finger.position.set(offsetX, -0.08, 0)
      hand.add(finger)

      const fMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.009, 0.008, fingerLengths[idx], 8),
        handMaterial
      )
      fMesh.position.set(0, -fingerLengths[idx] / 2, 0)
      finger.add(fMesh)
    })
  }

  buildArm('Left')
  buildArm('Right')

  // Lower body / pedestal (to ground the mannequin elegantly)
  const baseMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.22, 0.8, 16),
    new THREE.MeshStandardMaterial({
      color: 0x0a2540,
      roughness: 0.4,
      metalness: 0.1,
    })
  )
  baseMesh.position.set(0, -0.4, 0)
  baseMesh.castShadow = true
  hips.add(baseMesh)

  // Ground shadow receiver
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.6),
    new THREE.ShadowMaterial({ opacity: 0.15 })
  )
  shadowPlane.rotation.x = -Math.PI / 2
  shadowPlane.position.y = 0.01
  shadowPlane.receiveShadow = true
  root.add(shadowPlane)

  // Set default natural resting pose
  resetToRestPose(bones)

  // Cache resting transforms on all bones for non-destructive procedural offsets
  Object.values(bones).forEach((bone) => {
    bone.userData.restQuaternion = bone.quaternion.clone()
    bone.userData.restPosition = bone.position.clone()
  })

  return { root, bones, isFallback: true }
}

/**
 * Sets the avatar bones into a natural resting pose (hands held relaxed at waist).
 *
 * @param {Object} bones
 */
export function resetToRestPose(bones) {
  if (!bones) return

  // Neutral spine & chest
  if (bones.Spine) bones.Spine.rotation.set(0, 0, 0)
  if (bones.Chest) bones.Chest.rotation.set(0, 0, 0)
  if (bones.Head) bones.Head.rotation.set(0, 0, 0)
  if (bones.Neck) bones.Neck.rotation.set(0, 0, 0)

  // Relaxed arms slightly forward and in
  if (bones.LeftArm) {
    bones.LeftArm.rotation.set(0.3, 0.1, -0.2)
  }
  if (bones.RightArm) {
    bones.RightArm.rotation.set(0.3, -0.1, 0.2)
  }

  // Forearms bent naturally towards center front
  if (bones.LeftForeArm) {
    bones.LeftForeArm.rotation.set(0.65, 0.2, 0.35)
  }
  if (bones.RightForeArm) {
    bones.RightForeArm.rotation.set(0.65, -0.2, -0.35)
  }

  // Hands slightly pronated, fingers relaxed
  if (bones.LeftHand) {
    bones.LeftHand.rotation.set(-0.1, 0.3, 0.1)
  }
  if (bones.RightHand) {
    bones.RightHand.rotation.set(-0.1, -0.3, -0.1)
  }
}
