# 실제 성능 측정

2026-10-20 KST, Windows, Intel Core Ultra 7 256V, Node.js v24.19.0, Vitest 5.0.5. `npm test -- --reporter=verbose --silent=false --disableConsoleIntercept`에서 측정했습니다. 각 구성에서 200배치, 배치 크기 16, 검증 비율 0, Adam .01, 시드 42입니다. 모든 배치 후 전체 학습 MSE 계산 비용을 포함합니다. 첫 실행/JIT 비용과 병렬 테스트 간섭을 포함하므로 브라우저 성능 보장은 아닙니다.

| 은닉 구조 | 데이터 수 | 200배치 시간 | 배치/초 |
| --- | ---: | ---: | ---: |
| 4→4 | 50 | 23.24ms | 8,605 |
| 4→4 | 500 | 148.75ms | 1,345 |
| 16→16→16→16 | 50 | 144.29ms | 1,386 |
| 16→16→16→16 | 500 | 428.98ms | 466 |

반복 측정은 `npm run benchmark -- --silent=false --disableConsoleIntercept`로 가능합니다. 표는 특정 실행의 관찰값이며 모델 크기에 따른 단순 비교에만 사용해야 합니다.

주요 비용은 배치마다 전체 분할의 손실을 계산하는 것과 밀집 SVG 연결을 그리는 것입니다. UI 스레드에서 학습을 하지 않으며 Worker는 약 16ms 계산 묶음 후 이벤트 큐로 제어를 반환합니다. 전송은 묶음당 모델 스냅샷 한 번, 손실 기록은 최근 1,000개까지 보존합니다. localStorage 쓰기는 700ms debounce를 사용합니다.

## 학습 중 브라우저 측정

같은 장치의 Playwright Chromium 156, 헤드리스, 1440×1000 뷰포트, 프로덕션 빌드, Adam .01, 배치 16, speed 20에서 각 약 2초간 측정했습니다. rAF 빈도는 실제 사용자 화면의 GPU FPS와 구분해야 합니다. 메인 스레드 비율은 CDP Performance의 TaskDuration/경과시간입니다.

| 은닉 구조 / 점 | rAF 빈도 | 최대 프레임 간격 | 50ms 이상 긴 작업 수 | 메인 스레드 TaskDuration / 비율 |
| --- | ---: | ---: | ---: | ---: |
| 4→4 / 50 | 59.01Hz | 50ms | 0 | 788.76ms / 38.78% |
| 16→16→16→16 / 500 | 58.02Hz | 50ms | 1 | 1047.15ms / 50.46% |

측정 도구는 `scripts/browser-benchmark.mjs`입니다. `npm run build`, 별도 터미널에서 `npm run preview -- --port 4173`, 이어서 `node scripts/browser-benchmark.mjs`로 재현할 수 있습니다. 실행 중 입력 JSON으로 실제 모델을 불러오고 UI에서 학습을 시작합니다. 측정 후 일시정지하고 브라우저를 닫습니다.

개별 SVG 렌더링·가중치 갱신 비용은 분리 측정하지 않았습니다. 최초 JS 번들은 Recharts를 포함해 약 620KB(압축 전)이며 추후 지연 로딩이 개선점입니다. 위 수치는 단일 실행 관찰값으로, 모든 장치나 최대 구조의 지속적인 60FPS를 보장하지 않습니다.
