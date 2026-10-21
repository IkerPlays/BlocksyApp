// Iconos SVG de línea (sin emojis). Uso: icon('home') devuelve el SVG como texto; applyIcons() rellena los <i data-icon="...">.
const P = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.6-3.6 3.6-5.4 7-5.4s6.4 1.8 7 5.4"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.5-3.2 3-4.8 6-4.8s5.5 1.6 6 4.8"/><circle cx="17" cy="9.5" r="2.5"/><path d="M17 14.5c2.3.2 3.8 1.5 4.2 4"/>',
  device: '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/>',
  plus: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M12 8v8M8 12h8"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  logout: '<path d="M10 4.5H5.5v15H10"/><path d="m15.5 8 4 4-4 4"/><path d="M19.5 12H9.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  chat: '<path d="M4 5.5h16v10H12l-4.5 4v-4H4z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  back: '<path d="M14.5 6 8.5 12l6 6"/>',
  emote: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.2c1 1.6 2.2 2.3 3.5 2.3s2.5-.7 3.5-2.3"/><path d="M9 9.5h.01M15 9.5h.01"/>',
  bell: '<path d="M6 17.5V11a6 6 0 0 1 12 0v6.5l1.5 1.5h-15z"/><path d="M10 21h4"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  mute: '<path d="M4 9.5v5h3.5l5 4v-13l-5 4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  next: '<path d="M6 5.5v13l9-6.5z"/><path d="M18 5.5v13"/>',
  prev: '<path d="M18 5.5v13l-9-6.5z"/><path d="M6 5.5v13"/>',
  send: '<path d="m4 12 16-7-6 15-2.5-6z"/>',
  camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  flag: '<path d="M6 21V4"/><path d="M6 5h11l-2.5 3.5L17 12H6"/>',
  fly: '<path d="M3 12c4-6 14-6 18 0-4 6-14 6-18 0z"/><circle cx="12" cy="12" r="2.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 10 18.7l1-1"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
  code: '<path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4M13.5 6l-3 12"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8z"/>',
};
export function icon(name, size = 20) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`
}
export function applyIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 20)
}
