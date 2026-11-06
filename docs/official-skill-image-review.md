# 공식 스킬 공지 이미지 확인 결과

확인일: 2026-11-06 UTC. [공지 색인](official-skill-notices.md)의 원문 HTML에서 이미지 주소를 추출했습니다.

## 수집 범위

| 항목 | 개수 |
|---|---:|
| 원문 이미지 등장 횟수 | 2,826 |
| OCR 대상으로 선정한 고유 이미지 | 435 |
| 다운로드·OCR 성공 | 274 |
| 원본 주소 HTTP 404 | 160 |
| 32 MiB 다운로드 제한 초과 | 1 |

스킬 제목·섹션·직전 문단의 이미지와 2024-07-01 이전 버전/Live/개발자 공지 이미지를 대상으로 삼았습니다. 모든 공지 이미지 OCR을 완료한 것은 아닙니다. 다운로드 실패 주소도 목록에 보존했습니다. OCR이 성공했다는 것은 텍스트를 추출했다는 뜻이며, 효과표 검수가 완료됐다는 뜻은 아닙니다.

## 원본을 보고 확인한 효과

| 스킬 | 이미지 원문 레벨 | 현재 대응 | 이미지에 표시된 효과 | 공식 근거 |
|---|---|---|---|---|
| 배팅 머신 / BATTING MACHINE | S | S (앱 S0) | POW·CON·VIS 각각 +6 | [도감, 이미지 3](https://community.withhive.com/MLB9IRIVALS/ko/board/23/178) |
| 배팅 머신 / BATTING MACHINE | SS+ | S2 | POW·CON·VIS 각각 +8 | [포지션 훈련, 이미지 6](https://community.withhive.com/MLB9IRIVALS/ko/board/23/6425) |

한국어 능력치 대응은 파워·정확·선구입니다. 캡처 속 효과를 확인한 기록이며, 현행 모든 레벨의 효과나 이후 패치 적용 여부를 확정하지 않습니다. 원문의 게시 날짜와 이미지 수정 날짜는 다를 수 있습니다.

- [도감 이미지 원본](https://hive-fn.qpyou.cn/webdev/hive_community/MLB9IRIVALS/image/20230818_203535_QkPn6GZi1L.jpg)
- [포지션 훈련 이미지 원본](https://hive-fn.qpyou.cn/webdev/hive_community/MLB9IRIVALS/image/2026/08/24/20260824_180747_hH3kJZ2qmE.jpeg)
- 구조화한 검수 기록: [official-skill-image-review.json](official-skill-image-review.json)
- [옛 SS·SS+와 현재 S1·S2의 공식 대응 근거](skill-level-mapping.md)

**클린업 트리오와 타점기계의 정확한 효과표는 이번 OCR에서 확인하지 못했습니다.** 스킬명 목록, 확률표, 이벤트 예시 화면에서는 이름이 나타납니다. `클린업(3·4·5번)`이 적힌 다른 스킬 설명이나 `타점 배틀` 문구도 검색에 걸리므로 이름 검색만으로 효과를 연결하면 안 됩니다.

하드 트레이닝은 기존에 수집한 [v2.06.00 공지](https://community.withhive.com/MLB9IRIVALS/ko/board/9/7711) 본문에 효과표가 있습니다. 이것 역시 해당 공지의 과거 효과입니다.

## 다음 수집 경로

현재 게임 도감에서 설명과 레벨을 함께 확보한 뒤 검수해야 합니다. 캡처 후 스킬명·티어·레벨·조건·수치를 검수하고, 기존 점수 계산과 대조해야 합니다. 이번 자료 수집만으로 앱의 스킬 점수를 바꾸지는 않았습니다.

## 재현

1. `python3 scripts/archive_skill_notices.py --publish-docs`
2. Pillow와 Tesseract의 한국어·영어 모델을 설치합니다. Debian/Ubuntu의 패키지 이름은 `tesseract-ocr`, `tesseract-ocr-kor`, `tesseract-ocr-eng`입니다.
3. `python3 scripts/ocr_skill_notice_images.py --tessdata /usr/share/tesseract-ocr/5/tessdata --bundle`

이번 실행은 Tesseract 5.5.0과 [tessdata_best 한국어 모델](https://github.com/tesseract-ocr/tessdata_best/blob/main/kor.traineddata)을 사용했습니다. 한국어 모델 SHA-256: `f888d4038348a0c3d25151e7f452bda0d74ca275b18cab146798bcbb94084fff`. 모델 종류에 따라 OCR 결과는 달라집니다.

출력: `data/official-skill-images/`. `images/`에 다운로드 원본, `ocr/`에 텍스트·단어 위치·인식 신뢰도, `image-inventory.json`에 원문 연결과 선정 이유, `manifest.json`에 성공/실패 내역이 있습니다. `skill-image-reference.zip`은 원문 링크·OCR 결과를 묶으며 이미지 바이너리와 모델은 제외합니다. 성공 결과는 재사용하고 실패 항목은 다음 실행 때 다시 시도합니다.
