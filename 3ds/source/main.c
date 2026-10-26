// Blocksy para Nintendo 3DS: mundo de bloques multijugador (comparte servidor con la web).
#include <3ds.h>
#include <citro2d.h>
#include <math.h>
#include <time.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "net.h"
#include "audio.h"
#include "sfx.h"
#include "ui.h"
#include "app.h"
#include "update.h"
#include "log.h"
#include "parts.h"
#include "avatar3d.h"
#include "world.h"
#include "config.h"

#ifndef BLOCKSY_VERSION
#define BLOCKSY_VERSION "dev"
#endif
#define TOP_W 400
#define TOP_H 240
#define FOV   220.0f

#define PALETTE ui_palette

// ---------- Estado compartido con el hilo de red ----------
static LightLock lock;
static Session sess;
static GameInfo cur_game;
static volatile bool want_offline;   // al salir de la app desde el juego: marcar offline en el hilo de red
#define MAX_LOCAL (MAX_BLOCKS + WORLD_MAX_CELLS)      // bloques del servidor + bloques fijos del mundo
static Block blocks[MAX_BLOCKS]; static int nblocks;
static World world;                                    // mundo base del juego (plaza, carrera...)
static bool can_build = true; static float jump_v = 8.6f;
static float rsp_x, rsp_y, rsp_z;                      // punto de reaparición (último punto de control)
static struct { u64 start; int cp; bool done; } race;  // carrera: cronómetro, punto de control y meta
static char big_msg[64]; static u64 big_until;
static Block undo_stack[8]; static int undo_n; static long g_placed_total; static u64 g_game_start; static bool g_run_tog, sel_used_g;      // deshacer (SELECT+Y), contador de bloques puestos, reloj de la partida, correr alternado
static char prev_names[MAX_PLAYERS][24]; static int prev_n; static u64 toast_until; static char toast_txt[48];      // avisos de quien entra o sale
static const char *const BLK_ES[12] = {"Blanco", "Rojo", "Naranja", "Verde", "Azul", "Morado", "Amarillo", "Turquesa", "Rosa", "Marron", "Gris", "Celeste"};
static const char *const BLK_EN[12] = {"White", "Red", "Orange", "Green", "Blue", "Purple", "Yellow", "Teal", "Pink", "Brown", "Gray", "Sky blue"};
static const char *const BLK_PT[12] = {"Branco", "Vermelho", "Laranja", "Verde", "Azul", "Roxo", "Amarelo", "Turquesa", "Rosa", "Marrom", "Cinza", "Celeste"};
static const char *blk_name(int k) { int l = app_lang(); k = (k % 12 + 12) % 12; return l == 2 ? BLK_PT[k] : l == 1 ? BLK_EN[k] : BLK_ES[k]; }         // mensaje grande sobre la partida (punto de control, meta...)
static Remote remotes[MAX_PLAYERS]; static int nremotes;
typedef struct { char name[24], text[44]; u64 until; } Bubble; static Bubble bubbles[8];     // globos de chat sobre la cabeza (5 s)
static ChatMsg chat_new[8]; static int nchat_new;          // mensajes nuevos que la interfaz todavía no ha mostrado
static volatile bool running = true;
static float px = 0.5f, py = 3, pz = 0.5f, pry = 0; // posición propia (leída por el hilo)
static bool grounded;
static volatile int moving;
static char send_anim[12] = "idle";            // animación que se envía a los demás: idle / walk / jump / un emote
static float vy;
static ChatLine hist[120]; static int nhist, hscroll; static bool chat_view;        // historial de chat de la partida (con scroll)
static char game_alert[96]; static u64 game_alert_until;                          // aviso de amigos (solicitud, invitación, mensaje) sobre la partida

typedef struct { enum { PLACE, BREAK, CHAT, EVT, TIME } type; int x, y, z, kind; char text[100]; } Action;
#define QMAX 16
static Action queue[QMAX]; static int qn;
// ---------- Bosque Oscuro: estado de la partida (lo tocan el hilo de red y el principal, siempre con `lock`) ----------
static struct {
	bool on, flash, live;            // live: ya se leyeron los eventos antiguos (a partir de ahi se avisa en pantalla)
	int round, ngot, phase;          // phase 0 jugando, 1 ganasteis
	bool got[8], reset;              // reset: empieza otra ronda (el principal te lleva a la cabaña)
	float stun; u64 tele_at, win_at, win_next;
	float mx, mz, mry, mtx, mtz, mtry; bool mwalk, mmoving, host; u64 remote_ok;
	float dist, walk_ph; char note[48];
} hr;
static long ev_last = -1;
static TopTime g_top[5]; static volatile int g_ntop;       // mejores tiempos de la carrera (lo rellena el hilo de red)
static volatile int g_ping;                          // ms de la ultima peticion de posicion (suavizado)
static bool photo_mode;                              // L+R: oculta la interfaz
static struct { float x, y, z, life; } puff[10]; static float puff_t;   // polvo al caminar
static int g_weather;                                // 0 nada, 1 lluvia, 2 nieve (config del juego)
static volatile int race_rank;                       // puesto en el top de tiempos (lo escribe el hilo de red)
static void hr_apply(const GEvent *e, const char *me) {      // con `lock` cogido
	if (!strcmp(e->kind, "orb")) { if (e->i >= 0 && e->i < world.norbs && !hr.got[e->i]) { hr.got[e->i] = true; hr.ngot++; if (hr.live && strcmp(e->name, me)) snprintf(hr.note, sizeof hr.note, "%s: fragmento %d/%d", e->name, hr.ngot, world.norbs); } }
	else if (!strcmp(e->kind, "win")) { if (e->round == hr.round && hr.phase == 0) { hr.phase = 1; hr.win_at = osGetTime(); if (hr.live) snprintf(hr.note, sizeof hr.note, "Escapasteis del bosque!"); } }
	else if (!strcmp(e->kind, "round")) { if (e->n > hr.round) { hr.round = e->n; memset(hr.got, 0, sizeof hr.got); hr.ngot = 0; hr.phase = 0; hr.reset = true; if (hr.live) snprintf(hr.note, sizeof hr.note, "Nueva ronda"); } }
}
static void push_action(Action a) { LightLock_Lock(&lock); if (qn < QMAX) queue[qn++] = a; LightLock_Unlock(&lock); }

static void net_thread(void *arg) {
	(void)arg;
	u64 last_blocks = 0, last_presence = 0, last_chat = 0, last_token = osGetTime(), last_alerts = 0; long alert_id = -1; int alert_un = -1;
	float idle_x = 0, idle_y = 0, idle_z = 0; char idle_anim[12] = ""; u64 idle_since = osGetTime();      // si no te mueves, se pregunta con menos frecuencia (ahorra red y bateria)
	long chat_last = -1; int m_place = 0, m_chat = 0, m_play = 0; u64 last_missions = osGetTime(), last_coins = osGetTime();      // progreso de misiones diarias/semanales que se envia por lotes
	net_visit(&sess, net_game());
	if (world.has_fin) { TopTime tt[5]; int tn = net_best_times(tt, 5); if (tn >= 0) { LightLock_Lock(&lock); memcpy(g_top, tt, sizeof tt); g_ntop = tn; LightLock_Unlock(&lock); } }
	while (running) {
		u64 now = osGetTime();
		Action a; bool have = false;
		LightLock_Lock(&lock);
		if (qn) { a = queue[0]; memmove(queue, queue + 1, sizeof(Action) * --qn); have = true; }
		float x = px, y = py, z = pz, ry = pry; char anim[12]; memcpy(anim, send_anim, sizeof anim); anim[11] = 0;
		LightLock_Unlock(&lock);

		if (have) {
			if (a.type == PLACE) { net_place_block(&sess, a.x, a.y, a.z, a.kind); m_place++; }
			else if (a.type == BREAK) net_break_block(&sess, a.x, a.y, a.z);
			else if (a.type == EVT) net_game_event(&sess, a.text, a.x);
			else if (a.type == TIME) { int rk = net_submit_time(&sess, a.x); if (rk > 0) race_rank = rk; TopTime tt[5]; int tn = net_best_times(tt, 5); if (tn >= 0) { LightLock_Lock(&lock); memcpy(g_top, tt, sizeof tt); g_ntop = tn; LightLock_Unlock(&lock); }
				if (sess.token[0]) { net_mission_add(&sess, "obby_win", 1); int got = net_earn_coins(&sess, 20, "obby"); if (got > 0) { LightLock_Lock(&lock); snprintf(game_alert, sizeof game_alert, "+%d BCoins", got); game_alert_until = osGetTime() + 4000; LightLock_Unlock(&lock); } } }
			else { net_say(&sess, a.text); m_chat++; }
		}
		{ u64 t0 = osGetTime(); net_send_state(&sess, x, y, z, ry, anim); int d = (int)(osGetTime() - t0); g_ping = g_ping ? (g_ping * 3 + d) / 4 : d; }

		Remote tmp[MAX_PLAYERS]; int n = net_fetch_players(&sess, tmp, MAX_PLAYERS);
		if (n >= 0) { LightLock_Lock(&lock); memcpy(remotes, tmp, sizeof(Remote) * n); nremotes = n; LightLock_Unlock(&lock); }

		if (now - last_blocks > 1000) {
			static Block bt[MAX_BLOCKS]; int m = net_fetch_blocks(&sess, bt, MAX_BLOCKS);
			if (m >= 0) { LightLock_Lock(&lock); memcpy(blocks, bt, sizeof(Block) * m); nblocks = m; LightLock_Unlock(&lock); }
			last_blocks = now;
		}
		if (now - last_chat > 1500) {                      // chat: mensajes nuevos desde la última consulta
			ChatMsg cm[6]; int c = net_fetch_chat(chat_last, cm, 6, &chat_last);
			if (c > 0) { LightLock_Lock(&lock); for (int i = 0; i < c && nchat_new < 8; i++) chat_new[nchat_new++] = cm[i]; LightLock_Unlock(&lock); }
			last_chat = now;
		}
		if (world.type == 5) {                                                  // bosque: eventos de la partida y monstruo
			GEvent ge[12]; int c, it = 0;
			do { c = net_fetch_events(ev_last, ge, 12, &ev_last); if (c > 0) { LightLock_Lock(&lock); for (int i = 0; i < c; i++) hr_apply(&ge[i], sess.username); LightLock_Unlock(&lock); } } while (c == 12 && ++it < 12);
			if (c >= 0) { LightLock_Lock(&lock); hr.live = true; LightLock_Unlock(&lock); }
			NpcState ns;
			if (net_npc_get(&sess, &ns)) {
				if (ns.have && ns.remote_fresh) { LightLock_Lock(&lock); hr.mtx = ns.x; hr.mtz = ns.z; hr.mtry = ns.ry; hr.mwalk = ns.walk; hr.remote_ok = now; hr.host = false; LightLock_Unlock(&lock); }
				else {
					LightLock_Lock(&lock); float tx_ = hr.mx, tz_ = hr.mz, tr_ = hr.mry; bool tw = hr.mmoving; LightLock_Unlock(&lock);
					bool h = net_npc_tick(&sess, tx_, tz_, tr_, tw); LightLock_Lock(&lock); hr.host = h; LightLock_Unlock(&lock);
				}
			}
		}
		if (sess.refresh[0] && now - last_token > 2700000) {   // renueva el token de la cuenta (caduca a la hora)
			if (net_refresh(&sess, true)) ui_save_session(&sess);
			last_token = now;
		}
		if (now - last_presence > 30000) { net_presence(&sess, net_game()); last_presence = now; m_play++; }
		if (sess.token[0] && now - last_coins > 300000) {                              // BCoins por jugar cada 5 minutos (tope diario en el servidor, como en la web)
			last_coins = now; int got = net_earn_coins(&sess, 10, "play");
			if (got > 0) { LightLock_Lock(&lock); snprintf(game_alert, sizeof game_alert, "+%d BCoins", got); game_alert_until = osGetTime() + 4000; LightLock_Unlock(&lock); }
		}
		if (sess.token[0] && now - last_missions > 20000) {                          // misiones (como en la web: colocar 50, chat 5, jugar 10 min)
			last_missions = now;
			if (m_place > 0) { int k = m_place > 20 ? 20 : m_place; if (net_mission_add(&sess, "place_50", k)) m_place -= k; }
			if (m_chat > 0) { int k = m_chat > 20 ? 20 : m_chat; if (net_mission_add(&sess, "chat_5", k)) m_chat -= k; }
			if (m_play >= 2) { if (net_mission_add(&sess, "play_10", m_play / 2)) m_play %= 2; }          // 1 punto por minuto jugado
		}
		if (sess.token[0] && app_notif_on() && now - last_alerts > 12000) {          // avisos de amigos también durante la partida
			last_alerts = now; static Notif an[6]; int c = net_list_notifs(&sess, an, 6); int un = net_unread_total(&sess); char msg[96] = "";
			if (c >= 0) { for (int i = 0; i < c; i++) { if (alert_id >= 0 && an[i].id > alert_id && !an[i].read && !msg[0]) app_notif_text(&an[i], msg, sizeof msg); } long mx_id = 0; for (int i = 0; i < c; i++) if (an[i].id > mx_id) mx_id = an[i].id; if (mx_id > alert_id) alert_id = mx_id; if (alert_id < 0) alert_id = 0; }
			if (un >= 0) { if (!msg[0] && alert_un >= 0 && un > alert_un) snprintf(msg, sizeof msg, "Mensaje nuevo de un amigo"); alert_un = un; }
			if (msg[0]) { LightLock_Lock(&lock); snprintf(game_alert, sizeof game_alert, "%s", msg); game_alert_until = osGetTime() + 5000; LightLock_Unlock(&lock); }
		}
		{ u64 tn = osGetTime(); LightLock_Lock(&lock); float ax = px, ay = py, az = pz; char aa[12]; memcpy(aa, send_anim, sizeof aa); LightLock_Unlock(&lock); aa[11] = 0;
		  if (fabsf(ax - idle_x) > 0.01f || fabsf(ay - idle_y) > 0.01f || fabsf(az - idle_z) > 0.01f || strcmp(aa, idle_anim) || qn) { idle_x = ax; idle_y = ay; idle_z = az; snprintf(idle_anim, sizeof idle_anim, "%s", aa); idle_since = tn; } }
		long long pause_ms = qn ? 30 : (long long)app_sync_ms(); if (!qn && osGetTime() - idle_since > 8000 && pause_ms < 250) pause_ms = 250;      // 8 s quieto: 250 ms entre peticiones
		svcSleepThread(pause_ms * 1000000LL);   // pausa entre envíos/lecturas: ajuste "Sincronizacion" (por defecto 100 ms)
	}
	// Al salir (en este hilo, que ya tiene la conexión TLS abierta): dejar la partida
	if (world.type == 5 && hr.host) net_npc_release(&sess);
	net_leave(&sess);
	if (want_offline) net_offline(&sess);
	net_thread_cleanup();
}

