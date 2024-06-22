import { BM25NamespaceInfo, BM25Search} from "@/lib/full-text-search/bm25";
import {describe, it, expect, expectTypeOf, beforeAll, beforeEach} from "vitest";
import {redis} from "@/context/redis";
import {BigIndex} from "@/lib/big-index";
import {Index} from "@upstash/vector";

const documents = [
    {id: '1', data: 'Hello world', metadata: {title: 'Hello'}},
    {id: '2', data: 'Hello world', metadata: {title: 'World'}},
    {id: '3', data: 'lorem ipsum dolor sit amet', metadata: {title: 'Foo'}},
    {id: '4', data: 'lorem ipsum world', metadata: {title: 'Bar'}},
    {id: '5', data: 'Foo bar', metadata: {title: 'Baz'}},
    {id: '6', data: 'Bar', metadata: {title: 'Qux'}},
];

const wordCounts = {
    '"hello"': 2,
    '"world"': 3,
    '"lorem"': 2,
    '"ipsum"': 2,
    '"dolor"': 1,
    '"sit"': 1,
    '"amet"': 1,
    '"foo"': 1,
    '"bar"': 2,
};

const indexConfig = {
    url: process.env.BIG_INDEX_TEST_VECTOR_INDEX_URL,
    token: process.env.BIG_INDEX_TEST_VECTOR_INDEX_TOKEN,
}

let bigIndex: BigIndex, index: Index, search: BM25Search;

