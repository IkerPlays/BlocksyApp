#include "sfx.h"
#include "app.h"
#include <3ds.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

#define RATE 16000
#define NCH 4
// nota: frecuencia inicial / final (Hz), duracion (s), ruido (0-1), volumen (0-1). Hasta 3 notas seguidas.
typedef struct { float f0, f1, dur, noise, vol; } Note;
static const Note SOUNDS[SFX_COUNT][3] = {
	[SFX_CLICK]      = {{900, 700, 0.04f, 0, 0.5f}},
	[SFX_PLACE]      = {{260, 150, 0.09f, 0.15f, 0.7f}},
	[SFX_BREAK]      = {{180, 70, 0.14f, 0.55f, 0.8f}},
	[SFX_JUMP]       = {{300, 640, 0.11f, 0, 0.5f}},
	[SFX_COIN]       = {{988, 988, 0.06f, 0, 0.6f}, {1319, 1319, 0.16f, 0, 0.6f}},
	[SFX_CHECKPOINT] = {{660, 660, 0.08f, 0, 0.6f}, {880, 880, 0.08f, 0, 0.6f}, {1175, 1175, 0.16f, 0, 0.6f}},
	[SFX_WIN]        = {{523, 523, 0.1f, 0, 0.65f}, {659, 659, 0.1f, 0, 0.65f}, {1046, 1046, 0.32f, 0, 0.65f}},
	[SFX_NOTIFY]     = {{880, 880, 0.07f, 0, 0.5f}, {1175, 1175, 0.14f, 0, 0.5f}},
	[SFX_LAND]       = {{140, 60, 0.08f, 0.35f, 0.55f}},
};
static s16 *g_buf[SFX_COUNT]; static int g_len[SFX_COUNT];
static ndspWaveBuf g_wb[NCH]; static int g_next; static bool g_ok;

static void synth(int id) {
	int total = 0; for (int n = 0; n < 3 && SOUNDS[id][n].dur > 0; n++) total += (int)(SOUNDS[id][n].dur * RATE);
	s16 *b = linearAlloc((size_t)total * 2); if (!b) return;
	unsigned seed = 12345u + (unsigned)id * 977u; int pos = 0;
	for (int n = 0; n < 3 && SOUNDS[id][n].dur > 0; n++) {
		const Note *nt = &SOUNDS[id][n]; int len = (int)(nt->dur * RATE); float ph = 0;
		for (int i = 0; i < len; i++) {
			float t = (float)i / len, f = nt->f0 + (nt->f1 - nt->f0) * t;
			ph += 2.0f * 3.14159265f * f / RATE;
			seed = seed * 1664525u + 1013904223u; float r = ((seed >> 16) & 0x7FFF) / 16384.0f - 1.0f;
			float att = i < 80 ? i / 80.0f : 1.0f, rel = (1.0f - t) * (1.0f - t);      // ataque corto y caida suave: sin chasquidos
			float s = (sinf(ph) * (1.0f - nt->noise) + r * nt->noise) * att * rel * nt->vol;
			b[pos++] = (s16)(s * 22000.0f);
		}
	}
	DSP_FlushDataCache(b, (u32)total * 2); g_buf[id] = b; g_len[id] = total;
}
void sfx_init(void) {
	for (int i = 0; i < SFX_COUNT; i++) synth(i);
	memset(g_wb, 0, sizeof g_wb); g_ok = true;
}
void sfx_exit(void) {
	if (!g_ok) return;
	g_ok = false;
	for (int c = 0; c < NCH; c++) ndspChnWaveBufClear(1 + c);
	for (int i = 0; i < SFX_COUNT; i++) { if (g_buf[i]) linearFree(g_buf[i]); g_buf[i] = NULL; }
}
void sfx_play(int id) {
	if (!g_ok || id < 0 || id >= SFX_COUNT || !g_buf[id] || !app_sfx_on()) return;
	int ch = 1 + (g_next++ % NCH); ndspWaveBuf *w = &g_wb[ch - 1];
	if (w->status == NDSP_WBUF_QUEUED || w->status == NDSP_WBUF_PLAYING) ndspChnWaveBufClear(ch);
	ndspChnReset(ch); ndspChnSetInterp(ch, NDSP_INTERP_LINEAR); ndspChnSetRate(ch, (float)RATE); ndspChnSetFormat(ch, NDSP_FORMAT_MONO_PCM16);
	float mix[12] = {0}; mix[0] = mix[1] = 0.8f; ndspChnSetMix(ch, mix);
	memset(w, 0, sizeof *w); w->data_vaddr = g_buf[id]; w->nsamples = (u32)g_len[id]; w->looping = false; w->status = NDSP_WBUF_FREE;
	ndspChnWaveBufAdd(ch, w);
}
