// Lobby de Blocksy para 3DS: réplica de la web (barra superior, menú lateral, Inicio, Descubrir, Avatar, Amigos, Crear, Ajustes).
// Pantalla superior = la "página" de la web. Pantalla inferior (táctil) = menú lateral + lista/acciones de la página.
#include "app.h"
#include "sfx.h"
#include "ui.h"
#include "update.h"
#include "audio.h"
#include "avatar3d.h"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

static int s_lang;   // 0 español, 1 English, 2 Portugues (ajuste guardado)
static int s_music = -1, s_mvol = 60, s_sfx = 1;                          // musica de la playlist: -1 = sin decidir (activada solo en New 3DS)
static int s_forest = 1, s_steps = 1, s_showdev, s_ach;     // s_ach: logros conseguidos (bits)                 // s_showdev: ofrecer devbuilds aunque se use una version estable
static int s_notif_on = 1;                                      // avisos emergentes
static int s_sync = 2;                                          // nivel de sincronización (índice en SYNC_MS)
static const int SYNC_MS[6] = {40, 70, 100, 160, 250, 400};     // pausa entre envíos/lecturas de posiciones en la partida
int app_sync_ms(void) { return SYNC_MS[s_sync < 0 ? 0 : s_sync > 5 ? 5 : s_sync]; }
int app_notif_on(void) { return s_notif_on; }
int app_music_on(void) { if (s_music < 0) { bool n3 = false; APT_CheckNew3DS(&n3); s_music = n3 ? 1 : 0; } return s_music; }
int app_music_vol(void) { return s_mvol; }
int app_sfx_on(void) { return s_sfx; }
int app_forest_level(void) { return s_forest; }
int app_steps_on(void) { return s_steps; }
static const char *const PT_TR[][2] = {
	{"%s (duplicate, +%d BCoins)", "%s (repetido, +%d BCoins)"},
	{"%s accepted your request", "%s aceitou seu pedido"},
	{"%s invites you to %s", "%s convida voce para %s"},
	{"%s wants to be your friend", "%s quer ser seu amigo"},
	{"+ Add friend (username)", "+ Adicionar amigo (usuario)"},
	{"Account", "Conta"},
	{"Alerts cleared", "Avisos apagados"},
	{"Alerts need an email login.", "Os avisos exigem login com email."},
	{"Alerts", "Avisos"},
	{"Already claimed today", "Ja recolhida hoje"},
	{"Already downloading", "Ja esta baixando"},
	{"Already friends", "Ja sao amigos"},
	{"Already sent", "Ja enviado"},
	{"Check updates on start", "Buscar updates ao abrir"},
	{"Claim daily reward", "Pegar recompensa diaria"},
	{"Clear all alerts", "Apagar todos os avisos"},
	{"Close chat (B)", "Fechar chat (B)"},
	{"Could not buy", "Nao foi possivel comprar"},
	{"Could not delete", "Nao foi possivel apagar"},
	{"Could not edit", "Nao foi possivel editar"},
	{"Could not open", "Nao foi possivel abrir"},
	{"Could not remove", "Nao foi possivel remover"},
	{"Daily reward available!", "Recompensa diaria disponivel!"},
	{"Daily reward: come back tomorrow", "Recompensa diaria: volte amanha"},
	{"Declined", "Recusado"},
	{"Delete (Y)", "Apagar (Y)"},
	{"Distance", "Distancia"},
	{"Done", "Pronto"},
	{"Draw distance", "Distancia de desenho"},
	{"Edit (X)", "Editar (X)"},
	{"Edit message", "Editar mensagem"},
	{"Email forgotten", "Email esquecido"},
	{"Equip", "Equipar"},
	{"Equipped", "Equipado"},
	{"Error", "Erro"},
	{"Exact username", "Usuario exato"},
	{"Exit", "Sair"},
	{"Forget my email", "Esquecer meu email"},
	{"Friend added", "Amigo adicionado"},
	{"Friend removed", "Amigo removido"},
	{"Hat", "Chapeu"},
	{"In a game", "Em um jogo"},
	{"Installed", "Instalado"},
	{"Installed. Restarting Blocksy...", "Instalado. Reiniciando o Blocksy..."},
	{"Join", "Entrar"},
	{"Language", "Idioma"},
	{"Log in with email and password to see", "Entre com email e senha para ver"},
	{"Log in with email", "Entrar com email"},
	{"Log out", "Sair da conta"},
	{"Long", "Longa"},
	{"Medium", "Media"},
	{"Message deleted", "Mensagem apagada"},
	{"Message edited", "Mensagem editada"},
	{"Message not sent", "Mensagem nao enviada"},
	{"More items on the touch screen", "Mais itens na tela de toque"},
	{"Needs an email login.", "Exige login com email."},
	{"New message from a friend", "Nova mensagem de um amigo"},
	{"New", "Novo"},
	{"No devbuild yet", "Ainda nao ha devbuild"},
	{"No messages yet. Say hi!", "Ainda nao ha mensagens. Diga oi!"},
	{"No stable release yet", "Ainda nao ha versao estavel"},
	{"No such user", "Usuario nao existe"},
	{"None", "Nenhum"},
	{"Not available with QR.", "Nao disponivel com QR."},
	{"Not enough BCoins", "BCoins insuficientes"},
	{"Offline", "Offline"},
	{"Older", "Antigo"},
	{"Open", "Abrir"},
	{"Owned", "Seu"},
	{"Player sync interval", "Sincronizacao de jogadores"},
	{"Pop-up alerts", "Avisos pop-up"},
	{"Press again to delete", "Pressione de novo para apagar"},
	{"Purchased", "Comprado"},
	{"Request sent", "Pedido enviado"},
	{"Reward claimed", "Recompensa recolhida"},
	{"Same on the web and on the 3DS.", "Igual na web e no 3DS."},
	{"Save color", "Salvar cor"},
	{"See Friends", "Ver Amigos"},
	{"Shirt color:", "Cor da camisa:"},
	{"Short", "Curta"},
	{"Sure?", "Certeza?"},
	{"Sync", "Sincronizacao"},
	{"Tap X again to remove", "Toque X de novo para remover"},
	{"Tap to join", "Toque para entrar"},
	{"That game no longer exists", "Esse jogo nao existe mais"},
	{"The shop needs an email login.", "A loja exige login com email."},
	{"Title", "Titulo"},
	{"Unequip", "Desequipar"},
	{"Updated. Open it again from the Homebrew Launcher", "Atualizado. Abra de novo pelo Homebrew Launcher"},
	{"Updates on start", "Updates ao abrir"},
	{"Version", "Versao"},
	{"Write (A)", "Escrever (A)"},
	{"Write a message", "Escrever uma mensagem"},
	{"Yes", "Sim"},
	{"You already have this version or newer", "Voce ja tem esta versao ou mais nova"},
	{"You already own it", "Voce ja tem"},
	{"You are now friends", "Agora voces sao amigos"},
	{"You can only delete your messages", "So pode apagar suas mensagens"},
	{"You can only edit your messages", "So pode editar suas mensagens"},
	{"You got: %s", "Voce ganhou: %s"},
	{"You have no alerts.", "Voce nao tem avisos."},
	{"You own none: buy them in the Shop", "Voce nao tem nenhum: compre na Loja"},
	{"^ Up", "^ Cima"},
	{"and add friends (not available with QR).", "e adicione amigos (nao disponivel com QR)."},
	{"request", "pedido"},
	{"streak", "sequencia"},
	{"Music", "Musica"},
	{"Music volume", "Volume da musica"},
	{"Sound effects", "Efeitos sonoros"},
	{"Music needs dspfirm.cdc (DSP firmware dump)", "A musica exige dspfirm.cdc (copia do firmware do DSP)"},
	{"Show devbuilds", "Mostrar devbuilds"},
	{"Added to favorites", "Adicionado aos favoritos"},
	{"Removed from favorites", "Removido dos favoritos"},
	{"Favorites need an email login", "Favoritos exigem login com email"},
	{"unfavorite", "remover favorito"},
	{"favorite", "favorito"},
	{"play", "jogar"},
	{"close", "fechar"},
	{"Forest difficulty", "Dificuldade da floresta"},
	{"Easy", "Facil"},
	{"Hard", "Dificil"},
	{"Footstep dust", "Poeira dos passos"},
	{"friends", "amigos"},
	{"try emote", "testar emote"},
	{"unread", "nao lidas"},
	{"v Down", "v Baixo"},
	{"wants to be your friend", "quer ser seu amigo"},
};
static const char *tr2(const char *es, const char *en) {
	if (s_lang == 2) { for (size_t i = 0; i < sizeof PT_TR / sizeof PT_TR[0]; i++) if (!strcmp(PT_TR[i][0], en)) return PT_TR[i][1]; return en; }   // portugues: tabla por el texto en ingles
	return s_lang ? en : es;
}
static const char *const LANG_NAME[3] = {"Espanol", "English", "Portugues"};
// (Crear juegos es solo de la web y de la cuenta autorizada: no está en la 3DS)
enum { P_HOME, P_DISCOVER, P_AVATAR, P_FRIENDS, P_NOTIF, P_SHOP, P_UPDATE, P_SETTINGS, NPAGES };
static const char *const PAGE_NAME_ES[NPAGES] = {"Inicio", "Descubrir", "Avatar", "Amigos", "Avisos", "Tienda", "Actualizar", "Ajustes"};
static const char *const PAGE_NAME_EN[NPAGES] = {"Home", "Discover", "Avatar", "Friends", "Alerts", "Shop", "Update", "Settings"};
static const char *const PAGE_NAME_PT[NPAGES] = {"Inicio", "Descobrir", "Avatar", "Amigos", "Avisos", "Loja", "Atualizar", "Ajustes"};
#define PAGE_NAME (s_lang == 2 ? PAGE_NAME_PT : s_lang ? PAGE_NAME_EN : PAGE_NAME_ES)
static const int PAGE_ICON[NPAGES] = {0, 1, 2, 3, 8, 9, 7, 5};
static const char *const AVATAR_COLORS[10] = {"#4da6ff", "#ff9f43", "#2ecc71", "#e74c3c", "#9b59b6", "#f1c40f", "#1abc9c", "#ff6b9d", "#ecf0f1", "#95a5a6"};

// ---------- datos compartidos con el hilo de red ----------
static LightLock lk;
static GameInfo g_games[MAX_GAMES]; static int g_ngames;
static Person g_friends[MAX_PEOPLE]; static int g_nfriends;
static FriendReq g_reqs[MAX_PEOPLE]; static int g_nreqs; static volatile int g_unread;
static DmMsg g_dm[40]; static int g_ndm; static char g_dm_friend[40]; static volatile int g_dm_open; static volatile int g_dm_seq;
static ShopItem g_shop[40]; static int g_nshop; static Wallet g_wallet; char g_my_hat[100];
static Notif g_notifs[16]; static int g_nnotifs; static volatile int g_notif_unread;
static char g_alert[96]; static volatile int g_alert_seq;     // aviso nuevo (toast) generado por el hilo de red static char g_dm_friend[40]; static volatile int g_dm_open; static volatile int g_dm_seq;
static volatile int g_account = 1;   // 0 = sesión por QR (sin token de Auth): no hay amigos ni avatar

// ---------- actualizaciones (hilo de red) ----------
static UpdateInfo g_upd; static volatile int g_upd_have;      // g_upd_have: ya se consultó GitHub
static volatile int g_upd_state;                              // 0 reposo, 1 buscando, 2 descargando, 3 instalada, 4 error
static volatile int g_upd_pct; static char g_upd_msg[100];
static volatile int g_upd_auto;                               // 1 = instalar la estable nueva sola (una vez por sesion, como Iker's Tube)
static volatile int g_upd_announce;                           // 1 = avisar con un toast de que hay versión nueva
static int s_auto = 1;                                        // buscar al abrir (ajuste)

static bool cur_is_dev(void) { return strstr(g_upd.cur, "-dev") != NULL || !strcmp(g_upd.cur, "dev"); }
// ¿Hay algo nuevo? Una estable nueva siempre; una devbuild nueva solo si se usa una devbuild
static bool upd_available(void) { return g_upd_have && (g_upd.stable.newer || (g_upd.dev.newer && (cur_is_dev() || s_showdev))); }

typedef enum { RQ_NONE, RQ_REFRESH, RQ_ADD, RQ_REMOVE, RQ_COLOR, RQ_UPD_CHECK, RQ_UPD_INSTALL, RQ_ACCEPT, RQ_DM_SEND, RQ_DM_FETCH, RQ_DM_EDIT, RQ_DM_DEL, RQ_NOTIF_READ, RQ_NOTIF_CLEAR, RQ_BUY, RQ_CRATE, RQ_CLAIM, RQ_EQUIP, RQ_FAV } Req;
typedef struct {
	volatile int req, busy, quit, offline, seq, done_ok;
	char arg[48], arg2[104]; int n;
	Session *s;
	char msg[96];                        // resultado de la última acción (toast)
} Worker;
static Worker W;

void app_notif_text(const Notif *n, char *out, size_t sz) {
	if (!strcmp(n->kind, "friend_request")) snprintf(out, sz, tr2("%s quiere ser tu amigo", "%s wants to be your friend"), n->from);
	else if (!strcmp(n->kind, "friend_accept")) snprintf(out, sz, tr2("%s acepto tu solicitud", "%s accepted your request"), n->from);
	else if (!strcmp(n->kind, "invite")) snprintf(out, sz, tr2("%s te invita a %s", "%s invites you to %s"), n->from, n->game);
	else snprintf(out, sz, "%s", n->kind);
}
static u32 parse_hex(const char *hex) {
	unsigned r = 0x4d, g = 0xa6, b = 0xff;
	if (hex && hex[0] == '#' && strlen(hex) == 7) sscanf(hex + 1, "%2x%2x%2x", &r, &g, &b);
	return 0xFF000000u | (b << 16) | (g << 8) | r;
}

