#include "phys.h"
int jump_step(JumpState *s, float dt, int pressed, int grounded, float vy, int assist, int double_jump) {
	s->coyote = grounded ? 0.1f : s->coyote - dt;
	s->jbuf = pressed ? 0.12f : s->jbuf - dt;
	int fire = (pressed && grounded) || (assist && ((s->jbuf > 0 && grounded && !double_jump) || (pressed && s->coyote > 0 && vy <= 0)));
	if (fire) { s->coyote = 0; s->jbuf = 0; }
	return fire;
}
int unstick_y(float *y, int (*hits)(void *ctx, float y), void *ctx) {
	if (!(hits(ctx, *y) && hits(ctx, *y + 0.05f))) return 0;
	float y0 = *y; for (int k = 0; k < 4 && hits(ctx, *y); k++) *y += 1.01f;
	if (hits(ctx, *y)) { *y = y0; return 0; }
	return 1;
}
