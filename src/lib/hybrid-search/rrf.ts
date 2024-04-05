
import { HybridSearch } from "@/lib/hybrid-search/types";
import { Result } from '@/lib/hybrid-search/types';

export class RRF extends HybridSearch {
    k: number;
    constructor(k = 60){
        super();
        this.k = k;
    }

    combineResults(...results: Result[][]): Result[] {
        const resultsSorted = results.map( r => r.sort((a, b) => b.score - a.score));

        const combinedResults = resultsSorted.reduce((acc, r) => {
            r.forEach(({ key, score, ...rest }, index) => {
                if (!acc[key]) {
                    acc[key] = {...rest, key, score: 1.0/(this.k + index) };
                } else {
                    acc[key].score += 1.0/(this.k + index);
                }
            });
            return acc;
        }, {} as Record<string, Result>);

        return Object.values(combinedResults).sort((a, b) => b.score - a.score);
    }
}