// Lo que llevas puesto viaja como "sombrero|gafas|espalda|estela|mascota|" (igual que la web; el aspecto lo calcula cada cliente)
static void pack_loadout(const Wallet *w) { snprintf(g_my_hat, sizeof g_my_hat, "%s|%s|%s|%s|%s|", w->hat, w->face, w->back, w->trail, w->pet); net_set_hat(g_my_hat); }
static void refresh_all(void) {
	static GameInfo tg[MAX_GAMES]; static Person tf[MAX_PEOPLE]; static FriendReq tr[MAX_PEOPLE];
	int ng = net_list_games(tg, MAX_GAMES);
	if (ng >= 0) { { int k = 0; for (int i = 0; i < ng; i++) if (tg[i].vis == 0 || !strcmp(tg[i].owner_id, W.s->user_id)) tg[k++] = tg[i]; ng = k; }       // privados y solo con enlace no salen en las listas (salvo los tuyos)
		ng = net_hide_blocked(tg, ng); net_game_visits(tg, ng); net_player_counts(tg, ng); { static char fid[64][40]; int nfv = net_favorites(W.s, fid, 64); for (int i = 0; i < ng; i++) { tg[i].fav = 0; for (int k = 0; k < nfv; k++) if (!strcmp(tg[i].id, fid[k])) tg[i].fav = 1; } } LightLock_Lock(&lk); memcpy(g_games, tg, sizeof(GameInfo) * ng); g_ngames = ng; LightLock_Unlock(&lk); }
	else snprintf(W.msg, sizeof W.msg, "%s", net_login_error());
	int nf = net_list_friends(W.s, tf, MAX_PEOPLE), nr = net_list_requests(W.s, tr, MAX_PEOPLE);
	int un = net_unread_total(W.s); if (un >= 0) { if (un > g_unread) sfx_play(SFX_NOTIFY); g_unread = un; }
	{	// BCoins y tienda
		static Wallet tw; static ShopItem ts[40];
		if (net_wallet(W.s, &tw) == 0) { LightLock_Lock(&lk); g_wallet = tw; LightLock_Unlock(&lk); pack_loadout(&tw); }
		if (!g_nshop) { int nsh = net_shop_list(W.s, ts, 40); if (nsh > 0) { LightLock_Lock(&lk); memcpy(g_shop, ts, sizeof(ShopItem) * nsh); g_nshop = nsh; LightLock_Unlock(&lk); } }
	}
	{	// avisos: lista + detección de novedades (solicitudes, invitaciones, mensajes) para el toast
		static Notif tn[16]; static long last_id = -1; static int last_un = -1; int nn = net_list_notifs(W.s, tn, 16);
		if (nn >= 0) {
			int unread_n = 0; for (int i = 0; i < nn; i++) if (!tn[i].read) unread_n++;
			if (last_id >= 0 && s_notif_on) for (int i = 0; i < nn; i++) if (tn[i].id > last_id && !tn[i].read) { char tx[96]; app_notif_text(&tn[i], tx, sizeof tx); snprintf(g_alert, sizeof g_alert, "%s", tx); g_alert_seq++; break; }
			for (int i = 0; i < nn; i++) if (tn[i].id > last_id) last_id = tn[i].id;
			if (last_id < 0) last_id = 0;
			LightLock_Lock(&lk); memcpy(g_notifs, tn, sizeof(Notif) * nn); g_nnotifs = nn; g_notif_unread = unread_n; LightLock_Unlock(&lk);
		}
		if (un >= 0) { if (last_un >= 0 && un > last_un && s_notif_on) { snprintf(g_alert, sizeof g_alert, "%s", tr2("Mensaje nuevo de un amigo", "New message from a friend")); g_alert_seq++; } last_un = un; }
	}
	g_account = nf != -2;
	LightLock_Lock(&lk);
	if (nf >= 0) { memcpy(g_friends, tf, sizeof(Person) * nf); g_nfriends = nf; } else if (nf == -2) g_nfriends = 0;
	if (nr >= 0) { memcpy(g_reqs, tr, sizeof(FriendReq) * nr); g_nreqs = nr; } else if (nr == -2) g_nreqs = 0;
	LightLock_Unlock(&lk);
	W.seq++;
}

static void upd_check_job(bool announce) {
	static UpdateInfo tmp; char err[100] = "";
	g_upd_state = 1; g_upd_msg[0] = 0;
	bool ok = update_check(&tmp, err, sizeof err);
	if (ok) { LightLock_Lock(&lk); g_upd = tmp; g_upd_have = 1; LightLock_Unlock(&lk); g_upd_state = 0; if (announce && upd_available()) g_upd_announce = 1; { static bool tried; if (announce && g_upd.stable.newer && !tried) { tried = true; g_upd_auto = 1; } } }
	else { snprintf(g_upd_msg, sizeof g_upd_msg, "%s", err); g_upd_state = 4; }
	W.seq++;
}
static void upd_install_job(int which) {
	Rel r; LightLock_Lock(&lk); r = which ? g_upd.dev : g_upd.stable; LightLock_Unlock(&lk);
	if (!r.valid) { snprintf(g_upd_msg, sizeof g_upd_msg, "No hay version publicada de ese tipo"); g_upd_state = 4; return; }
	char err[100] = ""; g_upd_state = 2; g_upd_pct = 0; g_upd_msg[0] = 0;
	bool ok = update_install(&r, &g_upd_pct, err, sizeof err);
	if (ok) update_mark_installed(r.tag);
	if (ok) snprintf(g_upd_msg, sizeof g_upd_msg, update_is_cia() ? tr2("Instalada. Reiniciando Blocksy...", "Installed. Restarting Blocksy...") : tr2("Actualizada. Vuelve a abrirla desde el Homebrew Launcher", "Updated. Open it again from the Homebrew Launcher"));
	else snprintf(g_upd_msg, sizeof g_upd_msg, "%s", err);
	g_upd_state = ok ? 3 : 4;
}

static void worker_thread(void *arg) {
	(void)arg;
	u64 last_refresh = 0, last_presence = 0, last_upd = 0, last_token = osGetTime(); bool first_upd = true;
	while (!W.quit) {
		u64 now = osGetTime();
		int r = W.req;
		static u64 last_dm = 0;
		if (!r && g_dm_open && now - last_dm > 3500) { last_dm = now; r = RQ_DM_FETCH; }
		if (!r && now - last_refresh > 12000) r = RQ_REFRESH;     // refresco automático
		if (!r && g_upd_auto && g_upd_state != 2) { g_upd_auto = 0; r = RQ_UPD_INSTALL; W.n = 0; }                 // estable nueva: se instala sola
		if (!r && s_auto && W.seq > 0 && (first_upd || now - last_upd > 1800000) && g_upd_state != 2) { r = RQ_UPD_CHECK; W.n = 2; }   // al abrir y cada 30 min (n=2: automático)
		if (r) {
			W.busy = 1; W.done_ok = 1;
			switch (r) {
			case RQ_REFRESH: refresh_all(); break;
			case RQ_ADD: { int fr = net_friend_request(W.s, W.arg); W.done_ok = fr >= 0;
				snprintf(W.msg, sizeof W.msg, "%s", fr == 0 ? tr2("Solicitud enviada", "Request sent") : fr == 1 ? tr2("Ahora sois amigos", "You are now friends") : fr == 2 ? tr2("Ya sois amigos", "Already friends") : fr == 3 ? tr2("Ya la enviaste", "Already sent") : tr2("No existe ese usuario", "No such user"));
				refresh_all(); break; }
			case RQ_ACCEPT: W.done_ok = net_respond_request(W.s, atol(W.arg), W.n); snprintf(W.msg, sizeof W.msg, "%s", W.done_ok ? (W.n ? tr2("Amigo anadido", "Friend added") : tr2("Rechazada", "Declined")) : tr2("Error", "Error")); refresh_all(); break;
			case RQ_DM_EDIT: W.done_ok = net_edit_dm(W.s, atol(W.arg), W.arg2); snprintf(W.msg, sizeof W.msg, "%s", W.done_ok ? tr2("Mensaje editado", "Message edited") : tr2("No se pudo editar", "Could not edit"));
				{ static DmMsg te[40]; int ne = net_fetch_dm(W.s, g_dm_friend, te, 40); if (ne >= 0) { LightLock_Lock(&lk); memcpy(g_dm, te, sizeof(DmMsg) * ne); g_ndm = ne; LightLock_Unlock(&lk); g_dm_seq++; } } break;
			case RQ_DM_DEL: W.done_ok = net_delete_dm(W.s, atol(W.arg)); snprintf(W.msg, sizeof W.msg, "%s", W.done_ok ? tr2("Mensaje borrado", "Message deleted") : tr2("No se pudo borrar", "Could not delete"));
				{ static DmMsg td[40]; int nd2 = net_fetch_dm(W.s, g_dm_friend, td, 40); if (nd2 >= 0) { LightLock_Lock(&lk); memcpy(g_dm, td, sizeof(DmMsg) * nd2); g_ndm = nd2; LightLock_Unlock(&lk); g_dm_seq++; } } break;
			case RQ_BUY: { int rb = net_buy(W.s, W.arg); W.done_ok = rb == 0; if (rb == 0) sfx_play(SFX_COIN); snprintf(W.msg, sizeof W.msg, "%s", rb == 0 ? tr2("Comprado", "Purchased") : rb == 1 ? tr2("No tienes suficientes BCoins", "Not enough BCoins") : rb == 2 ? tr2("Ya lo tienes", "You already own it") : tr2("No se pudo comprar", "Could not buy")); if (rb < 0 && net_why[0]) { strncat(W.msg, ": ", sizeof W.msg - strlen(W.msg) - 1); strncat(W.msg, net_why, sizeof W.msg - strlen(W.msg) - 1); } refresh_all(); break; }
			case RQ_CRATE: { char it[32] = ""; int dup = 0, rf = 0; int rc2 = net_open_crate(W.s, W.arg, it, sizeof it, &dup, &rf); W.done_ok = rc2 == 0; if (rc2 == 0) sfx_play(dup ? SFX_NOTIFY : SFX_WIN);
				if (rc2 == 0) { const char *nm = it; for (int i = 0; i < g_nshop; i++) if (!strcmp(g_shop[i].id, it)) nm = g_shop[i].name; if (dup) snprintf(W.msg, sizeof W.msg, tr2("%s (repetido, +%d BCoins)", "%s (duplicate, +%d BCoins)"), nm, rf); else snprintf(W.msg, sizeof W.msg, tr2("Conseguiste: %s", "You got: %s"), nm); }
				else snprintf(W.msg, sizeof W.msg, "%s", rc2 == 1 ? tr2("No tienes suficientes BCoins", "Not enough BCoins") : tr2("No se pudo abrir", "Could not open")); refresh_all(); break; }
			case RQ_FAV: { int fv = net_toggle_favorite(W.s, W.arg); W.done_ok = fv >= 0; snprintf(W.msg, sizeof W.msg, "%s", fv < 0 ? tr2("Entra con email para usar favoritos", "Favorites need an email login") : fv ? tr2("Anadido a favoritos", "Added to favorites") : tr2("Quitado de favoritos", "Removed from favorites")); refresh_all(); break; }
			case RQ_CLAIM: { int ca = net_claim_daily(W.s); W.done_ok = ca > 0; if (ca > 0) sfx_play(SFX_COIN); if (ca > 0) snprintf(W.msg, sizeof W.msg, "+%d BCoins", ca); else snprintf(W.msg, sizeof W.msg, "%s", ca == 0 ? tr2("Ya la recogiste hoy", "Already claimed today") : tr2("Error", "Error")); refresh_all(); break; }
			case RQ_EQUIP: W.done_ok = net_equip(W.s, W.arg, W.arg2); snprintf(W.msg, sizeof W.msg, "%s", W.done_ok ? tr2("Hecho", "Done") : "Error"); refresh_all(); break;
			case RQ_NOTIF_READ: net_notifs_read(W.s); refresh_all(); break;
			case RQ_NOTIF_CLEAR: W.done_ok = net_notifs_clear(W.s); snprintf(W.msg, sizeof W.msg, "%s", W.done_ok ? tr2("Avisos borrados", "Alerts cleared") : "Error"); refresh_all(); break;
			case RQ_DM_SEND: W.done_ok = net_send_dm(W.s, g_dm_friend, W.arg2); if (!W.done_ok) snprintf(W.msg, sizeof W.msg, "%s", tr2("No se envio el mensaje", "Message not sent")); /* fallthrough */
			case RQ_DM_FETCH: { static DmMsg tm[40]; int nm = net_fetch_dm(W.s, g_dm_friend, tm, 40); if (nm >= 0) { LightLock_Lock(&lk); memcpy(g_dm, tm, sizeof(DmMsg) * nm); g_ndm = nm; LightLock_Unlock(&lk); g_dm_seq++; } break; }
			case RQ_REMOVE: W.done_ok = net_remove_friend(W.s, W.arg); snprintf(W.msg, sizeof W.msg, "%s", W.done_ok ? tr2("Amigo eliminado", "Friend removed") : tr2("No se pudo quitar", "Could not remove")); refresh_all(); break;
			case RQ_COLOR:  W.done_ok = net_set_color(W.s, W.arg);     snprintf(W.msg, sizeof W.msg, W.done_ok ? "Avatar guardado" : "No se pudo guardar el avatar");
				if (W.done_ok) W.s->color = parse_hex(W.arg);
				break;
			case RQ_UPD_CHECK: upd_check_job(W.n == 2); first_upd = false; last_upd = osGetTime(); W.msg[0] = 0; break;
			case RQ_UPD_INSTALL: upd_install_job(W.n); W.msg[0] = 0; break;
			}
			last_refresh = osGetTime();
			W.req = 0; W.busy = 0;
		} else svcSleepThread(40 * 1000000LL);
		if (W.s->refresh[0] && now - last_token > 2700000 && !W.req) {          // renueva el token de la cuenta (caduca a la hora) y guarda el nuevo refresh token
			if (net_refresh(W.s, true)) ui_save_session(W.s);
			last_token = now;
		}
		if (now - last_presence > 20000) { net_presence(W.s, NULL); last_presence = now; }
	}
	if (W.offline) net_offline(W.s);
	net_thread_cleanup();
}

