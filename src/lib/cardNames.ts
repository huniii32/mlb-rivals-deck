/** 화면 표기만 정리한다. 기존 덱과 엑셀 계산표의 카드 키는 그대로 사용한다. */
export function cardDisplayName(card: string): string {
  return card.replace(/(?:(WBC|FA)\s*)?시그니처\s*블랙/g, (_, prefix: string | undefined) => `${prefix ? prefix + " " : ""}블랙 시그니처`);
}

export function shortCardName(card: string): string {
  return cardDisplayName(card)
    .replace("WBC 블랙 시그니처", "WBC블시")
    .replace("FA 블랙 시그니처", "FA블시")
    .replace("블랙 시그니처", "블시")
    .replace("FA 시그니처", "FA시그")
    .replace("WBC 시그니처", "WBC시그")
    .replace("슈프림 모먼트", "슈모")
    .replace("명예의 전당", "HOF")
    .replace("FA 프라임", "FA프")
    .replace("WBC 프라임", "WBC프");
}
