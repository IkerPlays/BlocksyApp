// Cliente HTTP (libcurl + mbedtls) para PostgREST / GoTrue / Edge Functions de Supabase.
// httpc de libctru falla con el TLS de Cloudflare/Supabase; libcurl con mbedtls sí funciona.
#include "net.h"
#include "config.h"
#include <3ds.h>
#include <curl/curl.h>
#include <malloc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#ifndef BLOCKSY_VERSION
#define BLOCKSY_VERSION "dev"
#endif

#define SOC_ALIGN 0x1000
#define SOC_SIZE  0x100000
static u32 *soc_buf;

bool net_init(void) {
	soc_buf = memalign(SOC_ALIGN, SOC_SIZE);
	if (!soc_buf || R_FAILED(socInit(soc_buf, SOC_SIZE))) return false;
	return curl_global_init(CURL_GLOBAL_DEFAULT) == CURLE_OK;
}
void net_exit(void) { curl_global_cleanup(); socExit(); free(soc_buf); }

// Un handle por hilo: así se reutiliza la conexión TLS (el handshake en la 3DS tarda segundos)
static __thread CURL *tl_curl;
void net_thread_cleanup(void) { if (tl_curl) { curl_easy_cleanup(tl_curl); tl_curl = NULL; } }

typedef enum { M_GET, M_POST, M_DELETE } Method;
static int last_status;        // código HTTP de la última petición (0 = no hubo respuesta)
static char last_err[96];      // texto de curl cuando no hubo respuesta

static bool jstr(const char *obj, const char *end, const char *key, char *dst, size_t n);
typedef struct { char *p; size_t n, cap; } Buf;
static size_t write_cb(char *d, size_t sz, size_t nm, void *ud) {
	Buf *b = ud; size_t add = sz * nm;
	if (b->n + add + 1 > b->cap) {
		size_t nc = b->cap ? b->cap : 4096; while (nc < b->n + add + 1) nc *= 2;
		char *np = realloc(b->p, nc); if (!np) return 0;
		b->p = np; b->cap = nc;
	}
	memcpy(b->p + b->n, d, add); b->n += add; b->p[b->n] = 0; return add;
}

// Devuelve el cuerpo (malloc, terminado en \0) o NULL si falla / status >= 300.
static char *http(Method m, const char *url, const char *apikey, const char *bearer,
                  const char *body, const char *prefer) {
	last_status = 0; last_err[0] = 0;
	if (!tl_curl) tl_curl = curl_easy_init();
	CURL *c = tl_curl; if (!c) { snprintf(last_err, sizeof last_err, "curl_easy_init"); return NULL; }
	curl_easy_reset(c);

	struct curl_slist *h = NULL; char tmp[1750];
	snprintf(tmp, sizeof tmp, "apikey: %s", apikey); h = curl_slist_append(h, tmp);
	if (bearer) { snprintf(tmp, sizeof tmp, "Authorization: Bearer %s", bearer); h = curl_slist_append(h, tmp); }
	if (body) h = curl_slist_append(h, "Content-Type: application/json");
	if (prefer) { snprintf(tmp, sizeof tmp, "Prefer: %s", prefer); h = curl_slist_append(h, tmp); }

	Buf b = {0}; char errbuf[CURL_ERROR_SIZE]; errbuf[0] = 0;
	curl_easy_setopt(c, CURLOPT_URL, url);
	curl_easy_setopt(c, CURLOPT_HTTPHEADER, h);
	if (m == M_POST) { curl_easy_setopt(c, CURLOPT_POST, 1L); curl_easy_setopt(c, CURLOPT_POSTFIELDS, body ? body : ""); curl_easy_setopt(c, CURLOPT_POSTFIELDSIZE, (long)(body ? strlen(body) : 0)); }
	else if (m == M_DELETE) curl_easy_setopt(c, CURLOPT_CUSTOMREQUEST, "DELETE");
	curl_easy_setopt(c, CURLOPT_SSL_VERIFYPEER, 0L);   // TODO: instalar la CA raíz y verificar
	curl_easy_setopt(c, CURLOPT_SSL_VERIFYHOST, 0L);
	curl_easy_setopt(c, CURLOPT_CONNECTTIMEOUT, 20L);
	curl_easy_setopt(c, CURLOPT_TIMEOUT, 30L);
	curl_easy_setopt(c, CURLOPT_NOSIGNAL, 1L);
	curl_easy_setopt(c, CURLOPT_USERAGENT, "blocksy-3ds/" BLOCKSY_VERSION);
	curl_easy_setopt(c, CURLOPT_WRITEFUNCTION, write_cb);
	curl_easy_setopt(c, CURLOPT_WRITEDATA, &b);
	curl_easy_setopt(c, CURLOPT_ERRORBUFFER, errbuf);

	CURLcode rc = curl_easy_perform(c);
	long code = 0; curl_easy_getinfo(c, CURLINFO_RESPONSE_CODE, &code);
	last_status = (int)code;
	curl_slist_free_all(h);
	if (rc != CURLE_OK) {
		snprintf(last_err, sizeof last_err, "%s", errbuf[0] ? errbuf : curl_easy_strerror(rc));
		free(b.p); return NULL;
	}
	if (code >= 300) {   // guarda el "message" del error de PostgREST/GoTrue para poder enseñarlo
		if (b.p) { const char *e = b.p + b.n; jstr(b.p, e, "message", last_err, sizeof last_err); if (!last_err[0]) jstr(b.p, e, "msg", last_err, sizeof last_err); }
		free(b.p); return NULL;
	}
	if (!b.p) b.p = strdup("");
	return b.p;
}

