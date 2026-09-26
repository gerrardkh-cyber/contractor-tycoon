# 배포 절차 — 테스터에게 보내기

> 발주서 006 §5 에서 절차로 작성했고, 이후 광희님 지시로 **실제 배포까지 마쳤습니다.**
> 공개 주소는 이 문서 §2-3 에 있습니다.

이 게임은 **정적 사이트**입니다. 서버·데이터베이스·빌드 백엔드가 없고,
`index.html` 하나와 `assets/` 폴더가 전부입니다. 그래서 파일을 올릴 수 있는 곳이면 어디서든 돌아갑니다.

---

## 0. 만들기

```bash
npm run package
```

`tsc` 검사 → `vite build` → `dist/` 를 `contractor-tycoon.zip` 으로 묶습니다.
zip 안에는 `index.html` 과 `assets/` 만 들어갑니다 — 9개 파일, 압축 전 163KB, **압축 후 약 81KB**.

`.gitignore` 에 `*.zip` 이 있으므로 이 파일은 저장소에 들어가지 않습니다.

### 나가기 전 확인

```bash
npm test          # 전부 통과해야 합니다
npm run build     # tsc 경고 0
du -sh dist       # 20MB 미만 (현재 약 170KB, 그중 JS 109KB)
```

`dist/index.html` 을 열어 `src=` / `href=` 에 `http://` 나 `https://` 로 시작하는 주소가
하나도 없어야 합니다. 있으면 오프라인에서 깨집니다 — `tests/architecture.test.ts` 가 이것을 막고 있습니다.

---

## 1. 가장 간단한 방법 — zip 을 그대로 전달

테스터가 개발자라면 이것으로 충분합니다.

1. `contractor-tycoon.zip` 을 보냅니다.
2. 받은 쪽에서 압축을 풉니다.
3. `index.html` 을 **더블클릭**합니다.

`vite.config.ts` 의 `base: './'` 덕분에 `file://` 로 열어도 동작합니다.
서버도, 인터넷 연결도 필요 없습니다.

> 브라우저에 따라 `file://` 에서 소리가 막힐 수 있습니다. 소리까지 확인받아야 하면 아래 2번 이후를 쓰세요.

---

## 2. GitHub Pages — 링크로 보내기

주소 하나만 보내면 되므로 테스터가 여럿일 때 가장 편합니다. 무료이고, 저장소가 공개면 설정도 한 번입니다.

### 2-1. 한 번만 하는 설정

```bash
# 아직 원격이 없다면
gh repo create contractor-tycoon --public --source=. --remote=origin
git push -u origin main
```

GitHub 저장소 → **Settings → Pages** →
**Source** 를 `GitHub Actions` 로 지정합니다.

### 2-2. 워크플로 파일

`.github/workflows/pages.yml` — **이 저장소에 실제로 들어 있습니다.**

```yaml
name: Deploy to Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

`main` 에 푸시할 때마다 테스트를 돌리고, 통과하면 배포합니다.
테스트가 깨지면 배포되지 않습니다 — 그것이 이 순서의 이유입니다.

### 2-3. 주소 — **배포 완료**

```
https://gerrardkh-cyber.github.io/contractor-tycoon/
```

저장소: <https://github.com/gerrardkh-cyber/contractor-tycoon> (공개)

`base: './'` 이므로 하위 경로(`/contractor-tycoon/`)에서도 그대로 돌아갑니다.
`vite.config.ts` 를 고칠 필요가 없었습니다.

**배포 후 실측** (헤드리스 Chrome, 2026-09-27):

| 항목 | 결과 |
|---|---|
| HTTP | `200`, HTTPS 강제(`strict-transport-security`) |
| 첫 화면 | `컨트랙터 타이쿤` — 브라우저 언어 감지로 한국어 |
| 게임 진입 | 현금 `$95,000`, 공고 3건, 슬롯 3칸 |
| 수주 후 | 현장 1곳 + 크레인 생성 — 시뮬레이션이 실제로 진행됨 |
| **외부 요청** | **0건** — CDN 의존 없음이 배포 환경에서도 확인됨 |
| **콘솔 에러** | **0건** |

---

## 3. 대안

| 방법 | 언제 | 절차 |
|---|---|---|
| **Netlify Drop** | 계정·설정 없이 지금 당장 | <https://app.netlify.com/drop> 에 `dist` 폴더를 끌어다 놓으면 즉시 주소가 나옵니다 |
| **Cloudflare Pages** | 링크를 오래 유지 | 저장소 연결 → 빌드 `npm run build`, 출력 `dist` |
| **Vercel** | 위와 동일 | 프레임워크 `Other`, 출력 `dist` |
| **itch.io** | 게이머에게 붙이기 | 새 프로젝트 → Kind `HTML` → zip 업로드 → "This file will be played in the browser" 체크 |

Netlify Drop 은 가입 없이 임시 주소를 주므로 **하루 이틀 테스트에 가장 빠릅니다.**

---

## 4. CrazyGames 제출 (최종 목표)

포털 제출은 테스터 배포와 요건이 다릅니다. 지금 시점의 충족 상태를 적어 둡니다.

| 요건 | 상태 |
|---|---|
| `index.html` 하나 + `assets/` | ✅ |
| 외부 CDN 의존 0 | ✅ (`tests/architecture.test.ts` 가 강제) |
| 빌드 20MB 미만 | ✅ 약 170KB |
| 초기 로딩 10초 미만 | ✅ 1초 미만 |
| 모바일 동작 | ✅ 390px 확인 |
| 광고 SDK 연동 | ❌ **미연동.** 훅만 있고 `theme.adHooksEnabled = false` |
| 사운드 라이선스 | ✅ CC0 (`docs/ASSETS.md`) |

광고 SDK 는 별도 발주서가 필요합니다. 지금 제출하면 광고 없이 돌아갑니다.

---

## 5. 테스터에게 함께 보낼 안내문

> **컨트랙터 타이쿤 — 테스트 빌드**
>
> - 주소: <https://gerrardkh-cyber.github.io/contractor-tycoon/>
> - 우측 상단에서 **EN / KO** 를 바꿀 수 있습니다.
> - 소리는 기본이 꺼져 있습니다. 우측 상단 스피커로 켜세요.
> - 처음부터 다시 하려면 첫 화면의 **새로 시작**을 누르세요.
> - 저장은 브라우저에 남습니다. 창을 닫아도 진행은 이어집니다.
> - 자리를 비운 동안에도 공사는 진행됩니다 (최대 8시간).
>
> **봐 주셨으면 하는 것**
> 1. 첫 30초에 무엇을 해야 할지 알 수 있었는지
> 2. 검사에 떨어졌을 때 왜 떨어졌는지 납득이 됐는지
> 3. 돈이 막혔을 때 빠져나갈 길이 보였는지
> 4. 한국어 용어가 현장에서 쓰는 말과 맞는지

---

## 6. 롤백

Pages 배포는 커밋 단위입니다. 되돌리려면 이전 커밋으로 되돌려 푸시하면 됩니다.

```bash
git revert <문제 커밋>
git push
```

zip 으로 보낸 빌드는 회수할 수 없으므로, 테스터에게 **새 zip 을 보내고 이전 것을 버리라고** 알려야 합니다.
