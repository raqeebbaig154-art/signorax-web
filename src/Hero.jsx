import { Link } from 'react-router-dom'
import './Hero.css'

function Hero() {
  return (
    <main className="heroSplit">
      <div className="textColumn">
        <h1 className="heroTitle">
        The Sign Language Interpreter That Never Leaves <span className="heroHighlight">The Room</span>.
        </h1>
        <p className="heroSubtitle">
          An app that translates in both directions. It watches a person sign and speaks what they said. It also turns speech back into sign on screen.

        </p>
        <Link to="/translate" className="heroButton">Start Now</Link>
      </div>

      <div className="visualColumn">
        <div className="avatarPlaceholder">
          <div className="pulseRing"></div>
          <div className="pulseRing pulseRingDelay"></div>
          <div className="avatarCore">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 12c2.5 0 4.5-2 4.5-4.5S14.5 3 12 3 7.5 5 7.5 7.5 9.5 12 12 12z" stroke="white" strokeWidth="1.5"/>
              <path d="M4 21v-1c0-3.5 3.5-6 8-6s8 2.5 8 6v1" stroke="white" strokeWidth="1.5"/>
            </svg>
          </div>
          <p className="avatarLabel">Joe 3D Avatar Preview Coming Soon</p>
        </div>
      </div>
    </main>
  )
}

export default Hero