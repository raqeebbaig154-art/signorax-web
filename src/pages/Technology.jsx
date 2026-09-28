import './Technology.css'

function Technology() {
  const items = [
    { title: 'MediaPipe', icon: 'M', color: 'techIconBlue', text: 'Tracks hand, face, and body landmarks from live video with high precision, forming the input signal for gesture recognition.' },
    { title: 'CNN', icon: 'C', color: 'techIconPurple', text: 'Extracts spatial features from each frame, identifying hand shapes and positions that form individual signs.' },
    { title: 'BiLSTM', icon: 'B', color: 'techIconCyan', text: 'Processes sequences of frames to understand motion and context, translating continuous sign language into text or speech.' },
    { title: '3D Avatar (Joe)', icon: 'A', color: 'techIconGradient', text: 'Converts text or speech input back into fluid, expressive sign language animation for two way communication.' }
  ]

  return (
    <section className="techSection">
      <h1 className="techHeading">The <span className="techHighlight">technology</span> behind Signorax</h1>
      <p className="techIntro">
        Signorax combines computer vision and deep learning to translate sign language in both directions, in real time.
      </p>

      <div className="techGrid">
        {items.map((item, i) => (
          <div className="techCard" key={i}>
            <div className={`techIcon ${item.color}`}>{item.icon}</div>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export default Technology