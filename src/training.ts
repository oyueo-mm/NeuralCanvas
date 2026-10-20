import {
  type Model,
  type Point,
  type Settings,
  Optimizer,
  gradients,
  loss,
  rng,
  shuffle,
} from "./engine";
export class Trainer {
  optimizer = new Optimizer();
  random: () => number;
  train: Point[];
  validation: Point[];
  order: Point[] = [];
  cursor = 0;
  epoch = 0;
  step = 0;
  lastGradient: ReturnType<typeof gradients> | undefined;
  constructor(
    public model: Model,
    data: Point[],
    public settings: Settings,
  ) {
    this.random = rng(settings.seed);
    const shuffled = shuffle(data, this.random);
    const n = Math.min(
      data.length - 1,
      Math.floor(data.length * settings.validation),
    );
    this.validation = shuffled.slice(0, n);
    this.train = shuffled.slice(n);
  }
  batch() {
    if (!this.train.length) throw Error("학습 데이터가 없습니다.");
    if (this.cursor >= this.order.length) {
      this.order = shuffle(this.train, this.random);
      this.cursor = 0;
    }
    const batch = this.order.slice(
      this.cursor,
      this.cursor + this.settings.batch,
    );
    this.lastGradient = gradients(this.model, batch);
    this.optimizer.update(this.model, this.lastGradient, this.settings);
    this.cursor += batch.length;
    this.step++;
    if (this.cursor >= this.order.length) this.epoch++;
    const train = loss(this.model, this.train),
      validation = this.validation.length
        ? loss(this.model, this.validation)
        : undefined;
    if (!Number.isFinite(train) || train > 1e15)
      throw Error(
        "학습이 발산했습니다. 학습률을 낮추거나 모델을 초기화하세요.",
      );
    return { epoch: this.epoch, step: this.step, train, validation };
  }
}
