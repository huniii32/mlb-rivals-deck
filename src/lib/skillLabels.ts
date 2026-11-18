/** 닫는 괄호 뒤의 O/X도 보존한다. 예: 파워 피쳐(구속>인내) X */
export function skillCondition(name: string): string {
  const start = name.indexOf("(");
  if (start < 0) return "조건 없음";
  const end = name.lastIndexOf(")");
  if (end <= start) return name.slice(start + 1).trim();
  const condition = name.slice(start + 1, end).trim();
  const suffix = name.slice(end + 1).trim();
  return suffix ? `${condition} · ${suffix}` : condition;
}
