import { HybridSearch } from "@/lib/hybrid-search/types";
import { Result } from '@/lib/hybrid-search/types';

export class StandardNormalization extends HybridSearch {

    combineResults(...results: Result[][]): Result[] {
        const resultsSorted = results.map( r => r.sort((a, b) => b.score - a.score));

        const combinedResults = resultsSorted.reduce((acc, r) => {
            const mean = r.reduce((acc, { score }) => acc + score, 0) / r.length;
            const variance = r.reduce((acc, { score }) => acc + Math.pow(score - mean, 2), 0) / r.length;
            const stdDev = Math.sqrt(variance);
            if (stdDev !== 0) {
                r.forEach(({key, score, ...rest}) => {
                    if (!acc[key]) {
                        acc[key] = {...rest, key, score: (score - mean) / stdDev};
                    } else {
                        acc[key].score += (score - mean) / stdDev;
                    }
                });
            }
            return acc;
        }, {} as Record<string, Result>);

        return Object.values(combinedResults).sort((a, b) => b.score - a.score);
    }
}
