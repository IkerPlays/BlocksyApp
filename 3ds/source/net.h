#pragma once
#include <stdbool.h>
#include <stddef.h>

#define MAX_PLAYERS 24
#define MAX_BLOCKS  2048

typedef struct { char id[40]; char name[24]; float x, y, z, ry; } Remote;
typedef struct { int x, y, z, kind; } Block;

typedef struct {
	char token[1600];   // access_token del proyecto AUTH
	char user_id[40];
	char username[24];
} Session;

bool net_init(void);
void net_exit(void);

// Auth (proyecto AUTH)
bool net_login(Session *s, const char *email, const char *password);
void net_presence(const Session *s);          // touch_presence()
void net_offline(const Session *s);

// Juego (proyecto GAME)
bool net_send_state(const Session *s, float x, float y, float z, float ry, const char *anim);
int  net_fetch_players(const Session *s, Remote *out, int max);
int  net_fetch_blocks(const Session *s, Block *out, int max);
bool net_place_block(const Session *s, int x, int y, int z, int kind);
bool net_break_block(const Session *s, int x, int y, int z);
void net_leave(const Session *s);
