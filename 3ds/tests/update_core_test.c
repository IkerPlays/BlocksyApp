// Prueba del nucleo del actualizador en el ordenador:  gcc -std=gnu11 -Isource tests/update_core_test.c source/update_core.c -o /tmp/uct && /tmp/uct
#include "update.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static const char *API =
"[{\"url\":\"https://api.github.com/repos/IkerPlays/BlocksyApp/releases/9\",\"assets_url\":\"x\",\"tag_name\":\"v1.4.1-dev.20\",\"name\":\"Blocksy 1.4.1-dev.20\",\"draft\":false,\"prerelease\":true,\"published_at\":\"2026-10-24T10:59:25Z\","
"\"author\":{\"login\":\"github-actions[bot]\"},\"assets\":["
"{\"id\":1,\"name\":\"Blocksy.3dsx\",\"size\":1244164,\"digest\":\"sha256:38c67a37a88ee385864a221578ed5c9e5f2562f36734421613d77e5a3a528c1b\",\"uploader\":{\"login\":\"bot\",\"name\":\"nope\"},\"browser_download_url\":\"https://github.com/IkerPlays/BlocksyApp/releases/download/v1.4.1-dev.20/Blocksy.3dsx\"},"
"{\"id\":2,\"name\":\"Blocksy.cia\",\"size\":1030592,\"digest\":\"sha256:366bcba768061002d785610628c55c337ab4a8a13be3e8b9ac9be0a71c59b961\",\"browser_download_url\":\"https://github.com/IkerPlays/BlocksyApp/releases/download/v1.4.1-dev.20/Blocksy.cia\"}],"
"\"body\":\"Devbuild 90: Dodge milestones\\n- Dodge plays a sound **every** 10 seconds.\\n\\n---\\n_Built from commit `7e2e90c`_\"},"
"{\"tag_name\":\"v1.4.1-dev.9\",\"draft\":true,\"prerelease\":true,\"assets\":[]},"
"{\"tag_name\":\"v1.4.1-dev.21\",\"draft\":false,\"prerelease\":true,\"assets\":[{\"name\":\"Blocksy.cia\",\"size\":5,\"browser_download_url\":\"https://x/Blocksy.cia\"}],\"body\":\"sin 3dsx todavia\"},"
"{\"tag_name\":\"v1.4.0\",\"name\":\"Blocksy 1.4.0\",\"draft\":false,\"prerelease\":false,\"published_at\":\"2026-10-24T07:48:45Z\",\"assets\":["
"{\"name\":\"Blocksy.3dsx\",\"size\":1244164,\"browser_download_url\":\"https://github.com/IkerPlays/BlocksyApp/releases/download/v1.4.0/Blocksy.3dsx\"},"
"{\"name\":\"Blocksy.cia\",\"size\":1030592,\"browser_download_url\":\"https://github.com/IkerPlays/BlocksyApp/releases/download/v1.4.0/Blocksy.cia\"}],"
"\"body\":\"# Blocksy 1.4.0\\n\\n## What's new since 1.3.0\\n- Game pages with images\\n- Studio like Roblox \\u2014 docked panels\\n\"},"
"{\"tag_name\":\"v1.3.0\",\"draft\":false,\"prerelease\":false,\"published_at\":\"2026-10-23T21:00:00Z\",\"assets\":["
"{\"name\":\"Blocksy.3dsx\",\"size\":1,\"browser_download_url\":\"https://a/Blocksy.3dsx\"},{\"name\":\"Blocksy.cia\",\"size\":1,\"browser_download_url\":\"https://a/Blocksy.cia\"}],\"body\":\"old\"}]";

