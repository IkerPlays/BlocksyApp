// Interfaz táctil de Blocksy (citro2d): login, mensajes y panel de la pantalla inferior.
#include "ui.h"
#include "config.h"
#include "qrcodegen.h"
#include <math.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

const u32 ui_palette[NPALETTE] = {0xFFE8E8E8, 0xFF3C4CE7, 0xFF129CF3, 0xFF71CC2E, 0xFFDB9834, 0xFFB6599B};

// Web donde se autoriza el QR (cámbiala definiendo WEB_URL / WEB_HOST en config.h)
#ifndef WEB_URL
#define WEB_URL "https://blocksyweb.netlify.app"
#define WEB_HOST "blocksyweb.netlify.app"
#endif

#define C(r, g, b) C2D_Color32(r, g, b, 255)
#define COL_BG     C(0x23, 0x25, 0x27)
#define COL_PANEL  C(0x2D, 0x2F, 0x33)
#define COL_LINE   C(0x45, 0x48, 0x4E)
#define COL_TEXT   C(0xF2, 0xF4, 0xF5)
#define COL_MUTED  C(0xA1, 0xA6, 0xAD)
#define COL_ACCENT C(0x4D, 0x7B, 0xFF)
#define COL_GREEN  C(0x02, 0xB7, 0x57)
#define COL_RED    C(0xFF, 0x7A, 0x72)

static C2D_TextBuf tbuf;
void ui_init(void) { tbuf = C2D_TextBufNew(4096); }
void ui_exit(void) { C2D_TextBufDelete(tbuf); }
void ui_frame_begin(void) { C2D_TextBufClear(tbuf); }

void ui_text(float x, float y, float scale, u32 color, u32 align, const char *s) {
	C2D_Text t; C2D_TextParse(&t, tbuf, s); C2D_TextOptimize(&t);
	C2D_DrawText(&t, C2D_WithColor | align, x, y, 0.5f, scale, scale, color);
}
static float text_w(const char *s, float scale) {
	C2D_Text t; float w, h; C2D_TextParse(&t, tbuf, s); C2D_TextGetDimensions(&t, scale, scale, &w, &h); return w;
}

// ---------- primitivas ----------
static void rect(float x, float y, float w, float h, u32 c) { C2D_DrawRectSolid(x, y, 0.2f, w, h, c); }
static void rrect(float x, float y, float w, float h, float r, u32 c) {
	rect(x + r, y, w - 2 * r, h, c); rect(x, y + r, w, h - 2 * r, c);
	C2D_DrawCircleSolid(x + r, y + r, 0.2f, r, c); C2D_DrawCircleSolid(x + w - r, y + r, 0.2f, r, c);
	C2D_DrawCircleSolid(x + r, y + h - r, 0.2f, r, c); C2D_DrawCircleSolid(x + w - r, y + h - r, 0.2f, r, c);
}
static void quad(float x0, float y0, float x1, float y1, float x2, float y2, float x3, float y3, u32 c) {
	C2D_DrawTriangle(x0, y0, c, x1, y1, c, x2, y2, c, 0.2f);
	C2D_DrawTriangle(x0, y0, c, x2, y2, c, x3, y3, c, 0.2f);
}
static u32 shade(u32 c, float f) {
	u32 r = (c & 0xFF) * f, g = ((c >> 8) & 0xFF) * f, b = ((c >> 16) & 0xFF) * f;
	return C2D_Color32(r > 255 ? 255 : r, g > 255 ? 255 : g, b > 255 ? 255 : b, 255);
}
// Cubo isométrico (icono)
static void cube(float cx, float cy, float s, u32 c) {
	float k = s * 0.866f;
	quad(cx, cy - s, cx + k, cy - s * .5f, cx, cy, cx - k, cy - s * .5f, shade(c, 1.15f));
	quad(cx - k, cy - s * .5f, cx, cy, cx, cy + s, cx - k, cy + s * .5f, shade(c, .8f));
	quad(cx, cy, cx + k, cy - s * .5f, cx + k, cy + s * .5f, cx, cy + s, shade(c, .6f));
}
static void button(float x, float y, float w, float h, u32 c, bool focus, const char *label, float scale) {
	if (focus) rrect(x - 2, y - 2, w + 4, h + 4, 8, COL_TEXT);
	rrect(x, y, w, h, 7, c);
	ui_text(x + w / 2, y + h / 2 - 9 * scale * 2, scale, COL_TEXT, C2D_AlignCenter, label);
}

