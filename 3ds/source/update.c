// Auto-update de Blocksy: busca la última versión (estable o devbuild) en GitHub y la instala.
#include "update.h"
#include "net.h"
#include "json.h"
#include <3ds.h>
#include <stdio.h>
#include <string.h>

// Las releases se leen de este repositorio, que debe ser PUBLICO (la 3DS no inicia sesion en GitHub).
#define UPDATE_REPO "IkerPlays/BlocksyApp"
#define RELEASES_URL "https://api.github.com/repos/" UPDATE_REPO "/releases?per_page=20"
#define MIN_SIZE 50000        // un fichero más pequeño es una página de error, no la app

#define OUR_TITLE_ID 0x000400000B10C500ULL     // 0004000000B10C50 + 00: el título de Blocksy (ver blocksy.rsf: UniqueId 0xB10C5)
static char g_cur[48] = "dev";
static char g_installed[48];   // version instalada en esta sesion (aun sin reiniciar): no se vuelve a ofrecer
static char g_path[256];      // ruta del .3dsx en ejecución (vacía si se ejecuta como .cia)

void update_init(const char *version, const char *argv0) {
	snprintf(g_cur, sizeof g_cur, "%s", version ? version : "dev");
	g_path[0] = 0;
	if (envIsHomebrew() && argv0 && !strncmp(argv0, "sdmc:/", 6)) snprintf(g_path, sizeof g_path, "%s", argv0);
}
bool update_is_cia(void) { return g_path[0] == 0; }

// ---------- versiones ----------
typedef struct { int v[3]; int dev; bool is_dev; } Ver;
static Ver parse_ver(const char *s, bool *ok) {
	Ver r = {{0, 0, 0}, 0, true};
	if (*s == 'v' || *s == 'V') s++;
	int a = 0, b = 0, c = 0;
	*ok = sscanf(s, "%d.%d.%d", &a, &b, &c) == 3;
	r.v[0] = a; r.v[1] = b; r.v[2] = c;
	const char *d = strstr(s, "-dev.");
	if (d) { r.is_dev = true; r.dev = atoi(d + 5); } else r.is_dev = !*ok;     // sin "-dev." y válida = estable
	if (*ok && !d) r.is_dev = false;
	return r;
}
static int cmp_ver(Ver a, Ver b) {
	for (int i = 0; i < 3; i++) if (a.v[i] != b.v[i]) return a.v[i] > b.v[i] ? 1 : -1;
	if (a.is_dev != b.is_dev) return a.is_dev ? -1 : 1;     // 0.1.0 estable > 0.1.0-dev.N
	return a.dev == b.dev ? 0 : a.dev > b.dev ? 1 : -1;
}

// URL del primer asset del release con esa extensión
static bool asset_url(const char *obj, const char *end, const char *ext, char *dst, size_t n) {
	const char *p = obj;
	while ((p = json_find_from(p, end, "browser_download_url"))) {
		char url[300]; const char *q = p; size_t i = 0;
		if (*q != '"') break;
		q++; while (*q && *q != '"' && i + 1 < sizeof url) url[i++] = *q++;
		url[i] = 0;
		size_t l = strlen(url), e = strlen(ext);
		if (l > e && !strcmp(url + l - e, ext)) { snprintf(dst, n, "%s", url); return true; }
		p = q;
	}
	return false;
}

