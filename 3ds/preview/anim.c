// Genera fotogramas animados de la partida (camara orbitando) para el trailer: BLOCKSY_PREVIEW_WORLD + N fotogramas a 15 fps
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
	g_out = fopen("preview/ops_anim.txt", "w");
	ui_init();
	const char *world = argc > 1 ? argv[1] : "hills"; int n = argc > 2 ? atoi(argv[2]) : 60; const char *sky = argc > 3 ? argv[3] : "0";
	setenv("BLOCKSY_PREVIEW_WORLD", world, 1); setenv("BLOCKSY_PREVIEW_SKY", sky, 1);
	for (int i = 0; i < n; i++) {
		char t[32]; snprintf(t, sizeof t, "%.3f", i / 15.0); setenv("BLOCKSY_PREVIEW_T", t, 1);
		fprintf(g_out, "SCENE %s_%03d\n", world, i); game_preview(&top, &bot);
	}
	fclose(g_out); return 0;
}
