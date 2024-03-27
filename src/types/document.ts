export interface DocumentStatistics {
    clickCount: number;
    clickedQueries: string[];
    top10ResultCount: number;
    top10ResultQueries: string[];
}

export interface RedisDocument {
    key: string;
    title: string;
    document: string;
    statistics: DocumentStatistics;
}