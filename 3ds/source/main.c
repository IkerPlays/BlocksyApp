// Blocksy para Nintendo 3DS: mundo de bloques multijugador (comparte servidor con la web).
#include <3ds.h>
#include <citro2d.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "net.h"
#include "ui.h"
#include "app.h"
#include "update.h"
#include "avatar3d.h"
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
static Block blocks[MAX_BLOCKS]; static int nblocks;
static Remote remotes[MAX_PLAYERS]; static int nremotes;
static ChatMsg chat_new[8]; static int nchat_new;          // mensajes nuevos que la interfaz todavía no ha mostrado
static volatile bool running = true;
static float px = 0.5f, py = 3, pz = 0.5f, pry = 0; // posición propia (leída por el hilo)
static bool grounded;
static volatile int moving;
static char send_anim[12] = "idle";            // animación que se envía a los demás: idle / walk / jump / un emote
static float vy;
static ChatLine hist[40]; static int nhist, hscroll; static bool chat_view;        // historial de chat de la partida (con scroll)
static char game_alert[96]; static u64 game_alert_until;                          // aviso de amigos (solicitud, invitación, mensaje) sobre la partida

typedef struct { enum { PLACE, BREAK, CHAT } type; int x, y, z, kind; char text[100]; } Action;
#define QMAX 16
static Action queue[QMAX]; static int qn;
static void push_action(Action a) { LightLock_Lock(&lock); if (qn < QMAX) queue[qn++] = a; LightLock_Unlock(&lock); }

static void net_thread(void *arg) {
	(void)arg;
	u64 last_blocks = 0, last_presence = 0, last_chat = 0, last_token = osGetTime(), last_alerts = 0; long alert_id = -1; int alert_un = -1;
	long chat_last = -1;
	while (running) {
		u64 now = osGetTime();
		Action a; bool have = false;
		LightLock_Lock(&lock);
		if (qn) { a = queue[0]; memmove(queue, queue + 1, sizeof(Action) * --qn); have = true; }
		float x = px, y = py, z = pz, ry = pry; char anim[12]; memcpy(anim, send_anim, sizeof anim); anim[11] = 0;
		LightLock_Unlock(&lock);

		if (have) {
			if (a.type == PLACE) net_place_block(&sess, a.x, a.y, a.z, a.kind);
			else if (a.type == BREAK) net_break_block(&sess, a.x, a.y, a.z);
			else net_say(&sess, a.text);
		}
		net_send_state(&sess, x, y, z, ry, anim);

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
		if (sess.refresh[0] && now - last_token > 2700000) {   // renueva el token de la cuenta (caduca a la hora)
			if (net_refresh(&sess, true)) ui_save_session(&sess);
			last_token = now;
		}
		if (now - last_presence > 30000) { net_presence(&sess, net_game()); last_presence = now; }
		if (sess.token[0] && app_notif_on() && now - last_alerts > 12000) {          // avisos de amigos también durante la partida
			last_alerts = now; static Notif an[6]; int c = net_list_notifs(&sess, an, 6); int un = net_unread_total(&sess); char msg[96] = "";
			if (c >= 0) { for (int i = 0; i < c; i++) { if (alert_id >= 0 && an[i].id > alert_id && !an[i].read && !msg[0]) app_notif_text(&an[i], msg, sizeof msg); } long mx_id = 0; for (int i = 0; i < c; i++) if (an[i].id > mx_id) mx_id = an[i].id; if (mx_id > alert_id) alert_id = mx_id; if (alert_id < 0) alert_id = 0; }
			if (un >= 0) { if (!msg[0] && alert_un >= 0 && un > alert_un) snprintf(msg, sizeof msg, "Mensaje nuevo de un amigo"); alert_un = un; }
			if (msg[0]) { LightLock_Lock(&lock); snprintf(game_alert, sizeof game_alert, "%s", msg); game_alert_until = osGetTime() + 5000; LightLock_Unlock(&lock); }
		}
		svcSleepThread((qn ? 30 : (long long)app_sync_ms()) * 1000000LL);   // pausa entre envíos/lecturas: ajuste "Sincronizacion" (por defecto 100 ms)
	}
	// Al salir (en este hilo, que ya tiene la conexión TLS abierta): dejar la partida
	net_leave(&sess);
	if (want_offline) net_offline(&sess);
	net_thread_cleanup();
}

