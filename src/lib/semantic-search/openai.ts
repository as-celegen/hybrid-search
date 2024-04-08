import { OpenAI } from 'openai';
import {Metadata, Search, Document} from "@/lib/search";
import { Index } from '@upstash/vector';

export class OpenAISearch extends Search {
    openai: OpenAI;
    model: string;
    index: Index<Metadata>;
    ready: Promise<boolean>;
    searchType: string = 'OpenAI';
    dimension: number = 0;

    constructor() {
        super();

        if(process.env.USE_SINGLE_VECTOR_INDEX === 'true') {
            this.index = Index.fromEnv();
        }else {
            this.index = new Index({
                'url': process.env.OPENAI_VECTOR_INDEX_URL,
                'token': process.env.OPENAI_VECTOR_INDEX_TOKEN,
            });
        }

        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        this.model = process.env.OPENAI_MODEL ?? 'text-embedding-3-small';

        this.ready = this.index.info().then((info) => {
            this.dimension = info.dimension;
            return true;
        });
    }

    async buildIndex(documents: Document[]): Promise<boolean> {
        return this.add(documents);
    }

    async prepareIndex(documents: Document | Document[]): Promise<boolean> {
        return true;
    }

    async getVector(text: string): Promise<Array<number>> {
        await this.ready;
        const embedding = await this.openai.embeddings.create({input: text, model: this.model});
        // TODO: Fix the dimension limit
        let vector = embedding.data[0].embedding;
        if(vector.length > this.dimension) {
            vector = vector.slice(0, this.dimension);
        } else if(vector.length < this.dimension) {
            vector = vector.concat(Array.from({length: this.dimension - vector.length}, () => 0));
        }
        return vector;
    }

    async getVectorForSearch(text: string): Promise<Array<number>> {
        return this.getVector(text);
    }
}
