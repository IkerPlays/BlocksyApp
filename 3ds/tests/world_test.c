// Prueba de los mundos con calculo propio (colinas): alturas y arboles iguales a web/src/world.js.  Desde 3ds/:
//   gcc -std=gnu11 -Wall -Isource tests/world_test.c source/world.c -o /tmp/wt -lm && /tmp/wt
// Los valores esperados salen de ejecutar buildWorld('hills', seed) de la web (la suma mezcla la altura de las 81 x 81 columnas).
#include "world.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
static World w;
static unsigned long long sum_of(int seed) {
	world_build(&w, "hills", seed); unsigned long long s = 0;
	for (int x = -40; x <= 40; x++) for (int z = -40; z <= 40; z++) s = s * 31 + (unsigned long long)world_hill_h(&w, x, z);
	return s;
}
int main(void) {
	assert(sum_of(1337) == 11198337482171269815ULL && w.ntrees == 24 && w.tree[0][0] == 17 && w.tree[0][1] == 3 && w.tree[3][0] == 10 && w.tree[3][1] == 2);
	assert(sum_of(1) == 3912131801793941069ULL && w.ntrees == 21 && w.tree[0][0] == -18 && w.tree[1][1] == 14);
	assert(sum_of(424242) == 9382867312715779533ULL && w.ntrees == 21 && w.tree[2][0] == -9 && w.tree[2][1] == 32);
	world_build(&w, "hills", 1337);
	assert(world_hill_h(&w, 0, 0) == 0 && world_hill_h(&w, 50, 0) == 0);                // plano en el punto de aparicion y fuera del mapa
	assert(world_floor_solid(&w, 20, 0, 20) == (world_hill_h(&w, 20, 20) > 0) && !world_floor_solid(&w, 20, 40, 20));
	// islas: terreno y troncos (las copas no son celdas en la 3DS) iguales a islands() de la web
	static const unsigned long long ISL[3] = {1696328948324138206ULL, 13292020927844984756ULL, 4943517512990620254ULL}; static const int SEEDS[3] = {1337, 1, 424242}, NT[3] = {7, 8, 6};
	for (int k = 0; k < 3; k++) {
		world_build(&w, "islands", SEEDS[k]); unsigned long long s = 0;
		for (int x = -45; x <= 45; x++) for (int y = -12; y <= 12; y++) for (int z = -45; z <= 45; z++) {
			bool solid = world_floor_solid(&w, x, y, z);
			for (int i = 0; !solid && i < w.ncells; i++) if (w.cells[i].x == x && w.cells[i].y == y && w.cells[i].z == z) solid = true;
			s = s * 31 + (solid ? 1 : 0);
		}
		assert(s == ISL[k] && w.ntrees == NT[k] && !w.floor);
	}
	// mundos de bloques fijos: posicion y color de cada celda iguales a la web (hash que no depende del orden)
	static const struct { const char *n; int seed, cells; unsigned long long h; } CW[] = {
		{"obby", 1337, 198, 4804154267183903599ULL}, {"obby", 99, 205, 13136574405191394120ULL},
		{"void", 1337, 25, 5251627199191438446ULL}, {"void", 99, 25, 5251627199191438446ULL},
		{"desert", 1337, 245, 10236044349245789569ULL}, {"desert", 99, 260, 7854319578361043195ULL},
		{"caves", 1337, 178, 8447387735938173756ULL}, {"caves", 99, 182, 9767940319837599462ULL},
		{"city", 1337, 450, 4593300192577047480ULL}, {"city", 99, 495, 4868970053000107611ULL},
	};
	for (unsigned k = 0; k < sizeof CW / sizeof CW[0]; k++) {
		world_build(&w, CW[k].n, CW[k].seed); unsigned long long s = 0;
		for (int i = 0; i < w.ncells; i++) {
			unsigned long long x = (unsigned)w.cells[i].x, y = (unsigned)w.cells[i].y, z = (unsigned)w.cells[i].z;
			s += (x * 73856093ULL) ^ (y * 19349663ULL) ^ (z * 83492791ULL) ^ ((unsigned long long)w.cells[i].color * 2654435761ULL);
		}
		if (w.ncells != CW[k].cells || s != CW[k].h) { printf("FALLA %s semilla %d: %d celdas (esperadas %d), hash %llu\n", CW[k].n, CW[k].seed, w.ncells, CW[k].cells, s); return 1; }
	}
	// plaza: celdas elevadas (fuente, columnas, arboles, bancos) y color de cada casilla del suelo, iguales a la web
	{
		world_build(&w, "plaza", 1337); unsigned long long up = 0, fl = 0;
		for (int i = 0; i < w.ncells; i++) { unsigned long long x = (unsigned)w.cells[i].x, y = (unsigned)w.cells[i].y, z = (unsigned)w.cells[i].z; up += (x * 73856093ULL) ^ (y * 19349663ULL) ^ (z * 83492791ULL) ^ ((unsigned long long)w.cells[i].color * 2654435761ULL); }
		for (int x = -18; x <= 18; x++) for (int z = -18; z <= 18; z++) fl += ((unsigned long long)(unsigned)x * 73856093ULL) ^ ((unsigned long long)(unsigned)z * 83492791ULL) ^ ((unsigned long long)world_plaza_color(x, z) * 2654435761ULL);
		if (w.ncells != 279 || up != 10450496665658069216ULL || fl != 4175807053795176298ULL) { printf("FALLA plaza: %d celdas, up %llu, suelo %llu\n", w.ncells, up, fl); return 1; }
	}
	// tablero: 41 x 41 baldosas calculadas (sin celdas)
	world_build(&w, "checker", 1337);
	assert(w.ncells == 0 && world_floor_solid(&w, 20, 0, -20) && !world_floor_solid(&w, 21, 0, 0) && !world_floor_solid(&w, 0, 1, 0));
	assert(world_tile_color(&w, 0, 0) == 0xFF362F2B && world_tile_color(&w, 1, 0) == 0xFFFFFFFF);          // #2b2f36 y #ffffff en ABGR
	// bosque: posicion de los 150 arboles y de los fragmentos de luz iguales a la web
	{
		static const struct { int seed; unsigned long long h; const char *orbs; } FO[2] = {
			{1337, 540447535067380034ULL, "(-17.5,-16.5)(15.5,16.5)(15.5,-13.5)(-25.5,10.5)(8.5,-33.5)"},
			{7, 6337077868349771635ULL, "(-6.5,24.5)(-23.5,-0.5)(33.5,14.5)(20.5,5.5)(-22.5,-22.5)"} };
		for (int k = 0; k < 2; k++) {
			world_build(&w, "forest", FO[k].seed); unsigned long long s = 0; char ob[160] = ""; size_t n = 0;
			for (int i = 0; i < w.ntrees; i++) s = s * 31 + (unsigned long long)(((unsigned)w.tree[i][0] & 0xFFFF) * 65536u + ((unsigned)w.tree[i][1] & 0xFFFF));
			for (int i = 0; i < w.norbs; i++) n += (size_t)snprintf(ob + n, sizeof ob - n, "(%g,%g)", w.orb[i][0], w.orb[i][2]);
			if (w.ntrees != 150 || s != FO[k].h || strcmp(ob, FO[k].orbs)) { printf("FALLA bosque semilla %d: %d arboles, hash %llu, fragmentos %s\n", FO[k].seed, w.ntrees, s, ob); return 1; }
		}
	}
	puts("world: todo bien"); return 0;
}
