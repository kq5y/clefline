export function yieldToMain(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame !== "undefined") {
            requestAnimationFrame(() => setTimeout(resolve, 0));
        } else {
            setTimeout(resolve, 0);
        }
    });
}

export interface AsyncProgress {
    phase: string;
    current: number;
    total: number;
}

export type ProgressCallback = (progress: AsyncProgress) => void;
