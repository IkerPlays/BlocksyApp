// JSON diminuto para respuestas de PostgREST / GoTrue / GitHub (tolera espacios: jsonb escribe "key": "valor").
#pragma once
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Puntero al valor de "key" (tras los dos puntos y espacios) dentro de [obj, end), buscando desde `from`; NULL si no está
static inline const char *json_find_from(const char *from, const char *end, const char *key) {
	char pat[48]; snprintf(pat, sizeof pat, "\"%s\"", key);
	for (const char *p = from; (p = strstr(p, pat)) && p < end; p++) {
		const char *q = p + strlen(pat);
		while (*q == ' ' || *q == '\t' || *q == '\n' || *q == '\r') q++;
		if (*q != ':') continue;
		q++; while (*q == ' ' || *q == '\t' || *q == '\n' || *q == '\r') q++;
		return q;
	}
	return NULL;
}
static inline const char *find_val(const char *obj, const char *end, const char *key) { return json_find_from(obj, end, key); }

static inline bool jstr(const char *obj, const char *end, const char *key, char *dst, size_t n) {
	const char *p = find_val(obj, end, key); if (!p || *p != '"') return false;
	p++; size_t i = 0;
	while (*p && *p != '"' && p < end && i + 1 < n) { if (*p == '\\' && p[1]) p++; dst[i++] = *p++; }
	dst[i] = 0; return true;
}
static inline float jnum(const char *obj, const char *end, const char *key) {
	const char *p = find_val(obj, end, key); return p ? strtof(p, NULL) : 0;
}
static inline int jbool(const char *obj, const char *end, const char *key) {
	const char *p = find_val(obj, end, key); return p && *p == 't';
}
// Avanza al siguiente objeto {...} de un array; ignora las llaves que estén dentro de textos entre comillas
static inline const char *next_obj(const char *p, const char **end) {
	p = strchr(p, '{'); if (!p) return NULL;
	int depth = 0; bool in_str = false;
	for (const char *q = p; *q; q++) {
		if (in_str) { if (*q == '\\' && q[1]) q++; else if (*q == '"') in_str = false; continue; }
		if (*q == '"') in_str = true;
		else if (*q == '{') depth++;
		else if (*q == '}' && --depth == 0) { *end = q; return p; }
	}
	return NULL;
}
