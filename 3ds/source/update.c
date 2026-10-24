// Actualizador de Blocksy (3DS): busca la ultima estable y la ultima devbuild en GitHub, descarga la version elegida,
// comprueba que esta completa (tamano y SHA-256 que publica GitHub) y la instala. La logica pura vive en update_core.c.
//  - .cia: se escribe directamente en el servicio AM mientras llega la descarga; nada se instala hasta que el SHA-256 coincide.
//  - .3dsx: se descarga a un fichero .new, se comprueba y solo entonces sustituye al actual (que queda como .bak para volver atras).
//  - Si la red se corta a mitad, la descarga continua desde el byte donde se quedo (no empieza otra vez).
#include "update.h"
#include "net.h"
#include "audio.h"
#include <3ds.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

// Las releases se leen de este repositorio, que debe ser PUBLICO (la 3DS no inicia sesion en GitHub).
#define UPDATE_REPO "IkerPlays/BlocksyApp"
#define RELEASES_URL "https://api.github.com/repos/" UPDATE_REPO "/releases?per_page=30"
#define ATOM_URL "https://github.com/" UPDATE_REPO "/releases.atom"
#define MIN_SIZE 50000                              // un fichero mas pequeno es una pagina de error, no la app
#define VERSION_FILE "sdmc:/3ds/blocksy/version.txt"
#define OUR_TITLE_ID 0x000400000B10C500ULL          // 0004000000B10C50 + 00: el titulo de Blocksy (ver blocksy.rsf: UniqueId 0xB10C5)

static char g_cur[48] = "dev";
static char g_installed[48];                        // version instalada en esta sesion (aun sin reiniciar): no se vuelve a ofrecer
static char g_path[256];                            // ruta del .3dsx en ejecucion (vacia si se ejecuta como .cia)

void update_init(const char *version, const char *argv0) {
	snprintf(g_cur, sizeof g_cur, "%s", version ? version : "dev");
	g_path[0] = 0;
	if (envIsHomebrew() && argv0 && !strncmp(argv0, "sdmc:/", 6)) snprintf(g_path, sizeof g_path, "%s", argv0);
}
bool update_is_cia(void) { return g_path[0] == 0; }
void update_mark_installed(const char *tag) { snprintf(g_installed, sizeof g_installed, "%s", tag ? tag : ""); }
// Reinicio tras actualizar: al salir de la app, el sistema abre el titulo recien instalado
void update_restart(void) { if (update_is_cia()) aptSetChainloader(OUR_TITLE_ID, MEDIATYPE_SD); }

// ---------- aviso "Actualizada a ..." tras reiniciar ----------
bool update_take_news(char *from, char *to, size_t n) {
	char last[48] = ""; FILE *f = fopen(VERSION_FILE, "r");
	if (f) { if (fgets(last, sizeof last, f)) last[strcspn(last, "\r\n")] = 0; fclose(f); }
	bool changed = last[0] && strcmp(last, g_cur);
	if (strcmp(last, g_cur)) { mkdir("sdmc:/3ds", 0777); mkdir("sdmc:/3ds/blocksy", 0777); f = fopen(VERSION_FILE, "w"); if (f) { fprintf(f, "%s\n", g_cur); fclose(f); } }
	if (changed) { snprintf(from, n, "%s", last); snprintf(to, n, "%s", g_cur); }
	return changed;
}

// ---------- buscar versiones ----------
bool update_check(UpdateInfo *out, char *err, size_t en) {
	static ParsedRel rels[40]; int n = 0; char e1[100] = "", e2[100] = "";
	for (int attempt = 0; attempt < 3 && n <= 0; attempt++) {               // reintenta (redes inestables)
		if (attempt) svcSleepThread(1500LL * 1000000LL * attempt);
		char *r = net_get_text(RELEASES_URL, e1, sizeof e1);
		if (!r) continue;
		n = core_parse_api(r, rels, 40); free(r);
		if (n <= 0) { snprintf(e1, sizeof e1, "No hay versiones publicadas todavia"); break; }          // la API respondio: de verdad no hay nada
	}
	if (n <= 0) {                                                            // respaldo sin limite de consultas (sin tamanos ni SHA-256)
		char *r = net_get_text(ATOM_URL, e2, sizeof e2);
		if (r) { n = core_parse_atom(r, UPDATE_REPO, rels, 40); free(r); if (n <= 0) snprintf(e2, sizeof e2, "No hay versiones publicadas todavia"); }
	}
	if (n <= 0) { snprintf(err, en, "%s", e1[0] ? e1 : e2); return false; }
	core_select(rels, n, g_cur, out);
	if (out->stable.valid && !strcmp(out->stable.tag, g_installed)) out->stable.newer = false;
	if (out->dev.valid && !strcmp(out->dev.tag, g_installed)) out->dev.newer = false;
	return true;
}

