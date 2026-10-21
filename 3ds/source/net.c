// Cliente HTTP (libcurl + mbedtls) para PostgREST / GoTrue / Edge Functions de Supabase.
// httpc de libctru falla con el TLS de Cloudflare/Supabase; libcurl con mbedtls sí funciona.
#include "net.h"
#include "config.h"
#include "json.h"
#include <3ds.h>
#include <curl/curl.h>
#include <malloc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
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

typedef enum { M_GET, M_POST, M_DELETE, M_PATCH } Method;
static int last_status;        // código HTTP de la última petición (0 = no hubo respuesta)
static char last_err[96];      // texto de curl cuando no hubo respuesta

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
	if (m == M_POST || m == M_PATCH) { curl_easy_setopt(c, CURLOPT_POST, 1L); if (m == M_PATCH) curl_easy_setopt(c, CURLOPT_CUSTOMREQUEST, "PATCH"); curl_easy_setopt(c, CURLOPT_POSTFIELDS, body ? body : ""); curl_easy_setopt(c, CURLOPT_POSTFIELDSIZE, (long)(body ? strlen(body) : 0)); }
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

// ---------- Descargas genéricas (GitHub API / assets de releases) ----------
// GET sin cabeceras de Supabase. Devuelve el cuerpo (malloc) o NULL.
char *net_get_text(const char *url, const char *bearer, char *err, size_t en) {
	last_status = 0; last_err[0] = 0;
	if (!tl_curl) tl_curl = curl_easy_init();
	CURL *c = tl_curl; if (!c) return NULL;
	curl_easy_reset(c);
	struct curl_slist *h = curl_slist_append(NULL, "Accept: application/vnd.github+json");
	h = curl_slist_append(h, "X-GitHub-Api-Version: 2022-11-28");
	if (bearer && bearer[0]) { char a[300]; snprintf(a, sizeof a, "Authorization: Bearer %s", bearer); h = curl_slist_append(h, a); }
	Buf b = {0}; char errbuf[CURL_ERROR_SIZE]; errbuf[0] = 0;
	curl_easy_setopt(c, CURLOPT_URL, url); curl_easy_setopt(c, CURLOPT_HTTPHEADER, h);
	curl_easy_setopt(c, CURLOPT_SSL_VERIFYPEER, 0L); curl_easy_setopt(c, CURLOPT_SSL_VERIFYHOST, 0L);
	curl_easy_setopt(c, CURLOPT_FOLLOWLOCATION, 1L); curl_easy_setopt(c, CURLOPT_MAXREDIRS, 5L);
	curl_easy_setopt(c, CURLOPT_CONNECTTIMEOUT, 20L); curl_easy_setopt(c, CURLOPT_TIMEOUT, 40L); curl_easy_setopt(c, CURLOPT_NOSIGNAL, 1L);
	curl_easy_setopt(c, CURLOPT_USERAGENT, "blocksy-3ds/" BLOCKSY_VERSION);
	curl_easy_setopt(c, CURLOPT_WRITEFUNCTION, write_cb); curl_easy_setopt(c, CURLOPT_WRITEDATA, &b); curl_easy_setopt(c, CURLOPT_ERRORBUFFER, errbuf);
	CURLcode rc = curl_easy_perform(c);
	long code = 0; curl_easy_getinfo(c, CURLINFO_RESPONSE_CODE, &code);
	curl_slist_free_all(h);
	if (rc != CURLE_OK) { snprintf(err, en, "Sin conexion: %.60s", errbuf[0] ? errbuf : curl_easy_strerror(rc)); free(b.p); return NULL; }
	if (code == 404) snprintf(err, en, bearer && bearer[0] ? "El token no tiene acceso a las releases (404)" : "Repo privado: falta UPDATE_TOKEN (404)");
	else if (code == 401) snprintf(err, en, "UPDATE_TOKEN invalido o caducado (401)");
	else if (code == 403) snprintf(err, en, "GitHub limito las consultas (403), prueba mas tarde");
	else if (code != 200) snprintf(err, en, "GitHub respondio %ld", code);
	if (code != 200) { free(b.p); return NULL; }
	if (!b.p) b.p = strdup("");
	return b.p;
}