// ---------- JSON diminuto (tolera espacios: jsonb de Postgres escribe "key": "valor") ----------
static const char *find_val(const char *obj, const char *end, const char *key) {
	char pat[48]; snprintf(pat, sizeof pat, "\"%s\"", key);
	for (const char *p = obj; (p = strstr(p, pat)) && p < end; p++) {
		const char *q = p + strlen(pat);
		while (*q == ' ' || *q == '\t' || *q == '\n') q++;
		if (*q != ':') continue;
		q++; while (*q == ' ' || *q == '\t' || *q == '\n') q++;
		return q;
	}
	return NULL;
}
static bool jstr(const char *obj, const char *end, const char *key, char *dst, size_t n) {
	const char *p = find_val(obj, end, key); if (!p || *p != '"') return false;
	p++; size_t i = 0;
	while (*p && *p != '"' && p < end && i + 1 < n) { if (*p == '\\' && p[1]) p++; dst[i++] = *p++; }
	dst[i] = 0; return true;
}
static float jnum(const char *obj, const char *end, const char *key) {
	const char *p = find_val(obj, end, key); return p ? strtof(p, NULL) : 0;
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

static char login_err[96] = "";
const char *net_login_error(void) { return login_err; }
static void set_err(const char *what) {
	if (last_status == 0) snprintf(login_err, sizeof login_err, "Sin conexion: %.70s", last_err);
	else if (last_err[0]) snprintf(login_err, sizeof login_err, "%s (%d): %.50s", what, last_status, last_err);
	else snprintf(login_err, sizeof login_err, "%s (%d)", what, last_status);
}

bool net_login(Session *s, const char *email, const char *password) {
	login_err[0] = 0;
	if (sizeof(AUTH_URL) <= 1 || sizeof(GAME_URL) <= 1) { snprintf(login_err, sizeof login_err, "Este build no tiene config de Supabase"); return false; }
	char body[256]; snprintf(body, sizeof body, "{\"email\":\"%s\",\"password\":\"%s\"}", email, password);
	char *r = http(M_POST, AUTH_URL "/auth/v1/token?grant_type=password", AUTH_ANON_KEY, NULL, body, NULL);
	if (!r) {
		if (last_status == 400) snprintf(login_err, sizeof login_err, "Email o contrasena incorrectos");
		else if (last_status == 401 || last_status == 403) snprintf(login_err, sizeof login_err, "Clave de Supabase invalida (%d)", last_status);
		else set_err("Error del servidor de cuentas");
		return false;
	}
	const char *end = r + strlen(r);
	bool ok = jstr(r, end, "access_token", s->token, sizeof s->token);
	const char *u = strstr(r, "\"user\":{");   // "id" del usuario dentro de "user"
	ok = ok && u && jstr(u, end, "id", s->user_id, sizeof s->user_id);
	free(r);
	if (!ok) { snprintf(login_err, sizeof login_err, "Respuesta de login no valida"); return false; }

	// Sesión del proyecto GAME: la Edge Function valida el token de AUTH
	static char sbody[1800]; snprintf(sbody, sizeof sbody, "{\"token\":\"%s\"}", s->token);
	r = http(M_POST, GAME_URL "/functions/v1/game-session", GAME_ANON_KEY, GAME_ANON_KEY, sbody, NULL); // Authorization: Bearer anon (pasa Verify JWT)
	if (!r) {
		if (last_status == 404) snprintf(login_err, sizeof login_err, "Falta la funcion game-session (404)");
		else set_err("No se pudo abrir la sesion de juego");
		return false;
	}
	end = r + strlen(r);
	char col[12] = "";
	ok = jstr(r, end, "secret", s->secret, sizeof s->secret);
	strcpy(s->username, "player");
	jstr(r, end, "username", s->username, sizeof s->username);
	jstr(r, end, "color", col, sizeof col);
	s->color = parse_color(col);
	free(r);
	if (!ok) snprintf(login_err, sizeof login_err, "Sesion de juego no valida");
	return ok;
}
// ---------- Iniciar sesión desde otro dispositivo (QR) ----------
static void fill_session(Session *s, const char *r, const char *end) {
	char col[12] = "";
	jstr(r, end, "secret", s->secret, sizeof s->secret);
	jstr(r, end, "player_id", s->user_id, sizeof s->user_id);
	strcpy(s->username, "player"); jstr(r, end, "username", s->username, sizeof s->username);
	jstr(r, end, "color", col, sizeof col); s->color = parse_color(col);
}
bool net_link_start(char *code, size_t cn, char *poll, size_t pn) {
	login_err[0] = 0;
	if (sizeof(GAME_URL) <= 1) { snprintf(login_err, sizeof login_err, "Este build no tiene config de Supabase"); return false; }
	char *r = http(M_POST, GAME_URL "/rest/v1/rpc/link_start", GAME_ANON_KEY, NULL, "{}", NULL);
	if (!r) {
		if (last_status == 404 && strstr(last_err, "Could not find")) snprintf(login_err, sizeof login_err, "Falta link-login.sql en Game (404)");
		else set_err("No se pudo crear el codigo");
		return false;
	}
	bool ok = jstr(r, r + strlen(r), "code", code, cn) && jstr(r, r + strlen(r), "poll", poll, pn);
	free(r);
	if (!ok) snprintf(login_err, sizeof login_err, "Respuesta no valida del servidor");
	return ok;
}
// 1 = aprobado (sesión rellena), 0 = pendiente, -1 = caducado o error
int net_link_poll(Session *s, const char *code, const char *poll) {
	char body[160]; snprintf(body, sizeof body, "{\"p_code\":\"%s\",\"p_poll\":\"%s\"}", code, poll);
	char *r = http(M_POST, GAME_URL "/rest/v1/rpc/link_poll", GAME_ANON_KEY, NULL, body, NULL);
	if (!r) { set_err("Error consultando el codigo"); return last_status == 0 ? 0 : -1; }   // sin red: reintenta
	const char *end = r + strlen(r); char st[16] = "";
	jstr(r, end, "status", st, sizeof st);
	int ret = -1;
	if (!strcmp(st, "pending")) ret = 0;
	else if (!strcmp(st, "ok")) { fill_session(s, r, end); s->token[0] = 0; ret = s->secret[0] ? 1 : -1; }
	else snprintf(login_err, sizeof login_err, "El codigo ha caducado");
	free(r); return ret;
}
// Comprueba una sesión guardada (s->secret ya relleno)
bool net_resume(Session *s) {
	login_err[0] = 0;
	char body[96]; snprintf(body, sizeof body, "{\"p_secret\":\"%s\"}", s->secret);
	char *r = http(M_POST, GAME_URL "/rest/v1/rpc/whoami", GAME_ANON_KEY, NULL, body, NULL);
	if (!r) { set_err("No se pudo reanudar"); return false; }
	const char *end = r + strlen(r);
	bool ok = jstr(r, end, "player_id", s->user_id, sizeof s->user_id);
	if (ok) { char col[12] = ""; strcpy(s->username, "player"); jstr(r, end, "username", s->username, sizeof s->username); jstr(r, end, "color", col, sizeof col); s->color = parse_color(col); }
	s->token[0] = 0; free(r); return ok;
}

void net_presence(const Session *s) {
	if (!s->token[0]) return;   // sesión vinculada por QR: no hay token de Auth
	free(http(M_POST, AUTH_URL "/rest/v1/rpc/touch_presence", AUTH_ANON_KEY, s->token, "{\"p_game\":\"" GAME_ID "\"}", NULL));
}
void net_offline(const Session *s) { if (s->token[0]) free(http(M_POST, AUTH_URL "/rest/v1/rpc/go_offline", AUTH_ANON_KEY, s->token, "{}", NULL)); }

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
