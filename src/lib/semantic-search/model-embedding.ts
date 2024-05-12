import { SearchIndex } from "@/lib/search";
import {IndexConfig, Index} from "@upstash/vector";
import {IndexFunctions} from "@/types/vector";

export class ModelEmbeddingSearch<Metadata extends Record<string, unknown> = Record<string, unknown>> extends SearchIndex<Metadata> {
    searchType: string = 'ModelEmbedding';

    constructor(configOrIndex?: IndexConfig | IndexFunctions<Metadata>) {
        super(configOrIndex ?? {
            url: process.env.SEMANTIC_SEARCH_VECTOR_INDEX_URL,
            token: process.env.SEMANTIC_SEARCH_VECTOR_INDEX_TOKEN,
        })
    }
}
