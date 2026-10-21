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

static char g_cur[48] = "dev";
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

bool update_check(UpdateInfo *out, char *err, size_t en) {
	memset(out, 0, sizeof *out); snprintf(out->cur, sizeof out->cur, "%s", g_cur);
	char *r = net_get_text(RELEASES_URL, err, en);
	if (!r) return false;
	bool okc; Ver cur = parse_ver(g_cur, &okc);
	Ver best_s = {{0}, 0, false}, best_d = {{0}, 0, true};
	const char *p = r, *end;
	while ((p = next_obj(p, &end))) {
		const char *obj = p; p = end + 1;
		if (jbool(obj, end, "draft")) continue;
		char tag[48] = ""; if (!jstr(obj, end, "tag_name", tag, sizeof tag)) continue;
		bool ok; Ver v = parse_ver(tag, &ok); if (!ok) continue;
		bool pre = jbool(obj, end, "prerelease"); v.is_dev = pre; if (!pre) v.dev = 0;
		Rel tmp = {.valid = true, .is_dev = pre};
		snprintf(tmp.tag, sizeof tmp.tag, "%s", tag);
		if (!asset_url(obj, end, ".cia", tmp.cia, sizeof tmp.cia) || !asset_url(obj, end, ".3dsx", tmp.dsx, sizeof tmp.dsx)) continue;
		if (!pre && (!out->stable.valid || cmp_ver(v, best_s) > 0)) { out->stable = tmp; best_s = v; }
		if (pre && (!out->dev.valid || cmp_ver(v, best_d) > 0)) { out->dev = tmp; best_d = v; }
	}
	free(r);
	if (out->stable.valid) out->stable.newer = cmp_ver(best_s, cur) > 0;
	if (out->dev.valid) out->dev.newer = cmp_ver(best_d, cur) > 0;
	if (!out->stable.valid && !out->dev.valid) { snprintf(err, en, "No hay versiones publicadas todavia"); return false; }
	return true;
}

// ---------- instalación ----------
// Los datos llegan de curl en trozos pequeños; se juntan en bloques grandes antes de escribir (el servicio AM se queja con
// escrituras pequeñas y es mucho más lento si se vacía cada 16 KB).
#define BLOCK (128 * 1024)
typedef struct { Handle am; u64 off; bool is_cia; FILE *f; size_t total; u8 *buf; size_t fill; Result rc; } Sink;
static bool flush_block(Sink *s) {
	if (!s->fill) return true;
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

bool update_install(const Rel *r, volatile int *pct, char *err, size_t en) {
	bool cia = update_is_cia();
	const char *url = cia ? r->cia : r->dsx;
	Sink s = {0}; s.is_cia = cia;
	s.buf = malloc(BLOCK); if (!s.buf) { snprintf(err, en, "Sin memoria para la descarga"); return false; }
	char tmp_path[sizeof g_path + 8] = "";
	if (cia) {
		Result rc = amInit(); if (R_FAILED(rc)) { free(s.buf); snprintf(err, en, "amInit fallo (%08lX)", (unsigned long)rc); return false; }
		rc = AM_StartCiaInstall(MEDIATYPE_SD, &s.am);
		if (R_FAILED(rc)) { amExit(); free(s.buf); snprintf(err, en, "AM_StartCiaInstall fallo (%08lX)", (unsigned long)rc); return false; }
	} else {
		snprintf(tmp_path, sizeof tmp_path, "%s.new", g_path);       // se escribe al lado: si falla, el .3dsx actual queda intacto
		s.f = fopen(tmp_path, "wb"); if (!s.f) { free(s.buf); snprintf(err, en, "No se pudo escribir en la SD"); return false; }
	}
	*pct = 0;
	bool ok = net_download(url, sink_write, &s, pct, err, en);
	if (ok && !flush_block(&s)) ok = false;                      // último bloque (el resto ya se escribió)
	if (!ok && R_FAILED(s.rc)) snprintf(err, en, "No se pudo escribir (%08lX)", (unsigned long)s.rc);   // código real del fallo
	free(s.buf);
	if (ok && s.total < MIN_SIZE) { ok = false; snprintf(err, en, "Descarga demasiado pequena (%u bytes)", (unsigned)s.total); }
	if (cia) {
		if (ok) {
			Result rc = AM_FinishCiaInstall(s.am);
			if (R_FAILED(rc)) { ok = false; snprintf(err, en, "AM_FinishCiaInstall fallo (%08lX)", (unsigned long)rc); }
		}
		if (!ok) AM_CancelCIAInstall(s.am);                           // si no, la siguiente instalación falla
		amExit();
	} else {
		fclose(s.f);
		if (ok) { remove(g_path); if (rename(tmp_path, g_path) != 0) { ok = false; snprintf(err, en, "No se pudo colocar el .3dsx nuevo (queda como %s)", tmp_path); } }
		else remove(tmp_path);
	}
	if (ok) *pct = 100;
	return ok;
}
