// Interfaz táctil de Blocksy (citro2d): login, mensajes y panel de la pantalla inferior.
#include "ui.h"
#include <math.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

const u32 ui_palette[NPALETTE] = {0xFFE8E8E8, 0xFF3C4CE7, 0xFF129CF3, 0xFF71CC2E, 0xFFDB9834, 0xFFB6599B};

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

// ---------- pantalla de login ----------
typedef struct { char email[96], pass[64]; bool remember, show; int focus; const char *msg; u32 msg_color; } LoginState;

// Posiciones (pantalla inferior 320x240)
enum { F_X = 20, F_W = 280, F_H = 34, EMAIL_Y = 46, PASS_Y = 100, CHK_Y = 148, BTN_Y = 184, BTN_H = 40, EYE_W = 44 };
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

static void login_draw(C3D_RenderTarget *top, C3D_RenderTarget *bot, const LoginState *s, const char *version) {
	ui_frame_begin();
	C3D_FrameBegin(C3D_FRAME_SYNCDRAW);
	C2D_TargetClear(top, C(0, 0, 0)); C2D_SceneBegin(top);
	top_background(version, "Construye y juega en 3DS y en la web");
	C2D_TargetClear(bot, COL_BG); C2D_SceneBegin(bot);
	ui_text(160, 8, 0.65f, COL_TEXT, C2D_AlignCenter, "Iniciar sesion");
	field(EMAIL_Y, "EMAIL", s->email, false, s->focus == 0, true);
	field(PASS_Y, "CONTRASENA", s->pass, true, s->focus == 1, s->show);
	// ojo: mostrar/ocultar contraseña
	rrect(F_X + F_W - EYE_W, PASS_Y + 4, EYE_W - 4, F_H - 8, 6, COL_LINE);
	ui_text(F_X + F_W - EYE_W / 2 - 2, PASS_Y + 8, 0.4f, COL_TEXT, C2D_AlignCenter, s->show ? "Ocultar" : "Ver");
	// recordar
	if (s->focus == 2) rrect(F_X - 2, CHK_Y - 2, 22, 22, 5, COL_ACCENT);
	rrect(F_X, CHK_Y, 18, 18, 4, s->remember ? COL_GREEN : COL_PANEL);
	if (s->remember) ui_text(F_X + 9, CHK_Y + 1, 0.45f, COL_TEXT, C2D_AlignCenter, "x");
	ui_text(F_X + 28, CHK_Y + 1, 0.45f, COL_TEXT, 0, "Recordar mi email");
	button(F_X, BTN_Y, F_W, BTN_H, COL_GREEN, s->focus == 3, "Entrar", 0.65f);
	if (s->msg) ui_text(160, 228, 0.42f, s->msg_color, C2D_AlignCenter, s->msg);
	C3D_FrameEnd(0);
}

bool ui_login(C3D_RenderTarget *top, C3D_RenderTarget *bot, Session *sess, const char *version) {
	LoginState s = {.remember = true, .focus = 0, .msg = "Arriba/Abajo + A, o toca la pantalla", .msg_color = COL_MUTED};
	load_email(s.email, sizeof s.email);
	if (s.email[0]) s.focus = 1;

	while (aptMainLoop()) {
		hidScanInput();
		u32 down = hidKeysDown();
		if (down & KEY_START) return false;
		int act = -1;
		if (down & KEY_DDOWN) s.focus = (s.focus + 1) % 4;
		if (down & KEY_DUP) s.focus = (s.focus + 3) % 4;
		if (down & KEY_A) act = s.focus;
		if (down & KEY_X) s.show = !s.show;
		if (down & KEY_TOUCH) {
			touchPosition t; hidTouchRead(&t);
			if (hit(t, F_X + F_W - EYE_W, PASS_Y, EYE_W, F_H)) s.show = !s.show;
			else if (hit(t, F_X, EMAIL_Y, F_W, F_H)) act = s.focus = 0;
			else if (hit(t, F_X, PASS_Y, F_W, F_H)) act = s.focus = 1;
			else if (hit(t, F_X, CHK_Y - 4, F_W, 26)) act = s.focus = 2;
			else if (hit(t, F_X, BTN_Y, F_W, BTN_H)) act = s.focus = 3;
		}
		if (act == 0 && edit_text(s.email, sizeof s.email, "Email", false)) { s.msg = NULL; s.focus = 1; }
		else if (act == 1 && edit_text(s.pass, sizeof s.pass, "Contrasena", true)) { s.msg = NULL; s.focus = 3; }
		else if (act == 2) s.remember = !s.remember;
		else if (act == 3) {
			if (!s.email[0] || !s.pass[0]) { s.msg = "Escribe tu email y tu contrasena"; s.msg_color = COL_RED; }
			else {
				s.msg = "Conectando..."; s.msg_color = COL_TEXT;
				login_draw(top, bot, &s, version);                     // se ve el aviso mientras dura la petición
				if (net_login(sess, s.email, s.pass)) { save_email(s.email, s.remember); return true; }
				s.msg = net_login_error(); s.msg_color = COL_RED;
			}
		}
		login_draw(top, bot, &s, version);
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
enum { SW_Y = 150, SW_W = 40, SW_GAP = 8, BTN2_Y = 192, BTN2_H = 36, BTN2_W = 130 };

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
	button(F_X, BTN2_Y, BTN2_W, BTN2_H, COL_ACCENT, false, "Chat", 0.55f);
	button(F_X + 150, BTN2_Y, BTN2_W, BTN2_H, C(0xC0, 0x39, 0x2B), false, "Salir", 0.55f);
}

int ui_game_touch(int x, int y) {
	touchPosition t = {(u16)x, (u16)y};
	for (int i = 0; i < NPALETTE; i++) if (hit(t, F_X + i * (SW_W + SW_GAP), SW_Y - 4, SW_W, 34)) return UI_COLOR0 + i;
	if (hit(t, F_X, BTN2_Y, BTN2_W, BTN2_H)) return UI_CHAT;
	if (hit(t, F_X + 150, BTN2_Y, BTN2_W, BTN2_H)) return UI_QUIT;
	return UI_NONE;
}