// ---------- ajustes guardados ----------
#define SETTINGS_FILE "sdmc:/3ds/blocksy/settings.txt"
static char s_last_game[40]; static int s_dist = 1;
int app_draw_level(void) { return s_dist; }
static void load_settings(void) {
	FILE *f = fopen(SETTINGS_FILE, "r"); if (!f) return;
	char line[96];
	while (fgets(line, sizeof line, f)) {
		line[strcspn(line, "\r\n")] = 0;
		if (!strncmp(line, "last_game=", 10)) snprintf(s_last_game, sizeof s_last_game, "%s", line + 10);
		else if (!strncmp(line, "dist=", 5)) s_dist = atoi(line + 5) % 3;
		else if (!strncmp(line, "auto=", 5)) s_auto = atoi(line + 5) != 0;
		else if (!strncmp(line, "forest=", 7)) { int v = atoi(line + 7); s_forest = v < 0 || v > 2 ? 1 : v; }
		else if (!strncmp(line, "ach=", 4)) s_ach = atoi(line + 4);
		else if (!strncmp(line, "music=", 6)) s_music = atoi(line + 6) ? 1 : 0;
		else if (!strncmp(line, "sfx=", 4)) s_sfx = atoi(line + 4) ? 1 : 0;
		else if (!strncmp(line, "mvol=", 5)) { int v = atoi(line + 5); s_mvol = v < 0 ? 0 : v > 100 ? 100 : v; }
		else if (!strncmp(line, "showdev=", 8)) s_showdev = atoi(line + 8) ? 1 : 0;
		else if (!strncmp(line, "steps=", 6)) s_steps = atoi(line + 6) ? 1 : 0;
		else if (!strncmp(line, "lang=", 5)) { int lg = atoi(line + 5); s_lang = lg < 0 || lg > 2 ? 0 : lg; }
		else if (!strncmp(line, "sync=", 5)) s_sync = atoi(line + 5) % 6;
		else if (!strncmp(line, "notif=", 6)) s_notif_on = atoi(line + 6) != 0;
	}
	fclose(f);
}
static void save_settings(void) {
	mkdir("sdmc:/3ds", 0777); mkdir("sdmc:/3ds/blocksy", 0777);
	FILE *f = fopen(SETTINGS_FILE, "w"); if (!f) return;
	fprintf(f, "last_game=%s\ndist=%d\nauto=%d\nlang=%d\nsync=%d\nnotif=%d\nforest=%d\nsteps=%d\nshowdev=%d\nach=%d\nmusic=%d\nmvol=%d\nsfx=%d\n", s_last_game, s_dist, s_auto, s_lang, s_sync, s_notif_on, s_forest, s_steps, s_showdev, s_ach, app_music_on(), s_mvol, s_sfx); fclose(f);
}

// ---------- estado de la interfaz ----------
typedef struct {
	int page, cur, scroll, modal;        // modal: índice en g_games de la ficha abierta (-1 ninguna)
	char search[32];
	int swatch;                          // color elegido en Avatar
	u64 toast_until; char toast[96];
	int seen_seq;
	int dm;                              // índice del amigo con el chat abierto (-1 ninguno)
	int rm_confirm;                      // fila de amigo pendiente de confirmar el borrado (-1 ninguna)
	int seen_dm;
	int dm_sel, dm_del;                  // mensaje seleccionado en el chat (índice) y confirmación de borrado (id, 0 = ninguno)
	int pending_restart; u64 restart_t;  // tras actualizar: reiniciar la app
	int seen_alert;
} Ui;

// copias locales (para dibujar sin bloquear al hilo de red)
static GameInfo games[MAX_GAMES]; static int ngames;
static Person friends[MAX_PEOPLE]; static int nfriends;
static FriendReq reqs[MAX_PEOPLE]; static int nreqs; static DmMsg dm[40]; static int ndm; static Notif notifs[16]; static int nnotifs, notif_unread; static ShopItem shop[40]; static int nshop; static Wallet wallet; static int unread;

static void sync_data(void) {
	LightLock_Lock(&lk);
	memcpy(games, g_games, sizeof(GameInfo) * g_ngames); ngames = g_ngames;
	memcpy(friends, g_friends, sizeof(Person) * g_nfriends); nfriends = g_nfriends;
	memcpy(reqs, g_reqs, sizeof(FriendReq) * g_nreqs); nreqs = g_nreqs; unread = g_unread;
	memcpy(dm, g_dm, sizeof(DmMsg) * g_ndm); ndm = g_ndm;
	memcpy(shop, g_shop, sizeof(ShopItem) * g_nshop); nshop = g_nshop; wallet = g_wallet;
	memcpy(notifs, g_notifs, sizeof(Notif) * g_nnotifs); nnotifs = g_nnotifs; notif_unread = g_notif_unread;
	LightLock_Unlock(&lk);
}

static void toast(Ui *u, const char *m) { snprintf(u->toast, sizeof u->toast, "%s", m); u->toast_until = osGetTime() + 2600; }

// Juegos visibles en la página actual (índices en games[])
static int build_view(const Ui *u, const Session *s, int *view) {
	int n = 0;
	if (u->page == P_HOME) {                                   // populares primero
		for (int i = 0; i < ngames; i++) view[n++] = i;
		for (int i = 1; i < n; i++) { int v = view[i], j = i - 1; while (j >= 0 && (games[view[j]].fav < games[v].fav || (games[view[j]].fav == games[v].fav && games[view[j]].players < games[v].players))) { view[j + 1] = view[j]; j--; } view[j + 1] = v; }
	} else if (u->page == P_DISCOVER) {
		for (int pass = 0; pass < 2; pass++) for (int i = 0; i < ngames; i++) {
			if ((pass == 0) != (games[i].fav != 0)) continue;                                      // favoritos primero
			if (u->search[0]) {
				char a[160], b[48]; snprintf(a, sizeof a, "%s %s", games[i].name, games[i].desc); snprintf(b, sizeof b, "%s", u->search);
				for (char *c = a; *c; c++) if (*c >= 'A' && *c <= 'Z') *c += 32;
				for (char *c = b; *c; c++) if (*c >= 'A' && *c <= 'Z') *c += 32;
				if (!strstr(a, b)) continue;
			}
			view[n++] = i;
		}
	}
	return n;
}
// Filas de la página Amigos: [anadir por nombre] + solicitudes recibidas + amigos
typedef struct { const Person *p; const FriendReq *r; int kind; } PRow;      // kind: 0 anadir, 1 solicitud, 2 amigo
static int build_people(const Session *s, PRow *rows) {
	(void)s; int n = 0;
	rows[n++] = (PRow){NULL, NULL, 0};
	for (int i = 0; i < nreqs; i++) rows[n++] = (PRow){NULL, &reqs[i], 1};
	for (int i = 0; i < nfriends; i++) rows[n++] = (PRow){&friends[i], NULL, 2};
	return n;
}

static int row_h(int page) { return page == P_FRIENDS || page == P_SETTINGS || page == P_NOTIF || page == P_SHOP ? 36 : page == P_UPDATE ? 40 : 42; }
enum { PANE_X = 108, PANE_W = 208, LIST_Y = 30, LIST_BOTTOM = 232 };
static int rows_visible(int page) { return (LIST_BOTTOM - LIST_Y) / row_h(page); }

static int count_rows(const Ui *u, const Session *s) {
	int view[MAX_GAMES]; PRow pr[MAX_PEOPLE * 2 + 2];
	switch (u->page) {
	case P_HOME: case P_DISCOVER: return build_view(u, s, view);
	case P_FRIENDS: return build_people(s, pr);
	case P_SETTINGS: return 13;
	case P_NOTIF: return nnotifs + 1;
	case P_SHOP: return nshop + 1;
	case P_UPDATE: return 3;
	}
	return 0;
}

// ---------- utilidades de texto ----------
static void fit(char *dst, size_t n, const char *src, float scale, float maxw) {
	snprintf(dst, n, "%s", src);
	if (ui_text_width(dst, scale) <= maxw) return;
	size_t len = strlen(dst);
	while (len > 1 && ui_text_width(dst, scale) > maxw - 8) { dst[--len] = 0; while (len && (dst[len] & 0xC0) == 0x80) dst[--len] = 0; }
	strncat(dst, "..", n - strlen(dst) - 1);
}
static int wrap(const char *src, float scale, float maxw, char lines[][96], int maxlines) {
	int nl = 0; char cur[96] = ""; char word[64];
	const char *p = src;
	while (*p && nl < maxlines) {
		int i = 0; while (*p && *p != ' ' && i < 62) word[i++] = *p++; word[i] = 0; while (*p == ' ') p++;
		char test[160]; snprintf(test, sizeof test, "%s%s%s", cur, cur[0] ? " " : "", word);
		if (cur[0] && ui_text_width(test, scale) > maxw) { snprintf(lines[nl++], 96, "%s", cur); snprintf(cur, sizeof cur, "%s", word); }
		else snprintf(cur, sizeof cur, "%s", test);
	}
	if (cur[0] && nl < maxlines) snprintf(lines[nl++], 96, "%s", cur);
	return nl;
}
static bool shop_owned(const ShopItem *it) { for (int i = 0; i < wallet.ninv; i++) if (!strcmp(wallet.inv[i], it->id)) return true; return false; }
// Accesorios (sombrero / titulo) de la pagina Avatar: ids comprados por tipo, en el orden de la tienda; el primero es "ninguno"
static int acc_list(const char *kind, const char **ids, const char **names) {
	int n = 0; ids[n] = ""; names[n++] = tr2("Ninguno", "None");
	for (int i = 0; i < nshop && n < 24; i++) if (!strcmp(shop[i].kind, kind)) for (int k = 0; k < wallet.ninv; k++) if (!strcmp(wallet.inv[k], shop[i].id)) { ids[n] = shop[i].id; names[n++] = shop[i].name; break; }
	return n;
}
static int acc_cur(const char *kind, int n, const char **ids) { const char *e = !strcmp(kind, "hat") ? wallet.hat : wallet.title; for (int i = 0; i < n; i++) if (!strcmp(ids[i], e)) return i; return 0; }
static const char *acc_name(const char *kind) { const char *ids[24], *nm[24]; int n = acc_list(kind, ids, nm); return nm[acc_cur(kind, n, ids)]; }
static bool shop_equipped(const ShopItem *it) { return !strcmp(wallet.hat, it->id) || !strcmp(wallet.title, it->id); }
static u32 rarity_col(int r) { return r == 2 ? C(0xC4, 0x6B, 0xFF) : r == 1 ? C(0x4D, 0x8D, 0xFF) : COL_MUTED; }
static const char *status_of(const Person *p) { return p->in_game ? tr2("En un juego", "In a game") : p->online ? "Online" : tr2("Desconectado", "Offline"); }

// ================= PANTALLA SUPERIOR =================
static void top_bar(const Ui *u, const Session *s, bool busy) {
	ui_rect(0, 0, 400, 28, COL_PANEL); ui_rect(0, 28, 400, 1, COL_LINE);
	ui_logo(15, 14, 10);
	ui_text(30, 4, 0.58f, COL_TEXT, 0, "Blocksy");
	static const int navp[2] = {P_HOME, P_DISCOVER};
	float x = 104;
	for (int i = 0; i < 2; i++) {
		bool act = u->page == navp[i]; float w = ui_text_width(PAGE_NAME[navp[i]], 0.44f);
		if (act) ui_rrect(x - 6, 5, w + 12, 18, 6, COL_PANEL2);
		ui_text(x, 7, 0.44f, act ? COL_TEXT : COL_MUTED, 0, PAGE_NAME[navp[i]]);
		x += w + 18;
	}
	if (g_account && wallet.bcoins >= 0) { char bc[24]; snprintf(bc, sizeof bc, "%d BC", wallet.bcoins); ui_text(246, 6, 0.42f, C(0xF5, 0xC5, 0x42), C2D_AlignRight, bc); }
	char nm[32]; fit(nm, sizeof nm, s->username, 0.46f, 100);
	ui_text(388, 6, 0.46f, COL_TEXT, C2D_AlignRight, nm);
	ui_avatar(388 - ui_text_width(nm, 0.46f) - 14, 14, 9, s->color, -1, s->username);
	if (busy) { char b[8]; snprintf(b, sizeof b, "%.*s", 1 + (int)((osGetTime() / 300) % 3), "..."); ui_text(250, 6, 0.46f, COL_MUTED, 0, b); }
}

static void section(float y, const char *title, const char *right) {
	ui_text(14, y, 0.56f, COL_TEXT, 0, title);
	if (right) ui_text(386, y + 3, 0.4f, COL_MUTED, C2D_AlignRight, right);
}

static void game_card(float x, float y, float s, const GameInfo *g, bool sel, bool meta) {
	if (sel) ui_rrect(x - 3, y - 3, s + 6, s + 6, 8, COL_TEXT);
	ui_thumb(x, y, s, g->hue, g->players);
	char nm[48]; fit(nm, sizeof nm, g->name, 0.4f, s + 8);
	ui_text(x, y + s + 3, 0.4f, COL_TEXT, 0, nm);
	if (meta) { char o[48], b[56]; snprintf(b, sizeof b, "por %s", g->owner[0] ? g->owner : "Blocksy"); fit(o, sizeof o, b, 0.34f, s + 8); ui_text(x, y + s + 15, 0.34f, COL_MUTED, 0, o); }
}

