import {SearchIndex} from "@/lib/search";
import {ModelEmbeddingSearch} from "@/lib/semantic-search/model-embedding";

const semanticSearchAlgorithms: Record<string, new () => SearchIndex> = {
    "MODEL_EMBEDDING": ModelEmbeddingSearch,
};

const semanticSearchType = semanticSearchAlgorithms[process.env.SEMANTIC_SEARCH_ALGORITHM ?? 'MODEL_EMBEDDING'] ?? semanticSearchAlgorithms['MODEL_EMBEDDING'];
export const semanticSearch: SearchIndex = new semanticSearchType();