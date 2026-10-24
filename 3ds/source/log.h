#pragma once
// Registro en la tarjeta SD (sdmc:/3ds/blocksy/log.txt): sirve para saber por que falla algo (actualizaciones, red) sin depurador.
// Se recorta solo cuando pasa de 48 KB. Seguro desde varios hilos.
void blog(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
