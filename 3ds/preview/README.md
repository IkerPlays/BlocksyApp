# Vista previa de la interfaz de la 3DS (sin consola)

Compila `ui.c` y `app.c` en el ordenador con un renderizador falso de citro2d (`stub.c`) y genera una PNG por pantalla
(arriba = pantalla superior, abajo = pantalla táctil). Sirve para revisar el diseño sin tener que instalar el .cia.
Necesita las cabeceras de libctru, citro2d y citro3d (`git clone` de devkitPro) y Python con Pillow y numpy.

```
H=/ruta/a/headers   # carpeta con libctru/ citro2d/ citro3d/ y un stub/sys/lock.h
gcc -w -std=gnu11 -D__3DS__ -DBLOCKSY_PREVIEW -DBLOCKSY_VERSION='"0.1.0"' \
    -I$H/stub -I$H/libctru/libctru/include -I$H/citro2d/include -I$H/citro3d/include -Isource \
    preview/preview.c preview/stub.c source/ui.c source/app.c source/avatar3d.c source/qrcodegen.c -o preview/preview -lm \
    -Wl,--unresolved-symbols=ignore-all
./preview/preview && python3 preview/render.py preview/out
```
El ancho del texto es una aproximación (la fuente real de la 3DS es distinta): sirve para el diseño, no para medir al píxel.
