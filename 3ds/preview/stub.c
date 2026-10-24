// Renderizador falso de citro2d: registra las operaciones de dibujo en un fichero para pintarlas con Python.
#include <3ds.h>
#include <citro2d.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

FILE *g_out;
static int g_target;                     // 0 = top, 1 = bottom
static C3D_RenderTarget *g_tops[2];
void stub_set_targets(C3D_RenderTarget *t, C3D_RenderTarget *b) { g_tops[0] = t; g_tops[1] = b; }
u64 osGetTime(void) { return 1234567; }

struct C2D_TextBuf_s { char s[1 << 20]; unsigned n; };
C2D_TextBuf C2D_TextBufNew(size_t g) { (void)g; C2D_TextBuf b = calloc(1, sizeof *b); return b; }
void C2D_TextBufDelete(C2D_TextBuf b) { free(b); }
void C2D_TextBufClear(C2D_TextBuf b) { b->n = 0; }
static float cw(const char *s) { float w = 0; for (; *s; s++) if ((*s & 0xC0) != 0x80) w += 11.2f; return w; }
const char *C2D_TextParse(C2D_Text *t, C2D_TextBuf b, const char *str) {
	t->buf = b; t->begin = b->n; size_t l = strlen(str) + 1; memcpy(b->s + b->n, str, l); b->n += l; t->end = b->n; t->width = cw(str); return str + strlen(str);
}
void C2D_TextOptimize(const C2D_Text *t) { (void)t; }
void C2D_TextGetDimensions(const C2D_Text *t, float sx, float sy, float *w, float *h) { *w = t->width * sx; *h = 30 * sy; }
void C2D_DrawText(const C2D_Text *t, u32 flags, float x, float y, float z, float sx, float sy, ...) {
	(void)z; (void)sy;
	__builtin_va_list ap; __builtin_va_start(ap, sy); u32 color = (flags & C2D_WithColor) ? __builtin_va_arg(ap, u32) : 0xFFFFFFFF; __builtin_va_end(ap);
	float w = t->width * sx; float ox = x;
	if ((flags & (3 << 2)) == C2D_AlignCenter) ox = x - w / 2; else if ((flags & (3 << 2)) == C2D_AlignRight) ox = x - w;
	fprintf(g_out, "TXT %d %.1f %.1f %.3f %u %s\n", g_target, ox, y, sx, color, t->buf->s + t->begin);
}
bool C2D_DrawRectangle(float x, float y, float z, float w, float h, u32 a, u32 b, u32 c, u32 d) { (void)z; fprintf(g_out, "RECT %d %.1f %.1f %.1f %.1f %u %u %u %u\n", g_target, x, y, w, h, a, b, c, d); return true; }
bool C2D_DrawTriangle(float x0, float y0, u32 c0, float x1, float y1, u32 c1, float x2, float y2, u32 c2, float z) { (void)z; (void)c1; (void)c2; fprintf(g_out, "TRI %d %.1f %.1f %.1f %.1f %.1f %.1f %u\n", g_target, x0, y0, x1, y1, x2, y2, c0); return true; }
bool C2D_DrawEllipse(float x, float y, float z, float w, float h, u32 a, u32 b, u32 c, u32 d) { (void)z; (void)b; (void)c; (void)d; fprintf(g_out, "CIR %d %.1f %.1f %.1f %u\n", g_target, x + w / 2, y + h / 2, w / 2, a); return true; }
void C2D_TargetClear(C3D_RenderTarget *t, u32 c) { int id = t == g_tops[1]; fprintf(g_out, "CLEAR %d %u\n", id, c); }
void C2D_Flush(void) {}
bool C3D_FrameDrawOn(C3D_RenderTarget *t) { g_target = t == g_tops[1]; return true; }
void C2D_SceneSize(u32 w, u32 h, bool t) { (void)w; (void)h; (void)t; }
void C2D_ViewReset(void) {}
bool C3D_FrameBegin(u8 f) { (void)f; return true; }
void C3D_FrameEnd(u8 f) { (void)f; }
bool C2D_DrawLine(float x0, float y0, u32 c0, float x1, float y1, u32 c1, float t, float z) { (void)c1; (void)z; fprintf(g_out, "LINE %d %.1f %.1f %.1f %.1f %.1f %u\n", g_target, x0, y0, x1, y1, t, c0); return true; }

// Actualizador: en el ordenador no hay nada que instalar (update.c necesita AM/curl)
#include "update.h"
bool update_can_rollback(void) { return true; }
bool update_is_cia(void) { return true; }
bool update_rollback(char *err, size_t en) { return false; }
bool update_take_news(char *from, char *to, size_t n) { return false; }
#include "audio.h"
void audio_init(void) {}
void audio_exit(void) {}
bool audio_available(void) { return true; }
void audio_game(bool on, const char *track) {}
bool audio_take_note(char *out, size_t n) { return false; }
bool update_dry_run(const Rel *r, UpdateProgress *prog, char *err, size_t en) { return true; }
void update_diag(char *out, size_t n) { snprintf(out, n, "RAM libre 38 MB, SD libre 5200 MB"); }
