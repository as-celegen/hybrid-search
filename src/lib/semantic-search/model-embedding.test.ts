import { ModelEmbeddingSearch } from "@/lib/semantic-search/model-embedding";
import {describe, it, expect, expectTypeOf} from "vitest";

const documents = [
    {key: '1', title: 'Hello', document: 'Hello world'},
    {key: '2', title: 'World', document: 'Hello world'},
    {key: '3', title: 'Foo', document: 'lorem ipsum dolor sit amet'},
    {key: '4', title: 'Bar', document: 'lorem ipsum world'},
    {key: '5', title: 'Baz', document: 'Foo bar'},
    {key: '6', title: 'Qux', document: 'Bar'},
];

describe('Model Embedding Search', () => {
    it('should create an instance', () => {
        const search = new ModelEmbeddingSearch();
        expect(search).toBeInstanceOf(ModelEmbeddingSearch);
    });

    it('should add documents', async () => {
        const search = new ModelEmbeddingSearch();
        const result = await search.add(documents);
        expect(result).toBe(true);
        const vector = await search.index.fetch(['1#ModelEmbedding', '2#ModelEmbedding'], {includeMetadata: true});
        expectTypeOf(vector).toBeArray();
        expect(vector.filter(i => i !== null)).toHaveLength(2);
    });

    it('should search documents', async () => {
        const search = new ModelEmbeddingSearch();
        await new Promise(resolve => setTimeout(resolve, 10000));
        const results = await search.search('hello');
        expectTypeOf(results).toBeArray();
        console.log(results);
        expect(results.length).toBeGreaterThan(0);
    }, 15000);

    it('should remove documents', async () => {
        const search = new ModelEmbeddingSearch();
        await search.add(documents);
        const result = await search.remove('1');
        expect(result).toBe(1);
        const vector = await search.index.fetch(['1#ModelEmbedding']);
        expect(vector).toEqual([null]);
    });

    it('should reset the index', async () => {
        const search = new ModelEmbeddingSearch();
        await search.resetIndex();
        const result = await search.index.fetch(['1#ModelEmbedding']);
        expect(result).toEqual([null]);
    });
});