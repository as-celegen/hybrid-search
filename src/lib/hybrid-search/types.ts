import {QueryResult} from "@upstash/vector";

export abstract class HybridSearch {
    abstract combineResults(...results: QueryResult[][]): QueryResult[];
}