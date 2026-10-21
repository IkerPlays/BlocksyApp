#pragma once
#include <stdbool.h>
#include <stddef.h>

#define MAX_PLAYERS 24
#define MAX_BLOCKS  2048

typedef struct { char id[40]; char name[24]; float x, y, z, ry; unsigned int color; int is3ds; } Remote;
typedef struct { int x, y, z, kind; } Block;

typedef struct {
	char token[1600];   // access_token del proyecto AUTH
	char secret[48];    // secret de sesión de GAME (Edge Function game-session)
	char user_id[40];
	char username[24];
	unsigned int color; // ABGR
} Session;

bool net_init(void);
void net_exit(void);

// Auth (proyecto AUTH)
bool net_login(Session *s, const char *email, const char *password);  // AUTH + sesión GAME
const char *net_login_error(void);   // motivo del último fallo de net_login
bool net_link_start(char *code, size_t cn, char *poll, size_t pn);   // pide un código para vincular
int  net_link_poll(Session *s, const char *code, const char *poll);  // 1 aprobado, 0 pendiente, -1 caducado
bool net_resume(Session *s);                                         // valida una sesión guardada (s->secret)
void net_thread_cleanup(void);                                       // cierra el handle curl del hilo actual
void net_presence(const Session *s);          // touch_presence()
void net_offline(const Session *s);

// Juego (proyecto GAME)
bool net_say(const Session *s, const char *text);
bool net_send_state(const Session *s, float x, float y, float z, float ry, const char *anim);
int  net_fetch_players(const Session *s, Remote *out, int max);
int  net_fetch_blocks(const Session *s, Block *out, int max);
bool net_place_block(const Session *s, int x, int y, int z, int kind);
bool net_break_block(const Session *s, int x, int y, int z);
void net_leave(const Session *s);
