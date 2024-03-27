
import { HybridSearch } from "@/lib/hybrid-search/types";

export class MinMaxNormalization extends HybridSearch {

    combineResults(...results: { key: string; title: string; score: number }[][]): {
        key: string;
        title: string;
        score: number
    }[] {
        const resultsSorted = results.map( r => r.sort((a, b) => b.score - a.score));

        const combinedResults = resultsSorted.reduce((acc, r) => {
            const min = r[r.length - 1].score;
            const max = r[0].score;
            r.forEach(({ key, title, score }) => {
                if (!acc[key]) {
                    acc[key] = { key, title, score: (score - min)/ (max - min)};
                } else {
                    acc[key].score += (score - min)/ (max - min);
                }
            });
            return acc;
        }, {} as Record<string, { key: string; title: string; score: number }>);

        return Object.values(combinedResults).sort((a, b) => b.score - a.score);
    }
}
