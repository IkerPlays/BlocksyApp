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
bool world_floor_solid(const World *w, int x, int y, int z) { return w->type == 1 && y == 0 && abs(x) <= w->plaza_n && abs(z) <= w->plaza_n; }

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

void world_build(World *w, const char *name, int seed) {
	memset(w, 0, sizeof *w);
	w->floor = true; w->void_y = -1000; w->spawn[0] = 0.5f; w->spawn[1] = 3; w->spawn[2] = 0.5f;
	if (!name || !name[0] || !seed) seed = 1337;
	if (name && !strcmp(name, "plaza")) build_plaza(w);
	else if (name && !strcmp(name, "obby")) build_obby(w, seed);
	else if (name && !strcmp(name, "checker")) { w->type = 3; for (int x = -20; x <= 20; x++) for (int z = -20; z <= 20; z++) if (WORLD_MAX_CELLS > w->ncells + 0 && abs(x) < 12 && abs(z) < 12) add(w, x, 0, z, ((x + z) & 1) ? hexc("#ffffff") : hexc("#2b2f36")); w->spawn[1] = 1.2f; }
	else if (name && !strcmp(name, "void")) { w->type = 4; w->floor = false; w->void_y = -30; plat(w, -2, 0, -2, 5, 5, hexc("#9aa0a8")); w->spawn[1] = 1.2f; }
}
