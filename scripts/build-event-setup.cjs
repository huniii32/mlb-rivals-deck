const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const output = process.argv[2];
if (!output)
  throw Error(
    "Usage: node scripts/build-event-setup.cjs /path/event-setup.sql",
  );
let sql = ["supabase_mig_events.sql", "event-rules-v1.sql", "supabase_mig_event_operator.sql"]
  .map((name) => fs.readFileSync(path.join(__dirname, name), "utf8"))
  .join("\n");
if (process.argv[3] === "--owner") {
  const dir = path.resolve(process.argv[4] || path.dirname(output));
  const root = path.resolve(__dirname, "..");
  for (const target of [dir, path.resolve(output)]) {
    if (target === root || target.startsWith(root + path.sep))
      throw Error("Write owner credentials and provisioning SQL outside the repository.");
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const credentials = path.join(dir, "event-admin-credentials.json");
  const owner = fs.existsSync(credentials)
    ? JSON.parse(fs.readFileSync(credentials, "utf8"))
    : { id: crypto.randomUUID(), password: crypto.randomBytes(32).toString("hex") };
  if (!/^[a-f0-9-]{36}$/.test(owner.id) || !/^[a-f0-9]{64}$/.test(owner.password))
    throw Error("Invalid operator credential file");
  fs.writeFileSync(credentials, JSON.stringify(owner), { mode: 0o600 });
  const hash = crypto.createHash("sha256").update(owner.password).digest("hex");
  sql += `\nbegin;
insert into public.sim_event_admins(user_id) values('${owner.id}') on conflict do nothing;
insert into public.sim_event_operator_credentials(user_id,password_hash) values('${owner.id}','${hash}')
  on conflict(user_id) do update set password_hash=excluded.password_hash;
delete from public.sim_event_operator_sessions where user_id='${owner.id}';
-- Open the participant page now; preserve the agreed Monday 00:00 KST challenge start.
update public.sim_events set published=true where id='coffee-20261109';
notify pgrst, 'reload schema';
commit;\n`;
  fs.writeFileSync(path.join(dir, "event-admin-login.txt"),
    `이벤트 관리자 접속 정보\n주소: https://mlb-rivals-deck.pages.dev/event-control/\n비밀번호: ${owner.password}\n\n먼저 함께 전달한 event-setup.sql을 Supabase SQL Editor에서 실행해주세요.\n관리자 비밀번호는 공개 게시글에 올리지 마세요. 로그인은 1시간 유지됩니다.\n기존 미리보기용 개인 접속 키와는 별개의 비밀번호입니다.\n`, { mode: 0o600 });
}
fs.writeFileSync(output, sql, { mode: 0o600 });
console.log(`Event setup SQL written: ${output}`);
