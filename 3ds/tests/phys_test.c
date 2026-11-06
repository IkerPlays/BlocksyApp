// Test de las reglas de salto (source/phys.c).  gcc -std=gnu11 -Wall -Isource tests/phys_test.c source/phys.c -o /tmp/pht && /tmp/pht
#include <stdio.h>
#include "phys.h"
static int fails;
#define CHECK(c) do { if (!(c)) { printf("FALLO linea %d: %s\n", __LINE__, #c); fails++; } } while (0)
// bloque solido entre lo (incluido) y hi: el cuerpo "choca" si el rango [y, y+1.8] toca el bloque
typedef struct { float lo, hi; } Slab;
static int slab_hits(void *ctx, float y) { const Slab *s = ctx; return y < s->hi && y + 1.8f > s->lo; }
int main(void) {
	const float dt = 1.0f / 60;
	JumpState s = {0, 0};
	CHECK(jump_step(&s, dt, 1, 1, 0, 0, 0) == 1);                                   // salto normal desde el suelo
	CHECK(jump_step(&s, dt, 1, 0, 5, 0, 0) == 0);                                   // en el aire sin ayuda: nada
	// salir de un borde: 3 fotogramas en el aire y pulsa A -> salta con ayuda, no sin ella
	JumpState a = {0, 0}, b = {0, 0};
	jump_step(&a, dt, 0, 1, 0, 1, 0); jump_step(&b, dt, 0, 1, 0, 0, 0);
	for (int i = 0; i < 3; i++) { jump_step(&a, dt, 0, 0, -1, 1, 0); jump_step(&b, dt, 0, 0, -1, 0, 0); }
	CHECK(jump_step(&a, dt, 1, 0, -2, 1, 0) == 1); CHECK(jump_step(&b, dt, 1, 0, -2, 0, 0) == 0);
	// demasiado tarde (0,2 s en el aire): no salta
	JumpState c = {0, 0}; jump_step(&c, dt, 0, 1, 0, 1, 0); for (int i = 0; i < 12; i++) jump_step(&c, dt, 0, 0, -3, 1, 0);
	CHECK(jump_step(&c, dt, 1, 0, -4, 1, 0) == 0);
	// subiendo (vy > 0) tras un salto no se repite
	JumpState d = {0, 0}; CHECK(jump_step(&d, dt, 1, 1, 0, 1, 0) == 1); CHECK(jump_step(&d, dt, 1, 0, 8, 1, 0) == 0); CHECK(jump_step(&d, dt, 0, 0, 7, 1, 0) == 0);
	// salto guardado: pulsa 4 fotogramas antes de aterrizar -> salta al tocar el suelo
	JumpState e = {0, 0}; for (int i = 0; i < 6; i++) jump_step(&e, dt, 0, 0, -6, 1, 0);
	CHECK(jump_step(&e, dt, 1, 0, -6, 1, 0) == 0); for (int i = 0; i < 3; i++) CHECK(jump_step(&e, dt, 0, 0, -6, 1, 0) == 0);
	CHECK(jump_step(&e, dt, 0, 1, 0, 1, 0) == 1);
	// el salto guardado caduca (0,12 s)
	JumpState f = {0, 0}; for (int i = 0; i < 6; i++) jump_step(&f, dt, 0, 0, -6, 1, 0);
	jump_step(&f, dt, 1, 0, -6, 1, 0); for (int i = 0; i < 10; i++) jump_step(&f, dt, 0, 0, -6, 1, 0);
	CHECK(jump_step(&f, dt, 0, 1, 0, 1, 0) == 0);
	// con doble salto no se guarda el salto (el aire ya lo gasta)
	JumpState g = {0, 0}; for (int i = 0; i < 6; i++) jump_step(&g, dt, 0, 0, -6, 1, 1);
	jump_step(&g, dt, 1, 0, -6, 1, 1); CHECK(jump_step(&g, dt, 0, 1, 0, 1, 1) == 0);
	// mantener A en el suelo no salta dos veces seguidas por el guardado
	JumpState h = {0, 0}; CHECK(jump_step(&h, dt, 1, 1, 0, 1, 0) == 1); CHECK(jump_step(&h, dt, 0, 1, 0, 1, 0) == 0);
	// salir de un bloque que te pusieron encima
	{ Slab s1 = {0.5f, 1.5f}; float y = 0.6f; CHECK(unstick_y(&y, slab_hits, &s1) == 1 && y > 1.5f - 0.001f && !slab_hits(&s1, y)); }
	{ Slab s2 = {0.0f, 0.0f}; float y = 0.0f; CHECK(unstick_y(&y, slab_hits, &s2) == 0 && y == 0.0f); }             // sin bloque: no te mueve
	{ Slab s3 = {2.0f, 3.0f}; float y = 2.0f - 1.8f - 0.02f; CHECK(unstick_y(&y, slab_hits, &s3) == 0); }          // de pie justo debajo, sin tocar: no te mueve
	{ Slab s4 = {0.5f, 40.0f}; float y = 0.6f; CHECK(unstick_y(&y, slab_hits, &s4) == 0 && y == 0.6f); }          // sin hueco: se queda donde estaba
	if (fails) { printf("%d fallos\n", fails); return 1; }
	puts("phys: todo bien"); return 0;
}
