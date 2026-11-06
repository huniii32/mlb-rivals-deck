import { PGlite } from "@electric-sql/pglite";
import wasmUrl from "../../node_modules/@electric-sql/pglite/dist/pglite.wasm?url";
import initUrl from "../../node_modules/@electric-sql/pglite/dist/initdb.wasm?url";
import dataUrl from "../../node_modules/@electric-sql/pglite/dist/pglite.data?url";
import migration from "../../scripts/supabase_mig_events.sql?raw";
import rules from "../../scripts/event-rules-v1.sql?raw";
import type { eventRequest, EventState } from "../lib/events";
import type { RankRef } from "../lib/deckFile";

const EVENT = "browser-demo";
const DATABASE = "rivals-event-web-demo-v1";
const ADMIN = "33333333-3333-4333-8333-333333333333";
export type DemoRole = "alice" | "bob" | "admin" | "guest";
export const demoPeople = {
  alice: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "테스트 다저스",
    token: "browser-demo-alice-only",
  },
  bob: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "테스트 양키스",
    token: "browser-demo-bob-only",
  },
};
const ARGUMENTS: Record<string, string[]> = {
  get: ["p_event", "p_ranking_id", "p_token"],
  join: ["p_event", "p_ranking_id", "p_token"],
  attempt: ["p_event", "p_request_id", "p_ranking_id", "p_token"],
  experience: ["p_event", "p_mission", "p_ranking_id", "p_token"],
  pick_moment: ["p_event", "p_slot", "p_ranking_id", "p_token"],
  claim: ["p_event", "p_mission", "p_ranking_id", "p_token"],
  admin: ["p_event", "p_action"],
};
async function createDemoDb() {
  const [wasm, init, fs] = await Promise.all([
    fetch(wasmUrl).then((r) => {
      if (!r.ok) throw Error("engine_download");
      return r.arrayBuffer();
    }),
    fetch(initUrl).then((r) => {
      if (!r.ok) throw Error("engine_download");
      return r.arrayBuffer();
    }),
    fetch(dataUrl).then((r) => {
      if (!r.ok) throw Error("engine_download");
      return r.blob();
    }),
  ]);
  const [pgliteWasmModule, initdbWasmModule] = await Promise.all([
    WebAssembly.compile(wasm),
    WebAssembly.compile(init),
  ]);
  const db = await PGlite.create({
    dataDir: `idb://${DATABASE}`,
    pgliteWasmModule,
    initdbWasmModule,
    fsBundle: fs,
  });
  const initialized = (
    await db.query<{ name: string | null }>(
      "select to_regclass('public.sim_events') as name",
    )
  ).rows[0].name;
  if (!initialized) {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.rankings(id uuid primary key,deck_name text,total numeric,sp numeric,rp numeric,bt numeric,named integer,deck_json jsonb,created_at timestamptz default now());
      create table public.inquiries(id uuid,name text,body text,reply text,created_at timestamptz);
      create table public.ranking_password_sessions(ranking_id uuid,token_hash text);
      create function public._ranking_hash(p text) returns text language sql immutable strict as $$ select encode(sha256(convert_to(p,'UTF8')),'hex') $$;
    `);
    await db.exec(migration);
    await db.exec(rules);
    const players = [
      "베츠",
      "프리먼",
      "오타니",
      "스미스",
      "먼시",
      "에드먼",
      "테오스카",
      "키케",
      "파헤스",
      "커쇼",
      "그레인키",
      "다르빗슈",
      "야마모토",
      "스넬",
      "켈리",
      "트라이넨",
      "그라테롤",
      "잰슨",
    ];
    for (const p of Object.values(demoPeople)) {
      await db.query(
        "insert into rankings(id,deck_name,total,named,deck_json) values($1,$2,4000,18,$3)",
        [
          p.id,
          p.name,
          {
            name: p.name,
            players: players.map((name) => ({ name, card: "시그니처" })),
          },
        ],
      );
      await db.query(
        "insert into ranking_password_sessions values($1,public._ranking_hash($2))",
        [p.id, p.token],
      );
    }
    await db.query(
      "insert into auth.users values($1,'operator@demo.invalid',now())",
      [ADMIN],
    );
    await db.query("insert into sim_event_admins values($1)", [ADMIN]);
    await db.query(
      "insert into sim_events(id,title,rules_id,opens_at,published) values($1,'스킬 챌린지 & 커피 이벤트','coffee-sp-s-v1',now()-interval '1 day',true)",
      [EVENT],
    );
  }
  return db;
}
let pending: Promise<PGlite> | undefined;
export function openDemoDb(): Promise<PGlite> {
  if (!pending)
    pending = new Promise((resolve, reject) => {
      if (!navigator.locks) {
        reject(Error("browser_not_supported"));
        return;
      }
      // PGlite IndexedDB is single-writer. Another tab should explain the conflict.
      void navigator.locks
        .request(DATABASE, { ifAvailable: true }, async (lock) => {
          if (!lock) {
            reject(Error("another_demo_tab"));
            return;
          }
          try {
            resolve(await createDemoDb());
            await new Promise(() => {});
          } catch (e) {
            reject(e);
          }
        })
        .catch(reject);
    });
  return pending;
}
export function demoAdapter(
  db: PGlite,
  role: DemoRole,
): { request: typeof eventRequest; storageKey: string; deck?: RankRef } {
  const person =
    role === "alice" || role === "bob" ? demoPeople[role] : undefined;
  return {
    storageKey: EVENT,
    deck: person
      ? { id: person.id, token: person.token, password: true }
      : undefined,
    async request(action, args = {}, deck) {
      const names = ARGUMENTS[action];
      if (!names) throw Error("invalid_demo_action");
      const values: Record<string, unknown> = {
        p_event: EVENT,
        ...args,
        p_ranking_id: deck?.id ?? null,
        p_token: deck?.token ?? null,
      };
      return db.transaction(async (tx) => {
        await tx.exec(
          `set local role ${role === "admin" ? "authenticated" : "anon"}`,
        );
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
          role === "admin" ? ADMIN : "",
        ]);
        const result = await tx.query<{ result: EventState }>(
          `select public.event_${action}(${names.map((_, i) => `$${i + 1}`).join(",")}) as result`,
          names.map((n) => values[n]),
        );
        return result.rows[0].result;
      });
    },
  };
}
export async function resetDemo(db: PGlite) {
  await db.transaction(async (tx) => {
    await tx.exec(
      "truncate sim_event_audit,sim_event_experiences,sim_event_tickets,sim_event_evidence,sim_event_attempts,sim_event_participants,sim_events restart identity",
    );
    await tx.query(
      "insert into sim_events(id,title,rules_id,opens_at,published) values($1,'스킬 챌린지 & 커피 이벤트','coffee-sp-s-v1',now()-interval '1 day',true)",
      [EVENT],
    );
  });
  for (const key of Object.keys(localStorage))
    if (key.startsWith(`rivals-event-request:${EVENT}:`))
      localStorage.removeItem(key);
}
