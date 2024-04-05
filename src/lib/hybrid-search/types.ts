export interface Result {
    key: string;
    score: number;
    [key: string]: any;
}

export abstract class HybridSearch {
    abstract combineResults(...results: Result[][]): Result[];
}