import { BM25Search } from "@/lib/full-text-search/bm25";
import {SearchIndex} from "@/lib/search";

const fullTextSearchAlgorithms: Record<string, new () => SearchIndex> = {
    "BM25": BM25Search,
};

const fullTextSearchType = fullTextSearchAlgorithms[process.env.FULL_TEXT_SEARCH_ALGORITHM ?? 'BM25'] ?? fullTextSearchAlgorithms['BM25'];
export const fullTextSearch: SearchIndex = new fullTextSearchType();