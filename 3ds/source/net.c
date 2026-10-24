// Cliente HTTP (libcurl + mbedtls) para PostgREST / GoTrue / Edge Functions de Supabase.
// httpc de libctru falla con el TLS de Cloudflare/Supabase; libcurl con mbedtls sí funciona.
#include "net.h"
#include "parts.h"
#include "config.h"
#include "json.h"
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
// ---- hora del servidor: el reloj de la 3DS no es fiable (hora local sin zona horaria), así que se usa la cabecera Date de las respuestas ----
static time_t g_srv_date;                       // última hora UTC del servidor (epoch); 0 = desconocida
static long days_from_civil(int y, int m, int d) {
	y -= m <= 2; long era = (y >= 0 ? y : y - 399) / 400; unsigned yoe = (unsigned)(y - era * 400);
	unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1; unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
	return era * 146097 + (long)doe - 719468;
}
static time_t to_epoch(int y, int mo, int d, int h, int mi, int sec) { return (time_t)(days_from_civil(y, mo, d) * 86400L + h * 3600L + mi * 60L + sec); }
static size_t hdr_cb(char *b, size_t sz, size_t n, void *ud) {
	(void)ud; size_t len = sz * n;
	if (len > 12 && (b[0] == 'D' || b[0] == 'd') && (b[1] == 'a' || b[1] == 'A') && (b[2] == 't' || b[2] == 'T') && (b[3] == 'e' || b[3] == 'E') && b[4] == ':') {
		static const char *const mon = "JanFebMarAprMayJunJulAugSepOctNovDec"; char line[64], mn[4] = "";
		size_t k = len < sizeof line - 1 ? len : sizeof line - 1; memcpy(line, b, k); line[k] = 0;
		int d, y, h, mi, sec;
		if (sscanf(line + 5, " %*3s, %d %3s %d %d:%d:%d", &d, mn, &y, &h, &mi, &sec) == 6) {
			const char *f = strstr(mon, mn); if (f && (f - mon) % 3 == 0) g_srv_date = to_epoch(y, (int)((f - mon) / 3) + 1, d, h, mi, sec);
		}
	}
	return len;
}
static time_t parse_iso(const char *iso) {       // "2026-10-21T18:20:00.123+00:00" (UTC) -> epoch; 0 si no se entiende
	int y, mo, d, h, mi, sec; if (sscanf(iso, "%d-%d-%dT%d:%d:%d", &y, &mo, &d, &h, &mi, &sec) != 6) return 0;
	return to_epoch(y, mo, d, h, mi, sec);
}
// ¿Esta fila está "viva"? (actualizada hace menos de max_age segundos según la hora del servidor)
static bool fresh(const char *updated_at, time_t newest, int max_age) {
	time_t t = parse_iso(updated_at); if (!t) return true;
	time_t now = g_srv_date ? g_srv_date : newest;
	return now - t <= max_age;
}

// Ajustes de red copiados del reproductor Iker's Tube (el mismo que ya funciona bien en la 3DS): buffer de recepcion mayor,
// keep-alive para detectar conexiones muertas y corte si la velocidad cae por debajo de 1 KB/s durante 20 s.
#include <sys/socket.h>
static int sock_opts(void *ud, curl_socket_t fd, curlsocktype purpose) { (void)ud; (void)purpose; static const int sz = 0x8000; setsockopt(fd, SOL_SOCKET, SO_RCVBUF, &sz, sizeof sz); return CURL_SOCKOPT_OK; }
static void tune(CURL *c) {
	curl_easy_setopt(c, CURLOPT_SOCKOPTFUNCTION, sock_opts);
	curl_easy_setopt(c, CURLOPT_TCP_KEEPALIVE, 1L);
	curl_easy_setopt(c, CURLOPT_LOW_SPEED_LIMIT, 1024L); curl_easy_setopt(c, CURLOPT_LOW_SPEED_TIME, 20L);
	curl_easy_setopt(c, CURLOPT_FORBID_REUSE, 0L);
}
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
	curl_easy_setopt(c, CURLOPT_HEADERFUNCTION, hdr_cb); tune(c);

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
char *net_get_text(const char *url, char *err, size_t en) {
	last_status = 0; last_err[0] = 0;
	if (!tl_curl) tl_curl = curl_easy_init();
	CURL *c = tl_curl; if (!c) return NULL;
	curl_easy_reset(c);
	struct curl_slist *h = curl_slist_append(NULL, strstr(url, "api.github.com") ? "Accept: application/vnd.github+json" : "Accept: */*");
	Buf b = {0}; char errbuf[CURL_ERROR_SIZE]; errbuf[0] = 0;
	curl_easy_setopt(c, CURLOPT_URL, url); curl_easy_setopt(c, CURLOPT_HTTPHEADER, h);
	curl_easy_setopt(c, CURLOPT_SSL_VERIFYPEER, 0L); curl_easy_setopt(c, CURLOPT_SSL_VERIFYHOST, 0L);
	curl_easy_setopt(c, CURLOPT_FOLLOWLOCATION, 1L); curl_easy_setopt(c, CURLOPT_MAXREDIRS, 5L);
	curl_easy_setopt(c, CURLOPT_CONNECTTIMEOUT, 20L); curl_easy_setopt(c, CURLOPT_TIMEOUT, 45L); curl_easy_setopt(c, CURLOPT_ACCEPT_ENCODING, ""); curl_easy_setopt(c, CURLOPT_NOSIGNAL, 1L);
	curl_easy_setopt(c, CURLOPT_USERAGENT, "blocksy-3ds/" BLOCKSY_VERSION);
	curl_easy_setopt(c, CURLOPT_WRITEFUNCTION, write_cb); curl_easy_setopt(c, CURLOPT_WRITEDATA, &b); curl_easy_setopt(c, CURLOPT_ERRORBUFFER, errbuf); tune(c);
	CURLcode rc = curl_easy_perform(c);
	long code = 0; curl_easy_getinfo(c, CURLINFO_RESPONSE_CODE, &code);
	curl_slist_free_all(h);
	if (rc != CURLE_OK) { snprintf(err, en, "Sin conexion: %.60s", errbuf[0] ? errbuf : curl_easy_strerror(rc)); free(b.p); return NULL; }
	if (code == 404) snprintf(err, en, "Repositorio privado o inexistente (404)");
	else if (code == 403) snprintf(err, en, "GitHub limito las consultas (403), prueba mas tarde");
	else if (code != 200) snprintf(err, en, "GitHub respondio %ld", code);
	if (code != 200) { free(b.p); return NULL; }
	if (!b.p) b.p = strdup("");
	return b.p;
}

