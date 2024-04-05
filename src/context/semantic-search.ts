import { OpenAISearch } from '@/lib/semantic-search/openai';
import {Search} from "@/lib/search";

const semanticSearchAlgorithms: Record<string, new () => Search> = {
    "OPENAI": OpenAISearch,
};

const semanticSearchType = semanticSearchAlgorithms[process.env.SEMANTIC_SEARCH_ALGORITHM ?? 'OPENAI'] ?? semanticSearchAlgorithms['OPENAI'];
export const semanticSearch: Search = new semanticSearchType();