static void top_background(const char *version, const char *subtitle) {
	C2D_DrawRectangle(0, 0, 0, 400, 240, C(0x16, 0x1B, 0x33), C(0x1B, 0x2B, 0x5E), C(0x0B, 0x4D, 0x3B), C(0x10, 0x20, 0x2A));
	float t = osGetTime() / 1000.0f;
	static const float fx[7] = {40, 350, 90, 310, 200, 20, 380}, fy[7] = {190, 60, 40, 200, 215, 110, 150};
	static const u32 fc[7] = {0xFFFF7B4D, 0xFF57B7F3, 0xFF71CC2E, 0xFFB6599B, 0xFF3C4CE7, 0xFFDB9834, 0xFF71CC2E};
	for (int i = 0; i < 7; i++) cube(fx[i] + sinf(t * .7f + i) * 6, fy[i] + sinf(t * 1.1f + i * 2) * 8, 16 + (i % 3) * 5, fc[i]);
	cube(200, 62 + sinf(t * 1.4f) * 3, 34, C(0x4D, 0x7B, 0xFF));
	ui_text(200, 100, 1.4f, COL_TEXT, C2D_AlignCenter, "Blocksy");
	ui_text(200, 152, 0.5f, COL_MUTED, C2D_AlignCenter, subtitle);
	char v[48]; snprintf(v, sizeof v, "v%s", version);
	ui_text(200, 222, 0.4f, COL_MUTED, C2D_AlignCenter, v);
}

// ---------- datos guardados ----------
#define SAVE_DIR  "sdmc:/3ds/blocksy"
#define SAVE_FILE SAVE_DIR "/login.txt"
static void load_email(char *dst, size_t n) {
	FILE *f = fopen(SAVE_FILE, "r"); if (!f) return;
	if (fgets(dst, (int)n, f)) dst[strcspn(dst, "\r\n")] = 0;
	fclose(f);
}
static void save_email(const char *email, bool remember) {
	if (!remember) { remove(SAVE_FILE); return; }
	mkdir("sdmc:/3ds", 0777); mkdir(SAVE_DIR, 0777);
	FILE *f = fopen(SAVE_FILE, "w"); if (!f) return;
	fprintf(f, "%s\n", email); fclose(f);
}

static bool edit_text(char *dst, size_t n, const char *hint, bool password) {
	SwkbdState kb; swkbdInit(&kb, SWKBD_TYPE_NORMAL, 2, (int)n - 1);
	swkbdSetHintText(&kb, hint); swkbdSetInitialText(&kb, dst);
	if (password) swkbdSetPasswordMode(&kb, SWKBD_PASSWORD_HIDE_DELAY);
	swkbdSetValidation(&kb, SWKBD_NOTEMPTY_NOTBLANK, 0, 0);
	char buf[128]; buf[0] = 0;
	if (swkbdInputText(&kb, buf, sizeof buf < n ? sizeof buf : n) != SWKBD_BUTTON_CONFIRM) return false;
	strncpy(dst, buf, n - 1); dst[n - 1] = 0; return true;
}

