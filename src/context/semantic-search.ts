import { OpenAISearch } from '@/lib/semantic-search/openai';
import {Search} from "@/lib/search";

const semanticSearchAlgorithms: Record<string, Search> = {
    "OPENAI": new OpenAISearch(),
};

export const semanticSearch: Search = semanticSearchAlgorithms[process.env.SEMANTIC_SEARCH_ALGORITHM ?? 'OPENAI'] ?? semanticSearchAlgorithms['OPENAI'];