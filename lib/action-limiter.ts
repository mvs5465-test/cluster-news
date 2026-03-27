type ActionLease = {
  release: () => void;
};

export class ActionLimiter {
  private readonly limit: number;
  private activeCount = 0;

  constructor(limit: number) {
    this.limit = Math.max(1, Math.floor(limit) || 1);
  }

  tryAcquire(): ActionLease | null {
    if (this.activeCount >= this.limit) {
      return null;
    }

    this.activeCount += 1;
    let released = false;

    return {
      release: () => {
        if (released) {
          return;
        }
        released = true;
        this.activeCount = Math.max(0, this.activeCount - 1);
      },
    };
  }

  getActiveCount() {
    return this.activeCount;
  }

  getLimit() {
    return this.limit;
  }
}
