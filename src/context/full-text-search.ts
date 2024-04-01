import { BM25 } from "@/lib/full-text-search/bm25";
import {Search} from "@/lib/search";

const fullTextSearchAlgorithms: Record<string, Search> = {
    "BM25": new BM25(),
};

export const fullTextSearch: Search = fullTextSearchAlgorithms[process.env.FULL_TEXT_SEARCH_ALGORITHM ?? 'BM25'] ?? fullTextSearchAlgorithms['BM25'];