// Fotogramas del ciclo de dia: BLOCKSY_PREVIEW_TOD de 0 a 24 h (para revisar el cielo continuo)
#include <3ds.h>
#include <citro2d.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ui.h"
#include "app.h"
extern FILE *g_out;
void game_preview(C3D_RenderTarget *top, C3D_RenderTarget *bot);
void stub_set_targets(C3D_RenderTarget *t, C3D_RenderTarget *b);
int main(int argc, char **argv) {
	static C3D_RenderTarget top, bot; stub_set_targets(&top, &bot);
	g_out = fopen("preview/ops_anim.txt", "w"); ui_init();
	setenv("BLOCKSY_PREVIEW_WORLD", argc > 1 ? argv[1] : "hills", 1);
	for (int h = 0; h < 24; h += 2) { char t[16]; snprintf(t, sizeof t, "%d", h); setenv("BLOCKSY_PREVIEW_TOD", t, 1); fprintf(g_out, "SCENE tod_%02d\n", h); game_preview(&top, &bot); }
	fclose(g_out); return 0;
}