// ---------- instalar ----------
// Los datos llegan de curl en trozos pequenos; se juntan en bloques grandes antes de escribir (el servicio AM se queja con
// escrituras pequenas y es mucho mas lento si se vacia cada 16 KB).
#define BLOCK (128 * 1024)
typedef struct {
	bool is_cia; Handle am; FILE *f; u8 *buf; size_t fill; unsigned long long total, off;   // total: bytes recibidos; off: bytes ya escritos
	Sha256 sha; Result rc; bool bad_magic, checked, write_fail; UpdateProgress *prog; unsigned expect;
	u64 t_mark; unsigned long long b_mark;                               // para la velocidad
} Job;

static void progress(Job *j) {
	UpdateProgress *p = j->prog; p->done = (unsigned)j->total;
	if (j->expect) p->pct = (int)(j->total * 100 / j->expect > 99 ? 99 : j->total * 100 / j->expect);
	u64 now = osGetTime();
	if (now - j->t_mark >= 700) { unsigned long long db = j->total - j->b_mark; unsigned cur = (unsigned)(db * 1000 / (now - j->t_mark)); p->bps = p->bps ? (p->bps * 2 + cur) / 3 : cur; j->t_mark = now; j->b_mark = j->total; }
}
// El primer bloque debe ser un .cia (cabecera 0x2020) o un .3dsx ("3DSX"); si no, es una pagina de error: no se escribe nada
static bool magic_ok(const Job *j) {
	if (j->fill < 4) return false;
	return j->is_cia ? (j->buf[0] == 0x20 && j->buf[1] == 0x20 && j->buf[2] == 0 && j->buf[3] == 0) : !memcmp(j->buf, "3DSX", 4);
}
static bool flush_block(Job *j) {
	if (!j->fill) return true;
	if (!j->checked) { j->checked = true; if (!magic_ok(j)) { j->bad_magic = true; return false; } }
	if (j->is_cia) {
		u32 w = 0; j->rc = FSFILE_Write(j->am, &w, j->off, j->buf, (u32)j->fill, FS_WRITE_FLUSH);
		if (R_FAILED(j->rc) || w != j->fill) { if (!R_FAILED(j->rc)) j->rc = (Result)0xFFFF0000u | (w & 0xFFFF); j->write_fail = true; return false; }
	} else if (fwrite(j->buf, 1, j->fill, j->f) != j->fill) { j->rc = (Result)0xFFFF0001u; j->write_fail = true; return false; }
	j->off += j->fill; j->fill = 0; return true;
}
static bool sink_write(const void *data, size_t n, void *ud) {
	Job *j = ud; const u8 *p = data;
	sha256_update(&j->sha, data, n); j->total += n;
	while (n) {
		size_t k = BLOCK - j->fill; if (k > n) k = n;
		memcpy(j->buf + j->fill, p, k); j->fill += k; p += k; n -= k;
		if (j->fill == BLOCK && !flush_block(j)) return false;
	}
	progress(j);
	return true;
}

// Errores del servicio AM / del sistema de ficheros explicados
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
// Espacio libre de la SD (bytes); 0 si no se pudo consultar (entonces no se bloquea la instalacion)
static u64 sd_free(void) {
	FS_ArchiveResource res; if (R_FAILED(FSUSER_GetArchiveResource(&res, SYSTEM_MEDIATYPE_SD))) return 0;
	return (u64)res.freeClusters * res.clusterSize;
}

