import { BM25 } from "@/lib/full-text-search/bm25";
import {Search} from "@/lib/search";

const fullTextSearchAlgorithms: Record<string, new () => Search> = {
    "BM25": BM25,
};

const fullTextSearchType = fullTextSearchAlgorithms[process.env.FULL_TEXT_SEARCH_ALGORITHM ?? 'BM25'] ?? fullTextSearchAlgorithms['BM25'];
export const fullTextSearch: Search = new fullTextSearchType();