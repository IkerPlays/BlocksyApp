-- STORE: añade el juego "Bosque Oscuro" (bosque de noche con linterna y monstruo). Es seguro repetirlo.
insert into public.games (id, name, description, owner_id, owner_name, hue, mode, max_players, config) values
 ('00000000-0000-0000-0000-000000000004', 'Bosque Oscuro', 'De noche, con una linterna. Recoge los 5 fragmentos de luz con tus amigos y escapa del monstruo.',
  '00000000-0000-0000-0000-000000000000', 'Blocksy', 250, 'arena', 12,
  '{"allow_build":false,"world":"forest","sky":"night","allow_fly":false,"jump":8.2,"speed":5.5,"welcome":"Encuentra los 5 fragmentos de luz. No dejes que el monstruo te atrape.","horror":true}')
on conflict (id) do update set name = excluded.name, description = excluded.description, config = excluded.config, mode = excluded.mode, max_players = excluded.max_players;
