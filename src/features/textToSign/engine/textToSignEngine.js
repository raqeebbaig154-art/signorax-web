/**
 * Pure JavaScript Text-to-Sign Translation Engine for Signorax.
 * No React dependencies. All vocabulary, rules, and filler words
 * are parameterized from vocabulary.json (no hardcoded word lists).
 */

/**
 * Normalizes input text: converts to lowercase, expands common contractions,
 * removes punctuation, and collapses whitespace.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  if (typeof text !== 'string') return ''

  return text
    .toLowerCase()
    // Expand common English contractions to assist phrase matching & tokenization
    .replace(/\bi'm\b/g, 'i am')
    .replace(/\byou're\b/g, 'you are')
    .replace(/\bthat's\b/g, 'that is')
    .replace(/\bit's\b/g, 'it is')
    .replace(/\bwhat's\b/g, 'what is')
    .replace(/\bwhere's\b/g, 'where is')
    .replace(/\bhow's\b/g, 'how is')
    .replace(/\bdon't\b/g, 'do not')
    .replace(/\bcan't\b/g, 'cannot')
    // Replace all punctuation with spaces
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’“”]/g, ' ')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Builds lookup indexes from vocabulary data for O(1) matching.
 *
 * @param {object} vocabularyData
 * @returns {object} Indexed structures
 */
export function buildEngineIndexes(vocabularyData) {
  const words = vocabularyData?.words || []
  const phraseRules = [...(vocabularyData?.phraseRules || [])]
  const fillerSet = new Set(
    (vocabularyData?.fillerWords || []).map((w) => w.toLowerCase().trim())
  )

  // Map word IDs to word object
  const wordById = new Map()
  // Map token string (lowercase id or alias) to word object
  const tokenToWord = new Map()

  for (const word of words) {
    wordById.set(word.id, word)
    tokenToWord.set(word.id.toLowerCase(), word)

    if (Array.isArray(word.aliases)) {
      for (const alias of word.aliases) {
        const cleanAlias = alias.toLowerCase().trim()
        if (cleanAlias) {
          tokenToWord.set(cleanAlias, word)
        }
      }
    }
  }

  // Sort phrase rules descending by word count so longest match wins
  phraseRules.sort((a, b) => {
    const aCount = a.phrase.trim().split(/\s+/).length
    const bCount = b.phrase.trim().split(/\s+/).length
    if (bCount !== aCount) return bCount - aCount
    return b.phrase.length - a.phrase.length
  })

  // Pre-tokenize phrase rules
  const preparedPhraseRules = phraseRules.map((rule) => ({
    ...rule,
    tokens: rule.phrase.toLowerCase().trim().split(/\s+/),
  }))

  return {
    wordById,
    tokenToWord,
    fillerSet,
    preparedPhraseRules,
  }
}

/**
 * Checks morphological variants (plurals, -ing, -ed) against the vocabulary dictionary.
 *
 * @param {string} token
 * @param {Map<string, object>} tokenToWord
 * @returns {object|null} Matched word or null
 */
function findStemmedMatch(token, tokenToWord) {
  // Check plurals ending with 'ies' -> 'y' (e.g., surgeries -> surgery)
  if (token.endsWith('ies') && token.length > 4) {
    const candidate = token.slice(0, -3) + 'y'
    if (tokenToWord.has(candidate)) return tokenToWord.get(candidate)
  }

  // Check plurals ending with 'es' (e.g., boxes -> box)
  if (token.endsWith('es') && token.length > 3) {
    const candidate = token.slice(0, -2)
    if (tokenToWord.has(candidate)) return tokenToWord.get(candidate)
  }

  // Check plurals ending with 's' (e.g., doctors -> doctor, friends -> friend)
  if (token.endsWith('s') && token.length > 2) {
    const candidate = token.slice(0, -1)
    if (tokenToWord.has(candidate)) return tokenToWord.get(candidate)
  }

  // Check gerund '-ing' (e.g., drinking -> drink, waiting -> wait)
  if (token.endsWith('ing') && token.length > 4) {
    let candidate = token.slice(0, -3)
    if (tokenToWord.has(candidate)) return tokenToWord.get(candidate)
    // Handle double consonant (e.g., stopping -> stop, sitting -> sit)
    if (candidate.length > 2 && candidate[candidate.length - 1] === candidate[candidate.length - 2]) {
      candidate = candidate.slice(0, -1)
      if (tokenToWord.has(candidate)) return tokenToWord.get(candidate)
    }
  }

  // Check past tense '-ed' (e.g., finished -> finish, called -> call)
  if (token.endsWith('ed') && token.length > 3) {
    let candidate = token.slice(0, -2)
    if (tokenToWord.has(candidate)) return tokenToWord.get(candidate)
    if (tokenToWord.has(candidate + 'e')) return tokenToWord.get(candidate + 'e')
    // Handle double consonant (e.g., stopped -> stop)
    if (candidate.length > 2 && candidate[candidate.length - 1] === candidate[candidate.length - 2]) {
      candidate = candidate.slice(0, -1)
      if (tokenToWord.has(candidate)) return tokenToWord.get(candidate)
    }
  }

  return null
}

