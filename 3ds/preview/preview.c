#include <3ds.h>
#include <citro2d.h>
#include <stdio.h>
#include <string.h>
#include "ui.h"
#include "app.h"

extern FILE *g_out;
void game_preview(C3D_RenderTarget *top, C3D_RenderTarget *bot);
void stub_set_targets(C3D_RenderTarget *t, C3D_RenderTarget *b);

int main(void) {
	static C3D_RenderTarget top, bot; stub_set_targets(&top, &bot);
	g_out = fopen("preview/ops.txt", "w");
	ui_init();
	const char *v = "0.1.0";
	fprintf(g_out, "SCENE login\n");        ui_preview_login(&top, &bot, 0, 0, v);
	fprintf(g_out, "SCENE signup\n");       ui_preview_login(&top, &bot, 1, 0, v);
	fprintf(g_out, "SCENE login_busy\n");   ui_preview_login(&top, &bot, 0, 1, v);
	static const char *names[] = {"home", "discover", "avatar", "friends", "update_", "settings"};
	for (int p = 0; p < 6; p++) { fprintf(g_out, "SCENE %s\n", names[p]); app_preview(&top, &bot, p, -1, p == 0 ? 1 : 0, v); }
	fprintf(g_out, "SCENE update\n"); app_preview(&top, &bot, 4, -1, 0, v);
	fprintf(g_out, "SCENE update_downloading\n"); app_preview(&top, &bot, 4, -3, 2, v);
	fprintf(g_out, "SCENE update_error\n"); app_preview(&top, &bot, 4, -5, 1, v);
	fprintf(g_out, "SCENE modal\n"); app_preview(&top, &bot, 0, 0, 0, v);
	fprintf(g_out, "SCENE game\n"); game_preview(&top, &bot);
	fprintf(g_out, "SCENE game_bottom\n");
	static Session s; snprintf(s.username, sizeof s.username, "Iker"); s.color = 0xFF439FFF;
	static Remote r[3]; snprintf(r[0].name, 24, "Marta"); r[0].color = 0xFF71CC2E; snprintf(r[1].name, 24, "Dani"); r[1].color = 0xFFB6599B; r[1].is3ds = 1; snprintf(r[2].name, 24, "Pablo"); r[2].color = 0xFF129CF3;
	ui_frame_begin(); C3D_FrameBegin(0); C2D_TargetClear(&top, 0xFF000000); C2D_SceneBegin(&top); C2D_TargetClear(&bot, COL_BG); C2D_SceneBegin(&bot);
	ui_game_bottom(&s, r, 3, 1, "Spawn Plaza", v); C3D_FrameEnd(0);
	fclose(g_out); return 0;
}