// Vista previa del avatar: el mismo modelo 3D del juego, girando; X prueba los emotes
static AvPose prev_pose; static int prev_demo; static u64 prev_t;
static void avatar_preview(float cx, float cy, const Session *s, u32 shirt) {
	u64 now = osGetTime(); float dt = prev_t ? (now - prev_t) / 1000.0f : 0.016f; if (dt > 0.05f) dt = 0.05f; prev_t = now;
	if (prev_pose.legY == 0) prev_pose.legY = 0.74f;
	av_pose_update(&prev_pose, prev_demo ? AV_EMOTE_ID[prev_demo - 1] : "idle", dt, now / 1000.0f);
	AvCam cam = {0, 1.0f, 0, 0, 0.12f, 3.5f, 190, cx, cy};
	AvStyle st = av_style(s->username, shirt); st.hat = av_hat_index(wallet.hat); st.face = av_face_index(wallet.face); st.back = av_back_index(wallet.back);
	av_set_z(0.35f);                                            // por encima del panel (los rectángulos de la UI están en z=0.2)
	av_draw(&cam, 0, 0, 0, now / 1000.0f * 0.9f, &st, &prev_pose, 0, 0);
	av_set_z(0);
}

static void page_top(const Ui *u, const Session *s) {
	int view[MAX_GAMES];
	switch (u->page) {
	case P_HOME: {
		ui_avatar(34, 52, 15, s->color, -1, s->username);
		char hi[64]; snprintf(hi, sizeof hi, "¡Hola, %s!", s->username); ui_text(58, 36, 0.8f, COL_TEXT, 0, hi);
		char ft[40]; snprintf(ft, sizeof ft, "Amigos (%d)", nfriends);
		section(72, ft, "Ver todo");
		if (nfriends) for (int i = 0; i < nfriends && i < 7; i++) {
			float cx = 30 + i * 52; char nm[24]; fit(nm, sizeof nm, friends[i].name, 0.34f, 48);
			ui_avatar(cx, 104, 13, friends[i].color, friends[i].online, friends[i].name);
			ui_text(cx, 119, 0.34f, COL_TEXT, C2D_AlignCenter, nm);
		} else ui_text(14, 94, 0.42f, COL_MUTED, 0, g_account ? "Anade amigos desde Amigos para verlos aqui." : "Entra con email y contrasena para ver a tus amigos.");
		int n = build_view(u, s, view);
		section(132, "Populares ahora", "Ver todo");
		int first = u->cur > 4 ? u->cur - 4 : 0;
		for (int i = 0; i < 5 && first + i < n; i++) game_card(14 + i * 76, 154, 58, &games[view[first + i]], first + i == u->cur, true);
		if (!n) ui_text(14, 160, 0.45f, COL_MUTED, 0, "Cargando juegos...");
		break; }
	case P_DISCOVER: {
		ui_text(14, 33, 0.8f, COL_TEXT, 0, "Descubrir");
		ui_rrect(14, 64, 372, 22, 11, COL_PANEL2);
		ui_text(28, 66, 0.42f, u->search[0] ? COL_TEXT : COL_MUTED, 0, u->search[0] ? u->search : "Buscar juegos  (X)");
		int n = build_view(u, s, view);
		int per = 5, first = (u->cur / per >= 2 ? (u->cur / per - 1) * per : 0);
		for (int i = 0; i < 10 && first + i < n; i++) game_card(14 + (i % per) * 76, 96 + (i / per) * 74, 52, &games[view[first + i]], first + i == u->cur, false);
		if (!n) ui_text(14, 110, 0.45f, COL_MUTED, 0, "No hay juegos que coincidan.");
		break; }
	case P_AVATAR: {
		ui_text(14, 33, 0.8f, COL_TEXT, 0, "Avatar");
		ui_rrect(14, 66, 372, 160, 12, COL_PANEL);
		ui_rrect(26, 78, 112, 136, 10, C(0x2E, 0x31, 0x38));
		avatar_preview(82, 152, s, parse_hex(AVATAR_COLORS[u->swatch]));
		ui_text(156, 80, 0.7f, COL_TEXT, 0, s->username);
		if (!g_account) ui_text(156, 104, 0.38f, COL_RED, 0, "Entra con email y contrasena para guardar.");
		if (g_account) { char pf[96]; int na = 0; for (int i = 0; i < 5; i++) na += (s_ach >> i) & 1; snprintf(pf, sizeof pf, "%d BC | %s %d | %s %d | %s %d/5", wallet.bcoins, tr2("racha", "streak"), wallet.streak, tr2("amigos", "friends"), nfriends, tr2("logros", "ach."), na); ui_text(156, 104, 0.36f, COL_ACCENT, 0, pf); }
		{ char dm[48]; snprintf(dm, sizeof dm, "X: %s%s%s", tr2("probar emote", "try emote"), prev_demo ? "  (" : "", prev_demo ? AV_EMOTE_LABEL[prev_demo - 1] : ""); if (prev_demo) strncat(dm, ")", sizeof dm - strlen(dm) - 1); ui_text(156, 118, 0.38f, COL_ACCENT, 0, dm); }
		{ char l[64], f[64]; snprintf(l, sizeof l, "%s: %s", tr2("Sombrero", "Hat"), acc_name("hat")); fit(f, sizeof f, l, 0.42f, 226); ui_text(156, 134, 0.42f, COL_TEXT, 0, f);
		  snprintf(l, sizeof l, "%s: %s", tr2("Titulo", "Title"), acc_name("title")); fit(f, sizeof f, l, 0.42f, 226); ui_text(156, 150, 0.42f, COL_TEXT, 0, f); }
		for (int i = 0; i < 10; i++) {
			float x = 156 + (i % 5) * 44, y = 170 + (i / 5) * 28; u32 c = parse_hex(AVATAR_COLORS[i]);
			if (i == u->swatch) ui_rrect(x - 3, y - 3, 38, 26, 8, COL_TEXT);
			ui_rrect(x, y, 32, 20, 6, c);
		}
		break; }
	case P_FRIENDS: {
		PRow rows[MAX_PEOPLE * 2 + 2]; int n = build_people(s, rows);
		if (u->dm >= 0 && u->dm < nfriends) {                                    // chat privado abierto
			const Person *f = &friends[u->dm];
			ui_rrect(14, 34, 372, 190, 12, COL_PANEL);
			ui_avatar(36, 54, 12, f->color, f->online, f->name);
			char hn[40]; snprintf(hn, sizeof hn, "%s", f->name); ui_text(56, 40, 0.6f, COL_TEXT, 0, hn); ui_text(56, 58, 0.34f, COL_MUTED, 0, status_of(f));
			ui_rect(24, 74, 352, 1, COL_LINE);
			int sel = u->dm_sel < 0 || u->dm_sel >= ndm ? ndm - 1 : u->dm_sel;
			int first = sel - 4; if (first > ndm - 8) first = ndm - 8; if (first < 0) first = 0;
			float y = 80;
			for (int i = first; i < ndm && i < first + 8; i++, y += 17) {
				char l[110]; fit(l, sizeof l, dm[i].text, 0.42f, 280);
				if (dm[i].edited) strncat(l, " *", sizeof l - strlen(l) - 1);
				float w = ui_text_width(l, 0.42f) + 12; float x0 = dm[i].mine ? 372 - w : 24;
				if (i == sel) ui_rrect(x0 - 2, y - 3, w + 4, 20, 9, COL_TEXT);
				ui_rrect(x0, y - 1, w, 16, 7, dm[i].mine ? COL_ACCENT_D : COL_PANEL2); ui_text(x0 + 6, y, 0.42f, COL_TEXT, 0, l);
			}
			if (ndm > 8) { float th = 136.0f * 8 / ndm, ty = 80 + (136.0f - th) * ((float)first / (ndm - 8)); ui_rrect(380, ty, 3, th, 1.5f, COL_LINE); }       // barra de scroll
			if (!ndm) ui_text(200, 130, 0.44f, COL_MUTED, C2D_AlignCenter, tr2("Aun no hay mensajes. Saluda!", "No messages yet. Say hi!"));
			break;
		}
		char t[40]; snprintf(t, sizeof t, "%s (%d)", PAGE_NAME[P_FRIENDS], nfriends);
		ui_text(14, 33, 0.8f, COL_TEXT, 0, PAGE_NAME[P_FRIENDS]);
		if (unread) { char ub[24]; snprintf(ub, sizeof ub, "%d %s", unread, tr2("sin leer", "unread")); float w = ui_text_width(ub, 0.4f) + 14; ui_rrect(386 - w, 40, w, 18, 9, COL_DANGER); ui_text(386 - w / 2, 42, 0.4f, COL_TEXT, C2D_AlignCenter, ub); }
		ui_rrect(14, 66, 372, 160, 12, COL_PANEL);
		if (!g_account) { ui_text(30, 120, 0.46f, COL_MUTED, 0, tr2("Entra con email y contrasena para ver y", "Log in with email and password to see")); ui_text(30, 138, 0.46f, COL_MUTED, 0, tr2("anadir amigos (no disponible con QR).", "and add friends (not available with QR).")); break; }
		int y = 74, shown = 0;
		for (int i = 1; i < n && shown < 5; i++, shown++, y += 30) {
			if (rows[i].kind == 1) {
				ui_avatar(36, y + 13, 11, rows[i].r->color, -1, rows[i].r->name);
				ui_text(56, y + 1, 0.5f, COL_TEXT, 0, rows[i].r->name); ui_text(56, y + 15, 0.34f, COL_ACCENT, 0, tr2("quiere ser tu amigo", "wants to be your friend"));
			} else {
				ui_avatar(36, y + 13, 11, rows[i].p->color, rows[i].p->online, rows[i].p->name);
				ui_text(56, y + 1, 0.5f, COL_TEXT, 0, rows[i].p->name); ui_text(56, y + 15, 0.34f, COL_MUTED, 0, status_of(rows[i].p));
			}
			if (i + 1 < n && shown < 4) ui_rect(26, y + 28, 348, 1, COL_LINE);
		}
		if (n == 1) ui_text(30, 120, 0.46f, COL_MUTED, 0, tr2("Toca \"Anadir amigo\" y escribe su usuario.", "Tap \"Add friend\" and type their username."));
		(void)t; break; }
	case P_NOTIF: {
		ui_text(14, 33, 0.8f, COL_TEXT, 0, PAGE_NAME[P_NOTIF]);
		ui_rrect(14, 66, 372, 160, 12, COL_PANEL);
		if (!g_account) { ui_text(30, 120, 0.46f, COL_MUTED, 0, tr2("Los avisos necesitan entrar con email.", "Alerts need an email login.")); break; }
		if (!nnotifs) { ui_text(30, 120, 0.46f, COL_MUTED, 0, tr2("No tienes avisos.", "You have no alerts.")); break; }
		float y = 74;
		for (int i = 0; i < nnotifs && i < 5; i++, y += 30) {
			char tx[96], f[96]; app_notif_text(&notifs[i], tx, sizeof tx); fit(f, sizeof f, tx, 0.46f, 330);
			if (!notifs[i].read) C2D_DrawCircleSolid(30, y + 10, 0.3f + ui_get_depth(), 4, COL_ACCENT);
			ui_text(42, y + 2, 0.46f, notifs[i].read ? COL_MUTED : COL_TEXT, 0, f);
			ui_text(42, y + 16, 0.32f, COL_MUTED, 0, !strcmp(notifs[i].kind, "invite") ? tr2("Toca para unirte", "Tap to join") : tr2("Mira Amigos", "See Friends"));
			if (i < 4) ui_rect(26, y + 28, 348, 1, COL_LINE);
		}
		break; }
	case P_SHOP: {
		ui_text(14, 33, 0.8f, COL_TEXT, 0, PAGE_NAME[P_SHOP]);
		char bc[40]; snprintf(bc, sizeof bc, "%d BCoins", wallet.bcoins); float bw = ui_text_width(bc, 0.5f) + 18;
		ui_rrect(386 - bw, 40, bw, 22, 11, COL_PANEL2); ui_text(386 - bw / 2, 43, 0.5f, C(0xF5, 0xC5, 0x42), C2D_AlignCenter, bc);
		ui_rrect(14, 66, 372, 160, 12, COL_PANEL);
		if (!g_account) { ui_text(30, 120, 0.46f, COL_MUTED, 0, tr2("La tienda necesita entrar con email.", "The shop needs an email login.")); break; }
		ui_text(30, 72, 0.4f, wallet.can_claim ? COL_GREEN : COL_MUTED, 0, wallet.can_claim ? tr2("Recompensa diaria disponible!", "Daily reward available!") : tr2("Recompensa diaria: vuelve manana", "Daily reward: come back tomorrow"));
		for (int i = 0, y = 92; i < nshop && i < 5; i++, y += 26) {
			const ShopItem *it = &shop[i]; char nm[40]; fit(nm, sizeof nm, it->name, 0.46f, 220);
			C2D_DrawCircleSolid(32, y + 9, 0.3f + ui_get_depth(), 4, rarity_col(it->rarity));
			ui_text(44, y, 0.46f, COL_TEXT, 0, nm);
			char pr[24]; if (!strcmp(it->kind, "crate")) snprintf(pr, sizeof pr, "%d BC", it->price); else snprintf(pr, sizeof pr, "%s", shop_equipped(it) ? tr2("Equipado", "Equipped") : shop_owned(it) ? tr2("Tuyo", "Owned") : "");
			if (!pr[0]) snprintf(pr, sizeof pr, "%d BC", it->price);
			ui_text(370, y + 1, 0.42f, shop_owned(it) && strcmp(it->kind, "crate") ? COL_GREEN : C(0xF5, 0xC5, 0x42), C2D_AlignRight, pr);
			if (i < 4) ui_rect(26, y + 21, 348, 1, COL_LINE);
		}
		if (nshop > 5) ui_text(200, 212, 0.34f, COL_MUTED, C2D_AlignCenter, tr2("Mas articulos en la pantalla tactil", "More items on the touch screen"));
		break; }
	case P_UPDATE: {
		ui_text(14, 33, 0.8f, COL_TEXT, 0, PAGE_NAME[P_UPDATE]);
		ui_rrect(14, 66, 372, 160, 12, COL_PANEL);
		ui_text(30, 76, 0.48f, COL_TEXT, 0, "Version instalada"); ui_text(370, 76, 0.48f, COL_MUTED, C2D_AlignRight, g_upd.cur[0] ? g_upd.cur : "?");
		ui_rect(26, 100, 348, 1, COL_LINE);
		for (int i = 0; i < 2; i++) {
			const Rel *r = i ? &g_upd.dev : &g_upd.stable; float y = 108 + i * 32;
			ui_text(30, y, 0.48f, COL_TEXT, 0, i ? "Devbuild" : "Estable");
			char t[56]; snprintf(t, sizeof t, "%s", !g_upd_have ? (g_upd_state == 1 ? "buscando..." : "-") : r->valid ? r->tag : "sin publicar");
			ui_text(150, y + 1, 0.46f, COL_MUTED, 0, t);
			if (g_upd_have && r->valid) {
				const char *lab = r->cmp > 0 ? tr2("Nueva", "New") : r->cmp == 0 ? tr2("Instalada", "Installed") : tr2("Antigua", "Older"); u32 c = r->cmp > 0 ? COL_GREEN : COL_PANEL2;
				float w = ui_text_width(lab, 0.38f) + 16; ui_rrect(370 - w, y + 1, w, 18, 9, c); ui_text(370 - w / 2, y + 2, 0.38f, COL_TEXT, C2D_AlignCenter, lab);
			}
			if (i == 0) ui_rect(26, y + 26, 348, 1, COL_LINE);
		}
		ui_rect(26, 172, 348, 1, COL_LINE);
		if (g_upd_state == 2) {
			char p[40]; snprintf(p, sizeof p, "Descargando... %d%%", g_upd_pct); ui_text(30, 180, 0.44f, COL_TEXT, 0, p);
			ui_rrect(30, 204, 340, 10, 5, COL_PANEL2); if (g_upd_pct > 0) ui_rrect(30, 204, 340.0f * g_upd_pct / 100, 10, 5, COL_GREEN);
		} else if (g_upd_state == 1) ui_text(30, 184, 0.44f, COL_MUTED, 0, "Buscando actualizaciones...");
		else if (g_upd_msg[0]) { char m[100]; fit(m, sizeof m, g_upd_msg, 0.42f, 330); ui_text(30, 184, 0.42f, g_upd_state == 3 ? COL_GREEN : COL_RED, 0, m); }
		else {
			const Rel *nr_ = g_upd.stable.newer ? &g_upd.stable : (g_upd.dev.newer && (cur_is_dev() || s_showdev)) ? &g_upd.dev : g_upd.stable.valid ? &g_upd.stable : &g_upd.dev;
			static char nl_[4][96]; char flat_[420]; snprintf(flat_, sizeof flat_, "%s", nr_->notes); for (char *q = flat_; *q; q++) if (*q == '\n') *q = ' ';
			int nn_ = nr_->valid && flat_[0] ? wrap(flat_, 0.36f, 330, nl_, 4) : 0;       // notas de la release (resumen)
			if (nn_) { for (int i = 0; i < nn_ && i < 3; i++) ui_text(30, 178 + i * 15, 0.36f, COL_MUTED, 0, nl_[i]); if (nn_ > 3) ui_text(30, 223, 0.3f, COL_MUTED, 0, "..."); }
			else { ui_text(30, 180, 0.4f, COL_MUTED, 0, update_is_cia() ? "Se instalara como .cia (se reemplaza esta app)." : "Se instalara como .3dsx (se reemplaza este fichero)."); ui_text(30, 196, 0.38f, COL_MUTED, 0, "Tus datos y tu sesion se conservan."); }
		}
		break; }
	case P_SETTINGS: {
		const char *dn[3] = {tr2("Corta", "Short"), tr2("Media", "Medium"), tr2("Larga", "Long")};
		ui_text(14, 33, 0.8f, COL_TEXT, 0, PAGE_NAME[P_SETTINGS]);
		ui_rrect(14, 66, 372, 162, 12, COL_PANEL);
		char sy[24]; snprintf(sy, sizeof sy, "%d ms", SYNC_MS[s_sync]);
		const char *lab[7] = {tr2("Distancia de dibujo", "Draw distance"), tr2("Sincronizacion de jugadores", "Player sync interval"), tr2("Buscar updates al abrir", "Check updates on start"), tr2("Avisos emergentes", "Pop-up alerts"), tr2("Idioma", "Language"), tr2("Cuenta", "Account"), tr2("Version", "Version")};
		const char *val[7] = {dn[s_dist], sy, s_auto ? tr2("Si", "Yes") : "No", s_notif_on ? tr2("Si", "Yes") : "No", LANG_NAME[s_lang], s->username, g_upd.cur[0] ? g_upd.cur : "Blocksy 3DS"};
		for (int i = 0; i < 7; i++) {
			float y = 72 + i * 22;
			ui_text(30, y, 0.44f, COL_TEXT, 0, lab[i]); ui_text(370, y, 0.44f, i >= 5 ? COL_MUTED : (i == 2 || i == 3) ? (i == 2 ? s_auto : s_notif_on) ? COL_GREEN : COL_MUTED : COL_ACCENT, C2D_AlignRight, val[i]);
			if (i < 6) ui_rect(26, y + 19, 348, 1, COL_LINE);
		}
		break; }
	}
}

