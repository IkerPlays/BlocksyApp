#pragma once
#include <stdbool.h>
#include <stddef.h>
// Musica de la playlist en la 3DS: descarga los .mp3 de web/public/playlist (los mismos que suenan en la web) y los reproduce con ndsp.
void audio_init(void);
void audio_exit(void);
bool audio_available(void);                        // false si no hay DSP (falta dspfirm.cdc) o no se pudo iniciar
void audio_game(bool on, const char *track);       // entra / sale de un juego; track = cancion elegida por el creador (puede ser "")
bool audio_take_note(char *out, size_t n);         // true una vez por cancion nueva: "titulo" para mostrar en pantalla
void audio_skip(void);                             // siguiente cancion
void audio_hold(bool on);                          // pausa la musica y libera su memoria (durante una actualizacion)
