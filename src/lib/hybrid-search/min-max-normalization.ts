
import { HybridSearch } from "@/lib/hybrid-search/types";
import {QueryResult} from "@upstash/vector";

export class MinMaxNormalization extends HybridSearch {

    combineResults(...results: QueryResult[][]): QueryResult[] {
        const resultsSorted = results.map( r => r.sort((a, b) => b.score - a.score));

        const combinedResults = resultsSorted.reduce((acc, r) => {
            const min = r[r.length - 1].score;
            const max = r[0].score;
            r.forEach(({ id, score, ...rest }) => {
                if (!acc[id]) {
                    acc[id] = { ...rest, id, score: (score - min)/ (max - min)};
                } else {
                    acc[id].score += (score - min)/ (max - min);
                    acc[id].metadata = { ...acc[id].metadata, ...rest.metadata };
                }
            });
            return acc;
        }, {} as Record<string, QueryResult>);

        return Object.values(combinedResults).sort((a, b) => b.score - a.score);
    }
}
