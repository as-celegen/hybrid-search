import {Document, Metadata, Search} from "@/lib/search";
import Error from "next/error";
import {redis} from "@/context/redis";
import {Index} from "@upstash/vector";

interface WordStatistic {
    numberOfDocumentsContainingWord: number;
    index: number;
}

type WordStatistics = Record<string, WordStatistic>;

interface BM25Info {
    wordStatistics: WordStatistics;
    numberOfDocuments: number;
    averageDocumentLength: number;
    numberOfWords: number;
}

//TODO: Fix this regex
const wordSplitRegex = /[\s.,;:!?]+/;

export class BM25 extends Search {
    wordStatistics: WordStatistics = {};
    numberOfDocuments: number = 0;
    ready: boolean = false;
    pending: Promise<void>;
    index: Index<Metadata>;
    averageDocumentLength: number = 0;
    k: number;
    b: number;
    numberOfWords: number = 0;

    constructor(k  = 1.5, b  = 0.75) {
        super();
        this.b = b;
        this.k = k;

        this.pending = redis.get<BM25Info>('BM25-info').then((info) => {
            if (info) {
                this.wordStatistics = info.wordStatistics;
                this.numberOfDocuments = info.numberOfDocuments;
                this.averageDocumentLength = info.averageDocumentLength;
                this.numberOfWords = info.numberOfWords;
                this.ready = true;
            }
        });

        this.index = new Index({
            'url': process.env.BM25_VECTOR_INDEX_URL,
            'token': process.env.BM25_VECTOR_INDEX_TOKEN,
        });
    }


    async search(query: string): Promise<{key: string, title: string, score: number}[]> {
        await this.pending;
        if (!this.ready) {
            return [];
        }
        const results = await this.index.query({
            vector: this.getVector(query),
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
        await this.pending;
        if (!this.ready) {
            return false;
        }
        const documents = Array.isArray(document) ? document : [document];
        return 'Success' === await this.index.upsert(await Promise.all(documents.map(async (doc) => ({
            id: doc.key,
            vector: this.getVector(doc.document),
            metadata: {
                key: doc.key,
                title: doc.title,
            },
        }))));
    }
    async remove(key: string | string[]): Promise<number> {
        await this.pending;
        if (!this.ready) {
            return 0;
        }
        const keys = Array.isArray(key) ? key : [key];
        return (await this.index.delete(keys)).deleted;
    }

    async buildIndex(documents: Document[]): Promise<boolean> {
        await this.pending;
        await this.resetIndex();
        this.numberOfDocuments = documents.length;
        documents.map((document) => {
            const words = document.document.split(wordSplitRegex);
            words.map((word) => {
                word = word.toLowerCase();
                if (!this.wordStatistics[word]) {
                    this.wordStatistics[word] = {
                        numberOfDocumentsContainingWord: 0,
                        index: -1,
                    };
                }
                this.wordStatistics[word].numberOfDocumentsContainingWord++;
            });
            this.averageDocumentLength += words.length;
        });
        this.averageDocumentLength /= this.numberOfDocuments;

        Object.keys(this.wordStatistics).sort().map((word, index) => {
            this.wordStatistics[word].index = index;
        });

        this.numberOfWords = Object.keys(this.wordStatistics).length;
        return 'OK' === (await redis.set<BM25Info>('BM25-info', {
            wordStatistics: this.wordStatistics,
            numberOfDocuments: this.numberOfDocuments,
            averageDocumentLength: this.averageDocumentLength,
            numberOfWords: this.numberOfWords,
        })) && await this.add(documents);
    }

    getVector(text: string): Array<number> {
        const wordCounts : Record<string, number> = {};
        const words = text.split(wordSplitRegex);
        const vector: number[] = Array(this.numberOfWords).fill(0);

        words.map((word) => {
            word = word.toLowerCase();
            wordCounts[word] = (wordCounts[word] ?? 0) + 1;
        });

        Object.keys(wordCounts).map((word) => {
            word = word.toLowerCase();
            const wordCount = wordCounts[word] ?? 0;
            if(wordCount === 0) {
                return;
            }
            const idf = Math.log((this.numberOfDocuments + 1)/(this.wordStatistics[word].numberOfDocumentsContainingWord + 0.5));
            const tf = (this.k+1)* wordCount  / (wordCount + this.k * (1 - this.b + this.b * (words.length / this.averageDocumentLength)));
            vector[this.wordStatistics[word].index] = tf * idf;
        });
        return vector;
    }

    async resetIndex(): Promise<void> {
        await Promise.all([
            this.index.reset(),
            redis.del('BM25-info')
        ]);
    }
}

