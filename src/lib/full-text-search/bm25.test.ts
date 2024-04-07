import {BM25, WordStatistics} from "@/lib/full-text-search/bm25";
import {describe, it, expect, expectTypeOf} from "vitest";
import {redis} from "@/context/redis";
import {dimension} from "@/lib/search";

const documents = [
    {key: '1', title: 'Hello', document: 'Hello world'},
    {key: '2', title: 'World', document: 'Hello world'},
    {key: '3', title: 'Foo', document: 'lorem ipsum dolor sit amet'},
    {key: '4', title: 'Bar', document: 'lorem ipsum world'},
    {key: '5', title: 'Baz', document: 'Foo bar'},
    {key: '6', title: 'Qux', document: 'Bar'},
];

const trueWordStatistics: WordStatistics = {
    'hello': {numberOfDocumentsContainingWord: 2, index: 4, idf: 1.02962},
    'world': {numberOfDocumentsContainingWord: 3, index: 8, idf: 0.693147},
    'foo': {numberOfDocumentsContainingWord: 1, index: 3, idf: 1.54045},
    'lorem': {numberOfDocumentsContainingWord: 2, index: 6, idf: 1.02962},
    'ipsum': {numberOfDocumentsContainingWord: 2, index: 5, idf: 1.02962},
    'dolor': {numberOfDocumentsContainingWord: 1, index: 2, idf: 1.54045},
    'sit': {numberOfDocumentsContainingWord: 1, index: 7, idf: 1.54045},
    'amet': {numberOfDocumentsContainingWord: 1, index: 0, idf: 1.54045},
    'bar': {numberOfDocumentsContainingWord: 2, index: 1, idf: 1.02962},
};

const search = new BM25();

describe('BM25 Search', () => {
    it('should create an instance', () => {
        expect(search).toBeInstanceOf(BM25);
    });

    it('should prepare an index', async () => {
        const result = await search.prepareIndex(documents);
        expect(result).toBe(true);
        Object.keys(search.wordStatistics).map((word) => {
            expect(search.wordStatistics[word].numberOfDocumentsContainingWord).toBe(trueWordStatistics[word].numberOfDocumentsContainingWord);
            expect(search.wordStatistics[word].index).toBe(trueWordStatistics[word].index);
            expect(search.wordStatistics[word].idf).toBeCloseTo(trueWordStatistics[word].idf, 5);
        });
    });

    it('should get a vector for documents', async () => {
        await search.prepareIndex(documents);
        const vector = await search.getVector('hello world');
        console.log(vector);
        expectTypeOf(vector).toBeArray();
        expect(vector.length).toBeGreaterThan(0);
        const testVector = Array.from({length: dimension}, () => 0);
        const tf = (wordCount: number, length: number) => (search.k+1)* wordCount  / (wordCount + search.k * (1 - search.b + search.b * (length / search.averageDocumentLength)));
        testVector[search.wordStatistics['hello'].index] = tf(1, 2) * search.wordStatistics['hello'].idf;
        testVector[search.wordStatistics['world'].index] = tf(1, 2) * search.wordStatistics['world'].idf;
        expect(vector).toEqual(testVector);
    });

    it('should get a vector for search queries', async () => {
        const vector = await search.getVectorForSearch('hello world');
        expectTypeOf(vector).toBeArray();
        expect(vector.length).toBeGreaterThan(0);
        const testVector = Array.from({length: dimension}, () => 0);
        testVector[search.wordStatistics['hello'].index] = 1;
        testVector[search.wordStatistics['world'].index] = 1;
        expect(vector).toEqual(testVector);
    });

    it('should build an index', async () => {
        const result = await search.buildIndex(documents);
        expect(result).toBe(true);
        const vector = await search.index.fetch(['1#BM25']);
        expectTypeOf(vector).toBeArray();
        const info = await redis.get<BM25>('BM25-info');
        expectTypeOf(info).toBeObject;
    });

    it('should add documents', async () => {
        const search = new BM25();
        await search.prepareIndex(documents);
        const result = await search.add(documents.map(({key, title, document}) => ({key: key+6, title, document})));
        expect(result).toBe(true);
        const vector = await search.index.fetch(['16#BM25', '26#BM25'], {includeMetadata: true});
        expectTypeOf(vector).toBeArray();
        expect(vector.filter(i => i !== null)).toHaveLength(2);
    });

    it('should search documents', async () => {
        const search = new BM25();
        await search.prepareIndex(documents);
        await new Promise(resolve => setTimeout(resolve, 10000));
        const results = await search.search('foo');
        expectTypeOf(results).toBeArray();
        console.log(results);
        expect(results.length).toBeGreaterThan(0);
    }, 15000);

    it('should remove documents', async () => {
        const search = new BM25();
        await search.add(documents);
        const result = await search.remove('1');
        expect(result).toBe(1);
        const vector = await search.index.fetch(['1#BM25']);
        expect(vector).toEqual([null]);
    });

    it('should reset the index', async () => {
        const search = new BM25();
        await search.buildIndex(documents);
        await search.resetIndex();
        const result = await search.index.fetch(['1#BM25']);
        expect(result).toEqual([null]);
    });
});