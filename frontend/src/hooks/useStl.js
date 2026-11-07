import { useEffect, useState } from 'react'
import { downloadStl, parseStl } from '../lib/stl.js'

// Loads and parses one STL. Mount with key={filePath} so a new file starts from a fresh state.
export function useStl(filePath) {
  const [state, setState] = useState({ status: 'loading', progress: 0 })

  useEffect(() => {
    const controller = new AbortController()
    let geometry = null
    let lastPercent = -1

    // Re-render only when the whole percentage changes, not on every network chunk.
    const onProgress = (fraction) => {
      const percent = Math.floor(fraction * 100)
      if (percent === lastPercent) return
      lastPercent = percent
      setState((current) => ({ ...current, progress: percent }))
    }

    downloadStl(filePath, { signal: controller.signal, onProgress })
      .then(parseStl)
      .then((parsed) => {
        geometry = parsed
        setState({ status: 'ready', geometry: parsed })
      })
      .catch((err) => {
        if (!controller.signal.aborted) setState({ status: 'error', error: err.message })
      })

    return () => {
      controller.abort()
      geometry?.dispose()
    }
  }, [filePath])

  return state
}
