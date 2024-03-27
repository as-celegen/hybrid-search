export abstract class HybridSearch {
    abstract combineResults(...results: {key: string, title: string, score: number}[][]): {key: string, title: string, score: number}[];
}