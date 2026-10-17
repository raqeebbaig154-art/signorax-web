/**
 * Unit-style test suite for the Text-to-Sign Translation Engine.
 * Run directly via: node src/features/textToSign/engine/run-tests.mjs
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { translateTextToSign } from './textToSignEngine.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const vocabularyPath = resolve(__dirname, '../../../../public/data/vocabulary.json')
const vocabularyData = JSON.parse(readFileSync(vocabularyPath, 'utf-8'))

const testCases = [
  {
    name: 'Sentence 1: Single word greeting',
    input: 'Hello',
    expectedMatched: ['Hello'],
  },
  {
    name: 'Sentence 2: Multi-word phrase mapping',
    input: 'Thank you',
    expectedMatched: ['ThankYou'],
  },
  {
    name: 'Sentence 3: Punctuation and phrase expansion',
    input: 'How are you?',
    expectedMatched: ['How', 'You'],
  },
  {
    name: 'Sentence 4: Reverse sentence-box phrase',
    input: 'I need a doctor',
    expectedMatched: ['Doctor'],
  },
  {
    name: 'Sentence 5: Compound with possessive phrase rule',
    input: 'Please call my brother',
    expectedMatched: ['Please', 'Call', 'Brother'],
  },
  {
    name: 'Sentence 6: Long phrase rule match',
    input: 'I want to go home',
    expectedMatched: ['Home'],
  },
  {
    name: 'Sentence 7: Question with filler words skipped',
    input: 'Where is the hospital?',
    expectedMatched: ['Where', 'Hospital'],
    expectedSkipped: ['is', 'the'],
  },
  {
    name: 'Sentence 8: Contraction and conjunction skipped',
    input: "I'm hungry and tired",
    expectedMatched: ['Hungry', 'Tired'],
    expectedSkipped: ['and'],
  },
  {
    name: 'Sentence 9: Multiple action verbs',
    input: 'Please sit and wait',
    expectedMatched: ['Please', 'Sit', 'Wait'],
    expectedSkipped: ['and'],
  },
  {
    name: 'Sentence 10: Question with auxiliary and disjunction skipped',
    input: 'Do you need medicine or water?',
    expectedMatched: ['You', 'Medicine', 'Water'],
    expectedSkipped: ['do', 'need', 'or'],
  },
  {
    name: 'Sentence 11: Sensory feelings',
    input: 'I feel cold and sad',
    expectedMatched: ['Cold', 'Sad'],
    expectedSkipped: ['and'],
  },
  {
    name: 'Sentence 12: Family members and adjectives',
    input: 'My mother and father are good',
    expectedMatched: ['Mother', 'Father', 'Good'],
    expectedSkipped: ['and', 'are'],
  },
  {
    name: 'Sentence 13: Emergency imperative with pain phrase',
    input: 'Stop please, I am in pain',
    expectedMatched: ['Stop', 'Please', 'Pain'],
  },
  {
    name: 'Sentence 14: Partially supported sentence with unvocab words (I -> Me)',
    input: 'Hello, I am dancing in the park',
    expectedMatched: ['Hello', 'Me'],
    expectedUnsupported: ['dancing', 'park'],
    expectedSkipped: ['am', 'in', 'the'],
  },
  {
    name: 'Sentence 15: Entirely unsupported sentence',
    input: 'Random unknown gibberish',
    expectedMatched: [],
    expectedUnsupported: ['random', 'unknown', 'gibberish'],
  },
  {
    name: 'Bonus 16: Roman Urdu phrase mapping',
    input: 'kese ho bhai',
    expectedMatched: ['How', 'You', 'Brother'],
  },
  {
    name: 'Bonus 17: Roman Urdu single word alias & filler',
    input: 'pani aur dawa',
    expectedMatched: ['Water', 'Medicine'],
    expectedSkipped: ['aur'],
  },
  {
    name: 'Bonus 18: Plural stemming',
    input: 'doctors and medicines',
    expectedMatched: ['Doctor', 'Medicine'],
    expectedSkipped: ['and'],
  },
  {
    name: 'Bonus 19: Gerund (-ing) variant',
    input: 'drinking water',
    expectedMatched: ['Drink', 'Water'],
  },
  {
    name: 'Bonus 20: Empty string handling',
    input: '   ',
    expectedMatched: [],
  },
]

let passed = 0
let failed = 0

console.log('\n========================================')
console.log('   TEXT-TO-SIGN ENGINE TEST SUITE')
console.log('========================================\n')

for (let i = 0; i < testCases.length; i++) {
  const tc = testCases[i]
  const result = translateTextToSign(tc.input, vocabularyData)
  const actualMatched = result.matched.map((m) => m.id)

  const matchedOk =
    JSON.stringify(actualMatched) === JSON.stringify(tc.expectedMatched)

  let skippedOk = true
  if (tc.expectedSkipped) {
    const actualSkipped = result.skipped.map((s) => s.id)
    skippedOk = tc.expectedSkipped.every((w) => actualSkipped.includes(w))
  }

  let unsupportedOk = true
  if (tc.expectedUnsupported) {
    const actualUnsupported = result.unsupported.map((u) => u.id)
    unsupportedOk = tc.expectedUnsupported.every((w) => actualUnsupported.includes(w))
  }

  const ok = matchedOk && skippedOk && unsupportedOk

  if (ok) {
    passed++
    console.log(`✓ [PASS] ${tc.name}`)
    console.log(`   Input: "${tc.input}"`)
    console.log(`   Matched: [${actualMatched.join(', ')}]`)
    if (result.unsupported.length > 0) {
      console.log(`   Unsupported: [${result.unsupported.map((u) => u.id).join(', ')}]`)
    }
  } else {
    failed++
    console.error(`✗ [FAIL] ${tc.name}`)
    console.error(`   Input: "${tc.input}"`)
    console.error(`   Expected matched:`, tc.expectedMatched)
    console.error(`   Actual matched:`, actualMatched)
    if (result.unsupported.length > 0) {
      console.error(`   Actual unsupported:`, result.unsupported.map((u) => u.id))
    }
    if (result.skipped.length > 0) {
      console.error(`   Actual skipped:`, result.skipped.map((s) => s.id))
    }
  }
  console.log('----------------------------------------')
}

console.log(`\nTest Results: ${passed} passed, ${failed} failed (${testCases.length} total)\n`)

if (failed > 0) {
  process.exit(1)
}
