#pragma once
// Reglas de salto puras (con test en tests/phys_test.c): salto normal y ayuda al saltar (margen al salir de un borde y salto guardado antes de aterrizar)
typedef struct { float coyote, jbuf; } JumpState;
int jump_step(JumpState *s, float dt, int pressed, int grounded, float vy, int assist, int double_jump);   // 1 = hay que saltar ahora (desde el suelo)
// Si estas metido en un bloque (hits(ctx, y) es true en y y en y + 0,05) sube de 1,01 en 1,01 hasta salir (4 veces como mucho). Devuelve 1 si te movio.
int unstick_y(float *y, int (*hits)(void *ctx, float y), void *ctx);
