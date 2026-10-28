# 개발 결과

2026-10-28 UI/UX 전면 개편: 데이터 그래프 중심 레이아웃, 접이식 사이드바(신경망·학습 설정·분석·입력 관찰·파일), 흰 배경·세이지 팔레트, 하단 학습 컨트롤, 모바일 드로어가 적용되었습니다. 최신 상세 결과는 [UI_REDESIGN.md](UI_REDESIGN.md)를 참고하세요.

## 초기 버전 개발 기록

수학 엔진, 데이터·모델 직접 편집, Worker 학습, 입력 순회, 저장·복원, 반응형 UI와 Pages 자동화 구성을 구현했습니다.

## 로컬 검증

- Vitest: 33 통과, 0 실패. 유한차분·SGD/Adam·선형/비선형 회귀·재현성·shape·데이터/복원 검증 포함.
- Playwright: 9 통과, 0 실패(43.2초). Chromium·모바일 Chromium·WebKit에서 각각 3개 시나리오를 실행했습니다.
- 타입 검사와 프로덕션 빌드 통과. npm audit: 취약점 0건.
- 편집·Worker 학습 시나리오의 브라우저 pageerror와 실패한 네트워크 요청 0건. 데스크톱·모바일 가로 넘침 검사 통과.
- 그래프와 신경망 PNG는 다운로드 후 PNG 시그니처와 실제 파일 크기를 검사했습니다.
- 스크린샷: `docs/images/lab.png`. 모바일·WebKit 스크린샷은 Git에서 제외한 `test-results/`에 보존합니다.

수정한 문제: 새로고침 직전 debounce 저장이 완료되지 않아 최근 데이터가 사라지는 문제를 pagehide 시 최종 저장으로 해결했습니다. 재초기화가 선택한 활성화 함수를 덮어쓰지 않도록 수정했습니다. 한 Epoch 명령이 타이머 묶음에 걸칠 때 목표 Epoch를 유지하도록 수정했습니다. 테스트용 WebKit 시나리오는 저장 대기와 느린 실행 환경을 고려해 전체 제한 시간을 60초로 설정했습니다.

## 배포

공개 주소: https://oyueo-mm.github.io/NeuralCanvas/

최초 구현 커밋 `a08f823`을 main에 일반 push했습니다. [Actions 실행](https://github.com/oyueo-mm/NeuralCanvas/actions/runs/39443004252)에서 build와 deploy가 모두 성공했습니다. 타입 검사·단위 테스트·프로덕션 빌드·Chromium/모바일/WebKit 브라우저 검증을 모두 통과한 아티팩트를 배포했습니다. 원격 저장소의 Pages는 사용자가 GitHub Actions Source로 활성화했고 API에서 `has_pages: true`를 확인했습니다.

## 실제 공개 URL 검증

- 로컬 검증과 별도로 공개 URL에서 Playwright 9개 테스트 통과, 0 실패(37.7초).
- 데이터 추가·이동·삭제, 프리셋, 뉴런·층 수정, 가중치·편향·활성화 수정, 연결 비활성 유지, 실제 Worker 학습·재개, 예측 갱신, 입력 순회, 저장·복원, PNG 다운로드 확인.
- `scripts/verify-deployment.mjs`로 최초 페이지 로딩부터 별도 관찰: HTML·JS·CSS·Worker 모두 HTTP 200. 콘솔 error·pageerror·실패한 요청·HTTP 400 이상 응답 모두 0건.
- 데스크톱·모바일 가로 넘침 검사 통과. Firefox는 미검증입니다.

`NEURALCANVAS_URL=https://oyueo-mm.github.io/NeuralCanvas/ npm run test:e2e` 또는 PowerShell에서 `$env:NEURALCANVAS_URL='https://oyueo-mm.github.io/NeuralCanvas/'; npm run test:e2e`로 공개 배포를 다시 검증할 수 있습니다. `node scripts/verify-deployment.mjs`는 정적 파일·Worker·콘솔을 검사합니다.

미구현: 터치 핀치, 선택 뉴런 중심 확대, 활성화 곡선 그래프, 가중치 히스토그램, 입력 정규화, Adam 상태를 포함한 체크포인트, Firefox 검증. 2차원 분류·결정 경계·CNN은 첫 버전 범위 밖입니다.

초기 폴더는 비어 있었고 Git 저장소가 없었습니다. `oyueo-mm/NeuralCanvas`는 원격 조회에 응답했으나 브랜치가 없는 상태였습니다. 다른 프로젝트는 수정하지 않았습니다.