// Abre (o reabre) el destino de la descarga. Para .cia: una sesion de instalacion de AM. Para .3dsx: el fichero .new.
static bool job_open(Job *j, const char *tmp_path, bool overwrite, char *err, size_t en) {
	j->fill = 0; j->total = j->off = 0; j->checked = j->bad_magic = j->write_fail = false; j->rc = 0; sha256_init(&j->sha);
	if (j->is_cia) {
		AM_DeletePendingTitle(MEDIATYPE_SD, OUR_TITLE_ID);                  // restos de un intento anterior interrumpido (si no, "ya existe")
		Result rc = overwrite ? AM_StartCiaInstallOverwrite(&j->am, MEDIATYPE_SD) : AM_StartCiaInstall(MEDIATYPE_SD, &j->am);
		if (R_FAILED(rc)) { j->rc = rc; fmt_rc(err, en, overwrite ? "AM_StartCiaInstallOverwrite" : "AM_StartCiaInstall", rc); return false; }
	} else {
		if (j->f) fclose(j->f);
		j->f = fopen(tmp_path, "wb"); if (!j->f) { snprintf(err, en, "No se pudo escribir en la SD"); return false; }
	}
	return true;
}
static void job_abort(Job *j, const char *tmp_path) {
	if (j->is_cia) { AM_CancelCIAInstall(j->am); AM_DeletePendingTitle(MEDIATYPE_SD, OUR_TITLE_ID); }
	else { if (j->f) { fclose(j->f); j->f = NULL; } remove(tmp_path); }
}

// Descarga con reintentos: si la red se corta se continua desde el byte donde se quedo
static bool job_download(Job *j, const char *url, const char *tmp_path, bool overwrite, char *err, size_t en) {
	for (int attempt = 1; attempt <= 5; attempt++) {
		j->prog->attempt = attempt;
		if (attempt > 1) svcSleepThread(1500LL * 1000000LL * (attempt > 3 ? 3 : attempt - 1));
		bool no_range = false; char e[100] = "";
		if (net_download_from(url, j->total, sink_write, j, NULL, &no_range, e, sizeof e)) return true;
		if (j->bad_magic) { snprintf(err, en, "Lo descargado no es un %s (release incompleta?)", j->is_cia ? ".cia" : ".3dsx"); return false; }
		if (j->write_fail) { if (j->is_cia) fmt_rc(err, en, "No se pudo escribir", j->rc); else snprintf(err, en, "No se pudo escribir en la SD"); return false; }
		if (j->expect && j->total == j->expect) return true;                // llego todo aunque la conexion se cerrara al final
		if (no_range) {                                                     // el servidor no reanuda: se empieza otra vez desde cero
			job_abort(j, tmp_path); j->prog->done = 0; j->prog->pct = 0;
			if (!job_open(j, tmp_path, overwrite, err, en)) return false;
		}
		snprintf(err, en, "%s", e);
	}
	return false;
}

static bool finish_checks(Job *j, const char *want_sha, char *err, size_t en) {
	j->prog->stage = UPD_VERIFY;
	if (j->total < MIN_SIZE) { snprintf(err, en, "Descarga demasiado pequena (%u bytes)", (unsigned)j->total); return false; }
	if (j->expect && j->total != j->expect) { snprintf(err, en, "Descarga incompleta (%u de %u bytes)", (unsigned)j->total, j->expect); return false; }
	if (want_sha[0]) { char got[65]; sha256_hex(&j->sha, got); if (!hex_eq(got, want_sha)) { snprintf(err, en, "Descarga corrupta (el SHA-256 no coincide)"); return false; } }
	return true;
}

static bool install_cia(const Rel *r, UpdateProgress *prog, char *err, size_t en) {
	Result rc = amInit(); if (R_FAILED(rc)) { fmt_rc(err, en, "amInit fallo", rc); return false; }
	Job j = {0}; j.is_cia = true; j.prog = prog; j.expect = r->cia_size; j.t_mark = osGetTime();
	j.buf = malloc(BLOCK); if (!j.buf) { amExit(); snprintf(err, en, "Sin memoria para la descarga"); return false; }
	bool ok = false, overwrite = false, opened = job_open(&j, NULL, false, err, en);
	if (!opened && j.rc == (Result)0xC8E083FC) { overwrite = true; opened = job_open(&j, NULL, true, err, en); }      // "ya existe": se reinstala encima
	if (opened) {
		prog->stage = UPD_DOWNLOAD;
		ok = job_download(&j, r->cia, NULL, overwrite, err, en);
		if (ok && !flush_block(&j)) { ok = false; if (j.bad_magic) snprintf(err, en, "Lo descargado no es un .cia (release incompleta?)"); else fmt_rc(err, en, "No se pudo escribir", j.rc); }
		if (ok) ok = finish_checks(&j, r->cia_sha, err, en);               // nada se instala hasta que esta comprobado
		if (ok) {
			prog->stage = UPD_INSTALL;
			rc = AM_FinishCiaInstall(j.am);
			if (R_FAILED(rc)) { ok = false; fmt_rc(err, en, "AM_FinishCiaInstall fallo", rc); }
		}
		if (!ok) AM_CancelCIAInstall(j.am);                                // si no, la siguiente instalacion falla
	}
	free(j.buf); amExit();
	return ok;
}