// ---------- Mundo local: tabla hash de bloques (antes se recorría la lista entera en cada colisión) ----------
#define HT_SIZE 8192
static short ht[HT_SIZE];                 // índice+1 en local[]; 0 = vacío
static unsigned hkey(int x, int y, int z) { unsigned h = (unsigned)x * 73856093u ^ (unsigned)y * 19349663u ^ (unsigned)z * 83492791u; return h & (HT_SIZE - 1); }
static void ht_build(const Block *bl, int n) {
	memset(ht, 0, sizeof ht);
	for (int i = 0; i < n; i++) { unsigned h = hkey(bl[i].x, bl[i].y, bl[i].z); while (ht[h]) h = (h + 1) & (HT_SIZE - 1); ht[h] = (short)(i + 1); }
}
// ---- piezas del Studio: cajas giradas, bolas y cilindros (la 3DS las dibuja con su volumen y las usa de suelo/paredes) ----
static Part parts[MAX_PARTS]; static int nparts;
static UiText uitexts[MAX_UITEXTS]; static int nuitexts;       // textos de interfaz del Studio (config.ui)
// ¿La celda (x,y,z) esta ocupada por una pieza con colision? (se mira el centro de la celda dentro de la caja girada)
static bool part_solid(int x, int y, int z) {
	for (int i = 0; i < nparts; i++) {
		const Part *o = &parts[i]; if (!o->collide) continue;
		float dx = x + 0.5f - o->x, dy = y + 0.5f - o->y, dz = z + 0.5f - o->z;
		if (fabsf(dy) >= o->sy * 0.5f + 0.25f) continue;
		if (fabsf(dx) > o->rad || fabsf(dz) > o->rad) continue;
		float c = o->cs, s = o->sn, lx = dx * c - dz * s, lz = dx * s + dz * c;
		float hx = o->sx * 0.5f + 0.25f, hz = o->sz * 0.5f + 0.25f;
		if (o->shape == 1 || o->shape == 2) { float nx = lx / (hx - 0.1f), nz = lz / (hz - 0.1f); if (o->shape == 1) { float ny = dy / (o->sy * 0.5f + 0.15f); if (nx * nx + nz * nz + ny * ny > 1) continue; } else if (nx * nx + nz * nz > 1) continue; }
		else if (fabsf(lx) >= hx || fabsf(lz) >= hz) continue;
		return true;
	}
	return false;
}
static const Block *local_blocks; 
static bool solid_at(int x, int y, int z) {
	if (world_floor_solid(&world, x, y, z)) return true;
	if (nparts && part_solid(x, y, z)) return true;
	if (!local_blocks) return false;
	for (unsigned h = hkey(x, y, z); ht[h]; h = (h + 1) & (HT_SIZE - 1)) {
		const Block *b = &local_blocks[ht[h] - 1];
		if (b->x == x && b->y == y && b->z == z) return true;
	}
	return false;
}
// ¿Hay un bloque de jugador (rompible) ahí? Los bloques fijos del mundo no se rompen
static bool breakable(int x, int y, int z) {
	if (!local_blocks) return false;
	for (unsigned h = hkey(x, y, z); ht[h]; h = (h + 1) & (HT_SIZE - 1)) { const Block *b = &local_blocks[ht[h] - 1]; if (b->x == x && b->y == y && b->z == z) return b->kind >= 0; }
	return false;
}
#define SOLID(X, Y, Z) solid_at((int)floorf(X), (int)floorf(Y), (int)floorf(Z))
// ¿Choca una caja de 0.6 x 1.8 con algún bloque? (pies en y)
static bool body_hits(float x, float y, float z) {
	for (int dx = -1; dx <= 1; dx += 2) for (int dz = -1; dz <= 1; dz += 2)
		if (SOLID(x + dx * 0.3f, y + 0.05f, z + dz * 0.3f) || SOLID(x + dx * 0.3f, y + 0.9f, z + dz * 0.3f) || SOLID(x + dx * 0.3f, y + 1.7f, z + dz * 0.3f)) return true;
	return false;
}

// ---------- Render 3D con proyección manual sobre citro2d ----------
static float cam_yaw = 0, cam_pitch = 0.5f, cam_dist = 9;
static float cx_, cy_, cz_;
static float fog_near = 16, fog_far = 40;

static bool project(float x, float y, float z, float *sx, float *sy, float *depth) {
	float dx = x - cx_, dy = y - cy_, dz = z - cz_;
	float cy = cosf(cam_yaw), sy_ = sinf(cam_yaw);
	float rx = dx * cy - dz * sy_;            // eje derecho de la cámara
	float fw = -dx * sy_ - dz * cy;           // eje hacia delante
	float cp = cosf(cam_pitch), sp = sinf(cam_pitch);
	float ry = dy * cp + fw * sp, rz2 = -dy * sp + fw * cp + cam_dist;
	if (rz2 < 0.3f) return false;
	*sx = TOP_W / 2 + rx * FOV / rz2; *sy = TOP_H / 2 - ry * FOV / rz2; *depth = rz2;
	return true;
}

typedef struct { float depth; float x, y, z, w, h; u32 color; int av; int pi; } Box;   // av: -1 bloque, 0 yo, 1+i jugador remoto i
static float g_ft_avg = 33;                               // tiempo medio de fotograma (ms), para el contador de FPS y la calidad adaptativa
static int jumps_left;                                    // saltos extra disponibles en el aire
static float g_tod = -1;                                  // hora del dia (0-24) para el cielo continuo; -1 = cielo fijo (g_skymode)
static int g_skymode;                                     // cielo del juego (config.sky): 0 dia, 1 amanecer, 2 atardecer, 3 noche, 4 espacio
static bool g_new3ds;                                     // New 3DS: 804 MHz y mas memoria => mas bloques y mas distancia
static Box draw_list[MAX_LOCAL + MAX_PLAYERS * 2 + 4 + 700];

static u32 shade(u32 c, float f) {
	u32 r = (c & 0xFF) * f, g = ((c >> 8) & 0xFF) * f, b = ((c >> 16) & 0xFF) * f;
	return C2D_Color32(r > 255 ? 255 : r, g > 255 ? 255 : g, b > 255 ? 255 : b, 255);
}
// Niebla: lo lejano se funde con el color del horizonte (da sensación de profundidad)
static int g_sky[3] = {0xD8, 0xEC, 0xFF};      // color del horizonte / niebla (el bosque es de noche)
#define SKY_R g_sky[0]
#define SKY_G g_sky[1]
#define SKY_B g_sky[2]
static u32 fogged(u32 c, float depth) {
	float t = (depth - fog_near) / (fog_far - fog_near); if (t <= 0) return c; if (t > 1) t = 1;
	float r = (c & 0xFF) * (1 - t) + SKY_R * t, g = ((c >> 8) & 0xFF) * (1 - t) + SKY_G * t, b = ((c >> 16) & 0xFF) * (1 - t) + SKY_B * t;
	return C2D_Color32((u32)r, (u32)g, (u32)b, 255);
}

static int g_poly_alpha = 255;                                            // piezas semitransparentes (agua, cristal)
// Estelas (trail_*): particulas que deja el jugador al moverse; nacen en render_game segun cuanto se ha desplazado y se encogen en 0,6 s
typedef struct { float x, y, z; u64 born; u32 col; } TrailP;
static TrailP trl[MAX_PLAYERS + 1][6]; static float trl_lx[MAX_PLAYERS + 1], trl_lz[MAX_PLAYERS + 1]; static int trl_n[MAX_PLAYERS + 1];
static bool trail_of(const char *loadout, char *out, size_t n) {
	const char *p = loadout; for (int i = 0; i < 3 && p; i++) { p = strchr(p, '|'); if (p) p++; }
	if (!p) return false; const char *e = strchr(p, '|'); size_t l = e ? (size_t)(e - p) : strlen(p); if (!l || l >= n) return false;
	memcpy(out, p, l); out[l] = 0; return !strncmp(out, "trail_", 6);
}
static void trail_update(int slot, const char *loadout, float x, float y, float z, u64 now) {
	char id[24]; if (!trail_of(loadout, id, sizeof id)) { trl_lx[slot] = x; trl_lz[slot] = z; return; }
	float dx = x - trl_lx[slot], dz = z - trl_lz[slot];
	if (dx * dx + dz * dz > 0.04f && dx * dx + dz * dz < 25.0f) {
		u32 col = !strcmp(id, "trail_fire") ? C2D_Color32(0xFF, 0x6B, 0x2B, 255) : !strcmp(id, "trail_bubbles") ? C2D_Color32(0x7E, 0xD6, 0xFF, 255) : !strcmp(id, "trail_rainbow") ? C2D_Color32((u32)(128 + 127 * sinf(now * 0.004f)), (u32)(128 + 127 * sinf(now * 0.004f + 2.1f)), (u32)(128 + 127 * sinf(now * 0.004f + 4.2f)), 255) : C2D_Color32(0xFF, 0xE0, 0x66, 255);
		TrailP *t = &trl[slot][trl_n[slot]++ % 6]; t->x = x; t->y = y + 0.1f; t->z = z; t->born = now; t->col = col;
	}
	trl_lx[slot] = x; trl_lz[slot] = z;
}
static void trail_add(int *nd, int slot, u64 now) {
	for (int k = 0; k < 6; k++) {
		const TrailP *t = &trl[slot][k]; if (!t->born || now - t->born > 600) continue;
		float f = 1.0f - (now - t->born) / 600.0f, w = 0.05f + 0.16f * f, sx, sy, d; if (!project(t->x, t->y + 0.1f, t->z, &sx, &sy, &d)) continue;
		draw_list[(*nd)++] = (Box){d, t->x - w * 0.5f, t->y + (1.0f - f) * 0.3f, t->z - w * 0.5f, w, w, fogged(t->col, d), -1};
	}
}
// Particulas de bloques (fx_*): trocitos al poner/romper un bloque y polvo al aterrizar; solo se ven (no se sincronizan), viven 0,7 s
typedef struct { float x, y, z, vx, vy, vz, life; u32 col; } FxP;
static FxP fxs[40]; static unsigned fx_seed = 12345;
static float fx_rnd(void) { fx_seed = fx_seed * 1664525u + 1013904223u; return ((fx_seed >> 8) & 0xFFFF) / 65535.0f - 0.5f; }
static void fx_burst(float cx, float cy, float cz, u32 col, int n, float spd) {
	if (!app_fx_on() || g_ft_avg > 55) return;                                // sin particulas si va muy lento
	for (int k = 0; k < n; k++) {
		int slot = -1; float oldest = 1e9f;
		for (int i = 0; i < 40; i++) { if (fxs[i].life <= 0) { slot = i; break; } if (fxs[i].life < oldest) { oldest = fxs[i].life; slot = i; } }
		FxP *p = &fxs[slot]; p->x = cx + fx_rnd() * 0.6f; p->y = cy + fx_rnd() * 0.4f; p->z = cz + fx_rnd() * 0.6f;
		p->vx = fx_rnd() * spd; p->vy = 1.5f + (fx_rnd() + 0.5f) * spd; p->vz = fx_rnd() * spd; p->life = 0.5f + (fx_rnd() + 0.5f) * 0.3f; p->col = col;
	}
}
static void fx_step(float dt) {
	for (int i = 0; i < 40; i++) { FxP *p = &fxs[i]; if (p->life <= 0) continue; p->life -= dt; p->vy -= 14.0f * dt; p->x += p->vx * dt; p->y += p->vy * dt; p->z += p->vz * dt; if (p->y < 0 && world.floor) { p->y = 0; p->vy = 0; p->vx *= 0.5f; p->vz *= 0.5f; } }
}
static void fx_add(int *nd) {
	for (int i = 0; i < 40; i++) {
		const FxP *p = &fxs[i]; if (p->life <= 0) continue;
		float w = 0.06f + 0.1f * fminf(1.0f, p->life * 1.6f), sx, sy, d; if (!project(p->x, p->y + 0.1f, p->z, &sx, &sy, &d) || d > fog_far) continue;
		draw_list[(*nd)++] = (Box){d - 0.05f, p->x - w * 0.5f, p->y, p->z - w * 0.5f, w, w, fogged(p->col, d), -1};
	}
}
// Mascotas (pet_*): una cajita que acompana al jugador, con los colores de la web; el equipo viaja en "sombrero|gafas|espalda|estela|mascota|"
static bool pet_of(const char *loadout, char *out, size_t n) {
	const char *p = loadout; for (int i = 0; i < 4 && p; i++) { p = strchr(p, '|'); if (p) p++; }
	if (!p) return false; const char *e = strchr(p, '|'); size_t l = e ? (size_t)(e - p) : strlen(p); if (!l || l >= n) return false;
	memcpy(out, p, l); out[l] = 0; return !strncmp(out, "pet_", 4);
}
static void add_pet(int *nd, const char *loadout, float x, float y, float z, float yaw, float t, int salt) {
	char id[24]; if (!pet_of(loadout, id, sizeof id)) return;
	bool slime = !strcmp(id, "pet_slime"), ghost = !strcmp(id, "pet_ghost");
	u32 col = slime ? C2D_Color32(0x4C, 0xD9, 0x64, 255) : !strcmp(id, "pet_bot") ? C2D_Color32(0xAA, 0xB4, 0xC0, 255) : ghost ? C2D_Color32(0xF0, 0xF0, 0xFF, 255) : C2D_Color32(0x4D, 0x8D, 0xFF, 255);
	float fx = sinf(yaw), fz = cosf(yaw), bob = 0.12f * sinf(t * 4.0f + salt), qx = x - fx * 0.9f + fz * 0.6f, qz = z - fz * 0.9f - fx * 0.6f;
	float w = slime ? 0.5f : 0.4f, h = slime ? 0.36f : ghost ? 0.5f : 0.4f, yb = y + 0.1f + (ghost ? 0.25f + bob : 0);
	float sx, sy, d; if (!project(qx, yb + h * 0.5f, qz, &sx, &sy, &d)) return;
	draw_list[(*nd)++] = (Box){d, qx - w * 0.5f, yb, qz - w * 0.5f, w, h, fogged(col, d), -1};
}
static void draw_poly(float v[8][3], u32 color) {
	static const int F[6][4] = {{0,1,2,3},{4,5,6,7},{0,1,5,4},{2,3,7,6},{0,3,7,4},{1,2,6,5}};
	static const float lum[6] = {0.55f, 1.0f, 0.75f, 0.75f, 0.65f, 0.85f};
	float sx[8], sy[8], d[8];
	for (int i = 0; i < 8; i++) if (!project(v[i][0], v[i][1], v[i][2], &sx[i], &sy[i], &d[i])) return;
	// Pinta de atrás a delante las caras; descarta las traseras por orientación en pantalla
	for (int f = 0; f < 6; f++) {
		const int *q = F[f];
		float area = (sx[q[1]] - sx[q[0]]) * (sy[q[2]] - sy[q[0]]) - (sx[q[2]] - sx[q[0]]) * (sy[q[1]] - sy[q[0]]);
		if (area <= 0) continue; // cara trasera (orientación según el orden de vértices)
		// degradado por vértice (gratis): las caras laterales se oscurecen hacia abajo (oclusión ambiental falsa) y la superior hacia el fondo
		u32 cv[4];
		for (int k = 0; k < 4; k++) { float fk = lum[f]; if (f >= 2 && q[k] < 4) fk *= 0.74f; else if (f == 1 && d[q[k]] > d[q[0]]) fk *= 0.94f; cv[k] = shade(color, fk); if (g_poly_alpha < 255) cv[k] = (cv[k] & 0x00FFFFFFu) | ((u32)g_poly_alpha << 24); }
		C2D_DrawTriangle(sx[q[0]], sy[q[0]], cv[0], sx[q[1]], sy[q[1]], cv[1], sx[q[2]], sy[q[2]], cv[2], 0);
		C2D_DrawTriangle(sx[q[0]], sy[q[0]], cv[0], sx[q[2]], sy[q[2]], cv[2], sx[q[3]], sy[q[3]], cv[3], 0);
	}
}
static void draw_box(float x, float y, float z, float w, float h, u32 color) {
	float v[8][3] = {{x,y,z},{x+w,y,z},{x+w,y,z+w},{x,y,z+w},{x,y+h,z},{x+w,y+h,z},{x+w,y+h,z+w},{x,y+h,z+w}};
	draw_poly(v, color);
}
// Pieza del Studio: caja girada (cilindros algo mas finos) o bola (circulo con brillo)
static void draw_part(const Part *o, u32 color) {
	if (o->shape == 1) {
		float gx, gy, gd; if (!project(o->x, o->y, o->z, &gx, &gy, &gd)) return;
		float r = fmaxf(o->sx, fmaxf(o->sy, o->sz)) * 0.5f * FOV / gd;
		if (o->glow) C2D_DrawCircleSolid(gx, gy, 0, r * 2.2f, (color & 0x00FFFFFFu) | (34u << 24));
		C2D_DrawCircleSolid(gx, gy, 0, r, shade(color, 0.72f)); C2D_DrawCircleSolid(gx - r * 0.18f, gy - r * 0.2f, 0, r * 0.78f, color); C2D_DrawCircleSolid(gx - r * 0.34f, gy - r * 0.38f, 0, r * 0.3f, shade(color, 1.25f));
		return;
	}
	float k = o->shape == 2 ? 0.88f : 1.0f, hx = o->sx * 0.5f * k, hy = o->sy * 0.5f, hz = o->sz * 0.5f * k, c = cosf(o->ry), s = sinf(o->ry), v[8][3];
	static const int sg[8][3] = {{-1,-1,-1},{1,-1,-1},{1,-1,1},{-1,-1,1},{-1,1,-1},{1,1,-1},{1,1,1},{-1,1,1}};
	for (int i = 0; i < 8; i++) { float lx = sg[i][0] * hx, lz = sg[i][2] * hz; v[i][0] = o->x + lx * c + lz * s; v[i][1] = o->y + sg[i][1] * hy; v[i][2] = o->z - lx * s + lz * c; }
	g_poly_alpha = o->alpha ? o->alpha : 255; draw_poly(v, color); g_poly_alpha = 255;
	if (o->glow) { float gx, gy, gd; if (project(o->x, o->y, o->z, &gx, &gy, &gd)) { float r = fmaxf(o->sx, fmaxf(o->sy, o->sz)) * FOV / gd; C2D_DrawCircleSolid(gx, gy, 0, r * 1.6f, (color & 0x00FFFFFFu) | (30u << 24)); } }
}
// Contorno de un cubo (el bloque al que apuntas)
static void draw_outline(int bx, int by, int bz, u32 color) {
	static const int E[12][2] = {{0,1},{1,2},{2,3},{3,0},{4,5},{5,6},{6,7},{7,4},{0,4},{1,5},{2,6},{3,7}};
	float e = 0.015f, v[8][3] = {{bx-e,by-e,bz-e},{bx+1+e,by-e,bz-e},{bx+1+e,by-e,bz+1+e},{bx-e,by-e,bz+1+e},{bx-e,by+1+e,bz-e},{bx+1+e,by+1+e,bz-e},{bx+1+e,by+1+e,bz+1+e},{bx-e,by+1+e,bz+1+e}};
	float sx[8], sy[8], d[8];
	for (int i = 0; i < 8; i++) if (!project(v[i][0], v[i][1], v[i][2], &sx[i], &sy[i], &d[i])) return;
	for (int i = 0; i < 12; i++) C2D_DrawLine(sx[E[i][0]], sy[E[i][0]], color, sx[E[i][1]], sy[E[i][1]], color, 1.6f, 0.3f);
}

