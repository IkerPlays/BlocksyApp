// Lobby de Blocksy para 3DS: réplica de la web (barra superior, menú lateral, Inicio, Descubrir, Avatar, Amigos, Crear, Ajustes).
// Pantalla superior = la "página" de la web. Pantalla inferior (táctil) = menú lateral + lista/acciones de la página.
#include "app.h"
#include "ui.h"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

enum { P_HOME, P_DISCOVER, P_AVATAR, P_FRIENDS, P_CREATE, P_SETTINGS, NPAGES };
static const char *const PAGE_NAME[NPAGES] = {"Inicio", "Descubrir", "Avatar", "Amigos", "Crear", "Ajustes"};
static const char *const AVATAR_COLORS[10] = {"#4da6ff", "#ff9f43", "#2ecc71", "#e74c3c", "#9b59b6", "#f1c40f", "#1abc9c", "#ff6b9d", "#ecf0f1", "#95a5a6"};

// ---------- datos compartidos con el hilo de red ----------
static LightLock lk;
static GameInfo g_games[MAX_GAMES]; static int g_ngames;
static Person g_friends[MAX_PEOPLE]; static int g_nfriends;
static Person g_people[MAX_PEOPLE]; static int g_npeople;
static volatile int g_account = 1;   // 0 = sesión por QR (sin token de Auth): no hay amigos ni avatar

typedef enum { RQ_NONE, RQ_REFRESH, RQ_ADD, RQ_REMOVE, RQ_COLOR, RQ_CREATE, RQ_DELETE } Req;
typedef struct {
	volatile int req, busy, quit, offline, seq, done_ok;
	char arg[48], arg2[104]; int n;
	Session *s;
	char msg[96];                        // resultado de la última acción (toast)
} Worker;
static Worker W;

static u32 parse_hex(const char *hex) {
	unsigned r = 0x4d, g = 0xa6, b = 0xff;
	if (hex && hex[0] == '#' && strlen(hex) == 7) sscanf(hex + 1, "%2x%2x%2x", &r, &g, &b);
	return 0xFF000000u | (b << 16) | (g << 8) | r;
}

static void refresh_all(void) {
	static GameInfo tg[MAX_GAMES]; static Person tf[MAX_PEOPLE], tp[MAX_PEOPLE];
	int ng = net_list_games(tg, MAX_GAMES);
	if (ng >= 0) { net_player_counts(tg, ng); LightLock_Lock(&lk); memcpy(g_games, tg, sizeof(GameInfo) * ng); g_ngames = ng; LightLock_Unlock(&lk); }
	else snprintf(W.msg, sizeof W.msg, "%s", net_login_error());
	int nf = net_list_friends(W.s, tf, MAX_PEOPLE), np = net_list_people(W.s, tp, MAX_PEOPLE);
	g_account = nf != -2;
	LightLock_Lock(&lk);
	if (nf >= 0) { memcpy(g_friends, tf, sizeof(Person) * nf); g_nfriends = nf; } else if (nf == -2) g_nfriends = 0;
	if (np >= 0) { memcpy(g_people, tp, sizeof(Person) * np); g_npeople = np; } else if (np == -2) g_npeople = 0;
	LightLock_Unlock(&lk);
	W.seq++;
}