typedef struct { NetSink sink; void *ud; volatile int *pct; size_t got; bool sink_failed; CURL *c; unsigned long long from; bool no_range, checked; } DlCtx;
static size_t dl_write(char *d, size_t sz, size_t nm, void *u) {
	DlCtx *c = u; size_t n = sz * nm;
	if (!c->checked) {                                          // al llegar el primer dato ya se conoce la respuesta HTTP
		c->checked = true; long code = 0; curl_easy_getinfo(c->c, CURLINFO_RESPONSE_CODE, &code);
		if (c->from > 0 && code != 206) { c->no_range = true; return 0; }          // el servidor no sabe reanudar: se empezaria desde cero y se corromperia
	}
	if (!c->sink(d, n, c->ud)) { c->sink_failed = true; return 0; }
	c->got += n; return n;
}
static int dl_progress(void *u, curl_off_t dltotal, curl_off_t dlnow, curl_off_t ultotal, curl_off_t ulnow) {
	(void)ultotal; (void)ulnow; DlCtx *c = u;
	if (c->pct && dltotal > 0) *c->pct = (int)(dlnow * 100 / dltotal);
	return 0;
}
// Descarga `url` (sigue redirecciones) desde el byte `from` y entrega los datos a `sink` a medida que llegan, sin guardarlos enteros en memoria.
// Con from > 0 exige "206 Partial Content": si el servidor responde 200 no se entrega nada y *no_range = true.
bool net_download_from(const char *url, unsigned long long from, NetSink sink, void *ud, volatile int *pct, bool *no_range, char *err, size_t en) {
	if (no_range) *no_range = false;
	if (!tl_curl) tl_curl = curl_easy_init();
	CURL *c = tl_curl; if (!c) { snprintf(err, en, "curl_easy_init"); return false; }
	curl_easy_reset(c);
	DlCtx ctx = {sink, ud, pct, 0, false, c, from, false, false}; char errbuf[CURL_ERROR_SIZE]; errbuf[0] = 0;
	curl_easy_setopt(c, CURLOPT_URL, url);
	curl_easy_setopt(c, CURLOPT_SSL_VERIFYPEER, 0L); curl_easy_setopt(c, CURLOPT_SSL_VERIFYHOST, 0L);
	curl_easy_setopt(c, CURLOPT_FOLLOWLOCATION, 1L); curl_easy_setopt(c, CURLOPT_MAXREDIRS, 6L);
	curl_easy_setopt(c, CURLOPT_FAILONERROR, 1L);
	curl_easy_setopt(c, CURLOPT_CONNECTTIMEOUT, 20L);
	curl_easy_setopt(c, CURLOPT_NOSIGNAL, 1L);
	curl_easy_setopt(c, CURLOPT_USERAGENT, "blocksy-3ds/" BLOCKSY_VERSION);
	curl_easy_setopt(c, CURLOPT_WRITEFUNCTION, dl_write); curl_easy_setopt(c, CURLOPT_WRITEDATA, &ctx);
	curl_easy_setopt(c, CURLOPT_NOPROGRESS, 0L); curl_easy_setopt(c, CURLOPT_XFERINFOFUNCTION, dl_progress); curl_easy_setopt(c, CURLOPT_XFERINFODATA, &ctx);
	curl_easy_setopt(c, CURLOPT_ERRORBUFFER, errbuf); tune(c);
	curl_easy_setopt(c, CURLOPT_LOW_SPEED_LIMIT, 1024L); curl_easy_setopt(c, CURLOPT_LOW_SPEED_TIME, 30L);
	curl_easy_setopt(c, CURLOPT_BUFFERSIZE, 65536L);                                   // trozos grandes: menos llamadas al escribir en la SD
	if (from > 0) curl_easy_setopt(c, CURLOPT_RESUME_FROM_LARGE, (curl_off_t)from);
	CURLcode rc = curl_easy_perform(c);
	long code = 0; curl_easy_getinfo(c, CURLINFO_RESPONSE_CODE, &code);
	if (ctx.no_range) { if (no_range) *no_range = true; snprintf(err, en, "El servidor no permite reanudar la descarga"); return false; }
	if (ctx.sink_failed) { snprintf(err, en, "No se pudo escribir la descarga"); return false; }
	if (rc != CURLE_OK) { snprintf(err, en, "Descarga fallida: %.50s", errbuf[0] ? errbuf : curl_easy_strerror(rc)); return false; }
	if (code != (from > 0 ? 206 : 200)) { snprintf(err, en, "El servidor respondio %ld", code); return false; }
	return true;
}
bool net_download(const char *url, NetSink sink, void *ud, volatile int *pct, char *err, size_t en) { return net_download_from(url, 0, sink, ud, pct, NULL, err, en); }

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
// ---- Proyecto STORE (catálogo de la tienda y lista de juegos). Sin STORE_URL en config.h se usa el modo anterior (tienda en AUTH, juegos en GAME) ----
#ifndef STORE_URL
#define STORE_URL ""
#define STORE_ANON_KEY ""
#endif
#define HAS_STORE (sizeof(STORE_URL) > 1)
static char g_store_secret[48];
char net_why[96];   // motivo del ultimo fallo de compra (para mostrarlo en pantalla)
static void why(const char *stage) { snprintf(net_why, sizeof net_why, "%s %d %.60s", stage, last_status, last_err); }
static bool store_open(const Session *s) {
	static char sbody[1800]; snprintf(sbody, sizeof sbody, "{\"token\":\"%s\"}", s->token);
	char *r = http(M_POST, STORE_URL "/functions/v1/game-session", STORE_ANON_KEY, STORE_ANON_KEY, sbody, NULL);
	if (!r) return false;
	bool ok = jstr(r, r + strlen(r), "secret", g_store_secret, sizeof g_store_secret); free(r); return ok;
}
// Copia el valor numérico (en texto) de una clave: los enteros grandes (hora Unix) no caben sin perder precisión en un float
static void jraw(const char *obj, const char *end, const char *key, char *dst, size_t n) {
	const char *p = json_find_from(obj, end, key); size_t i = 0; dst[0] = 0;
	if (p && *p == '"') p++;
	while (p && i + 1 < n && ((*p >= '0' && *p <= '9') || *p == '-')) dst[i++] = *p++;
	dst[i] = 0;
}
typedef struct { char op[8], item[32], kind[8], nonce[40], sig[80], exp[24]; int price, refund; } Quote;
static bool store_quote(const Session *s, const char *id, Quote *q) {
	for (int attempt = 0; attempt < 2; attempt++) {
		if (!g_store_secret[0] && !store_open(s)) return false;
		char body[160]; snprintf(body, sizeof body, "{\"p_secret\":\"%s\",\"p_item\":\"%s\"}", g_store_secret, id);
		char *r = http(M_POST, STORE_URL "/rest/v1/rpc/shop_quote", STORE_ANON_KEY, NULL, body, NULL);
		if (!r) { if (attempt == 0 && last_err[0] && strstr(last_err, "invalid session")) { g_store_secret[0] = 0; continue; } return false; }
		const char *e = r + strlen(r); memset(q, 0, sizeof *q);
		jstr(r, e, "op", q->op, sizeof q->op); jstr(r, e, "item", q->item, sizeof q->item); jstr(r, e, "kind", q->kind, sizeof q->kind);
		jstr(r, e, "nonce", q->nonce, sizeof q->nonce); jstr(r, e, "sig", q->sig, sizeof q->sig); jraw(r, e, "exp", q->exp, sizeof q->exp);
		q->price = (int)jnum(r, e, "price"); q->refund = (int)jnum(r, e, "refund"); free(r);
		return q->sig[0] && q->exp[0];
	}
	return false;
}
// Canjea el presupuesto firmado en AUTH (que comprueba la firma). Devuelve el JSON de respuesta o NULL
static char *store_redeem(const Session *s, const Quote *q) {
	char body[420]; snprintf(body, sizeof body, "{\"p_op\":\"%s\",\"p_item\":\"%s\",\"p_kind\":\"%s\",\"p_price\":%d,\"p_refund\":%d,\"p_exp\":%s,\"p_nonce\":\"%s\",\"p_sig\":\"%s\"}", q->op, q->item, q->kind, q->price, q->refund, q->exp, q->nonce, q->sig);
	return http(M_POST, AUTH_URL "/rest/v1/rpc/shop_redeem", AUTH_ANON_KEY, s->token, body, NULL);
}

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