// ---------- hilos de red (el TLS de la 3DS es lento y necesita bastante pila: no se hace en el hilo principal) ----------
static Thread spawn(ThreadFunc f, void *arg) {
	s32 prio = 0x30; svcGetThreadPriority(&prio, CUR_THREAD_HANDLE);
	return threadCreate(f, arg, 256 * 1024, prio + 1, 0, false);   // prioridad menor que la UI
}
static void join(Thread t) { if (t) { threadJoin(t, U64_MAX); threadFree(t); } }

typedef struct { volatile int state; /* 0 en curso, 1 ok, 2 fallo */ int kind; /* 0 login, 1 reanudar */ Session *sess; char email[96], pass[64]; } AuthJob;
static void auth_thread(void *a) {
	AuthJob *j = a;
	bool ok = j->kind == 0 ? net_login(j->sess, j->email, j->pass) : net_resume(j->sess);
	net_thread_cleanup();
	j->state = ok ? 1 : 2;
}

typedef struct { volatile int state; /* 0 pidiendo código, 1 esperando, 2 aprobado, 3 error */ volatile bool cancel; char code[16], poll[48], err[96]; Session sess; } LinkJob;
static void link_thread(void *a) {
	LinkJob *j = a;
	if (!net_link_start(j->code, sizeof j->code, j->poll, sizeof j->poll)) { snprintf(j->err, sizeof j->err, "%s", net_login_error()); j->state = 3; net_thread_cleanup(); return; }
	j->state = 1;
	while (!j->cancel) {
		int r = net_link_poll(&j->sess, j->code, j->poll);
		if (r == 1) { j->state = 2; break; }
		if (r < 0) { snprintf(j->err, sizeof j->err, "%s", net_login_error()); j->state = 3; break; }
		for (int i = 0; i < 20 && !j->cancel; i++) svcSleepThread(100 * 1000000LL);   // consulta cada ~2 s
	}
	net_thread_cleanup();
}

// ---------- sesión guardada (solo la de vinculación por QR; la contraseña nunca se guarda) ----------
#define SESSION_FILE SAVE_DIR "/session.txt"
static bool load_session(Session *s) {
	FILE *f = fopen(SESSION_FILE, "r"); if (!f) return false;
	bool ok = fgets(s->secret, sizeof s->secret, f) != NULL;
	s->secret[strcspn(s->secret, "\r\n")] = 0; fclose(f);
	return ok && strlen(s->secret) > 30;
}
static void save_session(const Session *s) {
	mkdir("sdmc:/3ds", 0777); mkdir(SAVE_DIR, 0777);
	FILE *f = fopen(SESSION_FILE, "w"); if (!f) return;
	fprintf(f, "%s\n", s->secret); fclose(f);
}
void ui_forget_session(void) { remove(SESSION_FILE); }

// ---------- pantalla de login ----------
typedef struct { char email[96], pass[64]; bool remember, show; int focus; const char *msg; u32 msg_color; } LoginState;

// Posiciones (pantalla inferior 320x240)
enum { F_X = 20, F_W = 280, F_H = 34, EMAIL_Y = 46, PASS_Y = 100, CHK_Y = 148, BTN_Y = 184, BTN_H = 40, EYE_W = 44, ENTER_W = 168, QR_X = 196, QR_W = 104 };
static bool hit(touchPosition t, int x, int y, int w, int h) { return t.px >= x && t.px < x + w && t.py >= y && t.py < y + h; }

static void field(float y, const char *label, const char *value, bool secret, bool focus, bool reveal) {
	ui_text(F_X, y - 15, 0.4f, COL_MUTED, 0, label);
	if (focus) rrect(F_X - 2, y - 2, F_W + 4, F_H + 4, 8, COL_ACCENT);
	rrect(F_X, y, F_W, F_H, 7, COL_PANEL);
	char shown[128];
	if (!value[0]) { ui_text(F_X + 10, y + 8, 0.5f, COL_LINE, 0, "Toca para escribir"); return; }
	if (secret && !reveal) { size_t n = strlen(value); if (n > 40) n = 40; memset(shown, '*', n); shown[n] = 0; }
	else snprintf(shown, sizeof shown, "%s", value);
	const char *p = shown;                                          // si no cabe, se muestra el final
	float maxw = F_W - 20 - (secret ? EYE_W : 0);
	while (*p && text_w(p, 0.5f) > maxw) p++;
	ui_text(F_X + 10, y + 8, 0.5f, COL_TEXT, 0, p);
}

