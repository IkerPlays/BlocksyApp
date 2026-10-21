// Interfaz táctil de Blocksy (citro2d): login, mensajes y panel de la pantalla inferior.
#include "ui.h"
#include "config.h"
#include "qrcodegen.h"
#include "avatar3d.h"
#include <math.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

const u32 ui_palette[NPALETTE] = {0xFFE8E8E8, 0xFF3C4CE7, 0xFF129CF3, 0xFF71CC2E, 0xFFDB9834, 0xFFB6599B,
	0xFF0FC4F1, 0xFF9CBC1A, 0xFF9D6BFF, 0xFF345E8B, 0xFF574F4B, 0xFFFFD67E};   // ABGR; los mismos 12 que la web

// Web donde se autoriza el QR (cámbiala definiendo WEB_URL / WEB_HOST en config.h)
#ifndef WEB_URL
#define WEB_URL "https://blocksyweb.netlify.app"
#define WEB_HOST "blocksyweb.netlify.app"
#endif

// Profundidad base: lo que se dibuja con z mayor queda por encima (citro2d usa test de profundidad, no solo el orden de dibujo).
// La ficha de un juego y los avisos se dibujan con una base mayor para tapar la página que tienen debajo.
static float g_z;
void ui_set_depth(float z) { g_z = z; }
float ui_get_depth(void) { return g_z; }

static C2D_TextBuf tbuf;
void ui_init(void) { tbuf = C2D_TextBufNew(4096); }
void ui_exit(void) { C2D_TextBufDelete(tbuf); }
void ui_frame_begin(void) { C2D_TextBufClear(tbuf); }

void ui_text(float x, float y, float scale, u32 color, u32 align, const char *s) {
	C2D_Text t; C2D_TextParse(&t, tbuf, s); C2D_TextOptimize(&t);
	C2D_DrawText(&t, C2D_WithColor | align, x, y, g_z + 0.5f, scale, scale, color);
}
static float text_w(const char *s, float scale) {
	C2D_Text t; float w, h; C2D_TextParse(&t, tbuf, s); C2D_TextGetDimensions(&t, scale, scale, &w, &h); return w;
}

