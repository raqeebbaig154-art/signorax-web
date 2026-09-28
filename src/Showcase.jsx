import { useState } from 'react'
import './Showcase.css'

function Showcase() {
  const [activeTab, setActiveTab] = useState('healthcare')

  const content = {
    healthcare: {
      title: 'Healthcare',
      heading: 'Bridging patient communication in real time',
      description: 'Deaf and hard of hearing patients communicate directly with doctors and nurses without waiting for a human interpreter. Joe translates spoken diagnosis and instructions into sign language instantly, and reads patient signs back into text or speech.',
      points: ['Emergency room intake', 'Doctor consultations', 'Discharge instructions']
    },
    education: {
      title: 'Education',
      heading: 'Inclusive classrooms without delay',
      description: 'Deaf students follow lectures live as Joe translates the teacher speech into sign language on a classroom screen. Questions and answers translate both directions, keeping the whole class in sync without a dedicated interpreter present.',
      points: ['Live lecture translation', 'Student question relay', 'Exam instruction support']
    }
  }

  const active = content[activeTab]

  return (
    <section className="showcaseSection">
      <h2 className="showcaseHeading">Built for real institutions</h2>
      <p className="showcaseSubheading">See how Signorax fits into environments that need it most</p>

      <div className="showcaseTabs">
        <button
          className={`showcaseTab ${activeTab === 'healthcare' ? 'showcaseTabActive' : ''}`}
          onClick={() => setActiveTab('healthcare')}
        >
          Healthcare
        </button>
        <button
          className={`showcaseTab ${activeTab === 'education' ? 'showcaseTabActive' : ''}`}
          onClick={() => setActiveTab('education')}
        >
          Education
        </button>
      </div>

      <div className="showcaseContent">
        <div className="showcaseText">
          <h3 className="showcaseContentHeading">{active.heading}</h3>
          <p className="showcaseDescription">{active.description}</p>
          <ul className="showcasePoints">
            {active.points.map((point, i) => (
              <li key={i} className="showcasePoint">{point}</li>
            ))}
          </ul>
        </div>
        <div className="showcaseVisual">
          <div className="showcaseVisualPlaceholder">{active.title}</div>
        </div>
      </div>
    </section>
  )
}

export default Showcase