typedef struct { NetSink sink; void *ud; volatile int *pct; size_t got; bool sink_failed; } DlCtx;
static size_t dl_write(char *d, size_t sz, size_t nm, void *u) {
	DlCtx *c = u; size_t n = sz * nm;
	if (!c->sink(d, n, c->ud)) { c->sink_failed = true; return 0; }
	c->got += n; return n;
}
static int dl_progress(void *u, curl_off_t dltotal, curl_off_t dlnow, curl_off_t ultotal, curl_off_t ulnow) {
	(void)ultotal; (void)ulnow; DlCtx *c = u;
	if (c->pct && dltotal > 0) *c->pct = (int)(dlnow * 100 / dltotal);
	return 0;
}
static size_t discard_cb(char *d, size_t sz, size_t nm, void *u) { (void)d; (void)u; return sz * nm; }
static size_t loc_cb(char *d, size_t sz, size_t nm, void *u) {            // cabecera Location de la redirección
	size_t n = sz * nm; char *out = u;
	if (n > 10 && !strncasecmp(d, "location:", 9)) { const char *p = d + 9; while (*p == ' ') p++; size_t i = 0; while (p < d + n && *p != '\r' && *p != '\n' && i < 1023) out[i++] = *p++; out[i] = 0; }
	return n;
}
// Repo privado: la URL de la API del asset (con token y Accept: octet-stream) responde 302 a una URL temporal firmada.
static bool resolve_private_asset(const char *api_url, const char *bearer, char *loc, size_t ln, char *err, size_t en) {
	CURL *c = tl_curl; curl_easy_reset(c);
	struct curl_slist *h = curl_slist_append(NULL, "Accept: application/octet-stream");
	h = curl_slist_append(h, "X-GitHub-Api-Version: 2022-11-28");
	char a[300]; snprintf(a, sizeof a, "Authorization: Bearer %s", bearer); h = curl_slist_append(h, a);
	static char location[1024]; location[0] = 0;
	curl_easy_setopt(c, CURLOPT_URL, api_url); curl_easy_setopt(c, CURLOPT_HTTPHEADER, h);
	curl_easy_setopt(c, CURLOPT_SSL_VERIFYPEER, 0L); curl_easy_setopt(c, CURLOPT_SSL_VERIFYHOST, 0L);
	curl_easy_setopt(c, CURLOPT_FOLLOWLOCATION, 0L); curl_easy_setopt(c, CURLOPT_CONNECTTIMEOUT, 20L); curl_easy_setopt(c, CURLOPT_TIMEOUT, 40L); curl_easy_setopt(c, CURLOPT_NOSIGNAL, 1L);
	curl_easy_setopt(c, CURLOPT_USERAGENT, "blocksy-3ds/" BLOCKSY_VERSION);
	curl_easy_setopt(c, CURLOPT_WRITEFUNCTION, discard_cb); curl_easy_setopt(c, CURLOPT_HEADERFUNCTION, loc_cb); curl_easy_setopt(c, CURLOPT_HEADERDATA, location);
	CURLcode rc = curl_easy_perform(c);
	long code = 0; curl_easy_getinfo(c, CURLINFO_RESPONSE_CODE, &code);
	curl_slist_free_all(h);
	if (rc != CURLE_OK) { snprintf(err, en, "Sin conexion: %.60s", curl_easy_strerror(rc)); return false; }
	if (code == 404) { snprintf(err, en, "El token no tiene acceso al fichero (404)"); return false; }
	if (code == 401) { snprintf(err, en, "UPDATE_TOKEN invalido o caducado (401)"); return false; }
	if ((code != 302 && code != 301 && code != 307) || !location[0]) { snprintf(err, en, "GitHub respondio %ld sin redireccion", code); return false; }
	snprintf(loc, ln, "%s", location); return true;
}

