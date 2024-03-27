import { RRF } from "@/lib/hybrid-search/rrf";
import {HybridSearch} from "@/lib/hybrid-search/types";

const hybridSearchAlgorithms: Record<string, HybridSearch> = {
    "RRF": new RRF(),
};

export const hybridSearch = hybridSearchAlgorithms[process.env.HYBRID_SEARCH_ALGORITHM ?? 'RRF'] ?? hybridSearchAlgorithms['RRF'];
