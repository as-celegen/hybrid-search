import { RRF } from "@/lib/hybrid-search/rrf";
import {HybridSearch} from "@/lib/hybrid-search/types";
import {StandardNormalization} from "@/lib/hybrid-search/standard-normalization";
import {MinMaxNormalization} from "@/lib/hybrid-search/min-max-normalization";


const hybridSearchAlgorithms: Record<string, new () => HybridSearch> = {
    "RRF": RRF,
    "STANDARD_NORMALIZATION": StandardNormalization,
    "MIN_MAX_NORMALIZATION": MinMaxNormalization,
};

const hybridSearchType = hybridSearchAlgorithms[process.env.HYBRID_SEARCH_ALGORITHM ?? 'RRF'] ?? hybridSearchAlgorithms['RRF'];
export const hybridSearch: HybridSearch = new hybridSearchType();
