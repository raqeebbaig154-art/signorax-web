import './Preview.css'

function Preview() {
  return (
    <section className="previewSection">
      <h1 className="previewHeading">See <span className="previewHighlight">Signorax</span> in action</h1>
      <p className="previewSubheading">A preview of how translation looks on both sides</p>

      <div className="previewBlock">
        <h2 className="previewBlockHeading">Text to Sign</h2>
        <p className="previewBlockNote">A sample walkthrough of Joe signing translated phrases.</p>
        <div className="previewVideoCard">
          <div className="previewVideoPlaceholder">Video preview</div>
        </div>
      </div>

      <div className="previewBlock">
        <h2 className="previewBlockHeading">Sign to Text</h2>
        <p className="previewBlockNote">A sample walkthrough of camera based sign recognition.</p>
        <div className="previewVideoCard">
          <div className="previewVideoPlaceholder">Video preview</div>
        </div>
      </div>
    </section>
  )
}

export default Preview