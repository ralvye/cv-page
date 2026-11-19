import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import ExperienceScene from './components/ExperienceScene.jsx'
import InfoHUD from './components/InfoHUD.jsx'
import { stations } from './data/stations.js'

const MIN_LOADER_MS = 1600

function Loader({ progress }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-petrol-deep"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.6 } }}
    >
      <p className="mb-6 text-xs uppercase tracking-[0.4em] text-neon">Iniciando pipeline</p>
      <div className="h-1 w-64 overflow-hidden rounded-full bg-moss/50">
        <motion.div
          className="h-full bg-neon shadow-neon"
          initial={{ width: '0%' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
      <p className="mt-4 text-[11px] text-ink/50">BUILD → TEST → DEPLOY → PRODUCTION</p>
    </motion.div>
  )
}

export default function App() {
  const [sceneReady, setSceneReady] = useState(false)
  const [minElapsed, setMinElapsed] = useState(false)
  const [hoveredId, setHoveredId] = useState(null)
  const [pinnedId, setPinnedId] = useState(null)

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), MIN_LOADER_MS)
    return () => clearTimeout(timer)
  }, [])

  const handleReady = useCallback(() => setSceneReady(true), [])
  const handleSelect = useCallback((id) => setPinnedId((current) => (current === id ? null : id)), [])

  const loaded = sceneReady && minElapsed
  const activeId = pinnedId ?? hoveredId
  const activeStation = stations.find((station) => station.id === activeId) ?? null

  return (
    <div className="relative h-full w-full">
      <ExperienceScene
        onReady={handleReady}
        activeId={activeId}
        onHover={setHoveredId}
        onSelect={handleSelect}
      />

      <header className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-5 md:p-8">
        <div>
          <p className="text-[10px] uppercase tracking-[0.35em] text-neon">Pipeline CI/CD · Carrera profesional</p>
          <h1 className="mt-1 text-xl font-semibold text-ink md:text-2xl">Rodrigo Alvear Yevenes</h1>
          <p className="text-xs text-ink/60">Ingeniero DevOps Senior</p>
        </div>
        <span className="flex items-center gap-2 rounded border border-moss/70 bg-petrol/70 px-3 py-1 text-[10px] text-ink/70">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon shadow-neon" />
          PIPELINE ACTIVO
        </span>
      </header>

      <InfoHUD station={activeStation} pinned={pinnedId !== null} />

      <nav className="pointer-events-auto absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 gap-2 rounded-lg border border-moss/70 bg-petrol/80 p-2 backdrop-blur-md md:bottom-8">
        {stations.map((station) => {
          const isActive = activeId === station.id
          return (
            <button
              key={station.id}
              type="button"
              onMouseEnter={() => setHoveredId(station.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => handleSelect(station.id)}
              aria-pressed={pinnedId === station.id}
              className={`rounded px-3 py-1.5 text-[11px] tracking-widest transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-neon ${
                isActive ? 'bg-neon/15 text-neon shadow-neon' : 'text-ink/70 hover:text-neon'
              }`}
            >
              {station.name}
            </button>
          )
        })}
      </nav>

      <AnimatePresence>{!loaded && <Loader key="loader" progress={sceneReady ? 100 : 60} />}</AnimatePresence>
    </div>
  )
}
