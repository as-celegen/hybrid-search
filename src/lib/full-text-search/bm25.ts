import {Document, Metadata, Search} from "@/lib/search";
import {redis} from "@/context/redis";
import {Index} from "@upstash/vector";

interface WordStatistic {
    numberOfDocumentsContainingWord: number;
    index: number;
    idf: number;
}

export type WordStatistics = Record<string, WordStatistic>;

interface BM25Info {
    wordStatistics: WordStatistics;
    numberOfDocuments: number;
    averageDocumentLength: number;
    numberOfWords: number;
}


export class BM25 extends Search {
    wordStatistics: WordStatistics = {};
    numberOfDocuments: number = 0;
    ready: Promise<boolean>;
    averageDocumentLength: number = 0;
    k: number;
    b: number;
    numberOfWords: number = 0;
    index: Index<Metadata>;
    searchType: string = 'BM25';


    constructor(k  = 1.5, b  = 0.75) {
        super();
        this.b = b;
        this.k = k;

        this.index = new Index({
            'url': process.env.BM25_VECTOR_INDEX_URL,
            'token': process.env.BM25_VECTOR_INDEX_TOKEN,
        });

        this.ready = redis.get<BM25Info>('BM25-info').then((info) => {
            if (info) {
                this.wordStatistics = info.wordStatistics;
                this.numberOfDocuments = info.numberOfDocuments;
                this.averageDocumentLength = info.averageDocumentLength;
                this.numberOfWords = info.numberOfWords;
                return true;
            }
            return false;
        });
    }


    async buildIndex(documents: Document[]): Promise<boolean> {
        await this.ready;
        await this.resetIndex();

        await this.prepareIndex(documents);

        return 'OK' === (await redis.set<BM25Info>('BM25-info', {
            wordStatistics: this.wordStatistics,
            numberOfDocuments: this.numberOfDocuments,
            averageDocumentLength: this.averageDocumentLength,
            numberOfWords: this.numberOfWords,
        })) && await this.add(documents);
    }

    async prepareIndex(documents: Document[]): Promise<boolean> {
        this.numberOfDocuments = documents.length;
        this.averageDocumentLength = 0;
        this.wordStatistics = {};
        documents.map((document) => {
            const words: string[] = document.document.match(/\w+/g) ?? [];
            words.map((word) => {
                word = word.toLowerCase();
                if (!this.wordStatistics[word]) {
                    this.wordStatistics[word] = {
                        numberOfDocumentsContainingWord: 0,
                        index: -1,
                        idf: 0,
                    };
                }
                this.wordStatistics[word].numberOfDocumentsContainingWord++;
            });
            this.averageDocumentLength += words.length;
        });
        this.averageDocumentLength /= this.numberOfDocuments;

        const allWords = Object.keys(this.wordStatistics).sort();

        allWords.map((word, index) => {
            this.wordStatistics[word].idf = Math.log((this.numberOfDocuments + 1)/(this.wordStatistics[word].numberOfDocumentsContainingWord + 0.5));
            this.wordStatistics[word].index = index;
        });
        this.numberOfWords = allWords.length;
        this.ready = Promise.resolve(true);
        return true;
    }

    async getVector(text: string): Promise<Array<number>> {
        const wordCounts : Record<string, number> = {};
        const words: string[] = text.match(/\w+/g) ?? [];
        const vector: number[] = Array(this.numberOfWords).fill(0);

        words.map((word) => {
            word = word.toLowerCase();
            wordCounts[word] = (wordCounts[word] ?? 0) + 1;
        });

        Object.entries(wordCounts).map(([word, wordCount]) => {
            word = word.toLowerCase();
            wordCount = wordCount ?? 0;
            const index = this.wordStatistics[word]?.index ?? -1;
            if(wordCount === 0 || index === -1) {
                return;
            }

            const tf = (this.k+1)* wordCount  / (wordCount + this.k * (1 - this.b + this.b * (words.length / this.averageDocumentLength)));
            vector[index] = tf * this.wordStatistics[word].idf;
        });
        // TODO: Fix the dimension limit
        let resizedVector: number[] = vector;
        if(vector.length > 1536) {
            resizedVector = vector.slice(0, 1536);
        } else if(vector.length < 1536) {
            resizedVector = vector.concat(Array.from({length: 1536 - vector.length}, () => 0));
        }
        return resizedVector;
    }

    async getVectorForSearch(text: string): Promise<Array<number>> {
        const words: string[] = text.match(/\w+/g) ?? [];
        const vector: number[] = Array(this.numberOfWords).fill(0);

        words.map((word) => {
            word = word.toLowerCase();
            const index = this.wordStatistics[word]?.index ?? -1;
            if(index === -1) {
                return;
            }
            vector[index] += 1.1;
        });
        // TODO: Fix the dimension limit
        let resizedVector: number[] = vector;
        if(vector.length > 1536) {
            resizedVector = vector.slice(0, 1536);
        } else if(vector.length < 1536) {
            resizedVector = vector.concat(Array.from({length: 1536 - vector.length}, () => 0));
        }
        return resizedVector;
    }

    async resetIndex(): Promise<void> {
        await Promise.all([
            super.resetIndex(),
            redis.del('BM25-info')
        ]);
    }
}

