#pragma once
#include <stdbool.h>
#include <stddef.h>

#define MAX_PLAYERS 24
#define MAX_BLOCKS  2048

typedef struct { char id[40]; char name[24]; float x, y, z, ry; unsigned int color; int is3ds; char anim[12]; } Remote;
typedef struct { int x, y, z, kind; } Block;

typedef struct {
	char token[1600];   // access_token del proyecto AUTH
	char refresh[160];  // refresh token de AUTH (sesión guardada; rota en cada uso)
	char secret[48];    // secret de sesión de GAME (Edge Function game-session)
	char user_id[40];
	char username[24];
	unsigned int color; // ABGR
} Session;

typedef bool (*NetSink)(const void *data, size_t n, void *ud);   // recibe los datos descargados; false = abortar
char *net_get_text(const char *url, char *err, size_t en);        // GET genérico (GitHub API); NULL si falla
bool net_download(const char *url, NetSink sink, void *ud, volatile int *pct, char *err, size_t en);

bool net_init(void);
void net_exit(void);

typedef struct { char id[40]; char name[44]; char desc[104]; char owner_id[40]; char owner[24]; int hue, max, players; } GameInfo;
typedef struct { char id[40]; char name[24]; unsigned int color; int online, in_game; } Person;
#define MAX_GAMES  32
#define MAX_PEOPLE 32

// Auth (proyecto AUTH)
bool net_login(Session *s, const char *email, const char *password, const char *username); // username != NULL: crea la cuenta
const char *net_login_error(void);   // motivo del último fallo de net_login
bool net_link_start(char *code, size_t cn, char *poll, size_t pn);   // pide un código para vincular
int  net_link_poll(Session *s, const char *code, const char *poll);  // 1 aprobado, 0 pendiente, -1 caducado
bool net_refresh(Session *s, bool new_game_session);                 // renueva el token con el refresh token
bool net_resume(Session *s);                                         // valida una sesión guardada (s->secret)
void net_thread_cleanup(void);                                       // cierra el handle curl del hilo actual
void net_presence(const Session *s, const char *game);   // touch_presence(); game NULL = en el lobby
void net_offline(const Session *s);

// Lobby (listas, amigos, avatar). Los de amigos devuelven -2 si la sesión no tiene token de Auth (entrada por QR)
int  net_list_games(GameInfo *out, int max);
void net_player_counts(GameInfo *g, int n);
int  net_list_friends(const Session *s, Person *out, int max);
int  net_list_people(const Session *s, Person *out, int max);
bool net_add_friend(const Session *s, const char *id);
bool net_remove_friend(const Session *s, const char *id);
bool net_set_color(Session *s, const char *hex);

typedef struct { long id; char name[24]; char text[100]; } ChatMsg;
int net_fetch_chat(long since, ChatMsg *out, int max, long *last);   // since < 0: solo obtiene el último id

// Juego (proyecto GAME): opera sobre el juego elegido con net_set_game()
void net_set_game(const char *id);
const char *net_game(void);
bool net_say(const Session *s, const char *text);
bool net_send_state(const Session *s, float x, float y, float z, float ry, const char *anim);
int  net_fetch_players(const Session *s, Remote *out, int max);
int  net_fetch_blocks(const Session *s, Block *out, int max);
bool net_place_block(const Session *s, int x, int y, int z, int kind);
bool net_break_block(const Session *s, int x, int y, int z);
void net_leave(const Session *s);
