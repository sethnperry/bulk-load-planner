-- Seed products.api_min / api_max with conservative published API-gravity
-- ranges, keyed exactly by product_id (from the live catalog exported
-- 2026-09-07). Run in the Supabase SQL editor.
--
-- api_min = heaviest (densest, lowest API) -- this is what the LOAD "Safest"
-- stale-API choice and the never-loaded-here default assume, so it gates
-- safe load weight. api_max = lightest (highest API).
--
-- SAFETY INVARIANT applied to every row: api_min <= api_60 <= api_max.
-- That means this can only ever make a plan equal or HEAVIER than today's
-- api_60 reference, never lighter -- it cannot introduce an over-weight risk
-- relative to current behavior. Values are typical industry ranges; VERIFY
-- the products you actually haul (ULSD, dyed, diesel #1, the gasolines, the
-- B-blends) against your own published tables and tighten as needed.

update public.products p
set api_min = v.lo, api_max = v.hi
from (values
  ('3faba47c-59f7-4be4-803e-45e4d9cdcf51'::uuid, 58.0, 62.0),  -- Additive Package
  ('3fb1333e-d437-4202-84c7-23043455de79'::uuid, 62.0, 70.0),  -- Alkylate
  ('766efc4e-4c78-4bca-992d-526b0f18db3f'::uuid, 56.0, 68.0),  -- Aviation Gasoline 100LL
  ('989871ef-304b-435f-b852-b98ebd73447c'::uuid, 28.0, 31.0),  -- Biodiesel (B100)
  ('370f7f64-0f3d-49f0-a6e1-edfd297dc106'::uuid, 33.0, 39.0),  -- Biodiesel Blend B10
  ('948847cf-9d18-4327-b0d2-943a9c13ffac'::uuid, 32.0, 38.0),  -- Biodiesel Blend B20
  ('7fb28e81-f9d4-4355-9a97-36d6a7015ebf'::uuid, 33.0, 39.0),  -- Biodiesel Blend B5
  ('291be3a7-e685-4214-a05f-062648c4ba92'::uuid, 56.0, 65.0),  -- CBOB Blendstock
  ('759cd53f-3d0b-4eca-b532-8d7480a6127f'::uuid, 38.0, 44.0),  -- Diesel #1 / Winter Diesel
  ('fd89cec5-a402-4cca-960b-497652443257'::uuid, 46.0, 50.0),  -- Ethanol (Denatured)
  ('f383fd23-95e0-451e-b7e4-40be2ddfbe3f'::uuid, 48.0, 56.0),  -- Flex Fuel E85
  ('256c8956-23d0-4585-bedd-ebb64eea796e'::uuid, 33.0, 40.0),  -- Heating Oil (Light)
  ('861980bb-1619-425c-b5a7-ed6a2024d4cd'::uuid, 58.0, 68.0),  -- Isomerate
  ('b4b638b3-9642-4d59-9897-4318d5bdb491'::uuid, 38.0, 45.0),  -- Jet Fuel (Jet A-1)
  ('8cc7ab54-5d59-43de-822a-6db045be167d'::uuid, 38.0, 45.0),  -- Jet Fuel (Jet A)
  ('5dd18f78-f65b-4ae7-8273-d38b25b4422e'::uuid, 38.0, 45.0),  -- Jet Fuel (JP-8)
  ('902e8d76-bcfc-4572-ab31-a871e76eafc9'::uuid, 38.0, 46.0),  -- Kerosene
  ('9ece0cc4-601e-44e5-9e08-529762b6064e'::uuid, 33.0, 39.0),  -- Marine Gas Oil (MGO)
  ('6d4154a4-b9ec-40b3-b914-ac6e48c33233'::uuid, 55.0, 64.0),  -- Midgrade Unleaded E10 89
  ('6f0608b7-ec21-46d6-9331-0489b698b6d0'::uuid, 55.0, 72.0),  -- Naphtha
  ('82d31b2f-1f75-4202-9b35-e5a97f0e45c5'::uuid, 60.0, 75.0),  -- Natural Gasoline
  ('c578d6be-cbb7-4d3d-b25a-9773d75e7e49'::uuid, 58.0, 62.0),  -- Normal Butane
  ('9229c0e9-566a-43ff-905d-e52dca897364'::uuid, 33.0, 39.0),  -- Off-road Dyed Diesel
  ('db808c07-a102-48fc-bd74-d25b4d44620b'::uuid, 54.0, 66.0),  -- Premium Unleaded E10 91
  ('bfe280e2-e6f5-4bcd-9ebe-ac0b64b4a016'::uuid, 54.0, 67.0),  -- Premium Unleaded E10 93
  ('b15ae8d6-b4ae-4ca2-8181-e5431d5365ad'::uuid, 56.0, 65.0),  -- RBOB Blendstock
  ('b9db9389-02b3-4ae4-8d62-b29a4d3c12ab'::uuid, 56.0, 65.0),  -- Recreation Fuel E0 90
  ('e52025b7-ecfb-4a66-be32-73275bb47e72'::uuid, 45.0, 55.0),  -- Reformate
  ('2f82cebd-f0db-4aaa-b674-7b85a2bd6aa0'::uuid, 55.0, 64.0),  -- Regular Unleaded E10 87
  ('45318677-881a-4d05-a321-4e1f2869175f'::uuid, 33.0, 40.0),  -- Renewable Diesel (HVO)
  ('e29607f2-2c7f-4c1e-b010-42a61d587c1e'::uuid, 50.0, 70.0),  -- Slops
  ('085b3b66-b2d7-4237-8382-62964249217b'::uuid, 45.0, 70.0),  -- Transmix
  ('60139547-2f9f-47ad-8adc-f5e157f9e592'::uuid, 33.0, 39.0),  -- ULSD Diesel #2
  ('e85ecd81-8bad-47c4-8789-67bb87ae13b4'::uuid, 56.0, 65.0),  -- Unleaded E0 87
  ('65de7115-4a7b-4dc6-bf56-6b8756979ee0'::uuid, 54.0, 64.0),  -- Unleaded E15 ~88
  ('36b0ce43-6586-48bc-9ebd-37ddf5a72729'::uuid, 53.0, 63.0),  -- Unleaded E30
  ('b6469232-a20f-40a6-bfb8-a3679d1c0b18'::uuid, 52.0, 62.0)   -- Unleaded E50
) as v(id, lo, hi)
where p.product_id = v.id;

-- Review, and confirm the invariant held (this SELECT should return 0 rows):
select product_name, api_60, api_min, api_max
from public.products
where api_min > api_60 or api_max < api_60 or api_min > api_max
order by product_name;

-- Full readout:
select product_name, product_code, api_60, api_min, api_max
from public.products
order by product_name;
