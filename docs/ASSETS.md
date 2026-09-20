# 외부 에셋 목록

이 프로젝트가 코드로 그리지 않고 파일로 포함하는 에셋 전부입니다.
그림은 한 장도 없습니다 — 아이콘·건물·크레인·파비콘은 모두 인라인 SVG로 코드에서 그립니다.

## 사운드 (6종)

| 용도 | 파일 | 원본 파일명 | 크기 |
|---|---|---|---|
| 클릭 | `src/ui/sounds/click.ogg` | `click_001.ogg` | 4,876 B |
| 낙찰 | `src/ui/sounds/awarded.ogg` | `confirmation_004.ogg` | 12,391 B |
| 검사 통과 | `src/ui/sounds/pass.ogg` | `confirmation_001.ogg` | 8,968 B |
| 검사 실패 | `src/ui/sounds/fail.ogg` | `error_006.ogg` | 8,288 B |
| 기성 입금 | `src/ui/sounds/payment.ogg` | `pluck_002.ogg` | 6,941 B |
| 준공(CO) | `src/ui/sounds/handover.ogg` | `maximize_006.ogg` | 11,618 B |

**합계 53,082 B (약 52 KB).** 발주서 004 §5 상한 500 KB의 약 10%입니다.

### 출처와 라이선스

- **팩 이름**: Interface Sounds (1.0)
- **제작·배포**: Kenney — <https://kenney.nl>
- **받은 곳**: <https://kenney.nl/assets/interface-sounds>
- **라이선스**: **Creative Commons Zero (CC0 1.0)**
  <http://creativecommons.org/publicdomain/zero/1.0/>
- **원문**: "This content is free to use in personal, educational and commercial
  projects. Support us by crediting Kenney or www.kenney.nl (this is not mandatory)"
- **제작일**: 2020-02-11 / **받은 날짜**: 2026-09-21

CC0이므로 크레딧 의무는 없지만, 관례에 따라 여기에 기록합니다.
상업적 이용·재배포·수정이 모두 허용되며 CrazyGames 제출에 제약이 없습니다.

### 처리 내역

원본 `.ogg`를 **재인코딩 없이 그대로** 복사하고 용도에 맞게 파일명만 바꿨습니다.
잘라내기·볼륨 조정·포맷 변환을 하지 않았으므로 원본과 바이트 단위로 동일합니다.

### 번들 방식

`src/ui/sound.ts`가 `import`로 참조하고 Vite가 `assets/`에 해시 파일명으로 내보냅니다.
런타임에 네트워크로 받아오는 것은 없고, 빌드 결과만으로 오프라인에서 재생됩니다.
기본값은 **음소거**이며, 켜기 전에는 디코딩조차 하지 않습니다.

## 폰트

**없음.** 웹폰트를 받지 않고 시스템 폰트 스택만 씁니다 (`src/ui/theme.ts`의 `font.stack`).
로딩 시간을 쓰지 않기 위한 발주서 004 §1 규칙입니다.

## 이미지

**없음.** 파비콘까지 `src/ui/icons.ts`가 SVG 문자열로 만들어 data URL로 넣습니다.
