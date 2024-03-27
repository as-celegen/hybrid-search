export abstract class HybridSearch {
    abstract combineResults(...results: {key: string, document: string, score: number}[][]): {key: string, document: string, score: number}[];
}