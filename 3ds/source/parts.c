// Lectura de las piezas del Studio (config.parts) desde la respuesta de PostgREST: {"parts":[{...},...]}. Es codigo puro: se prueba en el ordenador (3ds/tests).
#include "net.h"
#include "parts.h"
#include "json.h"
#include <math.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

static unsigned part_color(const char *s) {
	unsigned v = 0; if (*s == '#') s++;
	for (int i = 0; i < 6 && s[i]; i++) { char ch = s[i]; v = v * 16 + (ch >= 'a' ? ch - 'a' + 10 : ch >= 'A' ? ch - 'A' + 10 : ch - '0'); }
	return 0xFF000000u | ((v & 0xFF) << 16) | (v & 0xFF00) | ((v >> 16) & 0xFF);
}
// Final del array que empieza en '[' (respeta textos entre comillas); NULL si no cierra
static const char *array_end(const char *p) {
	int depth = 0; bool in_str = false;
	for (; *p; p++) {
		if (in_str) { if (*p == '\\' && p[1]) p++; else if (*p == '"') in_str = false; continue; }
		if (*p == '"') in_str = true; else if (*p == '[') depth++; else if (*p == ']' && --depth == 0) return p;
	}
	return NULL;
}
int parts_parse(const char *json, Part *out, int max) {
	int n = 0; const char *p = strstr(json, "\"parts\""), *end;
	if (p && (p = strchr(p, '['))) {
		const char *aend = array_end(p); if (!aend) return 0;
		p++;
		while (n < max && (p = next_obj(p, &end)) && p < aend) {
			const char *st = p; p = end + 1;
			char ty[12] = "part", sh[12] = "Block", col[12] = "", mat[16] = "";
			jstr(st, end, "type", ty, sizeof ty); jstr(st, end, "shape", sh, sizeof sh); jstr(st, end, "color", col, sizeof col); jstr(st, end, "material", mat, sizeof mat);
			float tr = jnum(st, end, "transparency"); const char *cl = json_find_from(st, end, "collide");
			Part *o = &out[n]; memset(o, 0, sizeof *o);
			o->x = jnum(st, end, "x"); o->y = jnum(st, end, "y"); o->z = jnum(st, end, "z");
			o->sx = jnum(st, end, "sx"); o->sy = jnum(st, end, "sy"); o->sz = jnum(st, end, "sz"); o->ry = jnum(st, end, "ry") * 0.0174533f;
			if (o->sx < 0.05f) o->sx = 0.05f;
			if (o->sy < 0.05f) o->sy = 0.05f;
			if (o->sz < 0.05f) o->sz = 0.05f;
			o->cs = cosf(o->ry); o->sn = sinf(o->ry); o->rad = 0.5f * hypotf(o->sx, o->sz) + 0.4f;                  // para las colisiones
			o->color = part_color(col[0] ? col : "a3a3a6");
			o->shape = !strcmp(sh, "Ball") ? 1 : !strcmp(sh, "Cylinder") ? 2 : 0;
			o->spawn = !strcmp(ty, "spawn");
			o->collide = !o->spawn && !(cl && *cl == 'f') && tr < 0.7f;                 // lo casi invisible (agua, cristal) no bloquea
			o->alpha = (unsigned char)((1 - (tr > 0.85f ? 0.85f : tr)) * 255); o->glow = !strcmp(mat, "Neon") && o->alpha > 120;
			if (tr >= 0.85f) continue;                                                  // invisible: ni se dibuja
			n++;
		}
	}
	return n;
}

// Textos de interfaz del Studio: {"ui":[{"id":"t1","text":"Hola {name}","x":50,"y":10,"size":28,"color":"#ffffff"}, ...]}
int ui_parse(const char *json, UiText *out, int max) {
	int n = 0; const char *p = strstr(json, "\"ui\""), *end;
	if (!p || !(p = strchr(p, '['))) return 0;
	const char *aend = array_end(p); if (!aend) return 0;
	p++;
	while (n < max && (p = next_obj(p, &end)) && p < aend) {
		const char *st = p; p = end + 1; UiText *o = &out[n]; memset(o, 0, sizeof *o); char col[12] = "";
		if (!jstr(st, end, "text", o->text, sizeof o->text) || !o->text[0]) continue;
		for (char *q = o->text; *q; q++) if (*q == '\n') *q = ' ';
		o->x = jnum(st, end, "x"); o->y = jnum(st, end, "y"); o->size = (int)jnum(st, end, "size"); if (o->size < 8) o->size = 28;
		jstr(st, end, "color", col, sizeof col); o->color = part_color(col[0] ? col : "ffffff");
		n++;
	}
	return n;
}

void ui_format(const char *text, char *out, size_t n, int players, const char *name, const char *game, unsigned secs) {
	size_t k = 0; if (!n) return;
	for (const char *q = text; *q && k + 1 < n;) {
		char rep[64] = ""; size_t l = 0;
		if (!strncmp(q, "{players}", 9)) { l = 9; snprintf(rep, sizeof rep, "%d", players); }
		else if (!strncmp(q, "{name}", 6)) { l = 6; snprintf(rep, sizeof rep, "%s", name); }
		else if (!strncmp(q, "{game}", 6)) { l = 6; snprintf(rep, sizeof rep, "%s", game); }
		else if (!strncmp(q, "{time}", 6)) { l = 6; snprintf(rep, sizeof rep, "%u:%02u", secs / 60, secs % 60); }
		if (l) { for (const char *r = rep; *r && k + 1 < n; r++) out[k++] = *r; q += l; }
		else out[k++] = *q++;
	}
	out[k] = 0;
}