static bool install_3dsx(const Rel *r, UpdateProgress *prog, char *err, size_t en) {
	char tmp[sizeof g_path + 8], bak[sizeof g_path + 8];
	snprintf(tmp, sizeof tmp, "%s.new", g_path); snprintf(bak, sizeof bak, "%s.bak", g_path);
	Job j = {0}; j.prog = prog; j.expect = r->dsx_size; j.t_mark = osGetTime();
	j.buf = malloc(BLOCK); if (!j.buf) { snprintf(err, en, "Sin memoria para la descarga"); return false; }
	bool ok = job_open(&j, tmp, false, err, en);
	if (ok) { prog->stage = UPD_DOWNLOAD; ok = job_download(&j, r->dsx, tmp, false, err, en); }
	if (ok && !flush_block(&j)) { ok = false; if (j.bad_magic) snprintf(err, en, "Lo descargado no es un .3dsx (release incompleta?)"); else snprintf(err, en, "No se pudo escribir en la SD"); }
	if (j.f) { fclose(j.f); j.f = NULL; }
	if (ok) ok = finish_checks(&j, r->dsx_sha, err, en);
	if (ok) {                                                             // el actual pasa a .bak y el nuevo ocupa su sitio; si algo falla se deshace
		prog->stage = UPD_INSTALL;
		remove(bak);
		if (rename(g_path, bak) != 0) { ok = false; snprintf(err, en, "No se pudo guardar la copia de seguridad"); }
		else if (rename(tmp, g_path) != 0) { ok = false; snprintf(err, en, "No se pudo colocar el .3dsx nuevo"); rename(bak, g_path); }
	}
	if (!ok) remove(tmp);
	free(j.buf);
	return ok;
}

bool update_install(const Rel *r, UpdateProgress *prog, char *err, size_t en) {
	prog->stage = UPD_PREPARE; prog->pct = 0; prog->done = 0; prog->bps = 0; prog->attempt = 1;
	unsigned size = update_is_cia() ? r->cia_size : r->dsx_size; prog->total = size;
	u64 fr = sd_free(), need = (u64)size * 3 + (24ULL << 20);                  // el .cia, su copia temporal de instalacion y un margen
	if (fr && fr < need) { snprintf(err, en, "La SD casi no tiene espacio (%u MB libres, hacen falta %u MB)", (unsigned)(fr >> 20), (unsigned)(need >> 20)); prog->stage = UPD_IDLE; return false; }
	audio_hold(true);                                                          // la musica guarda la cancion entera en RAM: se libera para el instalador
	bool ok = update_is_cia() ? install_cia(r, prog, err, en) : install_3dsx(r, prog, err, en);
	audio_hold(false);
	prog->stage = ok ? UPD_DONE : UPD_IDLE;
	if (ok) { prog->pct = 100; prog->done = prog->total; }
	return ok;
}

// ---------- volver a la version anterior (.3dsx) ----------
bool update_can_rollback(void) {
	if (update_is_cia()) return false;
	char bak[sizeof g_path + 8]; snprintf(bak, sizeof bak, "%s.bak", g_path);
	FILE *f = fopen(bak, "rb"); if (!f) return false; fclose(f); return true;
}
bool update_rollback(char *err, size_t en) {
	if (!update_can_rollback()) { snprintf(err, en, "No hay copia de la version anterior"); return false; }
	char bak[sizeof g_path + 8], tmp[sizeof g_path + 8]; snprintf(bak, sizeof bak, "%s.bak", g_path); snprintf(tmp, sizeof tmp, "%s.swap", g_path);
	remove(tmp);
	if (rename(g_path, tmp) != 0) { snprintf(err, en, "No se pudo intercambiar los ficheros"); return false; }
	if (rename(bak, g_path) != 0) { rename(tmp, g_path); snprintf(err, en, "No se pudo restaurar la copia"); return false; }
	rename(tmp, bak);                                                        // la version que sustituimos queda como copia (se puede volver a "avanzar")
	return true;
}
