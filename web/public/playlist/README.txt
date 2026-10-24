PLAYLIST DE BLOCKSY (web y 3DS)
===============================
Como subir canciones para que suenen en la web Y en la 3DS:
  1. Copia tus archivos .mp3 en esta carpeta (web/public/playlist/).
  2. Haz git commit y git push (o sube los archivos desde GitHub: "Add file > Upload files" en web/public/playlist).
  3. Netlify vuelve a publicar la web sola; al compilarse se regenera playlist.json con la lista.
  4. La web las reproduce al entrar a un juego. La 3DS descarga la misma lista (playlist.json) y reproduce los .mp3
     al entrar a un juego (Ajustes > Musica). No hace falta tocar nada mas.

Reglas para que funcionen en las dos:
  - Formato .mp3 (la web tambien acepta .ogg .wav .m4a .aac .flac .opus .webm, pero la 3DS solo reproduce .mp3).
  - Archivos de 2 a 6 MB (mp3 a 128 kbps, 44,1 kHz). La 3DS rechaza los de mas de 10 MB.
  - Nombres sin acentos ni simbolos raros: "mi_cancion.mp3". El titulo que se muestra sale del nombre del archivo.
  - Usa solo musica de la que tengas derechos de uso.
  - La 3DS necesita el archivo dspfirm.cdc (volcado del DSP) en la tarjeta SD; sin el, la app funciona pero sin sonido.
  - En la 3DS antigua la musica viene desactivada por defecto (gasta mucha CPU); en la New 3DS viene activada.

Un creador puede fijar una cancion para su juego en el Studio (Environment > Track); suena en la web y en la 3DS.

--- English ---
Drop .mp3 files in this folder, commit and push. Netlify redeploys and rebuilds playlist.json; the web and the 3DS
read the same list. The 3DS only plays .mp3 (max 10 MB each) and needs dspfirm.cdc on the SD card for sound.
