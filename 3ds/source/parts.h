#pragma once
#include "net.h"
int parts_parse(const char *json, Part *out, int max);   // piezas de la respuesta {"parts":[...]}; descarta las invisibles; 0 si no hay
