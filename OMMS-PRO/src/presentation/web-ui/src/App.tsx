import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Memories from './pages/Memories'
import Palace from './pages/Palace'
import Dreaming from './pages/Dreaming'
import Profile from './pages/Profile'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <header className="header">
          <div className="logo">
            <h1>🧠 OMMS-PRO</h1>
            <span className="subtitle">全知记忆管理系统</span>
          </div>
          <nav className="nav">
            <Link to="/" className="nav-link">仪表盘</Link>
            <Link to="/memories" className="nav-link">记忆管理</Link>
            <Link to="/palace" className="nav-link">记忆宫殿</Link>
            <Link to="/dreaming" className="nav-link">梦境引擎</Link>
            <Link to="/profile" className="nav-link">用户画像</Link>
          </nav>
        </header>
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/memories" element={<Memories />} />
            <Route path="/palace" element={<Palace />} />
            <Route path="/dreaming" element={<Dreaming />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
