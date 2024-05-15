import {SearchIndex} from "@/lib/search";
import {redis} from "@/context/redis";
import {IndexConfig, QueryResult, Vector} from "@upstash/vector";
import {BigIndex} from "@/lib/big-index";
import {
    CommandOptions,
    DeleteCommandPayload,
    IndexFunctions,
    QueryCommandPayload,
    UpsertCommandPayload
} from "@/types/vector";

interface WordStatistic extends Record<string, unknown> {
    numberOfDocumentsContainingWord: number;
    index: number;
}

export type WordStatistics = Record<string, WordStatistic>;

interface BM25NamespaceInfo extends Record<string, unknown> {
    wordStatistics: WordStatistics;
    numberOfDocuments: number;
    indexedNumberOfDocuments: number;
    totalDocumentLength: number;
    indexedTotalDocumentLength: number;
    numberOfWords: number;
}

type BM25Info = Record<string, BM25NamespaceInfo>;

type BM25SearchIndexConfig<Metadata extends Record<string, unknown> = Record<string, unknown>> = {
    k?: number;
    b?: number;
    configOrIndex?: IndexConfig | IndexFunctions<Metadata>;
    tokenizer?: (text: string) => string[];
};

export type VectorWithData<Metadata extends Record<string, unknown> = Record<string, unknown>> = {
    id: string | number;
    data: string;
    metadata?: Metadata;
} & Vector<Metadata>;

export class BM25Search<Metadata extends Record<string, unknown> = Record<string, unknown>> extends SearchIndex<Metadata> {
    private BM25Statistics: BM25Info = {};
    private ready: Promise<boolean>;
    private k: number;
    private b: number;
    protected searchType: string = 'BM25';
    private tokenizer: (text: string) => string[];


    constructor(BM25SearchIndexConfig?: BM25SearchIndexConfig<Metadata>) {
        super(BM25SearchIndexConfig?.configOrIndex ?? new BigIndex<Metadata>({
            url: process.env.FULL_TEXT_SEARCH_VECTOR_INDEX_URL,
            token: process.env.FULL_TEXT_SEARCH_VECTOR_INDEX_TOKEN,
        }));
        this.b = BM25SearchIndexConfig?.b ?? 0.75;
        this.k = BM25SearchIndexConfig?.k ?? 1.5;
        this.tokenizer = BM25SearchIndexConfig?.tokenizer ?? ((text: string) => text.match(/\w+/g)?.map(s => s.toLowerCase()) ?? []);

        this.ready = redis.get<BM25Info>('BM25-info').then((info) => {
            this.BM25Statistics = info !== null ? info : {};
            return true;
        });
    }

    async delete(args: DeleteCommandPayload, options?: CommandOptions): Promise<{deleted: number}>{
        if (!await this.ready) {
            return {deleted: 0};
        }
        const namespace = options?.namespace ?? "";
        const argsArray = Array.isArray(args) ? args : [args];
        const pipeline = redis.pipeline();
        argsArray.map(a => pipeline.json.get(namespace + '.' + a, '$.data'));
        const results = await pipeline.exec<(string | null)[]>();
        await redis.del(...argsArray.map(a => namespace + '.' + a));
        await redis.srem('BM25.' + namespace, ...argsArray);

        await this.removeTokensFromStatistics(results.map(r => r !== null ? this.tokenizer(r) : []), namespace);

        return await super.delete(args, options);
    }
    async query<TMetadata extends Record<string, unknown> = Metadata>(args: QueryCommandPayload, options?: CommandOptions): Promise<QueryResult<TMetadata>[]>{
        if (!await this.ready) {
            return [];
        }
        if('vector' in args) {
            return super.query(args, options);
        }
        const namespace = options?.namespace ?? "";
        const vector = this.getVectorOfQuery(args.data, namespace);
        return await super.query({
            topK: args.topK,
            vector,
            includeVectors: args.includeVectors,
            includeMetadata: args.includeMetadata,
            filter: args.filter,
        });
    }

