// Asset path → URL for this build (relative to the page). Safe to import from Node (physics tests).
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}
export const MODEL_TXT = env.VITE_MODEL_TXT === '1'
export const modelUrl = (path) => (env.BASE_URL ?? '/') + path + (MODEL_TXT ? '.b64.txt' : '')
