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
		httpcAddPostDataRaw(&ctx, (const u32 *)body, strlen(body));
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
static unsigned int parse_color(const char *hex) { // "#rrggbb" -> ABGR
	unsigned r = 0x4d, g = 0xa6, b = 0xff;
	if (hex && hex[0] == '#' && strlen(hex) == 7) sscanf(hex + 1, "%2x%2x%2x", &r, &g, &b);
	return 0xFF000000u | (b << 16) | (g << 8) | r;
}

bool net_login(Session *s, const char *email, const char *password) {
	char body[256]; snprintf(body, sizeof body, "{\"email\":\"%s\",\"password\":\"%s\"}", email, password);
	char *r = http(M_POST, AUTH_URL "/auth/v1/token?grant_type=password", AUTH_ANON_KEY, NULL, body, NULL);
	if (!r) return false;
	const char *end = r + strlen(r);
	bool ok = jstr(r, end, "access_token", s->token, sizeof s->token);
	const char *u = strstr(r, "\"user\":{");   // "id" del usuario dentro de "user"
	ok = ok && u && jstr(u, end, "id", s->user_id, sizeof s->user_id);
	free(r);
	if (!ok) return false;

	// Sesión del proyecto GAME: la Edge Function valida el token de AUTH
	static char sbody[1800]; snprintf(sbody, sizeof sbody, "{\"token\":\"%s\"}", s->token);
	r = http(M_POST, GAME_URL "/functions/v1/game-session", GAME_ANON_KEY, GAME_ANON_KEY, sbody, NULL); // Authorization: Bearer anon (pasa Verify JWT)
	if (!r) return false;
	end = r + strlen(r);
	char col[12] = "";
	ok = jstr(r, end, "secret", s->secret, sizeof s->secret);
	strcpy(s->username, "player");
	jstr(r, end, "username", s->username, sizeof s->username);
	jstr(r, end, "color", col, sizeof col);
	s->color = parse_color(col);
	free(r);
	return ok;
}
void net_presence(const Session *s) {
	free(http(M_POST, AUTH_URL "/rest/v1/rpc/touch_presence", AUTH_ANON_KEY, s->token, "{\"p_game\":\"" GAME_ID "\"}", NULL));
}
void net_offline(const Session *s) { free(http(M_POST, AUTH_URL "/rest/v1/rpc/go_offline", AUTH_ANON_KEY, s->token, "{}", NULL)); }

// ---------- Juego (RPC con secret de sesión; lecturas públicas) ----------
static bool rpc(const Session *s, const char *fn, const char *args_json) {
	char url[96]; snprintf(url, sizeof url, GAME_URL "/rest/v1/rpc/%s", fn);
	char body[512]; snprintf(body, sizeof body, "{\"p_secret\":\"%s\"%s%s}", s->secret, args_json[0] ? "," : "", args_json);
	char *r = http(M_POST, url, GAME_ANON_KEY, NULL, body, NULL);
	bool ok = r != NULL; free(r); return ok;
}

bool net_send_state(const Session *s, float x, float y, float z, float ry, const char *anim) {
	char a[256];
	snprintf(a, sizeof a, "\"p_game\":\"" GAME_ID "\",\"p_x\":%.3f,\"p_y\":%.3f,\"p_z\":%.3f,\"p_ry\":%.3f,\"p_anim\":\"%s\",\"p_platform\":\"3ds\"", x, y, z, ry, anim);
	return rpc(s, "move", a);
}
bool net_say(const Session *s, const char *text) {
	char a[300]; snprintf(a, sizeof a, "\"p_game\":\"" GAME_ID "\",\"p_text\":\"%s\"", text);
	return rpc(s, "say", a);
}

int net_fetch_players(const Session *s, Remote *out, int max) {
	time_t t = time(NULL) - 15; struct tm *tm = gmtime(&t);
	char url[300], ts[32]; strftime(ts, sizeof ts, "%Y-%m-%dT%H:%M:%SZ", tm);
	snprintf(url, sizeof url, GAME_URL "/rest/v1/player_state?game_id=eq." GAME_ID
	         "&updated_at=gt.%s&select=player_id,username,color,platform,x,y,z,ry", ts);
	char *r = http(M_GET, url, GAME_ANON_KEY, NULL, NULL, NULL);
	if (!r) return -1;
	int n = 0; const char *p = r, *end;
	while (n < max && (p = next_obj(p, &end))) {
		const char *start = p; p = end + 1;
		Remote *o = &out[n]; char col[12] = "", plat[8] = "";
		if (!jstr(start, end, "player_id", o->id, sizeof o->id) || strcmp(o->id, s->user_id) == 0) continue;
		if (!jstr(start, end, "username", o->name, sizeof o->name)) strcpy(o->name, "?");
		jstr(start, end, "color", col, sizeof col); o->color = parse_color(col);
		jstr(start, end, "platform", plat, sizeof plat); o->is3ds = strcmp(plat, "3ds") == 0;
		o->x = jnum(start, end, "x"); o->y = jnum(start, end, "y"); o->z = jnum(start, end, "z"); o->ry = jnum(start, end, "ry");
		n++;
	}
	free(r); return n;
}

int net_fetch_blocks(const Session *s, Block *out, int max) {
	(void)s;
	char *r = http(M_GET, GAME_URL "/rest/v1/blocks?game_id=eq." GAME_ID "&select=x,y,z,kind&limit=2048", GAME_ANON_KEY, NULL, NULL, NULL);
	if (!r) return -1;
	int n = 0; const char *p = r, *end;
	while (n < max && (p = next_obj(p, &end))) {
		out[n].x = (int)jnum(p, end, "x"); out[n].y = (int)jnum(p, end, "y");
		out[n].z = (int)jnum(p, end, "z"); out[n].kind = (int)jnum(p, end, "kind");
		n++; p = end + 1;
	}
	free(r); return n;
}

bool net_place_block(const Session *s, int x, int y, int z, int kind) {
	char a[160]; snprintf(a, sizeof a, "\"p_game\":\"" GAME_ID "\",\"p_x\":%d,\"p_y\":%d,\"p_z\":%d,\"p_kind\":%d", x, y, z, kind);
	return rpc(s, "place_block", a);
}
bool net_break_block(const Session *s, int x, int y, int z) {
	char a[160]; snprintf(a, sizeof a, "\"p_game\":\"" GAME_ID "\",\"p_x\":%d,\"p_y\":%d,\"p_z\":%d", x, y, z);
	return rpc(s, "break_block", a);
}
void net_leave(const Session *s) { rpc(s, "leave", ""); }
