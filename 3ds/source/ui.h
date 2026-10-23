#pragma once
#include <3ds.h>
#include <citro2d.h>
#include "net.h"

#define C(r, g, b)    C2D_Color32(r, g, b, 255)
// Paleta de la web (style.css)
#define COL_BG        C(0x19, 0x1A, 0x1C)
#define COL_PANEL     C(0x23, 0x25, 0x27)
#define COL_PANEL2    C(0x2D, 0x2F, 0x33)
#define COL_LINE      C(0x39, 0x3B, 0x3F)
#define COL_TEXT      C(0xF2, 0xF4, 0xF5)
#define COL_MUTED     C(0xA1, 0xA6, 0xAD)
#define COL_ACCENT    C(0x4D, 0x7B, 0xFF)
#define COL_ACCENT_D  C(0x33, 0x5F, 0xFF)
#define COL_GREEN     C(0x02, 0xB7, 0x57)
#define COL_RED       C(0xFF, 0x7A, 0x72)
#define COL_DANGER    C(0xE6, 0x45, 0x3D)

#define NPALETTE 12
extern const u32 ui_palette[NPALETTE];   // ABGR, mismos colores que la web

void ui_init(void);
void ui_exit(void);
void ui_frame_begin(void);               // llamar al principio de cada frame (limpia el buffer de texto)
void ui_set_depth(float z);              // base de profundidad para lo que se dibuje a partir de ahora (0 = normal)
float ui_get_depth(void);
void ui_text(float x, float y, float scale, u32 color, u32 align, const char *s);
float ui_text_width(const char *s, float scale);

// Primitivas compartidas con app.c
void ui_rect(float x, float y, float w, float h, u32 c);
void ui_rrect(float x, float y, float w, float h, float r, u32 c);
void ui_cube(float cx, float cy, float s, u32 c);
void ui_logo(float cx, float cy, float s);                 // logo de Blocksy
void ui_button(float x, float y, float w, float h, u32 c, bool focus, const char *label, float scale);
u32  ui_shade(u32 c, float f);
u32  ui_alpha(u32 c, int a);
u32  ui_hsl(float h, float s, float l);
void ui_thumb(float x, float y, float s, int hue, int players);   // miniatura de juego (como la web)
void ui_avatar(float cx, float cy, float r, u32 color, int online, const char *name);  // foto de perfil = cabeza del avatar; online: -1 sin punto, 0/1
void ui_icon(int kind, float x, float y, u32 c);                  // 0 inicio 1 descubrir 2 avatar 3 amigos 4 crear 5 ajustes 6 salir
void ui_top_background(const char *version, const char *subtitle);

// Pantalla de inicio de sesión (táctil). Devuelve true si ya hay sesión; false si el usuario sale con START.
bool ui_login(C3D_RenderTarget *top, C3D_RenderTarget *bot, Session *s, const char *version);
void ui_save_session(const Session *s);  // guarda la cuenta (refresh token o secret) para entrar sin pedir nada
void ui_forget_session(void);            // borra la sesión guardada (cerrar sesión)
// Pantalla con un mensaje; espera START.
void ui_message(C3D_RenderTarget *top, C3D_RenderTarget *bot, const char *title, const char *msg);

// Panel de la pantalla inferior durante el juego
typedef enum { UI_NONE = -1, UI_COLOR0 = 0, UI_CHAT = 30, UI_QUIT = 31, UI_EMOTE_MENU = 33, UI_EMOTE0 = 40, UI_TAB_PLAYERS = 60, UI_TAB_CHAT = 61, UI_CHAT_UP = 62, UI_CHAT_DOWN = 63 } UiAction;
typedef struct { char name[24], text[100]; } ChatLine;      // historial de chat de la partida
extern bool ui_build_ui;
void ui_game_bottom(const Session *s, const Remote *rem, int nr, int kind, const char *game, const char *version, bool emote_menu, const ChatLine *hist, int nhist, int hscroll, bool chat_view);
int  ui_game_touch(int x, int y, bool emote_menu, bool chat_view);        // UI_NONE, UI_COLOR0 + n, UI_CHAT o UI_QUIT (volver al lobby)

#ifdef BLOCKSY_PREVIEW
void ui_preview_login(C3D_RenderTarget *top, C3D_RenderTarget *bot, int signup, int busy, const char *version);
#endif
