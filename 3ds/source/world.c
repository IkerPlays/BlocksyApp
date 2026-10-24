#include "world.h"
#include <math.h>
#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <stdlib.h>

static unsigned hexc(const char *h) {            // "#rrggbb" -> ABGR
	unsigned r = 0, g = 0, b = 0; sscanf(h + 1, "%2x%2x%2x", &r, &g, &b);
	return 0xFF000000u | (b << 16) | (g << 8) | r;
}
static void add(World *w, int x, int y, int z, unsigned color) {
	if (w->ncells >= WORLD_MAX_CELLS) return;
	w->cells[w->ncells++] = (Block){x, y, z, -1, color};
}
static void plat(World *w, int x, int y, int z, int pw, int pd, unsigned color) { for (int i = 0; i < pw; i++) for (int k = 0; k < pd; k++) add(w, x + i, y, z + k, color); }

static uint32_t rs;                              // mismo generador que web/src/world.js (rng)
static void rng_seed(uint32_t seed) { rs = seed ? seed : 1; }
static double rnd(void) { rs = rs * 1664525u + 1013904223u; return rs / 4294967296.0; }
static int jsround(double v) { return (int)floor(v + 0.5); }      // Math.round de JavaScript

unsigned world_plaza_color(int x, int z) {
	int n = 18; int ax = abs(x), az = abs(z);
	if (ax == n || az == n) return hexc("#7f858d");
	if ((x == 0 || z == 0) && ax >= 5 && ax <= 12) return hexc("#e6d28c");       // caminos de arena
	if ((x == 0 || z == 0) && az >= 5 && az <= 12) return hexc("#e6d28c");
	return ((x + z) & 1) ? hexc("#d5d9de") : hexc("#c3c8cf");
}
bool world_floor_solid(const World *w, int x, int y, int z) {
	if (w->type == 5) return y >= 0 && y <= 2 && abs(x) <= 50 && abs(z) <= 50 && w->tgrid[(x + 50) * 101 + z + 50];     // troncos del bosque
	return w->type == 1 && y == 0 && abs(x) <= w->plaza_n && abs(z) <= w->plaza_n;
}

static void build_plaza(World *w) {
	w->type = 1; w->floor = true; w->plaza_n = 18; w->void_y = -1000;
	w->spawn[0] = 0.5f; w->spawn[1] = 1.2f; w->spawn[2] = 7.5f;
	unsigned stone2 = hexc("#7f858d"), white = hexc("#eceff1"), gold = hexc("#f5c542"), water = hexc("#3aa0e8");
	for (int a = -4; a <= 4; a++) { add(w, a, 1, -4, stone2); add(w, a, 1, 4, stone2); if (a > -4 && a < 4) { add(w, -4, 1, a, stone2); add(w, 4, 1, a, stone2); } }   // fuente: muro
	for (int x = -3; x <= 3; x++) for (int z = -3; z <= 3; z++) if (hypot(x, z) < 3.0) add(w, x, 1, z, water);
	add(w, 0, 1, 0, white); add(w, 0, 2, 0, white); add(w, 0, 3, 0, water);
	for (int sx = -1; sx <= 1; sx += 2) for (int sz = -1; sz <= 1; sz += 2) {
		for (int y = 1; y <= 5; y++) add(w, sx * 14, y, sz * 14, y == 5 ? gold : white);                                   // columnas
		for (int i = -2; i <= 2; i++) add(w, sx * 9 + i, 1, sz * 8, hexc("#8b5e34"));                                      // bancos
	}
}
static void build_obby(World *w, int seed) {
	w->type = 2; w->floor = false; w->void_y = -12;
	w->spawn[0] = 0.5f; w->spawn[1] = 1.2f; w->spawn[2] = 0.5f;
	unsigned stage[6] = {hexc("#ff7eb6"), hexc("#4d8dff"), hexc("#f5c542"), hexc("#e74c3c"), hexc("#9b59b6"), hexc("#1abc9c")};
	unsigned white = hexc("#eceff1"), blue = hexc("#4d8dff"), gold = hexc("#f5c542"), red = hexc("#e74c3c");
	rng_seed((uint32_t)seed);
	plat(w, -2, 0, -2, 5, 5, hexc("#5cb85c"));
	int x = 0, y = 0, z = 3, st = 0;
	for (int i = 1; i <= 42; i++) {
		int gap = 1 + (int)floor(rnd() * 3);
		int dy = 0; if (i % 5 != 0) { if (rnd() < 0.35) dy = 1; else if (rnd() < 0.2) dy = -1; }
		int side = jsround((rnd() - 0.5) * 4);
		z += gap; y = y + dy > 0 ? y + dy : 0; x += side; if (x < -6) x = -6; if (x > 6) x = 6;
		if (i % 7 == 0) {
			st++; plat(w, x - 1, y, z, 3, 3, white); add(w, x, y + 1, z + 1, blue);
			if (w->ncp < 8) w->cp[w->ncp++] = (Checkpoint){x + 1.0f, y + 1.2f, z + 1.5f, st};
			z += 2;
		} else {
			int pw = rnd() < 0.5 ? 1 : 2, pd = rnd() < 0.5 ? 1 : 2;
			plat(w, x, y, z, pw, pd, stage[st % 6]); z += pd - 1;
		}
	}
	z += 3; plat(w, x - 2, y, z, 5, 5, gold);
	for (int k = 1; k <= 5; k++) add(w, x, y + k, z + 2, white);
	add(w, x + 1, y + 5, z + 2, red); add(w, x + 2, y + 5, z + 2, red); add(w, x + 1, y + 4, z + 2, red);
	w->has_fin = true; w->fin[0] = x + 0.5f; w->fin[1] = y + 1; w->fin[2] = z + 2.5f; w->fin_r = 2.6f;
}