// Descarga `url` (sigue redirecciones) y entrega los datos a `sink` a medida que llegan, sin guardarlos enteros en memoria.
// bearer != NULL: `url` es la URL de la API de un asset de un repo privado.
bool net_download(const char *url, const char *bearer, NetSink sink, void *ud, volatile int *pct, char *err, size_t en) {
	if (!tl_curl) tl_curl = curl_easy_init();
	CURL *c = tl_curl; if (!c) { snprintf(err, en, "curl_easy_init"); return false; }
	static char signed_url[1024];
	if (bearer && bearer[0]) { if (!resolve_private_asset(url, bearer, signed_url, sizeof signed_url, err, en)) return false; url = signed_url; }
	curl_easy_reset(c);
	DlCtx ctx = {sink, ud, pct, 0, false}; char errbuf[CURL_ERROR_SIZE]; errbuf[0] = 0;
	curl_easy_setopt(c, CURLOPT_URL, url);
	curl_easy_setopt(c, CURLOPT_SSL_VERIFYPEER, 0L); curl_easy_setopt(c, CURLOPT_SSL_VERIFYHOST, 0L);
	curl_easy_setopt(c, CURLOPT_FOLLOWLOCATION, 1L); curl_easy_setopt(c, CURLOPT_MAXREDIRS, 6L);
	curl_easy_setopt(c, CURLOPT_FAILONERROR, 1L);
	curl_easy_setopt(c, CURLOPT_CONNECTTIMEOUT, 20L); curl_easy_setopt(c, CURLOPT_LOW_SPEED_LIMIT, 1024L); curl_easy_setopt(c, CURLOPT_LOW_SPEED_TIME, 30L);
	curl_easy_setopt(c, CURLOPT_NOSIGNAL, 1L);
	curl_easy_setopt(c, CURLOPT_USERAGENT, "blocksy-3ds/" BLOCKSY_VERSION);
	curl_easy_setopt(c, CURLOPT_WRITEFUNCTION, dl_write); curl_easy_setopt(c, CURLOPT_WRITEDATA, &ctx);
	curl_easy_setopt(c, CURLOPT_NOPROGRESS, 0L); curl_easy_setopt(c, CURLOPT_XFERINFOFUNCTION, dl_progress); curl_easy_setopt(c, CURLOPT_XFERINFODATA, &ctx);
	curl_easy_setopt(c, CURLOPT_ERRORBUFFER, errbuf);
	CURLcode rc = curl_easy_perform(c);
	long code = 0; curl_easy_getinfo(c, CURLINFO_RESPONSE_CODE, &code);
	if (ctx.sink_failed) { snprintf(err, en, "No se pudo escribir la descarga"); return false; }
	if (rc != CURLE_OK) { snprintf(err, en, "Descarga fallida: %.50s", errbuf[0] ? errbuf : curl_easy_strerror(rc)); return false; }
	if (code != 200) { snprintf(err, en, "El servidor respondio %ld", code); return false; }
	return true;
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

// Sesión del proyecto GAME: la Edge Function valida el token de AUTH
static bool open_game_session(Session *s) {
	static char sbody[1800]; snprintf(sbody, sizeof sbody, "{\"token\":\"%s\"}", s->token);
	char *r = http(M_POST, GAME_URL "/functions/v1/game-session", GAME_ANON_KEY, GAME_ANON_KEY, sbody, NULL); // Authorization: Bearer anon (pasa Verify JWT)
	if (!r) {
		if (last_status == 404) snprintf(login_err, sizeof login_err, "Falta la funcion game-session (404)");
		else set_err("No se pudo abrir la sesion de juego");
		return false;
	}
	const char *end = r + strlen(r); char col[12] = "";
	bool ok = jstr(r, end, "secret", s->secret, sizeof s->secret);
	strcpy(s->username, "player");
	jstr(r, end, "username", s->username, sizeof s->username);
	jstr(r, end, "color", col, sizeof col);
	s->color = parse_color(col);
	free(r);
	if (!ok) snprintf(login_err, sizeof login_err, "Sesion de juego no valida");
	return ok;
}

// Inicia sesión (username == NULL) o crea la cuenta (username != NULL) y abre la sesión de juego
bool net_login(Session *s, const char *email, const char *password, const char *username) {
	login_err[0] = 0;
	if (sizeof(AUTH_URL) <= 1 || sizeof(GAME_URL) <= 1) { snprintf(login_err, sizeof login_err, "Este build no tiene config de Supabase"); return false; }
	char body[320];
	if (username) snprintf(body, sizeof body, "{\"email\":\"%s\",\"password\":\"%s\",\"data\":{\"username\":\"%s\"}}", email, password, username);
	else snprintf(body, sizeof body, "{\"email\":\"%s\",\"password\":\"%s\"}", email, password);
	char *r = http(M_POST, username ? AUTH_URL "/auth/v1/signup" : AUTH_URL "/auth/v1/token?grant_type=password", AUTH_ANON_KEY, NULL, body, NULL);
	if (!r) {
		if (username && (last_status == 422 || last_status == 400)) snprintf(login_err, sizeof login_err, "No se pudo crear: email repetido o contrasena corta");
		else if (last_status == 400) snprintf(login_err, sizeof login_err, "Email o contrasena incorrectos");
		else if (last_status == 401 || last_status == 403) snprintf(login_err, sizeof login_err, "Clave de Supabase invalida (%d)", last_status);
		else set_err("Error del servidor de cuentas");
		return false;
	}
	const char *end = r + strlen(r);
	bool ok = jstr(r, end, "access_token", s->token, sizeof s->token);
	const char *u = strstr(r, "\"user\":{");   // "id" del usuario dentro de "user"
	ok = ok && u && jstr(u, end, "id", s->user_id, sizeof s->user_id);
	s->refresh[0] = 0; jstr(r, end, "refresh_token", s->refresh, sizeof s->refresh);
	free(r);
	if (!ok) {
		snprintf(login_err, sizeof login_err, username ? "Cuenta creada. Confirma tu email y entra" : "Respuesta de login no valida");
		return false;
	}
	return open_game_session(s);
}

// Renueva el token de Auth con el refresh token (sesión guardada o token a punto de caducar). El refresh token rota:
// quien llame debe guardar el nuevo (s->refresh). new_game_session: también pide una sesión de juego nueva.
bool net_refresh(Session *s, bool new_game_session) {
	login_err[0] = 0;
	if (!s->refresh[0]) return false;
	char body[240]; snprintf(body, sizeof body, "{\"refresh_token\":\"%s\"}", s->refresh);
	char *r = http(M_POST, AUTH_URL "/auth/v1/token?grant_type=refresh_token", AUTH_ANON_KEY, NULL, body, NULL);
	if (!r) {
		if (last_status == 400 || last_status == 401) snprintf(login_err, sizeof login_err, "La sesion guardada ha caducado");
		else set_err("No se pudo renovar la sesion");
		return false;
	}
	const char *end = r + strlen(r);
	static char tok[1600], ref[160], uid[40];
	bool ok = jstr(r, end, "access_token", tok, sizeof tok) && jstr(r, end, "refresh_token", ref, sizeof ref);
	const char *u = strstr(r, "\"user\":{");
	ok = ok && u && jstr(u, end, "id", uid, sizeof uid);
	free(r);
	if (!ok) { snprintf(login_err, sizeof login_err, "Respuesta de renovacion no valida"); return false; }
	snprintf(s->token, sizeof s->token, "%s", tok); snprintf(s->refresh, sizeof s->refresh, "%s", ref); snprintf(s->user_id, sizeof s->user_id, "%s", uid);
	return new_game_session ? open_game_session(s) : true;
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

// ---------- Presencia ----------
static char g_game[40] = GAME_ID;            // juego actual (se elige en la app)
void net_set_game(const char *id) { snprintf(g_game, sizeof g_game, "%s", id); }
const char *net_game(void) { return g_game; }

void net_presence(const Session *s, const char *game) {
	if (!s->token[0]) return;   // sesión vinculada por QR: no hay token de Auth
	char body[96]; if (game && game[0]) snprintf(body, sizeof body, "{\"p_game\":\"%s\"}", game); else snprintf(body, sizeof body, "{\"p_game\":null}");
	free(http(M_POST, AUTH_URL "/rest/v1/rpc/touch_presence", AUTH_ANON_KEY, s->token, body, NULL));
}
void net_offline(const Session *s) { if (s->token[0]) free(http(M_POST, AUTH_URL "/rest/v1/rpc/go_offline", AUTH_ANON_KEY, s->token, "{}", NULL)); }

// ---------- Juego (RPC con secret de sesión; lecturas públicas) ----------
static bool rpc(const Session *s, const char *fn, const char *args_json) {
	char url[96]; snprintf(url, sizeof url, GAME_URL "/rest/v1/rpc/%s", fn);
	char body[640]; snprintf(body, sizeof body, "{\"p_secret\":\"%s\"%s%s}", s->secret, args_json[0] ? "," : "", args_json);
	char *r = http(M_POST, url, GAME_ANON_KEY, NULL, body, NULL);
	bool ok = r != NULL; free(r); return ok;
}
static void clean(char *dst, size_t n, const char *src) {   // quita comillas y barras para no romper el JSON
	size_t i = 0; for (; *src && i + 1 < n; src++) dst[i++] = (*src == '"' || *src == '\\' || *src == '\n') ? ' ' : *src;
	dst[i] = 0;
}

bool net_send_state(const Session *s, float x, float y, float z, float ry, const char *anim) {
	char a[256];
	snprintf(a, sizeof a, "\"p_game\":\"%s\",\"p_x\":%.3f,\"p_y\":%.3f,\"p_z\":%.3f,\"p_ry\":%.3f,\"p_anim\":\"%s\",\"p_platform\":\"3ds\"", g_game, x, y, z, ry, anim);
	return rpc(s, "move", a);
}
bool net_say(const Session *s, const char *text) {
	char a[300], t[110]; clean(t, sizeof t, text);
	snprintf(a, sizeof a, "\"p_game\":\"%s\",\"p_text\":\"%s\"", g_game, t);
	return rpc(s, "say", a);
}

int net_fetch_players(const Session *s, Remote *out, int max) {
	time_t t = time(NULL) - 15; struct tm *tm = gmtime(&t);
	char url[320], ts[32]; strftime(ts, sizeof ts, "%Y-%m-%dT%H:%M:%SZ", tm);
	snprintf(url, sizeof url, GAME_URL "/rest/v1/player_state?game_id=eq.%s&updated_at=gt.%s&select=player_id,username,color,platform,x,y,z,ry", g_game, ts);
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
	char url[256]; snprintf(url, sizeof url, GAME_URL "/rest/v1/blocks?game_id=eq.%s&select=x,y,z,kind&limit=2048", g_game);
	char *r = http(M_GET, url, GAME_ANON_KEY, NULL, NULL, NULL);
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
	char a[200]; snprintf(a, sizeof a, "\"p_game\":\"%s\",\"p_x\":%d,\"p_y\":%d,\"p_z\":%d,\"p_kind\":%d", g_game, x, y, z, kind);
	return rpc(s, "place_block", a);
}
bool net_break_block(const Session *s, int x, int y, int z) {
	char a[200]; snprintf(a, sizeof a, "\"p_game\":\"%s\",\"p_x\":%d,\"p_y\":%d,\"p_z\":%d", g_game, x, y, z);
	return rpc(s, "break_block", a);
}
void net_leave(const Session *s) { rpc(s, "leave", ""); }

// Mensajes de chat nuevos (id > since). Devuelve cuántos; *last = id más alto visto. since < 0: solo averigua el último id
int net_fetch_chat(long since, ChatMsg *out, int max, long *last) {
	char url[300];
	if (since < 0) snprintf(url, sizeof url, GAME_URL "/rest/v1/interactions?game_id=eq.%s&kind=eq.chat&select=id&order=id.desc&limit=1", g_game);
	else snprintf(url, sizeof url, GAME_URL "/rest/v1/interactions?game_id=eq.%s&kind=eq.chat&id=gt.%ld&select=id,username,payload&order=id.asc&limit=%d", g_game, since, max);
	char *r = http(M_GET, url, GAME_ANON_KEY, NULL, NULL, NULL);
	if (!r) return -1;
	int n = 0; const char *p = r, *end;
	while ((p = next_obj(p, &end))) {
		const char *st = p; p = end + 1;
		long id = (long)jnum(st, end, "id"); if (id > *last) *last = id;
		if (since < 0 || n >= max) continue;
		ChatMsg *m = &out[n]; m->id = id;
		if (!jstr(st, end, "username", m->name, sizeof m->name)) strcpy(m->name, "?");
		if (!jstr(st, end, "text", m->text, sizeof m->text)) continue;
		n++;
	}
	free(r); return n;
}

// ---------- Lobby: juegos, amigos, avatar ----------
int net_list_games(GameInfo *out, int max) {
	char *r = http(M_GET, GAME_URL "/rest/v1/games?select=id,name,description,owner_id,owner_name,hue,max_players&order=created_at.asc&limit=32", GAME_ANON_KEY, NULL, NULL, NULL);
	if (!r) { set_err("No se pudo cargar la lista de juegos"); return -1; }
	int n = 0; const char *p = r, *end;
	while (n < max && (p = next_obj(p, &end))) {
		GameInfo *g = &out[n]; memset(g, 0, sizeof *g);
		const char *st = p; p = end + 1;
		if (!jstr(st, end, "id", g->id, sizeof g->id)) continue;
		jstr(st, end, "name", g->name, sizeof g->name); jstr(st, end, "description", g->desc, sizeof g->desc);
		jstr(st, end, "owner_id", g->owner_id, sizeof g->owner_id); jstr(st, end, "owner_name", g->owner, sizeof g->owner);
		g->hue = (int)jnum(st, end, "hue"); g->max = (int)jnum(st, end, "max_players"); if (!g->max) g->max = 20;
		n++;
	}
	free(r); return n;
}
// Rellena g[i].players con los jugadores activos (visto en los últimos 15 s)
void net_player_counts(GameInfo *g, int n) {
	time_t t = time(NULL) - 15; struct tm *tm = gmtime(&t);
	char url[200], ts[32]; strftime(ts, sizeof ts, "%Y-%m-%dT%H:%M:%SZ", tm);
	snprintf(url, sizeof url, GAME_URL "/rest/v1/player_state?select=game_id&updated_at=gt.%s&limit=500", ts);
	char *r = http(M_GET, url, GAME_ANON_KEY, NULL, NULL, NULL);
	for (int i = 0; i < n; i++) g[i].players = 0;
	if (!r) return;
	const char *p = r, *end;
	while ((p = next_obj(p, &end))) {
		char gid[40] = ""; jstr(p, end, "game_id", gid, sizeof gid); p = end + 1;
		for (int i = 0; i < n; i++) if (!strcmp(g[i].id, gid)) { g[i].players++; break; }
	}
	free(r);
}
static int parse_people(const char *r, Person *out, int max) {
	int n = 0; const char *p = r, *end;
	while (n < max && (p = next_obj(p, &end))) {
		Person *o = &out[n]; memset(o, 0, sizeof *o); char col[12] = "", cg[40] = "";
		const char *st = p; p = end + 1;
		if (!jstr(st, end, "id", o->id, sizeof o->id)) continue;
		jstr(st, end, "username", o->name, sizeof o->name); jstr(st, end, "avatar_color", col, sizeof col); o->color = parse_color(col);
		o->online = jbool(st, end, "is_online"); o->in_game = jstr(st, end, "current_game", cg, sizeof cg);
		n++;
	}
	return n;
}
int net_list_friends(const Session *s, Person *out, int max) {
	if (!s->token[0]) return -2;   // sin cuenta (QR): no hay token de Auth
	char url[200]; snprintf(url, sizeof url, AUTH_URL "/rest/v1/friendships?select=friend_id&user_id=eq.%s&limit=60", s->user_id);
	char *r = http(M_GET, url, AUTH_ANON_KEY, s->token, NULL, NULL);
	if (!r) return -1;
	static char in[2400]; size_t len = snprintf(in, sizeof in, AUTH_URL "/rest/v1/profiles_public?select=id,username,avatar_color,current_game,is_online&order=is_online.desc,username.asc&id=in.(");
	int ids = 0; const char *p = r, *end;
	while ((p = next_obj(p, &end)) && len < sizeof in - 60) {
		char id[40] = ""; jstr(p, end, "friend_id", id, sizeof id); p = end + 1;
		if (id[0]) len += snprintf(in + len, sizeof in - len, "%s%s", ids++ ? "," : "", id);
	}
	free(r);
	if (!ids) return 0;
	snprintf(in + len, sizeof in - len, ")");
	r = http(M_GET, in, AUTH_ANON_KEY, s->token, NULL, NULL);
	if (!r) return -1;
	int n = parse_people(r, out, max); free(r); return n;
}
int net_list_people(const Session *s, Person *out, int max) {
	if (!s->token[0]) return -2;
	char *r = http(M_GET, AUTH_URL "/rest/v1/profiles_public?select=id,username,avatar_color,current_game,is_online&order=is_online.desc,username.asc&limit=30", AUTH_ANON_KEY, s->token, NULL, NULL);
	if (!r) return -1;
	int n = parse_people(r, out, max); free(r); return n;
}
bool net_add_friend(const Session *s, const char *id) {
	char body[160]; snprintf(body, sizeof body, "{\"user_id\":\"%s\",\"friend_id\":\"%s\"}", s->user_id, id);
	char *r = http(M_POST, AUTH_URL "/rest/v1/friendships", AUTH_ANON_KEY, s->token, body, "resolution=merge-duplicates,return=minimal");
	bool ok = r != NULL; free(r); return ok;
}
bool net_remove_friend(const Session *s, const char *id) {
	char url[220]; snprintf(url, sizeof url, AUTH_URL "/rest/v1/friendships?user_id=eq.%s&friend_id=eq.%s", s->user_id, id);
	char *r = http(M_DELETE, url, AUTH_ANON_KEY, s->token, NULL, "return=minimal");
	bool ok = r != NULL; free(r); return ok;
}
// Guarda el color en el perfil y renueva la sesión de juego (para que los demás lo vean)
bool net_set_color(Session *s, const char *hex) {
	if (!s->token[0]) return false;
	char url[160], body[64]; snprintf(url, sizeof url, AUTH_URL "/rest/v1/profiles?id=eq.%s", s->user_id);
	snprintf(body, sizeof body, "{\"avatar_color\":\"%s\"}", hex);
	char *r = http(M_PATCH, url, AUTH_ANON_KEY, s->token, body, "return=minimal");
	if (!r) return false;
	free(r);
	return open_game_session(s);
}
