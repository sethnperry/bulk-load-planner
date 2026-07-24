// scripts/seed-demo-account.mjs
//
// One-time (and re-runnable) provisioning for the shareable demo account.
// Run manually via `node scripts/seed-demo-account.mjs` -- never wired into
// the app itself. Uses the service-role key (bypasses RLS), so it must only
// ever be run from a trusted machine, never exposed as an API route.
//
// What it does:
//   1. Finds or creates the demo auth user (magic-link login only, no
//      password needed).
//   2. Finds or creates an isolated demo company (not a real solo-tier
//      account -- is_solo=false, owner_user_id=null).
//   3. Wipes any previously-cloned demo data (safe -- everything it deletes
//      is scoped to the demo company/user; it never touches the source
//      company, which it only ever reads from).
//   4. Clones the source company's equipment/terminals/permits/service/wash/
//      load/weight-record history into the demo company/user, generating
//      fresh UUIDs and remapping every foreign key.
//
// Explicitly NOT cloned (privacy + complexity):
//   - driver_licenses, driver_medical_cards, driver_port_ids,
//     driver_twic_cards, truck_other_permits (personal document data)
//   - attachments, equipment_attachments (file-storage pointers -- the
//     actual files wouldn't exist for the demo user, so the rows would
//     just be broken links)
//   - user_plan_slots, decouple_events (ephemeral/derived state, not
//     needed for a demo)
//
// Required env vars (.env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   DEMO_ACCOUNT_EMAIL       -- the demo account's email (magic-link only)
//   DEMO_SOURCE_COMPANY_ID   -- the real company_id to clone equipment/
//                               permits/service/wash/weight-record data from
//   DEMO_SOURCE_USER_ID      -- the real user_id to clone load history/
//                               terminal cards/starred terminals from

import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_EMAIL = process.env.DEMO_ACCOUNT_EMAIL;
const SOURCE_COMPANY_ID = process.env.DEMO_SOURCE_COMPANY_ID;
const SOURCE_USER_ID = process.env.DEMO_SOURCE_USER_ID;

if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
if (!DEMO_EMAIL) throw new Error("Set DEMO_ACCOUNT_EMAIL in .env.local.");
if (!SOURCE_COMPANY_ID) throw new Error("Set DEMO_SOURCE_COMPANY_ID in .env.local.");
if (!SOURCE_USER_ID) throw new Error("Set DEMO_SOURCE_USER_ID in .env.local.");

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const newId = () => crypto.randomUUID();

// Paginates via .range() so this works regardless of table size (PostgREST
// defaults to a 1000-row cap on a plain .select()).
async function fetchAll(table, filterCol, filterVal) {
  const PAGE = 1000;
  let from = 0;
  const out = [];
  for (;;) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .eq(filterCol, filterVal)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Read ${table} failed: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function insertBatched(table, rows) {
  if (rows.length === 0) return;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin.from(table).insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
  }
}

async function findOrCreateDemoUser() {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((u) => u.email?.toLowerCase() === DEMO_EMAIL.toLowerCase());
  if (existing) {
    console.log("Demo user already exists:", existing.id);
    return existing;
  }
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    email_confirm: true,
  });
  if (createErr) throw createErr;
  console.log("Created demo user:", created.user.id);
  return created.user;
}

async function ensureDemoCompany(demoUserId) {
  const { data: existing } = await admin
    .from("user_companies")
    .select("company_id")
    .eq("user_id", demoUserId)
    .maybeSingle();
  if (existing) {
    console.log("Demo company already exists:", existing.company_id);
    return existing.company_id;
  }
  const companyId = newId();
  const { error: coErr } = await admin
    .from("companies")
    .insert({ company_id: companyId, company_name: "ProTankr Demo", is_solo: false, owner_user_id: null });
  if (coErr) throw coErr;
  const { error: ucErr } = await admin
    .from("user_companies")
    .insert({ user_id: demoUserId, company_id: companyId, role: "admin" });
  if (ucErr) throw ucErr;
  const { error: usErr } = await admin
    .from("user_settings")
    .upsert({ user_id: demoUserId, active_company_id: companyId }, { onConflict: "user_id" });
  if (usErr) throw usErr;
  console.log("Created demo company:", companyId);
  return companyId;
}

