-- STORE v12: accesorios nuevos (sombreros, gafas, espalda, estelas y mascotas). Seguro de repetir.
-- Los modelos estan en web/src/avatar.js (addHat, addFace, addBack, buildPet, trailColor): un objeto nuevo necesita su modelo alli.
insert into public.shop_items (id, kind, name, description, price, rarity, data, sort) values
 ('hat_wizard',  'hat',   'Sombrero de mago',  'Magia en cada bloque.',           250, 'rare',   '{"color":"#6c3fb5"}', 16),
 ('hat_cowboy',  'hat',   'Sombrero vaquero',  'Yihaa.',                          180, 'common', '{"color":"#a0522d"}', 17),
 ('hat_chef',    'hat',   'Gorro de cocinero', 'Hoy se cocina.',                  150, 'common', '{"color":"#f5f5f5"}', 18),
 ('hat_beanie',  'hat',   'Gorro de lana',     'Para el frío.',                   120, 'common', '{"color":"#e67e22"}', 19),
 ('hat_helmet',  'hat',   'Casco',             'Seguridad primero.',              200, 'common', '{"color":"#7f8c8d"}', 20),
 ('hat_flower',  'hat',   'Flor',              'Un toque de primavera.',          140, 'common', '{"color":"#ff7eb6"}', 21),
 ('face_shades', 'face',  'Gafas de sol',      'Siempre con estilo.',             160, 'common', '{"color":"#1b1b1b"}', 22),
 ('face_round',  'face',  'Gafas redondas',    'Aire intelectual.',               140, 'common', '{"color":"#f5c542"}', 23),
 ('face_visor',  'face',  'Visor',             'Del futuro.',                     260, 'rare',   '{"color":"#4dd0ff"}', 24),
 ('face_mask',   'face',  'Mascarilla',        'Cubre media cara.',               120, 'common', '{"color":"#ffffff"}', 25),
 ('back_cape',   'back',  'Capa',              'Para los héroes.',                300, 'rare',   '{"color":"#c0392b"}', 26),
 ('back_wings',  'back',  'Alas',              'Casi puedes volar.',              450, 'epic',   '{"color":"#ecf0f1"}', 27),
 ('back_backpack','back', 'Mochila',           'Todo a mano.',                    180, 'common', '{"color":"#2d6a4f"}', 28),
 ('trail_spark', 'trail', 'Estela de chispas', 'Dejas chispas al caminar.',       220, 'common', '{"color":"#ffe066"}', 33),
 ('trail_fire',  'trail', 'Estela de fuego',   'Pasos en llamas.',                320, 'rare',   '{"color":"#ff6b2b"}', 34),
 ('trail_rainbow','trail','Estela arcoíris',   'Todos los colores.',              500, 'epic',   '{"color":"rainbow"}', 35),
 ('trail_bubbles','trail','Estela de burbujas','Burbujas por todas partes.',      240, 'common', '{"color":"#7ed6ff"}', 36),
 ('pet_cube',    'pet',   'Cubito',            'Un cubo que te sigue.',           350, 'rare',   '{"color":"#4d8dff"}', 37),
 ('pet_slime',   'pet',   'Slime',             'Blandito y simpático.',           380, 'rare',   '{"color":"#4cd964"}', 38),
 ('pet_bot',     'pet',   'Robotito',          'Beep boop.',                      420, 'rare',   '{"color":"#aab4c0"}', 39),
 ('pet_ghost',   'pet',   'Fantasmita',        'Nada de miedo.',                  600, 'epic',   '{"color":"#f0f0ff"}', 40)
on conflict (id) do update set name = excluded.name, description = excluded.description, price = excluded.price, rarity = excluded.rarity, data = excluded.data, sort = excluded.sort;
update public.shop_items set data = jsonb_set(jsonb_set(data, '{pool}', '["hat_cap","hat_antenna","hat_party","hat_halo","hat_top","hat_crown","title_builder","title_runner","title_legend","hat_wizard","hat_cowboy","hat_chef","hat_beanie","hat_helmet","hat_flower","face_shades","face_round","face_visor","face_mask","back_cape","back_wings","back_backpack","trail_spark","trail_fire","trail_rainbow","trail_bubbles","pet_cube","pet_slime","pet_bot","pet_ghost"]'::jsonb),
  '{weights}', '[20,18,16,10,8,3,12,10,3,8,10,10,10,10,10,9,9,5,10,6,3,10,9,6,2,8,5,5,4,2]'::jsonb) where id = 'crate_basic';