static void modal_top(const Ui *u) {
	if (u->modal < 0 || u->modal >= ngames) return;
	const GameInfo *g = &games[u->modal];
	ui_rect(0, 29, 400, 211, C2D_Color32(0, 0, 0, 175));
	ui_rrect(24, 40, 352, 176, 14, COL_PANEL);
	ui_thumb(38, 54, 132, g->hue, 0);
	char nm[48]; fit(nm, sizeof nm, g->name, 0.8f, 190); ui_text(184, 52, 0.8f, COL_TEXT, 0, nm);
	char by[48]; snprintf(by, sizeof by, "por %s", g->owner[0] ? g->owner : "Blocksy"); ui_text(184, 80, 0.4f, COL_MUTED, 0, by);
	char a[16], b[16]; snprintf(a, sizeof a, "%d", g->players); snprintf(b, sizeof b, "%d", g->max);
	ui_text(184, 100, 0.6f, COL_TEXT, 0, a); ui_text(184, 120, 0.34f, COL_MUTED, 0, "jugando");
	ui_text(236, 100, 0.6f, COL_TEXT, 0, b);  ui_text(236, 120, 0.34f, COL_MUTED, 0, "max. jugadores");
	ui_text(310, 104, 0.4f, COL_TEXT, 0, "Web + 3DS"); ui_text(310, 120, 0.34f, COL_MUTED, 0, "plataformas");
	static char lines[3][96]; int nl = wrap(g->about[0] ? g->about : g->desc[0] ? g->desc : "Sin descripcion.", 0.42f, 180, lines, 3);
	for (int i = 0; i < nl; i++) ui_text(184, 142 + i * 15, 0.42f, COL_MUTED, 0, lines[i]);
	{ char hint[64]; snprintf(hint, sizeof hint, "A: %s     X: %s     B: %s", tr2("jugar", "play"), g->fav ? tr2("quitar favorito", "unfavorite") : tr2("favorito", "favorite"), tr2("cerrar", "close")); ui_text(200, 196, 0.38f, COL_MUTED, C2D_AlignCenter, hint); }
}

// ================= PANTALLA INFERIOR =================
enum { SB_W = 102, SB_ITEM_H = 24, SB_Y = 6, SB_EXIT_Y = 207 };

static void sidebar(const Ui *u) {
	ui_rect(0, 0, SB_W, 240, COL_PANEL); ui_rect(SB_W, 0, 1, 240, COL_LINE);
	for (int i = 0; i < NPAGES; i++) {
		float y = SB_Y + i * SB_ITEM_H; bool act = u->page == i;
		if (act) { ui_rrect(4, y, SB_W - 8, SB_ITEM_H - 3, 7, COL_PANEL2); ui_rect(4, y + 5, 3, SB_ITEM_H - 11, COL_ACCENT); }
		ui_icon(PAGE_ICON[i], 14, y + 5, act ? COL_TEXT : COL_MUTED);
		ui_text(36, y + 3, 0.45f, act ? COL_TEXT : COL_MUTED, 0, PAGE_NAME[i]);
		if ((i == P_UPDATE && upd_available()) || (i == P_NOTIF && notif_unread) || (i == P_FRIENDS && (unread || nreqs))) C2D_DrawCircleSolid(SB_W - 8, y + 12, 0.3f + ui_get_depth(), 3.5f, COL_DANGER);   // punto rojo: novedades
	}
	ui_rect(8, SB_EXIT_Y - 6, SB_W - 16, 1, COL_LINE);
	ui_icon(6, 14, SB_EXIT_Y + 5, COL_MUTED); ui_text(36, SB_EXIT_Y + 3, 0.45f, COL_MUTED, 0, tr2("Salir", "Exit"));
}

static void list_game_row(float y, const GameInfo *g, bool sel, const char *btn) {
	if (sel) ui_rrect(PANE_X - 2, y, PANE_W + 2, row_h(P_HOME) - 3, 8, COL_PANEL2);
	ui_thumb(PANE_X + 2, y + 3, 34, g->hue, 0);
	char nm[48]; fit(nm, sizeof nm, g->name, 0.46f, btn ? 96 : 150); ui_text(PANE_X + 42, y + 3, 0.46f, COL_TEXT, 0, nm);
	char sub[64]; if (g->players) snprintf(sub, sizeof sub, "%d jugando", g->players); else if (g->visits > 0) snprintf(sub, sizeof sub, "%ld visitas", g->visits); else snprintf(sub, sizeof sub, "por %s", g->owner[0] ? g->owner : "Blocksy");
	char s2[64]; fit(s2, sizeof s2, sub, 0.34f, btn ? 90 : 150);
	ui_text(PANE_X + 42, y + 21, 0.34f, g->players ? COL_GREEN : COL_MUTED, 0, s2);
	if (btn) ui_button(PANE_X + PANE_W - 56, y + 6, 54, 26, COL_DANGER, false, btn, 0.4f);
}