// Anota una release en el resultado (stable o dev) si es más nueva que la mejor vista hasta ahora
// Decodifica el texto JSON de "body" (\n, \", \uXXXX...) y lo deja legible en la fuente de la 3DS, como hace Iker's Tube:
// sin *, `, # ni emojis; sin lineas "<sub>" ni "---".
static void notes_from(const char *obj, const char *end, char *dst, size_t n) {
	dst[0] = 0; const char *p = json_find_from(obj, end, "body"); if (!p || *p != '"') return;
	char raw[1400]; size_t i = 0; p++;
	while (*p && p < end && *p != '"' && i + 2 < sizeof raw) {
		if (*p == '\\' && p[1]) {
			p++;
			if (*p == 'n') raw[i++] = '\n'; else if (*p == 'r' || *p == 't') raw[i++] = ' ';
			else if (*p == 'u') { unsigned cp = 0; sscanf(p + 1, "%4x", &cp); p += 4; if (cp == 0x2013 || cp == 0x2014) raw[i++] = '-'; else if (cp >= 0x20 && cp < 0x80) raw[i++] = (char)cp; }
			else raw[i++] = *p;
			p++; continue;
		}
		if ((unsigned char)*p < 0x80) { if (*p != '*' && *p != '`' && *p != '#') raw[i++] = *p; p++; }
		else { unsigned char c = (unsigned char)*p; size_t l = c >= 0xF0 ? 4 : c >= 0xE0 ? 3 : 2; p += l; }       // emojis y simbolos: fuera
	}
	raw[i] = 0;
	size_t o = 0; char *line = raw;
	while (line && *line && o + 2 < n) {
		char *nl = strchr(line, '\n'); if (nl) *nl = 0;
		while (*line == ' ') line++;
		if (*line && strncmp(line, "<sub>", 5) && strncmp(line, "---", 3)) o += snprintf(dst + o, n - o, "%s\n", line);
		line = nl ? nl + 1 : NULL;
	}
	if (o >= n) dst[n - 1] = 0;
}
static void consider(UpdateInfo *out, Ver *best_s, Ver *best_d, const char *tag, bool pre, const char *cia, const char *dsx, const char *notes) {
	bool ok; Ver v = parse_ver(tag, &ok); if (!ok) return;
	v.is_dev = pre; if (!pre) v.dev = 0;
	Rel tmp = {.valid = true, .is_dev = pre};
	snprintf(tmp.tag, sizeof tmp.tag, "%s", tag); snprintf(tmp.cia, sizeof tmp.cia, "%s", cia); snprintf(tmp.dsx, sizeof tmp.dsx, "%s", dsx); snprintf(tmp.notes, sizeof tmp.notes, "%s", notes ? notes : "");
	if (!pre && (!out->stable.valid || cmp_ver(v, *best_s) > 0)) { out->stable = tmp; *best_s = v; }
	if (pre && (!out->dev.valid || cmp_ver(v, *best_d) > 0)) { out->dev = tmp; *best_d = v; }
}

// Vía 1: API de GitHub (sabe qué es pre-release y qué assets hay)
static bool check_api(UpdateInfo *out, Ver *best_s, Ver *best_d, char *err, size_t en) {
	char *r = net_get_text(RELEASES_URL, err, en);
	if (!r) return false;
	const char *p = r, *end; int found = 0;
	while ((p = next_obj(p, &end))) {
		const char *obj = p; p = end + 1;
		if (jbool(obj, end, "draft")) continue;
		char tag[48] = ""; if (!jstr(obj, end, "tag_name", tag, sizeof tag)) continue;
		{ bool tk; parse_ver(tag, &tk); if (!tk) { char nm[48] = ""; jstr(obj, end, "name", nm, sizeof nm); parse_ver(nm, &tk); if (tk) snprintf(tag, sizeof tag, "%s", nm); } }       // etiqueta rara: se usa el nombre de la release
		char cia[300], dsx[300];
		if (!asset_url(obj, end, ".cia", cia, sizeof cia) || !asset_url(obj, end, ".3dsx", dsx, sizeof dsx)) continue;   // sin assets aún (publicándose)
		char notes[420]; notes_from(obj, end, notes, sizeof notes);
		consider(out, best_s, best_d, tag, jbool(obj, end, "prerelease"), cia, dsx, notes); found++;
	}
	free(r);
	if (!found) { snprintf(err, en, "No hay versiones publicadas todavia"); return false; }
	return true;
}
// Vía 2 (si la API falla por límite de consultas o error): el feed Atom de releases, que no tiene límite.
// Las URLs de los assets se construyen con el tag (Blocksy.cia / Blocksy.3dsx); las devbuilds se reconocen por "-dev.".
static bool check_atom(UpdateInfo *out, Ver *best_s, Ver *best_d, char *err, size_t en) {
	char *r = net_get_text("https://github.com/" UPDATE_REPO "/releases.atom", err, en);
	if (!r) return false;
	static const char key[] = "/releases/tag/"; int found = 0;
	for (const char *p = r; (p = strstr(p, key)); p += sizeof key - 1) {
		char tag[48]; size_t i = 0; const char *q = p + sizeof key - 1;
		while (*q && *q != '"' && *q != '<' && *q != '&' && i + 1 < sizeof tag) tag[i++] = *q++;
		tag[i] = 0; if (!i) continue;
		char cia[300], dsx[300];
		snprintf(cia, sizeof cia, "https://github.com/" UPDATE_REPO "/releases/download/%s/Blocksy.cia", tag);
		snprintf(dsx, sizeof dsx, "https://github.com/" UPDATE_REPO "/releases/download/%s/Blocksy.3dsx", tag);
		consider(out, best_s, best_d, tag, strstr(tag, "-dev.") != NULL, cia, dsx, NULL); found++;
	}
	free(r);
	if (!found) { snprintf(err, en, "No hay versiones publicadas todavia"); return false; }
	return true;
}

