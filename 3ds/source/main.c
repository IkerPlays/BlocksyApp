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
static volatile bool running = true;
static float px = 0.5f, py = 3, pz = 0.5f, pry = 0; // posición propia (leída por el hilo)
static bool grounded;
static volatile int moving;
static float vy;

typedef struct { enum { PLACE, BREAK, CHAT } type; int x, y, z, kind; char text[100]; } Action;
#define QMAX 16
static Action queue[QMAX]; static int qn;
static void push_action(Action a) { LightLock_Lock(&lock); if (qn < QMAX) queue[qn++] = a; LightLock_Unlock(&lock); }

static void net_thread(void *arg) {
	(void)arg;
	u64 last_blocks = 0, last_presence = 0;
	while (running) {
		u64 now = osGetTime();
		Action a; bool have = false;
		LightLock_Lock(&lock);
		if (qn) { a = queue[0]; memmove(queue, queue + 1, sizeof(Action) * --qn); have = true; }
		float x = px, y = py, z = pz, ry = pry;
		LightLock_Unlock(&lock);

		if (have) {
			if (a.type == PLACE) net_place_block(&sess, a.x, a.y, a.z, a.kind);
			else if (a.type == BREAK) net_break_block(&sess, a.x, a.y, a.z);
			else net_say(&sess, a.text);
		}
		net_send_state(&sess, x, y, z, ry, moving ? "walk" : "idle");

		Remote tmp[MAX_PLAYERS]; int n = net_fetch_players(&sess, tmp, MAX_PLAYERS);
		if (n >= 0) { LightLock_Lock(&lock); memcpy(remotes, tmp, sizeof(Remote) * n); nremotes = n; LightLock_Unlock(&lock); }

		if (now - last_blocks > 1000) {
			static Block bt[MAX_BLOCKS]; int m = net_fetch_blocks(&sess, bt, MAX_BLOCKS);
			if (m >= 0) { LightLock_Lock(&lock); memcpy(blocks, bt, sizeof(Block) * m); nblocks = m; LightLock_Unlock(&lock); }
			last_blocks = now;
		}
		if (now - last_presence > 30000) { net_presence(&sess, net_game()); last_presence = now; }
		svcSleepThread((qn ? 30 : 100) * 1000000LL); // ~10 Hz
	}
	// Al salir (en este hilo, que ya tiene la conexión TLS abierta): dejar la partida
	net_leave(&sess);
	if (want_offline) net_offline(&sess);
	net_thread_cleanup();
}

// ---------- Render 3D con proyección manual sobre citro2d ----------
static float cam_yaw = 0, cam_pitch = 0.5f, cam_dist = 9;
static float cx_, cy_, cz_;

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

typedef struct { float depth; float x, y, z, w, h; u32 color; } Box;
static Box draw_list[MAX_BLOCKS + MAX_PLAYERS * 2 + 4];