/**
 * Translates input text to an ordered sequence of sign vocabulary items.
 *
 * @param {string} text - User input text
 * @param {object} vocabularyData - Loaded vocabulary.json data
 * @returns {object} Result with items array and query analytics
 */
export function translateTextToSign(text, vocabularyData) {
  if (!text || !vocabularyData) {
    return {
      items: [],
      matched: [],
      unsupported: [],
      skipped: [],
      isEmpty: true,
      hasMatched: false,
    }
  }

  const { wordById, tokenToWord, fillerSet, preparedPhraseRules } =
    buildEngineIndexes(vocabularyData)

  const normalized = normalizeText(text)
  if (!normalized) {
    return {
      items: [],
      matched: [],
      unsupported: [],
      skipped: [],
      isEmpty: true,
      hasMatched: false,
    }
  }

  const tokens = normalized.split(/\s+/)
  const tokenCount = tokens.length
  // Array tracking consumed tokens: null if free, or { phraseMatch }
  const matchedSpans = new Array(tokenCount).fill(null)

  // Step 1: Apply phrase rules (longest match wins)
  for (const rule of preparedPhraseRules) {
    const ruleLen = rule.tokens.length
    if (ruleLen === 0 || ruleLen > tokenCount) continue

    for (let i = 0; i <= tokenCount - ruleLen; i++) {
      // Check if any token in this span is already part of a matched phrase
      let overlap = false
      for (let j = 0; j < ruleLen; j++) {
        if (matchedSpans[i + j] !== null) {
          overlap = true
          break
        }
      }
      if (overlap) continue

      // Verify token match
      let isMatch = true
      for (let j = 0; j < ruleLen; j++) {
        if (tokens[i + j] !== rule.tokens[j]) {
          isMatch = false
          break
        }
      }

      if (isMatch) {
        // Record match at start index, mark remaining indices as consumed
        matchedSpans[i] = {
          length: ruleLen,
          wordIds: rule.words,
        }
        for (let j = 1; j < ruleLen; j++) {
          matchedSpans[i + j] = { consumed: true }
        }
        i += ruleLen - 1 // advance pointer
      }
    }
  }

  // Step 2: Build final ordered item list
  const items = []

  for (let i = 0; i < tokenCount; i++) {
    const span = matchedSpans[i]

    if (span) {
      if (span.consumed) {
        // Consumed by a preceding multi-token phrase; skip
        continue
      }

      // Add each target word in the matched phrase
      for (const wordId of span.wordIds) {
        const wordObj = wordById.get(wordId)
        if (wordObj) {
          items.push({
            id: wordObj.id,
            label: wordObj.label,
            clip: wordObj.clip,
            urdu: wordObj.urdu,
            durationSec: wordObj.durationSec || 1.5,
            status: 'matched',
          })
        } else {
          items.push({
            id: wordId,
            label: wordId,
            clip: wordId,
            status: 'matched',
          })
        }
      }
      continue
    }

    const token = tokens[i]

    // Step 3: Check if token is a filler / stop word to be skipped
    if (fillerSet.has(token)) {
      items.push({
        id: token,
        label: token,
        clip: null,
        status: 'skipped',
      })
      continue
    }

    // Step 4: Direct dictionary lookup
    const directMatch = tokenToWord.get(token)
    if (directMatch) {
      items.push({
        id: directMatch.id,
        label: directMatch.label,
        clip: directMatch.clip,
        urdu: directMatch.urdu,
        durationSec: directMatch.durationSec || 1.5,
        status: 'matched',
      })
      continue
    }

    // Step 5: Stemmed/variant lookup (plurals, -ing, -ed)
    const stemmedMatch = findStemmedMatch(token, tokenToWord)
    if (stemmedMatch) {
      items.push({
        id: stemmedMatch.id,
        label: stemmedMatch.label,
        clip: stemmedMatch.clip,
        urdu: stemmedMatch.urdu,
        durationSec: stemmedMatch.durationSec || 1.5,
        status: 'matched',
      })
      continue
    }

    // Step 6: Unsupported word
    items.push({
      id: token,
      label: token,
      clip: null,
      status: 'unsupported',
    })
  }

  const matched = items.filter((item) => item.status === 'matched')
  const unsupported = items.filter((item) => item.status === 'unsupported')
  const skipped = items.filter((item) => item.status === 'skipped')

  return {
    items,
    matched,
    unsupported,
    skipped,
    isEmpty: items.length === 0,
    hasMatched: matched.length > 0,
  }
}