static void pane(const Ui *u, const Session *s) {
	int view[MAX_GAMES]; PRow pr[MAX_PEOPLE * 2 + 2];
	char title[40];
	snprintf(title, sizeof title, "%s", PAGE_NAME[u->page]);
	ui_text(PANE_X, 5, 0.6f, COL_TEXT, 0, title);

	if (u->modal >= 0 && u->modal < ngames) {                      // ficha del juego: acciones
		const GameInfo *g = &games[u->modal];
		ui_thumb(PANE_X + 4, 34, 70, g->hue, 0);
		char nm[48]; fit(nm, sizeof nm, g->name, 0.55f, 120); ui_text(PANE_X + 82, 36, 0.55f, COL_TEXT, 0, nm);
		char by[48]; snprintf(by, sizeof by, "por %s", g->owner[0] ? g->owner : "Blocksy"); ui_text(PANE_X + 82, 58, 0.36f, COL_MUTED, 0, by);
		char pl[48]; snprintf(pl, sizeof pl, "%d jugando", g->players); ui_text(PANE_X + 82, 74, 0.38f, g->players ? COL_GREEN : COL_MUTED, 0, pl);
		if (g->visits > 0) { char vs[40]; snprintf(vs, sizeof vs, tr2("%ld visitas", "%ld visits"), g->visits); ui_text(PANE_X + 82, 90, 0.36f, COL_MUTED, 0, vs); }
		ui_button(PANE_X + 2, 130, PANE_W - 6, 48, COL_GREEN, false, "Jugar", 0.7f);
		ui_button(PANE_X + 2, 186, PANE_W - 6, 36, COL_PANEL2, false, "Cerrar", 0.5f);
		return;
	}

	int rh = row_h(u->page), vis = rows_visible(u->page), total = count_rows(u, s);
	switch (u->page) {
	case P_HOME: case P_DISCOVER: {
		int n = build_view(u, s, view);
		if (u->page == P_DISCOVER) { ui_rrect(PANE_X + 78, 4, PANE_W - 78, 20, 10, COL_PANEL2); ui_text(PANE_X + 86, 5, 0.38f, u->search[0] ? COL_TEXT : COL_MUTED, 0, u->search[0] ? u->search : "Buscar (X)"); }
		for (int i = 0; i < vis && u->scroll + i < n; i++) list_game_row(LIST_Y + i * rh, &games[view[u->scroll + i]], u->scroll + i == u->cur, NULL);
		if (!n) ui_text(PANE_X, 50, 0.44f, COL_MUTED, 0, u->page == P_DISCOVER && u->search[0] ? "Sin resultados." : "Cargando...");
		break; }
	case P_FRIENDS: {
		int n = build_people(s, pr);
		if (!g_account) { ui_text(PANE_X, 40, 0.42f, COL_MUTED, 0, tr2("No disponible con QR.", "Not available with QR.")); break; }
		if (u->dm >= 0 && u->dm < nfriends) {
			char nm[32]; fit(nm, sizeof nm, friends[u->dm].name, 0.5f, PANE_W - 10); ui_text(PANE_X, 28, 0.5f, COL_TEXT, 0, nm);
			int sel = u->dm_sel < 0 || u->dm_sel >= ndm ? ndm - 1 : u->dm_sel; bool mine = sel >= 0 && dm[sel].mine;
			if (sel >= 0) { char pv[60]; fit(pv, sizeof pv, dm[sel].text, 0.34f, PANE_W - 10); ui_text(PANE_X, 48, 0.34f, mine ? COL_ACCENT : COL_MUTED, 0, pv); }
			ui_button(PANE_X + 2, 66, PANE_W - 6, 40, COL_GREEN, false, tr2("Escribir (A)", "Write (A)"), 0.55f);
			ui_button(PANE_X + 2, 112, 98, 30, mine ? COL_ACCENT_D : COL_PANEL2, false, tr2("Editar (X)", "Edit (X)"), 0.4f);
			bool conf = sel >= 0 && u->dm_del && u->dm_del == dm[sel].id;
			ui_button(PANE_X + 104, 112, 98, 30, mine ? COL_DANGER : COL_PANEL2, false, conf ? tr2("Seguro?", "Sure?") : tr2("Borrar (Y)", "Delete (Y)"), 0.4f);
			ui_button(PANE_X + 2, 148, 98, 30, COL_PANEL2, false, tr2("^ Subir", "^ Up"), 0.42f);
			ui_button(PANE_X + 104, 148, 98, 30, COL_PANEL2, false, tr2("v Bajar", "v Down"), 0.42f);
			ui_button(PANE_X + 2, 186, PANE_W - 6, 34, COL_PANEL2, false, tr2("Cerrar chat (B)", "Close chat (B)"), 0.46f);
			break;
		}
		for (int i = 0; i < vis && u->scroll + i < n; i++) {
			int r = u->scroll + i; float y = LIST_Y + i * rh;
			if (r == u->cur) ui_rrect(PANE_X - 2, y, PANE_W + 2, rh - 3, 8, COL_PANEL2);
			if (pr[r].kind == 0) { ui_button(PANE_X, y + 3, PANE_W - 4, rh - 8, COL_ACCENT_D, false, tr2("+ Anadir amigo (usuario)", "+ Add friend (username)"), 0.42f); continue; }
			if (pr[r].kind == 1) {
				ui_avatar(PANE_X + 14, y + 16, 10, pr[r].r->color, -1, pr[r].r->name);
				char nm[32]; fit(nm, sizeof nm, pr[r].r->name, 0.42f, 70); ui_text(PANE_X + 32, y + 2, 0.42f, COL_TEXT, 0, nm); ui_text(PANE_X + 32, y + 19, 0.3f, COL_ACCENT, 0, tr2("solicitud", "request"));
				ui_button(PANE_X + PANE_W - 64, y + 5, 30, 24, COL_GREEN, false, "OK", 0.38f); ui_button(PANE_X + PANE_W - 32, y + 5, 30, 24, COL_DANGER, false, "X", 0.38f);
				continue;
			}
			const Person *p = pr[r].p;
			ui_avatar(PANE_X + 14, y + 16, 10, p->color, p->online, p->name);
			char nm[32]; fit(nm, sizeof nm, p->name, 0.44f, 76); ui_text(PANE_X + 32, y + 2, 0.44f, COL_TEXT, 0, nm);
			ui_text(PANE_X + 32, y + 19, 0.32f, COL_MUTED, 0, status_of(p));
			ui_button(PANE_X + PANE_W - 74, y + 5, 44, 24, COL_ACCENT_D, false, "Chat", 0.36f);
			ui_button(PANE_X + PANE_W - 28, y + 5, 26, 24, u->rm_confirm == r ? COL_DANGER : COL_PANEL2, false, "X", 0.38f);
		}
		break; }
	case P_NOTIF: {
		if (!g_account) { ui_text(PANE_X, 40, 0.42f, COL_MUTED, 0, tr2("No disponible con QR.", "Not available with QR.")); break; }
		for (int i = 0; i < vis && u->scroll + i < nnotifs + 1; i++) {
			int r = u->scroll + i; float y = LIST_Y + i * rh;
			if (r == u->cur) ui_rrect(PANE_X - 2, y, PANE_W + 2, rh - 3, 8, COL_PANEL2);
			if (r == 0) { ui_button(PANE_X, y + 3, PANE_W - 4, rh - 8, nnotifs ? COL_DANGER : COL_PANEL2, false, tr2("Borrar todos los avisos", "Clear all alerts"), 0.42f); continue; }
			const Notif *n = &notifs[r - 1]; char tx[96], f[96]; app_notif_text(n, tx, sizeof tx); fit(f, sizeof f, tx, 0.36f, PANE_W - 62);
			if (!n->read) C2D_DrawCircleSolid(PANE_X + 6, y + 18, 0.3f + ui_get_depth(), 3.5f, COL_ACCENT);
			ui_text(PANE_X + 14, y + 10, 0.36f, n->read ? COL_MUTED : COL_TEXT, 0, f);
			ui_button(PANE_X + PANE_W - 46, y + 5, 44, 24, !strcmp(n->kind, "invite") ? COL_GREEN : COL_ACCENT_D, false, !strcmp(n->kind, "invite") ? tr2("Unirse", "Join") : "Ver", 0.36f);
		}
		break; }
	case P_SHOP: {
		if (!g_account) { ui_text(PANE_X, 40, 0.42f, COL_MUTED, 0, tr2("No disponible con QR.", "Not available with QR.")); break; }
		for (int i = 0; i < vis && u->scroll + i < nshop + 1; i++) {
			int r = u->scroll + i; float y = LIST_Y + i * rh;
			if (r == u->cur) ui_rrect(PANE_X - 2, y, PANE_W + 2, rh - 3, 8, COL_PANEL2);
			if (r == 0) { ui_button(PANE_X, y + 3, PANE_W - 4, rh - 8, wallet.can_claim ? COL_GREEN : COL_PANEL2, false, wallet.can_claim ? tr2("Recoger recompensa diaria", "Claim daily reward") : tr2("Recompensa ya recogida", "Reward claimed"), 0.4f); continue; }
			const ShopItem *it = &shop[r - 1]; char nm[32]; fit(nm, sizeof nm, it->name, 0.4f, PANE_W - 78);
			C2D_DrawCircleSolid(PANE_X + 6, y + 18, 0.3f + ui_get_depth(), 3.5f, rarity_col(it->rarity));
			ui_text(PANE_X + 14, y + 10, 0.4f, COL_TEXT, 0, nm);
			bool crate = !strcmp(it->kind, "crate"), own = shop_owned(it) && !crate, eq = shop_equipped(it);
			char lab[24]; if (crate) snprintf(lab, sizeof lab, "%s", tr2("Abrir", "Open")); else if (own) snprintf(lab, sizeof lab, "%s", eq ? tr2("Quitar", "Unequip") : tr2("Equipar", "Equip")); else snprintf(lab, sizeof lab, "%d", it->price);
			ui_button(PANE_X + PANE_W - 60, y + 5, 58, 24, own ? (eq ? COL_PANEL2 : COL_GREEN) : COL_ACCENT_D, false, lab, 0.36f);
		}
		break; }
	case P_AVATAR: {
		ui_text(PANE_X, 28, 0.4f, COL_MUTED, 0, tr2("Color de camiseta:", "Shirt color:"));
		for (int i = 0; i < 10; i++) {
			float x = PANE_X + 2 + (i % 5) * 40, y = 44 + (i / 5) * 34; u32 c = parse_hex(AVATAR_COLORS[i]);
			if (i == u->swatch) ui_rrect(x - 3, y - 3, 38, 31, 8, COL_TEXT);
			ui_rrect(x, y, 32, 25, 6, c);
		}
		for (int k = 0; k < 2; k++) {                                   // sombrero y titulo: < nombre >
			const char *kind = k ? "title" : "hat"; float y = 116 + k * 36;
			char l[48], f[48]; snprintf(l, sizeof l, "%s: %s", k ? tr2("Titulo", "Title") : tr2("Sombrero", "Hat"), acc_name(kind)); fit(f, sizeof f, l, 0.4f, PANE_W - 96);
			ui_button(PANE_X + 2, y, 36, 30, COL_PANEL2, false, "<", 0.5f); ui_button(PANE_X + PANE_W - 40, y, 36, 30, COL_PANEL2, false, ">", 0.5f);
			ui_text(PANE_X + PANE_W / 2 - 2, y + 8, 0.4f, COL_TEXT, C2D_AlignCenter, f);
		}
		ui_button(PANE_X + 2, 192, PANE_W - 6, 38, g_account ? COL_GREEN : COL_PANEL2, false, tr2("Guardar color", "Save color"), 0.5f);
		if (!g_account) ui_text(PANE_X, 232, 0.3f, COL_RED, 0, tr2("Requiere entrar con email.", "Needs an email login."));
		break; }
	case P_UPDATE: {
		char l1[64], l2[64], l3[64];
		snprintf(l1, sizeof l1, "Buscar actualizaciones");
		snprintf(l2, sizeof l2, g_upd.stable.valid ? "Estable %s%s" : "Estable (sin publicar)", g_upd.stable.tag, g_upd.stable.cmp > 0 ? " - nueva" : g_upd.stable.cmp == 0 ? " (instalada)" : "");
		snprintf(l3, sizeof l3, g_upd.dev.valid ? "Devbuild %s%s" : "Devbuild (sin publicar)", g_upd.dev.tag, g_upd.dev.cmp > 0 ? " - nueva" : g_upd.dev.cmp == 0 ? " (instalada)" : "");
		char f2[64], f3[64]; fit(f2, sizeof f2, l2, 0.44f, PANE_W - 24); fit(f3, sizeof f3, l3, 0.44f, PANE_W - 24);
		bool busy = g_upd_state == 2 || g_upd_state == 1;
		ui_button(PANE_X, LIST_Y + 2, PANE_W - 4, rh - 6, COL_PANEL2, u->cur == 0, l1, 0.46f);
		ui_button(PANE_X, LIST_Y + 2 + rh, PANE_W - 4, rh - 6, g_upd.stable.valid && !busy && g_upd.stable.cmp > 0 ? COL_GREEN : COL_PANEL2, u->cur == 1, f2, 0.44f);
		ui_button(PANE_X, LIST_Y + 2 + 2 * rh, PANE_W - 4, rh - 6, g_upd.dev.valid && !busy && g_upd.dev.cmp > 0 ? COL_GREEN : COL_PANEL2, u->cur == 2, f3, 0.44f);
		ui_text(PANE_X, LIST_Y + 2 + 3 * rh + 4, 0.34f, COL_MUTED, 0, "Toca para instalar la version elegida.");
		if (g_upd_state == 2) { ui_rrect(PANE_X, 200, PANE_W - 4, 12, 6, COL_PANEL2); if (g_upd_pct > 0) ui_rrect(PANE_X, 200, (PANE_W - 4) * g_upd_pct / 100.0f, 12, 6, COL_GREEN); }
		break; }
	case P_SETTINGS: {
		const char *dn[3] = {tr2("Corta", "Short"), tr2("Media", "Medium"), tr2("Larga", "Long")};
		char l[13][48]; const char *fn[3] = {tr2("Facil", "Easy"), "Normal", tr2("Dificil", "Hard")};
		snprintf(l[0], 48, "%s: %s", tr2("Distancia", "Distance"), dn[s_dist]);
		snprintf(l[1], 48, "%s: %d ms", tr2("Sincronizacion", "Sync"), SYNC_MS[s_sync]);
		snprintf(l[2], 48, "%s: %s", tr2("Updates al abrir", "Updates on start"), s_auto ? tr2("Si", "Yes") : "No");
		snprintf(l[3], 48, "%s: %s", tr2("Avisos", "Alerts"), s_notif_on ? tr2("Si", "Yes") : "No");
		snprintf(l[4], 48, "%s: %s", tr2("Idioma", "Language"), LANG_NAME[s_lang]);
		snprintf(l[5], 48, "%s", tr2("Olvidar mi email", "Forget my email")); snprintf(l[6], 48, "%s", tr2("Cerrar sesion", "Log out"));
		snprintf(l[7], 48, "%s: %s", tr2("Dificultad del bosque", "Forest difficulty"), fn[s_forest]);
		snprintf(l[8], 48, "%s: %s", tr2("Polvo al caminar", "Footstep dust"), s_steps ? tr2("Si", "Yes") : "No");
		snprintf(l[9], 48, "%s: %s", tr2("Mostrar devbuilds", "Show devbuilds"), s_showdev || cur_is_dev() ? tr2("Si", "Yes") : "No");
		snprintf(l[10], 48, "%s: %s", tr2("Musica", "Music"), !audio_available() ? "(sin DSP)" : app_music_on() ? tr2("Si", "Yes") : "No");
		snprintf(l[11], 48, "%s: %d%%", tr2("Volumen de la musica", "Music volume"), s_mvol);
		snprintf(l[12], 48, "%s: %s", tr2("Efectos de sonido", "Sound effects"), !audio_available() ? "(sin DSP)" : s_sfx ? tr2("Si", "Yes") : "No");
		for (int i = 0; i < vis && u->scroll + i < 13; i++) {
			int r = u->scroll + i; float y = LIST_Y + 2 + i * rh;
			if (r == 1) {                                       // barra deslizante: toca o arrastra para elegir (izquierda = rapido)
				ui_button(PANE_X, y, PANE_W - 4, rh - 4, COL_PANEL2, u->cur == 1, l[1], 0.38f);
				float x0 = PANE_X + 12, w = PANE_W - 28; ui_rrect(x0, y + rh - 14, w, 5, 2.5f, COL_LINE);
				float kx = x0 + w * s_sync / 5.0f; ui_rrect(x0, y + rh - 14, kx - x0 + 1, 5, 2.5f, COL_ACCENT); C2D_DrawCircleSolid(kx, y + rh - 11.5f, 0.35f + ui_get_depth(), 5.5f, COL_TEXT);
				continue;
			}
			ui_button(PANE_X, y, PANE_W - 4, rh - 4, r == 6 ? COL_DANGER : COL_PANEL2, u->cur == r, l[r], 0.44f);
		}
		break; }
	}
	if (total > vis && u->page != P_SETTINGS && u->page != P_AVATAR && u->page != P_UPDATE) {        // barra de desplazamiento
		float th = (LIST_BOTTOM - LIST_Y) * (float)vis / total, ty = LIST_Y + (LIST_BOTTOM - LIST_Y - th) * ((float)u->scroll / (total - vis));
		ui_rrect(314, ty, 3, th, 1.5f, COL_LINE);
	}
}

