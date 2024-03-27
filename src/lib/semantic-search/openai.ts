import { OpenAI } from 'openai';
import {Metadata, Search, Document} from "@/lib/search";
import { Index } from '@upstash/vector';

export class OpenAISearch extends Search {
    index: Index<Metadata>;
    openai: OpenAI;
    model: string;
    constructor() {
        super();

        this.index = new Index({
            'url': process.env.OPENAI_VECTOR_INDEX_URL,
            'token': process.env.OPENAI_VECTOR_INDEX_TOKEN,
        });

        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        this.model = process.env.OPENAI_MODEL ?? 'text-embedding-3-small';
    }

    async search(query: string): Promise<{ key: string; title: string; score: number; }[]> {
        const results = await this.index.query({
            vector: await this.getVector(query),
            topK: 100,
            includeMetadata: true,
        });
        return results.map((result) => ({
            key: result.id.toString(),
            title: result.metadata?.title ?? "Unknown title",
            score: result.score,
        }));
    }
    async add(document: Document | Document[]): Promise<boolean> {
        const documents = Array.isArray(document) ? document : [document];
        return 'Success' === await this.index.upsert(await Promise.all(documents.map(async (doc) => ({
            id: doc.key,
            vector: await this.getVector(doc.document),
            metadata: {
                key: doc.key,
                title: doc.title,
            },
        }))));
    }
    async remove(key: string | string[]): Promise<number> {
        const keys = Array.isArray(key) ? key : [key];
        return (await this.index.delete(keys)).deleted;
    }

    async buildIndex(documents: Document[]): Promise<boolean> {
        return this.add(documents);
    }

    async resetIndex(): Promise<void> {
        await this.index.reset();
    }

    async getVector(text: string): Promise<Array<number>> {
        const embedding = await this.openai.embeddings.create({input: text, model: this.model});
        return embedding.data[0].embedding;
    }
}
