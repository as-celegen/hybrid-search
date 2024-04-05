import { MinMaxNormalization } from "@/lib/hybrid-search/min-max-normalization";
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

describe('MinMaxNormalization', () => {
    it('should combine results', () => {
        const minMaxNormalization = new MinMaxNormalization();

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
        const combinedResults = minMaxNormalization.combineResults(result1, result2);
        expect(combinedResults).toEqual([
            {
                key: 'c',
                title: 'C',
                score: 2.0,
            },
            {
                key: 'b',
                title: 'B',
                score: 1.0,
            },
            {
                key: 'a',
                title: 'A',
                score: 0,
            }
        ]);
    });

    it('should combine results', () => {
        const minMaxNormalization = new MinMaxNormalization();

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
        const combinedResults = minMaxNormalization.combineResults(result1, result2);
        expect(combinedResults).toEqual([
            {
                key: 'c',
                title: 'C',
                score: 1.0,
            },
            {
                key: 'b',
                title: 'B',
                score: 1.0,
            },
            {
                key: 'a',
                title: 'A',
                score: 1.0,
            }
        ]);
    });
});