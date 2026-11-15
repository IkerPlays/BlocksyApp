// Todos los archivos de src/ deben pasar la comprobacion de sintaxis (un apostrofo sin escapar rompio el build una vez y los demas tests no lo vieron)
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
test('src/*.js tiene sintaxis valida', () => {
  const dir = new URL('../src/', import.meta.url), bad = []
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue
    const r = spawnSync(process.execPath, ['--check', new URL(f, dir).pathname], { encoding: 'utf8' })
    if (r.status !== 0) bad.push(f + ': ' + (r.stderr || '').split('\n').slice(0, 3).join(' '))
  }
  assert.deepEqual(bad, [])
})