static u32 shade(u32 c, float f) {
	u32 r = (c & 0xFF) * f, g = ((c >> 8) & 0xFF) * f, b = ((c >> 16) & 0xFF) * f;
	return C2D_Color32(r > 255 ? 255 : r, g > 255 ? 255 : g, b > 255 ? 255 : b, 255);
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

static int cmp_box(const void *a, const void *b) { float d = ((const Box *)b)->depth - ((const Box *)a)->depth; return d > 0 ? 1 : d < 0 ? -1 : 0; }

static bool solid(int x, int y, int z, const Block *bl, int n) {
	for (int i = 0; i < n; i++) if (bl[i].x == x && bl[i].y == y && bl[i].z == z) return true;
	return false;
}

static void do_chat(void) {
	Action a = {.type = CHAT}; SwkbdState kb; swkbdInit(&kb, SWKBD_TYPE_NORMAL, 2, 90); swkbdSetHintText(&kb, "Mensaje");
	if (swkbdInputText(&kb, a.text, sizeof a.text) == SWKBD_BUTTON_CONFIRM) {
		for (char *c = a.text; *c; c++) if (*c == '"' || *c == '\\') *c = ' ';
		push_action(a);
	}
}

// Una partida. Devuelve true para volver al lobby; false si el usuario pulsa START (salir de la app).
static bool play_game(C3D_RenderTarget *top, C3D_RenderTarget *bot) {
	LightLock_Init(&lock);
	nblocks = nremotes = qn = 0; px = 0.5f; py = 3; pz = 0.5f; pry = 0; vy = 0; grounded = false; moving = 0; running = true; want_offline = false;
	cam_yaw = 0; cam_pitch = 0.5f; cam_dist = 9;
	net_set_game(cur_game.id);
	s32 prio = 0; svcGetThreadPriority(&prio, CUR_THREAD_HANDLE);
	Thread th = threadCreate(net_thread, NULL, 256 * 1024, prio + 1, 0, false);   // prioridad menor que la UI

	// La pila principal de la app es de solo ~32 KB: los arrays grandes van en memoria estática
	static Block local[MAX_BLOCKS]; static Remote rem[MAX_PLAYERS];
	int kind = 1, nl = 0, nr = 0;
	bool back = true;

	while (aptMainLoop()) {
		hidScanInput();
		u32 down = hidKeysDown(), held = hidKeysHeld();
		if (down & KEY_START) { back = false; break; }
		if (held & KEY_L) cam_yaw -= 0.05f;
		if (held & KEY_R) cam_yaw += 0.05f;
		if (held & KEY_DUP) cam_dist = fmaxf(4, cam_dist - 0.15f);
		if (held & KEY_DDOWN) cam_dist = fminf(20, cam_dist + 0.15f);
		if (down & KEY_B) kind = (kind + 1) % 6;
		if (down & KEY_SELECT) do_chat();
		if (down & KEY_TOUCH) {
			touchPosition tp; hidTouchRead(&tp);
			int act = ui_game_touch(tp.px, tp.py);
			if (act >= UI_COLOR0 && act < UI_COLOR0 + NPALETTE) kind = act;
			else if (act == UI_CHAT) do_chat();
			else if (act == UI_QUIT) break;
		}

		static Remote disp[MAX_PLAYERS]; static int ndisp; static int frame_n;
		if (frame_n == 0) ndisp = 0;
		LightLock_Lock(&lock);
		memcpy(local, blocks, sizeof(Block) * nblocks); nl = nblocks;
		memcpy(rem, remotes, sizeof(Remote) * nremotes); nr = nremotes;
		LightLock_Unlock(&lock);
		// Interpola la posición de los otros jugadores entre actualizaciones de red (~10 Hz)
		for (int i = 0; i < nr; i++) {
			int j = 0; while (j < ndisp && strcmp(disp[j].id, rem[i].id)) j++;
			if (j == ndisp && ndisp < MAX_PLAYERS) { disp[ndisp++] = rem[i]; continue; }
			if (j == ndisp) continue;
			float x = disp[j].x, y = disp[j].y, z = disp[j].z;
			disp[j] = rem[i];
			disp[j].x = x + (rem[i].x - x) * 0.3f; disp[j].y = y + (rem[i].y - y) * 0.3f; disp[j].z = z + (rem[i].z - z) * 0.3f;
			rem[i] = disp[j];
		}
		{ int k = 0; for (int j = 0; j < ndisp; j++) { int keep = 0; for (int i = 0; i < nr; i++) if (!strcmp(disp[j].id, rem[i].id)) keep = 1; if (keep) disp[k++] = disp[j]; } ndisp = k; }
		frame_n++;

		circlePosition cp; hidCircleRead(&cp);
		float f = (abs(cp.dy) > 15 ? cp.dy : 0) / 156.0f, s = (abs(cp.dx) > 15 ? cp.dx : 0) / 156.0f;
		float mx = -sinf(cam_yaw) * f + cosf(cam_yaw) * s;
		float mz = -cosf(cam_yaw) * f - sinf(cam_yaw) * s;
		float dt = 1 / 60.0f, speed = 6;
		float nx = px + mx * speed * dt, nz = pz + mz * speed * dt;
		moving = fabsf(mx) + fabsf(mz) > 0.01f;
		if (moving) pry = atan2f(mx, mz);
		#define BLOCKED(X, Y, Z) (solid((int)floorf((X) - 0.3f), (int)floorf(Y), (int)floorf((Z) - 0.3f), local, nl) || solid((int)floorf((X) + 0.3f), (int)floorf(Y), (int)floorf((Z) + 0.3f), local, nl) || solid((int)floorf(X), (int)floorf(Y), (int)floorf(Z), local, nl))
		if (!BLOCKED(nx, py + 0.1f, pz) && !BLOCKED(nx, py + 1.0f, pz)) px = nx;
		if (!BLOCKED(px, py + 0.1f, nz) && !BLOCKED(px, py + 1.0f, nz)) pz = nz;
		if ((down & KEY_A) && grounded) { vy = 8.5f; grounded = false; }
		vy -= 24 * dt; float ny = py + vy * dt; grounded = false;
		if (BLOCKED(px, ny + 0.05f, pz) || BLOCKED(px, ny + 1.7f, pz)) { if (vy < 0) grounded = true; vy = 0; }
		else py = ny;
		if (py < 0) { py = 0; vy = 0; grounded = true; }

		// Bloque delante del jugador
		int tx = (int)floorf(px + sinf(pry) * 1.3f), tz = (int)floorf(pz + cosf(pry) * 1.3f), ty = (int)floorf(py);
		if ((down & KEY_X) && !solid(tx, ty, tz, local, nl) && nl < MAX_BLOCKS) {
			push_action((Action){.type = PLACE, .x = tx, .y = ty, .z = tz, .kind = kind});
			LightLock_Lock(&lock); if (nblocks < MAX_BLOCKS) blocks[nblocks++] = (Block){tx, ty, tz, kind}; LightLock_Unlock(&lock);
		}
		if ((down & KEY_Y) && solid(tx, ty, tz, local, nl)) {
			push_action((Action){.type = BREAK, .x = tx, .y = ty, .z = tz});
			LightLock_Lock(&lock);
			for (int i = 0; i < nblocks; i++) if (blocks[i].x == tx && blocks[i].y == ty && blocks[i].z == tz) { blocks[i] = blocks[--nblocks]; break; }
			LightLock_Unlock(&lock);
		}

		cx_ = px; cy_ = py + 1; cz_ = pz;

		// Lista de dibujo ordenada por profundidad
		int nd = 0; float sx, sy, d;
		for (int i = 0; i < nl; i++) if (project(local[i].x + .5f, local[i].y + .5f, local[i].z + .5f, &sx, &sy, &d))
			draw_list[nd++] = (Box){d, local[i].x, local[i].y, local[i].z, 1, 1, PALETTE[local[i].kind % 6]};
		if (project(px, py + .9f, pz, &sx, &sy, &d)) draw_list[nd++] = (Box){d, px - .3f, py, pz - .3f, .6f, 1.8f, sess.color};
		for (int i = 0; i < nr; i++) if (project(rem[i].x, rem[i].y + .9f, rem[i].z, &sx, &sy, &d))
			draw_list[nd++] = (Box){d, rem[i].x - .3f, rem[i].y, rem[i].z - .3f, .6f, 1.8f, rem[i].color};
		qsort(draw_list, nd, sizeof(Box), cmp_box);

		ui_frame_begin();
		C3D_FrameBegin(C3D_FRAME_SYNCDRAW);
		C2D_TargetClear(top, C2D_Color32(0x87, 0xC8, 0xFF, 255));
		C2D_SceneBegin(top);
		// Suelo: cuadrícula alrededor del jugador
		for (int gx = -8; gx < 8; gx++) for (int gz = -8; gz < 8; gz++) {
			int ax = (int)floorf(px) + gx, az = (int)floorf(pz) + gz;
			float p[4][2], dd; bool ok = true;
			float cs[4][2] = {{0,0},{1,0},{1,1},{0,1}};
			for (int k = 0; k < 4; k++) ok &= project(ax + cs[k][0], 0, az + cs[k][1], &p[k][0], &p[k][1], &dd);
			if (!ok) continue;
			u32 c = ((ax + az) & 1) ? C2D_Color32(0x5F, 0xAE, 0x5A, 255) : C2D_Color32(0x52, 0x9E, 0x4E, 255);
			C2D_DrawTriangle(p[0][0], p[0][1], c, p[1][0], p[1][1], c, p[2][0], p[2][1], c, 0);
			C2D_DrawTriangle(p[0][0], p[0][1], c, p[2][0], p[2][1], c, p[3][0], p[3][1], c, 0);
		}
		// citro2d tiene un límite de objetos por frame: se descartan los más lejanos
		static const int caps[3] = {150, 250, 350};
		int cap = caps[app_draw_level()], first = nd > cap ? nd - cap : 0;
		for (int i = first; i < nd; i++) draw_box(draw_list[i].x, draw_list[i].y, draw_list[i].z, draw_list[i].w, draw_list[i].h, draw_list[i].color);
		C2D_DrawRectSolid(8, 8, 0, 20, 20, PALETTE[kind]); // color seleccionado
		C2D_TargetClear(bot, C2D_Color32(0x23, 0x25, 0x27, 255));
		C2D_SceneBegin(bot);
		ui_game_bottom(&sess, rem, nr, kind, cur_game.name, BLOCKSY_VERSION);
		C3D_FrameEnd(0);
	}

	want_offline = !back;
	running = false;
	if (th) { threadJoin(th, U64_MAX); threadFree(th); }
	return back;
}

int main(void) {
	gfxInitDefault(); C3D_Init(C3D_DEFAULT_CMDBUF_SIZE); C2D_Init(C2D_DEFAULT_MAX_OBJECTS); C2D_Prepare();
	C3D_RenderTarget *top = C2D_CreateScreenTarget(GFX_TOP, GFX_LEFT);
	C3D_RenderTarget *bot = C2D_CreateScreenTarget(GFX_BOTTOM, GFX_LEFT);
	ui_init();
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
			if (r == APP_LOGOUT) { ui_forget_session(); memset(&sess, 0, sizeof sess); } else quit = true;
			break;
		}
	}
	ui_exit(); net_exit(); C2D_Fini(); C3D_Fini(); gfxExit();
	return 0;
}