static char g_hat[100]; static int g_hat_ok = 1;      // g_hat_ok: 1 = el servidor acepta p_hat (GAME v4), 0 = no (se usa la version antigua)
void net_set_hat(const char *id) { snprintf(g_hat, sizeof g_hat, "%s", id ? id : ""); }
bool net_send_state(const Session *s, float x, float y, float z, float ry, const char *anim) {
	char a[300];
	snprintf(a, sizeof a, "\"p_game\":\"%s\",\"p_x\":%.3f,\"p_y\":%.3f,\"p_z\":%.3f,\"p_ry\":%.3f,\"p_anim\":\"%s\",\"p_platform\":\"3ds\"", g_game, x, y, z, ry, anim);
	if (g_hat_ok) {
		char b[360]; snprintf(b, sizeof b, "%s,\"p_hat\":\"%s\"", a, g_hat);
		if (rpc(s, "move", b)) return true;
		if (last_status == 404 || last_status == 400) g_hat_ok = 0; else return false;      // GAME v4 sin aplicar: se manda sin sombrero
	}
	return rpc(s, "move", a);
}
bool net_say(const Session *s, const char *text) {
	char a[300], t[110]; clean(t, sizeof t, text);
	snprintf(a, sizeof a, "\"p_game\":\"%s\",\"p_text\":\"%s\"", g_game, t);
	return rpc(s, "say", a);
}

