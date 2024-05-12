import { HybridSearch } from "@/lib/hybrid-search/types";
import {QueryResult} from "@upstash/vector";

export class StandardNormalization extends HybridSearch {

    combineResults(...results: QueryResult[][]): QueryResult[] {
        const resultsSorted = results.map( r => r.sort((a, b) => b.score - a.score));

        const combinedResults = resultsSorted.reduce((acc, r) => {
            const mean = r.reduce((acc, { score }) => acc + score, 0) / r.length;
            const variance = r.reduce((acc, { score }) => acc + Math.pow(score - mean, 2), 0) / r.length;
            const stdDev = Math.sqrt(variance);
            if (stdDev !== 0) {
                r.forEach(({id, score, ...rest}) => {
                    if (!acc[id]) {
                        acc[id] = {...rest, id, score: (score - mean) / stdDev};
                    } else {
                        acc[id].score += (score - mean) / stdDev;
                        acc[id].metadata = { ...acc[id].metadata, ...rest.metadata };
                    }
                });
            }
            return acc;
        }, {} as Record<string, QueryResult>);

        return Object.values(combinedResults).sort((a, b) => b.score - a.score);
    }
}
