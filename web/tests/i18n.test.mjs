import test from 'node:test'
import assert from 'node:assert/strict'
globalThis.window = { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) }
globalThis.document = { documentElement: { lang: 'es', dataset: {}, style: {} }, addEventListener() {}, querySelectorAll: () => [] }
Object.defineProperty(globalThis, 'navigator', { value: { language: 'es', languages: ['es'] }, configurable: true })
globalThis.localStorage = { getItem: () => null, setItem() {} }
const m = await import('../src/i18n.js')

test('todos los idiomas tienen todos los textos', () => {
  for (const l of ['pt', 'fr', 'de', 'it', 'pl', 'ru', 'ja', 'zh', 'ko']) assert.deepEqual(m.missingFor(l), [], `${l} sin traducir`)
})
test('las traducciones conservan los {marcadores} del inglés', () => {
  const ph = s => (String(s).match(/\{\w+\}/g) ?? []).sort().join()
  const at = (l, k) => { m.setLang(l); return m.t(k) }
  for (const k of m.allKeys()) {
    const want = ph(at('en', k))
    for (const l of ['es', 'pt', 'fr', 'de', 'it', 'pl', 'ru', 'ja', 'zh', 'ko']) assert.equal(ph(at(l, k)), want, `${l}.${k}`)
  }
})
