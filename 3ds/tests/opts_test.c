// Test de las opciones de juego (source/opts.c).
// gcc -std=gnu11 -Wall -Isource tests/opts_test.c source/opts.c -o /tmp/ot && /tmp/ot
#include <stdio.h>
#include <string.h>
#include "opts.h"
static int fails;
#define CHECK(c) do { if (!(c)) { printf("FALLO linea %d: %s\n", __LINE__, #c); fails++; } } while (0)
int main(void) {
	int v[NOPT]; opts_defaults(v);
	for (int i = 0; i < NOPT; i++) { CHECK(OPTS[i].key && OPTS[i].key[0]); CHECK(OPTS[i].es && OPTS[i].en && OPTS[i].pt); CHECK(OPTS[i].n == 2 || OPTS[i].n == 3); CHECK(OPTS[i].def >= 0 && OPTS[i].def < OPTS[i].n); CHECK(v[i] == OPTS[i].def); }
	for (int i = 0; i < NOPT; i++) for (int j = i + 1; j < NOPT; j++) CHECK(strcmp(OPTS[i].key, OPTS[j].key));          // claves unicas
	for (int i = 0; i < NOPT; i++) if (OPTS[i].n == 3) for (int k = 0; k < 3; k++) CHECK(OPTS[i].ves[k] && OPTS[i].ven[k]);
	CHECK(opts_parse_line(v, "opt.nametags=0") == 1 && v[OPT_NAMETAGS] == 0);
	CHECK(opts_parse_line(v, "opt.camspd=2") == 1 && v[OPT_CAMSPD] == 2);
	CHECK(opts_parse_line(v, "opt.camspd=7") == 1 && v[OPT_CAMSPD] == OPTS[OPT_CAMSPD].def);      // fuera de rango: defecto
	CHECK(opts_parse_line(v, "opt.bubbles=-1") == 1 && v[OPT_BUBBLES] == OPTS[OPT_BUBBLES].def);
	CHECK(opts_parse_line(v, "opt.unknown=1") == 1);                                                // clave desconocida: se ignora sin tocar nada
	CHECK(opts_parse_line(v, "fps=1") == 0 && opts_parse_line(v, "") == 0 && opts_parse_line(v, "opt.") == 1);
	CHECK(opts_parse_line(v, "opt.nametag=1") == 1 && v[OPT_NAMETAGS] == 0);                        // prefijo de otra clave no vale
	// ida y vuelta
	int w[NOPT]; for (int i = 0; i < NOPT; i++) w[i] = (i * 5 + 1) % OPTS[i].n;
	int r[NOPT]; opts_defaults(r); for (int i = 0; i < NOPT; i++) { char b[48]; snprintf(b, sizeof b, "%s", opts_format(i, w[i])); CHECK(b[strlen(b) - 1] == '\n'); b[strlen(b) - 1] = 0; CHECK(opts_parse_line(r, b) == 1); }
	CHECK(!memcmp(w, r, sizeof w));
	if (fails) { printf("%d fallos\n", fails); return 1; }
	puts("opts: todo bien"); return 0;
}
