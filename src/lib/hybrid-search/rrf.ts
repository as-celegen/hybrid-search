
import { HybridSearch } from "@/lib/hybrid-search/types";

export class RRF extends HybridSearch {

    combineResults(...results: { key: string; document: string; score: number }[][]): {
        key: string;
        document: string;
        score: number
    }[] {
        return [];
    }
}
