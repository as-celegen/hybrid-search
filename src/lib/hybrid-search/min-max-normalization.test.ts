import { MinMaxNormalization } from "@/lib/hybrid-search/min-max-normalization";
import {describe, it, expect} from "vitest";
import {result1, result2, result3} from "@/lib/hybrid-search/utils.test";



describe('MinMaxNormalization', () => {
    it('should combine results', () => {
        const minMaxNormalization = new MinMaxNormalization();


        const combinedResults = minMaxNormalization.combineResults(result1, result2);
        expect(combinedResults).toEqual([
            {
                id: 'c',
                score: 2.0,
                vector: [],
                metadata: {
                    title: 'C',
                }
            },
            {
                id: 'b',
                score: 1.0,
                vector: [],
                metadata: {
                    title: 'B',
                }
            },
            {
                id: 'a',
                score: 0,
                vector: [],
                metadata: {
                    title: 'A',
                }
            }
        ]);
    });

    it('should combine results', () => {
        const minMaxNormalization = new MinMaxNormalization();


        const combinedResults = minMaxNormalization.combineResults(result1, result3);
        expect(combinedResults).toEqual([
            {
                id: 'c',
                score: 1.0,
                vector: [],
                metadata: {
                    title: 'C',
                }
            },
            {
                id: 'b',
                score: 1.0,
                vector: [],
                metadata: {
                    title: 'B',
                }
            },
            {
                id: 'a',
                score: 1.0,
                vector: [],
                metadata: {
                    title: 'A',
                }
            }
        ]);
    });
});