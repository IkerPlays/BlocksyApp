#pragma once
// Reglas de salto puras (con test en tests/phys_test.c): salto normal y ayuda al saltar (margen al salir de un borde y salto guardado antes de aterrizar)
typedef struct { float coyote, jbuf; } JumpState;
int jump_step(JumpState *s, float dt, int pressed, int grounded, float vy, int assist, int double_jump);   // 1 = hay que saltar ahora (desde el suelo)
