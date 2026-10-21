#pragma once
#include <3ds.h>
#include <citro2d.h>
#include "net.h"

typedef enum { APP_PLAY, APP_LOGOUT, APP_QUIT } AppResult;

// Lobby de Blocksy (réplica de la web): Inicio, Descubrir, Avatar, Amigos, Crear y Ajustes.
// Devuelve APP_PLAY con `chosen` relleno, APP_LOGOUT (cerrar sesión) o APP_QUIT (START).
AppResult app_lobby(C3D_RenderTarget *top, C3D_RenderTarget *bot, Session *s, GameInfo *chosen, const char *version);

// Ajustes guardados en la SD
int app_draw_level(void);   // 0 corta, 1 media, 2 larga

#ifdef BLOCKSY_PREVIEW
// Solo para generar capturas en el ordenador (ver 3ds/preview)
void app_preview(C3D_RenderTarget *top, C3D_RenderTarget *bot, int page, int modal, int cursor, const char *version);
#endif
