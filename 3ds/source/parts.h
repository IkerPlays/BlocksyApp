#pragma once
#include "net.h"
int parts_parse(const char *json, Part *out, int max);
int ui_parse(const char *json, UiText *out, int max);                 // textos de interfaz {"ui":[...]}   // piezas de la respuesta {"parts":[...]}; descarta las invisibles; 0 si no hay
void ui_format(const char *text, char *out, size_t n, int players, const char *name, const char *game, unsigned secs);   // sustituye {players} {name} {game} {time}