describe('BM25 Search', () => {
    beforeAll(async () => {
        bigIndex = new BigIndex(indexConfig);
        index = new Index(indexConfig);
        // @ts-expect-error
        await bigIndex.ready;
    });

    beforeEach(async () => {
        search = new BM25Search({configOrIndex: bigIndex});
        // @ts-expect-error
        await search.ready;
    });

    it('should create an instance', async () => {
        const search = new BM25Search({configOrIndex: bigIndex});
        expect(search).toBeInstanceOf(BM25Search);
        // @ts-expect-error
        await search.ready;
        // @ts-expect-error
        expect(search.BM25Statistics).not.toBeUndefined();
    });

    it('should upsert documents for the first time', async () => {
        await search.upsert(documents, {namespace: 'test-1'});
        await new Promise(resolve => setTimeout(resolve, 1000));
        // @ts-expect-error
        const statistics = search.BM25Statistics['test-1'];
        // @ts-expect-error
        const redisInfo: BM25NamespaceInfo = await redis.json.get( `BM25.info.test-1`);
        expect(redisInfo).toEqual(statistics);
        expect(redisInfo).not.toBeNull();
        expect({...redisInfo, wordStatistics: undefined}).toEqual({
            indexStatistics: {
                numberOfDocuments: 6,
                totalDocumentLength: 15,
                indexedNumberOfDocuments: 6,
                indexedTotalDocumentLength: 15
            },
            numberOfWords: 9,
        });
        Object.entries(wordCounts).forEach(([word, count]) => expect(redisInfo.wordStatistics[word].numberOfDocumentsContainingWord).toEqual(count));
        const vector = await bigIndex.fetch(['1', '2'], {namespace: 'test-1%20BM25',includeMetadata: true, includeVectors: true});
        expectTypeOf(vector).toBeArray();
        expect(vector.filter(i => i !== null)).toHaveLength(2);
        expect(vector.map(i => i !== null ? i.metadata : [])).toEqual(documents.slice(0, 2).map(i => i.metadata));
        vector.forEach((v, i) => {
            expect(v).not.toBeNull();
            expectTypeOf(v).toBeObject;
            expect(v?.metadata).toEqual(documents[i].metadata);
            const expectedVector: number[] = Array(statistics.numberOfWords).fill(0);
            expectedVector[statistics.wordStatistics['"hello"'].index] = 1 / (1 + 1.5 * (1 - 0.75 + 0.75 * (2 / 2.5)));
            expectedVector[statistics.wordStatistics['"world"'].index] = 1 / (1 + 1.5 * (1 - 0.75 + 0.75 * (2 / 2.5)));
            expectedVector.forEach((value, index) => expect(value).toBeCloseTo(v?.vector[index] ?? 0, 5));
        });
    });

    it('should rebuild if necessary', async () => {
        await search.deleteNamespace('test-2');
        await search.upsert(documents.slice(0, 2), {namespace: 'test-2'});
        await new Promise(resolve => setTimeout(resolve, 1000));
        // @ts-expect-error
        const statistics: BM25NamespaceInfo = search.BM25Statistics['test-2'];
        // @ts-expect-error
        const redisInfo: BM25NamespaceInfo = await redis.json.get( `BM25.info.test-2`);
        expect(redisInfo).toEqual(statistics);
        expect({...redisInfo, wordStatistics: undefined}).toEqual({
            indexStatistics: {
                numberOfDocuments: 2,
                totalDocumentLength: 4,
                indexedNumberOfDocuments: 2,
                indexedTotalDocumentLength: 4
            },
            numberOfWords: 2,
        });
        Object.entries({'"hello"': 2, '"world"': 2}).forEach(([word, count]) => expect(redisInfo.wordStatistics[word].numberOfDocumentsContainingWord).toEqual(count));
        const vector = await bigIndex.fetch(['1', '2'], {namespace: 'test-2%20BM25',includeMetadata: true, includeVectors: true});
        expectTypeOf(vector).toBeArray();
        expect(vector.filter(i => i !== null)).toHaveLength(2);
        expect(vector.map(i => i !== null ? i.metadata : [])).toEqual(documents.slice(0, 2).map(i => i.metadata));
        vector.forEach((v, i) => {
            expect(v).not.toBeNull();
            expectTypeOf(v).toBeObject;
            expect(v?.metadata).toEqual(documents[i].metadata);
            const expectedVector: number[] = Array(statistics.numberOfWords).fill(0);
            expectedVector[statistics.wordStatistics['"hello"'].index] = 1 / (1 + 1.5 * (1 - 0.75 + 0.75 * (2 / 2)));
            expectedVector[statistics.wordStatistics['"world"'].index] = 1 / (1 + 1.5 * (1 - 0.75 + 0.75 * (2 / 2)));
            expectedVector.forEach((value, index) => expect(value).toBeCloseTo(v?.vector[index] ?? 0, 5));
        });

        await search.upsert(documents.slice(2), {namespace: 'test-2'});
        await new Promise(resolve => setTimeout(resolve, 1000));
        // @ts-expect-error
        const statistics2 = search.BM25Statistics['test-2'];
        // @ts-expect-error
        const redisInfo2: BM25NamespaceInfo = await redis.json.get(`BM25.info.test-2`);
        expect(redisInfo2).toEqual(statistics2);
        expect({...redisInfo2, wordStatistics: undefined}).toEqual({
            indexStatistics:{
                numberOfDocuments: 6,
                totalDocumentLength: 15,
                indexedNumberOfDocuments: 6,
                indexedTotalDocumentLength: 15
            },
            numberOfWords: 9,
        });
        Object.entries(wordCounts).forEach(([word, count]) => expect(redisInfo2.wordStatistics[word].numberOfDocumentsContainingWord).toEqual(count));
        const vector2 = await bigIndex.fetch(['5', '6'], {namespace: 'test-2%20BM25',includeMetadata: true, includeVectors: true});
        expectTypeOf(vector2).toBeArray();
        expect(vector2.filter(i => i !== null)).toHaveLength(2);
        expect(vector2.map(i => i !== null ? i.metadata : [])).toEqual(documents.slice(4).map(i => i.metadata));

        const expectedVector: number[] = Array(statistics2.numberOfWords).fill(0);
        expectedVector[statistics2.wordStatistics['"foo"'].index] = 1 / (1 + 1.5 * (1 - 0.75 + 0.75 * (2 / 2.5)));
        expectedVector[statistics2.wordStatistics['"bar"'].index] = 1 / (1 + 1.5 * (1 - 0.75 + 0.75 * (2 / 2.5)));
        expectedVector.forEach((value, index) => expect(value).toBeCloseTo(vector2[0]?.vector[index] ?? 0, 5));
        expectedVector[statistics2.wordStatistics['"foo"'].index] = 0;
        expectedVector[statistics2.wordStatistics['"bar"'].index] = 1 / (1 + 1.5 * (1 - 0.75 + 0.75 * (1 / 2.5)));
        expectedVector.forEach((value, index) => expect(value).toBeCloseTo(vector2[1]?.vector[index] ?? 0, 5));
    }, 10000);

    it('should update metadata', async () => {
        await search.reset({namespace: 'test-3'});
        await search.upsert(documents, {namespace: 'test-3'});
        await new Promise(resolve => setTimeout(resolve, 1000));
        await search.update({id: '1', metadata: {title: 'test'}}, {namespace: 'test-3'});
        const vector = await bigIndex.fetch(['1'], {namespace: 'test-3%20BM25',includeMetadata: true, includeVectors: false});
        expectTypeOf(vector).toBeArray();
        expect(vector.filter(i => i !== null)).toHaveLength(1);
        expect(vector[0]?.metadata).toEqual({title: 'test'});
    });

    it('should delete documents', async () => {
        await search.deleteNamespace('test-6');
        await search.upsert(documents, {namespace: 'test-6'});
        await new Promise(resolve => setTimeout(resolve, 1000));
        // @ts-expect-error
        const statistics = search.BM25Statistics['test-6'];
        // @ts-expect-error
        const redisInfo: BM25NamespaceInfo = await redis.json.get(`BM25.info.test-6`);
        expect(redisInfo).toEqual(statistics);
        expect(redisInfo).not.toBeNull();
        expect({...redisInfo, wordStatistics: undefined}).toEqual({
            indexStatistics:{
                numberOfDocuments: 6,
                totalDocumentLength: 15,
                indexedNumberOfDocuments: 6,
                indexedTotalDocumentLength: 15
            },
            numberOfWords: 9,
        });

        await search.delete(['1', '2', '3', '4'], {namespace: 'test-6'});
        await new Promise(resolve => setTimeout(resolve, 1000));
        // @ts-expect-error
        const redisInfo2: BM25NamespaceInfo = await redis.json.get(`BM25.info.test-6`);
        expect(redisInfo2).toEqual(statistics);
        expect(redisInfo2).not.toBeNull();
        expect({...redisInfo2, wordStatistics: undefined}).toEqual({
            indexStatistics:{
                numberOfDocuments: 2,
                totalDocumentLength: 3,
                indexedNumberOfDocuments: 2,
                indexedTotalDocumentLength: 3
            },
            numberOfWords: 9,
        });
        Object.entries({...wordCounts, '"hello"': 0, '"world"': 0, '"lorem"': 0, '"ipsum"': 0, '"dolor"': 0, '"sit"': 0, '"amet"': 0}).forEach(([word, count]) => expect(redisInfo2.wordStatistics[word].numberOfDocumentsContainingWord).toEqual(count));
    });

    describe('should search documents', async () => {
        it('shorter documents should have higher score', async () => {
            await search.upsert(documents, {namespace: 'test-4'});
            await new Promise(resolve => setTimeout(resolve, 1000));
            const results = await search.query({data: 'lorem', topK: 6}, {namespace: 'test-4'});
            expectTypeOf(results).toBeArray();
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].id).toBe('4');
        });

        it('less common words should have higher score', async () => {
            await search.upsert(documents, {namespace: 'test-4'});
            await new Promise(resolve => setTimeout(resolve, 1000));
            const results = await search.query({data: 'foo world', topK: 6}, {namespace: 'test-4'});
            expectTypeOf(results).toBeArray();
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].id).toBe('5');
        });
    });

    it('should delete namespace', async () => {
        await search.upsert(documents, {namespace: 'test-5'});
        await search.deleteNamespace('test-5');
        await new Promise(resolve => setTimeout(resolve, 1000));
        const redisInfo: null = await redis.json.get(`BM25.info.test-5`);
        expect(redisInfo).toBeNull();
        const namespaceList = await index.listNamespaces();
        namespaceList.forEach(namespace => expect(namespace.startsWith('test-5%20BM25')).toBe(false));
        expect(await redis.exists('BM25.set.test-5', ...documents.map(d => `BM25.document.test-5.${d.id}`))).toBe(0);
    });

    it('should reset namespace', async () => {
        await search.upsert(documents, {namespace: 'test-7'});
        expect(await redis.exists(...documents.map(d => `BM25.document.test-7.${d.id}`))).not.toBe(0);
        await search.reset({namespace: 'test-7'});
        await new Promise(resolve => setTimeout(resolve, 1000));
        // @ts-expect-error
        const redisInfo: BM25NamespaceInfo = await redis.json.get(`BM25.info.test-7`);
        expect(redisInfo).not.toBeNull();
        expect(redisInfo).toEqual({
            wordStatistics: {},
            indexStatistics:{
                numberOfDocuments: 0,
                indexedNumberOfDocuments: 0,
                totalDocumentLength: 0,
                indexedTotalDocumentLength: 0
            },
            numberOfWords: 0
        });
        expect(await redis.exists('BM25.set.test-7', ...documents.map(d => `BM25.document.test-7.${d.id}`))).toBe(0);
    });
});