static const char *dots(const char *base, char *buf, size_t n) {
	snprintf(buf, n, "%s%.*s", base, (int)((osGetTime() / 400) % 4), "...");
	return buf;
}

static void login_draw(C3D_RenderTarget *top, C3D_RenderTarget *bot, const LoginState *s, const char *version, bool busy) {
	ui_frame_begin();
	C3D_FrameBegin(C3D_FRAME_SYNCDRAW);
	C2D_TargetClear(top, C(0, 0, 0)); C2D_SceneBegin(top);
	top_background(version, "Construye y juega en 3DS y en la web");
	C2D_TargetClear(bot, COL_BG); C2D_SceneBegin(bot);
	ui_text(160, 8, 0.65f, COL_TEXT, C2D_AlignCenter, "Iniciar sesion");
	bool f = !busy;
	field(EMAIL_Y, "EMAIL", s->email, false, f && s->focus == 0, true);
	field(PASS_Y, "CONTRASENA", s->pass, true, f && s->focus == 1, s->show);
	rrect(F_X + F_W - EYE_W, PASS_Y + 4, EYE_W - 4, F_H - 8, 6, COL_LINE);            // ojo: mostrar/ocultar
	ui_text(F_X + F_W - EYE_W / 2 - 2, PASS_Y + 8, 0.4f, COL_TEXT, C2D_AlignCenter, s->show ? "Ocultar" : "Ver");
	if (f && s->focus == 2) rrect(F_X - 2, CHK_Y - 2, 22, 22, 5, COL_ACCENT);
	rrect(F_X, CHK_Y, 18, 18, 4, s->remember ? COL_GREEN : COL_PANEL);
	if (s->remember) ui_text(F_X + 9, CHK_Y + 1, 0.45f, COL_TEXT, C2D_AlignCenter, "x");
	ui_text(F_X + 28, CHK_Y + 1, 0.45f, COL_TEXT, 0, "Recordar mi email");
	button(F_X, BTN_Y, ENTER_W, BTN_H, COL_GREEN, f && s->focus == 3, "Entrar", 0.65f);
	button(QR_X, BTN_Y, QR_W, BTN_H, COL_ACCENT, f && s->focus == 4, "Con QR", 0.5f);
	if (s->msg) ui_text(160, 228, 0.42f, s->msg_color, C2D_AlignCenter, s->msg);
	C3D_FrameEnd(0);
}

