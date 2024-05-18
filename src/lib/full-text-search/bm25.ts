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
};

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

        const oldContents = await redis.json.mget<string[]>(argsArray.map(a => namespace + '.' + a), '$.data');
        await Promise.all([redis.del(...argsArray.map(a => namespace + '.' + a)), redis.srem('BM25.' + namespace, ...argsArray)]);

        await this.removeTokensFromStatistics(oldContents.map(r => r !== null ? this.tokenizer(r) : []), namespace);

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
        const vector = await this.getVectorOfQuery(args.data, namespace);
        return await super.query({
            topK: args.topK,
            vector,
            includeVectors: args.includeVectors,
            includeMetadata: args.includeMetadata,
            filter: args.filter,
        });
    }

    async upsert<TMetadata extends Record<string, unknown> = Metadata>(args: UpsertCommandPayload<TMetadata>, options?:CommandOptions): Promise<string> {
        const namespace = options?.namespace ?? "";

        if (Array.isArray(args) && args.length === 0) {
            return 'Success';
        }
        if ((Array.isArray(args) && !('data' in args[0])) || (!Array.isArray(args) && !('data' in args))) {
            if (!Array.isArray(args) && !('vector' in args)) {
                await redis.json.set((options?.namespace ?? "") + '.' + args.id, '$.metadata', args.metadata as any);
            } else if (Array.isArray(args)) {
                const pipeline = redis.pipeline();
                args.forEach(v => {
                    if (!('vector' in v)) {
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
        if (!await this.ready) {
            return 'Failed';
        }

        const isOldDocument = await redis.smismember('BM25.' + namespace, argsWithData.map(d => d.id));
        const existingDocumentIds = argsWithData.filter((_, i) => isOldDocument[i] === 1).map(d => d.id);
        if (existingDocumentIds.length > 0) {
            const existingDocuments = await redis.json.mget<string[]>(existingDocumentIds.map(d => namespace + '.' + d), '$.data');
            await this.removeTokensFromStatistics(existingDocuments.map(d => d !== null ? this.tokenizer(d) : []), namespace);
        }

        await this.addTokensToStatistics(argsWithData.map(d => this.tokenizer(d.data)), namespace);

        const checkIfRebuildIsNeeded = () => {
            const indexedNumberOfDocuments = this.BM25Statistics[namespace]?.indexedNumberOfDocuments ?? 0;
            const indexedTotalDocumentLength = this.BM25Statistics[namespace]?.indexedTotalDocumentLength ?? 0;
            const numberOfDocuments = this.BM25Statistics[namespace]?.numberOfDocuments ?? 0;
            const totalDocumentLength = this.BM25Statistics[namespace]?.totalDocumentLength ?? 0;

            return (indexedNumberOfDocuments === 0 || indexedTotalDocumentLength === 0 || (
                (indexedNumberOfDocuments * 0.5 > numberOfDocuments || indexedNumberOfDocuments * 2 < numberOfDocuments) &&
                Math.abs((indexedTotalDocumentLength / indexedNumberOfDocuments) - (totalDocumentLength / numberOfDocuments)) > (indexedTotalDocumentLength / indexedNumberOfDocuments) * 0.1
            ));
        };

        const pipelineForStats = redis.pipeline();
        pipelineForStats.json.get('BM25-info', '$.' + namespace + '.indexedNumberOfDocuments');
        pipelineForStats.json.get('BM25-info', '$.' + namespace + '.indexedTotalDocumentLength');
        pipelineForStats.json.get('BM25-info', '$.' + namespace + '.numberOfDocuments');
        pipelineForStats.json.get('BM25-info', '$.' + namespace + '.totalDocumentLength');
        const newIndexedStats = await pipelineForStats.exec<number[]>();

        this.BM25Statistics[namespace].indexedNumberOfDocuments = newIndexedStats[0] ?? 0;
        this.BM25Statistics[namespace].indexedTotalDocumentLength = newIndexedStats[1] ?? 0;
        this.BM25Statistics[namespace].numberOfDocuments = newIndexedStats[2] ?? 0;
        this.BM25Statistics[namespace].totalDocumentLength = newIndexedStats[3] ?? 0;

        if (checkIfRebuildIsNeeded()) {
            const isFirstUpsert = (this.BM25Statistics[namespace].indexedNumberOfDocuments ?? 0) === 0;

            this.BM25Statistics[namespace].indexedNumberOfDocuments = this.BM25Statistics[namespace].numberOfDocuments;
            this.BM25Statistics[namespace].indexedTotalDocumentLength = this.BM25Statistics[namespace].totalDocumentLength;

            const pipeline = redis.pipeline();
            pipeline.json.set('BM25-info', '$.' + namespace + '.indexedNumberOfDocuments', this.BM25Statistics[namespace].indexedNumberOfDocuments);
            pipeline.json.set('BM25-info', '$.' + namespace + '.indexedTotalDocumentLength', this.BM25Statistics[namespace].indexedTotalDocumentLength);
            await pipeline.exec();

            if (!isFirstUpsert) {
                await this.updateOldVectors(namespace);
            }
        }

        const pipeline = redis.pipeline();
        pipeline.sadd('BM25.' + namespace, ...argsWithData.map(d => d.id));
        argsWithData.forEach(v => {
            pipeline.json.set(namespace + '.' + v.id, '$', v as any);
        });
        await pipeline.exec();

        return super.upsert(await Promise.all(argsWithData.map(async a => {
            return {
                id: a.id,
                vector: await this.getVectorOfDocument(this.tokenizer(a.data), namespace),
                metadata: a.metadata,
            };
        })));
    }

    async updateOldVectors(namespace: string): Promise<string> {
        const documentIds = await redis.smembers('BM25.' + namespace);
        const documents = await redis.json.mget<VectorWithData<Metadata>[]>(documentIds.map(d => namespace + '.' + d), '$');
        return await super.upsert(await Promise.all(documents.map(async d => {
            return {
                id: d.id,
                vector: await this.getVectorOfDocument(this.tokenizer(d.data), namespace),
                metadata: d.metadata,
            };
        })), {namespace});
    }

    async addTokensToStatistics(tokenizedDocuments: string[][], namespace: string): Promise<void> {
        if (!this.BM25Statistics[namespace]) {
            this.BM25Statistics[namespace] = {
                wordStatistics: {},
                numberOfDocuments: 0,
                indexedNumberOfDocuments: 0,
                totalDocumentLength: 0,
                indexedTotalDocumentLength: 0,
                numberOfWords: 0
            };
            const response = await redis.json.set('BM25-info', '$.' + namespace, this.BM25Statistics[namespace], {nx: true});
            if(response === null) {
                this.BM25Statistics[namespace] = await redis.json.get<BM25NamespaceInfo>('BM25-info', '$.' + namespace) ?? this.BM25Statistics[namespace];
            }
        }
        const wordsToIncrease: Record<string, number> = {};
        await Promise.all(tokenizedDocuments.map(async document => {
            const words: Set<string> = new Set(document);
            await Promise.all(Array.from(words).map(async word => {
                if (!this.BM25Statistics[namespace].wordStatistics[word]) {
                    this.BM25Statistics[namespace].wordStatistics[word] = {
                        numberOfDocumentsContainingWord: 0,
                        index: -1,
                    };
                    const response = await redis.json.set('BM25-info', '$.' + namespace + '.wordStatistics.' + word, this.BM25Statistics[namespace].wordStatistics[word], {nx: true});
                    if(response === null) {
                        this.BM25Statistics[namespace].wordStatistics[word] = await redis.json.get<WordStatistic>('BM25-info', '$.' + namespace + '.wordStatistics.' + word) ?? this.BM25Statistics[namespace].wordStatistics[word];
                    }else{
                        this.BM25Statistics[namespace].numberOfWords = (await redis.json.numincrby('BM25-info', '$.' + namespace + '.numberOfWords', 1))[0] ?? this.BM25Statistics[namespace].numberOfWords;
                        this.BM25Statistics[namespace].wordStatistics[word].index = this.BM25Statistics[namespace].numberOfWords - 1;
                        await redis.json.set('BM25-info', '$.' + namespace + '.wordStatistics.' + word + '.index', this.BM25Statistics[namespace].wordStatistics[word].index);
                    }
                }
                this.BM25Statistics[namespace].wordStatistics[word].numberOfDocumentsContainingWord++;
                wordsToIncrease[word] = (wordsToIncrease[word] ?? 0) + 1;
            }));
        }));

        const totalDocumentLengthToAdd = tokenizedDocuments.reduce((acc, document) => acc + document.length, 0);

        const pipeline2 = redis.pipeline();

        pipeline2.json.numincrby('BM25-info', '$.' + namespace + '.numberOfDocuments', tokenizedDocuments.length);
        pipeline2.json.numincrby('BM25-info', '$.' + namespace + '.totalDocumentLength', totalDocumentLengthToAdd);

        const newStats = await pipeline2.exec<number[]>();

        this.BM25Statistics[namespace].numberOfDocuments = newStats[0];
        this.BM25Statistics[namespace].totalDocumentLength = newStats[1];

        const pipeline = redis.pipeline();

        const wordsToIncreaseEntries = Object.entries(wordsToIncrease);

        wordsToIncreaseEntries
            .forEach(([word, count]) => pipeline.json.numincrby('BM25-info', '$.' + namespace + '.wordStatistics.' + word + '.numberOfDocumentsContainingWord', count));
        const results = await pipeline.exec<number[]>();

        wordsToIncreaseEntries.forEach(([word, count], i) => {
            this.BM25Statistics[namespace].wordStatistics[word].numberOfDocumentsContainingWord = results[i];
        });
    }

    async removeTokensFromStatistics(tokenizedDocuments: string[][], namespace: string): Promise<void> {
        const wordsToDecrement: Record<string, number> = {}
        tokenizedDocuments.forEach(document => {
            const words: Set<string> = new Set(document);
            words.forEach(word => {
                if (!this.BM25Statistics[namespace].wordStatistics[word]) {
                    return;
                }
                if(this.BM25Statistics[namespace].wordStatistics[word].numberOfDocumentsContainingWord-- > 0) {
                    wordsToDecrement[word] = (wordsToDecrement[word] ?? 0) + 1;
                }else {
                    this.BM25Statistics[namespace].wordStatistics[word].numberOfDocumentsContainingWord = 0;
                }
            });
        });
        const numberOfDocumentsToRemove = tokenizedDocuments.length;
        const totalDocumentLengthToRemove = tokenizedDocuments.reduce((acc, document) => acc + document.length, 0);

        const pipeline2 = redis.pipeline();
        pipeline2.json.numincrby('BM25-info', '$.' + namespace + '.numberOfDocuments', -numberOfDocumentsToRemove);
        pipeline2.json.numincrby('BM25-info', '$.' + namespace + '.totalDocumentLength', -totalDocumentLengthToRemove);
        const newStats = await pipeline2.exec<number[]>();

        this.BM25Statistics[namespace].numberOfDocuments = newStats[0];
        this.BM25Statistics[namespace].totalDocumentLength = newStats[1];

        const pipeline = redis.pipeline();
        Object.entries(wordsToDecrement)
            .forEach(([word, count]) => pipeline.json.numincrby('BM25-info', '$.' + namespace + '.wordStatistics.' + word + '.numberOfDocumentsContainingWord', -count));
        await pipeline.exec();
    }

    async getVectorOfDocument(tokens: string[], namespace: string): Promise<number[]> {
        if (!this.BM25Statistics || !this.BM25Statistics[namespace]) {
            return [];
        }
        const tokenCounts : Record<string, number> = {};
        const vector: number[] = Array(this.BM25Statistics[namespace].numberOfWords).fill(0);
        const averageDocumentLength = this.BM25Statistics[namespace].indexedTotalDocumentLength / this.BM25Statistics[namespace].indexedNumberOfDocuments;

        tokens.map((token) => {
            tokenCounts[token] = (tokenCounts[token] ?? 0) + 1;
        });

        await Promise.all(Object.entries(tokenCounts).map(async ([token, tokenCount]) => {
            tokenCount = tokenCount ?? 0;
            let index = this.BM25Statistics[namespace].wordStatistics[token]?.index ?? -2;
            if(index === -1){
                let remoteIndex = await redis.json.get<number>('BM25-info', '$.' + namespace + '.wordStatistics.' + token + '.index');
                if(remoteIndex !== null) {
                    this.BM25Statistics[namespace].wordStatistics[token].index = remoteIndex;
                    index = remoteIndex;
                } else {
                    return;
                }
            } else if(tokenCount === 0 || index === -2) {
                return;
            }

            vector[index] += tokenCount / (tokenCount + this.k * (1 - this.b + this.b * (tokens.length / averageDocumentLength)));
        }));

        return vector;
    }

    async getVectorOfQuery(text: string, namespace: string): Promise<number[]> {
        if (!this.BM25Statistics || !this.BM25Statistics[namespace]) {
            return [];
        }
        const words: string[] = this.tokenizer(text);
        const vector: number[] = Array(this.BM25Statistics[namespace].numberOfWords).fill(0);

        await Promise.all(words.map(async (word) => {
            let index = this.BM25Statistics[namespace].wordStatistics[word]?.index ?? -2;
            if(index === -1) {
                let remoteIndex = await redis.json.get<number>('BM25-info', '$.' + namespace + '.wordStatistics.' + word + '.index');
                if(remoteIndex !== null) {
                    this.BM25Statistics[namespace].wordStatistics[word].index = remoteIndex;
                    index = remoteIndex;
                } else {
                    return;
                }
            }else if(index === -2){
                return;
            }
            vector[index] += Math.log((this.BM25Statistics[namespace].numberOfDocuments + 1)/(this.BM25Statistics[namespace].wordStatistics[word].numberOfDocumentsContainingWord + 0.5));
        }));

        return vector;
    }

    async reset(options?: CommandOptions): Promise<string> {
        const namespace = options?.namespace ?? "";
        delete this.BM25Statistics[namespace];
        const documentIds = await redis.smembers('BM25.' + namespace);
        const infoDel = redis.json.del('BM25-info', '$.' + namespace);
        const documentDel = redis.del('BM25.' + namespace, ...documentIds.map(d => namespace + '.' + d));
        await Promise.all([infoDel, documentDel]);
        await super.reset(options);
        return 'Success';
    }
}

