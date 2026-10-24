// Prueba de los mundos con calculo propio (colinas): alturas y arboles iguales a web/src/world.js.  Desde 3ds/:
//   gcc -std=gnu11 -Wall -Isource tests/world_test.c source/world.c -o /tmp/wt -lm && /tmp/wt
// Los valores esperados salen de ejecutar buildWorld('hills', seed) de la web (la suma mezcla la altura de las 81 x 81 columnas).
#include "world.h"
#include <assert.h>
#include <stdio.h>
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
	puts("world: todo bien"); return 0;
}
