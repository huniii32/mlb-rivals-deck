import * as XLSX from "xlsx";
import type { Grade, Player } from "../types";
import { GRADES, newId } from "./grades";

const HEADERS = ["이름", "팀", "포지션", "등급", "오버롤", "레벨", "비고"] as const;

function normalizeGrade(v: string): Grade {
  const t = v.trim();
  if ((GRADES as string[]).includes(t)) return t as Grade;
  const upper = t.toUpperCase();
  if (upper === "S" || upper === "A" || upper === "B" || upper === "C") return upper as Grade;
  return "A";
}

export async function parsePlayerFile(file: File): Promise<Player[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rows
    .filter((r) => String(r["이름"] ?? r["name"] ?? "").trim() !== "")
    .map((r) => ({
      id: newId(),
      name: String(r["이름"] ?? r["name"] ?? "").trim(),
      team: String(r["팀"] ?? r["team"] ?? "").trim(),
      position: String(r["포지션"] ?? r["position"] ?? "DH").trim().toUpperCase(),
      grade: normalizeGrade(String(r["등급"] ?? r["grade"] ?? "A")),
      overall: Number(r["오버롤"] ?? r["overall"] ?? 0) || 0,
      level: Number(r["레벨"] ?? r["level"] ?? 1) || 1,
      note: String(r["비고"] ?? r["note"] ?? ""),
    }));
}

export function templateHeaders(): string[] {
  return [...HEADERS];
}