// Colinas lejanas en el horizonte: dos capas con paralaje (se mueven con la camara); la lejana se funde con el cielo
static void draw_hills(u32 col, float dist, float base_h, float amp, float seed) {
	const int N = 28; float prev[2][2]; bool have = false; float pbx = 0, pby = 0;
	for (int i = 0; i <= N; i++) {
		float a = i * 6.2831853f / N, h = base_h + amp * (0.5f + 0.5f * sinf(a * 3 + seed)) * (0.65f + 0.35f * sinf(a * 7 + seed * 2)), wx = cx_ + sinf(a) * dist, wz = cz_ + cosf(a) * dist;
		float tx_, ty_, td, bx_, by_, bd;
		bool ok = project(wx, cy_ + h, wz, &tx_, &ty_, &td) && project(wx, cy_ - 45, wz, &bx_, &by_, &bd);
		if (ok && have) {
			C2D_DrawTriangle(pbx, pby, col, prev[0][0], prev[0][1], col, tx_, ty_, col, 0);
			C2D_DrawTriangle(pbx, pby, col, tx_, ty_, col, bx_, by_, col, 0);
			(void)prev[1];
		}
		have = ok; if (ok) { prev[0][0] = tx_; prev[0][1] = ty_; pbx = bx_; pby = by_; }
	}
}
static int cmp_box(const void *a, const void *b) { float d = ((const Box *)b)->depth - ((const Box *)a)->depth; return d > 0 ? 1 : d < 0 ? -1 : 0; }

static void do_chat(void) {
	if (!cur_game.allow_chat) { snprintf(big_msg, sizeof big_msg, "El chat esta desactivado"); big_until = osGetTime() + 2000; return; }
	Action a = {.type = CHAT}; SwkbdState kb; swkbdInit(&kb, SWKBD_TYPE_NORMAL, 2, 90); swkbdSetHintText(&kb, "Mensaje");
	if (swkbdInputText(&kb, a.text, sizeof a.text) == SWKBD_BUTTON_CONFIRM) {
		for (char *c = a.text; *c; c++) if (*c == '"' || *c == '\\') *c = ' ';
		push_action(a);
	}
}

// ---------- Estado de la partida que usa el dibujado (a nivel de fichero para poder previsualizarlo) ----------
static Block local[MAX_LOCAL]; static Remote rem[MAX_PLAYERS], disp[MAX_PLAYERS];
static struct { char name[24], text[100]; u64 until; } chat[4];
static int kind = 1, nl, nr, ndisp;
static AvPose pose_self, rem_pose[MAX_PLAYERS], disp_pose[MAX_PLAYERS];     // animación de cada avatar (suavizada)
static AvStyle self_style, rem_style[MAX_PLAYERS];
static float self_yaw;
static char emote[12];                      // emote activo (vacío = ninguno)
static bool emote_menu;                     // selector de emotes abierto en la pantalla táctil
static int tx, tz, place_y = -1, break_y = -1; static bool overlap;     // bloque al que apuntas
static u64 now_ms, t_start;

// ---------- Bosque Oscuro: monstruo, fragmentos y linterna (lado cliente; el estado compartido va por eventos) ----------
static float lit_depth(float dx, float dz, float fx, float fz, float d) {                   // linterna: lo que ilumina el cono se ve de mas lejos
	float dist = hypotf(dx, dz); if (!hr.flash || dist < 0.5f || dist > 26) return d;
	return (dx * fx + dz * fz) / dist > 0.82f ? cam_dist + (d - cam_dist) * 0.5f : d;
}
static void hr_teleport(void) { px = world.spawn[0]; py = world.spawn[1]; pz = world.spawn[2]; rsp_x = px; rsp_y = py; rsp_z = pz; vy = 0; cx_ = px; cy_ = py + 1; cz_ = pz; }
static void mon_sim(float dt) {
	float best = 1e9f, gx = 0, gz = 0; bool any = false;
	for (int i = -1; i < nr; i++) {
		float x = i < 0 ? px : rem[i].x, z = i < 0 ? pz : rem[i].z;
		if (hypotf(x, z) < world.safe) continue;
		float d = hypotf(x - hr.mx, z - hr.mz); if (d < best) { best = d; gx = x; gz = z; any = true; }
	}
	hr.mmoving = false; if (!any || hr.stun > 0) return;
	float ang = atan2f(gx - hr.mx, gz - hr.mz); static const float offs[6] = {0, 0.7f, -0.7f, 1.4f, -1.4f, 2.2f};
	static const float MSP[3] = {3.4f, 4.3f, 5.2f}; float msp = MSP[app_forest_level() % 3];
	for (int k = 0; k < 6; k++) {                                              // rodea los arboles
		float a = ang + offs[k], nx = hr.mx + sinf(a) * msp * dt, nz = hr.mz + cosf(a) * msp * dt; int ix = (int)floorf(nx), iz = (int)floorf(nz); float r = hypotf(nx, nz);
		if (!solid_at(ix, 0, iz) && !solid_at(ix, 1, iz) && !solid_at(ix, 2, iz) && r < world.radius - 1 && r > world.safe) { hr.mx = nx; hr.mz = nz; hr.mry = a; hr.mmoving = true; break; }
	}
}
// Un frame de la partida del bosque (despues de mover al jugador)
static void forest_frame(float dt, u64 now, u32 down) {
	if (down & KEY_X) hr.flash = !hr.flash;
	bool host; float k = fminf(1, dt * 6);
	LightLock_Lock(&lock);
	if (hr.reset) { hr.reset = false; hr_teleport(); }
	host = hr.host;
	if (hr.note[0]) { snprintf(big_msg, sizeof big_msg, "%s", hr.note); big_until = now + 2500; hr.note[0] = 0; }
	if (!host) {                                                                // el monstruo lo mueve otro jugador: se interpola
		float dx = hr.mtx - hr.mx, dz = hr.mtz - hr.mz; hr.mx += dx * k; hr.mz += dz * k;
		float dyaw = fmodf(hr.mtry - hr.mry + 3 * (float)M_PI, 2 * (float)M_PI) - (float)M_PI; hr.mry += dyaw * fminf(1, dt * 8);
		hr.mmoving = now - hr.remote_ok < 1500 && hypotf(dx, dz) > 0.05f;
	}
	LightLock_Unlock(&lock);
	if (host && hr.phase == 0) mon_sim(dt);
	hr.walk_ph += dt * (hr.mmoving ? 8 : 1.5f);
	float d = hypotf(hr.mx - px, hr.mz - pz); hr.dist = d;
	if (hr.stun > 0) hr.stun -= dt;
	for (int i = 0; i < world.norbs && hr.stun <= 0 && hr.phase == 0; i++) {   // recoger fragmentos
		if (hr.got[i] || hypotf(world.orb[i][0] - px, world.orb[i][2] - pz) > 1.5f || fabsf(py - world.orb[i][1]) > 2.5f) continue;
		LightLock_Lock(&lock); hr.got[i] = true; int n = ++hr.ngot, rd = hr.round; LightLock_Unlock(&lock);
		push_action((Action){.type = EVT, .x = i, .text = "orb"}); snprintf(big_msg, sizeof big_msg, "Fragmento %d/%d", n, world.norbs); big_until = now + 1600;
		if (n >= world.norbs) push_action((Action){.type = EVT, .x = rd, .text = "win"});
	}
	if (hr.stun <= 0 && hr.phase == 0 && d < 1.15f && hypotf(px, pz) > world.safe) {       // te atrapa
		hr.stun = 2.2f; hr.tele_at = now + 900; snprintf(big_msg, sizeof big_msg, "Te atrapo!"); big_until = now + 2200; push_action((Action){.type = EVT, .text = "caught"});
	}
	if (hr.tele_at && now >= hr.tele_at) { hr.tele_at = 0; hr_teleport(); }
	float rr = hypotf(px, pz); if (rr > world.radius - 0.5f) { px *= (world.radius - 0.5f) / rr; pz *= (world.radius - 0.5f) / rr; }
	if (hr.phase == 1 && now - hr.win_at > 9000 && now > hr.win_next) { hr.win_next = now + 20000; push_action((Action){.type = EVT, .x = hr.round + 1, .text = "round"}); }
}

