import './Features.css'

function Features() {
  return (
    <section className="featuresContainer">
      <h2 className="featuresTitle">Built for true connection</h2>
      <div className="featuresGrid">
        
        <div className="featureCard">
          <div className="featureIcon"></div>
          <h3 className="featureCardTitle">Bidirectional Translation</h3>
          <p className="featureText">Seamlessly bridge the gap across regional sign languages with rapid accurate processing.</p>
        </div>

        <div className="featureCard">
          <div className="featureIcon"></div>
          <h3 className="featureCardTitle">Meet Joe</h3>
          <p className="featureText">Joe delivers fluid and natural gestures, bringing authentic expression to every interaction.</p>
        </div>

        <div className="featureCard">
          <div className="featureIcon"></div>
          <h3 className="featureCardTitle">Institutional Licensing</h3>
          <p className="featureText">Made to run every single day inside hospitals, schools, and public offices. Not a demo. A tool people can actually depend on.</p>
        </div>

      </div>
    </section>
  )
}

export default Features