bool update_check(UpdateInfo *out, char *err, size_t en) {
	memset(out, 0, sizeof *out); snprintf(out->cur, sizeof out->cur, "%s", g_cur);
	bool okc; Ver cur = parse_ver(g_cur, &okc);
	Ver best_s = {{0}, 0, false}, best_d = {{0}, 0, true};
	bool ok = false; char e1[100] = "", e2[100] = "";
	for (int attempt = 0; attempt < 3 && !ok; attempt++) {                    // reintenta (redes inestables)
		if (attempt) svcSleepThread(1500LL * 1000000LL * attempt);
		memset(out, 0, sizeof *out); snprintf(out->cur, sizeof out->cur, "%s", g_cur);
		ok = check_api(out, &best_s, &best_d, e1, sizeof e1);
		if (!ok && strstr(e1, "publicadas")) break;                            // la API respondió: de verdad no hay nada
	}
	if (!ok) {                                                                 // respaldo sin límite de consultas
		memset(out, 0, sizeof *out); snprintf(out->cur, sizeof out->cur, "%s", g_cur);
		ok = check_atom(out, &best_s, &best_d, e2, sizeof e2);
	}
	if (!ok) { snprintf(err, en, "%s", e1[0] ? e1 : e2); return false; }
	if (out->stable.valid) { out->stable.cmp = cmp_ver(best_s, cur); out->stable.newer = out->stable.cmp > 0 && strcmp(out->stable.tag, g_installed); }
	if (out->dev.valid) { out->dev.cmp = cmp_ver(best_d, cur); out->dev.newer = out->dev.cmp > 0 && strcmp(out->dev.tag, g_installed); }
	return true;
}