    async upsert<TMetadata extends Record<string, unknown> = Metadata>(args: UpsertCommandPayload<TMetadata>, options?:CommandOptions): Promise<string> {
        if(Array.isArray(args) && args.length === 0) {
            return 'Success';
        }
        if((Array.isArray(args) && !('data' in args[0])) || (!Array.isArray(args) && !('data' in args))) {
            if(!Array.isArray(args) && !('vector' in args)) {
                redis.json.set((options?.namespace ?? "") + '.' + args.id, '$.metadata', args.metadata as any);
            } else if(Array.isArray(args)){
                const pipeline = redis.pipeline();
                args.forEach(v => {
                    if(!('vector' in v)) {
                        pipeline.json.set(namespace + '.' + v.id, '$.metadata', v.metadata as any);
                    }
                });
                await pipeline.exec();
            }
            return await super.upsert(args);
        }
        // @ts-ignore
        // Typescript does not support the key check for 'data' from above line
        const argsWithData: VectorWithData<TMetadata>[] = Array.isArray(args) ? args : [args];
        const namespace = options?.namespace ?? "";
        if(!await this.ready){
            return 'Failed';
        }
        await this.addTokensToStatistics(argsWithData.map(d => this.tokenizer(d.data)), namespace);

        let indexedNumberOfDocuments = this.BM25Statistics[namespace]?.indexedNumberOfDocuments ?? 0;
        let indexedTotalDocumentLength = this.BM25Statistics[namespace]?.indexedTotalDocumentLength ?? 0;
        const numberOfDocuments = this.BM25Statistics[namespace]?.numberOfDocuments ?? 0;
        const totalDocumentLength = this.BM25Statistics[namespace]?.totalDocumentLength ?? 0;

        if (this.BM25Statistics[namespace] === undefined || indexedNumberOfDocuments === 0 || indexedTotalDocumentLength === 0) {
            this.BM25Statistics[namespace].indexedNumberOfDocuments = this.BM25Statistics[namespace].numberOfDocuments;
            this.BM25Statistics[namespace].indexedTotalDocumentLength = this.BM25Statistics[namespace].totalDocumentLength;
            const pipeline = redis.pipeline();
            pipeline.json.set('BM25-info', '$.' + namespace + '.indexedNumberOfDocuments', this.BM25Statistics[namespace].indexedNumberOfDocuments);
            pipeline.json.set('BM25-info', '$.' + namespace + '.indexedTotalDocumentLength', this.BM25Statistics[namespace].indexedTotalDocumentLength);
            await pipeline.exec();
        }else if(
                indexedNumberOfDocuments * 2 < numberOfDocuments &&
                Math.abs((indexedTotalDocumentLength / indexedNumberOfDocuments) - (totalDocumentLength / numberOfDocuments)) > (indexedTotalDocumentLength / indexedNumberOfDocuments) * 0.1
            ) {
            await this.updateOldVectors(namespace);
        }

        const pipeline = redis.pipeline();
        pipeline.sadd('BM25.' + namespace, ...argsWithData.map(d => d.id));
        argsWithData.forEach(v => {
            pipeline.json.set(namespace + '.' + v.id, '$', v as any);
        });
        await pipeline.exec();

        return super.upsert(argsWithData.map(a=> {
            return {
                id: a.id,
                vector: this.getVectorOfDocument(this.tokenizer(a.data), namespace),
                metadata: a.metadata,
            };
        }));
    }

    async updateOldVectors(namespace: string): Promise<string> {
        this.BM25Statistics[namespace].indexedNumberOfDocuments = this.BM25Statistics[namespace].numberOfDocuments;
        this.BM25Statistics[namespace].indexedTotalDocumentLength = this.BM25Statistics[namespace].totalDocumentLength;
        await redis.json.set('BM25-info', '$.' + namespace + '.indexedNumberOfDocuments', this.BM25Statistics[namespace].indexedNumberOfDocuments);
        await redis.json.set('BM25-info', '$.' + namespace + '.indexedTotalDocumentLength', this.BM25Statistics[namespace].indexedTotalDocumentLength);
        const documentIds = await redis.smembers('BM25.' + namespace);
        const pipeline = redis.pipeline();
        documentIds.forEach(d => pipeline.json.get(namespace + '.' + d));
        const documents = await pipeline.exec<VectorWithData[]>();
        return await super.upsert(documents.map(d => {
            return {
                id: d.id,
                vector: this.getVectorOfDocument(this.tokenizer(d.data), namespace),
                metadata: d.metadata,
            };
        }), {namespace});
    }

