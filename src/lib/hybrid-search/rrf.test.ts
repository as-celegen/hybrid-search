import { RRF } from "@/lib/hybrid-search/rrf";
import {describe, it, expect} from "vitest";
import {result1, result2, result3} from "@/lib/hybrid-search/utils.test";

describe('Reciprocal Rank Fusion ', () => {
    it('should combine results', () => {
        const rrf = new RRF();


        const combinedResults = rrf.combineResults(result1, result2);
        expect(combinedResults).toEqual([
            {
                id: 'c',
                score: 2/60,
                vector: [],
                metadata: {
                    title: 'C',
                }
            },
            {
                id: 'b',
                score: 2/61,
                vector: [],
                metadata: {
                    title: 'B',
                }
            },
            {
                id: 'a',
                score: 2/62,
                vector: [],
                metadata: {
                    title: 'A',
                }
            }
        ]);
    });

    it('should combine results', () => {
        const rrf = new RRF();

        const combinedResults = rrf.combineResults(result1, result3);
        expect(combinedResults).toEqual([
            {
                id: 'c',
                score: 1/60 + 1/62,
                vector: [],
                metadata: {
                    title: 'C',
                }
            },
            {
                id: 'a',
                score: 1/62 + 1/60,
                vector: [],
                metadata: {
                    title: 'A',
                }
            },
            {
                id: 'b',
                score: 2/61,
                vector: [],
                metadata: {
                    title: 'B',
                }
            },
        ]);
    });
});