async function wipeDemoData(demoUserId, demoCompanyId) {
  console.log("Wiping previously-cloned demo data (if any)...");
  const priorLoads = await fetchAll("load_log", "user_id", demoUserId);
  const priorLoadIds = priorLoads.map((r) => r.load_id);
  if (priorLoadIds.length) await admin.from("load_lines").delete().in("load_id", priorLoadIds);
  await admin.from("load_log").delete().eq("user_id", demoUserId);
  await admin.from("weight_records").delete().eq("company_id", demoCompanyId);
  await admin.from("wash_records").delete().eq("company_id", demoCompanyId);
  await admin.from("service_records").delete().eq("company_id", demoCompanyId);
  await admin.from("service_types").delete().eq("company_id", demoCompanyId);
  await admin.from("equipment_permits").delete().eq("company_id", demoCompanyId);
  await admin.from("permit_types").delete().eq("company_id", demoCompanyId);
  await admin.from("equipment_combos").delete().eq("company_id", demoCompanyId);
  const priorTrailers = await fetchAll("trailers", "company_id", demoCompanyId);
  const priorTrailerIds = priorTrailers.map((r) => r.trailer_id);
  if (priorTrailerIds.length) await admin.from("trailer_compartments").delete().in("trailer_id", priorTrailerIds);
  await admin.from("trailers").delete().eq("company_id", demoCompanyId);
  await admin.from("trucks").delete().eq("company_id", demoCompanyId);
  await admin.from("my_terminals").delete().eq("user_id", demoUserId);
  await admin.from("terminal_access").delete().eq("user_id", demoUserId);
  await admin.from("user_terminal_cards").delete().eq("user_id", demoUserId);
  await admin.from("user_primary_trucks").delete().eq("user_id", demoUserId);
  await admin.from("user_primary_trailers").delete().eq("user_id", demoUserId);
}