// Dibuja un frame completo: mundo 3D arriba y panel táctil abajo
static void render_game(C3D_RenderTarget *top, C3D_RenderTarget *bot) {
	u64 now = now_ms;
	// ---- lista de dibujo ordenada por profundidad (con niebla) ----
	static const int caps[3] = {150, 250, 320}, radii[3] = {7, 8, 9};
	// calidad adaptativa: si los fotogramas tardan demasiado se dibujan menos objetos, y si sobra tiempo se dibujan mas (0.55 - 1.35)
	static float q_adapt = 1.0f; static u64 ft_last; float ft_avg = g_ft_avg;
	if (ft_last && now - ft_last < 500) { ft_avg += ((float)(now - ft_last) - ft_avg) * 0.04f; g_ft_avg = ft_avg; if (ft_avg > 40 && q_adapt > 0.55f) q_adapt -= 0.004f; else if (ft_avg < 29 && q_adapt < 1.35f) q_adapt += 0.0015f; }
	ft_last = now;
	int lvl = app_draw_level(), cap = caps[lvl] + (g_new3ds ? 200 + lvl * 60 : 0), R = radii[lvl] + (g_new3ds ? 2 : 0);
	cap = (int)(cap * q_adapt); if (cap < 90) cap = 90;
	fog_near = 12 + lvl * 4; fog_far = 26 + lvl * 8 + (g_new3ds ? 8 : 0);
	bool night = world.type == 5;
	{ float fm = cur_game.fog > 0 ? (cur_game.fog < 0.25f ? 0.25f : cur_game.fog > 2 ? 2 : cur_game.fog) : 1; fog_near *= fm; fog_far *= fm; }      // config.fog (0.25 - 2)
	if (night) { g_sky[0] = 0x04; g_sky[1] = 0x07; g_sky[2] = 0x10; fog_near = cam_dist + 1.5f; fog_far = cam_dist + 15 + lvl * 3; R = 7; }
	int skm = night ? 0 : g_skymode; bool starry = night || skm >= 3;
	static const unsigned char SKT[5][3] = {{0x4F, 0x9F, 0xE8}, {0x6A, 0x7C, 0xC8}, {0x58, 0x48, 0x98}, {0x02, 0x03, 0x0A}, {0x00, 0x00, 0x06}};     // arriba del cielo
	static const unsigned char SKH[5][3] = {{0xD8, 0xEC, 0xFF}, {0xFF, 0xCB, 0xA0}, {0xFF, 0x9C, 0x6C}, {0x0C, 0x14, 0x26}, {0x06, 0x06, 0x14}};   // horizonte y niebla
	static const float DIM[5] = {1.0f, 0.92f, 0.82f, 0.55f, 0.5f};
	float skt[3] = {SKT[skm][0], SKT[skm][1], SKT[skm][2]}, skh[3] = {SKH[skm][0], SKH[skm][1], SKH[skm][2]}, dim = night ? 0.62f : DIM[skm];
	if (!night && g_tod >= 0 && skm < 4) {                                                   // cielo continuo: mezcla de los cielos fijos segun la hora (amanecer 5-8, atardecer 17-21)
		static const float KH[] = {0, 4.5f, 6.5f, 9, 16.5f, 18.5f, 20.5f, 24}; static const int KM[] = {3, 3, 1, 0, 0, 2, 3, 3};
		int k = 0; while (k < 6 && g_tod >= KH[k + 1]) k++;
		float f = (g_tod - KH[k]) / (KH[k + 1] - KH[k]); if (f < 0) f = 0; if (f > 1) f = 1; int a = KM[k], b = KM[k + 1];
		for (int c = 0; c < 3; c++) { skt[c] = SKT[a][c] + (SKT[b][c] - SKT[a][c]) * f; skh[c] = SKH[a][c] + (SKH[b][c] - SKH[a][c]) * f; }
		dim = DIM[a] + (DIM[b] - DIM[a]) * f; starry = (a == 3 ? 1 - (b == 3 ? 0 : f) : (b == 3 ? f : 0)) > 0.5f; skm = starry ? 3 : (dim < 0.88f ? 2 : 0);
	}
	if (!night) { g_sky[0] = (unsigned char)skh[0]; g_sky[1] = (unsigned char)skh[1]; g_sky[2] = (unsigned char)skh[2]; }
	float fdx = -sinf(cam_yaw), fdz = -cosf(cam_yaw);                                       // hacia donde mira la camara (la linterna)
	#define NIGHT_D(X, Z, D) (night ? lit_depth((X) - px, (Z) - pz, fdx, fdz, (D)) : (D))
	int nd = 0; float sx, sy, d;
	for (int i = 0; i < nl; i++) if (project(local[i].x + .5f, local[i].y + .5f, local[i].z + .5f, &sx, &sy, &d) && d < fog_far + 6)
		draw_list[nd++] = (Box){d, local[i].x, local[i].y, local[i].z, 1, 1, fogged(shade(local[i].kind < 0 ? local[i].color : PALETTE[local[i].kind % NPALETTE], dim * (((local[i].x * 7 + local[i].y * 13 + local[i].z * 5) & 3) == 0 ? 0.93f : 1.0f)), NIGHT_D(local[i].x + .5f, local[i].z + .5f, d)), -1};
	if (app_opt(OPT_DECOR) && !night && skm < 3 && world.floor && (world.type == 0 || world.type == 1) && !nparts) {              // flores y matas de adorno (solo se ven: no estorban ni se sincronizan)
		static const u32 FLOWER[4] = {0xFF3C4CE0, 0xFF3CC8F5, 0xFFF5F5F5, 0xFFD8609B};
		int bx = (int)floorf(px), bz = (int)floorf(pz), rr = 6 + lvl;
		for (int gx = -rr; gx <= rr; gx++) for (int gz = -rr; gz <= rr; gz++) {
			int ax = bx + gx, az = bz + gz; unsigned h = ((unsigned)ax * 73856093u) ^ ((unsigned)az * 19349663u); h *= 2654435761u;
			if ((h >> 8) % 10) continue;
			bool plaza = world.type == 1 && abs(ax) <= world.plaza_n && abs(az) <= world.plaza_n; if (plaza) continue;
			if (solid_at(ax, 0, az)) continue;
			float fx = ax + 0.35f + ((h >> 4) & 7) * 0.04f, fz = az + 0.35f + ((h >> 12) & 7) * 0.04f;
			if (!project(fx, 0.3f, fz, &sx, &sy, &d) || d > fog_far) continue;
			float de = d;
			draw_list[nd++] = (Box){de, fx, 0, fz, 0.08f, 0.32f, fogged(shade(0xFF3FA040, 1.0f), de), -1};
			draw_list[nd++] = (Box){de - 0.05f, fx - 0.07f, 0.3f, fz - 0.07f, 0.22f, 0.12f, fogged(FLOWER[(h >> 20) & 3], de), -1};
		}
	}
	if ((world.type == 9 || world.type == 10) && !night) {                                    // colinas e islas: columnas calculadas al vuelo + copas de los arboles
		int bx = (int)floorf(px), bz = (int)floorf(pz), rr = 7 + lvl + (g_new3ds ? 2 : 0);
		if (world.type == 9) for (int gx = -rr; gx <= rr; gx++) for (int gz = -rr; gz <= rr; gz++) {
			int ax = bx + gx, az = bz + gz, hh = world_hill_h(&world, ax, az); if (hh <= 0) continue;
			if (!project(ax + 0.5f, hh * 0.5f, az + 0.5f, &sx, &sy, &d) || d > fog_far + 4) continue;
			u32 col = (hh <= 1 && world_hill_top_sand(ax, az)) ? C2D_Color32(0xE6, 0xD2, 0x8C, 255) : ((ax + az) & 1) ? C2D_Color32(0x5C, 0xB8, 0x5C, 255) : C2D_Color32(0x53, 0xA8, 0x53, 255);
			if (hh >= 3) col = shade(col, 0.96f);
			draw_list[nd++] = (Box){d, ax, 0, az, 1, (float)hh, fogged(shade(col, dim), d), -1};
		}
		if (world.type == 10) for (int di = 0; di < world.nisl; di++) {
			int cx0 = world.isl[di][0], cy0 = world.isl[di][1], cz0 = world.isl[di][2], rad = world.isl[di][3];
			if (abs(cx0 - bx) > rad + rr || abs(cz0 - bz) > rad + rr) continue;
			for (int lx = -rad; lx <= rad; lx++) for (int lz = -rad; lz <= rad; lz++) {
				int ax = cx0 + lx, az = cz0 + lz, dep = world_island_depth(&world, di, ax, az); if (!dep || abs(ax - bx) > rr || abs(az - bz) > rr) continue;
				if (!project(ax + 0.5f, cy0 - dep * 0.5f + 0.5f, az + 0.5f, &sx, &sy, &d) || d > fog_far + 4) continue;
				u32 col = ((lx + lz) & 1) ? C2D_Color32(0x5C, 0xB8, 0x5C, 255) : C2D_Color32(0x53, 0xA8, 0x53, 255);
				draw_list[nd++] = (Box){d, ax, cy0 - dep + 1, az, 1, (float)dep, fogged(shade(col, dim), d), -1};
				if (dep >= 3) draw_list[nd++] = (Box){d + 0.01f, ax + 0.02f, cy0 - dep + 1, az + 0.02f, 0.96f, (float)(dep - 1), fogged(shade(C2D_Color32(0x8A, 0x5A, 0x35, 255), dim), d), -1};   // tierra bajo la hierba
			}
		}
		for (int i = 0; i < world.ntrees; i++) {
			int tx0 = world.tree[i][0], tz0 = world.tree[i][1], ty0 = world.tree_y[i];
			if (!project(tx0 + 0.5f, ty0 + 4.0f, tz0 + 0.5f, &sx, &sy, &d) || d > fog_far + 4) continue;
			draw_list[nd++] = (Box){d - 0.1f, tx0 - 2, ty0 + 3, tz0 - 2, 5, 1, fogged(shade(C2D_Color32(0x2F, 0x8F, 0x3A, 255), dim), d), -1};
			draw_list[nd++] = (Box){d - 0.3f, tx0 - 1, ty0 + 4, tz0 - 1, 3, 1, fogged(shade(C2D_Color32(0x3A, 0xA3, 0x47, 255), dim), d), -1};
			draw_list[nd++] = (Box){d - 0.5f, tx0, ty0 + 5, tz0, 1, 1, fogged(shade(C2D_Color32(0x3A, 0xA3, 0x47, 255), dim), d), -1};
		}
	}
	for (int i = 0; i < nparts; i++) {                                                         // piezas del Studio
		const Part *o = &parts[i]; float ext = fmaxf(o->sx, fmaxf(o->sy, o->sz)) * 0.5f;
		if (!project(o->x, o->y, o->z, &sx, &sy, &d) || d > fog_far + 6 + ext) continue;
		draw_list[nd++] = (Box){d + 0.35f * fmaxf(o->sx, o->sz) + (o->sy <= 1.5f ? 0.5f * fmaxf(o->sx, o->sz) : 0), o->x, o->y, o->z, 0, 0, fogged(shade(o->color, dim), NIGHT_D(o->x, o->z, d)), -3, i};
	}
	if (night) {                                                                           // arboles (tronco + copa en 3 capas), fragmentos y monstruo
		static const u32 WOOD = 0xFF345E8B;
		float camx = cx_ + sinf(cam_yaw) * cosf(cam_pitch) * cam_dist, camz = cz_ + cosf(cam_yaw) * cosf(cam_pitch) * cam_dist, camy = cy_ + sinf(cam_pitch) * cam_dist;
		for (int i = 0; i < world.ntrees; i++) {
			float tx0 = world.tree[i][0] + .5f, tz0 = world.tree[i][1] + .5f; if (!project(tx0, 3.0f, tz0, &sx, &sy, &d) || d > fog_far + 8) continue;
			float de = NIGHT_D(tx0, tz0, d); int X = world.tree[i][0], Z = world.tree[i][1];
			draw_list[nd++] = (Box){d + 0.4f, X, 0, Z, 1, 3, fogged(shade(WOOD, 0.62f), de), -1};
			if (camy < 8.0f) {                                                                       // la copa no tapa la camara ni al jugador
				float sx_ = px - camx, sz_ = pz - camz, l2 = sx_ * sx_ + sz_ * sz_ + 1e-4f, t = ((tx0 - camx) * sx_ + (tz0 - camz) * sz_) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
				if (hypotf(tx0 - (camx + sx_ * t), tz0 - (camz + sz_ * t)) < 3.6f) continue;
			}
			draw_list[nd++] = (Box){d, X - 2, 3, Z - 2, 5, 1, fogged(shade(0xFF3F8F2F, 0.5f), de), -1};
			draw_list[nd++] = (Box){d - 0.2f, X - 1, 4, Z - 1, 3, 1, fogged(shade(0xFF47A33A, 0.5f), de), -1};
			draw_list[nd++] = (Box){d - 0.4f, X, 5, Z, 1, 1, fogged(shade(0xFF47A33A, 0.5f), de), -1};
		}
		for (int i = 0; i < world.norbs; i++) if (!hr.got[i] && project(world.orb[i][0], world.orb[i][1] + 0.3f, world.orb[i][2], &sx, &sy, &d))
			draw_list[nd++] = (Box){d - 0.5f, world.orb[i][0] - 0.25f, world.orb[i][1] + 0.1f + 0.12f * sinf(now / 400.0f + i), world.orb[i][2] - 0.25f, 0.5f, 0.5f, 0, -10 - i};
		if (project(hr.mx, 1.5f, hr.mz, &sx, &sy, &d)) draw_list[nd++] = (Box){d, hr.mx - 0.45f, 0, hr.mz - 0.45f, 0.9f, 3.0f, 0, -2};
	}
	if (project(px, py + .9f, pz, &sx, &sy, &d)) draw_list[nd++] = (Box){d, px, py, pz, 0, 0, 0, 0};
	add_pet(&nd, g_my_hat, px, py, pz, self_yaw, now / 1000.0f, 0);
	trail_update(0, g_my_hat, px, py, pz, now); trail_add(&nd, 0, now); fx_add(&nd);
	for (int i = 0; i < nr; i++) if (project(rem[i].x, rem[i].y + .9f, rem[i].z, &sx, &sy, &d))
		draw_list[nd++] = (Box){d, rem[i].x, rem[i].y, rem[i].z, 0, 0, 0, 1 + i};
	for (int i = 0; i < nr; i++) add_pet(&nd, rem[i].hat, rem[i].x, rem[i].y, rem[i].z, rem[i].ry, now / 1000.0f, i + 1);
	for (int i = 0; i < nr && i < MAX_PLAYERS; i++) { trail_update(i + 1, rem[i].hat, rem[i].x, rem[i].y, rem[i].z, now); trail_add(&nd, i + 1, now); }
	qsort(draw_list, nd, sizeof(Box), cmp_box);

	ui_frame_begin();
	C3D_FrameBegin(C3D_FRAME_SYNCDRAW);
	C2D_TargetClear(top, C2D_Color32(SKY_R, SKY_G, SKY_B, 255));
	C2D_SceneBegin(top);
	if (night) { u32 t0 = C2D_Color32(0x02, 0x03, 0x0A, 255), t1 = C2D_Color32(0x0C, 0x14, 0x26, 255); C2D_DrawRectangle(0, 0, 0, 400, 150, t0, t0, t1, t1); }
	else C2D_DrawRectangle(0, 0, 0, 400, 150, C2D_Color32((u8)skt[0], (u8)skt[1], (u8)skt[2], 255), C2D_Color32((u8)skt[0], (u8)skt[1], (u8)skt[2], 255), C2D_Color32(SKY_R, SKY_G, SKY_B, 255), C2D_Color32(SKY_R, SKY_G, SKY_B, 255));   // cielo
	if (starry) {                                                                           // luna y estrellas que giran con la camara
		float yawo = cam_yaw * 90.0f, mxp = fmodf(250 - yawo + 4000.0f, 560.0f) - 80;
		C2D_DrawEllipseSolid(mxp - 16, 20, 0, 32, 32, C2D_Color32(0xBF, 0xD0, 0xF0, 40)); C2D_DrawEllipseSolid(mxp - 9, 27, 0, 18, 18, C2D_Color32(0xE8, 0xEE, 0xFF, 255));
		for (int i = 0; i < 40; i++) { unsigned h = (unsigned)i * 2654435761u; float x = fmodf((h >> 8 & 1023) * 0.55f - yawo * 1.2f + 4000.0f, 400.0f), y = (h >> 18 & 255) * 0.45f; C2D_DrawRectSolid(x, y, 0, 1.5f, 1.5f, C2D_Color32(255, 255, 255, 150 + (h & 63))); }
	}
	// Sol y nubes que se desplazan con el viento y con el giro de la cámara (parallax)
	if (!starry) {
		float t = (now - t_start) / 1000.0f, yawo = cam_yaw * 90.0f;
		float sxp = fmodf(300 - yawo + 4000.0f, 560.0f) - 80;
		C2D_DrawEllipseSolid(sxp - 22, 18, 0, 44, 44, C2D_Color32(0xFF, 0xF1, 0xB0, 90)); C2D_DrawEllipseSolid(sxp - 14, 26, 0, 28, 28, C2D_Color32(0xFF, 0xF6, 0xC8, 255));
		static const float cl[6][3] = {{40, 30, 1.0f}, {160, 62, 0.8f}, {250, 22, 1.2f}, {330, 55, 0.9f}, {90, 80, 0.7f}, {420, 40, 1.1f}};
		for (int i = 0; i < 6; i++) {
			float x = fmodf(cl[i][0] + t * (2.0f + i) - yawo * (0.6f + 0.1f * i) + 6000.0f, 560.0f) - 80, w = 70 * cl[i][2], h = 16 * cl[i][2], y = cl[i][1];
			u32 c = C2D_Color32(255, 255, 255, 215);
			C2D_DrawEllipseSolid(x, y, 0, w, h, c); C2D_DrawEllipseSolid(x + w * 0.22f, y - h * 0.5f, 0, w * 0.5f, h * 0.9f, c); C2D_DrawEllipseSolid(x + w * 0.5f, y - h * 0.25f, 0, w * 0.4f, h * 0.8f, c);
		}
	}
	if (!starry && world.floor && world.type != 4 && world.type != 7) {                                    // colinas de fondo (no en el vacio ni en las cuevas)
		u32 far_c = world.type == 6 ? C2D_Color32(0xE6, 0xCF, 0x9E, 255) : world.type == 8 ? C2D_Color32(0xB4, 0xC4, 0xD8, 255) : C2D_Color32(0xA6, 0xD0, 0xB4, 255);
		u32 near_c = world.type == 6 ? C2D_Color32(0xD9, 0xB8, 0x7A, 255) : world.type == 8 ? C2D_Color32(0x9C, 0xAD, 0xC4, 255) : C2D_Color32(0x86, 0xBB, 0x93, 255);
		draw_hills(shade(far_c, dim), 170, 2, 22, 1.3f); draw_hills(shade(near_c, dim), 110, 0, 11, 4.1f);
	}
	// Suelo: cuadrícula alrededor del jugador (con niebla). La plaza tiene su propio suelo de piedra a 1 bloque de altura.
	if (world.floor) {
		for (int gx = -R; gx < R; gx++) for (int gz = -R; gz < R; gz++) {
			int ax = (int)floorf(px) + gx, az = (int)floorf(pz) + gz;
			float p[4][2], dd = 0, dm = 0; bool ok = true;
			float cs4[4][2] = {{0,0},{1,0},{1,1},{0,1}};
			bool plaza = (world.type == 1 || world.type == 3) && abs(ax) <= world.plaza_n && abs(az) <= world.plaza_n; float gy = plaza ? 1.0f : 0.0f;
			for (int k = 0; k < 4; k++) { ok &= project(ax + cs4[k][0], gy, az + cs4[k][1], &p[k][0], &p[k][1], &dd); dm += dd; }
			if (!ok) continue;
			u32 base = plaza ? world_tile_color(&world, ax, az) : night ? (((ax + az) & 1) ? C2D_Color32(0x1E, 0x35, 0x25, 255) : C2D_Color32(0x1A, 0x2E, 0x21, 255)) : world.gcol[0] ? (((ax + az) & 1) ? world.gcol[0] : world.gcol[1]) : (((ax + az) & 1) ? C2D_Color32(0x5F, 0xAE, 0x5A, 255) : C2D_Color32(0x52, 0x9E, 0x4E, 255));
			if (!night && dim < 1.0f) base = shade(base, dim);
			u32 c = fogged(base, NIGHT_D(ax + .5f, az + .5f, dm / 4));
			C2D_DrawTriangle(p[0][0], p[0][1], c, p[1][0], p[1][1], c, p[2][0], p[2][1], c, 0);
			C2D_DrawTriangle(p[0][0], p[0][1], c, p[2][0], p[2][1], c, p[3][0], p[3][1], c, 0);
		}
	} else {                                                    // sin suelo (carrera, vacío): un abismo oscuro
		u32 a = C2D_Color32(0x16, 0x1B, 0x33, 255), bb = C2D_Color32(0x05, 0x07, 0x12, 255);
		C2D_DrawRectangle(0, 120, 0, 400, 120, a, a, bb, bb);
	}
	// sombras redondas bajo los jugadores
	for (int i = -1; i < nr; i++) {
		float ex = i < 0 ? px : rem[i].x, ey = i < 0 ? py : rem[i].y, ez = i < 0 ? pz : rem[i].z; float gx, gy, gd;
		if (app_opt(OPT_SHADOWS) && world.floor && !night && project(ex, floorf(ey) + 0.02f, ez, &gx, &gy, &gd) && gd < fog_far) { float r = 120.0f / (gd + 2.0f); C2D_DrawEllipseSolid(gx - r, gy - r * 0.35f, 0, r * 2, r * 0.7f, C2D_Color32(0, 0, 0, 70)); }
	}
	// citro2d tiene un límite de objetos por frame: se descartan los más lejanos
	int first = nd > cap ? nd - cap : 0;
	AvCam cam = {cx_, cy_, cz_, cam_yaw, cam_pitch, cam_dist, FOV, TOP_W / 2.0f, TOP_H / 2.0f};
	self_style = av_style(sess.username, sess.color); av_apply_loadout(&self_style, g_my_hat);
	for (int i = first; i < nd; i++) {
		const Box *b = &draw_list[i];
		if (b->av <= -10) {                                                                 // fragmento de luz: brilla aunque haya niebla
			float gx, gy, gd; if (project(b->x + 0.25f, b->y + 0.25f, b->z + 0.25f, &gx, &gy, &gd)) { float r = 260.0f / gd; C2D_DrawCircleSolid(gx, gy, 0, r * 2.2f, C2D_Color32(0x7F, 0xDC, 0xFF, 40)); C2D_DrawCircleSolid(gx, gy, 0, r * 1.3f, C2D_Color32(0x7F, 0xDC, 0xFF, 90)); }
			draw_box(b->x, b->y, b->z, 0.5f, 0.5f, C2D_Color32(0xB9, 0xF3, 0xFF, 255));
		} else if (b->av == -2) {                                                              // monstruo: alto, negro, ojos rojos
			float leg = hr.mmoving ? sinf(hr.walk_ph) * 0.25f : 0; draw_box(b->x + leg * 0.3f, 0, b->z, b->w, 1.3f, C2D_Color32(0x12, 0x14, 0x1a, 255)); draw_box(b->x, 1.3f, b->z, b->w, 1.5f, C2D_Color32(0x1a, 0x1c, 0x24, 255)); draw_box(b->x + 0.1f, 2.8f, b->z + 0.1f, 0.7f, 0.7f, C2D_Color32(0x16, 0x18, 0x20, 255));
			float ex = sinf(hr.mry), ez = cosf(hr.mry), cx = hr.mx + ex * 0.4f, cz = hr.mz + ez * 0.4f, rx = ez * 0.16f, rz = -ex * 0.16f, ax, ay, ad;
			for (int e = -1; e <= 1; e += 2) if (project(cx + rx * e, 3.12f, cz + rz * e, &ax, &ay, &ad)) C2D_DrawRectSolid(ax - 2.5f, ay - 1.5f, 0, 5, 3, C2D_Color32(0xFF, 0x2A, 0x2A, 255));
		} else if (b->av == -3) draw_part(&parts[b->pi], b->color);
		else if (b->av < 0) draw_box(b->x, b->y, b->z, b->w, b->h, b->color);
		else if (b->av == 0) av_draw(&cam, px, py, pz, self_yaw, &self_style, &pose_self, fog_near, fog_far);       // avatares 3D (modelo con partes)
		else { int j = b->av - 1; rem_style[j] = av_style(rem[j].name, rem[j].color); av_apply_loadout(&rem_style[j], rem[j].hat); av_draw(&cam, rem[j].x, rem[j].y, rem[j].z, rem[j].ry, &rem_style[j], &rem_pose[j], fog_near, fog_far); }
	}
	// contorno: blanco = lo que romperá Y; del color elegido = dónde pondrá X
	if (!app_opt(OPT_OUTLINE)) {}
	else if (can_build && break_y >= 0) draw_outline(tx, break_y, tz, C2D_Color32(255, 255, 255, 255));
	else if (can_build && place_y >= 0 && !overlap) draw_outline(tx, place_y, tz, PALETTE[kind]);
	// nombres sobre los jugadores
	for (int i = 0; i < nr && app_opt(OPT_NAMETAGS); i++) if (project(rem[i].x, rem[i].y + 2.05f, rem[i].z, &sx, &sy, &d) && d < 26) {
		float naf = d < 14 ? 255.0f : 255.0f * (26 - d) / 12 + 20; u8 na = (u8)(naf > 255 ? 255 : naf);                                       // el nombre se desvanece con la distancia
		ui_text(sx + 1, sy - 11, 0.34f, C2D_Color32(0, 0, 0, na * 200 / 255), C2D_AlignCenter, rem[i].name);
		ui_text(sx, sy - 12, 0.34f, C2D_Color32(255, 255, 255, na), C2D_AlignCenter, rem[i].name);
	}
	for (int b = 0; b < 8; b++) if (app_opt(OPT_BUBBLES) && bubbles[b].until > now && bubbles[b].name[0]) {              // globos de chat sobre quien habla
		float bx = 0, by = 0, bz = 0; bool have = false;
		if (!strcmp(bubbles[b].name, sess.username)) { bx = px; by = py; bz = pz; have = true; }
		else for (int i = 0; i < nr; i++) if (!strcmp(rem[i].name, bubbles[b].name)) { bx = rem[i].x; by = rem[i].y; bz = rem[i].z; have = true; break; }
		float gx, gy, gd; if (!have || !project(bx, by + 2.05f, bz, &gx, &gy, &gd) || gd > 30) continue;
		float tw = ui_text_width(bubbles[b].text, 0.34f) + 12; ui_rrect(gx - tw / 2, gy - 34, tw, 16, 7, C2D_Color32(255, 255, 255, 235)); ui_text(gx, gy - 33, 0.34f, C2D_Color32(0x20, 0x22, 0x28, 255), C2D_AlignCenter, bubbles[b].text);
	}
	// ---- HUD ----
	for (int i = 0; i < nuitexts && !photo_mode; i++) {                                         // textos del Studio: {players} {name} {game} {time}
		const UiText *o = &uitexts[i]; char out[160]; ui_format(o->text, out, sizeof out, nr + 1, sess.username, cur_game.name, (unsigned)((now - t_start) / 1000));
		float sc = o->size / 28.0f * 0.42f; if (sc < 0.3f) sc = 0.3f; if (sc > 1.0f) sc = 1.0f;
		float tx_ = o->x * 4.0f, ty_ = o->y * 2.4f; ui_text(tx_ + 1, ty_ + 1, sc, C2D_Color32(0, 0, 0, 200), 0, out); ui_text(tx_, ty_, sc, o->color, 0, out);
	}
	if (app_coords_on()) { char cb[48]; snprintf(cb, sizeof cb, "%.1f  %.1f  %.1f  (%.0f m)", px, py, pz, hypotf(px - world.spawn[0], pz - world.spawn[2])); ui_text(392, 38, 0.34f, COL_TEXT, C2D_AlignRight, cb); }
	if (app_fps_on() && g_ft_avg > 1) { char fp[24]; int fv = (int)(1000.0f / g_ft_avg + 0.5f); snprintf(fp, sizeof fp, "%d FPS", fv); ui_text(392, 226, 0.34f, fv >= 24 ? C2D_Color32(0x7A, 0xE0, 0x7A, 255) : fv >= 15 ? C2D_Color32(0xFF, 0xD3, 0x4D, 255) : C2D_Color32(0xFF, 0x6B, 0x6B, 255), C2D_AlignRight, fp); }
	if (app_opt(OPT_TIMER) && g_game_start) { unsigned sec = (unsigned)((now - g_game_start) / 1000); char tb[24]; snprintf(tb, sizeof tb, "%u:%02u:%02u", sec / 3600, sec / 60 % 60, sec % 60); ui_text(392, 214, 0.34f, COL_MUTED, C2D_AlignRight, tb); }
	if (app_opt(OPT_WIFI)) { int ws = osGetWifiStrength(); for (int b = 0; b < 3; b++) ui_rect(8 + b * 5, 38 - b * 3 - 3 + 6, 3, 3 + b * 3, b < ws ? C2D_Color32(0x7A, 0xE0, 0x7A, 255) : C2D_Color32(255, 255, 255, 60)); }
	if (app_opt(OPT_CLOCK)) { time_t tt = time(NULL); struct tm *lt = localtime(&tt); if (lt) { char cl[16]; snprintf(cl, sizeof cl, "%02d:%02d", lt->tm_hour, lt->tm_min); ui_text(30, 33, 0.34f, COL_MUTED, 0, cl); } }
	if (app_opt(OPT_BLOCKCNT)) { char bc[40]; snprintf(bc, sizeof bc, "%s %ld", app_lang() == 1 ? "Placed" : app_lang() == 2 ? "Postos" : "Puestos", g_placed_total); ui_text(392, 202, 0.34f, COL_MUTED, C2D_AlignRight, bc); }
	if (toast_until > now && toast_txt[0]) { float tw = ui_text_width(toast_txt, 0.4f) + 20; ui_rrect(200 - tw / 2, 150, tw, 20, 8, C2D_Color32(0, 0, 0, 160)); ui_text(200, 152, 0.4f, COL_TEXT, C2D_AlignCenter, toast_txt); }
	if (night) {                                                                              // sombra de miedo cuando el monstruo esta cerca
		float fear = hr.stun > 0 ? 0.8f : fmaxf(0, 1 - hr.dist / 22); int a = (int)(fear * 80);
		if (a > 4) { ui_rect(0, 0, 400, 240, C2D_Color32(0x60, 0, 0, a / 2)); ui_rect(0, 0, 40, 240, C2D_Color32(0x40, 0, 0, a)); ui_rect(360, 0, 40, 240, C2D_Color32(0x40, 0, 0, a)); ui_rect(0, 0, 400, 24, C2D_Color32(0x40, 0, 0, a)); ui_rect(0, 216, 400, 24, C2D_Color32(0x40, 0, 0, a)); }
		char hb[64]; snprintf(hb, sizeof hb, "Fragmentos %d/%d   Linterna %s (X)", hr.ngot, world.norbs, hr.flash ? "ON" : "OFF");
		float w = ui_text_width(hb, 0.42f) + 18; ui_rrect(8, 8, w, 22, 8, C2D_Color32(0, 0, 0, 150)); ui_text(8 + w / 2, 11, 0.42f, COL_TEXT, C2D_AlignCenter, hb);
	} else if (can_build) {
		char hb[40]; snprintf(hb, sizeof hb, "%d/%d  %s", kind + 1, NPALETTE, blk_name(kind));                  // bloque elegido: debajo de la brujula (antes se pisaban)
		float hw = ui_text_width(hb, 0.4f) + 46; int hy = app_opt(OPT_COMPASS) ? 32 : 8;
		ui_rrect(8, hy, hw, 24, 8, C2D_Color32(0, 0, 0, 130));
		ui_rrect(13, hy + 3, 22, 18, 5, PALETTE[kind]);
		ui_text(41, hy + 4, 0.4f, COL_TEXT, 0, hb);
	}
	if (g_weather) {                                                           // lluvia o nieve (clima del juego), partículas deterministas
		float tw = (now - t_start) / 1000.0f;
		for (int i = 0; i < (g_weather == 1 ? 70 : 50); i++) {
			unsigned h = (unsigned)(i + 1) * 2654435761u; float bx = (h >> 6 & 1023) * 0.39f, by = (h >> 16 & 255) * 0.94f;
			if (g_weather == 1) { float x = fmodf(bx + tw * 20 + 400, 400), y = fmodf(by + tw * (260 + (i % 5) * 20), 240); C2D_DrawRectSolid(x, y, 0, 1.2f, 7, C2D_Color32(0xB4, 0xD2, 0xFF, 170)); }
			else { float x = fmodf(bx + sinf(tw * 1.3f + i) * 14 + 400, 400), y = fmodf(by + tw * (38 + (i % 4) * 9), 240); C2D_DrawRectSolid(x, y, 0, 2.4f, 2.4f, C2D_Color32(255, 255, 255, 220)); }
		}
	}
	for (int i = 0; i < 10; i++) if (puff[i].life > 0) {                       // polvo de los pasos
		float sx2, sy2, d2; if (!project(puff[i].x, puff[i].y, puff[i].z, &sx2, &sy2, &d2)) continue;
		float k2 = puff[i].life / 0.5f, r2 = (1 - k2) * 7 + 2; C2D_DrawEllipseSolid(sx2 - r2, sy2 - r2 * 0.5f, 0, r2 * 2, r2, C2D_Color32(0xE6, 0xE6, 0xE6, (u8)(150 * k2)));
	}
	if (!photo_mode) {
	if (app_opt(OPT_COMPASS)) {                                                 // brujula: rumbo de la camara con N E S O
		float hd = fmodf(-cam_yaw * 180.0f / (float)M_PI + 3600.0f, 360.0f); static const char *const CL[8] = {"N", "NE", "E", "SE", "S", "SO", "O", "NO"};
		ui_rrect(8, 8, 150, 20, 8, C2D_Color32(0, 0, 0, 130));
		for (int k = -3; k <= 3; k++) { float a = floorf(hd / 45.0f + 0.5f) * 45.0f + k * 45.0f, off = a - hd, x = 83 + off * 0.55f; if (x < 14 || x > 152) continue; int idx = ((int)roundf(a / 45.0f) % 8 + 8) % 8; ui_text(x, 11, 0.4f, idx == 0 ? C2D_Color32(0xFF, 0x6B, 0x6B, 255) : COL_TEXT, C2D_AlignCenter, CL[idx]); }
		ui_rect(83, 8, 2, 4, C2D_Color32(0xFF, 0xD3, 0x4D, 255));
	}
	char pc[32]; if (g_ping > 0) snprintf(pc, sizeof pc, "%d jugando  %d ms", nr + 1, g_ping); else snprintf(pc, sizeof pc, "%d jugando", nr + 1);
	if (app_opt(OPT_PILL)) { float pw = ui_text_width(pc, 0.4f) + 16; ui_rrect(392 - pw, 8, pw, 22, 8, C2D_Color32(0, 0, 0, 130)); ui_text(392 - pw / 2, 11, 0.4f, g_ping > 0 && g_ping > 400 ? C2D_Color32(0xFF, 0x6B, 0x6B, 255) : g_ping > 200 ? C2D_Color32(0xFF, 0xD3, 0x4D, 255) : COL_TEXT, C2D_AlignCenter, pc); }
	if (nr > 0 && app_radar_on()) {                                                               // radar: jugadores cercanos (arriba = hacia donde mira la camara)
		static const float RR[3] = {12, 24, 48}; const float cx = 364, cy = 64, rr = 30, range = RR[app_opt(OPT_RADARR) % 3];
		C2D_DrawCircleSolid(cx, cy, 0, rr + 2, C2D_Color32(0, 0, 0, 90)); C2D_DrawCircleSolid(cx, cy, 0, rr, C2D_Color32(20, 28, 48, 120));
		ui_rect(cx - 0.5f, cy - rr + 3, 1, rr * 2 - 6, C2D_Color32(255, 255, 255, 28)); ui_rect(cx - rr + 3, cy - 0.5f, rr * 2 - 6, 1, C2D_Color32(255, 255, 255, 28));
		float fdx2 = -sinf(cam_yaw), fdz2 = -cosf(cam_yaw);
		for (int i = 0; i < nr && i < MAX_PLAYERS; i++) {
			float dx = rem[i].x - px, dz = rem[i].z - pz, fw = dx * fdx2 + dz * fdz2, rt = dx * -fdz2 + dz * fdx2, dist = hypotf(fw, rt);
			if (dist > range) { fw *= range / dist; rt *= range / dist; }
			float ex = cx + rt / range * (rr - 4), ey = cy - fw / range * (rr - 4);
			C2D_DrawCircleSolid(ex, ey, 0, 3.4f, rem[i].is3ds ? C2D_Color32(0xE6, 0x00, 0x12, 255) : C2D_Color32(0, 0, 0, 160)); C2D_DrawCircleSolid(ex, ey, 0, 2.4f, rem[i].color | 0xFF000000u);       // aro rojo = jugador de 3DS
		}
		ui_text(cx + sinf(cam_yaw) * (rr - 1) - 2.5f, cy - cosf(cam_yaw) * (rr - 1) - 5, 0.28f, C2D_Color32(0xFF, 0x6B, 0x6B, 255), 0, "N");                      // el norte gira con la camara
		C2D_DrawTriangle(cx, cy - 4.5f, C2D_Color32(0xFF, 0xD3, 0x4D, 255), cx - 3.2f, cy + 3, C2D_Color32(0xFF, 0xD3, 0x4D, 255), cx + 3.2f, cy + 3, C2D_Color32(0xFF, 0xD3, 0x4D, 255), 0);
	}
	int shown = 0; for (int i = 0; i < 4; i++) if (chat[i].until > now) shown++;
	for (int i = 0, row = 0; i < 4; i++) if (chat[i].until > now) {          // chat reciente, abajo a la izquierda
		char line[140]; snprintf(line, sizeof line, "%s: %s", chat[i].name, chat[i].text);
		float lw = ui_text_width(line, 0.38f) + 12; if (lw > 300) lw = 300;
		float y = 236 - (shown - row) * 17; ui_rrect(6, y, lw, 15, 6, C2D_Color32(0, 0, 0, 140));
		char fit[140]; snprintf(fit, sizeof fit, "%s", line); while (strlen(fit) > 4 && ui_text_width(fit, 0.38f) > lw - 10) fit[strlen(fit) - 1] = 0;
		ui_text(12, y, 0.38f, COL_TEXT, 0, fit); row++;
	}
	if (world.has_fin && g_ntop > 0) {                                         // top de tiempos de la carrera
		TopTime tt[5]; int tn; LightLock_Lock(&lock); tn = g_ntop; memcpy(tt, g_top, sizeof tt); LightLock_Unlock(&lock);
		ui_rrect(292, 34, 100, 14 + tn * 14, 8, C2D_Color32(0, 0, 0, 130)); ui_text(342, 36, 0.34f, COL_MUTED, C2D_AlignCenter, "TOP");
		for (int i = 0; i < tn; i++) { char l[48], nm[24]; snprintf(nm, sizeof nm, "%.9s", tt[i].name); snprintf(l, sizeof l, "%d %s %u:%05.2f", i + 1, nm, tt[i].ms / 60000, (tt[i].ms % 60000) / 1000.0f); ui_text(298, 48 + i * 14, 0.32f, COL_TEXT, 0, l); }
	}
	if (race.start && !race.done) {                                            // cronómetro de la carrera
		unsigned ms = (unsigned)(now - race.start); char tb[24]; snprintf(tb, sizeof tb, "%u:%05.2f", ms / 60000, (ms % 60000) / 1000.0f);
		ui_rrect(170, 8, 60, 20, 8, C2D_Color32(0, 0, 0, 140)); ui_text(200, 10, 0.42f, COL_TEXT, C2D_AlignCenter, tb);
	}
	if (big_until > now && big_msg[0]) {                                       // mensaje grande
		float bw = ui_text_width(big_msg, 0.8f) + 30; ui_rrect(200 - bw / 2, 80, bw, 36, 12, C2D_Color32(0, 0, 0, 160)); ui_text(200, 86, 0.8f, COL_TEXT, C2D_AlignCenter, big_msg);
	}
	if (game_alert_until > now && game_alert[0]) {                              // aviso de un amigo
		char al[96]; LightLock_Lock(&lock); snprintf(al, sizeof al, "%s", game_alert); LightLock_Unlock(&lock);
		float aw = ui_text_width(al, 0.4f) + 22; if (aw > 380) aw = 380;
		ui_rrect(200 - aw / 2, 40, aw, 22, 10, C2D_Color32(0x23, 0x25, 0x27, 230)); ui_rect(200 - aw / 2 + 6, 46, 3, 10, COL_ACCENT);
		char fl[96]; snprintf(fl, sizeof fl, "%s", al); while (strlen(fl) > 4 && ui_text_width(fl, 0.4f) > aw - 26) fl[strlen(fl) - 1] = 0;
		ui_text(200 - aw / 2 + 14, 43, 0.4f, COL_TEXT, 0, fl);
	}
	if (now - t_start < 9000) {                                               // ayuda de controles los primeros segundos
		ui_rrect(70, 206, 260, 22, 9, C2D_Color32(0, 0, 0, 150));
		ui_text(200, 209, 0.38f, COL_TEXT, C2D_AlignCenter, can_build ? "A saltar  B correr  X poner  Y romper  +/- color" : night ? "A saltar  B correr  X linterna  Huye del monstruo" : "A saltar  B correr  L/R camara");
	}
	}                                                                          // fin de la interfaz (se oculta en el modo foto)
	C2D_TargetClear(bot, C2D_Color32(0x23, 0x25, 0x27, 255));
	C2D_SceneBegin(bot);
	ui_game_bottom(&sess, rem, nr, kind, cur_game.name, BLOCKSY_VERSION, emote_menu, hist, nhist, hscroll, chat_view);
	C3D_FrameEnd(0);
}

