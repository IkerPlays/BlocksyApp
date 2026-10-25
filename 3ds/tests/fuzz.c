// Fuzz de los lectores (releases, piezas, textos, config): entradas JSON mutadas al azar no deben romper nada.
// Con sanitizers:  gcc -std=gnu11 -fsanitize=address,undefined -g -Isource tests/fuzz.c source/update_core.c source/parts.c -o /tmp/fuzz -lm && ASAN_OPTIONS=detect_leaks=0 /tmp/fuzz   (desde 3ds/)
#include "update.h"
#include "parts.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static char *slurp(const char *p, long *n) { FILE *f = fopen(p, "rb"); fseek(f, 0, SEEK_END); *n = ftell(f); fseek(f, 0, SEEK_SET); char *b = malloc(*n + 1); fread(b, 1, *n, f); b[*n] = 0; fclose(f); return b; }
int main(void) {
	long n1, n2; char *a = slurp("tests/releases_sample.json", &n1);
	const char *parts = "[{\"parts\":[{\"name\":\"a\",\"type\":\"part\",\"x\":1.5,\"y\":2,\"z\":3,\"sx\":4,\"sy\":1,\"sz\":2,\"color\":\"#ff9f43\",\"shape\":\"Ball\",\"material\":\"Neon\",\"collide\":true,\"transparency\":0.3,\"ry\":45},{\"type\":\"spawn\",\"x\":0}],\"ui\":[{\"id\":\"t\",\"text\":\"Hola {name} {time}\",\"x\":5,\"y\":6,\"size\":20,\"color\":\"#fff\"}]}]";
	n2 = (long)strlen(parts); char *b = strdup(parts);
	static ParsedRel rels[8]; static Part ps[MAX_PARTS]; static UiText ut[MAX_UITEXTS]; static UpdateInfo ui; GameInfo g; char out[64];
	srand(12345);
	for (int it = 0; it < 20000; it++) {
		char *buf = it & 1 ? strdup(a) : strdup(b); long n = it & 1 ? n1 : n2;
		int muts = 1 + rand() % 12; for (int m = 0; m < muts; m++) { int pos = rand() % n, k = rand() % 4; if (k == 0) buf[pos] = (char)(rand() & 0xFF); else if (k == 1) buf[pos] = "{}[]\",:\\ "[rand() % 10]; else if (k == 2) { buf[pos] = 0; } else { int ln = rand() % 40; if (pos + ln < n) memmove(buf + pos, buf + pos + ln, n - pos - ln + 1), n -= ln; } }
		buf[n] = 0;
		if (it & 1) { int k = core_parse_api(buf, rels, 8); core_select(rels, k, "1.4.0", &ui); k = core_parse_atom(buf, "IkerPlays/BlocksyApp", rels, 8); core_select(rels, k, "1.4.1-dev.3", &ui); }
		else { parts_parse(buf, ps, MAX_PARTS); ui_parse(buf, ut, MAX_UITEXTS); memset(&g, 0, sizeof g); gameinfo_parse_config(&g, buf, buf + strlen(buf)); if (ut[0].text[0]) ui_format(ut[0].text, out, sizeof out, 3, "x", "y", 99); }
		free(buf);
	}
	puts("fuzz: sin fallos"); return 0;
}
