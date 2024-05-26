import {SearchIndex} from "@/lib/search";
import {redis} from "@/context/redis";
import { IndexConfig, QueryResult } from "@upstash/vector";
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

type WordStatistics = Record<string, WordStatistic>;

interface BM25NamespaceInfo extends Record<string, unknown> {
    wordStatistics: WordStatistics;
    numberOfDocuments: number;
    indexedNumberOfDocuments: number;
    totalDocumentLength: number;
    indexedTotalDocumentLength: number;
    numberOfWords: number;
}

export type BM25Info = Record<string, BM25NamespaceInfo>;

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

const indexedValuesSyncScript: string = `
    local namespace = ARGV[1]
    local numberOfDocuments = cjson.decode(redis.call('JSON.GET', 'BM25-info', '$[' .. namespace .. '].numberOfDocuments'))[1]
    local totalDocumentLength = cjson.decode(redis.call('JSON.GET', 'BM25-info', '$[' .. namespace .. '].totalDocumentLength'))[1]
    local indexedNumberOfDocuments = cjson.decode(redis.call('JSON.GET', 'BM25-info', '$[' .. namespace .. '].indexedNumberOfDocuments'))[1]
    local indexedTotalDocumentLength = cjson.decode(redis.call('JSON.GET', 'BM25-info', '$[' .. namespace .. '].indexedTotalDocumentLength'))[1]
          
    if (indexedNumberOfDocuments == 0 or indexedTotalDocumentLength == 0 or (
        (indexedNumberOfDocuments * 0.5 > numberOfDocuments or indexedNumberOfDocuments * 2 < numberOfDocuments) and
            math.abs((indexedTotalDocumentLength / indexedNumberOfDocuments) - (totalDocumentLength / numberOfDocuments)) > (indexedTotalDocumentLength / indexedNumberOfDocuments) * 0.1
        )) then
            redis.call('JSON.SET', 'BM25-info', '$[' .. namespace .. '].indexedNumberOfDocuments', numberOfDocuments)
            redis.call('JSON.SET', 'BM25-info', '$[' .. namespace .. '].indexedTotalDocumentLength', totalDocumentLength)
            return {(indexedNumberOfDocuments == 0) and 1 or 2, numberOfDocuments, numberOfDocuments, totalDocumentLength}
    else
            return {0, numberOfDocuments, indexedNumberOfDocuments, indexedTotalDocumentLength}
    end
    `;

const addWordToStatisticsScript: string = `
    local namespace = ARGV[1]
    local word = ARGV[2]
    local defaultWordStatistics = {numberOfDocumentsContainingWord = 0, index = -1}
    local response = redis.call('JSON.SET', 'BM25-info', '$[' .. namespace .. '].wordStatistics[' .. word .. ']', cjson.encode(defaultWordStatistics), 'NX')
    local index = -1
    local numberOfWords = -1
    if response ~= nil then
        numberOfWords = cjson.decode(redis.call('JSON.NUMINCRBY', 'BM25-info', '$[' .. namespace .. '].numberOfWords', 1))[1]
        redis.call('JSON.SET', 'BM25-info', '$[' .. namespace .. '].wordStatistics[' .. word .. '].index', numberOfWords - 1)
        index = numberOfWords - 1
    else
        index = cjson.decode(redis.call('JSON.GET', 'BM25-info', '$[' .. namespace .. '].wordStatistics[' .. word .. '].index'))[1]
        numberOfWords = cjson.decode(redis.call('JSON.GET', 'BM25-info', '$[' .. namespace .. '].numberOfWords'))[1]
    end
    return {index, numberOfWords}
`;

export class BM25Search<Metadata extends Record<string, unknown> = Record<string, unknown>> extends SearchIndex<Metadata> {
    private BM25Statistics: BM25Info = {};
    private ready: Promise<boolean>;
    private k: number;
    private b: number;
    protected searchType: string = 'BM25';
    private tokenizer: (text: string) => string[];
    private indexedValuesSyncScriptSha: string = '';
    private addWordToStatisticsScriptSha: string = '';