// ---------- primitivas ----------
static void rect(float x, float y, float w, float h, u32 c) { C2D_DrawRectSolid(x, y, (g_z + 0.2f), w, h, c); }
static void rrect(float x, float y, float w, float h, float r, u32 c) {
	rect(x + r, y, w - 2 * r, h, c); rect(x, y + r, w, h - 2 * r, c);
	C2D_DrawCircleSolid(x + r, y + r, (g_z + 0.2f), r, c); C2D_DrawCircleSolid(x + w - r, y + r, (g_z + 0.2f), r, c);
	C2D_DrawCircleSolid(x + r, y + h - r, (g_z + 0.2f), r, c); C2D_DrawCircleSolid(x + w - r, y + h - r, (g_z + 0.2f), r, c);
}
static void quad(float x0, float y0, float x1, float y1, float x2, float y2, float x3, float y3, u32 c) {
	C2D_DrawTriangle(x0, y0, c, x1, y1, c, x2, y2, c, (g_z + 0.2f));
	C2D_DrawTriangle(x0, y0, c, x2, y2, c, x3, y3, c, (g_z + 0.2f));
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

// ---------- primitivas exportadas (las usa app.c) ----------
void ui_rect(float x, float y, float w, float h, u32 c) { rect(x, y, w, h, c); }
void ui_rrect(float x, float y, float w, float h, float r, u32 c) { rrect(x, y, w, h, r, c); }
void ui_cube(float cx, float cy, float s, u32 c) { cube(cx, cy, s, c); }
void ui_button(float x, float y, float w, float h, u32 c, bool focus, const char *label, float scale) { button(x, y, w, h, c, focus, label, scale); }
float ui_text_width(const char *s, float scale) { return text_w(s, scale); }
u32 ui_shade(u32 c, float f) { return shade(c, f); }
u32 ui_alpha(u32 c, int a) { return (c & 0x00FFFFFF) | ((u32)a << 24); }

// HSL (h 0-359, s/l 0-100) -> ABGR
u32 ui_hsl(float h, float s, float l) {
	h = fmodf(h, 360.0f); if (h < 0) h += 360; s /= 100; l /= 100;
	float c = (1 - fabsf(2 * l - 1)) * s, x = c * (1 - fabsf(fmodf(h / 60, 2) - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
	if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
	else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
	return C2D_Color32((u32)((r + m) * 255), (u32)((g + m) * 255), (u32)((b + m) * 255), 255);
}
// Miniatura de juego igual que en la web: degradado hsl(h) -> hsl(h+40), rejilla suave y cubo
void ui_thumb(float x, float y, float s, int hue, int players) {
	u32 c1 = ui_hsl(hue, 70, 55), c2 = ui_hsl(hue + 40, 65, 28), mid = ui_hsl(hue + 20, 68, 41);
	C2D_DrawRectangle(x, y, (g_z + 0.2f), s, s, c1, mid, mid, c2);
	u32 g = C2D_Color32(255, 255, 255, 38);
	for (float o = s / 4; o < s - 1; o += s / 4) { rect(x + o, y, 1, s, g); rect(x, y + o, s, 1, g); }
	cube(x + s / 2, y + s / 2 - s * .02f, s * .27f, C2D_Color32(235, 240, 255, 255));
	if (players > 0) {
		char b[24]; snprintf(b, sizeof b, "%d jugando", players);
		float w = text_w(b, 0.36f) + 14;
		rrect(x + 4, y + s - 17, w, 13, 4, C2D_Color32(0, 0, 0, 170));
		C2D_DrawCircleSolid(x + 10, y + s - 10.5f, (g_z + 0.2f), 2.2f, COL_GREEN);
		ui_text(x + 15, y + s - 17, 0.36f, COL_TEXT, 0, b);
	}
}
// Foto de perfil: la cabeza del avatar (mismo aspecto que en la web) sobre un círculo. online: -1 sin punto, 0/1 con punto de estado
void ui_avatar(float cx, float cy, float r, u32 color, int online, const char *name) {
	AvStyle st = av_style(name ? name : "", color);
	C2D_DrawCircleSolid(cx, cy, (g_z + 0.2f), r, C(0x2A, 0x36, 0x4A));
	C2D_DrawCircleSolid(cx, cy - r * 0.15f, (g_z + 0.2f), r * 0.82f, C(0x3A, 0x4F, 0x6B));
	float z = g_z + 0.22f;
	// hombros (trapecio que cabe dentro del círculo) y cuello
	C2D_DrawTriangle(cx - r * .60f, cy + r * .50f, st.shirt, cx + r * .60f, cy + r * .50f, st.shirt, cx + r * .36f, cy + r * .90f, st.shirt, z);
	C2D_DrawTriangle(cx - r * .60f, cy + r * .50f, st.shirt, cx + r * .36f, cy + r * .90f, st.shirt, cx - r * .36f, cy + r * .90f, st.shirt, z);
	C2D_DrawRectSolid(cx - r * .15f, cy + r * .34f, z, r * .30f, r * .20f, shade(st.skin, .82f));
	// cabeza
	float hx = cx - r * .40f, hy = cy - r * .62f, hw = r * .80f, hh = r * .96f;
	C2D_DrawRectSolid(hx, hy, z, hw, hh, st.skin);
	C2D_DrawRectSolid(hx, hy, z, hw * .12f, hh, shade(st.skin, .9f));
	// pelo
	C2D_DrawRectSolid(hx - r * .04f, hy - r * .10f, z, hw + r * .08f, hh * .24f, st.hair);
	if (st.hair_style == 1) { C2D_DrawRectSolid(hx - r * .04f, hy - r * .10f, z, hw * .16f, hh * .7f, st.hair); C2D_DrawRectSolid(hx + hw * .88f, hy - r * .10f, z, hw * .16f, hh * .7f, st.hair); }
	else if (st.hair_style == 2) { for (int i = 0; i < 3; i++) C2D_DrawRectSolid(hx + hw * (0.02f + i * 0.34f), hy - r * .24f, z, hw * .28f, r * .16f, st.hair); }
	else C2D_DrawRectSolid(hx, hy + hh * .20f, z, hw, hh * .08f, st.hair);
	// cara
	u32 dark = C(0x1b, 0x1b, 0x1b);
	C2D_DrawRectSolid(hx + hw * .20f, hy + hh * .46f, z, hw * .17f, hh * .17f, dark); C2D_DrawRectSolid(hx + hw * .63f, hy + hh * .46f, z, hw * .17f, hh * .17f, dark);
	C2D_DrawRectSolid(hx + hw * .32f, hy + hh * .76f, z, hw * .36f, hh * .06f, C(0x5b, 0x2d, 0x1a));
	if (online >= 0) {
		C2D_DrawCircleSolid(cx + r * .72f, cy + r * .72f, (g_z + 0.3f), r * .34f + 1.5f, COL_BG);
		C2D_DrawCircleSolid(cx + r * .72f, cy + r * .72f, (g_z + 0.31f), r * .34f, online ? COL_GREEN : C(0x6B, 0x70, 0x77));
	}
}
// Iconos sencillos del menú lateral (16x16)
void ui_icon(int kind, float x, float y, u32 c) {
	switch (kind) {
	case 0: quad(x + 8, y + 1, x + 15, y + 8, x + 1, y + 8, x + 8, y + 1, c); rect(x + 3, y + 8, 10, 7, c); rect(x + 7, y + 10, 3, 5, COL_PANEL); break;           // inicio
	case 1: C2D_DrawCircleSolid(x + 8, y + 8, (g_z + 0.2f), 7.5f, c); C2D_DrawCircleSolid(x + 8, y + 8, (g_z + 0.2f), 5.5f, COL_PANEL); quad(x + 4, y + 12, x + 7, y + 7, x + 12, y + 4, x + 9, y + 9, c); break; // descubrir
	case 2: C2D_DrawCircleSolid(x + 8, y + 4.5f, (g_z + 0.2f), 3.6f, c); rrect(x + 3, y + 9, 10, 7, 3, c); break;                                                         // avatar
	case 3: C2D_DrawCircleSolid(x + 5, y + 5, (g_z + 0.2f), 3, c); rrect(x + 1, y + 9, 8, 6, 3, c); C2D_DrawCircleSolid(x + 11, y + 6, (g_z + 0.2f), 2.6f, shade(c, .8f)); rrect(x + 8, y + 10, 7, 5, 2.5f, shade(c, .8f)); break; // amigos
	case 4: rrect(x + 1, y + 1, 14, 14, 3, c); rect(x + 7, y + 4, 2, 8, COL_PANEL); rect(x + 4, y + 7, 8, 2, COL_PANEL); break;                                   // crear
	case 5: C2D_DrawCircleSolid(x + 8, y + 8, (g_z + 0.2f), 7, c); C2D_DrawCircleSolid(x + 8, y + 8, (g_z + 0.2f), 3, COL_PANEL); break;                                           // ajustes
	case 7: C2D_DrawCircleSolid(x + 8, y + 8, (g_z + 0.2f), 7.5f, c); rect(x + 6.5f, y + 3.5f, 3, 5, COL_PANEL); quad(x + 4, y + 8, x + 12, y + 8, x + 8, y + 12.5f, x + 8, y + 12.5f, COL_PANEL); break;  // actualizar (flecha abajo)
	default: rrect(x + 2, y + 2, 12, 12, 3, c); rect(x + 7, y + 5, 2, 6, COL_PANEL); break;                                                                       // salir
	}
}

void ui_top_background(const char *version, const char *subtitle) {
	C2D_DrawRectangle(0, 0, g_z, 400, 240, C(0x16, 0x1B, 0x33), C(0x1B, 0x2B, 0x5E), C(0x0B, 0x4D, 0x3B), C(0x10, 0x20, 0x2A));
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

typedef struct { volatile int state; /* 0 en curso, 1 ok, 2 fallo */ int kind; /* 0 login, 1 reanudar (secret), 2 reanudar (refresh token) */ Session *sess; char email[96], pass[64], user[24]; bool signup; } AuthJob;
static void auth_thread(void *a) {
	AuthJob *j = a;
	bool ok = j->kind == 0 ? net_login(j->sess, j->email, j->pass, j->signup ? j->user : NULL)
	        : j->kind == 2 ? net_refresh(j->sess, true) : net_resume(j->sess);
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

// ---------- cuenta guardada: refresh token (email y contraseña) o secret de sesión (QR); la contraseña nunca se guarda ----------
#define SESSION_FILE SAVE_DIR "/session.txt"
// 0 = no hay nada guardado, 1 = secret de sesión (QR), 2 = refresh token (cuenta con email)
static int load_session(Session *s) {
	FILE *f = fopen(SESSION_FILE, "r"); if (!f) return 0;
	char line[200]; int kind = 0;
	while (fgets(line, sizeof line, f)) {
		line[strcspn(line, "\r\n")] = 0;
		if (!strncmp(line, "refresh=", 8) && strlen(line) > 12) { snprintf(s->refresh, sizeof s->refresh, "%s", line + 8); kind = 2; }
		else if (!strncmp(line, "secret=", 7) && strlen(line) > 30) { if (!kind) { snprintf(s->secret, sizeof s->secret, "%s", line + 7); kind = 1; } }
		else if (!kind && strlen(line) > 30 && !strchr(line, '=')) { snprintf(s->secret, sizeof s->secret, "%s", line); kind = 1; }   // formato antiguo
	}
	fclose(f); return kind;
}
void ui_save_session(const Session *s) {
	mkdir("sdmc:/3ds", 0777); mkdir(SAVE_DIR, 0777);
	FILE *f = fopen(SESSION_FILE, "w"); if (!f) return;
	if (s->refresh[0]) fprintf(f, "refresh=%s\n", s->refresh); else fprintf(f, "secret=%s\n", s->secret);
	fclose(f);
}
void ui_forget_session(void) { remove(SESSION_FILE); }

// ---------- pantalla de login ----------
typedef struct { char user[24], email[96], pass[64]; bool signup, remember, show; int focus; const char *msg; u32 msg_color; } LoginState;

// Pantalla inferior (320x240). Mismos elementos que la web: pestañas, campos con placeholder, Entrar / Crear cuenta
enum { F_X = 20, F_W = 280, F_H = 36, TAB_Y = 6, TAB_H = 26, EYE_W = 46, BTN_Y = 176, BTN_H = 44, ENTER_W = 168, QR_X = 196, QR_W = 104 };
enum { FLD_USER, FLD_EMAIL, FLD_PASS, FLD_CHECK, FLD_ENTER, FLD_QR, NFLD };
static int fld_y(const LoginState *s, int f) {
	if (s->signup) return f == FLD_USER ? 42 : f == FLD_EMAIL ? 86 : f == FLD_PASS ? 130 : 0;
	return f == FLD_EMAIL ? 42 : f == FLD_PASS ? 86 : f == FLD_CHECK ? 134 : 0;
}
static bool fld_visible(const LoginState *s, int f) {
	if (f == FLD_USER) return s->signup;
	if (f == FLD_CHECK || f == FLD_QR) return !s->signup;
	return true;
}
static bool hit(touchPosition t, int x, int y, int w, int h) { return t.px >= x && t.px < x + w && t.py >= y && t.py < y + h; }

static void field(float y, const char *placeholder, const char *value, bool secret, bool focus, bool reveal) {
	if (focus) rrect(F_X - 2, y - 2, F_W + 4, F_H + 4, 9, COL_ACCENT);
	rrect(F_X, y, F_W, F_H, 8, COL_PANEL2);
	char shown[128];
	if (!value[0]) { ui_text(F_X + 12, y + 9, 0.5f, COL_MUTED, 0, placeholder); return; }
	if (secret && !reveal) { size_t n = strlen(value); if (n > 40) n = 40; memset(shown, '*', n); shown[n] = 0; }
	else snprintf(shown, sizeof shown, "%s", value);
	const char *p = shown;                                          // si no cabe, se muestra el final
	float maxw = F_W - 24 - (secret ? EYE_W : 0);
	while (*p && text_w(p, 0.5f) > maxw) p++;
	ui_text(F_X + 12, y + 9, 0.5f, COL_TEXT, 0, p);
}

static const char *dots(const char *base, char *buf, size_t n) {
	snprintf(buf, n, "%s%.*s", base, (int)((osGetTime() / 400) % 4), "...");
	return buf;
}

static void login_draw(C3D_RenderTarget *top, C3D_RenderTarget *bot, const LoginState *s, const char *version, bool busy) {
	ui_frame_begin();
	C3D_FrameBegin(C3D_FRAME_SYNCDRAW);
	C2D_TargetClear(top, C(0, 0, 0)); C2D_SceneBegin(top);
	ui_top_background(version, "Construye, explora y juega con amigos en la web y en tu 3DS");
	C2D_TargetClear(bot, COL_BG); C2D_SceneBegin(bot);
	// pestañas (como en la web)
	rrect(F_X, TAB_Y, F_W, TAB_H, 8, COL_PANEL2);
	rrect(F_X + 3 + (s->signup ? F_W / 2 - 3 : 0), TAB_Y + 3, F_W / 2 - 3, TAB_H - 6, 6, COL_ACCENT_D);
	ui_text(F_X + F_W / 4, TAB_Y + 4, 0.5f, s->signup ? COL_MUTED : COL_TEXT, C2D_AlignCenter, "Entrar");
	ui_text(F_X + 3 * F_W / 4, TAB_Y + 4, 0.5f, s->signup ? COL_TEXT : COL_MUTED, C2D_AlignCenter, "Crear cuenta");
	bool f = !busy;
	if (s->signup) field(fld_y(s, FLD_USER), "Nombre de usuario", s->user, false, f && s->focus == FLD_USER, true);
	field(fld_y(s, FLD_EMAIL), "Email", s->email, false, f && s->focus == FLD_EMAIL, true);
	field(fld_y(s, FLD_PASS), "Contrasena", s->pass, true, f && s->focus == FLD_PASS, s->show);
	int py = fld_y(s, FLD_PASS);
	rrect(F_X + F_W - EYE_W, py + 5, EYE_W - 5, F_H - 10, 6, COL_LINE);                // ojo: mostrar/ocultar
	ui_text(F_X + F_W - EYE_W / 2 - 2, py + 9, 0.4f, COL_TEXT, C2D_AlignCenter, s->show ? "Ocultar" : "Ver");
	if (!s->signup) {
		int cy = fld_y(s, FLD_CHECK);
		if (f && s->focus == FLD_CHECK) rrect(F_X - 2, cy - 2, 22, 22, 5, COL_ACCENT);
		rrect(F_X, cy, 18, 18, 4, s->remember ? COL_GREEN : COL_PANEL2);
		if (s->remember) ui_text(F_X + 9, cy + 1, 0.45f, COL_TEXT, C2D_AlignCenter, "x");
		ui_text(F_X + 28, cy + 1, 0.45f, COL_TEXT, 0, "Mantener la sesion iniciada");
		button(F_X, BTN_Y, ENTER_W, BTN_H, COL_GREEN, f && s->focus == FLD_ENTER, "Entrar", 0.65f);
		button(QR_X, BTN_Y, QR_W, BTN_H, COL_ACCENT, f && s->focus == FLD_QR, "Con QR", 0.5f);
	} else {
		button(F_X, BTN_Y, F_W, BTN_H, COL_GREEN, f && s->focus == FLD_ENTER, "Crear cuenta", 0.65f);
	}
	if (s->msg) ui_text(160, 226, 0.42f, s->msg_color, C2D_AlignCenter, s->msg);
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
			snprintf(url, sizeof url, "%s/link/%s", WEB_URL, job.code);
			have_qr = qrcodegen_encodeText(url, tmp, qr, qrcodegen_Ecc_MEDIUM, 1, 10, qrcodegen_Mask_AUTO, true);
		}
		if (job.state == 2) { *sess = job.sess; ok = true; break; }
		if (job.state == 3) { *why = job.err; break; }

		ui_frame_begin();
		C3D_FrameBegin(C3D_FRAME_SYNCDRAW);
		C2D_TargetClear(top, C(0xFF, 0xFF, 0xFF)); C2D_SceneBegin(top);
		C2D_DrawRectangle(0, 0, g_z, 400, 240, C(0x16, 0x1B, 0x33), C(0x1B, 0x2B, 0x5E), C(0x0B, 0x4D, 0x3B), C(0x10, 0x20, 0x2A));
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
			ui_text(160, 142, 0.38f, COL_MUTED, C2D_AlignCenter, "o escribe el codigo en " WEB_HOST "/link");
			char b[40]; ui_text(160, 160, 0.42f, COL_ACCENT, C2D_AlignCenter, dots("Esperando", b, sizeof b));
		}
		button(60, 186, 200, 40, C(0xC0, 0x39, 0x2B), false, "Cancelar", 0.5f);
		C3D_FrameEnd(0);
	}
	job.cancel = true; join(th);
	return ok;
}

static void set_mode(LoginState *s, bool signup) {
	s->signup = signup; s->msg = NULL; s->focus = signup ? FLD_USER : (s->email[0] ? FLD_PASS : FLD_EMAIL);
}
static void focus_move(LoginState *s, int dir) {
	do s->focus = (s->focus + dir + NFLD) % NFLD; while (!fld_visible(s, s->focus) && s->focus != FLD_EMAIL && s->focus != FLD_PASS && s->focus != FLD_ENTER);
}

bool ui_login(C3D_RenderTarget *top, C3D_RenderTarget *bot, Session *sess, const char *version) {
	LoginState s = {.remember = true, .msg_color = COL_MUTED};
	load_email(s.email, sizeof s.email);
	set_mode(&s, false);
	s.msg = "Arriba/Abajo + A, o toca la pantalla";
	static AuthJob job;

	// ¿Hay una cuenta guardada? Se renueva (o se comprueba) y se entra directamente, sin pedir nada.
	int saved = load_session(sess);
	if (saved) {
		memset(&job, 0, sizeof job); job.kind = saved; job.sess = sess;
		Thread th = spawn(auth_thread, &job);
		if (th) {
			while (aptMainLoop() && job.state == 0) {
				hidScanInput(); if (hidKeysDown() & KEY_START) { join(th); return false; }   // (join espera a que acabe la petición)
				char b[40]; LoginState tmp = s; tmp.msg = dots("Entrando", b, sizeof b); tmp.msg_color = COL_TEXT; login_draw(top, bot, &tmp, version, true);
			}
			join(th);
			if (job.state == 1) { ui_save_session(sess); return true; }       // el refresh token rota: se guarda el nuevo
			ui_forget_session(); memset(sess, 0, sizeof *sess); s.msg = "La sesion guardada ha caducado"; s.msg_color = COL_RED;
		}
	}

	while (aptMainLoop()) {
		hidScanInput();
		u32 down = hidKeysDown();
		if (down & KEY_START) return false;
		int act = -1;
		if (down & KEY_DDOWN) focus_move(&s, 1);
		if (down & KEY_DUP) focus_move(&s, -1);
		if (down & (KEY_L | KEY_R)) set_mode(&s, !s.signup);
		if (down & KEY_A) act = s.focus;
		if (down & KEY_X) s.show = !s.show;
		if (down & KEY_TOUCH) {
			touchPosition t; hidTouchRead(&t);
			if (hit(t, F_X, TAB_Y, F_W, TAB_H)) { bool su = t.px >= F_X + F_W / 2; if (su != s.signup) set_mode(&s, su); }
			else if (hit(t, F_X + F_W - EYE_W, fld_y(&s, FLD_PASS), EYE_W, F_H)) s.show = !s.show;
			else if (s.signup && hit(t, F_X, fld_y(&s, FLD_USER), F_W, F_H)) act = s.focus = FLD_USER;
			else if (hit(t, F_X, fld_y(&s, FLD_EMAIL), F_W, F_H)) act = s.focus = FLD_EMAIL;
			else if (hit(t, F_X, fld_y(&s, FLD_PASS), F_W, F_H)) act = s.focus = FLD_PASS;
			else if (!s.signup && hit(t, F_X, fld_y(&s, FLD_CHECK) - 4, F_W, 26)) act = s.focus = FLD_CHECK;
			else if (hit(t, F_X, BTN_Y, s.signup ? F_W : ENTER_W, BTN_H)) act = s.focus = FLD_ENTER;
			else if (!s.signup && hit(t, QR_X, BTN_Y, QR_W, BTN_H)) act = s.focus = FLD_QR;
		}
		if (act == FLD_USER && s.signup && edit_text(s.user, sizeof s.user, "Nombre de usuario", false)) { s.msg = NULL; s.focus = FLD_EMAIL; }
		else if (act == FLD_EMAIL && edit_text(s.email, sizeof s.email, "Email", false)) { s.msg = NULL; s.focus = FLD_PASS; }
		else if (act == FLD_PASS && edit_text(s.pass, sizeof s.pass, "Contrasena", true)) { s.msg = NULL; s.focus = FLD_ENTER; }
		else if (act == FLD_CHECK && !s.signup) s.remember = !s.remember;
		else if (act == FLD_ENTER) {
			if (!s.email[0] || !s.pass[0] || (s.signup && !s.user[0])) { s.msg = s.signup ? "Rellena usuario, email y contrasena" : "Escribe tu email y tu contrasena"; s.msg_color = COL_RED; }
			else if (s.signup && strlen(s.user) < 3) { s.msg = "El usuario necesita al menos 3 letras"; s.msg_color = COL_RED; }
			else {
				memset(&job, 0, sizeof job); job.sess = sess; job.signup = s.signup;
				snprintf(job.email, sizeof job.email, "%s", s.email); snprintf(job.pass, sizeof job.pass, "%s", s.pass); snprintf(job.user, sizeof job.user, "%s", s.user);
				Thread th = spawn(auth_thread, &job);
				if (!th) { s.msg = "No se pudo crear el hilo de red"; s.msg_color = COL_RED; }
				else {
					while (aptMainLoop() && job.state == 0) {          // la UI sigue viva mientras conecta
						hidScanInput();
						char b[40]; LoginState tmp = s; tmp.msg = dots(s.signup ? "Creando cuenta" : "Conectando", b, sizeof b); tmp.msg_color = COL_TEXT;
						login_draw(top, bot, &tmp, version, true);
					}
					join(th);
					if (job.state == 1) { save_email(s.email, s.remember || s.signup); if (s.remember || s.signup) ui_save_session(sess); else ui_forget_session(); return true; }
					s.msg = net_login_error(); s.msg_color = COL_RED;
				}
			}
		}
		else if (act == FLD_QR && !s.signup) {
			const char *why = NULL;
			if (qr_screen(top, bot, sess, version, &why)) { ui_save_session(sess); return true; }
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
		ui_top_background("", title);
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
enum { SW_Y = 126, SW_W = 40, SW_GAP = 8, BTN2_Y = 192, BTN2_H = 36, BTN2_W = 86, BTN2_GAP = 11, EM_Y = 44, EM_W = 88, EM_H = 44, EM_GAP = 8 };

void ui_game_bottom(const Session *s, const Remote *rem, int nr, int kind, const char *game, const char *version, bool emote_menu) {
	rect(0, 0, 320, 26, COL_PANEL);
	rect(0, 26, 320, 1, COL_LINE);
	ui_text(10, 4, 0.5f, COL_TEXT, 0, game);
	ui_text(310, 5, 0.42f, COL_MUTED, C2D_AlignRight, version);

	if (emote_menu) {                                          // selector de emotes (tocar uno lo lanza; moverte o saltar lo corta)
		ui_text(160, 30, 0.45f, COL_MUTED, C2D_AlignCenter, "Elige un emote");
		for (int i = 0; i < NEMOTES; i++) {
			float x = F_X + (i % 3) * (EM_W + EM_GAP), y = EM_Y + 6 + (i / 3) * (EM_H + EM_GAP);
			button(x, y, EM_W, EM_H, i == 4 ? COL_PANEL2 : COL_ACCENT_D, false, AV_EMOTE_LABEL[i], 0.46f);
		}
		ui_text(160, 150, 0.36f, COL_MUTED, C2D_AlignCenter, "Moverte o saltar corta el emote");
	} else {
		char t[48]; snprintf(t, sizeof t, "Jugadores en linea (%d)", nr + 1);
		ui_text(10, 32, 0.45f, COL_MUTED, 0, t);
		int row = 0;
		ui_avatar(18, 56, 6, s->color, -1, s->username); ui_text(30, 48, 0.45f, COL_TEXT, 0, s->username); row++;
		for (int i = 0; i < nr && row < 4; i++, row++) {
			float y = 48 + row * 16;
			ui_avatar(18, y + 8, 6, rem[i].color, -1, rem[i].name);
			ui_text(30, y, 0.45f, COL_TEXT, 0, rem[i].name);
			if (rem[i].is3ds) { float bx = 30 + text_w(rem[i].name, 0.45f) + 8; rrect(bx, y + 1, 30, 13, 4, C(0xE6, 0x00, 0x12)); ui_text(bx + 15, y + 1, 0.32f, COL_TEXT, C2D_AlignCenter, "3DS"); }
		}
		ui_text(310, 48, 0.36f, COL_MUTED, C2D_AlignRight, "A saltar  B correr");
		ui_text(310, 62, 0.36f, COL_MUTED, C2D_AlignRight, "X poner  Y romper");

		for (int i = 0; i < NPALETTE; i++) {
			float x = F_X + (i % 6) * (SW_W + SW_GAP), y = SW_Y + (i / 6) * 30;
			if (i == kind) rrect(x - 3, y - 3, SW_W + 6, 30, 7, COL_TEXT);
			rrect(x, y, SW_W, 24, 5, ui_palette[i]);
		}
	}
	button(F_X, BTN2_Y, BTN2_W, BTN2_H, COL_ACCENT, false, "Chat", 0.48f);
	button(F_X + BTN2_W + BTN2_GAP, BTN2_Y, BTN2_W, BTN2_H, emote_menu ? COL_GREEN : COL_PANEL2, false, emote_menu ? "Cerrar" : "Emotes", 0.48f);
	button(F_X + 2 * (BTN2_W + BTN2_GAP), BTN2_Y, BTN2_W, BTN2_H, COL_PANEL2, false, "< Lobby", 0.48f);
}

int ui_game_touch(int x, int y, bool emote_menu) {
	touchPosition t = {(u16)x, (u16)y};
	if (emote_menu) for (int i = 0; i < NEMOTES; i++) if (hit(t, F_X + (i % 3) * (EM_W + EM_GAP), EM_Y + 6 + (i / 3) * (EM_H + EM_GAP), EM_W, EM_H)) return UI_EMOTE0 + i;
	if (!emote_menu) for (int i = 0; i < NPALETTE; i++) if (hit(t, F_X + (i % 6) * (SW_W + SW_GAP), SW_Y + (i / 6) * 30 - 4, SW_W, 32)) return UI_COLOR0 + i;
	if (hit(t, F_X, BTN2_Y, BTN2_W, BTN2_H)) return UI_CHAT;
	if (hit(t, F_X + BTN2_W + BTN2_GAP, BTN2_Y, BTN2_W, BTN2_H)) return UI_EMOTE_MENU;
	if (hit(t, F_X + 2 * (BTN2_W + BTN2_GAP), BTN2_Y, BTN2_W, BTN2_H)) return UI_QUIT;
	return UI_NONE;
}

#ifdef BLOCKSY_PREVIEW
// Solo para generar capturas en el ordenador (3ds/preview)
void ui_preview_login(C3D_RenderTarget *top, C3D_RenderTarget *bot, int signup, int busy, const char *version) {
	LoginState s = {.remember = true, .signup = signup != 0, .msg = "Arriba/Abajo + A, o toca la pantalla", .msg_color = COL_MUTED};
	snprintf(s.email, sizeof s.email, "ikerana35018santanaiker@gmail.com"); snprintf(s.pass, sizeof s.pass, "secreto123"); snprintf(s.user, sizeof s.user, "Iker");
	if (!signup) s.user[0] = 0;
	s.focus = FLD_PASS;
	if (busy) { s.msg = "Conectando..."; s.msg_color = COL_TEXT; }
	login_draw(top, bot, &s, version, busy != 0);
}
#endif
