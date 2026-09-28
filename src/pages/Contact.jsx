import { useState, useRef } from 'react'
import emailjs from '@emailjs/browser'
import './Contact.css'

const COOLDOWN_MS = 30000

function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    institution: '',
    message: '',
    website: '',
  })
  const [status, setStatus] = useState('idle')
  const lastSentRef = useRef(0)

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    // Trap field: real people never see it, bots fill it in
    if (formData.website) {
      setStatus('success')
      return
    }

    // Cooldown: block repeat sends within 30 seconds
    if (Date.now() - lastSentRef.current < COOLDOWN_MS) {
      setStatus('wait')
      return
    }

    setStatus('sending')

    const cleanData = {
      name: formData.name.trim(),
      email: formData.email.trim(),
      institution: formData.institution.trim(),
      message: formData.message.trim(),
    }

    emailjs
      .send(
        import.meta.env.VITE_EMAILJS_SERVICE_ID,
        import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
        cleanData,
        import.meta.env.VITE_EMAILJS_PUBLIC_KEY
      )
      .then(() => {
        lastSentRef.current = Date.now()
        setStatus('success')
        setFormData({
          name: '',
          email: '',
          institution: '',
          message: '',
          website: '',
        })
      })
      .catch(() => {
        setStatus('error')
      })
  }

  return (
    <section className="contactSection">
      <h1 className="contactHeading">Tell Us Where You Work</h1>
      <p className="contactIntro">
        This isn't a mailing list. A real person reads every message here and
        writes back.
      </p>

      <form className="contactForm" onSubmit={handleSubmit}>
        <input
          type="text"
          name="name"
          placeholder="Full name"
          className="contactInput"
          value={formData.name}
          onChange={handleChange}
          maxLength={80}
          required
        />
        <input
          type="email"
          name="email"
          placeholder="Email address"
          className="contactInput"
          value={formData.email}
          onChange={handleChange}
          maxLength={120}
          required
        />
        <input
          type="text"
          name="institution"
          placeholder="Institution name"
          className="contactInput"
          value={formData.institution}
          onChange={handleChange}
          maxLength={120}
          required
        />
        <textarea
          name="message"
          placeholder="Tell us about your use case"
          className="contactTextarea"
          rows="5"
          value={formData.message}
          onChange={handleChange}
          maxLength={1000}
          required
        ></textarea>

        <input
          type="text"
          name="website"
          className="contactHoneypot"
          value={formData.website}
          onChange={handleChange}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />

        <button
          type="submit"
          className="contactButton"
          disabled={status === 'sending'}
        >
          {status === 'sending' ? 'Sending...' : 'Send request'}
        </button>

        {status === 'success' && (
          <p className="contactSuccess">Thanks! Your request has been sent.</p>
        )}
        {status === 'wait' && (
          <p className="contactError">
            Please wait a few seconds before sending another message.
          </p>
        )}
        {status === 'error' && (
          <p className="contactError">
            Something went wrong. Please try again.
          </p>
        )}
      </form>
    </section>
  )
}

export default Contact