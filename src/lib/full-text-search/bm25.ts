import {SearchIndex} from "@/lib/search";
import {redis} from "@/context/redis";
import { IndexConfig, QueryResult } from "@upstash/vector";
import {BigIndex} from "@/lib/big-index";
import {
    CommandOptions,
    DeleteCommandPayload,
    IndexFunctions,
    QueryCommandPayload, UpdateCommandPayload,
    UpsertCommandPayload
} from "@/types/vector";

interface WordStatistic extends Record<string, unknown> {
    numberOfDocumentsContainingWord: number;
    index: number;
}

type WordStatistics = Record<string, WordStatistic>;

export interface BM25NamespaceInfo extends Record<string, unknown> {
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
    local namespaceObject = KEYS[1]
    local numberOfDocuments = cjson.decode(redis.call('JSON.GET', namespaceObject, '$.numberOfDocuments'))[1]
    local totalDocumentLength = cjson.decode(redis.call('JSON.GET', namespaceObject, '$.totalDocumentLength'))[1]
    local indexedNumberOfDocuments = cjson.decode(redis.call('JSON.GET', namespaceObject, '$.indexedNumberOfDocuments'))[1]
    local indexedTotalDocumentLength = cjson.decode(redis.call('JSON.GET', namespaceObject, '$.indexedTotalDocumentLength'))[1]
          
