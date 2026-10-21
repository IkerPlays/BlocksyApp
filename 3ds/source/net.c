// Cliente HTTP mínimo para PostgREST / GoTrue de Supabase usando httpc de libctru.
#include "net.h"
#include "config.h"
#include <3ds.h>
#include <malloc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define SOC_ALIGN 0x1000
#define SOC_SIZE  0x100000
static u32 *soc_buf;

bool net_init(void) {
	soc_buf = memalign(SOC_ALIGN, SOC_SIZE);
	if (!soc_buf || R_FAILED(socInit(soc_buf, SOC_SIZE))) return false;
	return R_SUCCEEDED(httpcInit(0x100000));
}
void net_exit(void) { httpcExit(); socExit(); free(soc_buf); }

typedef enum { M_GET, M_POST, M_DELETE } Method;

// Devuelve el cuerpo (malloc, terminado en \0) o NULL si falla / status >= 300.
static char *http(Method m, const char *url, const char *apikey, const char *bearer,
                  const char *body, const char *extra_prefer) {
	httpcContext ctx;
	HTTPC_RequestMethod rm = m == M_GET ? HTTPC_METHOD_GET : m == M_POST ? HTTPC_METHOD_POST : HTTPC_METHOD_DELETE;
	if (R_FAILED(httpcOpenContext(&ctx, rm, url, 1))) return NULL;
	httpcSetSSLOpt(&ctx, SSLCOPT_DisableVerify);   // TODO: instalar CA raíz y verificar
	httpcSetKeepAlive(&ctx, HTTPC_KEEPALIVE_DISABLED);
	httpcAddRequestHeaderField(&ctx, "User-Agent", "blocksy-3ds/0.1");
	httpcAddRequestHeaderField(&ctx, "apikey", apikey);
	if (bearer) {
		char h[1700]; snprintf(h, sizeof h, "Bearer %s", bearer);
		httpcAddRequestHeaderField(&ctx, "Authorization", h);
	}
	if (body) {
		httpcAddRequestHeaderField(&ctx, "Content-Type", "application/json");
		httpcSetPostDataRaw(&ctx, body, strlen(body));
	}
	if (extra_prefer) httpcAddRequestHeaderField(&ctx, "Prefer", extra_prefer);

	char *out = NULL;
	if (R_SUCCEEDED(httpcBeginRequest(&ctx))) {
		u32 status = 0; httpcGetResponseStatusCode(&ctx, &status);
		size_t cap = 8192, len = 0; out = malloc(cap);
		Result r;
		do {
			if (len + 4096 >= cap) { cap *= 2; char *n = realloc(out, cap); if (!n) { free(out); out = NULL; break; } out = n; }
			u32 got = 0;
			r = httpcDownloadData(&ctx, (u8 *)out + len, cap - len - 1, &got);
			len += got;
		} while (r == (Result)HTTPC_RESULTCODE_DOWNLOADPENDING);
		if (out) { out[len] = 0; if (status >= 300 || R_FAILED(r)) { free(out); out = NULL; } }
	}
	httpcCloseContext(&ctx);
	return out;
}

// ---------- JSON diminuto: lee un campo de un objeto plano ----------
static bool jstr(const char *obj, const char *end, const char *key, char *dst, size_t n) {
	char pat[40]; snprintf(pat, sizeof pat, "\"%s\":\"", key);
	const char *p = strstr(obj, pat); if (!p || p >= end) return false;
	p += strlen(pat); size_t i = 0;
	while (*p && *p != '"' && p < end && i + 1 < n) { if (*p == '\\' && p[1]) p++; dst[i++] = *p++; }
	dst[i] = 0; return true;
}
static float jnum(const char *obj, const char *end, const char *key) {
	char pat[40]; snprintf(pat, sizeof pat, "\"%s\":", key);
	const char *p = strstr(obj, pat); if (!p || p >= end) return 0;
	return strtof(p + strlen(pat), NULL);
}
// Avanza al siguiente objeto {...} de un array plano
static const char *next_obj(const char *p, const char **end) {
	p = strchr(p, '{'); if (!p) return NULL;
	int depth = 0; const char *q = p;
	for (; *q; q++) { if (*q == '{') depth++; else if (*q == '}' && --depth == 0) break; }
	if (!*q) return NULL;
	*end = q; return p;
}

// ---------- Auth ----------
bool net_login(Session *s, const char *email, const char *password) {
	char body[256]; snprintf(body, sizeof body, "{\"email\":\"%s\",\"password\":\"%s\"}", email, password);
	char *r = http(M_POST, AUTH_URL "/auth/v1/token?grant_type=password", AUTH_ANON_KEY, NULL, body, NULL);
	if (!r) return false;
	const char *end = r + strlen(r);
	bool ok = jstr(r, end, "access_token", s->token, sizeof s->token);
	// "id" del usuario: está dentro de "user":{"id":"..."}
	const char *u = strstr(r, "\"user\":{");
	ok = ok && u && jstr(u, end, "id", s->user_id, sizeof s->user_id);
	free(r);
	if (!ok) return false;

	char url[160]; snprintf(url, sizeof url, AUTH_URL "/rest/v1/profiles?id=eq.%s&select=username", s->user_id);
	r = http(M_GET, url, AUTH_ANON_KEY, s->token, NULL, NULL);
	strcpy(s->username, "player");
	if (r) { jstr(r, r + strlen(r), "username", s->username, sizeof s->username); free(r); }
	return true;
}
void net_presence(const Session *s) {
	char *r = http(M_POST, AUTH_URL "/rest/v1/rpc/touch_presence", AUTH_ANON_KEY, s->token,
	               "{\"p_game\":\"" GAME_ID "\"}", NULL);
	free(r);
}
void net_offline(const Session *s) { free(http(M_POST, AUTH_URL "/rest/v1/rpc/go_offline", AUTH_ANON_KEY, s->token, "{}", NULL)); }

