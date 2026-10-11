# 미리보기 공개 배포 지시 (광희님, 2026-10-12)

지금 바로 미리보기를 공개 주소로 올려줘. 010 판정의 다른 수정보다 먼저.

1. main(공개 루트)은 지금 그대로(artEnabled=false).
2. order-009 현재 커밋(e159fc3)을 artEnabled=true로 빌드해서 https://gerrardkh-cyber.github.io/contractor-tycoon/preview/ 에 함께 배포. 같은 Pages 워크플로에서 두 번 빌드해 하위 폴더로 합침. 미리보기 저장 키는 본편과 분리. 화면 우상단에 작게 "PREVIEW".
3. 배포 후 그 주소를 헤드리스로 열어 타이틀이 뜨는지 확인하고, 주소 한 줄만 보고.
4. CLAUDE.md에 규칙 추가: "광희님에게 화면 확인용으로 localhost 주소를 주지 않는다. 광희님은 휴대폰 원격으로 보는 경우가 많다. 확인용 주소는 항상 GitHub Pages 공개 주소(본편 또는 /preview/)로 준다."

그다음 010 판정 1~6을 이어서 진행하고, 끝나면 /preview/를 갱신 배포.
