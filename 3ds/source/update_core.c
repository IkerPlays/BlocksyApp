// Nucleo del actualizador: sin dependencias de la 3DS para poder probarlo en el ordenador (3ds/tests/update_core_test.c).
#include "update.h"
#include "json.h"
#include <ctype.h>
#include <stdlib.h>
#include <string.h>

// ---------- versiones ----------
Ver ver_parse(const char *s) {
	Ver r = {{0, 0, 0}, 0, false, false};
	if (!s) return r;
	if (*s == 'v' || *s == 'V') s++;
	int a = 0, b = 0, c = 0;
	if (sscanf(s, "%d.%d.%d", &a, &b, &c) != 3) return r;
	r.v[0] = a; r.v[1] = b; r.v[2] = c; r.ok = true;
	const char *d = strstr(s, "-dev.");
	if (d) { r.is_dev = true; r.dev = atoi(d + 5); }
	return r;
}
int ver_cmp(Ver a, Ver b) {
	for (int i = 0; i < 3; i++) if (a.v[i] != b.v[i]) return a.v[i] > b.v[i] ? 1 : -1;
	if (a.is_dev != b.is_dev) return a.is_dev ? -1 : 1;
	return a.dev == b.dev ? 0 : a.dev > b.dev ? 1 : -1;
}

// ---------- SHA-256 ----------
static const unsigned K[64] = {
	0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
	0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
	0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
	0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2};
