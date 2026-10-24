#include "log.h"
#include <3ds.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

#define LOG_FILE "sdmc:/3ds/blocksy/log.txt"
#define LOG_MAX  (48 * 1024)
static LightLock g_lk; static int g_init;

void blog(const char *fmt, ...) {
	if (!g_init) { LightLock_Init(&g_lk); g_init = 1; }
	char line[300]; va_list ap; va_start(ap, fmt); vsnprintf(line, sizeof line, fmt, ap); va_end(ap);
	LightLock_Lock(&g_lk);
	mkdir("sdmc:/3ds", 0777); mkdir("sdmc:/3ds/blocksy", 0777);
	FILE *f = fopen(LOG_FILE, "ab");
	if (f) {
		if (ftell(f) > LOG_MAX) { fclose(f); remove(LOG_FILE); f = fopen(LOG_FILE, "ab"); }          // el registro antiguo se descarta entero
		if (f) { fprintf(f, "[%llu] %s\n", (unsigned long long)(osGetTime() / 1000), line); fclose(f); }
	}
	LightLock_Unlock(&g_lk);
}