// Una partida. Devuelve true para volver al lobby; false si el usuario pulsa START (salir de la app).
static bool play_game(C3D_RenderTarget *top, C3D_RenderTarget *bot) {
	LightLock_Init(&lock);
	memset(bubbles, 0, sizeof bubbles); nblocks = nremotes = qn = nchat_new = 0; pry = 0; vy = 0; grounded = false; moving = 0; running = true; want_offline = false;
	world_build(&world, cur_game.world, cur_game.seed);                         // mundo base (plaza, carrera...) igual que en la web
	g_tod = -1;
	g_skymode = !strcmp(cur_game.sky, "dawn") ? 1 : !strcmp(cur_game.sky, "sunset") ? 2 : !strcmp(cur_game.sky, "night") ? 3 : !strcmp(cur_game.sky, "space") ? 4 : 0;
	if (!cur_game.sky[0] && cur_game.hour >= 0) {                              // config.time: hora del dia (0 = sigue la hora real de la consola)
		float hh = cur_game.hour; if (hh == 0) { time_t tt = time(NULL); struct tm *lt = localtime(&tt); hh = lt ? lt->tm_hour + lt->tm_min / 60.0f : 12; }
		g_skymode = (hh < 5 || hh >= 21) ? 3 : hh < 8 ? 1 : (hh >= 17.5f ? 2 : 0); g_tod = hh;
	}
	if (cur_game.has_spawn) { world.spawn[0] = cur_game.spawn[0]; world.spawn[1] = cur_game.spawn[1]; world.spawn[2] = cur_game.spawn[2]; px = world.spawn[0]; py = world.spawn[1]; pz = world.spawn[2]; }      // config.spawn
	nparts = 0; nuitexts = 0;
	if (cur_game.id[0]) {                  // piezas creadas en el Studio de la web
		nparts = net_fetch_parts(cur_game.id, parts, MAX_PARTS, uitexts, &nuitexts);
		for (int i = 0; i < nparts; i++) if (parts[i].spawn) { world.spawn[0] = parts[i].x; world.spawn[1] = parts[i].y + parts[i].sy * 0.5f + 0.05f; world.spawn[2] = parts[i].z; break; }
	}
	px = world.spawn[0]; py = world.spawn[1]; pz = world.spawn[2]; rsp_x = px; rsp_y = py; rsp_z = pz;
	can_build = cur_game.allow_build >= 0 ? cur_game.allow_build > 0 : !strcmp(cur_game.mode, "build");   // solo los juegos de bloques dejan construir
	ui_build_ui = can_build;
	g_game_start = osGetTime(); g_placed_total = 0; undo_n = 0; g_run_tog = false; prev_n = -1; toast_until = 0; jump_v = cur_game.jump > 1 ? cur_game.jump : 8.6f; memset(&race, 0, sizeof race); big_msg[0] = 0; big_until = 0; photo_mode = false; memset(puff, 0, sizeof puff);
	if (cur_game.welcome[0]) {                                                  // mensaje de bienvenida del creador (como en la web), cortado en una palabra para que quepa
		snprintf(big_msg, sizeof big_msg, "%s", cur_game.welcome);
		if (strlen(big_msg) > 38) { size_t k = 38; while (k > 10 && big_msg[k] != ' ') k--; if (k <= 10) k = 38; while (k > 0 && ((unsigned char)big_msg[k] & 0xC0) == 0x80) k--; big_msg[k] = 0; }
		big_until = osGetTime() + 4200;
	}
	cam_yaw = 0; cam_pitch = 0.5f; cam_dist = 9; cx_ = px; cy_ = py + 1; cz_ = pz;
	audio_game(true, cur_game.track); net_set_game(cur_game.id); g_weather = !strcmp(cur_game.weather, "rain") ? 1 : !strcmp(cur_game.weather, "snow") ? 2 : 0; g_ntop = 0;
	memset(&hr, 0, sizeof hr); ev_last = -1; hr.on = world.type == 5; hr.flash = true; hr.mx = hr.mtx = world.mon_start[0]; hr.mz = hr.mtz = world.mon_start[2]; hr.dist = 99;
	if (hr.on) { snprintf(big_msg, sizeof big_msg, "Recoge %d fragmentos y huye", world.norbs); big_until = osGetTime() + 5000; }
	s32 prio = 0; svcGetThreadPriority(&prio, CUR_THREAD_HANDLE);
	Thread th = threadCreate(net_thread, NULL, 256 * 1024, prio + 1, 0, false);   // prioridad menor que la UI

	// La pila principal de la app es de solo ~32 KB: los arrays grandes van en memoria estática
	kind = 1; nl = nr = ndisp = 0; emote[0] = 0; emote_menu = false; memset(&pose_self, 0, sizeof pose_self); self_yaw = 0; strcpy(send_anim, "idle");
	pose_self.legY = 0.74f; for (int i = 0; i < MAX_PLAYERS; i++) disp_pose[i].legY = rem_pose[i].legY = 0.74f;
	bool back = true; bool chat_drag = false; int chat_drag_y = 0;
	t_start = osGetTime(); u64 t_last = t_start;
	memset(chat, 0, sizeof chat); nhist = 0; hscroll = 0; chat_view = false; game_alert[0] = 0; game_alert_until = 0;

	while (aptMainLoop()) {
		hidScanInput();
		u64 now = osGetTime();
		float dt = (now - t_last) / 1000.0f; t_last = now; if (dt < 0.001f) dt = 0.001f; if (dt > 0.05f) dt = 0.05f;   // la física sigue al tiempo real
		u32 down = hidKeysDown(), held = hidKeysHeld();
		{ static float idle_s; circlePosition ic; hidCircleRead(&ic); idle_s = (held & ~KEY_TOUCH) || abs(ic.dx) > 15 || abs(ic.dy) > 15 || (down & KEY_TOUCH) ? 0 : idle_s + dt;
		  if (app_opt(OPT_AUTOSIT) && idle_s > 45 && !emote[0] && grounded && cur_game.allow_emotes) snprintf(emote, sizeof emote, "sit"); }                // sentarse solo tras 45 s sin tocar nada
		if (down & KEY_START) { back = false; break; }

		// ---- cámara: L/R y C-stick (New 3DS / 2DS XL); D-pad arriba/abajo = zoom ----
		circlePosition cs; hidCstickRead(&cs);
		float cspd = app_opt(OPT_CAMSPD) == 0 ? 0.6f : app_opt(OPT_CAMSPD) == 2 ? 1.5f : 1.0f, cinv = app_opt(OPT_INVERT) ? -1.0f : 1.0f;      // ajustes: velocidad e inversion de la camara
		if (held & KEY_L) cam_yaw -= 2.4f * cspd * dt;
		if (held & KEY_R) cam_yaw += 2.4f * cspd * dt;
		if (abs(cs.dx) > 20) cam_yaw += cs.dx / 156.0f * 2.6f * cspd * dt;
		if (abs(cs.dy) > 20) cam_pitch = fminf(1.4f, fmaxf(0.05f, cam_pitch - cinv * cs.dy / 156.0f * 1.6f * cspd * dt));
		if (held & KEY_DUP) cam_dist = fmaxf(4, cam_dist - 6 * dt);
		if (held & KEY_DDOWN) cam_dist = fminf(20, cam_dist + 6 * dt);
		if (can_build && (down & KEY_DRIGHT)) kind = (kind + 1) % NPALETTE;
		if (can_build && (down & KEY_DLEFT)) kind = (kind + NPALETTE - 1) % NPALETTE;
		if (can_build && (down & (KEY_DRIGHT | KEY_DLEFT)) && app_opt(OPT_BLOCKNAME)) { snprintf(toast_txt, sizeof toast_txt, "%s (%d/%d)", blk_name(kind), kind + 1, NPALETTE); toast_until = now + 1100; }
		if (((held & KEY_L) && (held & KEY_R)) && (down & (KEY_L | KEY_R))) { photo_mode = !photo_mode; snprintf(big_msg, sizeof big_msg, "%s", photo_mode ? "Modo foto (L+R)" : "Modo foto off"); big_until = now + 1200; }
		{                                                                        // SELECT: toque = chat; mantener 1 s = volver al punto de inicio
			static u64 sel_at; static bool sel_used;
			if (down & KEY_SELECT) { sel_at = now; sel_used = false; }
			if (sel_used_g) { sel_used = true; sel_used_g = false; }
			if ((held & KEY_SELECT) && !sel_used && now - sel_at >= 900) { sel_used = true; px = rsp_x; py = rsp_y; pz = rsp_z; vy = 0; cx_ = px; cy_ = py + 1; cz_ = pz; snprintf(big_msg, sizeof big_msg, "Al punto de inicio"); big_until = now + 1200; }
			if ((hidKeysUp() & KEY_SELECT) && !sel_used) do_chat();
		}
		if (down & KEY_TOUCH) {
			touchPosition tp; hidTouchRead(&tp);
			int act = ui_game_touch(tp.px, tp.py, emote_menu, chat_view);
			if (can_build && act >= UI_COLOR0 && act < UI_COLOR0 + NPALETTE) kind = act;
			else if (act >= UI_EMOTE0 && act < UI_EMOTE0 + NEMOTES) { if (grounded && !moving) snprintf(emote, sizeof emote, "%s", AV_EMOTE_ID[act - UI_EMOTE0]); emote_menu = false; }
			else if (act >= UI_PHRASE0 && act < UI_PHRASE0 + NPHRASES) { if (cur_game.allow_chat) { Action pa = {.type = CHAT}; snprintf(pa.text, sizeof pa.text, "%s", UI_PHRASE[act - UI_PHRASE0]); push_action(pa); } emote_menu = false; }       // frase rapida
			else if (act == UI_EMOTE_MENU) { if (cur_game.allow_emotes) emote_menu = !emote_menu; else { snprintf(big_msg, sizeof big_msg, "Los emotes estan desactivados"); big_until = now + 2000; } }
			else if (act == UI_CHAT) do_chat();
			else if (act == UI_QUIT) break;
			else if (act == UI_TAB_PLAYERS) chat_view = false;
			else if (act == UI_TAB_CHAT) { chat_view = true; hscroll = 0; }
			else if (act == UI_CHAT_UP) { if (hscroll < nhist - 5) hscroll++; }
			else if (act == UI_CHAT_DOWN) { if (hscroll > 0) hscroll--; }
			else if (chat_view && tp.px < 256 && tp.py >= 50 && tp.py < 120) { chat_drag_y = tp.py; chat_drag = true; }
			else if (!chat_view && !emote_menu && tp.px < 200 && tp.py >= 64 && tp.py < 112 && (tp.py - 48) / 16 - 1 < nr) {       // tocar un jugador de la lista: te lleva a su lado
				int i = (tp.py - 48) / 16 - 1;
				if (hr.on || world.has_fin || race.start) { snprintf(big_msg, sizeof big_msg, "No se puede ir con alguien aqui"); big_until = now + 1800; }
				else { px = rem[i].x + 1.2f; py = rem[i].y; pz = rem[i].z; for (int k = 0; k < 4 && body_hits(px, py, pz); k++) py += 1.01f; vy = 0; cx_ = px; cy_ = py + 1; cz_ = pz; snprintf(big_msg, sizeof big_msg, "Junto a %.16s", rem[i].name); big_until = now + 1500; sfx_play(SFX_CLICK); }
			}
		}
		if (chat_drag) {                                             // arrastrar sobre el historial para desplazarlo
			if (held & KEY_TOUCH) { touchPosition tp; hidTouchRead(&tp); int dy = tp.py - chat_drag_y; if (dy > 12 && hscroll < nhist - 5) { hscroll++; chat_drag_y = tp.py; } else if (dy < -12 && hscroll > 0) { hscroll--; chat_drag_y = tp.py; } }
			else chat_drag = false;
		}

		// ---- datos de red -> copia local ----
		LightLock_Lock(&lock);
		memcpy(local, blocks, sizeof(Block) * nblocks); nl = nblocks;
		for (int i = 0; i < world.ncells && nl < MAX_LOCAL; i++) local[nl++] = world.cells[i];      // bloques fijos del mundo
		memcpy(rem, remotes, sizeof(Remote) * nremotes); nr = nremotes;
		if (prev_n >= 0) {                                                                                    // avisos: quien entra o sale de la partida
			for (int i = 0; i < nr; i++) { bool had = false; for (int j = 0; j < prev_n; j++) if (!strcmp(prev_names[j], rem[i].name)) { had = true; break; } if (!had) { snprintf(toast_txt, sizeof toast_txt, "%.20s %s", rem[i].name, app_lang() == 1 ? "joined" : app_lang() == 2 ? "entrou" : "entro"); toast_until = now + 2200; } }
			for (int j = 0; j < prev_n; j++) { bool still = false; for (int i = 0; i < nr; i++) if (!strcmp(prev_names[j], rem[i].name)) { still = true; break; } if (!still) { snprintf(toast_txt, sizeof toast_txt, "%.20s %s", prev_names[j], app_lang() == 1 ? "left" : app_lang() == 2 ? "saiu" : "salio"); toast_until = now + 2200; } }
		}
		prev_n = nr < MAX_PLAYERS ? nr : MAX_PLAYERS; for (int i = 0; i < prev_n; i++) snprintf(prev_names[i], sizeof prev_names[i], "%s", rem[i].name);
		if (nchat_new && app_opt(OPT_CHATSND)) sfx_play(SFX_NOTIFY);
		for (int i = 0; i < nchat_new; i++) {                       // mensajes nuevos -> lista visible 10 s
			{ int slot = -1, oldest = 0; for (int b = 0; b < 8; b++) { if (!strcmp(bubbles[b].name, chat_new[i].name)) { slot = b; break; } if (bubbles[b].until < bubbles[oldest].until) oldest = b; } if (slot < 0) slot = oldest;
			  snprintf(bubbles[slot].name, sizeof bubbles[slot].name, "%s", chat_new[i].name); snprintf(bubbles[slot].text, sizeof bubbles[slot].text, "%s", chat_new[i].text); if (strlen(chat_new[i].text) > 40) { bubbles[slot].text[38] = '.'; bubbles[slot].text[39] = '.'; bubbles[slot].text[40] = 0; } bubbles[slot].until = now + 5000; }
			memmove(&chat[0], &chat[1], sizeof chat[0] * 3);
			snprintf(chat[3].name, sizeof chat[3].name, "%s", chat_new[i].name); snprintf(chat[3].text, sizeof chat[3].text, "%s", chat_new[i].text); chat[3].until = now + 10000;
			if (nhist == 120) { memmove(&hist[0], &hist[1], sizeof hist[0] * 119); nhist = 119; }
			snprintf(hist[nhist].name, sizeof hist[nhist].name, "%s", chat_new[i].name); snprintf(hist[nhist].text, sizeof hist[nhist].text, "%s", chat_new[i].text); nhist++; if (hscroll > 0 && hscroll < nhist - 5) hscroll++;
		}
		nchat_new = 0;
		LightLock_Unlock(&lock);
		ht_build(local, nl); local_blocks = local;

		// Interpola posición y giro de los otros jugadores entre actualizaciones de red (~10 Hz) y anima sus avatares
		for (int i = 0; i < nr; i++) {
			int j = 0; while (j < ndisp && strcmp(disp[j].id, rem[i].id)) j++;
			if (j == ndisp && ndisp < MAX_PLAYERS) { disp[ndisp] = rem[i]; memset(&disp_pose[ndisp], 0, sizeof(AvPose)); disp_pose[ndisp].legY = 0.74f; ndisp++; continue; }
			if (j == ndisp) continue;
			float k = fminf(1, dt * 12), x = disp[j].x, y = disp[j].y, z = disp[j].z, a0 = disp[j].ry;
			disp[j] = rem[i];
			disp[j].x = x + (rem[i].x - x) * k; disp[j].y = y + (rem[i].y - y) * k; disp[j].z = z + (rem[i].z - z) * k;
			float dyaw = fmodf(rem[i].ry - a0 + 3 * (float)M_PI, 2 * (float)M_PI) - (float)M_PI; disp[j].ry = a0 + dyaw * k;
			rem[i] = disp[j];
		}
		{ int k = 0; for (int j = 0; j < ndisp; j++) { int keep = 0; for (int i = 0; i < nr; i++) if (!strcmp(disp[j].id, rem[i].id)) keep = 1; if (keep) { disp[k] = disp[j]; disp_pose[k] = disp_pose[j]; k++; } } ndisp = k; }
		{ float tt = now / 1000.0f; for (int i = 0; i < nr; i++) for (int j = 0; j < ndisp; j++) if (!strcmp(disp[j].id, rem[i].id)) { av_pose_update(&disp_pose[j], rem[i].anim, dt, tt); rem_pose[i] = disp_pose[j]; break; } }

		// ---- movimiento: relativo a la cámara; B = correr; sube escalones de 1 bloque solo ----
		circlePosition cp; hidCircleRead(&cp);
		float f = (abs(cp.dy) > 15 ? cp.dy : 0) / 156.0f, s = (abs(cp.dx) > 15 ? cp.dx : 0) / 156.0f;
		float mag = fminf(1, sqrtf(f * f + s * s));
		float mx = -sinf(cam_yaw) * f + cosf(cam_yaw) * s;
		float mz = -cosf(cam_yaw) * f - sinf(cam_yaw) * s;
		float len = sqrtf(mx * mx + mz * mz);
		if (len > 0.001f) { mx /= len; mz /= len; }
		if (app_opt(OPT_RUNTOGGLE) && (down & KEY_B)) g_run_tog = !g_run_tog; bool run_now = app_opt(OPT_RUNTOGGLE) ? g_run_tog : (held & KEY_B) != 0;
		float speed = (run_now ? 9.0f : 6.0f) * (cur_game.speed > 0.5f ? cur_game.speed / 6.0f : 1.0f) * mag * (hr.on && hr.stun > 0 ? 0 : 1);
		moving = mag > 0.05f;
		if (moving) pry = atan2f(mx, mz);
		float nx = px + mx * speed * dt, nz = pz + mz * speed * dt;
		if (!body_hits(nx, py, pz)) px = nx;
		else if (grounded && !body_hits(nx, py + 1.01f, pz)) { px = nx; py += 1.01f; }
		if (!body_hits(px, py, nz)) pz = nz;
		else if (grounded && !body_hits(px, py + 1.01f, nz)) { pz = nz; py += 1.01f; }
		{ static float step_t; step_t -= dt; if (moving && grounded && step_t <= 0) { step_t = run_now ? 0.24f : 0.36f; if (app_opt(OPT_STEPSND)) sfx_play(SFX_STEP); } }
		if (app_steps_on()) {                                                  // polvo al caminar (cada 0.28 s)
			for (int i = 0; i < 10; i++) if (puff[i].life > 0) puff[i].life -= dt;
			puff_t -= dt; if (moving && grounded && puff_t <= 0) { puff_t = run_now ? 0.18f : 0.28f; for (int i = 0; i < 10; i++) if (puff[i].life <= 0) { puff[i].x = px; puff[i].y = py + 0.05f; puff[i].z = pz; puff[i].life = 0.5f; break; } }
		}
		if (grounded) jumps_left = 1;
		if ((down & KEY_A) && grounded) { vy = jump_v; grounded = false; sfx_play(SFX_JUMP); }
		else if ((down & KEY_A) && cur_game.double_jump && jumps_left > 0) { jumps_left--; vy = jump_v * 0.9f; sfx_play(SFX_JUMP); }       // salto doble (config.double_jump)
		vy -= (cur_game.gravity > 1 ? cur_game.gravity : 24) * dt; float ny = py + vy * dt; grounded = false;
		if (body_hits(px, ny, pz)) { if (vy < -9.0f) { fx_burst(px, py + 0.1f, pz, C2D_Color32(0xD8, 0xD8, 0xD0, 255), 6, 2.2f); sfx_play(SFX_LAND); } if (vy < 0) grounded = true; vy = 0; }
		else py = ny;
		fx_step(dt); if (cur_game.hour == 0 && g_tod >= 0) { g_tod += dt / 3600.0f; if (g_tod >= 24) g_tod -= 24; }
		if (world.floor && py < 0) { if (vy < -9.0f) { fx_burst(px, 0.1f, pz, C2D_Color32(0xD8, 0xD8, 0xD0, 255), 6, 2.2f); sfx_play(SFX_LAND); } py = 0; vy = 0; grounded = true; }
		if (!world.floor && py < world.void_y) {                              // caíste al vacío: vuelves al último punto de control
			px = rsp_x; py = rsp_y; pz = rsp_z; vy = 0; cx_ = px; cy_ = py + 1; cz_ = pz;
			snprintf(big_msg, sizeof big_msg, "Has caido"); big_until = now + 1200;
		}
		{ char tn[64]; if (audio_take_note(tn, sizeof tn)) { snprintf(big_msg, sizeof big_msg, "Musica: %.40s", tn); big_until = now + 3000; } }
		if (race_rank > 0 && race.done) { int rk = race_rank; race_rank = 0; snprintf(big_msg, sizeof big_msg, "Puesto %d en el top", rk); big_until = now + 4000; }
		if (world.ncp || world.has_fin) {                                      // carrera: cronómetro, puntos de control y meta
			if (!race.start && moving) race.start = now;
			for (int i = 0; i < world.ncp; i++) if (world.cp[i].id > race.cp && hypotf(px - world.cp[i].x, pz - world.cp[i].z) < 2.2f && fabsf(py - world.cp[i].y) < 2.5f) {
				race.cp = world.cp[i].id; rsp_x = world.cp[i].x; rsp_y = world.cp[i].y; rsp_z = world.cp[i].z; snprintf(big_msg, sizeof big_msg, "Punto de control %d", race.cp); big_until = now + 1400; sfx_play(SFX_CHECKPOINT);
			}
			if (world.has_fin && !race.done && hypotf(px - world.fin[0], pz - world.fin[2]) < world.fin_r && fabsf(py - world.fin[1]) < 3) {
				race.done = true; sfx_play(SFX_WIN); unsigned ms = (unsigned)(now - (race.start ? race.start : now)); if (ms >= 1500) push_action((Action){.type = TIME, .x = (int)ms}); snprintf(big_msg, sizeof big_msg, "Meta! %u:%05.2f", ms / 60000, (ms % 60000) / 1000.0f); big_until = now + 5000;
			}
			if (race.done && now > big_until - 500) { px = world.spawn[0]; py = world.spawn[1]; pz = world.spawn[2]; rsp_x = px; rsp_y = py; rsp_z = pz; vy = 0; cx_ = px; cy_ = py + 1; cz_ = pz; memset(&race, 0, sizeof race); }
		}
		if (emote[0] && (moving || !grounded)) emote[0] = 0;                 // moverte o saltar corta el emote
		{ const char *an = !grounded ? "jump" : moving ? "walk" : emote[0] ? emote : "idle"; snprintf(send_anim, sizeof send_anim, "%s", an);
		  float dyaw = fmodf(pry - self_yaw + 3 * (float)M_PI, 2 * (float)M_PI) - (float)M_PI; self_yaw += dyaw * fminf(1, dt * 14);
		  av_pose_update(&pose_self, an, dt, now / 1000.0f); }

		if (hr.on) forest_frame(dt, now, down);
		// ---- bloque al que apuntas (el de delante): X pone, Y rompe ----
		tx = (int)floorf(px + sinf(pry) * 1.1f); tz = (int)floorf(pz + cosf(pry) * 1.1f); int ty = (int)floorf(py + 0.05f);
		place_y = break_y = -1;
		for (int dy = 0; dy < 4 && place_y < 0; dy++) if (!solid_at(tx, ty + dy, tz)) place_y = ty + dy;      // primer hueco libre (apila si hay bloque)
		for (int dy = 0; dy < 3 && break_y < 0; dy++) if (breakable(tx, ty + dy, tz)) break_y = ty + dy;        // el bloque más bajo (solo los de jugadores)
		overlap = place_y >= 0 && fabsf(px - (tx + .5f)) < 0.8f && fabsf(pz - (tz + .5f)) < 0.8f && py < place_y + 1 && py + 1.8f > place_y;
		bool sel_held = (held & KEY_SELECT) != 0;                                                           // SELECT + X = elegir el bloque que apuntas; SELECT + Y = deshacer
		static u64 xh_at, yh_at, rep_at;
		if (down & KEY_X) xh_at = now; if (down & KEY_Y) yh_at = now;
		bool rep_ok = app_opt(OPT_REPEAT) && now - rep_at >= 240;                                           // mantener X o Y repite cada 0,24 s tras 0,4 s
		bool x_go = (down & KEY_X) || (rep_ok && (held & KEY_X) && now - xh_at >= 400), y_go = (down & KEY_Y) || (rep_ok && (held & KEY_Y) && now - yh_at >= 400);
		if (sel_held && (down & KEY_X) && can_build && break_y >= 0) {
			int pk = -1; LightLock_Lock(&lock); for (int i = 0; i < nblocks; i++) if (blocks[i].x == tx && blocks[i].y == break_y && blocks[i].z == tz) { pk = blocks[i].kind; break; } LightLock_Unlock(&lock);
			if (pk >= 0) { kind = pk % NPALETTE; snprintf(toast_txt, sizeof toast_txt, "%s (%d/%d)", blk_name(kind), kind + 1, NPALETTE); toast_until = now + 1100; sfx_play(SFX_CLICK); }
			x_go = y_go = false; sel_used_g = true;
		}
		if (sel_held && (down & KEY_Y) && can_build) {
			if (undo_n > 0) { Block ub = undo_stack[--undo_n]; push_action((Action){.type = BREAK, .x = ub.x, .y = ub.y, .z = ub.z}); sfx_play(SFX_BREAK);
				LightLock_Lock(&lock); for (int i = 0; i < nblocks; i++) if (blocks[i].x == ub.x && blocks[i].y == ub.y && blocks[i].z == ub.z) { fx_burst(ub.x + .5f, ub.y + .5f, ub.z + .5f, PALETTE[ub.kind % NPALETTE], 8, 2.5f); blocks[i] = blocks[--nblocks]; break; } LightLock_Unlock(&lock);
				snprintf(toast_txt, sizeof toast_txt, "%s", app_lang() == 1 ? "Undone" : app_lang() == 2 ? "Desfeito" : "Deshecho"); toast_until = now + 900; }
			x_go = y_go = false; sel_used_g = true;
		}
		if (x_go || y_go) rep_at = now;
		if (can_build && x_go && place_y >= 0 && !overlap && nblocks < MAX_BLOCKS) {
			push_action((Action){.type = PLACE, .x = tx, .y = place_y, .z = tz, .kind = kind}); sfx_play(SFX_PLACE); fx_burst(tx + .5f, place_y + .5f, tz + .5f, PALETTE[kind % NPALETTE], 6, 2.0f);
			LightLock_Lock(&lock); if (nblocks < MAX_BLOCKS) blocks[nblocks++] = (Block){tx, place_y, tz, kind}; LightLock_Unlock(&lock);
			g_placed_total++; if (undo_n == 8) { memmove(undo_stack, undo_stack + 1, sizeof(Block) * 7); undo_n = 7; } undo_stack[undo_n++] = (Block){tx, place_y, tz, kind};
		}
		if (can_build && y_go && break_y >= 0) {
			push_action((Action){.type = BREAK, .x = tx, .y = break_y, .z = tz}); sfx_play(SFX_BREAK);
			LightLock_Lock(&lock);
			for (int i = 0; i < nblocks; i++) if (blocks[i].x == tx && blocks[i].y == break_y && blocks[i].z == tz) { fx_burst(tx + .5f, break_y + .5f, tz + .5f, PALETTE[blocks[i].kind % NPALETTE], 10, 3.0f); blocks[i] = blocks[--nblocks]; break; }
			LightLock_Unlock(&lock);
		}

		// cámara suave
		float kc = fminf(1, dt * 12);
		cx_ += (px - cx_) * kc; cy_ += (py + 1 - cy_) * kc; cz_ += (pz - cz_) * kc;

		now_ms = now; render_game(top, bot);
	}

	audio_game(false, NULL);
	want_offline = !back;
	running = false;
	if (th) { threadJoin(th, U64_MAX); threadFree(th); }
	return back;
}

