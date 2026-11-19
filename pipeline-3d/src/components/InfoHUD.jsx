import { AnimatePresence, motion } from 'framer-motion'

function EntryBlock({ entry }) {
  return (
    <li className="border-l-2 border-navy/15 pl-3">
      <p className="text-sm font-semibold text-navy">{entry.heading}</p>
      {entry.meta && <p className="text-[11px] uppercase tracking-widest text-build-deep">{entry.meta}</p>}
      {entry.text && <p className="mt-1 text-xs leading-relaxed text-navy/75">{entry.text}</p>}
      {entry.items && (
        <ul className="mt-1 space-y-0.5 text-xs text-navy/75">
          {entry.items.map((item) => (
            <li key={item}>› {item}</li>
          ))}
        </ul>
      )}
      {entry.links && (
        <ul className="mt-1 space-y-0.5 text-xs">
          {entry.links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="text-deploy-deep underline-offset-2 hover:underline"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export default function InfoHUD({ station, pinned }) {
  return (
    <AnimatePresence mode="wait">
      {station && (
        <motion.aside
          key={station.id}
          role="dialog"
          aria-label={`Información de la estación ${station.name}`}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="glass-panel pointer-events-auto absolute right-4 top-40 z-20 max-h-[calc(100vh-15rem)] w-[min(360px,calc(100vw-2rem))] overflow-y-auto p-5 md:right-8"
        >
          <header className="mb-3 flex items-start justify-between gap-3">
            <div>
              <span className="mb-2 block h-1 w-10 rounded-full" style={{ backgroundColor: station.color }} />
              <p className="text-[10px] uppercase tracking-[0.35em] text-navy/60">Estación · {station.name}</p>
              <h2 className="mt-1 text-lg font-bold text-navy">{station.subtitle}</h2>
            </div>
            {pinned && (
              <span className="rounded bg-navy px-2 py-0.5 text-[10px] text-white">
                FIJADO
              </span>
            )}
          </header>
          <ul className="space-y-4">
            {station.entries.map((entry) => (
              <EntryBlock key={entry.heading} entry={entry} />
            ))}
          </ul>
          <p className="mt-4 text-[10px] text-navy/50">Clic en la estación para fijar · clic de nuevo para soltar</p>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
