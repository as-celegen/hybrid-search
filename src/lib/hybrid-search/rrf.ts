
import { HybridSearch } from "@/lib/hybrid-search/types";

export class RRF extends HybridSearch {
    k: number;
    constructor(k = 60){
        super();
        this.k = k;
    }

    combineResults(...results: { key: string; title: string; score: number }[][]): {
        key: string;
        title: string;
        score: number
    }[] {
        const resultsSorted = results.map( r => r.sort((a, b) => b.score - a.score));

        const combinedResults = resultsSorted.reduce((acc, r) => {
            r.forEach(({ key, title, score }, index) => {
                if (!acc[key]) {
                    acc[key] = { key, title, score: 1.0/(this.k + index) };
                } else {
                    acc[key].score += 1.0/(this.k + index);
                }
            });
            return acc;
        }, {} as Record<string, { key: string; title: string; score: number }>);

        return Object.values(combinedResults).sort((a, b) => b.score - a.score);
    }
}
