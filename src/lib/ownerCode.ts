const KEY = "rivals-owner-code";

/** 내 덱 코드 = 이 브라우저 localStorage에만 보관. 파일·공유링크·p_deck·로그에는 절대 넣지 않는다 (rpc 인자로만 나감) */
export const loadOwnerCode = (): string | null => {
  try {
    return normalizeCode(localStorage.getItem(KEY) ?? "");
  } catch {
    return null;
  }
};

export const saveOwnerCode = (code: string) => {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // 저장 실패해도 이번 세션은 state로 동작
  }
};

/** 입력 정리: 영숫자만 남겨 대문자화, 16진 20자가 아니면 null */
export const normalizeCode = (s: string): string | null => {
  const t = s.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return /^[0-9A-F]{20}$/.test(t) ? t : null;
};

/** 20자 → XXXXX-XXXXX-XXXXX-XXXXX */
export const formatCode = (hex: string): string => hex.match(/.{5}/g)?.join("-") ?? hex;
