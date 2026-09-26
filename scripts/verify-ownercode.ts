import { formatCode, normalizeCode } from "../src/lib/ownerCode";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  if (cond) pass++;
  else { fail++; console.log("FAIL:", label); }
};

const HEX = "0123456789ABCDEF0123";
check("plain hex", normalizeCode(HEX) === HEX);
check("lowercase -> upper", normalizeCode(HEX.toLowerCase()) === HEX);
check("dashes", normalizeCode("01234-56789-ABCDE-F0123") === HEX);
check("spaces/mixed separators + trim", normalizeCode("  01234 56789_abcde.f0123\n") === HEX);
check("19 chars -> null", normalizeCode(HEX.slice(0, 19)) === null);
check("21 chars -> null", normalizeCode(HEX + "A") === null);
check("non-hex letter -> null", normalizeCode("G123456789ABCDEF0123") === null);
check("empty -> null", normalizeCode("") === null);
check("format", formatCode(HEX) === "01234-56789-ABCDE-F0123");
check("roundtrip", normalizeCode(formatCode(HEX)) === HEX);
check("format(normalize(lower dashed))", formatCode(normalizeCode("abcde-01234-abcde-01234")!) === "ABCDE-01234-ABCDE-01234");

console.log(`pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
