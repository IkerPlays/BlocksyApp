// Prueba de la lectura de piezas del Studio:  gcc -std=gnu11 -Wall -Isource tests/parts_test.c source/parts.c -o /tmp/pt -lm && /tmp/pt
#include "parts.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

int main(void) {
	static Part p[MAX_PARTS];
	const char *js = "[{\"parts\": [\n"
		"{\"name\":\"Suelo\",\"type\":\"part\",\"x\":0,\"y\":0.5,\"z\":0,\"sx\":8,\"sy\":1,\"sz\":8,\"color\":\"#ff9f43\",\"shape\":\"Block\",\"material\":\"Plastic\",\"anchored\":true,\"collide\":true,\"transparency\":0,\"ry\":90},\n"
		"{\"name\":\"Agua\",\"type\":\"part\",\"x\":4,\"y\":1,\"z\":4,\"sx\":4,\"sy\":1,\"sz\":4,\"color\":\"#3b82f6\",\"shape\":\"Block\",\"material\":\"Water\",\"collide\":false,\"transparency\":0.45,\"ry\":0},\n"
		"{\"name\":\"Fantasma\",\"type\":\"part\",\"x\":1,\"y\":1,\"z\":1,\"sx\":1,\"sy\":1,\"sz\":1,\"color\":\"#ffffff\",\"transparency\":0.9},\n"
		"{\"name\":\"Antorcha\",\"type\":\"part\",\"x\":2,\"y\":2,\"z\":2,\"sx\":0.3,\"sy\":1.6,\"sz\":0.3,\"color\":\"#ffb347\",\"shape\":\"Ball\",\"material\":\"Neon\",\"collide\":false,\"transparency\":0},\n"
		"{\"name\":\"Inicio\",\"type\":\"spawn\",\"x\":-3,\"y\":0.25,\"z\":5,\"sx\":4,\"sy\":0.5,\"sz\":4,\"color\":\"#4dd0ff\",\"shape\":\"Cylinder\"}\n"
		"]}]";
	int n = parts_parse(js, p, MAX_PARTS);
	assert(n == 4);                                              // la pieza casi invisible (0.9) se descarta
	assert(p[0].shape == 0 && p[0].collide && p[0].alpha == 255 && !p[0].glow && !p[0].spawn);
	assert(fabsf(p[0].sx - 8) < 1e-4 && fabsf(p[0].y - 0.5f) < 1e-4);
	assert(fabsf(p[0].ry - 1.5708f) < 1e-3 && fabsf(p[0].cs) < 1e-3 && fabsf(p[0].sn - 1) < 1e-3);   // 90 grados
	assert(p[0].color == 0xFF439FFF);                            // #ff9f43 -> ABGR de citro2d
	assert(!p[1].collide && p[1].alpha > 130 && p[1].alpha < 150);   // agua translucida y sin colision
	assert(p[2].shape == 1 && p[2].glow && !p[2].collide);       // bola Neon que brilla
	assert(p[3].spawn && p[3].shape == 2 && !p[3].collide);
	assert(parts_parse("[{\"parts\": null}]", p, MAX_PARTS) == 0);
	assert(parts_parse("[]", p, MAX_PARTS) == 0);
	assert(parts_parse(js, p, 2) == 2);                          // respeta el maximo
	// textos de interfaz: el array ui no se mezcla con parts (y al reves)
	const char *both = "[{\"parts\":[{\"x\":1,\"sx\":2,\"sy\":1,\"sz\":2}],\"ui\":[{\"id\":\"a\",\"text\":\"Hola {name}!\",\"x\":50,\"y\":10,\"size\":24,\"color\":\"#ff0000\"},{\"id\":\"b\",\"text\":\"Jugadores {players} - {time}\",\"x\":2,\"y\":90}]}]";
	assert(parts_parse(both, p, MAX_PARTS) == 1);
	static UiText ut[MAX_UITEXTS]; int nu = ui_parse(both, ut, MAX_UITEXTS);
	assert(nu == 2 && ut[0].size == 24 && ut[0].color == 0xFF0000FF && ut[1].size == 28 && ut[1].x == 2);
	char fo[96]; ui_format(ut[1].text, fo, sizeof fo, 3, "Iker", "Mi juego", 125); assert(!strcmp(fo, "Jugadores 3 - 2:05"));
	ui_format("{game}: {name} {x}", fo, sizeof fo, 1, "Ana", "Plaza", 0); assert(!strcmp(fo, "Plaza: Ana {x}"));
	assert(ui_parse("[{\"ui\": null}]", ut, MAX_UITEXTS) == 0);
	printf("parts: todo bien\n");
	return 0;
}
