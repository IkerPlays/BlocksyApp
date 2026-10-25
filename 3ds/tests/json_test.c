// Prueba del lector JSON diminuto (json.h):  gcc -std=gnu11 -Wall -Isource tests/json_test.c -o /tmp/jt && /tmp/jt
#include "json.h"
#include <assert.h>
#include <stdio.h>

int main(void) {
	const char *js = "[{\"id\": \"a1\", \"name\": \"Ana \\\"la\\\" Pro\", \"txt\": \"l1\\nl2\\t\\u00e1\\u20ac\", \"n\": 12.5, \"ok\": true, \"obj\": {\"x\": 1, \"s\": \"}{\"}, \"k\": \"spawn\"},"
		"{\"id\": \"b2\", \"name\": \"Luis\", \"spawn\": [1, 2, 3]}]";
	const char *end; const char *p = next_obj(js, &end); assert(p && end);
	char b[64];
	assert(jstr(p, end, "id", b, sizeof b) && !strcmp(b, "a1"));
	assert(jstr(p, end, "name", b, sizeof b) && !strcmp(b, "Ana \"la\" Pro"));
	assert(jstr(p, end, "txt", b, sizeof b) && !strcmp(b, "l1\nl2\t\xC3\xA1\xE2\x82\xAC"));          // \n, \t y \uXXXX (a con tilde y euro) en UTF-8
	assert(jnum(p, end, "n") == 12.5f && jbool(p, end, "ok") && !jbool(p, end, "nada"));
	assert(!json_find_from(p, end, "spawn"));                                              // "spawn" solo aparece como VALOR de k: no es una clave
	assert(jstr(p, end, "k", b, sizeof b) && !strcmp(b, "spawn"));
	p = next_obj(end + 1, &end); assert(p);                                                   // la llave dentro de un texto no rompe el recorte del objeto
	assert(jstr(p, end, "name", b, sizeof b) && !strcmp(b, "Luis") && json_find_from(p, end, "spawn"));
	assert(!next_obj(end + 1, &end));
	char small[5]; assert(jstr(js, js + strlen(js), "id", small, sizeof small) && !strcmp(small, "a1"));   // respeta el tamano del destino
	char tiny[3]; jstr(js, js + strlen(js), "name", tiny, sizeof tiny); assert(strlen(tiny) == 2);
	puts("json: todo bien"); return 0;
}
