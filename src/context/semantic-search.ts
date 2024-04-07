import { OpenAISearch } from '@/lib/semantic-search/openai';
import {Search} from "@/lib/search";
import {ModelEmbeddingSearch} from "@/lib/semantic-search/model-embedding";

const semanticSearchAlgorithms: Record<string, new () => Search> = {
    "OPENAI": OpenAISearch,
    "MODEL_EMBEDDING": ModelEmbeddingSearch,
};

const semanticSearchType = semanticSearchAlgorithms[process.env.SEMANTIC_SEARCH_ALGORITHM ?? 'OPENAI'] ?? semanticSearchAlgorithms['OPENAI'];
export const semanticSearch: Search = new semanticSearchType();