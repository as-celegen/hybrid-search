
import { HybridSearch } from "@/lib/hybrid-search/types";
import {QueryResult} from "@upstash/vector";

export class RRF extends HybridSearch {
    k: number;
    constructor(k = 60){
        super();
        this.k = k;
    }

    combineResults(...results: QueryResult[][]): QueryResult[] {
        const resultsSorted = results.map( r => r.sort((a, b) => b.score - a.score));

        const combinedResults = resultsSorted.reduce((acc, r) => {
            r.forEach(({ id, score, ...rest }, index) => {
                if (!acc[id]) {
                    acc[id] = {...rest, id, score: 1.0/(this.k + index) };
                } else {
                    acc[id].score += 1.0/(this.k + index);
                    acc[id].metadata = { ...acc[id].metadata, ...rest.metadata };
                    if(acc[id].vector === undefined) {
                        acc[id].vector = rest.vector;
                    }
                }
            });
            return acc;
        }, {} as Record<string, QueryResult>);

        return Object.values(combinedResults).sort((a, b) => b.score - a.score);
    }
}
