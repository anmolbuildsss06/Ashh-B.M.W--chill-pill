// Model loading that works both locally (.glb) and on hosts that only serve text/web types:
// with VITE_MODEL_TXT=1 the build loads "<name>.glb.b64.txt" (the same GLB, base64-encoded) and
// decodes it in the browser before handing it to GLTFLoader.
import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export { modelUrl } from './modelUrl.js'

function decodeBase64(txt) {
  const bin = atob(txt.trim())
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

export class ModelLoader extends GLTFLoader {
  load(url, onLoad, onProgress, onError) {
    if (!url.endsWith('.b64.txt')) return super.load(url, onLoad, onProgress, onError)
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`${r.status} loading ${url}`); return r.text() })
      .then((txt) => this.parse(decodeBase64(txt), url.slice(0, url.lastIndexOf('/') + 1), onLoad, onError))
      .catch((e) => (onError ? onError(e) : console.error(e)))
  }
}

export const useModel = (url) => useLoader(ModelLoader, url)
useModel.preload = (url) => useLoader.preload(ModelLoader, url)