async function main() {
  const demoUser = await findOrCreateDemoUser();
  const demoUserId = demoUser.id;
  const demoCompanyId = await ensureDemoCompany(demoUserId);

  await wipeDemoData(demoUserId, demoCompanyId);

  // ── Equipment ──────────────────────────────────────────────────────────
  const trucks = await fetchAll("trucks", "company_id", SOURCE_COMPANY_ID);
  const truckIdMap = new Map();
  const newTrucks = trucks.map((t) => {
    const id = newId();
    truckIdMap.set(t.truck_id, id);
    // truck_name is globally unique (not scoped per company) -- prefix so
    // cloning never collides with the real source company's own unit numbers.
    return { ...t, truck_id: id, truck_name: `DEMO ${t.truck_name}`, company_id: demoCompanyId, in_use_by: null, status_updated_at: null };
  });
  await insertBatched("trucks", newTrucks);
  console.log(`Cloned ${newTrucks.length} trucks`);

  const trailers = await fetchAll("trailers", "company_id", SOURCE_COMPANY_ID);
  const trailerIdMap = new Map();
  const newTrailers = trailers.map((t) => {
    const id = newId();
    trailerIdMap.set(t.trailer_id, id);
    // trailer_name is globally unique too -- same prefix treatment as trucks.
    return { ...t, trailer_id: id, trailer_name: `DEMO ${t.trailer_name}`, company_id: demoCompanyId, in_use_by: null, status_updated_at: null };
  });
  await insertBatched("trailers", newTrailers);
  console.log(`Cloned ${newTrailers.length} trailers`);

  const allCompartments = [];
  for (const [oldTrailerId, newTrailerId] of trailerIdMap) {
    const comps = await fetchAll("trailer_compartments", "trailer_id", oldTrailerId);
    for (const c of comps) allCompartments.push({ ...c, trailer_id: newTrailerId });
  }
  await insertBatched("trailer_compartments", allCompartments);
  console.log(`Cloned ${allCompartments.length} trailer_compartments`);

  const combos = await fetchAll("equipment_combos", "company_id", SOURCE_COMPANY_ID);
  const comboIdMap = new Map();
  const newCombos = combos.map((c) => {
    const id = newId();
    comboIdMap.set(c.combo_id, id);
    return {
      ...c,
      combo_id: id,
      // combo_name is globally unique too.
      combo_name: `DEMO ${c.combo_name}`,
      company_id: demoCompanyId,
      truck_id: truckIdMap.get(c.truck_id) ?? c.truck_id,
      trailer_id: trailerIdMap.get(c.trailer_id) ?? c.trailer_id,
      claimed_by: null,
      claimed_at: null,
    };
  });
  await insertBatched("equipment_combos", newCombos);
  console.log(`Cloned ${newCombos.length} equipment_combos`);

  // ── Permits ────────────────────────────────────────────────────────────
  const permitTypes = await fetchAll("permit_types", "company_id", SOURCE_COMPANY_ID);
  const permitTypeIdMap = new Map();
  const newPermitTypes = permitTypes.map((p) => {
    const id = newId();
    permitTypeIdMap.set(p.permit_type_id, id);
    return { ...p, permit_type_id: id, company_id: demoCompanyId };
  });
  await insertBatched("permit_types", newPermitTypes);
  console.log(`Cloned ${newPermitTypes.length} permit_types`);

  const equipmentPermits = await fetchAll("equipment_permits", "company_id", SOURCE_COMPANY_ID);
  const newEquipmentPermits = equipmentPermits.map((p) => ({
    ...p,
    equipment_permit_id: newId(),
    company_id: demoCompanyId,
    truck_id: p.truck_id ? truckIdMap.get(p.truck_id) ?? p.truck_id : null,
    trailer_id: p.trailer_id ? trailerIdMap.get(p.trailer_id) ?? p.trailer_id : null,
    permit_type_id: permitTypeIdMap.get(p.permit_type_id) ?? p.permit_type_id,
  }));
  await insertBatched("equipment_permits", newEquipmentPermits);
  console.log(`Cloned ${newEquipmentPermits.length} equipment_permits`);

  // ── Service / wash ─────────────────────────────────────────────────────
  const serviceTypes = await fetchAll("service_types", "company_id", SOURCE_COMPANY_ID);
  const serviceTypeIdMap = new Map();
  const newServiceTypes = serviceTypes.map((s) => {
    const id = newId();
    serviceTypeIdMap.set(s.service_type_id, id);
    return { ...s, service_type_id: id, company_id: demoCompanyId };
  });
  await insertBatched("service_types", newServiceTypes);
  console.log(`Cloned ${newServiceTypes.length} service_types`);

  const serviceRecords = await fetchAll("service_records", "company_id", SOURCE_COMPANY_ID);
  const newServiceRecords = serviceRecords.map((s) => ({
    ...s,
    service_record_id: newId(),
    company_id: demoCompanyId,
    truck_id: s.truck_id ? truckIdMap.get(s.truck_id) ?? s.truck_id : null,
    trailer_id: s.trailer_id ? trailerIdMap.get(s.trailer_id) ?? s.trailer_id : null,
    service_type_id: serviceTypeIdMap.get(s.service_type_id) ?? s.service_type_id,
    created_by: demoUserId,
  }));
  await insertBatched("service_records", newServiceRecords);
  console.log(`Cloned ${newServiceRecords.length} service_records`);

  const washRecords = await fetchAll("wash_records", "company_id", SOURCE_COMPANY_ID);
  const newWashRecords = washRecords.map((w) => ({
    ...w,
    wash_record_id: newId(),
    company_id: demoCompanyId,
    truck_id: w.truck_id ? truckIdMap.get(w.truck_id) ?? w.truck_id : null,
    trailer_id: w.trailer_id ? trailerIdMap.get(w.trailer_id) ?? w.trailer_id : null,
    created_by: demoUserId,
  }));
  await insertBatched("wash_records", newWashRecords);
  console.log(`Cloned ${newWashRecords.length} wash_records`);

  // ── Terminal associations (user-scoped, not company-scoped) ──────────────
  const myTerminals = await fetchAll("my_terminals", "user_id", SOURCE_USER_ID);
  await insertBatched("my_terminals", myTerminals.map((m) => ({ ...m, user_id: demoUserId })));
  console.log(`Cloned ${myTerminals.length} my_terminals`);

  const terminalAccess = await fetchAll("terminal_access", "user_id", SOURCE_USER_ID);
  await insertBatched("terminal_access", terminalAccess.map((t) => ({ ...t, id: newId(), user_id: demoUserId })));
  console.log(`Cloned ${terminalAccess.length} terminal_access`);

  const terminalCards = await fetchAll("user_terminal_cards", "user_id", SOURCE_USER_ID);
  await insertBatched("user_terminal_cards", terminalCards.map((c) => ({ ...c, id: newId(), user_id: demoUserId })));
  console.log(`Cloned ${terminalCards.length} user_terminal_cards`);

  const primaryTrucks = await fetchAll("user_primary_trucks", "user_id", SOURCE_USER_ID);
  await insertBatched(
    "user_primary_trucks",
    primaryTrucks.filter((p) => truckIdMap.has(p.truck_id)).map((p) => ({ ...p, user_id: demoUserId, truck_id: truckIdMap.get(p.truck_id) }))
  );
  console.log(`Cloned ${primaryTrucks.length} user_primary_trucks`);

  const primaryTrailers = await fetchAll("user_primary_trailers", "user_id", SOURCE_USER_ID);
  await insertBatched(
    "user_primary_trailers",
    primaryTrailers.filter((p) => trailerIdMap.has(p.trailer_id)).map((p) => ({ ...p, user_id: demoUserId, trailer_id: trailerIdMap.get(p.trailer_id) }))
  );
  console.log(`Cloned ${primaryTrailers.length} user_primary_trailers`);

  // ── Load history ───────────────────────────────────────────────────────
  const loads = await fetchAll("load_log", "user_id", SOURCE_USER_ID);
  const loadIdMap = new Map();
  const newLoads = loads.map((l) => {
    const id = newId();
    loadIdMap.set(l.load_id, id);
    return { ...l, load_id: id, user_id: demoUserId, combo_id: l.combo_id ? comboIdMap.get(l.combo_id) ?? l.combo_id : null };
  });
  await insertBatched("load_log", newLoads);
  console.log(`Cloned ${newLoads.length} load_log rows`);

  const allLines = [];
  for (const l of loads) {
    const lines = await fetchAll("load_lines", "load_id", l.load_id);
    for (const ln of lines) allLines.push({ ...ln, load_id: loadIdMap.get(l.load_id) });
  }
  await insertBatched("load_lines", allLines);
  console.log(`Cloned ${allLines.length} load_lines rows`);

  // ── Weight records ─────────────────────────────────────────────────────
  const weightRecords = await fetchAll("weight_records", "company_id", SOURCE_COMPANY_ID);
  const newWeightRecords = weightRecords.map((w) => {
    // net_weight_lbs is a generated/computed column -- must not be included in the insert.
    const { net_weight_lbs, ...rest } = w;
    return {
      ...rest,
      weight_record_id: newId(),
      company_id: demoCompanyId,
      combo_id: comboIdMap.get(w.combo_id) ?? w.combo_id,
      load_id: w.load_id ? loadIdMap.get(w.load_id) ?? null : null,
      created_by: demoUserId,
    };
  });
  await insertBatched("weight_records", newWeightRecords);
  console.log(`Cloned ${newWeightRecords.length} weight_records`);

  console.log("\nDone.");
  console.log("Set these in .env.local and Vercel:");
  console.log(`  DEMO_ACCOUNT_EMAIL=${DEMO_EMAIL}`);
  console.log(`  NEXT_PUBLIC_DEMO_USER_ID=${demoUserId}`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
