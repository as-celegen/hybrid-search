import {OpenAISearch } from "@/lib/semantic-search/openai";
import {describe, it, expect, beforeAll, expectTypeOf} from "vitest";

describe('OpenAISearch', () => {
    it('should create an instance', () => {
        console.log(process.env);
        const search = new OpenAISearch();
        expect(search).toBeInstanceOf(OpenAISearch);
    });

    it('should get a vector', async () => {
        const search = new OpenAISearch();
        const vector = await search.getVector('hello world');
        expectTypeOf(vector).toBeArray();
        expect(vector.length).toBeGreaterThan(0);
    });

});