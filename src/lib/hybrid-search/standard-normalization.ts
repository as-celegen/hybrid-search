
import { HybridSearch } from "@/lib/hybrid-search/types";

export class StandardNormalization extends HybridSearch {

    combineResults(...results: { key: string; title: string; score: number }[][]): {
        key: string;
        title: string;
        score: number
    }[] {
        const resultsSorted = results.map( r => r.sort((a, b) => b.score - a.score));

        const combinedResults = resultsSorted.reduce((acc, r) => {
            const mean = r.reduce((acc, { score }) => acc + score, 0) / r.length;
            const variance = r.reduce((acc, { score }) => acc + Math.pow(score - mean, 2), 0) / r.length;
            const stdDev = Math.sqrt(variance);
            r.forEach(({ key, title, score }) => {
                if (!acc[key]) {
                    acc[key] = { key, title, score: (score - mean) / stdDev};
                } else {
                    acc[key].score += (score - mean) / stdDev;
                }
            });
            return acc;
        }, {} as Record<string, { key: string; title: string; score: number }>);

        return Object.values(combinedResults).sort((a, b) => b.score - a.score);
    }
}