// Pantalla de inicio de sesión con QR: la 3DS muestra un QR; el móvil lo escanea, inicia sesión y autoriza
static bool qr_screen(C3D_RenderTarget *top, C3D_RenderTarget *bot, Session *sess, const char *version, const char **why) {
	static LinkJob job; memset(&job, 0, sizeof job);
	Thread th = spawn(link_thread, &job);
	if (!th) { *why = "No se pudo crear el hilo de red"; return false; }
	static uint8_t tmp[qrcodegen_BUFFER_LEN_FOR_VERSION(10)], qr[qrcodegen_BUFFER_LEN_FOR_VERSION(10)];
	bool have_qr = false; char url[128] = "";
	bool ok = false;

	while (aptMainLoop()) {
		hidScanInput();
		u32 down = hidKeysDown();
		bool cancel = (down & (KEY_B | KEY_START));
		if (down & KEY_TOUCH) { touchPosition t; hidTouchRead(&t); if (hit(t, 60, 186, 200, 40)) cancel = true; }
		if (cancel) break;
		if (job.state == 1 && !have_qr) {
			snprintf(url, sizeof url, "%s/#link/%s", WEB_URL, job.code);
			have_qr = qrcodegen_encodeText(url, tmp, qr, qrcodegen_Ecc_MEDIUM, 1, 10, qrcodegen_Mask_AUTO, true);
		}
		if (job.state == 2) { *sess = job.sess; ok = true; break; }
		if (job.state == 3) { *why = job.err; break; }

		ui_frame_begin();
		C3D_FrameBegin(C3D_FRAME_SYNCDRAW);
		C2D_TargetClear(top, C(0xFF, 0xFF, 0xFF)); C2D_SceneBegin(top);
		C2D_DrawRectangle(0, 0, 0, 400, 240, C(0x16, 0x1B, 0x33), C(0x1B, 0x2B, 0x5E), C(0x0B, 0x4D, 0x3B), C(0x10, 0x20, 0x2A));
		if (have_qr) {
			int size = qrcodegen_getSize(qr), scale = 224 / (size + 8); if (scale < 2) scale = 2;
			int tot = (size + 8) * scale, ox = (400 - tot) / 2, oy = (240 - tot) / 2;
			rect(ox - 4, oy - 4, tot + 8, tot + 8, C(255, 255, 255));
			for (int y = 0; y < size; y++) for (int x = 0; x < size; x++)
				if (qrcodegen_getModule(qr, x, y)) rect(ox + (x + 4) * scale, oy + (y + 4) * scale, scale, scale, C(0, 0, 0));
		} else {
			char b[32]; ui_text(200, 108, 0.7f, COL_TEXT, C2D_AlignCenter, dots("Pidiendo codigo", b, sizeof b));
		}
		C2D_TargetClear(bot, COL_BG); C2D_SceneBegin(bot);
		ui_text(160, 10, 0.6f, COL_TEXT, C2D_AlignCenter, "Entrar con otro dispositivo");
		ui_text(160, 42, 0.45f, COL_MUTED, C2D_AlignCenter, "1. Escanea el QR con tu movil o tablet");
		ui_text(160, 60, 0.45f, COL_MUTED, C2D_AlignCenter, "2. Inicia sesion y pulsa Autorizar");
		if (have_qr) {
			rrect(70, 90, 180, 46, 8, COL_PANEL);
			ui_text(160, 96, 0.95f, COL_TEXT, C2D_AlignCenter, job.code);
			ui_text(160, 142, 0.38f, COL_MUTED, C2D_AlignCenter, "o escribe el codigo en " WEB_HOST "/#link");
			char b[40]; ui_text(160, 160, 0.42f, COL_ACCENT, C2D_AlignCenter, dots("Esperando", b, sizeof b));
		}
		button(60, 186, 200, 40, C(0xC0, 0x39, 0x2B), false, "Cancelar", 0.5f);
		C3D_FrameEnd(0);
	}
	job.cancel = true; join(th);
	return ok;
}

