import { Component } from 'react'
import Game from './Game.jsx'
import HUD from './ui/HUD.jsx'
import { Intro, MainMenu, PauseMenu, Showroom } from './ui/Menus.jsx'
import TouchControls from './ui/TouchControls.jsx'
import { useGame } from './store/useGame.js'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-hz-ink p-8">
          <div className="max-w-lg font-body">
            <div className="font-display italic font-extrabold text-4xl mb-2">SOMETHING BROKE</div>
            <div className="text-white/70 text-sm mb-4">{String(this.state.error?.message || this.state.error)}</div>
            <div className="text-white/50 text-xs">WebGL 2 is required. Try updating your browser or enabling hardware acceleration, then reload.</div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const phase = useGame((s) => s.phase)
  const touchControls = useGame((s) => s.touchControls)
  return (
    <ErrorBoundary>
      <div className="relative h-full w-full">
        <Game />
        {phase === 'intro' && <Intro />}
        {phase === 'menu' && <MainMenu />}
        {(phase === 'playing' || phase === 'paused') && <HUD />}
        {phase === 'playing' && touchControls && <TouchControls />}
        {phase === 'paused' && <PauseMenu />}
        {phase === 'showroom' && <Showroom />}
      </div>
    </ErrorBoundary>
  )
}