static void worker_thread(void *arg) {
	(void)arg;
	u64 last_refresh = 0, last_presence = 0;
	while (!W.quit) {
		u64 now = osGetTime();
		int r = W.req;
		if (!r && now - last_refresh > 20000) r = RQ_REFRESH;     // refresco automático
		if (r) {
			W.busy = 1; W.done_ok = 1;
			switch (r) {
			case RQ_REFRESH: refresh_all(); break;
			case RQ_ADD:    W.done_ok = net_add_friend(W.s, W.arg);    snprintf(W.msg, sizeof W.msg, W.done_ok ? "Amigo anadido" : "No se pudo anadir"); refresh_all(); break;
			case RQ_REMOVE: W.done_ok = net_remove_friend(W.s, W.arg); snprintf(W.msg, sizeof W.msg, W.done_ok ? "Amigo eliminado" : "No se pudo quitar"); refresh_all(); break;
			case RQ_COLOR:  W.done_ok = net_set_color(W.s, W.arg);     snprintf(W.msg, sizeof W.msg, W.done_ok ? "Avatar guardado" : "No se pudo guardar el avatar");
				if (W.done_ok) W.s->color = parse_hex(W.arg);
				break;
			case RQ_CREATE: W.done_ok = net_create_game(W.s, W.arg, W.arg2, W.n); snprintf(W.msg, sizeof W.msg, W.done_ok ? "Juego creado" : "No se pudo crear el juego"); refresh_all(); break;
			case RQ_DELETE: W.done_ok = net_delete_game(W.s, W.arg);   snprintf(W.msg, sizeof W.msg, W.done_ok ? "Juego borrado" : "No se pudo borrar"); refresh_all(); break;
			}
			last_refresh = osGetTime();
			W.req = 0; W.busy = 0;
		} else svcSleepThread(40 * 1000000LL);
		if (now - last_presence > 30000) { net_presence(W.s, NULL); last_presence = now; }
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
	}
	fclose(f);
}
static void save_settings(void) {
	mkdir("sdmc:/3ds", 0777); mkdir("sdmc:/3ds/blocksy", 0777);
	FILE *f = fopen(SETTINGS_FILE, "w"); if (!f) return;
	fprintf(f, "last_game=%s\ndist=%d\n", s_last_game, s_dist); fclose(f);
}

// ---------- estado de la interfaz ----------
typedef struct {
	int page, cur, scroll, modal;        // modal: índice en g_games de la ficha abierta (-1 ninguna)
	char search[32];
	int swatch;                          // color elegido en Avatar
	u64 toast_until; char toast[96];
	int seen_seq;
} Ui;

// copias locales (para dibujar sin bloquear al hilo de red)
static GameInfo games[MAX_GAMES]; static int ngames;
static Person friends[MAX_PEOPLE]; static int nfriends;
static Person people[MAX_PEOPLE]; static int npeople;

static void sync_data(void) {
	LightLock_Lock(&lk);
	memcpy(games, g_games, sizeof(GameInfo) * g_ngames); ngames = g_ngames;
	memcpy(friends, g_friends, sizeof(Person) * g_nfriends); nfriends = g_nfriends;
	memcpy(people, g_people, sizeof(Person) * g_npeople); npeople = g_npeople;
	LightLock_Unlock(&lk);
}

static void toast(Ui *u, const char *m) { snprintf(u->toast, sizeof u->toast, "%s", m); u->toast_until = osGetTime() + 2600; }

// Juegos visibles en la página actual (índices en games[])
static int build_view(const Ui *u, const Session *s, int *view) {
	int n = 0;
	if (u->page == P_HOME) {                                   // populares primero
		for (int i = 0; i < ngames; i++) view[n++] = i;
		for (int i = 1; i < n; i++) { int v = view[i], j = i - 1; while (j >= 0 && games[view[j]].players < games[v].players) { view[j + 1] = view[j]; j--; } view[j + 1] = v; }
	} else if (u->page == P_DISCOVER) {
		for (int i = 0; i < ngames; i++) {
			if (u->search[0]) {
				char a[160], b[48]; snprintf(a, sizeof a, "%s %s", games[i].name, games[i].desc); snprintf(b, sizeof b, "%s", u->search);
				for (char *c = a; *c; c++) if (*c >= 'A' && *c <= 'Z') *c += 32;
				for (char *c = b; *c; c++) if (*c >= 'A' && *c <= 'Z') *c += 32;
				if (!strstr(a, b)) continue;
			}
			view[n++] = i;
		}
	} else if (u->page == P_CREATE) {
		for (int i = 0; i < ngames; i++) if (!strcmp(games[i].owner_id, s->user_id)) view[n++] = i;
	}
	return n;
}
// Personas de la página Amigos: primero los amigos y luego el resto de jugadores
typedef struct { const Person *p; int friend; } PRow;
static int build_people(const Session *s, PRow *rows) {
	int n = 0;
	for (int i = 0; i < nfriends; i++) rows[n++] = (PRow){&friends[i], 1};
	for (int i = 0; i < npeople; i++) {
		if (!strcmp(people[i].id, s->user_id)) continue;
		int isf = 0; for (int j = 0; j < nfriends; j++) if (!strcmp(friends[j].id, people[i].id)) isf = 1;
		if (!isf) rows[n++] = (PRow){&people[i], 0};
	}
	return n;
}

