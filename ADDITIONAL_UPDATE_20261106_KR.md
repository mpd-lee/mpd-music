# MPD Music Studio 추가 수정 사항 (2026-11-06)

## 이번 수정의 핵심

1. 좌측 상단 `[MPD] MPD Music Studio` 브랜드 링크를 `https://mpd-music.carrd.co`로 변경했습니다.
2. 여러 장의 직사각형 배경판처럼 보이던 풍경 표현을 제거했습니다. 기존의 직사각형 equirectangular 배경 대신, 하나의 360도 파노라마 사진을 원형 실린더 안쪽 면에 매핑하는 방식으로 바꿨습니다.
3. 파노라마 가장자리의 좌우 이음새를 부드럽게 보정한 데스크톱/모바일 이미지를 새로 추가했습니다.
4. 파노라마 중앙의 바다 전망은 스튜디오 정면(-Z)을 향하고, 이미지 좌우의 숲·해안 나무가 스튜디오 측면과 뒤쪽으로 이어지도록 배치했습니다.
5. 섬 아래 바다 디스크는 기존 360도 원형에서 정면 180도 반원으로 바꿨습니다. 뒤쪽 반구는 바다가 아니라 잔디 지형과 숲으로 이어집니다.
6. 섬 표면의 밝은 모래/돌 재질 링을 제거하고, 상부 지형을 연속된 잔디 재질로 통일했습니다. 가장자리의 바위 절벽은 유지합니다.
7. 나무는 앞쪽 바다 시야의 중앙을 비우고, 좌우 가장자리와 뒤쪽 180도에 지형 높이에 맞춰 배치했습니다. 나무 수와 잎 수는 기기 성능별로 줄이며, 모바일에서도 아주 약한 바람 움직임을 유지합니다.

## 변경 파일

- `components/studio/studio-app.tsx`
- `components/studio/scene/room.tsx`
- `components/studio/scene/island-terrain.tsx`
- `components/studio/scene/outdoor.tsx`
- `public/images/mpd-coastal-horizon-wrap.webp`
- `public/images/mpd-coastal-horizon-wrap-mobile.webp`

그 외 기존 파일과 기존 기능은 삭제하지 않았습니다.

## 실행

프로젝트 최상위 폴더에서 VS Code 터미널을 열고 실행합니다.

```powershell
pnpm install
pnpm dev
```

로컬 화면 확인 주소: `http://localhost:3000`

프로덕션 빌드:

```powershell
pnpm build
```

기존 Vercel 프로젝트에 배포:

```powershell
vercel --prod
```

프로젝트 선택 질문이 나오면 기존 `mzpdlee-4096/mpd-music`을 선택합니다. `.env.local`의 기존 값을 보존하려면 환경변수 다운로드 질문에서 `n`을 선택합니다.

## 검증 범위와 한계

- TypeScript/TSX 구문 검사 및 ZIP 압축 검사를 수행합니다.
- 이 작업 환경에서는 실제 브라우저에서 Next.js 3D 렌더링, 음성통화(미사용), 모바일 기기별 FPS를 실행해 확인할 수 없었습니다.
- 풍경은 한 장의 곡면 360도 파노라마와 실제 지형 위의 3D 나무 모델을 조합합니다. 사진측량으로 스캔한 개별 나무 모델은 아닙니다.