int net_fetch_players(const Session *s, Remote *out, int max) {
	char url[360];
	snprintf(url, sizeof url, GAME_URL "/rest/v1/player_state?game_id=eq.%s&select=player_id,username,color,platform,anim,x,y,z,ry,updated_at%s&order=updated_at.desc&limit=40", g_game, g_hat_ok ? ",hat" : "");
	char *r = http(M_GET, url, GAME_ANON_KEY, NULL, NULL, NULL);
	if (!r && g_hat_ok && last_status == 400) { g_hat_ok = 0; return net_fetch_players(s, out, max); }
	if (!r) return -1;
	char newest[40] = ""; { const char *e = r + strlen(r); jstr(r, e, "updated_at", newest, sizeof newest); }     // la primera fila es la más reciente
	time_t nt = parse_iso(newest);
	int n = 0; const char *p = r, *end;
	while (n < max && (p = next_obj(p, &end))) {
		const char *start = p; p = end + 1;
		Remote *o = &out[n]; char col[12] = "", plat[8] = "", up[40] = "";
		if (!jstr(start, end, "player_id", o->id, sizeof o->id) || strcmp(o->id, s->user_id) == 0) continue;
		jstr(start, end, "updated_at", up, sizeof up); if (!fresh(up, nt, 20)) continue;     // desconectado: sin actualizar hace >20 s (hora del servidor)
		if (!jstr(start, end, "username", o->name, sizeof o->name)) strcpy(o->name, "?");
		jstr(start, end, "color", col, sizeof col); o->color = parse_color(col);
		jstr(start, end, "platform", plat, sizeof plat); o->is3ds = strcmp(plat, "3ds") == 0;
		o->hat[0] = 0; jstr(start, end, "hat", o->hat, sizeof o->hat);           // la web manda sombrero|gafas|espalda|estela|mascota|aspecto: la 3DS dibuja sombrero, gafas y espalda
		o->anim[0] = 0; jstr(start, end, "anim", o->anim, sizeof o->anim); if (!o->anim[0]) strcpy(o->anim, "idle");
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

int net_best_times(TopTime *out, int max) {
	char url[260]; snprintf(url, sizeof url, GAME_URL "/rest/v1/best_times?game_id=eq.%s&select=username,ms&order=ms.asc&limit=%d", g_game, max);
	char *r = http(M_GET, url, GAME_ANON_KEY, NULL, NULL, NULL); if (!r) return -1;
	int n = 0; const char *p = r, *end;
	while (n < max && (p = next_obj(p, &end))) { const char *st = p; p = end + 1; memset(&out[n], 0, sizeof out[n]); jstr(st, end, "username", out[n].name, sizeof out[n].name); out[n].ms = (int)jnum(st, end, "ms"); if (out[n].ms > 0) n++; }
	free(r); return n;
}
int net_submit_time(const Session *s, int ms) {
	char body[200]; snprintf(body, sizeof body, "{\"p_secret\":\"%s\",\"p_game\":\"%s\",\"p_ms\":%d}", s->secret, g_game, ms);
	char *r = http(M_POST, GAME_URL "/rest/v1/rpc/submit_time", GAME_ANON_KEY, NULL, body, NULL);
	if (!r) return 0; int rk = atoi(r); free(r); return rk;
}
// ---------- Bosque oscuro ----------
int net_fetch_events(long since, GEvent *out, int max, long *last) {
	char url[300]; snprintf(url, sizeof url, GAME_URL "/rest/v1/interactions?game_id=eq.%s&kind=in.(orb,win,round,caught)&id=gt.%ld&select=id,username,kind,payload&order=id.asc&limit=%d", g_game, since < 0 ? 0 : since, max);
	char *r = http(M_GET, url, GAME_ANON_KEY, NULL, NULL, NULL);
	if (!r) return -1;
	int n = 0; const char *p = r, *end;
	while (n < max && (p = next_obj(p, &end))) {
		const char *st = p; p = end + 1; GEvent *e = &out[n]; memset(e, 0, sizeof *e);
		e->id = (long)jnum(st, end, "id"); if (e->id > *last) *last = e->id;
		jstr(st, end, "kind", e->kind, sizeof e->kind); if (!jstr(st, end, "username", e->name, sizeof e->name)) strcpy(e->name, "?");
		e->i = (int)jnum(st, end, "i"); e->n = (int)jnum(st, end, "n"); e->round = (int)jnum(st, end, "round"); n++;
	}
	free(r); return n;
}
bool net_game_event(const Session *s, const char *kind, int a) {
	char args[160];
	if (!strcmp(kind, "orb")) snprintf(args, sizeof args, "\"p_game\":\"%s\",\"p_kind\":\"orb\",\"p_payload\":{\"i\":%d}", g_game, a);
	else if (!strcmp(kind, "win")) snprintf(args, sizeof args, "\"p_game\":\"%s\",\"p_kind\":\"win\",\"p_payload\":{\"round\":%d}", g_game, a);
	else if (!strcmp(kind, "round")) snprintf(args, sizeof args, "\"p_game\":\"%s\",\"p_kind\":\"round\",\"p_payload\":{\"n\":%d}", g_game, a);
	else snprintf(args, sizeof args, "\"p_game\":\"%s\",\"p_kind\":\"caught\",\"p_payload\":{}", g_game);
	return rpc(s, "game_event", args);
}
bool net_npc_get(const Session *s, NpcState *o) {
	char url[300]; snprintf(url, sizeof url, GAME_URL "/rest/v1/npcs?game_id=eq.%s&id=eq.monster&select=x,z,ry,anim,host_id,updated_at&limit=1", g_game);
	char *r = http(M_GET, url, GAME_ANON_KEY, NULL, NULL, NULL);
	if (!r) return false;
	memset(o, 0, sizeof *o); const char *e = r + strlen(r), *p = next_obj(r, &e);
	if (p) {
		char host[40] = "", up[40] = "", an[12] = ""; jstr(p, e, "host_id", host, sizeof host); jstr(p, e, "updated_at", up, sizeof up); jstr(p, e, "anim", an, sizeof an);
		o->have = true; o->x = jnum(p, e, "x"); o->z = jnum(p, e, "z"); o->ry = jnum(p, e, "ry"); o->walk = !strcmp(an, "walk");
		o->remote_fresh = strcmp(host, s->user_id) != 0 && fresh(up, parse_iso(up), 3);
	}
	free(r); return true;
}
bool net_npc_tick(const Session *s, float x, float z, float ry, bool walk) {
	char url[96]; snprintf(url, sizeof url, GAME_URL "/rest/v1/rpc/npc_tick");
	char body[360]; snprintf(body, sizeof body, "{\"p_secret\":\"%s\",\"p_game\":\"%s\",\"p_id\":\"monster\",\"p_x\":%.3f,\"p_y\":0,\"p_z\":%.3f,\"p_ry\":%.3f,\"p_anim\":\"%s\"}", s->secret, g_game, x, z, ry, walk ? "walk" : "idle");
	char *r = http(M_POST, url, GAME_ANON_KEY, NULL, body, NULL);
	bool host = r && strstr(r, "true"); free(r); return host;
}
void net_npc_release(const Session *s) {
	char args[100]; snprintf(args, sizeof args, "\"p_game\":\"%s\",\"p_id\":\"monster\"", g_game); rpc(s, "npc_release", args);
}

// ---------- Lobby: juegos, amigos, avatar ----------
int net_list_games(GameInfo *out, int max) {
	char *r = HAS_STORE ? http(M_GET, STORE_URL "/rest/v1/games?select=id,name,description,owner_id,owner_name,hue,max_players,mode,config&order=created_at.asc&limit=32", STORE_ANON_KEY, NULL, NULL, NULL)
	                    : http(M_GET, GAME_URL "/rest/v1/games?select=id,name,description,owner_id,owner_name,hue,max_players,mode,config&order=created_at.asc&limit=32", GAME_ANON_KEY, NULL, NULL, NULL);
	if (!r) { set_err("No se pudo cargar la lista de juegos"); return -1; }
	int n = 0; const char *p = r, *end;
	while (n < max && (p = next_obj(p, &end))) {
		GameInfo *g = &out[n]; memset(g, 0, sizeof *g);
		const char *st = p; p = end + 1;
		if (!jstr(st, end, "id", g->id, sizeof g->id)) continue;
		jstr(st, end, "name", g->name, sizeof g->name); jstr(st, end, "description", g->desc, sizeof g->desc);
		jstr(st, end, "owner_id", g->owner_id, sizeof g->owner_id); jstr(st, end, "owner_name", g->owner, sizeof g->owner);
		g->hue = (int)jnum(st, end, "hue"); g->max = (int)jnum(st, end, "max_players"); if (!g->max) g->max = 20;
		strcpy(g->mode, "build"); jstr(st, end, "mode", g->mode, sizeof g->mode);
		g->allow_build = -1; g->jump = 8.6f; g->seed = 1337;
		{ const char *cf = json_find_from(st, end, "config");
		  if (cf && *cf == '{') {
			const char *ce; if (!next_obj(cf, &ce)) ce = end;                       // el objeto config completo (puede llevar piezas con sus propias llaves)
			jstr(cf, ce, "world", g->world, sizeof g->world); jstr(cf, ce, "weather", g->weather, sizeof g->weather);
			{ char vs[12] = ""; jstr(cf, ce, "visibility", vs, sizeof vs); g->vis = !strcmp(vs, "private") ? 2 : !strcmp(vs, "unlisted") ? 1 : 0; if (!vs[0]) { const char *dr = json_find_from(cf, ce, "draft"); if (dr && *dr == 't') g->vis = 2; } }
			jstr(cf, ce, "sky", g->sky, sizeof g->sky); { const char *q = json_find_from(cf, ce, "speed"); g->speed = q ? strtof(q, NULL) : 0; q = json_find_from(cf, ce, "fog"); g->fog = q ? strtof(q, NULL) : 0; q = json_find_from(cf, ce, "gravity"); g->gravity = q ? strtof(q, NULL) : 0; q = json_find_from(cf, ce, "double_jump"); g->double_jump = q && *q == 't';
		  q = json_find_from(cf, ce, "spawn"); if (q && *q == '[') { char *e1; float a0 = strtof(q + 1, &e1), a1 = strtof(e1 + (*e1 == ','), &e1), a2 = strtof(e1 + (*e1 == ','), NULL); g->spawn[0] = a0; g->spawn[1] = a1; g->spawn[2] = a2; g->has_spawn = 1; } }
		  g->hour = -1; { const char *tp = json_find_from(cf, ce, "time"); if (tp && ((*tp >= '0' && *tp <= '9') || *tp == '-')) g->hour = strtof(tp, NULL); } jstr(cf, ce, "welcome", g->welcome, sizeof g->welcome); for (char *q = g->welcome; *q; q++) if (*q == '\n') *q = ' '; jstr(cf, ce, "about", g->about, sizeof g->about); jstr(cf, ce, "track", g->track, sizeof g->track); for (char *q = g->about; *q; q++) if (*q == '\n') *q = ' ';
			const char *ab = json_find_from(cf, ce, "allow_build"); if (ab) g->allow_build = *ab == 't';
			const char *jp = json_find_from(cf, ce, "jump"); if (jp) g->jump = strtof(jp, NULL);
			const char *sd = json_find_from(cf, ce, "seed"); if (sd) g->seed = (int)strtof(sd, NULL);
		  } }
		n++;
	}
	free(r); return n;
}
// ---- Piezas del Studio (config.parts): se piden al entrar en un juego y se dibujan/colisionan en main.c (la lectura esta en parts.c) ----
int net_fetch_parts(const char *game_id, Part *out, int max, UiText *ui, int *nui) {
	char url[320]; if (nui) *nui = 0;
	for (const char *q = game_id; *q; q++) if (!((*q >= '0' && *q <= '9') || (*q >= 'a' && *q <= 'z') || (*q >= 'A' && *q <= 'Z') || *q == '-' || *q == '_')) return 0;
	if (HAS_STORE) snprintf(url, sizeof url, STORE_URL "/rest/v1/games?id=eq.%s&select=parts:config->parts,ui:config->ui", game_id);
	else snprintf(url, sizeof url, GAME_URL "/rest/v1/games?id=eq.%s&select=parts:config->parts,ui:config->ui", game_id);
	char *r = http(M_GET, url, HAS_STORE ? STORE_ANON_KEY : GAME_ANON_KEY, NULL, NULL, NULL);
	if (!r) return 0;
	int n = parts_parse(r, out, max);
	if (ui && nui) *nui = ui_parse(r, ui, MAX_UITEXTS);
	free(r); return n;
}
// Rellena g[i].players con los jugadores activos (visto en los últimos 15 s)
void net_player_counts(GameInfo *g, int n) {
	char url[220];
	snprintf(url, sizeof url, GAME_URL "/rest/v1/player_state?select=game_id,updated_at&order=updated_at.desc&limit=300");
	char *r = http(M_GET, url, GAME_ANON_KEY, NULL, NULL, NULL);
	for (int i = 0; i < n; i++) g[i].players = 0;
	if (!r) return;
	char newest[40] = ""; { const char *e = r + strlen(r); jstr(r, e, "updated_at", newest, sizeof newest); }
	time_t nt = parse_iso(newest);
	const char *p = r, *end;
	while ((p = next_obj(p, &end))) {
		char gid[40] = "", up[40] = ""; jstr(p, end, "game_id", gid, sizeof gid); jstr(p, end, "updated_at", up, sizeof up); p = end + 1;
		if (!fresh(up, nt, 20)) continue;
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
// ---- solicitudes de amistad y mensajes privados (RPC del proyecto AUTH; necesitan token de cuenta) ----
static bool auth_rpc_ok(const Session *s, const char *fn, const char *body) {
	char url[160]; snprintf(url, sizeof url, AUTH_URL "/rest/v1/rpc/%s", fn);
	char *r = http(M_POST, url, AUTH_ANON_KEY, s->token, body, NULL);
	bool ok = r != NULL; free(r); return ok;
}
int net_earn_coins(const Session *s, int amount, const char *reason) {
	if (!s->token[0]) return 0;
	char body[80]; snprintf(body, sizeof body, "{\"p_amount\":%d,\"p_reason\":\"%s\"}", amount, reason);
	char *r = http(M_POST, AUTH_URL "/rest/v1/rpc/earn_coins", AUTH_ANON_KEY, s->token, body, NULL);
	int n = r ? atoi(r) : 0; free(r); return n > 0 ? n : 0;
}
bool net_mission_add(const Session *s, const char *key, int n) {
	if (!s->token[0] || n <= 0) return false;
	char body[80]; snprintf(body, sizeof body, "{\"p_key\":\"%s\",\"p_add\":%d}", key, n > 20 ? 20 : n);
	char *r = http(M_POST, AUTH_URL "/rest/v1/rpc/mission_add", AUTH_ANON_KEY, s->token, body, NULL);
	bool ok = r != NULL; free(r); return ok;
}
int net_season(const Session *s, int *season, int *xp) {
	if (!s->token[0]) return -2;
	char *r = http(M_POST, AUTH_URL "/rest/v1/rpc/season_info", AUTH_ANON_KEY, s->token, "{}", NULL);
	if (!r) return -1;
	const char *e = r + strlen(r);
	*season = (int)jnum(r, e, "season"); *xp = (int)jnum(r, e, "xp");
	free(r); return 0;
}
// Tu clan: my_clan devuelve un objeto con name, tag y members[] (o null si no tienes)
int net_my_clan(const Session *s, ClanInfo *c) {
	if (!s->token[0]) return -2;
	char *r = http(M_POST, AUTH_URL "/rest/v1/rpc/my_clan", AUTH_ANON_KEY, s->token, "{}", NULL);
	if (!r) return -1;
	memset(c, 0, sizeof *c); int has = 0; const char *end;
	const char *p = next_obj(r, &end);
	if (p && jstr(p, end, "name", c->name, sizeof c->name)) {
		has = 1; jstr(p, end, "tag", c->tag, sizeof c->tag);
		const char *m = json_find_from(p, end, "members");
		for (const char *q = m; q && (q = strstr(q, "\"username\"")) && q < end; q++) c->members++;
	}
	free(r); return has;
}
// Proxima quedada visible (las de las ultimas 2 horas siguen contando): la primera de list_meetups, que viene ordenada por fecha
int net_next_meetup(const Session *s, Meetup *m) {
	if (!s->token[0]) return -2;
	char *r = http(M_POST, AUTH_URL "/rest/v1/rpc/list_meetups", AUTH_ANON_KEY, s->token, "{}", NULL);
	if (!r) return -1;
	memset(m, 0, sizeof *m); int found = 0; const char *p = r, *end;
	if ((p = next_obj(p, &end))) {
		char at[40] = ""; jstr(p, end, "starts_at", at, sizeof at); time_t t = parse_iso(at);
		if (t) {
			found = 1; m->starts = (long)t; jstr(p, end, "title", m->title, sizeof m->title); jstr(p, end, "game_name", m->game, sizeof m->game); jstr(p, end, "host", m->host, sizeof m->host);
			m->going = (int)jnum(p, end, "going"); m->me = jbool(p, end, "me"); m->clan = jbool(p, end, "clan");
		}
	}
	free(r); return found;
}
int net_list_requests(const Session *s, FriendReq *out, int max) {
	if (!s->token[0]) return -2;
	char *r = http(M_POST, AUTH_URL "/rest/v1/rpc/my_requests", AUTH_ANON_KEY, s->token, "{}", NULL);
	if (!r) return -1;
	int n = 0; const char *p = r, *end;
	while (n < max && (p = next_obj(p, &end))) {
		char dir[8] = "", col[16] = "#4da6ff"; jstr(p, end, "dir", dir, sizeof dir);
		if (!strcmp(dir, "in")) {
			FriendReq *q = &out[n]; memset(q, 0, sizeof *q); q->id = (long)jnum(p, end, "id");
			jstr(p, end, "username", q->name, sizeof q->name); jstr(p, end, "avatar_color", col, sizeof col); q->color = parse_color(col); n++;
		}
		p = end + 1;
	}
	free(r); return n;
}
int net_friend_request(const Session *s, const char *name) {
	char u[24]; size_t k = 0;
	for (const char *c = name; *c && k + 1 < sizeof u; c++) if ((*c >= 'a' && *c <= 'z') || (*c >= 'A' && *c <= 'Z') || (*c >= '0' && *c <= '9') || *c == '_') u[k++] = *c;
	u[k] = 0; if (!k) return -1;
	char body[64]; snprintf(body, sizeof body, "{\"p_username\":\"%s\"}", u);
	char *r = http(M_POST, AUTH_URL "/rest/v1/rpc/send_friend_request", AUTH_ANON_KEY, s->token, body, NULL);
	if (!r) return -1;
	int out = strstr(r, "accepted") ? 1 : strstr(r, "already_friends") ? 2 : strstr(r, "already_sent") ? 3 : 0;
	free(r); return out;
}
bool net_respond_request(const Session *s, long id, bool accept) {
	char body[64]; snprintf(body, sizeof body, "{\"p_id\":%ld,\"p_accept\":%s}", id, accept ? "true" : "false");
	return auth_rpc_ok(s, "respond_friend_request", body);
}
bool net_remove_friend(const Session *s, const char *id) {
	char body[96]; snprintf(body, sizeof body, "{\"p_friend\":\"%s\"}", id);
	return auth_rpc_ok(s, "remove_friend", body);
}
int net_unread_total(const Session *s) {
	if (!s->token[0]) return 0;
	char *r = http(M_POST, AUTH_URL "/rest/v1/rpc/unread_counts", AUTH_ANON_KEY, s->token, "{}", NULL);
	if (!r) return -1;
	int total = 0; for (const char *p = r; (p = strchr(p, ':')); p++) total += atoi(p + 1);
	free(r); return total;
}
int net_favorites(const Session *s, char (*ids)[40], int max) {
	if (!s->token[0]) return -2;
	char *r = http(M_POST, AUTH_URL "/rest/v1/rpc/my_favorites", AUTH_ANON_KEY, s->token, "{}", NULL);
	if (!r) return -1;
	int n = 0; const char *p = r;
	while (n < max && (p = strchr(p, '"'))) { const char *e = strchr(p + 1, '"'); if (!e) break; size_t l = (size_t)(e - p - 1); if (l > 0 && l < 40) { memcpy(ids[n], p + 1, l); ids[n][l] = 0; n++; } p = e + 1; }
	free(r); return n;
}
int net_game_visits(GameInfo *g, int n) {
	char *r = http(M_POST, AUTH_URL "/rest/v1/rpc/game_visit_counts", AUTH_ANON_KEY, NULL, "{}", NULL);
	if (!r) return -1;
	for (int i = 0; i < n; i++) { char key[56]; snprintf(key, sizeof key, "\"%s\":", g[i].id); const char *p = strstr(r, key); g[i].visits = p ? atol(p + strlen(key)) : 0; }
	free(r); return 0;
}
int net_hide_blocked(GameInfo *g, int n) {
	char *r = http(M_POST, AUTH_URL "/rest/v1/rpc/blocked_content", AUTH_ANON_KEY, NULL, "{}", NULL);
	if (!r) return n;
	int k = 0;
	for (int i = 0; i < n; i++) { char key[56]; snprintf(key, sizeof key, "\"%s\"", g[i].id); if (!strstr(r, key)) g[k++] = g[i]; }
	free(r); return k;
}
void net_visit(const Session *s, const char *game_id) {
	if (!s->token[0] || !game_id || !game_id[0]) return;
	char body[100]; snprintf(body, sizeof body, "{\"p_game\":\"%s\"}", game_id);
	char *r = http(M_POST, AUTH_URL "/rest/v1/rpc/game_visit", AUTH_ANON_KEY, s->token, body, NULL); free(r);
}
int net_toggle_favorite(const Session *s, const char *game_id) {
	if (!s->token[0]) return -1;
	char body[100]; snprintf(body, sizeof body, "{\"p_game\":\"%s\"}", game_id);
	char *r = http(M_POST, AUTH_URL "/rest/v1/rpc/toggle_favorite", AUTH_ANON_KEY, s->token, body, NULL);
	if (!r) return -1; int on = strstr(r, "true") != NULL; free(r); return on;
}
int net_fetch_dm(const Session *s, const char *fid, DmMsg *out, int max) {
	if (!s->token[0]) return -2;
	char url[420]; snprintf(url, sizeof url, AUTH_URL "/rest/v1/messages?select=id,from_id,body,edited_at&or=(and(from_id.eq.%s,to_id.eq.%s),and(from_id.eq.%s,to_id.eq.%s))&order=id.desc&limit=%d", s->user_id, fid, fid, s->user_id, max);
	char *r = http(M_GET, url, AUTH_ANON_KEY, s->token, NULL, NULL);
	if (!r) return -1;
	int n = 0; const char *p = r, *end;
	while (n < max && (p = next_obj(p, &end))) {
		char from[40] = ""; DmMsg *m = &out[n]; memset(m, 0, sizeof *m); m->id = (long)jnum(p, end, "id");
		jstr(p, end, "from_id", from, sizeof from); jstr(p, end, "body", m->text, sizeof m->text); m->mine = !strcmp(from, s->user_id);
		{ const char *e = find_val(p, end, "edited_at"); m->edited = e && *e == '"'; } n++; p = end + 1;
	}
	free(r);
	for (int i = 0; i < n / 2; i++) { DmMsg t = out[i]; out[i] = out[n - 1 - i]; out[n - 1 - i] = t; }   // más antiguo primero
	auth_rpc_ok(s, "mark_read", (snprintf(url, sizeof url, "{\"p_from\":\"%s\"}", fid), url));
	return n;
}
static int rarity_of(const char *r) { return !strcmp(r, "epic") ? 2 : !strcmp(r, "rare") ? 1 : 0; }
int net_wallet(const Session *s, Wallet *w) {
	if (!s->token[0]) return -2;
	char *r = http(M_POST, AUTH_URL "/rest/v1/rpc/my_wallet", AUTH_ANON_KEY, s->token, "{}", NULL);
	if (!r) return -1;
	const char *e = r + strlen(r); memset(w, 0, sizeof *w);
	w->bcoins = (int)jnum(r, e, "bcoins"); w->streak = (int)jnum(r, e, "streak"); w->can_claim = jbool(r, e, "can_claim");
	{ const char *q = json_find_from(r, e, "equipped"); const char *qe = q ? strchr(q, '}') : NULL; if (q && qe) { jstr(q, qe, "hat", w->hat, sizeof w->hat); jstr(q, qe, "title", w->title, sizeof w->title); jstr(q, qe, "face", w->face, sizeof w->face); jstr(q, qe, "back", w->back, sizeof w->back); jstr(q, qe, "trail", w->trail, sizeof w->trail); jstr(q, qe, "pet", w->pet, sizeof w->pet); } }
	const char *inv = json_find_from(r, e, "inventory");
	if (inv && *inv == '[') for (const char *p = inv + 1; *p && *p != ']' && w->ninv < 24; p++) if (*p == '"') {
		size_t i = 0; p++; while (*p && *p != '"' && i + 1 < sizeof w->inv[0]) w->inv[w->ninv][i++] = *p++;
		w->inv[w->ninv][i] = 0; w->ninv++; while (*p && *p != '"') p++;
	}
	free(r); return 0;
}
int net_shop_list(const Session *s, ShopItem *out, int max) {
	if (!s->token[0]) return -2;
	char *r = HAS_STORE ? http(M_GET, STORE_URL "/rest/v1/shop_items?select=id,kind,name,price,rarity&price=lt.1000000000&kind=in.(hat,title,crate)&order=sort&limit=40", STORE_ANON_KEY, NULL, NULL, NULL)
	                    : http(M_GET, AUTH_URL "/rest/v1/shop_items?select=id,kind,name,price,rarity&price=lt.1000000000&kind=in.(hat,title,crate)&order=sort&limit=40", AUTH_ANON_KEY, s->token, NULL, NULL);
	if (!r) return -1;
	int n = 0; const char *p = r, *end;
	while (n < max && (p = next_obj(p, &end))) {
		ShopItem *o = &out[n]; memset(o, 0, sizeof *o); char ra[12] = "";
		jstr(p, end, "id", o->id, sizeof o->id); jstr(p, end, "kind", o->kind, sizeof o->kind); jstr(p, end, "name", o->name, sizeof o->name);
		o->price = (int)jnum(p, end, "price"); jstr(p, end, "rarity", ra, sizeof ra); o->rarity = rarity_of(ra); n++; p = end + 1;
	}
	free(r); return n;
}
static int money_err(void) { return last_err[0] && strstr(last_err, "not enough") ? 1 : last_err[0] && strstr(last_err, "already") ? 2 : -1; }
int net_buy(const Session *s, const char *id) {
	if (HAS_STORE) {
		Quote q; net_why[0] = 0;
		if (store_quote(s, id, &q)) {
			char *r = store_redeem(s, &q); if (!r) { why("canje"); return money_err(); } free(r); return 0;
		}
		why("tienda");                                                    // la tienda nueva no responde: probamos la antigua (AUTH)
	}
	char body[80]; snprintf(body, sizeof body, "{\"p_item\":\"%s\"}", id);
	char *r = http(M_POST, AUTH_URL "/rest/v1/rpc/buy_item", AUTH_ANON_KEY, s->token, body, NULL);
	if (!r) { if (!HAS_STORE) why("compra"); return money_err(); }
	free(r); return 0;
}
int net_open_crate(const Session *s, const char *id, char *item, size_t n, int *dup, int *refund) {
	if (HAS_STORE) {
		Quote q; net_why[0] = 0; if (!store_quote(s, id, &q)) { why("tienda"); return -1; }
		char *r = store_redeem(s, &q); if (!r) { why("canje"); return money_err() == 1 ? 1 : -1; }
		const char *e = r + strlen(r); item[0] = 0; jstr(r, e, "item", item, n); *dup = jbool(r, e, "duplicate"); *refund = (int)jnum(r, e, "refund"); free(r); return 0;
	}
	char body[80]; snprintf(body, sizeof body, "{\"p_crate\":\"%s\"}", id);
	char *r = http(M_POST, AUTH_URL "/rest/v1/rpc/open_crate", AUTH_ANON_KEY, s->token, body, NULL);
	if (!r) return money_err() == 1 ? 1 : -1;
	const char *e = r + strlen(r); item[0] = 0; jstr(r, e, "item", item, n); *dup = jbool(r, e, "duplicate"); *refund = (int)jnum(r, e, "refund");
	free(r); return 0;
}
int net_claim_daily(const Session *s) {
	char *r = http(M_POST, AUTH_URL "/rest/v1/rpc/claim_daily", AUTH_ANON_KEY, s->token, "{}", NULL);
	if (!r) return last_err[0] && strstr(last_err, "already") ? 0 : -1;
	int a = (int)jnum(r, r + strlen(r), "amount"); free(r); return a;
}
bool net_equip(const Session *s, const char *id, const char *kind) {
	if (id[0]) { char body[80]; snprintf(body, sizeof body, "{\"p_item\":\"%s\"}", id); return auth_rpc_ok(s, "equip_item", body); }
	char body[60]; snprintf(body, sizeof body, "{\"p_kind\":\"%s\"}", kind); return auth_rpc_ok(s, "unequip_slot", body);
}
bool net_edit_dm(const Session *s, long id, const char *text) {
	char t[110]; clean(t, sizeof t, text); char body[260]; snprintf(body, sizeof body, "{\"p_id\":%ld,\"p_body\":\"%s\"}", id, t);
	return auth_rpc_ok(s, "edit_message", body);
}
bool net_delete_dm(const Session *s, long id) { char body[48]; snprintf(body, sizeof body, "{\"p_id\":%ld}", id); return auth_rpc_ok(s, "delete_message", body); }
bool net_notifs_read(const Session *s) { return auth_rpc_ok(s, "read_notifications", "{}"); }
bool net_notifs_clear(const Session *s) { return auth_rpc_ok(s, "clear_notifications", "{}"); }
int net_list_notifs(const Session *s, Notif *out, int max) {
	if (!s->token[0]) return -2;
	char *r = http(M_GET, AUTH_URL "/rest/v1/notifications?select=id,kind,from_name,payload,read&order=id.desc&limit=20", AUTH_ANON_KEY, s->token, NULL, NULL);
	if (!r) return -1;
	int n = 0; const char *p = r, *end;
	while (n < max && (p = next_obj(p, &end))) {
		Notif *o = &out[n]; memset(o, 0, sizeof *o); o->id = (long)jnum(p, end, "id");
		jstr(p, end, "kind", o->kind, sizeof o->kind); jstr(p, end, "from_name", o->from, sizeof o->from);
		jstr(p, end, "game_id", o->game_id, sizeof o->game_id); jstr(p, end, "game_name", o->game, sizeof o->game); o->read = jbool(p, end, "read");
		n++; p = end + 1;
	}
	free(r); return n;
}
bool net_send_dm(const Session *s, const char *fid, const char *text) {
	char t[110]; clean(t, sizeof t, text);
	char body[260]; snprintf(body, sizeof body, "{\"p_to\":\"%s\",\"p_body\":\"%s\"}", fid, t);
	return auth_rpc_ok(s, "send_message", body);
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