int main(int argc, char **argv) {
	APT_CheckNew3DS(&g_new3ds); if (g_new3ds) osSetSpeedupEnable(true);
	gfxInitDefault(); C3D_Init(C3D_DEFAULT_CMDBUF_SIZE); C2D_Init(g_new3ds ? C2D_DEFAULT_MAX_OBJECTS * 2 : C2D_DEFAULT_MAX_OBJECTS); C2D_Prepare();
	C3D_RenderTarget *top = C2D_CreateScreenTarget(GFX_TOP, GFX_LEFT);
	C3D_RenderTarget *bot = C2D_CreateScreenTarget(GFX_BOTTOM, GFX_LEFT);
	ui_init();
	update_init(BLOCKSY_VERSION, argc > 0 && argv ? argv[0] : NULL);
	{ char dg[64]; update_diag(dg, sizeof dg); blog("app start %s (%s, %s), %s", BLOCKSY_VERSION, update_is_cia() ? "cia" : "3dsx", g_new3ds ? "New 3DS" : "Old 3DS", dg); }   // versión instalada y ruta del .3dsx
	if (!net_init()) {
		ui_message(top, bot, "Sin red", "No se pudo iniciar la red.\nComprueba que el WiFi esta activado.");
		ui_exit(); C2D_Fini(); C3D_Fini(); gfxExit(); return 1;
	}
	audio_init();                                           // musica de la playlist (si hay DSP)
	bool quit = false;
	while (!quit) {
		if (!ui_login(top, bot, &sess, BLOCKSY_VERSION)) break;
		for (;;) {                                           // login -> lobby <-> juego
			AppResult r = app_lobby(top, bot, &sess, &cur_game, BLOCKSY_VERSION);
			if (r == APP_PLAY) { if (!play_game(top, bot)) { quit = true; break; } continue; }
			if (r == APP_RESTART) { update_restart(); quit = true; break; }      // tras actualizar: el sistema abre la versión nueva al salir
			if (r == APP_LOGOUT) { ui_forget_session(); memset(&sess, 0, sizeof sess); } else quit = true;
			break;
		}
	}
	audio_exit(); ui_exit(); net_exit(); C2D_Fini(); C3D_Fini(); gfxExit();
	return 0;
}

