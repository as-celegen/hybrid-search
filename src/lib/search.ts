import { Index } from "@upstash/vector";

export type Document = {key: string, title: string, document: string};

export interface Metadata extends Record<string, unknown> {
    key: string;
    title: string;
    searchType: string;
}

export const dimension = 384;

export abstract class Search {
    abstract ready: Promise<boolean>;
    abstract index: Index<Metadata>;
    abstract searchType: string;
    useSingleVectorIndex: boolean = process.env.USE_SINGLE_VECTOR_INDEX === 'true';

    async search(query: string, topK= 20): Promise<{key: string, title: string, score: number}[]> {
        if (!await this.ready) {
            return [];
        }
        const vector = await this.getVectorForSearch(query);
        const results = await this.index.query({
            vector,
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
        if (!await this.ready) {
            return false;
        }
        const documents = Array.isArray(document) ? document : [document];
        return 'Success' === await this.index.upsert(await Promise.all(documents.map(async (doc) => ({
            id: `${doc.key}#${this.searchType}`,
            vector: await this.getVector(doc.document),
            metadata: {
                key: doc.key,
                title: doc.title,
                searchType: this.searchType,
            },
        }))));
    }
    async remove(key: string | string[]): Promise<number> {
        if (!await this.ready) {
            return 0;
        }
        const keys = Array.isArray(key) ? key : [key];
        return (await this.index.delete(keys.map((id => `${id}#${this.searchType}`)))).deleted;
    }

    async resetIndex(): Promise<void> {
        await this.index.reset();
    }

    abstract buildIndex(documents: Document | Document[]): Promise<boolean>;
    abstract prepareIndex(documents: Document | Document[]): Promise<boolean>;
    abstract getVector(text: string): Promise<Array<number>>;
    abstract getVectorForSearch(text: string): Promise<Array<number>>;
}