int main(void) {
	// SHA-256 (vectores de la norma)
	{ Sha256 s; char h[65];
	  sha256_init(&s); sha256_hex(&s, h); assert(!strcmp(h, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"));
	  sha256_init(&s); sha256_update(&s, "abc", 3); sha256_hex(&s, h); assert(!strcmp(h, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
	  sha256_init(&s); const char *m = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"; sha256_update(&s, m, strlen(m)); sha256_hex(&s, h);
	  assert(!strcmp(h, "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"));
	  sha256_init(&s); for (int i = 0; i < 1000; i++) sha256_update(&s, "aaaaaaaaaa", 10); for (int i = 0; i < 9000; i++) sha256_update(&s, "aaaaaaaaaa", 10); // 100000 'a' en trozos
	  sha256_hex(&s, h); assert(!strcmp(h, "6d1cf22d7cc09b085dfc25ee1a1f3ae0265804c607bc2074ad253bcc82fd81ee"));
	  assert(hex_eq("BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")); assert(!hex_eq("", "x")); }
	// versiones
	assert(ver_cmp(ver_parse("v1.4.0"), ver_parse("1.4.0-dev.5")) > 0);
	assert(ver_cmp(ver_parse("1.4.1-dev.20"), ver_parse("1.4.1-dev.9")) > 0);
	assert(ver_cmp(ver_parse("1.4.1-dev.1"), ver_parse("1.4.0")) > 0);
	assert(ver_cmp(ver_parse("1.10.0"), ver_parse("1.9.9")) > 0);
	assert(!ver_parse("dev").ok && !ver_parse("").ok && ver_parse("v2.0.0").ok);
	// API
	static ParsedRel rels[16]; int n = core_parse_api(API, rels, 16);
	assert(n == 3);                                                  // borrador y release sin .3dsx descartados
	assert(!strcmp(rels[0].tag, "v1.4.1-dev.20") && rels[0].pre && rels[0].dsx_size == 1244164 && rels[0].cia_size == 1030592);
	assert(!strcmp(rels[0].dsx_sha, "38c67a37a88ee385864a221578ed5c9e5f2562f36734421613d77e5a3a528c1b") && !strcmp(rels[0].date, "2026-10-24"));
	assert(strstr(rels[0].dsx, "/v1.4.1-dev.20/Blocksy.3dsx") && strstr(rels[0].cia, "Blocksy.cia"));
	assert(!strstr(rels[0].notes, "**") && !strstr(rels[0].notes, "`") && !strstr(rels[0].notes, "Built from") && strstr(rels[0].notes, "Dodge milestones"));
	assert(!strcmp(rels[1].tag, "v1.4.0") && !rels[1].pre && rels[1].cia_sha[0] == 0 && strstr(rels[1].notes, "Studio like Roblox - docked"));
	UpdateInfo u;
	core_select(rels, n, "1.3.0", &u);                               // instalada: una estable antigua
	assert(u.stable.valid && !strcmp(u.stable.tag, "v1.4.0") && u.stable.newer && u.stable.cmp == 1);
	assert(u.dev.valid && !strcmp(u.dev.tag, "v1.4.1-dev.20") && u.dev.newer);
	assert(u.n_newer == 3 - 1 || u.n_newer >= 1);
	assert(strstr(u.log, "v1.4.0") && !strstr(u.log, "dev.20"));     // quien usa estables no ve devbuilds en "que cambia"
	core_select(rels, n, "1.4.0", &u);
	assert(!u.stable.newer && u.stable.cmp == 0 && u.dev.newer && u.n_newer == 0);
	core_select(rels, n, "1.4.1-dev.9", &u);                         // usa devbuilds: ve las nuevas y la estable 1.4.0 es anterior
	assert(u.stable.cmp < 0 && u.dev.newer && u.n_newer == 1 && strstr(u.log, "dev.20"));
	core_select(rels, n, "1.4.1-dev.20", &u); assert(u.dev.cmp == 0 && !u.dev.newer && u.n_newer == 0);
	// Atom
	const char *atom = "<feed><entry><link rel=\"alternate\" href=\"https://github.com/IkerPlays/BlocksyApp/releases/tag/v1.4.0\"/></entry><entry><link href=\"https://github.com/IkerPlays/BlocksyApp/releases/tag/v1.4.1-dev.20\"/></entry><entry><link href=\"https://github.com/IkerPlays/BlocksyApp/releases/tag/v1.4.0\"/></entry></feed>";
	static ParsedRel at[8]; int na = core_parse_atom(atom, "IkerPlays/BlocksyApp", at, 8); assert(na == 2 && at[1].pre && strstr(at[0].cia, "/download/v1.4.0/Blocksy.cia"));
	puts("update_core: todo bien"); return 0;
}
