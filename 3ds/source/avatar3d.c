#include "avatar3d.h"
#include <math.h>
#include <stdlib.h>
#include <string.h>
static float g_av_z;
void av_set_z(float z) { g_av_z = z; }          // profundidad base (para dibujar el avatar encima de un panel de la interfaz)

// ---------- aspecto (idéntico a web/src/avatar.js) ----------
#define RGB(r, g, b) (0xFF000000u | ((u32)(b) << 16) | ((u32)(g) << 8) | (u32)(r))
static const u32 SKIN[6] = {RGB(0xff, 0xd9, 0xa8), RGB(0xf1, 0xc2, 0x7d), RGB(0xe0, 0xac, 0x69), RGB(0xc6, 0x86, 0x42), RGB(0x8d, 0x55, 0x24), RGB(0xff, 0xe0, 0xbd)};
static const u32 HAIR[8] = {RGB(0x2b, 0x1b, 0x10), RGB(0x5a, 0x3a, 0x1e), RGB(0xa0, 0x52, 0x2d), RGB(0xd4, 0xa0, 0x17), RGB(0x1c, 0x1c, 0x1c), RGB(0x8b, 0x00, 0x00), RGB(0xb0, 0xb0, 0xb0), RGB(0x3b, 0x6f, 0xb6)};
static const u32 PANTS[6] = {RGB(0x34, 0x49, 0x5e), RGB(0x2c, 0x3e, 0x50), RGB(0x4b, 0x3a, 0x2a), RGB(0x3d, 0x3d, 0x3d), RGB(0x26, 0x46, 0x53), RGB(0x5b, 0x2a, 0x86)};

AvStyle av_style(const char *name, u32 shirt) {
	u32 h = 0x811c9dc5u;
	for (const unsigned char *p = (const unsigned char *)name; *p; p++) { h ^= *p; h *= 0x01000193u; }
	return (AvStyle){shirt, SKIN[h % 6], HAIR[(h >> 8) % 8], PANTS[(h >> 16) % 6], (int)((h >> 24) % 3), 0};
}

const char *const AV_HAT_ID[NHATS] = {"hat_cap", "hat_antenna", "hat_party", "hat_halo", "hat_top", "hat_crown", "hat_wizard", "hat_cowboy", "hat_chef", "hat_beanie", "hat_helmet", "hat_flower"};
int av_hat_index(const char *id) { if (id) for (int i = 0; i < NHATS; i++) if (!strcmp(id, AV_HAT_ID[i])) return i + 1; return 0; }
static const u32 HAT_COL[NHATS] = {RGB(0xe7, 0x4c, 0x3c), RGB(0x7e, 0xd6, 0xff), RGB(0xff, 0x6b, 0x9d), RGB(0xf5, 0xc5, 0x42), RGB(0x2b, 0x2f, 0x36), RGB(0xf1, 0xc4, 0x0f), RGB(0x6c, 0x3f, 0xb5), RGB(0xa0, 0x52, 0x2d), RGB(0xf5, 0xf5, 0xf5), RGB(0xe6, 0x7e, 0x22), RGB(0x7f, 0x8c, 0x8d), RGB(0xff, 0x7e, 0xb6)};

const char *const AV_EMOTE_ID[NEMOTES] = {"wave", "dance", "cheer", "clap", "sit"};
const char *const AV_EMOTE_LABEL[NEMOTES] = {"Saludar", "Bailar", "Celebrar", "Aplaudir", "Sentarse"};
bool av_is_emote(const char *a) { for (int i = 0; i < NEMOTES; i++) if (!strcmp(a, AV_EMOTE_ID[i])) return true; return false; }

