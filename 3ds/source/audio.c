#include "audio.h"
#include "sfx.h"
#include "net.h"
#include "app.h"
#include "json.h"
#include <3ds.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#define MINIMP3_IMPLEMENTATION
#define MINIMP3_ONLY_MP3
#define MINIMP3_NO_SIMD
#include "minimp3.h"

#define WEB_BASE "https://blocksyweb.netlify.app/playlist/"
#define MAX_TRACKS 64
#define MAX_FILE (10u * 1024 * 1024)      // un .mp3 mas grande no cabe de forma segura en la memoria de una 3DS antigua
#define NBUF 3
#define BUF_FRAMES 4608                  // 4 tramas de mp3 por buffer (~0,1 s a 44,1 kHz)

static Thread g_th; static volatile bool g_quit, g_ok, g_active, g_skip, g_note_new;
static char g_pref[64], g_note[64];
static char g_files[MAX_TRACKS][64]; static int g_nfiles;
static ndspWaveBuf g_wb[NBUF]; static s16 *g_pcm[NBUF];

typedef struct { u8 *p; size_t n, cap; bool fail; } Mem;
static bool mem_sink(const void *d, size_t n, void *ud) {
	Mem *m = ud; if (m->n + n > MAX_FILE) { m->fail = true; return false; }
	if (m->n + n > m->cap) { size_t c = m->cap ? m->cap * 2 : 256 * 1024; while (c < m->n + n) c *= 2; u8 *q = realloc(m->p, c); if (!q) { m->fail = true; return false; } m->p = q; m->cap = c; }
	memcpy(m->p + m->n, d, n); m->n += n; return true;
}
static void url_encode(const char *s, char *o, size_t n) {
	size_t k = 0; for (; *s && k + 4 < n; s++) { unsigned char c = (unsigned char)*s; if ((c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '-' || c == '_' || c == '.') o[k++] = c; else k += snprintf(o + k, n - k, "%%%02X", c); }
	o[k] = 0;
}
static bool load_list(void) {
	char err[100] = ""; char *r = net_get_text(WEB_BASE "playlist.json", err, sizeof err); if (!r) return false;
	g_nfiles = 0; const char *p = strchr(r, '['), *end = r + strlen(r);
	while (p && g_nfiles < MAX_TRACKS && (p = strchr(p, '"')) && p < end) {
		const char *e = strchr(p + 1, '"'); if (!e) break; size_t l = (size_t)(e - p - 1);
		if (l > 4 && l < 63 && !strcasecmp(p + 1 + l - 4, ".mp3")) { memcpy(g_files[g_nfiles], p + 1, l); g_files[g_nfiles][l] = 0; g_nfiles++; }   // solo mp3 (la web tambien acepta ogg, wav...)
		p = e + 1;
	}
	free(r); return g_nfiles > 0;
}
static void title_of(const char *f, char *o, size_t n) { snprintf(o, n, "%s", f); char *d = strrchr(o, '.'); if (d) *d = 0; for (char *c = o; *c; c++) if (*c == '_') *c = ' '; }

// Reproduce una cancion entera; true si termino bien (o la saltaron), false si no se pudo descargar/decodificar
static bool play_track(const char *file) {
	char url[260] = WEB_BASE, enc[200]; url_encode(file, enc, sizeof enc); strncat(url, enc, sizeof url - strlen(url) - 1);
	Mem m = {0}; char err[100] = ""; volatile int pct = 0;
	if (!net_download(url, mem_sink, &m, &pct, err, sizeof err)) { free(m.p); return false; }
	title_of(file, g_note, sizeof g_note); g_note_new = true;
	static mp3dec_t dec; mp3dec_init(&dec); mp3d_sample_t frame[MINIMP3_MAX_SAMPLES_PER_FRAME];
	size_t pos = 0; int rate = 0, chans = 0, cur = 0; bool started = false;
	while (!g_quit && g_active && !g_skip && pos < m.n) {
		while (!g_quit && g_active && !g_skip && g_wb[cur].status != NDSP_WBUF_DONE && g_wb[cur].status != NDSP_WBUF_FREE) svcSleepThread(8000000LL);
		if (g_quit || !g_active || g_skip) break;
		int filled = 0;
		while (filled + 1152 <= BUF_FRAMES && pos < m.n) {
			mp3dec_frame_info_t info; int s = mp3dec_decode_frame(&dec, m.p + pos, (int)(m.n - pos), frame, &info);
			if (info.frame_bytes <= 0) { pos = m.n; break; }
			pos += (size_t)info.frame_bytes; if (s <= 0) continue;
			if (!started) { rate = info.hz; chans = info.channels; ndspChnReset(0); ndspChnSetInterp(0, NDSP_INTERP_LINEAR); ndspChnSetRate(0, (float)rate); ndspChnSetFormat(0, NDSP_FORMAT_STEREO_PCM16); started = true; }
			for (int i = 0; i < s; i++) { if (chans == 1) { g_pcm[cur][(filled + i) * 2] = frame[i]; g_pcm[cur][(filled + i) * 2 + 1] = frame[i]; } else { g_pcm[cur][(filled + i) * 2] = frame[i * 2]; g_pcm[cur][(filled + i) * 2 + 1] = frame[i * 2 + 1]; } }
			filled += s;
		}
		if (filled > 0) {
			float vol = app_music_vol() / 100.0f, mix[12] = {0}; mix[0] = mix[1] = vol; ndspChnSetMix(0, mix);
			DSP_FlushDataCache(g_pcm[cur], (u32)filled * 4); g_wb[cur].data_vaddr = g_pcm[cur]; g_wb[cur].nsamples = (u32)filled; g_wb[cur].looping = false; g_wb[cur].status = NDSP_WBUF_FREE;
			ndspChnWaveBufAdd(0, &g_wb[cur]); cur = (cur + 1) % NBUF;
		}
	}
	free(m.p);
	for (int w = 0; w < 400 && !g_quit && g_active && !g_skip; w++) { bool busy = false; for (int i = 0; i < NBUF; i++) if (g_wb[i].status == NDSP_WBUF_QUEUED || g_wb[i].status == NDSP_WBUF_PLAYING) busy = true; if (!busy) break; svcSleepThread(30000000LL); }
	ndspChnWaveBufClear(0); for (int i = 0; i < NBUF; i++) g_wb[i].status = NDSP_WBUF_FREE;
	g_skip = false; return started;
}
static void audio_thread(void *arg) {
	(void)arg; int idx = -1, fails = 0;
	while (!g_quit) {
		if (!g_active || !app_music_on()) { idx = -1; svcSleepThread(200000000LL); continue; }
		if (!g_nfiles && !load_list()) { svcSleepThread(5000000000LL); continue; }
		if (idx < 0) { srand((unsigned)osGetTime()); idx = rand() % g_nfiles; for (int i = 0; g_pref[0] && i < g_nfiles; i++) { char t[64]; title_of(g_files[i], t, sizeof t); if (!strcmp(g_files[i], g_pref) || !strcmp(t, g_pref)) { idx = i; break; } } }
		else idx = (idx + 1) % g_nfiles;
		if (play_track(g_files[idx])) fails = 0; else if (++fails >= 3) { fails = 0; svcSleepThread(15000000000LL); }
	}
}
void audio_init(void) {
	APT_SetAppCpuTimeLimit(30);                                        // en una 3DS antigua el nucleo del sistema solo cede un 30 %
	if (R_FAILED(ndspInit())) return;                                  // sin dspfirm.cdc no hay audio: la app sigue igual
	ndspSetOutputMode(NDSP_OUTPUT_STEREO);
	for (int i = 0; i < NBUF; i++) { g_pcm[i] = linearAlloc(BUF_FRAMES * 4); if (!g_pcm[i]) return; memset(&g_wb[i], 0, sizeof g_wb[i]); }
	g_ok = true;
	s32 prio = 0; svcGetThreadPriority(&prio, CUR_THREAD_HANDLE);
	sfx_init();
	g_th = threadCreate(audio_thread, NULL, 64 * 1024, prio + 1, -2, false);       // nucleo del sistema: no quita tiempo al dibujado
	if (!g_th) g_th = threadCreate(audio_thread, NULL, 64 * 1024, prio + 1, -1, false);
}
void audio_exit(void) {
	g_quit = true; if (g_th) { threadJoin(g_th, U64_MAX); threadFree(g_th); g_th = NULL; }
	if (g_ok) { sfx_exit(); ndspChnWaveBufClear(0); for (int i = 0; i < NBUF; i++) if (g_pcm[i]) linearFree(g_pcm[i]); ndspExit(); g_ok = false; }
}
bool audio_available(void) { return g_ok; }
void audio_game(bool on, const char *track) { snprintf(g_pref, sizeof g_pref, "%s", track ? track : ""); g_skip = !on; g_active = on && g_ok; if (on) g_skip = false; }
bool audio_take_note(char *out, size_t n) { if (!g_note_new) return false; g_note_new = false; snprintf(out, n, "%s", g_note); return true; }
void audio_skip(void) { g_skip = true; }
