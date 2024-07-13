import { BigIndex } from "@/lib/big-index";
import {describe, it, expect, expectTypeOf} from "vitest";
import {Index} from "@upstash/vector";

const documents = [
    {id: '1', vector: [1, 0, 0, 1, 0, 0], metadata: {title: 'Hello'}},
    {id: '2', vector: [0, 1, 0, 0, 1, 0], metadata: {title: 'Hello World'}},
    {id: '3', vector: [0, 0, 1, 0, 0, 1], metadata: {title: 'lorem'}},
    {id: '4', vector: [1, 0, 0, 0, 0, 1], metadata: {title: 'lorem ipsum'}},
    {id: '5', vector: [0, 1, 0, 0, 1], metadata: {title: 'Foo'}},
    {id: '6', vector: [0, 0, 1, 1], metadata: {title: 'Bar'}},
];

const bigIndexConfig = {
    url: process.env.BIG_INDEX_TEST_VECTOR_INDEX_URL,
    token: process.env.BIG_INDEX_TEST_VECTOR_INDEX_TOKEN,
}

const index = new Index(bigIndexConfig);

describe('Big Index test', () => {
    it('should create an instance', () => {
        const search = new BigIndex(bigIndexConfig);
        expect(search).toBeInstanceOf(BigIndex);
    });

    it('should add documents', async () => {
        const search = new BigIndex(bigIndexConfig);
        await new Promise(resolve => setTimeout(resolve, 1000));
        const result = await search.upsert(documents);
        expect(result).toBe('Success');
        const vector = await index.fetch(['1', '2'], {includeVectors: true, includeMetadata: true});
        expectTypeOf(vector).toBeArray();
        expect(vector.filter(i => i !== null)).toHaveLength(2);
        expect(vector.map(i => i !== null ? i.vector : [])).toEqual(documents.slice(0, 2).map(i => i.vector.slice(0, 3)));
        expect(vector.map(i => i !== null ? i.metadata : [])).toEqual(documents.slice(0, 2).map(i => i.metadata));
        const secondPartition = await index.fetch(['1', '2'], {includeVectors: true, includeMetadata: true, namespace: '%201%20BigIndex'});
        expect(secondPartition.map(i => i !== null ? i.vector : [])).toEqual(documents.slice(0, 2).map(i => i.vector.slice(3)));
        expect(secondPartition.map(i => i !== null ? i.metadata : [])).toEqual(documents.slice(0, 2).map(i => i.metadata));
    });

    it('should add documents to namespaces', async () => {
        const search = new BigIndex(bigIndexConfig);
        await new Promise(resolve => setTimeout(resolve, 1000));
        const result = await search.upsert(documents, {namespace: 'test'});
        expect(result).toBe('Success');
        const vector = await index.fetch(['1', '2'], {includeVectors: true, includeMetadata: true, namespace: 'test'});
        expectTypeOf(vector).toBeArray();
        expect(vector.filter(i => i !== null)).toHaveLength(2);
        expect(vector.map(i => i !== null ? i.vector : [])).toEqual(documents.slice(0, 2).map(i => i.vector.slice(0, 3)));
        expect(vector.map(i => i !== null ? i.metadata : [])).toEqual(documents.slice(0, 2).map(i => i.metadata));
        const secondPartition = await index.fetch(['1', '2'], {includeVectors: true, includeMetadata: true, namespace: 'test%201%20BigIndex'});
        expect(secondPartition.map(i => i !== null ? i.vector : [])).toEqual(documents.slice(0, 2).map(i => i.vector.slice(3)));
        expect(secondPartition.map(i => i !== null ? i.metadata : [])).toEqual(documents.slice(0, 2).map(i => i.metadata));
    });

    it('should update metadata', async () => {
        const search = new BigIndex(bigIndexConfig);
        await new Promise(resolve => setTimeout(resolve, 1000));
        const result = await search.upsert(documents, {namespace: 'test-5'});
        expect(result).toBe('Success');
        await search.update({id: '1', metadata: {title: 'Hello World'}}, {namespace: 'test-5'});
        const vector = await index.fetch(['1'], {includeVectors: false, includeMetadata: true, namespace: 'test-5%201%20BigIndex'});
        expectTypeOf(vector).toBeArray();
        expect(vector.filter(i => i !== null)).toHaveLength(1);
        expect(vector.map(i => i !== null ? i.metadata : [])).toEqual([{title: 'Hello World'}]);
    });

    it('should search documents', async () => {
        const search = new BigIndex(bigIndexConfig);
        await new Promise(resolve => setTimeout(resolve, 1000));
        const results = await search.query({vector: [1, 0, 0, 1, 0, 0], topK: 6});
        expectTypeOf(results).toBeArray();
        console.log(results);
        expect(results.length).toBeGreaterThan(0);
    }, 15000);

    it('should search multiple documents at once', async () => {
        const search = new BigIndex(bigIndexConfig);
        await new Promise(resolve => setTimeout(resolve, 1000));
        const results = await search.queryMany([{vector: [1, 0, 0, 1, 0, 0], topK: 6}]);
        expectTypeOf(results).toBeArray();
        console.log(results);
        expect(results.length).toBeGreaterThan(0);
    }, 150000);

    it('should search documents in another namespace with different query size', async () => {
        const search = new BigIndex(bigIndexConfig);
        await new Promise(resolve => setTimeout(resolve, 1000));
        const results = await search.query({vector: [1, 0, 0, 1, 0], topK: 6}, {namespace: 'test'});
        expectTypeOf(results).toBeArray();
        console.log(results);
        expect(results.length).toBeGreaterThan(0);
    }, 15000);

    it('should perform search while some partitions dont have some documents', async () => {
        const smallDocument = {id: '7', vector: [1, 0, 0], metadata: {title: 'Hello'}};
        const search = new BigIndex(bigIndexConfig);
        try {
            await search.deleteNamespace('test-2');
        }catch (e) {
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        await search.upsert([smallDocument], {namespace: 'test-2'});
        await search.upsert(documents, {namespace: 'test-2'});
        await new Promise(resolve => setTimeout(resolve, 1000));
        const results = await search.query({vector: [1, 0, 0, 1, 0], topK: 7}, {namespace: 'test-2'});
        expectTypeOf(results).toBeArray();
        console.log(results);
        expect(results.length).toBeGreaterThan(0);
    });

    it('should remove documents', async () => {
        const search = new BigIndex(bigIndexConfig);
        await search.upsert(documents, {namespace: 'test-4'});
        const result = await search.delete('1', {namespace: 'test-4'});
        expect(result).toEqual({deleted: 1});
        const vector = await index.fetch(['1'], {namespace: 'test-4'});
        expect(vector).toEqual([null]);
        const vector2 = await index.fetch(['1'], {namespace: 'test-4%201%20BigIndex'});
        expect(vector2).toEqual([null]);
    });

    it('should delete namespace', async () => {
        const search = new BigIndex(bigIndexConfig);
        await new Promise(resolve => setTimeout(resolve, 1000));
        const result = await search.deleteNamespace('test');
        expect(result).toBe('Success');
        const namespaces = await index.listNamespaces();
        expect(namespaces.some(a => a in ['test', 'test 1 BigIndex'])).toBe(false);
        console.log(namespaces);
    });

    it('should reset the namespace', async () => {
        const search = new BigIndex(bigIndexConfig);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await search.upsert(documents, {namespace: 'test-3'});
        const result = await search.reset({namespace: 'test-3'});
        expect(result).toBe('Success');
        const info = await index.info();
        expect(info.namespaces['test-3']).toEqual({vectorCount: 0, pendingVectorCount: 0});
        expect(info.namespaces['test-3 1 BigIndex']).toEqual({vectorCount: 0, pendingVectorCount: 0});
    });
});