bool ui_login(C3D_RenderTarget *top, C3D_RenderTarget *bot, Session *sess, const char *version) {
	LoginState s = {.remember = true, .focus = 0, .msg = "Arriba/Abajo + A, o toca la pantalla", .msg_color = COL_MUTED};
	load_email(s.email, sizeof s.email);
	if (s.email[0]) s.focus = 1;
	static AuthJob job;

	// ¿Hay una sesión guardada de una vinculación anterior? Se comprueba y se entra directamente.
	if (load_session(sess)) {
		memset(&job, 0, sizeof job); job.kind = 1; job.sess = sess;
		Thread th = spawn(auth_thread, &job);
		if (th) {
			s.msg = "Reanudando sesion"; s.msg_color = COL_TEXT;
			while (aptMainLoop() && job.state == 0) {
				hidScanInput(); if (hidKeysDown() & KEY_START) { join(th); return false; }   // (join espera a que acabe la petición)
				char b[40]; LoginState tmp = s; tmp.msg = dots("Reanudando sesion", b, sizeof b); login_draw(top, bot, &tmp, version, true);
			}
			join(th);
			if (job.state == 1) return true;
			ui_forget_session(); s.msg = "La sesion guardada ha caducado"; s.msg_color = COL_RED;
		}
	}

	while (aptMainLoop()) {
		hidScanInput();
		u32 down = hidKeysDown();
		if (down & KEY_START) return false;
		int act = -1;
		if (down & KEY_DDOWN) s.focus = (s.focus + 1) % 5;
		if (down & KEY_DUP) s.focus = (s.focus + 4) % 5;
		if (down & KEY_A) act = s.focus;
		if (down & KEY_X) s.show = !s.show;
		if (down & KEY_TOUCH) {
			touchPosition t; hidTouchRead(&t);
			if (hit(t, F_X + F_W - EYE_W, PASS_Y, EYE_W, F_H)) s.show = !s.show;
			else if (hit(t, F_X, EMAIL_Y, F_W, F_H)) act = s.focus = 0;
			else if (hit(t, F_X, PASS_Y, F_W, F_H)) act = s.focus = 1;
			else if (hit(t, F_X, CHK_Y - 4, F_W, 26)) act = s.focus = 2;
			else if (hit(t, F_X, BTN_Y, ENTER_W, BTN_H)) act = s.focus = 3;
			else if (hit(t, QR_X, BTN_Y, QR_W, BTN_H)) act = s.focus = 4;
		}
		if (act == 0 && edit_text(s.email, sizeof s.email, "Email", false)) { s.msg = NULL; s.focus = 1; }
		else if (act == 1 && edit_text(s.pass, sizeof s.pass, "Contrasena", true)) { s.msg = NULL; s.focus = 3; }
		else if (act == 2) s.remember = !s.remember;
		else if (act == 3) {
			if (!s.email[0] || !s.pass[0]) { s.msg = "Escribe tu email y tu contrasena"; s.msg_color = COL_RED; }
			else {
				memset(&job, 0, sizeof job); job.sess = sess;
				snprintf(job.email, sizeof job.email, "%s", s.email); snprintf(job.pass, sizeof job.pass, "%s", s.pass);
				Thread th = spawn(auth_thread, &job);
				if (!th) { s.msg = "No se pudo crear el hilo de red"; s.msg_color = COL_RED; }
				else {
					while (aptMainLoop() && job.state == 0) {          // la UI sigue viva mientras conecta
						hidScanInput();
						char b[40]; LoginState tmp = s; tmp.msg = dots("Conectando", b, sizeof b); tmp.msg_color = COL_TEXT;
						login_draw(top, bot, &tmp, version, true);
					}
					join(th);
					if (job.state == 1) { save_email(s.email, s.remember); return true; }
					s.msg = net_login_error(); s.msg_color = COL_RED;
				}
			}
		}
		else if (act == 4) {
			const char *why = NULL;
			if (qr_screen(top, bot, sess, version, &why)) { save_session(sess); return true; }
			if (why) { s.msg = why; s.msg_color = COL_RED; } else s.msg = NULL;
		}
		login_draw(top, bot, &s, version, false);
	}
	return false;
}

void ui_message(C3D_RenderTarget *top, C3D_RenderTarget *bot, const char *title, const char *msg) {
	while (aptMainLoop()) {
		hidScanInput();
		if (hidKeysDown() & KEY_START) return;
		ui_frame_begin();
		C3D_FrameBegin(C3D_FRAME_SYNCDRAW);
		C2D_TargetClear(top, C(0, 0, 0)); C2D_SceneBegin(top);
		top_background("", title);
		C2D_TargetClear(bot, COL_BG); C2D_SceneBegin(bot);
		ui_text(160, 20, 0.65f, COL_TEXT, C2D_AlignCenter, title);
		char buf[256]; snprintf(buf, sizeof buf, "%s", msg);        // el mensaje usa \n para separar líneas
		int line = 0;
		for (char *p = strtok(buf, "\n"); p; p = strtok(NULL, "\n"), line++) ui_text(20, 64 + line * 18, 0.45f, COL_MUTED, 0, p);
		ui_text(160, 215, 0.45f, COL_MUTED, C2D_AlignCenter, "START para salir");
		C3D_FrameEnd(0);
	}
}