// ---------- Juego ----------
bool net_send_state(const Session *s, float x, float y, float z, float ry, const char *anim) {
	char body[512];
	snprintf(body, sizeof body,
	         "{\"player_id\":\"%s\",\"game_id\":\"" GAME_ID "\",\"username\":\"%s\",\"color\":\"#ff9f43\","
	         "\"x\":%.3f,\"y\":%.3f,\"z\":%.3f,\"ry\":%.3f,\"anim\":\"%s\",\"platform\":\"3ds\"}",
	         s->user_id, s->username, x, y, z, ry, anim);
	char *r = http(M_POST, GAME_URL "/rest/v1/player_state?on_conflict=player_id", GAME_ANON_KEY, s->token,
	               body, "resolution=merge-duplicates,return=minimal");
	bool ok = r != NULL; free(r); return ok;
}

int net_fetch_players(const Session *s, Remote *out, int max) {
	time_t t = time(NULL) - 15; struct tm *tm = gmtime(&t);
	char url[300], ts[32]; strftime(ts, sizeof ts, "%Y-%m-%dT%H:%M:%SZ", tm);
	snprintf(url, sizeof url, GAME_URL "/rest/v1/player_state?game_id=eq." GAME_ID
	         "&updated_at=gt.%s&select=player_id,username,x,y,z,ry", ts);
	char *r = http(M_GET, url, GAME_ANON_KEY, s->token, NULL, NULL);
	if (!r) return -1;
	int n = 0; const char *p = r, *end;
	while (n < max && (p = next_obj(p, &end))) {
		const char *start = p; p = end + 1;
		Remote *o = &out[n];
		if (!jstr(start, end, "player_id", o->id, sizeof o->id) || strcmp(o->id, s->user_id) == 0) continue;
		if (!jstr(start, end, "username", o->name, sizeof o->name)) strcpy(o->name, "?");
		o->x = jnum(start, end, "x"); o->y = jnum(start, end, "y"); o->z = jnum(start, end, "z"); o->ry = jnum(start, end, "ry");
		n++;
	}
	free(r); return n;
}

int net_fetch_blocks(const Session *s, Block *out, int max) {
	char *r = http(M_GET, GAME_URL "/rest/v1/blocks?game_id=eq." GAME_ID "&select=x,y,z,kind&limit=2048",
	               GAME_ANON_KEY, s->token, NULL, NULL);
	if (!r) return -1;
	int n = 0; const char *p = r, *end;
	while (n < max && (p = next_obj(p, &end))) {
		out[n].x = (int)jnum(p, end, "x"); out[n].y = (int)jnum(p, end, "y");
		out[n].z = (int)jnum(p, end, "z"); out[n].kind = (int)jnum(p, end, "kind");
		n++; p = end + 1;
	}
	free(r); return n;
}

static void log_interaction(const Session *s, const char *kind, int x, int y, int z) {
	char b[256];
	snprintf(b, sizeof b, "{\"game_id\":\"" GAME_ID "\",\"player_id\":\"%s\",\"kind\":\"%s\",\"x\":%d,\"y\":%d,\"z\":%d}", s->user_id, kind, x, y, z);
	free(http(M_POST, GAME_URL "/rest/v1/interactions", GAME_ANON_KEY, s->token, b, "return=minimal"));
}
bool net_place_block(const Session *s, int x, int y, int z, int kind) {
	char b[256];
	snprintf(b, sizeof b, "{\"game_id\":\"" GAME_ID "\",\"x\":%d,\"y\":%d,\"z\":%d,\"kind\":%d,\"placed_by\":\"%s\"}", x, y, z, kind, s->user_id);
	char *r = http(M_POST, GAME_URL "/rest/v1/blocks?on_conflict=game_id,x,y,z", GAME_ANON_KEY, s->token, b,
	               "resolution=merge-duplicates,return=minimal");
	bool ok = r != NULL; free(r);
	if (ok) log_interaction(s, "place", x, y, z);
	return ok;
}
bool net_break_block(const Session *s, int x, int y, int z) {
	char url[200];
	snprintf(url, sizeof url, GAME_URL "/rest/v1/blocks?game_id=eq." GAME_ID "&x=eq.%d&y=eq.%d&z=eq.%d", x, y, z);
	char *r = http(M_DELETE, url, GAME_ANON_KEY, s->token, NULL, "return=minimal");
	bool ok = r != NULL; free(r);
	if (ok) log_interaction(s, "break", x, y, z);
	return ok;
}
void net_leave(const Session *s) {
	char url[160]; snprintf(url, sizeof url, GAME_URL "/rest/v1/player_state?player_id=eq.%s", s->user_id);
	free(http(M_DELETE, url, GAME_ANON_KEY, s->token, NULL, "return=minimal"));
}