#define ROR(x, n) (((x) >> (n)) | ((x) << (32 - (n))))
static void sha_block(Sha256 *s, const unsigned char *p) {
	unsigned w[64], a, b, c, d, e, f, g, h;
	for (int i = 0; i < 16; i++) w[i] = (unsigned)p[i * 4] << 24 | (unsigned)p[i * 4 + 1] << 16 | (unsigned)p[i * 4 + 2] << 8 | p[i * 4 + 3];
	for (int i = 16; i < 64; i++) { unsigned s0 = ROR(w[i - 15], 7) ^ ROR(w[i - 15], 18) ^ (w[i - 15] >> 3), s1 = ROR(w[i - 2], 17) ^ ROR(w[i - 2], 19) ^ (w[i - 2] >> 10); w[i] = w[i - 16] + s0 + w[i - 7] + s1; }
	a = s->h[0]; b = s->h[1]; c = s->h[2]; d = s->h[3]; e = s->h[4]; f = s->h[5]; g = s->h[6]; h = s->h[7];
	for (int i = 0; i < 64; i++) {
		unsigned S1 = ROR(e, 6) ^ ROR(e, 11) ^ ROR(e, 25), ch = (e & f) ^ (~e & g), t1 = h + S1 + ch + K[i] + w[i];
		unsigned S0 = ROR(a, 2) ^ ROR(a, 13) ^ ROR(a, 22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = S0 + mj;
		h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
	}
	s->h[0] += a; s->h[1] += b; s->h[2] += c; s->h[3] += d; s->h[4] += e; s->h[5] += f; s->h[6] += g; s->h[7] += h;
}
void sha256_init(Sha256 *s) {
	static const unsigned i0[8] = {0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19};
	memcpy(s->h, i0, sizeof i0); s->len = 0; s->fill = 0;
}
void sha256_update(Sha256 *s, const void *d, size_t n) {
	const unsigned char *p = d; s->len += n;
	while (n) {
		unsigned k = 64 - s->fill; if (k > n) k = (unsigned)n;
		memcpy(s->buf + s->fill, p, k); s->fill += k; p += k; n -= k;
		if (s->fill == 64) { sha_block(s, s->buf); s->fill = 0; }
	}
}
void sha256_hex(Sha256 *s, char out[65]) {
	unsigned long long bits = s->len * 8; unsigned char pad = 0x80;
	sha256_update(s, &pad, 1); pad = 0; while (s->fill != 56) sha256_update(s, &pad, 1);
	unsigned char lb[8]; for (int i = 0; i < 8; i++) lb[i] = (unsigned char)(bits >> (56 - 8 * i));
	sha256_update(s, lb, 8);
	static const char hx[] = "0123456789abcdef";
	for (int i = 0; i < 8; i++) for (int k = 0; k < 4; k++) { unsigned char by = (unsigned char)(s->h[i] >> (24 - 8 * k)); out[i * 8 + k * 2] = hx[by >> 4]; out[i * 8 + k * 2 + 1] = hx[by & 15]; }
	out[64] = 0;
}
bool hex_eq(const char *a, const char *b) {
	if (!a || !b || strlen(a) != 64 || strlen(b) != 64) return false;
	for (int i = 0; i < 64; i++) if (tolower((unsigned char)a[i]) != tolower((unsigned char)b[i])) return false;
	return true;
}

// ---------- notas de la release ----------
// Texto JSON de "body" -> texto plano legible en la fuente de la 3DS: sin *, `, # ni emojis, sin lineas "<sub>" ni "---"
static void notes_from(const char *obj, const char *end, char *dst, size_t n) {
	dst[0] = 0; const char *p = json_find_from(obj, end, "body"); if (!p || *p != '"') return;
	char raw[1400]; size_t i = 0; p++;
	while (*p && p < end && *p != '"' && i + 2 < sizeof raw) {
		if (*p == '\\' && p[1]) {
			p++;
			if (*p == 'n') raw[i++] = '\n'; else if (*p == 'r' || *p == 't') raw[i++] = ' ';
			else if (*p == 'u') { unsigned cp = 0; sscanf(p + 1, "%4x", &cp); p += 4; if (cp == 0x2013 || cp == 0x2014) raw[i++] = '-'; else if (cp >= 0x20 && cp < 0x80) raw[i++] = (char)cp; }
			else raw[i++] = *p;
			p++; continue;
		}
		if ((unsigned char)*p < 0x80) { if (*p != '*' && *p != '`' && *p != '#') raw[i++] = *p; p++; }
		else { unsigned char c = (unsigned char)*p; size_t l = c >= 0xF0 ? 4 : c >= 0xE0 ? 3 : 2; p += l; }
	}
	raw[i] = 0;
	size_t o = 0; char *line = raw;
	while (line && *line && o + 2 < n) {
		char *nl = strchr(line, '\n'); if (nl) *nl = 0;
		while (*line == ' ') line++;
		if (*line && strncmp(line, "<sub>", 5) && strncmp(line, "---", 3) && !strstr(line, "Built from commit")) o += snprintf(dst + o, n - o, "%s\n", line);
		line = nl ? nl + 1 : NULL;
	}
	if (o >= n) dst[n - 1] = 0;
}

// ---------- lectura de la API ----------
// Busca el asset con ese nombre EXACTO dentro de [obj, end) y devuelve su URL, tamano y SHA-256
static bool find_asset(const char *obj, const char *end, const char *name, char *url, size_t un, unsigned *size, char *sha) {
	const char *p = obj, *ae;
	const char *assets = json_find_from(obj, end, "assets"); if (!assets) return false;
	p = assets;
	while ((p = next_obj(p, &ae)) && ae < end) {
		const char *a = p; p = ae + 1;
		char nm[80] = ""; if (!jstr(a, ae, "name", nm, sizeof nm) || strcmp(nm, name)) continue;
		if (!jstr(a, ae, "browser_download_url", url, un)) continue;
		*size = (unsigned)jnum(a, ae, "size"); sha[0] = 0;
		char dg[100] = ""; if (jstr(a, ae, "digest", dg, sizeof dg) && !strncmp(dg, "sha256:", 7) && strlen(dg + 7) == 64) memcpy(sha, dg + 7, 65);
		return true;
	}
	return false;
}
int core_parse_api(const char *json, ParsedRel *out, int max) {
	const char *p = json, *end; int n = 0;
	while (n < max && (p = next_obj(p, &end))) {
		const char *obj = p; p = end + 1;
		if (!json_find_from(obj, end, "tag_name")) continue;            // un objeto interno (autor, asset...), no una release
		if (jbool(obj, end, "draft")) continue;
		ParsedRel *r = &out[n]; memset(r, 0, sizeof *r);
		if (!jstr(obj, end, "tag_name", r->tag, sizeof r->tag)) continue;
		if (!ver_parse(r->tag).ok) { char nm[48] = ""; jstr(obj, end, "name", nm, sizeof nm); if (ver_parse(nm).ok) snprintf(r->tag, sizeof r->tag, "%s", nm); else continue; }
		if (!find_asset(obj, end, "Blocksy.cia", r->cia, sizeof r->cia, &r->cia_size, r->cia_sha) || !find_asset(obj, end, "Blocksy.3dsx", r->dsx, sizeof r->dsx, &r->dsx_size, r->dsx_sha)) continue;   // aun publicandose
		r->pre = jbool(obj, end, "prerelease") || strstr(r->tag, "-dev.");
		char d[40] = ""; if (jstr(obj, end, "published_at", d, sizeof d) && strlen(d) >= 10) { memcpy(r->date, d, 10); r->date[10] = 0; }
		notes_from(obj, end, r->notes, sizeof r->notes);
		n++;
		p = end + 1;
	}
	return n;
}
int core_parse_atom(const char *xml, const char *repo, ParsedRel *out, int max) {
	static const char key[] = "/releases/tag/"; int n = 0;
	for (const char *p = xml; n < max && (p = strstr(p, key)); p += sizeof key - 1) {
		ParsedRel *r = &out[n]; memset(r, 0, sizeof *r);
		size_t i = 0; const char *q = p + sizeof key - 1;
		while (*q && *q != '"' && *q != '<' && *q != '&' && i + 1 < sizeof r->tag) r->tag[i++] = *q++;
		r->tag[i] = 0; if (!i || !ver_parse(r->tag).ok) continue;
		bool dup = false; for (int k = 0; k < n; k++) if (!strcmp(out[k].tag, r->tag)) dup = true; if (dup) continue;
		snprintf(r->cia, sizeof r->cia, "https://github.com/%s/releases/download/%s/Blocksy.cia", repo, r->tag);
		snprintf(r->dsx, sizeof r->dsx, "https://github.com/%s/releases/download/%s/Blocksy.3dsx", repo, r->tag);
		r->pre = strstr(r->tag, "-dev.") != NULL; n++;
	}
	return n;
}

// ---------- eleccion de versiones ----------
static void to_rel(Rel *d, const ParsedRel *r, const Ver *v, Ver cur) {
	memset(d, 0, sizeof *d); d->valid = true; d->is_dev = r->pre;
	snprintf(d->tag, sizeof d->tag, "%s", r->tag); snprintf(d->date, sizeof d->date, "%s", r->date);
	snprintf(d->cia, sizeof d->cia, "%s", r->cia); snprintf(d->dsx, sizeof d->dsx, "%s", r->dsx);
	d->cia_size = r->cia_size; d->dsx_size = r->dsx_size; snprintf(d->cia_sha, sizeof d->cia_sha, "%s", r->cia_sha); snprintf(d->dsx_sha, sizeof d->dsx_sha, "%s", r->dsx_sha);
	snprintf(d->notes, sizeof d->notes, "%s", r->notes);
	d->cmp = ver_cmp(*v, cur); d->newer = d->cmp > 0;
}
void core_select(const ParsedRel *rels, int n, const char *curs, UpdateInfo *out) {
	Ver cur = ver_parse(curs); int bs = -1, bd = -1; Ver vs, vd;
	memset(out, 0, sizeof *out); snprintf(out->cur, sizeof out->cur, "%s", curs ? curs : "");
	for (int i = 0; i < n; i++) {
		Ver v = ver_parse(rels[i].tag); if (!v.ok) continue;
		if (rels[i].pre) { v.is_dev = true; if (bd < 0 || ver_cmp(v, vd) > 0) { bd = i; vd = v; } }
		else { v.is_dev = false; v.dev = 0; if (bs < 0 || ver_cmp(v, vs) > 0) { bs = i; vs = v; } }
	}
	if (bs >= 0) to_rel(&out->stable, &rels[bs], &vs, cur);
	if (bd >= 0) to_rel(&out->dev, &rels[bd], &vd, cur);
	// Que cambia: las versiones nuevas del canal que usas (el de devbuilds si ya usas una devbuild), de la mas reciente a la mas antigua
	bool dev_channel = cur.is_dev; size_t o = 0; int used[64] = {0};
	for (int round = 0; round < 6; round++) {
		int best = -1; Ver bv = {{0}, 0, false, false};
		for (int i = 0; i < n && i < 64; i++) {
			if (used[i]) continue;
			Ver v = ver_parse(rels[i].tag); if (!v.ok) continue;
			if (rels[i].pre) v.is_dev = true; else { v.is_dev = false; v.dev = 0; }
			if (rels[i].pre && !dev_channel) continue;
			if (ver_cmp(v, cur) <= 0) continue;
			if (best < 0 || ver_cmp(v, bv) > 0) { best = i; bv = v; }
		}
		if (best < 0) break;
		used[best] = 1; out->n_newer++;
		char first[100] = ""; const char *nt = rels[best].notes; size_t k = 0; while (*nt == '\n') nt++;
		while (nt[k] && nt[k] != '\n' && k + 1 < sizeof first) { first[k] = nt[k]; k++; } first[k] = 0;
		if (o + 3 < sizeof out->log) o += snprintf(out->log + o, sizeof out->log - o, "%s%s%s\n", rels[best].tag, first[0] ? ": " : "", first);
	}
	if (o >= sizeof out->log) out->log[sizeof out->log - 1] = 0;
}