static void draw_all(C3D_RenderTarget *top, C3D_RenderTarget *bot, const Ui *u, const Session *s, const char *version) {
	ui_frame_begin();
	C3D_FrameBegin(C3D_FRAME_SYNCDRAW);
	C2D_TargetClear(top, COL_BG); C2D_SceneBegin(top);
	page_top(u, s);
	ui_set_depth(0.4f); modal_top(u);                         // ficha del juego: por encima de los textos de la página
	ui_set_depth(0); top_bar(u, s, W.busy);
	if (u->toast_until > osGetTime()) {
		ui_set_depth(0.45f);   // texto = +0.5: por encima de 1.0 citro2d lo recorta (el texto del aviso no salía)
		float w = ui_text_width(u->toast, 0.44f) + 28;
		ui_rrect(200 - w / 2, 204, w, 24, 10, COL_PANEL2); ui_text(200, 208, 0.44f, COL_TEXT, C2D_AlignCenter, u->toast);
		ui_set_depth(0);
	}
	C2D_TargetClear(bot, COL_BG); C2D_SceneBegin(bot);
	sidebar(u); pane(u, s);
	ui_text(310, 224, 0.3f, COL_LINE, C2D_AlignRight, version);
	C3D_FrameEnd(0);
}

#ifdef BLOCKSY_PREVIEW
void app_preview(C3D_RenderTarget *top, C3D_RenderTarget *bot, int page, int modal, int cursor, const char *version) {
	static Session s; snprintf(s.username, sizeof s.username, "Iker"); snprintf(s.user_id, sizeof s.user_id, "me"); s.color = parse_hex("#ff9f43");
	static const char *nm[] = {"Spawn Plaza", "Parkour Tower", "Lava Escape", "Sky Islands", "Mundo de Iker", "Castillos"};
	static const int hue[] = {205, 20, 350, 140, 280, 60}, pl[] = {3, 5, 0, 2, 1, 0};
	for (int i = 0; i < 6; i++) { GameInfo *g = &games[i]; memset(g, 0, sizeof *g); snprintf(g->id, 40, "g%d", i); snprintf(g->name, 44, "%s", nm[i]); snprintf(g->owner, 24, i == 4 ? "Iker" : "Blocksy"); snprintf(g->owner_id, 40, i == 4 ? "me" : "x"); g->hue = hue[i]; g->players = pl[i]; g->max = 20; snprintf(g->desc, 104, "Mundo abierto para construir con tus amigos desde la web o la 3DS. Empieza aqui!"); }
	ngames = 6; static const char *fn[] = {"Marta", "Dani", "Lucia", "Pablo", "Nora"};
	for (int i = 0; i < 5; i++) { Person *p = &friends[i]; memset(p, 0, sizeof *p); snprintf(p->name, 24, "%s", fn[i]); p->color = parse_hex(AVATAR_COLORS[i + 1]); p->online = i < 3; p->in_game = i == 1; snprintf(p->id, 40, "f%d", i); }
	nfriends = 5; nreqs = 1; snprintf(reqs[0].name, 24, "Carlos"); reqs[0].color = parse_hex("#1abc9c"); unread = 2; g_account = 1;
	snprintf(g_upd.cur, sizeof g_upd.cur, "0.1.0-dev.9"); g_upd_have = 1;
	snprintf(g_upd.dev.tag, sizeof g_upd.dev.tag, "v0.1.0-dev.12"); g_upd.dev.valid = 1; g_upd.dev.is_dev = 1; g_upd.dev.newer = 1;
	int dm_demo = modal == -20; if (dm_demo) modal = -1;
	prev_demo = modal <= -6 ? -modal - 5 : 0; if (modal <= -6) modal = -1;
	if (page == P_UPDATE) { g_upd_state = modal == -3 ? 2 : modal == -4 ? 3 : modal == -5 ? 4 : 0; g_upd_pct = 45; snprintf(g_upd_msg, sizeof g_upd_msg, modal == -5 ? "Descarga fallida: Couldn't resolve host" : "Instalada. Cierra Blocksy y abrela de nuevo desde HOME"); if (modal <= -3) modal = -1; }
	nshop = 6; wallet.bcoins = 340; wallet.can_claim = 1; wallet.ninv = 1; snprintf(wallet.inv[0], 32, "hat_cap"); snprintf(wallet.hat, 32, "hat_cap");
	{ static const char *const sid[] = {"crate_basic", "hat_cap", "hat_halo", "hat_crown", "title_builder", "title_legend"}, *const sk[] = {"crate", "hat", "hat", "hat", "title", "title"}, *const sn[] = {"Cofre de botin", "Gorra", "Aureola", "Corona", "Constructor", "Leyenda"};
	  static const int sp[] = {150, 100, 300, 500, 80, 400}, sr[] = {1, 0, 1, 2, 0, 2};
	  for (int i = 0; i < 6; i++) { snprintf(shop[i].id, 32, "%s", sid[i]); snprintf(shop[i].kind, 8, "%s", sk[i]); snprintf(shop[i].name, 32, "%s", sn[i]); shop[i].price = sp[i]; shop[i].rarity = sr[i]; } }
	nnotifs = 3; notif_unread = 2;
	snprintf(notifs[0].kind, 16, "invite"); snprintf(notifs[0].from, 24, "Marta"); snprintf(notifs[0].game, 44, "Spawn Plaza"); notifs[0].read = 0;
	snprintf(notifs[1].kind, 16, "friend_request"); snprintf(notifs[1].from, 24, "Carlos"); notifs[1].read = 0;
	snprintf(notifs[2].kind, 16, "friend_accept"); snprintf(notifs[2].from, 24, "Lucia"); notifs[2].read = 1;
	static const char *const dmt[] = {"Hola!", "Vienes al juego?", "Voy ahora mismo", "Te espero en la plaza", "He construido una torre enorme", "Mira que alta"};
	ndm = 6; for (int i = 0; i < 6; i++) { dm[i].id = i + 1; dm[i].mine = i % 3 == 2; dm[i].edited = i == 2; snprintf(dm[i].text, 100, "%s", dmt[i]); }
	int dmopen = dm_demo;
	Ui u = {.page = page, .cur = cursor, .modal = modal, .swatch = 1, .dm = dmopen ? 0 : -1, .rm_confirm = -1, .dm_sel = dmopen ? 2 : -1}; strcpy(u.search, page == P_DISCOVER ? "" : "");
	draw_all(top, bot, &u, &s, version);
}
#endif

// ================= BUCLE PRINCIPAL =================
static Thread spawn_worker(void) {
	s32 prio = 0x30; svcGetThreadPriority(&prio, CUR_THREAD_HANDLE);
	return threadCreate(worker_thread, NULL, 256 * 1024, prio + 1, 0, false);   // prioridad menor que la UI
}

static bool prompt(char *dst, size_t n, const char *hint) {
	SwkbdState kb; swkbdInit(&kb, SWKBD_TYPE_NORMAL, 2, (int)n - 1); swkbdSetHintText(&kb, hint); swkbdSetInitialText(&kb, dst);
	swkbdSetValidation(&kb, SWKBD_NOTEMPTY_NOTBLANK, 0, 0);
	char buf[128] = ""; if (swkbdInputText(&kb, buf, n < sizeof buf ? n : sizeof buf) != SWKBD_BUTTON_CONFIRM) return false;
	snprintf(dst, n, "%s", buf); return true;
}

static void request(Req r, const char *a, const char *b, int n) {
	if (W.req || W.busy) return;
	snprintf(W.arg, sizeof W.arg, "%s", a ? a : ""); snprintf(W.arg2, sizeof W.arg2, "%s", b ? b : ""); W.n = n; W.req = r;
}

static bool acc_cycle(const char *kind, int dir) {         // false: no tienes ninguno (compralos en la tienda)
	const char *ids[24], *nm[24]; int n = acc_list(kind, ids, nm);
	if (n <= 1) return false;
	int c = (acc_cur(kind, n, ids) + dir + n) % n; request(RQ_EQUIP, ids[c], kind, 0);
	if (!strcmp(kind, "hat")) { wallet.hat[0] = 0; snprintf(wallet.hat, sizeof wallet.hat, "%s", ids[c]); pack_loadout(&wallet); }
	else snprintf(wallet.title, sizeof wallet.title, "%s", ids[c]);
	return true;
}