static int row_h(int page) { return page == P_FRIENDS || page == P_SETTINGS ? 36 : 42; }
enum { PANE_X = 108, PANE_W = 208, LIST_Y = 30, LIST_BOTTOM = 232 };
static int rows_visible(int page) { return (LIST_BOTTOM - LIST_Y) / row_h(page); }

static int count_rows(const Ui *u, const Session *s) {
	int view[MAX_GAMES]; PRow pr[MAX_PEOPLE * 2];
	switch (u->page) {
	case P_HOME: case P_DISCOVER: return build_view(u, s, view);
	case P_CREATE: return 1 + build_view(u, s, view);       // fila 0 = "Nuevo mundo"
	case P_FRIENDS: return build_people(s, pr);
	case P_SETTINGS: return 3;
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
static const char *status_of(const Person *p) { return p->in_game ? "En un juego" : p->online ? "Online" : "Desconectado"; }

// ================= PANTALLA SUPERIOR =================
static void top_bar(const Ui *u, const Session *s, bool busy) {
	ui_rect(0, 0, 400, 28, COL_PANEL); ui_rect(0, 28, 400, 1, COL_LINE);
	ui_cube(17, 14, 8, COL_ACCENT);
	ui_text(30, 4, 0.58f, COL_TEXT, 0, "Blocksy");
	static const int navp[3] = {P_HOME, P_DISCOVER, P_CREATE};
	float x = 104;
	for (int i = 0; i < 3; i++) {
		bool act = u->page == navp[i]; float w = ui_text_width(PAGE_NAME[navp[i]], 0.44f);
		if (act) ui_rrect(x - 6, 5, w + 12, 18, 6, COL_PANEL2);
		ui_text(x, 7, 0.44f, act ? COL_TEXT : COL_MUTED, 0, PAGE_NAME[navp[i]]);
		x += w + 18;
	}
	char nm[32]; fit(nm, sizeof nm, s->username, 0.46f, 100);
	ui_text(388, 6, 0.46f, COL_TEXT, C2D_AlignRight, nm);
	ui_avatar(388 - ui_text_width(nm, 0.46f) - 14, 14, 9, s->color, -1);
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

static void blocky(float cx, float y, u32 color, float k) {
	ui_rrect(cx - 14 * k, y, 28 * k, 28 * k, 5 * k, C(0xFF, 0xD9, 0xA8));                       // cabeza
	ui_rect(cx - 7 * k, y + 10 * k, 4 * k, 4 * k, C(0x22, 0x22, 0x22)); ui_rect(cx + 3 * k, y + 10 * k, 4 * k, 4 * k, C(0x22, 0x22, 0x22));
	ui_rrect(cx - 21 * k, y + 31 * k, 42 * k, 46 * k, 5 * k, color);                             // cuerpo
	ui_rrect(cx - 17 * k, y + 80 * k, 34 * k, 24 * k, 5 * k, C(0x34, 0x49, 0x5E));               // piernas
}

static void page_top(const Ui *u, const Session *s) {
	int view[MAX_GAMES];
	switch (u->page) {
	case P_HOME: {
		ui_avatar(34, 52, 15, s->color, -1);
		char hi[64]; snprintf(hi, sizeof hi, "¡Hola, %s!", s->username); ui_text(58, 36, 0.8f, COL_TEXT, 0, hi);
		char ft[40]; snprintf(ft, sizeof ft, "Amigos (%d)", nfriends);
		section(72, ft, "Ver todo");
		if (nfriends) for (int i = 0; i < nfriends && i < 7; i++) {
			float cx = 30 + i * 52; char nm[24]; fit(nm, sizeof nm, friends[i].name, 0.34f, 48);
			ui_avatar(cx, 104, 13, friends[i].color, friends[i].online);
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
		blocky(82, 92, AVATAR_COLORS[u->swatch] ? parse_hex(AVATAR_COLORS[u->swatch]) : s->color, 1.0f);
		ui_text(156, 80, 0.7f, COL_TEXT, 0, s->username);
		ui_text(156, 106, 0.4f, COL_MUTED, 0, "Elige el color de tu personaje.");
		ui_text(156, 120, 0.4f, COL_MUTED, 0, "Se ve igual en la web y en la 3DS.");
		for (int i = 0; i < 10; i++) {
			float x = 156 + (i % 5) * 44, y = 146 + (i / 5) * 36; u32 c = parse_hex(AVATAR_COLORS[i]);
			if (i == u->swatch) ui_rrect(x - 3, y - 3, 38, 32, 8, COL_TEXT);
			ui_rrect(x, y, 32, 26, 6, c);
		}
		if (!g_account) ui_text(156, 204, 0.38f, COL_RED, 0, "Entra con email y contrasena para guardar.");
		break; }
	case P_FRIENDS: {
		PRow rows[MAX_PEOPLE * 2]; int n = build_people(s, rows);
		char t[40]; snprintf(t, sizeof t, "Amigos (%d)", nfriends);
		ui_text(14, 33, 0.8f, COL_TEXT, 0, "Amigos");
		ui_rrect(14, 66, 372, 160, 12, COL_PANEL);
		if (!g_account) { ui_text(30, 120, 0.46f, COL_MUTED, 0, "Entra con email y contrasena para ver y"); ui_text(30, 138, 0.46f, COL_MUTED, 0, "anadir amigos (no disponible con QR)."); break; }
		int y = 74, shown = 0;
		for (int i = 0; i < n && shown < 5; i++, shown++, y += 30) {
			ui_avatar(36, y + 13, 11, rows[i].p->color, rows[i].p->online);
			ui_text(56, y + 1, 0.5f, COL_TEXT, 0, rows[i].p->name);
			ui_text(56, y + 15, 0.34f, COL_MUTED, 0, status_of(rows[i].p));
			if (rows[i].friend) ui_text(372, y + 4, 0.4f, COL_ACCENT, C2D_AlignRight, "amigo");
			if (i + 1 < n && shown < 4) ui_rect(26, y + 28, 348, 1, COL_LINE);
		}
		if (!n) ui_text(30, 120, 0.46f, COL_MUTED, 0, "Aun no hay jugadores.");
		(void)t; break; }
	case P_CREATE: {
		ui_text(14, 33, 0.8f, COL_TEXT, 0, "Crear");
		ui_rrect(14, 66, 372, 28, 8, COL_PANEL);
		ui_rrect(22, 71, 92, 18, 6, COL_GREEN); ui_text(68, 72, 0.4f, COL_TEXT, C2D_AlignCenter, "+ Nuevo mundo");
		ui_text(124, 72, 0.4f, COL_MUTED, 0, "Pulsa X, o el boton verde de la pantalla tactil");
		section(100, "Mis juegos", NULL);
		int n = build_view(u, s, view);
		for (int i = 0; i < n && i < 3; i++) {
			float y = 124 + i * 36; const GameInfo *g = &games[view[i]];
			ui_thumb(14, y, 30, g->hue, 0);
			char nm[48]; fit(nm, sizeof nm, g->name, 0.5f, 300); ui_text(54, y - 1, 0.5f, COL_TEXT, 0, nm);
			char d[110]; fit(d, sizeof d, g->desc[0] ? g->desc : "Sin descripcion", 0.36f, 300); ui_text(54, y + 15, 0.36f, COL_MUTED, 0, d);
		}
		if (!n) ui_text(14, 128, 0.45f, COL_MUTED, 0, "Todavia no has creado ningun juego.");
		break; }
	case P_SETTINGS: {
		ui_text(14, 33, 0.8f, COL_TEXT, 0, "Ajustes");
		ui_rrect(14, 66, 372, 96, 12, COL_PANEL);
		static const char *const dn[3] = {"Corta", "Media", "Larga"};
		ui_text(30, 76, 0.48f, COL_TEXT, 0, "Distancia de dibujo"); ui_text(370, 76, 0.48f, COL_ACCENT, C2D_AlignRight, dn[s_dist]);
		ui_rect(26, 100, 348, 1, COL_LINE);
		ui_text(30, 108, 0.48f, COL_TEXT, 0, "Cuenta"); ui_text(370, 108, 0.46f, COL_MUTED, C2D_AlignRight, s->username);
		ui_rect(26, 132, 348, 1, COL_LINE);
		ui_text(30, 138, 0.48f, COL_TEXT, 0, "Version"); ui_text(370, 138, 0.46f, COL_MUTED, C2D_AlignRight, "Blocksy 3DS");
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
	static char lines[3][96]; int nl = wrap(g->desc[0] ? g->desc : "Sin descripcion.", 0.42f, 180, lines, 3);
	for (int i = 0; i < nl; i++) ui_text(184, 142 + i * 15, 0.42f, COL_MUTED, 0, lines[i]);
	ui_text(200, 196, 0.38f, COL_MUTED, 0, "A: jugar     B: cerrar");
}

// ================= PANTALLA INFERIOR =================
enum { SB_W = 102, SB_ITEM_H = 30, SB_Y = 8, SB_EXIT_Y = 202 };

static void sidebar(const Ui *u) {
	ui_rect(0, 0, SB_W, 240, COL_PANEL); ui_rect(SB_W, 0, 1, 240, COL_LINE);
	for (int i = 0; i < NPAGES; i++) {
		float y = SB_Y + i * SB_ITEM_H; bool act = u->page == i;
		if (act) { ui_rrect(4, y, SB_W - 8, SB_ITEM_H - 3, 7, COL_PANEL2); ui_rect(4, y + 5, 3, SB_ITEM_H - 13, COL_ACCENT); }
		ui_icon(i, 14, y + 6, act ? COL_TEXT : COL_MUTED);
		ui_text(36, y + 5, 0.47f, act ? COL_TEXT : COL_MUTED, 0, PAGE_NAME[i]);
	}
	ui_rect(8, SB_EXIT_Y - 6, SB_W - 16, 1, COL_LINE);
	ui_icon(6, 14, SB_EXIT_Y + 6, COL_MUTED); ui_text(36, SB_EXIT_Y + 5, 0.47f, COL_MUTED, 0, "Salir");
}

static void list_game_row(float y, const GameInfo *g, bool sel, const char *btn) {
	if (sel) ui_rrect(PANE_X - 2, y, PANE_W + 2, row_h(P_HOME) - 3, 8, COL_PANEL2);
	ui_thumb(PANE_X + 2, y + 3, 34, g->hue, 0);
	char nm[48]; fit(nm, sizeof nm, g->name, 0.46f, btn ? 96 : 150); ui_text(PANE_X + 42, y + 3, 0.46f, COL_TEXT, 0, nm);
	char sub[64]; if (g->players) snprintf(sub, sizeof sub, "%d jugando", g->players); else snprintf(sub, sizeof sub, "por %s", g->owner[0] ? g->owner : "Blocksy");
	char s2[64]; fit(s2, sizeof s2, sub, 0.34f, btn ? 90 : 150);
	ui_text(PANE_X + 42, y + 21, 0.34f, g->players ? COL_GREEN : COL_MUTED, 0, s2);
	if (btn) ui_button(PANE_X + PANE_W - 56, y + 6, 54, 26, COL_DANGER, false, btn, 0.4f);
}

static void pane(const Ui *u, const Session *s) {
	int view[MAX_GAMES]; PRow pr[MAX_PEOPLE * 2];
	char title[40];
	snprintf(title, sizeof title, "%s", PAGE_NAME[u->page]);
	ui_text(PANE_X, 5, 0.6f, COL_TEXT, 0, title);

	if (u->modal >= 0 && u->modal < ngames) {                      // ficha del juego: acciones
		const GameInfo *g = &games[u->modal];
		ui_thumb(PANE_X + 4, 34, 70, g->hue, 0);
		char nm[48]; fit(nm, sizeof nm, g->name, 0.55f, 120); ui_text(PANE_X + 82, 36, 0.55f, COL_TEXT, 0, nm);
		char by[48]; snprintf(by, sizeof by, "por %s", g->owner[0] ? g->owner : "Blocksy"); ui_text(PANE_X + 82, 58, 0.36f, COL_MUTED, 0, by);
		char pl[32]; snprintf(pl, sizeof pl, "%d jugando", g->players); ui_text(PANE_X + 82, 74, 0.38f, g->players ? COL_GREEN : COL_MUTED, 0, pl);
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
	case P_CREATE: {
		int n = build_view(u, s, view);
		for (int i = 0; i < vis && u->scroll + i < total; i++) {
			int r = u->scroll + i; float y = LIST_Y + i * rh;
			if (r == 0) { ui_button(PANE_X, y + 3, PANE_W - 4, rh - 8, COL_GREEN, u->cur == 0, "+ Nuevo mundo", 0.5f); continue; }
			if (r - 1 < n) list_game_row(y, &games[view[r - 1]], r == u->cur, "Borrar");
		}
		break; }
	case P_FRIENDS: {
		int n = build_people(s, pr);
		if (!g_account) { ui_text(PANE_X, 40, 0.42f, COL_MUTED, 0, "No disponible con QR."); break; }
		for (int i = 0; i < vis && u->scroll + i < n; i++) {
			int r = u->scroll + i; float y = LIST_Y + i * rh; const Person *p = pr[r].p;
			if (r == u->cur) ui_rrect(PANE_X - 2, y, PANE_W + 2, rh - 3, 8, COL_PANEL2);
			ui_avatar(PANE_X + 14, y + 16, 10, p->color, p->online);
			char nm[32]; fit(nm, sizeof nm, p->name, 0.44f, 76); ui_text(PANE_X + 32, y + 2, 0.44f, COL_TEXT, 0, nm);
			ui_text(PANE_X + 32, y + 19, 0.32f, COL_MUTED, 0, status_of(p));
			ui_button(PANE_X + PANE_W - 58, y + 5, 56, 24, pr[r].friend ? COL_PANEL2 : COL_ACCENT_D, false, pr[r].friend ? "Quitar" : "Anadir", 0.38f);
		}
		break; }
	case P_AVATAR: {
		ui_text(PANE_X, 30, 0.4f, COL_MUTED, 0, "Elige un color:");
		for (int i = 0; i < 10; i++) {
			float x = PANE_X + 2 + (i % 5) * 40, y = 52 + (i / 5) * 40; u32 c = parse_hex(AVATAR_COLORS[i]);
			if (i == u->swatch) ui_rrect(x - 3, y - 3, 38, 38, 8, COL_TEXT);
			ui_rrect(x, y, 32, 32, 6, c);
		}
		ui_button(PANE_X + 2, 150, PANE_W - 6, 40, g_account ? COL_GREEN : COL_PANEL2, false, "Guardar", 0.55f);
		if (!g_account) ui_text(PANE_X, 200, 0.34f, COL_RED, 0, "Requiere entrar con email y contrasena.");
		break; }
	case P_SETTINGS: {
		static const char *const dn[3] = {"Corta", "Media", "Larga"};
		char l1[40]; snprintf(l1, sizeof l1, "Distancia: %s", dn[s_dist]);
		ui_button(PANE_X, LIST_Y + 2, PANE_W - 4, rh - 6, COL_PANEL2, u->cur == 0, l1, 0.5f);
		ui_button(PANE_X, LIST_Y + 2 + rh, PANE_W - 4, rh - 6, COL_PANEL2, u->cur == 1, "Olvidar mi email", 0.5f);
		ui_button(PANE_X, LIST_Y + 2 + 2 * rh, PANE_W - 4, rh - 6, COL_DANGER, u->cur == 2, "Cerrar sesion", 0.5f);
		break; }
	}
	if (total > vis && u->page != P_SETTINGS && u->page != P_AVATAR) {        // barra de desplazamiento
		float th = (LIST_BOTTOM - LIST_Y) * (float)vis / total, ty = LIST_Y + (LIST_BOTTOM - LIST_Y - th) * ((float)u->scroll / (total - vis));
		ui_rrect(314, ty, 3, th, 1.5f, COL_LINE);
	}
}

static void draw_all(C3D_RenderTarget *top, C3D_RenderTarget *bot, const Ui *u, const Session *s, const char *version) {
	ui_frame_begin();
	C3D_FrameBegin(C3D_FRAME_SYNCDRAW);
	C2D_TargetClear(top, COL_BG); C2D_SceneBegin(top);
	page_top(u, s); modal_top(u); top_bar(u, s, W.busy);
	if (u->toast_until > osGetTime()) {
		float w = ui_text_width(u->toast, 0.44f) + 28;
		ui_rrect(200 - w / 2, 204, w, 24, 10, COL_PANEL2); ui_text(200, 208, 0.44f, COL_TEXT, C2D_AlignCenter, u->toast);
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
	nfriends = 5; npeople = 0; g_account = 1;
	Ui u = {.page = page, .cur = cursor, .modal = modal, .swatch = 1}; strcpy(u.search, page == P_DISCOVER ? "" : "");
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

AppResult app_lobby(C3D_RenderTarget *top, C3D_RenderTarget *bot, Session *s, GameInfo *chosen, const char *version) {
	LightLock_Init(&lk);
	load_settings();
	memset(&W, 0, sizeof W); W.s = s;
	Ui u = {.page = P_HOME, .modal = -1};
	// color actual del avatar -> swatch
	for (int i = 0; i < 10; i++) if (parse_hex(AVATAR_COLORS[i]) == s->color) u.swatch = i;
	W.req = RQ_REFRESH;
	Thread th = spawn_worker();
	AppResult res = APP_QUIT;
	bool dragging = false, touching = false; int t0x = 0, t0y = 0, t0scroll = 0;

	while (aptMainLoop()) {
		hidScanInput();
		u32 down = hidKeysDown(), held = hidKeysHeld(), up = hidKeysUp();
		if (u.seen_seq != W.seq) { u.seen_seq = W.seq; sync_data(); }
		if (W.msg[0] && !W.busy) { toast(&u, W.msg); W.msg[0] = 0; if (u.page == P_AVATAR) {} }
		if (down & KEY_START) { res = APP_QUIT; break; }

		int vis = rows_visible(u.page), total = count_rows(&u, s), act_row = -1; bool tap_btn = false, do_back = false;
		int view[MAX_GAMES]; PRow pr[MAX_PEOPLE * 2];
		int newpage = -1;
		if (down & KEY_R) newpage = (u.page + 1) % NPAGES;
		if (down & KEY_L) newpage = (u.page + NPAGES - 1) % NPAGES;

		if (u.modal >= 0) {                                              // ficha de juego abierta
			if (down & KEY_A) act_row = -2;                              // jugar
			if (down & KEY_B) do_back = true;
		} else {
			int step = (u.page == P_DISCOVER) ? 5 : 1;
			if (down & KEY_DDOWN) u.cur += step;
			if (down & KEY_DUP) u.cur -= step;
			if ((u.page == P_HOME || u.page == P_DISCOVER) && (down & KEY_DRIGHT)) u.cur++;
			if ((u.page == P_HOME || u.page == P_DISCOVER) && (down & KEY_DLEFT)) u.cur--;
			if (u.page == P_AVATAR) { if (down & KEY_DRIGHT) u.swatch = (u.swatch + 1) % 10; if (down & KEY_DLEFT) u.swatch = (u.swatch + 9) % 10; if (down & KEY_DDOWN) u.swatch = (u.swatch + 5) % 10; if (down & KEY_DUP) u.swatch = (u.swatch + 5) % 10; u.cur = 0; }
			if (down & KEY_A) act_row = u.cur;
			if (down & KEY_Y) request(RQ_REFRESH, NULL, NULL, 0);
			if (down & KEY_X) { if (u.page == P_DISCOVER) { prompt(u.search, sizeof u.search, "Buscar juegos"); u.cur = 0; u.scroll = 0; } else if (u.page == P_CREATE) act_row = 0; }
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
			} else if (u.page == P_AVATAR) {
				for (int i = 0; i < 10; i++) { int x = PANE_X + 2 + (i % 5) * 40, y = 52 + (i / 5) * 40; if (t.px >= x - 3 && t.px < x + 35 && t.py >= y - 3 && t.py < y + 35) u.swatch = i; }
				if (t.py >= 150 && t.py < 190) act_row = 100;
				touching = false;
			} else if (u.page == P_DISCOVER && t.py < 26 && t.px > PANE_X + 70) {
				prompt(u.search, sizeof u.search, "Buscar juegos"); u.cur = 0; u.scroll = 0; touching = false;
			} else if (u.page == P_SETTINGS || u.page == P_CREATE) {
				if (t.py >= LIST_Y && t.py < LIST_BOTTOM) { /* se resuelve al soltar */ }
			}
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
				if (row < total) { u.cur = row; act_row = row; tap_btn = t0x >= PANE_X + PANE_W - 60; }
			}
		}

		if (newpage >= 0 && newpage != u.page) { u.page = newpage; u.cur = 0; u.scroll = 0; u.modal = -1; act_row = -1; do_back = false; }
		if (do_back) u.modal = -1;

		total = count_rows(&u, s);
		if (u.cur >= total) u.cur = total - 1;
		if (u.cur < 0) u.cur = 0;
		vis = rows_visible(u.page);
		if (u.cur < u.scroll) u.scroll = u.cur;
		if (u.cur >= u.scroll + vis) u.scroll = u.cur - vis + 1;
		if (u.scroll < 0) u.scroll = 0;

		// ---- acciones ----
		if (act_row == -2 && u.modal >= 0) {                              // jugar
			*chosen = games[u.modal]; snprintf(s_last_game, sizeof s_last_game, "%s", chosen->id); save_settings();
			res = APP_PLAY; break;
		}
		if (act_row >= 0 && u.modal < 0) {
			int n;
			switch (u.page) {
			case P_HOME: case P_DISCOVER: n = build_view(&u, s, view); if (act_row < n) u.modal = view[act_row]; break;
			case P_CREATE:
				n = build_view(&u, s, view);
				if (act_row == 0) {
					char name[44] = ""; if (prompt(name, sizeof name, "Nombre del nuevo juego") && strlen(name) >= 3) request(RQ_CREATE, name, "", (int)(osGetTime() % 360));
					else toast(&u, "El nombre necesita 3 letras o mas");
				} else if (act_row - 1 < n && (tap_btn || (down & KEY_A))) {
					request(RQ_DELETE, games[view[act_row - 1]].id, NULL, 0);
				} else if (act_row - 1 < n) u.modal = view[act_row - 1];
				break;
			case P_FRIENDS:
				n = build_people(s, pr);
				if (act_row < n && (tap_btn || (down & KEY_A))) request(pr[act_row].friend ? RQ_REMOVE : RQ_ADD, pr[act_row].p->id, NULL, 0);
				break;
			case P_AVATAR: if (act_row == 100 || (down & KEY_A)) { if (g_account) request(RQ_COLOR, AVATAR_COLORS[u.swatch], NULL, 0); else toast(&u, "Entra con email para guardar"); } break;
			case P_SETTINGS:
				if (act_row == 0) { s_dist = (s_dist + 1) % 3; save_settings(); }
				else if (act_row == 1) { remove("sdmc:/3ds/blocksy/login.txt"); toast(&u, "Email olvidado"); }
				else if (act_row == 2) { res = APP_LOGOUT; goto out; }
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
