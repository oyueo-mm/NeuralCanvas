import { HomeDemo } from "./HomeDemo";
import { Icon } from "./ui";
export function Home({
  onStart,
  onPresets,
}: {
  onStart: () => void;
  onPresets: () => void;
}) {
  return (
    <div className="home-page">
      <div className="hero-layout">
        <section className="hero-copy" aria-label="소개">
          <h2>
            신경망을 직접 만들고,
            <br />
            <span>학습 과정을 눈으로 확인하세요.</span>
          </h2>
          <p>데이터를 그리고 구조를 바꾸며, 예측이 변하는 순간을 관찰합니다.</p>
          <div className="hero-actions">
            <button
              className="primary hero-start"
              data-testid="home-start"
              onClick={onStart}
            >
              학습 시작하기
              <Icon name="chevron" />
            </button>
            <button data-testid="home-presets" onClick={onPresets}>
              프리셋 둘러보기
            </button>
          </div>
          <ul className="hero-tags" aria-label="특징">
            <li>회귀 · 분류</li>
            <li>역전파 · Adam / SGD</li>
            <li>Web Worker 고속학습</li>
          </ul>
        </section>
        <HomeDemo />
      </div>
    </div>
  );
}
