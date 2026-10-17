// Warm up Module 2 in the background so the first Text to Sign is fast.
const files = [
  '/models/joe.glb',
  '/animations/manifest.json',
  '/data/vocabulary.json',
  '/animations/Sign_hello.json',
  '/animations/Sign_thankyou.json',
  '/animations/Sign_help.json',
  '/animations/Sign_yes.json',
  '/animations/Sign_no.json',
  '/animations/Sign_please.json',
  '/animations/Sign_sorry.json',
]

const warm = () => {
  import('./pages/Translate.jsx').catch(() => {})
  import('./features/textToSign/components/AvatarViewer.jsx').catch(() => {})
  files.forEach((u) => fetch(u).catch(() => {}))
}

if (typeof window !== 'undefined') {
  setTimeout(warm, 300)
}