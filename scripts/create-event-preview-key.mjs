import { randomBytes, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve, relative, sep, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
if (!process.argv[2])
  throw Error("접속 키를 보관할 저장소 밖의 파일 경로를 지정하세요.");
const output = resolve(process.argv[2]);
const location = relative(root, output);
if (
  !isAbsolute(location) &&
  location !== ".." &&
  !location.startsWith(".." + sep)
)
  throw Error("개인 접속 키는 저장소 밖에 보관해야 합니다.");
const key = randomBytes(32).toString("hex");
writeFileSync(output, key + "\n", { flag: "wx", mode: 0o600 });
const hash = createHash("sha256").update(key).digest("hex");
writeFileSync(
  resolve(root, "deployment/cloudflare/owner-preview-key.mjs"),
  `// Public verifier only. The random 256-bit access key is stored outside the repository.\nexport const OWNER_KEY_HASH = "${hash}";\n`,
);
console.log(
  "개인 접속 키 파일과 공개 검증값을 만들었습니다. 키 값은 출력하지 않습니다.",
);
