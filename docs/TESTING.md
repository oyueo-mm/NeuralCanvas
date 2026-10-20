# 회귀·분류 확장 검증 (2026-10-21)

단위 테스트 51개, Chromium·모바일·WebKit·Firefox 브라우저 검사 70개가 통과했습니다. CDP 전용 터치 2개는 모바일 Chromium에서 실행하고 다른 3개 프로젝트의 6개 항목은 생략합니다. 기존 v1 회귀 JSON과 새 v2의 두 모드 스냅샷, 분류 gradient checking·학습·확률 격자, 연속 입력과 터치 Undo/Redo를 검사합니다. 자세한 조건과 수치는 [분류 구현 기록](CLASSIFICATION.md#정확성과-조작성)을 참고하세요.

## Previous regression validation

```bash
npm test -- --reporter=verbose --silent=false --disableConsoleIntercept
npm run build
npx playwright install chromium webkit firefox
npm run test:e2e
```

## 수학 및 학습

Vitest 33개(엔진 32개 + 벤치마크 1개)가 통과했습니다. 순전파 수동 예제·5개 활성화 미분·Sigmoid 극단값·ReLU 0 규칙·평균 배치 기울기·모델 shape·시드·CSV·JSON 검증을 포함합니다.

9개 유한차분 조합: linear/tanh/sigmoid × 시드 1/42/123. 3→2 은닉층, 선형 출력, 비활성 연결을 포함하며 모든 가중치와 편향을 검사했습니다. 최대 절대오차 약 1.37×10⁻¹⁰, 최대 상대오차 약 3.20×10⁻⁹입니다.

SGD 수치 예: w=b=0, x=2, y=1, η=.1 → w=.4, b=.2. Adam 고정 기울기 2의 두 번 업데이트는 −.1, −.2에 일치합니다. 비활성 연결은 기존 Adam 모멘트가 있더라도 값이 변하지 않는지 검사했습니다.

| 실험        | 설정                                   | 결과                                     |
| ----------- | -------------------------------------- | ---------------------------------------- |
| 선형 회귀   | 40점, 은닉층 없음, SGD .01, 1,000 배치 | MSE 15.53885 → 4.53×10⁻¹⁹                |
| 사인 회귀   | 60점, 8→8 tanh, Adam .01, 2,500 배치   | MSE 1.40045 → 0.00013939                 |
| 용량 비교   | 단일 tanh 층 1/4/8, 40점, 1,000 배치   | MSE 1.16310 / .12090 / .00025385         |
| 학습률 비교 | 단일 4 tanh, 동일 초기화, 500 배치     | η .001/.01/.1 → MSE .92110/.30663/.01017 |
| 재현성      | 동일 시드·데이터·설정, 100배치         | 모델 배열 완전 일치                      |

이 결과는 고정된 시드와 함수에서 측정한 예입니다. 더 큰 모델이나 더 높은 학습률이 일반적으로 우수하다는 주장이 아닙니다. 검증 분할 제외와 상수 x·단일 표본에서 유한한 계산도 별도로 확인했습니다.

## 브라우저

UI 개편 최종 로컬 실행: **45개 통과, 0개 실패, 적용 대상 외 3개 제외**.

`tests/lab.spec.ts`는 프로덕션 빌드와 실제 Worker를 사용합니다. Chromium 데스크톱·390×844 모바일 Chromium·WebKit·Firefox를 대상으로 점 추가/드래그/삭제, 프리셋, 층·뉴런 추가/삭제, 활성화 변경, 가중치·편향 수정, 연결 비활성, 한 배치·한 Epoch, 학습/일시정지/재개, 손실·곡선 갱신, 순회 중 가중치 고정, 확대, 실험 다운로드/복원, CSV 및 빈 데이터 상태를 검증합니다. localStorage에서 실제 모델 배열도 검사합니다.

UI 개편 검증 구성은 총 48개로, CDP 멀티터치 전용 3개는 해당하지 않는 프로젝트에서 제외합니다. `tests/touch.spec.ts`는 실제 Chromium touchStart/touchMove/touchEnd 에뮬레이션으로 핀치·한 손가락 이동·화면 맞춤·뉴런 선택·탭 보존·키보드 높이 모사·점 편집 접근성을 검사합니다. PNG 2종은 파일 시그니처를 확인합니다. 브라우저 결과와 발견·수정 사항은 [UI_REDESIGN.md](UI_REDESIGN.md)에 기록합니다. 스크린샷·trace는 `test-results/`에 남고 대표 스크린샷 외에는 Git에서 제외합니다.

`NEURALCANVAS_URL` 환경변수가 있으면 로컬 서버를 시작하지 않고 해당 공개 URL을 사용합니다. `scripts/verify-deployment.mjs`는 최초 로딩 시점부터 console error·pageerror·HTTP 오류·실패 요청을 수집하며, Worker 생성과 HTTP 200을 확인하고 실제 한 배치 학습·입력 순회도 실행합니다. 개편 전 공개 배포의 9개 검사 기록은 [RESULTS.md](RESULTS.md)에 보존합니다.
