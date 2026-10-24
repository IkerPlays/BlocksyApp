// Lectura de las piezas del Studio (config.parts) desde la respuesta de PostgREST: {"parts":[{...},...]}. Es codigo puro: se prueba en el ordenador (3ds/tests).
#include "net.h"
#include "parts.h"
#include "json.h"
#include <math.h>
#include <string.h>

static unsigned part_color(const char *s) {
	unsigned v = 0; if (*s == '#') s++;
	for (int i = 0; i < 6 && s[i]; i++) { char ch = s[i]; v = v * 16 + (ch >= 'a' ? ch - 'a' + 10 : ch >= 'A' ? ch - 'A' + 10 : ch - '0'); }
	return 0xFF000000u | ((v & 0xFF) << 16) | (v & 0xFF00) | ((v >> 16) & 0xFF);
}
int parts_parse(const char *json, Part *out, int max) {
	int n = 0; const char *p = strstr(json, "\"parts\""), *end;
	if (p && (p = strchr(p, '['))) {
		p++;
		while (n < max && (p = next_obj(p, &end))) {
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
