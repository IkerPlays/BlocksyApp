-- AUTH: ejecuta esto SOLO cuando la web y la 3DS ya usen el proyecto STORE (compra por presupuesto firmado).
-- Cierra la compra antigua con precios del catálogo local de AUTH, que ya no es la fuente de verdad.
revoke execute on function public.buy_item(text), public.open_crate(text) from authenticated;