// Bosque oscuro: misma generacion que forest() de web/src/world.js (mismo orden de llamadas al generador)
static void build_forest(World *w, int seed) {
	const int R = 46; w->type = 5; w->floor = true; w->void_y = -1000; w->night = true; w->radius = R; w->safe = 5;
	w->spawn[0] = 0.5f; w->spawn[1] = 1.2f; w->spawn[2] = 0.5f; w->mon_start[0] = -26; w->mon_start[1] = 0.01f; w->mon_start[2] = -26;
	rng_seed((uint32_t)seed);
	for (int tries = 0; w->ntrees < 150 && tries < 3000; tries++) {
		int x = jsround((rnd() * 2 - 1) * (R - 3)); int z = jsround((rnd() * 2 - 1) * (R - 3)); double d = hypot(x, z);
		if (d < 9 || d > R - 3) continue;
		bool near = false; for (int i = 0; i < w->ntrees; i++) if (hypot(w->tree[i][0] - x, w->tree[i][1] - z) < 4) { near = true; break; }
		if (near) continue;
		w->tree[w->ntrees][0] = (short)x; w->tree[w->ntrees][1] = (short)z; w->ntrees++; w->tgrid[(x + 50) * 101 + z + 50] = 1;
	}
	for (int tries = 0; w->norbs < 5 && tries < 6000; tries++) {
		double a = rnd() * 3.14159265358979323846 * 2, d = 16 + rnd() * (R - 26); int x = jsround(cos(a) * d), z = jsround(sin(a) * d);
		bool bad = false;
		for (int i = 0; i < w->ntrees && !bad; i++) if (hypot(w->tree[i][0] - x, w->tree[i][1] - z) < 3) bad = true;
		for (int i = 0; i < w->norbs && !bad; i++) if (hypot(w->orb[i][0] - x, w->orb[i][2] - z) < 16) bad = true;
		if (bad) continue;
		w->orb[w->norbs][0] = x + 0.5f; w->orb[w->norbs][1] = 1.2f; w->orb[w->norbs][2] = z + 0.5f; w->norbs++;
	}
	unsigned wood = hexc("#8b5e34");     // sin tejado: la camara 3D lo atravesaria                                                  // cabaña de refugio (puerta hacia +z)
	for (int i = -3; i <= 3; i++) for (int y = 0; y < 3; y++) { add(w, i, y, -3, wood); if (i > -3 && i < 3) { add(w, -3, y, i, wood); add(w, 3, y, i, wood); } if (abs(i) > 1 || y > 1) add(w, i, y, 3, wood); }
}

