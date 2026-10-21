#pragma once
#include <stdbool.h>
#include <stddef.h>

// Actualizaciones desde las releases de GitHub: la última estable y la última devbuild (pre-release).
typedef struct {
	bool valid, is_dev, newer;       // newer: más nueva que la versión instalada
	char tag[48];                    // p. ej. v0.1.0 o v0.1.1-dev.13
	char cia[300], dsx[300];         // URLs de descarga de Blocksy.cia y Blocksy.3dsx
} Rel;
typedef struct { Rel stable, dev; char cur[48]; } UpdateInfo;

void update_init(const char *version, const char *argv0);      // versión instalada y ruta del .3dsx (argv[0])
bool update_is_cia(void);                                       // true: instalado como .cia (false: .3dsx desde el Homebrew Launcher)
bool update_check(UpdateInfo *out, char *err, size_t en);       // consulta GitHub
bool update_install(const Rel *r, volatile int *pct, char *err, size_t en);   // descarga e instala; true = hecho
