import { StandardNormalization } from "@/lib/hybrid-search/standard-normalization";
import {describe, it, expect} from "vitest";
import {result1, result2, result3} from "@/lib/hybrid-search/utils.test";

describe('MinMaxNormalization', () => {
    it('should combine results', () => {
        const minMaxNormalization = new StandardNormalization();


        const stdDev = Math.sqrt(0.02/3);
        const combinedResults = minMaxNormalization.combineResults(result1, result2);
        combinedResults.forEach(({ id,  score, metadata }, index) => {
            expect(id).toBeDefined();
            expect(score).toBeDefined();
            expect(metadata).toEqual({ title: String(id).toUpperCase() });

            if (index === 0) {
                expect(score).toBeCloseTo(0.2 / stdDev);
                expect(id).toBe('c');
            } else if (index === 1) {
                expect(score).toBeCloseTo(0 / stdDev);
                expect(id).toBe('b');
            } else if (index === 2) {
                expect(score).toBeCloseTo(-0.2 / stdDev);
                expect(id).toBe('a');
            }
        });
    });

    it('should combine results', () => {
        const minMaxNormalization = new StandardNormalization();


        const combinedResults = minMaxNormalization.combineResults(result1, result3);
        combinedResults.forEach(({ id, score, metadata }, index) => {
            expect(id).toBeDefined();
            expect(score).toBeDefined();
            expect(metadata).toEqual({ title: String(id).toUpperCase() });

            expect(score).toBeCloseTo(0);
        });
    });
});