#include "opts.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Opciones de juego (Ajustes): cada una tiene un id (enum en app.h), clave de guardado, textos es/en/pt y 2 o 3 valores
const OptDef OPTS[NOPT] = {
	[OPT_NAMETAGS]  = {"nametags", "Nombres sobre jugadores", "Player name tags", "Nomes sobre jogadores", 2, 1},
	[OPT_BUBBLES]   = {"bubbles", "Globos de chat", "Chat bubbles", "Baloes de chat", 2, 1},
	[OPT_INVERT]    = {"invert", "Invertir camara vertical", "Invert camera Y", "Inverter camera vertical", 2, 0},
	[OPT_CAMSPD]    = {"camspd", "Velocidad de camara", "Camera speed", "Velocidade da camera", 3, 1, {"Lenta", "Normal", "Rapida"}, {"Slow", "Normal", "Fast"}},
	[OPT_RADARR]    = {"radarr", "Alcance del radar", "Radar range", "Alcance do radar", 3, 1, {"12 m", "24 m", "48 m"}, {"12 m", "24 m", "48 m"}},
	[OPT_COMPASS]   = {"compass", "Brujula", "Compass", "Bussola", 2, 1},
	[OPT_PILL]      = {"pill", "Contador de jugadores", "Player counter", "Contador de jogadores", 2, 1},
	[OPT_OUTLINE]   = {"outline", "Contorno del bloque", "Block outline", "Contorno do bloco", 2, 1},
	[OPT_SHADOWS]   = {"shadows", "Sombras bajo jugadores", "Player shadows", "Sombras sob jogadores", 2, 1},
	[OPT_DECOR]     = {"decor", "Flores y adornos", "Flowers and decor", "Flores e enfeites", 2, 1},
	[OPT_STEPSND]   = {"stepsnd", "Sonido de pasos", "Footstep sounds", "Som de passos", 2, 0},
	[OPT_CHATSND]   = {"chatsnd", "Sonido de chat", "Chat sound", "Som do chat", 2, 1},
	[OPT_TIMER]     = {"timer", "Reloj de la partida", "Session clock", "Relogio da partida", 2, 0},
	[OPT_BLOCKCNT]  = {"blockcnt", "Contador de bloques", "Block counter", "Contador de blocos", 2, 0},
	[OPT_REPEAT]    = {"repeat", "Repetir al mantener X/Y", "Hold X/Y to repeat", "Repetir ao segurar X/Y", 2, 1},
	[OPT_BLOCKNAME] = {"blockname", "Nombre del bloque al cambiar", "Block name on switch", "Nome do bloco ao trocar", 2, 1},
	[OPT_RUNTOGGLE] = {"runtoggle", "Correr con B alternado", "Toggle run with B", "Correr com B alternado", 2, 0},
	[OPT_WIFI]      = {"wifi", "Senal WiFi en pantalla", "Wi-Fi signal on screen", "Sinal Wi-Fi na tela", 2, 0},
	[OPT_CLOCK]     = {"clock", "Hora en pantalla", "Clock on screen", "Hora na tela", 2, 0},
	[OPT_AUTOSIT]   = {"autosit", "Sentarse tras 45 s quieto", "Sit down after 45 s idle", "Sentar apos 45 s parado", 2, 0},
	[OPT_FIREFLY]   = {"firefly", "Luciernagas de noche", "Night fireflies", "Vaga-lumes a noite", 2, 1},
	[OPT_SORT]      = {"sort", "Orden de los juegos", "Game order", "Ordem dos jogos", 3, 0, {"Populares", "Jugadores", "Nombre"}, {"Popular", "Players", "Name"}},
};

void opts_defaults(int *vals) { for (int i = 0; i < NOPT; i++) vals[i] = OPTS[i].def; }
int opts_parse_line(int *vals, const char *line) {
	if (strncmp(line, "opt.", 4)) return 0;
	for (int i = 0; i < NOPT; i++) {
		size_t kl = strlen(OPTS[i].key);
		if (!strncmp(line + 4, OPTS[i].key, kl) && line[4 + kl] == '=') { int v = atoi(line + 5 + kl); vals[i] = v < 0 || v >= OPTS[i].n ? OPTS[i].def : v; return 1; }
	}
	return 1;
}
const char *opts_format(int id, int val) { static char b[48]; snprintf(b, sizeof b, "opt.%s=%d\n", OPTS[id].key, val); return b; }