// ---------- Mundo local: tabla hash de bloques (antes se recorría la lista entera en cada colisión) ----------
#define HT_SIZE 4096
static short ht[HT_SIZE];                 // índice+1 en local[]; 0 = vacío
static unsigned hkey(int x, int y, int z) { unsigned h = (unsigned)x * 73856093u ^ (unsigned)y * 19349663u ^ (unsigned)z * 83492791u; return h & (HT_SIZE - 1); }
static void ht_build(const Block *bl, int n) {
	memset(ht, 0, sizeof ht);
	for (int i = 0; i < n; i++) { unsigned h = hkey(bl[i].x, bl[i].y, bl[i].z); while (ht[h]) h = (h + 1) & (HT_SIZE - 1); ht[h] = (short)(i + 1); }
}
static const Block *local_blocks; 
static bool solid_at(int x, int y, int z) {
	if (!local_blocks) return false;
	for (unsigned h = hkey(x, y, z); ht[h]; h = (h + 1) & (HT_SIZE - 1)) {
		const Block *b = &local_blocks[ht[h] - 1];
		if (b->x == x && b->y == y && b->z == z) return true;
	}
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

typedef struct { float depth; float x, y, z, w, h; u32 color; int av; } Box;   // av: -1 bloque, 0 yo, 1+i jugador remoto i
static Box draw_list[MAX_BLOCKS + MAX_PLAYERS * 2 + 4];

static u32 shade(u32 c, float f) {
	u32 r = (c & 0xFF) * f, g = ((c >> 8) & 0xFF) * f, b = ((c >> 16) & 0xFF) * f;
	return C2D_Color32(r > 255 ? 255 : r, g > 255 ? 255 : g, b > 255 ? 255 : b, 255);
}
// Niebla: lo lejano se funde con el color del horizonte (da sensación de profundidad)
#define SKY_R 0xD8
#define SKY_G 0xEC
#define SKY_B 0xFF
static u32 fogged(u32 c, float depth) {
	float t = (depth - fog_near) / (fog_far - fog_near); if (t <= 0) return c; if (t > 1) t = 1;
	float r = (c & 0xFF) * (1 - t) + SKY_R * t, g = ((c >> 8) & 0xFF) * (1 - t) + SKY_G * t, b = ((c >> 16) & 0xFF) * (1 - t) + SKY_B * t;
	return C2D_Color32((u32)r, (u32)g, (u32)b, 255);
}

static void draw_box(float x, float y, float z, float w, float h, u32 color) {
	static const int F[6][4] = {{0,1,2,3},{4,5,6,7},{0,1,5,4},{2,3,7,6},{0,3,7,4},{1,2,6,5}};
	static const float lum[6] = {0.55f, 1.0f, 0.75f, 0.75f, 0.65f, 0.85f};
	float v[8][3] = {{x,y,z},{x+w,y,z},{x+w,y,z+w},{x,y,z+w},{x,y+h,z},{x+w,y+h,z},{x+w,y+h,z+w},{x,y+h,z+w}};
	float sx[8], sy[8], d[8];
	for (int i = 0; i < 8; i++) if (!project(v[i][0], v[i][1], v[i][2], &sx[i], &sy[i], &d[i])) return;
	// Pinta de atrás a delante las caras; descarta las traseras por orientación en pantalla
	for (int f = 0; f < 6; f++) {
		const int *q = F[f];
		float area = (sx[q[1]] - sx[q[0]]) * (sy[q[2]] - sy[q[0]]) - (sx[q[2]] - sx[q[0]]) * (sy[q[1]] - sy[q[0]]);
		if (area <= 0) continue; // cara trasera (orientación según el orden de vértices)
		u32 c = shade(color, lum[f]);
		C2D_DrawTriangle(sx[q[0]], sy[q[0]], c, sx[q[1]], sy[q[1]], c, sx[q[2]], sy[q[2]], c, 0);
		C2D_DrawTriangle(sx[q[0]], sy[q[0]], c, sx[q[2]], sy[q[2]], c, sx[q[3]], sy[q[3]], c, 0);
	}
}
// Contorno de un cubo (el bloque al que apuntas)
static void draw_outline(int bx, int by, int bz, u32 color) {
	static const int E[12][2] = {{0,1},{1,2},{2,3},{3,0},{4,5},{5,6},{6,7},{7,4},{0,4},{1,5},{2,6},{3,7}};
	float e = 0.015f, v[8][3] = {{bx-e,by-e,bz-e},{bx+1+e,by-e,bz-e},{bx+1+e,by-e,bz+1+e},{bx-e,by-e,bz+1+e},{bx-e,by+1+e,bz-e},{bx+1+e,by+1+e,bz-e},{bx+1+e,by+1+e,bz+1+e},{bx-e,by+1+e,bz+1+e}};
	float sx[8], sy[8], d[8];
	for (int i = 0; i < 8; i++) if (!project(v[i][0], v[i][1], v[i][2], &sx[i], &sy[i], &d[i])) return;
	for (int i = 0; i < 12; i++) C2D_DrawLine(sx[E[i][0]], sy[E[i][0]], color, sx[E[i][1]], sy[E[i][1]], color, 1.6f, 0.3f);
}

static int cmp_box(const void *a, const void *b) { float d = ((const Box *)b)->depth - ((const Box *)a)->depth; return d > 0 ? 1 : d < 0 ? -1 : 0; }

static void do_chat(void) {
	Action a = {.type = CHAT}; SwkbdState kb; swkbdInit(&kb, SWKBD_TYPE_NORMAL, 2, 90); swkbdSetHintText(&kb, "Mensaje");
	if (swkbdInputText(&kb, a.text, sizeof a.text) == SWKBD_BUTTON_CONFIRM) {
		for (char *c = a.text; *c; c++) if (*c == '"' || *c == '\\') *c = ' ';
		push_action(a);
	}
}

// ---------- Estado de la partida que usa el dibujado (a nivel de fichero para poder previsualizarlo) ----------
static Block local[MAX_BLOCKS]; static Remote rem[MAX_PLAYERS], disp[MAX_PLAYERS];
static struct { char name[24], text[100]; u64 until; } chat[4];
static int kind = 1, nl, nr, ndisp;
static AvPose pose_self, rem_pose[MAX_PLAYERS], disp_pose[MAX_PLAYERS];     // animación de cada avatar (suavizada)
static AvStyle self_style, rem_style[MAX_PLAYERS];
static float self_yaw;
static char emote[12];                      // emote activo (vacío = ninguno)
static bool emote_menu;                     // selector de emotes abierto en la pantalla táctil
static int tx, tz, place_y = -1, break_y = -1; static bool overlap;     // bloque al que apuntas
static u64 now_ms, t_start;

// Dibuja un frame completo: mundo 3D arriba y panel táctil abajo
static void render_game(C3D_RenderTarget *top, C3D_RenderTarget *bot) {
	u64 now = now_ms;
	// ---- lista de dibujo ordenada por profundidad (con niebla) ----
	static const int caps[3] = {150, 250, 320}, radii[3] = {7, 8, 9};
	int lvl = app_draw_level(), cap = caps[lvl], R = radii[lvl];
	fog_near = 12 + lvl * 4; fog_far = 26 + lvl * 8;
	int nd = 0; float sx, sy, d;
	for (int i = 0; i < nl; i++) if (project(local[i].x + .5f, local[i].y + .5f, local[i].z + .5f, &sx, &sy, &d) && d < fog_far + 6)
		draw_list[nd++] = (Box){d, local[i].x, local[i].y, local[i].z, 1, 1, fogged(shade(PALETTE[local[i].kind % NPALETTE], ((local[i].x * 7 + local[i].y * 13 + local[i].z * 5) & 3) == 0 ? 0.93f : 1.0f), d), -1};
	if (project(px, py + .9f, pz, &sx, &sy, &d)) draw_list[nd++] = (Box){d, px, py, pz, 0, 0, 0, 0};
	for (int i = 0; i < nr; i++) if (project(rem[i].x, rem[i].y + .9f, rem[i].z, &sx, &sy, &d))
		draw_list[nd++] = (Box){d, rem[i].x, rem[i].y, rem[i].z, 0, 0, 0, 1 + i};
	qsort(draw_list, nd, sizeof(Box), cmp_box);

	ui_frame_begin();
	C3D_FrameBegin(C3D_FRAME_SYNCDRAW);
	C2D_TargetClear(top, C2D_Color32(SKY_R, SKY_G, SKY_B, 255));
	C2D_SceneBegin(top);
	C2D_DrawRectangle(0, 0, 0, 400, 150, C2D_Color32(0x4F, 0x9F, 0xE8, 255), C2D_Color32(0x4F, 0x9F, 0xE8, 255), C2D_Color32(SKY_R, SKY_G, SKY_B, 255), C2D_Color32(SKY_R, SKY_G, SKY_B, 255));   // cielo
	// Sol y nubes que se desplazan con el viento y con el giro de la cámara (parallax)
	{
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
	// Suelo: cuadrícula alrededor del jugador (con niebla)
	for (int gx = -R; gx < R; gx++) for (int gz = -R; gz < R; gz++) {
		int ax = (int)floorf(px) + gx, az = (int)floorf(pz) + gz;
		float p[4][2], dd = 0, dm = 0; bool ok = true;
		float cs4[4][2] = {{0,0},{1,0},{1,1},{0,1}};
		for (int k = 0; k < 4; k++) { ok &= project(ax + cs4[k][0], 0, az + cs4[k][1], &p[k][0], &p[k][1], &dd); dm += dd; }
		if (!ok) continue;
		u32 c = fogged(((ax + az) & 1) ? C2D_Color32(0x5F, 0xAE, 0x5A, 255) : C2D_Color32(0x52, 0x9E, 0x4E, 255), dm / 4);
		C2D_DrawTriangle(p[0][0], p[0][1], c, p[1][0], p[1][1], c, p[2][0], p[2][1], c, 0);
		C2D_DrawTriangle(p[0][0], p[0][1], c, p[2][0], p[2][1], c, p[3][0], p[3][1], c, 0);
	}
	// sombras redondas bajo los jugadores
	for (int i = -1; i < nr; i++) {
		float ex = i < 0 ? px : rem[i].x, ey = i < 0 ? py : rem[i].y, ez = i < 0 ? pz : rem[i].z; float gx, gy, gd;
		if (project(ex, floorf(ey) + 0.02f, ez, &gx, &gy, &gd) && gd < fog_far) { float r = 120.0f / (gd + 2.0f); C2D_DrawEllipseSolid(gx - r, gy - r * 0.35f, 0, r * 2, r * 0.7f, C2D_Color32(0, 0, 0, 70)); }
	}
	// citro2d tiene un límite de objetos por frame: se descartan los más lejanos
	int first = nd > cap ? nd - cap : 0;
	AvCam cam = {cx_, cy_, cz_, cam_yaw, cam_pitch, cam_dist, FOV, TOP_W / 2.0f, TOP_H / 2.0f};
	self_style = av_style(sess.username, sess.color);
	for (int i = first; i < nd; i++) {
		const Box *b = &draw_list[i];
		if (b->av < 0) draw_box(b->x, b->y, b->z, b->w, b->h, b->color);
		else if (b->av == 0) av_draw(&cam, px, py, pz, self_yaw, &self_style, &pose_self, fog_near, fog_far);       // avatares 3D (modelo con partes)
		else { int j = b->av - 1; rem_style[j] = av_style(rem[j].name, rem[j].color); av_draw(&cam, rem[j].x, rem[j].y, rem[j].z, rem[j].ry, &rem_style[j], &rem_pose[j], fog_near, fog_far); }
	}
	// contorno: blanco = lo que romperá Y; del color elegido = dónde pondrá X
	if (break_y >= 0) draw_outline(tx, break_y, tz, C2D_Color32(255, 255, 255, 255));
	else if (place_y >= 0 && !overlap) draw_outline(tx, place_y, tz, PALETTE[kind]);
	// nombres sobre los jugadores
	for (int i = 0; i < nr; i++) if (project(rem[i].x, rem[i].y + 2.05f, rem[i].z, &sx, &sy, &d) && d < 26) {
		ui_text(sx + 1, sy - 11, 0.34f, C2D_Color32(0, 0, 0, 200), C2D_AlignCenter, rem[i].name);
		ui_text(sx, sy - 12, 0.34f, C2D_Color32(255, 255, 255, 255), C2D_AlignCenter, rem[i].name);
	}
	// ---- HUD ----
	ui_rrect(8, 8, 74, 26, 8, C2D_Color32(0, 0, 0, 130));
	ui_rrect(14, 12, 24, 18, 5, PALETTE[kind]);
	char hb[24]; snprintf(hb, sizeof hb, "%d/%d", kind + 1, NPALETTE); ui_text(46, 11, 0.42f, COL_TEXT, 0, hb);
	char pc[24]; snprintf(pc, sizeof pc, "%d jugando", nr + 1);
	float pw = ui_text_width(pc, 0.4f) + 16; ui_rrect(392 - pw, 8, pw, 22, 8, C2D_Color32(0, 0, 0, 130)); ui_text(392 - pw / 2, 11, 0.4f, COL_TEXT, C2D_AlignCenter, pc);
	int shown = 0; for (int i = 0; i < 4; i++) if (chat[i].until > now) shown++;
	for (int i = 0, row = 0; i < 4; i++) if (chat[i].until > now) {          // chat reciente, abajo a la izquierda
		char line[140]; snprintf(line, sizeof line, "%s: %s", chat[i].name, chat[i].text);
		float lw = ui_text_width(line, 0.38f) + 12; if (lw > 300) lw = 300;
		float y = 236 - (shown - row) * 17; ui_rrect(6, y, lw, 15, 6, C2D_Color32(0, 0, 0, 140));
		char fit[140]; snprintf(fit, sizeof fit, "%s", line); while (strlen(fit) > 4 && ui_text_width(fit, 0.38f) > lw - 10) fit[strlen(fit) - 1] = 0;
		ui_text(12, y, 0.38f, COL_TEXT, 0, fit); row++;
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
		ui_text(200, 209, 0.38f, COL_TEXT, C2D_AlignCenter, "A saltar  B correr  X poner  Y romper  +/- color");
	}
	C2D_TargetClear(bot, C2D_Color32(0x23, 0x25, 0x27, 255));
	C2D_SceneBegin(bot);
	ui_game_bottom(&sess, rem, nr, kind, cur_game.name, BLOCKSY_VERSION, emote_menu, hist, nhist, hscroll, chat_view);
	C3D_FrameEnd(0);
}

// Una partida. Devuelve true para volver al lobby; false si el usuario pulsa START (salir de la app).
static bool play_game(C3D_RenderTarget *top, C3D_RenderTarget *bot) {
	LightLock_Init(&lock);
	nblocks = nremotes = qn = nchat_new = 0; px = 0.5f; py = 3; pz = 0.5f; pry = 0; vy = 0; grounded = false; moving = 0; running = true; want_offline = false;
	cam_yaw = 0; cam_pitch = 0.5f; cam_dist = 9; cx_ = px; cy_ = py + 1; cz_ = pz;
	net_set_game(cur_game.id);
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
		if (down & KEY_START) { back = false; break; }

		// ---- cámara: L/R y C-stick (New 3DS / 2DS XL); D-pad arriba/abajo = zoom ----
		circlePosition cs; hidCstickRead(&cs);
		if (held & KEY_L) cam_yaw -= 2.4f * dt;
		if (held & KEY_R) cam_yaw += 2.4f * dt;
		if (abs(cs.dx) > 20) cam_yaw += cs.dx / 156.0f * 2.6f * dt;
		if (abs(cs.dy) > 20) cam_pitch = fminf(1.4f, fmaxf(0.05f, cam_pitch - cs.dy / 156.0f * 1.6f * dt));
		if (held & KEY_DUP) cam_dist = fmaxf(4, cam_dist - 6 * dt);
		if (held & KEY_DDOWN) cam_dist = fminf(20, cam_dist + 6 * dt);
		if (down & KEY_DRIGHT) kind = (kind + 1) % NPALETTE;
		if (down & KEY_DLEFT) kind = (kind + NPALETTE - 1) % NPALETTE;
		if (down & KEY_SELECT) do_chat();
		if (down & KEY_TOUCH) {
			touchPosition tp; hidTouchRead(&tp);
			int act = ui_game_touch(tp.px, tp.py, emote_menu, chat_view);
			if (act >= UI_COLOR0 && act < UI_COLOR0 + NPALETTE) kind = act;
			else if (act >= UI_EMOTE0 && act < UI_EMOTE0 + NEMOTES) { if (grounded && !moving) snprintf(emote, sizeof emote, "%s", AV_EMOTE_ID[act - UI_EMOTE0]); emote_menu = false; }
			else if (act == UI_EMOTE_MENU) emote_menu = !emote_menu;
			else if (act == UI_CHAT) do_chat();
			else if (act == UI_QUIT) break;
			else if (act == UI_TAB_PLAYERS) chat_view = false;
			else if (act == UI_TAB_CHAT) { chat_view = true; hscroll = 0; }
			else if (act == UI_CHAT_UP) { if (hscroll < nhist - 5) hscroll++; }
			else if (act == UI_CHAT_DOWN) { if (hscroll > 0) hscroll--; }
			else if (chat_view && tp.px < 256 && tp.py >= 50 && tp.py < 120) { chat_drag_y = tp.py; chat_drag = true; }
		}
		if (chat_drag) {                                             // arrastrar sobre el historial para desplazarlo
			if (held & KEY_TOUCH) { touchPosition tp; hidTouchRead(&tp); int dy = tp.py - chat_drag_y; if (dy > 12 && hscroll < nhist - 5) { hscroll++; chat_drag_y = tp.py; } else if (dy < -12 && hscroll > 0) { hscroll--; chat_drag_y = tp.py; } }
			else chat_drag = false;
		}

		// ---- datos de red -> copia local ----
		LightLock_Lock(&lock);
		memcpy(local, blocks, sizeof(Block) * nblocks); nl = nblocks;
		memcpy(rem, remotes, sizeof(Remote) * nremotes); nr = nremotes;
		for (int i = 0; i < nchat_new; i++) {                       // mensajes nuevos -> lista visible 10 s
			memmove(&chat[0], &chat[1], sizeof chat[0] * 3);
			snprintf(chat[3].name, sizeof chat[3].name, "%s", chat_new[i].name); snprintf(chat[3].text, sizeof chat[3].text, "%s", chat_new[i].text); chat[3].until = now + 10000;
			if (nhist == 40) { memmove(&hist[0], &hist[1], sizeof hist[0] * 39); nhist = 39; }
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
		float speed = ((held & KEY_B) ? 9.0f : 6.0f) * mag;
		moving = mag > 0.05f;
		if (moving) pry = atan2f(mx, mz);
		float nx = px + mx * speed * dt, nz = pz + mz * speed * dt;
		if (!body_hits(nx, py, pz)) px = nx;
		else if (grounded && !body_hits(nx, py + 1.01f, pz)) { px = nx; py += 1.01f; }
		if (!body_hits(px, py, nz)) pz = nz;
		else if (grounded && !body_hits(px, py + 1.01f, nz)) { pz = nz; py += 1.01f; }
		if ((down & KEY_A) && grounded) { vy = 8.6f; grounded = false; }
		vy -= 24 * dt; float ny = py + vy * dt; grounded = false;
		if (body_hits(px, ny, pz)) { if (vy < 0) grounded = true; vy = 0; }
		else py = ny;
		if (py < 0) { py = 0; vy = 0; grounded = true; }
		if (emote[0] && (moving || !grounded)) emote[0] = 0;                 // moverte o saltar corta el emote
		{ const char *an = !grounded ? "jump" : moving ? "walk" : emote[0] ? emote : "idle"; snprintf(send_anim, sizeof send_anim, "%s", an);
		  float dyaw = fmodf(pry - self_yaw + 3 * (float)M_PI, 2 * (float)M_PI) - (float)M_PI; self_yaw += dyaw * fminf(1, dt * 14);
		  av_pose_update(&pose_self, an, dt, now / 1000.0f); }

		// ---- bloque al que apuntas (el de delante): X pone, Y rompe ----
		tx = (int)floorf(px + sinf(pry) * 1.1f); tz = (int)floorf(pz + cosf(pry) * 1.1f); int ty = (int)floorf(py + 0.05f);
		place_y = break_y = -1;
		for (int dy = 0; dy < 4 && place_y < 0; dy++) if (!solid_at(tx, ty + dy, tz)) place_y = ty + dy;      // primer hueco libre (apila si hay bloque)
		for (int dy = 0; dy < 3 && break_y < 0; dy++) if (solid_at(tx, ty + dy, tz)) break_y = ty + dy;        // el bloque más bajo
		overlap = place_y >= 0 && fabsf(px - (tx + .5f)) < 0.8f && fabsf(pz - (tz + .5f)) < 0.8f && py < place_y + 1 && py + 1.8f > place_y;
		if ((down & KEY_X) && place_y >= 0 && !overlap && nl < MAX_BLOCKS) {
			push_action((Action){.type = PLACE, .x = tx, .y = place_y, .z = tz, .kind = kind});
			LightLock_Lock(&lock); if (nblocks < MAX_BLOCKS) blocks[nblocks++] = (Block){tx, place_y, tz, kind}; LightLock_Unlock(&lock);
		}
		if ((down & KEY_Y) && break_y >= 0) {
			push_action((Action){.type = BREAK, .x = tx, .y = break_y, .z = tz});
			LightLock_Lock(&lock);
			for (int i = 0; i < nblocks; i++) if (blocks[i].x == tx && blocks[i].y == break_y && blocks[i].z == tz) { blocks[i] = blocks[--nblocks]; break; }
			LightLock_Unlock(&lock);
		}

		// cámara suave
		float kc = fminf(1, dt * 12);
		cx_ += (px - cx_) * kc; cy_ += (py + 1 - cy_) * kc; cz_ += (pz - cz_) * kc;

		now_ms = now; render_game(top, bot);
	}

	want_offline = !back;
	running = false;
	if (th) { threadJoin(th, U64_MAX); threadFree(th); }
	return back;
}

int main(int argc, char **argv) {
	gfxInitDefault(); C3D_Init(C3D_DEFAULT_CMDBUF_SIZE); C2D_Init(C2D_DEFAULT_MAX_OBJECTS); C2D_Prepare();
	C3D_RenderTarget *top = C2D_CreateScreenTarget(GFX_TOP, GFX_LEFT);
	C3D_RenderTarget *bot = C2D_CreateScreenTarget(GFX_BOTTOM, GFX_LEFT);
	ui_init();
	update_init(BLOCKSY_VERSION, argc > 0 && argv ? argv[0] : NULL);   // versión instalada y ruta del .3dsx
	if (!net_init()) {
		ui_message(top, bot, "Sin red", "No se pudo iniciar la red.\nComprueba que el WiFi esta activado.");
		ui_exit(); C2D_Fini(); C3D_Fini(); gfxExit(); return 1;
	}
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
	ui_exit(); net_exit(); C2D_Fini(); C3D_Fini(); gfxExit();
	return 0;
}

#ifdef BLOCKSY_PREVIEW
// Solo para generar capturas en el ordenador (3ds/preview): un mundo de ejemplo
void game_preview(C3D_RenderTarget *top, C3D_RenderTarget *bot) {
	snprintf(sess.username, sizeof sess.username, "IkerPlays"); sess.color = 0xFF439FFF; snprintf(cur_game.name, sizeof cur_game.name, "Spawn Plaza");
	nl = 0;
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