    addTokensToStatistics(tokenizedDocuments: string[][], namespace: string): Promise<unknown> {
        const pipeline = redis.pipeline();
        if (!this.BM25Statistics[namespace]) {
            this.BM25Statistics[namespace] = {
                wordStatistics: {},
                numberOfDocuments: 0,
                indexedNumberOfDocuments: 0,
                totalDocumentLength: 0,
                indexedTotalDocumentLength: 0,
                numberOfWords: 0
            };
            pipeline.json.set('BM25-info', '$.' + namespace, this.BM25Statistics[namespace]);
        }
        let newWords: string[] = [];
        tokenizedDocuments.forEach(document => {
            const words: Set<string> = new Set(document);
            words.forEach(word => {
                if (!this.BM25Statistics[namespace].wordStatistics[word]) {
                    this.BM25Statistics[namespace].wordStatistics[word] = {
                        numberOfDocumentsContainingWord: 0,
                        index: -1,
                    };
                    pipeline.json.set('BM25-info', '$.' + namespace + '.wordStatistics.' + word, this.BM25Statistics[namespace].wordStatistics[word]);
                    newWords.push(word);
                }
                this.BM25Statistics[namespace].wordStatistics[word].numberOfDocumentsContainingWord++;
                pipeline.json.numincrby('BM25-info', '$.' + namespace + '.wordStatistics.' + word + '.numberOfDocumentsContainingWord', 1);
            });
        });

        newWords = newWords.sort();

        newWords.forEach((word, index) => {
            this.BM25Statistics[namespace].wordStatistics[word].index = this.BM25Statistics[namespace].numberOfWords + index;
            pipeline.json.set('BM25-info', '$.' + namespace + '.wordStatistics.' + word + '.index', this.BM25Statistics[namespace].wordStatistics[word].index);
        });

        const totalDocumentLengthToAdd = tokenizedDocuments.reduce((acc, document) => acc + document.length, 0);

        this.BM25Statistics[namespace].numberOfWords += newWords.length;
        this.BM25Statistics[namespace].numberOfDocuments += tokenizedDocuments.length;
        this.BM25Statistics[namespace].totalDocumentLength += totalDocumentLengthToAdd;

        pipeline.json.numincrby('BM25-info', '$.' + namespace + '.numberOfWords', newWords.length);
        pipeline.json.numincrby('BM25-info', '$.' + namespace + '.numberOfDocuments', tokenizedDocuments.length);
        pipeline.json.numincrby('BM25-info', '$.' + namespace + '.totalDocumentLength', totalDocumentLengthToAdd);

        return pipeline.exec();
    }

    async removeTokensFromStatistics(tokenizedDocuments: string[][], namespace: string): Promise<void> {
        const pipeline = redis.pipeline();
        tokenizedDocuments.forEach(document => {
            const words: Set<string> = new Set(document);
            words.forEach(word => {
                if (!this.BM25Statistics[namespace].wordStatistics[word]) {
                    return;
                }
                this.BM25Statistics[namespace].wordStatistics[word].numberOfDocumentsContainingWord--;
                pipeline.json.numincrby('BM25-info', '$.' + namespace + '.wordStatistics.' + word + '.numberOfDocumentsContainingWord', -1);
            });
        });

        const numberOfDocumentsToRemove = tokenizedDocuments.length;
        const totalDocumentLengthToRemove = tokenizedDocuments.reduce((acc, document) => acc + document.length, 0);

        this.BM25Statistics[namespace].numberOfDocuments -= numberOfDocumentsToRemove;
        this.BM25Statistics[namespace].totalDocumentLength -= totalDocumentLengthToRemove;
        pipeline.json.numincrby('BM25-info', '$.' + namespace + '.numberOfDocuments', -numberOfDocumentsToRemove);
        pipeline.json.numincrby('BM25-info', '$.' + namespace + '.totalDocumentLength', -totalDocumentLengthToRemove);
        await pipeline.exec();
    }

    getVectorOfDocument(tokens: string[], namespace: string): number[] {
        if (!this.BM25Statistics || !this.BM25Statistics[namespace]) {
            return [];
        }
        const tokenCounts : Record<string, number> = {};
        const vector: number[] = Array(this.BM25Statistics[namespace].numberOfWords).fill(0);
        const averageDocumentLength = this.BM25Statistics[namespace].totalDocumentLength / this.BM25Statistics[namespace].numberOfDocuments;

        tokens.map((token) => {
            tokenCounts[token] = (tokenCounts[token] ?? 0) + 1;
        });

        Object.entries(tokenCounts).map(([token, tokenCount]) => {
            tokenCount = tokenCount ?? 0;
            const index = this.BM25Statistics[namespace].wordStatistics[token]?.index ?? -1;
            if(tokenCount === 0 || index === -1) {
                return;
            }

            vector[index] = tokenCount / (tokenCount + this.k * (1 - this.b + this.b * (tokens.length / averageDocumentLength)));
        });

        return vector;
    }

    getVectorOfQuery(text: string, namespace: string): number[] {
        if (!this.BM25Statistics || !this.BM25Statistics[namespace]) {
            return [];
        }
        const words: string[] = this.tokenizer(text);
        const vector: number[] = Array(this.BM25Statistics[namespace].numberOfWords).fill(0);

        words.map((word) => {
            const index = this.BM25Statistics[namespace].wordStatistics[word]?.index ?? -1;
            if(index === -1) {
                return;
            }
            vector[index] += Math.log((this.BM25Statistics[namespace].numberOfDocuments + 1)/(this.BM25Statistics[namespace].wordStatistics[word].numberOfDocumentsContainingWord + 0.5));
        });

        return vector;
    }

    async reset(options?: CommandOptions): Promise<string> {
        const namespace = options?.namespace ?? "";
        delete this.BM25Statistics[namespace];
        await redis.json.del('BM25-info', '$.' + namespace);
        const documents = await redis.smembers('BM25.' + namespace);
        await redis.del(...documents.map(d => namespace + '.' + d), 'BM25.' + namespace);
        await super.reset(options);
        return 'Success';
    }
}

