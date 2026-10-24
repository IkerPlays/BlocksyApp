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

Para ver tambien la partida (mundos, piezas del Studio, cielos) compila `main.c` aparte renombrando su `main` y enlazalo con el resto
(`stub.c` ya trae las funciones del actualizador y del audio que usa la interfaz). Ejecuta siempre desde la carpeta `3ds/`:
```
F="-w -std=gnu11 -D__3DS__ -DBLOCKSY_PREVIEW -DBLOCKSY_VERSION=\"0.1.0\" -DAPP_VER=1 -I$H/stub -I$H/libctru/libctru/include -I$H/citro2d/include -I$H/citro3d/include -I$H/curlsrc/include -Isource"
gcc $F -c source/main.c -Dmain=blocksy_main -o /tmp/m.o
gcc $F preview/preview.c preview/stub.c source/ui.c source/app.c source/avatar3d.c source/qrcodegen.c /tmp/m.o source/world.c source/update_core.c source/parts.c \
    -o preview/preview -lm -Wl,--unresolved-symbols=ignore-all
./preview/preview && python3 preview/render.py preview/out
```
Variables de entorno de la vista previa de la partida: `BLOCKSY_PREVIEW_WORLD` (plaza, obby, flat, forest...), `BLOCKSY_PREVIEW_PARTS=1` (piezas de ejemplo) y `BLOCKSY_PREVIEW_SKY` (0 dia, 1 amanecer, 2 atardecer, 3 noche, 4 espacio).
