import { useState } from 'react'
import { Link } from 'react-router-dom'
import './Navbar.css'

function Navbar() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <nav className="navbar">
   <Link to="/" className="navLogo" onClick={() => setIsOpen(false)}>
  <img src="img/signorax_logo.png" alt="Signorax" className="navLogoImg" />
</Link>

      <button className="navToggle" onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? '✕' : '☰'}
      </button>

      <div className={`navLinks ${isOpen ? 'navLinksOpen' : ''}`}>
        <Link to="/" className="navLink" onClick={() => setIsOpen(false)}>Home</Link>
        <Link to="/technology" className="navLink" onClick={() => setIsOpen(false)}>Technology</Link>
        <Link to="/translate" className="navLink" onClick={() => setIsOpen(false)}>Translate</Link>
        <Link to="/preview" className="navLink" onClick={() => setIsOpen(false)}>Preview</Link>
        <Link to="/contact" className="navLink" onClick={() => setIsOpen(false)}>Contact</Link>
      </div>
    </nav>
  )
}

export default Navbar