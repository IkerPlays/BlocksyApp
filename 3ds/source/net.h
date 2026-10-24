#pragma once
#include <stdbool.h>
#include <stddef.h>

#define MAX_PLAYERS 24
#define MAX_BLOCKS  2048

typedef struct { char id[40]; char name[24]; float x, y, z, ry; unsigned int color; int is3ds; char anim[12]; char hat[96]; } Remote;
typedef struct { int x, y, z, kind; unsigned int color; } Block;   // kind = -1: bloque fijo del mundo (color propio, no se rompe)

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
bool net_download_from(const char *url, unsigned long long from, NetSink sink, void *ud, volatile int *pct, bool *no_range, char *err, size_t en);   // desde el byte `from` (206); no_range = el servidor no reanuda
bool net_download(const char *url, NetSink sink, void *ud, volatile int *pct, char *err, size_t en);

bool net_init(void);
void net_exit(void);

typedef struct { char id[40]; char name[44]; char desc[104]; char owner_id[40]; char owner[24]; int hue, max, players, fav; long visits; char mode[8]; char world[12]; char weather[8]; char about[200]; char track[64]; int vis; int allow_build; float jump; int seed; char sky[10]; char welcome[64]; float hour; float speed, gravity, fog; int double_jump, has_spawn; float spawn[3]; } GameInfo;   // hour: config.time (-1 = no definida, 0 = ciclo automatico)   // allow_build: -1 según el modo
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
#define MAX_PARTS 160
typedef struct { float x, y, z, sx, sy, sz, ry, cs, sn, rad; unsigned int color; unsigned char shape, collide, spawn, alpha, glow; } Part;   // pieza del Studio (config.parts); shape 0 bloque, 1 bola, 2 cilindro; ry en radianes
int  net_fetch_parts(const char *game_id, Part *out, int max);              // piezas del Studio de un juego (0 si no hay o falla)
typedef struct { char title[48], game[44], host[24]; long starts; int going, me, clan; } Meetup;   // starts: epoch UTC
int  net_next_meetup(const Session *s, Meetup *m);                         // proxima quedada (AUTH v17 list_meetups); 1 si hay, 0 si no, <0 error
int  net_list_games(GameInfo *out, int max);
void net_player_counts(GameInfo *g, int n);
int  net_list_friends(const Session *s, Person *out, int max);
typedef struct { long id; char name[24]; unsigned int color; } FriendReq;
int  net_list_requests(const Session *s, FriendReq *out, int max);     // solicitudes recibidas
int  net_friend_request(const Session *s, const char *name);           // 0 enviada, 1 aceptada, 2 ya amigos, 3 ya enviada, -1 error / no existe
bool net_respond_request(const Session *s, long id, bool accept);
int  net_unread_total(const Session *s);
int  net_favorites(const Session *s, char (*ids)[40], int max);        // ids de tus juegos favoritos; <0 error / sin cuenta
int  net_game_visits(GameInfo *g, int n);                                 // visitas totales de cada juego (AUTH v18); <0 error
int  net_hide_blocked(GameInfo *g, int n);                                // quita los juegos que el equipo de moderacion bloqueo; devuelve cuantos quedan
void net_visit(const Session *s, const char *game_id);                    // cuenta una visita (necesita cuenta con email)
int  net_toggle_favorite(const Session *s, const char *game_id);       // 1 favorito, 0 quitado, -1 error
typedef struct { long id; int mine, edited; char text[100]; } DmMsg;
bool net_edit_dm(const Session *s, long id, const char *text);
bool net_delete_dm(const Session *s, long id);
typedef struct { char id[32]; char kind[8]; char name[32]; int price; int rarity; } ShopItem;      // rarity: 0 común, 1 raro, 2 épico
typedef struct { int bcoins, streak, can_claim, ninv; char inv[24][32]; char hat[32], title[32], face[32], back[32], trail[32], pet[32]; } Wallet;
int  net_wallet(const Session *s, Wallet *w);                          // BCoins, inventario y equipado (0 ok, <0 error)
int  net_shop_list(const Session *s, ShopItem *out, int max);
extern char net_why[96];                                                   // motivo del ultimo fallo de compra
int  net_buy(const Session *s, const char *id);                        // 0 ok, 1 sin monedas, 2 ya lo tienes, -1 error
int  net_open_crate(const Session *s, const char *id, char *item, size_t n, int *dup, int *refund);   // 0 ok, 1 sin monedas, -1 error
int  net_claim_daily(const Session *s);                                // BCoins recibidas; 0 = ya recogida; <0 error
bool net_equip(const Session *s, const char *id, const char *kind);   // id vacío = quitar el de ese tipo
typedef struct { long id; char kind[16]; char from[24]; char game_id[40]; char game[44]; int read; } Notif;   // kind: friend_request | friend_accept | invite
int  net_list_notifs(const Session *s, Notif *out, int max);          // más nuevas primero
bool net_notifs_read(const Session *s);
bool net_notifs_clear(const Session *s);
int  net_fetch_dm(const Session *s, const char *friend_id, DmMsg *out, int max);   // más antiguo primero
bool net_send_dm(const Session *s, const char *friend_id, const char *text);
bool net_remove_friend(const Session *s, const char *id);
bool net_set_color(Session *s, const char *hex);

typedef struct { long id; char name[24]; char text[100]; } ChatMsg;
// Bosque oscuro: eventos de la partida (fragmentos, ganar, nueva ronda, atrapado) y el monstruo (anfitrion = quien guarda su posicion)
typedef struct { char name[24]; int ms; } TopTime;
int  net_best_times(TopTime *out, int max);                            // mejores tiempos del juego actual (el mas rapido primero); <0 error
int  net_submit_time(const Session *s, int ms);                        // guarda tu tiempo de carrera y devuelve tu puesto (0 si falla)
typedef struct { long id; char kind[8]; char name[24]; int i, n, round; } GEvent;
int  net_fetch_events(long since, GEvent *out, int max, long *last);   // kinds orb/win/round/caught; since < 0: desde el principio
bool net_game_event(const Session *s, const char *kind, int a);        // orb {i}, win {round}, round {n}, caught
typedef struct { bool have, remote_fresh; float x, z, ry; bool walk; } NpcState;
bool net_npc_get(const Session *s, NpcState *o);                       // remote_fresh: lo mueve otro jugador (actualizado hace <3 s)
bool net_npc_tick(const Session *s, float x, float z, float ry, bool walk);   // true: eres el anfitrion
void net_npc_release(const Session *s);
int net_fetch_chat(long since, ChatMsg *out, int max, long *last);   // since < 0: solo obtiene el último id

// Juego (proyecto GAME): opera sobre el juego elegido con net_set_game()
void net_set_game(const char *id);
const char *net_game(void);
bool net_say(const Session *s, const char *text);
void net_set_hat(const char *id);                                           // sombrero equipado (se envia con la posicion)
bool net_send_state(const Session *s, float x, float y, float z, float ry, const char *anim);
int  net_fetch_players(const Session *s, Remote *out, int max);
int  net_fetch_blocks(const Session *s, Block *out, int max);
bool net_place_block(const Session *s, int x, int y, int z, int kind);
bool net_break_block(const Session *s, int x, int y, int z);
void net_leave(const Session *s);