AppResult app_lobby(C3D_RenderTarget *top, C3D_RenderTarget *bot, Session *s, GameInfo *chosen, const char *version) {
	LightLock_Init(&lk);
	load_settings();
	memset(&W, 0, sizeof W); W.s = s;
	Ui u = {.page = P_HOME, .modal = -1, .dm = -1, .rm_confirm = -1, .dm_sel = -1};
	// color actual del avatar -> swatch
	for (int i = 0; i < 10; i++) if (parse_hex(AVATAR_COLORS[i]) == s->color) u.swatch = i;
	if (!g_upd.cur[0]) snprintf(g_upd.cur, sizeof g_upd.cur, "%s", version);
	W.req = RQ_REFRESH;
	Thread th = spawn_worker();
	AppResult res = APP_QUIT;
	bool dragging = false, touching = false, sliding = false; int t0x = 0, t0y = 0, t0scroll = 0, tapx = 0;

	while (aptMainLoop()) {
		hidScanInput();
		u32 down = hidKeysDown(), held = hidKeysHeld(), up = hidKeysUp();
		if (u.seen_seq != W.seq) { u.seen_seq = W.seq; sync_data(); }
		if (W.msg[0] && !W.busy) { toast(&u, W.msg); W.msg[0] = 0; }
		if (g_account && W.seq > 0 && (wallet.bcoins || wallet.ninv || nfriends)) {         // logros de la 3DS (se guardan en la tarjeta SD)
			static const char *const AN[5] = {"Rico: 1000 BCoins", "Primera compra", "Coleccionista: 5 objetos", "Sociable: 3 amigos", "Racha de 3 dias"};
			int bits = (wallet.bcoins >= 1000) | (wallet.ninv >= 1) << 1 | (wallet.ninv >= 5) << 2 | (nfriends >= 3) << 3 | (wallet.streak >= 3) << 4, nw = bits & ~s_ach;
			if (nw) { for (int i = 0; i < 5; i++) if (nw & (1 << i)) { char m[64]; snprintf(m, sizeof m, "%s: %s", tr2("Logro", "Achievement"), AN[i]); toast(&u, m); break; } s_ach |= nw; save_settings(); }
		}
		if (g_upd_announce) { g_upd_announce = 0; char m[64]; snprintf(m, sizeof m, "Hay una version nueva: %s", g_upd.stable.newer ? g_upd.stable.tag : g_upd.dev.tag); toast(&u, m); }
		if (down & KEY_START) { res = APP_QUIT; break; }
		if (u.dm >= 0 && g_dm_seq != u.seen_dm) { u.seen_dm = g_dm_seq; sync_data(); if (u.dm_sel >= ndm) u.dm_sel = -1; }
		if (g_alert_seq != u.seen_alert) { u.seen_alert = g_alert_seq; toast(&u, g_alert); }
		// actualización instalada: reinicia la app sola (solo .cia; con .3dsx hay que volver a abrirla desde el Homebrew Launcher)
		if (g_upd_state == 3 && update_is_cia() && !u.pending_restart) { u.pending_restart = (int)(osGetTime() & 0x7FFFFFFF) | 1; u.restart_t = osGetTime(); }
		if (u.pending_restart && osGetTime() - u.restart_t > 2200) { res = APP_RESTART; break; }

		int vis = rows_visible(u.page), total = count_rows(&u, s), act_row = -1; bool tap_btn = false, do_back = false;
		int view[MAX_GAMES]; PRow pr[MAX_PEOPLE * 2 + 2];
		int newpage = -1;
		if (down & KEY_R) newpage = (u.page + 1) % NPAGES;
		if (down & KEY_L) newpage = (u.page + NPAGES - 1) % NPAGES;

		if (u.page == P_FRIENDS && u.dm >= 0) {                           // chat privado abierto: A escribe, B cierra
			if (down & KEY_A) act_row = 200;
			if (down & KEY_B) act_row = 202;
			if (down & KEY_X) act_row = 203;
			if (down & KEY_Y) act_row = 204;
			if (down & KEY_DUP) act_row = 205;
			if (down & KEY_DDOWN) act_row = 206;
		} else if (u.modal >= 0) {                                       // ficha de juego abierta
			if (down & KEY_A) act_row = -2;                              // jugar
			if (down & KEY_B) do_back = true;
			if (down & KEY_X) act_row = -3;                              // favorito
		} else {
			int step = (u.page == P_DISCOVER) ? 5 : 1;
			if (down & KEY_DDOWN) u.cur += step;
			if (down & KEY_DUP) u.cur -= step;
			if ((u.page == P_HOME || u.page == P_DISCOVER) && (down & KEY_DRIGHT)) u.cur++;
			if ((u.page == P_HOME || u.page == P_DISCOVER) && (down & KEY_DLEFT)) u.cur--;
			if (u.page == P_AVATAR) { if (down & KEY_DRIGHT) u.swatch = (u.swatch + 1) % 10; if (down & KEY_DLEFT) u.swatch = (u.swatch + 9) % 10; if (down & KEY_DDOWN) u.swatch = (u.swatch + 5) % 10; if (down & KEY_DUP) u.swatch = (u.swatch + 5) % 10; u.cur = 0; }
			if (u.page == P_SETTINGS && u.cur == 1) { if ((down & KEY_DRIGHT) && s_sync < 5) { s_sync++; save_settings(); } if ((down & KEY_DLEFT) && s_sync > 0) { s_sync--; save_settings(); } }
			if (down & KEY_A) act_row = u.cur;
			if (down & KEY_Y) request(RQ_REFRESH, NULL, NULL, 0);
			if (down & KEY_X) { if (u.page == P_DISCOVER) { prompt(u.search, sizeof u.search, "Buscar juegos"); u.cur = 0; u.scroll = 0; } else if (u.page == P_AVATAR) prev_demo = (prev_demo + 1) % (NEMOTES + 1); }
		}

		// ---- táctil ----
		// Menú lateral, fichas y botones actúan al tocar; las filas de las listas al soltar (así se puede arrastrar para desplazar)
		if (down & KEY_TOUCH) {
			touchPosition t; hidTouchRead(&t); t0x = t.px; t0y = t.py; t0scroll = u.scroll; dragging = false; touching = true;
			if (t.px < SB_W) {
				if (t.py >= SB_EXIT_Y - 4) { res = APP_LOGOUT; break; }
				int i = (t.py - SB_Y) / SB_ITEM_H; if (i >= 0 && i < NPAGES) newpage = i;
				touching = false;
			} else if (u.modal >= 0) {
				if (t.py >= 130 && t.py < 182) act_row = -2;
				else if (t.py >= 186) do_back = true;
				touching = false;
			} else if (u.page == P_FRIENDS && u.dm >= 0) {
				if (t.py >= 66 && t.py < 108) act_row = 200;
				else if (t.py >= 112 && t.py < 144) act_row = t.px < PANE_X + 102 ? 203 : 204;
				else if (t.py >= 148 && t.py < 180) act_row = t.px < PANE_X + 102 ? 205 : 206;
				else if (t.py >= 186) act_row = 202;
				touching = false;
			} else if (u.page == P_AVATAR) {
				for (int i = 0; i < 10; i++) { int x = PANE_X + 2 + (i % 5) * 40, y = 44 + (i / 5) * 34; if (t.px >= x - 3 && t.px < x + 35 && t.py >= y - 3 && t.py < y + 28) u.swatch = i; }
				for (int k = 0; k < 2; k++) { int y = 116 + k * 36; if (t.py >= y && t.py < y + 30) { if (t.px < PANE_X + 40) act_row = 101 + k * 2; else if (t.px >= PANE_X + PANE_W - 44) act_row = 102 + k * 2; } }
				if (t.py >= 192 && t.py < 230) act_row = 100;
				touching = false;
			} else if (u.page == P_DISCOVER && t.py < 26 && t.px > PANE_X + 70) {
				prompt(u.search, sizeof u.search, "Buscar juegos"); u.cur = 0; u.scroll = 0; touching = false;
			} else if (u.page == P_SETTINGS) {
				int sy0 = LIST_Y + 2 + (1 - u.scroll) * row_h(P_SETTINGS);
				if (t.px >= PANE_X && t.py >= sy0 && t.py < sy0 + row_h(P_SETTINGS) - 4 && 1 >= u.scroll) { sliding = true; touching = false; }      // deslizador de sincronización
			}
		}
		if (sliding) {
			if (held & KEY_TOUCH) { touchPosition t; hidTouchRead(&t); float f = (t.px - (PANE_X + 12)) / (float)(PANE_W - 28); int lv = (int)(f * 5 + 0.5f); if (lv < 0) lv = 0; if (lv > 5) lv = 5; if (lv != s_sync) { s_sync = lv; } u.cur = 1; }
			else { sliding = false; save_settings(); }
		}
		if ((held & KEY_TOUCH) && touching && total > vis) {
			touchPosition t; hidTouchRead(&t);
			if (abs(t.py - t0y) > 8) dragging = true;
			if (dragging) { int ns = t0scroll - (t.py - t0y) / row_h(u.page); u.scroll = ns < 0 ? 0 : ns > total - vis ? total - vis : ns; }
		}
		if ((up & KEY_TOUCH) && touching) {                                  // soltar sin arrastrar = tap en una fila
			touching = false;
			if (!dragging && t0x >= PANE_X && t0y >= LIST_Y && t0y < LIST_BOTTOM && newpage < 0 && u.modal < 0) {
				int row = u.scroll + (t0y - LIST_Y) / row_h(u.page);
				if (row < total) { u.cur = row; act_row = row; tap_btn = u.page == P_FRIENDS || u.page == P_NOTIF; tapx = t0x; }
			}
		}

		if (newpage >= 0 && newpage != u.page) { u.page = newpage; u.cur = 0; u.scroll = 0; u.modal = -1; act_row = -1; do_back = false; u.dm = -1; g_dm_open = 0; u.rm_confirm = -1; if (newpage == P_NOTIF && notif_unread) request(RQ_NOTIF_READ, NULL, NULL, 0); }
		if (do_back) u.modal = -1;

		total = count_rows(&u, s);
		if (u.cur >= total) u.cur = total - 1;
		if (u.cur < 0) u.cur = 0;
		vis = rows_visible(u.page);
		if (u.cur < u.scroll) u.scroll = u.cur;
		if (u.cur >= u.scroll + vis) u.scroll = u.cur - vis + 1;
		if (u.scroll < 0) u.scroll = 0;

		// ---- acciones ----
		if (act_row != -1) sfx_play(SFX_CLICK);
		if (act_row == -3 && u.modal >= 0) request(RQ_FAV, games[u.modal].id, NULL, 0);
		if (act_row == -2 && u.modal >= 0) {                              // jugar
			*chosen = games[u.modal]; snprintf(s_last_game, sizeof s_last_game, "%s", chosen->id); save_settings();
			res = APP_PLAY; break;
		}
		if (act_row >= 200 && u.dm >= 0) {
			int sel = u.dm_sel < 0 || u.dm_sel >= ndm ? ndm - 1 : u.dm_sel; bool mine = sel >= 0 && dm[sel].mine;
			if (act_row == 200) { char tx[100] = ""; if (prompt(tx, sizeof tx, tr2("Escribe un mensaje", "Write a message"))) { request(RQ_DM_SEND, NULL, tx, 0); u.dm_sel = -1; } }
			else if (act_row == 202) { u.dm = -1; g_dm_open = 0; u.dm_del = 0; }
			else if (act_row == 203) {                                         // editar el mensaje seleccionado (solo los tuyos)
				if (!mine) toast(&u, tr2("Solo puedes editar tus mensajes", "You can only edit your messages"));
				else { char tx[100]; snprintf(tx, sizeof tx, "%s", dm[sel].text); if (prompt(tx, sizeof tx, tr2("Editar mensaje", "Edit message"))) { char ids[24]; snprintf(ids, sizeof ids, "%ld", dm[sel].id); request(RQ_DM_EDIT, ids, tx, 0); } }
			} else if (act_row == 204) {                                       // borrar (pide confirmar con un segundo toque)
				if (!mine) toast(&u, tr2("Solo puedes borrar tus mensajes", "You can only delete your messages"));
				else if (u.dm_del == dm[sel].id) { char ids[24]; snprintf(ids, sizeof ids, "%ld", dm[sel].id); request(RQ_DM_DEL, ids, NULL, 0); u.dm_del = 0; u.dm_sel = -1; }
				else { u.dm_del = (int)dm[sel].id; toast(&u, tr2("Pulsa otra vez para borrar", "Press again to delete")); }
			} else if (act_row == 205) { u.dm_sel = (u.dm_sel < 0 ? ndm - 1 : u.dm_sel) - 1; if (u.dm_sel < 0) u.dm_sel = 0; u.dm_del = 0; }       // subir por el historial
			else if (act_row == 206) { if (u.dm_sel >= 0) { u.dm_sel++; if (u.dm_sel >= ndm - 1) u.dm_sel = -1; } u.dm_del = 0; }                 // bajar (al final vuelve a seguir lo nuevo)
			act_row = -1;
		}
		if (act_row >= 0 && u.modal < 0) {
			int n;
			switch (u.page) {
			case P_HOME: case P_DISCOVER: n = build_view(&u, s, view); if (act_row < n) u.modal = view[act_row]; break;
			case P_FRIENDS:
				n = build_people(s, pr);
				if (act_row >= n) break;
				if (pr[act_row].kind == 0) {
					char nm[24] = ""; if (prompt(nm, sizeof nm, tr2("Nombre de usuario exacto", "Exact username"))) request(RQ_ADD, nm, NULL, 0);
				} else if (pr[act_row].kind == 1) {
					char ids[24]; snprintf(ids, sizeof ids, "%ld", pr[act_row].r->id);
					bool decline = tap_btn && tapx >= PANE_X + PANE_W - 32;
					request(RQ_ACCEPT, ids, NULL, decline ? 0 : 1);
				} else {
					int fi = (int)(pr[act_row].p - friends);
					if (tap_btn && tapx >= PANE_X + PANE_W - 30) {
						if (u.rm_confirm == act_row) { request(RQ_REMOVE, pr[act_row].p->id, NULL, 0); u.rm_confirm = -1; }
						else { u.rm_confirm = act_row; toast(&u, tr2("Toca X otra vez para quitarlo", "Tap X again to remove")); }
					} else {
						u.dm = fi; snprintf(g_dm_friend, sizeof g_dm_friend, "%s", friends[fi].id); g_ndm = 0; ndm = 0; g_dm_open = 1; u.seen_dm = g_dm_seq; u.rm_confirm = -1; u.dm_sel = -1; u.dm_del = 0;
						request(RQ_DM_FETCH, NULL, NULL, 0);
					}
				}
				break;
			case P_AVATAR:
				if (act_row >= 101 && act_row <= 104) { const char *k = act_row <= 102 ? "hat" : "title"; if (!g_account) toast(&u, tr2("Entra con email", "Log in with email")); else if (!acc_cycle(k, (act_row & 1) ? -1 : 1)) toast(&u, tr2("No tienes ninguno: compralos en la Tienda", "You own none: buy them in the Shop")); break; }
				if (act_row == 100 || (down & KEY_A)) { if (g_account) request(RQ_COLOR, AVATAR_COLORS[u.swatch], NULL, 0); else toast(&u, "Entra con email para guardar"); } break;
			case P_NOTIF:
				if (act_row == 0) { if (nnotifs) request(RQ_NOTIF_CLEAR, NULL, NULL, 0); }
				else if (act_row - 1 < nnotifs) {
					const Notif *nt = &notifs[act_row - 1];
					if (!strcmp(nt->kind, "invite")) { int gi = -1; for (int i = 0; i < ngames; i++) if (!strcmp(games[i].id, nt->game_id)) gi = i; if (gi >= 0) u.modal = gi; else toast(&u, tr2("Ese juego ya no existe", "That game no longer exists")); }
					else { u.page = P_FRIENDS; u.cur = 0; u.scroll = 0; }
				}
				break;
			case P_SHOP:
				if (act_row == 0) { if (wallet.can_claim) request(RQ_CLAIM, NULL, NULL, 0); else toast(&u, tr2("Ya la recogiste hoy", "Already claimed today")); }
				else if (act_row - 1 < nshop) {
					const ShopItem *it = &shop[act_row - 1]; bool crate = !strcmp(it->kind, "crate"), own = shop_owned(it) && !crate;
					if (crate) request(RQ_CRATE, it->id, NULL, 0);
					else if (own) request(RQ_EQUIP, shop_equipped(it) ? "" : it->id, it->kind, 0);
					else request(RQ_BUY, it->id, NULL, 0);
				}
				break;
			case P_UPDATE:
				if (act_row == 0) request(RQ_UPD_CHECK, NULL, NULL, 0);
				else if (g_upd_state == 2) toast(&u, tr2("Ya se esta descargando", "Already downloading"));
				else if (act_row == 1) { if (!g_upd.stable.valid) toast(&u, tr2("No hay version estable publicada", "No stable release yet")); else if (g_upd.stable.cmp <= 0) toast(&u, tr2("Ya tienes esta version (o una mas nueva)", "You already have this version or newer")); else request(RQ_UPD_INSTALL, NULL, NULL, 0); }
				else if (act_row == 2) { if (!g_upd.dev.valid) toast(&u, tr2("No hay devbuild publicada", "No devbuild yet")); else if (g_upd.dev.cmp <= 0) toast(&u, tr2("Ya tienes esta version (o una mas nueva)", "You already have this version or newer")); else request(RQ_UPD_INSTALL, NULL, NULL, 1); }
				break;
			case P_SETTINGS:
				if (act_row == 0) { s_dist = (s_dist + 1) % 3; save_settings(); }
				else if (act_row == 1) { if (!tap_btn) { s_sync = (s_sync + 1) % 6; save_settings(); } }
				else if (act_row == 2) { s_auto = !s_auto; save_settings(); }
				else if (act_row == 3) { s_notif_on = !s_notif_on; save_settings(); }
				else if (act_row == 4) { s_lang = (s_lang + 1) % 3; save_settings(); }
				else if (act_row == 5) { remove("sdmc:/3ds/blocksy/login.txt"); toast(&u, tr2("Email olvidado", "Email forgotten")); }
				else if (act_row == 6) { res = APP_LOGOUT; goto out; }
				else if (act_row == 7) { s_forest = (s_forest + 1) % 3; save_settings(); }
				else if (act_row == 8) { s_steps = !s_steps; save_settings(); }
				else if (act_row == 9) { s_showdev = !s_showdev; save_settings(); }
				else if (act_row == 10) { if (!audio_available()) toast(&u, tr2("Para la musica hace falta dspfirm.cdc (volcado del DSP)", "Music needs dspfirm.cdc (DSP firmware dump)")); else { s_music = !app_music_on(); save_settings(); } }
				else if (act_row == 11) { s_mvol = s_mvol >= 100 ? 0 : s_mvol + 20; save_settings(); }
				else if (act_row == 12) { s_sfx = !s_sfx; save_settings(); sfx_play(SFX_NOTIFY); }
				break;
			}
		}
		draw_all(top, bot, &u, s, version);
	}
out:
	W.quit = 1; W.offline = (res != APP_PLAY);
	if (th) { threadJoin(th, U64_MAX); threadFree(th); }
	return res;
}
