#pragma once
#include <stdbool.h>
#include "net.h"

// Mundos base de los juegos (mismos que la web: web/src/world.js). Son bloques fijos que no se rompen.
#define WORLD_MAX_CELLS 640
typedef struct { float x, y, z; int id; } Checkpoint;
typedef struct {
	int type;                           // 0 llanura, 1 plaza, 2 carrera (obby), 3 tablero, 4 vacío, 5 bosque oscuro, 6 desierto, 7 cuevas, 8 ciudad, 9 colinas, 10 islas
	int seed;                           // semilla del mundo (colinas: altura de cada columna)
	bool floor;                         // hay suelo infinito (y = 0)
	float spawn[3];
	float void_y;                       // caer por debajo = volver al último punto de control (solo sin suelo)
	Block cells[WORLD_MAX_CELLS]; int ncells;     // bloques fijos (kind = -1, color propio)
	Checkpoint cp[8]; int ncp;
	bool has_fin; float fin[3], fin_r;
	int plaza_n;
	unsigned gcol[2];                   // colores del suelo (ABGR) en los mundos nuevos; 0 = verde de siempre
	// Bosque Oscuro (type 5): de noche, arboles que se dibujan aparte (tronco solido, copa no), fragmentos de luz y el monstruo
	bool night; float radius, safe, mon_start[3];
	int ntrees; short tree[160][2]; short tree_y[160];            // arboles de colinas e islas: posicion del tronco (la copa se dibuja aparte)
	int nisl; int isl[10][4]; double isl_thick[10];            // islas (type 10): cx, cy, cz, radio y grosor de cada disco
	int norbs; float orb[6][3];
	unsigned char tgrid[101 * 101];     // 1 = hay un tronco en (x+50, z+50)                        // plaza: mitad del lado del suelo de piedra (alrededor del origen)
} World;

void world_build(World *w, const char *name, int seed);            // name: flat | plaza | obby | checker | void (otros = llanura)
bool world_floor_solid(const World *w, int x, int y, int z);       // suelo especial de la plaza (y = 0 dentro de su recinto)
int world_hill_h(const World *w, int x, int z);                    // colinas: altura de la columna (0 = sin colina); igual que hills() de web/src/world.js
bool world_hill_top_sand(int x, int z);
int world_island_depth(const World *w, int d, int x, int z);        // islas: grosor del disco d en esa columna (0 = fuera del disco)                            // la cima es arena (orilla)
unsigned world_plaza_color(int x, int z);                          // color del suelo de la plaza en esa casilla
