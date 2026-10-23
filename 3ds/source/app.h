#pragma once
#include <3ds.h>
#include <citro2d.h>
#include "net.h"

typedef enum { APP_PLAY, APP_LOGOUT, APP_QUIT, APP_RESTART } AppResult;   // APP_RESTART: tras actualizar, salir y abrir de nuevo la app

// Lobby de Blocksy (réplica de la web): Inicio, Descubrir, Avatar, Amigos, Crear y Ajustes.
// Devuelve APP_PLAY con `chosen` relleno, APP_LOGOUT (cerrar sesión) o APP_QUIT (START).
extern char g_my_hat[32];     // sombrero equipado (lo usa el juego para dibujarte)
AppResult app_lobby(C3D_RenderTarget *top, C3D_RenderTarget *bot, Session *s, GameInfo *chosen, const char *version);

// Ajustes guardados en la SD
int app_draw_level(void);   // 0 corta, 1 media, 2 larga
int app_sync_ms(void);      // pausa entre envíos/lecturas de posiciones durante la partida (ajuste)
int app_forest_level(void);  // dificultad del bosque: 0 facil, 1 normal, 2 dificil
int app_steps_on(void);      // polvo al caminar
int app_notif_on(void);     // avisos emergentes activados
void app_notif_text(const Notif *n, char *out, size_t sz);   // texto de un aviso en el idioma elegido

#ifdef BLOCKSY_PREVIEW
// Solo para generar capturas en el ordenador (ver 3ds/preview)
void app_preview(C3D_RenderTarget *top, C3D_RenderTarget *bot, int page, int modal, int cursor, const char *version);
#endif