    getPathForStats = (namespace: string) => `$[${JSON.stringify(namespace)}]`;
    getPathForWordStats = (namespace: string, word: string) => `$[${JSON.stringify(namespace)}].wordStatistics[${JSON.stringify(word)}]`;
    getRedisKeyForDocument = (namespace: string, id: string | number) => JSON.stringify(namespace) + '.' + JSON.stringify(id.toString());


    constructor(BM25SearchIndexConfig?: BM25SearchIndexConfig<Metadata>) {
        super(BM25SearchIndexConfig?.configOrIndex ?? new BigIndex<Metadata>({
            url: process.env.FULL_TEXT_SEARCH_VECTOR_INDEX_URL,
            token: process.env.FULL_TEXT_SEARCH_VECTOR_INDEX_TOKEN,
        }));
        this.b = BM25SearchIndexConfig?.b ?? 0.75;
        this.k = BM25SearchIndexConfig?.k ?? 1.5;
        this.tokenizer = BM25SearchIndexConfig?.tokenizer ?? ((text: string) => text.match(/\w+/g)?.map(s => s.toLowerCase()) ?? []);

        this.ready = redis.json.set('BM25-info', '$', {}, {nx: true}).then(async (response) => {
            [this.indexedValuesSyncScriptSha, this.addWordToStatisticsScriptSha] = await Promise.all([redis.scriptLoad(indexedValuesSyncScript), redis.scriptLoad(addWordToStatisticsScript)])
            if(response === 'OK') {
                this.BM25Statistics = {};
            } else {
                const info = await redis.json.get<BM25Info>('BM25-info');
                if (info) {
                    this.BM25Statistics = info;
                } else {
                    return false;
                }
            }
            return true;
        });
    }

