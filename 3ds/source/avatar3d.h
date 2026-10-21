#pragma once
#include <3ds.h>
#include <citro2d.h>
#include <stdbool.h>

// Avatares 3D de Blocksy para la 3DS: mismo aspecto que la web (hash FNV-1a del nombre) y las mismas poses/emotes.
typedef struct { u32 shirt, skin, hair, pants; int hair_style; } AvStyle;
AvStyle av_style(const char *name, u32 shirt_abgr);

#define NEMOTES 5
extern const char *const AV_EMOTE_ID[NEMOTES];      // wave dance cheer clap sit  (se envían tal cual como "anim")
extern const char *const AV_EMOTE_LABEL[NEMOTES];   // Saludar Bailar Celebrar Aplaudir Sentarse
bool av_is_emote(const char *anim);

// Estado de animación (se suaviza hacia la pose objetivo)
typedef struct { float phase, legL, legR, armLx, armRx, armLz, armRz, bodyY, legY, headX; } AvPose;
void av_pose_update(AvPose *p, const char *anim, float dt, float t);

// Cámara para proyectar (la usa el mundo del juego y la vista previa del avatar)
typedef struct { float cx, cy, cz, yaw, pitch, dist, fov, ox, oy; } AvCam;
bool av_project(const AvCam *c, float x, float y, float z, float *sx, float *sy, float *depth);

// Dibuja el avatar con los pies en (x,y,z) mirando a yaw. fog_far <= 0: sin niebla.
void av_draw(const AvCam *c, float x, float y, float z, float yaw, const AvStyle *st, const AvPose *pose, float fog_near, float fog_far);
