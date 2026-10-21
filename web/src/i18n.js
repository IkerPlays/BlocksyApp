// Idiomas: es (base), en, pt, fr, de. t('clave', {x}) con {x} como variable; si falta, cae a inglés y luego a español.
const D = {
  es: {
    lang_name: 'Español',
    nav_profile: 'Perfil', p_joined: 'Se unió el {date}', p_friends: 'Amigos', p_games: 'Juegos creados', p_no_bio: 'Sin biografía todavía.', p_bio_ph: 'Escribe algo sobre ti...', p_edit_avatar: 'Editar avatar', p_edit_bio: 'Editar biografía', p_not_found: 'Este usuario no existe', p_no_games: 'Aún no ha creado juegos.', p_you: 'Tu perfil', p_copy: 'Copiar enlace del perfil',
    nav_home: 'Inicio', nav_discover: 'Descubrir', nav_avatar: 'Avatar', nav_friends: 'Amigos', nav_link: 'Vincular 3DS', nav_create: 'Crear', nav_settings: 'Ajustes', nav_logout: 'Salir',
    search_games: 'Buscar juegos', loading: 'Cargando...', see_all: 'Ver todo', close: 'Cerrar', cancel: 'Cancelar', save: 'Guardar', saved: 'Guardado', delete: 'Borrar', play: 'Jugar', back: 'Volver', send: 'Enviar', yes: 'Sí', no: 'No',
    tagline: 'Construye, explora y juega con amigos en la web y en tu 3DS.',
    login: 'Entrar', signup: 'Crear cuenta', username: 'Nombre de usuario', email: 'Email', password: 'Contraseña', username_hint: '3-20 letras, números o _',
    account_created: 'Cuenta creada. Confirma tu email y vuelve a entrar.',
    hello: '¡Hola, {name}!', friends_n: 'Amigos ({n})', home_no_friends: 'Añade amigos desde la sección Amigos para verlos aquí.', continue: 'Continuar', popular: 'Populares ahora', newest: 'Nuevos', no_games: 'No hay juegos todavía.',
    playing_n: '{n} jugando', by: 'por {name}', max_players: 'máx. jugadores', platforms: 'plataformas', no_desc: 'Sin descripción.', mode_build: 'Construir', mode_social: 'Social', mode_obby: 'Carrera', mode_arena: 'Arena', mode: 'Tipo',
    mode_build_d: 'Mundo para construir y explorar', mode_social_d: 'Charla, emotes y música; sin construir', mode_obby_d: 'Parkour con meta y puntos de control', mode_arena_d: 'Modo libre con reglas por script',
    status_game: 'En un juego', status_online: 'Online', status_offline: 'Desconectado',
    discover: 'Descubrir', search_ph: 'Buscar juegos...',
    avatar: 'Avatar', avatar_help: 'Elige el color de tu camiseta. Tu avatar se ve igual en la web y en la 3DS. Arrastra el modelo para girarlo.', try_emotes: 'Probar emotes', still: 'Quieto', avatar_saved: 'Avatar guardado',
    emote_wave: 'Saludar', emote_dance: 'Bailar', emote_cheer: 'Celebrar', emote_clap: 'Aplaudir', emote_sit: 'Sentarse',
    friends: 'Amigos', add_friend: 'Añadir amigo', friend_ph: 'Nombre de usuario exacto', friend_add_btn: 'Enviar solicitud', friend_help: 'Escribe el nombre de usuario exacto de tu amigo. Tendrá que aceptar tu solicitud.',
    req_sent: 'Solicitud enviada a {name}', req_already: 'Ya le enviaste una solicitud', req_friends: 'Ya sois amigos', req_accepted: '¡Ahora eres amigo de {name}!', user_not_found: 'No existe ningún usuario con ese nombre', cant_self: 'No puedes añadirte a ti mismo',
    requests_in: 'Solicitudes recibidas', requests_out: 'Solicitudes enviadas', accept: 'Aceptar', decline: 'Rechazar', cancel_req: 'Cancelar', remove: 'Quitar', chat: 'Chat', invite: 'Invitar', join: 'Unirse', my_friends: 'Mis amigos ({n})', no_friends: 'Aún no tienes amigos.', confirm_remove: '¿Quitar a {name} de tus amigos?',
    chat_with: 'Chat con {name}', chat_empty: 'Aún no hay mensajes. ¡Saluda!', chat_ph: 'Escribe un mensaje...',
    notifications: 'Notificaciones', notif_none: 'No tienes notificaciones.', notif_clear: 'Borrar todas',
    n_friend_request: '{name} quiere ser tu amigo', n_friend_accept: '{name} aceptó tu solicitud', n_invite: '{name} te invita a {game}', n_message: 'Mensaje de {name}', n_msg_unread: '{n} mensajes sin leer',
    invite_title: 'Invitar amigos', invite_none: 'No tienes amigos conectados ahora.', invite_sent: 'Invitación enviada a {name}', invite_game_gone: 'Ese juego ya no existe',
    create: 'Crear', create_new: 'Nuevo juego', game_name: 'Nombre del juego', game_desc: 'Descripción (opcional)', cover_color: 'Color de portada', create_btn: 'Crear juego', my_games: 'Mis juegos', no_my_games: 'Todavía no has creado ningún juego.', game_created: 'Juego creado', confirm_delete: '¿Borrar "{name}"?', edit: 'Editar',
    editor: 'Editor', ed_general: 'General', ed_rules: 'Reglas', ed_world: 'Mundo', ed_script: 'Código', ed_code: 'Código', ed_players: 'Jugadores máx.', ed_allow_build: 'Los jugadores pueden construir', ed_allow_chat: 'Chat activado', ed_allow_emotes: 'Emotes activados', ed_welcome: 'Mensaje de bienvenida', ed_spawn: 'Punto de aparición', ed_sky: 'Cielo', ed_time: 'Hora del día (0-24, 0 = ciclo automático)', ed_gravity: 'Gravedad', ed_speed: 'Velocidad', ed_jump: 'Salto', ed_terrain: 'Terreno inicial', ed_music: 'Música del juego',
    sky_day: 'Día', sky_sunset: 'Atardecer', sky_night: 'Noche', sky_space: 'Espacio',
    ter_flat: 'Llanura', ter_hills: 'Colinas', ter_islands: 'Islas', ter_void: 'Vacío', ter_plaza: 'Plaza', ter_obby: 'Carrera', ter_checker: 'Tablero',
    ed_script_help: 'Código JavaScript que se ejecuta aislado en un Worker. Eventos: on("join"), on("chat"), on("command"), on("tick"). Acciones: say, title, teleport, setSpeed, setJump, setGravity, emote, sky, sound.',
    ed_examples: 'Ejemplos', ed_check: 'Comprobar código', ed_ok: 'El código es válido', ed_saved: 'Juego guardado', ed_lines: '{n} líneas',
    link_title: 'Vincular 3DS', link_code_ph: 'Código de la pantalla de tu 3DS (6 letras)', link_auth: 'Autorizar este dispositivo', link_6: 'El código tiene 6 caracteres', link_busy: 'Autorizando...', link_done: '¡Listo!', link_done_p: 'Tu 3DS ya ha iniciado sesión como {name}. Puedes volver a la consola.', link_go_home: 'Ir al inicio', link_bad: 'Código no válido o caducado. Pide uno nuevo en la 3DS.',
    link_ask: 'Una 3DS quiere iniciar sesión como {name}. Si has sido tú, autorízala.', link_help: 'En la 3DS elige «Con QR», escanea el código con la cámara del móvil o escribe aquí el código de 6 caracteres que aparece en la consola.',
    controls: 'Controles y HUD', settings: 'Ajustes', set_language: 'Idioma', set_sens: 'Sensibilidad de cámara', set_dist: 'Distancia de visión', set_names: 'Mostrar nombres sobre los jugadores', set_quality: 'Calidad gráfica', q_low: 'Baja', q_med: 'Media', q_high: 'Alta', q_ultra: 'Ultra',
    set_music: 'Música en los juegos', set_music_vol: 'Volumen de la música', set_sfx: 'Efectos de sonido', set_sfx_vol: 'Volumen de efectos', set_shuffle: 'Orden aleatorio', set_fov: 'Campo de visión', set_bubbles: 'Burbujas de chat sobre los jugadores', set_clouds: 'Nubes y ambiente', set_minimap: 'Minimapa', set_fps: 'Mostrar fps y coordenadas', set_notif: 'Avisos de notificaciones', set_invert: 'Invertir eje Y de la cámara', set_shadows: 'Sombras', set_bloom: 'Brillo (bloom)', set_motion: 'Reducir movimiento', set_touch_size: 'Tamaño de controles táctiles', set_left: 'Joystick a la derecha (zurdos)', set_reset: 'Restablecer ajustes',
    set_theme: 'Tema', theme_dark: 'Oscuro', theme_light: 'Claro', set_accent: 'Color de acento', set_stats: 'Tus estadísticas', stat_time: 'Tiempo jugado', stat_placed: 'Bloques puestos', stat_broken: 'Bloques rotos', stat_games: 'Juegos visitados', stat_msgs: 'Mensajes enviados',
    set_install: 'Instalar la app', set_installed: 'La app ya está instalada', set_notif_perm: 'Notificaciones del sistema',
    mute: 'Silenciar', unmute: 'Activar sonido', next_track: 'Siguiente canción', prev_track: 'Anterior', now_playing: 'Sonando', no_music: 'Sin música (añade archivos a la carpeta playlist)',
    welcome_to: 'Bienvenido a {name}', joined: '{name} se unió', left: '{name} salió', players_n: '{n} jugando', you: '(tú)', paused: 'Pausa', resume: 'Continuar', leave_game: 'Salir del juego', invite_friends: 'Invitar amigos', screenshot: 'Captura', screenshot_saved: 'Captura guardada', copy_link: 'Copiar enlace', link_copied: 'Enlace copiado',
    chat_hint: 'Pulsa / para chatear', place: 'Poner', break: 'Romper', jump: 'Saltar', fly_on: 'Vuelo activado', fly_off: 'Vuelo desactivado', build_off: 'En este juego no se puede construir', chat_off: 'El chat está desactivado en este juego',
    controls_help: 'WASD mover, Mayús correr, Espacio saltar (doble salto = volar con F). Arrastra para girar la cámara. Clic poner, clic derecho romper. 1-6 elige bloque. G emotes, / chat, Tab jugadores, M música, P captura, Esc menú.',
    checkpoint: 'Punto de control', finish: '¡Meta! Tiempo: {t}', fell: 'Has caído', best: 'Mejor tiempo',
    err_game_server: 'Servidor de juego: {msg}', copy: 'Copiar', lang_hint: 'El idioma se aplica al instante.',
    update_available: 'Hay una versión nueva. Recarga para actualizar.', reload: 'Recargar', offline_ready: 'Lista para usarse sin conexión',
  },
  en: {
    lang_name: 'English',
    nav_profile: 'Profile', p_joined: 'Joined {date}', p_friends: 'Friends', p_games: 'Created games', p_no_bio: 'No bio yet.', p_bio_ph: 'Write something about yourself...', p_edit_avatar: 'Edit avatar', p_edit_bio: 'Edit bio', p_not_found: 'This user does not exist', p_no_games: 'No games created yet.', p_you: 'Your profile', p_copy: 'Copy profile link',
    nav_home: 'Home', nav_discover: 'Discover', nav_avatar: 'Avatar', nav_friends: 'Friends', nav_link: 'Link 3DS', nav_create: 'Create', nav_settings: 'Settings', nav_logout: 'Log out',
    search_games: 'Search games', loading: 'Loading...', see_all: 'See all', close: 'Close', cancel: 'Cancel', save: 'Save', saved: 'Saved', delete: 'Delete', play: 'Play', back: 'Back', send: 'Send', yes: 'Yes', no: 'No',
    tagline: 'Build, explore and play with friends on the web and on your 3DS.',
    login: 'Log in', signup: 'Sign up', username: 'Username', email: 'Email', password: 'Password', username_hint: '3-20 letters, numbers or _',
    account_created: 'Account created. Confirm your email and log in.',
    hello: 'Hi, {name}!', friends_n: 'Friends ({n})', home_no_friends: 'Add friends from the Friends section to see them here.', continue: 'Continue', popular: 'Popular now', newest: 'New', no_games: 'No games yet.',
    playing_n: '{n} playing', by: 'by {name}', max_players: 'max players', platforms: 'platforms', no_desc: 'No description.', mode_build: 'Build', mode_social: 'Social', mode_obby: 'Obby', mode_arena: 'Arena', mode: 'Type',
    mode_build_d: 'World to build and explore', mode_social_d: 'Chat, emotes and music; no building', mode_obby_d: 'Parkour with a finish line and checkpoints', mode_arena_d: 'Free mode with script-driven rules',
    status_game: 'In a game', status_online: 'Online', status_offline: 'Offline',
    discover: 'Discover', search_ph: 'Search games...',
    avatar: 'Avatar', avatar_help: 'Pick your shirt color. Your avatar looks the same on the web and on the 3DS. Drag the model to rotate it.', try_emotes: 'Try emotes', still: 'Idle', avatar_saved: 'Avatar saved',
    emote_wave: 'Wave', emote_dance: 'Dance', emote_cheer: 'Cheer', emote_clap: 'Clap', emote_sit: 'Sit',
    friends: 'Friends', add_friend: 'Add friend', friend_ph: 'Exact username', friend_add_btn: 'Send request', friend_help: "Type your friend's exact username. They will have to accept your request.",
    req_sent: 'Request sent to {name}', req_already: 'You already sent a request', req_friends: 'You are already friends', req_accepted: 'You are now friends with {name}!', user_not_found: 'No user with that name', cant_self: "You can't add yourself",
    requests_in: 'Received requests', requests_out: 'Sent requests', accept: 'Accept', decline: 'Decline', cancel_req: 'Cancel', remove: 'Remove', chat: 'Chat', invite: 'Invite', join: 'Join', my_friends: 'My friends ({n})', no_friends: 'You have no friends yet.', confirm_remove: 'Remove {name} from your friends?',
    chat_with: 'Chat with {name}', chat_empty: 'No messages yet. Say hi!', chat_ph: 'Write a message...',
    notifications: 'Notifications', notif_none: 'You have no notifications.', notif_clear: 'Clear all',
    n_friend_request: '{name} wants to be your friend', n_friend_accept: '{name} accepted your request', n_invite: '{name} invites you to {game}', n_message: 'Message from {name}', n_msg_unread: '{n} unread messages',
    invite_title: 'Invite friends', invite_none: 'None of your friends are online right now.', invite_sent: 'Invitation sent to {name}', invite_game_gone: 'That game no longer exists',
    create: 'Create', create_new: 'New game', game_name: 'Game name', game_desc: 'Description (optional)', cover_color: 'Cover color', create_btn: 'Create game', my_games: 'My games', no_my_games: "You haven't created any games yet.", game_created: 'Game created', confirm_delete: 'Delete "{name}"?', edit: 'Edit',
    editor: 'Editor', ed_general: 'General', ed_rules: 'Rules', ed_world: 'World', ed_script: 'Code', ed_code: 'Code', ed_players: 'Max players', ed_allow_build: 'Players can build', ed_allow_chat: 'Chat enabled', ed_allow_emotes: 'Emotes enabled', ed_welcome: 'Welcome message', ed_spawn: 'Spawn point', ed_sky: 'Sky', ed_time: 'Time of day (0-24, 0 = automatic cycle)', ed_gravity: 'Gravity', ed_speed: 'Speed', ed_jump: 'Jump', ed_terrain: 'Starting terrain', ed_music: 'Game music',
    sky_day: 'Day', sky_sunset: 'Sunset', sky_night: 'Night', sky_space: 'Space',
    ter_flat: 'Flatland', ter_hills: 'Hills', ter_islands: 'Islands', ter_void: 'Void', ter_plaza: 'Plaza', ter_obby: 'Obby course', ter_checker: 'Checkerboard',
    ed_script_help: 'JavaScript that runs sandboxed in a Worker. Events: on("join"), on("chat"), on("command"), on("tick"). Actions: say, title, teleport, setSpeed, setJump, setGravity, emote, sky, sound.',
    ed_examples: 'Examples', ed_check: 'Check code', ed_ok: 'The code is valid', ed_saved: 'Game saved', ed_lines: '{n} lines',
    link_title: 'Link 3DS', link_code_ph: 'Code shown on your 3DS screen (6 letters)', link_auth: 'Authorize this device', link_6: 'The code has 6 characters', link_busy: 'Authorizing...', link_done: 'Done!', link_done_p: 'Your 3DS is now logged in as {name}. You can go back to the console.', link_go_home: 'Go home', link_bad: 'Invalid or expired code. Ask for a new one on the 3DS.',
    link_ask: 'A 3DS wants to log in as {name}. If it was you, authorize it.', link_help: 'On the 3DS choose "With QR", scan the code with your phone camera or type the 6-character code shown on the console here.',
    controls: 'Controls and HUD', settings: 'Settings', set_language: 'Language', set_sens: 'Camera sensitivity', set_dist: 'View distance', set_names: 'Show names above players', set_quality: 'Graphics quality', q_low: 'Low', q_med: 'Medium', q_high: 'High', q_ultra: 'Ultra',
    set_music: 'Music in games', set_music_vol: 'Music volume', set_sfx: 'Sound effects', set_sfx_vol: 'Effects volume', set_shuffle: 'Shuffle', set_fov: 'Field of view', set_bubbles: 'Chat bubbles above players', set_clouds: 'Clouds and ambience', set_minimap: 'Minimap', set_fps: 'Show fps and coordinates', set_notif: 'Notification pop-ups', set_invert: 'Invert camera Y axis', set_shadows: 'Shadows', set_bloom: 'Glow (bloom)', set_motion: 'Reduce motion', set_touch_size: 'Touch controls size', set_left: 'Joystick on the right (left-handed)', set_reset: 'Reset settings',
    set_theme: 'Theme', theme_dark: 'Dark', theme_light: 'Light', set_accent: 'Accent color', set_stats: 'Your stats', stat_time: 'Time played', stat_placed: 'Blocks placed', stat_broken: 'Blocks broken', stat_games: 'Games visited', stat_msgs: 'Messages sent',
    set_install: 'Install the app', set_installed: 'The app is already installed', set_notif_perm: 'System notifications',
    mute: 'Mute', unmute: 'Unmute', next_track: 'Next song', prev_track: 'Previous', now_playing: 'Now playing', no_music: 'No music (add files to the playlist folder)',
    welcome_to: 'Welcome to {name}', joined: '{name} joined', left: '{name} left', players_n: '{n} playing', you: '(you)', paused: 'Paused', resume: 'Resume', leave_game: 'Leave game', invite_friends: 'Invite friends', screenshot: 'Screenshot', screenshot_saved: 'Screenshot saved', copy_link: 'Copy link', link_copied: 'Link copied',
    chat_hint: 'Press / to chat', place: 'Place', break: 'Break', jump: 'Jump', fly_on: 'Flying on', fly_off: 'Flying off', build_off: 'Building is disabled in this game', chat_off: 'Chat is disabled in this game',
    controls_help: 'WASD move, Shift sprint, Space jump (double jump = fly with F). Drag to turn the camera. Click place, right click break. 1-6 pick block. G emotes, / chat, Tab players, M music, P screenshot, Esc menu.',
    checkpoint: 'Checkpoint', finish: 'Finish! Time: {t}', fell: 'You fell', best: 'Best time',
    err_game_server: 'Game server: {msg}', copy: 'Copy', lang_hint: 'The language applies instantly.',
    update_available: 'A new version is available. Reload to update.', reload: 'Reload', offline_ready: 'Ready to use offline',
  },
  pt: {
    lang_name: 'Português',
    nav_home: 'Início', nav_discover: 'Descobrir', nav_avatar: 'Avatar', nav_friends: 'Amigos', nav_link: 'Vincular 3DS', nav_create: 'Criar', nav_settings: 'Ajustes', nav_logout: 'Sair',
    search_games: 'Buscar jogos', loading: 'Carregando...', see_all: 'Ver tudo', close: 'Fechar', cancel: 'Cancelar', save: 'Salvar', saved: 'Salvo', delete: 'Apagar', play: 'Jogar', back: 'Voltar', send: 'Enviar',
    tagline: 'Construa, explore e jogue com amigos na web e no seu 3DS.',
    login: 'Entrar', signup: 'Criar conta', username: 'Nome de usuário', email: 'Email', password: 'Senha',
    hello: 'Olá, {name}!', friends_n: 'Amigos ({n})', continue: 'Continuar', popular: 'Populares agora', newest: 'Novos', no_games: 'Ainda não há jogos.', playing_n: '{n} jogando', by: 'por {name}',
    status_game: 'Em um jogo', status_online: 'Online', status_offline: 'Offline', discover: 'Descobrir',
    friends: 'Amigos', add_friend: 'Adicionar amigo', friend_ph: 'Nome de usuário exato', friend_add_btn: 'Enviar pedido', friend_help: 'Digite o nome de usuário exato do seu amigo. Ele terá que aceitar o pedido.',
    req_sent: 'Pedido enviado para {name}', req_friends: 'Vocês já são amigos', req_accepted: 'Agora você é amigo de {name}!', user_not_found: 'Nenhum usuário com esse nome',
    requests_in: 'Pedidos recebidos', requests_out: 'Pedidos enviados', accept: 'Aceitar', decline: 'Recusar', remove: 'Remover', chat: 'Chat', invite: 'Convidar', join: 'Entrar', my_friends: 'Meus amigos ({n})', no_friends: 'Você ainda não tem amigos.',
    chat_with: 'Chat com {name}', chat_ph: 'Escreva uma mensagem...', notifications: 'Notificações', notif_none: 'Você não tem notificações.',
    n_friend_request: '{name} quer ser seu amigo', n_friend_accept: '{name} aceitou seu pedido', n_invite: '{name} convida você para {game}',
    create: 'Criar', settings: 'Ajustes', set_language: 'Idioma', set_sens: 'Sensibilidade da câmera', set_dist: 'Distância de visão', set_names: 'Mostrar nomes sobre os jogadores', set_music: 'Música nos jogos', set_music_vol: 'Volume da música',
    paused: 'Pausa', resume: 'Continuar', leave_game: 'Sair do jogo', invite_friends: 'Convidar amigos', place: 'Colocar', break: 'Quebrar', jump: 'Pular', welcome_to: 'Bem-vindo a {name}', joined: '{name} entrou', left: '{name} saiu', players_n: '{n} jogando', you: '(você)',
  },
  fr: {
    lang_name: 'Français',
    nav_home: 'Accueil', nav_discover: 'Découvrir', nav_avatar: 'Avatar', nav_friends: 'Amis', nav_link: 'Lier la 3DS', nav_create: 'Créer', nav_settings: 'Réglages', nav_logout: 'Déconnexion',
    search_games: 'Chercher des jeux', loading: 'Chargement...', see_all: 'Tout voir', close: 'Fermer', cancel: 'Annuler', save: 'Enregistrer', saved: 'Enregistré', delete: 'Supprimer', play: 'Jouer', back: 'Retour', send: 'Envoyer',
    tagline: 'Construis, explore et joue avec tes amis sur le web et sur ta 3DS.',
    login: 'Connexion', signup: 'Créer un compte', username: "Nom d'utilisateur", email: 'Email', password: 'Mot de passe',
    hello: 'Salut, {name} !', friends_n: 'Amis ({n})', continue: 'Continuer', popular: 'Populaires', newest: 'Nouveaux', no_games: 'Aucun jeu pour le moment.', playing_n: '{n} en jeu', by: 'par {name}',
    status_game: 'Dans un jeu', status_online: 'En ligne', status_offline: 'Hors ligne', discover: 'Découvrir',
    friends: 'Amis', add_friend: 'Ajouter un ami', friend_ph: "Nom d'utilisateur exact", friend_add_btn: 'Envoyer la demande', friend_help: "Écris le nom d'utilisateur exact de ton ami. Il devra accepter ta demande.",
    req_sent: 'Demande envoyée à {name}', req_friends: 'Vous êtes déjà amis', req_accepted: 'Tu es maintenant ami avec {name} !', user_not_found: 'Aucun utilisateur avec ce nom',
    requests_in: 'Demandes reçues', requests_out: 'Demandes envoyées', accept: 'Accepter', decline: 'Refuser', remove: 'Retirer', chat: 'Chat', invite: 'Inviter', join: 'Rejoindre', my_friends: 'Mes amis ({n})', no_friends: "Tu n'as pas encore d'amis.",
    chat_with: 'Chat avec {name}', chat_ph: 'Écris un message...', notifications: 'Notifications', notif_none: "Tu n'as aucune notification.",
    n_friend_request: '{name} veut être ton ami', n_friend_accept: '{name} a accepté ta demande', n_invite: '{name} t\'invite dans {game}',
    create: 'Créer', settings: 'Réglages', set_language: 'Langue', set_sens: 'Sensibilité de la caméra', set_dist: 'Distance de vue', set_names: 'Afficher les noms', set_music: 'Musique dans les jeux', set_music_vol: 'Volume de la musique',
    paused: 'Pause', resume: 'Reprendre', leave_game: 'Quitter le jeu', invite_friends: 'Inviter des amis', place: 'Poser', break: 'Casser', jump: 'Sauter', welcome_to: 'Bienvenue dans {name}', joined: '{name} est arrivé', left: '{name} est parti', players_n: '{n} en jeu', you: '(toi)',
  },
  de: {
    lang_name: 'Deutsch',
    nav_home: 'Start', nav_discover: 'Entdecken', nav_avatar: 'Avatar', nav_friends: 'Freunde', nav_link: '3DS verknüpfen', nav_create: 'Erstellen', nav_settings: 'Einstellungen', nav_logout: 'Abmelden',
    search_games: 'Spiele suchen', loading: 'Lädt...', see_all: 'Alle ansehen', close: 'Schließen', cancel: 'Abbrechen', save: 'Speichern', saved: 'Gespeichert', delete: 'Löschen', play: 'Spielen', back: 'Zurück', send: 'Senden',
    tagline: 'Baue, erkunde und spiele mit Freunden im Web und auf deinem 3DS.',
    login: 'Anmelden', signup: 'Konto erstellen', username: 'Benutzername', email: 'E-Mail', password: 'Passwort',
    hello: 'Hallo, {name}!', friends_n: 'Freunde ({n})', continue: 'Weiter', popular: 'Gerade beliebt', newest: 'Neu', no_games: 'Noch keine Spiele.', playing_n: '{n} spielen', by: 'von {name}',
    status_game: 'In einem Spiel', status_online: 'Online', status_offline: 'Offline', discover: 'Entdecken',
    friends: 'Freunde', add_friend: 'Freund hinzufügen', friend_ph: 'Genauer Benutzername', friend_add_btn: 'Anfrage senden', friend_help: 'Gib den genauen Benutzernamen deines Freundes ein. Er muss die Anfrage annehmen.',
    req_sent: 'Anfrage an {name} gesendet', req_friends: 'Ihr seid bereits befreundet', req_accepted: 'Du bist jetzt mit {name} befreundet!', user_not_found: 'Kein Benutzer mit diesem Namen',
    requests_in: 'Erhaltene Anfragen', requests_out: 'Gesendete Anfragen', accept: 'Annehmen', decline: 'Ablehnen', remove: 'Entfernen', chat: 'Chat', invite: 'Einladen', join: 'Beitreten', my_friends: 'Meine Freunde ({n})', no_friends: 'Du hast noch keine Freunde.',
    chat_with: 'Chat mit {name}', chat_ph: 'Nachricht schreiben...', notifications: 'Benachrichtigungen', notif_none: 'Keine Benachrichtigungen.',
    n_friend_request: '{name} möchte dein Freund sein', n_friend_accept: '{name} hat deine Anfrage angenommen', n_invite: '{name} lädt dich zu {game} ein',
    create: 'Erstellen', settings: 'Einstellungen', set_language: 'Sprache', set_sens: 'Kameraempfindlichkeit', set_dist: 'Sichtweite', set_names: 'Namen über Spielern anzeigen', set_music: 'Musik in Spielen', set_music_vol: 'Musiklautstärke',
    paused: 'Pause', resume: 'Weiter', leave_game: 'Spiel verlassen', invite_friends: 'Freunde einladen', place: 'Setzen', break: 'Abbauen', jump: 'Springen', welcome_to: 'Willkommen in {name}', joined: '{name} ist beigetreten', left: '{name} ist gegangen', players_n: '{n} spielen', you: '(du)',
  },
}
export const LANGS = Object.keys(D)
export const langName = l => D[l].lang_name
const detect = () => { const n = (navigator.language || 'es').slice(0, 2).toLowerCase(); return D[n] ? n : 'en' }
let lang
try { lang = localStorage.getItem('blocksy.lang') } catch {}
if (!D[lang]) lang = detect()
const subs = new Set()
export const getLang = () => lang
export function setLang(l) {
  if (!D[l]) return
  lang = l; try { localStorage.setItem('blocksy.lang', l) } catch {}
  document.documentElement.lang = l
  applyStatic(); subs.forEach(f => f())
}
export const onLang = f => { subs.add(f); return () => subs.delete(f) }
export function t(key, vars) {
  let s = D[lang][key] ?? D.en[key] ?? D.es[key] ?? key
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k])
  return s
}
// Textos estáticos del HTML: data-i18n="clave" (texto), data-i18n-ph="clave" (placeholder), data-i18n-title (title/aria-label)
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(e => (e.textContent = t(e.dataset.i18n)))
  root.querySelectorAll('[data-i18n-ph]').forEach(e => (e.placeholder = t(e.dataset.i18nPh)))
  root.querySelectorAll('[data-i18n-title]').forEach(e => { e.title = t(e.dataset.i18nTitle); e.setAttribute('aria-label', e.title) })
}
document.documentElement.lang = lang