// ---------- poses (mismas que poseAvatar de la web) ----------
void av_pose_update(AvPose *p, const char *anim, float dt, float t) {
	bool walk = !strcmp(anim, "walk");
	if (walk) p->phase += dt * 11;
	else if (av_is_emote(anim)) p->phase += dt * (!strcmp(anim, "dance") ? 9 : !strcmp(anim, "clap") ? 14 : 7);
	float s = sinf(p->phase), k = fminf(1, dt * 14);
	float legL = 0, legR = 0, aLx = 0, aRx = 0, aLz = 0, aRz = 0, bodyY = 0, legY = 0.74f, headX = 0;
	if (walk) { legL = s * 0.85f; legR = -s * 0.85f; aLx = -s * 0.8f; aRx = s * 0.8f; }
	else if (!strcmp(anim, "jump")) { legL = 0.35f; legR = -0.25f; aLx = aRx = -2.5f; }
	else if (!strcmp(anim, "wave")) { aRz = 2.6f + sinf(p->phase * 1.6f) * 0.35f; aLx = sinf(t * 1.6f) * 0.04f; }
	else if (!strcmp(anim, "dance")) { legL = s * 0.5f; legR = -s * 0.5f; aLz = -2.4f - sinf(p->phase * 2) * 0.4f; aRz = 2.4f + sinf(p->phase * 2 + 1) * 0.4f; bodyY = fabsf(s) * 0.16f; headX = sinf(p->phase * 2) * 0.12f; }
	else if (!strcmp(anim, "cheer")) { aLx = aRx = -3.0f; aLz = -0.35f; aRz = 0.35f; bodyY = fabsf(s) * 0.22f; }
	else if (!strcmp(anim, "clap")) { aLx = aRx = -1.45f; aLz = 0.55f - (s + 1) * 0.28f; aRz = -0.55f + (s + 1) * 0.28f; }
	else if (!strcmp(anim, "sit")) { legL = legR = -1.5f; aLx = aRx = -0.5f; bodyY = -0.36f; legY = 0.38f; }
	else { aLx = sinf(t * 1.6f) * 0.05f; aRx = -sinf(t * 1.6f) * 0.05f; headX = sinf(t * 1.2f) * 0.03f; }
#define LERP(f, v) p->f += ((v) - p->f) * k
	LERP(legL, legL); LERP(legR, legR); LERP(armLx, aLx); LERP(armRx, aRx); LERP(armLz, aLz); LERP(armRz, aRz); LERP(bodyY, bodyY); LERP(legY, legY); LERP(headX, headX);
#undef LERP
}

// ---------- cámara ----------
bool av_project(const AvCam *c, float x, float y, float z, float *sx, float *sy, float *depth) {
	float dx = x - c->cx, dy = y - c->cy, dz = z - c->cz;
	float cyw = cosf(c->yaw), syw = sinf(c->yaw);
	float rx = dx * cyw - dz * syw;           // eje derecho de la cámara
	float fw = -dx * syw - dz * cyw;          // eje hacia delante
	float cp = cosf(c->pitch), sp = sinf(c->pitch);
	float ry = dy * cp + fw * sp, rz = -dy * sp + fw * cp + c->dist;
	if (rz < 0.3f) return false;
	*sx = c->ox + rx * c->fov / rz; *sy = c->oy - ry * c->fov / rz; *depth = rz;
	return true;
}

// ---------- partes ----------
typedef struct { float px, py, pz, ox, oy, oz, w, h, d, rx, rz; int body; u32 color; float depth; } Part;   // body: se mueve con el cuerpo (bodyY)

static u32 shade(u32 c, float f) {
	u32 r = (c & 0xFF) * f, g = ((c >> 8) & 0xFF) * f, b = ((c >> 16) & 0xFF) * f;
	return C2D_Color32(r > 255 ? 255 : r, g > 255 ? 255 : g, b > 255 ? 255 : b, 255);
}
static u32 fogged(u32 c, float depth, float fn, float ff) {
	if (ff <= 0) return c;
	float t = (depth - fn) / (ff - fn); if (t <= 0) return c; if (t > 1) t = 1;
	float r = (c & 0xFF) * (1 - t) + 0xD8 * t, g = ((c >> 8) & 0xFF) * (1 - t) + 0xEC * t, b = ((c >> 16) & 0xFF) * (1 - t) + 0xFF * t;
	return C2D_Color32((u32)r, (u32)g, (u32)b, 255);
}

