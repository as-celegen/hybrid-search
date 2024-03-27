import { RRF } from "@/lib/hybrid-search/rrf";
import {HybridSearch} from "@/lib/hybrid-search/types";
import {StandardNormalization} from "@/lib/hybrid-search/standard-normalization";
import {MinMaxNormalization} from "@/lib/hybrid-search/min-max-normalization";


const hybridSearchAlgorithms: Record<string, HybridSearch> = {
    "RRF": new RRF(),
    "STANDARD_NORMALIZATION": new StandardNormalization(),
    "MIN_MAX_NORMALIZATION": new MinMaxNormalization(),
};

export const hybridSearch = hybridSearchAlgorithms[process.env.HYBRID_SEARCH_ALGORITHM ?? 'RRF'] ?? hybridSearchAlgorithms['RRF'];
