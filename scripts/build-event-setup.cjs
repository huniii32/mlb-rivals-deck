const fs = require("node:fs");
const path = require("node:path");
const output = process.argv[2];
if (!output)
  throw Error(
    "Usage: node scripts/build-event-setup.cjs /path/event-setup.sql",
  );
const sql = ["supabase_mig_events.sql", "event-rules-v1.sql"]
  .map((name) => fs.readFileSync(path.join(__dirname, name), "utf8"))
  .join("\n");
fs.writeFileSync(output, sql);
console.log(`Event setup SQL written: ${output}`);
