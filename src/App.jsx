import { lazy, Suspense } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Navbar from './Navbar'
import Footer from './Footer'
import './App.css'

const Home = lazy(() => import('./pages/Home'))
const Technology = lazy(() => import('./pages/Technology'))
const Contact = lazy(() => import('./pages/Contact'))
const Translate = lazy(() => import('./pages/Translate'))
const Preview = lazy(() => import('./pages/Preview'))

function App() {
  const location = useLocation()

  return (
    <div style={{ backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      <Navbar />
      <Suspense fallback={<div className="pageLoading">Loading…</div>}>
        <div key={location.pathname} className="pageTransition">
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/technology" element={<Technology />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/translate" element={<Translate />} />
            <Route path="/preview" element={<Preview />} />
          </Routes>
        </div>
      </Suspense>
      <Footer />
    </div>
  )
}

export default App