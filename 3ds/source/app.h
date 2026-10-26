#pragma once
#include <3ds.h>
#include <citro2d.h>
#include "net.h"

typedef enum { APP_PLAY, APP_LOGOUT, APP_QUIT, APP_RESTART } AppResult;   // APP_RESTART: tras actualizar, salir y abrir de nuevo la app

// Lobby de Blocksy (réplica de la web): Inicio, Descubrir, Avatar, Amigos, Crear y Ajustes.
// Devuelve APP_PLAY con `chosen` relleno, APP_LOGOUT (cerrar sesión) o APP_QUIT (START).
extern char g_my_hat[100];    // lo que llevas puesto (sombrero|gafas|espalda|estela|mascota|), lo usa el juego para dibujarte
AppResult app_lobby(C3D_RenderTarget *top, C3D_RenderTarget *bot, Session *s, GameInfo *chosen, const char *version);

// Ajustes guardados en la SD
int app_draw_level(void);   // 0 corta, 1 media, 2 larga
int app_sync_ms(void);      // pausa entre envíos/lecturas de posiciones durante la partida (ajuste)
int app_forest_level(void);  // dificultad del bosque: 0 facil, 1 normal, 2 dificil
int app_steps_on(void);      // polvo al caminar
int app_music_on(void);      // musica de la playlist activada
int app_sfx_on(void);        // efectos de sonido activados
int app_radar_on(void);      // radar de jugadores en la partida
int app_fx_on(void);         // particulas al poner/romper bloques y aterrizar
int app_coords_on(void);     // mostrar coordenadas X Y Z en la partida
int app_fps_on(void);        // mostrar los fotogramas por segundo en la partida
int app_music_vol(void);     // volumen de la musica (0-100)
int app_notif_on(void);     // avisos emergentes activados
void app_notif_text(const Notif *n, char *out, size_t sz);   // texto de un aviso en el idioma elegido

#ifdef BLOCKSY_PREVIEW
// Solo para generar capturas en el ordenador (ver 3ds/preview)
void app_preview(C3D_RenderTarget *top, C3D_RenderTarget *bot, int page, int modal, int cursor, const char *version);
#endif

// Opciones de juego del menu Ajustes (app_opt(OPT_X)): valor 0/1 o 0-2
enum { OPT_NAMETAGS, OPT_BUBBLES, OPT_INVERT, OPT_CAMSPD, OPT_RADARR, OPT_COMPASS, OPT_PILL, OPT_OUTLINE, OPT_SHADOWS, OPT_DECOR, OPT_STEPSND, OPT_CHATSND, OPT_TIMER, OPT_BLOCKCNT, OPT_REPEAT, OPT_BLOCKNAME, OPT_RUNTOGGLE, OPT_WIFI, OPT_CLOCK, OPT_AUTOSIT, OPT_SORT, NOPT };
int app_opt(int id);
int app_lang(void);          // 0 es, 1 en, 2 pt
