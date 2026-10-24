#pragma once
// Efectos de sonido de la 3DS: se sintetizan al arrancar (tonos con barrido y envolvente, sin archivos) y suenan por los canales 1-4 de ndsp
// (el canal 0 es la musica). Necesita el DSP: sin dspfirm.cdc no suena nada y la app sigue igual.
enum { SFX_CLICK, SFX_PLACE, SFX_BREAK, SFX_JUMP, SFX_COIN, SFX_CHECKPOINT, SFX_WIN, SFX_NOTIFY, SFX_COUNT };
void sfx_init(void);      // despues de ndspInit correcto
void sfx_exit(void);      // antes de ndspExit
void sfx_play(int id);    // no hace nada si los efectos estan desactivados
