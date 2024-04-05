
import { HybridSearch } from "@/lib/hybrid-search/types";
import { Result } from '@/lib/hybrid-search/types';

export class MinMaxNormalization extends HybridSearch {

    combineResults(...results: Result[][]): Result[] {
        const resultsSorted = results.map( r => r.sort((a, b) => b.score - a.score));

        const combinedResults = resultsSorted.reduce((acc, r) => {
            const min = r[r.length - 1].score;
            const max = r[0].score;
            r.forEach(({ key, score, ...rest }) => {
                if (!acc[key]) {
                    acc[key] = { ...rest, key, score: (score - min)/ (max - min)};
                } else {
                    acc[key].score += (score - min)/ (max - min);
                }
            });
            return acc;
        }, {} as Record<string, Result>);

        return Object.values(combinedResults).sort((a, b) => b.score - a.score);
    }
}
