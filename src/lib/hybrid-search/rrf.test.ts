import { RRF } from "@/lib/hybrid-search/rrf";
import {describe, it, expect} from "vitest";

const result1 = [
    {
        key: 'a',
        title: 'A',
        score: 0.7,
    },
    {
        key: 'b',
        title: 'B',
        score: 0.8,
    },
    {
        key: 'c',
        title: 'C',
        score: 0.9,
    },
];

describe('Reciprocal Rank Fusion ', () => {
    it('should combine results', () => {
        const rrf = new RRF();

        const result2 = [
            {
                key: 'a',
                title: 'A',
                score: 0.6,
            },
            {
                key: 'b',
                title: 'B',
                score: 0.7,
            },
            {
                key: 'c',
                title: 'C',
                score: 0.8,
            },
        ]
        const combinedResults = rrf.combineResults(result1, result2);
        expect(combinedResults).toEqual([
            {
                key: 'c',
                title: 'C',
                score: 2/60,
            },
            {
                key: 'b',
                title: 'B',
                score: 2/61,
            },
            {
                key: 'a',
                title: 'A',
                score: 2/62,
            }
        ]);
    });

    it('should combine results', () => {
        const rrf = new RRF();

        const result2 = [
            {
                key: 'a',
                title: 'A',
                score: 0.8,
            },
            {
                key: 'b',
                title: 'B',
                score: 0.7,
            },
            {
                key: 'c',
                title: 'C',
                score: 0.6,
            },
        ]
        const combinedResults = rrf.combineResults(result1, result2);
        expect(combinedResults).toEqual([
            {
                key: 'c',
                title: 'C',
                score: 1/60 + 1/62,
            },
            {
                key: 'a',
                title: 'A',
                score: 1/62 + 1/60,
            },
            {
                key: 'b',
                title: 'B',
                score: 2/61,
            },
        ]);
    });
});