typedef struct { float x, y, z; } V3;
// Esquinas de la parte en el mundo: giro en Z y luego en X alrededor del pivote, desplazamiento del cuerpo, giro de yaw y posición
static void part_corners(const Part *p, float bodyY, float yaw, float wx, float wy, float wz, V3 out[8]) {
	float cz = cosf(p->rz), sz = sinf(p->rz), cx = cosf(p->rx), sx = sinf(p->rx), cy = cosf(yaw), sy = sinf(yaw);
	for (int i = 0; i < 8; i++) {
		float x = p->ox + ((i & 1) ? 0.5f : -0.5f) * p->w;
		float y = p->oy + ((i & 2) ? 0.5f : -0.5f) * p->h;
		float z = p->oz + ((i & 4) ? 0.5f : -0.5f) * p->d;
		float x1 = x * cz - y * sz, y1 = x * sz + y * cz, z1 = z;           // Rz
		float y2 = y1 * cx - z1 * sx, z2 = y1 * sx + z1 * cx, x2 = x1;      // Rx
		x2 += p->px; y2 += p->py + (p->body ? bodyY : 0); z2 += p->pz;
		out[i] = (V3){wx + x2 * cy + z2 * sy, wy + y2, wz - x2 * sy + z2 * cy};   // yaw: +z local = (sin yaw, cos yaw) en el mundo
	}
}
static int cmp_part(const void *a, const void *b) { float d = ((const Part *)b)->depth - ((const Part *)a)->depth; return d > 0 ? 1 : d < 0 ? -1 : 0; }

