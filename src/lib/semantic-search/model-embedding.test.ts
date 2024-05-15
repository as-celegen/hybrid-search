import { ModelEmbeddingSearch } from "@/lib/semantic-search/model-embedding";
import {describe, it, expect, expectTypeOf} from "vitest";
import {Index} from "@upstash/vector";

const documents = [
    {id: '1', data: 'Hello world', metadata: {title: 'Hello'}},
    {id: '2', data: 'Hello world', metadata: {title: 'Hello'}},
    {id: '3', data: 'lorem ipsum dolor sit amet', metadata: {title: 'lorem'}},
    {id: '4', data: 'lorem ipsum world', metadata: {title: 'lorem'}},
    {id: '5', data: 'Foo bar', metadata: {title: 'Foo'}},
    {id: '6', data: 'Bar', metadata: {title: 'Bar'}},
];

const index = new Index({
    url: process.env.SEMANTIC_SEARCH_VECTOR_INDEX_URL,
    token: process.env.SEMANTIC_SEARCH_VECTOR_INDEX_TOKEN,
});

describe('Model Embedding Search', () => {
    it('should create an instance', () => {
        const search = new ModelEmbeddingSearch();
        expect(search).toBeInstanceOf(ModelEmbeddingSearch);
    });

    it('should add documents', async () => {
        const search = new ModelEmbeddingSearch();
        const result = await search.upsert(documents);
        expect(result).toBe('Success');
        const vector = await index.fetch(['1', '2'], {includeMetadata: true, namespace: '%20ModelEmbedding'});
        expectTypeOf(vector).toBeArray();
        expect(vector.filter(i => i !== null)).toHaveLength(2);
    });

    it('should add documents to namespaces', async () => {
        const search = new ModelEmbeddingSearch();
        const result = await search.upsert(documents, {namespace: 'test'});
        expect(result).toBe('Success');
        const vector = await index.fetch(['1', '2'], {includeMetadata: true, namespace: 'test%20ModelEmbedding'});
        expectTypeOf(vector).toBeArray();
        expect(vector.filter(i => i !== null)).toHaveLength(2);
    });

    it('should search documents', async () => {
        const search = new ModelEmbeddingSearch();
        await new Promise(resolve => setTimeout(resolve, 10000));
        const results = await search.query({data: 'hello', topK: 3});
        expectTypeOf(results).toBeArray();
        console.log(results);
        expect(results.length).toBeGreaterThan(0);
    }, 15000);

    it('should remove documents', async () => {
        const search = new ModelEmbeddingSearch();
        await search.upsert(documents);
        const result = await search.delete('1');
        expect(result).toEqual({deleted: 1});
        const vector = await index.fetch(['1'], {namespace: '%20ModelEmbedding'});
        expect(vector).toEqual([null]);
    });

    it('info should return namespaces', async () => {
        const search = new ModelEmbeddingSearch();
        const info = await search.info();
        expect(Object.keys(info.namespaces).sort()).toEqual(['', 'test'].sort());
    });

    it('should list namespaces', async () => {
        const search = new ModelEmbeddingSearch();
        const namespaces = await search.listNamespaces();
        expect(namespaces.sort()).toEqual(['', 'test'].sort());
    });

    it('should delete a namespace', async () => {
        const search = new ModelEmbeddingSearch();
        const result = await search.deleteNamespace('test');
        expect(result).toBe('Success');
        const namespaces = await search.listNamespaces();
        expect(namespaces).toEqual(['']);
    });

    it('should reset the index', async () => {
        const search = new ModelEmbeddingSearch();
        await search.reset();
        const result = await index.fetch(['1'], {namespace: '%20ModelEmbedding'});
        expect(result).toEqual([null]);
    });
});