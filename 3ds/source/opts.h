#pragma once
// Opciones de juego del menu Ajustes: tabla, valores por defecto y lectura/escritura del archivo de ajustes (codigo puro, con test en tests/opts_test.c)
enum { OPT_NAMETAGS, OPT_BUBBLES, OPT_INVERT, OPT_CAMSPD, OPT_RADARR, OPT_COMPASS, OPT_PILL, OPT_OUTLINE, OPT_SHADOWS, OPT_DECOR, OPT_STEPSND, OPT_CHATSND, OPT_TIMER, OPT_BLOCKCNT, OPT_REPEAT, OPT_BLOCKNAME, OPT_RUNTOGGLE, OPT_WIFI, OPT_CLOCK, OPT_AUTOSIT, OPT_FIREFLY, OPT_SORT, NOPT };
typedef struct { const char *key, *es, *en, *pt; int n, def; const char *ves[3], *ven[3]; } OptDef;
extern const OptDef OPTS[NOPT];
void opts_defaults(int *vals);                        // pone todos los valores por defecto
int opts_parse_line(int *vals, const char *line);     // "opt.<clave>=<n>": devuelve 1 si la linea era de una opcion (aunque el valor sea invalido: se usa el defecto)
const char *opts_format(int id, int val);             // "opt.<clave>=<n>\n" (buffer estatico)
