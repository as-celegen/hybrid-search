import { BM25 } from "@/lib/full-text-search/bm25";
import { Lunr } from "@/lib/full-text-search/lunr";
import {Search} from "@/lib/search";

const fullTextSearchAlgorithms: Record<string, Search> = {
    "BM25": new BM25(),
    "LUNR": new Lunr(),
};

export const fullTextSearch: Search = fullTextSearchAlgorithms[process.env.FULL_TEXT_SEARCH_ALGORITHM ?? 'LUNR'] ?? fullTextSearchAlgorithms['LUNR'];