static bool spaced(short (*l)[2], int n, int x, int z, double d) { for (int i = 0; i < n; i++) if (hypot(l[i][0] - x, l[i][1] - z) < d) return true; return false; }
static void build_desert(World *w, int seed) {
	w->type = 6; w->gcol[0] = hexc("#e0c987"); w->gcol[1] = hexc("#d9c07c"); w->spawn[1] = 1.2f; rng_seed((uint32_t)seed);
	short cac[24][2]; int n = 0;
	for (int l = 0; l < 5; l++) for (int x = 14 - (4 - l); x <= 14 + (4 - l); x++) for (int z = -14 - (4 - l); z <= -14 + (4 - l); z++) add(w, x, l, z, ((x + z + l) & 1) ? hexc("#d4b86a") : hexc("#c9a84f"));
	for (int tries = 0; n < 22 && tries < 2000; tries++) {
		int x = jsround((rnd() * 2 - 1) * 40), z = jsround((rnd() * 2 - 1) * 40);
		if (hypot(x, z) < 8 || (abs(x - 14) < 7 && abs(z + 14) < 7) || spaced(cac, n, x, z, 4)) continue;
		int h = 2 + (int)floor(rnd() * 3); cac[n][0] = (short)x; cac[n][1] = (short)z; n++;
		for (int y = 0; y < h; y++) add(w, x, y, z, hexc("#2f8f3a"));
		if (h >= 3) { add(w, x + 1, 1, z, hexc("#3aa347")); add(w, x + 1, 2, z, hexc("#3aa347")); }
	}
}
static void build_caves(World *w, int seed) {
	w->type = 7; w->gcol[0] = hexc("#2b2e35"); w->gcol[1] = hexc("#25282e"); w->spawn[1] = 1.2f; rng_seed((uint32_t)seed);
	short pil[20][2]; int n = 0; const char *cr[3] = {"#7be0ff", "#c77dff", "#ff7eb6"};
	for (int tries = 0; n < 18 && tries < 2000; tries++) {
		int x = jsround((rnd() * 2 - 1) * 30), z = jsround((rnd() * 2 - 1) * 30);
		if (hypot(x, z) < 7 || spaced(pil, n, x, z, 5)) continue;
		int h = 3 + (int)floor(rnd() * 4); pil[n][0] = (short)x; pil[n][1] = (short)z; n++;
		for (int y = 0; y < h; y++) add(w, x, y, z, (y & 1) ? hexc("#4a4f57") : hexc("#5d636b"));
		unsigned b = hexc("#5d636b"); add(w, x + 1, 0, z, b); add(w, x - 1, 0, z, b); add(w, x, 0, z + 1, b); add(w, x, 0, z - 1, b);
	}
	int made = 0;
	for (int tries = 0; made < 12 && tries < 2000; tries++) {
		int x = jsround((rnd() * 2 - 1) * 30), z = jsround((rnd() * 2 - 1) * 30);
		if (hypot(x, z) < 5 || spaced(pil, n, x, z, 3)) continue;
		unsigned c = hexc(cr[(int)floor(rnd() * 3)]); add(w, x, 0, z, c); add(w, x, 1, z, c); made++;
	}
}
static void build_city(World *w, int seed) {
	w->type = 8; w->gcol[0] = hexc("#43464d"); w->gcol[1] = hexc("#3d4047"); w->spawn[1] = 1.2f; rng_seed((uint32_t)seed);
	const char *pal[4] = {"#cfd4da", "#a9b4c2", "#e8d9c0", "#c9a0a0"};
	for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) {
		if (((i + j) & 1) || (i == 0 && j == 0)) continue;
		int h = 2 + (int)floor(rnd() * 5); unsigned c = hexc(pal[(int)floor(rnd() * 4)]), bx = 0; (void)bx;
		for (int y = 0; y < h; y++) for (int dx = -1; dx <= 1; dx++) for (int dz = -1; dz <= 1; dz++) add(w, i * 9 + dx, y, j * 9 + dz, ((y & 1) && (dx == 0 || dz == 0)) ? hexc("#8fc8ff") : c);
	}
}

void world_build(World *w, const char *name, int seed) {
	memset(w, 0, sizeof *w);
	w->floor = true; w->void_y = -1000; w->spawn[0] = 0.5f; w->spawn[1] = 3; w->spawn[2] = 0.5f;
	if (!name || !name[0] || !seed) seed = 1337;
	if (name && !strcmp(name, "plaza")) build_plaza(w);
	else if (name && !strcmp(name, "obby")) build_obby(w, seed);
	else if (name && !strcmp(name, "forest")) build_forest(w, seed);
	else if (name && !strcmp(name, "desert")) build_desert(w, seed);
	else if (name && !strcmp(name, "caves")) build_caves(w, seed);
	else if (name && !strcmp(name, "city")) build_city(w, seed);
	else if (name && !strcmp(name, "checker")) { w->type = 3; for (int x = -20; x <= 20; x++) for (int z = -20; z <= 20; z++) if (WORLD_MAX_CELLS > w->ncells + 0 && abs(x) < 12 && abs(z) < 12) add(w, x, 0, z, ((x + z) & 1) ? hexc("#ffffff") : hexc("#2b2f36")); w->spawn[1] = 1.2f; }
	else if (name && !strcmp(name, "void")) { w->type = 4; w->floor = false; w->void_y = -30; plat(w, -2, 0, -2, 5, 5, hexc("#9aa0a8")); w->spawn[1] = 1.2f; }
}
