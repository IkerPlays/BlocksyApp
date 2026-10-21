import { gameDb } from './supabase.js'
import { listPeople } from './auth.js'

export async function renderLobby(onPlay) {
  const { data: games } = await gameDb.from('games').select('*').order('created_at')
  const box = document.getElementById('games')
  box.innerHTML = ''
  for (const g of games ?? []) {
    const el = document.createElement('div')
    el.className = 'card'
    el.innerHTML = `<div class="grow"><b></b><small></small></div><button>Jugar</button>`
    el.querySelector('b').textContent = g.name
    el.querySelector('small').textContent = g.description
    el.querySelector('button').onclick = () => onPlay(g)
    box.append(el)
  }
  const ul = document.getElementById('people')
  ul.innerHTML = ''
  for (const p of await listPeople()) {
    const li = document.createElement('li')
    li.innerHTML = `<span class="dot ${p.is_online ? 'on' : ''}"></span>`
    li.append(p.username)
    ul.append(li)
  }
}

export async function createGame(name) {
  const { error } = await gameDb.from('games').insert({ name })
  if (error) throw error
}