void update_mark_installed(const char *tag) { snprintf(g_installed, sizeof g_installed, "%s", tag ? tag : ""); }
// Reinicio tras actualizar: al salir de la app, el sistema abre el título recién instalado
void update_restart(void) { if (update_is_cia()) aptSetChainloader(OUR_TITLE_ID, MEDIATYPE_SD); }
// ---------- instalación ----------
// Los datos llegan de curl en trozos pequeños; se juntan en bloques grandes antes de escribir (el servicio AM se queja con
// escrituras pequeñas y es mucho más lento si se vacía cada 16 KB).
#define BLOCK (128 * 1024)
typedef struct { Handle am; u64 off; bool is_cia; FILE *f; size_t total; u8 *buf; size_t fill; Result rc; bool bad_magic, checked; } Sink;
// El primer bloque debe ser un .cia (cabecera 0x2020) o un .3dsx ("3DSX"); si no, es una página de error: no se escribe nada
static bool magic_ok(const Sink *s) {
	if (s->fill < 4) return false;
	return s->is_cia ? (s->buf[0] == 0x20 && s->buf[1] == 0x20 && s->buf[2] == 0 && s->buf[3] == 0) : !memcmp(s->buf, "3DSX", 4);
}
static bool flush_block(Sink *s) {
	if (!s->fill) return true;
	if (!s->checked) { s->checked = true; if (!magic_ok(s)) { s->bad_magic = true; return false; } }
	if (s->is_cia) {
		u32 w = 0;
		s->rc = FSFILE_Write(s->am, &w, s->off, s->buf, (u32)s->fill, FS_WRITE_FLUSH);
		if (R_FAILED(s->rc) || w != s->fill) { if (!R_FAILED(s->rc)) s->rc = (Result)0xFFFF0000u | (w & 0xFFFF); return false; }
		s->off += w;
	} else if (fwrite(s->buf, 1, s->fill, s->f) != s->fill) { s->rc = (Result)0xFFFF0001u; return false; }
	s->fill = 0; return true;
}
static bool sink_write(const void *data, size_t n, void *ud) {
	Sink *s = ud; const u8 *p = data;
	s->total += n;
	while (n) {
		size_t k = BLOCK - s->fill; if (k > n) k = n;
		memcpy(s->buf + s->fill, p, k); s->fill += k; p += k; n -= k;
		if (s->fill == BLOCK && !flush_block(s)) return false;
	}
	return true;
}


// Explica los errores más comunes del servicio AM / del sistema de ficheros
static const char *am_hint(Result rc) {
	switch ((u32)rc) {
	case 0xC8E083FC: return "ya existe esa version";
	case 0xC86044CD: case 0xC8A044DC: case 0xC8804464: return "SD llena";
	case 0xD8E093FC: case 0xC8A0CFFC: return "CIA no valido";
	case 0xD900182F: return "SD protegida contra escritura";
	}
	return NULL;
}
static void fmt_rc(char *err, size_t en, const char *what, Result rc) {
	const char *h = am_hint(rc);
	if (h) snprintf(err, en, "%s: %s (%08lX)", what, h, (unsigned long)rc); else snprintf(err, en, "%s (%08lX)", what, (unsigned long)rc);
}
// Espacio libre de la SD (bytes); 0 si no se pudo consultar (entonces no se bloquea la instalación)
static u64 sd_free(void) {
	FS_ArchiveResource res; if (R_FAILED(FSUSER_GetArchiveResource(&res, SYSTEM_MEDIATYPE_SD))) return 0;
	return (u64)res.freeClusters * res.clusterSize;
}
#define NEED_FREE (24ULL * 1024 * 1024)       // margen para el .cia (y la copia temporal de instalación)

// Una pasada de descarga + instalación como .cia. overwrite: usa el modo "sobrescribir título existente".
static bool install_cia_once(const char *url, bool overwrite, volatile int *pct, char *err, size_t en, Result *rc_out) {
	Sink s = {0}; s.is_cia = true; *rc_out = 0;
	s.buf = malloc(BLOCK); if (!s.buf) { snprintf(err, en, "Sin memoria para la descarga"); return false; }
	AM_DeletePendingTitle(MEDIATYPE_SD, OUR_TITLE_ID);          // restos de un intento anterior interrumpido (si no, "ya existe")
	Result rc = overwrite ? AM_StartCiaInstallOverwrite(&s.am, MEDIATYPE_SD) : AM_StartCiaInstall(MEDIATYPE_SD, &s.am);
	if (R_FAILED(rc)) { free(s.buf); *rc_out = rc; fmt_rc(err, en, overwrite ? "AM_StartCiaInstallOverwrite" : "AM_StartCiaInstall", rc); return false; }
	*pct = 0;
	bool ok = net_download(url, sink_write, &s, pct, err, en);
	if (ok && !flush_block(&s)) ok = false;                      // último bloque (el resto ya se escribió)
	if (!ok && s.bad_magic) snprintf(err, en, "Lo descargado no es un .cia (release incompleta?)");
	else if (!ok && R_FAILED(s.rc)) { *rc_out = s.rc; fmt_rc(err, en, "No se pudo escribir", s.rc); }
	free(s.buf);
	if (ok && s.total < MIN_SIZE) { ok = false; snprintf(err, en, "Descarga demasiado pequena (%u bytes)", (unsigned)s.total); }
	if (ok) {
		rc = AM_FinishCiaInstall(s.am);
		if (R_FAILED(rc)) { ok = false; *rc_out = rc; fmt_rc(err, en, "AM_FinishCiaInstall fallo", rc); }
	}
	if (!ok) AM_CancelCIAInstall(s.am);                           // si no, la siguiente instalación falla
	return ok;
}