// ---------- panel inferior en juego ----------
enum { SW_Y = 150, SW_W = 40, SW_GAP = 8, BTN2_Y = 192, BTN2_H = 36, BTN2_W = 86, BTN2_GAP = 11 };

void ui_game_bottom(const Session *s, const Remote *rem, int nr, int kind, const char *version) {
	rect(0, 0, 320, 26, COL_PANEL);
	char head[80]; snprintf(head, sizeof head, "Blocksy v%s", version);
	ui_text(10, 4, 0.5f, COL_TEXT, 0, head);
	ui_text(310, 5, 0.45f, COL_MUTED, C2D_AlignRight, s->username);

	char t[48]; snprintf(t, sizeof t, "Jugadores en linea (%d)", nr + 1);
	ui_text(10, 32, 0.45f, COL_MUTED, 0, t);
	int row = 0;
	C2D_DrawCircleSolid(18, 56, 0.2f, 4, s->color); ui_text(28, 48, 0.45f, COL_TEXT, 0, s->username); row++;
	for (int i = 0; i < nr && row < 5; i++, row++) {
		float y = 48 + row * 16;
		C2D_DrawCircleSolid(18, y + 8, 0.2f, 4, rem[i].color);
		ui_text(28, y, 0.45f, COL_TEXT, 0, rem[i].name);
		if (rem[i].is3ds) { rrect(150, y + 1, 30, 13, 4, C(0xE6, 0x00, 0x12)); ui_text(165, y + 1, 0.32f, COL_TEXT, C2D_AlignCenter, "3DS"); }
	}
	ui_text(310, 48, 0.36f, COL_MUTED, C2D_AlignRight, "A saltar  X poner");
	ui_text(310, 62, 0.36f, COL_MUTED, C2D_AlignRight, "Y romper  L/R camara");

	ui_text(10, SW_Y - 17, 0.4f, COL_MUTED, 0, "Bloque");
	for (int i = 0; i < NPALETTE; i++) {
		float x = F_X + i * (SW_W + SW_GAP);
		if (i == kind) rrect(x - 3, SW_Y - 3, SW_W + 6, 32, 7, COL_TEXT);
		rrect(x, SW_Y, SW_W, 26, 5, ui_palette[i]);
	}
	button(F_X, BTN2_Y, BTN2_W, BTN2_H, COL_ACCENT, false, "Chat", 0.5f);
	button(F_X + BTN2_W + BTN2_GAP, BTN2_Y, BTN2_W, BTN2_H, C(0xC0, 0x39, 0x2B), false, "Salir", 0.5f);
	button(F_X + 2 * (BTN2_W + BTN2_GAP), BTN2_Y, BTN2_W, BTN2_H, COL_PANEL, false, "Cuenta", 0.5f);
}

int ui_game_touch(int x, int y) {
	touchPosition t = {(u16)x, (u16)y};
	for (int i = 0; i < NPALETTE; i++) if (hit(t, F_X + i * (SW_W + SW_GAP), SW_Y - 4, SW_W, 34)) return UI_COLOR0 + i;
	if (hit(t, F_X, BTN2_Y, BTN2_W, BTN2_H)) return UI_CHAT;
	if (hit(t, F_X + BTN2_W + BTN2_GAP, BTN2_Y, BTN2_W, BTN2_H)) return UI_QUIT;
	if (hit(t, F_X + 2 * (BTN2_W + BTN2_GAP), BTN2_Y, BTN2_W, BTN2_H)) return UI_LOGOUT;
	return UI_NONE;
}
