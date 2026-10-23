// Panel "Fiesta" de la página Amigos y selector de emoticonos para los chats
import { el, setKids, toast } from './pages.js'
import { t } from './i18n.js'
import * as party from './party.js'

export function partyPanel(ctx) {
  const box = el('div', { class: 'panel party' })
  const paint = ({ code, log, members }) => {
    if (!code) {
      const input = el('input', { placeholder: t('party_code'), maxlength: 10, style: 'text-transform:uppercase;flex:1' })
      return setKids(box, el('h3', { text: t('party'), style: 'margin-bottom:6px' }), el('p', { style: 'color:var(--muted);margin:0 0 10px;font-size:14px', text: t('party_help') }),
        el('div', { class: 'form-row' }, input, el('button', { class: 'btn', text: t('party_new'), onclick: () => party.joinParty(party.newCode(), ctx.profile.username) }),
          el('button', { class: 'btn blue', text: t('party_join'), onclick: () => (input.value.trim().length >= 3 ? party.joinParty(input.value, ctx.profile.username) : toast(t('room_bad'))) })))
    }
    const form = el('form', { class: 'form-row', onsubmit: e => { e.preventDefault(); const i = form.querySelector('input'); party.sendParty(i.value); i.value = '' } }, el('input', { placeholder: t('chat_ph'), maxlength: 300, autocomplete: 'off', style: 'flex:1' }), el('button', { class: 'btn blue', text: t('send') }))
    const lines = el('div', { class: 'party-log' }, log.map(m => el('div', {}, el('b', { text: m.name + ': ' }), document.createTextNode(m.text))))
    setKids(box, el('h3', { text: `${t('party')} · ${code}`, style: 'margin-bottom:6px' }), el('small', { style: 'color:var(--muted)', text: `${t('party_members')}: ${members.join(', ') || '-'}` }), lines, form, attachEmoticons(form.querySelector('input')),
      el('button', { class: 'btn', style: 'margin-top:8px', text: t('party_leave'), onclick: () => party.leaveParty() }))
    lines.scrollTop = lines.scrollHeight
  }
  const off = party.onParty(paint); paint({ code: party.partyCode(), log: [], members: [] })
  return { el: box, off }
}

const EMO = [':)', ':D', ':(', ';)', ':P', 'xD', '<3', ':O', ':3', 'o/', '\\o/', '^_^', '-_-', '>:(', 'GG', 'gl hf', '+1', 'brb']
export function attachEmoticons(input) {
  const wrap = el('div', { class: 'emo-row' }, EMO.map(e => el('button', { type: 'button', class: 'chip', text: e, onclick: () => { input.setRangeText(e + ' ', input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, 'end'); input.focus() } })))
  return wrap
}
