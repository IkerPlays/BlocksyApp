#pragma once
#include <stdbool.h>
#include "net.h"

// Mundos base de los juegos (mismos que la web: web/src/world.js). Son bloques fijos que no se rompen.
#define WORLD_MAX_CELLS 640
typedef struct { float x, y, z; int id; } Checkpoint;
typedef struct {
	int type;                           // 0 llanura, 1 plaza, 2 carrera (obby), 3 tablero, 4 vacío
	bool floor;                         // hay suelo infinito (y = 0)
	float spawn[3];
	float void_y;                       // caer por debajo = volver al último punto de control (solo sin suelo)
	Block cells[WORLD_MAX_CELLS]; int ncells;     // bloques fijos (kind = -1, color propio)
	Checkpoint cp[8]; int ncp;
	bool has_fin; float fin[3], fin_r;
	int plaza_n;                        // plaza: mitad del lado del suelo de piedra (alrededor del origen)
} World;

void world_build(World *w, const char *name, int seed);            // name: flat | plaza | obby | checker | void (otros = llanura)
bool world_floor_solid(const World *w, int x, int y, int z);       // suelo especial de la plaza (y = 0 dentro de su recinto)
unsigned world_plaza_color(int x, int z);                          // color del suelo de la plaza en esa casilla