    async delete(args: DeleteCommandPayload, options?: CommandOptions): Promise<{deleted: number}>{
        if (!await this.ready) {
            return {deleted: 0};
        }
        const namespace = options?.namespace ?? "";
        const argsArray = Array.isArray(args) ? args : [args];

        const oldContents = await redis.json.mget<string[][]>(argsArray.map(a => this.getRedisKeyForDocument(namespace, a)), '$.data');
        await Promise.all([redis.del(...argsArray.map(a => this.getRedisKeyForDocument(namespace, a))), redis.srem('BM25.' + namespace, ...argsArray)]);

        await this.removeTokensFromStatistics(oldContents.map(r => r !== null ? this.tokenizer(r[0]) : []), namespace);

        await this.checkAndRebuild(namespace);

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
        }, {namespace});
    }

    async upsert<TMetadata extends Record<string, unknown> = Metadata>(args: UpsertCommandPayload<TMetadata>, options?:CommandOptions): Promise<string> {
        const namespace = options?.namespace ?? "";

        if (Array.isArray(args) && args.length === 0) {
            return 'Success';
        }
        if ((Array.isArray(args) && !('data' in args[0])) || (!Array.isArray(args) && !('data' in args))) {
            if (!Array.isArray(args) && !('vector' in args)) {
                await redis.json.set(this.getRedisKeyForDocument(namespace, args.id), '$.metadata', args.metadata as any);
            } else if (Array.isArray(args)) {
                const pipeline = redis.pipeline();
                args.forEach(v => {
                    if (!('vector' in v)) {
                        pipeline.json.set(this.getRedisKeyForDocument(namespace, v.id), '$.metadata', v.metadata as any);
                    }
                });
                await pipeline.exec();
            }
            return await super.upsert(args, {namespace});
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
            const existingDocuments = await redis.json.mget<string[][]>(existingDocumentIds.map(d => this.getRedisKeyForDocument(namespace, d)), '$.data');
            await this.removeTokensFromStatistics(existingDocuments.map(d => d !== null ? this.tokenizer(d[0]) : []), namespace);
        }

        await this.addTokensToStatistics(argsWithData.map(d => this.tokenizer(d.data)), namespace);
        await this.checkAndRebuild(namespace);

        const pipeline = redis.pipeline();
        pipeline.sadd('BM25.' + namespace, ...argsWithData.map(d => d.id));
        argsWithData.forEach(v => {
            pipeline.json.set(this.getRedisKeyForDocument(namespace, v.id), '$', v as any);
        });
        await pipeline.exec();

        return super.upsert(await Promise.all(argsWithData.map(async a => {
            return {
                id: a.id,
                vector: await this.getVectorOfDocument(this.tokenizer(a.data), namespace),
                metadata: a.metadata,
            };
        })), {namespace});
    }

    async checkAndRebuild(namespace: string): Promise<void> {
        const response = await redis.evalsha<[string], [number, number, number, number]>(this.indexedValuesSyncScriptSha, ['BM25-info'], [JSON.stringify(namespace)]);
        this.BM25Statistics[namespace].numberOfDocuments = response[1];
        this.BM25Statistics[namespace].indexedNumberOfDocuments = response[2];
        this.BM25Statistics[namespace].indexedTotalDocumentLength = response[3];
        if (response[0] !== 0) {
            if (response[0] === 2) {
                await this.updateOldVectors(namespace);
            }
        }
    }

    async updateOldVectors(namespace: string): Promise<string> {
        const documentIds = await redis.smembers('BM25.' + namespace);
        const documents = await redis.json.mget<VectorWithData<Metadata>[][]>(documentIds.map(d => this.getRedisKeyForDocument(namespace, d)), '$');
        return await super.upsert(await Promise.all(documents.map(async d => {
            return {
                id: d[0].id,
                vector: await this.getVectorOfDocument(this.tokenizer(d[0].data), namespace),
                metadata: d[0].metadata,
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
            const response = await redis.json.set('BM25-info', this.getPathForStats(namespace), this.BM25Statistics[namespace], {nx: true});
            if(response === null) {
                this.BM25Statistics[namespace] = await redis.json.get<BM25NamespaceInfo>('BM25-info', this.getPathForStats(namespace)) ?? this.BM25Statistics[namespace];
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
                    const response = await redis.evalsha<[string, string], [number, number]>(this.addWordToStatisticsScriptSha, ['BM25-info'], [JSON.stringify(namespace), JSON.stringify(word)]);
                    this.BM25Statistics[namespace].wordStatistics[word].index = response[0];
                    this.BM25Statistics[namespace].numberOfWords = Math.max(this.BM25Statistics[namespace].numberOfWords, response[1]);
                }
                wordsToIncrease[word] = (wordsToIncrease[word] ?? 0) + 1;
            }));
        }));

        const totalDocumentLengthToAdd = tokenizedDocuments.reduce((acc, document) => acc + document.length, 0);
        const wordsToIncreaseEntries = Object.entries(wordsToIncrease);

        const pipeline = redis.pipeline();

        pipeline.json.numincrby('BM25-info', this.getPathForStats(namespace) + '.numberOfDocuments', tokenizedDocuments.length);
        pipeline.json.numincrby('BM25-info', this.getPathForStats(namespace) + '.totalDocumentLength', totalDocumentLengthToAdd);

        wordsToIncreaseEntries
            .forEach(([word, count]) => pipeline.json.numincrby('BM25-info',  this.getPathForWordStats(namespace, word)+ '.numberOfDocumentsContainingWord', count));
        const results = await pipeline.exec<number[][]>();

        this.BM25Statistics[namespace].numberOfDocuments = results[0][0];
        this.BM25Statistics[namespace].totalDocumentLength = results[1][0];

        wordsToIncreaseEntries.forEach(([word, count], i) => {
            this.BM25Statistics[namespace].wordStatistics[word].numberOfDocumentsContainingWord = results[i + 2][0];
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
        const wordsToDecrementEntries = Object.entries(wordsToDecrement);

        const pipeline = redis.pipeline();
        pipeline.json.numincrby('BM25-info', this.getPathForStats(namespace) + '.numberOfDocuments', -numberOfDocumentsToRemove);
        pipeline.json.numincrby('BM25-info', this.getPathForStats(namespace) + '.totalDocumentLength', -totalDocumentLengthToRemove);

        wordsToDecrementEntries
            .forEach(([word, count]) => pipeline.json.numincrby('BM25-info', this.getPathForWordStats(namespace, word) + '.numberOfDocumentsContainingWord', -count));
        const results = await pipeline.exec<number[][]>();

        this.BM25Statistics[namespace].numberOfDocuments = results[0][0];
        this.BM25Statistics[namespace].totalDocumentLength = results[1][0];

        wordsToDecrementEntries.forEach(([word, count], i) => {
            this.BM25Statistics[namespace].wordStatistics[word].numberOfDocumentsContainingWord = results[i + 2][0];
        });
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
            let index = this.BM25Statistics[namespace].wordStatistics[token]?.index ?? -1;
            if(index === -1){
                let remoteWord = await redis.json.get<WordStatistic>('BM25-info', this.getPathForWordStats(namespace, token));
                if(remoteWord !== null && remoteWord.index !== -1) {
                    this.BM25Statistics[namespace].wordStatistics[token] = remoteWord;
                    index = remoteWord.index;
                    if(this.BM25Statistics[namespace].wordStatistics[token].index >= this.BM25Statistics[namespace].numberOfWords) {
                        vector.push(...Array(this.BM25Statistics[namespace].wordStatistics[token].index - this.BM25Statistics[namespace].numberOfWords + 1).fill(0))
                        this.BM25Statistics[namespace].numberOfWords = this.BM25Statistics[namespace].wordStatistics[token].index + 1;
                    }
                } else {
                    return;
                }
            } else if(tokenCount === 0) {
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
            let index = this.BM25Statistics[namespace].wordStatistics[word]?.index ?? -1;
            if(index === -1){
                let remoteWord = await redis.json.get<WordStatistic>('BM25-info', this.getPathForWordStats(namespace, word));
                if(remoteWord !== null && remoteWord.index !== -1) {
                    this.BM25Statistics[namespace].wordStatistics[word] = remoteWord;
                    index = remoteWord.index;
                    if(this.BM25Statistics[namespace].wordStatistics[word].index >= this.BM25Statistics[namespace].numberOfWords) {
                        vector.push(...Array(this.BM25Statistics[namespace].wordStatistics[word].index - this.BM25Statistics[namespace].numberOfWords + 1).fill(0))
                        this.BM25Statistics[namespace].numberOfWords = this.BM25Statistics[namespace].wordStatistics[word].index + 1;
                    }
                } else {
                    return;
                }
            }
            vector[index] += Math.log((this.BM25Statistics[namespace].numberOfDocuments + 1)/(this.BM25Statistics[namespace].wordStatistics[word].numberOfDocumentsContainingWord + 0.5));
        }));

        return vector;
    }

    async reset(options?: CommandOptions): Promise<string> {
        const namespace = options?.namespace ?? "";
        delete this.BM25Statistics[namespace];
        const documentIds = await redis.smembers('BM25.' + namespace);
        const infoDel = redis.json.del('BM25-info', this.getPathForStats(namespace));
        const documentDel = redis.del('BM25.' + namespace, ...documentIds.map(d => this.getRedisKeyForDocument(namespace, d)));
        await Promise.all([infoDel, documentDel]);
        await super.reset(options);
        return 'Success';
    }

    async deleteNamespace(namespace: string): Promise<string> {
        delete this.BM25Statistics[namespace];
        const documentIds = await redis.smembers('BM25.' + namespace);
        const infoDel = redis.json.del('BM25-info', this.getPathForStats(namespace));
        const documentDel = redis.del('BM25.' + namespace, ...documentIds.map(d => this.getRedisKeyForDocument(namespace, d)));
        await Promise.all([infoDel, documentDel]);
        await super.deleteNamespace(namespace);
        return 'Success';
    }
}

