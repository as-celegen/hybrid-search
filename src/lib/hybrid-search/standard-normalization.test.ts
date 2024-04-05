import { StandardNormalization } from "@/lib/hybrid-search/standard-normalization";
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
        const minMaxNormalization = new StandardNormalization();

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
        ];
        const stdDev = Math.sqrt(0.02/3);
        const combinedResults = minMaxNormalization.combineResults(result1, result2);
        combinedResults.forEach(({ key, title,  score }, index) => {
            expect(key).toBeDefined();
            expect(title).toBeDefined();
            expect(score).toBeDefined();

            if (index === 0) {
                expect(score).toBeCloseTo(0.2 / stdDev);
                expect(key).toBe('c');
                expect(title).toBe('C');
            } else if (index === 1) {
                expect(score).toBeCloseTo(0 / stdDev);
                expect(key).toBe('b');
                expect(title).toBe('B');
            } else if (index === 2) {
                expect(score).toBeCloseTo(-0.2 / stdDev);
                expect(key).toBe('a');
                expect(title).toBe('A');
            }
        });
    });

    it('should combine results', () => {
        const minMaxNormalization = new StandardNormalization();

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
        ];
        const combinedResults = minMaxNormalization.combineResults(result1, result2);
        combinedResults.forEach(({ key, title,  score }, index) => {
            expect(key).toBeDefined();
            expect(title).toBeDefined();
            expect(score).toBeDefined();

            expect(score).toBeCloseTo(0);
        });
    });
});