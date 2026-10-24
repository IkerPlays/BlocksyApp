#pragma once
#include <stdbool.h>
#include <stddef.h>

// Actualizaciones de Blocksy desde las releases de GitHub (estable y devbuild).
// El nucleo (versiones, lectura de releases, SHA-256, notas) esta en update_core.c y se prueba en el ordenador (3ds/tests);
// la descarga e instalacion (curl, AM, ficheros) esta en update.c.
typedef struct {
	bool valid, is_dev, newer;       // newer: mas nueva que la version instalada
	int cmp;                         // 1 mas nueva, 0 es la instalada, -1 mas antigua
	char tag[48];                    // p. ej. v1.4.0 o v1.4.1-dev.13
	char date[12];                   // AAAA-MM-DD de la publicacion ("" si no se sabe)
	char cia[300], dsx[300];         // URLs de descarga de Blocksy.cia y Blocksy.3dsx
	unsigned cia_size, dsx_size;     // tamano en bytes segun GitHub (0 = no se sabe)
	char cia_sha[65], dsx_sha[65];   // SHA-256 en hexadecimal segun GitHub ("" = no se sabe)
	char notes[420];                 // resumen de las notas de la release (texto plano)
} Rel;
typedef struct {
	Rel stable, dev; char cur[48];
	int n_newer;                     // cuantas versiones nuevas hay en el canal que usas
	char log[900];                   // que cambia: una linea por version nueva (la mas reciente primero)
} UpdateInfo;

// Progreso de una instalacion (lo escribe el hilo de red y lo lee la interfaz)
enum { UPD_IDLE, UPD_PREPARE, UPD_DOWNLOAD, UPD_VERIFY, UPD_INSTALL, UPD_DONE };
typedef struct {
	volatile int stage;              // UPD_*
	volatile int pct;                // 0-100 de la descarga
	volatile unsigned done, total;   // bytes recibidos / esperados (total 0 = no se sabe)
	volatile unsigned bps;           // bytes por segundo (media de los ultimos segundos)
	volatile int attempt;            // intento actual (1..)
} UpdateProgress;

void update_init(const char *version, const char *argv0);      // version instalada y ruta del .3dsx (argv[0])
bool update_is_cia(void);                                       // true: instalado como .cia (false: .3dsx desde el Homebrew Launcher)
bool update_check(UpdateInfo *out, char *err, size_t en);       // consulta GitHub (API y, si falla, el feed Atom)
bool update_install(const Rel *r, UpdateProgress *prog, char *err, size_t en);   // descarga, verifica e instala; true = hecho
bool update_dry_run(const Rel *r, UpdateProgress *prog, char *err, size_t en);   // descarga y verifica la version SIN instalarla (para probar la red, la RAM y el SHA-256)
void update_diag(char *out, size_t n);                          // "RAM libre ... MB, SD libre ... MB"
void update_mark_installed(const char *tag);                    // tras instalar: esa version ya no se ofrece antes de reiniciar
void update_restart(void);                                      // pide a la consola que abra de nuevo Blocksy al salir (solo .cia)
bool update_can_rollback(void);                                 // .3dsx: hay una copia de la version anterior (.bak)
bool update_rollback(char *err, size_t en);                     // .3dsx: vuelve a la version anterior (y deja la actual como copia)
bool update_take_news(char *from, char *to, size_t n);          // true una vez tras actualizar: de que version a que version

// ---- nucleo (update_core.c) ----
typedef struct { int v[3]; int dev; bool is_dev, ok; } Ver;
Ver  ver_parse(const char *s);                                   // "v1.4.0", "1.4.1-dev.13"; ok=false si no es una version
int  ver_cmp(Ver a, Ver b);                                      // 1 / 0 / -1; una estable gana a su devbuild
typedef struct { char tag[48], date[12]; bool pre; char cia[300], dsx[300]; unsigned cia_size, dsx_size; char cia_sha[65], dsx_sha[65]; char notes[420]; } ParsedRel;
int  core_parse_api(const char *json, ParsedRel *out, int max);     // respuesta de /releases (ignora borradores y releases sin assets)
int  core_parse_atom(const char *xml, const char *repo, ParsedRel *out, int max);   // feed Atom (sin tamanos ni SHA)
void core_select(const ParsedRel *rels, int n, const char *cur, UpdateInfo *out);   // elige estable y devbuild y rellena newer/cmp/log
typedef struct { unsigned h[8]; unsigned long long len; unsigned char buf[64]; unsigned fill; } Sha256;
void sha256_init(Sha256 *s); void sha256_update(Sha256 *s, const void *d, size_t n); void sha256_hex(Sha256 *s, char out[65]);
bool hex_eq(const char *a, const char *b);                       // compara dos SHA-256 en hexadecimal sin distinguir mayusculas
