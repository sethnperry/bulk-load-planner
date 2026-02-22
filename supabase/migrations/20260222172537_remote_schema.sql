create extension if not exists "hypopg" with schema "extensions";

create extension if not exists "index_advisor" with schema "extensions";

drop extension if exists "pg_net";

create sequence "public"."decouple_events_id_seq";

create sequence "public"."fuel_temp_cache_id_seq";


  create table "public"."cities" (
    "city_id" uuid not null default gen_random_uuid(),
    "state_code" text not null,
    "city_name" text not null,
    "active" boolean not null default true
      );


alter table "public"."cities" enable row level security;


  create table "public"."companies" (
    "company_id" uuid not null default gen_random_uuid(),
    "company_name" text not null,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."decouple_events" (
    "id" bigint not null default nextval('public.decouple_events_id_seq'::regclass),
    "combo_id" text not null,
    "truck_id" text not null,
    "trailer_id" text not null,
    "user_id" uuid not null,
    "scenario" text not null,
    "truck_status" text not null,
    "truck_location" text,
    "truck_lat" double precision,
    "truck_lon" double precision,
    "truck_notes" text,
    "trailer_status" text not null,
    "trailer_location" text,
    "trailer_lat" double precision,
    "trailer_lon" double precision,
    "trailer_notes" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."decouple_events" enable row level security;


  create table "public"."equipment_combos" (
    "combo_id" uuid not null default gen_random_uuid(),
    "combo_name" text not null,
    "truck_id" uuid not null,
    "trailer_id" uuid not null,
    "tare_lbs" numeric(12,2) not null default 0,
    "target_weight" numeric(12,2),
    "active" boolean not null default true,
    "claimed_by" uuid,
    "claimed_at" timestamp with time zone,
    "company_id" uuid
      );


alter table "public"."equipment_combos" enable row level security;


  create table "public"."fuel_temp_cache" (
    "id" bigint not null default nextval('public.fuel_temp_cache_id_seq'::regclass),
    "city_key" text not null,
    "lat" double precision not null,
    "lon" double precision not null,
    "hourly" jsonb not null,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."fuel_temp_cache" enable row level security;


  create table "public"."load_lines" (
    "load_id" uuid not null,
    "comp_number" integer not null,
    "product_id" uuid,
    "planned_gallons" numeric(12,2),
    "planned_lbs" numeric(12,2),
    "actual_gallons" numeric(12,2),
    "actual_lbs" numeric(12,2),
    "temp_f" numeric(6,2),
    "load_line_id" uuid default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "actual_temp_f" numeric,
    "actual_api" numeric(6,2)
      );


alter table "public"."load_lines" enable row level security;


  create table "public"."load_log" (
    "load_id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "state_code" text,
    "city_id" uuid,
    "terminal_id" uuid,
    "combo_id" uuid,
    "ambient_temp_f" numeric(6,2),
    "cg_bias" numeric(10,3) default 0,
    "status" text not null default 'planned'::text,
    "started_at" timestamp with time zone default now(),
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone not null default now(),
    "planned_snapshot" jsonb,
    "product_temp_f" numeric,
    "tare_lbs" numeric,
    "gross_limit_lbs" numeric,
    "buffer_lbs" numeric,
    "planned_total_gal" numeric,
    "planned_total_lbs" numeric,
    "planned_gross_lbs" numeric,
    "actual_total_gal" numeric,
    "actual_total_lbs" numeric,
    "diff_lbs" numeric,
    "loaded_at" timestamp with time zone
      );


alter table "public"."load_log" enable row level security;


  create table "public"."my_terminals" (
    "user_id" uuid not null,
    "terminal_id" uuid not null,
    "is_starred" boolean not null default false,
    "added_on" date not null default CURRENT_DATE,
    "recorded_on" timestamp with time zone not null default now()
      );


alter table "public"."my_terminals" enable row level security;


  create table "public"."products" (
    "product_id" uuid not null default gen_random_uuid(),
    "product_name" text not null,
    "api_60" numeric(6,3) not null,
    "alpha_per_f" numeric(10,8) not null,
    "active" boolean not null default true,
    "button_code" text,
    "product_code" text,
    "hex_code" text,
    "display_name" text,
    "description" text,
    "un_number" text
      );


alter table "public"."products" enable row level security;


  create table "public"."profiles" (
    "user_id" uuid not null,
    "display_name" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."profiles" enable row level security;


  create table "public"."seed_products" (
    "product_code" text not null,
    "product_name" text not null,
    "button_code" text,
    "hex_code" text,
    "display_name" text,
    "description" text,
    "api_60" numeric,
    "alpha_per_f" numeric,
    "un_number" text,
    "active" boolean not null default true
      );


alter table "public"."seed_products" enable row level security;


  create table "public"."states" (
    "state_code" text not null,
    "state_name" text not null,
    "active" boolean not null default true
      );


alter table "public"."states" enable row level security;


  create table "public"."terminal_access" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "terminal_id" uuid not null,
    "carded_on" date not null,
    "recorded_on" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."terminal_access" enable row level security;


  create table "public"."terminal_products" (
    "terminal_id" uuid not null,
    "product_id" uuid not null,
    "active" boolean not null default true,
    "is_out_of_stock" boolean default false,
    "last_api_60" numeric,
    "last_temp_f" numeric,
    "last_alpha_per_f" numeric,
    "last_updated_by_load_id" uuid,
    "last_updated_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "last_api" numeric,
    "last_api_updated_at" timestamp with time zone,
    "last_loaded_at" timestamp with time zone
      );


alter table "public"."terminal_products" enable row level security;


  create table "public"."terminals" (
    "terminal_id" uuid not null default gen_random_uuid(),
    "city_id" uuid not null,
    "terminal_name" text not null,
    "timezone" text,
    "active" boolean not null default true,
    "state" text,
    "city" text,
    "renewal_days" integer not null default 90,
    "lat" double precision,
    "lon" double precision
      );


alter table "public"."terminals" enable row level security;


  create table "public"."trailer_compartments" (
    "trailer_id" uuid not null,
    "comp_number" integer not null,
    "max_gallons" numeric(10,2) not null,
    "position" numeric(6,3) not null default 0,
    "active" boolean not null default true
      );


alter table "public"."trailer_compartments" enable row level security;


  create table "public"."trailers" (
    "trailer_id" uuid not null default gen_random_uuid(),
    "trailer_name" text not null,
    "cg_max" numeric(10,3) not null default 1.0,
    "active" boolean not null default true,
    "company_id" uuid,
    "region" text,
    "status_code" text default 'AVAIL'::text,
    "status_location" text,
    "status_lat" double precision,
    "status_lon" double precision,
    "status_notes" text,
    "status_updated_at" timestamp with time zone
      );


alter table "public"."trailers" enable row level security;


  create table "public"."trucks" (
    "truck_id" uuid not null default gen_random_uuid(),
    "truck_name" text not null,
    "active" boolean not null default true,
    "company_id" uuid,
    "region" text,
    "status_code" text default 'AVAIL'::text,
    "status_location" text,
    "status_lat" double precision,
    "status_lon" double precision,
    "status_notes" text,
    "status_updated_at" timestamp with time zone
      );


alter table "public"."trucks" enable row level security;


  create table "public"."user_companies" (
    "user_id" uuid not null,
    "company_id" uuid not null,
    "role" text default 'driver'::text,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."user_plan_slots" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "terminal_id" text not null,
    "combo_id" text not null,
    "slot" smallint not null,
    "payload" jsonb not null default '{}'::jsonb,
    "updated_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."user_plan_slots" enable row level security;


  create table "public"."user_primary_trailers" (
    "user_id" uuid not null,
    "trailer_id" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."user_primary_trailers" enable row level security;


  create table "public"."user_primary_trucks" (
    "user_id" uuid not null,
    "truck_id" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."user_primary_trucks" enable row level security;

alter sequence "public"."decouple_events_id_seq" owned by "public"."decouple_events"."id";

alter sequence "public"."fuel_temp_cache_id_seq" owned by "public"."fuel_temp_cache"."id";

CREATE UNIQUE INDEX cities_pkey ON public.cities USING btree (city_id);

CREATE UNIQUE INDEX cities_state_code_city_name_key ON public.cities USING btree (state_code, city_name);

CREATE UNIQUE INDEX companies_pkey ON public.companies USING btree (company_id);

CREATE INDEX decouple_events_combo_id_idx ON public.decouple_events USING btree (combo_id);

CREATE UNIQUE INDEX decouple_events_pkey ON public.decouple_events USING btree (id);

CREATE INDEX decouple_events_trailer_id_idx ON public.decouple_events USING btree (trailer_id);

CREATE INDEX decouple_events_truck_id_idx ON public.decouple_events USING btree (truck_id);

CREATE INDEX decouple_events_user_id_idx ON public.decouple_events USING btree (user_id);

CREATE UNIQUE INDEX equipment_combos_combo_name_key ON public.equipment_combos USING btree (combo_name);

CREATE UNIQUE INDEX equipment_combos_pkey ON public.equipment_combos USING btree (combo_id);

CREATE UNIQUE INDEX equipment_combos_truck_trailer_uniq ON public.equipment_combos USING btree (truck_id, trailer_id);

CREATE UNIQUE INDEX fuel_temp_cache_city_key_unique ON public.fuel_temp_cache USING btree (city_key);

CREATE UNIQUE INDEX fuel_temp_cache_pkey ON public.fuel_temp_cache USING btree (id);

CREATE INDEX fuel_temp_cache_updated_at_idx ON public.fuel_temp_cache USING btree (updated_at);

CREATE INDEX idx_load_lines_load ON public.load_lines USING btree (load_id);

CREATE INDEX idx_load_lines_load_comp ON public.load_lines USING btree (load_id, comp_number);

CREATE INDEX idx_load_lines_load_id ON public.load_lines USING btree (load_id);

CREATE INDEX idx_load_lines_product ON public.load_lines USING btree (product_id);

CREATE INDEX idx_load_log_status_started ON public.load_log USING btree (status, started_at DESC);

CREATE INDEX idx_load_log_terminal_started ON public.load_log USING btree (terminal_id, started_at DESC);

CREATE INDEX idx_load_log_user_created ON public.load_log USING btree (user_id, created_at DESC);

CREATE INDEX idx_terminal_products_product ON public.terminal_products USING btree (product_id);

CREATE INDEX idx_terminal_products_terminal ON public.terminal_products USING btree (terminal_id);

CREATE INDEX idx_terminal_products_terminal_active ON public.terminal_products USING btree (terminal_id, active);

CREATE UNIQUE INDEX load_lines_load_comp_uniq ON public.load_lines USING btree (load_id, comp_number);

CREATE UNIQUE INDEX load_lines_pkey ON public.load_lines USING btree (load_id, comp_number);

CREATE UNIQUE INDEX load_log_pkey ON public.load_log USING btree (load_id);

CREATE INDEX load_log_user_created_idx ON public.load_log USING btree (user_id, created_at DESC);

CREATE UNIQUE INDEX my_terminals_pkey ON public.my_terminals USING btree (user_id, terminal_id);

CREATE UNIQUE INDEX products_pkey ON public.products USING btree (product_id);

CREATE UNIQUE INDEX products_product_code_uniq ON public.products USING btree (product_code);

CREATE UNIQUE INDEX products_product_code_ux ON public.products USING btree (product_code) WHERE (product_code IS NOT NULL);

CREATE UNIQUE INDEX products_product_name_key ON public.products USING btree (product_name);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (user_id);

CREATE UNIQUE INDEX seed_products_pkey ON public.seed_products USING btree (product_code);

CREATE UNIQUE INDEX states_pkey ON public.states USING btree (state_code);

CREATE UNIQUE INDEX terminal_access_pkey ON public.terminal_access USING btree (id);

CREATE INDEX terminal_access_terminal_id_idx ON public.terminal_access USING btree (terminal_id);

CREATE INDEX terminal_access_user_id_idx ON public.terminal_access USING btree (user_id);

CREATE UNIQUE INDEX terminal_access_user_id_terminal_id_key ON public.terminal_access USING btree (user_id, terminal_id);

CREATE UNIQUE INDEX terminal_access_user_terminal_uniq ON public.terminal_access USING btree (user_id, terminal_id);

CREATE UNIQUE INDEX terminal_access_user_terminal_unique ON public.terminal_access USING btree (user_id, terminal_id);

CREATE UNIQUE INDEX terminal_products_pkey ON public.terminal_products USING btree (terminal_id, product_id);

CREATE UNIQUE INDEX terminal_products_terminal_product_uniq ON public.terminal_products USING btree (terminal_id, product_id);

CREATE UNIQUE INDEX terminals_city_id_terminal_name_key ON public.terminals USING btree (city_id, terminal_name);

CREATE UNIQUE INDEX terminals_pkey ON public.terminals USING btree (terminal_id);

CREATE UNIQUE INDEX trailer_compartments_pkey ON public.trailer_compartments USING btree (trailer_id, comp_number);

CREATE UNIQUE INDEX trailers_pkey ON public.trailers USING btree (trailer_id);

CREATE UNIQUE INDEX trailers_trailer_name_key ON public.trailers USING btree (trailer_name);

CREATE UNIQUE INDEX trucks_pkey ON public.trucks USING btree (truck_id);

CREATE UNIQUE INDEX trucks_truck_name_key ON public.trucks USING btree (truck_name);

CREATE UNIQUE INDEX user_companies_pkey ON public.user_companies USING btree (user_id, company_id);

CREATE UNIQUE INDEX user_plan_slots_pkey ON public.user_plan_slots USING btree (id);

CREATE UNIQUE INDEX user_plan_slots_unique ON public.user_plan_slots USING btree (user_id, terminal_id, combo_id, slot);

CREATE UNIQUE INDEX user_primary_trailers_pkey ON public.user_primary_trailers USING btree (user_id, trailer_id);

CREATE UNIQUE INDEX user_primary_trucks_pkey ON public.user_primary_trucks USING btree (user_id, truck_id);

alter table "public"."cities" add constraint "cities_pkey" PRIMARY KEY using index "cities_pkey";

alter table "public"."companies" add constraint "companies_pkey" PRIMARY KEY using index "companies_pkey";

alter table "public"."decouple_events" add constraint "decouple_events_pkey" PRIMARY KEY using index "decouple_events_pkey";

alter table "public"."equipment_combos" add constraint "equipment_combos_pkey" PRIMARY KEY using index "equipment_combos_pkey";

alter table "public"."fuel_temp_cache" add constraint "fuel_temp_cache_pkey" PRIMARY KEY using index "fuel_temp_cache_pkey";

alter table "public"."load_lines" add constraint "load_lines_pkey" PRIMARY KEY using index "load_lines_pkey";

alter table "public"."load_log" add constraint "load_log_pkey" PRIMARY KEY using index "load_log_pkey";

alter table "public"."my_terminals" add constraint "my_terminals_pkey" PRIMARY KEY using index "my_terminals_pkey";

alter table "public"."products" add constraint "products_pkey" PRIMARY KEY using index "products_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."seed_products" add constraint "seed_products_pkey" PRIMARY KEY using index "seed_products_pkey";

alter table "public"."states" add constraint "states_pkey" PRIMARY KEY using index "states_pkey";

alter table "public"."terminal_access" add constraint "terminal_access_pkey" PRIMARY KEY using index "terminal_access_pkey";

alter table "public"."terminal_products" add constraint "terminal_products_pkey" PRIMARY KEY using index "terminal_products_pkey";

alter table "public"."terminals" add constraint "terminals_pkey" PRIMARY KEY using index "terminals_pkey";

alter table "public"."trailer_compartments" add constraint "trailer_compartments_pkey" PRIMARY KEY using index "trailer_compartments_pkey";

alter table "public"."trailers" add constraint "trailers_pkey" PRIMARY KEY using index "trailers_pkey";

alter table "public"."trucks" add constraint "trucks_pkey" PRIMARY KEY using index "trucks_pkey";

alter table "public"."user_companies" add constraint "user_companies_pkey" PRIMARY KEY using index "user_companies_pkey";

alter table "public"."user_plan_slots" add constraint "user_plan_slots_pkey" PRIMARY KEY using index "user_plan_slots_pkey";

alter table "public"."user_primary_trailers" add constraint "user_primary_trailers_pkey" PRIMARY KEY using index "user_primary_trailers_pkey";

alter table "public"."user_primary_trucks" add constraint "user_primary_trucks_pkey" PRIMARY KEY using index "user_primary_trucks_pkey";

alter table "public"."cities" add constraint "cities_state_code_city_name_key" UNIQUE using index "cities_state_code_city_name_key";

alter table "public"."cities" add constraint "cities_state_code_fkey" FOREIGN KEY (state_code) REFERENCES public.states(state_code) not valid;

alter table "public"."cities" validate constraint "cities_state_code_fkey";

alter table "public"."equipment_combos" add constraint "equipment_combos_combo_name_key" UNIQUE using index "equipment_combos_combo_name_key";

alter table "public"."equipment_combos" add constraint "equipment_combos_trailer_id_fkey" FOREIGN KEY (trailer_id) REFERENCES public.trailers(trailer_id) not valid;

alter table "public"."equipment_combos" validate constraint "equipment_combos_trailer_id_fkey";

alter table "public"."equipment_combos" add constraint "equipment_combos_truck_id_fkey" FOREIGN KEY (truck_id) REFERENCES public.trucks(truck_id) not valid;

alter table "public"."equipment_combos" validate constraint "equipment_combos_truck_id_fkey";

alter table "public"."equipment_combos" add constraint "equipment_combos_truck_trailer_uniq" UNIQUE using index "equipment_combos_truck_trailer_uniq";

alter table "public"."load_lines" add constraint "load_lines_actual_nonneg_chk" CHECK (((actual_gallons IS NULL) OR (actual_gallons >= (0)::numeric))) not valid;

alter table "public"."load_lines" validate constraint "load_lines_actual_nonneg_chk";

alter table "public"."load_lines" add constraint "load_lines_comp_chk" CHECK ((comp_number > 0)) not valid;

alter table "public"."load_lines" validate constraint "load_lines_comp_chk";

alter table "public"."load_lines" add constraint "load_lines_load_comp_uniq" UNIQUE using index "load_lines_load_comp_uniq";

alter table "public"."load_lines" add constraint "load_lines_load_id_fkey" FOREIGN KEY (load_id) REFERENCES public.load_log(load_id) ON DELETE CASCADE not valid;

alter table "public"."load_lines" validate constraint "load_lines_load_id_fkey";

alter table "public"."load_lines" add constraint "load_lines_planned_nonneg_chk" CHECK (((planned_gallons IS NULL) OR (planned_gallons >= (0)::numeric))) not valid;

alter table "public"."load_lines" validate constraint "load_lines_planned_nonneg_chk";

alter table "public"."load_lines" add constraint "load_lines_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(product_id) not valid;

alter table "public"."load_lines" validate constraint "load_lines_product_id_fkey";

alter table "public"."load_log" add constraint "load_log_city_id_fkey" FOREIGN KEY (city_id) REFERENCES public.cities(city_id) not valid;

alter table "public"."load_log" validate constraint "load_log_city_id_fkey";

alter table "public"."load_log" add constraint "load_log_combo_id_fkey" FOREIGN KEY (combo_id) REFERENCES public.equipment_combos(combo_id) not valid;

alter table "public"."load_log" validate constraint "load_log_combo_id_fkey";

alter table "public"."load_log" add constraint "load_log_state_code_fkey" FOREIGN KEY (state_code) REFERENCES public.states(state_code) not valid;

alter table "public"."load_log" validate constraint "load_log_state_code_fkey";

alter table "public"."load_log" add constraint "load_log_status_chk" CHECK ((status = ANY (ARRAY['planned'::text, 'loaded'::text, 'voided'::text]))) not valid;

alter table "public"."load_log" validate constraint "load_log_status_chk";

alter table "public"."load_log" add constraint "load_log_terminal_id_fkey" FOREIGN KEY (terminal_id) REFERENCES public.terminals(terminal_id) not valid;

alter table "public"."load_log" validate constraint "load_log_terminal_id_fkey";

alter table "public"."load_log" add constraint "load_log_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."load_log" validate constraint "load_log_user_id_fkey";

alter table "public"."my_terminals" add constraint "my_terminals_terminal_id_fkey" FOREIGN KEY (terminal_id) REFERENCES public.terminals(terminal_id) ON DELETE CASCADE not valid;

alter table "public"."my_terminals" validate constraint "my_terminals_terminal_id_fkey";

alter table "public"."my_terminals" add constraint "my_terminals_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."my_terminals" validate constraint "my_terminals_user_id_fkey";

alter table "public"."products" add constraint "products_product_code_uniq" UNIQUE using index "products_product_code_uniq";

alter table "public"."products" add constraint "products_product_name_key" UNIQUE using index "products_product_name_key";

alter table "public"."profiles" add constraint "profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_user_id_fkey";

alter table "public"."terminal_access" add constraint "terminal_access_terminal_id_fkey" FOREIGN KEY (terminal_id) REFERENCES public.terminals(terminal_id) ON DELETE CASCADE not valid;

alter table "public"."terminal_access" validate constraint "terminal_access_terminal_id_fkey";

alter table "public"."terminal_access" add constraint "terminal_access_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."terminal_access" validate constraint "terminal_access_user_id_fkey";

alter table "public"."terminal_access" add constraint "terminal_access_user_id_terminal_id_key" UNIQUE using index "terminal_access_user_id_terminal_id_key";

alter table "public"."terminal_access" add constraint "terminal_access_user_terminal_uniq" UNIQUE using index "terminal_access_user_terminal_uniq";

alter table "public"."terminal_access" add constraint "terminal_access_user_terminal_unique" UNIQUE using index "terminal_access_user_terminal_unique";

alter table "public"."terminal_products" add constraint "terminal_products_last_updated_by_load_id_fkey" FOREIGN KEY (last_updated_by_load_id) REFERENCES public.load_log(load_id) ON DELETE SET NULL not valid;

alter table "public"."terminal_products" validate constraint "terminal_products_last_updated_by_load_id_fkey";

alter table "public"."terminal_products" add constraint "terminal_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(product_id) not valid;

alter table "public"."terminal_products" validate constraint "terminal_products_product_id_fkey";

alter table "public"."terminal_products" add constraint "terminal_products_terminal_id_fkey" FOREIGN KEY (terminal_id) REFERENCES public.terminals(terminal_id) not valid;

alter table "public"."terminal_products" validate constraint "terminal_products_terminal_id_fkey";

alter table "public"."terminal_products" add constraint "terminal_products_terminal_product_uniq" UNIQUE using index "terminal_products_terminal_product_uniq";

alter table "public"."terminals" add constraint "terminals_city_id_fkey" FOREIGN KEY (city_id) REFERENCES public.cities(city_id) not valid;

alter table "public"."terminals" validate constraint "terminals_city_id_fkey";

alter table "public"."terminals" add constraint "terminals_city_id_terminal_name_key" UNIQUE using index "terminals_city_id_terminal_name_key";

alter table "public"."trailer_compartments" add constraint "trailer_compartments_trailer_id_fkey" FOREIGN KEY (trailer_id) REFERENCES public.trailers(trailer_id) ON DELETE CASCADE not valid;

alter table "public"."trailer_compartments" validate constraint "trailer_compartments_trailer_id_fkey";

alter table "public"."trailers" add constraint "trailers_trailer_name_key" UNIQUE using index "trailers_trailer_name_key";

alter table "public"."trucks" add constraint "trucks_truck_name_key" UNIQUE using index "trucks_truck_name_key";

alter table "public"."user_plan_slots" add constraint "user_plan_slots_slot_check" CHECK (((slot >= 0) AND (slot <= 5))) not valid;

alter table "public"."user_plan_slots" validate constraint "user_plan_slots_slot_check";

alter table "public"."user_plan_slots" add constraint "user_plan_slots_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_plan_slots" validate constraint "user_plan_slots_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.begin_load(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id     uuid := auth.uid();
  v_load_id     uuid;
  v_combo       record;
  v_lines_count int;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF (payload ? 'combo_id') IS FALSE OR (payload ? 'terminal_id') IS FALSE THEN
    RAISE EXCEPTION 'Missing combo_id or terminal_id';
  END IF;

  -- Fetch combo — target_weight replaces gross_limit_lbs, buffer_lbs removed
  SELECT combo_id, tare_lbs, target_weight, active
    INTO v_combo
    FROM public.equipment_combos
   WHERE combo_id = (payload->>'combo_id')::uuid;

  IF v_combo.combo_id IS NULL THEN RAISE EXCEPTION 'Invalid combo_id'; END IF;
  IF v_combo.active IS NOT TRUE THEN RAISE EXCEPTION 'Equipment combo is not active'; END IF;

  -- Insert load_log row.
  -- load_log.gross_limit_lbs still exists as a historical snapshot column —
  -- we store target_weight into it so old load reports still read correctly.
  -- load_log.buffer_lbs still exists — store 0 (concept removed).
  INSERT INTO public.load_log (
    user_id, combo_id, terminal_id, state_code, city_id,
    cg_bias,
    ambient_temp_f,
    product_temp_f,
    planned_snapshot,
    tare_lbs,
    gross_limit_lbs,
    buffer_lbs,
    planned_total_gal,
    planned_total_lbs,
    planned_gross_lbs,
    status,
    started_at
  ) VALUES (
    v_user_id,
    (payload->>'combo_id')::uuid,
    (payload->>'terminal_id')::uuid,
    NULLIF(payload->>'state_code', ''),
    CASE WHEN payload ? 'city_id' THEN (payload->>'city_id')::uuid ELSE NULL END,
    CASE WHEN payload ? 'cg_bias'        THEN (payload->>'cg_bias')::numeric        ELSE NULL END,
    CASE WHEN payload ? 'ambient_temp_f' THEN (payload->>'ambient_temp_f')::numeric ELSE NULL END,
    CASE WHEN payload ? 'product_temp_f' THEN (payload->>'product_temp_f')::numeric ELSE NULL END,
    payload->'planned_snapshot',
    v_combo.tare_lbs,
    v_combo.target_weight,  -- maps into gross_limit_lbs snapshot column
    0,                       -- buffer_lbs removed; store 0
    (payload->'planned_totals'->>'planned_total_gal')::numeric,
    (payload->'planned_totals'->>'planned_total_lbs')::numeric,
    (payload->'planned_totals'->>'planned_gross_lbs')::numeric,
    'planned',
    now()
  ) RETURNING load_id INTO v_load_id;

  -- Insert one row per compartment
  INSERT INTO public.load_lines (
    load_id, comp_number, product_id, planned_gallons, planned_lbs, temp_f
  )
  SELECT
    v_load_id,
    (x->>'comp_number')::int,
    (x->>'product_id')::uuid,
    CASE WHEN x ? 'planned_gallons' THEN (x->>'planned_gallons')::numeric ELSE NULL END,
    CASE WHEN x ? 'planned_lbs'     THEN (x->>'planned_lbs')::numeric     ELSE NULL END,
    CASE WHEN x ? 'temp_f'          THEN (x->>'temp_f')::numeric          ELSE NULL END
  FROM jsonb_array_elements(COALESCE(payload->'lines', '[]'::jsonb)) x;

  GET DIAGNOSTICS v_lines_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'load_id',        v_load_id,
    'lines_inserted', v_lines_count
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_combo(p_combo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify it exists and is active
  IF NOT EXISTS (
    SELECT 1 FROM public.equipment_combos
     WHERE combo_id = p_combo_id AND active = true
  ) THEN
    RAISE EXCEPTION 'Combo not found or not active: %', p_combo_id;
  END IF;

  -- Release any combo the user currently holds
  UPDATE public.equipment_combos
     SET claimed_by = NULL,
         claimed_at = NULL
   WHERE claimed_by = auth.uid()
     AND active     = true;

  -- Claim this one
  UPDATE public.equipment_combos
     SET claimed_by = auth.uid(),
         claimed_at = now()
   WHERE combo_id   = p_combo_id;

  RETURN jsonb_build_object(
    'combo_id',       p_combo_id,
    'claimed_by',     auth.uid()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_load(p_load_id uuid, p_completed_at timestamp with time zone, p_lines jsonb, p_product_updates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id         uuid;
  v_status          text;
  v_planned_lbs     numeric;
  v_actual_total    numeric := 0;
  v_diff_lbs        numeric;
  v_line            jsonb;
  v_update          jsonb;
  v_comp            int;
  v_actual_gallons  numeric;
  v_actual_lbs      numeric;
  v_actual_temp     numeric;
  v_actual_api      numeric;
  v_product_id      uuid;
BEGIN

  -- ── 1. Auth + state check ───────────────────────────────────────────────────
  SELECT user_id, status, planned_gross_lbs
    INTO v_user_id, v_status, v_planned_lbs
    FROM load_log
   WHERE load_id = p_load_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'load_not_found: %', p_load_id;
  END IF;

  IF v_user_id != auth.uid() THEN
    RAISE EXCEPTION 'unauthorized: load does not belong to current user';
  END IF;

  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'already_completed: load % is already completed', p_load_id;
  END IF;


  -- ── 2. Update load_lines ────────────────────────────────────────────────────
  -- For each compartment line sent by the client, write:
  --   actual_gallons, actual_lbs, actual_temp_f
  -- Then join against p_product_updates (keyed by product_id) to write actual_api.
  --
  -- We do this in two passes to keep logic clean:
  --   Pass A: write actuals from p_lines (comp_number keyed)
  --   Pass B: write actual_api from p_product_updates (product_id keyed)

  -- Pass A: per-compartment actuals
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_comp           := (v_line->>'comp_number')::int;
    v_actual_gallons := (v_line->>'actual_gallons')::numeric;
    v_actual_lbs     := (v_line->>'actual_lbs')::numeric;
    v_actual_temp    := (v_line->>'temp_f')::numeric;

    UPDATE load_lines
       SET actual_gallons = v_actual_gallons,
           actual_lbs     = v_actual_lbs,
           actual_temp_f  = v_actual_temp,  -- dedicated column for actual temp
           updated_at     = now()
     WHERE load_id    = p_load_id
       AND comp_number = v_comp;

    -- Accumulate actual payload weight for diff calculation
    IF v_actual_lbs IS NOT NULL THEN
      v_actual_total := v_actual_total + v_actual_lbs;
    END IF;
  END LOOP;

  -- Pass B: per-product actual API (and cross-check temp)
  -- Joins on product_id so all compartments loaded with the same product
  -- get the same observed API written to them.
  FOR v_update IN SELECT * FROM jsonb_array_elements(p_product_updates)
  LOOP
    v_product_id  := (v_update->>'product_id')::uuid;
    v_actual_api  := (v_update->>'api')::numeric;
    v_actual_temp := (v_update->>'temp_f')::numeric;

    -- Write actual_api to every line for this product on this load
    UPDATE load_lines
       SET actual_api  = v_actual_api,
           -- actual_temp_f may already be set from Pass A (comp-level); only
           -- overwrite if it's still null (product-level is less precise)
           actual_temp_f = COALESCE(actual_temp_f, v_actual_temp),
           updated_at  = now()
     WHERE load_id    = p_load_id
       AND product_id  = v_product_id;
  END LOOP;


  -- ── 3. Compute diff and close the load_log row ──────────────────────────────
  -- diff_lbs = actual_gross - planned_gross
  -- actual_gross = tare + actual_payload
  -- We don't store tare on load_log directly, but planned_gross_lbs = tare + planned_payload.
  -- So: diff = (planned_gross - planned_payload) + actual_payload - planned_gross
  --          = actual_payload - planned_payload
  -- Simpler: just compute actual_total_lbs and let the client calc gross if it needs to.
  -- Store raw payload diff here; the client adds tare when displaying gross.

  -- Re-sum from the DB to be authoritative (in case client sent partial lines)
  SELECT COALESCE(SUM(actual_lbs), 0)
    INTO v_actual_total
    FROM load_lines
   WHERE load_id = p_load_id
     AND actual_lbs IS NOT NULL;

  -- planned_total_lbs is the payload-only figure stored at beginLoad
  SELECT COALESCE(planned_total_lbs, 0)
    INTO v_planned_lbs
    FROM load_log
   WHERE load_id = p_load_id;

  v_diff_lbs := v_actual_total - v_planned_lbs;

  UPDATE load_log
     SET status          = 'completed',
         completed_at    = p_completed_at,
         actual_total_lbs = v_actual_total,
         diff_lbs        = v_diff_lbs,
         updated_at      = now()
   WHERE load_id = p_load_id;


  -- ── 4. Update products.last_api and products.last_temp_f ────────────────────
  -- These are the "last observed" values used to pre-fill the next load's inputs.
  FOR v_update IN SELECT * FROM jsonb_array_elements(p_product_updates)
  LOOP
    v_product_id  := (v_update->>'product_id')::uuid;
    v_actual_api  := (v_update->>'api')::numeric;
    v_actual_temp := (v_update->>'temp_f')::numeric;

    -- Only update if the caller provided valid numbers
    IF v_actual_api IS NOT NULL AND v_actual_api > 0 THEN
      UPDATE products
         SET last_api    = v_actual_api,
             last_temp_f = COALESCE(v_actual_temp, last_temp_f),
             updated_at  = now()
       WHERE product_id = v_product_id;
    END IF;
  END LOOP;


  -- ── 5. Return summary ───────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'load_id',          p_load_id,
    'status',           'completed',
    'actual_total_lbs', v_actual_total,
    'diff_lbs',         v_diff_lbs,
    'completed_at',     p_completed_at
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_load(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_load_id        uuid;
  v_completed_at   timestamptz;
  v_user_id        uuid;
  v_status         text;
  v_terminal_id    uuid;
  v_planned_lbs    numeric;
  v_actual_total   numeric := 0;
  v_diff_lbs       numeric;
  v_line           jsonb;
  v_update         jsonb;
  v_comp           int;
  v_actual_gallons numeric;
  v_actual_lbs     numeric;
  v_actual_temp    numeric;
  v_actual_api     numeric;
  v_product_id     uuid;
BEGIN

  -- ── Parse top-level scalars from payload ────────────────────────────────────
  v_load_id      := (payload->>'load_id')::uuid;
  v_completed_at := COALESCE(
                      (payload->>'completed_at')::timestamptz,
                      (payload->>'loaded_at')::timestamptz,
                      now()
                    );


  -- ── 1. Auth + state check ───────────────────────────────────────────────────
  SELECT user_id, status, terminal_id
    INTO v_user_id, v_status, v_terminal_id
    FROM load_log
   WHERE load_id = v_load_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'load_not_found: %', v_load_id;
  END IF;

  IF v_user_id != auth.uid() THEN
    RAISE EXCEPTION 'unauthorized: load does not belong to current user';
  END IF;

  IF v_status = 'loaded' THEN
    RAISE EXCEPTION 'already_completed: load % is already loaded', v_load_id;
  END IF;


  -- ── 2a. Per-compartment actuals (from payload.lines) ────────────────────────
  FOR v_line IN SELECT * FROM jsonb_array_elements(payload->'lines')
  LOOP
    v_comp           := (v_line->>'comp_number')::int;
    v_actual_gallons := (v_line->>'actual_gallons')::numeric;
    v_actual_lbs     := (v_line->>'actual_lbs')::numeric;
    v_actual_temp    := (v_line->>'temp_f')::numeric;

    UPDATE load_lines
       SET actual_gallons = v_actual_gallons,
           actual_lbs     = v_actual_lbs,
           actual_temp_f  = v_actual_temp,
           updated_at     = now()
     WHERE load_id    = v_load_id
       AND comp_number = v_comp;
  END LOOP;


  -- ── 2b. Per-product actual API (from payload.product_updates) ───────────────
  -- Joins on product_id — all compartments of the same product get the same
  -- observed API.  actual_temp_f from step 2a (comp-level) takes precedence;
  -- product-level temp only fills gaps.
  FOR v_update IN SELECT * FROM jsonb_array_elements(payload->'product_updates')
  LOOP
    v_product_id := (v_update->>'product_id')::uuid;
    v_actual_api := (v_update->>'api')::numeric;
    v_actual_temp:= (v_update->>'temp_f')::numeric;

    UPDATE load_lines
       SET actual_api    = v_actual_api,
           actual_temp_f = COALESCE(actual_temp_f, v_actual_temp),
           updated_at    = now()
     WHERE load_id    = v_load_id
       AND product_id::text = v_update->>'product_id';
  END LOOP;


  -- ── 3. Compute diff and close load_log ──────────────────────────────────────
  -- Re-sum from DB to be authoritative
  SELECT COALESCE(SUM(actual_lbs), 0)
    INTO v_actual_total
    FROM load_lines
   WHERE load_id = v_load_id
     AND actual_lbs IS NOT NULL;

  SELECT COALESCE(planned_total_lbs, 0)
    INTO v_planned_lbs
    FROM load_log
   WHERE load_id = v_load_id;

  v_diff_lbs := v_actual_total - v_planned_lbs;

  UPDATE load_log
     SET status           = 'loaded',
         completed_at     = v_completed_at,
         actual_total_lbs = v_actual_total,
         diff_lbs         = v_diff_lbs,
         updated_at       = now()
   WHERE load_id = v_load_id;


  -- ── 4. Update terminal_products.last_api ────────────────────────────────────
  -- Writes the observed API back to the specific terminal+product record so the
  -- planner pre-fills the correct API for this terminal on the next load.
  -- Different terminals carry the same product at different API values.
  FOR v_update IN SELECT * FROM jsonb_array_elements(payload->'product_updates')
  LOOP
    v_product_id := (v_update->>'product_id')::uuid;
    v_actual_api := (v_update->>'api')::numeric;

    IF v_actual_api IS NOT NULL AND v_actual_api > 0 THEN
      UPDATE terminal_products
         SET last_api   = v_actual_api,
             updated_at = now()
       WHERE terminal_id = v_terminal_id
         AND product_id::text = v_update->>'product_id';
    END IF;
  END LOOP;


  -- ── 5. Return summary ────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok',               true,
    'load_id',          v_load_id,
    'planned_lbs',      v_planned_lbs,
    'actual_lbs',       v_actual_total,
    'diff_lbs',         v_diff_lbs,
    'completed_at',     v_completed_at
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.couple_combo(p_truck_id uuid, p_trailer_id uuid, p_tare_lbs numeric DEFAULT NULL::numeric, p_target_weight numeric DEFAULT NULL::numeric, p_buffer_lbs numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_combo_id     uuid;
  v_tare_lbs     numeric;
  v_created      boolean := false;
  v_company_id   uuid;
  v_truck_name   text;
  v_trailer_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT company_id INTO v_company_id
    FROM public.user_companies
   WHERE user_id = auth.uid()
   LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User is not a member of any company';
  END IF;

  -- Release any combo the user currently holds
  UPDATE public.equipment_combos
     SET claimed_by = NULL,
         claimed_at = NULL
   WHERE claimed_by = auth.uid()
     AND active     = true;

  -- Guard: reject if either piece is already in an active combo
  IF EXISTS (
    SELECT 1 FROM public.equipment_combos
     WHERE (truck_id = p_truck_id OR trailer_id = p_trailer_id)
       AND active = true
  ) THEN
    RAISE EXCEPTION 'One or both pieces of equipment are already coupled';
  END IF;

  -- Look for most-recent historical (inactive) combo for this exact pair
  SELECT combo_id, tare_lbs
    INTO v_combo_id, v_tare_lbs
    FROM public.equipment_combos
   WHERE truck_id   = p_truck_id
     AND trailer_id = p_trailer_id
     AND active     = false
   ORDER BY claimed_at DESC NULLS LAST
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.equipment_combos
       SET active       = true,
           claimed_by   = auth.uid(),
           claimed_at   = now(),
           company_id   = v_company_id,
           target_weight = COALESCE(p_target_weight, target_weight)
     WHERE combo_id = v_combo_id;
  ELSE
    IF p_tare_lbs IS NULL OR p_tare_lbs <= 0 THEN
      RAISE EXCEPTION 'No historical combo found. Please provide a tare weight.';
    END IF;

    SELECT truck_name   INTO v_truck_name   FROM public.trucks   WHERE truck_id   = p_truck_id;
    SELECT trailer_name INTO v_trailer_name FROM public.trailers WHERE trailer_id = p_trailer_id;

    v_combo_id := gen_random_uuid();
    v_tare_lbs := p_tare_lbs;

    INSERT INTO public.equipment_combos (
      combo_id, combo_name, truck_id, trailer_id,
      tare_lbs, target_weight,
      active, claimed_by, claimed_at, company_id
    ) VALUES (
      v_combo_id,
      COALESCE(v_truck_name, '') || ' / ' || COALESCE(v_trailer_name, ''),
      p_truck_id,
      p_trailer_id,
      p_tare_lbs,
      COALESCE(p_target_weight, 80000),
      true,
      auth.uid(),
      now(),
      v_company_id
    );

    v_created := true;
  END IF;

  RETURN jsonb_build_object(
    'combo_id', v_combo_id,
    'tare_lbs', v_tare_lbs,
    'created',  v_created
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_combo(p_truck_id uuid, p_trailer_id uuid, p_tare_lbs numeric, p_gross_limit_lbs numeric, p_buffer_lbs numeric DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_combo_id uuid;
  v_combo_name text;
  v_existing_id uuid;
BEGIN
  -- Safety: require authenticated user
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Safety: basic weight sanity
  IF p_tare_lbs <= 0 THEN
    RAISE EXCEPTION 'tare_lbs must be positive';
  END IF;
  IF p_gross_limit_lbs <= p_tare_lbs THEN
    RAISE EXCEPTION 'gross_limit_lbs must be greater than tare_lbs';
  END IF;

  -- Check if this exact truck+trailer pairing already exists
  SELECT combo_id INTO v_existing_id
  FROM public.equipment_combos
  WHERE truck_id = p_truck_id
    AND trailer_id = p_trailer_id
    AND active = true
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Already exists — return it (idempotent)
    RETURN json_build_object('combo_id', v_existing_id, 'created', false);
  END IF;

  -- Build a combo_name from the truck/trailer IDs
  -- You can improve this later if you add a trucks/trailers lookup table
  v_combo_name := substring(p_truck_id::text, 1, 8) || ' / ' || substring(p_trailer_id::text, 1, 8);

  -- Insert the new combo
  INSERT INTO public.equipment_combos (
    combo_id,
    combo_name,
    truck_id,
    trailer_id,
    tare_lbs,
    gross_limit_lbs,
    buffer_lbs,
    active
  )
  VALUES (
    gen_random_uuid(),
    v_combo_name,
    p_truck_id,
    p_trailer_id,
    p_tare_lbs,
    p_gross_limit_lbs,
    p_buffer_lbs,
    true
  )
  RETURNING combo_id INTO v_combo_id;

  RETURN json_build_object('combo_id', v_combo_id, 'created', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.decouple_combo(p_combo_id text, p_scenario text, p_truck_status text, p_truck_location text DEFAULT NULL::text, p_truck_lat double precision DEFAULT NULL::double precision, p_truck_lon double precision DEFAULT NULL::double precision, p_truck_notes text DEFAULT NULL::text, p_trailer_status text DEFAULT 'PARK'::text, p_trailer_location text DEFAULT NULL::text, p_trailer_lat double precision DEFAULT NULL::double precision, p_trailer_lon double precision DEFAULT NULL::double precision, p_trailer_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_truck_id    text;
  v_trailer_id  text;
  v_user_id     uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get truck/trailer from combo (cast text param to uuid for comparison)
  SELECT truck_id::text, trailer_id::text
  INTO v_truck_id, v_trailer_id
  FROM equipment_combos
  WHERE combo_id = p_combo_id::uuid AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Combo not found or already inactive';
  END IF;

  -- Deactivate the combo and clear claim
  UPDATE equipment_combos
  SET active = false, claimed_by = NULL, claimed_at = NULL
  WHERE combo_id = p_combo_id::uuid;

  -- Update truck status
  UPDATE trucks
  SET status_code       = p_truck_status,
      status_location   = p_truck_location,
      status_lat        = p_truck_lat,
      status_lon        = p_truck_lon,
      status_notes      = p_truck_notes,
      status_updated_at = now()
  WHERE truck_id = v_truck_id::uuid;

  -- Update trailer status
  UPDATE trailers
  SET status_code        = p_trailer_status,
      status_location    = p_trailer_location,
      status_lat         = p_trailer_lat,
      status_lon         = p_trailer_lon,
      status_notes       = p_trailer_notes,
      status_updated_at  = now()
  WHERE trailer_id = v_trailer_id::uuid;

  -- Write audit log
  INSERT INTO decouple_events (
    combo_id, truck_id, trailer_id, user_id, scenario,
    truck_status, truck_location, truck_lat, truck_lon, truck_notes,
    trailer_status, trailer_location, trailer_lat, trailer_lon, trailer_notes
  ) VALUES (
    p_combo_id, v_truck_id, v_trailer_id, v_user_id, p_scenario,
    p_truck_status, p_truck_location, p_truck_lat, p_truck_lon, p_truck_notes,
    p_trailer_status, p_trailer_location, p_trailer_lat, p_trailer_lon, p_trailer_notes
  );

  RETURN jsonb_build_object(
    'ok', true,
    'truck_id', v_truck_id,
    'trailer_id', v_trailer_id,
    'scenario', p_scenario
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.decouple_combo(p_combo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_truck_id   uuid;
  v_trailer_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.equipment_combos
     SET active = false
   WHERE combo_id = p_combo_id
     AND active = true
  RETURNING truck_id, trailer_id
       INTO v_truck_id, v_trailer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Combo not found or already inactive: %', p_combo_id;
  END IF;

  RETURN jsonb_build_object(
    'combo_id',   p_combo_id,
    'truck_id',   v_truck_id,
    'trailer_id', v_trailer_id
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_carded(p_terminal_id uuid)
 RETURNS public.terminal_access
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_days integer;
  v_row public.terminal_access;
begin
  select renewal_days
  into v_days
  from public.terminals
  where terminal_id = p_terminal_id;

  insert into public.terminal_access (user_id, terminal_id, expires_on)
  values (auth.uid(), p_terminal_id, current_date + v_days)
  on conflict (user_id, terminal_id)
  do update set expires_on = excluded.expires_on
  returning * into v_row;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_carded(p_terminal_id uuid, p_carded_on date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.terminal_access (
    user_id,
    terminal_id,
    carded_on,
    recorded_on
  )
  values (
    auth.uid(),
    p_terminal_id,
    p_carded_on,
    now()
  )
  on conflict (user_id, terminal_id)
  do update set
    carded_on = excluded.carded_on,
    recorded_on = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.my_terminals_set_added_on_tz()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  tz text;
begin
  -- fetch terminal timezone
  select t.timezone into tz
  from public.terminals t
  where t.terminal_id = new.terminal_id;

  -- if missing tz, fall back to UTC date
  if tz is null or tz = '' then
    new.added_on := (now() at time zone 'UTC')::date;
  else
    new.added_on := (now() at time zone tz)::date;
  end if;

  return new;
end;
$function$
;

create or replace view "public"."my_terminals_with_access" as  SELECT t.terminal_id,
    t.city_id,
    t.terminal_name,
    t.timezone,
    t.active,
    t.state,
    t.city,
    t.renewal_days,
    ta.carded_on,
    ta.recorded_on,
    (ta.carded_on < (CURRENT_DATE - COALESCE(t.renewal_days, 90))) AS is_visual_expired
   FROM (public.terminal_access ta
     JOIN public.terminals t ON ((t.terminal_id = ta.terminal_id)))
  WHERE ((ta.user_id = auth.uid()) AND (t.active = true) AND (ta.carded_on >= (CURRENT_DATE - (COALESCE(t.renewal_days, 90) + 30))));


create or replace view "public"."my_terminals_with_status" as  SELECT mt.user_id,
    t.terminal_id,
    t.terminal_name,
    t.city_id,
    t.state,
    t.city,
    t.timezone,
    t.renewal_days,
    mt.is_starred,
    mt.added_on,
    ta.carded_on,
        CASE
            WHEN (ta.carded_on IS NULL) THEN 'not_carded'::text
            WHEN (ta.carded_on < (CURRENT_DATE - COALESCE(t.renewal_days, 90))) THEN 'expired'::text
            ELSE 'valid'::text
        END AS card_status,
    ((ta.carded_on IS NOT NULL) AND (ta.carded_on < (CURRENT_DATE - COALESCE(t.renewal_days, 90)))) AS is_visual_expired
   FROM ((public.my_terminals mt
     JOIN public.terminals t ON ((t.terminal_id = mt.terminal_id)))
     LEFT JOIN public.terminal_access ta ON (((ta.user_id = mt.user_id) AND (ta.terminal_id = mt.terminal_id))));


CREATE OR REPLACE FUNCTION public.set_equipment_combo_name()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  tname text;
  rname text;
begin
  -- look up truck name
  select truck_name into tname
  from public.trucks
  where truck_id = new.truck_id;

  -- look up trailer name
  select trailer_name into rname
  from public.trailers
  where trailer_id = new.trailer_id;

  new.combo_name :=
    trim(
      coalesce(tname, new.truck_id::text) ||
      case when new.trailer_id is not null
        then ' / ' || coalesce(rname, new.trailer_id::text)
        else ''
      end
    );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- Prefer updated_on if present, else updated_at, else do nothing
  if to_jsonb(NEW) ? 'updated_on' then
    NEW.updated_on := now();
  elsif to_jsonb(NEW) ? 'updated_at' then
    NEW.updated_at := now();
  end if;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.slip_seat_combo(p_combo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prev_claimed_by uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT claimed_by
    INTO v_prev_claimed_by
    FROM public.equipment_combos
   WHERE combo_id = p_combo_id
     AND active   = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Combo not found or not active: %', p_combo_id;
  END IF;

  IF v_prev_claimed_by = auth.uid() THEN
    RAISE EXCEPTION 'You already have this equipment selected';
  END IF;

  -- ── Release any combo the user currently holds ──────────────────────────────
  UPDATE public.equipment_combos
     SET claimed_by = NULL,
         claimed_at = NULL
   WHERE claimed_by = auth.uid()
     AND active     = true;

  -- Claim the new one
  UPDATE public.equipment_combos
     SET claimed_by = auth.uid(),
         claimed_at = now()
   WHERE combo_id = p_combo_id;

  RETURN jsonb_build_object(
    'combo_id',        p_combo_id,
    'new_claimed_by',  auth.uid(),
    'prev_claimed_by', v_prev_claimed_by
  );
END;
$function$
;

create or replace view "public"."v_terminal_product_catalog" as  SELECT tp.terminal_id,
    p.product_id,
    p.product_code,
    p.product_name,
    p.display_name,
    p.description,
    p.button_code,
    p.hex_code,
    p.api_60,
    p.alpha_per_f,
    p.un_number,
    tp.active,
    COALESCE(tp.is_out_of_stock, false) AS is_out_of_stock
   FROM (public.terminal_products tp
     JOIN public.products p ON ((p.product_id = tp.product_id)));


create or replace view "public"."v_terminal_products_admin" as  SELECT t.state,
    t.city,
    t.terminal_name,
    v.terminal_id,
    v.product_id,
    v.product_code,
    v.product_name,
    v.display_name,
    v.description,
    v.button_code,
    v.hex_code,
    v.api_60,
    v.alpha_per_f,
    v.un_number,
    v.active,
    v.is_out_of_stock
   FROM (public.v_terminal_product_catalog v
     JOIN public.terminals t ON ((t.terminal_id = v.terminal_id)));


grant delete on table "public"."cities" to "anon";

grant insert on table "public"."cities" to "anon";

grant references on table "public"."cities" to "anon";

grant select on table "public"."cities" to "anon";

grant trigger on table "public"."cities" to "anon";

grant truncate on table "public"."cities" to "anon";

grant update on table "public"."cities" to "anon";

grant delete on table "public"."cities" to "authenticated";

grant insert on table "public"."cities" to "authenticated";

grant references on table "public"."cities" to "authenticated";

grant select on table "public"."cities" to "authenticated";

grant trigger on table "public"."cities" to "authenticated";

grant truncate on table "public"."cities" to "authenticated";

grant update on table "public"."cities" to "authenticated";

grant delete on table "public"."cities" to "service_role";

grant insert on table "public"."cities" to "service_role";

grant references on table "public"."cities" to "service_role";

grant select on table "public"."cities" to "service_role";

grant trigger on table "public"."cities" to "service_role";

grant truncate on table "public"."cities" to "service_role";

grant update on table "public"."cities" to "service_role";

grant delete on table "public"."companies" to "anon";

grant insert on table "public"."companies" to "anon";

grant references on table "public"."companies" to "anon";

grant select on table "public"."companies" to "anon";

grant trigger on table "public"."companies" to "anon";

grant truncate on table "public"."companies" to "anon";

grant update on table "public"."companies" to "anon";

grant delete on table "public"."companies" to "authenticated";

grant insert on table "public"."companies" to "authenticated";

grant references on table "public"."companies" to "authenticated";

grant select on table "public"."companies" to "authenticated";

grant trigger on table "public"."companies" to "authenticated";

grant truncate on table "public"."companies" to "authenticated";

grant update on table "public"."companies" to "authenticated";

grant delete on table "public"."companies" to "service_role";

grant insert on table "public"."companies" to "service_role";

grant references on table "public"."companies" to "service_role";

grant select on table "public"."companies" to "service_role";

grant trigger on table "public"."companies" to "service_role";

grant truncate on table "public"."companies" to "service_role";

grant update on table "public"."companies" to "service_role";

grant delete on table "public"."decouple_events" to "anon";

grant insert on table "public"."decouple_events" to "anon";

grant references on table "public"."decouple_events" to "anon";

grant select on table "public"."decouple_events" to "anon";

grant trigger on table "public"."decouple_events" to "anon";

grant truncate on table "public"."decouple_events" to "anon";

grant update on table "public"."decouple_events" to "anon";

grant delete on table "public"."decouple_events" to "authenticated";

grant insert on table "public"."decouple_events" to "authenticated";

grant references on table "public"."decouple_events" to "authenticated";

grant select on table "public"."decouple_events" to "authenticated";

grant trigger on table "public"."decouple_events" to "authenticated";

grant truncate on table "public"."decouple_events" to "authenticated";

grant update on table "public"."decouple_events" to "authenticated";

grant delete on table "public"."decouple_events" to "service_role";

grant insert on table "public"."decouple_events" to "service_role";

grant references on table "public"."decouple_events" to "service_role";

grant select on table "public"."decouple_events" to "service_role";

grant trigger on table "public"."decouple_events" to "service_role";

grant truncate on table "public"."decouple_events" to "service_role";

grant update on table "public"."decouple_events" to "service_role";

grant delete on table "public"."equipment_combos" to "anon";

grant insert on table "public"."equipment_combos" to "anon";

grant references on table "public"."equipment_combos" to "anon";

grant select on table "public"."equipment_combos" to "anon";

grant trigger on table "public"."equipment_combos" to "anon";

grant truncate on table "public"."equipment_combos" to "anon";

grant update on table "public"."equipment_combos" to "anon";

grant delete on table "public"."equipment_combos" to "authenticated";

grant insert on table "public"."equipment_combos" to "authenticated";

grant references on table "public"."equipment_combos" to "authenticated";

grant select on table "public"."equipment_combos" to "authenticated";

grant trigger on table "public"."equipment_combos" to "authenticated";

grant truncate on table "public"."equipment_combos" to "authenticated";

grant update on table "public"."equipment_combos" to "authenticated";

grant delete on table "public"."equipment_combos" to "service_role";

grant insert on table "public"."equipment_combos" to "service_role";

grant references on table "public"."equipment_combos" to "service_role";

grant select on table "public"."equipment_combos" to "service_role";

grant trigger on table "public"."equipment_combos" to "service_role";

grant truncate on table "public"."equipment_combos" to "service_role";

grant update on table "public"."equipment_combos" to "service_role";

grant delete on table "public"."fuel_temp_cache" to "anon";

grant insert on table "public"."fuel_temp_cache" to "anon";

grant references on table "public"."fuel_temp_cache" to "anon";

grant select on table "public"."fuel_temp_cache" to "anon";

grant trigger on table "public"."fuel_temp_cache" to "anon";

grant truncate on table "public"."fuel_temp_cache" to "anon";

grant update on table "public"."fuel_temp_cache" to "anon";

grant delete on table "public"."fuel_temp_cache" to "authenticated";

grant insert on table "public"."fuel_temp_cache" to "authenticated";

grant references on table "public"."fuel_temp_cache" to "authenticated";

grant select on table "public"."fuel_temp_cache" to "authenticated";

grant trigger on table "public"."fuel_temp_cache" to "authenticated";

grant truncate on table "public"."fuel_temp_cache" to "authenticated";

grant update on table "public"."fuel_temp_cache" to "authenticated";

grant delete on table "public"."fuel_temp_cache" to "service_role";

grant insert on table "public"."fuel_temp_cache" to "service_role";

grant references on table "public"."fuel_temp_cache" to "service_role";

grant select on table "public"."fuel_temp_cache" to "service_role";

grant trigger on table "public"."fuel_temp_cache" to "service_role";

grant truncate on table "public"."fuel_temp_cache" to "service_role";

grant update on table "public"."fuel_temp_cache" to "service_role";

grant delete on table "public"."load_lines" to "anon";

grant insert on table "public"."load_lines" to "anon";

grant references on table "public"."load_lines" to "anon";

grant select on table "public"."load_lines" to "anon";

grant trigger on table "public"."load_lines" to "anon";

grant truncate on table "public"."load_lines" to "anon";

grant update on table "public"."load_lines" to "anon";

grant insert on table "public"."load_lines" to "authenticated";

grant references on table "public"."load_lines" to "authenticated";

grant select on table "public"."load_lines" to "authenticated";

grant trigger on table "public"."load_lines" to "authenticated";

grant truncate on table "public"."load_lines" to "authenticated";

grant update on table "public"."load_lines" to "authenticated";

grant delete on table "public"."load_lines" to "service_role";

grant insert on table "public"."load_lines" to "service_role";

grant references on table "public"."load_lines" to "service_role";

grant select on table "public"."load_lines" to "service_role";

grant trigger on table "public"."load_lines" to "service_role";

grant truncate on table "public"."load_lines" to "service_role";

grant update on table "public"."load_lines" to "service_role";

grant delete on table "public"."load_log" to "anon";

grant insert on table "public"."load_log" to "anon";

grant references on table "public"."load_log" to "anon";

grant select on table "public"."load_log" to "anon";

grant trigger on table "public"."load_log" to "anon";

grant truncate on table "public"."load_log" to "anon";

grant update on table "public"."load_log" to "anon";

grant insert on table "public"."load_log" to "authenticated";

grant references on table "public"."load_log" to "authenticated";

grant select on table "public"."load_log" to "authenticated";

grant trigger on table "public"."load_log" to "authenticated";

grant truncate on table "public"."load_log" to "authenticated";

grant update on table "public"."load_log" to "authenticated";

grant delete on table "public"."load_log" to "service_role";

grant insert on table "public"."load_log" to "service_role";

grant references on table "public"."load_log" to "service_role";

grant select on table "public"."load_log" to "service_role";

grant trigger on table "public"."load_log" to "service_role";

grant truncate on table "public"."load_log" to "service_role";

grant update on table "public"."load_log" to "service_role";

grant delete on table "public"."my_terminals" to "anon";

grant insert on table "public"."my_terminals" to "anon";

grant references on table "public"."my_terminals" to "anon";

grant select on table "public"."my_terminals" to "anon";

grant trigger on table "public"."my_terminals" to "anon";

grant truncate on table "public"."my_terminals" to "anon";

grant update on table "public"."my_terminals" to "anon";

grant delete on table "public"."my_terminals" to "authenticated";

grant insert on table "public"."my_terminals" to "authenticated";

grant references on table "public"."my_terminals" to "authenticated";

grant select on table "public"."my_terminals" to "authenticated";

grant trigger on table "public"."my_terminals" to "authenticated";

grant truncate on table "public"."my_terminals" to "authenticated";

grant update on table "public"."my_terminals" to "authenticated";

grant delete on table "public"."my_terminals" to "service_role";

grant insert on table "public"."my_terminals" to "service_role";

grant references on table "public"."my_terminals" to "service_role";

grant select on table "public"."my_terminals" to "service_role";

grant trigger on table "public"."my_terminals" to "service_role";

grant truncate on table "public"."my_terminals" to "service_role";

grant update on table "public"."my_terminals" to "service_role";

grant delete on table "public"."products" to "anon";

grant insert on table "public"."products" to "anon";

grant references on table "public"."products" to "anon";

grant select on table "public"."products" to "anon";

grant trigger on table "public"."products" to "anon";

grant truncate on table "public"."products" to "anon";

grant update on table "public"."products" to "anon";

grant delete on table "public"."products" to "authenticated";

grant insert on table "public"."products" to "authenticated";

grant references on table "public"."products" to "authenticated";

grant select on table "public"."products" to "authenticated";

grant trigger on table "public"."products" to "authenticated";

grant truncate on table "public"."products" to "authenticated";

grant update on table "public"."products" to "authenticated";

grant delete on table "public"."products" to "service_role";

grant insert on table "public"."products" to "service_role";

grant references on table "public"."products" to "service_role";

grant select on table "public"."products" to "service_role";

grant trigger on table "public"."products" to "service_role";

grant truncate on table "public"."products" to "service_role";

grant update on table "public"."products" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."seed_products" to "anon";

grant insert on table "public"."seed_products" to "anon";

grant references on table "public"."seed_products" to "anon";

grant select on table "public"."seed_products" to "anon";

grant trigger on table "public"."seed_products" to "anon";

grant truncate on table "public"."seed_products" to "anon";

grant update on table "public"."seed_products" to "anon";

grant delete on table "public"."seed_products" to "authenticated";

grant insert on table "public"."seed_products" to "authenticated";

grant references on table "public"."seed_products" to "authenticated";

grant select on table "public"."seed_products" to "authenticated";

grant trigger on table "public"."seed_products" to "authenticated";

grant truncate on table "public"."seed_products" to "authenticated";

grant update on table "public"."seed_products" to "authenticated";

grant delete on table "public"."seed_products" to "service_role";

grant insert on table "public"."seed_products" to "service_role";

grant references on table "public"."seed_products" to "service_role";

grant select on table "public"."seed_products" to "service_role";

grant trigger on table "public"."seed_products" to "service_role";

grant truncate on table "public"."seed_products" to "service_role";

grant update on table "public"."seed_products" to "service_role";

grant delete on table "public"."states" to "anon";

grant insert on table "public"."states" to "anon";

grant references on table "public"."states" to "anon";

grant select on table "public"."states" to "anon";

grant trigger on table "public"."states" to "anon";

grant truncate on table "public"."states" to "anon";

grant update on table "public"."states" to "anon";

grant delete on table "public"."states" to "authenticated";

grant insert on table "public"."states" to "authenticated";

grant references on table "public"."states" to "authenticated";

grant select on table "public"."states" to "authenticated";

grant trigger on table "public"."states" to "authenticated";

grant truncate on table "public"."states" to "authenticated";

grant update on table "public"."states" to "authenticated";

grant delete on table "public"."states" to "service_role";

grant insert on table "public"."states" to "service_role";

grant references on table "public"."states" to "service_role";

grant select on table "public"."states" to "service_role";

grant trigger on table "public"."states" to "service_role";

grant truncate on table "public"."states" to "service_role";

grant update on table "public"."states" to "service_role";

grant delete on table "public"."terminal_access" to "anon";

grant insert on table "public"."terminal_access" to "anon";

grant references on table "public"."terminal_access" to "anon";

grant select on table "public"."terminal_access" to "anon";

grant trigger on table "public"."terminal_access" to "anon";

grant truncate on table "public"."terminal_access" to "anon";

grant update on table "public"."terminal_access" to "anon";

grant delete on table "public"."terminal_access" to "authenticated";

grant insert on table "public"."terminal_access" to "authenticated";

grant references on table "public"."terminal_access" to "authenticated";

grant select on table "public"."terminal_access" to "authenticated";

grant trigger on table "public"."terminal_access" to "authenticated";

grant truncate on table "public"."terminal_access" to "authenticated";

grant update on table "public"."terminal_access" to "authenticated";

grant delete on table "public"."terminal_access" to "service_role";

grant insert on table "public"."terminal_access" to "service_role";

grant references on table "public"."terminal_access" to "service_role";

grant select on table "public"."terminal_access" to "service_role";

grant trigger on table "public"."terminal_access" to "service_role";

grant truncate on table "public"."terminal_access" to "service_role";

grant update on table "public"."terminal_access" to "service_role";

grant delete on table "public"."terminal_products" to "anon";

grant insert on table "public"."terminal_products" to "anon";

grant references on table "public"."terminal_products" to "anon";

grant select on table "public"."terminal_products" to "anon";

grant trigger on table "public"."terminal_products" to "anon";

grant truncate on table "public"."terminal_products" to "anon";

grant update on table "public"."terminal_products" to "anon";

grant references on table "public"."terminal_products" to "authenticated";

grant select on table "public"."terminal_products" to "authenticated";

grant trigger on table "public"."terminal_products" to "authenticated";

grant truncate on table "public"."terminal_products" to "authenticated";

grant delete on table "public"."terminal_products" to "service_role";

grant insert on table "public"."terminal_products" to "service_role";

grant references on table "public"."terminal_products" to "service_role";

grant select on table "public"."terminal_products" to "service_role";

grant trigger on table "public"."terminal_products" to "service_role";

grant truncate on table "public"."terminal_products" to "service_role";

grant update on table "public"."terminal_products" to "service_role";

grant delete on table "public"."terminals" to "anon";

grant insert on table "public"."terminals" to "anon";

grant references on table "public"."terminals" to "anon";

grant select on table "public"."terminals" to "anon";

grant trigger on table "public"."terminals" to "anon";

grant truncate on table "public"."terminals" to "anon";

grant update on table "public"."terminals" to "anon";

grant delete on table "public"."terminals" to "authenticated";

grant insert on table "public"."terminals" to "authenticated";

grant references on table "public"."terminals" to "authenticated";

grant select on table "public"."terminals" to "authenticated";

grant trigger on table "public"."terminals" to "authenticated";

grant truncate on table "public"."terminals" to "authenticated";

grant update on table "public"."terminals" to "authenticated";

grant delete on table "public"."terminals" to "service_role";

grant insert on table "public"."terminals" to "service_role";

grant references on table "public"."terminals" to "service_role";

grant select on table "public"."terminals" to "service_role";

grant trigger on table "public"."terminals" to "service_role";

grant truncate on table "public"."terminals" to "service_role";

grant update on table "public"."terminals" to "service_role";

grant delete on table "public"."trailer_compartments" to "anon";

grant insert on table "public"."trailer_compartments" to "anon";

grant references on table "public"."trailer_compartments" to "anon";

grant select on table "public"."trailer_compartments" to "anon";

grant trigger on table "public"."trailer_compartments" to "anon";

grant truncate on table "public"."trailer_compartments" to "anon";

grant update on table "public"."trailer_compartments" to "anon";

grant delete on table "public"."trailer_compartments" to "authenticated";

grant insert on table "public"."trailer_compartments" to "authenticated";

grant references on table "public"."trailer_compartments" to "authenticated";

grant select on table "public"."trailer_compartments" to "authenticated";

grant trigger on table "public"."trailer_compartments" to "authenticated";

grant truncate on table "public"."trailer_compartments" to "authenticated";

grant update on table "public"."trailer_compartments" to "authenticated";

grant delete on table "public"."trailer_compartments" to "service_role";

grant insert on table "public"."trailer_compartments" to "service_role";

grant references on table "public"."trailer_compartments" to "service_role";

grant select on table "public"."trailer_compartments" to "service_role";

grant trigger on table "public"."trailer_compartments" to "service_role";

grant truncate on table "public"."trailer_compartments" to "service_role";

grant update on table "public"."trailer_compartments" to "service_role";

grant delete on table "public"."trailers" to "anon";

grant insert on table "public"."trailers" to "anon";

grant references on table "public"."trailers" to "anon";

grant select on table "public"."trailers" to "anon";

grant trigger on table "public"."trailers" to "anon";

grant truncate on table "public"."trailers" to "anon";

grant update on table "public"."trailers" to "anon";

grant delete on table "public"."trailers" to "authenticated";

grant insert on table "public"."trailers" to "authenticated";

grant references on table "public"."trailers" to "authenticated";

grant select on table "public"."trailers" to "authenticated";

grant trigger on table "public"."trailers" to "authenticated";

grant truncate on table "public"."trailers" to "authenticated";

grant update on table "public"."trailers" to "authenticated";

grant delete on table "public"."trailers" to "service_role";

grant insert on table "public"."trailers" to "service_role";

grant references on table "public"."trailers" to "service_role";

grant select on table "public"."trailers" to "service_role";

grant trigger on table "public"."trailers" to "service_role";

grant truncate on table "public"."trailers" to "service_role";

grant update on table "public"."trailers" to "service_role";

grant delete on table "public"."trucks" to "anon";

grant insert on table "public"."trucks" to "anon";

grant references on table "public"."trucks" to "anon";

grant select on table "public"."trucks" to "anon";

grant trigger on table "public"."trucks" to "anon";

grant truncate on table "public"."trucks" to "anon";

grant update on table "public"."trucks" to "anon";

grant delete on table "public"."trucks" to "authenticated";

grant insert on table "public"."trucks" to "authenticated";

grant references on table "public"."trucks" to "authenticated";

grant select on table "public"."trucks" to "authenticated";

grant trigger on table "public"."trucks" to "authenticated";

grant truncate on table "public"."trucks" to "authenticated";

grant update on table "public"."trucks" to "authenticated";

grant delete on table "public"."trucks" to "service_role";

grant insert on table "public"."trucks" to "service_role";

grant references on table "public"."trucks" to "service_role";

grant select on table "public"."trucks" to "service_role";

grant trigger on table "public"."trucks" to "service_role";

grant truncate on table "public"."trucks" to "service_role";

grant update on table "public"."trucks" to "service_role";

grant delete on table "public"."user_companies" to "anon";

grant insert on table "public"."user_companies" to "anon";

grant references on table "public"."user_companies" to "anon";

grant select on table "public"."user_companies" to "anon";

grant trigger on table "public"."user_companies" to "anon";

grant truncate on table "public"."user_companies" to "anon";

grant update on table "public"."user_companies" to "anon";

grant delete on table "public"."user_companies" to "authenticated";

grant insert on table "public"."user_companies" to "authenticated";

grant references on table "public"."user_companies" to "authenticated";

grant select on table "public"."user_companies" to "authenticated";

grant trigger on table "public"."user_companies" to "authenticated";

grant truncate on table "public"."user_companies" to "authenticated";

grant update on table "public"."user_companies" to "authenticated";

grant delete on table "public"."user_companies" to "service_role";

grant insert on table "public"."user_companies" to "service_role";

grant references on table "public"."user_companies" to "service_role";

grant select on table "public"."user_companies" to "service_role";

grant trigger on table "public"."user_companies" to "service_role";

grant truncate on table "public"."user_companies" to "service_role";

grant update on table "public"."user_companies" to "service_role";

grant delete on table "public"."user_plan_slots" to "anon";

grant insert on table "public"."user_plan_slots" to "anon";

grant references on table "public"."user_plan_slots" to "anon";

grant select on table "public"."user_plan_slots" to "anon";

grant trigger on table "public"."user_plan_slots" to "anon";

grant truncate on table "public"."user_plan_slots" to "anon";

grant update on table "public"."user_plan_slots" to "anon";

grant delete on table "public"."user_plan_slots" to "authenticated";

grant insert on table "public"."user_plan_slots" to "authenticated";

grant references on table "public"."user_plan_slots" to "authenticated";

grant select on table "public"."user_plan_slots" to "authenticated";

grant trigger on table "public"."user_plan_slots" to "authenticated";

grant truncate on table "public"."user_plan_slots" to "authenticated";

grant update on table "public"."user_plan_slots" to "authenticated";

grant delete on table "public"."user_plan_slots" to "service_role";

grant insert on table "public"."user_plan_slots" to "service_role";

grant references on table "public"."user_plan_slots" to "service_role";

grant select on table "public"."user_plan_slots" to "service_role";

grant trigger on table "public"."user_plan_slots" to "service_role";

grant truncate on table "public"."user_plan_slots" to "service_role";

grant update on table "public"."user_plan_slots" to "service_role";

grant delete on table "public"."user_primary_trailers" to "anon";

grant insert on table "public"."user_primary_trailers" to "anon";

grant references on table "public"."user_primary_trailers" to "anon";

grant select on table "public"."user_primary_trailers" to "anon";

grant trigger on table "public"."user_primary_trailers" to "anon";

grant truncate on table "public"."user_primary_trailers" to "anon";

grant update on table "public"."user_primary_trailers" to "anon";

grant delete on table "public"."user_primary_trailers" to "authenticated";

grant insert on table "public"."user_primary_trailers" to "authenticated";

grant references on table "public"."user_primary_trailers" to "authenticated";

grant select on table "public"."user_primary_trailers" to "authenticated";

grant trigger on table "public"."user_primary_trailers" to "authenticated";

grant truncate on table "public"."user_primary_trailers" to "authenticated";

grant update on table "public"."user_primary_trailers" to "authenticated";

grant delete on table "public"."user_primary_trailers" to "service_role";

grant insert on table "public"."user_primary_trailers" to "service_role";

grant references on table "public"."user_primary_trailers" to "service_role";

grant select on table "public"."user_primary_trailers" to "service_role";

grant trigger on table "public"."user_primary_trailers" to "service_role";

grant truncate on table "public"."user_primary_trailers" to "service_role";

grant update on table "public"."user_primary_trailers" to "service_role";

grant delete on table "public"."user_primary_trucks" to "anon";

grant insert on table "public"."user_primary_trucks" to "anon";

grant references on table "public"."user_primary_trucks" to "anon";

grant select on table "public"."user_primary_trucks" to "anon";

grant trigger on table "public"."user_primary_trucks" to "anon";

grant truncate on table "public"."user_primary_trucks" to "anon";

grant update on table "public"."user_primary_trucks" to "anon";

grant delete on table "public"."user_primary_trucks" to "authenticated";

grant insert on table "public"."user_primary_trucks" to "authenticated";

grant references on table "public"."user_primary_trucks" to "authenticated";

grant select on table "public"."user_primary_trucks" to "authenticated";

grant trigger on table "public"."user_primary_trucks" to "authenticated";

grant truncate on table "public"."user_primary_trucks" to "authenticated";

grant update on table "public"."user_primary_trucks" to "authenticated";

grant delete on table "public"."user_primary_trucks" to "service_role";

grant insert on table "public"."user_primary_trucks" to "service_role";

grant references on table "public"."user_primary_trucks" to "service_role";

grant select on table "public"."user_primary_trucks" to "service_role";

grant trigger on table "public"."user_primary_trucks" to "service_role";

grant truncate on table "public"."user_primary_trucks" to "service_role";

grant update on table "public"."user_primary_trucks" to "service_role";


  create policy "cities_read_all"
  on "public"."cities"
  as permissive
  for select
  to public
using (true);



  create policy "cities_read_auth"
  on "public"."cities"
  as permissive
  for select
  to authenticated
using (true);



  create policy "cities_select_authenticated"
  on "public"."cities"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Users can insert their own decouple events"
  on "public"."decouple_events"
  as permissive
  for insert
  to authenticated
with check ((user_id = auth.uid()));



  create policy "Users can read decouple events"
  on "public"."decouple_events"
  as permissive
  for select
  to authenticated
using (true);



  create policy "equipment_combos_delete"
  on "public"."equipment_combos"
  as permissive
  for delete
  to public
using ((company_id IN ( SELECT user_companies.company_id
   FROM public.user_companies
  WHERE (user_companies.user_id = auth.uid()))));



  create policy "equipment_combos_insert"
  on "public"."equipment_combos"
  as permissive
  for insert
  to public
with check ((company_id IN ( SELECT user_companies.company_id
   FROM public.user_companies
  WHERE (user_companies.user_id = auth.uid()))));



  create policy "equipment_combos_select"
  on "public"."equipment_combos"
  as permissive
  for select
  to public
using ((company_id IN ( SELECT user_companies.company_id
   FROM public.user_companies
  WHERE (user_companies.user_id = auth.uid()))));



  create policy "equipment_combos_update"
  on "public"."equipment_combos"
  as permissive
  for update
  to public
using ((company_id IN ( SELECT user_companies.company_id
   FROM public.user_companies
  WHERE (user_companies.user_id = auth.uid()))));



  create policy "load_lines_delete_own"
  on "public"."load_lines"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.load_log ll
  WHERE ((ll.load_id = load_lines.load_id) AND (ll.user_id = auth.uid())))));



  create policy "load_lines_insert_own"
  on "public"."load_lines"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.load_log ll
  WHERE ((ll.load_id = load_lines.load_id) AND (ll.user_id = auth.uid())))));



  create policy "load_lines_select_own"
  on "public"."load_lines"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.load_log ll
  WHERE ((ll.load_id = load_lines.load_id) AND (ll.user_id = auth.uid())))));



  create policy "load_lines_update_own"
  on "public"."load_lines"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.load_log ll
  WHERE ((ll.load_id = load_lines.load_id) AND (ll.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.load_log ll
  WHERE ((ll.load_id = load_lines.load_id) AND (ll.user_id = auth.uid())))));



  create policy "load_log_insert_own"
  on "public"."load_log"
  as permissive
  for insert
  to authenticated
with check ((user_id = auth.uid()));



  create policy "load_log_select_own"
  on "public"."load_log"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "load_log_update_own"
  on "public"."load_log"
  as permissive
  for update
  to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "my_terminals_delete_own"
  on "public"."my_terminals"
  as permissive
  for delete
  to authenticated
using ((user_id = auth.uid()));



  create policy "my_terminals_insert_own"
  on "public"."my_terminals"
  as permissive
  for insert
  to authenticated
with check ((user_id = auth.uid()));



  create policy "my_terminals_select_own"
  on "public"."my_terminals"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "my_terminals_update_own"
  on "public"."my_terminals"
  as permissive
  for update
  to authenticated
using ((user_id = auth.uid()));



  create policy "products_read_auth"
  on "public"."products"
  as permissive
  for select
  to authenticated
using (true);



  create policy "read products"
  on "public"."products"
  as permissive
  for select
  to authenticated
using (true);



  create policy "profiles_insert_own"
  on "public"."profiles"
  as permissive
  for insert
  to authenticated
with check ((user_id = auth.uid()));



  create policy "profiles_select_own"
  on "public"."profiles"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "profiles_update_own"
  on "public"."profiles"
  as permissive
  for update
  to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "states_read_auth"
  on "public"."states"
  as permissive
  for select
  to authenticated
using (true);



  create policy "terminal_access_delete_own"
  on "public"."terminal_access"
  as permissive
  for delete
  to authenticated
using ((user_id = auth.uid()));



  create policy "terminal_access_insert_own"
  on "public"."terminal_access"
  as permissive
  for insert
  to authenticated
with check ((user_id = auth.uid()));



  create policy "terminal_access_select_own"
  on "public"."terminal_access"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "terminal_access_update_own"
  on "public"."terminal_access"
  as permissive
  for update
  to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "Enable read access for all users"
  on "public"."terminal_products"
  as permissive
  for select
  to authenticated
using (true);



  create policy "read terminal_products"
  on "public"."terminal_products"
  as permissive
  for select
  to authenticated
using (true);



  create policy "terminal_products_select_auth"
  on "public"."terminal_products"
  as permissive
  for select
  to authenticated
using (true);



  create policy "terminal_products_update_mine"
  on "public"."terminal_products"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.my_terminals mt
  WHERE ((mt.user_id = auth.uid()) AND (mt.terminal_id = terminal_products.terminal_id)))))
with check ((EXISTS ( SELECT 1
   FROM public.my_terminals mt
  WHERE ((mt.user_id = auth.uid()) AND (mt.terminal_id = terminal_products.terminal_id)))));



  create policy "read terminals"
  on "public"."terminals"
  as permissive
  for select
  to authenticated
using (true);



  create policy "terminals_read_auth"
  on "public"."terminals"
  as permissive
  for select
  to authenticated
using (true);



  create policy "terminals_select_authenticated"
  on "public"."terminals"
  as permissive
  for select
  to authenticated
using (true);



  create policy "read trailer_compartments"
  on "public"."trailer_compartments"
  as permissive
  for select
  to authenticated
using (true);



  create policy "trailer_comps_read_auth"
  on "public"."trailer_compartments"
  as permissive
  for select
  to authenticated
using (true);



  create policy "trailers_read_auth"
  on "public"."trailers"
  as permissive
  for select
  to authenticated
using (true);



  create policy "trailers_select"
  on "public"."trailers"
  as permissive
  for select
  to authenticated
using ((company_id IN ( SELECT user_companies.company_id
   FROM public.user_companies
  WHERE (user_companies.user_id = auth.uid()))));



  create policy "trucks_read_auth"
  on "public"."trucks"
  as permissive
  for select
  to authenticated
using (true);



  create policy "trucks_select"
  on "public"."trucks"
  as permissive
  for select
  to authenticated
using ((company_id IN ( SELECT user_companies.company_id
   FROM public.user_companies
  WHERE (user_companies.user_id = auth.uid()))));



  create policy "delete own plan slots"
  on "public"."user_plan_slots"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "read own plan slots"
  on "public"."user_plan_slots"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "update own plan slots"
  on "public"."user_plan_slots"
  as permissive
  for update
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "user_plan_slots_delete_own"
  on "public"."user_plan_slots"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "user_plan_slots_insert_own"
  on "public"."user_plan_slots"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "user_plan_slots_select_own"
  on "public"."user_plan_slots"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "user_plan_slots_update_own"
  on "public"."user_plan_slots"
  as permissive
  for update
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "write own plan slots"
  on "public"."user_plan_slots"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "user_primary_trailers_all"
  on "public"."user_primary_trailers"
  as permissive
  for all
  to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "user_primary_trucks_all"
  on "public"."user_primary_trucks"
  as permissive
  for all
  to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


CREATE TRIGGER trg_set_equipment_combo_name BEFORE INSERT OR UPDATE OF truck_id, trailer_id ON public.equipment_combos FOR EACH ROW EXECUTE FUNCTION public.set_equipment_combo_name();

CREATE TRIGGER trg_load_lines_updated_at BEFORE UPDATE ON public.load_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_updated_timestamp BEFORE UPDATE ON public.load_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_timestamp();

CREATE TRIGGER trg_load_log_updated_at BEFORE UPDATE ON public.load_log FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_updated_timestamp BEFORE UPDATE ON public.load_log FOR EACH ROW EXECUTE FUNCTION public.set_updated_timestamp();

CREATE TRIGGER trg_my_terminals_set_added_on_tz BEFORE INSERT ON public.my_terminals FOR EACH ROW EXECUTE FUNCTION public.my_terminals_set_added_on_tz();

CREATE TRIGGER trg_set_updated_timestamp BEFORE UPDATE ON public.terminal_access FOR EACH ROW EXECUTE FUNCTION public.set_updated_timestamp();

CREATE TRIGGER trg_terminal_access_updated_at BEFORE UPDATE ON public.terminal_access FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_updated_timestamp BEFORE UPDATE ON public.terminal_products FOR EACH ROW EXECUTE FUNCTION public.set_updated_timestamp();

CREATE TRIGGER trg_terminal_products_updated_at BEFORE UPDATE ON public.terminal_products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_user_plan_slots_updated_at BEFORE UPDATE ON public.user_plan_slots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


