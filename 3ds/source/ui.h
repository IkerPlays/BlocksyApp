#pragma once
#include <3ds.h>
#include <citro2d.h>
#include "net.h"

#define NPALETTE 6
extern const u32 ui_palette[NPALETTE];   // ABGR, mismos colores que la web

void ui_init(void);
void ui_exit(void);
void ui_frame_begin(void);               // llamar al principio de cada frame (limpia el buffer de texto)
void ui_text(float x, float y, float scale, u32 color, u32 align, const char *s);

// Pantalla de inicio de sesión (táctil). Devuelve true si ya hay sesión; false si el usuario sale con START.
bool ui_login(C3D_RenderTarget *top, C3D_RenderTarget *bot, Session *s, const char *version);
void ui_forget_session(void);            // borra la sesión guardada (cerrar sesión)
// Pantalla con un mensaje; espera START.
void ui_message(C3D_RenderTarget *top, C3D_RenderTarget *bot, const char *title, const char *msg);

// Panel de la pantalla inferior durante el juego
typedef enum { UI_NONE = -1, UI_COLOR0 = 0, UI_CHAT = 10, UI_QUIT = 11, UI_LOGOUT = 12 } UiAction;
void ui_game_bottom(const Session *s, const Remote *rem, int nr, int kind, const char *version);
int  ui_game_touch(int x, int y);        // UI_NONE, UI_COLOR0 + n, UI_CHAT o UI_QUIT
