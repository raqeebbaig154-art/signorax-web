import Hero from '../Hero'
import Features from '../Features'
import Showcase from '../Showcase'
import Reveal from '../Reveal'

function Home() {
  return (
    <>
      <Reveal>
        <Hero />
      </Reveal>
      <Reveal>
        <Features />
      </Reveal>
      <Reveal>
        <Showcase />
      </Reveal>
    </>
  )
}

export default Home