export function yieldToMain(): Promise<void> {
    return new Promise((resolve) => {
        // requestAnimationFrame lets the browser paint between chunks, but it
        // never fires in a background tab, which would stall rendering
        // completely. setTimeout keeps the work moving there.
        const isHidden: boolean = typeof document !== "undefined" && document.hidden;
        if (!isHidden && typeof requestAnimationFrame !== "undefined") {
            requestAnimationFrame(() => setTimeout(resolve, 0));
        } else {
            setTimeout(resolve, 0);
        }
    });
}

const DEFAULT_YIELD_INTERVAL_MS: number = 8;

/**
 * Yielding costs a whole frame, so yielding every N items makes long
 * calculations far slower than the work they are doing. This hands the main
 * thread back on a time budget instead: check `shouldYield()` cheaply in a
 * loop and only await when enough work has piled up.
 */
export class YieldGuard {
    private lastYield: number;

    constructor(private readonly intervalMs: number = DEFAULT_YIELD_INTERVAL_MS) {
        this.lastYield = performance.now();
    }

    public shouldYield(): boolean {
        return performance.now() - this.lastYield >= this.intervalMs;
    }

    public async yield(): Promise<void> {
        await yieldToMain();
        this.lastYield = performance.now();
    }

    /** Yields only when the budget is used up. */
    public async maybeYield(): Promise<void> {
        if (this.shouldYield()) {
            await this.yield();
        }
    }
}

export interface AsyncProgress {
    phase: string;
    current: number;
    total: number;
}

export type ProgressCallback = (progress: AsyncProgress) => void;