void av_draw(const AvCam *c, float x, float y, float z, float yaw, const AvStyle *st, const AvPose *pose, float fog_near, float fog_far) {
	const u32 DARK = RGB(0x1b, 0x1b, 0x1b);
	Part P[32]; int n = 0;
#define PART(PX, PY, PZ, OX, OY, OZ, W, H, D, RX, RZ, BODY, COL) P[n++] = (Part){PX, PY, PZ, OX, OY, OZ, W, H, D, RX, RZ, BODY, COL, 0}
	PART(-0.16f, pose->legY, 0, 0, -0.37f, 0, 0.30f, 0.74f, 0.32f, pose->legL, 0, 0, st->pants);
	PART(0.16f, pose->legY, 0, 0, -0.37f, 0, 0.30f, 0.74f, 0.32f, pose->legR, 0, 0, st->pants);
	PART(0, 0, 0, 0, 1.10f, 0, 0.64f, 0.72f, 0.36f, 0, 0, 1, st->shirt);                              // torso
	PART(-0.44f, 1.42f, 0, 0, -0.34f, 0, 0.22f, 0.68f, 0.26f, pose->armLx, pose->armLz, 1, st->skin);  // brazos
	PART(-0.44f, 1.42f, 0, 0, -0.13f, 0, 0.24f, 0.26f, 0.28f, pose->armLx, pose->armLz, 1, st->shirt); // mangas
	PART(0.44f, 1.42f, 0, 0, -0.34f, 0, 0.22f, 0.68f, 0.26f, pose->armRx, pose->armRz, 1, st->skin);
	PART(0.44f, 1.42f, 0, 0, -0.13f, 0, 0.24f, 0.26f, 0.28f, pose->armRx, pose->armRz, 1, st->shirt);
	PART(0, 1.78f, 0, 0, 0, 0, 0.52f, 0.52f, 0.52f, pose->headX, 0, 1, st->skin);                      // cabeza
	PART(0, 1.78f, 0, -0.12f, 0.04f, 0.265f, 0.09f, 0.10f, 0.02f, pose->headX, 0, 1, DARK);            // ojos
	PART(0, 1.78f, 0, 0.12f, 0.04f, 0.265f, 0.09f, 0.10f, 0.02f, pose->headX, 0, 1, DARK);
	PART(0, 1.78f, 0, 0, -0.12f, 0.265f, 0.16f, 0.035f, 0.02f, pose->headX, 0, 1, RGB(0x5b, 0x2d, 0x1a)); // boca
	PART(0, 1.78f, 0, 0, 0.26f, -0.01f, 0.56f, 0.14f, 0.56f, pose->headX, 0, 1, st->hair);             // pelo
	if (st->hair_style == 1) { PART(0, 1.78f, 0, 0, 0.12f, -0.23f, 0.56f, 0.22f, 0.10f, pose->headX, 0, 1, st->hair); PART(0, 1.78f, 0, -0.27f, 0.05f, -0.02f, 0.10f, 0.30f, 0.50f, pose->headX, 0, 1, st->hair); PART(0, 1.78f, 0, 0.27f, 0.05f, -0.02f, 0.10f, 0.30f, 0.50f, pose->headX, 0, 1, st->hair); }
	else if (st->hair_style == 2) { for (int i = -1; i <= 1; i++) PART(0, 1.78f, 0, 0.18f * i, 0.40f, 0, 0.10f, 0.18f, 0.10f, pose->headX, 0, 1, st->hair); }
	else PART(0, 1.78f, 0, 0, 0.18f, 0.24f, 0.56f, 0.12f, 0.10f, pose->headX, 0, 1, st->hair);
	if (st->hat > 0) {                                                                                       // sombrero: mismas medidas que addHat de la web (sobre la cabeza)
#define HP(OX, OY, OZ, W, H, D, COL) PART(0, 1.78f, 0, OX, OY, OZ, W, H, D, pose->headX, 0, 1, COL)
		u32 hc = HAT_COL[st->hat - 1];
		switch (st->hat) {
		case 1: HP(0, 0.37f, -0.01f, 0.58f, 0.14f, 0.58f, hc); HP(0, 0.31f, 0.4f, 0.5f, 0.04f, 0.3f, RGB(0xc0, 0x39, 0x2b)); break;
		case 2: HP(0, 0.5f, 0, 0.04f, 0.34f, 0.04f, RGB(0x9a, 0xa0, 0xa8)); HP(0, 0.74f, 0, 0.12f, 0.12f, 0.12f, hc); break;
		case 3: HP(0, 0.40f, 0, 0.38f, 0.14f, 0.38f, hc); HP(0, 0.54f, 0, 0.26f, 0.14f, 0.26f, hc); HP(0, 0.68f, 0, 0.14f, 0.14f, 0.14f, hc); HP(0, 0.80f, 0, 0.08f, 0.08f, 0.08f, RGB(0xff, 0xff, 0xff)); break;
		case 4: HP(0, 0.62f, -0.28f, 0.60f, 0.06f, 0.06f, hc); HP(0, 0.62f, 0.28f, 0.60f, 0.06f, 0.06f, hc); HP(-0.28f, 0.62f, 0, 0.06f, 0.06f, 0.50f, hc); HP(0.28f, 0.62f, 0, 0.06f, 0.06f, 0.50f, hc); break;
		case 5: HP(0, 0.34f, 0, 0.68f, 0.05f, 0.68f, hc); HP(0, 0.58f, 0, 0.40f, 0.42f, 0.40f, hc); HP(0, 0.45f, 0, 0.42f, 0.07f, 0.42f, RGB(0xc0, 0x39, 0x2b)); break;
		case 6: HP(0, 0.40f, 0, 0.52f, 0.12f, 0.52f, hc); HP(-0.2f, 0.54f, -0.2f, 0.1f, 0.16f, 0.1f, hc); HP(0.2f, 0.54f, -0.2f, 0.1f, 0.16f, 0.1f, hc); HP(-0.2f, 0.54f, 0.2f, 0.1f, 0.16f, 0.1f, hc); HP(0.2f, 0.54f, 0.2f, 0.1f, 0.16f, 0.1f, hc); HP(0, 0.54f, 0, 0.1f, 0.16f, 0.1f, hc); break;
		case 7: HP(0, 0.34f, 0, 0.70f, 0.05f, 0.70f, hc); HP(0, 0.40f, 0, 0.54f, 0.05f, 0.54f, RGB(0xf5, 0xc5, 0x42)); HP(0, 0.52f, 0, 0.40f, 0.20f, 0.40f, hc); HP(0, 0.68f, 0, 0.26f, 0.20f, 0.26f, hc); HP(0, 0.84f, 0, 0.12f, 0.16f, 0.12f, hc); break;
		case 8: HP(0, 0.34f, 0, 0.78f, 0.05f, 0.62f, hc); HP(0, 0.47f, 0, 0.42f, 0.22f, 0.42f, hc); HP(0, 0.40f, 0, 0.44f, 0.05f, 0.44f, RGB(0x5b, 0x3a, 0x1a)); break;
		case 9: HP(0, 0.35f, 0, 0.50f, 0.12f, 0.50f, hc); HP(0, 0.58f, 0, 0.60f, 0.34f, 0.60f, hc); break;
		case 10: HP(0, 0.35f, 0, 0.58f, 0.16f, 0.58f, hc); HP(0, 0.50f, 0, 0.44f, 0.12f, 0.44f, hc); HP(0, 0.62f, 0, 0.12f, 0.12f, 0.12f, RGB(0xff, 0xff, 0xff)); break;
		case 11: HP(0, 0.38f, 0, 0.60f, 0.30f, 0.60f, hc); HP(0, 0.58f, 0, 0.08f, 0.20f, 0.64f, RGB(0xc0, 0x39, 0x2b)); break;
		case 12: HP(0, 0.42f, 0, 0.10f, 0.22f, 0.10f, RGB(0x2e, 0xcc, 0x71)); HP(0, 0.58f, 0, 0.28f, 0.10f, 0.28f, hc); HP(0, 0.60f, 0, 0.10f, 0.12f, 0.10f, RGB(0xf1, 0xc4, 0x0f)); break;
		}
#undef HP
	}
#undef PART
	// profundidad de cada parte -> orden de atrás hacia delante
	for (int i = 0; i < n; i++) {
		V3 q[8]; part_corners(&P[i], pose->bodyY, yaw, x, y, z, q);
		float cx = 0, cy = 0, cz = 0; for (int k = 0; k < 8; k++) { cx += q[k].x; cy += q[k].y; cz += q[k].z; }
		float sx, sy, d = 1e9f; if (!av_project(c, cx / 8, cy / 8, cz / 8, &sx, &sy, &d)) d = 1e9f; P[i].depth = d;
	}
	qsort(P, n, sizeof(Part), cmp_part);
	static const int F[6][4] = {{0,1,2,3},{4,5,6,7},{0,1,5,4},{2,3,7,6},{0,3,7,4},{1,2,6,5}};
	static const int V[8] = {0, 1, 5, 4, 2, 3, 7, 6};   // esquina k (orden de draw_box: 0..3 abajo, 4..7 arriba) -> índice binario (x|y<<1|z<<2)
	for (int i = 0; i < n; i++) {
		V3 w[8]; part_corners(&P[i], pose->bodyY, yaw, x, y, z, w);
		V3 q[8]; for (int k = 0; k < 8; k++) q[k] = w[V[k]];       // mismo orden de esquinas que draw_box: 0..3 abajo, 4..7 arriba
		float sx[8], sy[8], d[8]; bool ok = true;
		for (int k = 0; k < 8 && ok; k++) ok = av_project(c, q[k].x, q[k].y, q[k].z, &sx[k], &sy[k], &d[k]);
		if (!ok) continue;
		for (int f = 0; f < 6; f++) {
			const int *fi = F[f];
			float area = (sx[fi[1]] - sx[fi[0]]) * (sy[fi[2]] - sy[fi[0]]) - (sx[fi[2]] - sx[fi[0]]) * (sy[fi[1]] - sy[fi[0]]);
			if (area <= 0) continue;
			// luz según la orientación real de la cara (la parte puede estar girada)
			V3 a = q[fi[0]], b = q[fi[1]], e = q[fi[3]];
			float ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = e.x - a.x, vy = e.y - a.y, vz = e.z - a.z;
			float nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = sqrtf(nx * nx + ny * ny + nz * nz) + 1e-6f;
			float dot = (nx * 0.30f + ny * 0.85f + nz * 0.40f) / nl; if (dot < 0) dot = -dot * 0.5f;
			u32 col = shade(fogged(P[i].color, P[i].depth, fog_near, fog_far), 0.62f + 0.38f * dot);
			C2D_DrawTriangle(sx[fi[0]], sy[fi[0]], col, sx[fi[1]], sy[fi[1]], col, sx[fi[2]], sy[fi[2]], col, g_av_z);
			C2D_DrawTriangle(sx[fi[0]], sy[fi[0]], col, sx[fi[2]], sy[fi[2]], col, sx[fi[3]], sy[fi[3]], col, g_av_z);
		}
	}
}