#ifdef BLOCKSY_PREVIEW
// Solo para generar capturas en el ordenador (3ds/preview): un mundo de ejemplo
static Part mkpart(float x, float y, float z, float sx, float sy, float sz, float ry, unsigned color, int shape, int collide, int spawn, int alpha, int glow) {   // solo para la vista previa
	Part p = {.x = x, .y = y, .z = z, .sx = sx, .sy = sy, .sz = sz, .ry = ry, .color = color, .shape = (unsigned char)shape, .collide = (unsigned char)collide, .spawn = (unsigned char)spawn, .alpha = (unsigned char)alpha, .glow = (unsigned char)glow};
	p.cs = cosf(ry); p.sn = sinf(ry); p.rad = 0.5f * hypotf(sx, sz) + 0.4f; return p;
}
void game_preview(C3D_RenderTarget *top, C3D_RenderTarget *bot) {
	{ const char *pw = getenv("BLOCKSY_PREVIEW_WORLD"); world_build(&world, pw ? pw : "", 0); can_build = true; ui_build_ui = true; }
	snprintf(sess.username, sizeof sess.username, "IkerPlays"); sess.color = 0xFF439FFF; snprintf(cur_game.name, sizeof cur_game.name, "Spawn Plaza");
	nl = 0;
	{ const char *sk = getenv("BLOCKSY_PREVIEW_SKY"); g_skymode = sk ? atoi(sk) : 0; } { const char *td = getenv("BLOCKSY_PREVIEW_TOD"); g_tod = td ? (float)atof(td) : -1; }
	if (getenv("BLOCKSY_PREVIEW_PARTS")) snprintf(g_my_hat, sizeof g_my_hat, "hat_cap||||pet_slime|");
	if (getenv("BLOCKSY_PREVIEW_PARTS")) { snprintf(bubbles[0].name, sizeof bubbles[0].name, "%s", sess.username); snprintf(bubbles[0].text, sizeof bubbles[0].text, "Hola a todos!"); bubbles[0].until = 25000; }
	nparts = 0;
	if (getenv("BLOCKSY_PREVIEW_PARTS")) {                                                  // piezas de ejemplo del Studio
		Part d[] = {mkpart(4, 0.5f, 2, 4, 1, 4, 0.5f, 0xFF3C9FFF, 0, 1, 0, 255, 0), mkpart(-3, 1.5f, 4, 2, 3, 2, 0, 0xFF4F4FE0, 2, 1, 0, 255, 0), mkpart(0, 3.5f, -3, 3, 3, 3, 0, 0xFFFFD34D, 1, 0, 0, 255, 0), mkpart(-5, 0.25f, -2, 4, 0.5f, 4, 0.8f, 0xFF50D060, 0, 1, 1, 255, 0), mkpart(6, 2, -4, 1, 4, 6, 0.3f, 0xFFB26AE0, 0, 1, 0, 255, 0), mkpart(-7, 1, -6, 3, 2, 3, 0, 0xFFE0A030, 0, 0, 0, 110, 0), mkpart(2, 2.2f, 5, 1, 1, 1, 0, 0xFF60E8FF, 1, 0, 0, 255, 1)};
		snprintf(uitexts[0].text, sizeof uitexts[0].text, "Jugadores: {players}   {time}"); uitexts[0].x = 3; uitexts[0].y = 85; uitexts[0].size = 28; uitexts[0].color = 0xFF50E0FF; nuitexts = 1;
		memcpy(parts, d, sizeof d); nparts = (int)(sizeof d / sizeof d[0]);
		for (int i = 0; i < nparts; i++) { parts[i].cs = cosf(parts[i].ry); parts[i].sn = sinf(parts[i].ry); parts[i].rad = 0.5f * hypotf(parts[i].sx, parts[i].sz) + 0.4f; }
	}
	if (getenv("BLOCKSY_PREVIEW_WORLD")) { memset(&hr, 0, sizeof hr); hr.on = world.type == 5; hr.flash = true; hr.mx = -9; hr.mz = -7; hr.mry = 0.7f; hr.dist = 8; hr.ngot = 2; hr.got[0] = hr.got[1] = true; for (int i = 0; i < world.ncells; i++) local[nl++] = world.cells[i]; ht_build(local, nl); local_blocks = local; nr = 0; px = world.spawn[0]; py = world.spawn[1]; pz = world.spawn[2]; if (world.type == 5) { px = 3; pz = 7; hr.mx = -3; hr.mz = -1; hr.mry = 0.4f; hr.dist = 6; } pry = 0.3f; cam_yaw = 0.2f; cam_pitch = 0.45f; cam_dist = 9; cx_ = px; cy_ = py + 1; cz_ = pz; now_ms = 20000; t_start = 0; self_yaw = 0.3f; kind = 2; tx = 0; tz = 0; break_y = place_y = -1; overlap = false; pose_self.legY = 0.74f; if (getenv("BLOCKSY_PREVIEW_PARTS")) { fx_burst(px + 1.0f, py + 0.6f, pz + 0.3f, 0xFF3C9FFF, 14, 3.0f); fx_burst(px - 0.8f, py + 0.2f, pz + 0.6f, 0xFFD8D8D0, 8, 2.2f); for (int i = 0; i < 2; i++) fx_step(0.07f); }
	{ const char *ts = getenv("BLOCKSY_PREVIEW_T"); if (ts) { float t = (float)atof(ts); cam_yaw = 0.2f + t * 0.55f; cam_pitch = 0.4f + 0.12f * sinf(t * 0.8f); cam_dist = 12 - 0.8f * t; now_ms = 20000 + (int)(t * 1000); strcpy(emote, "dance"); pose_self.legY = 0.74f; for (int f = 0; f < (int)(t * 20) + 1; f++) av_pose_update(&pose_self, "dance", 0.05f, f * 0.05f); } }
	render_game(top, bot); return; }
	for (int x = -6; x <= 6; x++) for (int z = -6; z <= 6; z++) if ((x + z) % 4 == 0) local[nl++] = (Block){x, 0, z, 4};
	for (int y = 0; y < 3; y++) for (int i = -5; i <= 5; i++) { local[nl++] = (Block){i, y, -5, 1}; local[nl++] = (Block){-5, y, i, 2}; if (i % 2) local[nl++] = (Block){i, y, 5, 3}; }
	for (int y = 0; y < 5; y++) local[nl++] = (Block){4, y, 2, 5};
	local[nl++] = (Block){1, 0, 2, 0}; local[nl++] = (Block){1, 1, 2, 0}; local[nl++] = (Block){2, 0, 3, 0};
	ht_build(local, nl); local_blocks = local;
	nr = 3; memset(rem, 0, sizeof rem);
	snprintf(rem[0].name, 24, "Marta"); rem[0].x = 3; rem[0].y = 0; rem[0].z = -2; rem[0].color = 0xFF71CC2E;
	snprintf(rem[1].name, 24, "Dani"); rem[1].x = -2; rem[1].y = 0; rem[1].z = 3; rem[1].color = 0xFFB6599B; rem[1].is3ds = 1;
	snprintf(rem[2].name, 24, "Pablo"); rem[2].x = 6; rem[2].y = 0; rem[2].z = 6; rem[2].color = 0xFF129CF3;
	strcpy(rem[0].anim, "wave"); strcpy(rem[1].anim, "dance"); strcpy(rem[2].anim, "walk"); rem[0].ry = 2.4f; rem[1].ry = -0.8f; rem[2].ry = 3.6f;
	strcpy(emote, "cheer"); emote_menu = false;
	pose_self.legY = 0.74f; for (int i = 0; i < 3; i++) rem_pose[i].legY = 0.74f;
	for (int f = 0; f < 40; f++) { av_pose_update(&pose_self, "cheer", 0.05f, f * 0.05f); for (int i = 0; i < 3; i++) av_pose_update(&rem_pose[i], rem[i].anim, 0.05f, f * 0.05f); }
	self_yaw = 0.7f;
	px = 0.5f; py = 0; pz = 0.5f; pry = 0.7f; cam_yaw = 0.35f; cam_pitch = 0.5f; cam_dist = 8; cx_ = px; cy_ = py + 1; cz_ = pz;
	tx = 1; tz = 1; break_y = -1; place_y = 0; overlap = false; kind = 2;
	now_ms = 20000; t_start = 0;
	snprintf(chat[2].name, 24, "Marta"); snprintf(chat[2].text, 100, "hola!! mira mi torre"); chat[2].until = 30000;
	snprintf(chat[3].name, 24, "Dani"); snprintf(chat[3].text, 100, "voy a verla"); chat[3].until = 30000;
	render_game(top, bot);
}
#endif
