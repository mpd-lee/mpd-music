# MPD Music Studio 외부 3D 모델 출처 및 라이선스

이 프로젝트는 다음 3D 모델을 브라우저에서 CDN으로 불러옵니다. 각 모델 페이지에 기재된 라이선스는 CC0 1.0 Universal입니다. 메타데이터에는 AI 생성 모델로 표시되어 있으며, 사진 측량 또는 제조사 공식 CAD/스캔 모델이라고 주장하지 않습니다.

- Bass Guitar: https://cdn.3dassets.dev/assets/33787/v1/model.glb
- Acoustic Guitar: https://cdn.3dassets.dev/assets/33789/v1/model.glb
- Vocal Microphone: https://cdn.3dassets.dev/assets/33803/v1/model.glb
- Mixing Desk: https://cdn.3dassets.dev/assets/33804/v1/model.glb
- Studio Monitor: https://cdn.3dassets.dev/assets/33805/v1/model.glb
- Guitar Amplifier: https://cdn.3dassets.dev/assets/33798/v1/model.glb
- Bass Amplifier: https://cdn.3dassets.dev/assets/33799/v1/model.glb
- Bass Drum + Rack Toms: https://cdn.3dassets.dev/assets/33793/v1/model.glb
- Snare Drum: https://cdn.3dassets.dev/assets/33794/v1/model.glb
- Floor Tom: https://cdn.3dassets.dev/assets/33792/v1/model.glb
- Crash Cymbal Stand: https://cdn.3dassets.dev/assets/33791/v1/model.glb
- Hi-Hat Stand: https://cdn.3dassets.dev/assets/33795/v1/model.glb

실제 모델은 `components/studio/scene/gltf-asset.tsx`를 통해 로드합니다. CDN 요청이 실패하면 같은 위치에 내장된 기본 3D 형상으로 대체됩니다.

## 2026-11-05 생성 이미지 에셋

- `public/images/mpd-coastal-sky-panorama.webp`: MPD Music Studio의 360도 해안 전망 배경용으로 생성한 이미지.
- `public/images/mpd-natural-grass.webp`: 잔디 지면 재질용으로 생성한 타일형 이미지.

두 파일은 이 프로젝트의 시각 자산으로 추가했습니다. 배경 및 잔디는 사진풍 생성 이미지이며, 실제 촬영 또는 실물 스캔 에셋이라고 표기하지 않습니다.

## 2026-11-07 추가 제작 환경 이미지

- `public/images/mpd-front-coastal-bay.webp`
- `public/images/mpd-front-coastal-bay-mobile.webp`

위 두 파일은 MPD Music Studio의 전면 해안 배경을 위해 새로 생성한 원본 환경 이미지와 모바일 최적화 파생본입니다. 외부 스톡 이미지나 워터마크를 사용하지 않았습니다.
