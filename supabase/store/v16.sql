-- STORE v16: cosméticos de temporada (limitados). Ejecutar en el SQL Editor de STORE. Es seguro repetirlo.
-- No se pueden comprar (precio imposible y marcados con "reward"): solo los da la recompensa de la temporada en AUTH (season_claim).
-- Para una temporada nueva, copia estas dos filas cambiando el número (season3_trail, season3_title...). Los ids tienen que ser exactamente seasonN_trail y seasonN_title.
insert into public.shop_items (id, kind, name, description, price, rarity, data, sort) values
 ('season1_trail', 'trail', 'Estela de la Temporada 1', 'Limitada: solo en la Temporada 1.', 2000000000, 'epic', '{"color":"#c77dff","reward":true,"season":1}', 90),
 ('season1_title', 'title', 'Pionero T1',               'Limitado: solo en la Temporada 1.', 2000000000, 'epic', '{"text":"Pionero T1","reward":true,"season":1}', 91),
 ('season2_trail', 'trail', 'Estela de la Temporada 2', 'Limitada: solo en la Temporada 2.', 2000000000, 'epic', '{"color":"#4dffb8","reward":true,"season":2}', 92),
 ('season2_title', 'title', 'Veterano T2',              'Limitado: solo en la Temporada 2.', 2000000000, 'epic', '{"text":"Veterano T2","reward":true,"season":2}', 93),
 ('season3_trail', 'trail', 'Estela de la Temporada 3', 'Limitada: solo en la Temporada 3.', 2000000000, 'epic', '{"color":"#ffb347","reward":true,"season":3}', 94),
 ('season3_title', 'title', 'Leyenda T3',               'Limitado: solo en la Temporada 3.', 2000000000, 'epic', '{"text":"Leyenda T3","reward":true,"season":3}', 95)
on conflict (id) do update set name = excluded.name, description = excluded.description, data = excluded.data, sort = excluded.sort;