    if (indexedNumberOfDocuments == 0 or indexedTotalDocumentLength == 0 or (
        (indexedNumberOfDocuments * 0.5 > numberOfDocuments or indexedNumberOfDocuments * 2 < numberOfDocuments) and
            math.abs((indexedTotalDocumentLength / indexedNumberOfDocuments) - (totalDocumentLength / numberOfDocuments)) > (indexedTotalDocumentLength / indexedNumberOfDocuments) * 0.1
        )) then
            redis.call('JSON.SET', namespaceObject, '$.indexedNumberOfDocuments', numberOfDocuments)
            redis.call('JSON.SET', namespaceObject, '$.indexedTotalDocumentLength', totalDocumentLength)
            return {(indexedNumberOfDocuments == 0) and 1 or 2, numberOfDocuments, numberOfDocuments, totalDocumentLength}
    else
            return {0, numberOfDocuments, indexedNumberOfDocuments, indexedTotalDocumentLength}
    end
    `;

const addWordToStatisticsScript: string = `
    local word = ARGV[1]
    local namespaceObject = KEYS[1]
    local defaultWordStatistics = {numberOfDocumentsContainingWord = 0, index = -1}
    local response = redis.call('JSON.SET', namespaceObject, '$.wordStatistics[' .. word .. ']', cjson.encode(defaultWordStatistics), 'NX')
    local index = -1
    if response ~= nil then
        local numberOfWords = cjson.decode(redis.call('JSON.NUMINCRBY', namespaceObject, '$.numberOfWords', 1))[1]
        redis.call('JSON.SET', namespaceObject, '$.wordStatistics[' .. word .. '].index', numberOfWords - 1)
        index = numberOfWords - 1
    else
        index = cjson.decode(redis.call('JSON.GET', namespaceObject, '$.wordStatistics[' .. word .. '].index'))[1]
    end
    return index
`;

const defaultNamespaceInfo = {
    wordStatistics: {},
    numberOfDocuments: 0,
    indexedNumberOfDocuments: 0,
    totalDocumentLength: 0,
    indexedTotalDocumentLength: 0,
    numberOfWords: 0
};

export class BM25Search<Metadata extends Record<string, unknown> = Record<string, unknown>> extends SearchIndex<Metadata> {
    private BM25Statistics: BM25Info = {};
    private k: number;
    private b: number;
    protected searchType: string = 'BM25';
    private tokenizer: (text: string) => string[];
    private indexedValuesSyncScriptSha: Promise<string>;
    private addWordToStatisticsScriptSha: Promise<string>;
    private namespaceDefiningPromises: Record<string, Promise<boolean>> = {};

    getKeyForNamespace = (namespace: string) => `BM25.info.${namespace}`;
    getKeyForNamespaceSet = (namespace: string) => 'BM25.set.' + namespace;
    getPathForWordStats = (word: string) => `$.wordStatistics[${JSON.stringify(word)}]`;
    getRedisKeyForDocument = (namespace: string, id: string | number) => 'BM25.document.' + namespace + '.' + id.toString();


    constructor(BM25SearchIndexConfig?: BM25SearchIndexConfig<Metadata>) {
        super(BM25SearchIndexConfig?.configOrIndex ?? new BigIndex<Metadata>({
            url: process.env.FULL_TEXT_SEARCH_VECTOR_INDEX_URL,
            token: process.env.FULL_TEXT_SEARCH_VECTOR_INDEX_TOKEN,
        }));
        this.b = BM25SearchIndexConfig?.b ?? 0.75;
        this.k = BM25SearchIndexConfig?.k ?? 1.5;
        this.tokenizer = BM25SearchIndexConfig?.tokenizer ?? ((text: string) => text.match(/\w+/g)?.map(s => s.toLowerCase()) ?? []);

        this.indexedValuesSyncScriptSha = redis.scriptLoad(indexedValuesSyncScript);
        this.addWordToStatisticsScriptSha = redis.scriptLoad(addWordToStatisticsScript);
    }

    async delete(args: DeleteCommandPayload, options?: CommandOptions): Promise<{deleted: number}>{
        const namespace = options?.namespace ?? "";

        if (!await this.defineNamespace(namespace)) {
            return {deleted: 0};
        }
        const argsArray = Array.isArray(args) ? args : [args];

        const oldContents = await redis.json.mget<string[][]>(argsArray.map(a => this.getRedisKeyForDocument(namespace, a)), '$.data');
        await Promise.all([redis.del(...argsArray.map(a => this.getRedisKeyForDocument(namespace, a))), redis.srem(this.getKeyForNamespaceSet(namespace), ...argsArray)]);

        await this.removeTokensFromStatistics(oldContents.map(r => r !== null ? this.tokenizer(r[0]) : []), namespace);

        await this.checkAndRebuild(namespace);

        return await super.delete(args, options);
    }
    async query<TMetadata extends Record<string, unknown> = Metadata>(args: QueryCommandPayload, options?: CommandOptions): Promise<QueryResult<TMetadata>[]>{
        if('vector' in args) {
            return super.query(args, options);
        }
        const namespace = options?.namespace ?? "";

        if (!await this.defineNamespace(namespace)) {
            return [];
        }

        const vector = await this.getVectorOfQuery(args.data, namespace);
        return (await super.query<TMetadata>({
            topK: args.topK,
            vector,
            includeVectors: args.includeVectors,
            includeMetadata: args.includeMetadata,
            filter: args.filter,
        }, {namespace})).filter(r => r.score !== 0.5);
    }

    async upsert<TMetadata extends Record<string, unknown> = Metadata>(args: UpsertCommandPayload<TMetadata>, options?:CommandOptions): Promise<string> {
        const namespace = options?.namespace ?? "";

        if (Array.isArray(args) && args.length === 0) {
            return 'Success';
        }
        if ((Array.isArray(args) && !('data' in args[0])) || (!Array.isArray(args) && !('data' in args))) {
            return await super.upsert(args, {namespace});
        }
        // @ts-ignore
        // Typescript does not support the key check for 'data' from above line
        const argsWithData: VectorWithData<TMetadata>[] = Array.isArray(args) ? args : [args];
        if (!await this.defineNamespace(namespace)) {
            return 'Failed';
        }

        const isOldDocument = await redis.smismember(this.getKeyForNamespaceSet(namespace), argsWithData.map(d => d.id));
        const existingDocumentIds = argsWithData.filter((_, i) => isOldDocument[i] === 1).map(d => d.id);
        if (existingDocumentIds.length > 0) {
            const existingDocuments = await redis.json.mget<string[][]>(existingDocumentIds.map(d => this.getRedisKeyForDocument(namespace, d)), '$.data');
            await this.removeTokensFromStatistics(existingDocuments.map(d => d !== null ? this.tokenizer(d[0]) : []), namespace);
        }

        await this.addTokensToStatistics(argsWithData.map(d => this.tokenizer(d.data)), namespace);
        await this.checkAndRebuild(namespace);

        const pipeline = redis.pipeline();
        pipeline.sadd(this.getKeyForNamespaceSet(namespace), ...argsWithData.map(d => d.id));
        argsWithData.forEach(v => {
            pipeline.json.set(this.getRedisKeyForDocument(namespace, v.id), '$', v as any);
        });
        await pipeline.exec();

        return super.upsert<TMetadata>(await Promise.all(argsWithData.map(async a => {
            return {
                id: a.id,
                vector: await this.getVectorOfDocument(this.tokenizer(a.data), namespace),
                metadata: a.metadata,
            };
        })), {namespace});
    }

    async update<TMetadata extends Record<string, unknown> = Metadata>(args: UpdateCommandPayload<TMetadata>, options?: CommandOptions): Promise<{updated: number}> {
        const namespace = options?.namespace ?? "";

        if ('metadata' in args) {
            await redis.json.set(this.getRedisKeyForDocument(namespace, args.id), '$.metadata', args.metadata);
            return await super.update(args, options);
        }
        if('vector' in args) {
            return super.update(args, options);
        }
        if (!await this.defineNamespace(namespace)) {
            return {updated: 0};
        }

        const oldData = await redis.json.get<string[]>(this.getRedisKeyForDocument(namespace, args.id), '$.data');
        if(oldData === null) {
            return {updated: 0};
        }
        await this.removeTokensFromStatistics([this.tokenizer(oldData[0])], namespace);
        await this.addTokensToStatistics([this.tokenizer(args.data)], namespace);
        await this.checkAndRebuild(namespace);

        await redis.json.set(this.getRedisKeyForDocument(namespace, args.id), '$.data', args.data);

        return await super.update<TMetadata>({
            id: args.id,
            vector: await this.getVectorOfDocument(this.tokenizer(args.data), namespace),
        }, options);
    }

    async checkAndRebuild(namespace: string): Promise<void> {
        const response = await redis.evalsha<[], [number, number, number, number]>(await this.indexedValuesSyncScriptSha, [this.getKeyForNamespace(namespace)], []);
        this.BM25Statistics[namespace].numberOfDocuments = response[1];
        this.BM25Statistics[namespace].indexedNumberOfDocuments = response[2];
        this.BM25Statistics[namespace].indexedTotalDocumentLength = response[3];
        if (response[0] === 2) {
            await this.updateOldVectors(namespace);
        }
    }

    async updateOldVectors(namespace: string): Promise<string> {
        const documentIds = await redis.smembers(this.getKeyForNamespaceSet(namespace));
        const documents = await redis.json.mget<VectorWithData<Metadata>[][]>(documentIds.map(d => this.getRedisKeyForDocument(namespace, d)), '$');
        return await super.upsert(await Promise.all(documents.map(async d => {
            return {
                id: d[0].id,
                vector: await this.getVectorOfDocument(this.tokenizer(d[0].data), namespace),
                metadata: d[0].metadata,
            };
        })), {namespace});
    }

    async defineNamespace(namespace: string): Promise<boolean> {
        if(this.BM25Statistics[namespace]){
            return true;
        }
        if(this.namespaceDefiningPromises[namespace] === undefined) {
            this.namespaceDefiningPromises[namespace] = redis.json.set(this.getKeyForNamespace(namespace), '$', defaultNamespaceInfo, {nx: true}).then(async (response) => {
                if (response === null) {
                    const remoteNamespace = await redis.json.get<BM25NamespaceInfo[]>(this.getKeyForNamespace(namespace), '$');
                    if(remoteNamespace !== null) {
                        this.BM25Statistics[namespace] = remoteNamespace[0];
                    } else {
                        await redis.json.set(this.getKeyForNamespace(namespace), '$', defaultNamespaceInfo)
                        this.BM25Statistics[namespace] = defaultNamespaceInfo;
                    }
                } else {
                    this.BM25Statistics[namespace] = defaultNamespaceInfo;
                }
                return true;
            });
        }
        return await this.namespaceDefiningPromises[namespace];
    }

    async addTokensToStatistics(tokenizedDocuments: string[][], namespace: string): Promise<void> {
        if (!await this.defineNamespace(namespace)) {
            throw new Error('Namespace not defined');
        }
        const wordsToIncrease: Record<string, number> = {};
        const pipelineForNewWords = redis.pipeline();
        const newWords: string[] = [];
        await Promise.all(tokenizedDocuments.map(async document => {
            const words: Set<string> = new Set(document);
            await Promise.all(Array.from(words).map(async word => {
                word = JSON.stringify(word);
                if (!this.BM25Statistics[namespace].wordStatistics[word]) {
                    this.BM25Statistics[namespace].wordStatistics[word] = {
                        numberOfDocumentsContainingWord: 0,
                        index: -1,
                    };
                    newWords.push(word);
                    pipelineForNewWords.evalsha(await this.addWordToStatisticsScriptSha, [this.getKeyForNamespace(namespace)], [JSON.stringify(word)]);
                }
                wordsToIncrease[word] = (wordsToIncrease[word] ?? 0) + 1;
            }));
        }));

        if(pipelineForNewWords.length() != 0) {
            const resultsForNewWords = await pipelineForNewWords.exec<number[]>();
            resultsForNewWords.forEach((index, i) => {
                    this.BM25Statistics[namespace].wordStatistics[newWords[i]].index = index;
                    this.BM25Statistics[namespace].numberOfWords = Math.max(this.BM25Statistics[namespace].numberOfWords, index + 1);
            });
        }
        const totalDocumentLengthToAdd = tokenizedDocuments.reduce((acc, document) => acc + document.length, 0);
        const wordsToIncreaseEntries = Object.entries(wordsToIncrease);

        const pipeline = redis.pipeline();

        pipeline.json.numincrby(this.getKeyForNamespace(namespace), '$.numberOfDocuments', tokenizedDocuments.length);
        pipeline.json.numincrby(this.getKeyForNamespace(namespace), '$.totalDocumentLength', totalDocumentLengthToAdd);

        wordsToIncreaseEntries
            .forEach(([word, count]) => pipeline.json.numincrby(this.getKeyForNamespace(namespace),  this.getPathForWordStats(word) + '.numberOfDocumentsContainingWord', count));
        const results = await pipeline.exec<number[][]>();

        this.BM25Statistics[namespace].numberOfDocuments = results[0][0];
        this.BM25Statistics[namespace].totalDocumentLength = results[1][0];

        wordsToIncreaseEntries.forEach(([word, count], i) => {
            this.BM25Statistics[namespace].wordStatistics[word].numberOfDocumentsContainingWord = results[i + 2][0];
        });
    }

    async removeTokensFromStatistics(tokenizedDocuments: string[][], namespace: string): Promise<void> {
        const wordsToDecrement: Record<string, number> = {}
        if (!await this.defineNamespace(namespace)) {
            throw new Error('Namespace not defined');
        }
        await Promise.all(tokenizedDocuments.map(async document => {
            const words: Set<string> = new Set(document);
            await Promise.all(Array.from(words).map(async word => {
                word = JSON.stringify(word);
                if (!this.BM25Statistics[namespace].wordStatistics[word]) {
                    const wordStatistic = await redis.json.get<WordStatistic>(this.getKeyForNamespace(namespace), this.getPathForWordStats(word));
                    if(wordStatistic !== null) {
                        this.BM25Statistics[namespace].wordStatistics[word] = wordStatistic;
                    } else {
                        return;
                    }
                }
                this.BM25Statistics[namespace].wordStatistics[word].numberOfDocumentsContainingWord--;
                wordsToDecrement[word] = (wordsToDecrement[word] ?? 0) + 1;
            }));
        }));
        const numberOfDocumentsToRemove = tokenizedDocuments.length;
        const totalDocumentLengthToRemove = tokenizedDocuments.reduce((acc, document) => acc + document.length, 0);
        const wordsToDecrementEntries = Object.entries(wordsToDecrement);

        const pipeline = redis.pipeline();
        pipeline.json.numincrby(this.getKeyForNamespace(namespace), '$.numberOfDocuments', -numberOfDocumentsToRemove);
        pipeline.json.numincrby(this.getKeyForNamespace(namespace), '$.totalDocumentLength', -totalDocumentLengthToRemove);

        wordsToDecrementEntries
            .forEach(([word, count]) => pipeline.json.numincrby(this.getKeyForNamespace(namespace), this.getPathForWordStats(word) + '.numberOfDocumentsContainingWord', -count));
        const results = await pipeline.exec<number[][]>();

        this.BM25Statistics[namespace].numberOfDocuments = results[0][0];
        this.BM25Statistics[namespace].totalDocumentLength = results[1][0];

        wordsToDecrementEntries.forEach(([word, count], i) => {
            this.BM25Statistics[namespace].wordStatistics[word].numberOfDocumentsContainingWord = results[i + 2][0];
        });
    }

    async getVectorOfDocument(tokens: string[], namespace: string): Promise<number[]> {
        if (!await this.defineNamespace(namespace)) {
            throw new Error('Namespace not defined');
        }
        const tokenCounts : Record<string, number> = {};
        const vector: number[] = Array(this.BM25Statistics[namespace].numberOfWords).fill(0);
        const averageDocumentLength = this.BM25Statistics[namespace].indexedTotalDocumentLength / this.BM25Statistics[namespace].indexedNumberOfDocuments;

        tokens.map((token) => {
            token = JSON.stringify(token);
            tokenCounts[token] = (tokenCounts[token] ?? 0) + 1;
        });

        await Promise.all(Object.entries(tokenCounts).map(async ([token, tokenCount]) => {
            tokenCount = tokenCount ?? 0;
            let index = this.BM25Statistics[namespace].wordStatistics[token]?.index ?? -1;
            if(index === -1){
                let remoteWord = await redis.json.get<WordStatistic>(this.getKeyForNamespace(namespace), this.getPathForWordStats(token));
                if(remoteWord !== null && remoteWord.index !== -1) {
                    this.BM25Statistics[namespace].wordStatistics[token] = remoteWord;
                    index = remoteWord.index;
                    if(this.BM25Statistics[namespace].wordStatistics[token].index >= this.BM25Statistics[namespace].numberOfWords) {
                        vector.push(...Array(index + 1 - this.BM25Statistics[namespace].numberOfWords).fill(0))
                        this.BM25Statistics[namespace].numberOfWords = index + 1;
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
        if (!await this.defineNamespace(namespace)) {
            throw new Error('Namespace not defined');
        }
        const words: string[] = this.tokenizer(text);
        const vector: number[] = Array(this.BM25Statistics[namespace].numberOfWords).fill(0);

        await Promise.all(words.map(async (word) => {
            word = JSON.stringify(word);
            let index = this.BM25Statistics[namespace].wordStatistics[word]?.index ?? -1;
            let numberOfDocumentsContainingWord = this.BM25Statistics[namespace].wordStatistics[word]?.numberOfDocumentsContainingWord ?? -1;
            if(index === -1 || numberOfDocumentsContainingWord < 0){
                let remoteWord = await redis.json.get<WordStatistic>(this.getKeyForNamespace(namespace), this.getPathForWordStats(word));
                if(remoteWord !== null && remoteWord.index !== -1 && remoteWord.numberOfDocumentsContainingWord >= 0) {
                    this.BM25Statistics[namespace].wordStatistics[word] = remoteWord;
                    index = remoteWord.index;
                    numberOfDocumentsContainingWord = remoteWord.numberOfDocumentsContainingWord;
                    if(this.BM25Statistics[namespace].wordStatistics[word].index >= this.BM25Statistics[namespace].numberOfWords) {
                        vector.push(...Array(index + 1 - this.BM25Statistics[namespace].numberOfWords).fill(0))
                        this.BM25Statistics[namespace].numberOfWords = index + 1;
                    }
                } else {
                    return;
                }
            }
            vector[index] += Math.log((this.BM25Statistics[namespace].numberOfDocuments + 1)/(numberOfDocumentsContainingWord + 0.5));
        }));

        return vector;
    }

    async reset(options?: CommandOptions): Promise<string> {
        const namespace = options?.namespace ?? "";
        this.BM25Statistics[namespace] = defaultNamespaceInfo;
        const documentIds = await redis.smembers(this.getKeyForNamespaceSet(namespace));
        const infoClear = redis.json.clear(this.getKeyForNamespace(namespace), '$.*');
        const documentDel = redis.del(this.getKeyForNamespaceSet(namespace), ...documentIds.map(d => this.getRedisKeyForDocument(namespace, d)));
        const indexReset = super.reset(options);
        await Promise.all([infoClear, documentDel, indexReset]);
        return 'Success';
    }

    async deleteNamespace(namespace: string): Promise<string> {
        delete this.BM25Statistics[namespace];
        const documentIds = await redis.smembers(this.getKeyForNamespaceSet(namespace));
        const documentDel = redis.del(this.getKeyForNamespace(namespace), this.getKeyForNamespaceSet(namespace), ...documentIds.map(d => this.getRedisKeyForDocument(namespace, d)));
        const indexDel = super.deleteNamespace(namespace);
        await Promise.all([documentDel, indexDel]);
        return 'Success';
    }
}

