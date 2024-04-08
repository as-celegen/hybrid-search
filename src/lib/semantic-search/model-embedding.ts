import {Metadata, Search, Document, defaultTopK} from "@/lib/search";
import { Index } from '@upstash/vector';

export class ModelEmbeddingSearch extends Search {
    index: Index<Metadata>;
    ready: Promise<boolean>;
    searchType: string = 'ModelEmbedding';
    dimension: number = 1024;

    constructor() {
        super();

        if(process.env.USE_SINGLE_VECTOR_INDEX === 'true') {
            this.index = Index.fromEnv();
        }else {
            this.index = new Index({
                'url': process.env.MODEL_EMBEDDING_VECTOR_INDEX_URL,
                'token': process.env.MODEL_EMBEDDING_VECTOR_INDEX_TOKEN,
            });
        }

        this.ready = Promise.resolve(true);
    }

    async search(query: string, topK= defaultTopK): Promise<{key: string, title: string, score: number}[]> {
        const results = await this.index.query({
            data: query,
            includeMetadata: true,
            topK,
            filter: this.useSingleVectorIndex ? `searchType = "${this.searchType}"` : undefined,
        });
        return results.map((result) => ({
            key: result.metadata?.key ?? result.id.toString(),
            title: result.metadata?.title ?? "Unknown title",
            score: result.score,
        }));
    }

    async add(document: Document | Document[]): Promise<boolean> {
        const documents = Array.isArray(document) ? document : [document];
        return 'Success' === await this.index.upsert(await Promise.all(documents.map(async (doc) => ({
            id: `${doc.key}#${this.searchType}`,
            data: doc.document,
            metadata: {
                key: doc.key,
                title: doc.title,
                searchType: this.searchType,
            },
        }))));
    }

    async buildIndex(documents: Document[]): Promise<boolean> {
        return this.add(documents);
    }
    async prepareIndex(documents: Document | Document[]): Promise<boolean> {
        return true;
    }

    async getVector(text: string): Promise<Array<number>> {
        throw new Error('Not implemented');
    }

    async getVectorForSearch(text: string): Promise<Array<number>> {
        throw new Error('Not implemented');
    }
}
