import { Index } from "@upstash/vector";

export type Document = {key: string, title: string, document: string};

export interface Metadata extends Record<string, unknown> {
    key: string;
    title: string;
    searchType: string;
}

export abstract class Search {
    abstract ready: Promise<boolean>;
    abstract index: Index<Metadata>;
    abstract searchType: string;

    async search(query: string, topK= 20): Promise<{key: string, title: string, score: number}[]> {
        if (!await this.ready) {
            return [];
        }
        const vector = await this.getVectorForSearch(query);
        console.log(vector);
        // TODO: Remove metadata filtering when there are different indexes for different searches
        const results = await this.index.query({
            vector,
            includeMetadata: true,
            topK,
            includeVectors: true,
        });
        console.log(results);
        console.log("a");
        return results.map((result) => ({
            key: result.id.toString(),
            title: result.metadata?.title ?? "Unknown title",
            score: result.score,
        }));
    }
    async add(document: Document | Document[]): Promise<boolean> {
        if (!await this.ready) {
            return false;
        }
        const documents = Array.isArray(document) ? document : [document];
        // TODO: Remove metadata when there are different indexes for different searches
        return 'Success' === await this.index.upsert(await Promise.all(documents.map(async (doc) => ({
            id: doc.key,
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
        return (await this.index.delete(keys)).deleted;
    }

    async resetIndex(): Promise<void> {
        await this.index.reset();
    }

    abstract buildIndex(documents: Document | Document[]): Promise<boolean>;
    abstract prepareIndex(documents: Document | Document[]): Promise<boolean>;
    abstract getVector(text: string): Promise<Array<number>>;
    abstract getVectorForSearch(text: string): Promise<Array<number>>;
}