// ¿Merece la pena reintentar? Solo los fallos de red; no los de SD, formato o espacio
static bool retryable(const char *err, Result rc, bool bad) {
	if (bad || R_FAILED(rc)) return false;
	return strstr(err, "Descarga fallida") || strstr(err, "servidor respondio") || strstr(err, "pequena");
}

bool update_install(const Rel *r, volatile int *pct, char *err, size_t en) {
	u64 fr = sd_free();
	if (fr && fr < NEED_FREE) { snprintf(err, en, "La SD casi no tiene espacio (%u MB libres)", (unsigned)(fr >> 20)); return false; }
	if (update_is_cia()) {
		Result rc = amInit(); if (R_FAILED(rc)) { fmt_rc(err, en, "amInit fallo", rc); return false; }
		Result last = 0; bool ok = false;
		for (int attempt = 0; attempt < 3 && !ok; attempt++) {                  // hasta 3 intentos si falla la red
			if (attempt) svcSleepThread(2000LL * 1000000LL);
			ok = install_cia_once(r->cia, false, pct, err, en, &last);
			// 0xC8E083FC = "ya existe": ese título/versión ya está instalado. Se reintenta sobrescribiendo.
			if (!ok && last == (Result)0xC8E083FC) { char err2[100] = ""; ok = install_cia_once(r->cia, true, pct, err2, sizeof err2, &last); if (!ok) snprintf(err, en, "%s", err2); }
			if (!ok && !retryable(err, last, false)) break;
		}
		amExit();
		if (ok) *pct = 100;
		return ok;
	}
	// .3dsx (Homebrew Launcher): se escribe al lado y se reemplaza al terminar
	char tmp_path[sizeof g_path + 8]; snprintf(tmp_path, sizeof tmp_path, "%s.new", g_path);   // si falla, el .3dsx actual queda intacto
	bool ok = false;
	for (int attempt = 0; attempt < 3 && !ok; attempt++) {
		if (attempt) svcSleepThread(2000LL * 1000000LL);
		Sink s = {0};
		s.buf = malloc(BLOCK); if (!s.buf) { snprintf(err, en, "Sin memoria para la descarga"); return false; }
		s.f = fopen(tmp_path, "wb"); if (!s.f) { free(s.buf); snprintf(err, en, "No se pudo escribir en la SD"); return false; }
		*pct = 0;
		ok = net_download(r->dsx, sink_write, &s, pct, err, en);
		if (ok && !flush_block(&s)) ok = false;
		if (!ok && s.bad_magic) snprintf(err, en, "Lo descargado no es un .3dsx (release incompleta?)");
		else if (!ok && R_FAILED(s.rc)) snprintf(err, en, "No se pudo escribir en la SD");
		free(s.buf); fclose(s.f);
		if (ok && s.total < MIN_SIZE) { ok = false; snprintf(err, en, "Descarga demasiado pequena (%u bytes)", (unsigned)s.total); }
		if (!ok) { remove(tmp_path); if (!retryable(err, s.rc, s.bad_magic)) break; }
	}
	if (ok) { remove(g_path); if (rename(tmp_path, g_path) != 0) { ok = false; snprintf(err, en, "No se pudo colocar el .3dsx nuevo (queda como %s)", tmp_path); } }
	if (ok) *pct = 100;
	return ok;
}
